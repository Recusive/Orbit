/**
 * Missions UI Store
 * Zustand store for missions UI state (sidebar widths, panels, dialogs)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { MissionRightPanelTab } from '../types';

// ============================================================================
// State Types
// ============================================================================

interface MissionsUIState {
  // Sidebar state
  leftSidebarCollapsed: boolean;
  leftSidebarWidth: number;
  rightSidebarCollapsed: boolean;
  rightSidebarWidth: number;

  // Right sidebar panel
  activeRightPanel: MissionRightPanelTab;

  // Dialogs
  addAgentDialogOpen: boolean;
  newMissionDialogOpen: boolean;

  // Execution log
  showExecutionLog: boolean;
  executionLogExpanded: boolean;

  // Canvas preferences
  showMinimap: boolean;
  showGrid: boolean;
  snapToGrid: boolean;
}

interface MissionsUIActions {
  // Sidebar actions
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  setLeftSidebarWidth: (width: number) => void;
  setRightSidebarWidth: (width: number) => void;
  setLeftSidebarCollapsed: (collapsed: boolean) => void;
  setRightSidebarCollapsed: (collapsed: boolean) => void;

  // Panel actions
  setActiveRightPanel: (panel: MissionRightPanelTab) => void;

  // Dialog actions
  openAddAgentDialog: () => void;
  closeAddAgentDialog: () => void;
  openNewMissionDialog: () => void;
  closeNewMissionDialog: () => void;

  // Execution log actions
  toggleExecutionLog: () => void;
  setExecutionLogExpanded: (expanded: boolean) => void;

  // Canvas preferences
  setShowMinimap: (show: boolean) => void;
  setShowGrid: (show: boolean) => void;
  setSnapToGrid: (snap: boolean) => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: MissionsUIState = {
  leftSidebarCollapsed: false,
  leftSidebarWidth: 280,
  rightSidebarCollapsed: false,
  rightSidebarWidth: 320,
  activeRightPanel: 'config',
  addAgentDialogOpen: false,
  newMissionDialogOpen: false,
  showExecutionLog: true,
  executionLogExpanded: false,
  showMinimap: true,
  showGrid: true,
  snapToGrid: true,
};

// ============================================================================
// Store
// ============================================================================

export const useMissionsUIStore = create<MissionsUIState & MissionsUIActions>()(
  persist(
    (set) => ({
      ...initialState,

      // Sidebar actions
      toggleLeftSidebar: (): void => {
        set((state) => ({ leftSidebarCollapsed: !state.leftSidebarCollapsed }));
      },

      toggleRightSidebar: (): void => {
        set((state) => ({ rightSidebarCollapsed: !state.rightSidebarCollapsed }));
      },

      setLeftSidebarWidth: (width: number): void => {
        set({ leftSidebarWidth: Math.max(200, Math.min(400, width)) });
      },

      setRightSidebarWidth: (width: number): void => {
        // Max width aligned with SIDEBAR_MAX_WIDTH in MissionsRightSidebar.tsx (500px)
        set({ rightSidebarWidth: Math.max(280, Math.min(500, width)) });
      },

      setLeftSidebarCollapsed: (collapsed: boolean): void => {
        set({ leftSidebarCollapsed: collapsed });
      },

      setRightSidebarCollapsed: (collapsed: boolean): void => {
        set({ rightSidebarCollapsed: collapsed });
      },

      // Panel actions
      setActiveRightPanel: (panel: MissionRightPanelTab): void => {
        set({ activeRightPanel: panel });
      },

      // Dialog actions
      openAddAgentDialog: (): void => {
        set({ addAgentDialogOpen: true });
      },

      closeAddAgentDialog: (): void => {
        set({ addAgentDialogOpen: false });
      },

      openNewMissionDialog: (): void => {
        set({ newMissionDialogOpen: true });
      },

      closeNewMissionDialog: (): void => {
        set({ newMissionDialogOpen: false });
      },

      // Execution log actions
      toggleExecutionLog: (): void => {
        set((state) => ({ showExecutionLog: !state.showExecutionLog }));
      },

      setExecutionLogExpanded: (expanded: boolean): void => {
        set({ executionLogExpanded: expanded });
      },

      // Canvas preferences
      setShowMinimap: (show: boolean): void => {
        set({ showMinimap: show });
      },

      setShowGrid: (show: boolean): void => {
        set({ showGrid: show });
      },

      setSnapToGrid: (snap: boolean): void => {
        set({ snapToGrid: snap });
      },
    }),
    {
      name: 'missions-ui-store',
      partialize: (state) => ({
        // Only persist these preferences
        leftSidebarCollapsed: state.leftSidebarCollapsed,
        leftSidebarWidth: state.leftSidebarWidth,
        rightSidebarCollapsed: state.rightSidebarCollapsed,
        rightSidebarWidth: state.rightSidebarWidth,
        showMinimap: state.showMinimap,
        showGrid: state.showGrid,
        snapToGrid: state.snapToGrid,
      }),
    }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const selectLeftSidebarCollapsed = (state: MissionsUIState): boolean =>
  state.leftSidebarCollapsed;

export const selectLeftSidebarWidth = (state: MissionsUIState): number => state.leftSidebarWidth;

export const selectRightSidebarCollapsed = (state: MissionsUIState): boolean =>
  state.rightSidebarCollapsed;

export const selectRightSidebarWidth = (state: MissionsUIState): number => state.rightSidebarWidth;

export const selectActiveRightPanel = (state: MissionsUIState): MissionRightPanelTab =>
  state.activeRightPanel;

export const selectLeftSidebarVisualWidth = (state: MissionsUIState): number =>
  state.leftSidebarCollapsed ? 0 : state.leftSidebarWidth;

export const selectRightSidebarVisualWidth = (state: MissionsUIState): number =>
  state.rightSidebarCollapsed ? 0 : state.rightSidebarWidth;
