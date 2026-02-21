import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import * as React from 'react';

import type { VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-[rgba(0,122,255,0.85)] text-white shadow-sm hover:bg-[rgba(0,122,255,0.95)] active:scale-[0.97]',
        destructive:
          'bg-lg-destructive-bg text-lg-destructive hover:brightness-90 focus-visible:ring-lg-destructive/20 active:scale-[0.98]',
        outline:
          'bg-[var(--lg-alert-secondary-bg)] text-[var(--lg-alert-secondary-text)] hover:bg-[var(--lg-alert-secondary-bg-hover)] active:scale-[0.97]',
        secondary:
          'bg-[var(--lg-alert-secondary-bg)] text-[var(--lg-alert-secondary-text)] hover:bg-[var(--lg-alert-secondary-bg-hover)] active:scale-[0.97]',
        ghost: 'hover:bg-lg-control-hover hover:text-foreground active:bg-lg-control',
        link: 'text-foreground underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
