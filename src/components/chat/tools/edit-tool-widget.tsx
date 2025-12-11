import { ChevronDown, FilePen, Loader2 } from 'lucide-react';
import { useState } from 'react';

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
    <div className="my-2 rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => { setIsExpanded(!isExpanded); }}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/50 transition-colors"
      >
        {/* File icon */}
        <FilePen className={cn(
          'h-4 w-4 shrink-0',
          isRunning ? 'text-muted-foreground animate-pulse' : 'text-warning'
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
          <span className="text-xs text-muted-foreground shrink-0">(modified)</span>
        </div>

        {/* Status - Diff stat or loading */}
        <div className="flex items-center gap-2 shrink-0">
          {isRunning ? (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-xs">Editing...</span>
            </div>
          ) : (
            <DiffStat additions={additions} deletions={deletions} />
          )}
          <ChevronDown className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            isExpanded && 'rotate-180'
          )} />
        </div>
      </button>

      {/* Diff preview */}
      <div className={cn(
        'border-t border-border overflow-hidden transition-all',
        isExpanded ? 'max-h-[500px]' : 'max-h-[250px]'
      )}>
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
          {(displayOldLines.length > 0 && displayNewLines.length > 0) ? (
            <div className="h-px bg-border" />
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
              <div className="w-6 px-1 text-center text-success/70 select-none shrink-0">
                +
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
            <span>Show all changes</span>
          </button>
        ) : null}
      </div>
    </div>
  );
};
