import { createLogger } from '@orbit/common/lib';

import { claudeConversationRepo } from './claude-conversation-repo';
import { recordSessionSwitchTrace } from './session-switch-trace';

import type {
  ConversationListContext,
  ConversationUiBridge,
  RestoreSelectionResult,
} from './types';
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
import {
  abortPendingCreate,
  abortSessionSwitch,
  beginPendingCreate,
  beginSessionSwitch,
  clearReadyInstances,
  commitSessionReveal,
  getPendingCreateBySessionId,
  hasCurrentReadyInstance,
  isPendingSessionRequest,
  setPendingConversationTitle,
  setPendingLoadStrategy,
} from '@/services/conversations/session-switch-coordinator';
import { applyManualSessionTitle } from '@/services/session';
import { useChatStore } from '@/stores/chat/chat-store';
import { useSessionSwitchStore } from '@/stores/chat/session-switch-store';
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

    const switchState = useSessionSwitchStore.getState();
    if (switchState.pending?.sessionId === sessionId) {
      logger.debug(`select(${sessionId.slice(-6)})`, {
        path: 'COALESCE_PENDING',
        requestId: switchState.requestId,
      });
      recordSessionSwitchTrace({
        event: 'select_coalesced',
        requestId: switchState.requestId,
        sessionId,
      });
      return;
    }

    const uiState = useUIStore.getState();
    const chatStore = useChatStore.getState();
    const title =
      uiState.conversations.find((conversation) => conversation.sessionId === sessionId)?.title ??
      null;
    const prevActive = uiState.activeConversationId;
    const msgCount = chatStore.sessions[sessionId]?.messages.length ?? 0;
    const sid = sessionId.slice(-6);

    logger.debug(`select(${sid})`, {
      from: prevActive?.slice(-6) ?? '(none)',
      msgCount,
      path: 'BEGIN SWITCH',
    });

    const requestId = beginSessionSwitch(sessionId, title);

    if (hasCurrentReadyInstance(sessionId, requestId)) {
      void commitSessionReveal(requestId, sessionId, title);
      logger.debug(`[${sid}] Instant reveal from current ready instance`);
      recordSessionSwitchTrace({
        event: 'hydrate_source_chosen',
        requestId,
        sessionId,
        data: {
          source: 'ready-instance-reuse',
        },
      });
      return;
    }

    const freshResultValue = getFreshConversationDetail(sessionId) as unknown;
    const freshResult = isRevealableConversationDetail(freshResultValue) ? freshResultValue : null;
    if (freshResult) {
      setPendingLoadStrategy('query', requestId);
      setPendingConversationTitle(title ?? freshResult.conversation.title, requestId);
      recordSessionSwitchTrace({
        event: 'hydrate_source_chosen',
        requestId,
        sessionId,
        data: {
          source: freshResult.kind === 'data' ? 'query-fast-path' : 'query-fast-empty',
        },
      });

      if (freshResult.kind === 'data') {
        hydrateConversationSnapshot({
          sessionId,
          persistedMessages: freshResult.conversation.messages,
          sessionUsage: freshResult.conversation.sessionUsage,
          scrollIntent: 'pending-verify',
          source: 'query-fast-path',
          title: title ?? freshResult.conversation.title,
          activateToolSession: false,
        });
        if (hasCurrentReadyInstance(sessionId, requestId)) {
          void commitSessionReveal(requestId, sessionId, title ?? freshResult.conversation.title);
        }
      } else {
        chatStore.setMessages(sessionId, [], 'pending-verify');
        chatStore.markSessionHydrated(sessionId);
        chatStore.markSessionLoaded(sessionId);
        chatStore.bumpConversationLoadEpoch();
        if (hasCurrentReadyInstance(sessionId, requestId)) {
          void commitSessionReveal(requestId, sessionId, title ?? freshResult.conversation.title);
        }
      }

      logger.debug(`[${sid}] FAST PATH: ${freshResult.kind}`);
      return;
    }

    const queryState = queryClient.getQueryState(queryKeys.conversations.detail(sessionId));
    if (queryState?.fetchStatus === 'fetching') {
      setPendingLoadStrategy('query', requestId);

      const epochBefore = getWorkspaceEpoch();
      const generationBefore = getConversationGeneration(sessionId);
      const result = await loadConversationDetailFresh(sessionId);
      const epochAfter = getWorkspaceEpoch();
      const generationAfter = getConversationGeneration(sessionId);
      const currentRequestId = useSessionSwitchStore.getState().requestId;

      if (
        epochBefore !== epochAfter ||
        generationBefore !== generationAfter ||
        currentRequestId !== requestId ||
        !isPendingSessionRequest(sessionId, requestId)
      ) {
        abortSessionSwitch(
          requestId,
          epochBefore !== epochAfter
            ? 'stale_workspace_epoch'
            : generationBefore !== generationAfter
              ? 'stale_conversation_generation'
              : currentRequestId !== requestId
                ? 'superseded_by_new_request'
                : 'unexpected_pending_clear'
        );
        logger.debug(`[${sid}] JOIN PATH: stale, aborting`);
        return;
      }

      if (result.kind === 'data') {
        setPendingConversationTitle(title ?? result.conversation.title, requestId);
        hydrateConversationSnapshot({
          sessionId,
          persistedMessages: result.conversation.messages,
          sessionUsage: result.conversation.sessionUsage,
          scrollIntent: 'pending-verify',
          source: 'query-fast-path',
          title: title ?? result.conversation.title,
          activateToolSession: false,
        });
        if (hasCurrentReadyInstance(sessionId, requestId)) {
          void commitSessionReveal(requestId, sessionId, title ?? result.conversation.title);
        }
        logger.debug(`[${sid}] JOIN PATH: data`);
        return;
      }

      if (result.kind === 'empty') {
        setPendingConversationTitle(title ?? result.conversation.title, requestId);
        chatStore.setMessages(sessionId, [], 'pending-verify');
        chatStore.markSessionHydrated(sessionId);
        chatStore.markSessionLoaded(sessionId);
        chatStore.bumpConversationLoadEpoch();
        if (hasCurrentReadyInstance(sessionId, requestId)) {
          void commitSessionReveal(requestId, sessionId, title ?? result.conversation.title);
        }
        logger.debug(`[${sid}] JOIN PATH: empty`);
        return;
      }

      logger.debug(`[${sid}] JOIN PATH: loader error, falling through`);
    }

    setPendingLoadStrategy('slow', requestId);
    logger.debug(`[${sid}] SLOW PATH scheduled`);
    recordSessionSwitchTrace({
      event: 'hydrate_source_chosen',
      requestId,
      sessionId,
      data: {
        source: 'slow-path',
      },
    });
  },

  async restoreSelection(): Promise<RestoreSelectionResult> {
    const sessionId = claudeConversationRepo.restoreActiveSession();
    if (!sessionId) {
      recordSessionSwitchTrace({
        event: 'restore_selection',
        sessionId: null,
        data: {
          status: 'missing',
        },
      });
      return {
        status: 'missing',
        sessionId: null,
      };
    }
    if (sessionId === useUIStore.getState().activeConversationId) {
      recordSessionSwitchTrace({
        event: 'restore_selection',
        sessionId,
        data: {
          status: 'skipped',
        },
      });
      return {
        status: 'skipped',
        sessionId,
      };
    }
    await this.select(sessionId);
    const requestId = useSessionSwitchStore.getState().requestId;
    recordSessionSwitchTrace({
      event: 'restore_selection',
      requestId,
      sessionId,
      data: {
        status: 'started',
      },
    });
    return {
      status: 'started',
      sessionId,
      requestId,
    };
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
    const title = input?.title ?? 'Untitled';
    const createRequestId = input?.createRequestId ?? crypto.randomUUID();

    beginPendingCreate(createRequestId, title, null);
    try {
      await claudeConversationRepo.create({
        ...input,
        title,
        createRequestId,
      });
    } catch (error) {
      abortPendingCreate(createRequestId);
      throw error;
    }
  },

  async rename(sessionId, title): Promise<void> {
    await applyManualSessionTitle(sessionId, title);
    await claudeConversationRepo.updateTitle(sessionId, title);
    markConversationTitleDirty(sessionId);
  },

  async remove(sessionId): Promise<void> {
    const switchState = useSessionSwitchStore.getState();
    if (switchState.pending?.sessionId === sessionId) {
      abortSessionSwitch(switchState.requestId, 'explicit_phase_reset');
    }
    const pendingCreate = getPendingCreateBySessionId(sessionId);
    if (pendingCreate !== null) {
      abortPendingCreate(pendingCreate.createRequestId);
    }
    clearReadyInstances([sessionId]);
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
