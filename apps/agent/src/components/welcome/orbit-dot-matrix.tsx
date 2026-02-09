/**
 * OrbitDotMatrix — Dot matrix LED display that spells "ORBIT"
 *
 * A 5-row grid where specific dots light up to form each letter.
 * Includes a continuous shimmer wave that sweeps across the lit dots.
 *
 * Grid: 5 rows × 31 columns (5 letters × 5 cols + 4 gaps × 1.5 cols)
 */
import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface OrbitDotMatrixProps {
  readonly className?: string;
  /** Dot diameter in pixels (default: 6) */
  readonly dotSize?: number;
  /** Gap between dots in pixels (default: 4) */
  readonly gap?: number;
}

/**
 * 5×5 pixel font for each letter in "ORBIT"
 * 1 = lit, 0 = dim
 */
const LETTERS: Record<string, readonly (readonly number[])[]> = {
  O: [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
  ],
  R: [
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 0],
    [1, 0, 1, 0, 0],
    [1, 0, 0, 1, 0],
  ],
  B: [
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 0],
  ],
  I: [
    [1, 1, 1, 1, 1],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [1, 1, 1, 1, 1],
  ],
  T: [
    [1, 1, 1, 1, 1],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
  ],
} as const;

/** Gap columns between letters (empty column) */
const GAP_COLS = 2;

/**
 * Build the full dot matrix grid for "ORBIT"
 * Returns a 2D boolean array: grid[row][col] = true if dot should be lit
 */
function buildGrid(): readonly (readonly boolean[])[] {
  const word = ['O', 'R', 'B', 'I', 'T'] as const;
  const rows: boolean[][] = [[], [], [], [], []];

  for (let letterIdx = 0; letterIdx < word.length; letterIdx++) {
    const letterKey = word[letterIdx] as string | undefined;
    if (letterKey === undefined) continue;
    const letter = LETTERS[letterKey];
    if (letter === undefined) continue;

    // Add gap columns before this letter (except the first)
    if (letterIdx > 0) {
      for (let row = 0; row < 5; row++) {
        const targetRow = rows[row];
        if (targetRow === undefined) continue;
        for (let g = 0; g < GAP_COLS; g++) {
          targetRow.push(false);
        }
      }
    }

    // Add letter columns
    for (let row = 0; row < 5; row++) {
      const targetRow = rows[row];
      const letterRow = letter[row];
      if (targetRow === undefined || letterRow === undefined) continue;
      for (let col = 0; col < 5; col++) {
        targetRow.push(letterRow[col] === 1);
      }
    }
  }

  return rows;
}

/** Pre-computed grid — static, never changes */
const GRID = buildGrid();
const FIRST_ROW = GRID[0];
const TOTAL_COLS = FIRST_ROW !== undefined ? FIRST_ROW.length : 0;

export const OrbitDotMatrix: FC<OrbitDotMatrixProps> = ({ className, dotSize = 6, gap = 4 }) => {
  const step = dotSize + gap;

  return (
    <div
      className={cn('relative', className)}
      role="img"
      aria-label="ORBIT"
      style={{
        width: TOTAL_COLS * step - gap,
        height: 5 * step - gap,
      }}
    >
      {/* Shimmer keyframes — scoped to this component */}
      <style>{`
        @keyframes orbit-dot-shimmer {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
      `}</style>

      {GRID.map((row, rowIdx) =>
        row.map((lit, colIdx) => (
          <div
            key={`${String(rowIdx)}-${String(colIdx)}`}
            className={cn('absolute rounded-full', lit ? 'bg-gray-9' : 'bg-gray-5')}
            style={{
              width: dotSize,
              height: dotSize,
              left: colIdx * step,
              top: rowIdx * step,
              ...(lit
                ? {
                    animation: 'orbit-dot-shimmer 3s ease-in-out infinite',
                    animationDelay: `${String(colIdx * 0.08)}s`,
                  }
                : undefined),
            }}
          />
        ))
      )}
    </div>
  );
};
