import { useCallback } from 'react';

import { useAgentStore  } from '../stores/agent-store';

import { useVSCode } from './use-vscode';

import type {AgentTask} from '../stores/agent-store';

export interface UseAgentReturn {
  status: 'idle' | 'running' | 'paused' | 'error';
  currentTask: AgentTask | null;
  error: string | null;
  startTask: (task: string, context?: Record<string, unknown>) => Promise<void>;
  stopTask: () => Promise<void>;
  pauseTask: () => Promise<void>;
  resumeTask: () => Promise<void>;
  clearError: () => void;
}

/**
 * Hook for agent operations and state management
 * Connects to agent store and VS Code messaging
 */
export function useAgent(): UseAgentReturn {
  const { sendMessage } = useVSCode();

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
    (task: string, context?: Record<string, unknown>): Promise<void> => {
      try {
        startTaskAction({
          title: task,
          description: JSON.stringify(context ?? {}),
        });

        sendMessage({
          type: 'agent.start',
          task,
          context,
          timestamp: Date.now(),
        });
        return Promise.resolve();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to start task';
        if (currentTask) {
          updateTask(currentTask.id, {
            status: 'failed',
            error: errorMessage
          });
        }
        throw err;
      }
    },
    [sendMessage, startTaskAction, currentTask, updateTask]
  );

  const stopTask = useCallback((): Promise<void> => {
    try {
      sendMessage({
        type: 'agent.stop',
        timestamp: Date.now(),
      });

      stopTaskAction();
      return Promise.resolve();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to stop task';
      if (currentTask) {
        updateTask(currentTask.id, {
          status: 'failed',
          error: errorMessage
        });
      }
      throw err;
    }
  }, [sendMessage, stopTaskAction, currentTask, updateTask]);

  const pauseTask = useCallback((): Promise<void> => {
    try {
      sendMessage({
        type: 'agent.pause',
        timestamp: Date.now(),
      });

      if (currentTask) {
        updateTask(currentTask.id, { status: 'pending' });
      }
      return Promise.resolve();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to pause task';
      if (currentTask) {
        updateTask(currentTask.id, {
          status: 'failed',
          error: errorMessage
        });
      }
      throw err;
    }
  }, [sendMessage, currentTask, updateTask]);

  const resumeTask = useCallback((): Promise<void> => {
    try {
      sendMessage({
        type: 'agent.resume',
        timestamp: Date.now(),
      });

      if (currentTask) {
        updateTask(currentTask.id, { status: 'in_progress' });
      }
      return Promise.resolve();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to resume task';
      if (currentTask) {
        updateTask(currentTask.id, {
          status: 'failed',
          error: errorMessage
        });
      }
      throw err;
    }
  }, [sendMessage, currentTask, updateTask]);

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
