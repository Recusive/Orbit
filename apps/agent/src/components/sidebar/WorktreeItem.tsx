/**
 * WorktreeItem - Git worktree sidebar item
 *
 * NOTE: Sidebar dimensions and transitions come from @/lib/utils/constants.
 * To change icon widths, padding, or animation timing,
 * update SIDEBAR and TRANSITIONS in constants.ts - DO NOT hardcode here.
 */
import { createLogger } from '@orbit/common/lib';
import { ChevronDown, GitBranch, Loader2, MoreHorizontal, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type { GitBranch as GitBranchInfo } from '@/lib/api';
import type { WorktreeUIState } from '@/stores/ui/ui-store';
import type { FC } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { gitBranches, gitCheckout, gitStatus } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useGitStore } from '@/stores/git/git-store';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('WorktreeItem');

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
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

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

  // Pre-fetch branches on badge hover so they're ready before the select opens
  const handleBadgeHover = useCallback((): void => {
    if (worktree.path && branches.length === 0) {
      void gitBranches(worktree.path).then((branchList) => {
        setBranches(branchList);
      });
    }
  }, [worktree.path, branches.length]);

  // Fetch branches when the select opens (skip if already loaded from hover prefetch)
  const handleBranchDropdownOpen = useCallback(
    (open: boolean): void => {
      if (open && worktree.path && branches.length === 0) {
        void gitBranches(worktree.path).then((branchList) => {
          setBranches(branchList);
        });
      }
    },
    [worktree.path, branches.length]
  );

  // Checkout a branch within this worktree
  const handleBranchCheckout = useCallback(
    async (targetBranch: string): Promise<void> => {
      if (!worktree.path || isCheckingOut || targetBranch === branchName) return;
      setIsCheckingOut(true);
      try {
        await gitCheckout(worktree.path, targetBranch);
        // Refresh status and branches after checkout
        const [newStatus, newBranches] = await Promise.all([
          gitStatus(worktree.path),
          gitBranches(worktree.path),
        ]);
        const gitStore = useGitStore.getState();
        gitStore.setStatus(newStatus);
        gitStore.setBranches(newBranches);
        setBranches(newBranches);
        // Update the worktree's branch in UIStore so the badge text refreshes
        const uiStore = useUIStore.getState();
        const updated = uiStore.worktrees.map((w) =>
          w.worktree.path === worktree.path
            ? {
                ...w,
                worktree: {
                  ...w.worktree,
                  branch: `refs/heads/${targetBranch}`,
                  shortHead: targetBranch,
                },
              }
            : w
        );
        uiStore.setWorktrees(updated);
        toast.success(`Switched to ${targetBranch}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const displayMessage = message.replace(/^Git error:\s*/i, '');
        logger.warn('Checkout failed from worktree badge', {
          worktree: worktree.path,
          branch: targetBranch,
          error: message,
        });
        toast.error('Checkout failed', { description: displayMessage });
      } finally {
        setIsCheckingOut(false);
      }
    },
    [worktree.path, isCheckingOut, branchName]
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
          className="flex items-center justify-center shrink-0 h-5 w-5 hover:bg-lg-control-hover rounded-md ml-0.5"
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

        {/* Branch badge — Apple liquid glass pill with Select dropdown */}
        <div
          className="mr-1 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
          }}
          onMouseEnter={handleBadgeHover}
        >
          <Select
            value={branchName}
            onValueChange={(value) => {
              void handleBranchCheckout(value);
            }}
            onOpenChange={handleBranchDropdownOpen}
            disabled={isCheckingOut}
          >
            <SelectTrigger
              className={cn(
                'flex items-center gap-0.5 h-auto w-auto px-1.5 py-0.5 rounded-full text-[11px] border-0',
                'backdrop-blur-[20px] font-[510] cursor-pointer',
                'hover:bg-black/8 dark:hover:bg-white/15',
                'active:scale-[0.97] disabled:opacity-50',
                'focus-visible:ring-0',
                '[&>svg:last-child]:h-2.5 [&>svg:last-child]:w-2.5 [&>svg:last-child]:opacity-60',
                worktree.isMain
                  ? 'bg-black/5 text-[#4C4C4C] dark:bg-white/10 dark:text-[#B0B0B0]'
                  : 'bg-black/4 text-[#4C4C4C] dark:bg-white/8 dark:text-[#999]'
              )}
              style={{ mixBlendMode: 'plus-darker' }}
              aria-label={`Switch branch (${branchName})`}
            >
              {isCheckingOut ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <GitBranch className="h-3 w-3" />
              )}
              <SelectValue>{branchName}</SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-[#f3f3f3]! dark:bg-[oklch(23%_0_0)]! border! border-white! dark:border-white/5! shadow-[0_0_0_1px_rgba(255,255,255,0.9),0_4px_12px_-2px_rgba(0,0,0,0.1),0_8px_24px_-4px_rgba(0,0,0,0.08)] dark:shadow-md [&::before]:hidden [&::after]:hidden">
              {branches.map((b) => (
                <SelectItem key={b.name} value={b.name}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
