/**
 * ChatHeader - Breadcrumb header showing workspace and conversation title
 *
 * NOTE: Header height comes from @/lib/utils/constants.
 * To change header dimensions, update HEIGHTS in constants.ts.
 */
import type { FC } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, HEIGHTS } from '@/lib/utils';
import { useSessionDiffStats } from '@/stores/file/file-store';
import {
  useWorkspaceName,
  useActiveConversationTitle,
  useVaultOpen,
  useUIStore,
} from '@/stores/ui/ui-store';

/**
 * GitHub-style diff stats indicator showing additions/deletions
 */
const DiffStatsButton: FC = () => {
  const { additions, deletions, fileCount } = useSessionDiffStats();
  const setActivityTab = useUIStore((state) => state.setActivityTab);

  const tooltipText =
    fileCount === 0
      ? 'No files changed in this session'
      : `${String(fileCount)} file${fileCount !== 1 ? 's' : ''} changed in this session`;

  const handleClick = (): void => {
    setActivityTab('files');
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleClick}
          className={cn(
            'flex items-center h-6 rounded-lg overflow-hidden',
            'text-[11px] font-medium tabular-nums',
            'border-[3px] border-border/40',
            'transition-all duration-150 hover:border-border/60'
          )}
        >
          {/* Additions (green) */}
          <span
            className={cn(
              'flex items-center gap-0.5 px-2 h-full',
              'bg-success/20 text-success dark:text-success'
            )}
          >
            <span>+{additions}</span>
          </span>
          {/* Divider */}
          <span className="w-[2px] h-full bg-border/40" />
          {/* Deletions (red) */}
          <span
            className={cn(
              'flex items-center gap-0.5 px-2 h-full',
              'bg-destructive/20 text-destructive'
            )}
          >
            <span>−{deletions}</span>
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltipText}</TooltipContent>
    </Tooltip>
  );
};

export const ChatHeader: FC = () => {
  const workspaceName = useWorkspaceName();
  const activeConversationTitle = useActiveConversationTitle();
  const vaultOpen = useVaultOpen();

  return (
    <header
      className="flex items-center justify-between px-4 border-b-[3px] border-border/50 shrink-0"
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
            <span
              className="opacity-70 whitespace-nowrap overflow-hidden flex-1 min-w-0"
              title="All Notes"
              style={{
                maskImage: 'linear-gradient(to right, black 78%, transparent 95%)',
                WebkitMaskImage: 'linear-gradient(to right, black 78%, transparent 95%)',
                maskSize: '100% 100%',
                WebkitMaskSize: '100% 100%',
              }}
            >
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
                  className="opacity-70 whitespace-nowrap overflow-hidden flex-1 min-w-0"
                  title={activeConversationTitle}
                  style={{
                    maskImage: 'linear-gradient(to right, black 78%, transparent 95%)',
                    WebkitMaskImage: 'linear-gradient(to right, black 78%, transparent 95%)',
                    maskSize: '100% 100%',
                    WebkitMaskSize: '100% 100%',
                  }}
                >
                  {activeConversationTitle}
                </span>
              </>
            ) : null}
          </>
        )}
      </div>

      {/* Right section: Diff stats */}
      <div className="flex items-center gap-2">
        <DiffStatsButton />
      </div>
    </header>
  );
};
