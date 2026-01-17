import * as React from 'react';

import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[60px] w-full rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-base transition-colors duration-200 placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
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
