/**
 * ArrowRightIcon — SF Symbol "arrow.right"
 * A right-pointing chevron arrow.
 *
 * Uses the actual SF Symbol rasterised as a PNG mask so the result is
 * pixel-identical to the native macOS icon.
 */
import { forwardRef } from 'react';

import type { CSSProperties, HTMLAttributes } from 'react';

const MASK_SRC =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACIAAAAYCAYAAACfpi8JAAAAAXNSR0IArs4c6QAAAGxlWElmTU0AKgAAAAgABAEaAAUAAAABAAAAPgEbAAUAAAABAAAARgEoAAMAAAABAAIAAIdpAAQAAAABAAAATgAAAAAAAACQAAAAAQAAAJAAAAABAAKgAgAEAAAAAQAAACKgAwAEAAAAAQAAABgAAAAAg8HodQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAVdJREFUSA3tlq1LQ2EUxq9TmUwFg0EYwhiIGEwmm82gYDEIloF/gN2/Q2xqc0GwGAQFwWCyWSxaFAwGw/xG/Pg9sAOHFw0yd27ZAz/ec96N+zz3PXcfWdbR/59AF5fcgjvYgF7IRRVcvxwH1CUIVzeOJ+DDnNIPhSfBsB+OwIc5px+BcBVx3AMf5oq+Gp4EQ41pE3yYW/pJyEVruH6CBbqnns4lCaaL8AwW5ol6Fn6UvgO8xmhqMOA3/1jL+BUeYAKWwfROoX7XNn5bL3nB7qBd6xse5TRAIdnoSfp2tPJMfbPUeJ43rUAro1F4jaYB+ugugemDQte/sY2IdQ4TPSc24hfqhQhj77FKo7u3EDqdGQiTZr8OFkCrfpWnIEx63nbAh7imHw9LgFEf7IMPcUE/CmHSOA7BhzijHw5L0DSqsPoQx/SDzddCF51IHR5hG/R3oKOWT+Ab9c5o/gjb1FcAAAAASUVORK5CYII=';

/** Source PNG aspect ratio: 34 wide × 24 tall */
const ASPECT = 34 / 24;

interface ArrowRightIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const ArrowRightIcon = forwardRef<HTMLDivElement, ArrowRightIconProps>(
  ({ size = 16, className, style, ...props }, ref) => {
    const height = size;
    const width = size * ASPECT;

    const maskStyle: CSSProperties = {
      width,
      height,
      backgroundColor: 'currentcolor',
      maskImage: `url("${MASK_SRC}")`,
      maskSize: '100% 100%',
      maskRepeat: 'no-repeat',
      WebkitMaskImage: `url("${MASK_SRC}")`,
      WebkitMaskSize: '100% 100%',
      WebkitMaskRepeat: 'no-repeat',
      flexShrink: 0,
      ...style,
    };

    return <div ref={ref} aria-hidden="true" className={className} style={maskStyle} {...props} />;
  }
);

ArrowRightIcon.displayName = 'ArrowRightIcon';

export { ArrowRightIcon };
