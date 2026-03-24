import { FileDiff, Virtualizer as PierreVirtualizer } from '@pierre/diffs/react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { ViewedFileDiff } from '@/stores/file/file-viewer-store';
import type { FileDiffOptions } from '@pierre/diffs';
import type { CSSProperties, FC } from 'react';

import { useIsDarkMode } from '@/components/chat/tools/shared';
import { useSmoothScroll } from '@/hooks/ui';
import { gitFileDiffContent } from '@/lib/api/git';
import {
  getPierreChangedLineCount,
  getPierreDiffRenderTier,
  gitFileToPierreDiff,
  PIERRE_DIFF_STYLE,
  PIERRE_DIFF_UNSAFE_CSS,
  PIERRE_THEME,
  PIERRE_VIRTUAL_FILE_METRICS,
  PIERRE_VIRTUALIZER_OVERSCROLL_SIZE,
} from '@/lib/utils/pierre-adapter';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';
import { useGitStore } from '@/stores/git/git-store';

export interface FileDiffViewerProps {
  readonly diffData: ViewedFileDiff;
  readonly filePath?: string;
  readonly className?: string;
}

/**
 * Renders diff data in the file viewer context using Pierre's FileDiff.
 * Takes oldContent/newContent from ViewedFileDiff and passes to parseDiffFromFile.
 */
export const FileDiffViewer: FC<FileDiffViewerProps> = ({
  diffData,
  filePath = 'file',
  className = '',
}) => {
  const smoothScrollRef = useSmoothScroll(0.08);
  const isDarkMode = useIsDarkMode();
  const currentRepoPath = useGitStore((state) => state.repoPath);
  const currentStatusFingerprint = useGitStore((state) => state.statusFingerprint);
  const openFileWithDiff = useFileViewerStore((state) => state.openFileWithDiff);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const [isReloading, setIsReloading] = useState(false);
  const themeType: 'dark' | 'light' = isDarkMode ? 'dark' : 'light';

  const fileDiff = useMemo(
    () =>
      gitFileToPierreDiff({
        repoPath: diffData.repoPath,
        scope: diffData.scope,
        path: diffData.filePath,
        oldPath: diffData.oldPath,
        oldContent: diffData.oldContent,
        newContent: diffData.newContent,
      }),
    [
      diffData.filePath,
      diffData.newContent,
      diffData.oldContent,
      diffData.oldPath,
      diffData.repoPath,
      diffData.scope,
    ]
  );

  const totalChangedLines = useMemo(() => {
    if (!fileDiff) {
      return 0;
    }

    let additions = 0;
    let deletions = 0;
    for (const hunk of fileDiff.hunks) {
      additions += hunk.additionLines;
      deletions += hunk.deletionLines;
    }

    return getPierreChangedLineCount(additions, deletions);
  }, [fileDiff]);

  // Use the MORE conservative of changed-line tier vs content-line tier.
  // A 10k-line file with 1 change is "small" by changed lines but "pathological" by content.
  const changedTier = getPierreDiffRenderTier(totalChangedLines);
  const contentTier = fileDiff ? getPierreDiffRenderTier(fileDiff.unifiedLineCount) : changedTier;
  const effectiveTier =
    contentTier === 'pathological' || changedTier === 'pathological'
      ? 'pathological'
      : contentTier === 'large' || changedTier === 'large'
        ? 'large'
        : 'small';
  const isVirtualized = effectiveTier !== 'small';
  const isDifferentWorkspace =
    currentRepoPath !== null && currentRepoPath !== diffData.repoPath && currentRepoPath.length > 0;
  const isOutdated =
    !isDifferentWorkspace &&
    currentStatusFingerprint !== null &&
    diffData.statusFingerprint !== null &&
    currentStatusFingerprint !== diffData.statusFingerprint;

  useEffect(() => {
    setReloadError(null);
    setIsReloading(false);
  }, [diffData]);

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

  const handleReload = async (): Promise<void> => {
    setIsReloading(true);
    setReloadError(null);

    try {
      const nextDiff = await gitFileDiffContent(
        diffData.repoPath,
        diffData.filePath,
        diffData.scope,
        diffData.oldPath ?? undefined
      );

      openFileWithDiff(
        filePath,
        {
          ...diffData,
          oldContent: nextDiff.oldContent,
          newContent: nextDiff.newContent,
          statusFingerprint: currentStatusFingerprint,
        },
        undefined
      );
    } catch {
      setReloadError('Unable to reload diff.');
    } finally {
      setIsReloading(false);
    }
  };

  const banner = isDifferentWorkspace ? (
    <div className="flex items-center gap-2 border-b border-divider bg-warning/10 px-3 py-2 text-xs text-warning">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      <span>Diff from a different workspace.</span>
    </div>
  ) : isOutdated ? (
    <div className="flex items-center gap-2 border-b border-divider bg-warning/10 px-3 py-2 text-xs text-warning">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">Diff may be outdated.</span>
      <button
        type="button"
        onClick={() => {
          void handleReload();
        }}
        disabled={isReloading}
        className="inline-flex items-center gap-1 text-foreground/80 transition-colors hover:text-foreground disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isReloading ? 'animate-spin' : ''}`} />
        Reload
      </button>
    </div>
  ) : null;

  if (!fileDiff) {
    return (
      <div className={`h-full overflow-y-auto overscroll-y-contain bg-card ${className}`}>
        {banner}
        <div className="px-3 py-4 text-xs text-muted-foreground/60">Unable to render diff</div>
      </div>
    );
  }

  if (isVirtualized) {
    return (
      <div className={`h-full min-h-0 bg-chat-area ${className}`}>
        {banner}
        {reloadError ? (
          <div className="border-b border-divider px-3 py-2 text-xs text-destructive/90">
            {reloadError}
          </div>
        ) : null}
        <PierreVirtualizer
          config={{ overscrollSize: PIERRE_VIRTUALIZER_OVERSCROLL_SIZE }}
          className="h-full overflow-y-auto overscroll-y-contain p-3"
        >
          <div className="overflow-hidden" style={{ borderRadius: 9 }}>
            <FileDiff
              fileDiff={fileDiff}
              metrics={PIERRE_VIRTUAL_FILE_METRICS}
              style={PIERRE_DIFF_STYLE as CSSProperties}
              options={pierreOptions}
            />
          </div>
        </PierreVirtualizer>
      </div>
    );
  }

  return (
    <div
      ref={smoothScrollRef}
      className={`h-full overflow-y-auto overscroll-y-contain bg-chat-area p-3 ${className}`}
    >
      {banner}
      {reloadError ? (
        <div className="mb-2 rounded-lg px-3 py-2 text-xs text-destructive/90">{reloadError}</div>
      ) : null}
      <div className="overflow-hidden" style={{ borderRadius: 9 }}>
        <FileDiff
          fileDiff={fileDiff}
          style={PIERRE_DIFF_STYLE as CSSProperties}
          options={pierreOptions}
        />
      </div>
    </div>
  );
};
