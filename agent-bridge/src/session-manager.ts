/**
 * Session Manager for Snowflake Agent Bridge
 * Manages Claude Agent SDK sessions and message streaming
 */

import { randomUUID } from 'node:crypto';

import { OrbitAgent } from './agent.js';
import { Disposable, Emitter } from './events.js';
import { createLogger } from './logger.js';

import type { OrbitAgentConfig } from './agent.js';
import type { AttachmentContentBlock } from './messages.js';

const logger = createLogger('SessionManager');

/**
 * Agent message types sent to the frontend
 */
export interface AgentMessage {
  type: 'text' | 'thinking' | 'tool_use' | 'result' | 'error';
  content: string;
  metadata?: {
    toolName?: string;
    toolId?: string;
    toolInput?: Record<string, unknown>;
    toolOutput?: string;
    status?: 'awaiting-permission' | 'running' | 'success' | 'error';
  };
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
  };
  totalCostUsd?: number;
  durationMs?: number;
  structuredOutput?: unknown;
  resultSubtype?: string;
}

/**
 * Permission request sent to the frontend
 */
export interface PermissionRequest {
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  requestId: string;
}

/**
 * Permission response from the frontend
 */
export interface PermissionResponse {
  requestId: string;
  decision: 'approve' | 'deny';
  always: boolean;
  answers?: Record<string, string>;
}

/**
 * Session initialization event
 */
export interface SessionInitEvent {
  sessionId: string;
  sdkSessionId: string;
  isResumed: boolean;
  isForked: boolean;
}

/**
 * Serializable error for IPC
 */
export interface SerializableError {
  message: string;
  stack?: string;
}

/**
 * Fork session options
 */
export interface ForkSessionOptions {
  keepAlive?: boolean;
  checkpointPrompt?: string;
  displayName?: string;
}

/**
 * Fork session result
 */
export interface ForkSessionResult {
  sdkSessionId: string;
  orbitSessionId?: string;
}

/**
 * Session configuration
 */
export interface SessionConfig {
  cwd?: string;
  thinkingEnabled?: boolean;
  maxThinkingTokens?: number;
  planEnabled?: boolean;
  acceptEnabled?: boolean;
  critiqueEnabled?: boolean;
  model?: 'haiku' | 'sonnet' | 'opus';
  sessionMode?: 'chat' | 'agent';
  resumeSessionId?: string;
  forkSession?: boolean;
}

/**
 * Permission resolver - resolves when user responds to permission request
 */
type PermissionResolver = (response: {
  decision: 'approve' | 'deny';
  always: boolean;
  answers?: Record<string, string>;
}) => void;

/**
 * Tool result block interface
 */
interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
}

/**
 * SDK message content block types
 */
interface TextBlock {
  type: 'text';
  text?: string;
}

interface ThinkingBlock {
  type: 'thinking';
  thinking?: string;
}

interface ToolUseBlock {
  type: 'tool_use';
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock;

/**
 * SDK stream event delta
 */
interface StreamDelta {
  type: string;
  text?: string;
  thinking?: string;
}

/**
 * SDK stream event
 */
interface StreamEvent {
  type: string;
  delta?: StreamDelta;
}

/**
 * SDK message types
 */
interface SDKSystemMessage {
  type: 'system';
  subtype?: string;
  session_id?: string;
}

interface SDKStreamEventMessage {
  type: 'stream_event';
  event?: StreamEvent;
}

interface SDKAssistantMessage {
  type: 'assistant';
  message?: {
    content?: ContentBlock[];
  };
}

interface SDKUserMessage {
  type: 'user';
  message?: {
    content?: unknown[];
  };
}

interface SDKResultMessage {
  type: 'result';
  subtype?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  total_cost_usd?: number;
  duration_ms?: number;
  structured_output?: unknown;
}

type SDKMessage =
  | SDKSystemMessage
  | SDKStreamEventMessage
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKResultMessage;

/**
 * Type guard for tool_result blocks
 */
function isToolResultBlock(block: unknown): block is ToolResultBlock {
  if (typeof block !== 'object' || block === null) {
    return false;
  }
  const obj = block as Record<string, unknown>;
  return obj.type === 'tool_result' && typeof obj.tool_use_id === 'string';
}

/**
 * Safely get string value with fallback
 */
function getString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Generate unique tool ID
 */
function generateToolId(): string {
  return `tool_${String(Date.now())}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Session Manager - orchestrates Claude Agent SDK sessions
 */
export class SessionManager extends Disposable {
  // Event emitters
  private readonly _onError = this._register(new Emitter<SerializableError>());
  readonly onError = this._onError.event;

  private readonly _onPermissionRequest = this._register(new Emitter<PermissionRequest>());
  readonly onPermissionRequest = this._onPermissionRequest.event;

  private readonly _onAgentMessage = this._register(
    new Emitter<{ sessionId: string; message: AgentMessage }>()
  );
  readonly onAgentMessage = this._onAgentMessage.event;

  private readonly _onPlanModeChanged = this._register(
    new Emitter<{ sessionId: string; enabled: boolean }>()
  );
  readonly onPlanModeChanged = this._onPlanModeChanged.event;

  private readonly _onAcceptModeChanged = this._register(
    new Emitter<{ sessionId: string; enabled: boolean }>()
  );
  readonly onAcceptModeChanged = this._onAcceptModeChanged.event;

  private readonly _onSessionInit = this._register(new Emitter<SessionInitEvent>());
  readonly onSessionInit = this._onSessionInit.event;

  // Session tracking
  private activeSessions = new Map<string, OrbitAgent>();
  private sessionConsumers = new Map<string, { cancel: () => void }>();
  private permissionResolvers = new Map<string, PermissionResolver>();
  private modePreferences = new Map<
    string,
    {
      thinkingEnabled?: boolean;
      maxThinkingTokens?: number;
      planEnabled?: boolean;
      acceptEnabled?: boolean;
      critiqueEnabled?: boolean;
      model?: 'haiku' | 'sonnet' | 'opus';
    }
  >();
  private pendingTools = new Map<
    string,
    Map<string, { toolName: string; toolId: string; toolInput: Record<string, unknown> }>
  >();
  private approvedToolNames = new Map<string, Set<string>>();
  private sessionResumeState = new Map<string, { isResumed: boolean; isForked: boolean }>();
  private sessionInitFired = new Set<string>();
  private pendingDisplayNames = new Map<string, string>();

  /**
   * Create a new agent session
   */
  createSession(sessionId: string, config?: SessionConfig): void {
    if (this.activeSessions.has(sessionId)) {
      return;
    }

    // Initialize tracking maps
    this.pendingTools.set(sessionId, new Map());
    this.approvedToolNames.set(sessionId, new Set());

    // Create permission callback that fires events
    const permissionCallback = async (
      toolName: string,
      toolInput: Record<string, unknown>,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      context: { signal: AbortSignal; suggestions?: unknown[] }
    ): Promise<{
      decision: 'approve' | 'deny';
      always: boolean;
      answers?: Record<string, string>;
    }> => {
      const requestId = randomUUID();

      // Fire event to frontend
      this._onPermissionRequest.fire({
        sessionId,
        toolName,
        toolInput,
        requestId,
      });

      // Wait for response (no timeout - waits indefinitely)
      const result = await new Promise<{
        decision: 'approve' | 'deny';
        always: boolean;
        answers?: Record<string, string>;
      }>((resolve) => {
        this.permissionResolvers.set(requestId, resolve);
      });

      // If approved, track for race condition handling
      if (result.decision === 'approve') {
        if (toolName === 'ExitPlanMode') {
          agent.setPlanMode(false);
          const prefs = this.modePreferences.get(sessionId) ?? {};
          prefs.planEnabled = false;
          this.modePreferences.set(sessionId, prefs);
        }

        const approvedTools = this.approvedToolNames.get(sessionId);
        if (approvedTools !== undefined) {
          approvedTools.add(toolName);
        }

        // Update pending tools status
        const sessionPendingTools = this.pendingTools.get(sessionId);
        if (sessionPendingTools !== undefined) {
          for (const tool of sessionPendingTools.values()) {
            if (tool.toolName === toolName) {
              this._onAgentMessage.fire({
                sessionId,
                message: {
                  type: 'tool_use',
                  content: `Tool ${toolName} running`,
                  metadata: {
                    toolName: tool.toolName,
                    toolId: tool.toolId,
                    toolInput: tool.toolInput,
                    status: 'running',
                  },
                },
              });
              break;
            }
          }
        }
      }

      return result;
    };

    // Merge stored preferences with config
    const storedPrefs = this.modePreferences.get(sessionId);
    const finalConfig: OrbitAgentConfig = {
      thinkingEnabled: storedPrefs?.thinkingEnabled ?? config?.thinkingEnabled ?? false,
      maxThinkingTokens: storedPrefs?.maxThinkingTokens ?? config?.maxThinkingTokens,
      planEnabled: storedPrefs?.planEnabled ?? config?.planEnabled ?? false,
      acceptEnabled: storedPrefs?.acceptEnabled ?? config?.acceptEnabled ?? false,
      critiqueEnabled: storedPrefs?.critiqueEnabled ?? config?.critiqueEnabled ?? false,
      model: storedPrefs?.model ?? config?.model,
      cwd: config?.cwd,
      sessionMode: config?.sessionMode ?? 'agent',
      permissionRequestCallback: permissionCallback,
      resumeSessionId: config?.resumeSessionId,
      forkSession: config?.forkSession,
    };

    logger.info({ sessionId, sessionMode: finalConfig.sessionMode }, 'Creating session');
    const agent = new OrbitAgent(finalConfig);

    // Track resume/fork state
    this.sessionResumeState.set(sessionId, {
      isResumed: !!config?.resumeSessionId,
      isForked: !!config?.forkSession,
    });

    this.activeSessions.set(sessionId, agent);

    try {
      agent.startSession();
      logger.info({ sessionId }, 'Session started successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ sessionId, error: errorMessage }, 'Failed to start session');
      throw error;
    }

    // Start background consumer for real-time streaming
    this._startBackgroundConsumer(sessionId, agent);
  }

  /**
   * Start a background consumer for streaming messages
   */
  private _startBackgroundConsumer(sessionId: string, agent: OrbitAgent): void {
    const state = { cancelled: false };

    const cancel = (): void => {
      state.cancelled = true;
    };

    this.sessionConsumers.set(sessionId, { cancel });

    // Run consumer in background
    void (async () => {
      try {
        const toolUseMap = new Map<
          string,
          { name: string; input: Record<string, unknown>; pendingMessages: AgentMessage[] }
        >();

        for await (const rawMessage of agent.receiveResponse()) {
          if (state.cancelled) {
            break;
          }

          // Cast to typed SDK message
          const sdkMessage = rawMessage as SDKMessage;

          // Handle system messages
          if (sdkMessage.type === 'system') {
            // Handle system:init
            if (sdkMessage.subtype === 'init' && sdkMessage.session_id !== undefined) {
              if (this.sessionInitFired.has(sessionId)) {
                continue;
              }
              this.sessionInitFired.add(sessionId);

              const resumeState = this.sessionResumeState.get(sessionId) ?? {
                isResumed: false,
                isForked: false,
              };
              this._onSessionInit.fire({
                sessionId,
                sdkSessionId: sdkMessage.session_id,
                isResumed: resumeState.isResumed,
                isForked: resumeState.isForked,
              });
            }
            continue;
          }

          // Handle streaming events for real-time text output
          if (sdkMessage.type === 'stream_event') {
            const event = sdkMessage.event;
            if (event === undefined) continue;

            // Handle text deltas
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              const textDelta = event.delta.text;
              if (textDelta !== undefined) {
                this._onAgentMessage.fire({
                  sessionId,
                  message: { type: 'text', content: textDelta },
                });
              }
            }
            // Handle thinking deltas
            else if (
              event.type === 'content_block_delta' &&
              event.delta?.type === 'thinking_delta'
            ) {
              const thinkingDelta = event.delta.thinking;
              if (thinkingDelta !== undefined) {
                this._onAgentMessage.fire({
                  sessionId,
                  message: { type: 'thinking', content: thinkingDelta },
                });
              }
            }
            continue;
          }

          // Handle assistant messages
          if (sdkMessage.type === 'assistant') {
            const content = sdkMessage.message?.content;
            if (content === undefined) continue;

            for (const block of content) {
              // Skip text blocks (already streamed)
              if (block.type === 'text') {
                continue;
              }
              if (block.type === 'thinking') {
                this._onAgentMessage.fire({
                  sessionId,
                  message: {
                    type: 'thinking',
                    content: block.thinking ?? '',
                  },
                });
                continue;
              }
              // block.type === 'tool_use'
              const toolName = getString(block.name, 'unknown');
              const toolId = getString(block.id) || generateToolId();
              const toolInput = block.input ?? {};

              const approvedTools = this.approvedToolNames.get(sessionId);
              const wasAlreadyApproved = approvedTools?.has(toolName) ?? false;

              if (wasAlreadyApproved && approvedTools !== undefined) {
                approvedTools.delete(toolName);
              }

              const initialStatus = wasAlreadyApproved ? 'running' : 'awaiting-permission';

              const toolMessage: AgentMessage = {
                type: 'tool_use',
                content: `Using tool: ${toolName}`,
                metadata: {
                  toolName,
                  toolId,
                  toolInput,
                  status: initialStatus,
                },
              };

              toolUseMap.set(toolId, {
                name: toolName,
                input: toolInput,
                pendingMessages: [toolMessage],
              });

              if (!wasAlreadyApproved) {
                const sessionPendingTools = this.pendingTools.get(sessionId);
                if (sessionPendingTools !== undefined) {
                  sessionPendingTools.set(toolId, {
                    toolName,
                    toolId,
                    toolInput,
                  });
                }
              }

              this._onAgentMessage.fire({ sessionId, message: toolMessage });
            }
          } else if (sdkMessage.type === 'user') {
            // Tool results
            const content = sdkMessage.message?.content;
            if (!Array.isArray(content)) continue;

            for (const block of content) {
              if (isToolResultBlock(block)) {
                const toolUseId = block.tool_use_id;
                const toolInfo = toolUseMap.get(toolUseId);

                if (toolInfo !== undefined) {
                  const originalMessage = toolInfo.pendingMessages[0];
                  if (
                    originalMessage.type === 'tool_use' &&
                    originalMessage.metadata !== undefined
                  ) {
                    const toolOutput =
                      typeof block.content === 'string'
                        ? block.content
                        : JSON.stringify(block.content);
                    const isError = block.is_error === true;
                    const storedToolId = originalMessage.metadata.toolId;

                    const completedMessage: AgentMessage = {
                      type: 'tool_use',
                      content: isError
                        ? `Tool ${toolInfo.name} failed`
                        : `Tool ${toolInfo.name} completed`,
                      metadata: {
                        toolName: toolInfo.name,
                        toolId: storedToolId,
                        toolInput: toolInfo.input,
                        toolOutput,
                        status: isError ? 'error' : 'success',
                      },
                    };

                    this._onAgentMessage.fire({ sessionId, message: completedMessage });

                    const sessionPendingTools = this.pendingTools.get(sessionId);
                    if (sessionPendingTools !== undefined && storedToolId !== undefined) {
                      sessionPendingTools.delete(storedToolId);
                    }
                  }

                  toolUseMap.delete(toolUseId);
                }
              }
            }
          } else {
            // sdkMessage.type === 'result'
            const resultMsg = sdkMessage;
            this._onAgentMessage.fire({
              sessionId,
              message: {
                type: 'result',
                content:
                  resultMsg.subtype === 'error_max_structured_output_retries'
                    ? 'Failed to produce valid structured output'
                    : 'Turn complete',
                usage:
                  resultMsg.usage !== undefined
                    ? {
                        inputTokens: resultMsg.usage.input_tokens ?? 0,
                        outputTokens: resultMsg.usage.output_tokens ?? 0,
                        cacheReadInputTokens: resultMsg.usage.cache_read_input_tokens,
                        cacheCreationInputTokens: resultMsg.usage.cache_creation_input_tokens,
                      }
                    : undefined,
                totalCostUsd: resultMsg.total_cost_usd,
                durationMs: resultMsg.duration_ms,
                structuredOutput: resultMsg.structured_output,
                resultSubtype: resultMsg.subtype,
              },
            });
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : 'no stack';
        logger.error({ sessionId, error: errorMessage }, 'Background consumer error');
        this._onError.fire({ message: `[SDK Error] ${errorMessage}`, stack: errorStack });
      }
    })();
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const consumer = this.sessionConsumers.get(sessionId);
    if (consumer) {
      consumer.cancel();
      this.sessionConsumers.delete(sessionId);
    }

    const agent = this.activeSessions.get(sessionId);
    if (agent) {
      await agent.stopSession();
      this.activeSessions.delete(sessionId);
    }

    this.pendingTools.delete(sessionId);
    this.approvedToolNames.delete(sessionId);
    this.sessionResumeState.delete(sessionId);
    this.sessionInitFired.delete(sessionId);
    this.pendingDisplayNames.delete(sessionId);
  }

  /**
   * Check if a session is ready
   */
  isSessionReady(sessionId: string): boolean {
    const agent = this.activeSessions.get(sessionId);
    return agent?.isSessionReady() ?? false;
  }

  /**
   * Interrupt a session
   */
  async interrupt(sessionId: string): Promise<void> {
    const agent = this.activeSessions.get(sessionId);
    if (!agent) {
      throw new Error(`Session ${sessionId} not found`);
    }
    await agent.interrupt();
  }

  /**
   * Get the SDK session ID for a session
   */
  getSDKSessionId(sessionId: string): string | undefined {
    const agent = this.activeSessions.get(sessionId);
    return agent?.getCurrentSessionId();
  }

  /**
   * Send a message to a session
   */
  sendMessage(message: string, sessionId: string, attachments?: AttachmentContentBlock[]): void {
    const agent = this.activeSessions.get(sessionId);
    if (agent === undefined) {
      throw new Error(`Session ${sessionId} not found. Call createSession() first.`);
    }

    if (!agent.isSessionReady()) {
      throw new Error(`Session ${sessionId} is not ready.`);
    }

    agent.queueMessage(message, attachments);
  }

  /**
   * Respond to a permission request
   */
  respondToPermission(response: PermissionResponse): void {
    const resolver = this.permissionResolvers.get(response.requestId);
    if (resolver) {
      resolver({
        decision: response.decision,
        always: response.always,
        answers: response.answers,
      });
      this.permissionResolvers.delete(response.requestId);
    }
  }

  /**
   * Set thinking mode for a session
   */
  async setThinkingMode(sessionId: string, enabled: boolean, maxTokens?: number): Promise<void> {
    const agent = this.activeSessions.get(sessionId);
    if (!agent) {
      const prefs = this.modePreferences.get(sessionId) ?? {};
      prefs.thinkingEnabled = enabled;
      prefs.maxThinkingTokens = maxTokens;
      this.modePreferences.set(sessionId, prefs);
      return;
    }
    await agent.setThinkingMode(enabled, maxTokens);
    const prefs = this.modePreferences.get(sessionId) ?? {};
    prefs.thinkingEnabled = enabled;
    prefs.maxThinkingTokens = maxTokens;
    this.modePreferences.set(sessionId, prefs);
  }

  /**
   * Get thinking mode for a session
   */
  getThinkingMode(sessionId: string): boolean {
    const agent = this.activeSessions.get(sessionId);
    if (agent === undefined) {
      const prefs = this.modePreferences.get(sessionId);
      return prefs?.thinkingEnabled ?? false;
    }
    return agent.getThinkingMode();
  }

  /**
   * Set model for a session
   */
  async setModel(sessionId: string, model: 'haiku' | 'sonnet' | 'opus'): Promise<void> {
    const agent = this.activeSessions.get(sessionId);
    if (!agent) {
      const prefs = this.modePreferences.get(sessionId) ?? {};
      prefs.model = model;
      this.modePreferences.set(sessionId, prefs);
      return;
    }
    await agent.setModel(model);
    const prefs = this.modePreferences.get(sessionId) ?? {};
    prefs.model = model;
    this.modePreferences.set(sessionId, prefs);
  }

  /**
   * Set plan mode for a session
   */
  setPlanMode(sessionId: string, enabled: boolean): void {
    const agent = this.activeSessions.get(sessionId);
    if (agent === undefined) {
      const prefs = this.modePreferences.get(sessionId) ?? {};
      prefs.planEnabled = enabled;
      this.modePreferences.set(sessionId, prefs);
      this._onPlanModeChanged.fire({ sessionId, enabled });
      return;
    }
    agent.setPlanMode(enabled);
    const prefs = this.modePreferences.get(sessionId) ?? {};
    prefs.planEnabled = enabled;
    this.modePreferences.set(sessionId, prefs);
    this._onPlanModeChanged.fire({ sessionId, enabled });
  }

  /**
   * Get plan mode for a session
   */
  getPlanMode(sessionId: string): boolean {
    const agent = this.activeSessions.get(sessionId);
    if (agent === undefined) {
      const prefs = this.modePreferences.get(sessionId);
      return prefs?.planEnabled ?? false;
    }
    return agent.getPlanMode();
  }

  /**
   * Set accept mode for a session
   */
  setAcceptMode(sessionId: string, enabled: boolean): void {
    const agent = this.activeSessions.get(sessionId);
    if (!agent) {
      const prefs = this.modePreferences.get(sessionId) ?? {};
      prefs.acceptEnabled = enabled;
      this.modePreferences.set(sessionId, prefs);
      this._onAcceptModeChanged.fire({ sessionId, enabled });
      return;
    }
    agent.setAcceptMode(enabled);
    const prefs = this.modePreferences.get(sessionId) ?? {};
    prefs.acceptEnabled = enabled;
    this.modePreferences.set(sessionId, prefs);
    this._onAcceptModeChanged.fire({ sessionId, enabled });
  }

  /**
   * Get accept mode for a session
   */
  getAcceptMode(sessionId: string): boolean {
    const agent = this.activeSessions.get(sessionId);
    if (agent === undefined) {
      const prefs = this.modePreferences.get(sessionId);
      return prefs?.acceptEnabled ?? false;
    }
    return agent.getAcceptMode();
  }

  /**
   * Fork a session (create a checkpoint/branch)
   */
  async forkSession(sessionId: string, options?: ForkSessionOptions): Promise<ForkSessionResult> {
    const agent = this.activeSessions.get(sessionId);
    if (agent === undefined) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const currentSDKSessionId = agent.getCurrentSessionId();
    if (currentSDKSessionId === undefined) {
      throw new Error(`No SDK session ID available for session ${sessionId}`);
    }

    const keepAlive = options?.keepAlive ?? false;
    const checkpointPrompt = options?.checkpointPrompt;
    const displayName = options?.displayName;

    // Create new session ID for the fork
    const newSessionId = `${sessionId}_fork_${String(Date.now())}`;

    // Set pending display name before creating session
    if (displayName !== undefined) {
      this.pendingDisplayNames.set(newSessionId, displayName);
    }

    // Create the forked session
    this.createSession(newSessionId, {
      resumeSessionId: currentSDKSessionId,
      forkSession: true,
    });

    const forkedAgent = this.activeSessions.get(newSessionId);
    if (forkedAgent === undefined) {
      throw new Error(`Failed to create forked session ${newSessionId}`);
    }

    // Queue a checkpoint message to trigger SDK session initialization
    const prompt =
      checkpointPrompt ??
      '[CHECKPOINT] This is an automatic checkpoint for session management. Please respond with "Checkpoint acknowledged." and nothing else.';
    forkedAgent.queueMessage(prompt);

    // Wait for the session ID to be captured (poll with timeout)
    const maxWait = 30000;
    const pollInterval = 100;
    let waited = 0;

    while (forkedAgent.getCurrentSessionId() === undefined && waited < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      waited += pollInterval;
    }

    const newSDKSessionId = forkedAgent.getCurrentSessionId();
    if (newSDKSessionId === undefined) {
      await this.deleteSession(newSessionId);
      throw new Error(`Failed to get SDK session ID for forked session after ${String(maxWait)}ms`);
    }

    if (keepAlive) {
      return {
        sdkSessionId: newSDKSessionId,
        orbitSessionId: newSessionId,
      };
    } else {
      await this.deleteSession(newSessionId);
      return {
        sdkSessionId: newSDKSessionId,
      };
    }
  }

  /**
   * Generate an agent definition from a natural language description using AI
   */
  async generateAgentDefinition(description: string): Promise<{
    name: string;
    description: string;
    prompt: string;
    tools?: string[];
    disallowedTools?: string[];
    model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
  }> {
    const agentSchema = {
      type: 'json_schema' as const,
      schema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'A short, descriptive name for the agent (no spaces, use kebab-case like "code-reviewer" or "test-runner")',
          },
          description: {
            type: 'string',
            description: 'A brief description of when to use this agent (1-2 sentences)',
          },
          prompt: {
            type: 'string',
            description:
              'The system prompt for the agent - detailed instructions on what it should do and how',
          },
          tools: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional list of specific tool names this agent should use',
          },
          model: {
            type: 'string',
            enum: ['sonnet', 'opus', 'haiku', 'inherit'],
            description: 'Model to use (default: inherit from parent)',
          },
        },
        required: ['name', 'description', 'prompt'],
      },
    };

    const prompt = `Generate a subagent definition based on this description:

"${description}"

Create a well-structured agent with:
1. A kebab-case name (e.g., "code-reviewer", "api-tester")
2. A clear description of when to use this agent
3. A detailed system prompt that explains the agent's purpose, capabilities, and how it should behave
4. Optionally specify which tools the agent should use (if not specified, it inherits all tools)
5. Optionally specify a model (sonnet for balanced, opus for complex tasks, haiku for fast simple tasks)

Return ONLY the JSON object with the agent definition.`;

    // Create temporary agent with structured output
    const agent = new OrbitAgent({
      outputFormat: agentSchema,
      model: 'sonnet',
    });

    agent.startSession();
    agent.queueMessage(prompt);

    // Consume responses until we get a result with structured output
    let result:
      | {
          name: string;
          description: string;
          prompt: string;
          tools?: string[];
          model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
        }
      | undefined = undefined;

    for await (const rawMessage of agent.receiveResponse()) {
      const sdkMessage = rawMessage as { type: string; structured_output?: unknown };
      if (sdkMessage.type === 'result') {
        if (
          sdkMessage.structured_output !== undefined &&
          sdkMessage.structured_output !== null &&
          typeof sdkMessage.structured_output === 'object'
        ) {
          const output = sdkMessage.structured_output as Record<string, unknown>;
          result = {
            name: typeof output.name === 'string' ? output.name : '',
            description: typeof output.description === 'string' ? output.description : '',
            prompt: typeof output.prompt === 'string' ? output.prompt : '',
            tools: Array.isArray(output.tools) ? (output.tools as string[]) : undefined,
            model: output.model as 'sonnet' | 'opus' | 'haiku' | 'inherit' | undefined,
          };
        }
        break;
      }
    }

    await agent.stopSession();

    if (result === undefined) {
      throw new Error('Failed to generate agent definition - no structured output received');
    }

    if (result.name === '' || result.description === '' || result.prompt === '') {
      throw new Error('Generated agent definition is missing required fields');
    }

    return result;
  }

  /**
   * Generate a command definition from a natural language description using AI
   */
  async generateCommandDefinition(description: string): Promise<{
    name: string;
    description?: string;
    content: string;
    allowedTools?: string[];
    argumentHint?: string;
    model?: 'sonnet' | 'opus' | 'haiku';
    scope: 'builtin' | 'default' | 'project' | 'personal';
    readonly?: boolean;
  }> {
    const commandSchema = {
      type: 'json_schema' as const,
      schema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'A short, descriptive name for the command (no spaces, use kebab-case like "review-code" or "run-tests")',
          },
          description: {
            type: 'string',
            description: 'A brief description of what the command does (1-2 sentences)',
          },
          content: {
            type: 'string',
            description: 'The prompt content - what the AI should do when this command is invoked',
          },
          argumentHint: {
            type: 'string',
            description: 'Optional hint for command arguments (e.g., "[file] [options]")',
          },
          model: {
            type: 'string',
            enum: ['sonnet', 'opus', 'haiku'],
            description: 'Optional model to use for this command',
          },
        },
        required: ['name', 'description', 'content'],
      },
    };

    const prompt = `Generate a slash command definition based on this description:

"${description}"

Create a well-structured command with:
1. A kebab-case name (e.g., "review-code", "run-tests", "fix-lint")
2. A clear description of what the command does
3. A detailed prompt content that tells the AI exactly what to do when the command is invoked
4. Optionally specify argument hints if the command accepts parameters
5. Optionally specify a model (sonnet for balanced, opus for complex tasks, haiku for fast simple tasks)

Return ONLY the JSON object with the command definition.`;

    // Create temporary agent with structured output
    const agent = new OrbitAgent({
      outputFormat: commandSchema,
      model: 'sonnet',
    });

    agent.startSession();
    agent.queueMessage(prompt);

    // Consume responses until we get a result with structured output
    let result:
      | {
          name: string;
          description?: string;
          content: string;
          argumentHint?: string;
          model?: 'sonnet' | 'opus' | 'haiku';
        }
      | undefined = undefined;

    for await (const rawMessage of agent.receiveResponse()) {
      const sdkMessage = rawMessage as { type: string; structured_output?: unknown };
      if (sdkMessage.type === 'result') {
        if (
          sdkMessage.structured_output !== undefined &&
          sdkMessage.structured_output !== null &&
          typeof sdkMessage.structured_output === 'object'
        ) {
          const output = sdkMessage.structured_output as Record<string, unknown>;
          result = {
            name: typeof output.name === 'string' ? output.name : '',
            description: typeof output.description === 'string' ? output.description : undefined,
            content: typeof output.content === 'string' ? output.content : '',
            argumentHint: typeof output.argumentHint === 'string' ? output.argumentHint : undefined,
            model: output.model as 'sonnet' | 'opus' | 'haiku' | undefined,
          };
        }
        break;
      }
    }

    await agent.stopSession();

    if (result === undefined) {
      throw new Error('Failed to generate command definition - no structured output received');
    }

    if (result.name === '' || result.content === '') {
      throw new Error('Generated command definition is missing required fields');
    }

    return {
      name: result.name,
      description: result.description,
      content: result.content,
      argumentHint: result.argumentHint,
      model: result.model,
      scope: 'project',
      readonly: false,
    };
  }

  /**
   * Dispose the session manager
   */
  override dispose(): void {
    // Deny all pending permission requests
    for (const [, resolver] of this.permissionResolvers.entries()) {
      resolver({ decision: 'deny', always: false });
    }
    this.permissionResolvers.clear();

    // Cancel all background consumers
    for (const [, consumer] of this.sessionConsumers.entries()) {
      consumer.cancel();
    }
    this.sessionConsumers.clear();

    // Stop all active sessions
    for (const [sessionId, agent] of this.activeSessions.entries()) {
      void agent.stopSession().catch((err: unknown) => {
        logger.error({ sessionId, error: err }, 'Error stopping session');
      });
    }
    this.activeSessions.clear();

    super.dispose();
  }
}
