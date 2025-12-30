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
  // Accept absolute paths or relative paths containing /
  // Exclude lines that look like summary/header text
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

  // Default mode is files_with_matches - just file paths
  if (!outputMode || outputMode === 'files_with_matches') {
    return lines.filter(isFilePath).map((filePath) => ({ filePath: filePath.trim() }));
  }

  // Count mode - file:count format
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

  // Content mode - file:line:content format
  const matches: GrepMatch[] = [];
  // Match both absolute and relative paths
  const lineRegex = /^([^:]+):(\d+)[:-](.*)$/;
  for (const line of lines) {
    // Match pattern: /path/to/file:123:content or path/to/file:123-content (for context lines)
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

// Get file name from path
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

  // Group by file for content mode
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
    <div className="my-2 rounded-md border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => {
          setIsExpanded(!isExpanded);
        }}
        className={cn(
          'w-full flex items-center justify-between bg-muted px-3 py-1.5 hover:bg-accent/50 transition-colors',
          isExpanded && 'border-b border-border'
        )}
      >
        <div className="flex items-center gap-2">
          <Search
            className={cn(
              'h-3.5 w-3.5',
              isRunning ? 'text-muted-foreground animate-pulse' : 'text-muted-foreground'
            )}
          />
          <span className="text-sm font-medium text-foreground">
            {isRunning ? 'Searching content' : 'Search results'}
          </span>
          {!isRunning && fileCount > 0 ? (
            <span className="text-xs text-muted-foreground">
              ({fileCount} {fileCount === 1 ? 'file' : 'files'}
              {isContentMode && matchCount !== fileCount ? `, ${String(matchCount)} matches` : ''})
            </span>
          ) : null}
          {isRunning ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : null}
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      {/* Collapsible content */}
      {isExpanded ? (
        <>
          {/* Pattern & filters */}
          <div className="border-b border-border space-y-1.5 px-3 py-2">
            <div className="flex items-start gap-2 text-xs">
              <span className="text-muted-foreground shrink-0">Pattern:</span>
              <code className="flex-1 rounded bg-muted px-1.5 py-0.5 font-mono text-foreground break-all">
                {pattern}
              </code>
            </div>
            {path ? (
              <div className="flex items-start gap-2 text-xs">
                <span className="text-muted-foreground shrink-0">In:</span>
                <span className="text-muted-foreground font-mono truncate">{path}</span>
              </div>
            ) : null}
            {glob ? (
              <div className="flex items-start gap-2 text-xs">
                <span className="text-muted-foreground shrink-0">Glob:</span>
                <code className="text-muted-foreground font-mono">{glob}</code>
              </div>
            ) : null}
            {fileType ? (
              <div className="flex items-start gap-2 text-xs">
                <span className="text-muted-foreground shrink-0">Type:</span>
                <span className="text-muted-foreground font-mono">{fileType}</span>
              </div>
            ) : null}
          </div>

          {/* Results */}
          <div className="p-3">
            {isRunning ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Searching for matches...</span>
              </div>
            ) : matches.length > 0 ? (
              <div className="space-y-0.5 max-h-[300px] overflow-y-auto overflow-x-hidden">
                {isContentMode
                  ? // Content mode: grouped by file with line matches
                    Object.entries(groupedMatches).map(([filePath, fileMatches]) => (
                      <div key={filePath} className="mb-2">
                        <button
                          type="button"
                          onClick={() => {
                            onOpenFile?.(filePath);
                          }}
                          className="w-full flex items-center gap-2 text-xs py-0.5 hover:bg-accent/50 rounded px-1 -mx-1 transition-colors overflow-hidden cursor-pointer text-left"
                        >
                          <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-mono text-foreground shrink-0">
                            {getFileName(filePath)}
                          </span>
                          <span
                            className="text-muted-foreground truncate text-right flex-1"
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
                              className="w-full flex items-center gap-2 text-xs py-0.5 hover:bg-accent/50 rounded px-1 -mx-1 transition-colors overflow-hidden cursor-pointer text-left"
                            >
                              <span className="text-muted-foreground shrink-0 w-8 text-right font-mono">
                                {match.lineNumber}:
                              </span>
                              <code className="truncate font-mono text-xs rounded bg-muted/50 px-1 text-muted-foreground">
                                {match.content}
                              </code>
                            </button>
                          ))}
                          {fileMatches.length > 10 ? (
                            <div className="text-xs text-muted-foreground italic pl-8">
                              ...and {String(fileMatches.length - 10)} more matches
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))
                  : outputMode === 'count'
                    ? // Count mode: file with match count
                      matches.map((match, index) => (
                        <button
                          key={`${match.filePath}-${String(index)}`}
                          type="button"
                          onClick={() => {
                            onOpenFile?.(match.filePath);
                          }}
                          className="w-full flex items-center gap-2 text-xs py-0.5 hover:bg-accent/50 rounded px-1 -mx-1 transition-colors overflow-hidden cursor-pointer text-left"
                        >
                          <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-mono text-foreground shrink-0">
                            {getFileName(match.filePath)}
                          </span>
                          <span className="text-muted-foreground font-mono shrink-0">
                            ({match.count} {match.count === 1 ? 'match' : 'matches'})
                          </span>
                          <span
                            className="text-muted-foreground truncate text-right flex-1"
                            title={match.filePath}
                          >
                            {match.filePath}
                          </span>
                        </button>
                      ))
                    : // files_with_matches mode (default): just file paths
                      matches.map((match, index) => (
                        <button
                          key={`${match.filePath}-${String(index)}`}
                          type="button"
                          onClick={() => {
                            onOpenFile?.(match.filePath);
                          }}
                          className="w-full flex items-center gap-2 text-xs py-0.5 hover:bg-accent/50 rounded px-1 -mx-1 transition-colors overflow-hidden cursor-pointer text-left"
                        >
                          <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-mono text-foreground shrink-0">
                            {getFileName(match.filePath)}
                          </span>
                          <span
                            className="text-muted-foreground truncate text-right flex-1"
                            title={match.filePath}
                          >
                            {match.filePath}
                          </span>
                        </button>
                      ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground italic">No matches found</div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};
