import { ArrowUpRight, Loader2, XCircle } from 'lucide-react';

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
        'group w-full flex items-center gap-2 py-1.5 text-left',
        'cursor-pointer rounded-xl',
        isFailed && 'opacity-60'
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base font-medium text-foreground">
          {isRunning ? 'Reading' : 'Read'}
        </span>
        <span
          className={cn(
            'text-base font-medium truncate',
            isFailed ? 'text-lg-text-secondary' : 'text-git-untracked'
          )}
        >
          {fileName}
          {!isRunning && !isFailed && lineCount > 0 ? (
            <span className="text-lg-text-secondary ml-1 font-mono text-xs">#L1-{lineCount}</span>
          ) : null}
        </span>
        {isFailed ? <XCircle className="h-3 w-3 text-destructive/60 shrink-0" /> : null}

        {isRunning ? (
          <Loader2 className="h-2.5 w-2.5 animate-spin text-lg-text-secondary shrink-0" />
        ) : (
          <ArrowUpRight className="h-3 w-3 text-muted-foreground opacity-0 translate-y-0.5 -translate-x-0.5 group-hover:opacity-100 group-hover:translate-y-0 group-hover:translate-x-0 transition-[opacity,translate] duration-200 ease-out shrink-0" />
        )}
      </div>
    </button>
  );
};
