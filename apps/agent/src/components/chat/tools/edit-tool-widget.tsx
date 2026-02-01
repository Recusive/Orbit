import { CheckCircle2, ChevronDown, Loader2, Pencil, XCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import {
  DiffStat,
  TOOL_EXPAND_TRANSITION,
  TOOL_EXPAND_TRANSITION_NONE,
  useHighlightedTokens,
  useIsDarkMode,
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
  const isDarkMode = useIsDarkMode();
  const oldTokens = useHighlightedTokens(oldString, filePath, isDarkMode);
  const newTokens = useHighlightedTokens(newString, filePath, isDarkMode);

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
    <div className={cn('min-w-0', isFailed && 'opacity-60')}>
      {/* Header — flat inline row */}
      <button
        onClick={() => {
          setIsExpanded(!isExpanded);
        }}
        className={cn(
          'group/status flex items-center gap-2 py-1.5 px-2.5 text-sm',
          'transition-colors duration-150 cursor-pointer w-full text-left',
          'rounded-lg hover:bg-muted/20',
          isFailed && 'border-2 border-dotted border-destructive/40'
        )}
      >
        <div
          className={cn(
            'w-5 h-5 rounded flex items-center justify-center shrink-0',
            'transition-colors duration-150',
            isFailed
              ? 'bg-destructive/8 group-hover/status:bg-destructive/12'
              : 'bg-warning/8 group-hover/status:bg-warning/12'
          )}
        >
          <Pencil
            className={cn(
              'h-3 w-3 transition-colors duration-150',
              isFailed
                ? 'text-destructive/60 group-hover/status:text-destructive/80'
                : 'text-warning/60 group-hover/status:text-warning/80',
              isRunning && 'animate-pulse'
            )}
          />
        </div>

        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span
            className={cn(
              'text-xs font-medium truncate cursor-pointer hover:underline',
              isFailed ? 'text-muted-foreground line-through' : 'text-foreground/90'
            )}
            onClick={handleFileClick}
            title={filePath}
          >
            {fileName}
          </span>
          <span
            className={cn(
              'text-xs shrink-0',
              isFailed ? 'text-destructive/60' : 'text-muted-foreground/70'
            )}
          >
            {isFailed ? '(failed)' : '(modified)'}
          </span>
          {isRunning ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground shrink-0" />
          ) : null}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isRunning && !isFailed ? (
            <DiffStat additions={additions} deletions={deletions} />
          ) : null}
          <ChevronDown
            className={cn(
              'h-3 w-3 text-muted-foreground/70 transition-transform duration-200 ease-out shrink-0',
              isExpanded && 'rotate-180'
            )}
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
              <div className="flex flex-row px-2.5">
                {/* Gutter: vertical connector line */}
                <div className="w-5 flex justify-center shrink-0">
                  <div
                    className={cn(
                      'w-[2px] rounded-full h-full',
                      success === undefined && 'bg-warning/40'
                    )}
                    style={
                      success !== undefined
                        ? {
                            background: success
                              ? 'linear-gradient(to bottom, color-mix(in oklch, var(--color-warning) 40%, transparent) 70%, color-mix(in oklch, #22c55e 50%, transparent) 100%)'
                              : 'linear-gradient(to bottom, color-mix(in oklch, var(--color-warning) 40%, transparent) 70%, color-mix(in oklch, #ef4444 50%, transparent) 100%)',
                          }
                        : undefined
                    }
                  />
                </div>

                {/* Content box — connected red/green sections with colored borders */}
                <div className="flex-1 min-w-0 ml-2.5 my-1.5 flex flex-col">
                  {/* Deleted lines (old) — red border */}
                  {displayOldLines.length > 0 ? (
                    <div
                      className={cn(
                        'border-3 border-destructive/40 bg-card overflow-hidden',
                        displayNewLines.length > 0 ? 'rounded-t-lg border-b-0' : 'rounded-lg'
                      )}
                    >
                      <div className={cn('overflow-auto', !showAllLines && 'max-h-[150px]')}>
                        <div className="w-fit min-w-full">
                          {displayOldLines.map((line, index) => {
                            const tokens = oldTokens?.[index];
                            return (
                              <div
                                key={`old-${String(index)}`}
                                className="flex font-mono text-sm leading-4 bg-destructive/10"
                              >
                                <div className="sticky left-0 flex shrink-0 bg-destructive/10">
                                  <div className="w-5 px-1 text-center text-destructive/70 select-none">
                                    -
                                  </div>
                                </div>
                                <div className="flex-1 px-2 whitespace-pre opacity-70">
                                  {tokens ? (
                                    tokens.map((token, ti) => (
                                      <span
                                        key={ti}
                                        style={token.color ? { color: token.color } : undefined}
                                      >
                                        {token.content}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-foreground">{line || ' '}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Added lines (new) — green border */}
                  {displayNewLines.length > 0 ? (
                    <div
                      className={cn(
                        'border-3 border-success/40 bg-card overflow-hidden',
                        displayOldLines.length > 0 ? 'rounded-b-lg border-t-0' : 'rounded-lg'
                      )}
                    >
                      <div className={cn('overflow-auto', !showAllLines && 'max-h-[150px]')}>
                        <div className="w-fit min-w-full">
                          {displayNewLines.map((line, index) => {
                            const tokens = newTokens?.[index];
                            return (
                              <div
                                key={`new-${String(index)}`}
                                className="flex font-mono text-sm leading-4 bg-success/10"
                              >
                                <div className="sticky left-0 flex shrink-0 bg-success/10">
                                  <div className="w-5 px-1 text-center text-success/70 select-none">
                                    +
                                  </div>
                                </div>
                                <div className="flex-1 px-2 whitespace-pre">
                                  {tokens ? (
                                    tokens.map((token, ti) => (
                                      <span
                                        key={ti}
                                        style={token.color ? { color: token.color } : undefined}
                                      >
                                        {token.content}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-foreground">{line || ' '}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Show all / Show less toggle — detached below the box */}
              {(hasMore || showAllLines) &&
              (oldLines.length > maxPreviewLines || newLines.length > maxPreviewLines) ? (
                <div className="flex flex-row px-2.5">
                  <div className="w-5 flex justify-center shrink-0">
                    <div
                      className={cn(
                        'w-[2px] rounded-full h-full',
                        isFailed ? 'bg-destructive/40' : 'bg-warning/40'
                      )}
                    />
                  </div>
                  <div className="flex-1 ml-2.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowAllLines(!showAllLines);
                      }}
                      className="py-1 text-xs text-muted-foreground/60 hover:text-foreground transition-colors flex items-center gap-0.5"
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
                  </div>
                </div>
              ) : null}

              {/* Bottom status indicator */}
              {!isRunning && success !== undefined ? (
                <div className="flex flex-row items-center px-2.5 py-1">
                  <div
                    className={cn(
                      'w-5 h-5 rounded flex items-center justify-center shrink-0',
                      isFailed ? 'bg-red-500/15' : 'bg-green-500/15'
                    )}
                  >
                    {isFailed ? (
                      <XCircle className="h-3 w-3 text-red-500/80" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3 text-green-500/80" />
                    )}
                  </div>
                  <span className="ml-2.5 text-xs text-muted-foreground/90">
                    {isFailed ? 'Failed' : 'Completed'}
                  </span>
                </div>
              ) : (
                <div className="flex flex-row h-1 px-2.5">
                  <div className="w-5 flex justify-center">
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
