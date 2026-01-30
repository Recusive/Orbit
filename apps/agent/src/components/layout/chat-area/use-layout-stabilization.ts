import { useLayoutEffect, useRef } from 'react';

import { STABILIZATION_STABLE_THRESHOLD_MS } from './constants';

import type { UseLayoutStabilizationProps, UseLayoutStabilizationReturn } from './types';

/**
 * Hook for unified layout stabilization during conversation transitions
 *
 * Ensures the entire content area (welcome OR messages) is hidden until layout is stable.
 * Controls BOTH isLoadingConversation and isConversationTransitioning atomically
 * to prevent flash caused by state updates happening at different times.
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

    // Timer-based stability detection: when ResizeObserver stops firing
    // for STABILIZATION_STABLE_THRESHOLD_MS, layout is considered stable.
    let stabilityTimer: ReturnType<typeof setTimeout> | null = null;

    const reveal = (): void => {
      // Reveal content atomically - both states change together
      // This prevents the flash where one state changes before the other
      setLoadingConversation(false);
      setConversationTransitioning(false);
    };

    const resetStabilityTimer = (): void => {
      if (stabilityTimer !== null) {
        clearTimeout(stabilityTimer);
      }
      stabilityTimer = setTimeout(reveal, STABILIZATION_STABLE_THRESHOLD_MS);
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
    };
  }, [isTransitioning, messageCount, setConversationTransitioning, setLoadingConversation]);

  return { contentRef };
}
