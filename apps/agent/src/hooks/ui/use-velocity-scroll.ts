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
 * The virtualized message list's scroll compensation only
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
 *   - Increase `increaseViewportBy` on the message list (currently 10000).
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
import { useCallback, useEffect, useRef } from 'react';

import { CHAT_LIST_SURFACE_SELECTOR } from '@/lib/chat/chat-selectors';
import { markOperation } from '@/lib/perf/frame-monitor';
import {
  markSwitchTimeline,
  recordSessionSwitchTrace,
} from '@/services/conversations/session-switch-trace';

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
  /** Skip the synthetic 1px prime nudge for this attachment. */
  skipInitialPrime?: boolean;
  traceRequestId?: number | null;
  traceSessionId?: string | null;
}

// compensateScrollHeight REMOVED — it fought with TanStack Virtual's position
// math during fast scroll. When row measurements change, the virtualizer
// updates totalSize → chat-list-inner height changes → the observer fires →
// compensates scrollTop → virtualizer sees new scrollTop → recalculates range
// → more measurements change → observer fires again → OSCILLATION LOOP.
// The virtualizer handles scroll position stability internally via
// shouldAdjustScrollPositionOnItemSizeChange. See git history for the original.

export function useVelocityScroll(
  options?: VelocityScrollOptions
): (node: HTMLElement | null) => void {
  const maxPx = options?.maxPxPerFrame ?? 50;
  const friction = options?.friction ?? 0.91;
  const sensitivity = options?.sensitivity ?? 0.55;
  const warmupEvents = options?.warmupEvents ?? 3;
  const enabled = options?.enabled ?? true;
  const skipInitialPrime = options?.skipInitialPrime ?? false;
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

      if (import.meta.env.DEV) {
        performance.mark('velocity-scroll-attach');
      }
      markSwitchTimeline('velocity', 'attached');
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
        // Track scrollHeight for the tick fallback. No compensation — the
        // virtualizer's shouldAdjustScrollPositionOnItemSizeChange handles it.
        lastScrollHeight = node.scrollHeight;
      };

      // Locate the inner list container and observe it. It may not exist
      // yet if the data is empty (the library conditionally renders it).
      const observeListContainer = (): void => {
        const end = markOperation('velocity-attach');
        const listEl = node.querySelector(CHAT_LIST_SURFACE_SELECTOR);
        if (listEl === null) {
          end();
          return;
        }

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
        end();
      };

      // If the list container isn't in the DOM yet, use a MutationObserver
      // to detect when it appears, then start observation.
      let listChildObserver: MutationObserver | null = null;

      const initListObserver = (): void => {
        if (node.querySelector(CHAT_LIST_SURFACE_SELECTOR) !== null) {
          observeListContainer();
          return;
        }

        // Wait for the list container to appear.
        listChildObserver = new MutationObserver(() => {
          if (node.querySelector(CHAT_LIST_SURFACE_SELECTOR) !== null) {
            listChildObserver?.disconnect();
            listChildObserver = null;
            observeListContainer();
          }
        });
        listChildObserver.observe(node, { childList: true });
      };

      initListObserver();

      // Prime the virtualizer's internal scroll tracking before the first real wheel
      // gesture. Without this 1px synthetic nudge, the first aggressive scroll
      // after attach can disagree with the virtualizer's cached position and
      // cause the scrollbar thumb to jitter until the second gesture.
      const maxScrollTop = node.scrollHeight - node.clientHeight;
      const originalScrollTop = node.scrollTop;
      if (skipInitialPrime) {
        recordSessionSwitchTrace({
          event: 'velocity_scroll_warmup_skipped',
          requestId: traceRequestId,
          sessionId: traceSessionId,
        });
      } else if (maxScrollTop > 0) {
        const endPrime = markOperation('velocity-prime');
        const nudgedScrollTop =
          originalScrollTop < maxScrollTop ? originalScrollTop + 1 : originalScrollTop - 1;

        if (nudgedScrollTop !== originalScrollTop) {
          node.scrollTop = nudgedScrollTop;
          primeRaf = requestAnimationFrame(() => {
            node.scrollTop = originalScrollTop;
          });
        }
        endPrime();
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

        const endTick = markOperation('velocity-tick');
        lastScrollHeight = node.scrollHeight;

        const max = node.scrollHeight - node.clientHeight;
        node.scrollTop = Math.round(Math.max(0, Math.min(node.scrollTop + velocity, max)));
        velocity *= friction;
        endTick();
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
        if (!animating) {
          animating = true;
          lastScrollHeight = node.scrollHeight;
          raf = requestAnimationFrame(tick);
        }
      };

      // Reset velocity when external code scrolls (library auto-scroll,
      // scrollToItem) so the next wheel input starts fresh.
      const onScroll = (): void => {
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
        markSwitchTimeline('velocity', 'detached');
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
    [
      maxPx,
      friction,
      sensitivity,
      warmupEvents,
      enabled,
      skipInitialPrime,
      traceRequestId,
      traceSessionId,
    ]
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
