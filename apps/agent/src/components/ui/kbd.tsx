import * as React from 'react';

import { cn } from '@/lib/utils/utils';

type KbdProps = React.HTMLAttributes<HTMLElement>;

const Kbd = React.forwardRef<HTMLElement, KbdProps>(({ className, ...props }, ref) => {
  return (
    <kbd
      ref={ref}
      className={cn(
        'pointer-events-none inline-flex h-4 select-none items-center gap-1 rounded border border-border/50 bg-muted px-1 font-mono text-xs font-medium text-muted-foreground',
        className
      )}
      {...props}
    />
  );
});
Kbd.displayName = 'Kbd';

type KbdGroupProps = React.HTMLAttributes<HTMLDivElement>;

const KbdGroup = React.forwardRef<HTMLDivElement, KbdGroupProps>(({ className, ...props }, ref) => {
  return <div ref={ref} className={cn('inline-flex items-center gap-0.5', className)} {...props} />;
});
KbdGroup.displayName = 'KbdGroup';

export { Kbd, KbdGroup };
export type { KbdProps, KbdGroupProps };
