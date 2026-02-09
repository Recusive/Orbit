/**
 * DiffStat - Proportional bar showing additions vs deletions.
 *
 * Renders +N / -N counts alongside a thin horizontal bar where
 * the green/red ratio reflects the proportion of changes.
 */

import type { FC } from 'react';

interface DiffStatProps {
  readonly additions: number;
  readonly deletions: number;
}

/** Minimum visible percentage so a tiny slice is never invisible */
const MIN_PERCENT = 8;
const BAR_WIDTH = 32;

export const DiffStat: FC<DiffStatProps> = ({ additions, deletions }) => {
  const total = additions + deletions;

  // Calculate percentages with minimum visibility guarantee
  let addPercent = 0;
  let delPercent = 0;

  if (total > 0) {
    addPercent = (additions / total) * 100;
    delPercent = (deletions / total) * 100;

    // Clamp so both sides are visible when non-zero
    if (additions > 0 && addPercent < MIN_PERCENT) addPercent = MIN_PERCENT;
    if (deletions > 0 && delPercent < MIN_PERCENT) delPercent = MIN_PERCENT;

    // Re-normalize to 100
    const scale = 100 / (addPercent + delPercent);
    addPercent = addPercent * scale;
    delPercent = delPercent * scale;
  }

  return (
    <div className="flex items-center gap-1.5">
      {additions > 0 ? (
        <span className="text-[11px] font-medium tabular-nums text-success/70">+{additions}</span>
      ) : null}
      {deletions > 0 ? (
        <span className="text-[11px] font-medium tabular-nums text-destructive/70">
          -{deletions}
        </span>
      ) : null}
      {total > 0 ? (
        <div className="h-[5px] rounded-full overflow-hidden flex" style={{ width: BAR_WIDTH }}>
          {additions > 0 ? (
            <div className="h-full bg-success/60" style={{ width: `${String(addPercent)}%` }} />
          ) : null}
          {deletions > 0 ? (
            <div className="h-full bg-destructive/60" style={{ width: `${String(delPercent)}%` }} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
