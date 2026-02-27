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
 */
import { useCallback, useEffect, useRef } from 'react';

interface SmoothScrollState {
  target: number;
  current: number;
  animating: boolean;
  raf: number;
}

/**
 * @param damping - Lerp factor per frame. Lower = smoother/slower. Default 0.12.
 *   0.08 = very controlled (500ms to settle)
 *   0.12 = balanced (350ms to settle)
 *   0.18 = responsive (250ms to settle)
 */
export function useSmoothScroll(damping = 0.12): (node: HTMLElement | null) => void {
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
        const maxScroll = node.scrollHeight - node.clientHeight;
        s.target = Math.max(0, Math.min(s.target + e.deltaY, maxScroll));
        if (!s.animating) {
          s.animating = true;
          s.raf = requestAnimationFrame(tick);
        }
      };

      node.addEventListener('wheel', onWheel, { passive: false });

      cleanupRef.current = (): void => {
        node.removeEventListener('wheel', onWheel);
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
