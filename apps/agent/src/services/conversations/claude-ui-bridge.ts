import { createLogger } from '@orbit/common/lib';
import { startTransition } from 'react';

import { claudeConversationRepo } from './claude-conversation-repo';

import type { ConversationListContext, ConversationUiBridge } from './types';

import { applyManualSessionTitle } from '@/services/session';
import { useMessageBufferStore } from '@/stores/agent/message-buffer-store';
import { useChatStore } from '@/stores/chat/chat-store';
import { useFileStore } from '@/stores/file/file-store';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('UiBridge');

export const claudeUiBridge: ConversationUiBridge = {
  getActiveSessionId(): string | null {
    return useUIStore.getState().activeConversationId;
  },

  async select(sessionId): Promise<void> {
    if (sessionId === useUIStore.getState().activeConversationId) {
      return;
    }

    const uiState = useUIStore.getState();
    const chatStore = useChatStore.getState();
    const title =
      uiState.conversations.find((conversation) => conversation.sessionId === sessionId)?.title ??
      null;
    const isHydrated = chatStore.sessions[sessionId]?.hydrationState === 'hydrated';
    const prevActive = uiState.activeConversationId;
    const msgCount = chatStore.sessions[sessionId]?.messages.length ?? 0;
    const sid = sessionId.slice(-6);

    logger.debug(`select(${sid})`, {
      from: prevActive?.slice(-6) ?? '(none)',
      isHydrated,
      msgCount,
      path: isHydrated ? 'HYDRATED (instant)' : 'UNLOADED (first visit)',
    });

    if (isHydrated) {
      // Multi-instance keep-alive: the VirtuosoMessageList instance is already
      // mounted with correct data and scroll position. Just flip the CSS toggle.
      // NO conversation.load — avoids 51+ restoreToolsForMessage calls that
      // re-render all 10 mounted instances (the FPS→2 killer).
      // NO session-restore — instance already has the correct scroll position.
      uiState.setActiveConversation(sessionId, title);
      chatStore.setActiveSession(sessionId);
      useFileStore.getState().switchSession(sessionId);
      uiState.setLoadingConversation(false);
      uiState.setConversationTransitioning(false);
      logger.debug(`[${sid}] Hydrated instant switch (no load)`);
      return;
    }

    // First visit: SessionInstance handles per-instance stabilization.
    uiState.setLoadingConversation(true);
    uiState.setConversationTransitioning(true);
    uiState.setActiveConversation(sessionId, title);
    useMessageBufferStore.getState().markLoadPending(sessionId);
    chatStore.setActiveSession(sessionId);
    useFileStore.getState().switchSession(sessionId);

    const loadStart = performance.now();
    await new Promise<void>((resolve, reject) => {
      startTransition(() => {
        claudeConversationRepo
          .load(sessionId)
          .then(() => {
            logger.debug(`[${sid}] conversation.load completed`, {
              elapsed: `${(performance.now() - loadStart).toFixed(0)}ms`,
            });
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
