import { useLayoutEffect, useRef } from 'react';

import { STABILIZATION_FRAME_COUNT } from './constants';

import type { UseLayoutStabilizationProps, UseLayoutStabilizationReturn } from './types';

/**
 * Hook for unified layout stabilization during conversation transitions
 *
 * Ensures the entire content area (welcome OR messages) is hidden until layout is stable.
 * Controls BOTH isLoadingConversation and isConversationTransitioning atomically
 * to prevent flash caused by state updates happening at different times.
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

    let lastHeight = 0;
    let stableCount = 0;
    let frameId: number;

    const checkStable = (): void => {
      const currentHeight = container.scrollHeight;
      if (currentHeight === lastHeight) {
        stableCount++;
        // Wait for consecutive frames with same height to ensure layout is complete
        if (stableCount >= STABILIZATION_FRAME_COUNT) {
          // Reveal content atomically - both states change together
          // This prevents the flash where one state changes before the other
          setLoadingConversation(false);
          setConversationTransitioning(false);
          return;
        }
      } else {
        stableCount = 0;
        lastHeight = currentHeight;
      }
      frameId = requestAnimationFrame(checkStable);
    };

    frameId = requestAnimationFrame(checkStable);

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [isTransitioning, messageCount, setConversationTransitioning, setLoadingConversation]);

  return { contentRef };
}
