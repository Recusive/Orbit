import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export type AgentPhase = 'idle' | 'planning' | 'implementing' | 'reviewing';

export interface AgentTask {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface ToolCall {
  id: string;
  taskId: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
  timestamp: number;
  duration?: number;
  status: 'pending' | 'running' | 'success' | 'error';
}

export interface AgentState {
  phase: AgentPhase;
  isRunning: boolean;
  currentTask: AgentTask | null;
  tasks: AgentTask[];
  toolCalls: ToolCall[];
  // Actions
  setPhase: (phase: AgentPhase) => void;
  startTask: (task: Omit<AgentTask, 'id' | 'status' | 'createdAt'>) => string;
  stopTask: () => void;
  completeTask: (taskId: string, error?: string) => void;
  updateTask: (taskId: string, updates: Partial<AgentTask>) => void;
  addToolCall: (call: Omit<ToolCall, 'id' | 'timestamp' | 'status'>) => string;
  updateToolCall: (callId: string, updates: Partial<ToolCall>) => void;
  clearHistory: () => void;
  reset: () => void;
}

export const useAgentStore = create<AgentState>()(
  immer((set) => ({
    phase: 'idle',
    isRunning: false,
    currentTask: null,
    tasks: [],
    toolCalls: [],

    setPhase: (phase: AgentPhase) => {
      set((state) => {
        state.phase = phase;
      });
    },

    startTask: (task: Omit<AgentTask, 'id' | 'status' | 'createdAt'>) => {
      const random = Math.random().toString(36);
      const id = `task_${String(Date.now())}_${random.slice(2, 11)}`;

      set((state) => {
        const newTask: AgentTask = {
          ...task,
          id,
          status: 'in_progress',
          createdAt: Date.now(),
          startedAt: Date.now(),
        };

        state.tasks.push(newTask);
        state.currentTask = newTask;
        state.isRunning = true;
      });

      return id;
    },

    stopTask: () => {
      set((state) => {
        if (state.currentTask) {
          const task = state.tasks.find((t) => t.id === state.currentTask?.id);
          if (task) {
            task.status = 'failed';
            task.completedAt = Date.now();
            task.error = 'Task stopped by user';
          }
        }

        state.currentTask = null;
        state.isRunning = false;
        state.phase = 'idle';
      });
    },

    completeTask: (taskId: string, error?: string) => {
      set((state) => {
        const task = state.tasks.find((t) => t.id === taskId);
        if (task) {
          task.status = error ? 'failed' : 'completed';
          task.completedAt = Date.now();
          if (error) {
            task.error = error;
          }
        }

        if (state.currentTask?.id === taskId) {
          state.currentTask = null;
          state.isRunning = false;
          state.phase = 'idle';
        }
      });
    },

    updateTask: (taskId: string, updates: Partial<AgentTask>) => {
      set((state) => {
        const task = state.tasks.find((t) => t.id === taskId);
        if (task) {
          Object.assign(task, updates);
        }

        if (state.currentTask?.id === taskId) {
          Object.assign(state.currentTask, updates);
        }
      });
    },

    addToolCall: (call: Omit<ToolCall, 'id' | 'timestamp' | 'status'>) => {
      const random = Math.random().toString(36);
      const id = `call_${String(Date.now())}_${random.slice(2, 11)}`;

      set((state) => {
        const newCall: ToolCall = {
          ...call,
          id,
          timestamp: Date.now(),
          status: 'running',
        };

        state.toolCalls.push(newCall);
      });

      return id;
    },

    updateToolCall: (callId: string, updates: Partial<ToolCall>) => {
      set((state) => {
        const call = state.toolCalls.find((c) => c.id === callId);
        if (call) {
          Object.assign(call, updates);

          // Calculate duration if completed
          if (updates.status && ['success', 'error'].includes(updates.status)) {
            call.duration = Date.now() - call.timestamp;
          }
        }
      });
    },

    clearHistory: () => {
      set((state) => {
        state.tasks = state.tasks.filter((t) => t.status === 'in_progress');
        state.toolCalls = [];
      });
    },

    reset: () => {
      set((state) => {
        state.phase = 'idle';
        state.isRunning = false;
        state.currentTask = null;
        state.tasks = [];
        state.toolCalls = [];
      });
    },
  }))
);
