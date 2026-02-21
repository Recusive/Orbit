/**
 * ExclamationmarkBubble — SF Symbol "exclamationmark.bubble"
 * A speech bubble with an exclamation mark inside.
 */
import { forwardRef } from 'react';

import type { SVGProps } from 'react';

interface ExclamationmarkBubbleProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
}

const ExclamationmarkBubble = forwardRef<SVGSVGElement, ExclamationmarkBubbleProps>(
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
      {/* Speech bubble */}
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
      {/* Exclamation mark — stem */}
      <path d="M12 8v3.5" />
      {/* Exclamation mark — dot */}
      <circle cx="12" cy="14.5" r="0.5" fill={color} stroke="none" />
    </svg>
  )
);

ExclamationmarkBubble.displayName = 'ExclamationmarkBubble';

export { ExclamationmarkBubble };
