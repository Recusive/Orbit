import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import { DEFAULT_UI_STATE, PANEL_SIZES, SIDEBAR } from '@/lib/constants';

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

export const useUIStore = create<UIStore>()(
  immer((set) => ({
    leftSidebarOpen: DEFAULT_UI_STATE.leftSidebarOpen,
    leftSidebarWidth: DEFAULT_UI_STATE.leftSidebarWidth,
    reviewPanelOpen: DEFAULT_UI_STATE.reviewPanelOpen,
    reviewPanelWidth: DEFAULT_UI_STATE.reviewPanelWidth,
    rightSidebarOpen: DEFAULT_UI_STATE.rightSidebarOpen,
    bottomPanelOpen: DEFAULT_UI_STATE.bottomPanelOpen,
    bottomPanelHeight: DEFAULT_UI_STATE.bottomPanelHeight,

    toggleLeftSidebar: (): void => {
      set((state) => {
        if (state.leftSidebarWidth > SIDEBAR.collapsed) {
          state.leftSidebarWidth = SIDEBAR.collapsed;
        } else {
          state.leftSidebarWidth = SIDEBAR.expanded;
        }
      });
    },

    expandLeftSidebar: (): void => {
      set((state) => {
        state.leftSidebarWidth = SIDEBAR.expanded;
      });
    },

    collapseLeftSidebar: (): void => {
      set((state) => {
        state.leftSidebarWidth = SIDEBAR.collapsed;
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
        state.reviewPanelWidth = Math.max(
          PANEL_SIZES.review.min,
          Math.min(PANEL_SIZES.review.max, width)
        );
      });
    },

    setBottomPanelHeight: (height: number): void => {
      set((state) => {
        state.bottomPanelHeight = Math.max(
          PANEL_SIZES.terminal.min,
          Math.min(PANEL_SIZES.terminal.max, height)
        );
      });
    },
  }))
);

export const useIsLeftSidebarCollapsed = (): boolean => {
  return useUIStore((state) => state.leftSidebarWidth <= SIDEBAR.collapsed);
};
