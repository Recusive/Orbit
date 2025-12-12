import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import type { InputMode } from '@/types/protocol';

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

export interface ToolState {
  // Input mode (synced with extension)
  inputMode: InputMode;

  // Active tool executions (keyed by tool ID)
  activeTools: Record<string, ToolExecution>;

  // Completed tool executions (for history/display)
  completedTools: ToolExecution[];

  // Pending permission requests
  pendingPermissions: PermissionRequest[];

  // Actions
  setInputMode: (mode: InputMode) => void;

  // Tool lifecycle
  startTool: (id: string, messageId: string, toolName: string, toolInput: Record<string, unknown>, contentOffset?: number) => void;
  completeTool: (id: string, toolOutput: unknown, success: boolean) => void;

  // Permission management
  addPermissionRequest: (request: PermissionRequest) => void;
  removePermissionRequest: (requestId: string) => void;
  clearPermissions: () => void;

  // Get tools for a specific message
  getToolsForMessage: (messageId: string) => ToolExecution[];

  // Reset
  reset: () => void;
}

export const useToolStore = create<ToolState>()(
  immer((set, get) => ({
    inputMode: 'default',
    activeTools: {},
    completedTools: [],
    pendingPermissions: [],

    setInputMode: (mode: InputMode) => {
      set((state) => {
        state.inputMode = mode;
      });
    },

    startTool: (id: string, messageId: string, toolName: string, toolInput: Record<string, unknown>, contentOffset?: number) => {
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

    getToolsForMessage: (messageId: string) => {
      const state = get();
      const active = Object.values(state.activeTools).filter(
        (t) => t.messageId === messageId
      );
      const completed = state.completedTools.filter(
        (t) => t.messageId === messageId
      );

      // Deduplicate by tool ID (keep latest version of each)
      const toolMap = new Map<string, ToolExecution>();
      for (const tool of [...active, ...completed]) {
        const existing = toolMap.get(tool.id);
        // Keep the tool if it's newer or has more complete status
        if (!existing || tool.startedAt > existing.startedAt || (tool.completedAt !== undefined && existing.completedAt === undefined)) {
          toolMap.set(tool.id, tool);
        }
      }

      return Array.from(toolMap.values()).sort((a, b) => a.startedAt - b.startedAt);
    },

    reset: () => {
      set((state) => {
        state.inputMode = 'default';
        state.activeTools = {};
        state.completedTools = [];
        state.pendingPermissions = [];
      });
    },
  }))
);

// Selector hooks for common patterns
export const useInputMode = (): InputMode => useToolStore((state) => state.inputMode);
export const useActiveTools = (): Record<string, ToolExecution> => useToolStore((state) => state.activeTools);
export const usePendingPermissions = (): PermissionRequest[] => useToolStore((state) => state.pendingPermissions);
