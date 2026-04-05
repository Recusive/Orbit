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
 * Readiness:
 * On first mount, the instance stays hidden until ChatMessages fires onReady
 * (Virtuoso has rendered items AND scroll is positioned). The manager keeps
 * the previous session visible until this signal arrives.
 * On revisit (already ready), the CSS toggle is instant.
 */
import { createLogger } from '@orbit/common/lib';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import type { QueuedMessage } from '@/stores/chat/queued-message-store';
import type { CSSProperties, FC } from 'react';

import { ChatMessages } from '@/components/chat';
import { useSessionAgentRunning, useSessionMessages } from '@/stores/chat/chat-store';

const logger = createLogger('SessionInstance');

export interface SessionInstanceProps {
  readonly sessionId: string;
  readonly isVisible: boolean;
  readonly shouldPrime: boolean;
  readonly queuedMessage: QueuedMessage | null;
  readonly onRewind: (messageId: string) => void;
  readonly onOpenFile: (path: string) => void;
  readonly onOpenUrl: (url: string) => void;
  readonly onCancelQueue: () => void;
  readonly onFeedback: () => void;
  /** Called once when the instance is ready (items rendered + scrolled).
   *  The manager uses this to hand off from the previous session. */
  readonly onStabilized?: (sessionId: string) => void;
}

/** Visible instance — in-flow flex child that provides the height context. */
const ACTIVE_STYLE: CSSProperties = {
  position: 'relative',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  zIndex: 1,
};

/** Hidden instance — absolute overlay, offscreen via transform. */
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

const SessionInstanceComponent: FC<SessionInstanceProps> = ({
  sessionId,
  isVisible,
  shouldPrime,
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

  // ── Readiness tracking ─────────────────────────────────────────────
  // Driven by ChatMessages.onReady (Virtuoso items rendered + scrolled).
  // Once ready, stays ready forever. No ResizeObserver — that fires before
  // Virtuoso actually renders items into the scroller.
  const [isReady, setIsReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isActuallyVisible = isVisible && isReady;

  const handleReady = useCallback(() => {
    if (isReady) return;
    logger.debug(`[${sid}] Ready (items rendered + scrolled)`, {
      msgCount: messages.length,
    });
    setIsReady(true);
    onStabilized?.(sessionId);
  }, [isReady, messages.length, onStabilized, sessionId, sid]);

  // ── Visibility + scroll preservation ─────────────────────────────────
  // WKWebView resets scrollTop when toggling between position:absolute
  // (hidden) and position:relative (active). Save on hide, restore on show.
  const savedScrollTopRef = useRef<number | null>(null);
  const savedWasAtBottomRef = useRef(false);

  const prevVisibleRef = useRef(isActuallyVisible);
  useEffect(() => {
    if (prevVisibleRef.current === isActuallyVisible) return;

    const container = containerRef.current;
    const scroller = container?.querySelector('[data-testid="virtuoso-scroller"]');

    if (!isActuallyVisible && prevVisibleRef.current) {
      // HIDING — save scroll position before the layout change
      if (scroller) {
        savedScrollTopRef.current = scroller.scrollTop;
        savedWasAtBottomRef.current =
          scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
        logger.debug(`[${sid}] HIDDEN — saved scrollTop=${String(scroller.scrollTop)}`, {
          wasAtBottom: savedWasAtBottomRef.current,
          msgCount: messages.length,
        });
      }
    }

    if (isActuallyVisible && !prevVisibleRef.current) {
      // SHOWING — restore scroll position after the layout change settles
      const savedTop = savedScrollTopRef.current;
      if (savedWasAtBottomRef.current && scroller) {
        requestAnimationFrame(() => {
          scroller.scrollTop = scroller.scrollHeight;
          logger.debug(`[${sid}] REVEALED — restored to bottom`, {
            scrollerH: scroller.scrollHeight,
            clientH: scroller.clientHeight,
            actualScrollTop: scroller.scrollTop,
            msgCount: messages.length,
          });
        });
      } else if (savedTop !== null && savedTop > 0 && scroller) {
        // Use RAF to let the browser complete the layout change first
        requestAnimationFrame(() => {
          scroller.scrollTop = savedTop;
          logger.debug(`[${sid}] REVEALED — restored scrollTop=${String(savedTop)}`, {
            scrollerH: scroller.scrollHeight,
            clientH: scroller.clientHeight,
            actualScrollTop: scroller.scrollTop,
            msgCount: messages.length,
          });
        });
      } else {
        // First reveal or no saved position — just log
        requestAnimationFrame(() => {
          if (!container) return;
          const containerRect = container.getBoundingClientRect();
          logger.debug(`[${sid}] REVEALED — no restore needed`, {
            containerH: containerRect.height.toFixed(0),
            scrollTop: scroller?.scrollTop ?? 'N/A',
            savedTop,
            msgCount: messages.length,
          });
        });
      }
    }

    prevVisibleRef.current = isActuallyVisible;
  }, [isActuallyVisible, sid, messages.length]);

  return (
    <div
      ref={containerRef}
      style={isActuallyVisible ? ACTIVE_STYLE : HIDDEN_STYLE}
      data-session-instance={sessionId}
      data-instance-visible={isActuallyVisible}
      data-instance-prime={shouldPrime}
      data-instance-ready={isReady}
    >
      <ChatMessages
        messages={messages}
        isAgentRunning={isAgentRunning}
        sessionId={sessionId}
        isVisible={isActuallyVisible}
        shouldPrime={shouldPrime}
        queuedMessage={queuedMessage}
        onRewind={onRewind}
        onOpenFile={onOpenFile}
        onOpenUrl={onOpenUrl}
        onCancelQueue={onCancelQueue}
        onFeedback={onFeedback}
        onReady={handleReady}
      />
    </div>
  );
};

export const SessionInstance = memo(SessionInstanceComponent);
SessionInstance.displayName = 'SessionInstance';
