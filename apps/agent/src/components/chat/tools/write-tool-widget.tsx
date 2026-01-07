import { ChevronDown, FilePlus, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { FC } from 'react';

import { cn } from '@/lib/utils/utils';

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
    <div className="flex items-center gap-1">
      {additions > 0 ? (
        <span className="text-xs font-semibold text-success">+{additions}</span>
      ) : null}
      {deletions > 0 ? (
        <span className="text-xs font-semibold text-destructive">-{deletions}</span>
      ) : null}
      <div className="flex gap-px">
        {Array.from({ length: addSquares }).map((_, i) => (
          <div key={`add-${String(i)}`} className="w-1.5 h-1.5 rounded-sm bg-success" />
        ))}
        {Array.from({ length: delSquares }).map((_, i) => (
          <div key={`del-${String(i)}`} className="w-1.5 h-1.5 rounded-sm bg-destructive" />
        ))}
        {Array.from({ length: neutralSquares }).map((_, i) => (
          <div
            key={`neutral-${String(i)}`}
            className="w-1.5 h-1.5 rounded-sm bg-muted-foreground/30"
          />
        ))}
      </div>
    </div>
  );
};

export const WriteToolWidget: FC<WriteToolWidgetProps> = ({
  filePath,
  content,
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
          className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/40 transition-colors duration-150"
        >
          {/* Icon container */}
          <div
            className={cn(
              'w-5 h-5 rounded flex items-center justify-center',
              isFailed ? 'bg-destructive/10' : 'bg-success/10'
            )}
          >
            <FilePlus
              className={cn(
                'h-3 w-3',
                isFailed ? 'text-destructive/70' : 'text-success/70',
                isRunning && 'animate-pulse'
              )}
            />
          </div>

          {/* File info */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span
              className={cn(
                'text-xs font-medium hover:underline truncate cursor-pointer',
                isFailed ? 'text-muted-foreground line-through' : 'text-foreground'
              )}
              onClick={handleFileClick}
              title={filePath}
            >
              {fileName}
            </span>
            <span
              className={cn(
                'text-xs shrink-0',
                isFailed ? 'text-destructive/60' : 'text-muted-foreground/60'
              )}
            >
              {isFailed ? '(failed)' : '(new)'}
            </span>
          </div>

          {/* Status - Diff stat or loading or failed */}
          <div className="flex items-center gap-2 shrink-0">
            {isRunning ? (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                <span className="text-sm">Writing...</span>
              </div>
            ) : isFailed ? (
              <span className="text-xs text-destructive/60">Failed</span>
            ) : (
              <DiffStat additions={lineCount} deletions={0} />
            )}
            <ChevronDown
              className={cn(
                'h-3 w-3 text-muted-foreground/60 transition-transform duration-200',
                isExpanded && 'rotate-180'
              )}
            />
          </div>
        </button>

        {/* Code preview */}
        <div
          className={cn(
            'grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
            isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          )}
        >
          <div className="overflow-hidden min-h-0">
            <div className="overflow-auto max-h-[300px]">
              {displayLines.map((line, index) => (
                <div key={index} className="flex font-mono text-sm leading-4 bg-success/5">
                  {/* Gutter */}
                  <div className="w-0.5 bg-success shrink-0" />
                  {/* Line number */}
                  <div className="w-8 px-1.5 text-right text-muted-foreground/50 select-none shrink-0 bg-success/10">
                    {index + 1}
                  </div>
                  {/* Content */}
                  <div className="flex-1 px-2 text-foreground whitespace-pre overflow-x-auto">
                    {line || ' '}
                  </div>
                </div>
              ))}
            </div>

            {/* Expand bar */}
            {hasMore && !isExpanded ? (
              <button
                onClick={() => {
                  setIsExpanded(true);
                }}
                className="w-full py-1 text-xs text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors flex items-center justify-center gap-0.5"
              >
                <ChevronDown className="h-2.5 w-2.5" />
                <span>{lines.length - 8} more lines</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
