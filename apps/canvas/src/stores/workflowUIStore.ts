/**
 * Workflow UI Store
 *
 * Zustand store for workflow sidebar dimensions with localStorage persistence.
 */

import { createLogger } from '@orbit/common/lib';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { WORKFLOW_SIDEBAR } from '../lib/layout/workflowLayoutConstants';

const logger = createLogger('WorkflowUIStore');

// ============================================================================
// State Types
// ============================================================================

interface WorkflowUIState {
  // Left sidebar
  leftSidebarWidth: number;
  leftSidebarCollapsed: boolean;
  leftSidebarLastWidth: number;

  // Right sidebar
  rightSidebarWidth: number;
  rightSidebarCollapsed: boolean;
  rightSidebarLastWidth: number;
}

interface WorkflowUIActions {
  // Left sidebar actions
  setLeftSidebarWidth: (width: number) => void;
  toggleLeftSidebar: () => void;
  collapseLeftSidebar: () => void;
  expandLeftSidebar: () => void;

  // Right sidebar actions
  setRightSidebarWidth: (width: number) => void;
  toggleRightSidebar: () => void;
  collapseRightSidebar: () => void;
  expandRightSidebar: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: WorkflowUIState = {
  leftSidebarWidth: WORKFLOW_SIDEBAR.left.default,
  leftSidebarCollapsed: false,
  leftSidebarLastWidth: WORKFLOW_SIDEBAR.left.default,

  rightSidebarWidth: WORKFLOW_SIDEBAR.right.default,
  rightSidebarCollapsed: false,
  rightSidebarLastWidth: WORKFLOW_SIDEBAR.right.default,
};

// ============================================================================
// Store
// ============================================================================

export const useWorkflowUIStore = create<WorkflowUIState & WorkflowUIActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Left sidebar actions
      setLeftSidebarWidth: (width: number): void => {
        const clampedWidth = Math.max(
          WORKFLOW_SIDEBAR.left.min,
          Math.min(WORKFLOW_SIDEBAR.left.max, width)
        );

        logger.debug('Setting left sidebar width', {
          requested: width,
          clamped: clampedWidth,
        });

        set({
          leftSidebarWidth: clampedWidth,
          leftSidebarLastWidth: clampedWidth,
          leftSidebarCollapsed: false,
        });
      },

      toggleLeftSidebar: (): void => {
        const { leftSidebarCollapsed, leftSidebarLastWidth, leftSidebarWidth } = get();
        if (leftSidebarCollapsed) {
          set({
            leftSidebarCollapsed: false,
            leftSidebarWidth: leftSidebarLastWidth,
          });
        } else {
          set({
            leftSidebarLastWidth: leftSidebarWidth,
            leftSidebarCollapsed: true,
            leftSidebarWidth: WORKFLOW_SIDEBAR.left.collapsed,
          });
        }
      },

      collapseLeftSidebar: (): void => {
        const { leftSidebarWidth, leftSidebarCollapsed } = get();
        if (!leftSidebarCollapsed) {
          set({
            leftSidebarLastWidth: leftSidebarWidth,
            leftSidebarCollapsed: true,
            leftSidebarWidth: WORKFLOW_SIDEBAR.left.collapsed,
          });
        }
      },

      expandLeftSidebar: (): void => {
        const { leftSidebarLastWidth } = get();
        set({
          leftSidebarCollapsed: false,
          leftSidebarWidth: leftSidebarLastWidth,
        });
      },

      // Right sidebar actions
      setRightSidebarWidth: (width: number): void => {
        const clampedWidth = Math.max(
          WORKFLOW_SIDEBAR.right.min,
          Math.min(WORKFLOW_SIDEBAR.right.max, width)
        );

        logger.debug('Setting right sidebar width', {
          requested: width,
          clamped: clampedWidth,
        });

        set({
          rightSidebarWidth: clampedWidth,
          rightSidebarLastWidth: clampedWidth,
          rightSidebarCollapsed: false,
        });
      },

      toggleRightSidebar: (): void => {
        const { rightSidebarCollapsed, rightSidebarLastWidth, rightSidebarWidth } = get();
        if (rightSidebarCollapsed) {
          set({
            rightSidebarCollapsed: false,
            rightSidebarWidth: rightSidebarLastWidth,
          });
        } else {
          set({
            rightSidebarLastWidth: rightSidebarWidth,
            rightSidebarCollapsed: true,
            rightSidebarWidth: WORKFLOW_SIDEBAR.right.collapsed,
          });
        }
      },

      collapseRightSidebar: (): void => {
        const { rightSidebarWidth, rightSidebarCollapsed } = get();
        if (!rightSidebarCollapsed) {
          set({
            rightSidebarLastWidth: rightSidebarWidth,
            rightSidebarCollapsed: true,
            rightSidebarWidth: WORKFLOW_SIDEBAR.right.collapsed,
          });
        }
      },

      expandRightSidebar: (): void => {
        const { rightSidebarLastWidth } = get();
        set({
          rightSidebarCollapsed: false,
          rightSidebarWidth: rightSidebarLastWidth,
        });
      },
    }),
    {
      name: 'workflow-ui-storage',
      partialize: (state) => ({
        leftSidebarWidth: state.leftSidebarWidth,
        leftSidebarLastWidth: state.leftSidebarLastWidth,
        leftSidebarCollapsed: state.leftSidebarCollapsed,
        rightSidebarWidth: state.rightSidebarWidth,
        rightSidebarLastWidth: state.rightSidebarLastWidth,
        rightSidebarCollapsed: state.rightSidebarCollapsed,
      }),
    }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const selectLeftSidebarWidth = (state: WorkflowUIState & WorkflowUIActions): number =>
  state.leftSidebarWidth;

export const selectLeftSidebarCollapsed = (state: WorkflowUIState & WorkflowUIActions): boolean =>
  state.leftSidebarCollapsed;

// Visual width for animation - always the full width, not collapsed width
export const selectLeftSidebarVisualWidth = (state: WorkflowUIState & WorkflowUIActions): number =>
  state.leftSidebarCollapsed ? state.leftSidebarLastWidth : state.leftSidebarWidth;

export const selectRightSidebarWidth = (state: WorkflowUIState & WorkflowUIActions): number =>
  state.rightSidebarWidth;

export const selectRightSidebarCollapsed = (state: WorkflowUIState & WorkflowUIActions): boolean =>
  state.rightSidebarCollapsed;

// Visual width for animation - always the full width, not collapsed width
export const selectRightSidebarVisualWidth = (
  state: WorkflowUIState & WorkflowUIActions
): number => (state.rightSidebarCollapsed ? state.rightSidebarLastWidth : state.rightSidebarWidth);
