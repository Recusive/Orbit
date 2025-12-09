import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface UIState {
  // Left Sidebar
  leftSidebarOpen: boolean;
  leftSidebarWidth: number;
  // Review Panel (inside center area as split)
  reviewPanelOpen: boolean;
  reviewPanelWidth: number;
  // Right Sidebar (Sessions)
  rightSidebarOpen: boolean;
  // Bottom Panel (Terminal)
  bottomPanelOpen: boolean;
  bottomPanelHeight: number;
}

interface UIActions {
  toggleLeftSidebar: () => void;
  expandLeftSidebar: () => void;
  collapseLeftSidebar: () => void;
  toggleReviewPanel: () => void;
  toggleRightSidebar: () => void;
  toggleBottomPanel: () => void;
  setReviewPanelWidth: (width: number) => void;
  setBottomPanelHeight: (height: number) => void;
}

type UIStore = UIState & UIActions;

const SIDEBAR_COLLAPSED = 40;
const SIDEBAR_EXPANDED = 256;

export const useUIStore = create<UIStore>()(
  immer((set) => ({
    leftSidebarOpen: true,
    leftSidebarWidth: SIDEBAR_EXPANDED,
    reviewPanelOpen: false,
    reviewPanelWidth: 400,
    rightSidebarOpen: false,
    bottomPanelOpen: false,
    bottomPanelHeight: 200,

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

    toggleReviewPanel: (): void => {
      set((state) => {
        state.reviewPanelOpen = !state.reviewPanelOpen;
      });
    },

    toggleRightSidebar: (): void => {
      set((state) => {
        state.rightSidebarOpen = !state.rightSidebarOpen;
      });
    },

    toggleBottomPanel: (): void => {
      set((state) => {
        state.bottomPanelOpen = !state.bottomPanelOpen;
      });
    },

    setReviewPanelWidth: (width: number): void => {
      set((state) => {
        state.reviewPanelWidth = Math.max(300, Math.min(800, width));
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
