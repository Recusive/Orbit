import { ChevronRight, File, Folder, Loader2, Search } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';

import { TOOL_EXPAND_ENTER, TOOL_EXPAND_EXIT, TOOL_EXPAND_TRANSITION_NONE } from './shared';

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
  // Always start collapsed — user expands manually if they want the full view
  const [isExpanded, setIsExpanded] = useState(false);
  const isFailed = success === false;
  const shouldReduceMotion = useReducedMotion();

  const files = parseGlobOutput(output);
  const fileCount = files.length;

  const statusLabel = isRunning ? 'Searching files' : 'Glob';

  return (
    <div className={cn('min-w-0', isFailed && 'opacity-60')}>
      {/* Header — flat inline row */}
      <button
        onClick={() => {
          setIsExpanded(!isExpanded);
        }}
        aria-label={isExpanded ? 'Collapse Glob output' : 'Expand Glob output'}
        aria-expanded={isExpanded}
        className={cn(
          'group flex items-center gap-1.5 py-1.5 text-sm',
          'cursor-pointer w-full text-left rounded-xl',
          isFailed && 'border-2 border-dotted border-destructive/40'
        )}
      >
        {/* Left: icon + tool name + count + spinner */}
        <div className="flex items-center gap-2 shrink-0">
          <Search
            className={cn(
              'h-4 w-4 shrink-0',
              isFailed ? 'text-destructive/60' : 'text-foreground',
              isRunning && 'animate-pulse'
            )}
          />

          <span
            className={cn(
              'text-sm font-medium truncate',
              isFailed ? 'text-lg-text-secondary line-through' : 'text-lg-text-secondary'
            )}
          >
            {statusLabel}
          </span>

          {!isRunning && !isFailed && fileCount > 0 ? (
            <span className="text-sm text-muted-foreground">
              ({fileCount} {fileCount === 1 ? 'file' : 'files'})
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
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : { height: 0, opacity: 0, transition: TOOL_EXPAND_EXIT }
            }
            transition={shouldReduceMotion ? TOOL_EXPAND_TRANSITION_NONE : TOOL_EXPAND_ENTER}
            style={{ overflow: 'hidden' }}
          >
            {/* Content box */}
            <div className="min-w-0 my-1.5 rounded-xl border border-black/10 dark:border-white/5 bg-chat-area dark:bg-[oklch(23%_0_0)] overflow-hidden">
              {/* Pattern & Path */}
              <div className="px-3 py-2">
                <div className="text-[9px] font-medium tracking-wide text-muted-foreground uppercase mb-1.5">
                  pattern
                </div>
                <code className="block bg-lg-control rounded-lg px-2 py-1 font-mono text-sm text-foreground">
                  {pattern}
                </code>
                {path ? (
                  <>
                    <div className="text-[9px] font-medium tracking-wide text-muted-foreground uppercase mb-1 mt-2">
                      in
                    </div>
                    <span className="text-sm text-lg-text-secondary font-mono">{path}</span>
                  </>
                ) : null}
              </div>

              {/* Results */}
              <div className="h-px bg-border/20 mx-3" />
              <div className="px-3 py-2">
                {isRunning ? (
                  <div className="flex items-center gap-1.5 text-sm text-lg-text-secondary">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    <span>Searching for files...</span>
                  </div>
                ) : files.length > 0 ? (
                  <div className="space-y-0.5 max-h-[200px] overflow-y-auto overflow-x-hidden bg-lg-control rounded-lg p-2">
                    {files.map((file, index) => (
                      <button
                        key={`${file}-${String(index)}`}
                        type="button"
                        onClick={() => {
                          onOpenFile?.(file);
                        }}
                        className="w-full flex items-center gap-1.5 text-sm py-0.5 hover:bg-lg-control rounded px-1.5 -mx-1.5 transition-colors overflow-hidden cursor-pointer text-left"
                      >
                        {file.endsWith('/') ? (
                          <Folder className="h-3 w-3 text-muted-foreground shrink-0" />
                        ) : (
                          <File className="h-3 w-3 text-muted-foreground shrink-0" />
                        )}
                        <span className="font-mono text-foreground shrink-0">
                          {getFileName(file)}
                        </span>
                        <span
                          className="text-muted-foreground truncate text-right flex-1"
                          title={file}
                        >
                          {file}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic">No files found</div>
                )}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
