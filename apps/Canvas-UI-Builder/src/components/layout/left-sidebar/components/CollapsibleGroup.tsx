/**
 * CollapsibleGroup - Expandable section with chevron trigger
 *
 * Creates a collapsible group with animated chevron rotation and
 * tree-structured children with connecting lines.
 */
import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import type { FC, ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface CollapsibleGroupProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
}

export const CollapsibleGroup: FC<CollapsibleGroupProps> = ({
  label,
  children,
  defaultOpen = true,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible.Root open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex flex-col px-2">
        {/* Trigger button */}
        <Collapsible.Trigger
          className={cn(
            'flex w-full items-center py-1.5',
            'text-base font-medium text-foreground hover:text-foreground',
            'transition-colors duration-150'
          )}
        >
          {/* Chevron centered in 16px column */}
          <div className="w-4 flex justify-center shrink-0">
            <ChevronRight
              style={{
                transform: isOpen ? 'rotate(90deg) translateX(2px)' : 'rotate(0deg)',
                transition: 'transform 200ms ease-out',
              }}
              className="h-3.5 w-3.5 text-muted-foreground/70"
            />
          </div>
          <span className="ml-1">{label}</span>
        </Collapsible.Trigger>

        {/* Content with tree structure */}
        <Collapsible.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          {/* Tree line at left edge + 8px (center of 16px icon column) */}
          <ul className="relative ml-2 pl-3 flex flex-col gap-0.5 pb-1 border-l border-border/40">
            {children}
          </ul>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  );
};
