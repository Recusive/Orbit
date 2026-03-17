import { useEffect } from 'react';

import type { FC } from 'react';

import { OrbitLogo } from '@/components/icons/orbit-logo';
import { cn } from '@/lib/utils';

export interface WelcomePageProps {
  className?: string;
  /** When true, defers the account toast until the launch sequence finishes. */
  deferToast?: boolean | undefined;
  /** When true, triggers the entrance animation. */
  animate?: boolean | undefined;
  /** Fires once after the entrance animation completes. */
  onAnimationComplete?: (() => void) | undefined;
}

/** ease-out-quint — fast start, smooth settle */
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
/** ease-in-out-quint — slow→fast→slow snap */
const EASE_SNAP = 'cubic-bezier(0.86, 0, 0.07, 1)';

/** Phase timings (ms) */
const SLIDE_UP = 600;
const SPIN_DELAY = SLIDE_UP + 100;
const SPIN_DURATION = 350;
const SETTLE_DELAY = SPIN_DELAY + SPIN_DURATION + 50;
const SETTLE_DURATION = 600;
const TOTAL_DURATION = SETTLE_DELAY + SETTLE_DURATION;

/** How far right the row starts so the icon appears centered */
const SHIFT_OFFSET = 190;

/**
 * Welcome page shown on startup when no workspace is open.
 *
 * Sequence:
 * 1. Icon slides up to center (0° rotation)
 * 2. Icon does a horizontal coin-flip spin (rotateY)
 * 3. Icon shifts left + slowly tilts to -45° + "Orbit" reveals (all together)
 */
export const WelcomePage: FC<WelcomePageProps> = ({ className, animate, onAnimationComplete }) => {
  useEffect(() => {
    if (animate) {
      const timer = window.setTimeout(() => {
        onAnimationComplete?.();
      }, TOTAL_DURATION);
      return (): void => {
        window.clearTimeout(timer);
      };
    }
    return undefined;
  }, [animate, onAnimationComplete]);

  return (
    <div
      className={cn(
        'relative flex items-center justify-center h-full w-full select-none overflow-hidden',
        className
      )}
    >
      {/* Row — starts offset right so icon is centered, shifts left with text reveal */}
      <div
        className="flex items-center gap-0"
        style={{
          transform: `translateX(${String(SHIFT_OFFSET)}px)`,
          animation: `welcomeShiftLeft ${String(SETTLE_DURATION)}ms ${EASE_OUT} ${String(SETTLE_DELAY)}ms forwards`,
        }}
      >
        {/* Slide-up wrapper */}
        <div
          style={{
            perspective: 800,
            opacity: 0,
            transform: 'translateY(60px)',
            animation: `welcomeSlideUp ${String(SLIDE_UP)}ms ${EASE_OUT} forwards`,
          }}
        >
          {/* Horizontal spin wrapper (rotateY — coin flip) */}
          <div
            style={{
              transform: 'rotateY(0deg)',
              animation: `welcomeSpin ${String(SPIN_DURATION)}ms ${EASE_SNAP} ${String(SPIN_DELAY)}ms forwards`,
            }}
          >
            {/* Tilt — rotates slowly to -45° during the shift-left phase */}
            <OrbitLogo
              size={240}
              className="text-[var(--primary)]"
              style={{
                transform: 'rotate(0deg)',
                animation: `welcomeTilt ${String(SETTLE_DURATION)}ms ${EASE_OUT} ${String(SETTLE_DELAY)}ms forwards`,
              }}
            />
          </div>
        </div>

        {/* Wordmark — clip reveals as icon shifts left and tilts */}
        <span
          className="text-[var(--primary)] -ml-6"
          style={{
            fontFamily: "'Newsreader', serif",
            fontSize: 160,
            fontWeight: 500,
            clipPath: 'inset(0 100% 0 0)',
            animation: `welcomeClipReveal ${String(SETTLE_DURATION)}ms ${EASE_OUT} ${String(SETTLE_DELAY)}ms forwards`,
          }}
        >
          Orbit
        </span>
      </div>
    </div>
  );
};
