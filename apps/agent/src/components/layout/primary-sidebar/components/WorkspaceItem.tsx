/**
 * WorkspaceItem - Collapsible workspace header row
 */
import { ChevronDown } from 'lucide-react';

import type { WorkspaceItemProps } from '../types';
import type { FC } from 'react';

import { cn, SIDEBAR } from '@/lib/utils';

export const WorkspaceItem: FC<WorkspaceItemProps> = ({ name, expanded = true, onToggle }) => {
  return (
    <button
      className="flex items-center h-8 rounded-lg mx-1.5 overflow-hidden text-sidebar-foreground hover:text-foreground hover:bg-gray-2 dark:hover:bg-gray-4 transition-[background-color] duration-100"
      onClick={onToggle}
    >
      {/* Fixed-width icon column */}
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: SIDEBAR.iconColumnWidth - SIDEBAR.itemPadding }}
      >
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 transition-transform duration-150',
            !expanded && '-rotate-90'
          )}
        />
      </div>
      {/* Workspace name */}
      <span className="text-base whitespace-nowrap overflow-hidden pr-2 w-auto">{name}</span>
    </button>
  );
};
