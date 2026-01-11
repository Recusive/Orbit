import { ChevronDown, File, Folder, Loader2, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import type { FC } from 'react';

import { cn } from '@/lib/utils/utils';

interface GlobToolWidgetProps {
  readonly pattern: string;
  readonly path?: string | undefined;
  readonly output?: string | undefined;
  readonly isRunning?: boolean;
  readonly success?: boolean | undefined;
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
  success,
  onOpenFile,
}) => {
  const [isExpanded, setIsExpanded] = useState(isRunning);
  const wasRunningRef = useRef(isRunning);
  const isFailed = success === false;

  // Auto-collapse when tool finishes
  useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      setIsExpanded(false);
    }
    wasRunningRef.current = isRunning;
  }, [isRunning]);

  const files = parseGlobOutput(output);
  const fileCount = files.length;

  return (
    <div>
      <div
        className={cn(
          'bg-card overflow-hidden transition-all duration-200',
          isFailed
            ? 'border-2 border-dashed border-destructive/40 opacity-60'
            : 'border border-border/50',
          isExpanded ? 'rounded-lg shadow-xl' : 'rounded-lg shadow-md'
        )}
      >
        {/* Header */}
        <button
          onClick={() => {
            setIsExpanded(!isExpanded);
          }}
          className="w-full flex items-center justify-between px-2.5 py-1.5 bg-transparent hover:bg-muted/40 active:bg-muted/50 transition-colors duration-150"
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'w-5 h-5 rounded flex items-center justify-center',
                isFailed ? 'bg-destructive/10' : 'bg-primary/10'
              )}
            >
              <Search
                className={cn(
                  'h-3 w-3',
                  isFailed ? 'text-destructive/70' : 'text-primary/70',
                  isRunning && 'animate-pulse'
                )}
              />
            </div>
            <span
              className={cn(
                'text-xs font-medium',
                isFailed ? 'text-muted-foreground line-through' : 'text-foreground'
              )}
            >
              {isRunning ? 'Searching files' : isFailed ? 'Search failed' : 'Found files'}
            </span>
            {!isRunning && !isFailed && fileCount > 0 ? (
              <span className="text-sm text-muted-foreground/60">
                ({fileCount} {fileCount === 1 ? 'file' : 'files'})
              </span>
            ) : null}
            {isRunning ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
            ) : isFailed ? (
              <span className="text-xs text-destructive/60">Failed</span>
            ) : null}
          </div>
          <ChevronDown
            className={cn(
              'h-3 w-3 text-muted-foreground/60 transition-transform duration-200',
              isExpanded && 'rotate-180'
            )}
          />
        </button>

        {/* Collapsible content */}
        <AnimatePresence initial={false} mode="wait">
          {isExpanded ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                height: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
                opacity: { duration: 0.15, ease: 'easeOut' },
              }}
              style={{ overflow: 'hidden' }}
            >
              {/* Pattern & Path */}
              <div className="px-2.5 py-2 bg-muted/30">
                <div className="text-[9px] font-medium tracking-wide text-muted-foreground/60 lowercase mb-1">
                  pattern
                </div>
                <code className="block bg-muted/50 rounded-md px-2 py-1 font-mono text-sm text-foreground">
                  {pattern}
                </code>
                {path ? (
                  <>
                    <div className="text-[9px] font-medium tracking-wide text-muted-foreground/60 lowercase mb-1 mt-2">
                      in
                    </div>
                    <span className="text-sm text-muted-foreground font-mono">{path}</span>
                  </>
                ) : null}
              </div>

              {/* Results */}
              <div className="h-px bg-border/30 mx-2.5" />
              <div className="p-2.5">
                {isRunning ? (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    <span>Searching for files...</span>
                  </div>
                ) : files.length > 0 ? (
                  <div className="space-y-0.5 max-h-[200px] overflow-y-auto overflow-x-hidden">
                    {files.map((file, index) => (
                      <button
                        key={`${file}-${String(index)}`}
                        type="button"
                        onClick={() => {
                          onOpenFile?.(file);
                        }}
                        className="w-full flex items-center gap-1.5 text-sm py-0.5 hover:bg-muted/40 rounded px-1.5 -mx-1.5 transition-colors overflow-hidden cursor-pointer text-left"
                      >
                        {file.endsWith('/') ? (
                          <Folder className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                        ) : (
                          <File className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                        )}
                        <span className="font-mono text-foreground shrink-0">
                          {getFileName(file)}
                        </span>
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
                  <div className="text-sm text-muted-foreground/60 italic">No files found</div>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
};
