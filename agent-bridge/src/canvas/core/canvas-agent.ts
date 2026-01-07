/**
 * Canvas Agent - Canvas-specific Claude Agent SDK wrapper
 *
 * Self-contained agent for canvas operations. Uses the Claude Agent SDK
 * with canvas-specific tools via MCP server. All tool calls are routed
 * through CanvasToolBridge to the frontend/webview.
 *
 * Ported from Orbit's orbitCanvasAgent.ts
 *
 * ⚠️  TESTED: This module is covered by integration tests.
 *     If you modify this, run: cd agent-bridge && bun test
 *     Test file: src/__tests__/canvas-real-e2e.test.ts (REAL Claude API calls)
 */

import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';

import { query } from '@anthropic-ai/claude-agent-sdk';

import { ClaudeCredentials } from '../../common/auth/credentials.js';
import { createLogger } from '../../common/logging/logger.js';
import { createCanvasMcpServer } from '../mcp/canvas-mcp-server.js';
import { CanvasToolBridge } from '../mcp/canvas-tool-bridge.js';
import { getCanvasSystemPrompt } from '../prompts/system-prompt.js';

import type {
  CanvasState,
  CanvasSessionConfig,
  SDKMessage,
  McpToolRequest,
} from '../types/types.js';
import type {
  Options,
  Query,
  SDKMessage as ClaudeSDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';

const logger = createLogger('CanvasAgent');

// =============================================================================
// MESSAGE QUEUE
// =============================================================================

/**
 * Message queue for streaming input mode
 * Allows continuous message sending without restarting the SDK query
 */
class CanvasMessageQueue {
  private queue: SDKUserMessage[] = [];
  private resolvers: ((value: IteratorResult<SDKUserMessage>) => void)[] = [];
  private stopped = false;

  /**
   * Add a user message to the queue
   */
  add(message: string): void {
    if (this.stopped) {
      throw new Error('Message queue has been stopped');
    }

    const sdkMessage: SDKUserMessage = {
      type: 'user',
      message: {
        role: 'user',
        content: message,
      },
      parent_tool_use_id: null,
      session_id: '',
    };

    this.enqueue(sdkMessage);
  }

  /**
   * Add a tool result to the queue
   */
  addToolResult(toolUseId: string, result: unknown): void {
    if (this.stopped) {
      throw new Error('Message queue has been stopped');
    }

    const sdkMessage: SDKUserMessage = {
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: typeof result === 'string' ? result : JSON.stringify(result),
          },
        ],
      },
      parent_tool_use_id: toolUseId,
      session_id: '',
    };

    this.enqueue(sdkMessage);
  }

  private enqueue(sdkMessage: SDKUserMessage): void {
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift();
      if (resolve) {
        resolve({ value: sdkMessage, done: false });
      }
    } else {
      this.queue.push(sdkMessage);
    }
  }

  /**
   * Stop the queue and resolve all pending promises
   */
  stop(): void {
    this.stopped = true;
    for (const resolve of this.resolvers) {
      resolve({ value: undefined, done: true });
    }
    this.resolvers = [];
  }

  /**
   * Async iterator for consuming messages
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<SDKUserMessage, void, unknown> {
    while (!this.stopped) {
      if (this.queue.length > 0) {
        const message = this.queue.shift();
        if (message) {
          yield message;
        }
      } else {
        const result = await new Promise<IteratorResult<SDKUserMessage>>((resolve) => {
          this.resolvers.push(resolve);
        });
        if (result.done) {
          break;
        }
        yield result.value;
      }
    }
  }
}

// =============================================================================
// CANVAS AGENT
// =============================================================================

/**
 * Event types emitted by CanvasAgent
 */
export interface CanvasAgentEvents {
  message: (message: SDKMessage) => void;
  toolRequest: (request: McpToolRequest) => void;
}

/**
 * Canvas Agent - Manages canvas-specific AI interactions with Claude SDK
 *
 * Features:
 * - Streaming message handling
 * - Canvas-specific MCP tools
 * - Tool execution via bridge
 * - Thinking mode support
 *
 * @example
 * ```typescript
 * const agent = new CanvasAgent('session-1', { thinkingEnabled: true });
 *
 * agent.onMessage((message) => {
 *   console.log('Message:', message);
 * });
 *
 * agent.onToolRequest((request) => {
 *   // Forward to frontend, get result, call handleToolResponse
 * });
 *
 * await agent.startSession();
 * await agent.sendMessage('Create a button component');
 * ```
 */
export class CanvasAgent {
  static readonly THINKING_BUDGET = 10000;

  // Event emitter for messages and tool requests
  private readonly emitter = new EventEmitter();

  // Tool bridge for MCP tool execution
  private readonly toolBridge = new CanvasToolBridge();

  // Session state
  private sessionActive = false;
  private currentQuery: Query | null = null;
  private messageQueue: CanvasMessageQueue | null = null;

  // Canvas state (updated from frontend before each message)
  private canvasState: CanvasState = { nodes: [], edges: [] };

  // Configuration
  private _thinkingMode: boolean;
  private _model: string | undefined;

  // Disposable tracking
  private disposed = false;

  constructor(
    private readonly sessionId: string,
    config: CanvasSessionConfig = { thinkingEnabled: false }
  ) {
    this._thinkingMode = config.thinkingEnabled ?? false;
    this._model = config.model;

    // Wire up tool bridge to emit tool requests
    this.toolBridge.onToolRequest((request) => {
      this.emitter.emit('toolRequest', request);
    });

    logger.info({ sessionId }, 'Canvas agent created');
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Register callback for SDK messages
   * @returns Unsubscribe function
   */
  onMessage(callback: (message: SDKMessage) => void): () => void {
    this.emitter.on('message', callback);
    return () => {
      this.emitter.off('message', callback);
    };
  }

  /**
   * Register callback for tool requests (forwarded to frontend)
   * @returns Unsubscribe function
   */
  onToolRequest(callback: (request: McpToolRequest) => void): () => void {
    this.emitter.on('toolRequest', callback);
    return () => {
      this.emitter.off('toolRequest', callback);
    };
  }

  /**
   * Handle tool response from frontend
   * Call this when the frontend executes a tool and returns the result
   */
  handleToolResponse(response: {
    requestId: string;
    success: boolean;
    result?: unknown;
    error?: string;
  }): void {
    this.toolBridge.handleResponse(response);
  }

  /**
   * Update canvas state (called from frontend before each message)
   */
  setCanvasState(state: CanvasState): void {
    this.canvasState = state;
    logger.debug(
      { nodeCount: state.nodes.length, edgeCount: state.edges.length },
      'Canvas state updated'
    );
  }

  /**
   * Get current canvas state
   */
  getCanvasState(): CanvasState {
    return this.canvasState;
  }

  /**
   * Set thinking mode (requires session restart to take effect)
   */
  setThinking(enabled: boolean): void {
    this._thinkingMode = enabled;
    logger.info({ enabled }, 'Thinking mode updated');
  }

  /**
   * Set model (requires session restart to take effect)
   */
  setModel(model: string): void {
    this._model = model;
    logger.info({ model }, 'Model updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): CanvasSessionConfig {
    return {
      thinkingEnabled: this._thinkingMode,
      model: this._model,
    };
  }

  /**
   * Get system prompt (for debugging)
   */
  getSystemPrompt(): string {
    return getCanvasSystemPrompt();
  }

  /**
   * Check if session is active
   */
  get isSessionActive(): boolean {
    return this.sessionActive;
  }

  /**
   * Check if agent is disposed
   */
  get isDisposed(): boolean {
    return this.disposed;
  }

  // ===========================================================================
  // SESSION MANAGEMENT
  // ===========================================================================

  /**
   * Start streaming session with Claude SDK
   */
  startSession(): void {
    if (this.sessionActive) {
      logger.warn('Session already active');
      return;
    }

    if (this.disposed) {
      throw new Error('CanvasAgent has been disposed');
    }

    logger.info({ sessionId: this.sessionId }, 'Starting canvas session');

    // Fix PATH for production Tauri apps launched from Finder/Dock
    // These don't inherit the user's shell PATH, so claude binary won't be found
    const currentPath = process.env.PATH ?? '';
    const homeDir = process.env.HOME ?? '';
    const additionalPaths = [
      '/opt/homebrew/bin', // Homebrew on Apple Silicon
      '/usr/local/bin', // Homebrew on Intel Macs
      '/usr/bin', // System binaries
      `${homeDir}/.bun/bin`, // Bun installation
    ].filter((p) => !currentPath.includes(p));

    if (additionalPaths.length > 0) {
      process.env.PATH = [...additionalPaths, currentPath].join(':');
      logger.info({ addedPaths: additionalPaths }, 'Extended PATH for claude binary');
    }

    // Check credentials
    const credentials = ClaudeCredentials.getCredentials();
    if (!credentials.hasCredentials) {
      throw new Error(
        'No credentials found. Please log in to Claude Code CLI or set ANTHROPIC_API_KEY.'
      );
    }

    // Handle OAuth vs API key
    if (credentials.type === 'oauth') {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_AUTH_TOKEN;
      logger.info('Using Claude Code OAuth');
    } else {
      logger.info('Using API key from environment');
    }

    // Create message queue
    this.messageQueue = new CanvasMessageQueue();
    this.sessionActive = true;

    // Start query with streaming input
    this.currentQuery = query({
      prompt: this.messageQueue[Symbol.asyncIterator](),
      options: this.createOptions(),
    });

    // Start processing responses in background
    void this.processResponses();

    logger.info('Canvas session started successfully');
  }

  /**
   * Stop streaming session
   */
  async stopSession(): Promise<void> {
    if (!this.sessionActive) {
      logger.debug('Session not active');
      return;
    }

    logger.info('Stopping canvas session');

    // Stop message queue
    if (this.messageQueue) {
      this.messageQueue.stop();
      this.messageQueue = null;
    }

    // Interrupt query if running
    if (this.currentQuery) {
      try {
        await this.currentQuery.interrupt();
      } catch (error) {
        logger.error({ error }, 'Error interrupting query');
      }
      this.currentQuery = null;
    }

    this.sessionActive = false;
    logger.info('Canvas session stopped');
  }

  /**
   * Send a message to the agent
   * Canvas state context is automatically prepended
   */
  sendMessage(message: string): void {
    if (!this.sessionActive || !this.messageQueue) {
      throw new Error('Session not started. Call startSession() first.');
    }

    // Prepend canvas state as context
    const contextMessage = this.buildContextMessage(message);

    logger.info(
      { nodeCount: this.canvasState.nodes.length, preview: message.substring(0, 50) },
      'Sending message to Claude'
    );

    // Queue message for Claude SDK
    this.messageQueue.add(contextMessage);
  }

  /**
   * Interrupt current query
   */
  async interrupt(): Promise<void> {
    if (!this.currentQuery) {
      logger.warn('No active query to interrupt');
      return;
    }

    logger.info('Interrupting canvas query');
    await this.currentQuery.interrupt();
  }

  /**
   * Dispose the agent and release resources
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    // Stop session synchronously (fire and forget)
    this.stopSession().catch((error: unknown) => {
      logger.error({ error }, 'Error stopping session during dispose');
    });

    // Dispose tool bridge
    this.toolBridge.dispose();

    // Remove all event listeners
    this.emitter.removeAllListeners();

    logger.info({ sessionId: this.sessionId }, 'Canvas agent disposed');
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  /**
   * Find Claude Code executable path
   *
   * Checks in order:
   * 1. CLAUDE_CLI_PATH env var (set by Tauri when spawning sidecar)
   * 2. Returns undefined to let SDK use built-in executable
   */
  private findClaudeExecutable(): string | undefined {
    // Check if CLAUDE_CLI_PATH env var is set (passed by Tauri when spawning sidecar)
    const envClaudePath = process.env.CLAUDE_CLI_PATH;
    if (envClaudePath !== undefined && envClaudePath !== '') {
      if (existsSync(envClaudePath)) {
        logger.info({ path: envClaudePath }, 'Found Claude CLI from CLAUDE_CLI_PATH env var');
        return envClaudePath;
      }
      logger.warn({ path: envClaudePath }, 'CLAUDE_CLI_PATH set but file not found');
    }

    // No env var means we're likely in development mode
    // Let SDK use its built-in executable
    logger.info('No CLAUDE_CLI_PATH env var - SDK will use built-in executable');
    return undefined;
  }

  /**
   * Create SDK options for canvas agent
   */
  private createOptions(): Options {
    const options: Options = {
      pathToClaudeCodeExecutable: this.findClaudeExecutable(),
      systemPrompt: getCanvasSystemPrompt(),
      cwd: process.cwd(),
    };

    // Enable thinking if configured
    if (this._thinkingMode) {
      options.maxThinkingTokens = CanvasAgent.THINKING_BUDGET;
      logger.info({ thinkingBudget: CanvasAgent.THINKING_BUDGET }, 'Extended thinking ENABLED');
    }

    // Disable all built-in SDK tools - we use custom canvas tools via MCP
    options.allowedTools = [];
    options.disallowedTools = ['*'];

    // Register Canvas MCP server
    const mcpServer = createCanvasMcpServer(this.toolBridge);
    options.mcpServers = {
      'orbit-canvas': mcpServer,
    };
    logger.info('Canvas MCP server registered');

    // Auto-approve all canvas MCP tools (no permission prompts needed)
    options.canUseTool = (toolName, toolInput) => {
      logger.debug({ toolName }, 'Auto-approving canvas tool');
      return Promise.resolve({
        behavior: 'allow' as const,
        updatedInput: toolInput,
      });
    };

    // Add model if specified
    if (this._model) {
      options.model = this._model;
      logger.info({ model: this._model }, 'Using model');
    }

    return options;
  }

  /**
   * Process responses from Claude SDK and emit to listeners
   */
  private async processResponses(): Promise<void> {
    if (!this.currentQuery) {
      return;
    }

    try {
      for await (const message of this.currentQuery) {
        this.handleClaudeMessage(message);
      }
    } catch (error) {
      logger.error({ error }, 'Error processing responses');
      this.emitter.emit('message', {
        type: 'error',
        content: `Error: ${error instanceof Error ? error.message : String(error)}`,
      } as SDKMessage);
    } finally {
      this.sessionActive = false;
      this.currentQuery = null;
      logger.info('Response processing completed');
    }
  }

  /**
   * Handle incoming Claude SDK message and convert to canvas SDKMessage
   */
  private handleClaudeMessage(message: ClaudeSDKMessage): void {
    logger.debug({ messageType: message.type }, 'Received Claude message');

    switch (message.type) {
      case 'assistant': {
        const content = message.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text') {
              this.emitter.emit('message', {
                type: 'text',
                content: block.text,
              } as SDKMessage);
            } else if (block.type === 'tool_use') {
              this.emitter.emit('message', {
                type: 'tool_use',
                content: '',
                metadata: {
                  toolName: block.name,
                  toolId: block.id,
                  toolInput: block.input as Record<string, unknown>,
                  status: 'running',
                },
              } as SDKMessage);
            } else if (block.type === 'thinking') {
              this.emitter.emit('message', {
                type: 'thinking',
                content: (block as { type: 'thinking'; thinking: string }).thinking || '',
              } as SDKMessage);
            }
          }
        }
        break;
      }

      case 'result': {
        this.emitter.emit('message', {
          type: 'result',
          content: 'Session completed',
        } as SDKMessage);
        break;
      }

      case 'user': {
        // Tool result - just log it
        logger.debug('Tool result received');
        break;
      }

      case 'system':
      case 'stream_event':
      case 'tool_progress':
      case 'auth_status': {
        // These message types are logged but not emitted to listeners
        logger.debug({ type: message.type }, 'Received SDK message');
        break;
      }
    }
  }

  /**
   * Build message with canvas context prepended (code-first format)
   */
  private buildContextMessage(userMessage: string): string {
    // Separate components (sandpack nodes) from pages
    const componentNodes = this.canvasState.nodes.filter((n) => n.type === 'sandpack');
    const pageNodes = this.canvasState.nodes.filter((n) => n.type === 'page');

    // Format components
    const componentsDescription =
      componentNodes.length > 0
        ? componentNodes
            .map((n) => {
              const isSelected = this.canvasState.selectedNodeId === n.id;
              const label = (n.data.name as string | undefined) ?? 'Component';
              const code = (n.data.code as string | undefined) ?? '// No code';
              const codeLines = code.split('\n');
              const codePreview = codeLines.slice(0, 5).join('\n');
              const truncated = codeLines.length > 5 ? '\n  // ... (truncated)' : '';
              const selectedMarker = isSelected ? ' ← SELECTED' : '';

              return `- ${label} [id: ${n.id}]${selectedMarker} at (${String(Math.round(n.position.x))}, ${String(Math.round(n.position.y))})
  Code:
\`\`\`tsx
${codePreview}${truncated}
\`\`\``;
            })
            .join('\n\n')
        : '(no components yet)';

    // Format pages
    const pagesDescription =
      pageNodes.length > 0
        ? pageNodes
            .map((n) => {
              const isSelected = this.canvasState.selectedNodeId === n.id;
              const name = n.data.name ?? 'Page';
              const layout = (n.data.layout as string | undefined) ?? 'flex';
              const viewport = (n.data.viewport as string | undefined) ?? 'desktop';
              const slots =
                (n.data.slots as
                  | { slotId?: string; componentId?: string; zIndex?: number }[]
                  | undefined) ?? [];
              const selectedMarker = isSelected ? ' ← SELECTED' : '';

              const slotsDescription =
                slots.length > 0
                  ? slots
                      .map(
                        (s) =>
                          `${s.slotId ?? ''}: ${s.componentId ?? ''} (z: ${String(s.zIndex ?? 0)})`
                      )
                      .join(', ')
                  : 'empty';

              return `- ${name} [id: ${n.id}]${selectedMarker} at (${String(Math.round(n.position.x))}, ${String(Math.round(n.position.y))})
  Layout: ${layout}, viewport: ${viewport}
  Slots: [${slotsDescription}]`;
            })
            .join('\n\n')
        : '(no pages yet)';

    const edgesDescription =
      this.canvasState.edges.length > 0
        ? this.canvasState.edges.map((e) => `- ${e.source} → ${e.target}`).join('\n')
        : '(no import relationships)';

    // Build selection context hint
    let selectionHint = '';
    if (this.canvasState.selectedNodeId) {
      if (this.canvasState.selectedNodeType === 'page') {
        selectionHint = `\nNote: A page is currently selected. Use add_to_page to add components to this page.`;
      } else {
        selectionHint = `\nNote: A component is currently selected. Use update_component to modify it.`;
      }
    }

    const context = `<current_canvas_state>
Components (${String(componentNodes.length)}):
${componentsDescription}

Pages (${String(pageNodes.length)}):
${pagesDescription}

Import relationships (${String(this.canvasState.edges.length)}):
${edgesDescription}${selectionHint}
</current_canvas_state>

User request: ${userMessage}`;

    return context;
  }
}

/**
 * Factory function to create CanvasAgent
 */
export function createCanvasAgent(
  sessionId: string,
  config: CanvasSessionConfig = { thinkingEnabled: false }
): CanvasAgent {
  return new CanvasAgent(sessionId, config);
}
