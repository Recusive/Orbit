/**
 * Claude Agent SDK integration for Orbit (TypeScript).
 */

import { existsSync } from 'fs';
import { EventEmitter } from 'node:events';

import { query } from '@anthropic-ai/claude-agent-sdk';

import { BrowserToolBridge, createBrowserMcpServer } from '../../browser/index.js';
import { ClaudeCredentials } from '../../common/auth/credentials.js';
import { getShellEnvironment } from '../../common/env/shell-env.js';
import { createLogger } from '../../common/logging/logger.js';
import { withRetry, RetryPresets } from '../../common/retry/retry.js';
import { listCommands } from '../definitions/index.js';
import { PermissionManager } from '../permissions/permissions.js';
import { getAllowedToolsForMode } from '../session/session-mode.js';
import { buildContentBlocks } from '../utils/content.js';
import { formatToolResult } from '../utils/formatter.js';

import type { McpToolRequest, McpToolResponse } from '../../browser/index.js';
import type { PermissionRequestCallback, SnapshotCallback } from '../permissions/permissions.js';
import type { OrbitSessionMode } from '../session/session-mode.js';
import type { AttachmentContentBlock } from '../types/messages.js';
import type {
  AgentDefinition,
  HookJSONOutput,
  McpServerConfig,
  NotificationHookInput,
  Options,
  OutputFormat,
  PermissionMode,
  PostToolUseFailureHookInput,
  PostToolUseHookInput,
  PreCompactHookInput,
  PreToolUseHookInput,
  Query,
  SDKMessage,
  SDKUserMessage,
  SessionEndHookInput,
  SessionStartHookInput,
  SubagentStartHookInput,
  SubagentStopHookInput,
} from '@anthropic-ai/claude-agent-sdk';

const logger = createLogger('OrbitAgent');
const BROWSER_MCP_SERVER_KEY = 'orbit-browser';

/**
 * Tool result block type for type guard
 */
interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/**
 * Tool use block type for type guard
 */
interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Type guard for tool_result blocks
 */
function isToolResultBlock(block: unknown): block is ToolResultBlock {
  if (typeof block !== 'object' || block === null) {
    return false;
  }
  const obj = block as Record<string, unknown>;
  return (
    obj.type === 'tool_result' &&
    typeof obj.tool_use_id === 'string' &&
    typeof obj.content === 'string'
  );
}

/**
 * Type guard for tool_use blocks
 */
function isToolUseBlock(block: unknown): block is ToolUseBlock {
  if (typeof block !== 'object' || block === null) {
    return false;
  }
  const obj = block as Record<string, unknown>;
  return (
    obj.type === 'tool_use' &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.input === 'object' &&
    obj.input !== null
  );
}

/**
 * Helper to safely get message content as array
 */
function getMessageContentArray(message: SDKMessage): unknown[] | null {
  if (message.type !== 'assistant' && message.type !== 'user') {
    return null;
  }
  const msg = message as { message?: { content?: unknown } };
  const content = msg.message?.content;
  if (!Array.isArray(content)) {
    return null;
  }
  // Cast to unknown[] to satisfy type checker
  return content as unknown[];
}

/** Categorized stderr error types for structured error handling */
export type StderrErrorCategory =
  | 'AUTH_FAILED'
  | 'RATE_LIMIT'
  | 'SESSION_EXPIRED'
  | 'OVERLOADED'
  | 'UNKNOWN';

export interface StderrError {
  category: StderrErrorCategory;
  message: string;
  raw: string;
}

export interface OrbitAgentConfig {
  permissionRequestCallback?: PermissionRequestCallback;
  snapshotCallback?: SnapshotCallback;
  /** SDK session ID to resume from (for programmatic forking only) */
  resumeSessionId?: string;
  /** Specific message UUID to resume at (for forking at a point in the conversation).
   *  When used with forkSession=true, this creates a new branch starting from that message.
   *  Claude only sees context UP TO this message, not messages that came after. */
  resumeSessionAt?: string;
  /** Whether to fork the session (for programmatic forking only) */
  forkSession?: boolean;
  model?: string;
  /** Fallback model to use if primary model fails */
  fallbackModel?: string;
  thinkingEnabled?: boolean;
  /** Token budget for extended thinking (default: 10000) */
  maxThinkingTokens?: number;
  planEnabled?: boolean;
  acceptEnabled?: boolean;
  critiqueEnabled?: boolean;
  cwd?: string;
  sessionMode?: OrbitSessionMode;
  /** MCP servers to register with the agent (e.g., DevTools, custom tools) */
  mcpServers?: Record<string, McpServerConfig>;
  /**
   * Structured output format - when set, the agent will return validated JSON
   * matching the provided JSON Schema in the result message's structured_output field.
   */
  outputFormat?: OutputFormat;
  /**
   * Custom subagents that can be invoked via the Task tool.
   * Keys are agent names, values are agent definitions with description, prompt, and optional tools/model.
   */
  agents?: Record<string, AgentDefinition>;
  /**
   * Callback for categorized stderr errors from the CLI subprocess.
   * Enables the session manager to surface auth failures, rate limits, etc. to the frontend.
   */
  onStderrError?: (error: StderrError) => void;
  /**
   * Callback for auth failures detected during auto-refresh or pre-send credential checks.
   * Enables the session manager to emit structured auth error events to the frontend.
   */
  onAuthFailure?: (message: string) => void;
}

/**
 * Message queue for streaming input mode.
 * Implements async iterator to yield messages as they are added.
 */
class MessageQueue {
  private queue: SDKUserMessage[] = [];
  private resolvers: ((value: IteratorResult<SDKUserMessage>) => void)[] = [];
  private stopped = false;

  /**
   * Add a message to the queue.
   * If a consumer is waiting, resolve immediately.
   * Otherwise, add to queue for later consumption.
   */
  add(message: string, attachments?: AttachmentContentBlock[]): void {
    if (this.stopped) {
      throw new Error('Message queue has been stopped');
    }

    // Build content blocks using the utility
    const content = buildContentBlocks(message, attachments);

    const sdkMessage: SDKUserMessage = {
      type: 'user',
      message: {
        role: 'user',
        content: content, // Can be string or array of content blocks
      },
      parent_tool_use_id: null,
      session_id: '', // SDK will assign the real session_id
    };

    // If we have a waiting consumer, resolve immediately
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift();
      if (resolve) {
        resolve({ value: sdkMessage, done: false });
      }
    } else {
      // Otherwise queue for later
      this.queue.push(sdkMessage);
    }
  }

  /**
   * Stop the queue (marks as complete).
   * Resolves any waiting consumers with done: true.
   */
  stop(): void {
    this.stopped = true;
    // Resolve all waiting consumers
    for (const resolve of this.resolvers) {
      resolve({ value: undefined, done: true });
    }
    this.resolvers = [];
  }

  /**
   * Async iterator implementation.
   * Yields messages from queue or waits for new messages.
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<SDKUserMessage, void, unknown> {
    while (!this.stopped) {
      // If queue has messages, yield them
      if (this.queue.length > 0) {
        const message = this.queue.shift();
        if (message) {
          yield message;
        }
      } else {
        // Wait for next message
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

/** Stderr error patterns for categorization */
const STDERR_ERROR_PATTERNS: readonly {
  category: StderrErrorCategory;
  patterns: readonly RegExp[];
  message: string;
}[] = [
  {
    category: 'AUTH_FAILED',
    patterns: [
      /invalid.*(?:api[_ ]?key|token|credential)/i,
      /auth(?:entication|orization)?\s+(?:failed|error|invalid)/i,
      /unauthorized/i,
      /401/,
    ],
    message: 'Authentication failed — check your credentials',
  },
  {
    category: 'RATE_LIMIT',
    patterns: [/rate[_ ]?limit/i, /too many requests/i, /429/, /retry[_ ]?after/i],
    message: 'Rate limited — please wait before retrying',
  },
  {
    category: 'SESSION_EXPIRED',
    patterns: [/session.*(?:expired|invalid|not found)/i, /token.*expired/i],
    message: 'Session expired — please start a new session',
  },
  {
    category: 'OVERLOADED',
    patterns: [/overloaded/i, /503/, /529/, /capacity/i, /temporarily unavailable/i],
    message: 'Service overloaded — please try again shortly',
  },
];

/**
 * Categorize a stderr line into a structured error type.
 * Returns null if the line doesn't match any known error patterns.
 */
function categorizeStderrError(line: string): StderrError | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;

  for (const { category, patterns, message } of STDERR_ERROR_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(trimmed)) {
        return { category, message, raw: trimmed };
      }
    }
  }

  return null;
}

export class OrbitAgent {
  private currentQuery: Query | null = null;
  private permissionManager: PermissionManager;
  private cwd: string;
  private _thinkingMode: boolean;
  private _thinkingBudget: number; // 0=off, 4096=think, 10240=hard, 32768=ultra
  private _effortLevel?: 'low' | 'medium' | 'high' | 'max';
  private _planMode: boolean;
  private _acceptMode: boolean;
  private _critiqueMode: boolean;
  private model?: string;
  private _fallbackModel?: string;
  private _sessionMode: OrbitSessionMode;

  // Session resume/fork fields (for programmatic forking and rewind)
  private _resumeSessionId?: string;
  private _resumeSessionAt?: string;
  private _forkSession: boolean;
  private _currentSessionId?: string;

  /**
   * The canonical session ID used for Map keys and event emissions.
   * Set to the temp ID at creation, then updated to the SDK ID on system:init.
   * Closures use this instead of capturing a stale temp ID.
   */
  private _effectiveSessionId = '';

  /** @internal The canonical session ID used for Map keys and event emissions. */
  get effectiveSessionId(): string {
    return this._effectiveSessionId;
  }

  set effectiveSessionId(value: string) {
    this._effectiveSessionId = value;
  }

  /** The working directory for this agent session. */
  get workingDirectory(): string {
    return this.cwd;
  }

  // Streaming input mode fields
  private messageQueue: MessageQueue | null = null;
  private sessionActive = false;

  // MCP servers (DevTools, custom tools, etc.)
  private _mcpServers: Record<string, McpServerConfig>;

  // Browser MCP bridge + events
  private browserBridge?: BrowserToolBridge;
  private readonly browserEmitter = new EventEmitter();

  // Structured output format (JSON Schema)
  private _outputFormat?: OutputFormat;

  // Custom subagents for Task tool
  private _agents?: Record<string, AgentDefinition>;

  // Stderr error callback for surfacing categorized errors to frontend
  private _onStderrError?: (error: StderrError) => void;

  // Auto-refresh timer cleanup function
  private _autoRefreshCleanup?: () => void;

  // [oauth-401-recovery] Flag: set after a 401 + successful token refresh. Cleared by restartSession().
  // Revert: remove this property and all methods/usages referencing _needsSessionRestart.
  private _needsSessionRestart = false;

  /** Callback for auth failures detected during auto-refresh or credential re-validation */
  private _onAuthFailure?: (message: string) => void;

  // [oauth-401-recovery] Getter + marker for session restart flag.
  /** Check if session needs restart after auth recovery. */
  needsSessionRestart(): boolean {
    return this._needsSessionRestart;
  }

  /**
   * Mark that the session needs restart (public for async race fallback in session-manager).
   * Called when the consumer catch block detects an auth error and explicitly awaits refresh.
   */
  markNeedsSessionRestart(): void {
    this._needsSessionRestart = true;
  }

  constructor(config: OrbitAgentConfig = {}) {
    this.permissionManager = new PermissionManager(
      config.permissionRequestCallback,
      config.snapshotCallback,
      () => this._acceptMode // Pass Accept mode getter for dynamic checking
    );
    this.cwd = config.cwd ?? process.cwd();
    this._thinkingMode = config.thinkingEnabled ?? false;
    this._thinkingBudget = config.maxThinkingTokens ?? 0; // 0=off, 4096=think, 10240=hard, 32768=ultra
    this._planMode = config.planEnabled ?? false;
    this._acceptMode = config.acceptEnabled ?? false;
    this._critiqueMode = config.critiqueEnabled ?? false;
    this._sessionMode = config.sessionMode ?? 'agent';
    // Session resume/fork for programmatic forking and rewind
    // resumeSessionAt + forkSession=true creates a new branch from a specific message
    this._resumeSessionId = config.resumeSessionId;
    this._resumeSessionAt = config.resumeSessionAt;
    this._forkSession = config.forkSession ?? false;
    // For resumed sessions, pre-populate _currentSessionId since the SDK won't emit
    // a new system:init message - it just replays existing messages from the JSONL file.
    // This ensures getCurrentSessionId() returns the correct value immediately.
    if (config.resumeSessionId) {
      this._currentSessionId = config.resumeSessionId;
    }
    if (config.model !== undefined) {
      this.model = config.model;
    }
    if (config.fallbackModel !== undefined) {
      this._fallbackModel = config.fallbackModel;
    }
    this._mcpServers = config.mcpServers ?? {};
    this._outputFormat = config.outputFormat;
    this._agents = config.agents;
    this._onStderrError = config.onStderrError;
    this._onAuthFailure = config.onAuthFailure;
    logger.info(
      {
        sessionMode: this._sessionMode,
        mcpServerCount: Object.keys(this._mcpServers).length,
        hasOutputFormat: !!this._outputFormat,
        agentCount: this._agents ? Object.keys(this._agents).length : 0,
      },
      'OrbitAgent created with session mode'
    );
  }

  /**
   * Register an MCP server dynamically (before session start)
   */
  registerMcpServer(name: string, server: McpServerConfig): void {
    if (this.sessionActive) {
      logger.warn('Cannot register MCP server after session has started');
      return;
    }
    this._mcpServers[name] = server;
    logger.info({ name }, 'MCP server registered');
  }

  /**
   * Unregister an MCP server
   */
  unregisterMcpServer(name: string): void {
    const { [name]: _removed, ...rest } = this._mcpServers;
    void _removed; // Intentionally unused, destructuring to remove from object
    this._mcpServers = rest;
    logger.info({ name }, 'MCP server unregistered');
  }

  /**
   * Set or remove the browser MCP server.
   * Call with server when browser panel is opened and session is active.
   * Call with null when browser panel is closed.
   */
  setBrowserMcpServer(server: McpServerConfig | null): void {
    if (server) {
      this.registerMcpServer(BROWSER_MCP_SERVER_KEY, server);
    } else {
      this.unregisterMcpServer(BROWSER_MCP_SERVER_KEY);
    }
  }

  /**
   * Check if browser MCP server is registered
   */
  hasBrowserMcpServer(): boolean {
    return Object.hasOwn(this._mcpServers, BROWSER_MCP_SERVER_KEY);
  }

  /**
   * Initialize embedded browser MCP server and bridge.
   * Safe to call multiple times.
   */
  initializeBrowserMcp(): void {
    if (this.browserBridge) {
      return;
    }

    this.browserBridge = new BrowserToolBridge();
    const browserServer = createBrowserMcpServer(this.browserBridge);
    this.setBrowserMcpServer(browserServer);

    // Forward tool requests to listeners
    this.browserBridge.onToolRequest((request) => {
      this.browserEmitter.emit('browserToolRequest', request);
    });

    logger.info('Browser MCP server initialized');
  }

  /**
   * Subscribe to browser tool requests (forwarded to frontend).
   */
  onBrowserToolRequest(callback: (request: McpToolRequest) => void): () => void {
    this.browserEmitter.on('browserToolRequest', callback);
    return () => {
      this.browserEmitter.off('browserToolRequest', callback);
    };
  }

  /**
   * Handle browser tool response from frontend.
   */
  handleBrowserToolResponse(response: McpToolResponse): void {
    if (!this.browserBridge) {
      logger.warn('Browser MCP bridge not initialized');
      return;
    }
    this.browserBridge.handleResponse(response);
  }

  /**
   * Get the permission manager instance
   */
  getPermissionManager(): PermissionManager {
    return this.permissionManager;
  }

  /**
   * Find the Claude Code executable path.
   * Priority:
   * 1. Bundled Claude CLI (production - same dir as agent-bridge)
   * 2. SDK's built-in executable (development)
   * 3. System-installed Claude CLI (fallback)
   */
  private _findClaudeExecutable(): string | undefined {
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

  private _createOptions(): Options {
    /**
     * Create Claude agent options with full Claude Code capabilities.
     */
    const options: Options = {
      // Explicitly set Claude Code CLI path for bundled environments (Bun compile)
      pathToClaudeCodeExecutable: this._findClaudeExecutable(),
      // Use Claude Code's official system prompt with browser automation docs
      systemPrompt: {
        type: 'preset' as const,
        preset: 'claude_code' as const,
        append: `
## Browser Automation

You have access to embedded browser automation tools via MCP. Use mcp__orbit-browser__browser_open to start a browser session.

### Panel Control
- **mcp__orbit-browser__browser_open**: Open the browser panel and optionally navigate to a URL.
- **mcp__orbit-browser__browser_close**: Close the browser panel when done with automation.

### Navigation
- **mcp__orbit-browser__browser_navigate**: Go to URL
- **mcp__orbit-browser__browser_back / mcp__orbit-browser__browser_forward / mcp__orbit-browser__browser_reload**: History navigation

### Interaction
- **mcp__orbit-browser__browser_click**: Click by CSS selector
- **mcp__orbit-browser__browser_type**: Type text into an input field

### Observation
- **mcp__orbit-browser__browser_get_text**: Get page or element text
- **mcp__orbit-browser__browser_get_html**: Get page or element HTML
- **mcp__orbit-browser__browser_screenshot**: Get page info (URL, title, dimensions)
- **mcp__orbit-browser__browser_console_logs**: Get console logs

### JavaScript
- **mcp__orbit-browser__browser_eval**: Execute JavaScript in page context

### Recommended Workflow
1. Use mcp__orbit-browser__browser_open to start a browser session (or browser_navigate if already open)
2. Use browser_get_text/browser_get_html to inspect content
3. Use browser_click/browser_type for interactions
4. Use browser_console_logs to check for JavaScript errors
5. Use browser_close when done

### Tips
- **Use browser_open first** - it opens the panel and navigates in one step
- **Use specific CSS selectors** for reliable interaction
- **Check console for errors** after page loads or after interactions fail

## Chrome DevTools (Advanced)

When browser is open, you also have access to Chrome DevTools Protocol tools via mcp__orbit-devtools__*:

### Console
- **devtools_console_get**: Get console logs with filtering by type (log/warn/error/info/debug)
- **devtools_console_clear**: Clear console messages
- **devtools_console_eval**: Execute JavaScript in console context

### Network (Detailed)
- **devtools_network_get**: Get network requests with filtering (url pattern, method, status)
- **devtools_network_detail**: Get full request/response details including headers and body
- **devtools_network_clear**: Clear network logs

### DOM Inspection
- **devtools_dom_query**: Query DOM with CSS selectors, get element structure
- **devtools_dom_html**: Get outer HTML of elements
- **devtools_dom_styles**: Get computed CSS styles for elements
- **devtools_dom_attributes**: Get all attributes of an element

### Performance
- **devtools_perf_metrics**: Get performance metrics (memory, DOM stats, rendering times)
- **devtools_perf_trace_start**: Start recording performance trace
- **devtools_perf_trace_stop**: Stop trace and get timeline events

### Storage
- **devtools_storage_local / devtools_storage_session**: Get localStorage/sessionStorage
- **devtools_storage_cookies**: Get cookies (optionally filter by domain)
- **devtools_storage_set_local / devtools_storage_set_session**: Set storage items
- **devtools_storage_set_cookie**: Set a cookie with full options
- **devtools_storage_clear**: Clear storage (local/session/cookies/all)

### General
- **devtools_eval**: Execute JavaScript with full page access, can await promises
- **devtools_page_info**: Get current page title and URL

### When to Use DevTools vs Browser Tools
- **Browser tools (mcp__orbit-browser__)**: Page interaction, navigation, clicking, typing
- **DevTools tools (mcp__orbit-devtools__)**: Deep inspection, debugging, storage, performance analysis
`,
      },
      // Working directory
      cwd: this.cwd,
      // Load CLAUDE.md from project directory for project-specific instructions
      settingSources: ['user', 'project', 'local'],
    };

    // Configure thinking based on model type
    const isAdaptive = this.model === 'claude-opus-4-6' || this.model === 'claude-sonnet-4-6';
    if (isAdaptive) {
      // DO NOT set options.thinking for adaptive models (Opus 4.6, Sonnet 4.6).
      // The CLI natively uses adaptive thinking for these models.
      // Explicitly setting it causes the SDK to pass --max-thinking-tokens 32000,
      // which suppresses StreamEvent messages (text_delta, thinking_delta).
      // By omitting it, the CLI handles thinking internally while still emitting
      // stream events for real-time text and thinking output.
      // Validated against @anthropic-ai/claude-code@1.0.x (CLI v2.1.39).
      if (this._effortLevel) {
        options.effort = this._effortLevel;
      }
      logger.info(
        { thinking: 'adaptive (CLI-managed)', effort: this._effortLevel ?? 'default' },
        'Adaptive thinking delegated to CLI for streaming compatibility'
      );
    } else {
      // All other models: default to extended thinking at ultra (32768 tokens).
      // If user explicitly configured a budget, use that; otherwise default to ultra.
      const budget = this._thinkingBudget > 0 ? this._thinkingBudget : 32768;
      options.thinking = { type: 'enabled', budgetTokens: budget };
      const modeName = budget <= 4096 ? 'think' : budget <= 10240 ? 'hard' : 'ultra';
      logger.info(
        { thinkingMode: modeName, thinkingBudget: budget },
        'Extended thinking ENABLED (fixed budget)'
      );
    }

    // Permission handling based on session mode
    if (this._sessionMode === 'chat') {
      // Chat mode: Use allowedTools array (no permission prompts)
      const chatTools = getAllowedToolsForMode('chat');
      options.allowedTools = chatTools;
      logger.info({ mode: 'chat', tools: chatTools }, 'Chat mode - read-only tools auto-approved');
    } else {
      // Agent mode: Use proper SDK permission flow
      // SDK Flow: PreToolUse Hook → Deny Rules → Allow Rules → Ask Rules → Permission Mode → canUseTool
      const permissionCallback = this.permissionManager.createCallback();
      logger.debug('Using SDK permission flow with canUseTool callback');

      // canUseTool callback fires when SDK would show a permission prompt
      // (i.e., hooks return 'continue' and rules don't cover it)
      options.canUseTool = async (toolName, toolInput, canUseToolOptions) => {
        try {
          const result = await permissionCallback(toolName, toolInput, {
            signal: canUseToolOptions.signal,
            suggestions: canUseToolOptions.suggestions ?? [],
          });
          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const wasAborted = canUseToolOptions.signal.aborted;
          logger.error(
            { toolName, error: errorMessage, signalAborted: wasAborted },
            `[ERROR] canUseTool error for ${toolName}`
          );
          // When signal was aborted (user interrupted), tell SDK to stop retrying this tool
          // This prevents the "tool_use ids must be unique" error when SDK retries with same ID
          return {
            behavior: 'deny' as const,
            message: wasAborted ? 'User interrupted' : 'Permission request failed',
            interrupt: wasAborted,
          };
        }
      };

      // Set up hooks for the SDK
      // PreToolUse: Only auto-approve specific tools, return {} to continue SDK flow for others
      // PostToolUse, PostToolUseFailure, Notification, etc.: For tracking and events
      options.hooks = {
        // PreToolUse hook - auto-approve safe tools, let SDK handle others
        PreToolUse: [
          {
            // No matcher means match ALL tools
            timeout: 86400, // 24 hours for indefinite waiting
            hooks: [
              (input: unknown): Promise<HookJSONOutput> => {
                const preToolInput = input as PreToolUseHookInput;
                const toolName = preToolInput.tool_name;
                const toolInput = preToolInput.tool_input as Record<string, unknown>;

                // Auto-approve TodoWrite - it just updates UI, no file modifications
                // Auto-approve Skill - it loads a prompt template, no side effects
                if (toolName === 'TodoWrite' || toolName === 'Skill') {
                  return Promise.resolve({
                    hookSpecificOutput: {
                      hookEventName: 'PreToolUse' as const,
                      permissionDecision: 'allow' as const,
                      updatedInput: toolInput,
                    },
                  });
                }

                // Return 'ask' to force ALL tools through canUseTool callback
                // This bypasses SDK's built-in Allow Rules that auto-approve read-only tools
                // (Read, Glob, Grep, WebSearch, etc.)
                return Promise.resolve({
                  hookSpecificOutput: {
                    hookEventName: 'PreToolUse' as const,
                    permissionDecision: 'ask' as const,
                    updatedInput: toolInput,
                  },
                });
              },
            ],
          },
        ],

        // PostToolUse hook - track tool completion
        PostToolUse: [
          {
            timeout: 30,
            hooks: [
              (input: unknown, toolUseId?: string): Promise<HookJSONOutput> => {
                const postInput = input as PostToolUseHookInput;
                logger.debug(
                  {
                    toolName: postInput.tool_name,
                    toolUseId,
                    hasResponse: postInput.tool_response !== undefined,
                  },
                  'Tool execution completed'
                );
                return Promise.resolve({});
              },
            ],
          },
        ],

        // PostToolUseFailure hook - track tool failures
        PostToolUseFailure: [
          {
            timeout: 30,
            hooks: [
              (input: unknown, toolUseId?: string): Promise<HookJSONOutput> => {
                const failureInput = input as PostToolUseFailureHookInput;
                logger.warn(
                  {
                    toolName: failureInput.tool_name,
                    toolUseId,
                    error: failureInput.error,
                    isInterrupt: failureInput.is_interrupt,
                  },
                  'Tool execution failed'
                );
                return Promise.resolve({});
              },
            ],
          },
        ],

        // Notification hook - track agent status updates
        Notification: [
          {
            timeout: 30,
            hooks: [
              (input: unknown): Promise<HookJSONOutput> => {
                const notifInput = input as NotificationHookInput;
                logger.info(
                  {
                    message: notifInput.message,
                    title: notifInput.title,
                  },
                  'Agent notification'
                );
                return Promise.resolve({});
              },
            ],
          },
        ],

        // PreCompact hook - notify before context compaction
        PreCompact: [
          {
            timeout: 30,
            hooks: [
              (input: unknown): Promise<HookJSONOutput> => {
                const compactInput = input as PreCompactHookInput;
                logger.info(
                  {
                    trigger: compactInput.trigger,
                    customInstructions: compactInput.custom_instructions,
                  },
                  'Context compaction starting'
                );
                return Promise.resolve({});
              },
            ],
          },
        ],

        // SubagentStart hook - track subagent spawning
        SubagentStart: [
          {
            timeout: 30,
            hooks: [
              (input: unknown): Promise<HookJSONOutput> => {
                const startInput = input as SubagentStartHookInput;
                logger.info(
                  {
                    agentId: startInput.agent_id,
                    agentType: startInput.agent_type,
                  },
                  'Subagent started'
                );
                return Promise.resolve({});
              },
            ],
          },
        ],

        // SubagentStop hook - track subagent completion
        SubagentStop: [
          {
            timeout: 30,
            hooks: [
              (input: unknown): Promise<HookJSONOutput> => {
                const stopInput = input as SubagentStopHookInput;
                logger.info(
                  {
                    stopHookActive: stopInput.stop_hook_active,
                  },
                  'Subagent stopped'
                );
                return Promise.resolve({});
              },
            ],
          },
        ],

        // SessionStart hook - track session lifecycle
        SessionStart: [
          {
            timeout: 30,
            hooks: [
              (input: unknown): Promise<HookJSONOutput> => {
                const sessionInput = input as SessionStartHookInput;
                logger.info(
                  {
                    source: sessionInput.source,
                  },
                  'Session started'
                );
                return Promise.resolve({});
              },
            ],
          },
        ],

        // SessionEnd hook - track session lifecycle
        SessionEnd: [
          {
            timeout: 30,
            hooks: [
              (input: unknown): Promise<HookJSONOutput> => {
                const sessionInput = input as SessionEndHookInput;
                logger.info(
                  {
                    reason: sessionInput.reason,
                  },
                  'Session ended'
                );
                return Promise.resolve({});
              },
            ],
          },
        ],
      };
    }

    // Add model if specified
    if (this.model) {
      options.model = this.model;
      logger.info({ model: this.model }, 'Using model');
    }

    // Add fallback model if specified
    if (this._fallbackModel) {
      options.fallbackModel = this._fallbackModel;
      logger.info({ fallbackModel: this._fallbackModel }, 'Fallback model configured');
    }

    // Permission mode (UDE pattern)
    // - Accept mode: 'acceptEdits' - SDK auto-approves file edits and filesystem ops
    //   (Edit, Write, mkdir, rm, mv, cp). Other tools still go through canUseTool.
    //   Our PermissionManager independently handles full auto-approval in accept mode.
    // - Plan mode: 'plan' - SDK restricts to read-only tools
    // - Default mode: 'default' - canUseTool callback handles all permissions
    const permissionMode: PermissionMode = this._acceptMode
      ? 'acceptEdits'
      : this._planMode
        ? 'plan'
        : 'default'; // UDE uses 'default' and it works
    options.permissionMode = permissionMode;
    logger.info({ permissionMode }, 'Permission mode set');

    if (this._planMode) {
      logger.info('Plan mode ENABLED - SDK will restrict to read-only tools');
    }

    // Safety limit: prevent runaway agent loops (200 turns is very generous)
    options.maxTurns = 200;

    // Route CLI subprocess stderr through structured logger + error categorization
    options.stderr = (data: string): void => {
      const trimmed = data.trimEnd();
      logger.debug({ source: 'claude-cli' }, trimmed);

      // Categorize known error patterns and surface to session manager
      if (this._onStderrError) {
        const categorized = categorizeStderrError(trimmed);
        if (categorized !== null) {
          logger.warn(
            { category: categorized.category, message: categorized.message },
            'Categorized CLI stderr error'
          );

          // On auth/session errors, attempt refresh FIRST — only surface the error
          // to the frontend if the refresh also fails. This prevents premature error
          // toasts when a simple token refresh would have resolved the issue.
          if (
            categorized.category === 'AUTH_FAILED' ||
            categorized.category === 'SESSION_EXPIRED'
          ) {
            void ClaudeCredentials.refreshIfNeeded()
              .then((result) => {
                if (result.refreshed) {
                  // [oauth-401-recovery] Set restart flag after successful refresh.
                  // Revert: remove the _needsSessionRestart line and restore original log message.
                  logger.info(
                    'Auto-refreshed credentials after CLI auth error — suppressing error, marking restart needed'
                  );
                  this._needsSessionRestart = true;
                } else {
                  // Refresh failed — NOW surface both the stderr error and auth failure
                  this._onStderrError?.(categorized);
                  this._onAuthFailure?.(categorized.message);
                }
              })
              .catch((err: unknown) => {
                const msg = err instanceof Error ? err.message : String(err);
                logger.error({ error: msg }, 'Credential refresh threw during stderr recovery');
                this._onStderrError?.(categorized);
                this._onAuthFailure?.(categorized.message);
              });
          } else {
            // Non-auth errors: surface immediately
            this._onStderrError(categorized);
          }
        }
      }
    };

    // Enable streaming partial messages for real-time text streaming
    options.includePartialMessages = true;

    // For NEW sessions: tell the SDK to use Orbit's session ID instead of auto-generating one.
    // This eliminates the frontend→SDK UUID remapping that happens on system:init.
    // Only for new sessions — forks and resumes must NOT set this (would collide with
    // existing JONLs on disk or conflict with the resume option).
    if (!this._resumeSessionId && this._effectiveSessionId) {
      options.sessionId = this._effectiveSessionId;
      logger.info(
        { sessionId: this._effectiveSessionId },
        'Custom sessionId set — SDK will use Orbit session ID (no remap needed)'
      );
    }

    // Session resume/fork options
    // With resumeSessionAt + forkSession=true, SDK resumes at that specific message
    // and creates a new branch - Claude only sees context UP TO that message
    if (this._resumeSessionId) {
      options.resume = this._resumeSessionId;
      if (this._resumeSessionAt) {
        options.resumeSessionAt = this._resumeSessionAt;
      }
      if (this._forkSession) {
        options.forkSession = true;
      }
      logger.info(
        {
          resumeFrom: this._resumeSessionId,
          resumeAt: this._resumeSessionAt,
          fork: this._forkSession,
        },
        'Session resume/fork configured'
      );
    }

    // MCP servers (DevTools, custom tools, etc.)
    if (Object.keys(this._mcpServers).length > 0) {
      options.mcpServers = this._mcpServers;
      logger.info({ servers: Object.keys(this._mcpServers) }, 'MCP servers configured');
    }

    // Structured output format (JSON Schema)
    if (this._outputFormat) {
      options.outputFormat = this._outputFormat;
      logger.info({ type: this._outputFormat.type }, 'Structured output format configured');
    }

    // Custom subagents for Task tool
    if (this._agents && Object.keys(this._agents).length > 0) {
      options.agents = this._agents;
      logger.info({ agents: Object.keys(this._agents) }, 'Custom subagents configured');
    }

    // Enable file checkpointing for rewind functionality
    // This tracks file changes made through Write, Edit, NotebookEdit tools
    // and allows rewinding to any previous checkpoint
    options.enableFileCheckpointing = true;
    logger.warn(
      { enableFileCheckpointing: true },
      'CHECKPOINT _createOptions — enableFileCheckpointing set on SDK options'
    );

    // Enable replay-user-messages for:
    // 1. NEW sessions: need checkpoint UUIDs for the rewind feature
    // 2. FORKED sessions: need checkpoint UUIDs emitted during replay.
    //    Two fork flavors:
    //    a) SDK fork: forkSession + resumeSessionAt → SDK stops replay at fork point
    //    b) Manual fork (forkSessionAt): forkSession + NO resumeSessionAt → JSONL is
    //       already truncated by us, so replaying all is safe (all messages have responses)
    //
    // Disable for:
    // - Plain resumed sessions (continue where left off): would replay ALL messages causing double-response
    const shouldEnableReplay = this._resumeSessionId === undefined || this._forkSession;

    if (shouldEnableReplay) {
      options.extraArgs = {
        ...options.extraArgs,
        'replay-user-messages': null,
      };
      logger.warn(
        {
          isNewSession: !this._resumeSessionId,
          isFork: this._forkSession,
          hasResumeAt: !!this._resumeSessionAt,
        },
        'CHECKPOINT _createOptions — replay-user-messages ENABLED (checkpoint UUIDs will arrive)'
      );
    } else {
      logger.warn(
        'replay-user-messages DISABLED for plain resumed session (no checkpoint UUIDs expected)'
      );
    }

    // CRITICAL: Pass the env variable through options.env (not just process.env)
    // The SDK requires this to enable file checkpointing storage.
    // Merge the shell environment so the CLI subprocess inherits the user's
    // full PATH (nvm, fnm, homebrew, bun, etc.) and other shell-specific vars.
    const shellEnv = getShellEnvironment();
    options.env = {
      ...shellEnv,
      ...process.env,
      CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: '1',
    };
    logger.warn(
      {
        processEnvValue: process.env.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING,
        optionsEnvValue: options.env.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING,
        enableFileCheckpointing: options.enableFileCheckpointing,
        hasReplayUserMessages: options.extraArgs?.['replay-user-messages'] === null,
        resume: options.resume ?? 'none',
        resumeSessionAt: options.resumeSessionAt ?? 'none',
        forkSession: options.forkSession ?? false,
      },
      'CHECKPOINT _createOptions — FULL checkpoint config summary'
    );

    return options;
  }

  async startSession(): Promise<void> {
    /**
     * Start a persistent streaming session with Claude.
     * Creates a message queue and starts the query with streaming input.
     * Includes retry logic for reliability.
     *
     * Authentication priority:
     * 1. OAuth token from macOS Keychain (same as Claude Code CLI)
     * 2. API key from .env file (fallback)
     */

    if (this.sessionActive) {
      logger.warn('Session already active');
      return;
    }

    // Capture the user's interactive login shell environment.
    // Tauri apps launched from Finder/Dock don't inherit the user's shell PATH,
    // so tools like bun/npm/node won't be found without this.
    const shellEnv = getShellEnvironment();
    if (shellEnv.PATH) {
      process.env.PATH = shellEnv.PATH;
      logger.debug({ pathLength: shellEnv.PATH.length }, 'Applied shell environment PATH');
    }

    // Get credentials with OAuth-first priority (async: may attempt token refresh)
    const credentials = await ClaudeCredentials.getCredentials();

    if (!credentials.hasCredentials) {
      throw new Error(
        'No credentials found. Please either:\n' +
          '1. Log in to Claude Code CLI (OAuth token will be stored in macOS Keychain), OR\n' +
          '2. Set ANTHROPIC_API_KEY in .env file'
      );
    }

    // Handle OAuth token case — pass token explicitly via CLAUDE_CODE_OAUTH_TOKEN
    // This is the official SDK mechanism: the CLI checks this env var first before
    // trying Keychain, giving us deterministic and reliable auth behavior.
    if (credentials.type === 'oauth') {
      if (credentials.token) {
        process.env.CLAUDE_CODE_OAUTH_TOKEN = credentials.token;
      }
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_AUTH_TOKEN;

      logger.info('Using Claude Code OAuth via CLAUDE_CODE_OAUTH_TOKEN');
      logger.info('Note: Using your Claude subscription quota, not API credits');
    } else {
      // API key fallback case
      if (!credentials.token) {
        throw new Error('API key was detected but is no longer available');
      }
      logger.info('Using API key from .env (will consume API credits)');
    }

    // Set stream close timeout to allow indefinite waiting for permissions
    // Default is 60s which causes reconnects when user doesn't respond to permission prompts
    // Set to 24 hours (in milliseconds) - like Claude Code CLI, user can wait indefinitely
    process.env.CLAUDE_CODE_STREAM_CLOSE_TIMEOUT = '86400000';

    // Enable SDK file checkpointing - required for rewindFiles() to work
    process.env.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING = '1';

    logger.debug(
      { thinkingMode: this._thinkingMode, thinkingBudget: this._thinkingBudget },
      'Starting session'
    );

    // Create message queue
    this.messageQueue = new MessageQueue();
    this.sessionActive = true;

    // Start persistent query with streaming input (with retry for reliability)
    const messageIterator = this.messageQueue[Symbol.asyncIterator]();
    const options = this._createOptions();

    this.currentQuery = await withRetry(
      () => {
        // query() is synchronous but may throw on initialization errors
        const q = query({
          prompt: messageIterator,
          options,
        });
        return Promise.resolve(q);
      },
      {
        ...RetryPresets.aggressive,
        operationName: 'startSession.query',
      }
    );

    // Schedule proactive token refresh (Layer 1) for OAuth sessions.
    // The timer fires 5 minutes before expiry and reschedules on success.
    if (credentials.type === 'oauth') {
      this._autoRefreshCleanup = ClaudeCredentials.scheduleAutoRefresh((msg) => {
        this._onAuthFailure?.(msg);
      });
      logger.info('Scheduled proactive OAuth token auto-refresh');
    }

    logger.info('Session started successfully');
  }

  /**
   * Attempt to refresh OAuth credentials if they are expired or expiring soon.
   * Updates `process.env.CLAUDE_CODE_OAUTH_TOKEN` on success so the CLI subprocess
   * picks up the new token on the next API call.
   *
   * @returns true if credentials are valid (either still fresh or successfully refreshed)
   */
  async refreshCredentials(): Promise<boolean> {
    const result = await ClaudeCredentials.refreshIfNeeded();
    if (result.refreshed) {
      logger.info('Credentials refreshed via pre-send check');
      return true;
    }
    // error field distinguishes "refresh failed" from "no refresh needed"
    // (Code review: Opus cycle 4, #6)
    if (result.error !== undefined) {
      logger.warn({ error: result.error }, 'Credential refresh failed in pre-send check');
      return false;
    }
    // No refresh was needed — credentials still valid (API key or unexpired token)
    return true;
  }

  // [oauth-401-recovery] Restart method — revert: remove this entire method.
  /**
   * Restart the SDK session with fresh credentials after a 401 recovery.
   * Stops the current query and starts a new one that resumes the session.
   * The new query reads the refreshed OAuth token from the Keychain.
   */
  async restartSession(): Promise<void> {
    const resumeId = this._currentSessionId;
    if (!resumeId) {
      throw new Error('Cannot restart session: no current session ID');
    }

    logger.info({ resumeId }, 'Restarting session with fresh credentials');

    await this.stopSession();

    // Configure for plain resume (no fork, no replay).
    // shouldEnableReplay evaluates to !resumeSessionId || forkSession = false.
    // This means replay-user-messages is disabled — no slow message replay,
    // and no checkpoint events (acceptable since we're not rewinding).
    this._resumeSessionId = resumeId;
    this._resumeSessionAt = undefined;
    this._forkSession = false;
    this._needsSessionRestart = false;

    await this.startSession();
  }

  /**
   * Check if the session is ready to receive messages
   */
  isSessionReady(): boolean {
    return this.sessionActive && this.messageQueue !== null;
  }

  queueMessage(message: string, attachments?: AttachmentContentBlock[]): void {
    /**
     * Add a message to the streaming session queue.
     * The message will be processed by the ongoing query session.
     */
    if (!this.sessionActive || !this.messageQueue) {
      throw new Error('Session not started. Call startSession() first.');
    }

    // Expand custom slash commands before sending to SDK.
    // The expansion is sent as a text attachment (not replacing the message)
    // so the original command text is preserved in JSONL and renders cleanly
    // on conversation reload (instead of showing the full expanded prompt).
    let attachmentsToSend = attachments;
    if (message.startsWith('/')) {
      const expanded = this.expandSlashCommand(message);
      if (expanded !== null) {
        const expansionBlock: AttachmentContentBlock = { type: 'text', text: expanded };
        attachmentsToSend = [expansionBlock, ...(attachments ?? [])];
        logger.info(
          { originalCommand: message.split(' ')[0], expandedLength: expanded.length },
          'Expanded slash command to text attachment'
        );
      }
    }

    // Log comprehensive SDK settings for each message
    const thinkingModeName =
      this._thinkingMode && this._thinkingBudget > 0
        ? this._thinkingBudget <= 4096
          ? 'think'
          : this._thinkingBudget <= 10240
            ? 'hard'
            : 'ultra'
        : 'off';

    logger.info(
      {
        model: this.model ?? 'claude-sonnet-4-6',
        thinkingMode: thinkingModeName,
        thinkingBudget: this._thinkingBudget,
        thinkingEnabled: this._thinkingMode,
        planMode: this._planMode,
        acceptMode: this._acceptMode,
        critiqueMode: this._critiqueMode,
        sessionMode: this._sessionMode,
        messagePreview: message.substring(0, 80) + (message.length > 80 ? '...' : ''),
        attachmentCount: attachmentsToSend?.length ?? 0,
      },
      // allow-any-unicode-next-line
      'Sending message to Claude'
    );
    this.messageQueue.add(message, attachmentsToSend);
  }

  /**
   * Expand a slash command to its prompt content.
   * Returns null if command is not found (pass through to SDK).
   */
  private expandSlashCommand(message: string): string | null {
    // Parse command name and arguments
    // Format: /command-name arg1 arg2 ...
    const parts = message.trim().split(/\s+/);
    const commandWithSlash = parts[0];
    if (commandWithSlash === undefined) return null;

    const commandName = commandWithSlash.slice(1); // Remove leading /
    const args = parts.slice(1);

    // Skip built-in SDK commands that should pass through
    const sdkBuiltinCommands = ['compact', 'clear', 'help'];
    if (sdkBuiltinCommands.includes(commandName)) {
      return null;
    }

    // Look up command in our definitions
    const commands = listCommands(this.cwd);
    const command = commands.find((cmd) => cmd.name === commandName);

    if (command === undefined) {
      logger.debug({ commandName }, 'Command not found in definitions, passing through to SDK');
      return null;
    }

    // Only expand Orbit's default commands (defined in code, not on disk).
    // Project and personal commands from .claude/commands/ are handled
    // natively by the SDK, which preserves original text in JSONL via XML wrapping.
    if (command.scope !== 'default') {
      logger.debug(
        { commandName, scope: command.scope },
        'Passing user command to SDK for native handling'
      );
      return null;
    }

    // Expand the command content
    let content = command.content;

    // Replace template variables with arguments
    // Supports: $1, $2, ... for positional args
    // Supports: $ARGUMENTS for all args joined
    // Supports: {{VAR:default}} for optional vars with defaults
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg !== undefined) {
        content = content.replace(new RegExp(`\\$${String(i + 1)}`, 'g'), arg);
      }
    }
    content = content.replace(/\$ARGUMENTS/g, args.join(' '));

    // Replace {{VAR:default}} patterns with args or defaults
    // e.g., {{BASE_BRANCH:main}} → first arg or "main"
    content = content.replace(
      /\{\{([^:}]+):([^}]+)\}\}/g,
      (_match, _varName, defaultValue: string) => {
        // For now, use the first argument if provided, otherwise the default
        return args[0] ?? defaultValue;
      }
    );

    logger.info(
      { commandName, commandScope: command.scope, argsCount: args.length },
      'Slash command expanded'
    );

    return content;
  }

  async *receiveResponse(): AsyncGenerator<SDKMessage, void, unknown> {
    /**
     * Receive responses from the persistent streaming session.
     * Messages are yielded as they arrive from the query.
     */
    if (!this.currentQuery) {
      throw new Error('No active query. Call startSession() first.');
    }

    // Capture the query reference so we can detect if startSession() replaced it
    // during a post-interrupt restart. Without this guard, the cleanup at the end
    // of the for-await loop would null out the NEW query set by startSession().
    const queryRef = this.currentQuery;

    // Track tool use blocks to match with their results
    const toolUseMap = new Map<string, { name: string; input: Record<string, unknown> }>();

    logger.info('Starting to iterate over query messages...');
    let messageCount = 0;

    // Yield messages as they arrive
    // In streaming mode, the query continues running and processing messages from the queue
    try {
      for await (const message of queryRef) {
        messageCount++;

        // Debug: Log every message from SDK with details
        const msgSubtype =
          message.type === 'system' ? (message as { subtype?: string }).subtype : undefined;
        logger.debug(
          {
            messageCount,
            type: message.type,
            subtype: msgSubtype,
          },
          'Agent received SDK message'
        );

        // Capture session ID from system:init message
        if (message.type === 'system' && (message as { subtype?: string }).subtype === 'init') {
          const initMessage = message as { session_id?: string };
          if (initMessage.session_id) {
            // Detect fork session: either SDK fork (with resumeSessionAt) or
            // manual forkSessionAt (forkSession=true but NO resumeSessionAt,
            // because we pre-truncate the JSONL ourselves).
            const isForkedSession = this._forkSession;
            logger.warn(
              {
                previousSessionId: this._currentSessionId ?? 'none',
                newSessionId: initMessage.session_id,
                isForkedSession,
                resumeSessionId: this._resumeSessionId ?? 'none',
                resumeSessionAt: this._resumeSessionAt ?? 'none',
              },
              'CHECKPOINT system:init — capturing SDK session ID (required for rewindFiles)'
            );
            this._currentSessionId = initMessage.session_id;

            // CRITICAL: After a fork completes, clear the fork options so subsequent
            // messages continue the forked session instead of re-forking.
            // Update _resumeSessionId to the new forked session ID.
            // This handles BOTH fork flavors:
            //   a) SDK fork: forkSession + resumeSessionAt
            //   b) Manual fork (forkSessionAt): forkSession only (JSONL pre-truncated)
            if (isForkedSession) {
              logger.info(
                {
                  oldResumeId: this._resumeSessionId,
                  newSessionId: initMessage.session_id,
                  clearedForkPoint: this._resumeSessionAt ?? 'none (manual forkSessionAt)',
                },
                'Fork completed - clearing fork options for subsequent messages'
              );
              this._resumeSessionId = initMessage.session_id;
              this._resumeSessionAt = undefined;
              this._forkSession = false;
            }
          }
        }

        // Track tool use blocks from assistant messages
        if (message.type === 'assistant') {
          const contentArray = getMessageContentArray(message);
          if (contentArray !== null) {
            for (const block of contentArray) {
              if (isToolUseBlock(block)) {
                toolUseMap.set(block.id, {
                  name: block.name,
                  input: block.input,
                });
              }
            }
          }
        }

        // Filter out SDK slash-command artifacts that shouldn't reach the frontend:
        // - User messages with <local-command-stdout> (hook output from /compact)
        // - Assistant messages with "No response requested." (SDK placeholder for commands)
        if (message.type === 'assistant') {
          const contentArray = getMessageContentArray(message);
          if (contentArray !== null && contentArray.length > 0) {
            const firstBlock = contentArray[0] as { type?: string; text?: string } | undefined;
            if (
              contentArray.length === 1 &&
              firstBlock?.type === 'text' &&
              firstBlock.text?.trim() === 'No response requested.'
            ) {
              logger.debug('Filtered SDK "No response requested." placeholder message');
              continue;
            }
          }
        }

        if (message.type === 'user') {
          const contentArray = getMessageContentArray(message);
          if (contentArray !== null) {
            const hasOnlyInternalContent = contentArray.every((block: unknown) => {
              if (typeof block === 'object' && block !== null && 'type' in block) {
                const typed = block as { type: string; text?: string };
                if (typed.type === 'text' && typeof typed.text === 'string') {
                  return typed.text.trim().startsWith('<local-command-stdout>');
                }
              }
              return false;
            });
            if (hasOnlyInternalContent && contentArray.length > 0) {
              logger.debug('Filtered SDK internal <local-command-stdout> user message');
              continue;
            }
          }
        }

        // Format tool results in user messages
        if (message.type === 'user') {
          const contentArray = getMessageContentArray(message);
          if (contentArray !== null) {
            // Create a shallow copy of the message for formatting
            const msg = message as { message: { content: unknown } };
            const formattedContent = contentArray.map((block: unknown) => {
              if (isToolResultBlock(block)) {
                const toolInfo = toolUseMap.get(block.tool_use_id);
                if (toolInfo !== undefined) {
                  // Format the content
                  const formatted = formatToolResult(
                    toolInfo.name,
                    toolInfo.input,
                    block.content,
                    block.is_error === true
                  );
                  return { ...block, content: formatted };
                }
              }
              return block;
            });
            const formattedMessage = {
              ...message,
              message: { ...msg.message, content: formattedContent },
            };
            yield formattedMessage as SDKMessage;
          } else {
            yield message;
          }
        } else {
          yield message;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error(
        { error: errorMessage, stack: errorStack, messageCount },
        'Error iterating over SDK query'
      );
      throw error;
    }

    // Query completed (session ended)
    logger.info({ messageCount }, 'Query session completed');

    // Only clean up if the query hasn't been replaced by a restart.
    // During post-interrupt restart, stopSession() → startSession() replaces
    // currentQuery before this old generator finishes draining. Without this
    // guard, we'd null out the NEW query and break interrupt().
    if (this.currentQuery === queryRef) {
      this.sessionActive = false;
      this.currentQuery = null;
    } else {
      logger.info('Skipping cleanup — query was replaced by a restart');
    }
  }

  async stopSession(): Promise<void> {
    /**
     * Stop the streaming session and clean up resources.
     */
    if (!this.sessionActive) {
      logger.debug('Session not active');
      return;
    }

    logger.debug('Stopping session');

    // Cancel the auto-refresh timer if running
    if (this._autoRefreshCleanup) {
      this._autoRefreshCleanup();
      this._autoRefreshCleanup = undefined;
    }

    // Stop the message queue
    if (this.messageQueue) {
      this.messageQueue.stop();
      this.messageQueue = null;
    }

    // Interrupt the query if still running
    if (this.currentQuery) {
      const currentQuery = this.currentQuery;
      try {
        await withRetry(async () => currentQuery.interrupt(), {
          ...RetryPresets.quick,
          operationName: 'stopSession.interrupt',
        });
      } catch (error) {
        logger.error({ error }, 'Error interrupting query after retries');
      }
      this.currentQuery = null;
    }

    this.sessionActive = false;
    logger.info('Session stopped');
  }

  async interrupt(): Promise<void> {
    /**
     * Interrupt the current query execution.
     */
    if (!this.currentQuery) {
      throw new Error('No active query to interrupt.');
    }

    const currentQuery = this.currentQuery;
    logger.info('Interrupting current query');

    await withRetry(async () => currentQuery.interrupt(), {
      ...RetryPresets.quick,
      operationName: 'interrupt',
    });
  }

  async setPermissionMode(mode: PermissionMode): Promise<void> {
    /**
     * Change permission mode during execution.
     */
    if (!this.currentQuery) {
      throw new Error('No active query.');
    }

    const currentQuery = this.currentQuery;

    await withRetry(async () => currentQuery.setPermissionMode(mode), {
      ...RetryPresets.quick,
      operationName: 'setPermissionMode',
    });
  }

  isConnected(): boolean {
    /**
     * Check if agent has an active query.
     */
    return this.currentQuery !== null;
  }

  /**
   * Set effort level for adaptive thinking (Opus 4.6).
   * Maps effort levels to thinking token budgets via setMaxThinkingTokens.
   */
  setEffortLevel(effort: 'low' | 'medium' | 'high' | 'max'): void {
    this._effortLevel = effort;

    // Also set budget as fallback for non-adaptive models
    const budgetMap: Record<string, number> = {
      low: 1024,
      medium: 4096,
      high: 10240,
      max: 32768,
    };
    this._thinkingMode = true;
    this._thinkingBudget = budgetMap[effort] ?? 4096;

    logger.info({ effort }, 'Effort level set — applies on next query');
  }

  setThinkingMode(enabled: boolean, maxTokens?: number): void {
    this._thinkingMode = enabled;
    if (maxTokens !== undefined) {
      this._thinkingBudget = maxTokens;
    }

    const budget = enabled && this._thinkingBudget > 0 ? this._thinkingBudget : 0;
    const modeName =
      budget === 0 ? 'off' : budget <= 4096 ? 'think' : budget <= 10240 ? 'hard' : 'ultra';
    logger.info({ thinkingMode: modeName, budget }, 'Thinking mode set — applies on next query');
  }

  getThinkingMode(): boolean {
    return this._thinkingMode;
  }

  setPlanMode(enabled: boolean): void {
    this._planMode = enabled;
    // Disable accept mode if plan mode is being enabled
    if (enabled) {
      this._acceptMode = false;
    }

    // Plan mode is checked when creating new sessions
    // Existing sessions continue with their current mode to avoid interruption
    logger.info({ enabled }, 'Plan mode changed - will apply to next session');
  }

  getPlanMode(): boolean {
    return this._planMode;
  }

  setAcceptMode(enabled: boolean): void {
    this._acceptMode = enabled;
    // Disable plan mode if accept mode is being enabled
    if (enabled) {
      this._planMode = false;
    }

    // Accept mode is checked dynamically in permission callback
    // No session restart needed - takes effect immediately on next tool use
    logger.info({ enabled }, 'Accept mode changed - will take effect on next tool use');
  }

  getAcceptMode(): boolean {
    return this._acceptMode;
  }

  setCritiqueMode(enabled: boolean): void {
    this._critiqueMode = enabled;
  }

  getCritiqueMode(): boolean {
    return this._critiqueMode;
  }

  async setModel(model: string): Promise<void> {
    this.model = model;

    // Update running query if exists - this enables runtime model switching
    if (this.currentQuery) {
      const currentQuery = this.currentQuery;

      await withRetry(async () => currentQuery.setModel(model), {
        ...RetryPresets.quick,
        operationName: 'setModel',
      });

      logger.info({ model }, 'Model updated mid-session via Query.setModel()');
    }
  }

  getModel(): string {
    return this.model ?? 'claude-sonnet-4-6';
  }

  /**
   * Get the current SDK session ID
   * This is captured from the system:init message when the session starts
   */
  getCurrentSessionId(): string | undefined {
    return this._currentSessionId;
  }

  /**
   * Rewind files to a specific checkpoint from INSIDE the message loop.
   * This method must be called from within the for-await loop that iterates
   * over the Query's messages, as per SDK requirements.
   *
   * IMPORTANT: This is the method that should be used by the session manager's
   * message loop. It calls rewindFiles() directly on the current Query object.
   *
   * @param checkpointId - The UUID of the checkpoint (from a user message)
   */
  async rewindFilesInLoop(checkpointId: string): Promise<void> {
    logger.warn(
      {
        checkpointId,
        hasCurrentQuery: !!this.currentQuery,
        sdkSessionId: this._currentSessionId ?? 'none',
        sessionActive: this.sessionActive,
      },
      'REWIND rewindFilesInLoop START (inside message loop)'
    );

    if (!this.currentQuery) {
      logger.error(
        { checkpointId, sdkSessionId: this._currentSessionId ?? 'none' },
        'REWIND rewindFilesInLoop FAILED — no active query'
      );
      throw new Error(
        'No active query - rewindFilesInLoop must be called from inside the message loop'
      );
    }

    // Call rewindFiles directly on the current Query object
    // This works because we're being called from inside the for-await loop
    const currentQuery = this.currentQuery;
    logger.warn({ checkpointId }, 'REWIND rewindFilesInLoop — calling query.rewindFiles()');
    try {
      await withRetry(async () => currentQuery.rewindFiles(checkpointId), {
        ...RetryPresets.quick,
        operationName: 'rewindFilesInLoop',
      });
      logger.warn({ checkpointId }, 'REWIND rewindFilesInLoop COMPLETE — files restored');
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(
        { checkpointId, error: errMsg },
        'REWIND rewindFilesInLoop FAILED — query.rewindFiles() threw'
      );
      throw err;
    }
  }

  /**
   * Rewind files to a specific checkpoint by creating a resumed query.
   * This method interrupts the current query, creates a new one that resumes
   * the session, and calls rewindFiles on that resumed query.
   *
   * Use this method when calling from outside the message loop (e.g., from session-manager).
   * For calls from inside the message loop, use rewindFilesInLoop() instead.
   *
   * @param checkpointId - The UUID of the checkpoint (from a user message)
   *
   * ⚠️  TESTED: This function is covered by integration tests.
   *     If you modify this, run: cd agent-bridge && bun test
   *     Test file: src/__tests__/file-rewind.test.ts
   */
  async rewindFiles(checkpointId: string): Promise<void> {
    const sdkSessionId = this._currentSessionId;
    logger.warn(
      {
        checkpointId,
        sdkSessionId: sdkSessionId ?? 'none',
        hasCurrentQuery: !!this.currentQuery,
        sessionActive: this.sessionActive,
      },
      'REWIND rewindFiles START (external — creates resumed query)'
    );

    if (!sdkSessionId) {
      logger.error({ checkpointId }, 'REWIND rewindFiles FAILED — no SDK session ID available');
      throw new Error('No SDK session ID available - session may not have been started');
    }

    // Step 1: Interrupt the current query to "complete" the session
    // The SDK requires the session to finish before checkpoint data is accessible
    if (this.currentQuery) {
      logger.warn(
        { checkpointId, sdkSessionId },
        'REWIND rewindFiles Step 1 — interrupting current query'
      );
      try {
        await this.currentQuery.interrupt();
        // Give the SDK a moment to finalize the session and flush checkpoint data
        await new Promise((resolve) => setTimeout(resolve, 500));
        logger.warn(
          { checkpointId },
          'REWIND rewindFiles Step 1 — interrupt complete, waited 500ms'
        );
      } catch (interruptErr) {
        const errMsg = interruptErr instanceof Error ? interruptErr.message : String(interruptErr);
        logger.warn(
          { checkpointId, error: errMsg },
          'REWIND rewindFiles Step 1 — interrupt error (continuing anyway)'
        );
      }
      // Clear the reference so stopSession() (called by deleteSession → forkSessionAt)
      // won't attempt to re-interrupt this already-interrupted query. Re-interrupting a
      // dead CLI subprocess can hang forever since withRetry has no per-attempt timeout.
      this.currentQuery = null;
    } else {
      logger.warn({ checkpointId }, 'REWIND rewindFiles Step 1 — no current query to interrupt');
    }

    logger.warn(
      { checkpointId, sdkSessionId },
      'REWIND rewindFiles Step 2 — building resumed query options'
    );

    // Step 2: Build options for the rewind query - must resume the session
    // Important: Include the CLI path since bundled Bun environments need it
    // Also include env with the checkpointing flag
    //
    // CRITICAL: replay-user-messages is required for the resumed CLI process to
    // emit messages in the stream. Without it, the CLI exits immediately
    // (empty prompt + no replay = transport dies before rewindFiles() executes).
    // permissionMode prevents the temporary process from blocking on prompts.
    // This matches the SDK docs' official checkpointing pattern.
    const rewindOptions: Options = {
      enableFileCheckpointing: true,
      permissionMode: 'acceptEdits' as const,
      resume: sdkSessionId,
      cwd: this.cwd,
      pathToClaudeCodeExecutable: this._findClaudeExecutable(),
      extraArgs: {
        'replay-user-messages': null,
      },
      env: {
        ...process.env,
        CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: '1',
      },
    };

    logger.warn(
      {
        checkpointId,
        resume: sdkSessionId,
        enableFileCheckpointing: true,
        envCheckpointing: rewindOptions.env?.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING,
        cwd: this.cwd,
      },
      'REWIND rewindFiles Step 3 — creating resumed query with empty prompt'
    );

    // Step 3: Create a new query that resumes the session with an empty prompt
    const rewindQuery = query({
      prompt: '', // Empty prompt to open the connection
      options: rewindOptions,
    });

    try {
      // Step 4: Iterate through the resumed query and call rewindFiles
      // We need to enter the async iterator once to establish the connection
      let msgCount = 0;
      for await (const msg of rewindQuery) {
        msgCount++;
        // Log the message type we received (for debugging replay issues)
        logger.warn(
          {
            checkpointId,
            msgType: msg.type,
            msgSubtype: (msg as { subtype?: string }).subtype,
            msgCount,
          },
          'REWIND rewindFiles Step 4 — got message from resumed query, calling rewindFiles()'
        );
        await withRetry(async () => rewindQuery.rewindFiles(checkpointId), {
          ...RetryPresets.quick,
          operationName: 'rewindFiles',
        });
        logger.warn(
          { checkpointId },
          'REWIND rewindFiles Step 4 — query.rewindFiles() returned successfully'
        );
        break; // Exit after rewinding
      }
      if (msgCount === 0) {
        logger.error(
          { checkpointId, sdkSessionId },
          'REWIND rewindFiles — resumed query yielded ZERO messages (connection failed?)'
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(
        { checkpointId, error: errMsg },
        'REWIND rewindFiles FAILED — error during file rewind'
      );
      throw err;
    } finally {
      // Step 5: Explicitly terminate the CLI process spawned by query().
      // The `break` above triggers the iterator's return(), but the underlying
      // Claude CLI process may continue running and recreate the JSONL file
      // after forkSessionAt deletes it (causing phantom sidebar entries).
      logger.warn(
        { checkpointId },
        'REWIND rewindFiles Step 5 — interrupting rewind query (cleanup)'
      );
      try {
        await rewindQuery.interrupt();
      } catch {
        // Ignore — process may already be exiting from the iterator return()
      }
    }
    logger.warn({ checkpointId, sdkSessionId }, 'REWIND rewindFiles COMPLETE');
  }
}

/**
 * Create an Orbit agent.
 */
export function createAgent(config: OrbitAgentConfig = {}): OrbitAgent {
  return new OrbitAgent(config);
}
