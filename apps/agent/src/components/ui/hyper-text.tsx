/**
 * HyperText - Text animation that scrambles letters before revealing final text
 *
 * Adapted from Magic UI (https://magicui.design)
 * Creates a "decoding" effect by cycling through random characters
 *
 * Performance optimizations (code review cycle 2):
 * - Removed per-character motion.span + AnimatePresence (was creating N layout observers)
 * - Uses simple spans with CSS for character display (no enter/exit animations needed)
 * - Properly handles children length changes by resetting displayText
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { FC, HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

type CharacterSet = string[] | readonly string[];

interface HyperTextProps extends HTMLAttributes<HTMLSpanElement> {
  /** The text content to be animated */
  readonly children: string;
  /** Optional className for styling */
  readonly className?: string;
  /** Duration of the animation in milliseconds */
  readonly duration?: number;
  /** Delay before animation starts in milliseconds */
  readonly delay?: number;
  /** Whether to start animation when element comes into view */
  readonly startOnView?: boolean;
  /** Whether to trigger animation on hover */
  readonly animateOnHover?: boolean;
  /** Custom character set for scramble effect. Defaults to uppercase alphabet */
  readonly characterSet?: CharacterSet;
  /** Whether to loop the animation continuously */
  readonly loop?: boolean;
  /** Pause between loops in milliseconds (default: 1000) */
  readonly loopPause?: number;
}

const DEFAULT_CHARACTER_SET = Object.freeze('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));

const getRandomInt = (max: number): number => Math.floor(Math.random() * max);

export const HyperText: FC<HyperTextProps> = ({
  children,
  className,
  duration = 800,
  delay = 0,
  startOnView = false,
  animateOnHover = false,
  characterSet = DEFAULT_CHARACTER_SET,
  loop = false,
  loopPause = 1000,
  ...props
}) => {
  const [displayText, setDisplayText] = useState<string[]>(() => children.split(''));
  const [isAnimating, setIsAnimating] = useState(false);
  const iterationCount = useRef(0);
  const elementRef = useRef<HTMLSpanElement>(null);
  // Track previous children to detect length changes (code review issue #5)
  const prevChildrenRef = useRef(children);

  // Handle children length changes - reset displayText when text changes
  // This prevents stale characters from persisting when switching messages
  useEffect(() => {
    if (prevChildrenRef.current !== children) {
      prevChildrenRef.current = children;
      setDisplayText(children.split(''));
      iterationCount.current = 0;
      // Restart animation for new text
      if (loop || !isAnimating) {
        setIsAnimating(true);
      }
    }
  }, [children, loop, isAnimating]);

  const handleAnimationTrigger = useCallback((): void => {
    if (animateOnHover && !isAnimating) {
      iterationCount.current = 0;
      setIsAnimating(true);
    }
  }, [animateOnHover, isAnimating]);

  // Handle animation start based on view or delay
  // Fixed: Track and clean up timeouts to prevent state updates after unmount (code review: Codex cycle 2 #3)
  useEffect(() => {
    let startTimeoutId: ReturnType<typeof setTimeout> | null = null;

    if (!startOnView) {
      startTimeoutId = setTimeout(() => {
        setIsAnimating(true);
      }, delay);
      return () => {
        if (startTimeoutId !== null) {
          clearTimeout(startTimeoutId);
        }
      };
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          // Store timeout ID so cleanup can clear it if component unmounts
          startTimeoutId = setTimeout(() => {
            setIsAnimating(true);
          }, delay);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '-30% 0px -30% 0px' }
    );

    if (elementRef.current) {
      observer.observe(elementRef.current);
    }

    return () => {
      observer.disconnect();
      // Clean up the delayed timeout if it was created (code review: Codex cycle 2 #3)
      if (startTimeoutId !== null) {
        clearTimeout(startTimeoutId);
      }
    };
  }, [delay, startOnView]);

  // Handle scramble animation
  useEffect(() => {
    if (!isAnimating) return;

    const maxIterations = children.length;
    const startTime = performance.now();
    let animationFrameId: number;
    let loopTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const animate = (currentTime: number): void => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      iterationCount.current = progress * maxIterations;

      // Build new display text based on animation progress
      // Characters before iterationCount show final text, after show random scramble
      setDisplayText(
        children
          .split('')
          .map((letter, index) =>
            letter === ' '
              ? letter
              : index <= iterationCount.current
                ? (children[index] ?? letter)
                : (characterSet[getRandomInt(characterSet.length)] ?? letter)
          )
      );

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
        // If looping, restart after pause
        if (loop) {
          loopTimeoutId = setTimeout(() => {
            iterationCount.current = 0;
            setIsAnimating(true);
          }, loopPause);
        }
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (loopTimeoutId !== null) {
        clearTimeout(loopTimeoutId);
      }
    };
  }, [children, duration, isAnimating, characterSet, loop, loopPause]);

  // Render as simple spans - no motion components needed for scramble effect
  // The animation is driven by state updates, not CSS transitions
  return (
    <span
      ref={elementRef}
      className={cn('overflow-hidden', className)}
      onMouseEnter={handleAnimationTrigger}
      {...props}
    >
      {displayText.map((letter, index) => (
        <span
          key={`${String(index)}-${String(displayText.length)}`}
          className={cn('font-mono', letter === ' ' ? 'inline-block w-2' : '')}
        >
          {letter.toUpperCase()}
        </span>
      ))}
    </span>
  );
};
