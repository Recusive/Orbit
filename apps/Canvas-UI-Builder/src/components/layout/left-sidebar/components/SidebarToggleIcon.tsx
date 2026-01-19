/**
 * SidebarToggleIcon - Custom sidebar toggle icon
 * Supports both left and right sidebars with mirrored rendering
 */
import type { SidebarToggleIconProps } from '../types';
import type { FC } from 'react';

export const SidebarToggleIcon: FC<SidebarToggleIconProps> = ({ expanded, direction = 'left' }) => {
  // For right sidebar, we mirror the icon horizontally
  const isRight = direction === 'right';

  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="1 1 22 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={isRight ? { transform: 'scaleX(-1)' } : undefined}
    >
      {/* Outer frame */}
      <path
        d="M19 5V19H21V5H19ZM19 19H5V21H19V19ZM5 19V5H3V19H5ZM5 5H19V3H5V5ZM5 5V5V3C3.89543 3 3 3.89543 3 5H5ZM5 19H3C3 20.1046 3.89543 21 5 21V19ZM19 19V21C20.1046 21 21 20.1046 21 19H19ZM21 5C21 3.89543 20.1046 3 19 3V5H21Z"
        fill="currentColor"
      />
      {/* Middle vertical line - thicker when expanded, with gap from left edge */}
      <rect
        x={expanded ? 7 : 7}
        y="7"
        width={expanded ? 5 : 2}
        height="10"
        rx="1"
        fill="currentColor"
      />
    </svg>
  );
};
