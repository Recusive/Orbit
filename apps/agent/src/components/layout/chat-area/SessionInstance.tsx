import { createLogger } from '@orbit/common/lib';
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { ChatMessagesVerificationResult } from '@/components/chat/chat-messages';
import type { SessionVerificationResult } from '@/services/conversations/session-switch-coordinator';
import type { QueuedMessage } from '@/stores/chat/queued-message-store';
import type { CSSProperties, FC } from 'react';

import { ChatMessages } from '@/components/chat';
import {
  clearReadyInstance,
  recordReadyInstance,
} from '@/services/conversations/session-switch-coordinator';
import {
  getShownSessionTraceRequest,
  recordSessionSwitchTrace,
} from '@/services/conversations/session-switch-trace';
import {
  useSessionAgentRunning,
  useSessionLastLayoutMutationAt,
  useSessionLayoutPendingCount,
  useSessionLayoutSettledVersion,
  useSessionLayoutVersion,
  useSessionMessages,
} from '@/stores/chat/chat-store';
import {
  buildSessionReadinessSignature,
  buildSessionSettledSignature,
} from '@/stores/chat/session-switch-store';

const logger = createLogger('SessionInstance');

type SessionInstanceDisplayMode = 'shown' | 'hidden' | 'candidate' | 'holdover';

export interface SessionInstanceProps {
  readonly sessionId: string;
  readonly displayMode: SessionInstanceDisplayMode;
  readonly verificationPhase: 'hidden' | 'visible' | null;
  readonly verificationRequestId: number | null;
  readonly queuedMessage: QueuedMessage | null;
  readonly onRewind: (messageId: string) => void;
  readonly onOpenFile: (path: string) => void;
  readonly onOpenUrl: (url: string) => void;
  readonly onCancelQueue: () => void;
  readonly onFeedback: () => void;
  readonly onVerificationResult?: (result: SessionVerificationResult) => void;
}

const ACTIVE_STYLE: CSSProperties = {
  position: 'relative',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  overflow: 'hidden',
  zIndex: 1,
};

const HIDDEN_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  overflow: 'hidden',
  transform: 'translateX(-200vw)',
  pointerEvents: 'none',
  zIndex: 0,
};

const HOLDOVER_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
  zIndex: 2,
};

const VELOCITY_SCROLL_ENABLE_QUIET_MS = 500;

let instanceGenerationCounter = 0;

function getStyleForDisplayMode(displayMode: SessionInstanceDisplayMode): CSSProperties {
  if (displayMode === 'hidden') {
    return HIDDEN_STYLE;
  }
  if (displayMode === 'holdover') {
    return HOLDOVER_STYLE;
  }
  return ACTIVE_STYLE;
}

function isTransparentColor(value: string): boolean {
  return (
    value === '' ||
    value === 'transparent' ||
    value === 'rgba(0, 0, 0, 0)' ||
    value === 'rgba(0,0,0,0)'
  );
}

function findInheritedBackgroundColor(node: HTMLElement | null): string | null {
  let current = node?.parentElement ?? null;

  while (current) {
    const backgroundColor = window.getComputedStyle(current).backgroundColor;
    if (!isTransparentColor(backgroundColor)) {
      return backgroundColor;
    }
    current = current.parentElement;
  }

  return null;
}

const SessionInstanceComponent: FC<SessionInstanceProps> = ({
  sessionId,
  displayMode,
  verificationPhase,
  verificationRequestId,
  queuedMessage,
  onRewind,
  onOpenFile,
  onOpenUrl,
  onCancelQueue,
  onFeedback,
  onVerificationResult,
}) => {
  const messages = useSessionMessages(sessionId);
  const isAgentRunning = useSessionAgentRunning(sessionId);
  const layoutPendingCount = useSessionLayoutPendingCount(sessionId);
  const lastLayoutMutationAt = useSessionLastLayoutMutationAt(sessionId);
  const layoutVersion = useSessionLayoutVersion(sessionId);
  const layoutSettledVersion = useSessionLayoutSettledVersion(sessionId);
  const sid = sessionId.slice(-6);
  const readinessSignature = buildSessionReadinessSignature({
    messages,
    isAgentRunning,
    isStopPending: false,
    scrollIntent: null,
    hydrationState: 'hydrated',
    layoutVersion,
    layoutPendingCount: 0,
    layoutSettledVersion,
    lastLayoutMutationAt: null,
    layoutLeakDeadlineAt: null,
    virtuosoSizeCache: null,
  });
  const settledSignature = buildSessionSettledSignature({
    messages,
    isAgentRunning,
    isStopPending: false,
    scrollIntent: null,
    hydrationState: 'hydrated',
    layoutVersion,
    layoutPendingCount: 0,
    layoutSettledVersion,
    lastLayoutMutationAt: null,
    layoutLeakDeadlineAt: null,
    virtuosoSizeCache: null,
  });
  const instanceGenerationRef = useRef(0);
  if (instanceGenerationRef.current === 0) {
    instanceGenerationCounter += 1;
    instanceGenerationRef.current = instanceGenerationCounter;
  }
  const instanceGeneration = instanceGenerationRef.current;
  const verificationKey =
    verificationPhase !== null && readinessSignature !== null
      ? `${String(verificationRequestId ?? 0)}:${verificationPhase}:${readinessSignature}`
      : null;
  const containerRef = useRef<HTMLDivElement>(null);
  const lastRecordedReadySignatureRef = useRef<string | null>(null);
  const lastRecordedSettledSignatureRef = useRef<string | null>(null);
  const [tailProofVersion, setTailProofVersion] = useState(0);
  const [velocityScrollEnabled, setVelocityScrollEnabled] = useState(false);
  const hasEnabledVelocityScrollRef = useRef(false);
  const isActuallyVisible = displayMode !== 'hidden';
  const [holdoverBackgroundColor, setHoldoverBackgroundColor] = useState<string | null>(null);

  useEffect(() => {
    const previousSignature = lastRecordedReadySignatureRef.current;
    const previousSettledSignature = lastRecordedSettledSignatureRef.current;
    if (
      (previousSignature !== null && previousSignature !== readinessSignature) ||
      (previousSettledSignature !== null && previousSettledSignature !== settledSignature)
    ) {
      clearReadyInstance(sessionId, instanceGeneration);
      lastRecordedReadySignatureRef.current = null;
      lastRecordedSettledSignatureRef.current = null;
      setTailProofVersion(0);
    }
  }, [instanceGeneration, readinessSignature, sessionId, settledSignature]);

  useEffect(() => {
    if (
      verificationPhase === 'hidden' ||
      displayMode === 'shown' ||
      lastRecordedReadySignatureRef.current === null
    ) {
      return;
    }

    clearReadyInstance(sessionId, instanceGeneration);
    lastRecordedReadySignatureRef.current = null;
    lastRecordedSettledSignatureRef.current = null;
    setTailProofVersion(0);
  }, [displayMode, instanceGeneration, sessionId, verificationPhase]);

  useEffect(() => {
    return (): void => {
      clearReadyInstance(sessionId, instanceGeneration);
    };
  }, [instanceGeneration, sessionId]);

  const handleVerificationResult = useCallback(
    (result: ChatMessagesVerificationResult): void => {
      if (!readinessSignature || !settledSignature) {
        return;
      }

      const fullResult: SessionVerificationResult = {
        sessionId,
        requestId: verificationRequestId ?? 0,
        signature: readinessSignature,
        settledSignature,
        tailProofVersion: result.tailProofVersion,
        instanceGeneration,
        phase: result.phase,
        result: result.result,
      };

      if (result.result === 'hidden-ready' || result.result === 'visible-ready') {
        recordReadyInstance(fullResult);
        lastRecordedReadySignatureRef.current = readinessSignature;
        lastRecordedSettledSignatureRef.current = settledSignature;
        setTailProofVersion(result.tailProofVersion);
      } else {
        clearReadyInstance(sessionId, instanceGeneration);
        lastRecordedReadySignatureRef.current = null;
        lastRecordedSettledSignatureRef.current = null;
      }

      onVerificationResult?.(fullResult);
    },
    [
      instanceGeneration,
      onVerificationResult,
      readinessSignature,
      sessionId,
      settledSignature,
      verificationRequestId,
    ]
  );

  const savedScrollTopRef = useRef<number | null>(null);
  const savedWasAtBottomRef = useRef(false);
  const prevVisibleRef = useRef(isActuallyVisible);

  useEffect(() => {
    if (prevVisibleRef.current === isActuallyVisible) {
      return;
    }

    const container = containerRef.current;
    const scroller = container?.querySelector<HTMLElement>('[data-testid="virtuoso-scroller"]');

    if (!isActuallyVisible && prevVisibleRef.current) {
      if (scroller) {
        savedScrollTopRef.current = scroller.scrollTop;
        savedWasAtBottomRef.current =
          scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
      }
    }

    if (isActuallyVisible && !prevVisibleRef.current && scroller) {
      const savedTop = savedScrollTopRef.current;
      if (savedWasAtBottomRef.current) {
        requestAnimationFrame(() => {
          scroller.scrollTop = scroller.scrollHeight;
        });
      } else if (savedTop !== null && savedTop > 0) {
        requestAnimationFrame(() => {
          scroller.scrollTop = savedTop;
        });
      } else {
        requestAnimationFrame(() => {
          logger.debug(`[${sid}] Reveal with no saved scroll`, {
            displayMode,
            msgCount: messages.length,
          });
        });
      }
    }

    prevVisibleRef.current = isActuallyVisible;
  }, [displayMode, isActuallyVisible, messages.length, sid]);

  useLayoutEffect(() => {
    if (displayMode !== 'holdover') {
      setHoldoverBackgroundColor(null);
      return;
    }

    setHoldoverBackgroundColor(findInheritedBackgroundColor(containerRef.current));
  }, [displayMode]);

  useEffect(() => {
    if (displayMode !== 'shown') {
      if (velocityScrollEnabled) {
        recordSessionSwitchTrace({
          event: 'velocity_scroll_gate_closed',
          requestId: getShownSessionTraceRequest(sessionId),
          sessionId,
          data: {
            reason: 'not_shown',
          },
        });
      }
      setVelocityScrollEnabled(false);
      hasEnabledVelocityScrollRef.current = false;
      return;
    }

    if (hasEnabledVelocityScrollRef.current) {
      return;
    }

    if (layoutPendingCount > 0) {
      recordSessionSwitchTrace({
        event: 'velocity_scroll_gate_blocked',
        requestId: getShownSessionTraceRequest(sessionId),
        sessionId,
        data: {
          reason: 'layout_pending',
          layoutPendingCount,
        },
      });
      setVelocityScrollEnabled(false);
      return;
    }

    const quietForMs =
      lastLayoutMutationAt === null
        ? VELOCITY_SCROLL_ENABLE_QUIET_MS
        : Date.now() - lastLayoutMutationAt;
    if (quietForMs >= VELOCITY_SCROLL_ENABLE_QUIET_MS) {
      setVelocityScrollEnabled(true);
      hasEnabledVelocityScrollRef.current = true;
      recordSessionSwitchTrace({
        event: 'velocity_scroll_gate_open',
        requestId: getShownSessionTraceRequest(sessionId),
        sessionId,
        data: {
          quietForMs,
        },
      });
      return;
    }

    setVelocityScrollEnabled(false);
    const timerId = window.setTimeout(() => {
      setVelocityScrollEnabled(true);
      hasEnabledVelocityScrollRef.current = true;
    }, VELOCITY_SCROLL_ENABLE_QUIET_MS - quietForMs);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [displayMode, lastLayoutMutationAt, layoutPendingCount, sessionId, velocityScrollEnabled]);

  const containerStyle =
    displayMode === 'holdover' && holdoverBackgroundColor !== null
      ? {
          ...HOLDOVER_STYLE,
          backgroundColor: holdoverBackgroundColor,
        }
      : getStyleForDisplayMode(displayMode);

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      data-session-instance={sessionId}
      data-instance-visible={isActuallyVisible}
      data-instance-prime={verificationRequestId !== null && verificationRequestId > 0}
      data-instance-mode={displayMode}
      data-instance-generation={instanceGeneration}
      data-tail-proof-version={tailProofVersion}
      aria-hidden={displayMode === 'holdover' ? true : undefined}
    >
      <ChatMessages
        messages={messages}
        isAgentRunning={isAgentRunning}
        sessionId={sessionId}
        isVisible={isActuallyVisible}
        enableVelocityScroll={displayMode === 'shown' && velocityScrollEnabled}
        skipInitialVelocityPrime={true}
        verificationPhase={verificationPhase}
        verificationKey={verificationKey}
        queuedMessage={queuedMessage}
        onRewind={onRewind}
        onOpenFile={onOpenFile}
        onOpenUrl={onOpenUrl}
        onCancelQueue={onCancelQueue}
        onFeedback={onFeedback}
        onVerificationResult={handleVerificationResult}
      />
    </div>
  );
};

export const SessionInstance = memo(SessionInstanceComponent);
SessionInstance.displayName = 'SessionInstance';
