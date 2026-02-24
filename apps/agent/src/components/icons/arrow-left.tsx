/**
 * ArrowLeftIcon — SF Symbol "arrow.left"
 * A left-pointing chevron arrow.
 *
 * Uses the actual SF Symbol rasterised as a PNG mask so the result is
 * pixel-identical to the native macOS icon.
 */
import { forwardRef } from 'react';

import type { CSSProperties, HTMLAttributes } from 'react';

const MASK_SRC =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACIAAAAYCAYAAACfpi8JAAAAAXNSR0IArs4c6QAAAGxlWElmTU0AKgAAAAgABAEaAAUAAAABAAAAPgEbAAUAAAABAAAARgEoAAMAAAABAAIAAIdpAAQAAAABAAAATgAAAAAAAACQAAAAAQAAAJAAAAABAAKgAgAEAAAAAQAAACKgAwAEAAAAAQAAABgAAAAAg8HodQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAVJJREFUSA3tlr9LQlEUx1+ZhYUiKGlRCRG09P80tbf2B7gFTa6uDg4tguBgGOFgVGAtTYIERYON7QXV5wzK4Q6+eM97XDzwwXMe957vl/sLg2AR8VfglBYjuIVc/HbROpwz7VdxEq1N9FnLTK0qA2LmA7bBLJIoXYJeiVfqAzMHCK3DFWgTA+odMIssSnegTfSp82YOECrCM2gTDeoUmMU+Si+gTVxQL/l04DY/QuwatpToPXkLMrAB7hw+/Tu+GClnrhs2Qw6iXgkf+Tcae64ReR90rOjCUy6arm7gCh8zqAP6ZjxQ34BsjVznuFvTpscbhMYhI95hvC0/5OXQWZ4G7NLXPS91vq160pvaVrbnEcYrI789kIfOPNIoylXTZuShK5g7QXANmqDNDKlLYB4JFGugzciBnsvKyLWtOGbM/xihP4kzsk94gs3J10Uy4xX4A5lUZ+NTsqdzAAAAAElFTkSuQmCC';

/** Source PNG aspect ratio: 34 wide × 24 tall */
const ASPECT = 34 / 24;

interface ArrowLeftIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const ArrowLeftIcon = forwardRef<HTMLDivElement, ArrowLeftIconProps>(
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

ArrowLeftIcon.displayName = 'ArrowLeftIcon';

export { ArrowLeftIcon };
