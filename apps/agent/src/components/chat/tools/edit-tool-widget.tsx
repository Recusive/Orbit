import { ChevronDown, FilePen, Loader2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import {
  DiffStat,
  TOOL_CARD_BASE,
  TOOL_CHEVRON_BASE,
  TOOL_EXPAND_TRANSITION,
  TOOL_EXPAND_TRANSITION_NONE,
  TOOL_HEADER_BASE,
} from './shared';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

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
  const [isExpanded, setIsExpanded] = useState(isRunning);
  const [showAllLines, setShowAllLines] = useState(false);
  const wasRunningRef = useRef(isRunning);
  const isFailed = success === false;
  const shouldReduceMotion = useReducedMotion();

  // Auto-collapse when tool finishes
  useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      setIsExpanded(false);
    }
    wasRunningRef.current = isRunning;
  }, [isRunning]);

  const fileName = filePath.split('/').pop() ?? filePath;
  const oldLines = oldString.split('\n');
  const newLines = newString.split('\n');
  const deletions = oldLines.length;
  const additions = newLines.length;

  // For preview view, show first few lines of each
  const maxPreviewLines = 4;
  const displayOldLines = showAllLines ? oldLines : oldLines.slice(0, maxPreviewLines);
  const displayNewLines = showAllLines ? newLines : newLines.slice(0, maxPreviewLines);
  const hasMore =
    !showAllLines && (oldLines.length > maxPreviewLines || newLines.length > maxPreviewLines);

  const handleFileClick = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    onOpenFile?.(filePath);
  };

  return (
    <div>
      <div
        className={cn(
          TOOL_CARD_BASE,
          isFailed
            ? 'border-2 border-dotted border-destructive/40 opacity-60'
            : 'border border-border/50',
          isExpanded ? 'rounded-lg shadow-xl' : 'rounded-lg shadow-md'
        )}
      >
        {/* Header */}
        <button
          onClick={() => {
            setIsExpanded(!isExpanded);
          }}
          className={TOOL_HEADER_BASE}
        >
          {/* Icon container */}
          <div
            className={cn(
              'w-5 h-5 rounded flex items-center justify-center',
              isFailed ? 'bg-destructive/10' : 'bg-warning/10'
            )}
          >
            <FilePen
              className={cn(
                'h-3 w-3',
                isFailed ? 'text-destructive/70' : 'text-warning/70',
                isRunning && 'animate-pulse'
              )}
            />
          </div>

          {/* File info */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span
              className={cn(
                'text-xs font-medium hover:underline truncate cursor-pointer',
                isFailed ? 'text-muted-foreground line-through' : 'text-foreground'
              )}
              onClick={handleFileClick}
              title={filePath}
            >
              {fileName}
            </span>
            <span
              className={cn(
                'text-xs shrink-0',
                isFailed ? 'text-destructive/60' : 'text-muted-foreground/60'
              )}
            >
              {isFailed ? '(failed)' : '(modified)'}
            </span>
          </div>

          {/* Status - Diff stat or loading or failed */}
          <div className="flex items-center gap-2 shrink-0">
            {isRunning ? (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                <span className="text-sm">Editing...</span>
              </div>
            ) : isFailed ? (
              <span className="text-xs text-destructive/60">Failed</span>
            ) : (
              <DiffStat additions={additions} deletions={deletions} />
            )}
            <ChevronDown className={cn(TOOL_CHEVRON_BASE, isExpanded && 'rotate-180')} />
          </div>
        </button>

        {/* Diff preview */}
        <AnimatePresence initial={false} mode="wait">
          {isExpanded ? (
            <motion.div
              initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={shouldReduceMotion ? TOOL_EXPAND_TRANSITION_NONE : TOOL_EXPAND_TRANSITION}
              style={{ overflow: 'hidden' }}
            >
              <div className={cn('overflow-auto', !showAllLines && 'max-h-[300px]')}>
                <div className="w-fit min-w-full">
                  {/* Deleted lines (old) */}
                  {displayOldLines.map((line, index) => (
                    <div
                      key={`old-${String(index)}`}
                      className="flex font-mono text-sm leading-4 bg-destructive/10"
                    >
                      {/* Sticky gutter + indicator */}
                      <div className="sticky left-0 flex shrink-0 bg-destructive/10">
                        <div className="w-0.5 bg-destructive" />
                        <div className="w-5 px-1 text-center text-destructive/70 select-none">
                          -
                        </div>
                      </div>
                      {/* Content */}
                      <div className="flex-1 px-2 text-foreground/70 whitespace-pre">
                        {line || ' '}
                      </div>
                    </div>
                  ))}

                  {/* Separator */}
                  {displayOldLines.length > 0 && displayNewLines.length > 0 ? (
                    <div className="h-px bg-border/50" />
                  ) : null}

                  {/* Added lines (new) */}
                  {displayNewLines.map((line, index) => (
                    <div
                      key={`new-${String(index)}`}
                      className="flex font-mono text-sm leading-4 bg-success/10"
                    >
                      {/* Sticky gutter + indicator */}
                      <div className="sticky left-0 flex shrink-0 bg-success/10">
                        <div className="w-0.5 bg-success" />
                        <div className="w-5 px-1 text-center text-success/70 select-none">+</div>
                      </div>
                      {/* Content */}
                      <div className="flex-1 px-2 text-foreground whitespace-pre">
                        {line || ' '}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Show all / Show less toggle button */}
              {(hasMore || showAllLines) &&
              (oldLines.length > maxPreviewLines || newLines.length > maxPreviewLines) ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAllLines(!showAllLines);
                  }}
                  className="w-full py-1 text-xs text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors flex items-center justify-center gap-0.5"
                >
                  <ChevronDown
                    className={cn(
                      'h-2.5 w-2.5 transition-transform duration-200 ease-out',
                      showAllLines && 'rotate-180'
                    )}
                  />
                  <span>
                    {showAllLines
                      ? 'Show less'
                      : `Show all changes (${String(oldLines.length + newLines.length)} lines)`}
                  </span>
                </button>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
};
