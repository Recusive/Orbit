/**
 * ThinkingDots - Animated 3x3 dot grid that traces "ORBIT" letters
 *
 * Cycles through animation patterns that trace the letters O, R, B, I, T
 * using a 3x3 dot grid with staggered opacity animations.
 */
import { useEffect, useState } from 'react';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface ThinkingDotsProps {
  readonly className?: string;
  /** Size of the container in pixels (default: 24) */
  readonly size?: number;
  /** Animation duration for one letter cycle in seconds (default: 1.4) */
  readonly duration?: number;
  /** How long to show each letter before transitioning in seconds (default: 2) */
  readonly letterDuration?: number;
}

/**
 * Grid positions for 3x3 dots (viewBox is 24x24)
 * Layout:
 *   [0] [1] [2]     (5.6,5.6)  (12,5.6)   (18.4,5.6)
 *   [3] [4] [5]  →  (5.6,12)   (12,12)    (18.4,12)
 *   [6] [7] [8]     (5.6,18.4) (12,18.4)  (18.4,18.4)
 */
const DOT_POSITIONS = [
  { cx: 5.6, cy: 5.6 }, // 0: top-left
  { cx: 12, cy: 5.6 }, // 1: top-center
  { cx: 18.4, cy: 5.6 }, // 2: top-right
  { cx: 5.6, cy: 12 }, // 3: middle-left
  { cx: 12, cy: 12 }, // 4: center
  { cx: 18.4, cy: 12 }, // 5: middle-right
  { cx: 5.6, cy: 18.4 }, // 6: bottom-left
  { cx: 12, cy: 18.4 }, // 7: bottom-center
  { cx: 18.4, cy: 18.4 }, // 8: bottom-right
] as const;

/**
 * Animation orders for each letter in "ORBIT"
 * Each array defines which dots light up and in what sequence.
 * Dots NOT in the array stay dim (don't animate).
 *
 * Grid:
 *   [0] [1] [2]
 *   [3] [4] [5]
 *   [6] [7] [8]
 *
 * O: Full circle around edges, end at center
 * R: Up left spine, across top, down to diagonal leg
 * B: Center outward clockwise spiral
 * I: Middle column + corners (no sides)
 * T: Top bar + stem only
 */
const LETTER_ANIMATIONS = {
  O: [0, 1, 2, 5, 8, 7, 6, 3, 4], // Full circle clockwise, end center
  R: [6, 3, 0, 1, 2, 5, 4, 8], // Up spine, top, down-right, diagonal (skip 7)
  B: [4, 5, 8, 7, 6, 3, 0, 1, 2], // Center out clockwise
  I: [1, 4, 7, 0, 2, 6, 8], // Stem + corners (no 3, 5)
  T: [0, 1, 2, 4, 7], // Top bar + stem (no 3, 5, 6, 8)
} as const;

const LETTER_ORDER = ['O', 'R', 'B', 'I', 'T'] as const;

export const ThinkingDots: FC<ThinkingDotsProps> = ({
  className,
  size = 24,
  duration = 1.4,
  letterDuration = 2,
}) => {
  const [letterIndex, setLetterIndex] = useState(0);

  // Cycle through ORBIT letters
  useEffect(() => {
    const interval = setInterval(() => {
      setLetterIndex((prev) => (prev + 1) % LETTER_ORDER.length);
    }, letterDuration * 1000);

    return () => {
      clearInterval(interval);
    };
  }, [letterDuration]);

  // Fallback to 'O' if letterIndex is somehow out of bounds.
  // This shouldn't happen due to modulo in setLetterIndex, but defensive coding
  // prevents runtime errors if LETTER_ORDER is ever modified incorrectly.
  const currentLetter = LETTER_ORDER[letterIndex] ?? 'O';
  const animationOrder = LETTER_ANIMATIONS[currentLetter];

  // Calculate delay for each dot based on its position in the current letter's animation order
  // Returns null if the dot shouldn't animate (not in this letter's pattern)
  const getDelay = (dotIndex: number): number | null => {
    // Cast to number for indexOf since animationOrder has literal types
    const orderPosition = (animationOrder as readonly number[]).indexOf(dotIndex);
    if (orderPosition === -1) return null; // Dot not in this letter's pattern
    return (orderPosition / animationOrder.length) * duration;
  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn('text-primary', className)}
      aria-label="Loading"
      role="status"
    >
      <style>
        {`
          @keyframes thinking-dot-pulse {
            0%, 100% { opacity: 0.2; }
            12.5% { opacity: 1; }
            25% { opacity: 0.6; }
            50% { opacity: 0.2; }
          }
        `}
      </style>
      {DOT_POSITIONS.map((pos, index) => {
        const delay = getDelay(index);
        const shouldAnimate = delay !== null;

        return (
          <circle
            key={`${currentLetter}-${String(index)}`}
            cx={pos.cx}
            cy={pos.cy}
            r={1.6}
            fill="currentColor"
            style={
              shouldAnimate
                ? {
                    animation: `thinking-dot-pulse ${String(duration)}s ease-in-out infinite`,
                    animationDelay: `${String(delay)}s`,
                    opacity: 0.2,
                  }
                : {
                    opacity: 0.1, // Dim for non-participating dots
                  }
            }
          />
        );
      })}
    </svg>
  );
};
