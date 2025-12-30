import { ChevronDown, FilePen, Loader2 } from 'lucide-react';
import { useState } from 'react';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface EditToolWidgetProps {
  readonly filePath: string;
  readonly oldString: string;
  readonly newString: string;
  readonly isRunning?: boolean;
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

  let addSquares = 0;
  let delSquares = 0;
  let neutralSquares = 0;

  if (total > 0) {
    addSquares = Math.round((additions / total) * maxSquares);
    delSquares = Math.round((deletions / total) * maxSquares);
    if (additions > 0 && addSquares === 0) addSquares = 1;
    if (deletions > 0 && delSquares === 0) delSquares = 1;
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

export const EditToolWidget: FC<EditToolWidgetProps> = ({
  filePath,
  oldString,
  newString,
  isRunning = false,
  onOpenFile,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const fileName = filePath.split('/').pop() ?? filePath;
  const oldLines = oldString.split('\n');
  const newLines = newString.split('\n');
  const deletions = oldLines.length;
  const additions = newLines.length;

  // For collapsed view, show first few lines of each
  const maxCollapsedLines = 4;
  const displayOldLines = isExpanded ? oldLines : oldLines.slice(0, maxCollapsedLines);
  const displayNewLines = isExpanded ? newLines : newLines.slice(0, maxCollapsedLines);
  const hasMore = oldLines.length > maxCollapsedLines || newLines.length > maxCollapsedLines;

  const handleFileClick = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    onOpenFile?.(filePath);
  };

  return (
    <div>
      <div
        className={cn(
          'rounded-xl bg-card overflow-hidden transition-all duration-200',
          isExpanded
            ? 'shadow-[0_4px_12px_-4px_rgba(0,0,0,0.1),0_2px_6px_-2px_rgba(0,0,0,0.06)]'
            : 'shadow-[0_2px_8px_-2px_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.04)]'
        )}
      >
        {/* Header */}
        <button
          onClick={() => {
            setIsExpanded(!isExpanded);
          }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-muted/40 transition-colors duration-150"
        >
          {/* Icon container */}
          <div className="w-6 h-6 rounded-md flex items-center justify-center bg-warning/10">
            <FilePen className={cn('h-3.5 w-3.5 text-warning/70', isRunning && 'animate-pulse')} />
          </div>

          {/* File info */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span
              className="text-[13px] font-medium text-foreground hover:underline truncate cursor-pointer"
              onClick={handleFileClick}
              title={filePath}
            >
              {fileName}
            </span>
            <span className="text-xs text-muted-foreground/60 shrink-0">(modified)</span>
          </div>

          {/* Status - Diff stat or loading */}
          <div className="flex items-center gap-2.5 shrink-0">
            {isRunning ? (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-xs">Editing...</span>
              </div>
            ) : (
              <DiffStat additions={additions} deletions={deletions} />
            )}
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-200',
                isExpanded && 'rotate-180'
              )}
            />
          </div>
        </button>

        {/* Diff preview */}
        <div
          className={cn(
            'overflow-hidden transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]',
            isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-[250px] opacity-100'
          )}
        >
          <div className="overflow-auto">
            {/* Deleted lines (old) */}
            {displayOldLines.map((line, index) => (
              <div
                key={`old-${String(index)}`}
                className="flex font-mono text-xs leading-5 bg-destructive/10"
              >
                {/* Gutter */}
                <div className="w-1 bg-destructive shrink-0" />
                {/* Line indicator */}
                <div className="w-6 px-1 text-center text-destructive/70 select-none shrink-0">
                  -
                </div>
                {/* Content */}
                <div className="flex-1 px-3 text-foreground/70 whitespace-pre overflow-x-auto">
                  {line || ' '}
                </div>
              </div>
            ))}

            {/* Separator */}
            {displayOldLines.length > 0 && displayNewLines.length > 0 ? (
              <div className="h-px bg-border/50" />
            ) : null}

            {/* Added lines (new) */}
            {displayNewLines.map((line, index) => (
              <div
                key={`new-${String(index)}`}
                className="flex font-mono text-xs leading-5 bg-success/10"
              >
                {/* Gutter */}
                <div className="w-1 bg-success shrink-0" />
                {/* Line indicator */}
                <div className="w-6 px-1 text-center text-success/70 select-none shrink-0">+</div>
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
              onClick={() => {
                setIsExpanded(true);
              }}
              className="w-full py-1.5 text-xs text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors flex items-center justify-center gap-1"
            >
              <ChevronDown className="h-3 w-3" />
              <span>Show all changes</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
