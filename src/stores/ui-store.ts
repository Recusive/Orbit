import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface UIState {
  leftSidebarOpen: boolean;
  leftSidebarWidth: number;
  rightPanelOpen: boolean;
  rightPanelWidth: number;
  bottomPanelOpen: boolean;
  bottomPanelHeight: number;
  farRightPanelOpen: boolean;
}

interface UIActions {
  toggleLeftSidebar: () => void;
  expandLeftSidebar: () => void;
  collapseLeftSidebar: () => void;
  toggleRightPanel: () => void;
  toggleBottomPanel: () => void;
  toggleFarRightPanel: () => void;
  setRightPanelWidth: (width: number) => void;
  setBottomPanelHeight: (height: number) => void;
}

type UIStore = UIState & UIActions;

const SIDEBAR_COLLAPSED = 52;
const SIDEBAR_EXPANDED = 256;

export const useUIStore = create<UIStore>()(
  immer((set) => ({
    leftSidebarOpen: true,
    leftSidebarWidth: SIDEBAR_EXPANDED,
    rightPanelOpen: false,
    rightPanelWidth: 400,
    bottomPanelOpen: true,
    bottomPanelHeight: 200,
    farRightPanelOpen: false,

    toggleLeftSidebar: (): void => {
      set((state) => {
        if (state.leftSidebarWidth > SIDEBAR_COLLAPSED) {
          state.leftSidebarWidth = SIDEBAR_COLLAPSED;
        } else {
          state.leftSidebarWidth = SIDEBAR_EXPANDED;
        }
      });
    },

    expandLeftSidebar: (): void => {
      set((state) => {
        state.leftSidebarWidth = SIDEBAR_EXPANDED;
      });
    },

    collapseLeftSidebar: (): void => {
      set((state) => {
        state.leftSidebarWidth = SIDEBAR_COLLAPSED;
      });
    },

    toggleRightPanel: (): void => {
      set((state) => {
        state.rightPanelOpen = !state.rightPanelOpen;
      });
    },

    toggleBottomPanel: (): void => {
      set((state) => {
        state.bottomPanelOpen = !state.bottomPanelOpen;
      });
    },

    toggleFarRightPanel: (): void => {
      set((state) => {
        state.farRightPanelOpen = !state.farRightPanelOpen;
      });
    },

    setRightPanelWidth: (width: number): void => {
      set((state) => {
        state.rightPanelWidth = Math.max(300, Math.min(800, width));
      });
    },

    setBottomPanelHeight: (height: number): void => {
      set((state) => {
        state.bottomPanelHeight = Math.max(100, Math.min(500, height));
      });
    },
  }))
);

export const useIsLeftSidebarCollapsed = (): boolean => {
  return useUIStore((state) => state.leftSidebarWidth <= SIDEBAR_COLLAPSED);
};
