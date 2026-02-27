import { useLayoutEffect, useRef } from 'react';

import { SKELETON_MIN_DISPLAY_MS, STABILIZATION_STABLE_THRESHOLD_MS } from './constants';

import type { UseLayoutStabilizationProps, UseLayoutStabilizationReturn } from './types';

/**
 * Hook for unified layout stabilization during conversation transitions
 *
 * Ensures the entire content area (welcome OR messages) is hidden until layout is stable
 * AND the skeleton has been visible for a minimum duration (SKELETON_MIN_DISPLAY_MS).
 * Controls BOTH isLoadingConversation and isConversationTransitioning atomically
 * to prevent flash caused by state updates happening at different times.
 *
 * Two conditions must be met before revealing:
 * 1. Layout stability: ResizeObserver hasn't fired for STABILIZATION_STABLE_THRESHOLD_MS
 * 2. Minimum display: at least SKELETON_MIN_DISPLAY_MS have elapsed since transition start
 *
 * Uses ResizeObserver instead of rAF+scrollHeight polling to avoid forced synchronous
 * layout reflows. The observer fires only when the container actually changes size,
 * rather than polling every frame (which forces layout recalculation on each read).
 *
 * @param props - Stabilization configuration
 * @returns Content ref to attach to the container element
 */
export function useLayoutStabilization({
  isTransitioning,
  messageCount,
  setLoadingConversation,
  setConversationTransitioning,
}: UseLayoutStabilizationProps): UseLayoutStabilizationReturn {
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!isTransitioning) return undefined;

    const container = contentRef.current;
    if (!container) {
      // No container - immediately reveal (edge case, shouldn't happen)
      setLoadingConversation(false);
      setConversationTransitioning(false);
      return undefined;
    }

    const startTime = performance.now();

    // Timer-based stability detection: when ResizeObserver stops firing
    // for STABILIZATION_STABLE_THRESHOLD_MS, layout is considered stable.
    let stabilityTimer: ReturnType<typeof setTimeout> | null = null;
    let minDisplayTimer: ReturnType<typeof setTimeout> | null = null;
    let isLayoutStable = false;

    const reveal = (): void => {
      // Reveal content atomically - both states change together
      // This prevents the flash where one state changes before the other
      setLoadingConversation(false);
      setConversationTransitioning(false);
    };

    const tryReveal = (): void => {
      if (!isLayoutStable) return;

      const elapsed = performance.now() - startTime;
      const remaining = SKELETON_MIN_DISPLAY_MS - elapsed;

      if (remaining <= 0) {
        reveal();
      } else {
        // Layout is stable but skeleton hasn't been visible long enough.
        // Schedule reveal for when the minimum display time elapses.
        if (minDisplayTimer !== null) {
          clearTimeout(minDisplayTimer);
        }
        minDisplayTimer = setTimeout(reveal, remaining);
      }
    };

    const onLayoutStable = (): void => {
      isLayoutStable = true;
      tryReveal();
    };

    const resetStabilityTimer = (): void => {
      if (stabilityTimer !== null) {
        clearTimeout(stabilityTimer);
      }
      // Layout changed — it's no longer stable
      isLayoutStable = false;
      stabilityTimer = setTimeout(onLayoutStable, STABILIZATION_STABLE_THRESHOLD_MS);
    };

    const observer = new ResizeObserver(() => {
      // Each resize resets the stability timer — we wait for resizes to stop
      resetStabilityTimer();
    });

    observer.observe(container);

    // Start the initial stability timer immediately.
    // If the container doesn't resize at all (empty conversation, already correct size),
    // this ensures we still reveal after the threshold.
    resetStabilityTimer();

    return () => {
      observer.disconnect();
      if (stabilityTimer !== null) {
        clearTimeout(stabilityTimer);
      }
      if (minDisplayTimer !== null) {
        clearTimeout(minDisplayTimer);
      }
    };
  }, [isTransitioning, messageCount, setConversationTransitioning, setLoadingConversation]);

  return { contentRef };
}
