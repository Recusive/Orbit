import { startTransition } from 'react';

import { claudeConversationRepo } from './claude-conversation-repo';

import type { ConversationListContext, ConversationUiBridge } from './types';

import { applyManualSessionTitle } from '@/services/session';
import { useMessageBufferStore } from '@/stores/agent/message-buffer-store';
import { useChatStore } from '@/stores/chat/chat-store';
import { useFileStore } from '@/stores/file/file-store';
import { useUIStore } from '@/stores/ui/ui-store';

export const claudeUiBridge: ConversationUiBridge = {
  getActiveSessionId(): string | null {
    return useUIStore.getState().activeConversationId;
  },

  async select(sessionId): Promise<void> {
    if (sessionId === useUIStore.getState().activeConversationId) {
      return;
    }

    const uiState = useUIStore.getState();
    const title =
      uiState.conversations.find((conversation) => conversation.sessionId === sessionId)?.title ??
      null;

    uiState.setLoadingConversation(true);
    uiState.setConversationTransitioning(true);
    uiState.setActiveConversation(sessionId, title);
    useMessageBufferStore.getState().markLoadPending(sessionId);
    useChatStore.getState().setActiveSession(sessionId);
    useFileStore.getState().switchSession(sessionId);

    await new Promise<void>((resolve, reject) => {
      startTransition(() => {
        claudeConversationRepo
          .load(sessionId)
          .then(() => {
            resolve();
          })
          .catch(reject);
      });
    });
  },

  async restoreSelection(): Promise<void> {
    const sessionId = claudeConversationRepo.restoreActiveSession();
    if (!sessionId) {
      return;
    }
    await this.select(sessionId);
  },

  getActiveMeta() {
    const state = useUIStore.getState();
    const activeId = state.activeConversationId;
    return {
      id: activeId,
      title: state.activeConversationTitle,
      isTitleLoading: activeId ? state.titleLoadingSessions.has(activeId) : false,
    };
  },

  list() {
    return useUIStore.getState().conversations.map((conversation) => ({
      createdAt: conversation.updatedAt,
      sessionId: conversation.sessionId,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
      messageCount: conversation.messageCount,
      ...(conversation.workspacePath ? { workspacePath: conversation.workspacePath } : {}),
      ...(conversation.worktreePath ? { worktreePath: conversation.worktreePath } : {}),
    }));
  },

  async create(input): Promise<void> {
    await claudeConversationRepo.create(input);
  },

  async rename(sessionId, title): Promise<void> {
    await applyManualSessionTitle(sessionId, title);
    await claudeConversationRepo.updateTitle(sessionId, title);
  },

  async remove(sessionId): Promise<void> {
    useUIStore.getState().removeConversation(sessionId);
    await claudeConversationRepo.remove(sessionId);
  },

  async hydrateWorkspace(context: ConversationListContext): Promise<void> {
    const conversations = await claudeConversationRepo.list(context);
    useUIStore.getState().setConversations(
      conversations.map((conversation) => ({
        sessionId: conversation.sessionId,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
        messageCount: conversation.messageCount,
        ...(conversation.workspacePath ? { workspacePath: conversation.workspacePath } : {}),
        ...(conversation.worktreePath ? { worktreePath: conversation.worktreePath } : {}),
      }))
    );
  },
};
