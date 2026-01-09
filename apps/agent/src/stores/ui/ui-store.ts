import { createLogger } from '@orbit/common/lib';
import { useMemo } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import type { SettingsSection } from '@/components/modals/settings';
import type { StoredConversationSummary } from '@/types/protocol';

import { DEFAULT_UI_STATE, PANEL_SIZES, SIDEBAR } from '@/lib/utils/constants';
import { StoredConversationSummaryArraySchema } from '@/types/protocol';

const logger = createLogger('UIStore');

export type { StoredConversationSummary } from '@/types/protocol';

// ============================================
// Worktree Types
// ============================================

/** Information about a git worktree (mirrors Rust struct) */
export interface WorktreeInfo {
  path: string;
  head: string;
  shortHead: string;
  branch: string | null;
  isMain: boolean;
  isDetached: boolean;
  locked: string | null;
}

/** UI state for a worktree */
export interface WorktreeUIState {
  worktree: WorktreeInfo;
  isExpanded: boolean;
}

// Re-export for backwards compatibility
export type ConversationSummary = StoredConversationSummary;

// Terminal position options
export type TerminalPosition = 'activity' | 'both';

// Activity panel tabs
export type ActivityTab = 'file' | 'files' | 'source' | 'browser';

// Bottom panel tabs
export type BottomPanelTab = 'terminal' | 'problems';

// Header tabs (main app view)
export type HeaderTab = 'agent' | 'editor' | 'canvas';

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
  // Conversation loading state (synced across components)
  isLoadingConversation: boolean;
  // Conversation transitioning state (true from click until content is stable)
  isConversationTransitioning: boolean;
  // Conversation list
  conversations: ConversationSummary[];
  // Left Sidebar
  leftSidebarOpen: boolean;
  leftSidebarWidth: number;
  lastExpandedSidebarWidth: number; // Remembered width when collapsed via button
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
  // Header Tab (main app view)
  activeTab: HeaderTab;
  // Dialogs
  goToLineDialogOpen: boolean;
  settingsDialogOpen: boolean;
  settingsDialogSection: SettingsSection;
  // Worktrees
  worktrees: WorktreeUIState[];
  activeWorktreePath: string | null;
  createWorktreeDialogOpen: boolean;
}

interface UIActions {
  setContainerDimensions: (width: number, height: number) => void;
  setWorkspace: (path: string) => void;
  // Conversation actions
  setActiveConversation: (id: string | null, title: string | null) => void;
  setLoadingConversation: (loading: boolean) => void;
  setConversationTransitioning: (transitioning: boolean) => void;
  setConversations: (conversations: ConversationSummary[]) => void;
  addConversation: (conversation: ConversationSummary) => void;
  removeConversation: (sessionId: string) => void;
  updateConversationTitle: (sessionId: string, title: string) => void;
  // Sidebar actions
  toggleLeftSidebar: () => void;
  expandLeftSidebar: () => void;
  collapseLeftSidebar: () => void;
  setLeftSidebarWidth: (width: number) => void;
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
  // Header tab actions
  setActiveTab: (tab: HeaderTab) => void;
  // Bottom panel actions
  setBottomPanelTab: (tab: BottomPanelTab) => void;
  openProblemsPanel: () => void;
  openSourceControl: () => void;
  // Dialog actions
  setGoToLineDialogOpen: (open: boolean) => void;
  setSettingsDialogOpen: (open: boolean) => void;
  openSettings: (section?: SettingsSection) => void;
  // Worktree actions
  setWorktrees: (worktrees: WorktreeUIState[]) => void;
  addWorktree: (worktree: WorktreeInfo) => void;
  removeWorktree: (path: string) => void;
  setActiveWorktree: (path: string | null) => void;
  toggleWorktreeExpanded: (path: string) => void;
  setCreateWorktreeDialogOpen: (open: boolean) => void;
}

type UIStore = UIState & UIActions;

// Helper to load conversations from localStorage
const loadConversationsFromStorage = (): ConversationSummary[] => {
  try {
    const saved = localStorage.getItem('orbit-conversations');
    if (saved === null) {
      return [];
    }
    const json: unknown = JSON.parse(saved);
    const result = StoredConversationSummaryArraySchema.safeParse(json);
    if (!result.success) {
      return [];
    }
    return result.data;
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

// Helper to load worktrees from localStorage
const loadWorktreesFromStorage = (): WorktreeUIState[] => {
  try {
    const saved = localStorage.getItem('orbit-worktrees');
    if (saved === null) {
      return [];
    }
    const json: unknown = JSON.parse(saved);
    // Basic validation - ensure it's an array
    if (!Array.isArray(json)) {
      return [];
    }
    return json as WorktreeUIState[];
  } catch {
    return [];
  }
};

// Helper to save worktrees to localStorage
const saveWorktreesToStorage = (worktrees: WorktreeUIState[]): void => {
  try {
    localStorage.setItem('orbit-worktrees', JSON.stringify(worktrees));
  } catch {
    // Ignore storage errors
  }
};

// Helper to load active worktree path from localStorage
const loadActiveWorktreeFromStorage = (): string | null => {
  try {
    return localStorage.getItem('orbit-active-worktree');
  } catch {
    return null;
  }
};

// Helper to save active worktree path to localStorage
const saveActiveWorktreeToStorage = (path: string | null): void => {
  try {
    if (path === null) {
      localStorage.removeItem('orbit-active-worktree');
    } else {
      localStorage.setItem('orbit-active-worktree', path);
    }
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
    isLoadingConversation: false,
    isConversationTransitioning: false,
    conversations: loadConversationsFromStorage(),
    leftSidebarOpen: DEFAULT_UI_STATE.leftSidebarOpen,
    leftSidebarWidth: DEFAULT_UI_STATE.leftSidebarWidth,
    lastExpandedSidebarWidth: DEFAULT_UI_STATE.leftSidebarWidth,
    reviewPanelOpen: DEFAULT_UI_STATE.reviewPanelOpen,
    reviewPanelWidth: DEFAULT_UI_STATE.reviewPanelWidth,
    rightSidebarOpen: DEFAULT_UI_STATE.rightSidebarOpen,
    bottomPanelOpen: DEFAULT_UI_STATE.bottomPanelOpen,
    bottomPanelHeight: DEFAULT_UI_STATE.bottomPanelHeight,
    bottomPanelTab: 'terminal' as BottomPanelTab,
    terminalPosition: 'activity' as TerminalPosition,
    activityTab: 'files' as ActivityTab,
    activeTab: 'agent' as HeaderTab,
    goToLineDialogOpen: false,
    settingsDialogOpen: false,
    settingsDialogSection: 'agent' as const,
    // Worktrees
    worktrees: loadWorktreesFromStorage(),
    activeWorktreePath: loadActiveWorktreeFromStorage(),
    createWorktreeDialogOpen: false,

    setContainerDimensions: (width: number, height: number): void => {
      set((state) => {
        state.containerWidth = width;
        state.containerHeight = height;
      });
    },

    setWorkspace: (path: string): void => {
      logger.info(`Workspace set: ${path}`);
      set((state) => {
        // Enable transition mode BEFORE workspace change takes effect
        // This ensures ChatArea mounts with visibility: hidden, preventing
        // the flash when transitioning from WelcomePage → ChatArea.
        // The useLayoutEffect stabilization in chat-area.tsx will handle
        // revealing content once layout is stable.
        state.isLoadingConversation = true;
        state.isConversationTransitioning = true;

        state.workspacePath = path;
        // Extract folder name from path (last segment)
        const segments = path.split(/[/\\]/).filter(Boolean);
        state.workspaceName = segments[segments.length - 1] ?? path;
      });
    },

    setActiveConversation: (id: string | null, title: string | null): void => {
      logger.debug(`Active conversation: ${id ?? 'none'}`, { title });
      set((state) => {
        state.activeConversationId = id;
        state.activeConversationTitle = title;
      });
    },

    setLoadingConversation: (loading: boolean): void => {
      set((state) => {
        state.isLoadingConversation = loading;
      });
    },

    setConversationTransitioning: (transitioning: boolean): void => {
      set((state) => {
        state.isConversationTransitioning = transitioning;
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
          // Collapsing: save current width before collapsing
          state.lastExpandedSidebarWidth = state.leftSidebarWidth;
          state.leftSidebarWidth = SIDEBAR.collapsed;
        } else {
          // Expanding: restore to last remembered width
          state.leftSidebarWidth = state.lastExpandedSidebarWidth;
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

    setLeftSidebarWidth: (width: number): void => {
      set((state) => {
        // Clamp to valid range: either collapsed or minUsable-max
        if (width <= SIDEBAR.collapsed) {
          state.leftSidebarWidth = SIDEBAR.collapsed;
        } else {
          const clampedWidth = Math.max(
            PANEL_SIZES.sidebar.minUsable,
            Math.min(PANEL_SIZES.sidebar.max, width)
          );
          state.leftSidebarWidth = clampedWidth;
          // Remember this width for when user toggles via button
          state.lastExpandedSidebarWidth = clampedWidth;
        }
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
        // Ensure terminal is open when cycling positions
        state.bottomPanelOpen = true;
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

    setActiveTab: (tab: HeaderTab): void => {
      logger.debug(`Active tab: ${tab}`);
      set((state) => {
        state.activeTab = tab;
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

    // Worktree actions
    setWorktrees: (worktrees: WorktreeUIState[]): void => {
      set((state) => {
        state.worktrees = worktrees;
        saveWorktreesToStorage(worktrees);
      });
    },

    addWorktree: (worktree: WorktreeInfo): void => {
      set((state) => {
        // Check if worktree already exists (prevent duplicates)
        const exists = state.worktrees.some((w) => w.worktree.path === worktree.path);
        if (!exists) {
          const newWorktreeState: WorktreeUIState = {
            worktree,
            isExpanded: true, // Start expanded by default
          };
          state.worktrees = [...state.worktrees, newWorktreeState];
          saveWorktreesToStorage(state.worktrees);
        }
      });
    },

    removeWorktree: (path: string): void => {
      set((state) => {
        state.worktrees = state.worktrees.filter((w) => w.worktree.path !== path);
        // Clear active if removed
        if (state.activeWorktreePath === path) {
          state.activeWorktreePath = null;
          saveActiveWorktreeToStorage(null);
        }
        saveWorktreesToStorage(state.worktrees);
      });
    },

    setActiveWorktree: (path: string | null): void => {
      set((state) => {
        state.activeWorktreePath = path;
        saveActiveWorktreeToStorage(path);
      });
    },

    toggleWorktreeExpanded: (path: string): void => {
      set((state) => {
        const worktreeState = state.worktrees.find((w) => w.worktree.path === path);
        if (worktreeState) {
          worktreeState.isExpanded = !worktreeState.isExpanded;
          saveWorktreesToStorage(state.worktrees);
        }
      });
    },

    setCreateWorktreeDialogOpen: (open: boolean): void => {
      set((state) => {
        state.createWorktreeDialogOpen = open;
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

export const useIsLoadingConversation = (): boolean => {
  return useUIStore((state) => state.isLoadingConversation);
};

export const useIsConversationTransitioning = (): boolean => {
  return useUIStore((state) => state.isConversationTransitioning);
};

export const useConversations = (): ConversationSummary[] => {
  return useUIStore((state) => state.conversations);
};

export const useWorkspaceConversations = (): ConversationSummary[] => {
  // With Claude Code-style folder isolation, the backend only loads
  // conversations from the current workspace's folder. No filtering needed!
  const workspacePath = useUIStore((state) => state.workspacePath);
  const conversations = useUIStore((state) => state.conversations);

  return useMemo(() => {
    if (!workspacePath) {
      // No workspace set - return empty list (user should open a folder first)
      return [];
    }
    // All loaded conversations are already for the current workspace
    // (loaded from its specific folder by the backend)
    return conversations;
  }, [workspacePath, conversations]);
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

export const useActiveTab = (): HeaderTab => {
  return useUIStore((state) => state.activeTab);
};

// ============================================
// Worktree Selectors
// ============================================

export const useWorktrees = (): WorktreeUIState[] => {
  return useUIStore((state) => state.worktrees);
};

export const useActiveWorktreePath = (): string | null => {
  return useUIStore((state) => state.activeWorktreePath);
};

export const useActiveWorktree = (): WorktreeUIState | null => {
  const worktrees = useUIStore((state) => state.worktrees);
  const activePath = useUIStore((state) => state.activeWorktreePath);

  return useMemo(() => {
    if (!activePath) return null;
    return worktrees.find((w) => w.worktree.path === activePath) ?? null;
  }, [worktrees, activePath]);
};

export const useCreateWorktreeDialogOpen = (): boolean => {
  return useUIStore((state) => state.createWorktreeDialogOpen);
};
