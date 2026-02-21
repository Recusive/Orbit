/**
 * SquareAndPencil — SF Symbol "square.and.pencil"
 * A rounded square with a diagonal pencil overlapping the top-right corner.
 * Used as the "compose / new" action icon.
 */
import { forwardRef } from 'react';

import type { SVGProps } from 'react';

interface SquareAndPencilProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
}

const SquareAndPencil = forwardRef<SVGSVGElement, SquareAndPencilProps>(
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
      {/* Square with gap at top-right for pencil */}
      <path d="M13.5 3H5.25A2.25 2.25 0 003 5.25v13.5A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V10.5" />
      {/* Pencil */}
      <path d="M15.75 3l5.25 5.25L11.25 18H6v-5.25L15.75 3z" />
    </svg>
  )
);

SquareAndPencil.displayName = 'SquareAndPencil';

export { SquareAndPencil };
