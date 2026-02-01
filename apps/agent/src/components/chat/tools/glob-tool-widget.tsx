import { ChevronDown, File, Folder, Loader2, Search } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { TOOL_EXPAND_TRANSITION, TOOL_EXPAND_TRANSITION_NONE } from './shared';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

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
  const shouldReduceMotion = useReducedMotion();

  // Auto-collapse when tool finishes
  useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      setIsExpanded(false);
    }
    wasRunningRef.current = isRunning;
  }, [isRunning]);

  const files = parseGlobOutput(output);
  const fileCount = files.length;

  const statusLabel = isRunning ? 'Searching files' : isFailed ? 'Search failed' : 'Found files';

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
              : 'bg-primary/15 group-hover/status:bg-primary/25'
          )}
        >
          <Search
            className={cn(
              'h-3 w-3 transition-colors duration-150',
              isFailed
                ? 'text-destructive/60 group-hover/status:text-destructive/80'
                : 'text-primary/80 group-hover/status:text-primary',
              isRunning && 'animate-pulse'
            )}
          />
        </div>

        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span
            className={cn(
              'text-xs font-medium truncate',
              isFailed
                ? 'text-muted-foreground line-through'
                : 'text-muted-foreground/90 group-hover/status:text-foreground'
            )}
          >
            {statusLabel}
          </span>
          {!isRunning && !isFailed && fileCount > 0 ? (
            <span className="text-xs text-muted-foreground/70">
              ({fileCount} {fileCount === 1 ? 'file' : 'files'})
            </span>
          ) : null}
          {isRunning ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground shrink-0" />
          ) : null}
        </div>

        <ChevronDown
          className={cn(
            'h-3 w-3 text-muted-foreground/70 transition-transform duration-200 ease-out shrink-0',
            isExpanded && 'rotate-180'
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
                {/* Gutter: vertical connector line */}
                <div className="w-5 flex justify-center shrink-0">
                  <div
                    className={cn('w-px h-full', isFailed ? 'bg-destructive/40' : 'bg-primary/40')}
                  />
                </div>

                {/* Content box */}
                <div className="flex-1 min-w-0 ml-2.5 my-1.5 rounded-lg border-3 border-border/40 bg-card overflow-hidden">
                  {/* Pattern & Path */}
                  <div className="px-3 py-2">
                    <div className="text-[9px] font-medium tracking-wide text-muted-foreground/70 uppercase mb-1.5">
                      pattern
                    </div>
                    <code className="block bg-muted/40 rounded-md px-2 py-1 font-mono text-sm text-foreground">
                      {pattern}
                    </code>
                    {path ? (
                      <>
                        <div className="text-[9px] font-medium tracking-wide text-muted-foreground/70 uppercase mb-1 mt-2">
                          in
                        </div>
                        <span className="text-sm text-muted-foreground/80 font-mono">{path}</span>
                      </>
                    ) : null}
                  </div>

                  {/* Results */}
                  <div className="h-px bg-border/20 mx-3" />
                  <div className="px-3 py-2">
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
                      <div className="text-sm text-muted-foreground/40 italic">No files found</div>
                    )}
                  </div>
                </div>
              </div>

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
