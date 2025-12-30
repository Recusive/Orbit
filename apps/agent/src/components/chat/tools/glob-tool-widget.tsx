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
              {isRunning ? 'Searching files' : 'Found files'}
            </span>
            {!isRunning && fileCount > 0 ? (
              <span className="text-xs text-muted-foreground/60">
                ({fileCount} {fileCount === 1 ? 'file' : 'files'})
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
          {/* Pattern & Path */}
          <div className="px-3.5 py-3 bg-muted/30">
            <div className="text-[10px] font-medium tracking-wide text-muted-foreground/60 lowercase mb-1.5">
              pattern
            </div>
            <code className="block bg-muted/50 rounded-lg px-2.5 py-1.5 font-mono text-xs text-foreground">
              {pattern}
            </code>
            {path ? (
              <>
                <div className="text-[10px] font-medium tracking-wide text-muted-foreground/60 lowercase mb-1.5 mt-2.5">
                  in
                </div>
                <span className="text-xs text-muted-foreground font-mono">{path}</span>
              </>
            ) : null}
          </div>

          {/* Results */}
          <div className="h-px bg-border/30 mx-3.5" />
          <div className="p-3.5">
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
                    className="w-full flex items-center gap-2 text-xs py-1 hover:bg-muted/40 rounded-md px-2 -mx-2 transition-colors overflow-hidden cursor-pointer text-left"
                  >
                    {file.endsWith('/') ? (
                      <Folder className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                    ) : (
                      <File className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                    )}
                    <span className="font-mono text-foreground shrink-0">{getFileName(file)}</span>
                    <span
                      className="text-muted-foreground/60 truncate text-right flex-1"
                      title={file}
                    >
                      {file}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground/60 italic">No files found</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
