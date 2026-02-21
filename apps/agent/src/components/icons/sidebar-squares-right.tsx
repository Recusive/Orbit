/**
 * SidebarSquaresRight — SF Symbol "sidebar.squares.right"
 * A rounded rectangle with a right sidebar containing two square tiles.
 */
import { forwardRef } from 'react';

import type { SVGProps } from 'react';

interface SidebarSquaresRightProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
}

const SidebarSquaresRight = forwardRef<SVGSVGElement, SidebarSquaresRightProps>(
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
      {/* Outer frame */}
      <rect x="2" y="3" width="20" height="18" rx="2.5" />
      {/* Right sidebar divider */}
      <path d="M15 3v18" />
      {/* Top square tile */}
      <rect x="16.5" y="5" width="4" height="4" rx="0.75" />
      {/* Bottom square tile */}
      <rect x="16.5" y="11" width="4" height="4" rx="0.75" />
    </svg>
  )
);

SidebarSquaresRight.displayName = 'SidebarSquaresRight';

export { SidebarSquaresRight };
