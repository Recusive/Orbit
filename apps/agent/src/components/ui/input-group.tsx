import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import * as React from 'react';

import type { VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils/utils';

// ============================================
// InputGroup
// ============================================

function InputGroup({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        'group/input-group border-input dark:bg-input/30 relative flex w-full items-center rounded-md border shadow-xs transition-[color,box-shadow] outline-none',
        'h-9 min-w-0',
        'has-[>textarea]:h-auto',
        'has-[>[data-align=inline-start]]:[&>input]:pl-2',
        'has-[>[data-align=inline-end]]:[&>input]:pr-2',
        'has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-start]]:[&>input]:pb-3',
        'has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-end]]:[&>input]:pt-3',
        'has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 has-[[data-slot=input-group-control]:focus-visible]:ring-[3px]',
        'has-[[data-slot][aria-invalid=true]]:ring-destructive/20 has-[[data-slot][aria-invalid=true]]:border-destructive dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40',
        className
      )}
      {...props}
    />
  );
}

// ============================================
// InputGroupInput
// ============================================

function InputGroupInput({
  className,
  type = 'text',
  ...props
}: React.ComponentProps<'input'>): React.JSX.Element {
  return (
    <input
      data-slot="input-group-control"
      type={type}
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground',
        'h-9 w-full min-w-0 px-3 py-1 text-base transition-[color,box-shadow] outline-none md:text-sm',
        'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent',
        className
      )}
      {...props}
    />
  );
}

// ============================================
// InputGroupTextarea
// ============================================

function InputGroupTextarea({
  className,
  ...props
}: React.ComponentProps<'textarea'>): React.JSX.Element {
  return (
    <textarea
      data-slot="input-group-control"
      className={cn(
        'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground',
        'min-h-16 w-full min-w-0 resize-none px-3 py-2 text-base transition-[color,box-shadow] outline-none md:text-sm',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent',
        className
      )}
      {...props}
    />
  );
}

// ============================================
// InputGroupAddon
// ============================================

type AddonAlign = 'inline-start' | 'inline-end' | 'block-start' | 'block-end';

interface InputGroupAddonProps extends React.ComponentProps<'div'> {
  align?: AddonAlign;
}

function InputGroupAddon({
  className,
  align = 'inline-start',
  ...props
}: InputGroupAddonProps): React.JSX.Element {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(
        'text-muted-foreground flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium select-none',
        '[&>svg:not([class*="size-"])]:size-4',
        '[&>kbd]:rounded-[calc(var(--radius)-5px)]',
        'group-data-[disabled=true]/input-group:opacity-50',
        align === 'inline-start' &&
          'order-first pl-3 has-[>button]:ml-[-0.45rem] has-[>kbd]:ml-[-0.35rem]',
        align === 'inline-end' &&
          'order-last pr-3 has-[>button]:mr-[-0.45rem] has-[>kbd]:mr-[-0.35rem]',
        align === 'block-start' && 'order-first w-full px-3 pt-2',
        align === 'block-end' && 'order-last w-full px-3 pb-2',
        className
      )}
      {...props}
    />
  );
}

// ============================================
// InputGroupButton
// ============================================

const inputGroupButtonVariants = cva(
  'justify-center whitespace-nowrap font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex items-center rounded-[calc(var(--radius)-5px)]',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs',
        destructive: 'bg-destructive text-white hover:bg-destructive/90 shadow-xs',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground shadow-xs',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-none',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        xs: 'h-6 gap-1 px-2 py-2 text-sm [&>svg:not([class*="size-"])]:size-3.5 has-[>svg]:px-2',
        'icon-xs': 'size-6 [&>svg:not([class*="size-"])]:size-3.5',
        sm: 'h-7 gap-1.5 px-2.5 text-sm',
        'icon-sm': 'size-7',
      },
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'xs',
    },
  }
);

interface InputGroupButtonProps
  extends React.ComponentProps<'button'>, VariantProps<typeof inputGroupButtonVariants> {
  asChild?: boolean;
}

function InputGroupButton({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: InputGroupButtonProps): React.JSX.Element {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(inputGroupButtonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

// ============================================
// InputGroupText
// ============================================

function InputGroupText({ className, ...props }: React.ComponentProps<'span'>): React.JSX.Element {
  return <span className={cn('text-muted-foreground text-sm', className)} {...props} />;
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
};
