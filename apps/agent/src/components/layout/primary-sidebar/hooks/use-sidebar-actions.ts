/**
 * useSidebarActions - All sidebar action handlers
 */
import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { WorktreeInfo } from '@/lib/api';
import type { ConversationSummary, WorktreeUIState } from '@/stores/ui/ui-store';

import { gitWorktreeList, gitWorktreeRemove } from '@/lib/api';
import { invalidateAllConversationCaches } from '@/lib/query';
import { isPathEqualOrWithin, isPathWithin } from '@/lib/utils/path-utils';
import { getConversationUiBridge } from '@/services/conversations';
import { clearSessionTitleState } from '@/services/session';
import { useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';
import { useFileStore } from '@/stores/file/file-store';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('PrimarySidebar');

/**
 * Checks if a conversation belongs to the currently active worktree context.
 *
 * This handles three scenarios:
 * 1. Direct match: conversation's worktreePath equals activeWorktreePath
 * 2. Legacy fallback: no worktreePath, but workspacePath matches activeWorktreePath
 * 3. No worktree context: both are null/undefined (worktree feature not active)
 *
 * @param conversation - The conversation to check (can be undefined)
 * @param activeWorktreePath - The currently active worktree path (can be null)
 * @returns true if the conversation belongs to the current worktree context
 */
export function conversationBelongsToWorktree(
  conversation: ConversationSummary | undefined,
  activeWorktreePath: string | null
): boolean {
  if (!conversation) return false;

  const convWorktree = conversation.worktreePath ?? null;
  const convWorkspace = conversation.workspacePath ?? null;

  // Direct match: worktreePath equals activeWorktreePath
  if (convWorktree === activeWorktreePath) return true;

  // Legacy fallback: no worktreePath, but workspacePath matches
  if (convWorktree === null && convWorkspace === activeWorktreePath) return true;

  // No worktree context: both null means conversation belongs to current context
  if (convWorktree === null && activeWorktreePath === null) return true;

  return false;
}

interface UseSidebarActionsProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  workspacePath: string | null;
  activeWorktreePath: string | null;
}

interface UseSidebarActionsReturn {
  // Conversation delete dialog state
  deleteDialogOpen: boolean;
  setDeleteDialogOpen: (open: boolean) => void;
  conversationToDelete: ConversationSummary | null;
  // Worktree delete dialog state
  worktreeDeleteDialogOpen: boolean;
  setWorktreeDeleteDialogOpen: (open: boolean) => void;
  worktreeToDelete: WorktreeInfo | null;
  // Handlers
  handleStartConversation: () => void;
  handleLoadConversation: (sessionId: string) => void;
  handleOpenQuickSearch: () => void;
  handleOpenCreateWorktree: () => void;
  handleOpenDeleteWorktreeDialog: (worktree: WorktreeInfo) => void;
  handleRemoveWorktree: (deleteBranch: boolean) => Promise<void>;
  handleRenameConversation: (sessionId: string, newTitle: string) => void;
  handleDeleteConversation: (sessionId: string) => Promise<void>;
  handleOpenDeleteDialog: (conv: ConversationSummary) => void;
  handleDuplicateConversation: (sessionId: string) => void;
  // Worktree loading
  loadWorktrees: () => Promise<void>;
}

export const useSidebarActions = ({
  conversations,
  activeConversationId,
  workspacePath,
}: UseSidebarActionsProps): UseSidebarActionsReturn => {
  const setWorktrees = useUIStore((s) => s.setWorktrees);
  const setRepoRootPath = useUIStore((s) => s.setRepoRootPath);
  const switchToWorktree = useUIStore((s) => s.switchToWorktree);
  const removeWorktree = useUIStore((s) => s.removeWorktree);
  const removeConversation = useUIStore((s) => s.removeConversation);
  const setCreateWorktreeDialogOpen = useUIStore((s) => s.setCreateWorktreeDialogOpen);
  const setEditingConversationId = useUIStore((s) => s.setEditingConversationId);
  const closeSecondarySurface = useUIStore((s) => s.closeSecondarySurface);
  const repoRootPath = useUIStore((s) => s.repoRootPath);
  const bridge = getConversationUiBridge();

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<ConversationSummary | null>(
    null
  );

  // Worktree delete dialog state
  const [worktreeDeleteDialogOpen, setWorktreeDeleteDialogOpen] = useState(false);
  const [worktreeToDelete, setWorktreeToDelete] = useState<WorktreeInfo | null>(null);
  const isRemovingWorktreeRef = useRef(false);

  // Load worktrees when repo root/workspace context changes.
  // NOTE: Do not include activeWorktreePath — that would reset isExpanded on every selection.
  const loadWorktrees = useCallback(async (): Promise<void> => {
    const discoveryPath = repoRootPath ?? workspacePath;
    if (!discoveryPath) return;

    try {
      const worktreeList = await gitWorktreeList(discoveryPath);

      // GUARD: If git discovery found a PARENT repo (not the workspace itself),
      // ignore the worktree list entirely. This happens when the workspace is a
      // plain folder inside a directory that has a .git (e.g., ~/Desktop/test1
      // where ~ has .git). The user's chosen workspace must never be overridden
      // by a parent repo root — that would hijack the file explorer.
      const workspaceIsWorktree = worktreeList.some(
        (wt) =>
          isPathEqualOrWithin(discoveryPath, wt.path) && isPathEqualOrWithin(wt.path, discoveryPath)
      );
      const workspaceInsideWorktree = worktreeList.some((wt) =>
        isPathWithin(discoveryPath, wt.path)
      );

      if (!workspaceIsWorktree && workspaceInsideWorktree) {
        logger.info('Workspace is inside a parent repo, ignoring discovered worktrees', {
          workspace: discoveryPath,
          discoveredRoot: worktreeList[0]?.path,
        });
        setWorktrees([]);
        return;
      }

      const mainWorktree = worktreeList.find((wt) => wt.isMain);
      if (mainWorktree) {
        const currentRoot = useUIStore.getState().repoRootPath;
        if (currentRoot !== mainWorktree.path) {
          setRepoRootPath(mainWorktree.path);
        }
      }

      // Preserve existing isExpanded state when refreshing worktree list
      const existingWorktrees = useUIStore.getState().worktrees;
      const existingExpandedMap = new Map(
        existingWorktrees.map((wt) => [wt.worktree.path, wt.isExpanded])
      );

      const worktreeStates: WorktreeUIState[] = worktreeList.map((wt) => ({
        worktree: wt,
        // Preserve existing isExpanded state, default to true for new worktrees
        isExpanded: existingExpandedMap.get(wt.path) ?? true,
      }));
      setWorktrees(worktreeStates);

      if (worktreeList.length === 0) {
        const currentActiveWorktree = useUIStore.getState().activeWorktreePath;
        if (currentActiveWorktree !== null) {
          await invalidateAllConversationCaches();
          switchToWorktree(null);
          useChatStore.getState().clearActiveSession();
        }
        return;
      }

      // CRITICAL: Validate activeWorktreePath against the new worktree list.
      // A stale path from a prior workspace could drive file/git/terminal ops to wrong directory.
      const currentActiveWorktree = useUIStore.getState().activeWorktreePath;
      const isActiveWorktreeValid =
        currentActiveWorktree !== null &&
        worktreeList.some(
          (wt) =>
            isPathEqualOrWithin(currentActiveWorktree, wt.path) &&
            isPathEqualOrWithin(wt.path, currentActiveWorktree)
        );

      if (!isActiveWorktreeValid) {
        // Reset to main worktree (or first available) when active is invalid/stale
        const fallbackWorktree = mainWorktree ?? worktreeList[0];
        if (fallbackWorktree) {
          logger.info('Resetting stale activeWorktreePath', {
            stale: currentActiveWorktree,
            newPath: fallbackWorktree.path,
          });
          await invalidateAllConversationCaches();
          switchToWorktree(fallbackWorktree.path);
        } else {
          // No worktrees available - clear the active path
          await invalidateAllConversationCaches();
          switchToWorktree(null);
        }
        useChatStore.getState().clearActiveSession();
      } else {
        const currentWorkspace = useUIStore.getState().workspacePath;
        if (currentActiveWorktree && currentWorkspace !== currentActiveWorktree) {
          await invalidateAllConversationCaches();
          switchToWorktree(currentActiveWorktree);
        }
      }
    } catch {
      logger.warn('Failed to load worktrees (may not be a git repo)');
      // Not a git repo or error - clear the worktree list.
      setWorktrees([]);
      const current = useUIStore.getState().activeWorktreePath;
      const root = useUIStore.getState().repoRootPath;
      if (current !== null && current !== root) {
        await invalidateAllConversationCaches();
        switchToWorktree(null);
        useChatStore.getState().clearActiveSession();
      }
    }
  }, [repoRootPath, workspacePath, setRepoRootPath, setWorktrees, switchToWorktree]);

  // Auto-load worktrees on workspace change
  useEffect(() => {
    void loadWorktrees();
  }, [loadWorktrees]);

  const handleStartConversation = useCallback((): void => {
    closeSecondarySurface();
    // Skip only if current conversation is truly empty.
    // Title alone is not a reliable signal because many persisted sessions stay "Untitled".
    const activeConv = conversations.find((c) => c.sessionId === activeConversationId);
    if (activeConv?.title === 'Untitled' && activeConv.messageCount === 0) {
      return;
    }
    void bridge.create({ title: 'Untitled' }).catch((err: unknown) => {
      logger.error('Failed to create conversation', err);
      toast.error('Failed to create conversation');
    });
  }, [activeConversationId, bridge, closeSecondarySurface, conversations]);

  const handleLoadConversation = useCallback(
    (sessionId: string): void => {
      closeSecondarySurface();
      if (sessionId === activeConversationId) {
        return;
      }
      void bridge.select(sessionId);
    },
    [activeConversationId, bridge, closeSecondarySurface]
  );

  const handleOpenQuickSearch = useCallback((): void => {
    window.dispatchEvent(new CustomEvent('openCommandPalette'));
  }, []);

  const handleOpenCreateWorktree = useCallback((): void => {
    setCreateWorktreeDialogOpen(true);
  }, [setCreateWorktreeDialogOpen]);

  // Open delete worktree confirmation dialog
  const handleOpenDeleteWorktreeDialog = useCallback((worktree: WorktreeInfo): void => {
    setWorktreeToDelete(worktree);
    setWorktreeDeleteDialogOpen(true);
  }, []);

  /**
   * Remove worktree (called from dialog confirmation).
   *
   * [warning] TESTED: This function is covered by integration tests.
   *     If you modify this, run: bun test apps/agent/src/__tests__/integration/hooks/primary-sidebar/use-sidebar-actions.test.tsx
   *     Test file: apps/agent/src/__tests__/integration/hooks/primary-sidebar/use-sidebar-actions.test.tsx
   */
  const handleRemoveWorktree = useCallback(
    async (deleteBranch: boolean): Promise<void> => {
      if (isRemovingWorktreeRef.current) {
        return;
      }

      const repoRoot = useUIStore.getState().repoRootPath;
      const removePath = repoRoot ?? workspacePath;
      if (!removePath || !worktreeToDelete) {
        return;
      }

      const deletingWorktree = worktreeToDelete;
      isRemovingWorktreeRef.current = true;

      try {
        const result = await gitWorktreeRemove(
          removePath,
          deletingWorktree.path,
          false,
          deleteBranch
        );

        if (useUIStore.getState().activeWorktreePath === deletingWorktree.path) {
          await invalidateAllConversationCaches();
        }
        removeWorktree(deletingWorktree.path);
        useChatStore.getState().clearActiveSession();
        logger.info('Removed worktree', {
          path: deletingWorktree.path,
          deletedBranch: deleteBranch ? deletingWorktree.branch : null,
        });
        setWorktreeDeleteDialogOpen(false);
        setWorktreeToDelete(null);
        if (result.branchDeleteFailed !== null) {
          toast.warning('Worktree deleted, but branch removal failed', {
            description: result.branchDeleteFailed,
          });
        } else if (deleteBranch && deletingWorktree.branch !== null) {
          toast.success(`Worktree and branch "${deletingWorktree.branch}" deleted`);
        } else {
          toast.success('Worktree deleted');
        }
      } catch (err) {
        logger.error('Failed to remove worktree', err);
        toast.error('Failed to remove worktree');
      } finally {
        isRemovingWorktreeRef.current = false;
      }
    },
    [workspacePath, worktreeToDelete, removeWorktree]
  );

  /**
   * Conversation rename handler.
   *
   * [warning] TESTED: This rename/delete flow is covered by integration tests.
   *     If you modify this, run: bun test apps/agent/src/__tests__/integration/hooks/primary-sidebar/use-sidebar-actions.test.tsx
   *     Test file: apps/agent/src/__tests__/integration/hooks/primary-sidebar/use-sidebar-actions.test.tsx
   */
  const handleRenameConversation = useCallback(
    (sessionId: string, newTitle: string): void => {
      setEditingConversationId(null);

      void bridge
        .rename(sessionId, newTitle)
        .then(() => {
          toast.success('Conversation renamed');
        })
        .catch((err: unknown) => {
          logger.error('Failed to persist renamed conversation title', err);
          toast.error('Failed to rename conversation');
        });
    },
    [bridge, setEditingConversationId]
  );

  /** Conversation delete handler. See integration test warning above. */
  const handleDeleteConversation = useCallback(
    async (sessionId: string): Promise<void> => {
      try {
        removeConversation(sessionId);

        await bridge.remove(sessionId);
        setDeleteDialogOpen(false);
        setConversationToDelete(null);

        useToolStore.getState().clearSessionTools(sessionId);
        useFileStore.getState().clearSessionFiles(sessionId);
        clearSessionTitleState(sessionId);
        toast.success('Conversation deleted');
      } catch (err) {
        logger.error('Failed to delete conversation', err);
        toast.error('Failed to delete conversation');
      }
    },
    [bridge, removeConversation]
  );

  // Open delete confirmation dialog
  const handleOpenDeleteDialog = useCallback((conv: ConversationSummary): void => {
    setConversationToDelete(conv);
    setDeleteDialogOpen(true);
  }, []);

  // Duplicate handler — placeholder until SDK conversation-fork API is available.
  // Blocked on: Claude Agent SDK fork/duplicate support (not yet in SDK).
  const handleDuplicateConversation = useCallback((sessionId: string): void => {
    logger.info('Duplicate requested for conversation', { sessionId });
    toast.info('Duplicate feature coming soon');
  }, []);

  return {
    deleteDialogOpen,
    setDeleteDialogOpen,
    conversationToDelete,
    worktreeDeleteDialogOpen,
    setWorktreeDeleteDialogOpen,
    worktreeToDelete,
    handleStartConversation,
    handleLoadConversation,
    handleOpenQuickSearch,
    handleOpenCreateWorktree,
    handleOpenDeleteWorktreeDialog,
    handleRemoveWorktree,
    handleRenameConversation,
    handleDeleteConversation,
    handleOpenDeleteDialog,
    handleDuplicateConversation,
    loadWorktrees,
  };
};
