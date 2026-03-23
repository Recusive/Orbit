/**
 * DiffFileCard - Expandable file card with inline diff view
 *
 * Uses Pierre's <FileDiff> for rendering with full old/new file content,
 * enabling expandable "N unmodified lines" separators.
 *
 * Header layout: file icon → filename + status letter → path → DiffStat → actions → chevron
 */
import { parseDiffFromFile } from '@pierre/diffs';
import { FileDiff as PierreFileDiff } from '@pierre/diffs/react';
import { preloadFileDiff } from '@pierre/diffs/ssr';
import { AlertCircle, ChevronDown, Minus, Plus, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { FileItem } from '../types';
import type { DiffScope, FileDiff, FileDiffStats } from '@/lib/api';
import type { FileContents, FileDiffMetadata } from '@pierre/diffs/react';
import type { FC } from 'react';

import { DiffStat, useIsDarkMode } from '@/components/chat/tools/shared';
import { FileIcon } from '@/components/files';
import { gitFileDiffContent, gitFileDiffStats } from '@/lib/api/git';
import { cn, diffScheduler, GIT_STATUS_STYLES } from '@/lib/utils';
import {
  PIERRE_DIFF_STYLE,
  PIERRE_DIFF_UNSAFE_CSS,
  PIERRE_THEME,
} from '@/lib/utils/pierre-adapter';
import { useGitStore } from '@/stores/git/git-store';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DiffFileCardProps {
  readonly file: FileItem;
  readonly diff: FileDiff | undefined;
  readonly deferredDiffMode: boolean;
  readonly isStaged: boolean;
  readonly isLoading: boolean;
  readonly onAction: (path: string) => Promise<void>;
  readonly onDiscard?: ((path: string) => void) | undefined;
  readonly schedulePrefetch: (start: () => Promise<void>) => () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract filename from path */
function getFileName(path: string): string {
  return path.split('/').pop() ?? path;
}

/** Extract directory from path */
function getFileDirectory(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/');
}

/** Count additions and deletions in a diff */
function countChanges(diff: FileDiff): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      if (line.origin === '+') additions++;
      else if (line.origin === '-') deletions++;
    }
  }
  return { additions, deletions };
}

/** Count additions and deletions in a Pierre diff metadata object */
function countPierreChanges(fileDiff: FileDiffMetadata): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const hunk of fileDiff.hunks) {
    additions += hunk.additionLines;
    deletions += hunk.deletionLines;
  }
  return { additions, deletions };
}

// ---------------------------------------------------------------------------
// DiffFileCard
// ---------------------------------------------------------------------------

export const DiffFileCard: FC<DiffFileCardProps> = ({
  file,
  diff,
  deferredDiffMode,
  isStaged,
  isLoading,
  onAction,
  onDiscard,
  schedulePrefetch,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  // Keep content mounted during the collapse animation, unmount after transition ends
  const [isMounted, setIsMounted] = useState(false);
  const isDarkMode = useIsDarkMode();
  const repoPath = useGitStore((s) => s.repoPath);
  const statusRevision = useGitStore((s) => s.statusRevision);

  const fileName = getFileName(file.path);
  const fileDir = getFileDirectory(file.path);
  const hasDiff = diff !== undefined && diff.hunks.length > 0;
  const isBinary = diff?.isBinary === true;
  const scope: DiffScope = isStaged ? 'staged' : 'unstaged';

  // Prefetch file content, parse diff, AND preload Shiki highlighting on hover.
  // By the time the user clicks, the fully-highlighted HTML is ready — expand is instant.
  interface PreloadedDiff {
    fileDiff: FileDiffMetadata;
    prerenderedHTML: string;
    additions: number;
    deletions: number;
  }

  const [preloaded, setPreloaded] = useState<PreloadedDiff | null>(null);
  const [isFallbackBinary, setIsFallbackBinary] = useState(false);
  const [prefetchedCounts, setPrefetchedCounts] = useState<{
    additions: number;
    deletions: number;
  } | null>(null);
  const [preloadError, setPreloadError] = useState<string | null>(null);
  const preloadRef = useRef<{ key: string; promise: Promise<PreloadedDiff | null> } | null>(null);
  const cancelScheduledRef = useRef<(() => void) | null>(null);

  const showBinary = isBinary || isFallbackBinary;
  const canExpand = hasDiff || showBinary || diff === undefined;
  const needsSingleFileFallback = diff === undefined && !showBinary;

  const { additions, deletions } = useMemo(() => {
    if (diff) return countChanges(diff);
    if (preloaded) return { additions: preloaded.additions, deletions: preloaded.deletions };
    return prefetchedCounts ?? { additions: 0, deletions: 0 };
  }, [diff, preloaded, prefetchedCounts]);

  const hasVisibleStat = !showBinary && (additions > 0 || deletions > 0);

  /** Pierre options used for both preload and live rendering */
  const themeType: 'dark' | 'light' = isDarkMode ? 'dark' : 'light';

  const diffKey = useMemo(() => {
    if (!diff) return 'missing';
    const hunkSignature = diff.hunks
      .map((hunk) => `${hunk.header}:${hunk.lines.length.toString()}`)
      .join('|');
    return `${diff.path}:${diff.oldPath ?? ''}:${diff.isBinary ? '1' : '0'}:${hunkSignature}`;
  }, [diff]);

  const fallbackRevision = statusRevision;
  const displayStateKey = `${file.path}:${scope}:${themeType}:${diffKey}`;
  const requestKey = `${displayStateKey}:${String(fallbackRevision)}`;
  const latestRequestKeyRef = useRef(requestKey);
  const lastStatsRequestKeyRef = useRef<string | null>(null);
  const pierreOptions = useMemo(
    () => ({
      theme: PIERRE_THEME,
      themeType,
      diffStyle: 'unified' as const,
      diffIndicators: 'bars' as const,
      lineDiffType: 'word' as const,
      overflow: 'wrap' as const,
      disableFileHeader: true,
      unsafeCSS: PIERRE_DIFF_UNSAFE_CSS,
    }),
    [themeType]
  );

  const handleStatsResult = useCallback((stats: FileDiffStats | null): void => {
    if (!stats) {
      return;
    }

    if (stats.isBinary) {
      setIsFallbackBinary(true);
      setPrefetchedCounts(null);
      return;
    }

    setIsFallbackBinary(false);
    // Value-based dedup: skip state update if stats haven't changed (prevents re-render blink)
    setPrefetchedCounts((prev) => {
      if (prev?.additions === stats.additions && prev.deletions === stats.deletions) {
        return prev; // Same reference = no re-render
      }
      return { additions: stats.additions, deletions: stats.deletions };
    });
  }, []);

  latestRequestKeyRef.current = requestKey;

  /** Fetch file content → parse diff → preload Shiki highlighting. */
  const fetchAndPreload = useCallback((): Promise<PreloadedDiff | null> => {
    if (preloadRef.current?.key === requestKey) {
      return preloadRef.current.promise;
    }
    if (showBinary) {
      return Promise.resolve(null);
    }
    if (!repoPath) {
      setPreloadError('Repository path unavailable for this diff.');
      return Promise.resolve(null);
    }

    setPreloadError(null);
    const promise = diffScheduler
      .requestContent(requestKey, () =>
        gitFileDiffContent(repoPath, file.path, scope, file.oldPath ?? undefined)
      )
      .then(async (content): Promise<PreloadedDiff | null> => {
        if (!content || latestRequestKeyRef.current !== requestKey) {
          return null;
        }

        if (content.isBinary) {
          setIsFallbackBinary(true);
          return null;
        }

        setIsFallbackBinary(false);
        const oldFile: FileContents = { name: file.path, contents: content.oldContent };
        const newFile: FileContents = { name: file.path, contents: content.newContent };
        const fileDiff = parseDiffFromFile(oldFile, newFile);
        const counts = countPierreChanges(fileDiff);
        const result = await preloadFileDiff({ fileDiff, options: pierreOptions });
        if (latestRequestKeyRef.current !== requestKey) {
          return null;
        }
        return {
          fileDiff: result.fileDiff,
          prerenderedHTML: result.prerenderedHTML,
          additions: counts.additions,
          deletions: counts.deletions,
        };
      })
      .catch(() => {
        setPreloadError('Failed to load diff preview.');
        return null;
      });

    preloadRef.current = { key: requestKey, promise };
    return promise;
  }, [file.oldPath, file.path, pierreOptions, repoPath, requestKey, scope, showBinary]);

  /** Start prefetching + preloading on hover — data is ready by the time user clicks. */
  const handleMouseEnter = (): void => {
    if (!canExpand || isExpanded) return;
    cancelScheduledRef.current?.();
    cancelScheduledRef.current = schedulePrefetch(async () => {
      const result = await fetchAndPreload();
      if (result) {
        setPrefetchedCounts({ additions: result.additions, deletions: result.deletions });
      }
    });
  };

  const handleMouseLeave = (): void => {
    cancelScheduledRef.current?.();
    cancelScheduledRef.current = null;
  };

  // When expanded, resolve prefetched data (or trigger fetch if hover was skipped).
  // When collapsed, clear to free memory.
  useEffect(() => {
    if (!isExpanded) {
      setPreloaded(null);
      setPreloadError(null);
      preloadRef.current = null;
      return;
    }

    let cancelled = false;
    void fetchAndPreload().then((result) => {
      if (!cancelled) {
        setPreloaded(result);
        if (result) {
          setPrefetchedCounts({ additions: result.additions, deletions: result.deletions });
        }
      }
    });

    return (): void => {
      cancelled = true;
    };
  }, [fetchAndPreload, isExpanded, requestKey]);

  // Populate header diff stats for cards missing bulk diff, without requiring hover.
  useEffect(() => {
    if (!needsSingleFileFallback || !repoPath || lastStatsRequestKeyRef.current === requestKey) {
      return;
    }
    let cancelled = false;

    const requestStats = (): void => {
      void diffScheduler
        .requestStats(requestKey, () =>
          gitFileDiffStats(repoPath, file.path, scope, file.oldPath ?? undefined)
        )
        .then((stats) => {
          if (cancelled) return;
          lastStatsRequestKeyRef.current = requestKey;
          handleStatsResult(stats);
        })
        .catch(() => undefined);
    };

    const timer = deferredDiffMode ? window.setTimeout(requestStats, 220) : null;
    if (!deferredDiffMode) {
      requestStats();
    }

    return (): void => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      diffScheduler.cancel(requestKey);
    };
  }, [
    deferredDiffMode,
    file.oldPath,
    file.path,
    handleStatsResult,
    needsSingleFileFallback,
    repoPath,
    requestKey,
    scope,
  ]);

  useEffect(() => {
    lastStatsRequestKeyRef.current = null;
    setPreloaded(null);
    setPreloadError(null);
    setPrefetchedCounts(null);
    setIsFallbackBinary(false);
    preloadRef.current = null;
  }, [displayStateKey]);

  useEffect(() => {
    return (): void => {
      cancelScheduledRef.current?.();
      cancelScheduledRef.current = null;
      diffScheduler.cancel(requestKey);
    };
  }, [requestKey]);

  const style = GIT_STATUS_STYLES[file.displayStatus];

  const handleToggle = (): void => {
    if (!canExpand) return;
    cancelScheduledRef.current?.();
    cancelScheduledRef.current = null;
    setIsExpanded((prev) => {
      if (!prev) {
        setIsMounted(true); // Mount immediately on expand
      } else {
        // When reduced motion is active, transitionEnd won't fire — unmount immediately
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        if (mq.matches) setIsMounted(false);
      }
      return !prev;
    });
  };

  /** Unmount content after collapse transition finishes to free memory */
  const handleTransitionEnd = (e: React.TransitionEvent): void => {
    // Only react to the grid-template-rows transition on this element
    if (e.propertyName === 'grid-template-rows' && !isExpanded) {
      setIsMounted(false);
    }
  };

  const handleAction = (e: React.MouseEvent): void => {
    e.stopPropagation();
    void onAction(file.path);
  };

  const handleDiscard = (e: React.MouseEvent): void => {
    e.stopPropagation();
    onDiscard?.(file.path);
  };

  const handleRetryPreload = (e: React.MouseEvent): void => {
    e.stopPropagation();
    setPreloaded(null);
    setPreloadError(null);
    preloadRef.current = null;
    void fetchAndPreload().then((result) => {
      setPreloaded(result);
      if (result) {
        setPrefetchedCounts({ additions: result.additions, deletions: result.deletions });
      }
    });
  };

  return (
    <div className="min-w-0 mx-1 overflow-hidden" style={{ borderRadius: 9 }}>
      {/* Header */}
      <div
        onClick={handleToggle}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onKeyDown={(e): void => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          }
        }}
        role="button"
        tabIndex={canExpand ? 0 : -1}
        aria-label={isExpanded ? `Collapse diff for ${fileName}` : `Expand diff for ${fileName}`}
        aria-expanded={isExpanded}
        className={cn(
          'group/card flex items-center gap-2 py-1.5 px-2.5 select-none',
          'w-full text-left bg-sidebar/50 dark:bg-sidebar',
          'hover:bg-lg-control-hover',
          canExpand ? 'cursor-pointer' : 'cursor-default'
        )}
      >
        {/* File icon */}
        <FileIcon fileName={fileName} className="h-[18px] w-[18px] shrink-0" />

        {/* File name, status letter, path, and diff stat */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className={cn('text-sm font-medium truncate', style.fileColor)}>{fileName}</span>
          <span className={cn('text-[11px] font-bold shrink-0', style.color)}>{style.label}</span>
          {fileDir ? (
            <span className="text-[11px] text-muted-foreground/50 truncate shrink-2">
              {fileDir}
            </span>
          ) : null}
          {hasVisibleStat ? (
            <div className="shrink-0">
              <DiffStat additions={additions} deletions={deletions} />
            </div>
          ) : null}
        </div>

        {/* Right side: actions + chevron */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/card:opacity-100 transition-opacity duration-150 ease-out motion-reduce:transition-none">
          {onDiscard ? (
            <button
              onClick={handleDiscard}
              disabled={isLoading}
              className="relative h-6 w-6 flex items-center justify-center rounded-full text-muted-foreground/50 hover:bg-destructive-subtle hover:text-destructive-text active:scale-95 transition-[transform,color,background-color] duration-75 ease-out motion-reduce:transition-none before:absolute before:inset-0 before:min-h-[44px] before:min-w-[44px] before:-translate-x-1/2 before:-translate-y-1/2 before:left-1/2 before:top-1/2"
              title="Discard"
              aria-label={`Discard changes to ${fileName}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            onClick={handleAction}
            disabled={isLoading}
            className="relative h-6 w-6 flex items-center justify-center rounded-full text-muted-foreground/50 hover:text-foreground hover:bg-lg-control-hover active:scale-95 transition-[transform,color,background-color] duration-75 ease-out motion-reduce:transition-none before:absolute before:inset-0 before:min-h-[44px] before:min-w-[44px] before:-translate-x-1/2 before:-translate-y-1/2 before:left-1/2 before:top-1/2"
            title={isStaged ? 'Unstage' : 'Stage'}
            aria-label={isStaged ? `Unstage ${fileName}` : `Stage ${fileName}`}
          >
            {isStaged ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          </button>
          {canExpand ? (
            <div className="h-6 w-6 flex items-center justify-center rounded-full text-muted-foreground/50 hover:bg-lg-control-hover">
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 transition-[rotate] duration-150 ease-out motion-reduce:transition-none',
                  isExpanded && 'rotate-180'
                )}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Expandable diff body — uses CSS grid-rows for GPU-friendly expand/collapse */}
      <div
        onTransitionEnd={handleTransitionEnd}
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none',
          isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden min-h-0">
          {isMounted ? (
            showBinary ? (
              <div className="px-3 py-2 text-xs text-muted-foreground/60 italic">
                Binary file — diff not available
              </div>
            ) : preloaded ? (
              <PierreFileDiff
                fileDiff={preloaded.fileDiff}
                prerenderedHTML={preloaded.prerenderedHTML}
                style={PIERRE_DIFF_STYLE as React.CSSProperties}
                options={pierreOptions}
              />
            ) : preloadError ? (
              <div className="px-3 py-2 text-xs text-destructive/90 flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="flex-1">{preloadError}</span>
                <button
                  type="button"
                  onClick={handleRetryPreload}
                  className="text-xs text-foreground/80 hover:text-foreground underline-offset-2 hover:underline"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="px-3 py-2 text-xs text-muted-foreground/60">Loading diff…</div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
};
