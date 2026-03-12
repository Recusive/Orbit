/**
 * Tests for ui-store.ts
 *
 * Purpose: Global UI state management - panels, sidebars, conversations, dialogs, worktrees.
 * Uses immer middleware and manual localStorage persistence for conversations and worktrees.
 */

import type { ConversationSummary, WorktreeInfo, WorktreeUIState } from '@/stores/ui/ui-store';

// Import constants for validation
import { DEFAULT_UI_STATE, PANEL_SIZES, SIDEBAR } from '@/lib/utils';
import { useUIStore } from '@/stores/ui/ui-store';

// Mock localStorage using globalThis assignment
// Store mock functions separately to avoid unbound-method lint errors
let mockStore: Record<string, string> = {};
const mockGetItem = vi.fn((key: string) => mockStore[key] ?? null);
const mockSetItem = vi.fn((key: string, value: string) => {
  mockStore[key] = value;
});
const mockRemoveItem = vi.fn((key: string) => {
  Reflect.deleteProperty(mockStore, key);
});
const mockClear = vi.fn(() => {
  mockStore = {};
});

const localStorageMock: Storage & { _store: Record<string, string> } = {
  getItem: mockGetItem,
  setItem: mockSetItem,
  removeItem: mockRemoveItem,
  clear: mockClear,
  key: (): string | null => null,
  get length(): number {
    return Object.keys(mockStore).length;
  },
  get _store(): Record<string, string> {
    return mockStore;
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Helper to create a mock conversation
function createMockConversation(
  sessionId: string,
  title = 'Test Conversation',
  overrides: Partial<ConversationSummary> = {}
): ConversationSummary {
  return {
    sessionId,
    title,
    updatedAt: Date.now(),
    messageCount: 5,
    ...overrides,
  };
}

// Helper to create a mock worktree
function createMockWorktree(
  path: string,
  branch: string | null = 'feature/test',
  overrides: Partial<WorktreeInfo> = {}
): WorktreeInfo {
  return {
    path,
    head: 'abc123',
    shortHead: 'abc123',
    branch,
    isMain: false,
    isDetached: false,
    locked: null,
    ...overrides,
  };
}

// Helper to reset the store to initial state
function resetStore(): void {
  useUIStore.setState(useUIStore.getInitialState(), true);
}

describe('ui-store', () => {
  beforeEach(() => {
    resetStore();
    mockClear();
    vi.clearAllMocks();
  });

  // ============================================================================
  // Initial State
  // ============================================================================

  describe('initial state', () => {
    it('should start with null container dimensions', () => {
      const state = useUIStore.getState();
      expect(state.containerWidth).toBeNull();
      expect(state.containerHeight).toBeNull();
    });

    it('should start with null workspace', () => {
      const state = useUIStore.getState();
      expect(state.workspacePath).toBeNull();
      expect(state.workspaceName).toBeNull();
      expect(state.repoRootPath).toBeNull();
    });

    it('should start with no active conversation', () => {
      const state = useUIStore.getState();
      expect(state.activeConversationId).toBeNull();
      expect(state.activeConversationTitle).toBeNull();
    });

    it('should start with default sidebar state', () => {
      const state = useUIStore.getState();
      expect(state.leftSidebarOpen).toBe(DEFAULT_UI_STATE.leftSidebarOpen);
      expect(state.leftSidebarWidth).toBe(DEFAULT_UI_STATE.leftSidebarWidth);
    });

    it('should start with expected panel states', () => {
      const state = useUIStore.getState();
      expect(state.reviewPanelOpen).toBe(false);
      expect(state.rightSidebarOpen).toBe(DEFAULT_UI_STATE.rightSidebarOpen); // true by default
      expect(state.bottomPanelOpen).toBe(false);
    });

    it('should start with default tab selections', () => {
      const state = useUIStore.getState();
      expect(state.activityTab).toBe('file');
      expect(state.activeTab).toBe('agent');
      expect(state.bottomPanelTab).toBe('terminal');
    });

    it('should start with dialogs closed', () => {
      const state = useUIStore.getState();
      expect(state.goToLineDialogOpen).toBe(false);
      expect(state.settingsOpen).toBe(false);
    });

    it('should start with empty worktrees', () => {
      const state = useUIStore.getState();
      expect(state.worktrees).toEqual([]);
      expect(state.activeWorktreePath).toBeNull();
    });
  });

  // ============================================================================
  // Container Dimensions
  // ============================================================================

  describe('setContainerDimensions', () => {
    it('should set container width and height', () => {
      const { setContainerDimensions } = useUIStore.getState();

      setContainerDimensions(1200, 800);

      const state = useUIStore.getState();
      expect(state.containerWidth).toBe(1200);
      expect(state.containerHeight).toBe(800);
    });
  });

  // ============================================================================
  // Workspace
  // ============================================================================

  describe('initializeWorkspace', () => {
    it('should set workspace path and extract name', () => {
      const { initializeWorkspace } = useUIStore.getState();

      initializeWorkspace('/Users/dev/projects/my-app');

      const state = useUIStore.getState();
      expect(state.workspacePath).toBe('/Users/dev/projects/my-app');
      expect(state.workspaceName).toBe('my-app');
      expect(state.repoRootPath).toBe('/Users/dev/projects/my-app');
    });

    it('should enable loading and transition states', () => {
      const { initializeWorkspace } = useUIStore.getState();

      initializeWorkspace('/workspace');

      const state = useUIStore.getState();
      expect(state.isLoadingConversation).toBe(true);
      expect(state.isConversationTransitioning).toBe(true);
    });

    it('should handle Windows paths', () => {
      const { initializeWorkspace } = useUIStore.getState();

      initializeWorkspace('C:\\Users\\dev\\projects\\my-app');

      expect(useUIStore.getState().workspaceName).toBe('my-app');
    });

    it('should clear active conversation and conversation list', () => {
      const { initializeWorkspace, setActiveConversation, addConversation } = useUIStore.getState();

      addConversation(createMockConversation('conv-1', 'Existing'));
      setActiveConversation('conv-1', 'Existing');
      initializeWorkspace('/next-workspace');

      const state = useUIStore.getState();
      expect(state.activeConversationId).toBeNull();
      expect(state.activeConversationTitle).toBeNull();
      expect(state.conversations).toEqual([]);
    });
  });

  describe('setWorkspace (shim)', () => {
    it('should delegate to initializeWorkspace', () => {
      const { setWorkspace } = useUIStore.getState();
      setWorkspace('/shim-workspace');

      const state = useUIStore.getState();
      expect(state.workspacePath).toBe('/shim-workspace');
      expect(state.repoRootPath).toBe('/shim-workspace');
    });
  });

  // ============================================================================
  // Active Conversation
  // ============================================================================

  describe('conversation actions', () => {
    describe('setActiveConversation', () => {
      it('should set active conversation id and title', () => {
        const { setActiveConversation } = useUIStore.getState();

        setActiveConversation('conv-123', 'My Conversation');

        const state = useUIStore.getState();
        expect(state.activeConversationId).toBe('conv-123');
        expect(state.activeConversationTitle).toBe('My Conversation');
      });

      it('should allow clearing active conversation', () => {
        const { setActiveConversation } = useUIStore.getState();

        setActiveConversation('conv-123', 'Test');
        setActiveConversation(null, null);

        const state = useUIStore.getState();
        expect(state.activeConversationId).toBeNull();
        expect(state.activeConversationTitle).toBeNull();
      });
    });

    describe('setLoadingConversation', () => {
      it('should set loading state', () => {
        const { setLoadingConversation } = useUIStore.getState();

        setLoadingConversation(true);
        expect(useUIStore.getState().isLoadingConversation).toBe(true);

        setLoadingConversation(false);
        expect(useUIStore.getState().isLoadingConversation).toBe(false);
      });
    });

    describe('setConversationTransitioning', () => {
      it('should set transitioning state', () => {
        const { setConversationTransitioning } = useUIStore.getState();

        setConversationTransitioning(true);
        expect(useUIStore.getState().isConversationTransitioning).toBe(true);

        setConversationTransitioning(false);
        expect(useUIStore.getState().isConversationTransitioning).toBe(false);
      });
    });

    describe('setEditingConversationId', () => {
      it('should set editing conversation id', () => {
        const { setEditingConversationId } = useUIStore.getState();

        setEditingConversationId('conv-123');
        expect(useUIStore.getState().editingConversationId).toBe('conv-123');

        setEditingConversationId(null);
        expect(useUIStore.getState().editingConversationId).toBeNull();
      });
    });
  });

  // ============================================================================
  // Conversation List Management
  // ============================================================================

  describe('conversation list', () => {
    describe('setConversations', () => {
      it('should replace conversations list from disk', () => {
        const { setConversations } = useUIStore.getState();
        const conversations = [
          createMockConversation('conv-1', 'First'),
          createMockConversation('conv-2', 'Second'),
        ];

        setConversations(conversations);

        expect(useUIStore.getState().conversations).toEqual(conversations);
        // No localStorage persistence — conversations are loaded from disk (JSONL files)
      });
    });

    describe('addConversation', () => {
      it('should add conversation to front of list', () => {
        const { setConversations, addConversation } = useUIStore.getState();

        setConversations([createMockConversation('conv-1', 'First')]);
        addConversation(createMockConversation('conv-2', 'Second'));

        const conversations = useUIStore.getState().conversations;
        expect(conversations).toHaveLength(2);
        expect(conversations[0]?.sessionId).toBe('conv-2'); // Added to front
        expect(conversations[1]?.sessionId).toBe('conv-1');
      });

      it('should not add duplicate conversation', () => {
        const { addConversation } = useUIStore.getState();

        addConversation(createMockConversation('conv-1', 'First'));
        addConversation(createMockConversation('conv-1', 'Duplicate'));

        expect(useUIStore.getState().conversations).toHaveLength(1);
      });
    });

    describe('removeConversation', () => {
      it('should remove conversation from list', () => {
        const { setConversations, removeConversation } = useUIStore.getState();

        setConversations([
          createMockConversation('conv-1', 'First'),
          createMockConversation('conv-2', 'Second'),
        ]);

        removeConversation('conv-1');

        const conversations = useUIStore.getState().conversations;
        expect(conversations).toHaveLength(1);
        expect(conversations[0]?.sessionId).toBe('conv-2');
      });

      it('should clear active conversation if removed', () => {
        const { setConversations, setActiveConversation, removeConversation } =
          useUIStore.getState();

        setConversations([createMockConversation('conv-1', 'First')]);
        setActiveConversation('conv-1', 'First');

        removeConversation('conv-1');

        const state = useUIStore.getState();
        expect(state.activeConversationId).toBeNull();
        expect(state.activeConversationTitle).toBeNull();
      });
    });

    describe('updateConversationTitle', () => {
      it('should update conversation title', () => {
        const { setConversations, updateConversationTitle } = useUIStore.getState();

        setConversations([createMockConversation('conv-1', 'Original Title')]);
        updateConversationTitle('conv-1', 'New Title');

        const conversation = useUIStore.getState().conversations[0];
        expect(conversation?.title).toBe('New Title');
      });

      it('should also update active conversation title', () => {
        const { setConversations, setActiveConversation, updateConversationTitle } =
          useUIStore.getState();

        setConversations([createMockConversation('conv-1', 'Original')]);
        setActiveConversation('conv-1', 'Original');
        updateConversationTitle('conv-1', 'Updated');

        expect(useUIStore.getState().activeConversationTitle).toBe('Updated');
      });

      it('should not persist to localStorage (conversations are disk-only)', () => {
        const { setConversations, updateConversationTitle } = useUIStore.getState();

        setConversations([createMockConversation('conv-1', 'Original')]);
        vi.clearAllMocks();
        updateConversationTitle('conv-1', 'Updated');

        // No localStorage call — conversations are read from JSONL files on disk
        expect(mockSetItem).not.toHaveBeenCalledWith('orbit-conversations', expect.any(String));
      });
    });
  });

  // ============================================================================
  // Left Sidebar
  // ============================================================================

  describe('left sidebar', () => {
    describe('toggleLeftSidebar', () => {
      it('should collapse sidebar and remember width', () => {
        const { toggleLeftSidebar } = useUIStore.getState();

        // Start expanded
        expect(useUIStore.getState().leftSidebarWidth).toBe(SIDEBAR.expanded);

        toggleLeftSidebar();

        const state = useUIStore.getState();
        expect(state.leftSidebarWidth).toBe(SIDEBAR.collapsed);
        expect(state.lastExpandedSidebarWidth).toBe(SIDEBAR.expanded);
      });

      it('should expand sidebar to remembered width', () => {
        const { toggleLeftSidebar, setLeftSidebarWidth } = useUIStore.getState();

        // Set custom width, then collapse
        setLeftSidebarWidth(300);
        toggleLeftSidebar(); // Collapse

        expect(useUIStore.getState().leftSidebarWidth).toBe(SIDEBAR.collapsed);

        toggleLeftSidebar(); // Expand

        expect(useUIStore.getState().leftSidebarWidth).toBe(300);
      });
    });

    describe('expandLeftSidebar', () => {
      it('should set sidebar to expanded width', () => {
        const { collapseLeftSidebar, expandLeftSidebar } = useUIStore.getState();

        collapseLeftSidebar();
        expandLeftSidebar();

        expect(useUIStore.getState().leftSidebarWidth).toBe(SIDEBAR.expanded);
      });
    });

    describe('collapseLeftSidebar', () => {
      it('should set sidebar to collapsed width', () => {
        const { collapseLeftSidebar } = useUIStore.getState();

        collapseLeftSidebar();

        expect(useUIStore.getState().leftSidebarWidth).toBe(SIDEBAR.collapsed);
      });
    });

    describe('setLeftSidebarWidth', () => {
      it('should clamp width to valid range', () => {
        const { setLeftSidebarWidth } = useUIStore.getState();

        // Below minUsable — snaps to collapsed (no usable state between 0 and minUsable)
        setLeftSidebarWidth(100);
        expect(useUIStore.getState().leftSidebarWidth).toBe(SIDEBAR.collapsed);

        // Too large — should clamp to max
        setLeftSidebarWidth(1000);
        expect(useUIStore.getState().leftSidebarWidth).toBe(PANEL_SIZES.sidebar.max);
      });

      it('should snap to collapsed when width is below minUsable', () => {
        const { setLeftSidebarWidth } = useUIStore.getState();

        setLeftSidebarWidth(SIDEBAR.collapsed);
        expect(useUIStore.getState().leftSidebarWidth).toBe(SIDEBAR.collapsed);

        // Any width below minUsable snaps to collapsed (0) —
        // there's no usable sidebar state between 0 and minUsable
        setLeftSidebarWidth(30);
        expect(useUIStore.getState().leftSidebarWidth).toBe(SIDEBAR.collapsed);

        setLeftSidebarWidth(PANEL_SIZES.sidebar.minUsable - 1);
        expect(useUIStore.getState().leftSidebarWidth).toBe(SIDEBAR.collapsed);
      });

      it('should remember last expanded width', () => {
        const { setLeftSidebarWidth } = useUIStore.getState();

        setLeftSidebarWidth(320);

        expect(useUIStore.getState().lastExpandedSidebarWidth).toBe(320);
      });
    });
  });

  // ============================================================================
  // Review Panel
  // ============================================================================

  describe('review panel', () => {
    describe('toggleReviewPanel', () => {
      it('should toggle review panel open state', () => {
        const { toggleReviewPanel } = useUIStore.getState();

        toggleReviewPanel();
        expect(useUIStore.getState().reviewPanelOpen).toBe(true);

        toggleReviewPanel();
        expect(useUIStore.getState().reviewPanelOpen).toBe(false);
      });
    });

    describe('setReviewPanelWidth', () => {
      it('should clamp width to valid range', () => {
        const { setReviewPanelWidth } = useUIStore.getState();

        // Too small
        setReviewPanelWidth(100);
        expect(useUIStore.getState().reviewPanelWidth).toBe(PANEL_SIZES.review.min);

        // Too large
        setReviewPanelWidth(12000);
        expect(useUIStore.getState().reviewPanelWidth).toBe(PANEL_SIZES.review.max);

        // Valid
        setReviewPanelWidth(500);
        expect(useUIStore.getState().reviewPanelWidth).toBe(500);
      });
    });
  });

  // ============================================================================
  // Right Sidebar
  // ============================================================================

  describe('right sidebar', () => {
    describe('toggleRightSidebar', () => {
      it('should toggle right sidebar open state', () => {
        const { toggleRightSidebar } = useUIStore.getState();

        // Default is true, so first toggle should close it
        expect(useUIStore.getState().rightSidebarOpen).toBe(true);

        toggleRightSidebar();
        expect(useUIStore.getState().rightSidebarOpen).toBe(false);

        toggleRightSidebar();
        expect(useUIStore.getState().rightSidebarOpen).toBe(true);
      });
    });
  });

  // ============================================================================
  // Bottom Panel
  // ============================================================================

  describe('bottom panel', () => {
    describe('toggleBottomPanel', () => {
      it('should open panel and toggle collapsed state', () => {
        const { toggleBottomPanel } = useUIStore.getState();

        // First toggle: closed → open (expanded)
        toggleBottomPanel();
        expect(useUIStore.getState().bottomPanelOpen).toBe(true);
        expect(useUIStore.getState().terminalCollapsed).toBe(false);

        // Second toggle: open expanded → open collapsed (header-only)
        toggleBottomPanel();
        expect(useUIStore.getState().bottomPanelOpen).toBe(true);
        expect(useUIStore.getState().terminalCollapsed).toBe(true);

        // Third toggle: open collapsed → open expanded
        toggleBottomPanel();
        expect(useUIStore.getState().bottomPanelOpen).toBe(true);
        expect(useUIStore.getState().terminalCollapsed).toBe(false);
      });
    });

    describe('setBottomPanelHeight', () => {
      it('should clamp height to valid range', () => {
        const { setBottomPanelHeight } = useUIStore.getState();

        // Too small
        setBottomPanelHeight(50);
        expect(useUIStore.getState().bottomPanelHeight).toBe(PANEL_SIZES.terminal.min);

        // Too large
        setBottomPanelHeight(99999);
        expect(useUIStore.getState().bottomPanelHeight).toBe(PANEL_SIZES.terminal.max);

        // Valid
        setBottomPanelHeight(300);
        expect(useUIStore.getState().bottomPanelHeight).toBe(300);
      });
    });

    describe('setBottomPanelTab', () => {
      it('should set bottom panel tab', () => {
        const { setBottomPanelTab } = useUIStore.getState();

        setBottomPanelTab('problems');
        expect(useUIStore.getState().bottomPanelTab).toBe('problems');

        setBottomPanelTab('terminal');
        expect(useUIStore.getState().bottomPanelTab).toBe('terminal');
      });
    });

    describe('openProblemsPanel', () => {
      it('should open bottom panel and set tab to problems', () => {
        const { openProblemsPanel } = useUIStore.getState();

        openProblemsPanel();

        const state = useUIStore.getState();
        expect(state.bottomPanelOpen).toBe(true);
        expect(state.bottomPanelTab).toBe('problems');
      });
    });
  });

  // ============================================================================
  // Terminal Position
  // ============================================================================

  describe('terminal position', () => {
    describe('setTerminalPosition', () => {
      it('should set terminal position', () => {
        const { setTerminalPosition } = useUIStore.getState();

        setTerminalPosition('both');
        expect(useUIStore.getState().terminalPosition).toBe('both');

        setTerminalPosition('activity');
        expect(useUIStore.getState().terminalPosition).toBe('activity');
      });
    });

    describe('cycleTerminalPosition', () => {
      it('should cycle through activity → both → chat → activity', () => {
        const { cycleTerminalPosition } = useUIStore.getState();

        expect(useUIStore.getState().terminalPosition).toBe('activity');

        cycleTerminalPosition();
        expect(useUIStore.getState().terminalPosition).toBe('both');

        cycleTerminalPosition();
        expect(useUIStore.getState().terminalPosition).toBe('chat');

        cycleTerminalPosition();
        expect(useUIStore.getState().terminalPosition).toBe('activity');
      });

      it('should ensure bottom panel is open', () => {
        const { cycleTerminalPosition } = useUIStore.getState();

        cycleTerminalPosition();

        expect(useUIStore.getState().bottomPanelOpen).toBe(true);
      });
    });
  });

  // ============================================================================
  // Terminal Position Independence
  // ============================================================================

  describe('terminal position is independent of activity panel', () => {
    it('should preserve terminal position when activity panel closes', () => {
      const { toggleReviewPanel, setTerminalPosition, toggleBottomPanel } = useUIStore.getState();

      // Open activity panel and terminal in activity position
      toggleReviewPanel(); // open
      setTerminalPosition('activity');
      toggleBottomPanel(); // open terminal

      expect(useUIStore.getState().terminalPosition).toBe('activity');

      // Close activity panel — terminal position is unchanged
      toggleReviewPanel();

      expect(useUIStore.getState().terminalPosition).toBe('activity');
    });

    it('should preserve both position when activity panel closes', () => {
      const { toggleReviewPanel, setTerminalPosition, toggleBottomPanel } = useUIStore.getState();

      toggleReviewPanel(); // open
      setTerminalPosition('both');
      toggleBottomPanel(); // open terminal

      // Close activity panel — terminal stays in 'both'
      toggleReviewPanel();

      expect(useUIStore.getState().terminalPosition).toBe('both');
    });

    it('should preserve chat position when activity panel closes', () => {
      const { toggleReviewPanel, setTerminalPosition, toggleBottomPanel } = useUIStore.getState();

      toggleReviewPanel(); // open
      setTerminalPosition('chat');
      toggleBottomPanel(); // open terminal

      toggleReviewPanel(); // close

      expect(useUIStore.getState().terminalPosition).toBe('chat');
    });
  });

  // ============================================================================
  // Activity Tab
  // ============================================================================

  describe('activity tab', () => {
    describe('setActivityTab', () => {
      it('should set activity tab', () => {
        const { setActivityTab } = useUIStore.getState();

        setActivityTab('source');
        expect(useUIStore.getState().activityTab).toBe('source');

        setActivityTab('browser');
        expect(useUIStore.getState().activityTab).toBe('browser');
      });
    });

    describe('openBrowserTab', () => {
      it('should set activity tab to browser and open review panel', () => {
        const { openBrowserTab } = useUIStore.getState();

        openBrowserTab();

        const state = useUIStore.getState();
        expect(state.activityTab).toBe('browser');
        expect(state.reviewPanelOpen).toBe(true);
      });
    });

    describe('openFileTab', () => {
      it('should set activity tab to file and open review panel', () => {
        const { openFileTab } = useUIStore.getState();

        openFileTab();

        const state = useUIStore.getState();
        expect(state.activityTab).toBe('file');
        expect(state.reviewPanelOpen).toBe(true);
      });
    });

    describe('openSourceControl', () => {
      it('should set activity tab to source and open review panel', () => {
        const { openSourceControl } = useUIStore.getState();

        openSourceControl();

        const state = useUIStore.getState();
        expect(state.activityTab).toBe('source');
        expect(state.reviewPanelOpen).toBe(true);
      });
    });
  });

  // ============================================================================
  // Header Tab
  // ============================================================================

  describe('header tab', () => {
    describe('setActiveTab', () => {
      it('should set active header tab', () => {
        const { setActiveTab } = useUIStore.getState();

        setActiveTab('canvas');
        expect(useUIStore.getState().activeTab).toBe('canvas');

        setActiveTab('editor');
        expect(useUIStore.getState().activeTab).toBe('editor');

        setActiveTab('agent');
        expect(useUIStore.getState().activeTab).toBe('agent');
      });
    });
  });

  // ============================================================================
  // Dialogs
  // ============================================================================

  describe('dialogs', () => {
    describe('setGoToLineDialogOpen', () => {
      it('should set go to line dialog open state', () => {
        const { setGoToLineDialogOpen } = useUIStore.getState();

        setGoToLineDialogOpen(true);
        expect(useUIStore.getState().goToLineDialogOpen).toBe(true);

        setGoToLineDialogOpen(false);
        expect(useUIStore.getState().goToLineDialogOpen).toBe(false);
      });
    });

    describe('setSettingsOpen', () => {
      it('should set settings open state', () => {
        const { setSettingsOpen } = useUIStore.getState();

        setSettingsOpen(true);
        expect(useUIStore.getState().settingsOpen).toBe(true);

        setSettingsOpen(false);
        expect(useUIStore.getState().settingsOpen).toBe(false);
      });

      it('should close vault and expand the sidebar when opening settings', () => {
        useUIStore.setState({
          vaultOpen: true,
          leftSidebarWidth: SIDEBAR.collapsed,
          lastExpandedSidebarWidth: 320,
        });

        useUIStore.getState().setSettingsOpen(true);

        const state = useUIStore.getState();
        expect(state.settingsOpen).toBe(true);
        expect(state.vaultOpen).toBe(false);
        expect(state.leftSidebarWidth).toBe(320);
      });
    });

    describe('openSettings', () => {
      it('should open settings with specified section', () => {
        const { openSettings } = useUIStore.getState();

        openSettings('appearance');

        const state = useUIStore.getState();
        expect(state.settingsOpen).toBe(true);
        expect(state.settingsSection).toBe('appearance');
      });

      it('should preserve the current section when no section is provided', () => {
        useUIStore.setState({ settingsSection: 'providers' });

        useUIStore.getState().openSettings();

        expect(useUIStore.getState().settingsSection).toBe('providers');
      });

      it('should close vault and expand a collapsed sidebar', () => {
        useUIStore.setState({
          vaultOpen: true,
          leftSidebarWidth: SIDEBAR.collapsed,
          lastExpandedSidebarWidth: 312,
        });

        useUIStore.getState().openSettings('appearance');

        const state = useUIStore.getState();
        expect(state.settingsOpen).toBe(true);
        expect(state.settingsSection).toBe('appearance');
        expect(state.vaultOpen).toBe(false);
        expect(state.leftSidebarWidth).toBe(312);
      });

      it('should fall back to the default expanded width when no previous sidebar width exists', () => {
        useUIStore.setState({
          leftSidebarWidth: SIDEBAR.collapsed,
          lastExpandedSidebarWidth: SIDEBAR.collapsed,
        });

        const { openSettings } = useUIStore.getState();

        openSettings();

        expect(useUIStore.getState().settingsSection).toBe('agent');
        expect(useUIStore.getState().leftSidebarWidth).toBe(SIDEBAR.expanded);
      });
    });

    describe('closeSecondarySurface', () => {
      it('should close settings and vault together', () => {
        useUIStore.setState({ settingsOpen: true, vaultOpen: true });

        useUIStore.getState().closeSecondarySurface();

        const state = useUIStore.getState();
        expect(state.settingsOpen).toBe(false);
        expect(state.vaultOpen).toBe(false);
      });
    });

    describe('vault/settings mutual exclusivity', () => {
      it('setVaultOpen(true) should close settings', () => {
        useUIStore.setState({ settingsOpen: true, vaultOpen: false });

        useUIStore.getState().setVaultOpen(true);

        const state = useUIStore.getState();
        expect(state.vaultOpen).toBe(true);
        expect(state.settingsOpen).toBe(false);
      });

      it('toggleVault should close settings when opening vault', () => {
        useUIStore.setState({ settingsOpen: true, vaultOpen: false });

        useUIStore.getState().toggleVault();

        const state = useUIStore.getState();
        expect(state.vaultOpen).toBe(true);
        expect(state.settingsOpen).toBe(false);
      });
    });
  });

  // ============================================================================
  // Worktrees
  // ============================================================================

  describe('worktrees', () => {
    describe('setWorktrees', () => {
      it('should set worktrees and persist to localStorage', () => {
        const { setWorktrees } = useUIStore.getState();
        const worktrees: WorktreeUIState[] = [
          { worktree: createMockWorktree('/repo/feature-1', 'feature-1'), isExpanded: true },
        ];

        setWorktrees(worktrees);

        expect(useUIStore.getState().worktrees).toEqual(worktrees);
        expect(mockSetItem).toHaveBeenCalledWith('orbit-worktrees', expect.any(String));
      });
    });

    describe('addWorktree', () => {
      it('should add worktree with expanded state', () => {
        const { addWorktree } = useUIStore.getState();
        const worktree = createMockWorktree('/repo/feature-1');

        addWorktree(worktree);

        const worktrees = useUIStore.getState().worktrees;
        expect(worktrees).toHaveLength(1);
        expect(worktrees[0]?.worktree.path).toBe('/repo/feature-1');
        expect(worktrees[0]?.isExpanded).toBe(true);
      });

      it('should not add duplicate worktree', () => {
        const { addWorktree } = useUIStore.getState();
        const worktree = createMockWorktree('/repo/feature-1');

        addWorktree(worktree);
        addWorktree(worktree);

        expect(useUIStore.getState().worktrees).toHaveLength(1);
      });
    });

    describe('removeWorktree', () => {
      it('should remove worktree', () => {
        const { setWorktrees, removeWorktree } = useUIStore.getState();
        setWorktrees([
          { worktree: createMockWorktree('/repo/feature-1'), isExpanded: true },
          { worktree: createMockWorktree('/repo/feature-2'), isExpanded: true },
        ]);

        removeWorktree('/repo/feature-1');

        expect(useUIStore.getState().worktrees).toHaveLength(1);
        expect(useUIStore.getState().worktrees[0]?.worktree.path).toBe('/repo/feature-2');
      });

      it('should reset workspace to repo root when active worktree is removed', () => {
        const { initializeWorkspace, setWorktrees, setActiveWorktree, removeWorktree } =
          useUIStore.getState();
        initializeWorkspace('/repo');
        setWorktrees([{ worktree: createMockWorktree('/repo/feature-1'), isExpanded: true }]);
        setActiveWorktree('/repo/feature-1');
        useUIStore.getState().setActiveConversation('conv-1', 'Conversation');
        useUIStore.getState().addConversation(createMockConversation('conv-1', 'Conversation'));

        removeWorktree('/repo/feature-1');

        const state = useUIStore.getState();
        expect(state.activeWorktreePath).toBeNull();
        expect(state.workspacePath).toBe('/repo');
        expect(state.workspaceName).toBe('repo');
        expect(state.activeConversationId).toBeNull();
        expect(state.activeConversationTitle).toBeNull();
        expect(state.conversations).toEqual([]);
      });
    });

    describe('switchToWorktree', () => {
      it('should switch workspacePath to the selected worktree and clear conversations', () => {
        const { initializeWorkspace, switchToWorktree, addConversation, setActiveConversation } =
          useUIStore.getState();
        initializeWorkspace('/repo');
        addConversation(createMockConversation('conv-1', 'Conversation'));
        setActiveConversation('conv-1', 'Conversation');

        switchToWorktree('/repo/feature-1');

        const state = useUIStore.getState();
        expect(state.workspacePath).toBe('/repo/feature-1');
        expect(state.activeWorktreePath).toBe('/repo/feature-1');
        expect(state.workspaceName).toBe('feature-1');
        expect(state.conversations).toEqual([]);
        expect(state.activeConversationId).toBeNull();
        expect(state.activeConversationTitle).toBeNull();
      });

      it('should switch back to repo root when path is null', () => {
        const { initializeWorkspace, switchToWorktree } = useUIStore.getState();
        initializeWorkspace('/repo');
        switchToWorktree('/repo/feature-1');

        switchToWorktree(null);

        const state = useUIStore.getState();
        expect(state.workspacePath).toBe('/repo');
        expect(state.activeWorktreePath).toBeNull();
        expect(state.workspaceName).toBe('repo');
      });
    });

    describe('setActiveWorktree', () => {
      it('should set active worktree and persist', () => {
        const { setActiveWorktree } = useUIStore.getState();

        setActiveWorktree('/repo/feature-1');

        expect(useUIStore.getState().activeWorktreePath).toBe('/repo/feature-1');
        expect(mockSetItem).toHaveBeenCalledWith('orbit-active-worktree', '/repo/feature-1');
      });

      it('should allow clearing active worktree', () => {
        const { setActiveWorktree } = useUIStore.getState();

        setActiveWorktree('/repo/feature-1');
        setActiveWorktree(null);

        expect(useUIStore.getState().activeWorktreePath).toBeNull();
        expect(mockRemoveItem).toHaveBeenCalledWith('orbit-active-worktree');
      });
    });

    describe('toggleWorktreeExpanded', () => {
      it('should toggle worktree expanded state', () => {
        const { setWorktrees, toggleWorktreeExpanded } = useUIStore.getState();
        setWorktrees([{ worktree: createMockWorktree('/repo/feature-1'), isExpanded: true }]);

        toggleWorktreeExpanded('/repo/feature-1');
        expect(useUIStore.getState().worktrees[0]?.isExpanded).toBe(false);

        toggleWorktreeExpanded('/repo/feature-1');
        expect(useUIStore.getState().worktrees[0]?.isExpanded).toBe(true);
      });
    });

    describe('setCreateWorktreeDialogOpen', () => {
      it('should set create worktree dialog open state', () => {
        const { setCreateWorktreeDialogOpen } = useUIStore.getState();

        setCreateWorktreeDialogOpen(true);
        expect(useUIStore.getState().createWorktreeDialogOpen).toBe(true);

        setCreateWorktreeDialogOpen(false);
        expect(useUIStore.getState().createWorktreeDialogOpen).toBe(false);
      });
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should handle rapid panel toggles', () => {
      const { toggleLeftSidebar, toggleBottomPanel, toggleReviewPanel } = useUIStore.getState();

      for (let i = 0; i < 10; i++) {
        toggleLeftSidebar();
        toggleBottomPanel();
        toggleReviewPanel();
      }

      // After 10 toggles: sidebar and review flip back, terminal stays open
      const state = useUIStore.getState();
      expect(state.leftSidebarWidth).toBe(SIDEBAR.expanded); // Back to expanded
      expect(state.bottomPanelOpen).toBe(true); // Opens on first toggle, stays open
      expect(state.reviewPanelOpen).toBe(false); // Back to closed
    });

    it('should handle conversation operations in sequence', () => {
      const {
        addConversation,
        updateConversationTitle,
        removeConversation,
        setActiveConversation,
      } = useUIStore.getState();

      // Add, make active, update, remove
      addConversation(createMockConversation('conv-1', 'Original'));
      setActiveConversation('conv-1', 'Original');
      updateConversationTitle('conv-1', 'Updated');
      expect(useUIStore.getState().activeConversationTitle).toBe('Updated');

      removeConversation('conv-1');
      expect(useUIStore.getState().activeConversationId).toBeNull();
    });

    it('should handle workspace path with no folder name', () => {
      const { initializeWorkspace } = useUIStore.getState();

      initializeWorkspace('/');

      // Should handle edge case gracefully
      expect(useUIStore.getState().workspaceName).toBe('/');
    });
  });
});
