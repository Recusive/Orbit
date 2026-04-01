import { FileDiff as PierreFileDiff } from '@pierre/diffs/react';
import { preloadFileDiff } from '@pierre/diffs/ssr';
import { AlertCircle, ChevronRight, Loader2, XCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  DiffStat,
  TOOL_EXPAND_ENTER,
  TOOL_EXPAND_EXIT,
  TOOL_EXPAND_TRANSITION_NONE,
  useToolWidgetExpanded,
  useIsDarkMode,
} from './shared';

import type { FileDiffMetadata } from '@pierre/diffs/react';
import type { FC } from 'react';

import { cn } from '@/lib/utils';
import {
  editToolToPierreDiff,
  PIERRE_DIFF_STYLE,
  PIERRE_DIFF_UNSAFE_CSS,
  PIERRE_THEME,
} from '@/lib/utils/pierre-adapter';

interface EditToolWidgetProps {
  readonly toolId: string;
  readonly filePath: string;
  readonly oldString: string;
  readonly newString: string;
  readonly isRunning?: boolean;
  readonly success?: boolean | undefined;
  readonly onOpenFile?: (path: string) => void;
}

export const EditToolWidget: FC<EditToolWidgetProps> = ({
  toolId,
  filePath,
  oldString,
  newString,
  isRunning = false,
  success,
  onOpenFile,
}) => {
  // Always start collapsed — user expands manually if they want the full view
  const [isExpanded, toggleExpanded] = useToolWidgetExpanded(toolId);
  const isFailed = success === false;
  const shouldReduceMotion = useReducedMotion();
  const isDarkMode = useIsDarkMode();
  const themeType: 'dark' | 'light' = isDarkMode ? 'dark' : 'light';

  const fileName = filePath.split('/').pop() ?? filePath;
  const oldLines = oldString.split('\n');
  const newLines = newString.split('\n');
  const deletions = oldLines.length;
  const additions = newLines.length;

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

  const [reloadVersion, setReloadVersion] = useState(0);
  const [preloaded, setPreloaded] = useState<{
    fileDiff: FileDiffMetadata;
    prerenderedHTML: string;
  } | null>(null);
  const [preloadError, setPreloadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isExpanded) {
      setPreloaded(null);
      setPreloadError(null);
      return;
    }

    let cancelled = false;
    const diff = editToolToPierreDiff(filePath, oldString, newString);
    if (!diff) {
      setPreloaded(null);
      setPreloadError('Unable to render diff.');
      return;
    }

    setPreloaded(null);
    setPreloadError(null);

    void preloadFileDiff({ fileDiff: diff, options: pierreOptions })
      .then((result) => {
        if (!cancelled) {
          setPreloaded({ fileDiff: result.fileDiff, prerenderedHTML: result.prerenderedHTML });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreloadError('Failed to load diff preview.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filePath, isExpanded, newString, oldString, pierreOptions, reloadVersion]);

  const handleFileClick = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    onOpenFile?.(filePath);
  };

  const handleRetry = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setReloadVersion((v) => v + 1);
  }, []);

  return (
    <div className={cn('min-w-0', isFailed && 'opacity-60')}>
      {/* Header — flat inline row */}
      <button
        onClick={toggleExpanded}
        aria-label={
          isExpanded ? `Collapse Edit output for ${fileName}` : `Expand Edit output for ${fileName}`
        }
        aria-expanded={isExpanded}
        className={cn(
          'group flex items-center gap-1.5 py-1.5 text-base',
          'cursor-pointer w-full text-left rounded-xl'
        )}
      >
        {/* Left: label + filename, badges, spinner, diff */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base font-medium text-foreground">
            {isRunning ? 'Editing' : 'Edited'}
          </span>
          <a
            role="link"
            tabIndex={0}
            className={cn(
              'text-base font-medium truncate cursor-pointer hover:underline',
              isFailed ? 'text-lg-text-secondary' : 'text-git-untracked'
            )}
            onClick={handleFileClick}
            onKeyDown={(e): void => {
              if (e.key === 'Enter' || e.key === ' ')
                handleFileClick(e as unknown as React.MouseEvent);
            }}
            title={filePath}
          >
            {fileName}
          </a>

          {isFailed ? <XCircle className="h-3 w-3 text-destructive/60 shrink-0" /> : null}

          {isRunning ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin text-lg-text-secondary shrink-0" />
          ) : null}

          {!isRunning && !isFailed ? (
            <DiffStat additions={additions} deletions={deletions} />
          ) : null}

          <ChevronRight
            className={cn(
              'h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-[rotate,opacity] duration-200 ease-out shrink-0',
              isExpanded && 'rotate-90'
            )}
            aria-hidden="true"
          />
        </div>
      </button>

      {/* Tree-style expanded content */}
      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : { height: 0, opacity: 0, transition: TOOL_EXPAND_EXIT }
            }
            transition={shouldReduceMotion ? TOOL_EXPAND_TRANSITION_NONE : TOOL_EXPAND_ENTER}
            style={{ overflow: 'hidden' }}
          >
            <div className="my-1.5 overflow-hidden rounded-lg">
              {preloaded ? (
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
                    onClick={handleRetry}
                    className="text-xs text-foreground/80 hover:text-foreground underline-offset-2 hover:underline"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div className="px-3 py-2 text-xs text-muted-foreground/60">Loading diff...</div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
