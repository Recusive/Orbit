import { Loader2 } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

interface SpinnerProps extends React.ComponentProps<'svg'> {
  /** Size variant for common use cases */
  size?: 'sm' | 'default' | 'lg';
}

/**
 * A loading spinner indicator.
 *
 * Uses Loader2 from lucide-react with configurable size.
 * Respects prefers-reduced-motion via Tailwind's motion-reduce utilities.
 */
const Spinner = React.forwardRef<SVGSVGElement, SpinnerProps>(
  ({ className, size = 'default', ...props }, ref) => {
    const sizeClasses = {
      sm: 'size-3',
      default: 'size-4',
      lg: 'size-6',
    };

    return (
      <Loader2
        ref={ref}
        role="status"
        aria-label="Loading"
        className={cn(sizeClasses[size], 'animate-spin motion-reduce:animate-none', className)}
        {...props}
      />
    );
  }
);
Spinner.displayName = 'Spinner';

export { Spinner };
export type { SpinnerProps };
