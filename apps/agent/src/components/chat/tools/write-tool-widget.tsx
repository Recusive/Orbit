import { ChevronDown, Loader2, SquarePlus } from 'lucide-react';
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

interface WriteToolWidgetProps {
  readonly filePath: string;
  readonly content: string;
  readonly isRunning?: boolean;
  readonly success?: boolean | undefined;
  readonly onOpenFile?: (path: string) => void;
}

export const WriteToolWidget: FC<WriteToolWidgetProps> = ({
  filePath,
  content,
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
  const highlightedTokens = useHighlightedTokens(content, filePath, isDarkMode);

  // Auto-collapse when tool finishes
  useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      setIsExpanded(false);
    }
    wasRunningRef.current = isRunning;
  }, [isRunning]);

  // Reset showAllLines when collapsed to avoid stale state on re-expand
  useEffect(() => {
    if (!isExpanded) {
      setShowAllLines(false);
    }
  }, [isExpanded]);

  const fileName = filePath.split('/').pop() ?? filePath;
  const lines = content.split('\n');
  const lineCount = lines.length;
  const maxPreviewLines = 8;
  const displayLines = showAllLines ? lines : lines.slice(0, maxPreviewLines);
  const hasMore = !showAllLines && lines.length > maxPreviewLines;

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
              : 'bg-success/8 group-hover/status:bg-success/12'
          )}
        >
          <SquarePlus
            className={cn(
              'h-3 w-3 transition-colors duration-150',
              isFailed
                ? 'text-destructive/60 group-hover/status:text-destructive/80'
                : 'text-success/60 group-hover/status:text-success/80',
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
            {isFailed ? '(failed)' : '(new)'}
          </span>
          {isRunning ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground shrink-0" />
          ) : null}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isRunning && !isFailed ? <DiffStat additions={lineCount} deletions={0} /> : null}
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
                    className={cn('w-px h-full', isFailed ? 'bg-destructive/40' : 'bg-success/40')}
                  />
                </div>

                {/* Content box */}
                <div className="flex-1 min-w-0 ml-2.5 my-1.5 rounded-lg border-3 border-success/40 bg-card overflow-hidden">
                  <div
                    className={cn('overflow-auto bg-success/5', !showAllLines && 'max-h-[300px]')}
                  >
                    <div className="w-fit min-w-full">
                      {displayLines.map((line, index) => {
                        // When showAllLines is off, index maps directly to display slice
                        // When showAllLines is on, index maps 1:1 to the full lines array
                        const lineIndex = showAllLines ? index : index;
                        const tokens = highlightedTokens?.[lineIndex];

                        return (
                          <div key={index} className="flex font-mono text-sm leading-4">
                            {/* Sticky gutter + line number */}
                            <div className="sticky left-0 flex shrink-0 bg-success/5">
                              <div className="w-8 px-1.5 text-right text-muted-foreground/70 select-none bg-success/10">
                                {index + 1}
                              </div>
                            </div>
                            {/* Content — syntax highlighted when available */}
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
              </div>

              {/* Show all / Show less toggle — detached below the box */}
              {(hasMore || showAllLines) && lines.length > maxPreviewLines ? (
                <div className="flex flex-row px-2.5">
                  <div className="w-5 flex justify-center shrink-0">
                    <div
                      className={cn(
                        'w-px h-full',
                        isFailed ? 'bg-destructive/40' : 'bg-success/40'
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
                          : `${String(lines.length - maxPreviewLines)} more lines`}
                      </span>
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Bottom connector stub */}
              <div className="flex flex-row h-1 px-2.5">
                <div className="w-5 flex justify-center">
                  <div className="w-px h-full bg-border/20" />
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
