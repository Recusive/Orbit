/**
 * SidebarLeft — SF Symbol "sidebar.left"
 * Rounded rectangle with a vertical divider forming a left sidebar panel.
 *
 * Uses the actual SF Symbol rasterised as a PNG mask so the result is
 * pixel-identical to the native macOS icon.
 */
import { forwardRef } from 'react';

import type { CSSProperties, HTMLAttributes } from 'react';

const MASK_SRC =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAqCAYAAADxughHAAAAAXNSR0IArs4c6QAAAGxlWElmTU0AKgAAAAgABAEaAAUAAAABAAAAPgEbAAUAAAABAAAARgEoAAMAAAABAAIAAIdpAAQAAAABAAAATgAAAAAAAACQAAAAAQAAAJAAAAABAAKgAgAEAAAAAQAAADKgAwAEAAAAAQAAACoAAAAAT3Ga7gAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAqlJREFUaAXtWEtrFEEQ3jwwYDABHyGXHIJghASEePfiIeLBQwK5BoQc9OJJSdZcYwQPxr+wgke9e4roSRDyPGmCpxDiAxWTkETU71un2Nre3pnegZnpdafgo6urq7qruqdmeqpQyCnfgXwHwnagLWwQYxwfA64BQ8AZoANIg35hkc/AGvAceAvEohFYLQN/PMEL+NELNESXoP0D8CUI8eMdfOqyRWJ7tPjorAMXDYNj9HeAI0PObjswqOTb4A9UPw7bA6NzFsMFyIoWeY1oEhLZAbY8mWngJFCPOKZtrtRTbFDOzSkZc39Dv9tlnmeG4VUHo6QCkaWfGj7xBRRJH6Ahu/sqUvufQtKBnFc+0bf7pl98tk3qU4I3is+S3cTizE+hmtzplBHVnlL8l4BnwPMAvyVCh2AeAisiSLj9ivn7gzW0j2WRLRDtz++gM4x2Rg8EPN9MNy3yJETii3XuqEDEaAPMI0C/knkiT0Qh69Y1EO7GvaydDVvfluxh+t6OuZ4IA2ZiX1CR8Av/AOB9LHNyDYTJftfi7U/I0kp2y/IVkWsgvHvxRPTrlyeyWJkqW841EH5NZ7N1NXz1lkx2Xp/NZKes6ZLd9h3ZQyBNl+zmXYvJ/hjwghpJ9jkvPK7jxH+T7HkgdU44M3HLnIitXJTZroctbDuRfWXA2pIvpH3RPpb9swUi/+lUGPUkirPwY0D5wv/3KrIFoq8c16Gtb7xVxil27mAt/Zivuqx9G0pS12LLOtflCMOk6lr8YDMIVubFJ9YKeEJVpKOUAZYjPwKmMsv7WwCvJiaxXjyuhEvgP6l+HJYlH26gWcMqQTblOuENKLLgILvgS7sDn/pcgxC9CTDfAV+CeA9fYufraRgXgdfALqCf1aQD5Fo8gZfALeAEkFO+A2nvwF/Orh+q9X10xQAAAABJRU5ErkJggg==';

/** Source PNG aspect ratio: 50 wide × 42 tall */
const ASPECT = 50 / 42;

interface SidebarLeftProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const SidebarLeft = forwardRef<HTMLDivElement, SidebarLeftProps>(
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

SidebarLeft.displayName = 'SidebarLeft';

export { SidebarLeft };
