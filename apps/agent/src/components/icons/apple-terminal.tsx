/**
 * AppleTerminal — SF Symbol "apple.terminal"
 * A rounded rectangle with a terminal prompt (>_) inside.
 */
import { forwardRef } from 'react';

import type { SVGProps } from 'react';

interface AppleTerminalProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
}

const AppleTerminal = forwardRef<SVGSVGElement, AppleTerminalProps>(
  ({ size = 16, color = 'currentColor', className, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Terminal window */}
      <rect x="2" y="4" width="20" height="16" rx="2.5" />
      {/* Prompt chevron > */}
      <path d="M6.5 9.5l3 2.5-3 2.5" />
      {/* Cursor underscore _ */}
      <path d="M12 15h5.5" />
    </svg>
  )
);

AppleTerminal.displayName = 'AppleTerminal';

export { AppleTerminal };
