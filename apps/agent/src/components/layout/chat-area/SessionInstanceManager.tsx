import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect, useRef, useState } from 'react';

import { SessionInstance } from './SessionInstance';

import type { ChatScrollHandle } from '@/components/chat/chat-messages';
import type { SessionVerificationResult } from '@/services/conversations/session-switch-coordinator';
import type { QueuedMessage } from '@/stores/chat/queued-message-store';
import type { SessionSwitchStatus } from '@/stores/chat/session-switch-store';
import type { FC, RefObject } from 'react';

import { clearReadyInstances } from '@/services/conversations/session-switch-coordinator';
import { useChatStore } from '@/stores/chat/chat-store';
import { usePreMountSessionId, useSessionSwitchStore } from '@/stores/chat/session-switch-store';

const logger = createLogger('SessionInstanceMgr');

const MAX_ALIVE_INSTANCES = 10;

export interface SessionInstanceManagerProps {
  readonly shownSessionId: string | undefined;
  readonly pendingSessionId: string | undefined;
  readonly pendingPhase: SessionSwitchStatus;
  readonly pendingRequestId: number;
  readonly isShownHidden?: boolean;
  readonly queuedMessage: QueuedMessage | null;
  readonly onRewind: (messageId: string) => void;
  readonly onOpenFile: (path: string) => void;
  readonly onOpenUrl: (url: string) => void;
  readonly onCancelQueue: () => void;
  readonly onFeedback: () => void;
  readonly onPendingVerificationResult?: (result: SessionVerificationResult) => void;
  readonly scrollHandleRef?: RefObject<ChatScrollHandle | null>;
}

function touchMountedSession(list: string[], sessionId: string | undefined): string[] {
  if (!sessionId) {
    return list;
  }

  const next = [...list];
  const existingIndex = next.indexOf(sessionId);
  if (existingIndex >= 0) {
    next.splice(existingIndex, 1);
  }
  next.push(sessionId);
  return next;
}

function useMountedSessions(
  shownSessionId: string | undefined,
  pendingSessionId: string | undefined,
  preMountSessionId: string | undefined
): string[] {
  const ephemeralSessionsRef = useRef<Set<string>>(
    new Set(preMountSessionId ? [preMountSessionId] : [])
  );
  const [mountedSessions, setMountedSessions] = useState<string[]>(() =>
    [shownSessionId, pendingSessionId, preMountSessionId].filter(
      (sessionId): sessionId is string => sessionId !== undefined && sessionId !== ''
    )
  );

  useEffect(() => {
    setMountedSessions((prev) => {
      const ephemeralSessions = ephemeralSessionsRef.current;
      if (shownSessionId) {
        ephemeralSessions.delete(shownSessionId);
      }
      if (pendingSessionId) {
        ephemeralSessions.delete(pendingSessionId);
      }
      if (preMountSessionId) {
        ephemeralSessions.add(preMountSessionId);
      }

      let next = prev.filter(
        (sessionId) =>
          !ephemeralSessions.has(sessionId) ||
          sessionId === shownSessionId ||
          sessionId === pendingSessionId ||
          sessionId === preMountSessionId
      );

      next = touchMountedSession(next, shownSessionId);
      next = touchMountedSession(next, pendingSessionId);
      next = touchMountedSession(next, preMountSessionId);

      const protectedSessions = new Set(
        [shownSessionId, pendingSessionId, preMountSessionId].filter(
          (sessionId): sessionId is string => sessionId !== undefined && sessionId !== ''
        )
      );

      if (next.length <= MAX_ALIVE_INSTANCES) {
        return next;
      }

      const sessions = useChatStore.getState().sessions;
      const evicted: string[] = [];
      let i = 0;

      while (next.length - evicted.length > MAX_ALIVE_INSTANCES && i < next.length) {
        const candidate = next[i];
        if (!candidate) {
          break;
        }
        if (protectedSessions.has(candidate) || sessions[candidate]?.isAgentRunning === true) {
          i += 1;
          continue;
        }
        evicted.push(candidate);
        i += 1;
      }

      if (evicted.length === 0) {
        return next;
      }

      logger.debug('Evicting sessions', {
        evicted: evicted.map((sessionId) => sessionId.slice(-6)),
      });
      clearReadyInstances(evicted);
      const evictedSet = new Set(evicted);
      return next.filter((sessionId) => !evictedSet.has(sessionId));
    });
  }, [pendingSessionId, preMountSessionId, shownSessionId]);

  useEffect(() => {
    return useChatStore.subscribe((state, prevState) => {
      for (const sid of Object.keys(prevState.sessions)) {
        if (!(sid in state.sessions)) {
          clearReadyInstances([sid]);
          useSessionSwitchStore.getState().clearPreMount(sid);
          setMountedSessions((prev) => prev.filter((sessionId) => sessionId !== sid));
        }
      }
    });
  }, []);

  return mountedSessions;
}

function getDisplayMode(
  sessionId: string,
  shownSessionId: string | undefined,
  pendingSessionId: string | undefined,
  pendingPhase: SessionSwitchStatus
): 'shown' | 'hidden' | 'candidate' | 'holdover' {
  if (pendingSessionId === sessionId && pendingPhase === 'visible-verifying') {
    return 'candidate';
  }
  if (shownSessionId === sessionId && pendingPhase === 'visible-verifying') {
    return 'holdover';
  }
  if (shownSessionId === sessionId) {
    return 'shown';
  }
  return 'hidden';
}

export const SessionInstanceManager: FC<SessionInstanceManagerProps> = ({
  shownSessionId,
  pendingSessionId,
  pendingPhase,
  pendingRequestId,
  isShownHidden = false,
  queuedMessage,
  onRewind,
  onOpenFile,
  onOpenUrl,
  onCancelQueue,
  onFeedback,
  onPendingVerificationResult,
  scrollHandleRef,
}) => {
  const effectiveShownId = isShownHidden ? undefined : shownSessionId;
  const preMountSessionId = usePreMountSessionId() ?? undefined;
  const mountedSessions = useMountedSessions(effectiveShownId, pendingSessionId, preMountSessionId);

  const handleVerificationResult = useCallback(
    (result: SessionVerificationResult): void => {
      if (
        pendingSessionId === undefined ||
        result.sessionId !== pendingSessionId ||
        result.requestId !== pendingRequestId
      ) {
        return;
      }

      onPendingVerificationResult?.(result);
    },
    [onPendingVerificationResult, pendingRequestId, pendingSessionId]
  );

  return (
    <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
      {mountedSessions.map((sid) => {
        const displayMode = getDisplayMode(sid, effectiveShownId, pendingSessionId, pendingPhase);
        const verificationPhase =
          sid === pendingSessionId && pendingPhase === 'hidden-priming'
            ? 'hidden'
            : sid === pendingSessionId && pendingPhase === 'visible-verifying'
              ? 'visible'
              : null;
        const verificationRequestId = verificationPhase !== null ? pendingRequestId : null;
        const queuedMessageForSession =
          displayMode === 'shown' || displayMode === 'holdover' ? queuedMessage : null;

        const sessionScrollHandleRef =
          displayMode === 'shown' && scrollHandleRef ? scrollHandleRef : undefined;
        return (
          <SessionInstance
            key={sid}
            sessionId={sid}
            displayMode={displayMode}
            verificationPhase={verificationPhase}
            verificationRequestId={verificationRequestId}
            queuedMessage={queuedMessageForSession}
            onRewind={onRewind}
            onOpenFile={onOpenFile}
            onOpenUrl={onOpenUrl}
            onCancelQueue={onCancelQueue}
            onFeedback={onFeedback}
            onVerificationResult={handleVerificationResult}
            {...(sessionScrollHandleRef ? { scrollHandleRef: sessionScrollHandleRef } : {})}
          />
        );
      })}
    </div>
  );
};
