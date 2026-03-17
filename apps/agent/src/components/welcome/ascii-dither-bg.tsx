/**
 * DitherBg — Procedural warp dither background using @paper-design/shaders-react.
 *
 * Renders a slow-moving warp dither pattern.
 * Fires onAnimationComplete after a brief reveal delay for launch sequence integration.
 */
import { Dithering } from '@paper-design/shaders-react';
import { useEffect, useRef } from 'react';

import type { FC } from 'react';

import { useTheme } from '@/providers/theme-provider';

/** Evaluated once — reduced-motion preference is static for session lifetime. */
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Delay before firing onAnimationComplete — lets the pattern establish. */
const REVEAL_DELAY_MS = 1600;

interface AsciiDitherBgProps {
  readonly className?: string;
  /** Fires once after the reveal delay for launch sequence integration. */
  readonly onAnimationComplete?: (() => void) | undefined;
  /** When false, shader speed is paused. */
  readonly animate?: boolean | undefined;
}

export const AsciiDitherBg: FC<AsciiDitherBgProps> = ({
  className,
  onAnimationComplete,
  animate = true,
}) => {
  const { effectiveTheme } = useTheme();
  const colorBack = effectiveTheme === 'dark' ? '#171717' : '#FAFAFA';
  const completeFiredRef = useRef(false);
  const onCompleteRef = useRef(onAnimationComplete);
  onCompleteRef.current = onAnimationComplete;

  useEffect(() => {
    if (PREFERS_REDUCED_MOTION) {
      if (!completeFiredRef.current) {
        completeFiredRef.current = true;
        onCompleteRef.current?.();
      }
      return;
    }
    if (!animate) return;

    const timer = setTimeout(() => {
      if (!completeFiredRef.current) {
        completeFiredRef.current = true;
        onCompleteRef.current?.();
      }
    }, REVEAL_DELAY_MS);

    return (): void => {
      clearTimeout(timer);
    };
  }, [animate]);

  return (
    <div className={className}>
      <Dithering
        colorBack={colorBack}
        colorFront="#d85e46"
        shape="warp"
        type="4x4"
        size={7.4}
        speed={animate && !PREFERS_REDUCED_MOTION ? 0.02 : 0}
        scale={1}
        rotation={0}
        offsetX={0}
        offsetY={0}
        width="100%"
        height="100%"
      />
    </div>
  );
};
