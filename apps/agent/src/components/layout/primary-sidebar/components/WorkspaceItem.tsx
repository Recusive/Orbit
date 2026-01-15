/**
 * WorkspaceItem - Collapsible workspace header row
 */
import { ChevronDown } from 'lucide-react';

import type { WorkspaceItemProps } from '../types';
import type { FC } from 'react';

import { SIDEBAR, TRANSITIONS } from '@/lib/utils/constants';
import { cn } from '@/lib/utils/utils';

// Transition string builder
const getCollapseTransition = (collapsed: boolean): string =>
  collapsed
    ? `opacity 0ms, width ${TRANSITIONS.sidebar}`
    : `width ${TRANSITIONS.sidebar}, opacity ${TRANSITIONS.opacity} ${String(TRANSITIONS.opacityDelay)}ms`;

export const WorkspaceItem: FC<WorkspaceItemProps> = ({
  name,
  collapsed = false,
  expanded = true,
  onToggle,
}) => {
  return (
    <button
      className="flex items-center h-8 rounded-lg mx-1.5 overflow-hidden text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-[background-color,color] duration-200"
      onClick={onToggle}
    >
      {/* Fixed-width icon column */}
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: SIDEBAR.iconColumnWidth - SIDEBAR.itemPadding }}
      >
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 transition-transform duration-200',
            !expanded && '-rotate-90'
          )}
        />
      </div>
      {/* Text that slides in */}
      <span
        className={cn(
          'text-base whitespace-nowrap overflow-hidden pr-2',
          collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
        )}
        style={{ transition: getCollapseTransition(collapsed) }}
      >
        {name}
      </span>
    </button>
  );
};
