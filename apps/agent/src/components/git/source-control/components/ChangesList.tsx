/**
 * ChangesList - Tabbed view of staged and unstaged changes with inline diffs
 *
 * Shows a tab bar to switch between "Staged" and "Changes" views.
 * Only one tab is visible at a time. Each file is rendered as an
 * expandable DiffFileCard showing the inline diff on click.
 */
import { Check, CircleDashed, Minus, Plus } from 'lucide-react';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';

import { DiffFileCard } from './DiffFileCard';

import type { FileItem, VirtualizerDemandCallbacks } from '../types';
import type { FileDiff } from '@/lib/api';

import { cn } from '@/lib/utils';

type ActiveTab = 'staged' | 'changes';

interface ChangesListProps extends VirtualizerDemandCallbacks {
  scrollParent: HTMLDivElement | null;
  virtualizerReady: boolean;
  stagedFiles: FileItem[];
  unstagedFiles: FileItem[];
  untrackedDiffSkipped: boolean;
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
  virtualizerReady,
  stagedFiles,
  unstagedFiles,
  untrackedDiffSkipped,
  stagedDiffs,
  unstagedDiffs,
  isStaging,
  onStageFile,
  onUnstageFile,
  onStageAll,
  onUnstageAll,
  onRequestDiscard,
  onVirtualizerNeeded,
  onVirtualizerReleased,
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
      <div className="flex items-center gap-2 px-1.5 h-[34px]">
        {/* Pill toggle */}
        <div className="relative grid grid-cols-2 rounded-full bg-foreground/[0.05] p-1">
          {/* Sliding indicator */}
          <div
            className="absolute inset-y-1 left-1 w-[calc((100%-8px)/2)] rounded-full bg-foreground shadow-sm transition-transform duration-200 ease-out"
            style={{
              transform: `translateX(${activeTab === 'staged' ? '0%' : '100%'})`,
            }}
          />
          {/* Staged tab */}
          <button
            onClick={() => {
              setActiveTab('staged');
            }}
            className={cn(
              'relative z-10 flex items-center justify-center gap-1.5 rounded-full transition-colors duration-150 h-6 px-3 text-xs font-medium',
              activeTab === 'staged'
                ? 'text-background'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Staged
            {stagedFiles.length > 0 ? (
              <span
                className={cn(
                  'inline-flex items-center justify-center min-w-[14px] h-3.5 px-1 rounded-full text-[9px] font-semibold tabular-nums',
                  activeTab === 'staged'
                    ? 'bg-background/20 text-background'
                    : 'bg-foreground/8 text-muted-foreground'
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
              'relative z-10 flex items-center justify-center gap-1.5 rounded-full transition-colors duration-150 h-6 px-3 text-xs font-medium',
              activeTab === 'changes'
                ? 'text-background'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Changes
            {unstagedFiles.length > 0 ? (
              <span
                className={cn(
                  'inline-flex items-center justify-center min-w-[14px] h-3.5 px-1 rounded-full text-[9px] font-semibold tabular-nums',
                  activeTab === 'changes'
                    ? 'bg-background/20 text-background'
                    : 'bg-foreground/8 text-muted-foreground'
                )}
              >
                {unstagedFiles.length}
              </span>
            ) : null}
          </button>
        </div>

        <div className="flex-1" />

        {/* Bulk action */}
        {activeFiles.length > 0 ? (
          <button
            onClick={() => void activeBulkAction()}
            disabled={isStaging}
            className="flex items-center gap-1 px-2.5 h-6 rounded-full text-xs text-muted-foreground hover:text-foreground hover:bg-lg-control-hover active:scale-95 transition-[background-color,color,transform] duration-150"
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
              itemContent={(_index, file) => {
                const isDeferredDiffMode =
                  !isStaged && untrackedDiffSkipped && file.backendStatus === 'untracked';
                return (
                  <div className="pb-1">
                    <DiffFileCard
                      file={file}
                      diff={activeDiffMap.get(file.path)}
                      deferredDiffMode={isDeferredDiffMode}
                      isStaged={isStaged}
                      isLoading={isStaging}
                      virtualizerReady={virtualizerReady}
                      onAction={activeAction}
                      onDiscard={activeDiscard}
                      schedulePrefetch={schedulePrefetch}
                      onVirtualizerNeeded={onVirtualizerNeeded}
                      onVirtualizerReleased={onVirtualizerReleased}
                    />
                  </div>
                );
              }}
            />
          ) : (
            <div className="px-3 py-4 text-xs text-lg-text-secondary">Loading changes...</div>
          )
        ) : (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
            {isStaged ? (
              <>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground/[0.07] dark:bg-foreground/[0.04]">
                  <CircleDashed
                    className="h-4 w-4 text-muted-foreground/50 dark:text-muted-foreground/30"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <p className="text-[12px] font-medium text-muted-foreground/70 dark:text-muted-foreground/50">
                    No staged changes
                  </p>
                  <p className="text-[11px] text-muted-foreground/50 dark:text-muted-foreground/30 mt-0.5">
                    Use + to stage files for commit
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-success/15 dark:bg-success/10">
                  <Check className="h-4 w-4 text-success" aria-hidden="true" />
                </div>
                <p className="text-[12px] font-medium text-muted-foreground/70 dark:text-muted-foreground/50">
                  All changes staged
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
