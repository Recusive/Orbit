import { createLogger } from '@orbit/common/lib';
import { Profiler, memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type {
  ChatMessagesVerificationResult,
  ChatScrollHandle,
} from '@/components/chat/chat-messages';
import type { SessionVerificationResult } from '@/services/conversations/session-switch-coordinator';
import type { QueuedMessage } from '@/stores/chat/queued-message-store';
import type { CSSProperties, FC, RefObject } from 'react';

import { ChatMessages } from '@/components/chat';
import { findChatScroller } from '@/lib/chat/chat-selectors';
import { markOperation, onProfilerRender } from '@/lib/perf/frame-monitor';
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
  readonly scrollHandleRef?: RefObject<ChatScrollHandle | null>;
}

// All instances use absolute positioning so switching is a pure z-index change
// with no layout recalculation. Each display mode gets a tailored `contain`
// value to let the browser skip as much work as possible:
//
// - candidate/hidden: `contain: strict` (= size layout style paint) — the
//   element is fully off-screen, so the browser can skip its entire subtree.
//   `will-change: transform` on candidates promotes the layer to the
//   compositor so the transition to shown is compositor-only.
//
// - shown: `contain: layout style` — internal layout changes don't affect
//   siblings. `paint` is intentionally omitted because `contain: paint` on
//   ancestor containers breaks WKWebView text selection on .message-item
//   descendants.
//
// - holdover: `contain: strict` — the previous session is non-interactive
//   and about to be hidden, so full containment is safe.
const BASE_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  overflow: 'hidden',
};

const ACTIVE_STYLE: CSSProperties = {
  ...BASE_STYLE,
  zIndex: 1,
  contain: 'layout style',
};

const HIDDEN_STYLE: CSSProperties = {
  ...BASE_STYLE,
  transform: 'translateX(-200vw)',
  pointerEvents: 'none',
  zIndex: 0,
  contain: 'strict',
  willChange: 'transform',
};

const HOLDOVER_STYLE: CSSProperties = {
  ...BASE_STYLE,
  pointerEvents: 'none',
  zIndex: 2,
  contain: 'strict',
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
  scrollHandleRef,
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
    measurementCache: null,
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
    measurementCache: null,
  });
  const instanceGenerationRef = useRef(0);
  if (instanceGenerationRef.current === 0) {
    instanceGenerationCounter += 1;
    instanceGenerationRef.current = instanceGenerationCounter;
  }
  const instanceGeneration = instanceGenerationRef.current;
  // Don't emit a verification key until the session has messages. An empty
  // session (pre-hydration or genuinely new) has nothing to position or
  // stabilize. Without this guard, the startup path starts verification on
  // the empty state (layoutVersion=0, msgs=0), then setMessages:hydrate
  // bumps layoutVersion → key changes → verification restarts, wasting ~74ms.
  const verificationKey =
    verificationPhase !== null && readinessSignature !== null && messages.length > 0
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
    const scroller = container ? findChatScroller(container) : null;

    if (!isActuallyVisible && prevVisibleRef.current) {
      if (scroller) {
        const endSave = markOperation('scroll-position-save');
        savedScrollTopRef.current = scroller.scrollTop;
        savedWasAtBottomRef.current =
          scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
        endSave();
      }
    }

    if (isActuallyVisible && !prevVisibleRef.current && scroller) {
      const savedTop = savedScrollTopRef.current;
      if (savedWasAtBottomRef.current) {
        const endRestore = markOperation('scroll-position-restore');
        requestAnimationFrame(() => {
          // Prefer routing through the imperative handle so ChatMessages can
          // sync its echo-detection baseline (lastScrollTopRef) atomically with
          // the scrollTop write. Otherwise the next native scroll event would
          // compute a phantom delta against a stale baseline and could flip
          // shouldAutoScrollRef off, silently breaking auto-follow.
          const handle = scrollHandleRef?.current;
          if (handle) {
            handle.forceStickToBottom();
          } else {
            // Fallback for early mount / hidden keep-alive states where the
            // handle isn't attached yet. The isProgrammaticJump heuristic in
            // updateBottomTracking handles the missing baseline sync here.
            scroller.scrollTop = scroller.scrollHeight;
          }
        });
        endRestore();
      } else if (savedTop !== null && savedTop > 0) {
        const endRestore = markOperation('scroll-position-restore');
        requestAnimationFrame(() => {
          // Non-bottom restore intentionally skips lastScrollTopRef sync —
          // that ref lives inside ChatMessages and isn't reachable from here.
          // The isProgrammaticJump heuristic in updateBottomTracking absorbs
          // the resulting phantom delta on the next native scroll event.
          scroller.scrollTop = savedTop;
        });
        endRestore();
      }
    }

    prevVisibleRef.current = isActuallyVisible;
  }, [isActuallyVisible, scrollHandleRef]);

  // Pre-layout: force browser to compute layout while session is off-screen.
  // When verificationPhase transitions to 'visible', the session is about to be
  // promoted but still has `contain: strict` (full isolation — browser skips the
  // entire subtree). Without this, the hidden→visible transition triggers a
  // 121ms first-layout stall because the browser has zero cached layout data.
  //
  // Strategy: temporarily relax containment to `layout style`, read scrollHeight
  // to force synchronous layout, then restore `strict`. useLayoutEffect fires
  // before paint, so the browser has cached metrics by the time it paints the
  // visible session.
  useLayoutEffect(() => {
    if (verificationPhase !== 'visible' || !containerRef.current) return;
    const el = containerRef.current;
    const prev = el.style.contain;
    const end = markOperation('pre-layout');
    // Relax containment to allow layout computation
    el.style.contain = 'layout style';
    // Force synchronous layout by reading a layout-dependent property
    void el.scrollHeight;
    // Restore strict containment before the frame paints
    el.style.contain = prev;
    end();
  }, [verificationPhase]);

  useLayoutEffect(() => {
    const end = markOperation('display-mode-transition');
    if (displayMode !== 'holdover') {
      setHoldoverBackgroundColor(null);
      end();
      return;
    }

    const bgStart = performance.now();
    setHoldoverBackgroundColor(findInheritedBackgroundColor(containerRef.current));
    const bgDuration = performance.now() - bgStart;
    if (bgDuration > 1) {
      logger.debug(
        `[${sid}] holdover background lookup: ${String(Math.round(bgDuration * 10) / 10)}ms`
      );
    }
    end();
  }, [displayMode, sid]);

  useEffect(() => {
    if (displayMode !== 'shown') {
      if (velocityScrollEnabled) {
        const endGate = markOperation('velocity-scroll-gate');
        recordSessionSwitchTrace({
          event: 'velocity_scroll_gate_closed',
          requestId: getShownSessionTraceRequest(sessionId),
          sessionId,
          data: {
            reason: 'not_shown',
          },
        });
        setVelocityScrollEnabled(false);
        hasEnabledVelocityScrollRef.current = false;
        endGate();
      } else {
        setVelocityScrollEnabled(false);
        hasEnabledVelocityScrollRef.current = false;
      }
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
      const endGate = markOperation('velocity-scroll-gate');
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
      endGate();
      return;
    }

    setVelocityScrollEnabled(false);
    const timerId = window.setTimeout(() => {
      const endGate = markOperation('velocity-scroll-gate');
      setVelocityScrollEnabled(true);
      hasEnabledVelocityScrollRef.current = true;
      endGate();
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
      <Profiler id="session-instance" onRender={onProfilerRender}>
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
          {...(scrollHandleRef ? { scrollHandleRef } : {})}
        />
      </Profiler>
    </div>
  );
};

export const SessionInstance = memo(SessionInstanceComponent);
SessionInstance.displayName = 'SessionInstance';
