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
 * ── Tuning Guide (if scrollbar jitter or ghost text returns) ───────────
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
import { useCallback, useEffect, useRef } from 'react';

interface VelocityScrollOptions {
  /** Max pixels per frame. Caps speed for virtualization buffer. Default 50. */
  maxPxPerFrame?: number;
  /** Velocity multiplier per frame. Lower = longer coast. Default 0.91. */
  friction?: number;
  /** Wheel deltaY multiplier. Higher = more responsive. Default 0.55. */
  sensitivity?: number;
  /** Number of wheel events to let through natively before engaging. Default 3. */
  warmupEvents?: number;
}

export function useVelocityScroll(
  options?: VelocityScrollOptions
): (node: HTMLElement | null) => void {
  const maxPx = options?.maxPxPerFrame ?? 50;
  const friction = options?.friction ?? 0.91;
  const sensitivity = options?.sensitivity ?? 0.55;
  const warmupEvents = options?.warmupEvents ?? 3;

  const cleanupRef = useRef<(() => void) | null>(null);

  const setRef = useCallback(
    (node: HTMLElement | null): void => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }

      if (!node) return;

      let velocity = 0;
      let animating = false;
      let raf = 0;
      let nativeCount = 0;

      const tick = (): void => {
        if (Math.abs(velocity) < 0.3) {
          velocity = 0;
          animating = false;
          return;
        }
        const max = node.scrollHeight - node.clientHeight;
        node.scrollTop = Math.round(Math.max(0, Math.min(node.scrollTop + velocity, max)));
        velocity *= friction;
        raf = requestAnimationFrame(tick);
      };

      const onWheel = (e: WheelEvent): void => {
        // Let the first N events through natively so WKWebView's compositor
        // calibrates. Without this, preventDefault on early events causes
        // compositor/main-thread position disagreement → scrollbar jitter.
        if (nativeCount < warmupEvents) {
          nativeCount++;
          return;
        }

        e.preventDefault();
        velocity += e.deltaY * sensitivity;
        velocity = Math.max(-maxPx, Math.min(velocity, maxPx));
        if (!animating) {
          animating = true;
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
      };
    },
    [maxPx, friction, sensitivity, warmupEvents]
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
