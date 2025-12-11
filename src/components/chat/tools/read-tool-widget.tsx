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
  content,
  onOpenFile,
}) => {
  const fileName = filePath.split('/').pop() ?? filePath;
  const lineCount = parseLineCount(content);

  const handleFileClick = (): void => {
    onOpenFile?.(filePath);
  };

  return (
    <div className="group flex w-full min-w-0 items-center justify-between py-2">
      <div className="flex min-w-0 flex-1 items-center gap-x-1 text-sm">
        {/* Icon */}
        <div className="-ml-1 w-6 flex items-center justify-center">
          <div className="relative flex h-4 w-4 flex-none items-center justify-center rounded-sm">
            <File className="h-3.5 w-3.5 flex-none opacity-50" />
          </div>
        </div>

        {/* Content */}
        <div className="truncate">
          <div className="flex flex-row items-center gap-1 overflow-hidden whitespace-nowrap">
            <span className="shrink-0 text-muted-foreground">Read</span>
            <div className="flex items-center overflow-hidden">
              <span
                className="inline-flex items-center gap-0.5 rounded-md align-middle text-sm font-medium transition-[opacity,background-color] cursor-pointer hover:bg-accent select-text px-1"
                onClick={handleFileClick}
                title={filePath}
              >
                <span className="inline-flex break-all">
                  <span>{fileName}</span>
                  {!isRunning && lineCount > 0 ? (
                    <span className="opacity-50">#L1-{lineCount}</span>
                  ) : null}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Loading spinner */}
        <div className={cn(
          'ml-0.5 flex items-center text-sm',
          isRunning ? 'visible opacity-100' : 'invisible opacity-0'
        )}>
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        </div>
      </div>
    </div>
  );
};
