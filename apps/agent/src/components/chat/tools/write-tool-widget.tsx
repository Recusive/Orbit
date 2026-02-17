import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  SquarePlus,
  XCircle,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

import {
  DiffStat,
  TOOL_EXPAND_TRANSITION,
  TOOL_EXPAND_TRANSITION_NONE,
  ToolInlinePreview,
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
  // Always start collapsed — user expands manually if they want the full view
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAllLines, setShowAllLines] = useState(false);
  const isFailed = success === false;
  const shouldReduceMotion = useReducedMotion();
  const isDarkMode = useIsDarkMode();
  const highlightedTokens = useHighlightedTokens(content, filePath, isDarkMode);

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

  // Inline preview: show first line of content
  const firstLine = lines[0] ?? '';
  const previewText = firstLine.length > 60 ? firstLine.slice(0, 60) + '\u2026' : firstLine;

  const handleFileClick = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    onOpenFile?.(filePath);
  };

  return (
    <div className={cn('min-w-0', isFailed && 'opacity-60')}>
      {/* Header — flat inline row, full-width click target */}
      <button
        onClick={() => {
          setIsExpanded(!isExpanded);
        }}
        aria-label={
          isExpanded
            ? `Collapse Write output for ${fileName}`
            : `Expand Write output for ${fileName}`
        }
        aria-expanded={isExpanded}
        className={cn(
          'group flex items-center gap-1.5 py-1.5 px-2.5 text-sm',
          'cursor-pointer w-full text-left rounded-lg',
          isFailed && 'border-2 border-dotted border-destructive/40'
        )}
      >
        {/* Left: icon, filename, badges, spinner, diff */}
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <div
            className={cn(
              'w-5 h-5 rounded flex items-center justify-center shrink-0',
              isFailed ? 'bg-destructive/8' : 'bg-success/8'
            )}
          >
            <SquarePlus
              className={cn(
                'h-3 w-3',
                isFailed ? 'text-destructive/60' : 'text-success/60',
                isRunning && 'animate-pulse'
              )}
            />
          </div>

          <a
            role="link"
            tabIndex={0}
            className={cn(
              'text-xs font-medium truncate cursor-pointer hover:underline',
              isFailed ? 'text-gray-11 line-through' : 'text-gray-12'
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
            className={cn('text-xs shrink-0', isFailed ? 'text-destructive/60' : 'text-gray-9')}
          >
            {isFailed ? '(failed)' : '(new)'}
          </span>

          {isRunning ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin text-gray-11 shrink-0" />
          ) : null}

          {!isRunning && !isFailed ? <DiffStat additions={lineCount} deletions={0} /> : null}
        </div>

        {/* Center: inline preview strip (collapsed only) */}
        {!isExpanded && success === undefined ? (
          <ToolInlinePreview text={previewText} />
        ) : (
          <div className="flex-1" />
        )}

        {/* Right: chevron */}
        <ChevronRight
          className={cn(
            'h-3 w-3 text-gray-9 opacity-0 group-hover:opacity-100 transition-[rotate,opacity] duration-200 ease-out shrink-0',
            isExpanded && 'rotate-90'
          )}
        />
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
                {/* Gutter: single continuous vertical connector line */}
                <div className="w-5 flex justify-center shrink-0">
                  <div
                    className={cn(
                      'w-[2px] rounded-full h-full',
                      success === undefined && 'bg-success/40'
                    )}
                    style={
                      success !== undefined
                        ? {
                            background: success
                              ? 'linear-gradient(to bottom, color-mix(in oklch, var(--color-success) 40%, transparent), color-mix(in oklch, #22c55e 50%, transparent))'
                              : 'linear-gradient(to bottom, color-mix(in oklch, var(--color-success) 40%, transparent), color-mix(in oklch, #ef4444 50%, transparent))',
                          }
                        : undefined
                    }
                  />
                </div>

                {/* Content column — code preview + show-more toggle share one gutter line */}
                <div className="flex-1 min-w-0 ml-2.5 flex flex-col">
                  {/* Code content */}
                  <div className="my-1.5 rounded-lg border-3 border-success/40 bg-card overflow-hidden">
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
                                <div className="w-8 px-1.5 text-right text-gray-9 select-none bg-success/10">
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
                                  <span className="text-gray-12">{line || ' '}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Show all / Show less toggle */}
                  {(hasMore || showAllLines) && lines.length > maxPreviewLines ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowAllLines(!showAllLines);
                      }}
                      className="py-1 text-xs text-gray-9 hover:text-gray-12 transition-colors flex items-center gap-0.5"
                    >
                      <span>
                        {showAllLines
                          ? 'Show less'
                          : `${String(lines.length - maxPreviewLines)} more lines`}
                      </span>
                      <ChevronDown
                        className={cn(
                          'h-2.5 w-2.5 transition-[rotate] duration-200 ease-out',
                          showAllLines && 'rotate-180'
                        )}
                      />
                    </button>
                  ) : null}
                </div>
              </div>

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
                  <span className="ml-2.5 text-xs text-gray-11">
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
