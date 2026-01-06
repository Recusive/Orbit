/**
 * useCanvasMode Hook
 *
 * Isolates canvas mode switching logic (design vs workflow).
 * Keeps workflow-specific concerns separate from design mode.
 *
 * Responsibilities:
 * - Canvas mode state management
 * - Workflow-specific handlers (isolated here to keep design mode clean)
 * - Mode-specific side effects (e.g., fetching workflow list)
 */

import { useState, useCallback, useEffect } from 'react';

import { selectActiveWorkflow, useWorkflowStore } from '../stores/workflowStore';
import { DEFAULT_CANVAS_MODE } from '../types/canvasMode';

import { useBackendSync } from './useBackendSync';

import type { CanvasMode } from '../types/canvasMode';
import type { Workflow } from '../types/workflowTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface UseCanvasModeReturn {
  /** Current canvas mode */
  canvasMode: CanvasMode;
  /** Set canvas mode */
  setCanvasMode: React.Dispatch<React.SetStateAction<CanvasMode>>;
  /** Active workflow (null if none selected) */
  activeWorkflow: Workflow | null;
  /** Workflow handlers for sidebar */
  workflowHandlers: {
    onWorkflowSelect: (workflowId: string) => void;
    onWorkflowCreate: (name: string) => void;
    onWorkflowDelete: (workflowId: string) => void;
    onWorkflowRefresh: () => void;
  };
}

// =============================================================================
// HOOK
// =============================================================================

export function useCanvasMode(): UseCanvasModeReturn {
  const [canvasMode, setCanvasMode] = useState<CanvasMode>(DEFAULT_CANVAS_MODE.mode);

  // Workflow state and actions
  const activeWorkflow = useWorkflowStore(selectActiveWorkflow);
  const { loadWorkflow, createWorkflow, deleteWorkflow, listWorkflows } = useBackendSync();

  // =========================================================================
  // WORKFLOW SIDE EFFECTS
  // =========================================================================

  /**
   * Fetch workflow list when entering workflow mode.
   */
  useEffect(() => {
    if (canvasMode === 'workflow') {
      listWorkflows();
    }
  }, [canvasMode, listWorkflows]);

  // =========================================================================
  // WORKFLOW HANDLERS
  // =========================================================================

  const handleWorkflowSelect = useCallback(
    (workflowId: string): void => {
      loadWorkflow(workflowId);
    },
    [loadWorkflow]
  );

  const handleWorkflowCreate = useCallback(
    (name: string): void => {
      createWorkflow(name);
    },
    [createWorkflow]
  );

  const handleWorkflowDelete = useCallback(
    (workflowId: string): void => {
      deleteWorkflow(workflowId);
    },
    [deleteWorkflow]
  );

  const handleWorkflowRefresh = useCallback((): void => {
    listWorkflows();
  }, [listWorkflows]);

  // =========================================================================
  // RETURN
  // =========================================================================

  return {
    canvasMode,
    setCanvasMode,
    activeWorkflow,
    workflowHandlers: {
      onWorkflowSelect: handleWorkflowSelect,
      onWorkflowCreate: handleWorkflowCreate,
      onWorkflowDelete: handleWorkflowDelete,
      onWorkflowRefresh: handleWorkflowRefresh,
    },
  };
}
