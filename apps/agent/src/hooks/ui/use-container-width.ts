import { useEffect, useState } from 'react';

import type { RefObject } from 'react';

/**
 * Track the width of a container element using ResizeObserver.
 *
 * Returns 0 before first measurement or if element is null.
 * Cleans up observer on unmount to prevent memory leaks.
 *
 * @example
 * const containerRef = useRef<HTMLDivElement>(null);
 * const width = useContainerWidth(containerRef);
 * const isCompact = width > 0 && width < 520;
 */
export function useContainerWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Initial measurement
    setWidth(element.offsetWidth);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setWidth(entry.contentRect.width);
      }
    });

    observer.observe(element);
    return () => {
      observer.disconnect();
    };
    // Note: ref object is stable (same identity across renders); effect runs once on mount.
    // ResizeObserver handles subsequent size changes via its callback, not via effect re-runs.
  }, [ref]);

  return width;
}
