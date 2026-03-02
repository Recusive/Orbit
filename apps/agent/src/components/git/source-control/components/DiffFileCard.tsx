/**
 * DiffFileCard - Expandable file card with inline diff view
 *
 * Uses Pierre's <FileDiff> for rendering with full old/new file content,
 * enabling expandable "N unmodified lines" separators.
 *
 * Header layout: status badge → filename → label → DiffStat → actions → chevron
 */
import { parseDiffFromFile } from '@pierre/diffs';
import { FileDiff as PierreFileDiff } from '@pierre/diffs/react';
import { preloadFileDiff } from '@pierre/diffs/ssr';
import { AlertCircle, ChevronDown, Minus, Plus, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { DisplayFileStatus, FileItem } from '../types';
import type { FileDiff } from '@/lib/api';
import type { FileContents, FileDiffMetadata } from '@pierre/diffs/react';
import type { FC } from 'react';

import { DiffStat, useIsDarkMode } from '@/components/chat/tools/shared';
import { readFile } from '@/lib/api/files';
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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map display status to the colored badge background used in the header icon */
const STATUS_BADGE_BG: Record<DisplayFileStatus, string> = {
  added: 'bg-green-500/10 group-hover/card:bg-green-500/15',
  modified: 'bg-yellow-500/10 group-hover/card:bg-yellow-500/15',
  deleted: 'bg-red-500/10 group-hover/card:bg-red-500/15',
  renamed: 'bg-blue-500/10 group-hover/card:bg-blue-500/15',
  untracked: 'bg-gray-400/10 group-hover/card:bg-gray-400/15',
  conflicted: 'bg-orange-500/10 group-hover/card:bg-orange-500/15',
};

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
  const canExpand = hasDiff || isBinary;

  const { additions, deletions } = useMemo(
    () => (diff ? countChanges(diff) : { additions: 0, deletions: 0 }),
    [diff]
  );

  // Prefetch file content, parse diff, AND preload Shiki highlighting on hover.
  // By the time the user clicks, the fully-highlighted HTML is ready — expand is instant.
  interface PreloadedDiff {
    fileDiff: FileDiffMetadata;
    prerenderedHTML: string;
  }

  const [preloaded, setPreloaded] = useState<PreloadedDiff | null>(null);
  const [preloadError, setPreloadError] = useState<string | null>(null);
  const prefetchRef = useRef<{ promise: Promise<PreloadedDiff | null>; key: string } | null>(null);

  /** Build a cache key from the inputs that affect the fetched content. */
  const prefetchKey = `${file.path}:${isStaged ? 'staged' : 'unstaged'}`;

  /** Pierre options used for both preload and live rendering */
  const themeType: 'dark' | 'light' = isDarkMode ? 'dark' : 'light';
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

  /** Fetch file content → parse diff → preload Shiki highlighting. */
  const fetchAndPreload = (): Promise<PreloadedDiff | null> => {
    if (prefetchRef.current?.key === prefetchKey) return prefetchRef.current.promise;
    if (!diff || diff.isBinary) return Promise.resolve(null);
    if (!repoPath) {
      setPreloadError('Repository path unavailable for this diff.');
      return Promise.resolve(null);
    }

    const absolutePath = `${repoPath}/${file.path}`;
    const oldRef = isStaged ? 'HEAD' : 'INDEX';
    setPreloadError(null);

    const promise = Promise.all([
      gitFileAtRef(repoPath, file.path, oldRef).catch(() => ''),
      isStaged
        ? gitFileAtRef(repoPath, file.path, 'INDEX').catch(() => '')
        : readFile(absolutePath).catch(() => ''),
    ])
      .then(async ([oldContent, newContent]): Promise<PreloadedDiff | null> => {
        const oldFile: FileContents = { name: file.path, contents: oldContent };
        const newFile: FileContents = { name: file.path, contents: newContent };
        const fileDiff = parseDiffFromFile(oldFile, newFile);

        // Preload Shiki highlighting — this is the expensive work
        const result = await preloadFileDiff({ fileDiff, options: pierreOptions });
        return { fileDiff: result.fileDiff, prerenderedHTML: result.prerenderedHTML };
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
    if (canExpand && !isExpanded) void fetchAndPreload();
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
      if (!cancelled) setPreloaded(result);
    });

    return (): void => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchAndPreload is stable via ref
  }, [isExpanded, prefetchKey]);

  const style = GIT_STATUS_STYLES[file.displayStatus];

  const handleToggle = (): void => {
    if (!canExpand) return;
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
    });
  };

  return (
    <div className="min-w-0 mx-1 overflow-hidden" style={{ borderRadius: 9 }}>
      {/* Header */}
      <div
        onClick={handleToggle}
        onMouseEnter={handleMouseEnter}
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
          'group/card flex items-center gap-2 py-1.5 px-2.5',
          'w-full text-left bg-sidebar/50 dark:bg-sidebar',
          'hover:bg-lg-control-hover',
          canExpand ? 'cursor-pointer' : 'cursor-default'
        )}
      >
        {/* Status badge */}
        <div
          className={cn(
            'w-[22px] h-[22px] rounded-md flex items-center justify-center shrink-0',
            STATUS_BADGE_BG[file.displayStatus]
          )}
        >
          <span className={cn('text-[11px] font-bold leading-none', style.color)}>
            {style.label}
          </span>
        </div>

        {/* File name, path, and diff stat */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-sm font-medium truncate text-foreground/90">{fileName}</span>
          {fileDir ? (
            <span className="text-[11px] text-muted-foreground/50 truncate shrink-2">
              {fileDir}
            </span>
          ) : null}
          {hasDiff ? (
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
            isBinary ? (
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
