import { useEffect, useRef, useState } from 'react';

import type { RefObject } from 'react';

/**
 * Track the width of a container element using ResizeObserver.
 *
 * Returns 0 before first measurement or if element is null.
 * Cleans up observer on unmount to prevent memory leaks.
 *
 * PERF: Debounced with RAF so rapid resize events (e.g. during sidebar
 * animation) coalesce into a single setState per frame instead of one per
 * ResizeObserver callback.
 *
 * @example
 * const containerRef = useRef<HTMLDivElement>(null);
 * const width = useContainerWidth(containerRef);
 * const isCompact = width > 0 && width < 520;
 */
export function useContainerWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Initial measurement using getBoundingClientRect for consistency.
    // Note: ResizeObserver's contentRect.width gives content-box dimensions,
    // while getBoundingClientRect gives border-box. For elements without
    // explicit padding/border (typical for flex containers), these are equivalent.
    setWidth(element.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      // Debounce with RAF: coalesce rapid resize events into one update per frame
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        // contentRect.width is the content-box width (excludes padding/border).
        // For typical flex containers used with this hook, this matches our needs.
        setWidth(entry.contentRect.width);
      });
    });

    observer.observe(element);
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      observer.disconnect();
    };
    // Note: ref object is stable (same identity across renders); effect runs once on mount.
    // ResizeObserver handles subsequent size changes via its callback, not via effect re-runs.
  }, [ref]);

  return width;
}
