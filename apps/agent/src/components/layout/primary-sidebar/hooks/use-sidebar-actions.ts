/**
 * useSidebarActions - All sidebar action handlers
 */
import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { ConversationSummary, WorktreeUIState } from '@/stores/ui/ui-store';

import { useTauri } from '@/hooks/agent/use-tauri';
import {
  conversationDelete,
  conversationUpdateTitle,
  gitWorktreeList,
  gitWorktreeRemove,
} from '@/lib/api';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('PrimarySidebar');

interface UseSidebarActionsProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  workspacePath: string | null;
  activeWorktreePath: string | null;
}

interface UseSidebarActionsReturn {
  // Delete dialog state
  deleteDialogOpen: boolean;
  setDeleteDialogOpen: (open: boolean) => void;
  conversationToDelete: ConversationSummary | null;
  // Handlers
  handleStartConversation: () => void;
  handleLoadConversation: (sessionId: string) => void;
  handleOpenQuickSearch: () => void;
  handleOpenCreateWorktree: () => void;
  handleRemoveWorktree: (worktreePath: string) => Promise<void>;
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
  } = useUIStore();
  const { postMessage } = useTauri();

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<ConversationSummary | null>(
    null
  );

  // Load worktrees when workspace changes
  const loadWorktrees = useCallback(async (): Promise<void> => {
    if (!workspacePath) return;

    try {
      const worktreeList = await gitWorktreeList(workspacePath);
      const worktreeStates: WorktreeUIState[] = worktreeList.map((wt) => ({
        worktree: wt,
        isExpanded: true,
      }));
      setWorktrees(worktreeStates);

      // Set active worktree to main if not set
      if (!activeWorktreePath) {
        const mainWorktree = worktreeList.find((wt) => wt.isMain);
        if (mainWorktree) {
          setActiveWorktree(mainWorktree.path);
        }
      }
    } catch {
      logger.warn('Failed to load worktrees (may not be a git repo)');
      // Not a git repo or error - clear worktrees
      setWorktrees([]);
    }
  }, [workspacePath, activeWorktreePath, setWorktrees, setActiveWorktree]);

  // Auto-load worktrees on workspace change
  useEffect(() => {
    void loadWorktrees();
  }, [loadWorktrees]);

  const handleStartConversation = useCallback((): void => {
    // Skip if current conversation is empty (title still "Untitled" means no message sent)
    const activeConv = conversations.find((c) => c.sessionId === activeConversationId);
    if (activeConv?.title === 'Untitled') {
      return;
    }
    postMessage({
      type: 'conversation:create',
      uuid: crypto.randomUUID(),
      title: 'Untitled',
      workspace_path: workspacePath ?? undefined,
    });
  }, [conversations, activeConversationId, workspacePath, postMessage]);

  const handleLoadConversation = useCallback(
    (sessionId: string): void => {
      // Skip if already viewing this conversation
      if (sessionId === activeConversationId) {
        return;
      }
      // Set loading and transitioning states SYNCHRONOUSLY before any async work
      // This ensures opacity-0 is applied before new content renders
      setLoadingConversation(true);
      setConversationTransitioning(true);
      // Then request the conversation data
      postMessage({
        type: 'conversation:load',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
      });
    },
    [activeConversationId, setLoadingConversation, setConversationTransitioning, postMessage]
  );

  const handleOpenQuickSearch = useCallback((): void => {
    window.dispatchEvent(new CustomEvent('openCommandPalette'));
  }, []);

  const handleOpenCreateWorktree = useCallback((): void => {
    setCreateWorktreeDialogOpen(true);
  }, [setCreateWorktreeDialogOpen]);

  const handleRemoveWorktree = useCallback(
    async (worktreePath: string): Promise<void> => {
      if (!workspacePath) return;

      try {
        await gitWorktreeRemove(workspacePath, worktreePath, false);
        removeWorktree(worktreePath);
        logger.info('Removed worktree', { path: worktreePath });
      } catch (err) {
        logger.error('Failed to remove worktree', err);
        toast.error('Failed to remove worktree');
      }
    },
    [workspacePath, removeWorktree]
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
    handleStartConversation,
    handleLoadConversation,
    handleOpenQuickSearch,
    handleOpenCreateWorktree,
    handleRemoveWorktree,
    handleRenameConversation,
    handleDeleteConversation,
    handleOpenDeleteDialog,
    handleDuplicateConversation,
    loadWorktrees,
  };
};
