import { Folder, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import type { FC, ReactNode } from 'react';

import { cn } from '@/lib/utils/utils';

export interface WorkspaceItemProps {
  id: string;
  name: string;
  children?: ReactNode;
  defaultExpanded?: boolean;
  className?: string;
}

export const WorkspaceItem: FC<WorkspaceItemProps> = ({
  name,
  children,
  defaultExpanded = false,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = (): void => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className={cn('flex flex-col', className)}>
      <button
        onClick={toggleExpanded}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-base w-full group"
        title={name}
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        )}
        <Folder className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <span className="truncate flex-1 text-left">{name}</span>
      </button>
      {isExpanded && children !== undefined ? (
        <div className="ml-5 mt-1 flex flex-col gap-1">{children}</div>
      ) : null}
    </div>
  );
};
