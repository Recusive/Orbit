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
import { cn, SIDEBAR } from '@/lib/utils';

// Hoisted RegExp for path splitting (avoids recreation on each render)
const PATH_SEPARATOR_RE = /[/\\]/;

interface WorktreeItemProps {
  readonly worktreeState: WorktreeUIState;
  readonly active?: boolean;
  /** Called when clicking the chevron to expand/collapse conversations */
  readonly onToggle?: () => void;
  /** Called when clicking the worktree row to switch to this workspace */
  readonly onSelect?: () => void;
  readonly onRemove?: () => void;
}

export const WorktreeItem: FC<WorktreeItemProps> = ({
  worktreeState,
  active = false,
  onToggle,
  onSelect,
  onRemove,
}) => {
  const { worktree, isExpanded } = worktreeState;
  const [isHovered, setIsHovered] = useState(false);

  // Extract workspace name from path (last segment)
  // Handles edge case: empty path or path with only separators falls back to '/' (root indicator)
  const workspaceName =
    worktree.path.split(PATH_SEPARATOR_RE).filter(Boolean).pop() ?? (worktree.path || '/');

  // Get branch display name (without refs/heads/)
  const branchName = worktree.branch?.replace(/^refs\/heads\//, '') ?? worktree.shortHead;

  // Handle chevron click - toggles expand/collapse
  const handleChevronClick = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      onToggle?.();
    },
    [onToggle]
  );

  // Handle row click - selects this worktree as active workspace
  const handleRowClick = useCallback((): void => {
    onSelect?.();
  }, [onSelect]);

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
      <div
        role="group"
        tabIndex={0}
        className={cn(
          'flex items-center h-8 w-full rounded-lg overflow-hidden transition-[background-color,color] duration-100 hover:bg-lg-sidebar-hover cursor-default',
          active ? 'text-foreground' : 'text-sidebar-foreground hover:text-foreground',
          isExpanded && !active && 'bg-lg-sidebar-selected'
        )}
        onClick={handleRowClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleRowClick();
          }
        }}
      >
        {/* Chevron toggle - clickable separately to expand/collapse */}
        <button
          type="button"
          aria-label={isExpanded ? 'Collapse worktree' : 'Expand worktree'}
          className="flex items-center justify-center shrink-0 hover:bg-lg-control-hover rounded-md"
          style={{ width: SIDEBAR.iconColumnWidth - SIDEBAR.itemPadding }}
          onClick={handleChevronClick}
          onKeyDown={(e) => {
            // Stop Enter/Space from bubbling to parent role="button" div,
            // which would fire handleRowClick (select) in addition to
            // the chevron's onClick (toggle). (Code review: Opus cycle 3, issue #8)
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
            }
          }}
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 transition-transform duration-150',
              !isExpanded && '-rotate-90'
            )}
          />
        </button>

        {/* Workspace name */}
        <span
          className="text-base whitespace-nowrap overflow-hidden text-left flex-1 w-auto"
          style={{
            maskImage: 'linear-gradient(to right, black 80%, transparent 95%)',
            WebkitMaskImage: 'linear-gradient(to right, black 80%, transparent 95%)',
          }}
        >
          {workspaceName}
        </span>

        {/* Branch badge */}
        <div
          className={cn(
            'flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium mr-1 shrink-0 transition-colors duration-200',
            worktree.isMain ? 'bg-primary/12 text-primary' : 'bg-lg-control text-lg-text-secondary'
          )}
        >
          <GitBranch className="h-3 w-3" />
          <span className="max-w-[60px] truncate">{branchName}</span>
        </div>
      </div>

      {/* More options dropdown - appears on hover */}
      {!worktree.isMain && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-md transition-[background-color,opacity,transform] duration-150 hover:bg-lg-control-hover active:scale-90',
                isHovered ? 'opacity-100' : 'opacity-0'
              )}
              onClick={(e) => {
                e.stopPropagation();
              }}
              aria-label="More options"
              title="More options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
              onSelect={handleRemove}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove worktree
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Locked indicator */}
      {worktree.locked !== null && (
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
