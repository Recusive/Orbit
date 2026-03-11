/**
 * useSidebarActions Integration Tests
 *
 * Tests for the sidebar actions hook that handles:
 * - Creating new conversations (handleStartConversation)
 * - Loading existing conversations
 * - Opening quick search
 * - Managing worktrees
 * - Renaming and deleting conversations
 *
 * This is an INTEGRATION test because:
 * - Uses real UIStore (reset between tests)
 * - Mocks only conversation transport handlers and backend calls
 * - Tests full behavior flow from action to store update
 *
 * @see use-sidebar-actions.ts - Hook implementation
 * @see ui-store.ts - UIStore that this hook interacts with
 */

import { act, renderHook } from '@testing-library/react';

import type { ConversationSummary } from '@/stores/ui/ui-store';

import { useSidebarActions } from '@/components/layout/primary-sidebar/hooks/use-sidebar-actions';
import { useUIStore } from '@/stores/ui/ui-store';

// =============================================================================
// Mocks
// =============================================================================

/**
 * Mock postMessage function to capture Tauri messages.
 */
const {
  mockApplyManualSessionTitle,
  mockClearSessionTitleState,
  mockConversationDelete,
  mockGitWorktreeList,
  mockGitWorktreeRemove,
  mockHandleConversationCreate,
  mockHandleConversationLoad,
  mockToastError,
  mockToastInfo,
  mockToastSuccess,
  mockToastWarning,
} = vi.hoisted(() => ({
  mockApplyManualSessionTitle: vi.fn().mockResolvedValue(true),
  mockClearSessionTitleState: vi.fn(),
  mockConversationDelete: vi.fn().mockResolvedValue(undefined),
  mockGitWorktreeList: vi.fn().mockResolvedValue([]),
  mockGitWorktreeRemove: vi.fn().mockResolvedValue({ branchDeleteFailed: null }),
  mockHandleConversationCreate: vi.fn().mockReturnValue('created-session-id'),
  mockHandleConversationLoad: vi.fn().mockResolvedValue(undefined),
  mockToastError: vi.fn(),
  mockToastInfo: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastWarning: vi.fn(),
}));

vi.mock('@/hooks/agent/handlers/conversation-handlers', () => ({
  handleConversationCreate: mockHandleConversationCreate,
  handleConversationLoad: mockHandleConversationLoad,
}));

/**
 * Mock API functions for backend calls.
 */
vi.mock('@/lib/api', () => ({
  conversationDelete: mockConversationDelete,
  gitWorktreeList: mockGitWorktreeList,
  gitWorktreeRemove: mockGitWorktreeRemove,
}));

vi.mock('@/services/session', () => ({
  applyManualSessionTitle: mockApplyManualSessionTitle,
  clearSessionTitleState: mockClearSessionTitleState,
}));

vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
    info: mockToastInfo,
    success: mockToastSuccess,
    warning: mockToastWarning,
  },
}));

// =============================================================================
// Test Setup
// =============================================================================

/**
 * Create mock conversation summaries for testing.
 * Matches StoredConversationSummary schema: sessionId, title, updatedAt (number), messageCount
 */
function createMockConversation(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    sessionId: 'test-session-123',
    title: 'Test Conversation',
    updatedAt: Date.now(),
    messageCount: 5,
    ...overrides,
  };
}

/**
 * Default hook props for testing.
 */
interface HookProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  workspacePath: string | null;
  activeWorktreePath: string | null;
}

function createDefaultHookProps(overrides: Partial<HookProps> = {}): HookProps {
  const props = {
    conversations: [],
    activeConversationId: null,
    workspacePath: '/test/workspace',
    activeWorktreePath: null,
    ...overrides,
  };

  useUIStore.setState({
    workspacePath: props.workspacePath,
    activeWorktreePath: props.activeWorktreePath,
  });

  return props;
}

interface MockWorktree {
  path: string;
  head: string;
  shortHead: string;
  branch: string | null;
  isMain: boolean;
  isDetached: boolean;
  locked: string | null;
}

function createMockWorktree(overrides: Partial<MockWorktree> = {}): MockWorktree {
  return {
    path: '/test/worktree-feature',
    head: 'abc123def4567890',
    shortHead: 'abc123d',
    branch: 'feature/x',
    isMain: false,
    isDetached: false,
    locked: null,
    ...overrides,
  };
}

// =============================================================================
// Test Lifecycle
// =============================================================================

beforeEach(() => {
  // Reset UIStore to initial state
  useUIStore.setState(useUIStore.getInitialState(), true);

  // Clear all mocks
  vi.clearAllMocks();
});

// =============================================================================
// Integration Tests: handleStartConversation
// =============================================================================

describe('useSidebarActions', () => {
  describe('handleStartConversation', () => {
    describe('core functionality', () => {
      it('should delegate create through the conversation handler path', () => {
        const { result } = renderHook(() => useSidebarActions(createDefaultHookProps()));

        act(() => {
          result.current.handleStartConversation();
        });

        expect(mockHandleConversationCreate).toHaveBeenCalledTimes(1);
        expect(mockHandleConversationCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'conversation:create',
            title: 'Untitled',
            workspace_path: '/test/workspace',
          })
        );
      });

      it('should include uuid in the message', () => {
        const { result } = renderHook(() => useSidebarActions(createDefaultHookProps()));

        act(() => {
          result.current.handleStartConversation();
        });

        expect(mockHandleConversationCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            uuid: expect.any(String),
          })
        );
      });

      it('should close vault when creating new conversation', () => {
        // Open the vault first
        useUIStore.setState({ vaultOpen: true });
        expect(useUIStore.getState().vaultOpen).toBe(true);

        const { result } = renderHook(() => useSidebarActions(createDefaultHookProps()));

        act(() => {
          result.current.handleStartConversation();
        });

        expect(useUIStore.getState().vaultOpen).toBe(false);
      });
    });

    describe('edge cases: Untitled conversation guard', () => {
      it('should NOT create new conversation when active conversation is empty Untitled', () => {
        const untitledConversation = createMockConversation({
          sessionId: 'untitled-session',
          title: 'Untitled',
          messageCount: 0,
        });

        const { result } = renderHook(() =>
          useSidebarActions(
            createDefaultHookProps({
              conversations: [untitledConversation],
              activeConversationId: 'untitled-session',
            })
          )
        );

        act(() => {
          result.current.handleStartConversation();
        });

        // Should NOT call postMessage because current conversation is empty Untitled
        expect(mockHandleConversationCreate).not.toHaveBeenCalled();
      });

      it('should still close vault even when skipping creation for Untitled', () => {
        useUIStore.setState({ vaultOpen: true });

        const untitledConversation = createMockConversation({
          sessionId: 'untitled-session',
          title: 'Untitled',
          messageCount: 0,
        });

        const { result } = renderHook(() =>
          useSidebarActions(
            createDefaultHookProps({
              conversations: [untitledConversation],
              activeConversationId: 'untitled-session',
            })
          )
        );

        act(() => {
          result.current.handleStartConversation();
        });

        // Vault should still close
        expect(useUIStore.getState().vaultOpen).toBe(false);
        // But no message sent
        expect(mockHandleConversationCreate).not.toHaveBeenCalled();
      });

      it('should create new conversation when active conversation is Untitled but has messages', () => {
        const untitledConversation = createMockConversation({
          sessionId: 'untitled-session',
          title: 'Untitled',
          messageCount: 3,
        });

        const { result } = renderHook(() =>
          useSidebarActions(
            createDefaultHookProps({
              conversations: [untitledConversation],
              activeConversationId: 'untitled-session',
            })
          )
        );

        act(() => {
          result.current.handleStartConversation();
        });

        expect(mockHandleConversationCreate).toHaveBeenCalledTimes(1);
      });

      it('should create new conversation when active conversation has a real title', () => {
        const namedConversation = createMockConversation({
          sessionId: 'named-session',
          title: 'My Important Chat',
        });

        const { result } = renderHook(() =>
          useSidebarActions(
            createDefaultHookProps({
              conversations: [namedConversation],
              activeConversationId: 'named-session',
            })
          )
        );

        act(() => {
          result.current.handleStartConversation();
        });

        expect(mockHandleConversationCreate).toHaveBeenCalledTimes(1);
      });
    });

    describe('edge cases: no active conversation', () => {
      it('should create new conversation when no active conversation exists', () => {
        const { result } = renderHook(() =>
          useSidebarActions(
            createDefaultHookProps({
              conversations: [],
              activeConversationId: null,
            })
          )
        );

        act(() => {
          result.current.handleStartConversation();
        });

        expect(mockHandleConversationCreate).toHaveBeenCalledTimes(1);
        expect(mockHandleConversationCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'conversation:create',
          })
        );
      });

      it('should create new conversation when activeConversationId does not match any conversation', () => {
        const conversation = createMockConversation({
          sessionId: 'existing-session',
          title: 'Existing Chat',
        });

        const { result } = renderHook(() =>
          useSidebarActions(
            createDefaultHookProps({
              conversations: [conversation],
              activeConversationId: 'non-existent-id', // Does not match
            })
          )
        );

        act(() => {
          result.current.handleStartConversation();
        });

        // Should create because activeConv will be undefined
        expect(mockHandleConversationCreate).toHaveBeenCalledTimes(1);
      });
    });

    describe('edge cases: no workspace path', () => {
      it('should send undefined workspace_path when workspacePath is null', () => {
        const { result } = renderHook(() =>
          useSidebarActions(
            createDefaultHookProps({
              workspacePath: null,
            })
          )
        );

        act(() => {
          result.current.handleStartConversation();
        });

        expect(mockHandleConversationCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'conversation:create',
            workspace_path: undefined,
          })
        );
      });
    });

    describe('edge cases: rapid interactions', () => {
      it('should handle rapid double-clicks (both calls proceed)', () => {
        const { result } = renderHook(() => useSidebarActions(createDefaultHookProps()));

        act(() => {
          // Simulate rapid double-click
          result.current.handleStartConversation();
          result.current.handleStartConversation();
        });

        // Both calls should proceed (no debounce)
        expect(mockHandleConversationCreate).toHaveBeenCalledTimes(2);
      });
    });

    describe('edge cases: postMessage failure', () => {
      it('should not throw when conversation creation fails', async () => {
        mockHandleConversationCreate.mockImplementationOnce(() => {
          throw new Error('create failed');
        });

        const { result } = renderHook(() => useSidebarActions(createDefaultHookProps()));

        await act(async () => {
          await Promise.resolve().then(() => {
            result.current.handleStartConversation();
          });
          await Promise.resolve();
        });
      });

      it('should show an error toast when conversation creation fails', async () => {
        mockHandleConversationCreate.mockImplementationOnce(() => {
          throw new Error('create failed');
        });

        const { result } = renderHook(() => useSidebarActions(createDefaultHookProps()));

        await act(async () => {
          await Promise.resolve().then(() => {
            result.current.handleStartConversation();
          });
          await Promise.resolve();
        });

        expect(mockToastError).toHaveBeenCalledWith('Failed to create conversation');
      });

      it('should still close vault even if postMessage would fail after', () => {
        // Vault should close BEFORE postMessage is called
        useUIStore.setState({ vaultOpen: true });

        let vaultStateWhenCreateCalled = true;
        mockHandleConversationCreate.mockImplementationOnce(() => {
          vaultStateWhenCreateCalled = useUIStore.getState().vaultOpen;
          return 'created-session-id';
        });

        const { result } = renderHook(() => useSidebarActions(createDefaultHookProps()));

        act(() => {
          result.current.handleStartConversation();
        });

        // Vault should have been closed BEFORE postMessage was called
        expect(vaultStateWhenCreateCalled).toBe(false);
      });
    });
  });

  // =============================================================================
  // Integration Tests: handleLoadConversation
  // =============================================================================

  describe('handleLoadConversation', () => {
    it('should send conversation:load message with session_id', () => {
      const { result } = renderHook(() => useSidebarActions(createDefaultHookProps()));

      act(() => {
        result.current.handleLoadConversation('target-session-id');
      });

      expect(mockHandleConversationLoad).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'conversation:load',
          session_id: 'target-session-id',
        })
      );
    });

    it('should set loading states before sending message', () => {
      const { result } = renderHook(() => useSidebarActions(createDefaultHookProps()));

      act(() => {
        result.current.handleLoadConversation('target-session-id');
      });

      expect(useUIStore.getState().isLoadingConversation).toBe(true);
      expect(useUIStore.getState().isConversationTransitioning).toBe(true);
    });

    it('should close vault when loading conversation', () => {
      useUIStore.setState({ vaultOpen: true });

      const { result } = renderHook(() => useSidebarActions(createDefaultHookProps()));

      act(() => {
        result.current.handleLoadConversation('target-session-id');
      });

      expect(useUIStore.getState().vaultOpen).toBe(false);
    });

    it('should NOT load conversation if already viewing it', () => {
      const { result } = renderHook(() =>
        useSidebarActions(
          createDefaultHookProps({
            activeConversationId: 'current-session',
          })
        )
      );

      act(() => {
        result.current.handleLoadConversation('current-session');
      });

      // Should not send message or set loading states
      expect(mockHandleConversationLoad).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // Integration Tests: handleOpenQuickSearch
  // =============================================================================

  describe('handleOpenQuickSearch', () => {
    it('should dispatch openCommandPalette custom event', () => {
      const eventSpy = vi.fn();
      window.addEventListener('openCommandPalette', eventSpy);

      const { result } = renderHook(() => useSidebarActions(createDefaultHookProps()));

      act(() => {
        result.current.handleOpenQuickSearch();
      });

      expect(eventSpy).toHaveBeenCalledTimes(1);

      window.removeEventListener('openCommandPalette', eventSpy);
    });
  });

  // =============================================================================
  // Integration Tests: handleOpenCreateWorktree
  // =============================================================================

  describe('handleOpenCreateWorktree', () => {
    it('should open create worktree dialog', () => {
      const { result } = renderHook(() => useSidebarActions(createDefaultHookProps()));

      act(() => {
        result.current.handleOpenCreateWorktree();
      });

      expect(useUIStore.getState().createWorktreeDialogOpen).toBe(true);
    });
  });

  // =============================================================================
  // Integration Tests: handleRemoveWorktree
  // =============================================================================

  describe('handleRemoveWorktree', () => {
    it('passes deleteBranch=true to gitWorktreeRemove', async () => {
      const { result } = renderHook(() => useSidebarActions(createDefaultHookProps()));
      const worktree = createMockWorktree();

      act(() => {
        result.current.handleOpenDeleteWorktreeDialog(worktree);
      });

      await act(async () => {
        await result.current.handleRemoveWorktree(true);
      });

      expect(mockGitWorktreeRemove).toHaveBeenCalledWith(
        '/test/workspace',
        worktree.path,
        false,
        true
      );
    });

    it('passes deleteBranch=false to gitWorktreeRemove', async () => {
      const { result } = renderHook(() => useSidebarActions(createDefaultHookProps()));
      const worktree = createMockWorktree();

      act(() => {
        result.current.handleOpenDeleteWorktreeDialog(worktree);
      });

      await act(async () => {
        await result.current.handleRemoveWorktree(false);
      });

      expect(mockGitWorktreeRemove).toHaveBeenCalledWith(
        '/test/workspace',
        worktree.path,
        false,
        false
      );
    });

    it('handles null branch with deleteBranch=true gracefully', async () => {
      const { result } = renderHook(() => useSidebarActions(createDefaultHookProps()));
      const worktree = createMockWorktree({ branch: null });

      act(() => {
        result.current.handleOpenDeleteWorktreeDialog(worktree);
      });

      await act(async () => {
        await result.current.handleRemoveWorktree(true);
      });

      expect(mockGitWorktreeRemove).toHaveBeenCalledWith(
        '/test/workspace',
        worktree.path,
        false,
        true
      );
      expect(mockToastSuccess).toHaveBeenCalledWith('Worktree deleted');
      expect(mockToastSuccess).not.toHaveBeenCalledWith(
        expect.stringContaining('Worktree and branch')
      );
    });

    it('prevents duplicate calls on rapid double-click', async () => {
      let resolveRemove: ((value: { branchDeleteFailed: string | null }) => void) | undefined;

      mockGitWorktreeRemove.mockImplementationOnce(
        () =>
          new Promise<{ branchDeleteFailed: string | null }>((resolve) => {
            resolveRemove = resolve;
          })
      );

      const { result } = renderHook(() => useSidebarActions(createDefaultHookProps()));
      const worktree = createMockWorktree();

      act(() => {
        result.current.handleOpenDeleteWorktreeDialog(worktree);
      });

      let firstRemoval: Promise<void> = Promise.resolve();
      let secondRemoval: Promise<void> = Promise.resolve();
      act(() => {
        firstRemoval = result.current.handleRemoveWorktree(false);
        secondRemoval = result.current.handleRemoveWorktree(false);
      });

      expect(mockGitWorktreeRemove).toHaveBeenCalledTimes(1);

      resolveRemove?.({ branchDeleteFailed: null });

      await act(async () => {
        await Promise.all([firstRemoval, secondRemoval]);
      });
    });

    it('shows error toast when backend remove fails and keeps dialog state', async () => {
      const error = new Error('worktree does not exist');
      mockGitWorktreeRemove.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useSidebarActions(createDefaultHookProps()));
      const worktree = createMockWorktree();

      act(() => {
        result.current.handleOpenDeleteWorktreeDialog(worktree);
      });

      await act(async () => {
        await result.current.handleRemoveWorktree(false);
      });

      expect(mockToastError).toHaveBeenCalledWith('Failed to remove worktree');
      expect(result.current.worktreeDeleteDialogOpen).toBe(true);
      expect(result.current.worktreeToDelete).toEqual(worktree);
    });

    it('shows warning toast when branch deletion fails', async () => {
      const failureMessage = 'Branch "feature/x" is checked out elsewhere';
      mockGitWorktreeRemove.mockResolvedValueOnce({
        branchDeleteFailed: failureMessage,
      });

      const { result } = renderHook(() => useSidebarActions(createDefaultHookProps()));
      const worktree = createMockWorktree();

      act(() => {
        result.current.handleOpenDeleteWorktreeDialog(worktree);
      });

      await act(async () => {
        await result.current.handleRemoveWorktree(true);
      });

      expect(mockToastWarning).toHaveBeenCalledWith('Worktree deleted, but branch removal failed', {
        description: failureMessage,
      });
      expect(mockToastSuccess).not.toHaveBeenCalledWith('Worktree and branch "feature/x" deleted');
    });
  });

  // =============================================================================
  // Integration Tests: handleOpenDeleteDialog
  // =============================================================================

  describe('handleOpenDeleteDialog', () => {
    it('should open delete dialog and set conversation to delete', () => {
      const conversation = createMockConversation({
        sessionId: 'delete-me',
        title: 'To Be Deleted',
      });

      const { result } = renderHook(() => useSidebarActions(createDefaultHookProps()));

      act(() => {
        result.current.handleOpenDeleteDialog(conversation);
      });

      expect(result.current.deleteDialogOpen).toBe(true);
      expect(result.current.conversationToDelete).toEqual(conversation);
    });
  });

  // =============================================================================
  // Integration Tests: handleRenameConversation
  // =============================================================================

  describe('handleRenameConversation', () => {
    it('should delegate renames through applyManualSessionTitle', () => {
      const conversation = createMockConversation({
        sessionId: 'rename-me',
        title: 'Old Title',
      });

      useUIStore.setState({
        conversations: [conversation],
      });

      const { result } = renderHook(() =>
        useSidebarActions(
          createDefaultHookProps({
            conversations: [conversation],
          })
        )
      );

      act(() => {
        result.current.handleRenameConversation('rename-me', 'New Title');
      });

      expect(mockApplyManualSessionTitle).toHaveBeenCalledWith('rename-me', 'New Title');
    });

    it('should clear editing state after rename', () => {
      useUIStore.setState({
        editingConversationId: 'rename-me',
      });

      const { result } = renderHook(() => useSidebarActions(createDefaultHookProps()));

      act(() => {
        result.current.handleRenameConversation('rename-me', 'New Title');
      });

      expect(useUIStore.getState().editingConversationId).toBe(null);
    });
  });

  // =============================================================================
  // Integration Tests: handleDeleteConversation
  // =============================================================================

  describe('handleDeleteConversation', () => {
    it('should remove conversation from store optimistically', async () => {
      const conversation = createMockConversation({
        sessionId: 'delete-me',
        title: 'To Delete',
      });

      useUIStore.setState({
        conversations: [conversation],
      });

      const { result } = renderHook(() =>
        useSidebarActions(
          createDefaultHookProps({
            conversations: [conversation],
          })
        )
      );

      await act(async () => {
        await result.current.handleDeleteConversation('delete-me');
      });

      const remaining = useUIStore.getState().conversations;
      expect(
        remaining.find((c: ConversationSummary) => c.sessionId === 'delete-me')
      ).toBeUndefined();
    });

    it('should clear session title state during delete cleanup', async () => {
      const conversation = createMockConversation({
        sessionId: 'delete-me',
        title: 'To Delete',
      });

      const { result } = renderHook(() =>
        useSidebarActions(
          createDefaultHookProps({
            conversations: [conversation],
          })
        )
      );

      await act(async () => {
        await result.current.handleDeleteConversation('delete-me');
      });

      expect(mockClearSessionTitleState).toHaveBeenCalledWith('delete-me');
    });

    it('should close delete dialog after deletion', async () => {
      const conversation = createMockConversation({ sessionId: 'delete-me' });

      const { result } = renderHook(() =>
        useSidebarActions(
          createDefaultHookProps({
            conversations: [conversation],
          })
        )
      );

      // Open the dialog first
      act(() => {
        result.current.handleOpenDeleteDialog(conversation);
      });

      expect(result.current.deleteDialogOpen).toBe(true);

      await act(async () => {
        await result.current.handleDeleteConversation('delete-me');
      });

      expect(result.current.deleteDialogOpen).toBe(false);
      expect(result.current.conversationToDelete).toBe(null);
    });
  });

  // =============================================================================
  // Integration Tests: Return Value Shape
  // =============================================================================

  describe('return value shape', () => {
    it('should return all expected handlers', () => {
      const { result } = renderHook(() => useSidebarActions(createDefaultHookProps()));

      expect(result.current).toEqual(
        expect.objectContaining({
          deleteDialogOpen: expect.any(Boolean),
          setDeleteDialogOpen: expect.any(Function),
          conversationToDelete: null,
          handleStartConversation: expect.any(Function),
          handleLoadConversation: expect.any(Function),
          handleOpenQuickSearch: expect.any(Function),
          handleOpenCreateWorktree: expect.any(Function),
          handleRemoveWorktree: expect.any(Function),
          handleRenameConversation: expect.any(Function),
          handleDeleteConversation: expect.any(Function),
          handleOpenDeleteDialog: expect.any(Function),
          handleDuplicateConversation: expect.any(Function),
          loadWorktrees: expect.any(Function),
        })
      );
    });
  });
});
