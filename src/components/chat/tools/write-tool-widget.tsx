import { ChevronDown, FilePlus, Loader2 } from 'lucide-react';
import { useState } from 'react';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface WriteToolWidgetProps {
  readonly filePath: string;
  readonly content: string;
  readonly isRunning?: boolean;
  readonly success?: boolean | undefined;
  readonly onOpenFile?: (path: string) => void;
}

// Diff stat squares component (GitHub style)
interface DiffStatProps {
  readonly additions: number;
  readonly deletions: number;
}

const DiffStat: FC<DiffStatProps> = ({ additions, deletions }) => {
  const total = additions + deletions;
  const maxSquares = 5;

  // Calculate how many squares for each type
  let addSquares = 0;
  let delSquares = 0;
  let neutralSquares = 0;

  if (total > 0) {
    addSquares = Math.round((additions / total) * maxSquares);
    delSquares = Math.round((deletions / total) * maxSquares);
    // Ensure at least 1 square if there are changes
    if (additions > 0 && addSquares === 0) addSquares = 1;
    if (deletions > 0 && delSquares === 0) delSquares = 1;
    // Fill remaining with neutral
    neutralSquares = maxSquares - addSquares - delSquares;
    if (neutralSquares < 0) neutralSquares = 0;
  } else {
    neutralSquares = maxSquares;
  }

  return (
    <div className="flex items-center gap-1.5">
      {additions > 0 ? (
        <span className="text-xs font-semibold text-success">+{additions}</span>
      ) : null}
      {deletions > 0 ? (
        <span className="text-xs font-semibold text-destructive">-{deletions}</span>
      ) : null}
      <div className="flex gap-px">
        {Array.from({ length: addSquares }).map((_, i) => (
          <div key={`add-${String(i)}`} className="w-2 h-2 rounded-sm bg-success" />
        ))}
        {Array.from({ length: delSquares }).map((_, i) => (
          <div key={`del-${String(i)}`} className="w-2 h-2 rounded-sm bg-destructive" />
        ))}
        {Array.from({ length: neutralSquares }).map((_, i) => (
          <div key={`neutral-${String(i)}`} className="w-2 h-2 rounded-sm bg-muted-foreground/30" />
        ))}
      </div>
    </div>
  );
};

export const WriteToolWidget: FC<WriteToolWidgetProps> = ({
  filePath,
  content,
  isRunning = false,
  onOpenFile,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const fileName = filePath.split('/').pop() ?? filePath;
  const lines = content.split('\n');
  const lineCount = lines.length;
  const displayLines = isExpanded ? lines : lines.slice(0, 8);
  const hasMore = lines.length > 8;

  const handleFileClick = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    onOpenFile?.(filePath);
  };

  return (
    <div className="my-2 rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => { setIsExpanded(!isExpanded); }}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/50 transition-colors"
      >
        {/* File icon */}
        <FilePlus className={cn(
          'h-4 w-4 shrink-0',
          isRunning ? 'text-muted-foreground animate-pulse' : 'text-success'
        )} />

        {/* File info */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span
            className="text-sm font-medium text-foreground hover:underline truncate cursor-pointer"
            onClick={handleFileClick}
            title={filePath}
          >
            {fileName}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">(new)</span>
        </div>

        {/* Status - Diff stat or loading */}
        <div className="flex items-center gap-2 shrink-0">
          {isRunning ? (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-xs">Writing...</span>
            </div>
          ) : (
            <DiffStat additions={lineCount} deletions={0} />
          )}
          <ChevronDown className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            isExpanded && 'rotate-180'
          )} />
        </div>
      </button>

      {/* Code preview */}
      <div className={cn(
        'border-t border-border overflow-hidden transition-all',
        isExpanded ? 'max-h-[500px]' : 'max-h-[200px]'
      )}>
        <div className="overflow-auto">
          {displayLines.map((line, index) => (
            <div
              key={index}
              className="flex font-mono text-xs leading-5 bg-success/5"
            >
              {/* Gutter */}
              <div className="w-1 bg-success shrink-0" />
              {/* Line number */}
              <div className="w-10 px-2 text-right text-muted-foreground/50 select-none shrink-0 bg-success/10">
                {index + 1}
              </div>
              {/* Content */}
              <div className="flex-1 px-3 text-foreground whitespace-pre overflow-x-auto">
                {line || ' '}
              </div>
            </div>
          ))}
        </div>

        {/* Expand bar */}
        {hasMore && !isExpanded ? (
          <button
            onClick={() => { setIsExpanded(true); }}
            className="w-full py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors border-t border-border flex items-center justify-center gap-1"
          >
            <ChevronDown className="h-3 w-3" />
            <span>{lines.length - 8} more lines</span>
          </button>
        ) : null}
      </div>
    </div>
  );
};
