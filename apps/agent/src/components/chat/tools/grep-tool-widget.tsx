import { CheckCircle2, ChevronRight, File, Loader2, Search, XCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';

import { TOOL_EXPAND_TRANSITION, TOOL_EXPAND_TRANSITION_NONE } from './shared';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface GrepToolWidgetProps {
  readonly pattern: string;
  readonly path?: string | undefined;
  readonly outputMode?: string | undefined;
  readonly glob?: string | undefined;
  readonly fileType?: string | undefined;
  readonly output?: string | undefined;
  readonly isRunning?: boolean;
  readonly success?: boolean | undefined;
  readonly onOpenFile?: (path: string, lineNumber?: number) => void;
}

interface GrepMatch {
  filePath: string;
  lineNumber?: number | undefined;
  content?: string | undefined;
  count?: number | undefined;
}

// Check if a line looks like a file path
function isFilePath(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.length > 0 &&
    (trimmed.startsWith('/') || trimmed.includes('/')) &&
    !trimmed.startsWith('#') &&
    !trimmed.includes('matches found') &&
    !trimmed.includes('files searched')
  );
}

// Parse grep output based on output mode
function parseGrepOutput(output: string | undefined, outputMode?: string): GrepMatch[] {
  if (!output) return [];

  const lines = output.split('\n').filter((line) => line.trim().length > 0);

  if (!outputMode || outputMode === 'files_with_matches') {
    return lines.filter(isFilePath).map((filePath) => ({ filePath: filePath.trim() }));
  }

  if (outputMode === 'count') {
    return lines
      .filter((line) => line.includes(':') && isFilePath(line.split(':')[0] ?? ''))
      .map((line) => {
        const lastColon = line.lastIndexOf(':');
        const filePath = line.slice(0, lastColon).trim();
        const count = parseInt(line.slice(lastColon + 1), 10);
        return { filePath, count: isNaN(count) ? 0 : count };
      });
  }

  const matches: GrepMatch[] = [];
  const lineRegex = /^([^:]+):(\d+)[:-](.*)$/;
  for (const line of lines) {
    const match = lineRegex.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined && isFilePath(match[1])) {
      matches.push({
        filePath: match[1].trim(),
        lineNumber: parseInt(match[2], 10),
        content: match[3] ?? '',
      });
    }
  }
  return matches;
}

function getFileName(filePath: string): string {
  const parts = filePath.split('/');
  return parts[parts.length - 1] ?? filePath;
}

export const GrepToolWidget: FC<GrepToolWidgetProps> = ({
  pattern,
  path,
  outputMode,
  glob,
  fileType,
  output,
  isRunning = false,
  success,
  onOpenFile,
}) => {
  // Always start collapsed — user expands manually if they want the full view
  const [isExpanded, setIsExpanded] = useState(false);
  const isFailed = success === false;
  const shouldReduceMotion = useReducedMotion();

  const matches = parseGrepOutput(output, outputMode);
  const matchCount = matches.length;

  const isContentMode = outputMode === 'content';
  const groupedMatches = isContentMode
    ? matches.reduce<Record<string, GrepMatch[]>>((acc, match) => {
        const key = match.filePath;
        acc[key] ??= [];
        acc[key].push(match);
        return acc;
      }, {})
    : {};

  const fileCount = isContentMode ? Object.keys(groupedMatches).length : matchCount;

  const statusLabel = isRunning ? 'Searching content' : 'Grep';

  return (
    <div className={cn('min-w-0', isFailed && 'opacity-60')}>
      {/* Header — flat inline row */}
      <button
        onClick={() => {
          setIsExpanded(!isExpanded);
        }}
        aria-label={isExpanded ? 'Collapse Grep output' : 'Expand Grep output'}
        aria-expanded={isExpanded}
        className={cn(
          'group flex items-center gap-1.5 py-1.5 px-2.5 text-sm',
          'cursor-pointer w-full text-left rounded-xl',
          isFailed && 'border-2 border-dotted border-destructive/40'
        )}
      >
        {/* Left: icon + tool name + count + spinner */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className={cn(
              'w-5 h-5 rounded flex items-center justify-center shrink-0',
              isFailed ? 'bg-destructive/8' : 'bg-foreground/8'
            )}
          >
            <Search
              className={cn(
                'h-3 w-3',
                isFailed ? 'text-destructive/60' : 'text-foreground/60',
                isRunning && 'animate-pulse'
              )}
            />
          </div>

          <span
            className={cn(
              'text-xs font-medium truncate',
              isFailed ? 'text-lg-text-secondary line-through' : 'text-lg-text-secondary'
            )}
          >
            {statusLabel}
          </span>

          {!isRunning && !isFailed && fileCount > 0 ? (
            <span className="text-xs text-muted-foreground">
              ({fileCount} {fileCount === 1 ? 'file' : 'files'}
              {isContentMode && matchCount !== fileCount ? `, ${String(matchCount)} matches` : ''})
            </span>
          ) : null}

          {isRunning ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin text-lg-text-secondary shrink-0" />
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
              <div className="flex flex-row px-2.5">
                {/* Gutter: vertical connector line */}
                <div className="w-5 flex justify-center shrink-0">
                  <div
                    className={cn(
                      'w-[2px] rounded-full h-full',
                      success === undefined && 'bg-foreground/20'
                    )}
                    style={
                      success !== undefined
                        ? {
                            background: success
                              ? 'linear-gradient(to bottom, color-mix(in oklch, var(--color-foreground) 20%, transparent) 70%, color-mix(in oklch, #22c55e 50%, transparent) 100%)'
                              : 'linear-gradient(to bottom, color-mix(in oklch, var(--color-foreground) 20%, transparent) 70%, color-mix(in oklch, #ef4444 50%, transparent) 100%)',
                          }
                        : undefined
                    }
                  />
                </div>

                {/* Content box */}
                <div className="flex-1 min-w-0 ml-2.5 my-1.5 rounded-xl border border-black/10 dark:border-white/5 bg-chat-area dark:bg-[oklch(23%_0_0)] overflow-hidden">
                  {/* Pattern & filters */}
                  <div className="px-3 py-2">
                    <div className="text-[9px] font-medium tracking-wide text-muted-foreground uppercase mb-1.5">
                      pattern
                    </div>
                    <code className="block bg-lg-control rounded-lg px-2 py-1 font-mono text-sm text-foreground break-all">
                      {pattern}
                    </code>
                    {path ? (
                      <>
                        <div className="text-[9px] font-medium tracking-wide text-muted-foreground uppercase mb-1 mt-2">
                          in
                        </div>
                        <span className="text-sm text-lg-text-secondary font-mono truncate block">
                          {path}
                        </span>
                      </>
                    ) : null}
                    {glob ? (
                      <>
                        <div className="text-[9px] font-medium tracking-wide text-muted-foreground uppercase mb-1 mt-2">
                          glob
                        </div>
                        <code className="text-sm text-lg-text-secondary font-mono">{glob}</code>
                      </>
                    ) : null}
                    {fileType ? (
                      <>
                        <div className="text-[9px] font-medium tracking-wide text-muted-foreground uppercase mb-1 mt-2">
                          type
                        </div>
                        <span className="text-sm text-lg-text-secondary font-mono">{fileType}</span>
                      </>
                    ) : null}
                  </div>

                  {/* Results */}
                  <div className="h-px bg-border/20 mx-3" />
                  <div className="px-3 py-2">
                    {isRunning ? (
                      <div className="flex items-center gap-1.5 text-sm text-lg-text-secondary">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        <span>Searching for matches...</span>
                      </div>
                    ) : matches.length > 0 ? (
                      <div className="relative max-h-[200px] overflow-y-auto overflow-x-hidden bg-lg-control rounded-lg p-2">
                        {isContentMode
                          ? Object.entries(groupedMatches).map(
                              ([filePath, fileMatches], index, arr) => (
                                <div key={filePath} className="relative mb-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onOpenFile?.(filePath);
                                    }}
                                    className="w-full flex items-center gap-2 text-xs py-1 hover:bg-lg-control rounded-md px-2 -mx-2 transition-colors overflow-hidden cursor-pointer text-left"
                                  >
                                    {/* Vertical connecting line */}
                                    {index < arr.length - 1 ? (
                                      <div
                                        className="absolute left-[7px] top-[20px] w-px bg-border/50"
                                        style={{ height: 'calc(100% - 4px)' }}
                                      />
                                    ) : null}
                                    <div className="relative z-10 w-3.5 h-3.5 flex items-center justify-center shrink-0">
                                      <File className="h-3.5 w-3.5 text-lg-text-secondary/60" />
                                    </div>
                                    <span className="font-mono text-foreground shrink-0">
                                      {getFileName(filePath)}
                                    </span>
                                    <span
                                      className="text-lg-text-secondary/60 truncate text-right flex-1"
                                      title={filePath}
                                    >
                                      {filePath}
                                    </span>
                                  </button>
                                  <div className="ml-5 mt-1 space-y-0.5">
                                    {fileMatches.slice(0, 10).map((match, idx) => (
                                      <button
                                        key={`${filePath}-${String(match.lineNumber ?? idx)}`}
                                        type="button"
                                        onClick={() => {
                                          onOpenFile?.(filePath, match.lineNumber);
                                        }}
                                        className="w-full flex items-center gap-2 text-xs py-0.5 hover:bg-lg-control rounded-md px-1 -mx-1 transition-colors overflow-hidden cursor-pointer text-left"
                                      >
                                        <span className="text-lg-text-secondary/60 shrink-0 w-8 text-right font-mono">
                                          {match.lineNumber}:
                                        </span>
                                        <code className="truncate font-mono text-xs rounded bg-lg-control px-1 text-lg-text-secondary">
                                          {match.content}
                                        </code>
                                      </button>
                                    ))}
                                    {fileMatches.length > 10 ? (
                                      <div className="text-xs text-lg-text-secondary/60 italic pl-8">
                                        ...and {String(fileMatches.length - 10)} more matches
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              )
                            )
                          : outputMode === 'count'
                            ? matches.map((match, index) => (
                                <button
                                  key={`${match.filePath}-${String(index)}`}
                                  type="button"
                                  onClick={() => {
                                    onOpenFile?.(match.filePath);
                                  }}
                                  className="relative w-full flex items-center gap-2 text-xs py-1 hover:bg-lg-control rounded-md px-2 -mx-2 transition-colors overflow-hidden cursor-pointer text-left"
                                >
                                  {/* Vertical connecting line */}
                                  {index < matches.length - 1 ? (
                                    <div
                                      className="absolute left-[7px] top-[18px] w-px bg-border/50"
                                      style={{ height: 'calc(100% + 4px)' }}
                                    />
                                  ) : null}
                                  <div className="relative z-10 w-3.5 h-3.5 flex items-center justify-center shrink-0">
                                    <File className="h-3.5 w-3.5 text-lg-text-secondary/60" />
                                  </div>
                                  <span className="font-mono text-foreground shrink-0">
                                    {getFileName(match.filePath)}
                                  </span>
                                  <span className="text-lg-text-secondary/60 font-mono shrink-0">
                                    ({match.count} {match.count === 1 ? 'match' : 'matches'})
                                  </span>
                                  <span
                                    className="text-lg-text-secondary/60 truncate text-right flex-1"
                                    title={match.filePath}
                                  >
                                    {match.filePath}
                                  </span>
                                </button>
                              ))
                            : matches.map((match, index) => (
                                <button
                                  key={`${match.filePath}-${String(index)}`}
                                  type="button"
                                  onClick={() => {
                                    onOpenFile?.(match.filePath);
                                  }}
                                  className="relative w-full flex items-center gap-2 text-xs py-1 hover:bg-lg-control rounded-md px-2 -mx-2 transition-colors overflow-hidden cursor-pointer text-left"
                                >
                                  {/* Vertical connecting line */}
                                  {index < matches.length - 1 ? (
                                    <div
                                      className="absolute left-[7px] top-[18px] w-px bg-border/50"
                                      style={{ height: 'calc(100% + 4px)' }}
                                    />
                                  ) : null}
                                  <div className="relative z-10 w-3.5 h-3.5 flex items-center justify-center shrink-0">
                                    <File className="h-3.5 w-3.5 text-lg-text-secondary/60" />
                                  </div>
                                  <span className="font-mono text-foreground shrink-0">
                                    {getFileName(match.filePath)}
                                  </span>
                                  <span
                                    className="text-lg-text-secondary/60 truncate text-right flex-1"
                                    title={match.filePath}
                                  >
                                    {match.filePath}
                                  </span>
                                </button>
                              ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground italic">No matches found</div>
                    )}
                  </div>
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
                  <span className="ml-2.5 text-xs text-lg-text-secondary">
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
