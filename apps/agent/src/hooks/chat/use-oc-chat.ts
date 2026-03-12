import { createLogger } from '@orbit/common/lib';
import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/shallow';

import type { OcSendMessageOptions } from '@/services/opencode/oc-session-service';
import type {
  OcMessage,
  OcPart,
  OcPermissionAsked,
  OcQuestionAnswer,
  OcQuestionRequest,
  OcSessionStatus,
} from '@/types/opencode';

import { ocSessionService } from '@/services/opencode/oc-session-service';
import {
  countRealUserMessages,
  willBackendGenerateTitle,
} from '@/services/opencode/oc-title-utils';
import {
  useOcActiveSession,
  useOcActiveSessionId,
  useOcActiveSessionStatus,
  useOcMessageStore,
  useOcPermissionStore,
  useOcSessionStore,
} from '@/stores/opencode';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('OcChat');

interface OcRenderedMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly message: OcMessage;
  readonly parts: OcPart[];
}

export function useOcChat(): {
  sessionId: string | null;
  activeSessionTitle: string | null;
  revertMessageId: string | null;
  messages: OcRenderedMessage[];
  permissions: OcPermissionAsked[];
  questions: OcQuestionRequest[];
  status: OcSessionStatus | null;
  isAgentBusy: boolean;
  handleSend: (text: string, options?: OcSendMessageOptions) => Promise<void>;
  handleStop: () => Promise<void>;
  handlePermissionReply: (requestId: string, reply: 'once' | 'always' | 'reject') => Promise<void>;
  handleQuestionReply: (requestId: string, answers: OcQuestionAnswer[]) => Promise<void>;
  handleQuestionReject: (requestId: string) => Promise<void>;
} {
  const sessionId = useOcActiveSessionId();
  const activeSession = useOcActiveSession();
  const status = useOcActiveSessionStatus();
  const sessionState = useOcMessageStore((state) =>
    sessionId ? state.sessions[sessionId] : undefined
  );
  const permissions = useOcPermissionStore(
    useShallow((state) =>
      Object.values(state.permissions).filter((permission) => permission.sessionID === sessionId)
    )
  );
  const questions = useOcPermissionStore(
    useShallow((state) =>
      Object.values(state.questions).filter((question) => question.sessionID === sessionId)
    )
  );

  const messages = useMemo<OcRenderedMessage[]>(() => {
    if (!sessionState) {
      return [];
    }

    return sessionState.messageOrder
      .map((messageId) => {
        const message = sessionState.messagesById[messageId];
        if (!message) {
          return null;
        }

        return {
          id: message.id,
          role: message.role,
          message,
          parts: sessionState.partsByMessage[message.id] ?? [],
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [sessionState]);

  /**
   * [warning] TESTED: OpenCode send-time title loading and pending-send wiring in
   *     this hook are covered by integration tests.
   *     If you modify this, run:
   *     bun run test -- apps/agent/src/__tests__/integration/services/opencode/oc-title-loading.test.ts
   *     Test file: apps/agent/src/__tests__/integration/services/opencode/oc-title-loading.test.ts
   */
  const handleSend = useCallback(async (text: string, options?: OcSendMessageOptions) => {
    let activeSessionId = useOcSessionStore.getState().activeSessionId;
    const willCreateSession = !activeSessionId;
    logger.info('User sending message', { activeSessionId, willCreateSession });

    if (!activeSessionId) {
      try {
        const created = await ocSessionService.createSession();
        useOcSessionStore.getState().setActiveSessionId(created.id);
        activeSessionId = created.id;
        logger.info('Created new session for message', { sessionId: activeSessionId });
      } catch (error) {
        logger.error('Failed to create session for message', error);
        throw error;
      }
    }

    if (activeSessionId) {
      const currentSession = useOcSessionStore.getState().sessions[activeSessionId];
      const currentMessages = useOcMessageStore.getState().sessions[activeSessionId];
      const priorRealUserCount = currentMessages
        ? countRealUserMessages(
            currentMessages.messageOrder,
            currentMessages.messagesById,
            currentMessages.partsByMessage
          )
        : 0;

      if (
        currentSession &&
        willBackendGenerateTitle({
          title: currentSession.title,
          parentID: currentSession.parentID,
          realUserMessageCount: priorRealUserCount,
        })
      ) {
        useUIStore.getState().setTitleLoading(activeSessionId, true);
        const capturedSessionId = activeSessionId;
        setTimeout(() => {
          useUIStore.getState().setTitleLoading(capturedSessionId, false);
        }, 15_000);
      }

      useOcSessionStore.getState().markPendingSend(activeSessionId);

      try {
        await ocSessionService.sendMessage(activeSessionId, text, options);
      } catch (error) {
        useUIStore.getState().setTitleLoading(activeSessionId, false);
        useOcSessionStore.getState().clearPendingSend(activeSessionId);
        logger.error('Failed to send message', error, { sessionId: activeSessionId });
        throw error;
      }
    }
  }, []);

  const handleStop = useCallback(async () => {
    const activeSessionId = useOcSessionStore.getState().activeSessionId;
    if (!activeSessionId) {
      return;
    }

    logger.info('User stopping agent', { sessionId: activeSessionId });
    await ocSessionService.abortSession(activeSessionId);
  }, []);

  const handlePermissionReply = useCallback(
    async (requestId: string, reply: 'once' | 'always' | 'reject') => {
      await ocSessionService.replyPermission(requestId, reply);
    },
    []
  );

  const handleQuestionReply = useCallback(
    async (requestId: string, answers: OcQuestionAnswer[]) => {
      await ocSessionService.replyQuestion(requestId, answers);
    },
    []
  );

  const handleQuestionReject = useCallback(async (requestId: string) => {
    await ocSessionService.rejectQuestion(requestId);
  }, []);

  return {
    sessionId,
    activeSessionTitle: activeSession?.title ?? null,
    revertMessageId: activeSession?.revert?.messageID ?? null,
    messages,
    permissions,
    questions,
    status,
    isAgentBusy: status?.type === 'busy' || status?.type === 'retry',
    handleSend,
    handleStop,
    handlePermissionReply,
    handleQuestionReply,
    handleQuestionReject,
  };
}
