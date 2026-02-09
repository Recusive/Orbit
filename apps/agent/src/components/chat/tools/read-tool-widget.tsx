import { File, Loader2 } from 'lucide-react';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface ReadToolWidgetProps {
  readonly filePath: string;
  readonly isRunning?: boolean;
  readonly success?: boolean | undefined;
  readonly content?: string | undefined;
  readonly onOpenFile?: (path: string) => void;
}

// Parse line count from tool output like "Read 278 lines" or count actual lines
const parseLineCount = (content: string | undefined): number => {
  if (!content) return 0;

  // Check if content is in "Read N lines" format
  const match = /^Read (\d+) lines?$/i.exec(content);
  if (match?.[1]) {
    return parseInt(match[1], 10);
  }

  // Otherwise count actual lines
  return content.split('\n').length;
};

export const ReadToolWidget: FC<ReadToolWidgetProps> = ({
  filePath,
  isRunning = false,
  success,
  content,
  onOpenFile,
}) => {
  const fileName = filePath.split('/').pop() ?? filePath;
  const lineCount = parseLineCount(content);
  const isFailed = success === false;

  const handleFileClick = (): void => {
    onOpenFile?.(filePath);
  };

  return (
    <button
      onClick={handleFileClick}
      title={filePath}
      className={cn(
        'w-full flex items-center gap-2 py-1.5 px-2.5 text-left',
        'cursor-pointer rounded-lg',
        isFailed && 'border-2 border-dotted border-destructive/40 opacity-60'
      )}
    >
      {/* Icon container */}
      <div
        className={cn(
          'w-5 h-5 rounded flex items-center justify-center shrink-0',
          isFailed ? 'bg-destructive/8' : 'bg-sky-500/8'
        )}
      >
        <File
          className={cn(
            'h-3 w-3',
            isFailed ? 'text-destructive/60' : 'text-sky-500/60',
            isRunning && 'animate-pulse'
          )}
        />
      </div>

      {/* Content */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <span className="text-xs text-muted-foreground/70 font-medium">Read</span>
        <span
          className={cn(
            'text-xs font-medium truncate',
            isFailed ? 'text-muted-foreground line-through' : 'text-foreground/90'
          )}
        >
          {fileName}
          {!isRunning && !isFailed && lineCount > 0 ? (
            <span className="text-muted-foreground/40 ml-1 font-mono text-xs">#L1-{lineCount}</span>
          ) : null}
        </span>
        {isFailed ? <span className="text-xs text-destructive/60">Failed</span> : null}
      </div>

      {/* Loading spinner */}
      {isRunning ? (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
      ) : null}
    </button>
  );
};
