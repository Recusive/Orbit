/**
 * WorktreeItem - Git worktree sidebar item
 *
 * NOTE: Sidebar dimensions and transitions come from @/lib/utils/constants.
 * To change icon widths, padding, or animation timing,
 * update SIDEBAR and TRANSITIONS in constants.ts - DO NOT hardcode here.
 */
import { ChevronDown, GitBranch, MoreHorizontal, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';

import type { WorktreeUIState } from '@/stores/ui/ui-store';
import type { FC } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SIDEBAR, TRANSITIONS } from '@/lib/utils/constants';
import { cn } from '@/lib/utils/utils';

// Hoisted RegExp for path splitting (avoids recreation on each render)
const PATH_SEPARATOR_RE = /[/\\]/;

// Transition string builder (matches primary-sidebar pattern)
const getCollapseTransition = (collapsed: boolean): string =>
  collapsed
    ? `opacity 0ms, width ${TRANSITIONS.sidebar}`
    : `width ${TRANSITIONS.sidebar}, opacity ${TRANSITIONS.opacity} ${String(TRANSITIONS.opacityDelay)}ms`;

interface WorktreeItemProps {
  readonly worktreeState: WorktreeUIState;
  readonly active?: boolean;
  readonly collapsed?: boolean;
  readonly onToggle?: () => void;
  readonly onRemove?: () => void;
}

export const WorktreeItem: FC<WorktreeItemProps> = ({
  worktreeState,
  active = false,
  collapsed = false,
  onToggle,
  onRemove,
}) => {
  const { worktree, isExpanded } = worktreeState;
  const [isHovered, setIsHovered] = useState(false);

  // Extract workspace name from path (last segment)
  const workspaceName =
    worktree.path.split(PATH_SEPARATOR_RE).filter(Boolean).pop() ?? worktree.path;

  // Get branch display name (without refs/heads/)
  const branchName = worktree.branch?.replace(/^refs\/heads\//, '') ?? worktree.shortHead;

  const handleToggle = useCallback((): void => {
    onToggle?.();
  }, [onToggle]);

  const handleRemove = useCallback(
    (e: Event): void => {
      e.stopPropagation();
      onRemove?.();
    },
    [onRemove]
  );

  return (
    <div
      className="relative group mx-1.5"
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
    >
      <button
        className={cn(
          'flex items-center h-8 w-full rounded-lg overflow-hidden transition-all duration-200 hover:bg-muted/40',
          active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          isExpanded && 'bg-muted/40'
        )}
        onClick={handleToggle}
      >
        {/* Chevron toggle */}
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: SIDEBAR.iconColumnWidth - SIDEBAR.itemPadding }}
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 transition-transform duration-200',
              !isExpanded && '-rotate-90'
            )}
          />
        </div>

        {/* Workspace name */}
        <span
          className={cn(
            'text-base whitespace-nowrap overflow-hidden text-left flex-1',
            collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
          )}
          style={{
            transition: getCollapseTransition(collapsed),
            maskImage: 'linear-gradient(to right, black 80%, transparent 95%)',
            WebkitMaskImage: 'linear-gradient(to right, black 80%, transparent 95%)',
          }}
        >
          {workspaceName}
        </span>

        {/* Branch badge */}
        {!collapsed && (
          <div
            className={cn(
              'flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium mr-7 shrink-0 transition-all duration-200',
              worktree.isMain ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground'
            )}
          >
            <GitBranch className="h-3 w-3" />
            <span className="max-w-[60px] truncate">{branchName}</span>
          </div>
        )}
      </button>

      {/* More options dropdown - appears on hover */}
      {!collapsed && !worktree.isMain && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-md transition-all duration-150 hover:bg-muted/60 active:scale-90',
                isHovered ? 'opacity-100' : 'opacity-0'
              )}
              onClick={(e) => {
                e.stopPropagation();
              }}
              title="More options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={handleRemove}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove worktree
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Locked indicator */}
      {worktree.locked !== null && !collapsed && (
        <div
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-amber-500 font-medium uppercase tracking-wide"
          title={`Locked: ${worktree.locked}`}
        >
          Locked
        </div>
      )}
    </div>
  );
};
