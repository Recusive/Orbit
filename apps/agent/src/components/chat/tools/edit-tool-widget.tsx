import { IconWrite } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconWrite';
import { FileDiff } from '@pierre/diffs/react';
import { CheckCircle2, ChevronRight, Loader2, XCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo, useState } from 'react';

import {
  DiffStat,
  TOOL_EXPAND_TRANSITION,
  TOOL_EXPAND_TRANSITION_NONE,
  useIsDarkMode,
} from './shared';

import type { FC } from 'react';

import { cn } from '@/lib/utils';
import {
  editToolToPierreDiff,
  PIERRE_DIFF_STYLE,
  PIERRE_DIFF_UNSAFE_CSS,
  PIERRE_THEME,
} from '@/lib/utils/pierre-adapter';

interface EditToolWidgetProps {
  readonly filePath: string;
  readonly oldString: string;
  readonly newString: string;
  readonly isRunning?: boolean;
  readonly success?: boolean | undefined;
  readonly onOpenFile?: (path: string) => void;
}

export const EditToolWidget: FC<EditToolWidgetProps> = ({
  filePath,
  oldString,
  newString,
  isRunning = false,
  success,
  onOpenFile,
}) => {
  // Always start collapsed — user expands manually if they want the full view
  const [isExpanded, setIsExpanded] = useState(false);
  const isFailed = success === false;
  const shouldReduceMotion = useReducedMotion();
  const isDarkMode = useIsDarkMode();

  const fileName = filePath.split('/').pop() ?? filePath;
  const oldLines = oldString.split('\n');
  const newLines = newString.split('\n');
  const deletions = oldLines.length;
  const additions = newLines.length;

  // Parse diff only when expanded — avoid work for collapsed widgets
  const fileDiff = useMemo(() => {
    if (!isExpanded) return null;
    return editToolToPierreDiff(filePath, oldString, newString);
  }, [isExpanded, filePath, oldString, newString]);

  const handleFileClick = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    onOpenFile?.(filePath);
  };

  return (
    <div className={cn('min-w-0', isFailed && 'opacity-60')}>
      {/* Header — flat inline row */}
      <button
        onClick={() => {
          setIsExpanded(!isExpanded);
        }}
        aria-label={
          isExpanded ? `Collapse Edit output for ${fileName}` : `Expand Edit output for ${fileName}`
        }
        aria-expanded={isExpanded}
        className={cn(
          'group flex items-center gap-1.5 py-1.5 text-sm',
          'cursor-pointer w-full text-left rounded-xl',
          isFailed && 'border-2 border-dotted border-destructive/40'
        )}
      >
        {/* Left: icon, filename, badges, spinner, diff */}
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <IconWrite
            className={cn(
              'h-4 w-4 shrink-0',
              isFailed ? 'text-destructive/60' : 'text-foreground',
              isRunning && 'animate-pulse'
            )}
          />

          <a
            role="link"
            tabIndex={0}
            className={cn(
              'text-sm font-medium truncate cursor-pointer hover:underline',
              isFailed ? 'text-lg-text-secondary line-through' : 'text-foreground'
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

          <span
            className={cn(
              'text-sm shrink-0',
              isFailed ? 'text-destructive/60' : 'text-muted-foreground'
            )}
          >
            {isFailed ? '(failed)' : '(modified)'}
          </span>

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
            exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={shouldReduceMotion ? TOOL_EXPAND_TRANSITION_NONE : TOOL_EXPAND_TRANSITION}
            style={{ overflow: 'hidden' }}
          >
            <div className="flex flex-col">
              <div className="flex flex-row">
                {/* Gutter: single continuous vertical connector line */}
                <div className="w-4 flex justify-center shrink-0">
                  <div
                    className={cn(
                      'w-[2px] rounded-full h-full',
                      success === undefined && 'bg-warning/40'
                    )}
                    style={
                      success !== undefined
                        ? {
                            background: success
                              ? 'linear-gradient(to bottom, color-mix(in oklch, var(--color-warning) 40%, transparent), color-mix(in oklch, #22c55e 50%, transparent))'
                              : 'linear-gradient(to bottom, color-mix(in oklch, var(--color-warning) 40%, transparent), color-mix(in oklch, #ef4444 50%, transparent))',
                          }
                        : undefined
                    }
                  />
                </div>

                {/* Content column — Pierre diff */}
                <div className="flex-1 min-w-0 ml-2.5 flex flex-col">
                  <div className="my-1.5 overflow-hidden rounded-lg">
                    {fileDiff ? (
                      <FileDiff
                        fileDiff={fileDiff}
                        style={PIERRE_DIFF_STYLE as React.CSSProperties}
                        options={{
                          theme: PIERRE_THEME,
                          themeType: isDarkMode ? 'dark' : 'light',
                          diffStyle: 'unified',
                          diffIndicators: 'bars',
                          lineDiffType: 'word',
                          overflow: 'wrap',
                          disableFileHeader: true,
                          unsafeCSS: PIERRE_DIFF_UNSAFE_CSS,
                        }}
                      />
                    ) : (
                      <div className="px-3 py-2 text-xs text-muted-foreground/60">
                        Unable to render diff
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom status indicator */}
              {!isRunning && success !== undefined ? (
                <div className="flex flex-row items-center py-1">
                  {isFailed ? (
                    <XCircle className="h-4 w-4 shrink-0 text-red-500/80" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500/80" />
                  )}
                  <span className="ml-2.5 text-xs text-lg-text-secondary">
                    {isFailed ? 'Failed' : 'Completed'}
                  </span>
                </div>
              ) : (
                <div className="flex flex-row h-1">
                  <div className="w-4 flex justify-center">
                    <div className="w-[2px] rounded-full h-full bg-border/20" />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
