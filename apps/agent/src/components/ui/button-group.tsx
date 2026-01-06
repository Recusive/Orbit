import { Slot } from '@radix-ui/react-slot';

import type { FC, ReactNode } from 'react';

import { cn } from '@/lib/utils/utils';

interface ButtonGroupProps {
  readonly className?: string;
  readonly children: ReactNode;
  readonly orientation?: 'horizontal' | 'vertical';
}

export const ButtonGroup: FC<ButtonGroupProps> = ({
  className,
  children,
  orientation = 'horizontal',
}) => {
  return (
    <div
      role="group"
      data-slot="button-group"
      className={cn(
        'flex w-fit items-stretch',
        // Focus handling
        '[&>*]:focus-visible:z-10 [&>*]:focus-visible:relative',
        // Select trigger width handling
        "[&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit",
        // Input flex
        '[&>input]:flex-1',
        // Nested button groups get gap
        'has-[>[data-slot=button-group]]:gap-2',
        // Border radius handling for horizontal
        orientation === 'horizontal' && [
          '[&>*:not(:first-child)]:rounded-l-none',
          '[&>*:not(:first-child)]:border-l-0',
          '[&>*:not(:last-child)]:rounded-r-none',
        ],
        // Border radius handling for vertical
        orientation === 'vertical' && [
          'flex-col',
          '[&>*:not(:first-child)]:rounded-t-none',
          '[&>*:not(:first-child)]:border-t-0',
          '[&>*:not(:last-child)]:rounded-b-none',
        ],
        className
      )}
    >
      {children}
    </div>
  );
};

interface ButtonGroupTextProps {
  readonly className?: string;
  readonly children: ReactNode;
  readonly asChild?: boolean;
}

export const ButtonGroupText: FC<ButtonGroupTextProps> = ({
  className,
  children,
  asChild = false,
}) => {
  const Comp = asChild ? Slot : 'span';
  return (
    <Comp className={cn('flex items-center px-3 text-sm text-muted-foreground', className)}>
      {children}
    </Comp>
  );
};

interface ButtonGroupSeparatorProps {
  readonly className?: string;
  readonly orientation?: 'horizontal' | 'vertical';
}

export const ButtonGroupSeparator: FC<ButtonGroupSeparatorProps> = ({
  className,
  orientation = 'vertical',
}) => {
  return (
    <div
      role="separator"
      className={cn(
        'bg-border shrink-0',
        orientation === 'vertical' ? 'w-px self-stretch' : 'h-px self-stretch',
        className
      )}
    />
  );
};
