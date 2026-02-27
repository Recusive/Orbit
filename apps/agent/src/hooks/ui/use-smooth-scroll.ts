/**
 * useSmoothScroll - Lerp-based scroll damping for controlled, Apple-like scrolling.
 *
 * Intercepts native wheel events and animates scroll position via
 * requestAnimationFrame with linear interpolation. This caps the visual
 * scroll speed regardless of input velocity, creating the "controlled"
 * feel seen in GitHub's branch picker, Linear, etc.
 *
 * Returns a callback ref — attach it to the scrollable element.
 * Handles mount/unmount automatically (safe for Radix portals).
 *
 * External scroll coexistence: a passive `scroll` listener continuously
 * syncs state when the hook isn't actively lerping. This lets libraries
 * like useStickToBottom freely adjust scrollTop (e.g., on content resize
 * or streaming) without the hook fighting back or causing stutter.
 */
import { useCallback, useEffect, useRef } from 'react';

interface SmoothScrollState {
  target: number;
  current: number;
  animating: boolean;
  raf: number;
}

interface SmoothScrollOptions {
  /** Lerp factor per frame. Lower = smoother/slower. Default 0.12. */
  damping?: number;
  /**
   * Called when the user scrolls away from the bottom via wheel input.
   * Use this to notify external scroll managers (e.g., useStickToBottom's
   * stopScroll) so they don't fight the lerp animation.
   */
  onScrollAway?: () => void;
}

/**
 * @param dampingOrOptions - Damping factor (number) or options object.
 *   0.08 = very controlled (500ms to settle)
 *   0.12 = balanced (350ms to settle)
 *   0.18 = responsive (250ms to settle)
 */
export function useSmoothScroll(
  dampingOrOptions?: number | SmoothScrollOptions
): (node: HTMLElement | null) => void {
  const opts =
    typeof dampingOrOptions === 'number' ? { damping: dampingOrOptions } : (dampingOrOptions ?? {});
  const damping = opts.damping ?? 0.12;
  const onScrollAwayRef = useRef(opts.onScrollAway);
  onScrollAwayRef.current = opts.onScrollAway;

  const stateRef = useRef<SmoothScrollState>({ target: 0, current: 0, animating: false, raf: 0 });
  const cleanupRef = useRef<(() => void) | null>(null);

  const setRef = useCallback(
    (node: HTMLElement | null): void => {
      // Teardown previous
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }

      if (!node) return;

      const s = stateRef.current;
      s.target = node.scrollTop;
      s.current = node.scrollTop;
      s.animating = false;

      const tick = (): void => {
        const diff = s.target - s.current;
        if (Math.abs(diff) < 0.5) {
          s.current = s.target;
          node.scrollTop = s.current;
          s.animating = false;
          return;
        }
        s.current += diff * damping;
        node.scrollTop = s.current;
        s.raf = requestAnimationFrame(tick);
      };

      const onWheel = (e: WheelEvent): void => {
        e.preventDefault();
        // Always sync with actual DOM position before processing input —
        // covers any external scrollTop changes since last frame
        s.current = node.scrollTop;
        if (!s.animating) {
          s.target = node.scrollTop;
        }

        const maxScroll = node.scrollHeight - node.clientHeight;
        s.target = Math.max(0, Math.min(s.target + e.deltaY, maxScroll));

        // Notify external scroll managers (e.g., useStickToBottom) when the
        // user scrolls away from the bottom. Must fire BEFORE the lerp starts
        // so the manager releases before it can fight our animation.
        if (e.deltaY < 0 && onScrollAwayRef.current) {
          const atBottom = node.scrollTop >= maxScroll - 1;
          if (atBottom || s.target < maxScroll - 1) {
            onScrollAwayRef.current();
          }
        }

        if (!s.animating) {
          s.animating = true;
          s.raf = requestAnimationFrame(tick);
        }
      };

      // Passive scroll listener — keeps state in sync with external
      // scrollTop changes (useStickToBottom, scrollToBottom(), session
      // switch resets, etc.) so the next user wheel input starts from
      // the correct position. Only syncs when NOT actively lerping.
      const onScroll = (): void => {
        if (!s.animating) {
          s.current = node.scrollTop;
          s.target = node.scrollTop;
        }
      };

      node.addEventListener('wheel', onWheel, { passive: false });
      node.addEventListener('scroll', onScroll, { passive: true });

      cleanupRef.current = (): void => {
        node.removeEventListener('wheel', onWheel);
        node.removeEventListener('scroll', onScroll);
        cancelAnimationFrame(s.raf);
      };
    },
    [damping]
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
