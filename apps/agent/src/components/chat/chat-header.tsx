/**
 * ChatHeader - Breadcrumb header showing workspace and conversation title
 *
 * Also shows diff stats on the right side. These are hidden when the
 * activity panel is open on the Source Control tab (since that panel
 * already shows them). Branch selector lives only in Source Control.
 *
 * NOTE: Header height comes from @/lib/utils/constants.
 * To change header dimensions, update HEIGHTS in constants.ts.
 */

import type { FC } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, HEIGHTS } from '@/lib/utils';
import { useBranchDiffStats } from '@/stores/git/git-store';
import {
  useWorkspaceName,
  useActiveConversationTitle,
  useIsTitleLoading,
  useVaultOpen,
  useUIStore,
  useReviewPanelOpen,
  useActivityTab,
} from '@/stores/ui/ui-store';

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
  const activeConversationId = useUIStore((state) => state.activeConversationId);
  const isTitleLoading = useIsTitleLoading(activeConversationId);
  const vaultOpen = useVaultOpen();
  const reviewPanelOpen = useReviewPanelOpen();
  const activityTab = useActivityTab();

  // Hide branch + diff when source control tab is visible in the activity panel,
  // or when explicitly disabled (editor mode)
  const showGitControls = !hideGitControls && !(reviewPanelOpen && activityTab === 'source');

  return (
    <header
      className="flex items-center justify-between px-4 border-b border-lg-separator shrink-0"
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
            {activeConversationTitle || isTitleLoading ? (
              <>
                <span className="mx-2 opacity-30 shrink-0">/</span>
                {isTitleLoading ? (
                  <span className="inline-block h-3.5 w-28 rounded bg-foreground/10 animate-pulse" />
                ) : (
                  <span
                    className="opacity-70 truncate flex-1 min-w-0 animate-title-in"
                    title={activeConversationTitle ?? undefined}
                  >
                    {activeConversationTitle}
                  </span>
                )}
              </>
            ) : null}
          </>
        )}
      </div>

      {/* Right section: Diff stats */}
      {showGitControls ? (
        <div className="flex items-center gap-2">
          <DiffStatsButton />
        </div>
      ) : null}
    </header>
  );
};
