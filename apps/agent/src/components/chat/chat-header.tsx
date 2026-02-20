/**
 * ChatHeader - Breadcrumb header showing workspace and conversation title
 *
 * Also shows branch selector and diff stats on the right side.
 * These are hidden when the activity panel is open on the Source Control tab
 * (since that panel already shows them).
 *
 * NOTE: Header height comes from @/lib/utils/constants.
 * To change header dimensions, update HEIGHTS in constants.ts.
 */
import { createLogger } from '@orbit/common/lib';
import { Check, ChevronDown, GitBranch, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { FC } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { gitBranches, gitCheckout, gitStatus } from '@/lib/api';
import { cn, HEIGHTS } from '@/lib/utils';
import { useGitStore, useBranchDiffStats, useGitBranch } from '@/stores/git/git-store';
import {
  useWorkspaceName,
  useActiveConversationTitle,
  useVaultOpen,
  useUIStore,
  useReviewPanelOpen,
  useActivityTab,
} from '@/stores/ui/ui-store';

const logger = createLogger('ChatHeader');

/**
 * Lightweight branch selector for the chat header.
 * Reads from GitStore directly, fetches branches on dropdown open.
 */
const HeaderBranchSelector: FC = () => {
  const branch = useGitBranch();
  const branches = useGitStore((s) => s.branches);
  const repoPath = useGitStore((s) => s.repoPath);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Fetch branches when component mounts if we have a repo but no branches yet
  useEffect(() => {
    if (repoPath && branches.length === 0) {
      void gitBranches(repoPath).then((branchList) => {
        useGitStore.getState().setBranches(branchList);
      });
    }
  }, [repoPath, branches.length]);

  const handleCheckout = useCallback(
    async (branchName: string): Promise<void> => {
      const repo = useGitStore.getState().repoPath;
      if (!repo || isCheckingOut) return;
      setIsCheckingOut(true);
      try {
        await gitCheckout(repo, branchName);
        // Refresh status and branches after checkout
        const [newStatus, newBranches] = await Promise.all([gitStatus(repo), gitBranches(repo)]);
        const store = useGitStore.getState();
        store.setStatus(newStatus);
        store.setBranches(newBranches);
        toast.success(`Switched to ${branchName}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const displayMessage = message.replace(/^Git error:\s*/i, '');
        logger.warn('Checkout failed from header', { branch: branchName, error: message });
        toast.error('Checkout failed', { description: displayMessage });
      } finally {
        setIsCheckingOut(false);
      }
    },
    [isCheckingOut]
  );

  // Refresh branches when dropdown opens (they may be stale)
  const handleOpenChange = useCallback(
    (open: boolean): void => {
      if (open && repoPath) {
        void gitBranches(repoPath).then((branchList) => {
          useGitStore.getState().setBranches(branchList);
        });
      }
    },
    [repoPath]
  );

  if (!branch) return null;

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        disabled={isCheckingOut || branches.length === 0}
        className="flex items-center gap-1.5 text-sm min-w-0 hover:bg-accent rounded-md px-2 py-1 active:scale-[0.98] transition-[background-color,transform] duration-150 disabled:opacity-40"
      >
        {isCheckingOut ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground/70" />
        ) : (
          <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground/70" />
        )}
        <span className="font-medium truncate max-w-[120px]">{branch}</span>
        {branches.length > 0 ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
        {branches.map((b) => (
          <DropdownMenuItem
            key={b.name}
            onClick={() => {
              if (b.name !== branch) {
                void handleCheckout(b.name);
              }
            }}
            className="flex items-center gap-2"
          >
            <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
            <span className="truncate">{b.name}</span>
            <span className="flex items-center gap-1.5 ml-auto shrink-0">
              {b.upstream ? (
                <span className="text-xs text-muted-foreground">
                  {'\u2192'} {b.upstream}
                </span>
              ) : null}
              {b.isCurrent ? <Check className="h-3.5 w-3.5 text-green-500" /> : null}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/**
 * GitHub-style diff stats indicator showing additions/deletions
 */
const DiffStatsButton: FC = () => {
  const branchStats = useBranchDiffStats();
  const additions = branchStats?.additions ?? 0;
  const deletions = branchStats?.deletions ?? 0;
  const fileCount = branchStats?.filesChanged ?? 0;
  const setActivityTab = useUIStore((state) => state.setActivityTab);

  const tooltipText =
    fileCount === 0
      ? 'No changes on this branch'
      : `${String(fileCount)} file${fileCount !== 1 ? 's' : ''} changed on branch`;

  const handleClick = (): void => {
    setActivityTab('source');
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleClick}
          className={cn(
            'flex items-center h-6 rounded-md overflow-hidden',
            'text-[11px] font-medium tabular-nums',
            'transition-[background-color,color] duration-150'
          )}
        >
          {/* Additions (green) */}
          <span
            className="flex items-center gap-0.5 px-2 h-full text-success"
            style={{ backgroundColor: 'color-mix(in oklch, var(--success) 20%, transparent)' }}
          >
            <span>+{additions}</span>
          </span>
          {/* Gradient blend between green and red */}
          <span
            className="w-3 h-full shrink-0"
            style={{
              background:
                'linear-gradient(to right, color-mix(in oklch, var(--success) 20%, transparent), color-mix(in oklch, var(--destructive) 20%, transparent))',
            }}
          />
          {/* Deletions (red) */}
          <span
            className="flex items-center gap-0.5 px-2 h-full text-destructive"
            style={{ backgroundColor: 'color-mix(in oklch, var(--destructive) 20%, transparent)' }}
          >
            <span>
              {'\u2212'}
              {deletions}
            </span>
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltipText}</TooltipContent>
    </Tooltip>
  );
};

interface ChatHeaderProps {
  /** Hide git branch selector and diff stats (e.g. in editor mode where source control is in the sidebar) */
  readonly hideGitControls?: boolean;
}

export const ChatHeader: FC<ChatHeaderProps> = ({ hideGitControls }) => {
  const workspaceName = useWorkspaceName();
  const activeConversationTitle = useActiveConversationTitle();
  const vaultOpen = useVaultOpen();
  const reviewPanelOpen = useReviewPanelOpen();
  const activityTab = useActivityTab();

  // Hide branch + diff when source control tab is visible in the activity panel,
  // or when explicitly disabled (editor mode)
  const showGitControls = !hideGitControls && !(reviewPanelOpen && activityTab === 'source');

  return (
    <header
      className="flex items-center justify-between px-4 border-b border-gray-5 shrink-0"
      style={{ height: HEIGHTS.headerBar }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center text-base min-w-0 flex-1 max-w-[280px]">
        {vaultOpen ? (
          /* Vault breadcrumb */
          <>
            <span className="opacity-70 cursor-pointer hover:opacity-100 transition-opacity shrink-0">
              Vault
            </span>
            <span className="mx-2 opacity-30 shrink-0">/</span>
            <span className="opacity-70 truncate flex-1 min-w-0" title="All Notes">
              All Notes
            </span>
          </>
        ) : (
          /* Normal workspace breadcrumb */
          <>
            <span className="opacity-70 cursor-pointer hover:opacity-100 transition-opacity shrink-0">
              {workspaceName ?? 'No workspace'}
            </span>
            {activeConversationTitle ? (
              <>
                <span className="mx-2 opacity-30 shrink-0">/</span>
                <span
                  className="opacity-70 truncate flex-1 min-w-0"
                  title={activeConversationTitle}
                >
                  {activeConversationTitle}
                </span>
              </>
            ) : null}
          </>
        )}
      </div>

      {/* Right section: Branch selector + Diff stats */}
      {showGitControls ? (
        <div className="flex items-center gap-2">
          <HeaderBranchSelector />
          <DiffStatsButton />
        </div>
      ) : null}
    </header>
  );
};
