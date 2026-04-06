/**
 * useVelocityScroll - Momentum-based wheel damping for virtualized lists.
 *
 * Intercepts native wheel events, accumulates velocity from each input,
 * applies per-frame friction, and caps peak speed. Designed for WKWebView
 * where native inertial scrolling thrashes virtualization item rendering.
 *
 * On attach, the first few wheel events pass through to native scroll.
 * This lets WKWebView's compositor calibrate (it pre-processes wheel
 * events on the compositor thread; calling preventDefault on the first
 * events causes compositor/main-thread disagreement → scrollbar jitter).
 * After warmup, the hook takes over with preventDefault.
 *
 * Returns a callback ref — attach it to the scrollable element, or call
 * it imperatively with the element from a useEffect.
 *
 * ── Scrollbar Jitter Fix ─────────────────────────────────────────────
 *
 * VirtuosoMessageList's scroll compensation (the `jump` mechanism) only
 * fires when scrolled to the bottom. During mid-list scrolling, when
 * items in the overscan zone get measured by ResizeObserver, scrollHeight
 * changes shift the scrollbar ratio (scrollTop / scrollRange) without
 * any compensation — causing the scrollbar thumb to jump backward.
 *
 * The library's deviation system (translateY-based) only fires for
 * upward scrolling. Downward scroll has zero compensation.
 *
 * Fix: A ResizeObserver on the inner list container detects height
 * changes IN THE SAME FRAME (after layout, before paint). It adjusts
 * scrollTop proportionally to maintain the scrollbar ratio. The rAF
 * tick has a fallback check for any changes the observer misses.
 *
 * ── Tuning Guide ─────────────────────────────────────────────────────
 *
 * SCROLLBAR JITTER on first scroll of a session:
 *   - Increase `warmupEvents` (default 3). More native events = more time
 *     for WKWebView compositor to calibrate before we call preventDefault.
 *   - If jitter persists at any warmup count, the library's internal scroll
 *     tracking needs priming. In chat-messages.tsx, before attaching the
 *     hook, trigger a synthetic scroll: `scroller.scrollTop += 1` then
 *     reset via RAF. This initializes the library's position tracking.
 *
 * GHOST TEXT (blank items during fast scroll):
 *   - Increase `increaseViewportBy` on VirtuosoMessageList (currently 10000).
 *     This pre-renders more items outside the viewport.
 *   - Decrease `maxPxPerFrame` (default 50). Lower cap = slower scroll =
 *     more time for virtualized items to render.
 *   - Increase `friction` (default 0.91 → 0.93). Longer coast = smoother
 *     deceleration but faster perceived speed at the same cap.
 *
 * SCROLL FEELS TOO SLOW:
 *   - Increase `sensitivity` (default 0.55). More responsive to wheel input.
 *   - Increase `maxPxPerFrame` (default 50 → 65). Higher speed cap.
 *     Watch for ghost text if raised too high.
 *
 * SCROLL FEELS TOO FAST / STOPS TOO ABRUPTLY:
 *   - Decrease `sensitivity` (default 0.55 → 0.4).
 *   - Decrease `friction` (default 0.91 → 0.85). Lower = faster stop.
 *   - Decrease `maxPxPerFrame` (default 50 → 35).
 * ───────────────────────────────────────────────────────────────────────
 */
import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect, useRef } from 'react';

import { recordSessionSwitchTrace } from '@/services/conversations/session-switch-trace';

interface VelocityScrollOptions {
  /** Max pixels per frame. Caps speed for virtualization buffer. Default 50. */
  maxPxPerFrame?: number;
  /** Velocity multiplier per frame. Lower = longer coast. Default 0.91. */
  friction?: number;
  /** Wheel deltaY multiplier. Higher = more responsive. Default 0.55. */
  sensitivity?: number;
  /** Number of wheel events to let through natively before engaging. Default 3. */
  warmupEvents?: number;
  /** When false, no observers or event listeners are attached. Default true. */
  enabled?: boolean;
  /** Fired on the first wheel event after warmup for the current attachment. */
  onUserScrollStart?: () => void;
  traceRequestId?: number | null;
  traceSessionId?: string | null;
}

/** Selector for Virtuoso's inner list container. */
const LIST_SELECTOR = '[data-testid="virtuoso-list"]';
const logger = createLogger('VelocityScroll');

/**
 * Compensate scrollTop to maintain the scrollbar ratio when scrollHeight
 * changes during active scrolling. Returns the compensation applied.
 *
 * Formula: newScrollTop / (newScrollHeight - clientHeight)
 *        = oldScrollTop / (oldScrollHeight - clientHeight)
 *
 * Solving: compensation = scrollTop × (delta / oldScrollRange)
 */
function compensateScrollHeight(scroller: HTMLElement, lastScrollHeight: number): number {
  const curScrollHeight = scroller.scrollHeight;
  if (lastScrollHeight <= 0 || curScrollHeight === lastScrollHeight) {
    return 0;
  }

  const delta = curScrollHeight - lastScrollHeight;
  const scrollRange = lastScrollHeight - scroller.clientHeight;

  // Skip when at bottom — the library handles that case internally.
  const atBottom = scroller.scrollTop + scroller.clientHeight >= curScrollHeight - 4;

  if (scrollRange <= 0 || atBottom) {
    return 0;
  }

  const compensation = Math.round(scroller.scrollTop * (delta / scrollRange));
  if (compensation !== 0) {
    scroller.scrollTop += compensation;
  }
  return compensation;
}

export function useVelocityScroll(
  options?: VelocityScrollOptions
): (node: HTMLElement | null) => void {
  const maxPx = options?.maxPxPerFrame ?? 50;
  const friction = options?.friction ?? 0.91;
  const sensitivity = options?.sensitivity ?? 0.55;
  const warmupEvents = options?.warmupEvents ?? 3;
  const enabled = options?.enabled ?? true;
  const traceRequestId = options?.traceRequestId ?? null;
  const traceSessionId = options?.traceSessionId ?? null;
  const onUserScrollStartRef = useRef(options?.onUserScrollStart);
  onUserScrollStartRef.current = options?.onUserScrollStart;

  const cleanupRef = useRef<(() => void) | null>(null);

  const setRef = useCallback(
    (node: HTMLElement | null): void => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }

      if (!node || !enabled) return;

      let velocity = 0;
      let animating = false;
      let raf = 0;
      let primeRaf = 0;
      let warmupResetTimer = 0;
      let nativeCount = 0;
      let lastScrollHeight = 0;
      let hasFiredUserScroll = false;
      let warmupCompensating = false;
      let wheelLogCount = 0;
      let scrollLogCount = 0;
      let compensationLogCount = 0;
      let tickLogCount = 0;

      if (import.meta.env.DEV) {
        performance.mark('velocity-scroll-attach');
      }
      logger.debug('Attached velocity scroll', {
        enabled,
        clientHeight: node.clientHeight,
        friction,
        maxPx,
        scrollHeight: node.scrollHeight,
        scrollTop: node.scrollTop,
        sensitivity,
        warmupEvents,
      });
      recordSessionSwitchTrace({
        event: 'velocity_scroll_attach',
        requestId: traceRequestId,
        sessionId: traceSessionId,
        data: {
          reason: 'enabled',
        },
      });

      // ── Same-frame scrollHeight compensation ───────────────────────
      // Two observers on the inner list container catch scrollHeight
      // changes before the browser paints:
      //
      // 1. MutationObserver (style attribute) — fires as a MICROTASK
      //    immediately after React updates the container's height/margin.
      //    Reading scrollHeight forces synchronous layout → we get the
      //    correct value and compensate before the rendering pipeline
      //    continues. This is the primary mechanism.
      //
      // 2. ResizeObserver (border-box) — fires AFTER layout, catches
      //    any changes the MutationObserver missed (e.g., changes that
      //    don't go through React's style attribute updates).
      //
      // Both share `lastScrollHeight`. The first one to detect a change
      // compensates and updates the variable; the second sees no delta.
      // The rAF tick has a tertiary fallback for the pre-mount period.
      let listResizeObserver: ResizeObserver | null = null;
      let listStyleObserver: MutationObserver | null = null;

      const onScrollHeightChange = (): void => {
        if ((!animating && !warmupCompensating) || lastScrollHeight <= 0) return;
        const compensation = compensateScrollHeight(node, lastScrollHeight);
        if (compensation !== 0 && compensationLogCount < 12) {
          compensationLogCount++;
          logger.debug('Scroll height compensation applied', {
            compensation,
            count: compensationLogCount,
            lastScrollHeight,
            nextScrollHeight: node.scrollHeight,
            scrollTop: node.scrollTop,
            warmupCompensating,
          });
        }
        lastScrollHeight = node.scrollHeight;
      };

      // Locate the inner list container and observe it. It may not exist
      // yet if the data is empty (the library conditionally renders it).
      const observeListContainer = (): void => {
        const listEl = node.querySelector(LIST_SELECTOR);
        if (listEl === null) return;

        // Primary: MutationObserver on style attribute — earliest signal.
        // Fires as a microtask after React updates height/margin/padding.
        listStyleObserver = new MutationObserver(onScrollHeightChange);
        listStyleObserver.observe(listEl, {
          attributes: true,
          attributeFilter: ['style'],
        });

        // Secondary: ResizeObserver on border-box — fires after layout,
        // catches non-style size changes.
        listResizeObserver = new ResizeObserver(onScrollHeightChange);
        listResizeObserver.observe(listEl, { box: 'border-box' });
      };

      // If the list container isn't in the DOM yet, use a MutationObserver
      // to detect when it appears, then start observation.
      let listChildObserver: MutationObserver | null = null;

      const initListObserver = (): void => {
        if (node.querySelector(LIST_SELECTOR) !== null) {
          observeListContainer();
          return;
        }

        // Wait for the list container to appear.
        listChildObserver = new MutationObserver(() => {
          if (node.querySelector(LIST_SELECTOR) !== null) {
            listChildObserver?.disconnect();
            listChildObserver = null;
            observeListContainer();
          }
        });
        listChildObserver.observe(node, { childList: true });
      };

      initListObserver();

      // Prime Virtuoso's internal scroll tracking before the first real wheel
      // gesture. Without this 1px synthetic nudge, the first aggressive scroll
      // after attach can disagree with the virtualizer's cached position and
      // cause the scrollbar thumb to jitter until the second gesture.
      const maxScrollTop = node.scrollHeight - node.clientHeight;
      const originalScrollTop = node.scrollTop;
      if (maxScrollTop > 0) {
        const nudgedScrollTop =
          originalScrollTop < maxScrollTop ? originalScrollTop + 1 : originalScrollTop - 1;

        if (nudgedScrollTop !== originalScrollTop) {
          logger.debug('Priming scroll position', {
            maxScrollTop,
            nudgedScrollTop,
            originalScrollTop,
          });
          node.scrollTop = nudgedScrollTop;
          primeRaf = requestAnimationFrame(() => {
            node.scrollTop = originalScrollTop;
            logger.debug('Restored primed scroll position', {
              restoredScrollTop: originalScrollTop,
            });
          });
        }
      }

      const tick = (): void => {
        if (Math.abs(velocity) < 0.3) {
          velocity = 0;
          animating = false;
          if (!warmupCompensating) {
            lastScrollHeight = 0;
          }
          return;
        }

        // Fallback: if the ResizeObserver missed a scrollHeight change
        // (or hasn't been set up yet), catch it here. This fires 1 frame
        // late but is better than no compensation.
        const curScrollHeight = node.scrollHeight;
        let compensation = 0;

        if (lastScrollHeight > 0 && curScrollHeight !== lastScrollHeight) {
          const delta = curScrollHeight - lastScrollHeight;
          const scrollRange = lastScrollHeight - node.clientHeight;
          const atBottom = node.scrollTop + node.clientHeight >= curScrollHeight - 4;

          if (scrollRange > 0 && !atBottom) {
            compensation = node.scrollTop * (delta / scrollRange);
          }
        }
        lastScrollHeight = curScrollHeight;

        const max = curScrollHeight - node.clientHeight;
        node.scrollTop = Math.round(
          Math.max(0, Math.min(node.scrollTop + velocity + compensation, max))
        );
        if ((compensation !== 0 || Math.abs(velocity) >= maxPx) && tickLogCount < 12) {
          tickLogCount++;
          logger.debug('Velocity tick', {
            compensation,
            count: tickLogCount,
            max,
            scrollHeight: curScrollHeight,
            scrollTop: node.scrollTop,
            velocity,
          });
        }
        velocity *= friction;
        raf = requestAnimationFrame(tick);
      };

      const onWheel = (e: WheelEvent): void => {
        // Let the first N events through natively so WKWebView's compositor
        // calibrates. Without this, preventDefault on early events causes
        // compositor/main-thread position disagreement → scrollbar jitter.
        if (nativeCount < warmupEvents) {
          nativeCount++;
          warmupCompensating = true;
          lastScrollHeight = node.scrollHeight;
          window.clearTimeout(warmupResetTimer);
          warmupResetTimer = window.setTimeout(() => {
            warmupCompensating = false;
            if (!animating) {
              lastScrollHeight = 0;
            }
          }, 120);
          if (wheelLogCount < 8) {
            wheelLogCount++;
            logger.debug('Warmup wheel event', {
              count: wheelLogCount,
              deltaY: e.deltaY,
              nativeCount,
              scrollHeight: node.scrollHeight,
              scrollTop: node.scrollTop,
            });
          }
          return;
        }

        warmupCompensating = false;
        window.clearTimeout(warmupResetTimer);
        e.preventDefault();
        if (!hasFiredUserScroll) {
          hasFiredUserScroll = true;
          onUserScrollStartRef.current?.();
        }
        velocity += e.deltaY * sensitivity;
        velocity = Math.max(-maxPx, Math.min(velocity, maxPx));
        if (wheelLogCount < 8) {
          wheelLogCount++;
          logger.debug('Damped wheel event', {
            count: wheelLogCount,
            deltaY: e.deltaY,
            nextVelocity: velocity,
            scrollHeight: node.scrollHeight,
            scrollTop: node.scrollTop,
          });
        }
        if (!animating) {
          animating = true;
          lastScrollHeight = node.scrollHeight;
          raf = requestAnimationFrame(tick);
        }
      };

      // Reset velocity when external code scrolls (library auto-scroll,
      // scrollToItem) so the next wheel input starts fresh.
      const onScroll = (): void => {
        if (scrollLogCount < 8) {
          scrollLogCount++;
          logger.debug('Scroller scroll event', {
            animating,
            count: scrollLogCount,
            scrollHeight: node.scrollHeight,
            scrollTop: node.scrollTop,
            warmupCompensating,
          });
        }
        if (!animating) velocity = 0;
      };

      node.addEventListener('wheel', onWheel, { passive: false });
      node.addEventListener('scroll', onScroll, { passive: true });

      cleanupRef.current = (): void => {
        node.removeEventListener('wheel', onWheel);
        node.removeEventListener('scroll', onScroll);
        cancelAnimationFrame(raf);
        cancelAnimationFrame(primeRaf);
        window.clearTimeout(warmupResetTimer);
        listResizeObserver?.disconnect();
        listStyleObserver?.disconnect();
        listChildObserver?.disconnect();
        if (import.meta.env.DEV) {
          performance.mark('velocity-scroll-detach');
        }
        logger.debug('Detached velocity scroll');
        recordSessionSwitchTrace({
          event: 'velocity_scroll_detach',
          requestId: traceRequestId,
          sessionId: traceSessionId,
          data: {
            reason: 'cleanup',
          },
        });
      };
    },
    [maxPx, friction, sensitivity, warmupEvents, enabled, traceRequestId, traceSessionId]
  );

  // Cleanup on unmount
  useEffect(() => {
    return (): void => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []);

  return setRef;
}
