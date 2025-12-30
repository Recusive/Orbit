import { ChevronDown, File, Folder, Loader2, Search } from 'lucide-react';
import { useState } from 'react';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface GlobToolWidgetProps {
  readonly pattern: string;
  readonly path?: string | undefined;
  readonly output?: string | undefined;
  readonly isRunning?: boolean;
  readonly onOpenFile?: (path: string) => void;
}

// Parse glob output to extract file paths
function parseGlobOutput(output: string | undefined): string[] {
  if (!output) return [];
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.startsWith('/'));
}

// Get file name from path
function getFileName(filePath: string): string {
  const parts = filePath.split('/');
  return parts[parts.length - 1] ?? filePath;
}

export const GlobToolWidget: FC<GlobToolWidgetProps> = ({
  pattern,
  path,
  output,
  isRunning = false,
  onOpenFile,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const files = parseGlobOutput(output);
  const fileCount = files.length;

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
            {isRunning ? 'Searching files' : 'Found files'}
          </span>
          {!isRunning && fileCount > 0 ? (
            <span className="text-xs text-muted-foreground">
              ({fileCount} {fileCount === 1 ? 'file' : 'files'})
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
          {/* Pattern & Path */}
          <div className="border-b border-border space-y-1.5 px-3 py-2">
            <div className="flex items-start gap-2 text-xs">
              <span className="text-muted-foreground shrink-0">Pattern:</span>
              <code className="flex-1 rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                {pattern}
              </code>
            </div>
            {path ? (
              <div className="flex items-start gap-2 text-xs">
                <span className="text-muted-foreground shrink-0">In:</span>
                <span className="text-muted-foreground font-mono">{path}</span>
              </div>
            ) : null}
          </div>

          {/* Results */}
          <div className="p-3">
            {isRunning ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Searching for files...</span>
              </div>
            ) : files.length > 0 ? (
              <div className="space-y-0.5 max-h-[300px] overflow-y-auto overflow-x-hidden">
                {files.map((file, index) => (
                  <button
                    key={`${file}-${String(index)}`}
                    type="button"
                    onClick={() => {
                      onOpenFile?.(file);
                    }}
                    className="w-full flex items-center gap-2 text-xs py-0.5 hover:bg-accent/50 rounded px-1 -mx-1 transition-colors overflow-hidden cursor-pointer text-left"
                  >
                    {file.endsWith('/') ? (
                      <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="font-mono text-foreground shrink-0">{getFileName(file)}</span>
                    <span className="text-muted-foreground truncate text-right flex-1" title={file}>
                      {file}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground italic">No files found</div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};
