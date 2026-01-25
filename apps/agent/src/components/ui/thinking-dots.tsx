/**
 * ThinkingDots - Animated 3x3 dot grid loading indicator
 *
 * Inspired by Claude.ai's thinking animation. Creates a clockwise ripple
 * effect through 9 dots with staggered opacity animations.
 */
import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface ThinkingDotsProps {
  readonly className?: string;
  /** Size of the container in pixels (default: 24) */
  readonly size?: number;
  /** Animation duration in seconds (default: 1.4) */
  readonly duration?: number;
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
  { cx: 12, cy: 12 }, // 4: center (brightest)
  { cx: 18.4, cy: 12 }, // 5: middle-right
  { cx: 5.6, cy: 18.4 }, // 6: bottom-left
  { cx: 12, cy: 18.4 }, // 7: bottom-center
  { cx: 18.4, cy: 18.4 }, // 8: bottom-right
] as const;

/**
 * Animation order for clockwise ripple starting from center:
 * Center(4) → Right(5) → BottomRight(8) → Bottom(7) → BottomLeft(6) →
 * Left(3) → TopLeft(0) → Top(1) → TopRight(2) → repeat
 */
const ANIMATION_ORDER = [4, 5, 8, 7, 6, 3, 0, 1, 2] as const;

export const ThinkingDots: FC<ThinkingDotsProps> = ({ className, size = 24, duration = 1.4 }) => {
  // Calculate delay for each dot based on its position in the animation order
  const getDelay = (dotIndex: number): number => {
    const orderPosition = ANIMATION_ORDER.indexOf(dotIndex as (typeof ANIMATION_ORDER)[number]);
    if (orderPosition === -1) return 0;
    // Stagger delays evenly across the duration
    return (orderPosition / ANIMATION_ORDER.length) * duration;
  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn('text-muted-foreground', className)}
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
      {DOT_POSITIONS.map((pos, index) => (
        <circle
          key={index}
          cx={pos.cx}
          cy={pos.cy}
          r={1.6}
          fill="currentColor"
          style={{
            animation: `thinking-dot-pulse ${String(duration)}s ease-in-out infinite`,
            animationDelay: `${String(getDelay(index))}s`,
            opacity: 0.2, // Start at base opacity
          }}
        />
      ))}
    </svg>
  );
};
