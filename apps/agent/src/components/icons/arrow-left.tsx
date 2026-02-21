/**
 * ArrowLeftIcon — SF Symbol "arrow.left"
 * A left-pointing chevron arrow.
 */
import { forwardRef } from 'react';

import type { SVGProps } from 'react';

interface ArrowLeftIconProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
}

const ArrowLeftIcon = forwardRef<SVGSVGElement, ArrowLeftIconProps>(
  ({ size = 16, color = 'currentColor', className, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
);

ArrowLeftIcon.displayName = 'ArrowLeftIcon';

export { ArrowLeftIcon };
