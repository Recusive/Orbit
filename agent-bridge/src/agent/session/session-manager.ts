/**
 * Session Manager for Orbit Agent Bridge
 * Manages Claude Agent SDK sessions and message streaming
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { formatZodError } from '@orbit/shared-schemas';
import { z } from 'zod';

import { TextEventBatcher } from '../../common/batching/index.js';
import { Disposable, Emitter } from '../../common/events/events.js';
import { createLogger } from '../../common/logging/logger.js';
import { OrbitAgent } from '../core/agent.js';

import type { McpToolRequest, McpToolResponse } from '../../browser/index.js';
import type { OrbitAgentConfig } from '../core/agent.js';
import type { AttachmentContentBlock } from '../types/messages.js';

// ============================================================================
// Structured Output Schemas (for AI-generated definitions)
// ============================================================================

/**
 * Schema for AI-generated agent definitions
 */
const GeneratedAgentSchema = z
  .object({
    name: z
      .string()
      .describe(
        'A short, descriptive name for the agent (no spaces, use kebab-case like "code-reviewer" or "test-runner")'
      ),
    description: z
      .string()
      .describe('A brief description of when to use this agent (1-2 sentences)'),
    prompt: z
      .string()
      .describe(
        'The system prompt for the agent - detailed instructions on what it should do and how'
      ),
    tools: z
      .array(z.string())
      .optional()
      .describe('Optional list of specific tool names this agent should use'),
    model: z
      .enum(['sonnet', 'opus', 'haiku', 'inherit'])
      .optional()
      .describe('Model to use (default: inherit from parent)'),
  })
  .strict();

/**
 * Schema for AI-generated command definitions
 */
const GeneratedCommandSchema = z
  .object({
    name: z
      .string()
      .describe(
        'A short, descriptive name for the command (no spaces, use kebab-case like "review-code" or "run-tests")'
      ),
    description: z
      .string()
      .optional()
      .describe('A brief description of what the command does (1-2 sentences)'),
    content: z
      .string()
      .describe('The prompt content - what the AI should do when this command is invoked'),
    argumentHint: z
      .string()
      .optional()
      .describe('Optional hint for command arguments (e.g., "[file] [options]")'),
    model: z
      .enum(['sonnet', 'opus', 'haiku'])
      .optional()
      .describe('Optional model to use for this command'),
  })
  .strict();

const logger = createLogger('SessionManager');

/**
 * Agent message types sent to the frontend
 */
export interface AgentMessage {
  type: 'text' | 'thinking' | 'tool_use' | 'result' | 'error';
  content: string;
  /** Stable message ID from SDK - all events in a single assistant turn share this ID */
  messageId?: string;
  /**
   * Position in the text stream where this event occurred.
   * For tool_use events, this is the character offset in the accumulated text
   * at the time the tool was invoked. Used by frontend to interleave tool
   * widgets at the correct position in the message.
   */
  contentOffset?: number;
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
  /** SDK session ID to resume from (for session continuity, rewind forks, etc.) */
  resumeSessionId?: string;
  /** Specific message UUID to resume at (for forking at a point in the conversation) */
  resumeSessionAt?: string;
  /** Whether to fork the session (create new branch) vs continue original */
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
  uuid?: string; // Stable message UUID from SDK - same as parent assistant message
  session_id?: string;
  event?: StreamEvent;
  parent_tool_use_id?: string | null;
}

interface SDKAssistantMessage {
  type: 'assistant';
  uuid?: string; // Stable message UUID from SDK - shared across all events in a turn
  session_id?: string;
  message?: {
    content?: ContentBlock[];
  };
  parent_tool_use_id?: string | null;
}

interface SDKUserMessage {
  type: 'user';
  uuid?: string; // Checkpoint UUID - available when replay-user-messages is enabled
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
 * Metrics for tracking content loss events (data loss due to SDK integration issues).
 * These are critical issues that should be monitored in production.
 */
interface ContentLossMetrics {
  /** Number of text chunks lost due to missing message ID during streaming */
  streamingChunksLost: number;
  /** Total bytes of streaming content lost */
  streamingBytesLost: number;
  /** Number of full text blocks lost due to missing message ID */
  textBlocksLost: number;
  /** Total bytes of text block content lost */
  textBlockBytesLost: number;
  /** Timestamp of first content loss event (null if no loss) */
  firstLossAt: number | null;
  /** Timestamp of most recent content loss event (null if no loss) */
  lastLossAt: number | null;
}

// ============================================================================
// Usage Persistence
// ============================================================================

/**
 * Encode a workspace path to the Claude Code convention (replace `/` with `-`).
 * Example: `/Users/pranit/Desktop/orbit` → `-Users-pranit-Desktop-orbit`
 */
function encodeWorkspacePath(cwd: string): string {
  return cwd.replace(/\//g, '-');
}

/**
 * Persist the authoritative cumulative usage from the SDK's `result` message
 * to a `.usage.json` file alongside the JSONL.
 *
 * The SDK's JSONL files contain per-message usage with inaccurate output_tokens
 * (written at stream-start). The `result` event carries the correct cumulative
 * totals for the entire session. We persist this so the Rust conversation loader
 * can return accurate usage on reload.
 */
function persistSessionUsage(
  sdkSessionId: string,
  cwd: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
  },
  totalCostUsd?: number
): void {
  try {
    const projectDir = path.join(os.homedir(), '.claude', 'projects', encodeWorkspacePath(cwd));
    const usagePath = path.join(projectDir, `${sdkSessionId}.usage.json`);

    const data = {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadInputTokens: usage.cacheReadInputTokens ?? 0,
      cacheCreationInputTokens: usage.cacheCreationInputTokens ?? 0,
      totalCostUsd: totalCostUsd ?? 0,
    };

    fs.writeFileSync(usagePath, JSON.stringify(data), 'utf-8');
  } catch {
    // Non-critical — live usage still works, just won't survive restart
    logger.debug({ sdkSessionId }, 'Failed to persist session usage');
  }
}

/**
 * Find a session's JSONL file by searching all project directories.
 * The JSONL might be in a different project folder than the current cwd
 * (e.g., if the working directory changed during the session).
 *
 * @param sdkSessionId - The SDK session ID (JSONL filename without extension)
 * @returns Full path to the JSONL file, or null if not found
 */
function findSessionJsonl(sdkSessionId: string): string | null {
  const claudeDir = path.join(os.homedir(), '.claude', 'projects');

  if (!fs.existsSync(claudeDir)) {
    return null;
  }

  // Search all project directories for the session JSONL
  const projectDirs = fs.readdirSync(claudeDir, { withFileTypes: true });
  for (const dir of projectDirs) {
    if (!dir.isDirectory()) continue;

    const jsonlPath = path.join(claudeDir, dir.name, `${sdkSessionId}.jsonl`);
    if (fs.existsSync(jsonlPath)) {
      logger.debug({ sdkSessionId, jsonlPath, projectDir: dir.name }, 'Found JSONL file');
      return jsonlPath;
    }
  }

  return null;
}

/**
 * Result of truncating a session's JSONL file
 */
interface TruncateResult {
  /** Number of lines removed, or -1 if file not found */
  linesRemoved: number;
  /** The user message UUID that precedes the target (for resumeSessionAt) */
  userMessageUuid: string | null;
}

/**
 * Truncate a session's JSONL file to include only messages up to (and including)
 * a specific message UUID. This is the key mechanism for rewind - we directly
 * edit the file that the SDK reads from.
 *
 * The JSONL contains these line types:
 * - type: "queue-operation" - dequeue events
 * - type: "file-history-snapshot" - file state snapshots
 * - type: "user" - user messages with uuid field
 * - type: "assistant" - assistant responses with uuid field
 *
 * @param sdkSessionId - The SDK session ID (JSONL filename)
 * @param cwd - Working directory (used as fallback, searches all projects first)
 * @param targetMessageUuid - The message UUID to truncate AFTER (this message is INCLUDED)
 * @returns TruncateResult with lines removed and the preceding user message UUID
 */
function truncateSessionJsonl(
  sdkSessionId: string,
  cwd: string,
  targetMessageUuid: string
): TruncateResult {
  try {
    // First, try to find the JSONL by searching all project directories
    let jsonlPath = findSessionJsonl(sdkSessionId);

    // Fallback: try the cwd-based path
    if (!jsonlPath) {
      const projectDir = path.join(os.homedir(), '.claude', 'projects', encodeWorkspacePath(cwd));
      const fallbackPath = path.join(projectDir, `${sdkSessionId}.jsonl`);
      if (fs.existsSync(fallbackPath)) {
        jsonlPath = fallbackPath;
      }
    }

    if (!jsonlPath) {
      logger.warn(
        { sdkSessionId, cwd },
        'JSONL file not found for truncation (searched all projects)'
      );
      return { linesRemoved: -1, userMessageUuid: null };
    }

    // Read the entire file
    const content = fs.readFileSync(jsonlPath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim() !== '');

    // Parse all lines to find target and user messages
    interface ParsedLine {
      uuid?: string;
      type?: string;
      parentUuid?: string;
    }
    const parsedLines: (ParsedLine | null)[] = lines.map((line) => {
      try {
        return JSON.parse(line) as ParsedLine;
      } catch {
        return null;
      }
    });

    // Find the line index where the target message UUID appears
    let targetLineIndex = -1;
    for (let i = 0; i < parsedLines.length; i++) {
      const parsed = parsedLines[i];
      if (parsed?.uuid === targetMessageUuid) {
        targetLineIndex = i;
        logger.debug(
          { index: i, type: parsed.type, uuid: parsed.uuid },
          'Found target message in JSONL'
        );
        break;
      }
    }

    if (targetLineIndex === -1) {
      logger.warn({ sdkSessionId, targetMessageUuid }, 'Target message UUID not found in JSONL');
      return { linesRemoved: 0, userMessageUuid: null };
    }

    // Find the USER message that precedes the target (for resumeSessionAt)
    // Walk backwards from target to find the most recent user message
    let userMessageUuid: string | null = null;
    const targetParsed = parsedLines[targetLineIndex];

    // If target is an assistant message, look for its parent (should be user message)
    if (targetParsed?.type === 'assistant' && targetParsed.parentUuid) {
      userMessageUuid = targetParsed.parentUuid;
      logger.debug(
        { userMessageUuid, targetType: 'assistant' },
        'Found user message via parentUuid'
      );
    } else if (targetParsed?.type === 'user') {
      // Target itself is a user message
      userMessageUuid = targetParsed.uuid ?? null;
      logger.debug({ userMessageUuid, targetType: 'user' }, 'Target is user message');
    } else {
      // Fallback: walk backwards to find any user message
      for (let i = targetLineIndex - 1; i >= 0; i--) {
        const parsed = parsedLines[i];
        if (parsed?.type === 'user' && parsed.uuid) {
          userMessageUuid = parsed.uuid;
          logger.debug({ userMessageUuid, foundAt: i }, 'Found user message by walking backwards');
          break;
        }
      }
    }

    // Keep all lines up to and including the target message
    const linesToKeep = lines.slice(0, targetLineIndex + 1);
    const linesRemoved = lines.length - linesToKeep.length;

    if (linesRemoved > 0) {
      // Write the truncated content back
      const truncatedContent = linesToKeep.join('\n') + '\n';
      fs.writeFileSync(jsonlPath, truncatedContent, 'utf-8');
      logger.info(
        {
          sdkSessionId,
          targetMessageUuid,
          userMessageUuid,
          linesRemoved,
          linesKept: linesToKeep.length,
        },
        'Truncated JSONL file for rewind'
      );
    }

    return { linesRemoved, userMessageUuid };
  } catch (error) {
    logger.error({ error, sdkSessionId, targetMessageUuid }, 'Failed to truncate JSONL file');
    return { linesRemoved: -1, userMessageUuid: null };
  }
}

/**
 * Copy a session's JSONL file to a new session ID.
 * This is used when forking after truncation to avoid SDK cached state issues.
 *
 * @param oldSdkSessionId - The original SDK session ID (source file)
 * @param newSdkSessionId - The new SDK session ID (destination file)
 * @param cwd - Working directory (used to find the project directory)
 * @returns Object with success status and any error message
 */
function copySessionJsonl(
  oldSdkSessionId: string,
  newSdkSessionId: string,
  cwd: string
): { success: boolean; error?: string } {
  try {
    // Find the source JSONL file
    let sourcePath = findSessionJsonl(oldSdkSessionId);

    // Fallback: try the cwd-based path
    if (!sourcePath) {
      const projectDir = path.join(os.homedir(), '.claude', 'projects', encodeWorkspacePath(cwd));
      const fallbackPath = path.join(projectDir, `${oldSdkSessionId}.jsonl`);
      if (fs.existsSync(fallbackPath)) {
        sourcePath = fallbackPath;
      }
    }

    if (!sourcePath) {
      logger.warn({ oldSdkSessionId, cwd }, 'Source JSONL file not found for copy');
      return { success: false, error: 'Source file not found' };
    }

    // Determine destination path (same directory as source)
    const sourceDir = path.dirname(sourcePath);
    const destPath = path.join(sourceDir, `${newSdkSessionId}.jsonl`);

    // Copy the file
    fs.copyFileSync(sourcePath, destPath);

    logger.info(
      { oldSdkSessionId, newSdkSessionId, sourcePath, destPath },
      'Copied JSONL file to new session ID'
    );

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error, oldSdkSessionId, newSdkSessionId }, 'Failed to copy JSONL file');
    return { success: false, error: errorMsg };
  }
}

/**
 * Session Manager - orchestrates Claude Agent SDK sessions
 */
export class SessionManager extends Disposable {
  // Text event batcher - reduces ~200 events per response to ~4-8 batched events
  // Batches at 50ms intervals to align with screen refresh and reduce IPC overhead
  private readonly textBatcher: TextEventBatcher;

  // Content loss tracking - monitors data loss due to SDK integration issues
  // These metrics help diagnose production issues where content silently fails to render
  private contentLossMetrics: ContentLossMetrics = {
    streamingChunksLost: 0,
    streamingBytesLost: 0,
    textBlocksLost: 0,
    textBlockBytesLost: 0,
    firstLossAt: null,
    lastLossAt: null,
  };

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

  // Checkpoint event - fired when we receive a user message with a UUID
  // The UUID can be used to rewind files to that point
  private readonly _onCheckpoint = this._register(
    new Emitter<{ sessionId: string; checkpointId: string }>()
  );
  readonly onCheckpoint = this._onCheckpoint.event;

  // Browser tool request event - forwarded to frontend for execution
  private readonly _onBrowserToolRequest = this._register(
    new Emitter<{ sessionId: string; request: McpToolRequest }>()
  );
  readonly onBrowserToolRequest = this._onBrowserToolRequest.event;

  // Auth error event - structured auth failure notification for frontend
  private readonly _onAuthError = this._register(
    new Emitter<{
      sessionId: string;
      category: 'TOKEN_EXPIRED' | 'REFRESH_FAILED' | 'NO_CREDENTIALS' | 'INVALID_TOKEN';
      message: string;
      recoverable: boolean;
    }>()
  );
  readonly onAuthError = this._onAuthError.event;

  // Session tracking
  private activeSessions = new Map<string, OrbitAgent>();
  private sessionConsumers = new Map<
    string,
    { cancel: () => void; state: { cancelled: boolean; pendingRewindCheckpointId?: string } }
  >();
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
  /** Tracks turn start times per session for performance logging */
  private turnStartTimes = new Map<string, number>();
  private sessionInitFired = new Set<string>();
  private pendingDisplayNames = new Map<string, string>();
  private browserToolUnsubscribers = new Map<string, () => void>();

  // Track the current turn ID per session (our OWN stable ID, not SDK's uuid)
  // The SDK sends different UUIDs for each message (stream_event, assistant, etc.)
  // We generate our own stable turn ID when a turn starts and use it for ALL events
  // until the turn completes (result message). This ensures text chunks, tool events,
  // and results all share the same messageId for proper UI interleaving.
  private currentTurnId = new Map<string, string>();

  constructor() {
    super();

    // Initialize text batcher - fires batched text events every 16ms (~1 frame)
    // Keep backend batching minimal; frontend RAF batching handles render smoothness.
    // This gives fast feedback while frontend coalesces into 60fps renders.
    this.textBatcher = new TextEventBatcher((event) => {
      this._onAgentMessage.fire({
        sessionId: event.sessionId,
        message: {
          type: 'text',
          content: event.content,
          messageId: event.messageId,
        },
      });
    }, 16);
  }

  /**
   * Re-key all internal Maps from oldId to newId.
   *
   * Called when system:init fires and we learn the SDK session ID.
   * After this, both the agent-bridge and the frontend use the SDK ID
   * as the single source of truth — no aliases or translation needed.
   */
  private rekeySession(oldId: string, newId: string): void {
    const rekey = <V>(map: Map<string, V>): void => {
      const value = map.get(oldId);
      if (value !== undefined) {
        map.delete(oldId);
        map.set(newId, value);
      }
    };

    rekey(this.activeSessions);
    rekey(this.sessionConsumers);
    rekey(this.modePreferences);
    rekey(this.pendingTools);
    rekey(this.approvedToolNames);
    rekey(this.sessionResumeState);
    rekey(this.turnStartTimes);
    rekey(this.pendingDisplayNames);
    rekey(this.browserToolUnsubscribers);
    rekey(this.currentTurnId);

    if (this.sessionInitFired.has(oldId)) {
      this.sessionInitFired.delete(oldId);
      this.sessionInitFired.add(newId);
    }

    logger.info({ oldId, newId }, 'Re-keyed session to SDK ID');
  }

  /**
   * Create a new agent session
   */
  async createSession(sessionId: string, config?: SessionConfig): Promise<void> {
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
      context: { signal: AbortSignal; suggestions?: unknown[] }
    ): Promise<{
      decision: 'approve' | 'deny';
      always: boolean;
      answers?: Record<string, string>;
    }> => {
      const requestId = randomUUID();

      // Fire event to frontend (use agent's effective ID — SDK ID after init)
      this._onPermissionRequest.fire({
        sessionId: agent.effectiveSessionId,
        toolName,
        toolInput,
        requestId,
      });

      // Wait for response with abort signal support
      const result = await new Promise<{
        decision: 'approve' | 'deny';
        always: boolean;
        answers?: Record<string, string>;
      }>((resolve, reject) => {
        // Handle abort signal
        if (context.signal.aborted) {
          logger.warn(
            { toolName, requestId },
            `[WARN] Permission signal ALREADY ABORTED for ${toolName}`
          );
          reject(new Error('Permission request aborted'));
          return;
        }

        const abortHandler = (): void => {
          logger.warn(
            { toolName, requestId },
            `[WARN] Permission ABORTED via signal for ${toolName}`
          );
          this.permissionResolvers.delete(requestId);
          reject(new Error('Permission request aborted'));
        };

        context.signal.addEventListener('abort', abortHandler, { once: true });

        // Store resolver with cleanup
        this.permissionResolvers.set(requestId, (response) => {
          context.signal.removeEventListener('abort', abortHandler);
          resolve(response);
        });
      });

      // If approved, track for race condition handling
      if (result.decision === 'approve') {
        if (toolName === 'ExitPlanMode') {
          agent.setPlanMode(false);
          const prefs = this.modePreferences.get(agent.effectiveSessionId) ?? {};
          prefs.planEnabled = false;
          this.modePreferences.set(agent.effectiveSessionId, prefs);
        }

        const approvedTools = this.approvedToolNames.get(agent.effectiveSessionId);
        if (approvedTools !== undefined) {
          approvedTools.add(toolName);
        }

        // NOTE: We intentionally do NOT emit a second tool_use event here.
        // The tool was already emitted with 'awaiting-permission' or 'running' status
        // when the SDK first sent the tool_use block. Emitting again would:
        // 1. Trigger another tool:start in the frontend (TauriProvider treats non-success/error as start)
        // 2. Overwrite the tool's contentOffset with a stale/incorrect value
        // 3. Cause buildSegments to place the tool at the wrong position
        //
        // The frontend already tracks the tool from the initial event.
        // Permission approval is handled through the permission:response mechanism.
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
      // Session resume/fork for continuity and rewind
      // resumeSessionAt + forkSession=true creates a branch from a specific message
      resumeSessionId: config?.resumeSessionId,
      resumeSessionAt: config?.resumeSessionAt,
      forkSession: config?.forkSession,
      onAuthFailure: (message: string) => {
        this._onAuthError.fire({
          sessionId: agent.effectiveSessionId,
          category: 'REFRESH_FAILED',
          message,
          recoverable: true,
        });
      },
    };

    logger.info(
      {
        sessionId,
        sessionMode: finalConfig.sessionMode,
        resumeSessionId: finalConfig.resumeSessionId,
        resumeSessionAt: finalConfig.resumeSessionAt,
        forkSession: finalConfig.forkSession,
      },
      'Creating session with config'
    );
    const agent = new OrbitAgent(finalConfig);
    agent.effectiveSessionId = sessionId; // Will be updated to SDK ID on system:init

    // Initialize browser MCP server and forward tool requests
    agent.initializeBrowserMcp();
    const unsubscribeBrowserTools = agent.onBrowserToolRequest((request) => {
      this._onBrowserToolRequest.fire({ sessionId: agent.effectiveSessionId, request });
    });
    this.browserToolUnsubscribers.set(sessionId, unsubscribeBrowserTools);

    // Track resume/fork state
    this.sessionResumeState.set(sessionId, {
      isResumed: !!config?.resumeSessionId,
      isForked: !!config?.forkSession,
    });

    this.activeSessions.set(sessionId, agent);

    try {
      await agent.startSession();
      logger.info({ sessionId }, 'Session started successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ sessionId, error: errorMessage }, 'Failed to start session');
      // Remove from active sessions on failure
      this.activeSessions.delete(sessionId);

      // Detect credential errors and emit structured auth event
      if (/no credentials found|api[_ ]?key|oauth.*token/i.test(errorMessage)) {
        this._onAuthError.fire({
          sessionId,
          category: 'NO_CREDENTIALS',
          message: errorMessage,
          recoverable: true,
        });
      }

      throw error;
    }

    // Start background consumer for real-time streaming
    this._startBackgroundConsumer(sessionId, agent);
  }

  /**
   * Start a background consumer for streaming messages
   */
  private _startBackgroundConsumer(initialSessionId: string, agent: OrbitAgent): void {
    let sessionId = initialSessionId;
    const state: { cancelled: boolean; pendingRewindCheckpointId?: string } = { cancelled: false };

    const cancel = (): void => {
      state.cancelled = true;
    };

    this.sessionConsumers.set(sessionId, { cancel, state });

    // Run consumer in background
    void (async () => {
      try {
        const toolUseMap = new Map<
          string,
          { name: string; input: Record<string, unknown>; pendingMessages: AgentMessage[] }
        >();

        // Track whether text was streamed for this turn (via stream_event)
        // If not streamed, we need to emit text from the assistant message
        let textWasStreamed = false;

        let messageIndex = 0;
        for await (const rawMessage of agent.receiveResponse()) {
          if (state.cancelled) {
            break;
          }

          // Cast to typed SDK message
          const sdkMessage = rawMessage as SDKMessage;

          // Debug: Log every message received from SDK
          logger.debug(
            {
              sessionId,
              messageIndex,
              messageType: sdkMessage.type,
              subtype: sdkMessage.type === 'system' ? sdkMessage.subtype : undefined,
            },
            'SDK message received'
          );
          messageIndex++;

          // Handle system messages
          if (sdkMessage.type === 'system') {
            // Handle system:init
            if (sdkMessage.subtype === 'init' && sdkMessage.session_id !== undefined) {
              if (this.sessionInitFired.has(sessionId)) {
                continue;
              }
              this.sessionInitFired.add(sessionId);

              const sdkSessionId = sdkMessage.session_id;

              // Re-key all Maps from temp ID to SDK ID.
              // After this, both the agent-bridge and frontend use one ID.
              if (sdkSessionId !== sessionId) {
                this.rekeySession(sessionId, sdkSessionId);
                agent.effectiveSessionId = sdkSessionId;
                sessionId = sdkSessionId; // All subsequent emissions use SDK ID
              }

              const resumeState = this.sessionResumeState.get(sessionId) ?? {
                isResumed: false,
                isForked: false,
              };
              this._onSessionInit.fire({
                sessionId,
                sdkSessionId,
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

            // Generate our own stable turn ID if this is the first event of a new turn
            // SDK sends different UUIDs per message, so we can't rely on them for grouping
            if (!this.currentTurnId.has(sessionId)) {
              const newTurnId = randomUUID();
              this.currentTurnId.set(sessionId, newTurnId);
            }

            // Get our stable turn ID for this session
            const streamMessageId = this.currentTurnId.get(sessionId);

            // Handle text deltas - batch to reduce event flooding
            // SDK emits ~200 events per response, we batch at 50ms intervals
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              const textDelta = event.delta.text;
              if (textDelta !== undefined) {
                textWasStreamed = true; // Mark that we received streaming text

                logger.debug(
                  { sessionId, messageId: streamMessageId, textLength: textDelta.length },
                  'Text delta received'
                );

                // Message ID should always be set from the SDK's stream_event.uuid
                // If missing, something is wrong with the SDK flow - skip to prevent corruption
                if (!streamMessageId) {
                  // Track content loss metrics for monitoring
                  this.contentLossMetrics.streamingChunksLost++;
                  this.contentLossMetrics.streamingBytesLost += textDelta.length;
                  const now = Date.now();
                  this.contentLossMetrics.firstLossAt ??= now;
                  this.contentLossMetrics.lastLossAt = now;

                  const errorMsg =
                    'Streaming content was lost due to missing message ID. ' +
                    'This indicates an SDK integration issue. Please report this bug.';
                  logger.error(
                    {
                      sessionId,
                      textDeltaLength: textDelta.length,
                      totalChunksLost: this.contentLossMetrics.streamingChunksLost,
                      totalBytesLost: this.contentLossMetrics.streamingBytesLost,
                    },
                    'CRITICAL: Text delta received before message UUID was captured - content will be lost. ' +
                      'This indicates SDK integration failure. Check stream_event handling above.'
                  );
                  // Emit error to frontend so user knows something went wrong
                  this._onError.fire({ message: errorMsg });
                  continue;
                }

                // Queue in batcher instead of firing directly
                this.textBatcher.add(sessionId, streamMessageId, textDelta);
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
                  message: { type: 'thinking', content: thinkingDelta, messageId: streamMessageId },
                });
              }
            }
            continue;
          }

          // Handle assistant messages
          if (sdkMessage.type === 'assistant') {
            const content = sdkMessage.message?.content;
            if (content === undefined) continue;

            // Generate our own stable turn ID if this is the first event of a new turn
            // This handles cases where assistant message arrives before any stream_event
            if (!this.currentTurnId.has(sessionId)) {
              const newTurnId = randomUUID();
              this.currentTurnId.set(sessionId, newTurnId);
            }

            // Get our stable turn ID for this session
            const currentMessageId = this.currentTurnId.get(sessionId);

            for (const block of content) {
              // Handle text blocks - emit if not already streamed
              if (block.type === 'text') {
                if (!textWasStreamed && block.text) {
                  // No streaming happened (e.g., image input), emit full text via batcher
                  // currentMessageId should always be set from sdkMessage.uuid above
                  if (!currentMessageId) {
                    // Track content loss metrics for monitoring
                    this.contentLossMetrics.textBlocksLost++;
                    this.contentLossMetrics.textBlockBytesLost += block.text.length;
                    const now = Date.now();
                    this.contentLossMetrics.firstLossAt ??= now;
                    this.contentLossMetrics.lastLossAt = now;

                    const errorMsg =
                      'Response content was lost due to missing message ID. ' +
                      'This indicates an SDK integration issue. Please report this bug.';
                    logger.error(
                      {
                        sessionId,
                        textLength: block.text.length,
                        totalBlocksLost: this.contentLossMetrics.textBlocksLost,
                        totalBytesLost: this.contentLossMetrics.textBlockBytesLost,
                      },
                      'CRITICAL: Assistant text block received without message UUID - content will be lost. ' +
                        'This indicates SDK integration failure. The sdkMessage.uuid should have been captured.'
                    );
                    // Emit error to frontend so user knows something went wrong
                    this._onError.fire({ message: errorMsg });
                    continue;
                  }
                  this.textBatcher.add(sessionId, currentMessageId, block.text);
                }
                continue;
              }
              if (block.type === 'thinking') {
                this._onAgentMessage.fire({
                  sessionId,
                  message: {
                    type: 'thinking',
                    content: block.thinking ?? '',
                    messageId: currentMessageId,
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

              // CRITICAL: Flush buffered text BEFORE calculating contentOffset.
              // The text batcher accumulates text at 50ms intervals. If we calculate
              // contentOffset without flushing, it includes buffered text that hasn't
              // been emitted yet. The frontend would receive tool:start BEFORE the
              // text chunks, causing contentOffset > displayedContent.length → text
              // split mid-word. Flushing ensures frontend has all text before tool arrives.
              this.textBatcher.flushSession(sessionId);

              // Get the current accumulated text length - this is where the tool
              // appears in the stream. Used by frontend to interleave tool widgets.
              // After flushing, accumulatedLength equals what frontend has received.
              const contentOffset = currentMessageId
                ? this.textBatcher.getAccumulatedLength(sessionId, currentMessageId)
                : 0;

              logger.info(
                {
                  sessionId,
                  toolName,
                  toolId,
                  toolInputKeys: Object.keys(toolInput),
                  contentOffset,
                  messageId: currentMessageId,
                },
                'Tool use block received from SDK'
              );

              const toolMessage: AgentMessage = {
                type: 'tool_use',
                content: `Using tool: ${toolName}`,
                messageId: currentMessageId,
                contentOffset,
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
            // Emit checkpoint event if user message has a UUID
            // This UUID can be used to rewind files to this point
            logger.debug(
              { hasUuid: !!sdkMessage.uuid, uuid: sdkMessage.uuid },
              'Received user message from SDK'
            );
            if (sdkMessage.uuid) {
              logger.info(
                { sessionId, checkpointId: sdkMessage.uuid },
                'Emitting checkpoint event'
              );
              this._onCheckpoint.fire({
                sessionId,
                checkpointId: sdkMessage.uuid,
              });
            }

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
                    originalMessage?.type === 'tool_use' &&
                    originalMessage.metadata !== undefined
                  ) {
                    const toolOutput =
                      typeof block.content === 'string'
                        ? block.content
                        : JSON.stringify(block.content);
                    const isError = block.is_error === true;
                    const storedToolId = originalMessage.metadata.toolId;

                    // Get the current message ID for this turn
                    const toolCompleteMessageId = this.currentTurnId.get(sessionId);
                    const completedMessage: AgentMessage = {
                      type: 'tool_use',
                      content: isError
                        ? `Tool ${toolInfo.name} failed`
                        : `Tool ${toolInfo.name} completed`,
                      messageId: toolCompleteMessageId,
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

            // Gradually drain any remaining batched text before completing the turn.
            // Uses drainSession instead of flushSession to emit content in smooth chunks
            // (~80 chars per 16ms) rather than dumping everything at once.
            // This prevents the "2-3 words then dump rest" pattern on fast/short responses.
            //
            // TIMING SAFETY: Safe to await here because 'result' signals SDK turn completion.
            // No more messages will arrive for this turn until we emit agent:complete and
            // the user sends a new message. The for-await loop is effectively paused during
            // drain, but no new SDK messages are expected until the next turn begins.
            await this.textBatcher.drainSession(sessionId);

            // Get the final message ID for this turn before resetting
            const turnMessageId = this.currentTurnId.get(sessionId);

            // Clear accumulated length tracking for this message (reset for next turn)
            if (turnMessageId) {
              this.textBatcher.clearAccumulatedLength(sessionId, turnMessageId);
            }

            // Clear turn start time tracking
            this.turnStartTimes.delete(sessionId);

            this._onAgentMessage.fire({
              sessionId,
              message: {
                type: 'result',
                content:
                  resultMsg.subtype === 'error_max_structured_output_retries'
                    ? 'Failed to produce valid structured output'
                    : 'Turn complete',
                messageId: turnMessageId,
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

            // Persist authoritative cumulative usage to disk so it survives restart.
            // The SDK's JSONL has inaccurate per-message output_tokens (stream-start values).
            if (resultMsg.usage !== undefined) {
              persistSessionUsage(
                agent.effectiveSessionId,
                agent.workingDirectory,
                {
                  inputTokens: resultMsg.usage.input_tokens ?? 0,
                  outputTokens: resultMsg.usage.output_tokens ?? 0,
                  cacheReadInputTokens: resultMsg.usage.cache_read_input_tokens,
                  cacheCreationInputTokens: resultMsg.usage.cache_creation_input_tokens,
                },
                resultMsg.total_cost_usd
              );
            }

            // Reset for next turn - the next turn will get a new message ID from the SDK
            textWasStreamed = false;
            this.currentTurnId.delete(sessionId);
          }

          // Check for pending rewind after processing each message
          // This must be called from INSIDE the for-await loop on the SAME Query object
          if (state.pendingRewindCheckpointId) {
            const checkpointId = state.pendingRewindCheckpointId;
            state.pendingRewindCheckpointId = undefined;

            logger.info(
              { sessionId, checkpointId },
              'Executing pending rewind inside message loop'
            );
            try {
              await agent.rewindFilesInLoop(checkpointId);
              logger.info({ sessionId, checkpointId }, 'Rewind completed from inside loop');
            } catch (rewindErr) {
              logger.error(
                { sessionId, checkpointId, err: rewindErr },
                'Rewind failed inside loop'
              );
            }
            break; // Exit loop after rewind as per SDK pattern
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
    // Flush any pending text events for this session before cleanup
    // This prevents memory leak from orphaned buffer entries
    this.textBatcher.flushSession(sessionId);
    // Clear accumulated length tracking for this session (prevents memory leak)
    this.textBatcher.clearSessionAccumulatedLengths(sessionId);

    const consumer = this.sessionConsumers.get(sessionId);
    if (consumer) {
      consumer.cancel();
      this.sessionConsumers.delete(sessionId);
    }

    const unsubscribeBrowserTools = this.browserToolUnsubscribers.get(sessionId);
    if (unsubscribeBrowserTools) {
      unsubscribeBrowserTools();
      this.browserToolUnsubscribers.delete(sessionId);
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
    this.currentTurnId.delete(sessionId);
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

    // Flush any pending text events before interrupting
    this.textBatcher.flushSession(sessionId);

    // Call SDK interrupt - this signals the CLI subprocess to stop
    // The consumer loop continues processing messages until the SDK naturally stops
    // We don't set cancelled=true because that would break the session for future messages
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
  async sendMessage(
    message: string,
    sessionId: string,
    attachments?: AttachmentContentBlock[]
  ): Promise<void> {
    const agent = this.activeSessions.get(sessionId);
    if (agent === undefined) {
      throw new Error(`Session ${sessionId} not found. Call createSession() first.`);
    }

    if (!agent.isSessionReady()) {
      throw new Error(`Session ${sessionId} is not ready.`);
    }

    // Layer 2: Pre-send credential re-validation — MUST block message send.
    // If credentials are expired, surface a clear auth error instead of
    // letting the message fail with a cryptic SDK error. (Code review: Opus cycle 3, #1)
    const hasCredentials = await agent.refreshCredentials();
    if (!hasCredentials) {
      this._onAuthError.fire({
        sessionId,
        category: 'NO_CREDENTIALS',
        message: 'No valid credentials available. Please re-authenticate with "claude login".',
        recoverable: true,
      });
      return;
    }

    // Track turn start time
    this.turnStartTimes.set(sessionId, Date.now());

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
   * Handle browser tool response from frontend
   */
  handleBrowserToolResponse(sessionId: string, response: McpToolResponse): void {
    const agent = this.activeSessions.get(sessionId);
    if (!agent) {
      throw new Error(`Session ${sessionId} not found`);
    }
    agent.handleBrowserToolResponse(response);
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
   * Rewind files to a specific checkpoint.
   * This restores all files modified by Write, Edit, NotebookEdit tools
   * to their state at the given checkpoint UUID.
   *
   * This method calls the agent's rewindFiles() directly, which:
   * 1. Creates a new query that resumes the session
   * 2. Calls rewindFiles on that resumed query
   *
   * @param sessionId - The session ID
   * @param checkpointId - The UUID of the checkpoint (from a user message)
   */
  async rewindFiles(sessionId: string, checkpointId: string): Promise<void> {
    logger.info({ sessionId, checkpointId }, 'Rewinding files to checkpoint');

    const agent = this.activeSessions.get(sessionId);
    if (agent === undefined) {
      logger.error({ sessionId }, 'Session not found for rewindFiles');
      throw new Error(`Session ${sessionId} not found`);
    }

    // Call the agent's rewindFiles method directly
    // This creates a new query that resumes the session and calls rewindFiles
    try {
      await agent.rewindFiles(checkpointId);
      logger.info({ sessionId, checkpointId }, 'Files rewound successfully');
    } catch (err) {
      logger.error({ sessionId, checkpointId, err }, 'File rewind failed');
      throw err;
    }
  }

  /**
   * Fork an SDK session at a specific message point by truncating the JSONL file.
   *
   * This is the DIRECT EDIT approach - instead of relying on SDK's resumeSessionAt
   * (which has limitations around user vs assistant message boundaries), we directly
   * truncate the JSONL file to include only messages up to the target UUID.
   *
   * Flow:
   * 1. Get the current SDK session ID and working directory
   * 2. Save session preferences (model, thinking mode, etc.)
   * 3. TRUNCATE the JSONL file at the target message (removes all subsequent messages)
   * 4. Delete the current session (clears SDK memory)
   * 5. Create new session that resumes from the truncated JSONL
   * 6. SDK reads the truncated file - Claude sees exactly what we want
   *
   * @param sessionId - The Orbit session ID
   * @param atMessageUuid - The message UUID to truncate AFTER (this message is INCLUDED)
   * @returns The new SDK session ID
   */
  async forkSessionAt(sessionId: string, atMessageUuid: string): Promise<string> {
    logger.info({ sessionId, atMessageUuid }, 'Forking session at specific message point');

    const agent = this.activeSessions.get(sessionId);
    if (!agent) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const sdkSessionId = agent.getCurrentSessionId();
    if (!sdkSessionId) {
      throw new Error(`No SDK session ID available for session ${sessionId}`);
    }

    // Save session preferences before deleting
    const savedPrefs = this.modePreferences.get(sessionId) ?? {};
    const savedCwd = agent.workingDirectory;

    logger.info(
      { sessionId, sdkSessionId, atMessageUuid, savedPrefs, savedCwd },
      'Saving session state before fork'
    );

    // CRITICAL: Truncate the JSONL file BEFORE deleting the session
    // This removes all messages after the target UUID, so when the SDK
    // resumes, it only sees messages up to and including the target.
    const truncateResult = truncateSessionJsonl(sdkSessionId, savedCwd, atMessageUuid);
    logger.info({ sdkSessionId, atMessageUuid, ...truncateResult }, 'JSONL truncated for rewind');

    // CRITICAL: Copy the truncated JSONL to a NEW session ID
    // The SDK caches state about "where to continue from" for each session ID.
    // If we resume the same session ID after truncation, the SDK tries to continue
    // from a cached point that no longer exists, generating empty placeholder messages.
    // By copying to a NEW session ID, the SDK has no cached state and reads the
    // truncated JSONL fresh.
    const newSdkSessionId = randomUUID();
    const copyResult = copySessionJsonl(sdkSessionId, newSdkSessionId, savedCwd);
    logger.info(
      { oldSdkSessionId: sdkSessionId, newSdkSessionId, copyResult },
      'Copied truncated JSONL to new session ID'
    );

    // Delete the current session (clears SDK memory)
    await this.deleteSession(sessionId);

    // Create new session that resumes from the COPIED JSONL with NEW session ID
    //
    // IMPORTANT: We use a NEW session ID (not the old one) because:
    // 1. The SDK caches continuation state per session ID (outside the JSONL)
    // 2. Resuming the old session ID after truncation causes empty message generation
    // 3. A fresh session ID has no cached state, so the SDK reads the file cleanly
    await this.createSession(sessionId, {
      resumeSessionId: newSdkSessionId,
      // NO resumeSessionAt - file is already truncated
      // NO forkSession - we've done the "fork" by truncating and copying
      cwd: savedCwd,
      thinkingEnabled: savedPrefs.thinkingEnabled,
      maxThinkingTokens: savedPrefs.maxThinkingTokens,
      planEnabled: savedPrefs.planEnabled,
      acceptEnabled: savedPrefs.acceptEnabled,
      model: savedPrefs.model,
    });

    // Get the new SDK session ID (will be the one we passed)
    const newAgent = this.activeSessions.get(sessionId);
    const finalSdkSessionId = newAgent?.getCurrentSessionId();

    logger.info(
      {
        sessionId,
        oldSdkSessionId: sdkSessionId,
        newSdkSessionId,
        finalSdkSessionId,
        atMessageUuid,
        linesRemoved: truncateResult.linesRemoved,
      },
      'Session forked with new ID - Claude now has context up to target message'
    );

    return finalSdkSessionId ?? newSdkSessionId;
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
    await this.createSession(newSessionId, {
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
  async generateAgentDefinition(
    description: string
  ): Promise<z.infer<typeof GeneratedAgentSchema>> {
    // Convert Zod schema to JSON Schema for structured output
    const outputFormat = {
      type: 'json_schema' as const,
      schema: z.toJSONSchema(GeneratedAgentSchema),
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
      outputFormat,
      model: 'sonnet',
    });

    await agent.startSession();
    agent.queueMessage(prompt);

    // Consume responses until we get a result with structured output
    let rawOutput: unknown = undefined;

    for await (const rawMessage of agent.receiveResponse()) {
      const sdkMessage = rawMessage as { type: string; structured_output?: unknown };
      if (sdkMessage.type === 'result') {
        if (sdkMessage.structured_output !== undefined && sdkMessage.structured_output !== null) {
          rawOutput = sdkMessage.structured_output;
        }
        break;
      }
    }

    await agent.stopSession();

    if (rawOutput === undefined) {
      throw new Error('Failed to generate agent definition - no structured output received');
    }

    // Validate with Zod schema for type-safe result
    const parseResult = GeneratedAgentSchema.safeParse(rawOutput);
    if (!parseResult.success) {
      throw new Error(
        `Generated agent definition is invalid: ${formatZodError(parseResult.error)}`
      );
    }

    return parseResult.data;
  }

  /**
   * Generate a command definition from a natural language description using AI
   */
  async generateCommandDefinition(description: string): Promise<
    z.infer<typeof GeneratedCommandSchema> & {
      scope: 'builtin' | 'default' | 'project' | 'personal';
      readonly?: boolean;
    }
  > {
    // Convert Zod schema to JSON Schema for structured output
    const outputFormat = {
      type: 'json_schema' as const,
      schema: z.toJSONSchema(GeneratedCommandSchema),
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
      outputFormat,
      model: 'sonnet',
    });

    await agent.startSession();
    agent.queueMessage(prompt);

    // Consume responses until we get a result with structured output
    let rawOutput: unknown = undefined;

    for await (const rawMessage of agent.receiveResponse()) {
      const sdkMessage = rawMessage as { type: string; structured_output?: unknown };
      if (sdkMessage.type === 'result') {
        if (sdkMessage.structured_output !== undefined && sdkMessage.structured_output !== null) {
          rawOutput = sdkMessage.structured_output;
        }
        break;
      }
    }

    await agent.stopSession();

    if (rawOutput === undefined) {
      throw new Error('Failed to generate command definition - no structured output received');
    }

    // Validate with Zod schema for type-safe result
    const parseResult = GeneratedCommandSchema.safeParse(rawOutput);
    if (!parseResult.success) {
      throw new Error(
        `Generated command definition is invalid: ${formatZodError(parseResult.error)}`
      );
    }

    // Add default scope and readonly for user-generated commands
    return {
      ...parseResult.data,
      scope: 'project',
      readonly: false,
    };
  }

  /**
   * Get content loss metrics for monitoring.
   * These metrics track data loss due to SDK integration issues.
   * Non-zero values indicate bugs that should be investigated.
   *
   * @returns Snapshot of current content loss metrics
   */
  getContentLossMetrics(): Readonly<ContentLossMetrics> {
    return { ...this.contentLossMetrics };
  }

  /**
   * Check if any content loss has occurred.
   * Useful for quick health checks without retrieving full metrics.
   */
  hasContentLoss(): boolean {
    return (
      this.contentLossMetrics.streamingChunksLost > 0 || this.contentLossMetrics.textBlocksLost > 0
    );
  }

  /**
   * Dispose the session manager
   */
  override dispose(): void {
    // Log content loss metrics on shutdown if any loss occurred
    if (this.hasContentLoss()) {
      logger.warn(
        { metrics: this.contentLossMetrics },
        'Content loss detected during session manager lifetime - this indicates SDK integration issues'
      );
    }

    // Flush and destroy text batcher
    this.textBatcher.destroy();

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

    for (const [, unsubscribe] of this.browserToolUnsubscribers.entries()) {
      unsubscribe();
    }
    this.browserToolUnsubscribers.clear();

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
