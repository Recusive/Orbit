/**
 * DiffStat - Vertical blocks showing additions vs deletions.
 *
 * Renders +N / -N counts alongside vertical bars (max 4 each)
 * where green = additions and red = deletions.
 */

import type { FC } from 'react';

interface DiffStatProps {
  readonly additions: number;
  readonly deletions: number;
}

const MAX_BLOCKS = 4;

/** Map a count to 0–4 filled blocks proportionally */
function getBlockCount(count: number, total: number): number {
  if (count === 0) return 0;
  // At least 1 block if non-zero
  return Math.max(1, Math.round((count / total) * MAX_BLOCKS));
}

export const DiffStat: FC<DiffStatProps> = ({ additions, deletions }) => {
  const total = additions + deletions;

  const addBlocks = total > 0 ? getBlockCount(additions, total) : 0;
  const delBlocks = total > 0 ? getBlockCount(deletions, total) : 0;

  return (
    <div className="flex items-center gap-1.5">
      {additions > 0 ? (
        <span className="text-[11px] font-medium tabular-nums text-success">+{additions}</span>
      ) : null}
      {deletions > 0 ? (
        <span className="text-[11px] font-medium tabular-nums text-destructive">-{deletions}</span>
      ) : null}
      {total > 0 ? (
        <div className="flex items-center gap-px">
          {Array.from({ length: addBlocks }, (_, i) => (
            <div key={`a${String(i)}`} className="w-[3px] h-[10px] rounded-[1px] bg-success" />
          ))}
          {Array.from({ length: delBlocks }, (_, i) => (
            <div key={`d${String(i)}`} className="w-[3px] h-[10px] rounded-[1px] bg-destructive" />
          ))}
        </div>
      ) : null}
    </div>
  );
};
