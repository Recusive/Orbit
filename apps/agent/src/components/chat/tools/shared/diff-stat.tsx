/**
 * DiffStat - GitHub-style addition/deletion indicator with colored squares.
 *
 * Shows +N / -N counts alongside a 5-square visual bar proportional to
 * the ratio of additions to deletions.
 */

import type { FC } from 'react';

interface DiffStatProps {
  readonly additions: number;
  readonly deletions: number;
}

const MAX_SQUARES = 5;

export const DiffStat: FC<DiffStatProps> = ({ additions, deletions }) => {
  const total = additions + deletions;

  let addSquares = 0;
  let delSquares = 0;
  let neutralSquares = 0;

  if (total > 0) {
    addSquares = Math.round((additions / total) * MAX_SQUARES);
    delSquares = Math.round((deletions / total) * MAX_SQUARES);
    // Ensure at least 1 square if there are changes
    if (additions > 0 && addSquares === 0) addSquares = 1;
    if (deletions > 0 && delSquares === 0) delSquares = 1;
    // Fill remaining with neutral
    neutralSquares = MAX_SQUARES - addSquares - delSquares;
    if (neutralSquares < 0) neutralSquares = 0;
  } else {
    neutralSquares = MAX_SQUARES;
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
