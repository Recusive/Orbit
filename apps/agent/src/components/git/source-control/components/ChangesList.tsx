/**
 * ChangesList - Tabbed view of staged and unstaged changes with inline diffs
 *
 * Shows a tab bar to switch between "Staged" and "Changes" views.
 * Only one tab is visible at a time. Each file is rendered as an
 * expandable DiffFileCard showing the inline diff on click.
 */
import { Check, Minus, Plus } from 'lucide-react';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';

import { DiffFileCard } from './DiffFileCard';

import type { FileItem } from '../types';
import type { FileDiff } from '@/lib/api';

import { cn } from '@/lib/utils';

type ActiveTab = 'staged' | 'changes';

interface ChangesListProps {
  scrollParent: HTMLDivElement | null;
  stagedFiles: FileItem[];
  unstagedFiles: FileItem[];
  stagedDiffs: FileDiff[];
  unstagedDiffs: FileDiff[];
  isStaging: boolean;
  onStageFile: (path: string) => Promise<void>;
  onUnstageFile: (path: string) => Promise<void>;
  onStageAll: () => Promise<void>;
  onUnstageAll: () => Promise<void>;
  onRequestDiscard: (path: string) => void;
}

export const ChangesList: React.FC<ChangesListProps> = ({
  scrollParent,
  stagedFiles,
  unstagedFiles,
  stagedDiffs,
  unstagedDiffs,
  isStaging,
  onStageFile,
  onUnstageFile,
  onStageAll,
  onUnstageAll,
  onRequestDiscard,
}) => {
  const hasChanges = stagedFiles.length > 0 || unstagedFiles.length > 0;

  // Default to whichever tab has files (prefer changes — more common workflow)
  const [activeTab, setActiveTab] = useState<ActiveTab>(() =>
    unstagedFiles.length > 0 ? 'changes' : 'staged'
  );

  // Build O(1) lookup maps for diffs by file path
  const stagedDiffMap = useMemo(() => new Map(stagedDiffs.map((d) => [d.path, d])), [stagedDiffs]);
  const unstagedDiffMap = useMemo(
    () => new Map(unstagedDiffs.map((d) => [d.path, d])),
    [unstagedDiffs]
  );

  // Current tab's files and helpers
  const isStaged = activeTab === 'staged';
  const activeFiles = isStaged ? stagedFiles : unstagedFiles;
  const activeDiffMap = isStaged ? stagedDiffMap : unstagedDiffMap;
  const activeAction = isStaged ? onUnstageFile : onStageFile;
  const activeBulkAction = isStaged ? onUnstageAll : onStageAll;
  const activeDiscard = isStaged ? undefined : onRequestDiscard;

  const latestHoverIdRef = useRef(0);
  const activeTaskRef = useRef<Promise<void> | null>(null);
  const pendingStartRef = useRef<(() => Promise<void>) | null>(null);

  const runPrefetch = useCallback((start: () => Promise<void>): void => {
    if (activeTaskRef.current) {
      // Latest-wins: keep only the newest task while one is already running.
      pendingStartRef.current = start;
      return;
    }

    const task: Promise<void> = start()
      .catch(() => undefined)
      .then(() => undefined)
      .finally(() => {
        if (activeTaskRef.current === task) {
          activeTaskRef.current = null;
        }
        const pending = pendingStartRef.current;
        pendingStartRef.current = null;
        if (pending) {
          runPrefetch(pending);
        }
      });

    activeTaskRef.current = task;
  }, []);

  const schedulePrefetch = useCallback(
    (start: () => Promise<void>): (() => void) => {
      const hoverId = ++latestHoverIdRef.current;
      const timer = window.setTimeout(() => {
        if (hoverId !== latestHoverIdRef.current) return;
        runPrefetch(start);
      }, 150);
      return () => {
        window.clearTimeout(timer);
      };
    },
    [runPrefetch]
  );

  // Clean state — nothing to show
  if (!hasChanges) {
    return (
      <div className="p-5 text-center text-base text-lg-text-secondary">
        <Check className="h-5 w-5 mx-auto mb-1.5 text-emerald-500/80" />
        Working tree clean
      </div>
    );
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-0.5 px-1.5 h-[34px]">
        {/* Staged tab */}
        <button
          onClick={() => {
            setActiveTab('staged');
          }}
          className={cn(
            'flex items-center gap-1 px-2 h-6 rounded-[9px] text-xs tracking-wide',
            '',
            activeTab === 'staged'
              ? 'bg-lg-control text-foreground font-medium'
              : 'text-foreground hover:text-foreground hover:bg-lg-control-hover'
          )}
        >
          Staged
          {stagedFiles.length > 0 ? (
            <span
              className={cn(
                'inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded text-[9px] font-semibold tabular-nums',
                activeTab === 'staged'
                  ? 'bg-foreground/10 text-foreground/80'
                  : 'text-lg-text-secondary'
              )}
            >
              {stagedFiles.length}
            </span>
          ) : null}
        </button>

        {/* Changes tab */}
        <button
          onClick={() => {
            setActiveTab('changes');
          }}
          className={cn(
            'flex items-center gap-1 px-2 h-6 rounded-[9px] text-xs tracking-wide',
            '',
            activeTab === 'changes'
              ? 'bg-lg-control text-foreground font-medium'
              : 'text-foreground hover:text-foreground hover:bg-lg-control-hover'
          )}
        >
          Changes
          {unstagedFiles.length > 0 ? (
            <span
              className={cn(
                'inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded text-[9px] font-semibold tabular-nums',
                activeTab === 'changes'
                  ? 'bg-foreground/10 text-foreground/80'
                  : 'text-lg-text-secondary'
              )}
            >
              {unstagedFiles.length}
            </span>
          ) : null}
        </button>

        <div className="flex-1" />

        {/* Bulk action */}
        {activeFiles.length > 0 ? (
          <button
            onClick={() => void activeBulkAction()}
            disabled={isStaging}
            className="flex items-center gap-1 px-2 h-6 rounded-[9px] text-xs text-foreground hover:text-foreground hover:bg-lg-control-hover active:scale-95 transition-transform duration-75"
            aria-label={isStaged ? 'Unstage all files' : 'Stage all files'}
          >
            {isStaged ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            {isStaged ? 'Unstage all' : 'Stage all'}
          </button>
        ) : null}
      </div>

      {/* File cards for active tab */}
      <div className="py-1">
        {activeFiles.length > 0 ? (
          scrollParent ? (
            <Virtuoso
              customScrollParent={scrollParent}
              data={activeFiles}
              overscan={10}
              itemContent={(_index, file) => (
                <div className="pb-1">
                  <DiffFileCard
                    file={file}
                    diff={activeDiffMap.get(file.path)}
                    isStaged={isStaged}
                    isLoading={isStaging}
                    onAction={activeAction}
                    onDiscard={activeDiscard}
                    schedulePrefetch={schedulePrefetch}
                  />
                </div>
              )}
            />
          ) : (
            <div className="px-3 py-4 text-xs text-lg-text-secondary">Loading changes...</div>
          )
        ) : (
          <div className="px-3 py-4 text-center text-xs text-lg-text-secondary">
            {isStaged ? 'No staged changes' : 'No unstaged changes'}
          </div>
        )}
      </div>
    </div>
  );
};
