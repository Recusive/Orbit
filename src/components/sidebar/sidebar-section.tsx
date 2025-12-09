import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import type { FC, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface SidebarSectionProps {
  title?: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  className?: string;
}

export const SidebarSection: FC<SidebarSectionProps> = ({
  title,
  children,
  collapsible = false,
  defaultCollapsed = false,
  className,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const toggleCollapse = (): void => {
    if (collapsible) {
      setIsCollapsed(!isCollapsed);
    }
  };

  return (
    <div className={cn('flex flex-col', className)}>
      {title ? <button
          onClick={toggleCollapse}
          className={cn(
            'flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider',
            collapsible && 'hover:bg-accent/50 transition-colors cursor-pointer',
            !collapsible && 'cursor-default'
          )}
          disabled={!collapsible}
        >
          {collapsible ? <>
              {isCollapsed ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </> : null}
          <span>{title}</span>
        </button> : null}
      {!isCollapsed && <div className="flex flex-col">{children}</div>}
    </div>
  );
};
