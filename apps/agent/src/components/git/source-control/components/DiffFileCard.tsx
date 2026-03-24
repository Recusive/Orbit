/**
 * DiffFileCard - Expandable file card with inline diff view
 *
 * Uses Pierre's <FileDiff> for rendering with full old/new file content,
 * enabling expandable "N unmodified lines" separators.
 *
 * Header layout: file icon → filename + status letter → path → DiffStat → actions → chevron
 */
import { parseDiffFromFile } from '@pierre/diffs';
import { FileDiff as PierreFileDiff, VirtualizerContext } from '@pierre/diffs/react';
import { preloadFileDiff } from '@pierre/diffs/ssr';
import { AlertCircle, ChevronDown, ExternalLink, Loader2, Minus, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { FileItem } from '../types';
import type { DiffScope, FileDiff, FileDiffStats } from '@/lib/api';
import type { FileDiffOptions } from '@pierre/diffs';
import type { FileDiffMetadata } from '@pierre/diffs/react';
import type { CSSProperties, FC, MouseEvent, TransitionEvent } from 'react';

import { DiffStat, useIsDarkMode } from '@/components/chat/tools/shared';
import { FileIcon } from '@/components/files';
import { gitFileDiffContent, gitFileDiffStats } from '@/lib/api/git';
import { cn, diffScheduler, GIT_STATUS_STYLES } from '@/lib/utils';
import {
  buildGitFileContents,
  getPierreChangedLineCount,
  getPierreDiffRenderTier,
  LARGE_DIFF_INLINE_THRESHOLD,
  PATHOLOGICAL_DIFF_THRESHOLD,
  PIERRE_DIFF_STYLE,
  PIERRE_DIFF_UNSAFE_CSS,
  PIERRE_THEME,
  PIERRE_VIRTUAL_FILE_METRICS,
} from '@/lib/utils/pierre-adapter';
import {
  getCachedParsedDiff,
  getParsedDiffCacheKey,
  setCachedParsedDiff,
} from '@/lib/utils/pierre-diff-cache';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';
import { useGitStore } from '@/stores/git/git-store';

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

interface PreparedDiff {
  fileDiff: FileDiffMetadata;
  additions: number;
  deletions: number;
  oldContent: string;
  newContent: string;
  prerenderedHTML?: string;
}

function getFileName(path: string): string {
  return path.split('/').pop() ?? path;
}

function getFileDirectory(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/');
}

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

function countPierreChanges(fileDiff: FileDiffMetadata): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const hunk of fileDiff.hunks) {
    additions += hunk.additionLines;
    deletions += hunk.deletionLines;
  }
  return { additions, deletions };
}

async function hydratePreparedDiff(
  parsed: Omit<PreparedDiff, 'prerenderedHTML'>,
  shouldPrerender: boolean,
  options: FileDiffOptions<undefined>
): Promise<PreparedDiff> {
  // Skip prerender for large files even if changed-line count says "small".
  // A 10k-line file with 1 change still has 10k lines of Shiki work.
  const totalContentLines = parsed.fileDiff.unifiedLineCount;
  if (!shouldPrerender || totalContentLines > LARGE_DIFF_INLINE_THRESHOLD) {
    return parsed;
  }

  const prerendered = await preloadFileDiff({
    fileDiff: parsed.fileDiff,
    options,
  });

  return {
    ...parsed,
    fileDiff: prerendered.fileDiff,
    prerenderedHTML: prerendered.prerenderedHTML,
  };
}

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
  const [isMounted, setIsMounted] = useState(false);
  const [preparedDiff, setPreparedDiff] = useState<PreparedDiff | null>(null);
  const [isFallbackBinary, setIsFallbackBinary] = useState(false);
  const [prefetchedCounts, setPrefetchedCounts] = useState<{
    additions: number;
    deletions: number;
  } | null>(null);
  const [preloadError, setPreloadError] = useState<string | null>(null);
  const [isOpeningDiffTab, setIsOpeningDiffTab] = useState(false);

  const isDarkMode = useIsDarkMode();
  const repoPath = useGitStore((state) => state.repoPath);
  const statusFingerprint = useGitStore((state) => state.statusFingerprint);
  const statusRevision = useGitStore((state) => state.statusRevision);
  const openFileWithDiff = useFileViewerStore((state) => state.openFileWithDiff);

  const preloadRef = useRef<{ key: string; promise: Promise<PreparedDiff | null> } | null>(null);
  const cancelScheduledRef = useRef<(() => void) | null>(null);
  const latestRequestKeyRef = useRef('');
  const lastStatsRequestKeyRef = useRef<string | null>(null);

  const fileName = getFileName(file.path);
  const fileDir = getFileDirectory(file.path);
  const hasDiff = diff !== undefined && diff.hunks.length > 0;
  const isBinary = diff?.isBinary === true;
  const scope: DiffScope = isStaged ? 'staged' : 'unstaged';
  const showBinary = isBinary || isFallbackBinary;
  const needsSingleFileFallback = diff === undefined && !showBinary;

  const { additions, deletions } = useMemo(() => {
    if (diff) return countChanges(diff);
    if (preparedDiff)
      return { additions: preparedDiff.additions, deletions: preparedDiff.deletions };
    return prefetchedCounts ?? { additions: 0, deletions: 0 };
  }, [diff, preparedDiff, prefetchedCounts]);

  const totalChangedLines = getPierreChangedLineCount(additions, deletions);
  const diffTier = getPierreDiffRenderTier(totalChangedLines);
  // Tier considers BOTH changed lines AND total content lines.
  // A 10k-line file with 1 change is "large" by content even though changed lines say "small".
  const changedTier = preparedDiff
    ? getPierreDiffRenderTier(
        getPierreChangedLineCount(preparedDiff.additions, preparedDiff.deletions)
      )
    : diffTier;
  const contentTier = preparedDiff
    ? getPierreDiffRenderTier(preparedDiff.fileDiff.unifiedLineCount)
    : diffTier;
  // Use the MORE conservative tier
  const preparedDiffTier =
    contentTier === 'pathological' || changedTier === 'pathological'
      ? 'pathological'
      : contentTier === 'large' || changedTier === 'large'
        ? 'large'
        : 'small';
  const isLargeInlineDiff = preparedDiffTier === 'large';
  const isPathologicalDiff = preparedDiffTier === 'pathological';
  const canExpand = hasDiff || showBinary || diff === undefined || isPathologicalDiff;
  const hasVisibleStat = !showBinary && totalChangedLines > 0;

  const themeType: 'dark' | 'light' = isDarkMode ? 'dark' : 'light';
  const pierreOptions = useMemo<FileDiffOptions<undefined>>(
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

  const diffKey = useMemo(() => {
    if (!diff) return 'missing';
    const hunkSignature = diff.hunks
      .map((hunk) => `${hunk.header}:${hunk.lines.length.toString()}`)
      .join('|');
    return `${diff.path}:${diff.oldPath ?? ''}:${diff.isBinary ? '1' : '0'}:${hunkSignature}`;
  }, [diff]);

  const displayStateKey = `${file.path}:${scope}:${themeType}:${diffKey}`;
  const requestKey = `${displayStateKey}:${String(statusRevision)}`;
  const parsedCacheKey = useMemo(() => {
    if (!repoPath) {
      return null;
    }

    return getParsedDiffCacheKey({
      repoPath,
      scope,
      path: file.path,
      oldPath: file.oldPath ?? null,
      statusFingerprint,
    });
  }, [file.oldPath, file.path, repoPath, scope, statusFingerprint]);

  latestRequestKeyRef.current = requestKey;

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
    setPrefetchedCounts((previous) => {
      if (previous?.additions === stats.additions && previous.deletions === stats.deletions) {
        return previous;
      }

      return { additions: stats.additions, deletions: stats.deletions };
    });
  }, []);

  const fetchAndPrepare = useCallback(async (): Promise<PreparedDiff | null> => {
    if (preloadRef.current?.key === requestKey) {
      return preloadRef.current.promise;
    }

    if (showBinary) {
      return Promise.resolve(null);
    }

    if (!repoPath || !parsedCacheKey) {
      setPreloadError('Repository path unavailable for this diff.');
      return Promise.resolve(null);
    }

    setPreloadError(null);

    const shouldPrerender = diffTier === 'small';
    const cached = getCachedParsedDiff(parsedCacheKey);
    if (cached) {
      const cachedPromise = hydratePreparedDiff(cached, shouldPrerender, pierreOptions).then(
        (result) => {
          if (latestRequestKeyRef.current !== requestKey) {
            return null;
          }

          return result;
        }
      );
      preloadRef.current = { key: requestKey, promise: cachedPromise };
      return cachedPromise;
    }

    const promise = diffScheduler
      .requestContent(requestKey, () =>
        gitFileDiffContent(repoPath, file.path, scope, file.oldPath ?? undefined)
      )
      .then(async (content): Promise<PreparedDiff | null> => {
        if (!content || latestRequestKeyRef.current !== requestKey) {
          return null;
        }

        if (content.isBinary) {
          setIsFallbackBinary(true);
          return null;
        }

        setIsFallbackBinary(false);

        const oldFile = buildGitFileContents({
          repoPath,
          scope,
          path: file.path,
          oldPath: file.oldPath,
          side: 'old',
          contents: content.oldContent,
        });
        const newFile = buildGitFileContents({
          repoPath,
          scope,
          path: file.path,
          oldPath: file.oldPath,
          side: 'new',
          contents: content.newContent,
        });
        const fileDiffMetadata = parseDiffFromFile(oldFile, newFile);
        const counts = countPierreChanges(fileDiffMetadata);
        const parsed = {
          fileDiff: fileDiffMetadata,
          additions: counts.additions,
          deletions: counts.deletions,
          oldContent: content.oldContent,
          newContent: content.newContent,
        };

        setCachedParsedDiff(parsedCacheKey, parsed);

        const hydrated = await hydratePreparedDiff(
          parsed,
          getPierreDiffRenderTier(getPierreChangedLineCount(counts.additions, counts.deletions)) ===
            'small',
          pierreOptions
        );
        if (latestRequestKeyRef.current !== requestKey) {
          return null;
        }

        return hydrated;
      })
      .catch(() => {
        setPreloadError('Failed to load diff preview.');
        return null;
      });

    preloadRef.current = { key: requestKey, promise };
    return promise;
  }, [
    diffTier,
    file.oldPath,
    file.path,
    parsedCacheKey,
    pierreOptions,
    repoPath,
    requestKey,
    scope,
    showBinary,
  ]);

  const handleMouseEnter = (): void => {
    if (!canExpand || isExpanded || diffTier === 'pathological') {
      return;
    }

    cancelScheduledRef.current?.();
    cancelScheduledRef.current = schedulePrefetch(async () => {
      const result = await fetchAndPrepare();
      if (result) {
        setPrefetchedCounts({ additions: result.additions, deletions: result.deletions });
      }
    });
  };

  const handleMouseLeave = (): void => {
    cancelScheduledRef.current?.();
    cancelScheduledRef.current = null;
  };

  useEffect(() => {
    if (!isExpanded) {
      setPreparedDiff(null);
      setPreloadError(null);
      preloadRef.current = null;
      return;
    }

    if (showBinary || diffTier === 'pathological') {
      return;
    }

    let cancelled = false;
    void fetchAndPrepare().then((result) => {
      if (cancelled) {
        return;
      }

      setPreparedDiff(result);
      if (result) {
        setPrefetchedCounts({ additions: result.additions, deletions: result.deletions });
      }
    });

    return (): void => {
      cancelled = true;
    };
  }, [diffTier, fetchAndPrepare, isExpanded, requestKey, showBinary]);

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
          if (cancelled) {
            return;
          }

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
    setPreparedDiff(null);
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
    if (!canExpand) {
      return;
    }

    cancelScheduledRef.current?.();
    cancelScheduledRef.current = null;
    setIsExpanded((previous) => {
      if (!previous) {
        setIsMounted(true);
      } else if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setIsMounted(false);
      }

      return !previous;
    });
  };

  const handleTransitionEnd = (event: TransitionEvent): void => {
    if (event.propertyName === 'grid-template-rows' && !isExpanded) {
      setIsMounted(false);
    }
  };

  const handleAction = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    void onAction(file.path);
  };

  const handleDiscard = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    onDiscard?.(file.path);
  };

  const handleRetryPreload = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    setPreparedDiff(null);
    setPreloadError(null);
    preloadRef.current = null;
    void fetchAndPrepare().then((result) => {
      setPreparedDiff(result);
      if (result) {
        setPrefetchedCounts({ additions: result.additions, deletions: result.deletions });
      }
    });
  };

  const handleOpenInDiffTab = async (event: MouseEvent<HTMLButtonElement>): Promise<void> => {
    event.stopPropagation();

    if (!repoPath) {
      setPreloadError('Repository path unavailable for this diff.');
      return;
    }

    setIsOpeningDiffTab(true);
    setPreloadError(null);

    try {
      const result =
        preparedDiff ??
        (await fetchAndPrepare().then((nextPreparedDiff) => {
          if (nextPreparedDiff) {
            setPreparedDiff(nextPreparedDiff);
          }
          return nextPreparedDiff;
        }));

      if (!result) {
        setPreloadError('Failed to open diff tab.');
        return;
      }

      openFileWithDiff(file.path, {
        oldContent: result.oldContent,
        newContent: result.newContent,
        repoPath,
        scope,
        filePath: file.path,
        oldPath: file.oldPath ?? null,
        statusFingerprint,
      });
    } finally {
      setIsOpeningDiffTab(false);
    }
  };

  const largeDiffMessage =
    totalChangedLines >= PATHOLOGICAL_DIFF_THRESHOLD
      ? `Large diff (${totalChangedLines.toLocaleString()} lines changed) — open in diff tab`
      : `Large diff (${PATHOLOGICAL_DIFF_THRESHOLD.toLocaleString()}+ lines) — open in diff tab`;

  return (
    <div className="min-w-0 mx-1 overflow-hidden" style={{ borderRadius: 9 }}>
      <div
        onClick={handleToggle}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onKeyDown={(event): void => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
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
        <FileIcon fileName={fileName} className="h-[18px] w-[18px] shrink-0" />

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
          {totalChangedLines >= LARGE_DIFF_INLINE_THRESHOLD && !showBinary ? (
            <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
              {diffTier === 'pathological' ? 'Open In Tab' : 'Virtualized'}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/card:opacity-100 transition-opacity duration-150 ease-out motion-reduce:transition-none">
          {diffTier === 'pathological' && !showBinary ? (
            <button
              type="button"
              onClick={(event) => {
                void handleOpenInDiffTab(event);
              }}
              disabled={isOpeningDiffTab}
              className="relative h-6 w-6 flex items-center justify-center rounded-full text-muted-foreground/50 hover:text-foreground hover:bg-lg-control-hover active:scale-95 transition-[transform,color,background-color] duration-75 ease-out motion-reduce:transition-none before:absolute before:inset-0 before:min-h-[44px] before:min-w-[44px] before:-translate-x-1/2 before:-translate-y-1/2 before:left-1/2 before:top-1/2"
              title="Open in diff tab"
              aria-label={`Open ${fileName} in diff tab`}
            >
              {isOpeningDiffTab ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" />
              )}
            </button>
          ) : null}
          {onDiscard ? (
            <button
              type="button"
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
            type="button"
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
            ) : isPathologicalDiff ? (
              <div className="px-3 py-3 text-xs text-muted-foreground/80 flex items-center gap-3">
                <span className="flex-1">{largeDiffMessage}</span>
                <button
                  type="button"
                  onClick={(event) => {
                    void handleOpenInDiffTab(event);
                  }}
                  disabled={isOpeningDiffTab}
                  className="inline-flex items-center gap-1 rounded-full bg-lg-control px-3 py-1.5 text-[11px] font-medium text-secondary-foreground transition-colors hover:bg-lg-control-hover disabled:opacity-50"
                >
                  {isOpeningDiffTab ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ExternalLink className="h-3.5 w-3.5" />
                  )}
                  Open in diff tab
                </button>
              </div>
            ) : preparedDiff ? (
              isLargeInlineDiff ? (
                <PierreFileDiff
                  fileDiff={preparedDiff.fileDiff}
                  metrics={PIERRE_VIRTUAL_FILE_METRICS}
                  style={PIERRE_DIFF_STYLE as CSSProperties}
                  options={pierreOptions}
                  {...(preparedDiff.prerenderedHTML
                    ? { prerenderedHTML: preparedDiff.prerenderedHTML }
                    : {})}
                />
              ) : (
                <VirtualizerContext.Provider value={undefined}>
                  <PierreFileDiff
                    fileDiff={preparedDiff.fileDiff}
                    style={PIERRE_DIFF_STYLE as CSSProperties}
                    options={pierreOptions}
                    {...(preparedDiff.prerenderedHTML
                      ? { prerenderedHTML: preparedDiff.prerenderedHTML }
                      : {})}
                  />
                </VirtualizerContext.Provider>
              )
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
