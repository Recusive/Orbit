import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import { DEFAULT_UI_STATE, PANEL_SIZES, SIDEBAR } from '@/lib/constants';

// Conversation summary for sidebar list
export interface ConversationSummary {
  sessionId: string;
  title: string;
  updatedAt: number;
  messageCount: number;
}

interface UIState {
  // Container dimensions (from VS Code editor layout)
  containerWidth: number | null;
  containerHeight: number | null;
  // Workspace (from VS Code)
  workspacePath: string | null;
  workspaceName: string | null;
  // Active conversation
  activeConversationId: string | null;
  activeConversationTitle: string | null;
  // Conversation list
  conversations: ConversationSummary[];
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
  setContainerDimensions: (width: number, height: number) => void;
  setWorkspace: (path: string) => void;
  // Conversation actions
  setActiveConversation: (id: string | null, title: string | null) => void;
  setConversations: (conversations: ConversationSummary[]) => void;
  addConversation: (conversation: ConversationSummary) => void;
  removeConversation: (sessionId: string) => void;
  updateConversationTitle: (sessionId: string, title: string) => void;
  // Sidebar actions
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
    containerWidth: null,
    containerHeight: null,
    workspacePath: null,
    workspaceName: null,
    activeConversationId: null,
    activeConversationTitle: null,
    conversations: [],
    leftSidebarOpen: DEFAULT_UI_STATE.leftSidebarOpen,
    leftSidebarWidth: DEFAULT_UI_STATE.leftSidebarWidth,
    reviewPanelOpen: DEFAULT_UI_STATE.reviewPanelOpen,
    reviewPanelWidth: DEFAULT_UI_STATE.reviewPanelWidth,
    rightSidebarOpen: DEFAULT_UI_STATE.rightSidebarOpen,
    bottomPanelOpen: DEFAULT_UI_STATE.bottomPanelOpen,
    bottomPanelHeight: DEFAULT_UI_STATE.bottomPanelHeight,

    setContainerDimensions: (width: number, height: number): void => {
      set((state) => {
        state.containerWidth = width;
        state.containerHeight = height;
      });
    },

    setWorkspace: (path: string): void => {
      set((state) => {
        state.workspacePath = path;
        // Extract folder name from path (last segment)
        const segments = path.split(/[/\\]/).filter(Boolean);
        state.workspaceName = segments[segments.length - 1] ?? path;
      });
    },

    setActiveConversation: (id: string | null, title: string | null): void => {
      set((state) => {
        state.activeConversationId = id;
        state.activeConversationTitle = title;
      });
    },

    setConversations: (conversations: ConversationSummary[]): void => {
      set((state) => {
        state.conversations = conversations;
      });
    },

    addConversation: (conversation: ConversationSummary): void => {
      set((state) => {
        // Add to front of list (most recent first)
        state.conversations = [conversation, ...state.conversations];
      });
    },

    removeConversation: (sessionId: string): void => {
      set((state) => {
        state.conversations = state.conversations.filter(c => c.sessionId !== sessionId);
        // Clear active if deleted
        if (state.activeConversationId === sessionId) {
          state.activeConversationId = null;
          state.activeConversationTitle = null;
        }
      });
    },

    updateConversationTitle: (sessionId: string, title: string): void => {
      set((state) => {
        const conversation = state.conversations.find(c => c.sessionId === sessionId);
        if (conversation) {
          conversation.title = title;
        }
        // Also update active title if this is the active conversation
        if (state.activeConversationId === sessionId) {
          state.activeConversationTitle = title;
        }
      });
    },

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

export const useWorkspaceName = (): string | null => {
  return useUIStore((state) => state.workspaceName);
};

export const useActiveConversationId = (): string | null => {
  return useUIStore((state) => state.activeConversationId);
};

export const useActiveConversationTitle = (): string | null => {
  return useUIStore((state) => state.activeConversationTitle);
};

export const useConversations = (): ConversationSummary[] => {
  return useUIStore((state) => state.conversations);
};
