import * as React from 'react';

import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[60px] w-full rounded-lg border border-lg-separator bg-background px-3 py-2 text-base transition-[background-color,border-color] duration-200 placeholder:text-lg-text-secondary hover:border-lg-border focus-visible:outline-none focus-visible:border-ring focus-visible:bg-lg-control disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
