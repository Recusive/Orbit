import { File, Loader2 } from 'lucide-react';

import type { FC } from 'react';

import { cn } from '@/lib/utils/utils';

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
    <div
      className={cn(
        'flex items-center gap-2 py-2 px-2 -mx-2',
        'rounded-xl hover:bg-muted/20',
        'transition-all duration-150 group',
        isFailed && 'border-2 border-dashed border-destructive/40 opacity-60 mx-0'
      )}
    >
      {/* Icon container */}
      <div
        className={cn(
          'w-6 h-6 rounded-lg flex items-center justify-center',
          'transition-colors duration-150',
          isFailed
            ? 'bg-destructive/8 group-hover:bg-destructive/12'
            : 'bg-sky-500/8 group-hover:bg-sky-500/12'
        )}
      >
        <File
          className={cn(
            'h-3.5 w-3.5',
            'transition-colors duration-150',
            isFailed
              ? 'text-destructive/60 group-hover:text-destructive/80'
              : 'text-sky-500/60 group-hover:text-sky-500/80',
            isRunning && 'animate-pulse'
          )}
        />
      </div>

      {/* Content */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <span className="text-[11px] text-muted-foreground/50 font-medium">Read</span>
        <button
          className={cn(
            'text-[12px] font-medium',
            'hover:text-primary/80 transition-colors duration-150 truncate',
            isFailed ? 'text-muted-foreground line-through' : 'text-foreground/90'
          )}
          onClick={handleFileClick}
          title={filePath}
        >
          {fileName}
          {!isRunning && !isFailed && lineCount > 0 ? (
            <span className="text-muted-foreground/40 ml-1 font-mono text-[10px]">
              #L1-{lineCount}
            </span>
          ) : null}
        </button>
        {isFailed ? <span className="text-[10px] text-destructive/60">Failed</span> : null}
      </div>

      {/* Loading spinner */}
      {isRunning ? (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
      ) : null}
    </div>
  );
};
