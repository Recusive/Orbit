import { File, Loader2 } from 'lucide-react';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface ReadToolWidgetProps {
  readonly filePath: string;
  readonly isRunning?: boolean;
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
  content,
  onOpenFile,
}) => {
  const fileName = filePath.split('/').pop() ?? filePath;
  const lineCount = parseLineCount(content);

  const handleFileClick = (): void => {
    onOpenFile?.(filePath);
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 py-2 px-2 -mx-2',
        'rounded-xl hover:bg-muted/20',
        'transition-all duration-150 group'
      )}
    >
      {/* Icon container */}
      <div
        className={cn(
          'w-6 h-6 rounded-lg flex items-center justify-center',
          'bg-sky-500/8 group-hover:bg-sky-500/12',
          'transition-colors duration-150'
        )}
      >
        <File
          className={cn(
            'h-3.5 w-3.5 text-sky-500/60 group-hover:text-sky-500/80',
            'transition-colors duration-150',
            isRunning && 'animate-pulse'
          )}
        />
      </div>

      {/* Content */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <span className="text-[11px] text-muted-foreground/50 font-medium">Read</span>
        <button
          className={cn(
            'text-[12px] font-medium text-foreground/90',
            'hover:text-primary/80 transition-colors duration-150 truncate'
          )}
          onClick={handleFileClick}
          title={filePath}
        >
          {fileName}
          {!isRunning && lineCount > 0 ? (
            <span className="text-muted-foreground/40 ml-1 font-mono text-[10px]">
              #L1-{lineCount}
            </span>
          ) : null}
        </button>
      </div>

      {/* Loading spinner */}
      {isRunning ? (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
      ) : null}
    </div>
  );
};
