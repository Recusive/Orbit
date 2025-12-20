import { useCallback } from 'react';

import { useAgentStore } from '../stores/agent-store';
import { generateUUID } from '../types/protocol';

import { useTauri } from './use-tauri';

import type { AgentTask } from '../stores/agent-store';
import type { AgentStart, AgentStop, AgentPause, AgentResume } from '../types/protocol';

export interface UseAgentReturn {
  status: 'idle' | 'running' | 'paused' | 'error';
  currentTask: AgentTask | null;
  error: string | null;
  startTask: (sessionId: string, task: string, context?: Record<string, unknown>) => Promise<void>;
  stopTask: (sessionId: string) => Promise<void>;
  pauseTask: (sessionId: string) => Promise<void>;
  resumeTask: (sessionId: string) => Promise<void>;
  clearError: () => void;
}

/**
 * Hook for agent operations and state management
 * Connects to agent store and Tauri backend
 */
export function useAgent(): UseAgentReturn {
  const { postMessage } = useTauri();

  const phase = useAgentStore((state) => state.phase);
  const isRunning = useAgentStore((state) => state.isRunning);
  const currentTask = useAgentStore((state) => state.currentTask);
  const startTaskAction = useAgentStore((state) => state.startTask);
  const stopTaskAction = useAgentStore((state) => state.stopTask);
  const updateTask = useAgentStore((state) => state.updateTask);

  // Map phase and isRunning to a status
  const status: 'idle' | 'running' | 'paused' | 'error' =
    currentTask?.status === 'failed' ? 'error' :
    isRunning ? 'running' :
    phase === 'idle' ? 'idle' :
    'paused';

  const error = currentTask?.error ?? null;

  const startTask = useCallback(
    (sessionId: string, task: string, context?: Record<string, unknown>): Promise<void> => {
      try {
        startTaskAction({
          title: task,
          description: JSON.stringify(context ?? {}),
        });

        postMessage({
          type: 'agent:start',
          uuid: generateUUID(),
          session_id: sessionId,
          task,
          context,
        } satisfies AgentStart);
        return Promise.resolve();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to start task';
        if (currentTask) {
          updateTask(currentTask.id, {
            status: 'failed',
            error: errorMessage,
          });
        }
        throw err;
      }
    },
    [postMessage, startTaskAction, currentTask, updateTask]
  );

  const stopTask = useCallback((sessionId: string): Promise<void> => {
    try {
      postMessage({
        type: 'agent:stop',
        uuid: generateUUID(),
        session_id: sessionId,
      } satisfies AgentStop);

      stopTaskAction();
      return Promise.resolve();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to stop task';
      if (currentTask) {
        updateTask(currentTask.id, {
          status: 'failed',
          error: errorMessage,
        });
      }
      throw err;
    }
  }, [postMessage, stopTaskAction, currentTask, updateTask]);

  const pauseTask = useCallback((sessionId: string): Promise<void> => {
    try {
      postMessage({
        type: 'agent:pause',
        uuid: generateUUID(),
        session_id: sessionId,
      } satisfies AgentPause);

      if (currentTask) {
        updateTask(currentTask.id, { status: 'pending' });
      }
      return Promise.resolve();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to pause task';
      if (currentTask) {
        updateTask(currentTask.id, {
          status: 'failed',
          error: errorMessage,
        });
      }
      throw err;
    }
  }, [postMessage, currentTask, updateTask]);

  const resumeTask = useCallback((sessionId: string): Promise<void> => {
    try {
      postMessage({
        type: 'agent:resume',
        uuid: generateUUID(),
        session_id: sessionId,
      } satisfies AgentResume);

      if (currentTask) {
        updateTask(currentTask.id, { status: 'in_progress' });
      }
      return Promise.resolve();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to resume task';
      if (currentTask) {
        updateTask(currentTask.id, {
          status: 'failed',
          error: errorMessage,
        });
      }
      throw err;
    }
  }, [postMessage, currentTask, updateTask]);

  const clearError = useCallback(() => {
    if (currentTask?.error) {
      // Remove error by setting status without error field
      updateTask(currentTask.id, { status: currentTask.status });
    }
  }, [currentTask, updateTask]);

  return {
    status,
    currentTask,
    error,
    startTask,
    stopTask,
    pauseTask,
    resumeTask,
    clearError,
  };
}
