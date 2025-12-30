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
    <div>
      <div className="flex items-center gap-2 py-1.5 px-1 -mx-1 rounded-lg hover:bg-muted/30 transition-colors">
        {/* Icon container */}
        <div className="w-5 h-5 rounded flex items-center justify-center bg-info/10">
          <File className={cn('h-3 w-3 text-info/70', isRunning && 'animate-pulse')} />
        </div>

        {/* Content */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-xs text-muted-foreground">Read</span>
          <button
            className="text-xs font-medium text-foreground hover:text-primary transition-colors truncate"
            onClick={handleFileClick}
            title={filePath}
          >
            {fileName}
            {!isRunning && lineCount > 0 ? (
              <span className="text-muted-foreground/60 ml-0.5">#L1-{lineCount}</span>
            ) : null}
          </button>
        </div>

        {/* Loading spinner */}
        {isRunning ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
        ) : null}
      </div>
    </div>
  );
};
