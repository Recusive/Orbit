/**
 * DiffFileCard - Expandable file card with inline diff view
 *
 * Mirrors the Edit/Write tool widget visual language:
 * - Header: icon badge → filename → label → DiffStat → actions → chevron
 * - Body: colored border, tinted backgrounds,
 *   sticky line numbers, `text-sm leading-4` monospace lines.
 *
 * Context lines (unchanged) are shown unhighlighted.
 */
import { ChevronDown, Minus, Plus, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import React, { useMemo, useState } from 'react';

import { DIFF_EXPAND_TRANSITION, DIFF_EXPAND_TRANSITION_NONE } from '../constants';

import type { DisplayFileStatus, FileItem } from '../types';
import type { HighlightToken } from '@/components/chat/tools/shared';
import type { DiffLine, FileDiff } from '@/lib/api';
import type { FC } from 'react';

import { DiffStat, useHighlightedTokens, useIsDarkMode } from '@/components/chat/tools/shared';
import { cn, GIT_STATUS_STYLES } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DiffFileCardProps {
  readonly file: FileItem;
  readonly diff: FileDiff | undefined;
  readonly isStaged: boolean;
  readonly isLoading: boolean;
  readonly onAction: (path: string) => Promise<void>;
  readonly onDiscard?: ((path: string) => void) | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map display status to the colored badge background used in the header icon */
const STATUS_BADGE_BG: Record<DisplayFileStatus, string> = {
  added: 'bg-green-500/10 group-hover/card:bg-green-500/15',
  modified: 'bg-yellow-500/10 group-hover/card:bg-yellow-500/15',
  deleted: 'bg-red-500/10 group-hover/card:bg-red-500/15',
  renamed: 'bg-blue-500/10 group-hover/card:bg-blue-500/15',
  untracked: 'bg-gray-400/10 group-hover/card:bg-gray-400/15',
  conflicted: 'bg-orange-500/10 group-hover/card:bg-orange-500/15',
};

/** Extract filename from path */
function getFileName(path: string): string {
  return path.split('/').pop() ?? path;
}

/** Extract directory from path */
function getFileDirectory(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/');
}

/** Count additions and deletions in a diff */
function countChanges(diff: FileDiff): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      if (line.origin === '+') additions++;
      else if (line.origin === '-') deletions++;
    }
  }
  return { additions, deletions };
}

/** Tinted scroll container background — matches Write tool's bg-success/5 pattern */
function getScrollBgClass(additions: number, deletions: number): string {
  if (additions > 0 && deletions === 0) return 'bg-success/5';
  if (deletions > 0 && additions === 0) return 'bg-destructive/5';
  return '';
}

// ---------------------------------------------------------------------------
// DiffLineRow - Single line in the diff (matches tool widget line layout)
// ---------------------------------------------------------------------------

interface DiffLineRowProps {
  readonly line: DiffLine;
  readonly tokens: HighlightToken[] | null;
}

const DiffLineRow: FC<DiffLineRowProps> = ({ line, tokens }) => {
  const isAdd = line.origin === '+';
  const isDel = line.origin === '-';
  const isContext = !isAdd && !isDel;
  const lineNum = isDel ? line.oldLine : line.newLine;

  return (
    <div
      className={cn(
        'flex font-mono text-sm leading-4',
        isAdd && 'bg-success/10',
        isDel && 'bg-destructive/10',
        isContext && 'bg-card'
      )}
    >
      {/* Sticky gutter: line number */}
      <div
        className={cn(
          'sticky left-0 flex shrink-0',
          isAdd && 'bg-success/5',
          isDel && 'bg-destructive/5',
          isContext && 'bg-card'
        )}
      >
        <div
          className={cn(
            'w-8 px-1.5 text-right select-none',
            isAdd && 'text-success/50 bg-success/10',
            isDel && 'text-destructive/50 bg-destructive/10',
            isContext && 'text-muted-foreground/40'
          )}
        >
          {lineNum ?? ''}
        </div>
      </div>
      {/* Origin sign — matches edit tool's +/- column */}
      <div
        className={cn(
          'w-5 px-1 text-center select-none shrink-0',
          isAdd && 'text-success/70',
          isDel && 'text-destructive/70',
          isContext && 'text-transparent'
        )}
      >
        {isContext ? ' ' : line.origin}
      </div>
      {/* Content — syntax highlighted when tokens available */}
      <div className={cn('flex-1 px-2 whitespace-pre', isDel && 'opacity-70')}>
        {tokens ? (
          /* key={ti} uses array index — acceptable since tokens are rebuilt per render and never reordered */
          tokens.map((token, ti) => (
            <span key={ti} style={token.color ? { color: token.color } : undefined}>
              {token.content}
            </span>
          ))
        ) : (
          <span className="text-foreground">{line.content || ' '}</span>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// DiffFileCard
// ---------------------------------------------------------------------------

export const DiffFileCard: FC<DiffFileCardProps> = ({
  file,
  diff,
  isStaged,
  isLoading,
  onAction,
  onDiscard,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const isDarkMode = useIsDarkMode();

  const fileName = getFileName(file.path);
  const fileDir = getFileDirectory(file.path);
  const hasDiff = diff !== undefined && diff.hunks.length > 0;
  const isBinary = diff?.isBinary === true;
  const canExpand = hasDiff || isBinary;

  const { additions, deletions } = useMemo(
    () => (diff ? countChanges(diff) : { additions: 0, deletions: 0 }),
    [diff]
  );

  // Build full content for syntax highlighting (only when expanded to avoid unnecessary work)
  const fullContent = useMemo(() => {
    if (!isExpanded || !diff) return '';
    return diff.hunks
      .flatMap((h) => h.lines)
      .map((l) => l.content)
      .join('\n');
  }, [isExpanded, diff]);

  const highlightedTokens = useHighlightedTokens(fullContent, file.path, isDarkMode);

  const style = GIT_STATUS_STYLES[file.displayStatus];

  const handleToggle = (): void => {
    if (canExpand) {
      setIsExpanded((prev) => !prev);
    }
  };

  const handleAction = (e: React.MouseEvent): void => {
    e.stopPropagation();
    void onAction(file.path);
  };

  const handleDiscard = (e: React.MouseEvent): void => {
    e.stopPropagation();
    onDiscard?.(file.path);
  };

  return (
    <div className="min-w-0">
      {/* Header */}
      <div
        onClick={handleToggle}
        onKeyDown={(e): void => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          }
        }}
        role="button"
        tabIndex={canExpand ? 0 : -1}
        aria-label={isExpanded ? `Collapse diff for ${fileName}` : `Expand diff for ${fileName}`}
        aria-expanded={isExpanded}
        className={cn(
          'group/card flex items-center gap-2 py-1.5 px-2.5 mx-1',
          'w-[calc(100%-0.5rem)] text-left',
          'rounded-lg hover:bg-lg-control-hover',
          canExpand ? 'cursor-pointer' : 'cursor-default'
        )}
      >
        {/* Status badge */}
        <div
          className={cn(
            'w-[22px] h-[22px] rounded-md flex items-center justify-center shrink-0',
            '',
            STATUS_BADGE_BG[file.displayStatus]
          )}
        >
          <span className={cn('text-[11px] font-bold leading-none', style.color)}>
            {style.label}
          </span>
        </div>

        {/* File name and path */}
        <div className="flex items-baseline gap-1.5 min-w-0 flex-1">
          <span className="text-sm font-medium truncate text-foreground/90">{fileName}</span>
          {fileDir ? (
            <span className="text-[11px] text-muted-foreground/50 truncate shrink-2">
              {fileDir}
            </span>
          ) : null}
        </div>

        {/* Right side: DiffStat + actions + chevron */}
        <div className="flex items-center gap-1.5 shrink-0">
          {hasDiff ? <DiffStat additions={additions} deletions={deletions} /> : null}

          {/* Action buttons (on hover) */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity duration-150">
            {onDiscard ? (
              <button
                onClick={handleDiscard}
                disabled={isLoading}
                className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-lg-control-hover active:scale-95 transition-transform duration-75"
                title="Discard"
                aria-label={`Discard changes to ${fileName}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <button
              onClick={handleAction}
              disabled={isLoading}
              className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-lg-control-hover active:scale-95 transition-transform duration-75"
              title={isStaged ? 'Unstage' : 'Stage'}
              aria-label={isStaged ? `Unstage ${fileName}` : `Stage ${fileName}`}
            >
              {isStaged ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            </button>
          </div>

          {canExpand ? (
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200 shrink-0',
                isExpanded && 'rotate-180'
              )}
            />
          ) : null}
        </div>
      </div>

      {/* Expandable diff body — thick border box matching tool widget content */}
      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={shouldReduceMotion ? DIFF_EXPAND_TRANSITION_NONE : DIFF_EXPAND_TRANSITION}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-2.5 pb-1.5">
              <div
                className={cn(
                  'rounded-lg border bg-card overflow-hidden',
                  isBinary ? 'border-muted-foreground/20' : 'border-white dark:border-white/5'
                )}
              >
                {isBinary ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground/60 italic">
                    Binary file — diff not available
                  </div>
                ) : diff ? (
                  <div
                    className={cn(
                      'overflow-auto max-h-[300px]',
                      getScrollBgClass(additions, deletions)
                    )}
                  >
                    <div className="w-fit min-w-full">
                      {(() => {
                        // NOTE: flatIndex is a mutable counter across nested maps. If hunks are ever
                        // reordered, this will break — consider building a flat array in useMemo.
                        let flatIndex = 0;
                        return diff.hunks.map((hunk, hunkIndex) =>
                          hunk.lines.map((line, lineIndex) => {
                            const tokenIndex = flatIndex++;
                            return (
                              <DiffLineRow
                                key={`${String(hunkIndex)}-${String(lineIndex)}`}
                                line={line}
                                tokens={highlightedTokens?.[tokenIndex] ?? null}
                              />
                            );
                          })
                        );
                      })()}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
