import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import type { InputMode, Model, ThinkingMode } from '@/types/protocol';

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
  restoreSessionUsage: (sessionId: string, usage: UsageData, processedIds?: string[]) => void;

  // Computed values
  getContextPercentage: () => number;
  getMaxTokens: () => number;
  getUsedTokens: () => number;

  // Get tools for a specific message
  getToolsForMessage: (messageId: string) => ToolExecution[];

  // Reset
  reset: () => void;
}

const initialUsage: UsageData = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  totalCostUsd: 0,
};

export const useToolStore = create<ToolState>()(
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
      set((state) => {
        const tool = state.activeTools[id];
        if (tool) {
          tool.status = success ? 'success' : 'error';
          tool.toolOutput = toolOutput;
          tool.completedAt = Date.now();
          tool.success = success;

          // Move to completed
          state.completedTools.push({ ...tool });
          // Remove from active tools (using Reflect to avoid eslint no-dynamic-delete)
          Reflect.deleteProperty(state.activeTools, id);
        }
      });
    },

    addPermissionRequest: (request: PermissionRequest) => {
      set((state) => {
        state.pendingPermissions.push(request);
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
      set((state) => {
        // Save current session's data to cache (if we have a current session)
        if (state.currentSessionId) {
          state.sessionCache[state.currentSessionId] = {
            usage: { ...state.sessionUsage },
            processedIds: Array.from(state.processedMessageIds),
            activeTools: { ...state.activeTools },
            completedTools: [...state.completedTools],
          };
        }

        // Check if we have cached data for the new session
        const cached = state.sessionCache[newSessionId];
        if (cached) {
          // Restore cached session data
          state.sessionUsage = { ...cached.usage };
          state.processedMessageIds = new Set(cached.processedIds);
          state.activeTools = { ...cached.activeTools };
          state.completedTools = [...cached.completedTools];
        } else {
          // New session - reset everything
          state.sessionUsage = { ...initialUsage };
          state.processedMessageIds = new Set<string>();
          state.activeTools = {};
          state.completedTools = [];
        }

        state.currentSessionId = newSessionId;
      });
    },

    restoreSessionUsage: (sessionId: string, usage: UsageData, processedIds?: string[]) => {
      set((state) => {
        // Pre-populate the session cache with usage from persisted data
        // This is called when loading a conversation from disk
        const existingCache = state.sessionCache[sessionId];
        state.sessionCache[sessionId] = {
          usage: { ...usage },
          processedIds: processedIds ?? existingCache?.processedIds ?? [],
          activeTools: existingCache?.activeTools ?? {},
          completedTools: existingCache?.completedTools ?? [],
        };

        // If this is the current session, also update the active usage
        if (state.currentSessionId === sessionId) {
          state.sessionUsage = { ...usage };
          if (processedIds) {
            state.processedMessageIds = new Set(processedIds);
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

    getToolsForMessage: (messageId: string) => {
      const state = get();
      const active = Object.values(state.activeTools).filter((t) => t.messageId === messageId);
      const completed = state.completedTools.filter((t) => t.messageId === messageId);

      // Deduplicate by tool ID (keep latest version of each)
      const toolMap = new Map<string, ToolExecution>();
      for (const tool of [...active, ...completed]) {
        const existing = toolMap.get(tool.id);
        // Keep the tool if it's newer or has more complete status
        if (
          !existing ||
          tool.startedAt > existing.startedAt ||
          (tool.completedAt !== undefined && existing.completedAt === undefined)
        ) {
          toolMap.set(tool.id, tool);
        }
      }

      return Array.from(toolMap.values()).sort((a, b) => a.startedAt - b.startedAt);
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
  }))
);

// Selector hooks for common patterns
export const useInputMode = (): InputMode => useToolStore((state) => state.inputMode);
export const useThinkingMode = (): ThinkingMode => useToolStore((state) => state.thinkingMode);
export const useModel = (): Model => useToolStore((state) => state.model);
export const useActiveTools = (): Record<string, ToolExecution> =>
  useToolStore((state) => state.activeTools);
export const usePendingPermissions = (): PermissionRequest[] =>
  useToolStore((state) => state.pendingPermissions);

// Usage selectors
export const useSessionUsage = (): UsageData => useToolStore((state) => state.sessionUsage);
export const useContextPercentage = (): number =>
  useToolStore((state) => state.getContextPercentage());
export const useMaxTokens = (): number => useToolStore((state) => state.getMaxTokens());
export const useUsedTokens = (): number => useToolStore((state) => state.getUsedTokens());

// Tool lookup selector - stable reference to avoid re-renders
export const useGetToolsForMessage = (): ((messageId: string) => ToolExecution[]) =>
  useToolStore((state) => state.getToolsForMessage);
