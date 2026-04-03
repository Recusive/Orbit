/**
 * SessionInstance — Per-session keep-alive wrapper for VirtuosoMessageList.
 *
 * Each instance is bound to ONE session for its lifetime. It subscribes to
 * its own session's messages and agent state via per-session selectors, so
 * hidden instances only re-render when their own data changes.
 *
 * CSS strategy:
 * - Active: `position: relative; flex: 1` — in-flow flex child providing
 *   height context to the parent. Without this, Virtuoso gets 0 height.
 * - Hidden: `position: absolute; inset: 0; transform: translateX(-200vw)`
 *   Overlays the parent's content box (sized by the active instance).
 *   Dimensions match because `inset: 0` fills the same area as `flex: 1`.
 *
 * First-mount stabilization:
 * On first mount, the instance stays hidden until messages arrive AND the
 * ResizeObserver detects stable layout. The PREVIOUS session's instance
 * remains visible during this period (its isActive stays true until this
 * instance signals ready via the onStabilized callback).
 */
import { createLogger } from '@orbit/common/lib';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { STABILIZATION_STABLE_THRESHOLD_MS } from './constants';

import type { QueuedMessage } from '@/stores/chat/queued-message-store';
import type { CSSProperties, FC } from 'react';

import { ChatMessages } from '@/components/chat';
import { useSessionAgentRunning, useSessionMessages } from '@/stores/chat/chat-store';

const logger = createLogger('SessionInstance');

export interface SessionInstanceProps {
  readonly sessionId: string;
  readonly isActive: boolean;
  readonly queuedMessage: QueuedMessage | null;
  readonly onRewind: (messageId: string) => void;
  readonly onOpenFile: (path: string) => void;
  readonly onOpenUrl: (url: string) => void;
  readonly onCancelQueue: () => void;
  readonly onFeedback: () => void;
  /** Called once when the instance first stabilizes (messages loaded + layout settled).
   *  The manager uses this to hand off from the previous session. */
  readonly onStabilized?: (sessionId: string) => void;
}

/** Active instance — in-flow flex child that provides the height context.
 *  Without this, the parent has no in-flow children and Virtuoso gets 0 height. */
const ACTIVE_STYLE: CSSProperties = {
  position: 'relative',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  zIndex: 1,
};

/** Hidden instance — absolute overlay fills the parent's content box (set by
 *  the active instance's flex:1). transform moves it offscreen so WKWebView
 *  keeps rendering (RAFs fire, ResizeObserver works). Dimensions match the
 *  active instance because inset:0 fills the same parent content area. */
const HIDDEN_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  transform: 'translateX(-200vw)',
  pointerEvents: 'none',
  zIndex: 0,
};

export const SessionInstance: FC<SessionInstanceProps> = ({
  sessionId,
  isActive,
  queuedMessage,
  onRewind,
  onOpenFile,
  onOpenUrl,
  onCancelQueue,
  onFeedback,
  onStabilized,
}) => {
  const messages = useSessionMessages(sessionId);
  const isAgentRunning = useSessionAgentRunning(sessionId);
  const sid = sessionId.slice(-6);

  // ── Per-instance stabilization ──────────────────────────────────────
  // On first mount: hidden until messages arrive AND ResizeObserver
  // detects stable layout. After first stabilization: stays true forever.
  const [hasStabilized, setHasStabilized] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mountTimeRef = useRef(performance.now());
  const resizeCountRef = useRef(0);

  // Track whether messages have arrived (0 → N transition).
  // Stabilization waits for this before starting the quiet timer.
  const hasMessagesRef = useRef(messages.length > 0);
  if (messages.length > 0) {
    hasMessagesRef.current = true;
  }

  useLayoutEffect(() => {
    if (hasStabilized) return undefined;

    const container = containerRef.current;
    if (!container) {
      setHasStabilized(true);
      return undefined;
    }

    logger.debug(`[${sid}] Starting stabilization`, {
      msgCount: messages.length,
      isActive,
    });

    let stabilityTimer: ReturnType<typeof setTimeout> | null = null;

    const onStable = (): void => {
      // Don't stabilize on an empty container — wait for messages.
      if (!hasMessagesRef.current) {
        return;
      }
      const elapsed = performance.now() - mountTimeRef.current;
      logger.debug(`[${sid}] Stabilized`, {
        elapsed: `${elapsed.toFixed(0)}ms`,
        resizeCount: resizeCountRef.current,
        msgCount: messages.length,
      });
      setHasStabilized(true);
      onStabilized?.(sessionId);
    };

    const resetTimer = (): void => {
      if (stabilityTimer !== null) {
        clearTimeout(stabilityTimer);
      }
      stabilityTimer = setTimeout(onStable, STABILIZATION_STABLE_THRESHOLD_MS);
    };

    const observer = new ResizeObserver((entries) => {
      resizeCountRef.current++;
      const entry = entries[0];
      if (entry !== undefined && resizeCountRef.current <= 5) {
        logger.debug(`[${sid}] ResizeObserver #${String(resizeCountRef.current)}`, {
          h: entry.contentRect.height.toFixed(0),
          w: entry.contentRect.width.toFixed(0),
        });
      }
      resetTimer();
    });

    observer.observe(container);
    resetTimer();

    return (): void => {
      observer.disconnect();
      if (stabilityTimer !== null) {
        clearTimeout(stabilityTimer);
      }
    };
  }, [hasStabilized, sid, sessionId, messages.length, isActive, onStabilized]);

  // ── Visibility ──────────────────────────────────────────────────────
  // Show the instance only if it's active AND stabilized.
  // Before stabilization, even the active instance stays hidden (offscreen)
  // so the user sees the previous session's instance until this one is ready.
  const isVisible = isActive && hasStabilized;

  // Log visibility changes + capture scroll diagnostics on reveal
  const prevVisibleRef = useRef(isVisible);
  useEffect(() => {
    if (prevVisibleRef.current === isVisible) return;
    prevVisibleRef.current = isVisible;

    if (isVisible) {
      // Capture scroll state at reveal time — helps diagnose the 2/10 scroll
      // position bug on sessions with TodoBar.
      requestAnimationFrame(() => {
        const container = containerRef.current;
        if (!container) return;
        const scroller = container.querySelector('[data-testid="virtuoso-scroller"]');
        const containerRect = container.getBoundingClientRect();
        logger.debug(`[${sid}] REVEALED — scroll diagnostics`, {
          containerH: containerRect.height.toFixed(0),
          containerW: containerRect.width.toFixed(0),
          scrollerH: scroller?.scrollHeight ?? 'N/A',
          scrollerClientH: scroller?.clientHeight ?? 'N/A',
          scrollTop: scroller?.scrollTop ?? 'N/A',
          scrollBottom: scroller
            ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
            : 'N/A',
          msgCount: messages.length,
          childCount: scroller?.children[0]?.children.length ?? 'N/A',
        });
      });
    } else {
      logger.debug(`[${sid}] HIDDEN`, { msgCount: messages.length });
    }
  }, [isVisible, isActive, hasStabilized, sid, messages.length]);

  return (
    <div
      ref={containerRef}
      style={isVisible ? ACTIVE_STYLE : HIDDEN_STYLE}
      data-session-instance={sessionId}
      data-instance-active={isActive}
      data-instance-stabilized={hasStabilized}
    >
      <ChatMessages
        messages={messages}
        isAgentRunning={isAgentRunning}
        sessionId={sessionId}
        queuedMessage={queuedMessage}
        onRewind={onRewind}
        onOpenFile={onOpenFile}
        onOpenUrl={onOpenUrl}
        onCancelQueue={onCancelQueue}
        onFeedback={onFeedback}
      />
    </div>
  );
};
