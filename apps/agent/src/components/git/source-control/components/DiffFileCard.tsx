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
import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { FileItem } from '../types';
import type { FileDiff } from '@/lib/api';
import type { FileContents, FileDiffMetadata } from '@pierre/diffs/react';
import type { FC } from 'react';

import { DiffStat, useIsDarkMode } from '@/components/chat/tools/shared';
import { FileIcon } from '@/components/files';
import { readFile, readFileBytes } from '@/lib/api/files';
import { gitFileAtRef } from '@/lib/api/git';
import { cn, GIT_STATUS_STYLES } from '@/lib/utils';
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

/** Heuristic binary detection for raw bytes. */
function isLikelyBinaryBytes(bytes: readonly number[]): boolean {
  if (bytes.length === 0) return false;

  const sample = bytes.slice(0, 8192);
  let suspicious = 0;

  for (const byte of sample) {
    if (byte === 0) return true;
    if (byte < 7 || (byte > 14 && byte < 32) || byte === 127) {
      suspicious++;
    }
  }

  return suspicious / sample.length > 0.3;
}

// ---------------------------------------------------------------------------
// DiffFileCard
// ---------------------------------------------------------------------------

export const DiffFileCard: FC<DiffFileCardProps> = ({
  file,
  diff,
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

  const fileName = getFileName(file.path);
  const fileDir = getFileDirectory(file.path);
  const hasDiff = diff !== undefined && diff.hunks.length > 0;
  const isBinary = diff?.isBinary === true;

  // Prefetch file content, parse diff, AND preload Shiki highlighting on hover.
  // By the time the user clicks, the fully-highlighted HTML is ready — expand is instant.
  interface PreloadedDiff {
    fileDiff: FileDiffMetadata;
    prerenderedHTML: string;
    additions: number;
    deletions: number;
  }
  interface BaseDiffData {
    fileDiff: FileDiffMetadata;
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
  const prefetchRef = useRef<{ promise: Promise<PreloadedDiff | null>; key: string } | null>(null);
  const baseDiffRef = useRef<{ promise: Promise<BaseDiffData | null>; key: string } | null>(null);
  const cancelScheduledRef = useRef<(() => void) | null>(null);

  const showBinary = isBinary || isFallbackBinary;
  const canExpand = hasDiff || showBinary || diff === undefined;

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

  /** Build a cache key from the inputs that affect fetched content and backend diff state. */
  const prefetchKey = `${file.path}:${isStaged ? 'staged' : 'unstaged'}:${themeType}:${diffKey}`;
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

  /** Fetch file content and compute diff metadata/counts. */
  const fetchBaseDiff = (): Promise<BaseDiffData | null> => {
    if (baseDiffRef.current?.key === prefetchKey) return baseDiffRef.current.promise;
    if (showBinary || !repoPath) return Promise.resolve(null);

    const absolutePath = `${repoPath}/${file.path}`;
    const oldPath = file.oldPath ?? file.path;
    const oldRef = isStaged ? 'HEAD' : 'INDEX';

    const loadNewContent = async (): Promise<{ content: string; binary: boolean }> => {
      if (isStaged) {
        const content = await gitFileAtRef(repoPath, file.path, 'INDEX').catch(() => '');
        const bytes = await readFileBytes(absolutePath).catch(() => null);
        if (bytes && isLikelyBinaryBytes(bytes)) {
          return { content: '', binary: true };
        }
        return { content, binary: false };
      }

      try {
        const content = await readFile(absolutePath);
        if (content.includes('\u0000')) {
          return { content: '', binary: true };
        }
        return { content, binary: false };
      } catch {
        const bytes = await readFileBytes(absolutePath).catch(() => null);
        if (bytes && isLikelyBinaryBytes(bytes)) {
          return { content: '', binary: true };
        }
        return { content: '', binary: false };
      }
    };

    const promise = Promise.all([
      gitFileAtRef(repoPath, oldPath, oldRef).catch(() => ''),
      loadNewContent(),
    ])
      .then(([oldContent, newFile]): BaseDiffData | null => {
        if (newFile.binary) {
          setIsFallbackBinary(true);
          return null;
        }

        setIsFallbackBinary(false);
        const oldFile: FileContents = { name: file.path, contents: oldContent };
        const newFileContent: FileContents = { name: file.path, contents: newFile.content };
        const fileDiff = parseDiffFromFile(oldFile, newFileContent);
        const counts = countPierreChanges(fileDiff);
        return {
          fileDiff,
          additions: counts.additions,
          deletions: counts.deletions,
        };
      })
      .catch(() => null);

    baseDiffRef.current = { promise, key: prefetchKey };
    return promise;
  };

  /** Fetch file content → parse diff → preload Shiki highlighting. */
  const fetchAndPreload = (): Promise<PreloadedDiff | null> => {
    if (prefetchRef.current?.key === prefetchKey) return prefetchRef.current.promise;
    if (showBinary) return Promise.resolve(null);
    if (!repoPath) {
      setPreloadError('Repository path unavailable for this diff.');
      return Promise.resolve(null);
    }

    setPreloadError(null);
    const promise = fetchBaseDiff()
      .then(async (base): Promise<PreloadedDiff | null> => {
        if (!base) return null;
        // Preload Shiki highlighting — this is the expensive work
        const result = await preloadFileDiff({ fileDiff: base.fileDiff, options: pierreOptions });
        return {
          fileDiff: result.fileDiff,
          prerenderedHTML: result.prerenderedHTML,
          additions: base.additions,
          deletions: base.deletions,
        };
      })
      .catch(() => {
        setPreloadError('Failed to load diff preview.');
        return null;
      });

    prefetchRef.current = { promise, key: prefetchKey };
    return promise;
  };

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
      prefetchRef.current = null;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchAndPreload is stable via ref
  }, [isExpanded, prefetchKey]);

  // Populate header diff stats for cards missing bulk diff, without requiring hover.
  useEffect(() => {
    if (diff || prefetchedCounts || showBinary || !repoPath) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetchBaseDiff().then((base) => {
        if (cancelled || !base) return;
        setPrefetchedCounts({ additions: base.additions, deletions: base.deletions });
      });
    }, 220);
    return (): void => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchBaseDiff is keyed by prefetchKey
  }, [diff, prefetchedCounts, showBinary, repoPath, prefetchKey]);

  useEffect(() => {
    setPrefetchedCounts(null);
    setIsFallbackBinary(false);
    baseDiffRef.current = null;
    prefetchRef.current = null;
  }, [prefetchKey]);

  useEffect(() => {
    return (): void => {
      cancelScheduledRef.current?.();
      cancelScheduledRef.current = null;
    };
  }, []);

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
    prefetchRef.current = null;
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
