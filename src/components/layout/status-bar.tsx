import { AlertCircle, ArrowDown, ArrowUp, GitBranch } from 'lucide-react';

import type { FC } from 'react';

import { cn } from '@/lib/utils';
import {
  selectAhead,
  selectBehind,
  selectBranch,
  selectTotalChanges,
  useGitStore,
} from '@/stores/git-store';

export interface StatusBarProps {
  className?: string;
}

/** Maximum length for branch name before truncation */
const MAX_BRANCH_LENGTH = 30;

/**
 * Truncate a branch name if it exceeds max length
 */
function truncateBranch(branch: string, maxLength: number = MAX_BRANCH_LENGTH): string {
  if (branch.length <= maxLength) return branch;
  // Keep first and last parts with ellipsis in middle
  const halfLength = Math.floor((maxLength - 3) / 2);
  return `${branch.slice(0, halfLength)}...${branch.slice(-halfLength)}`;
}

/**
 * StatusBar displays git branch info and sync status.
 * Uses git store selectors for optimized re-renders - only updates when relevant state changes.
 */
export const StatusBar: FC<StatusBarProps> = ({ className }) => {
  // Optimized subscriptions - each selector only triggers re-render when its value changes
  const branch = useGitStore(selectBranch);
  const ahead = useGitStore(selectAhead);
  const behind = useGitStore(selectBehind);
  const totalChanges = useGitStore(selectTotalChanges);
  const isLoading = useGitStore((s) => s.isLoading);
  const error = useGitStore((s) => s.error);
  const repoPath = useGitStore((s) => s.repoPath);

  // Determine if we're in a git repo (have repo path but may not have status yet)
  const isGitRepo = repoPath !== null;

  return (
    <div
      className={cn(
        'h-6 flex items-center justify-between px-2 text-xs',
        'bg-muted/50 border-t border-border',
        'text-muted-foreground',
        className
      )}
    >
      {/* Left section - Git info */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Error indicator */}
        {error ? (
          <div className="flex items-center gap-1.5 text-destructive" title={`Git error: ${error}`}>
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate max-w-[150px]">Git error</span>
          </div>
        ) : branch ? (
          /* Branch - only show if we have branch info */
          <div className="flex items-center gap-1.5 min-w-0">
            <GitBranch className="h-3.5 w-3.5 shrink-0" />
            <span
              className="font-medium truncate"
              title={branch.length > MAX_BRANCH_LENGTH ? branch : undefined}
            >
              {truncateBranch(branch)}
            </span>
          </div>
        ) : isGitRepo ? (
          /* In a git repo but no branch yet (loading or detached HEAD) */
          <div className="flex items-center gap-1.5 text-muted-foreground/70">
            <GitBranch className="h-3.5 w-3.5 shrink-0" />
            <span className="italic">detached</span>
          </div>
        ) : null}

        {/* Sync status - only show if we have a branch */}
        {branch && (ahead > 0 || behind > 0) ? (
          <div className="flex items-center gap-1.5">
            {ahead > 0 ? (
              <span
                className="flex items-center gap-0.5"
                title={`${String(ahead)} commit${ahead !== 1 ? 's' : ''} ahead of upstream`}
              >
                <ArrowUp className="h-3 w-3" />
                {ahead}
              </span>
            ) : null}
            {behind > 0 ? (
              <span
                className="flex items-center gap-0.5"
                title={`${String(behind)} commit${behind !== 1 ? 's' : ''} behind upstream`}
              >
                <ArrowDown className="h-3 w-3" />
                {behind}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Changes count - only show if we have changes */}
        {totalChanges > 0 ? (
          <span
            className="text-yellow-500"
            title={`${String(totalChanges)} uncommitted change${totalChanges !== 1 ? 's' : ''}`}
          >
            {totalChanges} change{totalChanges !== 1 ? 's' : ''}
          </span>
        ) : null}

        {/* Loading indicator - only during initial load or refresh */}
        {isLoading ? (
          <span className="text-muted-foreground/50 animate-pulse">syncing...</span>
        ) : null}
      </div>

      {/* Right section - placeholder for future items (line/col, encoding, etc.) */}
      <div className="flex items-center gap-3">
        {/* Future: cursor position, file encoding, etc. */}
      </div>
    </div>
  );
};
