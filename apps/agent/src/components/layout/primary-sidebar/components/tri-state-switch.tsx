/**
 * TriStateSwitch — 3-position toggle for editor sidebar
 *
 * A discrete slider with 3 stops (Explorer / Source Control / Sessions).
 * Click cycles through positions; arrow keys navigate left/right.
 *
 * Track: 42px × 14px, Thumb: 10px × 10px, 3 stops at 0/14/28px travel.
 */
import type { FC, KeyboardEvent } from 'react';

import { cn } from '@/lib/utils';

type TriStateValue = 0 | 1 | 2;

interface TriStateSwitchProps {
  readonly value: TriStateValue;
  readonly onChange: (value: TriStateValue) => void;
  readonly 'aria-label': string;
}

/** Horizontal translateX offsets for each thumb stop (in px) */
const THUMB_OFFSETS: Record<TriStateValue, number> = {
  0: 0,
  1: 14,
  2: 28,
};

export const TriStateSwitch: FC<TriStateSwitchProps> = ({
  value,
  onChange,
  'aria-label': ariaLabel,
}) => {
  const handleClick = (): void => {
    const next = ((value + 1) % 3) as TriStateValue;
    onChange(next);
  };

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(((value + 1) % 3) as TriStateValue);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      // +2 mod 3 is the same as -1 mod 3
      onChange(((value + 2) % 3) as TriStateValue);
    }
  };

  return (
    <button
      type="button"
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={2}
      aria-valuenow={value}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer',
        'h-3.5 w-[42px] rounded-md bg-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
      )}
    >
      <span
        className="absolute top-[2px] left-[2px] block h-2.5 w-2.5 rounded-sm bg-background shadow-sm transition-transform duration-200"
        style={{ transform: `translateX(${String(THUMB_OFFSETS[value])}px)` }}
      />
    </button>
  );
};
