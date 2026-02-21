/**
 * Switch2 — SF Symbol "switch.2"
 * A two-position toggle switch (capsule with sliding circle).
 */
import { forwardRef } from 'react';

import type { SVGProps } from 'react';

interface Switch2Props extends SVGProps<SVGSVGElement> {
  size?: number | string;
}

const Switch2 = forwardRef<SVGSVGElement, Switch2Props>(
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
      {/* Toggle track (capsule) */}
      <rect x="2" y="6" width="20" height="12" rx="6" />
      {/* Toggle knob (circle, right/on position) */}
      <circle cx="16" cy="12" r="4" />
    </svg>
  )
);

Switch2.displayName = 'Switch2';

export { Switch2 };
