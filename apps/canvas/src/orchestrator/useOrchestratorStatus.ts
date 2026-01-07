/**
 * useOrchestratorStatus - Hook for subscribing to orchestrator state
 *
 * Provides:
 * - Current orchestrator state (status, stages, agents, progress)
 * - Control methods (pause, resume, cancel)
 * - Conflict resolution methods
 */

import { useCallback, useState, useEffect, useRef } from 'react';

import type {
  OrchestratorState,
  OrchestratorError,
  Conflict,
  Resolution,
  OrchestratorControlAction,
  TaskStageProgress,
  AgentActivity,
} from './types';

// Default orchestrator state (idle)
const DEFAULT_STATE: OrchestratorState = {
  status: 'idle',
  currentStage: 0,
  stages: [],
  activeAgents: [],
  completedTasks: 0,
  totalTasks: 0,
  errors: [],
};

export interface OrchestratorCallbacks {
  /** Called when orchestrator state changes */
  onStateChange?: (state: OrchestratorState) => void;
  /** Called when an error occurs */
  onError?: (error: OrchestratorError) => void;
  /** Called when a conflict requires user input */
  onConflict?: (conflict: Conflict, options?: Resolution[]) => void;
}

export interface UseOrchestratorStatusReturn {
  /** Current orchestrator state */
  state: OrchestratorState;
  /** Whether orchestrator is actively processing */
  isActive: boolean;
  /** Current progress percentage (0-100) */
  progress: number;
  /** Current stage name */
  currentStageName: string | null;
  /** Active agents */
  activeAgents: AgentActivity[];
  /** Stage progress array */
  stages: TaskStageProgress[];
  /** Pending conflict requiring resolution */
  pendingConflict: { conflict: Conflict; options?: Resolution[] } | null;
  /** Errors encountered */
  errors: OrchestratorError[];

  // Control methods
  /** Pause orchestration */
  pause: () => void;
  /** Resume orchestration */
  resume: () => void;
  /** Cancel orchestration */
  cancel: () => void;
  /** Retry a failed task */
  retry: (taskId?: string) => void;
  /** Resolve a conflict */
  resolveConflict: (conflictId: string, resolution: Resolution) => void;
  /** Clear pending conflict (dismiss without resolution) */
  dismissConflict: () => void;
}

/**
 * Hook for subscribing to orchestrator state from the extension
 *
 * @param callbacks - Optional callbacks for state changes, errors, conflicts
 * @returns Orchestrator state and control methods
 */
export function useOrchestratorStatus(
  callbacks?: OrchestratorCallbacks
): UseOrchestratorStatusReturn {
  const [state, setState] = useState<OrchestratorState>(DEFAULT_STATE);
  const [pendingConflict, setPendingConflict] = useState<{
    conflict: Conflict;
    options?: Resolution[];
  } | null>(null);

  // Refs for callbacks to avoid stale closures
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // Handle incoming messages from extension
  useEffect(() => {
    function handleMessage(event: MessageEvent): void {
      const message = event.data as { type: string; payload?: unknown };

      switch (message.type) {
        case 'orchestrator-state': {
          const newState = message.payload as OrchestratorState;
          setState(newState);
          callbacksRef.current?.onStateChange?.(newState);
          break;
        }

        case 'orchestrator-error': {
          const error = message.payload as OrchestratorError;
          setState((prev) => ({
            ...prev,
            errors: [...prev.errors, error],
          }));
          callbacksRef.current?.onError?.(error);
          break;
        }

        case 'conflict-detected': {
          const payload = message.payload as {
            conflict: Conflict;
            requiresUserInput: boolean;
            options?: Resolution[];
          };
          const conflictData = {
            conflict: payload.conflict,
            ...(payload.options !== undefined ? { options: payload.options } : {}),
          };
          setPendingConflict(conflictData);
          callbacksRef.current?.onConflict?.(payload.conflict, payload.options);
          break;
        }
      }
    }

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Send control message to extension
  const sendControl = useCallback((action: OrchestratorControlAction, taskId?: string): void => {
    window.vscode?.postMessage({
      type: 'orchestrator-control',
      action,
      taskId,
    });
  }, []);

  // Control methods
  const pause = useCallback(() => {
    sendControl('pause');
  }, [sendControl]);

  const resume = useCallback(() => {
    sendControl('resume');
  }, [sendControl]);

  const cancel = useCallback(() => {
    sendControl('cancel');
  }, [sendControl]);

  const retry = useCallback(
    (taskId?: string) => {
      sendControl('retry', taskId);
    },
    [sendControl]
  );

  // Conflict resolution
  const resolveConflict = useCallback((conflictId: string, resolution: Resolution): void => {
    window.vscode?.postMessage({
      type: 'conflict-resolution',
      conflictId,
      resolution,
    });
    setPendingConflict(null);
  }, []);

  const dismissConflict = useCallback(() => {
    setPendingConflict(null);
  }, []);

  // Computed values
  const isActive =
    state.status === 'analyzing' || state.status === 'executing' || state.status === 'resolving';

  const progress =
    state.totalTasks > 0 ? Math.round((state.completedTasks / state.totalTasks) * 100) : 0;

  const currentStageName = state.stages[state.currentStage]?.name ?? null;

  return {
    state,
    isActive,
    progress,
    currentStageName,
    activeAgents: state.activeAgents,
    stages: state.stages,
    pendingConflict,
    errors: state.errors,

    // Control methods
    pause,
    resume,
    cancel,
    retry,
    resolveConflict,
    dismissConflict,
  };
}
