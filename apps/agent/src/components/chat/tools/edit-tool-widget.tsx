import { ChevronDown, FilePen, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
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

export const EditToolWidget: FC<EditToolWidgetProps> = ({
  filePath,
  oldString,
  newString,
  isRunning = false,
  success,
  onOpenFile,
}) => {
  const [isExpanded, setIsExpanded] = useState(isRunning);
  const [showAllLines, setShowAllLines] = useState(false);
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

  // For preview view, show first few lines of each
  const maxPreviewLines = 4;
  const displayOldLines = showAllLines ? oldLines : oldLines.slice(0, maxPreviewLines);
  const displayNewLines = showAllLines ? newLines : newLines.slice(0, maxPreviewLines);
  const hasMore =
    !showAllLines && (oldLines.length > maxPreviewLines || newLines.length > maxPreviewLines);

  const handleFileClick = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    onOpenFile?.(filePath);
  };

  return (
    <div>
      <div
        className={cn(
          'bg-card overflow-hidden transition-[border-color,opacity,box-shadow] duration-200',
          isFailed
            ? 'border-2 border-dotted border-destructive/40 opacity-60'
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
                'text-xs shrink-0',
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
                <span className="text-sm">Editing...</span>
              </div>
            ) : isFailed ? (
              <span className="text-xs text-destructive/60">Failed</span>
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
        <AnimatePresence initial={false} mode="wait">
          {isExpanded ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                height: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
                opacity: { duration: 0.15, ease: 'easeOut' },
              }}
              style={{ overflow: 'hidden' }}
            >
              <div className={cn('overflow-auto', !showAllLines && 'max-h-[300px]')}>
                <div className="w-fit min-w-full">
                  {/* Deleted lines (old) */}
                  {displayOldLines.map((line, index) => (
                    <div
                      key={`old-${String(index)}`}
                      className="flex font-mono text-sm leading-4 bg-destructive/10"
                    >
                      {/* Sticky gutter + indicator */}
                      <div className="sticky left-0 flex shrink-0 bg-destructive/10">
                        <div className="w-0.5 bg-destructive" />
                        <div className="w-5 px-1 text-center text-destructive/70 select-none">
                          -
                        </div>
                      </div>
                      {/* Content */}
                      <div className="flex-1 px-2 text-foreground/70 whitespace-pre">
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
                      className="flex font-mono text-sm leading-4 bg-success/10"
                    >
                      {/* Sticky gutter + indicator */}
                      <div className="sticky left-0 flex shrink-0 bg-success/10">
                        <div className="w-0.5 bg-success" />
                        <div className="w-5 px-1 text-center text-success/70 select-none">+</div>
                      </div>
                      {/* Content */}
                      <div className="flex-1 px-2 text-foreground whitespace-pre">
                        {line || ' '}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Show all / Show less toggle button */}
              {(hasMore || showAllLines) &&
              (oldLines.length > maxPreviewLines || newLines.length > maxPreviewLines) ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAllLines(!showAllLines);
                  }}
                  className="w-full py-1 text-xs text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors flex items-center justify-center gap-0.5"
                >
                  <ChevronDown
                    className={cn('h-2.5 w-2.5 transition-transform', showAllLines && 'rotate-180')}
                  />
                  <span>
                    {showAllLines
                      ? 'Show less'
                      : `Show all changes (${String(oldLines.length + newLines.length)} lines)`}
                  </span>
                </button>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
};
