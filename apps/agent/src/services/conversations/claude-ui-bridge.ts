import { createLogger } from '@orbit/common/lib';
import { startTransition } from 'react';

import { claudeConversationRepo } from './claude-conversation-repo';

import type { ConversationListContext, ConversationUiBridge } from './types';
import type { ConversationDetailResult } from '@/lib/query/conversation-detail';

import {
  getFreshConversationDetail,
  loadConversationDetailFresh,
} from '@/lib/query/conversation-detail';
import {
  getConversationGeneration,
  getWorkspaceEpoch,
  markConversationTitleDirty,
  removeConversationCache,
} from '@/lib/query/conversation-detail-cache';
import { queryClient } from '@/lib/query/query-client';
import { queryKeys } from '@/lib/query/query-keys';
import { hydrateConversationSnapshot } from '@/services/chat/hydrate-conversation-snapshot';
import { applyManualSessionTitle } from '@/services/session';
import { useMessageBufferStore } from '@/stores/agent/message-buffer-store';
import { useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';
import { useFileStore } from '@/stores/file/file-store';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('UiBridge');

type RevealableConversationDetail = Exclude<ConversationDetailResult, { kind: 'error' }>;

function isRevealableConversationDetail(value: unknown): value is RevealableConversationDetail {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const candidate = value as {
    kind?: unknown;
    conversation?: unknown;
  };
  if (candidate.kind !== 'data' && candidate.kind !== 'empty') {
    return false;
  }
  if (candidate.conversation === null || typeof candidate.conversation !== 'object') {
    return false;
  }

  const conversation = candidate.conversation as { title?: unknown };
  return typeof conversation.title === 'string';
}

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

    const freshResultValue = getFreshConversationDetail(sessionId) as unknown;
    const freshResult = isRevealableConversationDetail(freshResultValue) ? freshResultValue : null;
    if (freshResult) {
      uiState.setActiveConversation(sessionId, title ?? freshResult.conversation.title);
      chatStore.setActiveSession(sessionId);
      chatStore.markSessionLoaded(sessionId);
      useFileStore.getState().switchSession(sessionId);

      if (freshResult.kind === 'data') {
        hydrateConversationSnapshot({
          sessionId,
          persistedMessages: freshResult.conversation.messages,
          sessionUsage: freshResult.conversation.sessionUsage,
          scrollIntent: 'session-restore',
          source: 'query-fast-path',
          title: title ?? freshResult.conversation.title,
        });
      } else {
        chatStore.setMessages(sessionId, [], 'session-restore');
        chatStore.markSessionHydrated(sessionId);
        chatStore.markSessionLoaded(sessionId);
        chatStore.bumpConversationLoadEpoch();
        useToolStore.getState().switchSession(sessionId);
      }

      uiState.setLoadingConversation(false);
      uiState.setConversationTransitioning(false);
      logger.debug(`[${sid}] FAST PATH: ${freshResult.kind}`);
      return;
    }

    const queryState = queryClient.getQueryState(queryKeys.conversations.detail(sessionId));
    if (queryState?.fetchStatus === 'fetching') {
      uiState.setLoadingConversation(true);
      uiState.setConversationTransitioning(true);
      uiState.setActiveConversation(sessionId, title);
      useMessageBufferStore.getState().markLoadPending(sessionId);
      chatStore.setActiveSession(sessionId);
      useFileStore.getState().switchSession(sessionId);

      const epochBefore = getWorkspaceEpoch();
      const generationBefore = getConversationGeneration(sessionId);
      const result = await loadConversationDetailFresh(sessionId);
      const epochAfter = getWorkspaceEpoch();
      const generationAfter = getConversationGeneration(sessionId);

      if (epochBefore !== epochAfter || generationBefore !== generationAfter) {
        useMessageBufferStore.getState().clearLoadPending(sessionId);
        uiState.setLoadingConversation(false);
        uiState.setConversationTransitioning(false);
        logger.debug(`[${sid}] JOIN PATH: stale, aborting`);
        return;
      }

      if (result.kind === 'data') {
        chatStore.markSessionLoaded(sessionId);
        useMessageBufferStore.getState().clearLoadPending(sessionId);
        hydrateConversationSnapshot({
          sessionId,
          persistedMessages: result.conversation.messages,
          sessionUsage: result.conversation.sessionUsage,
          scrollIntent: 'session-restore',
          source: 'query-fast-path',
          title: title ?? result.conversation.title,
        });
        uiState.setLoadingConversation(false);
        uiState.setConversationTransitioning(false);
        logger.debug(`[${sid}] JOIN PATH: data`);
        return;
      }

      if (result.kind === 'empty') {
        chatStore.setMessages(sessionId, [], 'session-restore');
        chatStore.markSessionHydrated(sessionId);
        chatStore.markSessionLoaded(sessionId);
        chatStore.bumpConversationLoadEpoch();
        useToolStore.getState().switchSession(sessionId);
        useMessageBufferStore.getState().clearLoadPending(sessionId);
        uiState.setLoadingConversation(false);
        uiState.setConversationTransitioning(false);
        logger.debug(`[${sid}] JOIN PATH: empty`);
        return;
      }

      useMessageBufferStore.getState().clearLoadPending(sessionId);
      logger.debug(`[${sid}] JOIN PATH: loader error, falling through`);
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
    markConversationTitleDirty(sessionId);
  },

  async remove(sessionId): Promise<void> {
    await removeConversationCache(sessionId);
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
