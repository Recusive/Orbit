/**
 * WorktreeItem - Git worktree sidebar item
 *
 * NOTE: Sidebar dimensions and transitions come from @/lib/utils/constants.
 * To change icon widths, padding, or animation timing,
 * update SIDEBAR and TRANSITIONS in constants.ts - DO NOT hardcode here.
 */
import { IconBranch } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconBranch';
import { createLogger } from '@orbit/common/lib';
import { ChevronDown, FolderOpen, Loader2, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { GitBranch as GitBranchInfo } from '@/lib/api';
import type { WorktreeUIState } from '@/stores/ui/ui-store';
import type { FC } from 'react';

import { BranchPickerContent, CreateBranchDialog } from '@/components/git/branch-picker';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { gitBranches, gitCheckout, gitCreateBranch, gitStatus } from '@/lib/api';
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
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [branchPopoverOpen, setBranchPopoverOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [suggestedName, setSuggestedName] = useState('');

  // For the active worktree, read branch from GitStore so source-control checkouts
  // are reflected immediately (GitStore is updated by useSourceControl, UIStore.worktrees is not)
  const gitBranchName = useGitStore((s) => s.status?.branch ?? null);

  // Filter to local branches for the popover content
  const localBranches = useMemo(() => branches.filter((b) => !b.isRemote), [branches]);

  // Extract workspace name from path (last segment)
  // Handles edge case: empty path or path with only separators falls back to '/' (root indicator)
  const workspaceName =
    worktree.path.split(PATH_SEPARATOR_RE).filter(Boolean).pop() ?? (worktree.path || '/');

  // Get branch display name — active worktree uses GitStore (always fresh), others use UIStore
  const worktreeBranchName = worktree.branch?.replace(/^refs\/heads\//, '') ?? worktree.shortHead;
  const branchName = active && gitBranchName !== null ? gitBranchName : worktreeBranchName;

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

  // Popover open handler — re-fetches branches and manages open state
  const handleBranchPopoverOpenChange = useCallback(
    (nextOpen: boolean): void => {
      setBranchPopoverOpen(nextOpen);
      if (nextOpen && worktree.path) {
        void gitBranches(worktree.path).then((branchList) => {
          setBranches(branchList);
        });
      }
    },
    [worktree.path]
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

  const handleRequestCreate = useCallback((name: string): void => {
    setSuggestedName(name);
    setCreateDialogOpen(true);
  }, []);

  // Create a new branch from HEAD and check it out
  const handleCreateAndCheckout = useCallback(
    async (rawName: string): Promise<void> => {
      const name = rawName.trim();
      if (!worktree.path || isCheckingOut || name.length === 0) return;
      setIsCheckingOut(true);
      try {
        await gitCreateBranch(worktree.path, name);
        await gitCheckout(worktree.path, name);
        const [newStatus, newBranches] = await Promise.all([
          gitStatus(worktree.path),
          gitBranches(worktree.path),
        ]);
        const gitStore = useGitStore.getState();
        gitStore.setStatus(newStatus);
        gitStore.setBranches(newBranches);
        setBranches(newBranches);
        const uiStore = useUIStore.getState();
        const updated = uiStore.worktrees.map((w) =>
          w.worktree.path === worktree.path
            ? {
                ...w,
                worktree: {
                  ...w.worktree,
                  branch: `refs/heads/${name}`,
                  shortHead: name,
                },
              }
            : w
        );
        uiStore.setWorktrees(updated);
        toast.success(`Created and switched to ${name}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const displayMessage = message.replace(/^Git error:\s*/i, '');
        logger.warn('Create branch failed from worktree badge', {
          worktree: worktree.path,
          branch: name,
          error: message,
        });
        toast.error('Create branch failed', { description: displayMessage });
        throw new Error(displayMessage, { cause: err });
      } finally {
        setIsCheckingOut(false);
      }
    },
    [worktree.path, isCheckingOut]
  );

  const rowContent = (
    <div
      role="group"
      tabIndex={0}
      className={cn(
        'group flex items-center gap-1.5 h-8 w-full rounded-[9px] overflow-hidden hover:bg-lg-sidebar-hover cursor-default',
        active ? 'text-foreground' : 'text-sidebar-foreground hover:text-foreground'
      )}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleRowClick();
        }
      }}
    >
      {/* Toggle button — shows project icon by default, chevron on row hover */}
      <button
        type="button"
        aria-label={isExpanded ? 'Collapse worktree' : 'Expand worktree'}
        className="relative flex items-center justify-center shrink-0 h-5 w-5 group-hover:hover:bg-lg-control-hover rounded-full ml-0.5"
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
        {/* Project icon — visible by default, hidden on row hover */}
        <FolderOpen className="h-4 w-4 shrink-0 opacity-60 group-hover:hidden" />
        {/* Chevron — hidden by default, visible on row hover */}
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 transition-transform duration-150 hidden group-hover:block',
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

      {/* Branch badge — popover with search, branch list, and create branch */}
      <div
        className="mr-1 shrink-0"
        onClick={(e) => {
          e.stopPropagation();
        }}
        onMouseEnter={handleBadgeHover}
      >
        <Popover open={branchPopoverOpen} onOpenChange={handleBranchPopoverOpenChange}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={isCheckingOut}
              className={cn(
                'flex items-center gap-0.5 h-auto w-auto px-1.5 py-0.5 rounded-[7px] text-[11px] border-0',
                'font-[510] cursor-pointer',
                'hover:bg-black/8 dark:hover:bg-white/15',
                'active:scale-[0.97] disabled:opacity-50',
                '[&>svg:last-child]:h-2.5 [&>svg:last-child]:w-2.5 [&>svg:last-child]:opacity-60',
                worktree.isMain
                  ? 'bg-black/5 text-tag-text dark:bg-white/10'
                  : 'bg-black/4 text-tag-text/90 dark:bg-white/8'
              )}
              style={{ mixBlendMode: 'plus-darker' }}
              aria-label={`Switch branch (${branchName})`}
            >
              {isCheckingOut ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <IconBranch className="h-3 w-3" />
              )}
              <span style={{ pointerEvents: 'none' }}>{branchName}</span>
              <ChevronDown className="h-2.5 w-2.5 opacity-60" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[260px] p-0"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
            }}
          >
            <BranchPickerContent
              currentBranch={branchName}
              branches={localBranches}
              onCheckout={(branch) => {
                void handleBranchCheckout(branch);
              }}
              onRequestCreate={handleRequestCreate}
              onClose={() => {
                setBranchPopoverOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );

  return (
    <>
      <div className="relative mx-1.5">
        {/* Non-main worktrees get a right-click context menu for remove action */}
        {!worktree.isMain ? (
          <ContextMenu>
            <ContextMenuTrigger asChild>{rowContent}</ContextMenuTrigger>
            <ContextMenuContent className="w-44 rounded-xl p-1.5">
              <ContextMenuItem
                className="rounded-lg text-destructive focus:text-destructive focus:bg-destructive/10"
                onSelect={handleRemove}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                <span className="text-[13px]">Remove worktree</span>
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ) : (
          rowContent
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

      <CreateBranchDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreateAndCheckout}
        suggestedName={suggestedName}
      />
    </>
  );
};
