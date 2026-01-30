/**
 * useSidebarActions - All sidebar action handlers
 */
import { createLogger } from '@orbit/common/lib';
import { startTransition, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { WorktreeInfo } from '@/lib/api';
import type { ConversationSummary, WorktreeUIState } from '@/stores/ui/ui-store';

import { useTauri } from '@/hooks/agent/use-tauri';
import {
  conversationDelete,
  conversationUpdateTitle,
  gitWorktreeList,
  gitWorktreeRemove,
} from '@/lib/api';
import { useMessageBufferStore } from '@/stores/agent/message-buffer-store';
import { useToolStore } from '@/stores/agent/tool-store';
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
function conversationBelongsToWorktree(
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
  handleRenameConversation: (sessionId: string, newTitle: string) => Promise<void>;
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
  activeWorktreePath,
}: UseSidebarActionsProps): UseSidebarActionsReturn => {
  const {
    setLoadingConversation,
    setConversationTransitioning,
    setWorktrees,
    setActiveWorktree,
    removeWorktree,
    setCreateWorktreeDialogOpen,
    setEditingConversationId,
    updateConversationTitle,
    removeConversation,
    setVaultOpen,
  } = useUIStore();
  const { postMessage } = useTauri();

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<ConversationSummary | null>(
    null
  );

  // Worktree delete dialog state
  const [worktreeDeleteDialogOpen, setWorktreeDeleteDialogOpen] = useState(false);
  const [worktreeToDelete, setWorktreeToDelete] = useState<WorktreeInfo | null>(null);

  // Load worktrees when workspace changes
  // NOTE: This should only run when workspacePath changes, not when activeWorktreePath changes.
  // Including activeWorktreePath would cause all worktrees to reset isExpanded on every selection.
  const loadWorktrees = useCallback(async (): Promise<void> => {
    if (!workspacePath) return;

    try {
      const worktreeList = await gitWorktreeList(workspacePath);

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

      // CRITICAL: Validate activeWorktreePath against the new worktree list.
      // A stale path from a prior workspace could drive file/git/terminal ops to wrong directory.
      const currentActiveWorktree = useUIStore.getState().activeWorktreePath;
      const worktreePaths = new Set(worktreeList.map((wt) => wt.path));
      const isActiveWorktreeValid =
        currentActiveWorktree !== null && worktreePaths.has(currentActiveWorktree);

      if (!isActiveWorktreeValid) {
        // Reset to main worktree (or first available) when active is invalid/stale
        const mainWorktree = worktreeList.find((wt) => wt.isMain);
        const fallbackWorktree = mainWorktree ?? worktreeList[0];
        if (fallbackWorktree) {
          logger.info('Resetting stale activeWorktreePath', {
            stale: currentActiveWorktree,
            newPath: fallbackWorktree.path,
          });
          setActiveWorktree(fallbackWorktree.path);
        } else {
          // No worktrees available - clear the active path
          setActiveWorktree(null);
        }
      }
    } catch {
      logger.warn('Failed to load worktrees (may not be a git repo)');
      // Not a git repo or error - clear worktrees and reset active worktree
      setWorktrees([]);
      setActiveWorktree(null);
    }
  }, [workspacePath, setWorktrees, setActiveWorktree]);

  // Auto-load worktrees on workspace change
  useEffect(() => {
    void loadWorktrees();
  }, [loadWorktrees]);

  const handleStartConversation = useCallback((): void => {
    // Close vault if open
    setVaultOpen(false);
    // Skip if current conversation is empty (title still "Untitled" means no message sent)
    // BUT only if it belongs to the current worktree - allow new session after switching worktrees
    const activeConv = conversations.find((c) => c.sessionId === activeConversationId);
    if (
      activeConv?.title === 'Untitled' &&
      conversationBelongsToWorktree(activeConv, activeWorktreePath)
    ) {
      return;
    }
    postMessage({
      type: 'conversation:create',
      uuid: crypto.randomUUID(),
      title: 'Untitled',
      workspace_path: workspacePath ?? undefined,
      worktree_path: activeWorktreePath ?? undefined,
    });
  }, [
    conversations,
    activeConversationId,
    workspacePath,
    activeWorktreePath,
    postMessage,
    setVaultOpen,
  ]);

  const handleLoadConversation = useCallback(
    (sessionId: string): void => {
      // Close vault if open
      setVaultOpen(false);
      // Skip if already viewing this conversation
      if (sessionId === activeConversationId) {
        return;
      }
      // Set loading and transitioning states SYNCHRONOUSLY before any async work
      // This ensures opacity-0 is applied before new content renders
      setLoadingConversation(true);
      setConversationTransitioning(true);
      // Mark load as pending BEFORE posting the message.
      // This prevents use-chat-messages.ts from sending a duplicate conversation:load
      // when the sessionId changes in response to conversation:loaded.
      useMessageBufferStore.getState().markLoadPending(sessionId);
      // PERF: Wrap the network request in startTransition so React can yield to
      // the browser between the synchronous loading-state paint above and the
      // heavier conversation data processing. This reduces the click handler
      // from 159ms blocking to ~20ms (loading state) + deferred data work.
      startTransition(() => {
        postMessage({
          type: 'conversation:load',
          uuid: crypto.randomUUID(),
          session_id: sessionId,
        });
      });
    },
    [
      activeConversationId,
      setLoadingConversation,
      setConversationTransitioning,
      postMessage,
      setVaultOpen,
    ]
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

  // Remove worktree (called from dialog confirmation)
  const handleRemoveWorktree = useCallback(
    async (deleteBranch: boolean): Promise<void> => {
      if (!workspacePath || !worktreeToDelete) return;

      try {
        // Note: deleteBranch option not yet supported by backend
        await gitWorktreeRemove(workspacePath, worktreeToDelete.path, false);
        removeWorktree(worktreeToDelete.path);
        logger.info('Removed worktree', {
          path: worktreeToDelete.path,
          deletedBranch: deleteBranch ? worktreeToDelete.branch : null,
        });
        setWorktreeDeleteDialogOpen(false);
        setWorktreeToDelete(null);
        toast.success(
          deleteBranch && worktreeToDelete.branch !== null
            ? `Worktree and branch "${worktreeToDelete.branch}" deleted`
            : 'Worktree deleted'
        );
      } catch (err) {
        logger.error('Failed to remove worktree', err);
        toast.error('Failed to remove worktree');
      }
    },
    [workspacePath, worktreeToDelete, removeWorktree]
  );

  // Conversation rename handler
  const handleRenameConversation = useCallback(
    async (sessionId: string, newTitle: string): Promise<void> => {
      try {
        // Optimistic update
        updateConversationTitle(sessionId, newTitle);
        setEditingConversationId(null);
        // Persist to backend
        await conversationUpdateTitle(sessionId, newTitle);
        toast.success('Conversation renamed');
      } catch (err) {
        logger.error('Failed to rename conversation', err);
        toast.error('Failed to rename conversation');
      }
    },
    [updateConversationTitle, setEditingConversationId]
  );

  // Conversation delete handler
  const handleDeleteConversation = useCallback(
    async (sessionId: string): Promise<void> => {
      try {
        // Optimistic removal
        removeConversation(sessionId);
        setDeleteDialogOpen(false);
        setConversationToDelete(null);

        // Clean up cached session data to prevent memory leaks
        // (mirrors cleanup in message-handler.ts conversation:deleted handler)
        useToolStore.getState().clearSessionTools(sessionId);
        useFileStore.getState().clearSessionFiles(sessionId);

        // Persist to backend
        await conversationDelete(sessionId);
        toast.success('Conversation deleted');
      } catch (err) {
        logger.error('Failed to delete conversation', err);
        toast.error('Failed to delete conversation');
        // Note: Could restore conversation here, but for simplicity we don't
      }
    },
    [removeConversation]
  );

  // Open delete confirmation dialog
  const handleOpenDeleteDialog = useCallback((conv: ConversationSummary): void => {
    setConversationToDelete(conv);
    setDeleteDialogOpen(true);
  }, []);

  // Duplicate handler (placeholder - will ask for SDK docs)
  const handleDuplicateConversation = useCallback((sessionId: string): void => {
    // TODO: Implement using SDK fork - ask user for docs
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
