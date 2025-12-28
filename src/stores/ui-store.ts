import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import type { SettingsSection } from '@/components/settings/settings-dialog';

import { DEFAULT_UI_STATE, PANEL_SIZES, SIDEBAR } from '@/lib/constants';

// Conversation summary for sidebar list
export interface ConversationSummary {
  sessionId: string;
  title: string;
  updatedAt: number;
  messageCount: number;
}

// Terminal position options
export type TerminalPosition = 'activity' | 'both';

// Activity panel tabs
export type ActivityTab = 'file' | 'files' | 'source' | 'browser';

// Bottom panel tabs
export type BottomPanelTab = 'terminal' | 'problems';

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
  bottomPanelTab: BottomPanelTab;
  terminalPosition: TerminalPosition;
  // Activity Panel Tab
  activityTab: ActivityTab;
  // Dialogs
  goToLineDialogOpen: boolean;
  settingsDialogOpen: boolean;
  settingsDialogSection: SettingsSection;
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
  setTerminalPosition: (position: TerminalPosition) => void;
  cycleTerminalPosition: () => void;
  // Activity panel actions
  setActivityTab: (tab: ActivityTab) => void;
  openBrowserTab: () => void;
  // Bottom panel actions
  setBottomPanelTab: (tab: BottomPanelTab) => void;
  openProblemsPanel: () => void;
  openSourceControl: () => void;
  // Dialog actions
  setGoToLineDialogOpen: (open: boolean) => void;
  setSettingsDialogOpen: (open: boolean) => void;
  openSettings: (section?: SettingsSection) => void;
}

type UIStore = UIState & UIActions;

// Helper to load conversations from localStorage
const loadConversationsFromStorage = (): ConversationSummary[] => {
  try {
    const saved = localStorage.getItem('orbit-conversations');
    return saved ? (JSON.parse(saved) as ConversationSummary[]) : [];
  } catch {
    return [];
  }
};

// Helper to save conversations to localStorage
const saveConversationsToStorage = (conversations: ConversationSummary[]): void => {
  try {
    localStorage.setItem('orbit-conversations', JSON.stringify(conversations));
  } catch {
    // Ignore storage errors
  }
};

export const useUIStore = create<UIStore>()(
  immer((set) => ({
    containerWidth: null,
    containerHeight: null,
    workspacePath: null,
    workspaceName: null,
    activeConversationId: null,
    activeConversationTitle: null,
    conversations: loadConversationsFromStorage(),
    leftSidebarOpen: DEFAULT_UI_STATE.leftSidebarOpen,
    leftSidebarWidth: DEFAULT_UI_STATE.leftSidebarWidth,
    reviewPanelOpen: DEFAULT_UI_STATE.reviewPanelOpen,
    reviewPanelWidth: DEFAULT_UI_STATE.reviewPanelWidth,
    rightSidebarOpen: DEFAULT_UI_STATE.rightSidebarOpen,
    bottomPanelOpen: DEFAULT_UI_STATE.bottomPanelOpen,
    bottomPanelHeight: DEFAULT_UI_STATE.bottomPanelHeight,
    bottomPanelTab: 'terminal' as BottomPanelTab,
    terminalPosition: 'activity' as TerminalPosition,
    activityTab: 'files' as ActivityTab,
    goToLineDialogOpen: false,
    settingsDialogOpen: false,
    settingsDialogSection: 'agent' as const,

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
        saveConversationsToStorage(conversations);
      });
    },

    addConversation: (conversation: ConversationSummary): void => {
      set((state) => {
        // Check if conversation already exists (prevent duplicates)
        const exists = state.conversations.some((c) => c.sessionId === conversation.sessionId);
        if (!exists) {
          // Add to front of list (most recent first)
          state.conversations = [conversation, ...state.conversations];
          saveConversationsToStorage(state.conversations);
        }
      });
    },

    removeConversation: (sessionId: string): void => {
      set((state) => {
        state.conversations = state.conversations.filter((c) => c.sessionId !== sessionId);
        // Clear active if deleted
        if (state.activeConversationId === sessionId) {
          state.activeConversationId = null;
          state.activeConversationTitle = null;
        }
        saveConversationsToStorage(state.conversations);
      });
    },

    updateConversationTitle: (sessionId: string, title: string): void => {
      set((state) => {
        const conversation = state.conversations.find((c) => c.sessionId === sessionId);
        if (conversation) {
          conversation.title = title;
          saveConversationsToStorage(state.conversations);
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

    setTerminalPosition: (position: TerminalPosition): void => {
      set((state) => {
        state.terminalPosition = position;
      });
    },

    cycleTerminalPosition: (): void => {
      set((state) => {
        state.terminalPosition = state.terminalPosition === 'activity' ? 'both' : 'activity';
      });
    },

    setActivityTab: (tab: ActivityTab): void => {
      set((state) => {
        state.activityTab = tab;
      });
    },

    openBrowserTab: (): void => {
      set((state) => {
        state.activityTab = 'browser';
        // Also ensure the activity panel is open
        state.reviewPanelOpen = true;
      });
    },

    setBottomPanelTab: (tab: BottomPanelTab): void => {
      set((state) => {
        state.bottomPanelTab = tab;
      });
    },

    openProblemsPanel: (): void => {
      set((state) => {
        state.bottomPanelOpen = true;
        state.bottomPanelTab = 'problems';
      });
    },

    openSourceControl: (): void => {
      set((state) => {
        state.activityTab = 'source';
        state.reviewPanelOpen = true;
      });
    },

    setGoToLineDialogOpen: (open: boolean): void => {
      set((state) => {
        state.goToLineDialogOpen = open;
      });
    },

    setSettingsDialogOpen: (open: boolean): void => {
      set((state) => {
        state.settingsDialogOpen = open;
      });
    },

    openSettings: (section?: SettingsSection): void => {
      set((state) => {
        state.settingsDialogSection = section ?? 'agent';
        state.settingsDialogOpen = true;
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

export const useWorkspacePath = (): string | null => {
  return useUIStore((state) => state.workspacePath);
};

export const useHasWorkspace = (): boolean => {
  return useUIStore((state) => state.workspacePath !== null);
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

export const useTerminalPosition = (): TerminalPosition => {
  return useUIStore((state) => state.terminalPosition);
};

export const useActivityTab = (): ActivityTab => {
  return useUIStore((state) => state.activityTab);
};

export const useBottomPanelTab = (): BottomPanelTab => {
  return useUIStore((state) => state.bottomPanelTab);
};
