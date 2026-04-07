/**
 * Tool Store — Tool executions, permissions, usage tracking, model/mode selection.
 *
 * ⚠️  STALE get() WARNING — persist(immer(...)) middleware gotcha
 * ──────────────────────────────────────────────────────────────
 * The `get()` function captured inside `immer((set, get) => ...)` can return
 * STALE state after a synchronous `set()` call. This is specific to the
 * `persist(immer(...))` middleware stack — it does NOT happen with plain
 * `create((set, get) => ...)`.
 *
 * What happens:
 *   1. `startTool()` calls `set()` with immer → Zustand commits new state
 *   2. Zustand selector hooks (useActiveTools, etc.) immediately see the update
 *   3. BUT `get()` inside the store closure may still return pre-mutation state
 *
 * Consequence: Any store function that uses `get()` and feeds rendering may
 * return stale data. `getToolsForMessage()` was the original victim — it
 * returned empty arrays during active tool execution because `get().activeTools`
 * was behind, causing tool widgets to not appear until completion.
 *
 * Rule: For rendering hot paths, use Zustand selector hooks in components
 * and compute derived state there (see ChatMessages + deduplicateAndSortTools).
 * Reserve `get()` for non-rendering logic (usage calculations, etc.).
 */
import { createLogger } from '@orbit/common/lib';
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

import type { EffortLevel, InputMode, Model, ThinkingMode } from '@/types/protocol';

const logger = createLogger('ToolStore');

// ============================================
// Constants
// ============================================

/** Version for persisted state - increment when schema changes to trigger migrations */
const STORE_VERSION = 2;

/**
 * Maximum tools to persist in localStorage to prevent storage bloat.
 * localStorage has ~5MB limit. Each tool is ~500 bytes, so 500 tools = ~250KB.
 * This leaves plenty of headroom while supporting power users with long sessions.
 */
const MAX_PERSISTED_TOOLS = 500;

/**
 * Buffer above MAX_PERSISTED_TOOLS before trimming. Without this, every
 * completeTool call past 500 triggers an O(n) array slice. With a buffer
 * of 50, we only trim once per 50 completions. (Code review: Opus cycle 2, issue #7)
 */
const TRIM_BUFFER = 50;

/**
 * Default thinking budget for adaptive thinking models (Opus 4.6, Sonnet 4.6).
 * Used at session creation to ensure thinking works on the first message,
 * before effort:set can update it. Subsequent effort:set calls adjust
 * the budget mid-session.
 */
export const ADAPTIVE_THINKING_DEFAULT_BUDGET = 32768;

/**
 * Thinking mode → token budget mapping for non-adaptive models.
 * Used at session creation and in thinking:set IPC handler.
 */
export const THINKING_MODE_BUDGET: Record<ThinkingMode, number | undefined> = {
  off: undefined,
  think: 4096,
  hard: 10240,
  ultra: 32768,
};

/**
 * Opus 4.6 and Sonnet 4.6 use adaptive thinking (effort-based), not extended thinking (toggle-based).
 * For adaptive models, thinking is always enabled via a budget — the effort level
 * controls the budget size. The thinking toggle UI is hidden and `thinking:set`
 * messages are skipped to prevent racing with effort:set.
 * Only Haiku 4.5 still uses extended thinking (off/think/hard/ultra).
 */
export const isAdaptiveThinkingModel = (model: Model): boolean =>
  model === 'claude-opus-4-6' || model === 'claude-sonnet-4-6';

/**
 * Maximum size for toolInput values to persist (in characters).
 * Larger values are truncated to prevent localStorage bloat and
 * avoid persisting potentially sensitive data like file contents.
 */
const MAX_INPUT_VALUE_LENGTH = 200;

// ============================================
// Zod Schemas for localStorage Validation
// ============================================

/** Schema for validating persisted tool executions from localStorage */
const StoredToolExecutionSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  toolName: z.string(),
  toolInput: z.record(z.string(), z.unknown()), // Zod 4 requires key schema
  toolOutput: z.unknown().optional(),
  status: z.enum(['pending', 'running', 'success', 'error']),
  startedAt: z.number(),
  completedAt: z.number().optional(),
  success: z.boolean().optional(),
  contentOffset: z.number().optional(),
  ordinal: z.number().optional(),
});

/** Schema for validating array of persisted tools */
const StoredToolExecutionArraySchema = z.array(StoredToolExecutionSchema);

/** Type inferred from Zod schema (has T | undefined for optional fields) */
type StoredToolExecution = z.infer<typeof StoredToolExecutionSchema>;

/**
 * Transform Zod-validated data to ToolExecution interface.
 *
 * Zod with exactOptionalPropertyTypes produces `T | undefined` for optional fields,
 * but ToolExecution uses optional properties (present or absent). This function
 * performs a safe transformation that strips undefined values.
 */
function toToolExecution(stored: StoredToolExecution): ToolExecution {
  const tool: ToolExecution = {
    id: stored.id,
    messageId: stored.messageId,
    toolName: stored.toolName,
    toolInput: stored.toolInput,
    status: stored.status,
    startedAt: stored.startedAt,
  };

  // Only add optional fields if they have values (avoids undefined in object)
  if (stored.toolOutput !== undefined) {
    tool.toolOutput = stored.toolOutput;
  }
  if (stored.completedAt !== undefined) {
    tool.completedAt = stored.completedAt;
  }
  if (stored.success !== undefined) {
    tool.success = stored.success;
  }
  if (stored.contentOffset !== undefined) {
    tool.contentOffset = stored.contentOffset;
  }
  if (stored.ordinal !== undefined) {
    tool.ordinal = stored.ordinal;
  }

  return tool;
}

/**
 * Sanitize a tool execution for localStorage persistence.
 *
 * Security: Removes potentially sensitive data:
 * - toolOutput: May contain file contents, API responses, credentials
 * - Large toolInput values: Truncated to prevent storing full file paths/contents
 *
 * The UI only needs tool metadata for display; actual results are restored
 * from the backend when loading a conversation.
 */
function sanitizeToolForPersistence(tool: ToolExecution): ToolExecution {
  // Sanitize toolInput - truncate large values
  const sanitizedInput: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(tool.toolInput)) {
    if (typeof value === 'string' && value.length > MAX_INPUT_VALUE_LENGTH) {
      // Truncate long strings and indicate they were truncated
      sanitizedInput[key] = `${value.slice(0, MAX_INPUT_VALUE_LENGTH)}... [truncated]`;
    } else {
      sanitizedInput[key] = value;
    }
  }

  // Build sanitized tool with only defined optional fields
  // Don't persist toolOutput - may contain sensitive data (file contents, API responses)
  const sanitized: ToolExecution = {
    id: tool.id,
    messageId: tool.messageId,
    toolName: tool.toolName,
    toolInput: sanitizedInput,
    status: tool.status,
    startedAt: tool.startedAt,
  };

  // Only add optional fields if they have values (exactOptionalPropertyTypes compliance)
  if (tool.completedAt !== undefined) {
    sanitized.completedAt = tool.completedAt;
  }
  if (tool.success !== undefined) {
    sanitized.success = tool.success;
  }
  if (tool.contentOffset !== undefined) {
    sanitized.contentOffset = tool.contentOffset;
  }
  if (tool.ordinal !== undefined) {
    sanitized.ordinal = tool.ordinal;
  }

  return sanitized;
}

// SDK Usage data (matches agent:complete schema)
export interface UsageData {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  totalCostUsd: number;
}

export interface SessionMcpServer {
  name: string;
  status: string;
}

export type SessionMetadataState = 'live' | 'restored';

interface ContextUsageTotals {
  inputTokens: number;
  cacheReadInputTokens?: number | undefined;
  cacheCreationInputTokens?: number | undefined;
}

export function getContextUsedTokens(usage: ContextUsageTotals): number {
  return (
    usage.inputTokens + (usage.cacheReadInputTokens ?? 0) + (usage.cacheCreationInputTokens ?? 0)
  );
}

// Context window sizes by model
const MODEL_CONTEXT_WINDOWS: Record<Model, number> = {
  haiku: 200_000,
  'claude-sonnet-4-6': 200_000,
  'claude-opus-4-6': 1_000_000,
};

function resolveMaxTokens(state: { currentContextWindow: number | null; model: Model }): number {
  return state.currentContextWindow ?? MODEL_CONTEXT_WINDOWS[state.model];
}

// Tool status
export type ToolStatus = 'pending' | 'running' | 'success' | 'error';

// Tool execution record
export interface ToolExecution {
  id: string;
  messageId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolOutput?: unknown;
  status: ToolStatus;
  startedAt: number;
  completedAt?: number;
  success?: boolean;
  // Content offset - where in the message content this tool was invoked
  contentOffset?: number | undefined;
  ordinal?: number | undefined;
  // Session this tool belongs to — prevents cross-session cache contamination
  // when tools arrive for a background streaming session while viewing another.
  sessionId?: string | undefined;
}

// Permission request
export interface PermissionRequest {
  requestId: string;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  createdAt: number;
  patterns?: string[] | undefined;
  supportsAlwaysAllow?: boolean | undefined;
}

// Cached session data (usage + tools)
interface CachedSessionData {
  usage: UsageData;
  processedIds: string[];
  activeTools: Record<string, ToolExecution>;
  completedTools: ToolExecution[];
  contextWindow?: number | undefined;
  sessionModel?: string | undefined;
  sessionTools?: string[] | undefined;
  sessionMcpServers?: SessionMcpServer[] | undefined;
}

// ============================================
// Session-Keyed Data Model (120fps migration)
// ============================================

/**
 * Per-session tool data bucket. The target architecture: all per-session state
 * lives here. ToolStore.sessions is Record<string, PerSessionToolData>.
 *
 * Uses string[] for processedIds (not Set) because Sets break Immer structural
 * sharing — Immer can't diff opaque Set contents, so it always marks as changed.
 */
export interface PerSessionToolData {
  activeTools: Record<string, ToolExecution>;
  completedTools: ToolExecution[];
  usage: UsageData;
  processedIds: string[];
  contextWindow: number | null;
  sessionModel: string | null;
  sessionTools: string[] | null;
  sessionMcpServers: SessionMcpServer[] | null;
  metadataState: SessionMetadataState | null;
  toolRevision: number;
}

function createEmptySessionToolData(): PerSessionToolData {
  return {
    activeTools: {},
    completedTools: [],
    usage: { ...initialUsage },
    processedIds: [],
    contextWindow: null,
    sessionModel: null,
    sessionTools: null,
    sessionMcpServers: null,
    metadataState: null,
    toolRevision: 0,
  };
}

/**
 * Ensure a session bucket exists, creating an empty one if needed.
 * Called inside Immer set() callbacks — mutates the draft directly.
 */
function ensureSessionBucket(
  sessions: Record<string, PerSessionToolData>,
  sessionId: string
): PerSessionToolData {
  let bucket = sessions[sessionId];
  if (!bucket) {
    bucket = createEmptySessionToolData();
    sessions[sessionId] = bucket;
  }
  return bucket;
}

export interface ToolState {
  // Input mode (synced with extension)
  inputMode: InputMode;

  // Thinking mode (off, think, hard, ultra)
  thinkingMode: ThinkingMode;

  // Effort level for Opus 4.6 adaptive thinking (low, medium, high, max)
  effortLevel: EffortLevel;

  // Model (haiku, sonnet, opus)
  model: Model;

  // Active tool executions (keyed by tool ID)
  activeTools: Record<string, ToolExecution>;

  // Completed tool executions (for history/display)
  completedTools: ToolExecution[];

  // Pending permission requests
  pendingPermissions: PermissionRequest[];

  // Current session ID for usage tracking
  currentSessionId: string | null;

  // Last known context occupancy (per-turn usage) plus cumulative cost.
  sessionUsage: UsageData;

  // Tracks message IDs restored from persisted conversation usage.
  // Kept so session reloads can preserve which assistant turns contributed usage.
  processedMessageIds: Set<string>;

  // Cache of session data per session (plain object for immer compatibility)
  sessionCache: Record<string, CachedSessionData>;

  // Per-session tool revision. Bumped on render-affecting tool mutations,
  // regardless of whether a tool currently lives in top-level state or sessionCache.
  toolRevisions: Record<string, number>;

  // Session-specific context window resolved from SDK metadata
  currentContextWindow: number | null;

  // Session metadata captured from system:init
  sessionModel: string | null;
  sessionTools: string[] | null;
  sessionMcpServers: SessionMcpServer[] | null;
  sessionMetadataState: SessionMetadataState | null;

  // ── Session-keyed data (120fps migration) ─────────────────────────────
  // Shadow structure: mirrors flat fields above, keyed by session ID.
  // During migration, both flat fields and sessions are written.
  // After migration completes, flat fields are removed.
  sessions: Record<string, PerSessionToolData>;
  activeSessionId: string | null;

  // Actions
  setInputMode: (mode: InputMode) => void;
  setThinkingMode: (mode: ThinkingMode) => void;
  setEffortLevel: (level: EffortLevel) => void;
  setModel: (model: Model) => void;

  // Tool lifecycle
  startTool: (
    id: string,
    messageId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    contentOffset?: number,
    sessionId?: string,
    ordinal?: number
  ) => void;
  completeTool: (id: string, toolOutput: unknown, success: boolean, sessionId?: string) => void;
  updateToolInput: (id: string, toolInput: Record<string, unknown>) => void;

  // Permission management
  addPermissionRequest: (request: PermissionRequest) => void;
  removePermissionRequest: (requestId: string) => void;
  clearPermissions: () => void;
  /** Merge answers into the active AskUserQuestion tool's toolInput */
  mergeToolInputAnswers: (toolName: string, answers: Record<string, string>) => void;

  // Usage tracking
  setContextWindow: (sessionId: string, contextWindow: number) => void;
  setSessionMetadata: (
    sessionId: string,
    model: string | null,
    tools: string[] | null,
    mcpServers: SessionMcpServer[] | null
  ) => void;
  addUsage: (
    sessionId: string,
    messageId: string,
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_read_input_tokens?: number | undefined;
      cache_creation_input_tokens?: number | undefined;
    },
    totalCostUsd?: number
  ) => void;
  resetUsage: () => void;
  switchSession: (newSessionId: string) => void;
  /** @legacy Still needed for forks and pre-custom-sessionId sessions. New sessions skip remap. */
  remapSession: (oldSessionId: string, newSessionId: string) => void;
  restoreSessionUsage: (sessionId: string, usage: UsageData, processedIds?: string[]) => void;

  // Computed values
  getContextPercentage: () => number;
  getMaxTokens: () => number;
  getUsedTokens: () => number;

  // Get tools for a specific message
  getToolsForMessage: (messageId: string) => ToolExecution[];

  // Restore tools from persisted data (for conversation reload)
  restoreToolsForMessage: (
    messageId: string,
    tools: {
      id: string;
      name: string;
      input: Record<string, unknown>;
      output?: string | undefined;
      success: boolean;
      contentOffset?: number | undefined;
      ordinal?: number | undefined;
    }[],
    sessionId?: string
  ) => void;

  // Cleanup tools for a deleted session
  clearSessionTools: (sessionId: string) => void;

  // Reset
  reset: () => void;
}

/**
 * Pure function: deduplicate and sort tools from active + completed lists.
 *
 * Exported so that components can compute tools-for-message from selector
 * values directly, bypassing the store's internal get() which can lag
 * behind selector state in the persist(immer(...)) middleware stack.
 */
export function deduplicateAndSortTools(
  active: ToolExecution[],
  completed: ToolExecution[]
): ToolExecution[] {
  if (active.length === 0 && completed.length === 0) {
    return [];
  }

  // Deduplicate by tool ID (keep latest version of each).
  // Precedence: completed always wins over active for same ID (a completed
  // tool is always "more recent" than an active one); otherwise prefer the
  // entry with the newer startedAt timestamp.
  // (Code review: Opus cycle 1, issue #10)
  const toolMap = new Map<string, ToolExecution>();
  for (const tool of [...active, ...completed]) {
    const existing = toolMap.get(tool.id);
    if (
      !existing ||
      tool.startedAt > existing.startedAt ||
      (tool.completedAt !== undefined && existing.completedAt === undefined)
    ) {
      toolMap.set(tool.id, tool);
    }
  }

  return Array.from(toolMap.values()).sort((a, b) => a.startedAt - b.startedAt);
}

const initialUsage: UsageData = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  totalCostUsd: 0,
};

function resolveToolSessionId(tool: ToolExecution, state: ToolState): string | null {
  return tool.sessionId ?? state.currentSessionId;
}

function bumpToolRevision(state: ToolState, sessionId: string | null | undefined): void {
  if (!sessionId) {
    return;
  }

  state.toolRevisions[sessionId] = (state.toolRevisions[sessionId] ?? 0) + 1;
}

export const useToolStore = create<ToolState>()(
  persist(
    immer((set, get) => ({
      inputMode: 'default',
      thinkingMode: 'ultra',
      effortLevel: 'max',
      model: 'claude-sonnet-4-6',
      activeTools: {},
      completedTools: [],
      pendingPermissions: [],
      currentSessionId: null,
      sessionUsage: { ...initialUsage },
      processedMessageIds: new Set<string>(),
      sessionCache: {},
      toolRevisions: {},
      currentContextWindow: null,
      sessionModel: null,
      sessionTools: null,
      sessionMcpServers: null,
      sessionMetadataState: null,

      // Session-keyed data (120fps migration — shadow structure)
      sessions: {},
      activeSessionId: null,

      setInputMode: (mode: InputMode) => {
        set((state) => {
          state.inputMode = mode;
        });
      },

      setThinkingMode: (mode: ThinkingMode) => {
        set((state) => {
          state.thinkingMode = mode;
        });
      },

      setEffortLevel: (level: EffortLevel) => {
        set((state) => {
          state.effortLevel = level;
        });
      },

      setModel: (model: Model) => {
        set((state) => {
          state.model = model;
        });
      },

      startTool: (
        id: string,
        messageId: string,
        toolName: string,
        toolInput: Record<string, unknown>,
        contentOffset?: number,
        sessionId?: string,
        ordinal?: number
      ) => {
        logger.debug(`Tool started: ${toolName}`, { id, messageId });
        set((state) => {
          const tool: ToolExecution = {
            id,
            messageId,
            toolName,
            toolInput,
            status: 'running',
            startedAt: Date.now(),
            contentOffset,
            ordinal,
            sessionId,
          };
          state.activeTools[id] = tool;

          // Shadow write to session-keyed structure
          const sid = sessionId ?? state.currentSessionId;
          if (sid) {
            const bucket = ensureSessionBucket(state.sessions, sid);
            bucket.activeTools[id] = tool;
            bucket.toolRevision += 1;
          }
        });
      },

      completeTool: (id: string, toolOutput: unknown, success: boolean, sessionId?: string) => {
        if (!success) {
          logger.warn(`Tool failed: ${id}`);
        } else {
          logger.debug(`Tool completed: ${id}`);
        }
        set((state) => {
          const tool = state.activeTools[id];
          if (tool) {
            tool.status = success ? 'success' : 'error';
            tool.toolOutput = toolOutput;
            tool.completedAt = Date.now();
            tool.success = success;
            // Resolve session: explicit param > tool.sessionId > currentSessionId
            const resolvedSid = sessionId ?? resolveToolSessionId(tool, state);
            bumpToolRevision(state, resolvedSid);

            // Move to completed
            const completedCopy = { ...tool };
            state.completedTools.push(completedCopy);

            // Cap in-memory array to prevent unbounded growth in long sessions.
            // Uses a buffer to avoid O(n) slice on every completion past the limit.
            // Trims at MAX + BUFFER, keeping MAX items. (Code review: Opus cycle 2, issue #7)
            if (state.completedTools.length > MAX_PERSISTED_TOOLS + TRIM_BUFFER) {
              state.completedTools = state.completedTools.slice(-MAX_PERSISTED_TOOLS);
            }

            // Remove from active tools (Reflect.deleteProperty avoids eslint no-dynamic-delete)
            Reflect.deleteProperty(state.activeTools, id);

            // Shadow write to session-keyed structure
            if (resolvedSid) {
              const bucket = state.sessions[resolvedSid];
              if (bucket) {
                Reflect.deleteProperty(bucket.activeTools, id);
                bucket.completedTools.push(completedCopy);
                bucket.toolRevision += 1;
                if (bucket.completedTools.length > MAX_PERSISTED_TOOLS + TRIM_BUFFER) {
                  bucket.completedTools = bucket.completedTools.slice(-MAX_PERSISTED_TOOLS);
                }
              }
            }
          }
        });
      },

      updateToolInput: (id: string, toolInput: Record<string, unknown>) => {
        set((state) => {
          const tool = state.activeTools[id];
          if (!tool) {
            return;
          }

          // getToolInput() rebuilds a fresh object on each adapter recompute, so
          // compare the serialized payload before persisting and rerendering.
          if (JSON.stringify(tool.toolInput) === JSON.stringify(toolInput)) {
            return;
          }

          const updated = { ...tool, toolInput };
          state.activeTools[id] = updated;
          bumpToolRevision(state, resolveToolSessionId(tool, state));

          // Shadow write to session-keyed structure
          const sid = resolveToolSessionId(tool, state);
          if (sid) {
            const bucket = state.sessions[sid];
            if (bucket) {
              bucket.activeTools[id] = updated;
              bucket.toolRevision += 1;
            }
          }
        });
      },

      addPermissionRequest: (request: PermissionRequest) => {
        set((state) => {
          // Deduplicate by requestId - prevent duplicate permission modals
          const exists = state.pendingPermissions.some((p) => p.requestId === request.requestId);
          if (!exists) {
            state.pendingPermissions.push(request);
          }
        });
      },

      removePermissionRequest: (requestId: string) => {
        set((state) => {
          state.pendingPermissions = state.pendingPermissions.filter(
            (p) => p.requestId !== requestId
          );
        });
      },

      clearPermissions: () => {
        set((state) => {
          state.pendingPermissions = [];
        });
      },

      mergeToolInputAnswers: (toolName: string, answers: Record<string, string>) => {
        set((state) => {
          // Find the active tool by name (there should only be one AskUserQuestion at a time)
          const tool = Object.values(state.activeTools).find(
            (t) => t.toolName.toLowerCase() === toolName.toLowerCase()
          );
          if (tool) {
            tool.toolInput = { ...tool.toolInput, answers };
            bumpToolRevision(state, resolveToolSessionId(tool, state));

            // Shadow write to session-keyed structure
            const sid = resolveToolSessionId(tool, state);
            if (sid) {
              const bucket = state.sessions[sid];
              const shadowTool = bucket?.activeTools[tool.id];
              if (shadowTool) {
                shadowTool.toolInput = { ...shadowTool.toolInput, answers };
                bucket.toolRevision += 1;
              }
            }
          }
        });
      },

      setContextWindow: (sessionId: string, contextWindow: number) => {
        if (contextWindow <= 0) {
          return;
        }

        set((state) => {
          const cached = state.sessionCache[sessionId];
          if (cached) {
            state.sessionCache[sessionId] = { ...cached, contextWindow };
          } else {
            state.sessionCache[sessionId] = {
              usage: { ...initialUsage },
              processedIds: [],
              activeTools: {},
              completedTools: [],
              contextWindow,
            };
          }

          if (state.currentSessionId === sessionId) {
            state.currentContextWindow = contextWindow;
          }

          // Shadow write to session-keyed structure
          ensureSessionBucket(state.sessions, sessionId).contextWindow = contextWindow;
        });
      },

      setSessionMetadata: (
        sessionId: string,
        model: string | null,
        tools: string[] | null,
        mcpServers: SessionMcpServer[] | null
      ) => {
        set((state) => {
          const cached = state.sessionCache[sessionId];
          state.sessionCache[sessionId] = {
            usage: cached?.usage ?? { ...initialUsage },
            processedIds: cached?.processedIds ?? [],
            activeTools: cached?.activeTools ?? {},
            completedTools: cached?.completedTools ?? [],
            contextWindow: cached?.contextWindow,
            sessionModel: model ?? undefined,
            sessionTools: tools !== null ? [...tools] : undefined,
            sessionMcpServers: mcpServers !== null ? [...mcpServers] : undefined,
          };

          if (state.currentSessionId === sessionId) {
            state.sessionModel = model;
            state.sessionTools = tools !== null ? [...tools] : null;
            state.sessionMcpServers = mcpServers !== null ? [...mcpServers] : null;
            state.sessionMetadataState = 'live';
          }

          // Shadow write to session-keyed structure
          const bucket = ensureSessionBucket(state.sessions, sessionId);
          bucket.sessionModel = model;
          bucket.sessionTools = tools !== null ? [...tools] : null;
          bucket.sessionMcpServers = mcpServers !== null ? [...mcpServers] : null;
          if (state.currentSessionId === sessionId) {
            bucket.metadataState = 'live';
          }
        });
      },

      addUsage: (
        sessionId: string,
        _messageId: string,
        usage: {
          input_tokens: number;
          output_tokens: number;
          cache_read_input_tokens?: number | undefined;
          cache_creation_input_tokens?: number | undefined;
        },
        totalCostUsd?: number
      ) => {
        set((state) => {
          const nextUsage: UsageData = {
            inputTokens: usage.input_tokens,
            outputTokens: usage.output_tokens,
            cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
            cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
            totalCostUsd: totalCostUsd ?? 0,
          };

          const cached = state.sessionCache[sessionId];
          if (cached) {
            state.sessionCache[sessionId] = { ...cached, usage: nextUsage };
          } else if (state.currentSessionId !== sessionId) {
            state.sessionCache[sessionId] = {
              usage: nextUsage,
              processedIds: [],
              activeTools: {},
              completedTools: [],
            };
          }

          if (state.currentSessionId === sessionId) {
            state.sessionUsage = nextUsage;
          }

          // Shadow write to session-keyed structure
          ensureSessionBucket(state.sessions, sessionId).usage = nextUsage;
        });
      },

      resetUsage: () => {
        set((state) => {
          state.sessionUsage = { ...initialUsage };
          state.processedMessageIds = new Set<string>();
          state.currentContextWindow = null;
          state.sessionModel = null;
          state.sessionTools = null;
          state.sessionMcpServers = null;
          state.sessionMetadataState = null;

          if (state.currentSessionId) {
            const cached = state.sessionCache[state.currentSessionId];
            if (cached) {
              state.sessionCache[state.currentSessionId] = {
                ...cached,
                usage: { ...initialUsage },
                processedIds: [],
                contextWindow: undefined,
                sessionModel: undefined,
                sessionTools: undefined,
                sessionMcpServers: undefined,
              };
            }

            // Shadow write to session-keyed structure
            const bucket = state.sessions[state.currentSessionId];
            if (bucket) {
              bucket.usage = { ...initialUsage };
              bucket.processedIds = [];
              bucket.contextWindow = null;
              bucket.sessionModel = null;
              bucket.sessionTools = null;
              bucket.sessionMcpServers = null;
              bucket.metadataState = null;
            }
          }
        });
      },

      switchSession: (newSessionId: string) => {
        // Fast path: already on this session
        if (get().activeSessionId === newSessionId) return;

        set((state) => {
          // Ensure a bucket exists for the target session
          const bucket = ensureSessionBucket(state.sessions, newSessionId);

          // Update session pointers (O(1))
          state.activeSessionId = newSessionId;
          state.currentSessionId = newSessionId;

          // Sync flat fields from session bucket for get()-based readers
          // (getContextPercentage, getToolsForMessage, persistence).
          // These flat fields are removed in Step 1.5.
          state.activeTools = bucket.activeTools;
          state.completedTools = bucket.completedTools;
          state.sessionUsage = bucket.usage;
          state.processedMessageIds = new Set(bucket.processedIds);
          state.currentContextWindow = bucket.contextWindow;
          state.sessionModel = bucket.sessionModel;
          state.sessionTools = bucket.sessionTools;
          state.sessionMcpServers = bucket.sessionMcpServers;
          // When restoring from a session bucket, metadata state becomes 'restored'
          // (it was originally 'live' from system:init, but is now reconstructed from cache)
          const hasMetadata =
            bucket.sessionModel !== null ||
            bucket.sessionTools !== null ||
            bucket.sessionMcpServers !== null;
          state.sessionMetadataState = hasMetadata ? 'restored' : null;
          bucket.metadataState = state.sessionMetadataState;

          // Sync sessionCache for legacy readers (removed in Step 1.5)
          state.sessionCache[newSessionId] = {
            usage: bucket.usage,
            processedIds: bucket.processedIds,
            activeTools: bucket.activeTools,
            completedTools: bucket.completedTools,
            contextWindow: bucket.contextWindow ?? undefined,
            sessionModel: bucket.sessionModel ?? undefined,
            sessionTools: bucket.sessionTools ?? undefined,
            sessionMcpServers: bucket.sessionMcpServers ?? undefined,
          };
        });
      },

      remapSession: (oldSessionId: string, newSessionId: string) => {
        set((state) => {
          // Migrate session cache from old ID to new ID during session remap
          // (e.g., Orbit temp UUID → SDK session ID from system:init).
          // This preserves usage data so it's found under the new ID when
          // the user navigates back to this conversation.
          const cached = state.sessionCache[oldSessionId];
          if (cached) {
            state.sessionCache[newSessionId] = cached;
            Reflect.deleteProperty(state.sessionCache, oldSessionId);
          }
          if (state.toolRevisions[oldSessionId] !== undefined) {
            state.toolRevisions[newSessionId] = state.toolRevisions[oldSessionId] ?? 0;
            Reflect.deleteProperty(state.toolRevisions, oldSessionId);
          }

          // If the store is currently tracking the old session, update the reference
          if (state.currentSessionId === oldSessionId) {
            state.currentSessionId = newSessionId;
          }

          // Migrate sessionId on live tool entries so switchSession's ownership
          // filter doesn't discard them as "foreign" after the remap.
          // Without this, rewind followed by system:init causes tools to vanish:
          // tools have sessionId=oldId, switchSession filters for sessionId=newId → empty.
          for (const tool of state.completedTools) {
            if (tool.sessionId === oldSessionId) {
              tool.sessionId = newSessionId;
            }
          }
          for (const tool of Object.values(state.activeTools)) {
            if (tool.sessionId === oldSessionId) {
              tool.sessionId = newSessionId;
            }
          }

          // Shadow write: rename key in sessions, rewrite tool.sessionId in the bucket
          const sessionBucket = state.sessions[oldSessionId];
          if (sessionBucket) {
            for (const tool of Object.values(sessionBucket.activeTools)) {
              if (tool.sessionId === oldSessionId) {
                tool.sessionId = newSessionId;
              }
            }
            for (const tool of sessionBucket.completedTools) {
              if (tool.sessionId === oldSessionId) {
                tool.sessionId = newSessionId;
              }
            }
            state.sessions[newSessionId] = sessionBucket;
            Reflect.deleteProperty(state.sessions, oldSessionId);
          }
          if (state.activeSessionId === oldSessionId) {
            state.activeSessionId = newSessionId;
          }
        });
      },

      restoreSessionUsage: (sessionId: string, usage: UsageData, processedIds?: string[]) => {
        set((state) => {
          // Pre-populate the session cache with usage from persisted data.
          // This is called when loading a conversation from disk.
          //
          // IMPORTANT: If the cache already has MORE tokens than disk data,
          // the cache was populated from a live streaming session and is more
          // accurate — disk data may lag behind. Only overwrite when disk data
          // is richer (first load from history) or the cache is empty.
          const existingCache = state.sessionCache[sessionId];
          const existingTotal = getContextUsedTokens(existingCache?.usage ?? initialUsage);
          const incomingTotal = getContextUsedTokens(usage);

          if (incomingTotal >= existingTotal) {
            state.sessionCache[sessionId] = {
              usage: { ...usage },
              processedIds: processedIds ?? existingCache?.processedIds ?? [],
              activeTools: existingCache?.activeTools ?? {},
              completedTools: existingCache?.completedTools ?? [],
              contextWindow: existingCache?.contextWindow,
              sessionModel: existingCache?.sessionModel,
              sessionTools: existingCache?.sessionTools,
              sessionMcpServers: existingCache?.sessionMcpServers,
            };
          }

          // If this is the current session, only update the active usage when
          // the incoming data is richer than what we already have (avoids
          // overwriting live-tracked usage with stale disk data).
          if (state.currentSessionId === sessionId) {
            const liveTotal = getContextUsedTokens(state.sessionUsage);
            if (incomingTotal >= liveTotal) {
              state.sessionUsage = { ...usage };
              if (processedIds) {
                state.processedMessageIds = new Set(processedIds);
              }
            }
          }

          // Shadow write to session-keyed structure (same richer-wins logic)
          const bucket = ensureSessionBucket(state.sessions, sessionId);
          const bucketTotal = getContextUsedTokens(bucket.usage);
          if (incomingTotal >= bucketTotal) {
            bucket.usage = { ...usage };
            if (processedIds) {
              bucket.processedIds = [...processedIds];
            }
          }
        });
      },

      getContextPercentage: () => {
        const state = get();
        const bucket = state.sessions[state.activeSessionId ?? ''];
        const maxTokens = resolveMaxTokens({
          currentContextWindow: bucket?.contextWindow ?? null,
          model: state.model,
        });
        const usedTokens = getContextUsedTokens(bucket?.usage ?? initialUsage);
        return Math.min(100, Math.round((usedTokens / maxTokens) * 100));
      },

      getMaxTokens: () => {
        const state = get();
        const bucket = state.sessions[state.activeSessionId ?? ''];
        return resolveMaxTokens({
          currentContextWindow: bucket?.contextWindow ?? null,
          model: state.model,
        });
      },

      getUsedTokens: () => {
        const state = get();
        const bucket = state.sessions[state.activeSessionId ?? ''];
        return getContextUsedTokens(bucket?.usage ?? initialUsage);
      },

      // ⚠️  DO NOT use this for rendering — get() returns stale state.
      // See file-level comment. For rendering, use useActiveTools() +
      // useCompletedTools() selectors with deduplicateAndSortTools() directly.
      // Kept for non-rendering callers (e.g., restoreToolsForMessage).
      getToolsForMessage: (messageId: string) => {
        const state = get();
        const bucket = state.sessions[state.activeSessionId ?? ''];
        // Read from session bucket if available, fall back to flat fields for compat
        const activeToolValues = bucket
          ? Object.values(bucket.activeTools)
          : Object.values(state.activeTools);
        const completedToolList = bucket ? bucket.completedTools : state.completedTools;
        const active = activeToolValues.filter((t) => t.messageId === messageId);
        const completed = completedToolList.filter((t) => t.messageId === messageId);

        return deduplicateAndSortTools(active, completed);
      },

      restoreToolsForMessage: (
        messageId: string,
        tools: {
          id: string;
          name: string;
          input: Record<string, unknown>;
          output?: string | undefined;
          success: boolean;
          contentOffset?: number | undefined;
          ordinal?: number | undefined;
        }[],
        sessionId?: string
      ) => {
        set((state) => {
          const targetSessionId = sessionId ?? state.currentSessionId ?? null;
          const writesToLiveSession =
            targetSessionId === null || targetSessionId === state.currentSessionId;
          const existingCompletedTools = !writesToLiveSession
            ? [...(state.sessionCache[targetSessionId]?.completedTools ?? EMPTY_COMPLETED_TOOLS)]
            : [...state.completedTools];

          // Convert persisted tool data to ToolExecution format.
          // If a tool already exists (e.g., from localStorage rehydration), UPDATE it
          // rather than skipping — the rehydrated copy may have a stale messageId
          // (from the live streaming session) that doesn't match the merged JSONL
          // message ID used after reload.
          for (const tool of tools) {
            const existingIdx = existingCompletedTools.findIndex((t) => t.id === tool.id);

            const toolExecution: ToolExecution = {
              id: tool.id,
              messageId,
              toolName: tool.name,
              toolInput: tool.input,
              toolOutput: tool.output,
              status: tool.success ? 'success' : 'error',
              startedAt: 0, // Not available from persisted data
              completedAt: 0, // Not available from persisted data
              success: tool.success,
              contentOffset: tool.contentOffset,
              ordinal: tool.ordinal,
              sessionId: targetSessionId ?? undefined,
            };

            if (existingIdx >= 0) {
              // Replace stale entry with correct messageId and contentOffset.
              // Preserve client-side-only fields (e.g., answers merged by
              // mergeToolInputAnswers for AskUserQuestion) that don't exist
              // in JSONL. Without this, switching conversations wipes answers.
              const existing = existingCompletedTools[existingIdx];
              if (existing) {
                const existingAnswers = existing.toolInput['answers'];
                if (
                  existingAnswers !== undefined &&
                  toolExecution.toolInput['answers'] === undefined
                ) {
                  toolExecution.toolInput = {
                    ...toolExecution.toolInput,
                    answers: existingAnswers,
                  };
                }
              }
              existingCompletedTools[existingIdx] = toolExecution;
            } else {
              existingCompletedTools.push(toolExecution);
            }
          }

          if (writesToLiveSession) {
            state.completedTools = existingCompletedTools;
          }

          if (targetSessionId !== null) {
            const existingCache = state.sessionCache[targetSessionId];
            state.sessionCache[targetSessionId] = {
              usage: existingCache?.usage ?? { ...initialUsage },
              processedIds: existingCache?.processedIds ?? [],
              activeTools: existingCache?.activeTools ?? {},
              completedTools: existingCompletedTools,
              contextWindow: existingCache?.contextWindow,
              sessionModel: existingCache?.sessionModel,
              sessionTools: existingCache?.sessionTools,
              sessionMcpServers: existingCache?.sessionMcpServers,
            };
            bumpToolRevision(state, targetSessionId);

            // Shadow write to session-keyed structure
            const bucket = ensureSessionBucket(state.sessions, targetSessionId);
            bucket.completedTools = existingCompletedTools;
            bucket.toolRevision += 1;
          }
        });
      },

      clearSessionTools: (sessionId: string) => {
        logger.debug(`Clearing tools for deleted session: ${sessionId}`);
        set((state) => {
          // Get cached data BEFORE deleting
          const cachedData = state.sessionCache[sessionId];

          // Remove completed tools that were cached for this session
          if (cachedData?.completedTools) {
            const cachedToolIds = new Set(cachedData.completedTools.map((t) => t.id));
            state.completedTools = state.completedTools.filter((t) => !cachedToolIds.has(t.id));
          }

          // Remove from sessionCache (Reflect.deleteProperty avoids eslint no-dynamic-delete)
          Reflect.deleteProperty(state.sessionCache, sessionId);
          Reflect.deleteProperty(state.toolRevisions, sessionId);

          // Shadow write: evict from session-keyed structure
          Reflect.deleteProperty(state.sessions, sessionId);
        });
      },

      reset: () => {
        set((state) => {
          state.inputMode = 'default';
          state.thinkingMode = 'ultra';
          state.effortLevel = 'max';
          state.model = 'claude-sonnet-4-6';
          state.activeTools = {};
          state.completedTools = [];
          state.pendingPermissions = [];
          state.currentSessionId = null;
          state.sessionUsage = { ...initialUsage };
          state.processedMessageIds = new Set<string>();
          state.sessionCache = {};
          state.toolRevisions = {};
          state.currentContextWindow = null;
          state.sessionModel = null;
          state.sessionTools = null;
          state.sessionMcpServers = null;
          state.sessionMetadataState = null;

          // Shadow write: reset session-keyed structure
          state.sessions = {};
          state.activeSessionId = null;
        });
      },
    })),
    {
      name: 'orbit-tool-store',
      version: STORE_VERSION,
      // Only persist the active session's recent tools (session-keyed)
      partialize: (state) => {
        const bucket = state.sessions[state.activeSessionId ?? ''];
        const tools = bucket?.completedTools ?? [];
        const capped =
          tools.length > MAX_PERSISTED_TOOLS ? tools.slice(-MAX_PERSISTED_TOOLS) : tools;
        const sanitizedTools = capped.map(sanitizeToolForPersistence);

        return {
          completedTools: sanitizedTools,
          activeSessionId: state.activeSessionId,
          // Legacy compat: persist currentSessionId for V1 readers
          currentSessionId: state.currentSessionId,
        };
      },
      // Handle hydration — V1→V2 migration: flat completedTools → sessions bucket
      merge: (persistedState, currentState) => {
        if (
          persistedState === null ||
          typeof persistedState !== 'object' ||
          Array.isArray(persistedState)
        ) {
          logger.warn('Persisted state is invalid (not a plain object) - starting fresh');
          return currentState;
        }
        const persisted = persistedState as Partial<ToolState & { completedTools?: unknown }>;

        // Validate persisted tools
        let completedTools: ToolExecution[] = [];
        if (persisted.completedTools) {
          const result = StoredToolExecutionArraySchema.safeParse(persisted.completedTools);
          if (result.success) {
            completedTools = result.data.map(toToolExecution);
          } else {
            logger.warn(
              `Failed to validate persisted tools - starting fresh: ${result.error.message}`
            );
          }
        }

        // Resolve session ID (V2 uses activeSessionId, V1 uses currentSessionId)
        const sessionId =
          (typeof persisted.activeSessionId === 'string' ? persisted.activeSessionId : null) ??
          (typeof persisted.currentSessionId === 'string' ? persisted.currentSessionId : null);

        // Reconstruct sessions bucket from persisted tools
        const sessions: Record<string, PerSessionToolData> = {};
        if (sessionId) {
          sessions[sessionId] = {
            ...createEmptySessionToolData(),
            ...(completedTools.length > 0 ? { completedTools } : {}),
          };
        }

        return {
          ...currentState,
          // Restore into session-keyed structure
          sessions,
          activeSessionId: sessionId,
          // Legacy compat: sync flat fields for backward-compat readers
          completedTools,
          sessionCache: {},
          currentSessionId: sessionId,
        };
      },
    }
  )
);

// Selector hooks for common patterns
export const useInputMode = (): InputMode => useToolStore((state) => state.inputMode);
export const useThinkingMode = (): ThinkingMode => useToolStore((state) => state.thinkingMode);
export const useEffortLevel = (): EffortLevel => useToolStore((state) => state.effortLevel);
export const useModel = (): Model => useToolStore((state) => state.model);
export const useActiveTools = (): Record<string, ToolExecution> =>
  useToolStore(
    (state) => state.sessions[state.activeSessionId ?? '']?.activeTools ?? EMPTY_ACTIVE_TOOLS
  );
export const usePendingPermissions = (): PermissionRequest[] =>
  useToolStore((state) => state.pendingPermissions);

// Completed tools selector - reads from session-keyed structure
export const useCompletedTools = (): ToolExecution[] =>
  useToolStore(
    (state) => state.sessions[state.activeSessionId ?? '']?.completedTools ?? EMPTY_COMPLETED_TOOLS
  );

// ────────────────────────────────────────────────────────────────────────────
// Per-Session Tool Selectors (Multi-Instance Keep-Alive)
//
// Each keep-alive ChatMessages instance reads tools for its OWN session, not
// the global active session. This prevents all mounted instances from
// re-rendering when switchSession() swaps the global completedTools array.
//
// Reads directly from sessions[sessionId] — no hybrid current/cache check needed.
// ────────────────────────────────────────────────────────────────────────────

const EMPTY_ACTIVE_TOOLS: Record<string, ToolExecution> = {};
const EMPTY_COMPLETED_TOOLS: ToolExecution[] = [];

/** Completed tools for a specific session. */
export function useSessionCompletedTools(sessionId: string): ToolExecution[] {
  return useToolStore(
    (state) => state.sessions[sessionId]?.completedTools ?? EMPTY_COMPLETED_TOOLS
  );
}

/** Active (in-progress) tools for a specific session. */
export function useSessionActiveTools(sessionId: string): Record<string, ToolExecution> {
  return useToolStore((state) => state.sessions[sessionId]?.activeTools ?? EMPTY_ACTIVE_TOOLS);
}

// Usage selectors — read from session-keyed structure
export const useSessionUsage = (): UsageData =>
  useToolStore((state) => state.sessions[state.activeSessionId ?? '']?.usage ?? initialUsage);
export const useContextPercentage = (): number =>
  useToolStore((state) => state.getContextPercentage());
export const useMaxTokens = (): number => useToolStore((state) => state.getMaxTokens());
export const useUsedTokens = (): number => useToolStore((state) => state.getUsedTokens());
export const useSessionModel = (): string | null =>
  useToolStore((state) => state.sessions[state.activeSessionId ?? '']?.sessionModel ?? null);
export const useSessionTools = (): string[] | null =>
  useToolStore((state) => state.sessions[state.activeSessionId ?? '']?.sessionTools ?? null);
export const useSessionMcpServers = (): SessionMcpServer[] | null =>
  useToolStore((state) => state.sessions[state.activeSessionId ?? '']?.sessionMcpServers ?? null);
export const useSessionMetadataState = (): SessionMetadataState | null =>
  useToolStore((state) => state.sessions[state.activeSessionId ?? '']?.metadataState ?? null);

/**
 * @deprecated Do not use for rendering — get() returns stale state in persist(immer(...)).
 * Use useActiveTools() + useCompletedTools() + deduplicateAndSortTools() instead.
 * Kept for backward compatibility with non-rendering callers.
 */
export const useGetToolsForMessage = (): ((messageId: string) => ToolExecution[]) =>
  useToolStore((state) => state.getToolsForMessage);

/**
 * Selector for currently running tool (if any).
 * Used by ChatMessages to show contextual loading status.
 *
 * Returns the first tool with status 'running', or undefined if none.
 * (Code review cycle 2, issue #1: extracted from inline Object.values().find())
 */
export const useRunningTool = (): ToolExecution | undefined =>
  useToolStore((state) => {
    const activeTools = state.sessions[state.activeSessionId ?? '']?.activeTools;
    if (!activeTools) return undefined;
    return Object.values(activeTools).find((t) => t.status === 'running');
  });
