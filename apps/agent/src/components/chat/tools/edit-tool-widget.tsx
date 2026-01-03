import { ChevronDown, FilePen, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface EditToolWidgetProps {
  readonly filePath: string;
  readonly oldString: string;
  readonly newString: string;
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
    <div className="flex items-center gap-1">
      {additions > 0 ? (
        <span className="text-[10px] font-semibold text-success">+{additions}</span>
      ) : null}
      {deletions > 0 ? (
        <span className="text-[10px] font-semibold text-destructive">-{deletions}</span>
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

export const EditToolWidget: FC<EditToolWidgetProps> = ({
  filePath,
  oldString,
  newString,
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
          'bg-card overflow-hidden transition-all duration-200',
          isFailed
            ? 'border-2 border-dashed border-destructive/40 opacity-60'
            : 'border border-border/50',
          isExpanded
            ? 'rounded-xl shadow-[0_4px_12px_-4px_rgba(0,0,0,0.1),0_2px_6px_-2px_rgba(0,0,0,0.06)]'
            : 'rounded-lg shadow-[0_2px_8px_-2px_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.04)]'
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
              isFailed ? 'bg-destructive/10' : 'bg-warning/10'
            )}
          >
            <FilePen
              className={cn(
                'h-3 w-3',
                isFailed ? 'text-destructive/70' : 'text-warning/70',
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
                'text-[10px] shrink-0',
                isFailed ? 'text-destructive/60' : 'text-muted-foreground/60'
              )}
            >
              {isFailed ? '(failed)' : '(modified)'}
            </span>
          </div>

          {/* Status - Diff stat or loading or failed */}
          <div className="flex items-center gap-2 shrink-0">
            {isRunning ? (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                <span className="text-[11px]">Editing...</span>
              </div>
            ) : isFailed ? (
              <span className="text-[10px] text-destructive/60">Failed</span>
            ) : (
              <DiffStat additions={additions} deletions={deletions} />
            )}
            <ChevronDown
              className={cn(
                'h-3 w-3 text-muted-foreground/60 transition-transform duration-200',
                isExpanded && 'rotate-180'
              )}
            />
          </div>
        </button>

        {/* Diff preview */}
        <div
          className={cn(
            'grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
            isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          )}
        >
          <div className="overflow-hidden min-h-0">
            <div className="overflow-auto max-h-[300px]">
              {/* Deleted lines (old) */}
              {displayOldLines.map((line, index) => (
                <div
                  key={`old-${String(index)}`}
                  className="flex font-mono text-[11px] leading-4 bg-destructive/10"
                >
                  {/* Gutter */}
                  <div className="w-0.5 bg-destructive shrink-0" />
                  {/* Line indicator */}
                  <div className="w-5 px-1 text-center text-destructive/70 select-none shrink-0">
                    -
                  </div>
                  {/* Content */}
                  <div className="flex-1 px-2 text-foreground/70 whitespace-pre overflow-x-auto">
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
                  className="flex font-mono text-[11px] leading-4 bg-success/10"
                >
                  {/* Gutter */}
                  <div className="w-0.5 bg-success shrink-0" />
                  {/* Line indicator */}
                  <div className="w-5 px-1 text-center text-success/70 select-none shrink-0">+</div>
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
                className="w-full py-1 text-[10px] text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors flex items-center justify-center gap-0.5"
              >
                <ChevronDown className="h-2.5 w-2.5" />
                <span>Show all changes</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
