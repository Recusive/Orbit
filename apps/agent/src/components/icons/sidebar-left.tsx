/**
 * SidebarLeft — SF Symbol "sidebar.left"
 * Rounded rectangle with a vertical divider forming a left sidebar panel.
 */
import { forwardRef } from 'react';

import type { SVGProps } from 'react';

interface SidebarLeftProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
}

const SidebarLeft = forwardRef<SVGSVGElement, SidebarLeftProps>(
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
      <rect x="2" y="3" width="20" height="18" rx="2.5" />
      <path d="M9 3v18" />
    </svg>
  )
);

SidebarLeft.displayName = 'SidebarLeft';

export { SidebarLeft };
