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

import type { InputMode, Model, ThinkingMode } from '@/types/protocol';

const logger = createLogger('ToolStore');

// ============================================
// Constants
// ============================================

/** Version for persisted state - increment when schema changes to trigger migrations */
const STORE_VERSION = 1;

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

/** Maximum cached sessions to prevent unbounded memory growth */
const MAX_CACHED_SESSIONS = 10;

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

// Context window sizes by model (Claude 3.5 models all have 200k context)
const MODEL_CONTEXT_WINDOWS: Record<Model, number> = {
  haiku: 200000,
  sonnet: 200000,
  opus: 200000,
};

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
}

// Permission request
export interface PermissionRequest {
  requestId: string;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  createdAt: number;
}

// Cached session data (usage + tools)
interface CachedSessionData {
  usage: UsageData;
  processedIds: string[];
  activeTools: Record<string, ToolExecution>;
  completedTools: ToolExecution[];
}

export interface ToolState {
  // Input mode (synced with extension)
  inputMode: InputMode;

  // Thinking mode (off, think, hard, ultra)
  thinkingMode: ThinkingMode;

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

  // Cumulative session usage (from SDK)
  sessionUsage: UsageData;

  // Track processed message IDs to avoid double-counting (SDK sends same usage for parallel tools)
  processedMessageIds: Set<string>;

  // Cache of session data per session (plain object for immer compatibility)
  sessionCache: Record<string, CachedSessionData>;

  // Actions
  setInputMode: (mode: InputMode) => void;
  setThinkingMode: (mode: ThinkingMode) => void;
  setModel: (model: Model) => void;

  // Tool lifecycle
  startTool: (
    id: string,
    messageId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    contentOffset?: number
  ) => void;
  completeTool: (id: string, toolOutput: unknown, success: boolean) => void;

  // Permission management
  addPermissionRequest: (request: PermissionRequest) => void;
  removePermissionRequest: (requestId: string) => void;
  clearPermissions: () => void;

  // Usage tracking
  addUsage: (
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
    }[]
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

export const useToolStore = create<ToolState>()(
  persist(
    immer((set, get) => ({
      inputMode: 'default',
      thinkingMode: 'off',
      model: 'sonnet',
      activeTools: {},
      completedTools: [],
      pendingPermissions: [],
      currentSessionId: null,
      sessionUsage: { ...initialUsage },
      processedMessageIds: new Set<string>(),
      sessionCache: {},

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
        contentOffset?: number
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
          };
          state.activeTools[id] = tool;
        });
      },

      completeTool: (id: string, toolOutput: unknown, success: boolean) => {
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

            // Move to completed
            state.completedTools.push({ ...tool });

            // Cap in-memory array to prevent unbounded growth in long sessions.
            // Uses a buffer to avoid O(n) slice on every completion past the limit.
            // Trims at MAX + BUFFER, keeping MAX items. (Code review: Opus cycle 2, issue #7)
            if (state.completedTools.length > MAX_PERSISTED_TOOLS + TRIM_BUFFER) {
              state.completedTools = state.completedTools.slice(-MAX_PERSISTED_TOOLS);
            }

            // Remove from active tools (Reflect.deleteProperty avoids eslint no-dynamic-delete)
            Reflect.deleteProperty(state.activeTools, id);
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

      addUsage: (
        messageId: string,
        usage: {
          input_tokens: number;
          output_tokens: number;
          cache_read_input_tokens?: number | undefined;
          cache_creation_input_tokens?: number | undefined;
        },
        totalCostUsd?: number
      ) => {
        set((state) => {
          // SDK sends same usage for all messages with same ID (parallel tool uses)
          // Only count each message ID once to avoid double-charging
          if (state.processedMessageIds.has(messageId)) {
            return;
          }
          state.processedMessageIds.add(messageId);

          // Accumulate usage
          state.sessionUsage.inputTokens += usage.input_tokens;
          state.sessionUsage.outputTokens += usage.output_tokens;
          state.sessionUsage.cacheReadInputTokens += usage.cache_read_input_tokens ?? 0;
          state.sessionUsage.cacheCreationInputTokens += usage.cache_creation_input_tokens ?? 0;
          if (totalCostUsd !== undefined) {
            state.sessionUsage.totalCostUsd += totalCostUsd;
          }
        });
      },

      resetUsage: () => {
        set((state) => {
          state.sessionUsage = { ...initialUsage };
          state.processedMessageIds = new Set<string>();
        });
      },

      switchSession: (newSessionId: string) => {
        logger.debug(`Switching session to: ${newSessionId}`);
        set((state) => {
          // Detect initial load (first time setting currentSessionId)
          const isInitialLoad = state.currentSessionId === null;

          // ── DIAGNOSTIC: Log switchSession decision ──
          const hasCached = !!state.sessionCache[newSessionId];
          const branch = hasCached ? 'cached' : isInitialLoad ? 'initialLoad' : 'newSession-RESET';
          logger.warn(`[DIAG:TOOLS] switchSession: ${branch}`, {
            from: state.currentSessionId,
            to: newSessionId,
            isInitialLoad,
            hasCachedData: hasCached,
            completedToolsBefore: state.completedTools.length,
            activeToolsBefore: Object.keys(state.activeTools).length,
            cachedSessionIds: Object.keys(state.sessionCache),
          });

          // Save current session's data to cache (if we have a current session)
          if (state.currentSessionId) {
            state.sessionCache[state.currentSessionId] = {
              usage: { ...state.sessionUsage },
              processedIds: Array.from(state.processedMessageIds),
              activeTools: { ...state.activeTools },
              completedTools: [...state.completedTools],
            };

            // Evict oldest sessions to prevent unbounded memory growth.
            const cacheKeys = Object.keys(state.sessionCache);
            if (cacheKeys.length > MAX_CACHED_SESSIONS) {
              const evictCount = cacheKeys.length - MAX_CACHED_SESSIONS;
              for (const key of cacheKeys.slice(0, evictCount)) {
                Reflect.deleteProperty(state.sessionCache, key);
              }
            }
          }

          // Check if we have cached data for the new session
          const cached = state.sessionCache[newSessionId];
          if (cached) {
            // Restore cached session data
            state.sessionUsage = { ...cached.usage };
            state.processedMessageIds = new Set(cached.processedIds);
            state.activeTools = { ...cached.activeTools };
            state.completedTools = [...cached.completedTools];

            // ── DIAGNOSTIC: Log restored cache content ──
            logger.warn('[DIAG:TOOLS] switchSession restored from cache', {
              sessionId: newSessionId,
              restoredToolCount: cached.completedTools.length,
              restoredToolIds: cached.completedTools.map((t) => `${t.id}→${t.messageId}`),
            });
          } else if (isInitialLoad) {
            // Initial load - DON'T clear tools! The restore effect will populate them
            // from the backend. Only reset usage tracking.
            state.sessionUsage = { ...initialUsage };
            state.processedMessageIds = new Set<string>();
            // Keep activeTools and completedTools intact for restore effect
          } else {
            // Switching to a genuinely new session - reset everything
            state.sessionUsage = { ...initialUsage };
            state.processedMessageIds = new Set<string>();
            state.activeTools = {};
            state.completedTools = [];
          }

          state.currentSessionId = newSessionId;
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

          // If the store is currently tracking the old session, update the reference
          if (state.currentSessionId === oldSessionId) {
            state.currentSessionId = newSessionId;
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
          const existingTotal =
            (existingCache?.usage.inputTokens ?? 0) + (existingCache?.usage.outputTokens ?? 0);
          const incomingTotal = usage.inputTokens + usage.outputTokens;

          if (incomingTotal >= existingTotal) {
            state.sessionCache[sessionId] = {
              usage: { ...usage },
              processedIds: processedIds ?? existingCache?.processedIds ?? [],
              activeTools: existingCache?.activeTools ?? {},
              completedTools: existingCache?.completedTools ?? [],
            };
          }

          // If this is the current session, only update the active usage when
          // the incoming data is richer than what we already have (avoids
          // overwriting live-tracked usage with stale disk data).
          if (state.currentSessionId === sessionId) {
            const liveTotal = state.sessionUsage.inputTokens + state.sessionUsage.outputTokens;
            if (incomingTotal >= liveTotal) {
              state.sessionUsage = { ...usage };
              if (processedIds) {
                state.processedMessageIds = new Set(processedIds);
              }
            }
          }
        });
      },

      getContextPercentage: () => {
        const state = get();
        const maxTokens = MODEL_CONTEXT_WINDOWS[state.model];
        const usedTokens = state.sessionUsage.inputTokens + state.sessionUsage.outputTokens;
        return Math.min(100, Math.round((usedTokens / maxTokens) * 100));
      },

      getMaxTokens: () => {
        const state = get();
        return MODEL_CONTEXT_WINDOWS[state.model];
      },

      getUsedTokens: () => {
        const state = get();
        return state.sessionUsage.inputTokens + state.sessionUsage.outputTokens;
      },

      // ⚠️  DO NOT use this for rendering — get() returns stale state.
      // See file-level comment. For rendering, use useActiveTools() +
      // useCompletedTools() selectors with deduplicateAndSortTools() directly.
      // Kept for non-rendering callers (e.g., restoreToolsForMessage).
      getToolsForMessage: (messageId: string) => {
        const state = get();
        const active = Object.values(state.activeTools).filter((t) => t.messageId === messageId);
        const completed = state.completedTools.filter((t) => t.messageId === messageId);

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
        }[]
      ) => {
        set((state) => {
          // Convert persisted tool data to ToolExecution format.
          // If a tool already exists (e.g., from localStorage rehydration), UPDATE it
          // rather than skipping — the rehydrated copy may have a stale messageId
          // (from the live streaming session) that doesn't match the merged JSONL
          // message ID used after reload.
          for (const tool of tools) {
            const existingIdx = state.completedTools.findIndex((t) => t.id === tool.id);

            // ── DIAGNOSTIC: Log tool matching ──
            const existingTool = existingIdx >= 0 ? state.completedTools[existingIdx] : undefined;
            logger.warn('[DIAG:RESTORE] restoreToolsForMessage matching', {
              toolId: tool.id,
              toolName: tool.name,
              targetMessageId: messageId,
              existingIdx,
              existingMessageId: existingTool?.messageId ?? 'N/A',
              action: existingTool ? 'REPLACE' : 'PUSH',
            });

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
            };

            if (existingIdx >= 0) {
              // Replace stale entry with correct messageId and contentOffset
              state.completedTools[existingIdx] = toolExecution;
            } else {
              state.completedTools.push(toolExecution);
            }
          }

          // Also update sessionCache so tools survive session switches
          // Without this, switching away and back would lose the restored tools
          const sid = state.currentSessionId;
          if (sid) {
            const existingCache = state.sessionCache[sid];
            state.sessionCache[sid] = {
              usage: existingCache?.usage ?? { ...initialUsage },
              processedIds: existingCache?.processedIds ?? [],
              activeTools: existingCache?.activeTools ?? {},
              completedTools: [...state.completedTools],
            };

            // ── DIAGNOSTIC: Log sessionCache update ──
            logger.warn('[DIAG:RESTORE] sessionCache updated', {
              sessionId: sid,
              cachedToolCount: state.completedTools.length,
              cachedToolIds: state.completedTools.map((t) => `${t.id}→${t.messageId}`),
            });
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
        });
      },

      reset: () => {
        set((state) => {
          state.inputMode = 'default';
          state.thinkingMode = 'off';
          state.model = 'sonnet';
          state.activeTools = {};
          state.completedTools = [];
          state.pendingPermissions = [];
          state.currentSessionId = null;
          state.sessionUsage = { ...initialUsage };
          state.processedMessageIds = new Set<string>();
          state.sessionCache = {};
        });
      },
    })),
    {
      name: 'orbit-tool-store',
      version: STORE_VERSION,
      // Only persist recent tools - prevents localStorage bloat
      // localStorage has ~5MB limit; unbounded persistence would eventually fail
      partialize: (state) => {
        // Cap at MAX_PERSISTED_TOOLS most recent tools to prevent unbounded growth
        // Tools from other sessions will be restored from backend on conversation load
        // Only slice if we exceed the cap (avoids array allocation when unnecessary)
        const toolsToProcess =
          state.completedTools.length > MAX_PERSISTED_TOOLS
            ? state.completedTools.slice(-MAX_PERSISTED_TOOLS)
            : state.completedTools;

        // Sanitize tools to remove sensitive data before localStorage persistence
        // toolOutput and large toolInput values are stripped for security
        const sanitizedTools = toolsToProcess.map(sanitizeToolForPersistence);

        return {
          completedTools: sanitizedTools,
          // Don't persist sessionCache - usage is restored from backend on conversation load
          sessionCache: {},
          currentSessionId: state.currentSessionId,
        };
      },
      // Handle hydration - merge persisted tools with fresh state
      // Version migrations can be added here when STORE_VERSION changes
      merge: (persistedState, currentState) => {
        // CRITICAL: Guard against corrupted localStorage returning non-objects or arrays
        // localStorage corruption can happen from: user tampering, storage limits, browser bugs
        // Note: typeof [] === 'object' is true, so we need explicit Array.isArray check
        if (
          persistedState === null ||
          typeof persistedState !== 'object' ||
          Array.isArray(persistedState)
        ) {
          logger.warn('Persisted state is invalid (not a plain object) - starting fresh');
          return currentState;
        }
        const persisted = persistedState as Partial<ToolState>;

        // Validate persisted tools to prevent localStorage corruption from crashing the app
        // This follows the same pattern as message-state.ts (StoredChatMessageArraySchema)
        let completedTools: ToolExecution[] = [];
        if (persisted.completedTools) {
          const result = StoredToolExecutionArraySchema.safeParse(persisted.completedTools);
          if (result.success) {
            // Transform validated data to ToolExecution[] using type-safe transformation
            // This handles the Zod vs TypeScript optional property type mismatch
            completedTools = result.data.map(toToolExecution);
          } else {
            // Log validation failure for debugging but don't crash
            logger.warn(
              `Failed to validate persisted tools - starting fresh: ${result.error.message}`
            );
          }
        }

        // Validate currentSessionId is a string (not corrupted)
        const currentSessionId =
          typeof persisted.currentSessionId === 'string' ? persisted.currentSessionId : null;

        // Future version migrations would go here:
        // if (persistedVersion === 1) { /* migrate v1 -> v2 */ }

        return {
          ...currentState,
          // Restore validated persisted tools (already capped by partialize)
          completedTools,
          // Start with empty cache - usage is restored from backend on conversation load
          sessionCache: {},
          currentSessionId,
        };
      },
    }
  )
);

// Selector hooks for common patterns
export const useInputMode = (): InputMode => useToolStore((state) => state.inputMode);
export const useThinkingMode = (): ThinkingMode => useToolStore((state) => state.thinkingMode);
export const useModel = (): Model => useToolStore((state) => state.model);
export const useActiveTools = (): Record<string, ToolExecution> =>
  useToolStore((state) => state.activeTools);
export const usePendingPermissions = (): PermissionRequest[] =>
  useToolStore((state) => state.pendingPermissions);

// Completed tools selector - used by ChatMessages to compute tools-for-message
// from selector values rather than the store's internal get() which lags behind
export const useCompletedTools = (): ToolExecution[] =>
  useToolStore((state) => state.completedTools);

// Usage selectors
export const useSessionUsage = (): UsageData => useToolStore((state) => state.sessionUsage);
export const useContextPercentage = (): number =>
  useToolStore((state) => state.getContextPercentage());
export const useMaxTokens = (): number => useToolStore((state) => state.getMaxTokens());
export const useUsedTokens = (): number => useToolStore((state) => state.getUsedTokens());

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
    const tools = Object.values(state.activeTools);
    return tools.find((t) => t.status === 'running');
  });
