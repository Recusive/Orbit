import { ChevronDown, File, Loader2, Search } from 'lucide-react';
import { useState } from 'react';

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
  onOpenFile,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

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

  return (
    <div>
      <div
        className={cn(
          'rounded-xl bg-card overflow-hidden transition-all duration-200',
          isExpanded
            ? 'shadow-[0_4px_12px_-4px_rgba(0,0,0,0.1),0_2px_6px_-2px_rgba(0,0,0,0.06)]'
            : 'shadow-[0_2px_8px_-2px_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.04)]'
        )}
      >
        {/* Header */}
        <button
          onClick={() => {
            setIsExpanded(!isExpanded);
          }}
          className="w-full flex items-center justify-between px-3.5 py-2.5 bg-transparent hover:bg-muted/40 active:bg-muted/50 transition-colors duration-150"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md flex items-center justify-center bg-primary/10">
              <Search className={cn('h-3.5 w-3.5 text-primary/70', isRunning && 'animate-pulse')} />
            </div>
            <span className="text-[13px] font-medium text-foreground">
              {isRunning ? 'Searching content' : 'Search results'}
            </span>
            {!isRunning && fileCount > 0 ? (
              <span className="text-xs text-muted-foreground/60">
                ({fileCount} {fileCount === 1 ? 'file' : 'files'}
                {isContentMode && matchCount !== fileCount ? `, ${String(matchCount)} matches` : ''}
                )
              </span>
            ) : null}
            {isRunning ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : null}
          </div>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-200',
              isExpanded && 'rotate-180'
            )}
          />
        </button>

        {/* Collapsible content */}
        <div
          className={cn(
            'overflow-hidden transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]',
            isExpanded ? 'opacity-100' : 'max-h-0 opacity-0'
          )}
        >
          {/* Pattern & filters */}
          <div className="px-3.5 py-3 bg-muted/30">
            <div className="text-[10px] font-medium tracking-wide text-muted-foreground/60 lowercase mb-1.5">
              pattern
            </div>
            <code className="block bg-muted/50 rounded-lg px-2.5 py-1.5 font-mono text-xs text-foreground break-all">
              {pattern}
            </code>
            {path ? (
              <>
                <div className="text-[10px] font-medium tracking-wide text-muted-foreground/60 lowercase mb-1.5 mt-2.5">
                  in
                </div>
                <span className="text-xs text-muted-foreground font-mono truncate block">
                  {path}
                </span>
              </>
            ) : null}
            {glob ? (
              <>
                <div className="text-[10px] font-medium tracking-wide text-muted-foreground/60 lowercase mb-1.5 mt-2.5">
                  glob
                </div>
                <code className="text-xs text-muted-foreground font-mono">{glob}</code>
              </>
            ) : null}
            {fileType ? (
              <>
                <div className="text-[10px] font-medium tracking-wide text-muted-foreground/60 lowercase mb-1.5 mt-2.5">
                  type
                </div>
                <span className="text-xs text-muted-foreground font-mono">{fileType}</span>
              </>
            ) : null}
          </div>

          {/* Results */}
          <div className="h-px bg-border/30 mx-3.5" />
          <div className="p-3.5">
            {isRunning ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Searching for matches...</span>
              </div>
            ) : matches.length > 0 ? (
              <div className="relative max-h-[300px] overflow-y-auto overflow-x-hidden">
                {isContentMode
                  ? Object.entries(groupedMatches).map(([filePath, fileMatches], index, arr) => (
                      <div key={filePath} className="relative mb-2">
                        <button
                          type="button"
                          onClick={() => {
                            onOpenFile?.(filePath);
                          }}
                          className="w-full flex items-center gap-2 text-xs py-1 hover:bg-muted/40 rounded-md px-2 -mx-2 transition-colors overflow-hidden cursor-pointer text-left"
                        >
                          {/* Vertical connecting line */}
                          {index < arr.length - 1 ? (
                            <div
                              className="absolute left-[7px] top-[20px] w-px bg-border/50"
                              style={{ height: 'calc(100% - 4px)' }}
                            />
                          ) : null}
                          <div className="relative z-10 w-3.5 h-3.5 flex items-center justify-center shrink-0">
                            <File className="h-3.5 w-3.5 text-muted-foreground/60" />
                          </div>
                          <span className="font-mono text-foreground shrink-0">
                            {getFileName(filePath)}
                          </span>
                          <span
                            className="text-muted-foreground/60 truncate text-right flex-1"
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
                              className="w-full flex items-center gap-2 text-xs py-0.5 hover:bg-muted/40 rounded-md px-1 -mx-1 transition-colors overflow-hidden cursor-pointer text-left"
                            >
                              <span className="text-muted-foreground/60 shrink-0 w-8 text-right font-mono">
                                {match.lineNumber}:
                              </span>
                              <code className="truncate font-mono text-xs rounded bg-muted/50 px-1 text-muted-foreground">
                                {match.content}
                              </code>
                            </button>
                          ))}
                          {fileMatches.length > 10 ? (
                            <div className="text-xs text-muted-foreground/60 italic pl-8">
                              ...and {String(fileMatches.length - 10)} more matches
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))
                  : outputMode === 'count'
                    ? matches.map((match, index) => (
                        <button
                          key={`${match.filePath}-${String(index)}`}
                          type="button"
                          onClick={() => {
                            onOpenFile?.(match.filePath);
                          }}
                          className="relative w-full flex items-center gap-2 text-xs py-1 hover:bg-muted/40 rounded-md px-2 -mx-2 transition-colors overflow-hidden cursor-pointer text-left"
                        >
                          {/* Vertical connecting line */}
                          {index < matches.length - 1 ? (
                            <div
                              className="absolute left-[7px] top-[18px] w-px bg-border/50"
                              style={{ height: 'calc(100% + 4px)' }}
                            />
                          ) : null}
                          <div className="relative z-10 w-3.5 h-3.5 flex items-center justify-center shrink-0">
                            <File className="h-3.5 w-3.5 text-muted-foreground/60" />
                          </div>
                          <span className="font-mono text-foreground shrink-0">
                            {getFileName(match.filePath)}
                          </span>
                          <span className="text-muted-foreground/60 font-mono shrink-0">
                            ({match.count} {match.count === 1 ? 'match' : 'matches'})
                          </span>
                          <span
                            className="text-muted-foreground/60 truncate text-right flex-1"
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
                          className="relative w-full flex items-center gap-2 text-xs py-1 hover:bg-muted/40 rounded-md px-2 -mx-2 transition-colors overflow-hidden cursor-pointer text-left"
                        >
                          {/* Vertical connecting line */}
                          {index < matches.length - 1 ? (
                            <div
                              className="absolute left-[7px] top-[18px] w-px bg-border/50"
                              style={{ height: 'calc(100% + 4px)' }}
                            />
                          ) : null}
                          <div className="relative z-10 w-3.5 h-3.5 flex items-center justify-center shrink-0">
                            <File className="h-3.5 w-3.5 text-muted-foreground/60" />
                          </div>
                          <span className="font-mono text-foreground shrink-0">
                            {getFileName(match.filePath)}
                          </span>
                          <span
                            className="text-muted-foreground/60 truncate text-right flex-1"
                            title={match.filePath}
                          >
                            {match.filePath}
                          </span>
                        </button>
                      ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground/60 italic">No matches found</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
