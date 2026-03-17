import * as React from 'react';

import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[60px] w-full rounded-xl border-0 bg-control-fill px-3 py-2 text-base transition-[background-color] duration-200 placeholder:text-lg-text-secondary hover:bg-control-fill-hover focus-visible:outline-none focus-visible:bg-control-fill-hover disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
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
