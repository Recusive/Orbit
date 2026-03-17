import { IconImagine } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconImagine';

import type { EffortLevelButtonProps } from './types';
import type { EffortLevel } from '@/types/protocol';
import type { FC } from 'react';

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { cn, TRANSITION_CLASSES } from '@/lib/utils';

// ─── Pulse-line SVG paths per effort level ───────────────────────────
// ECG-style heartbeat pulses — sharp spike up, quick dip below baseline,
// small recovery bump, then flat. Each level adds another heartbeat.
const PULSE_PATHS: Record<EffortLevel, string> = {
  low: 'M 1 8 L 6 8 L 7 5.5 L 8 9.5 L 9 8 L 15 8',
  medium: 'M 1 8 L 4.5 8 L 5.5 6.5 L 6.5 2.5 L 7.5 11 L 8 8 L 9 7 L 9.5 8 L 15 8',
  high: 'M 1 8 L 2 8 L 2.8 6.5 L 3.8 2 L 4.8 11.5 L 5.3 8 L 6 7 L 6.5 8 L 8.5 8 L 9.3 6.5 L 10.3 2.5 L 11.3 11 L 11.8 8 L 12.5 7 L 13 8 L 15 8',
  max: 'M 1 8 L 1.5 8 L 2 6.5 L 2.8 1.5 L 3.8 12.5 L 4.2 8 L 4.8 7 L 5.2 8 L 6.2 8 L 6.6 6 L 7.4 2 L 8.4 12 L 8.8 8 L 9.4 7 L 9.8 8 L 10.8 8 L 11.2 6.5 L 12 2.5 L 13 11.5 L 13.4 8 L 14 7.5 L 14.5 8 L 15 8',
};

// Theme-aware stroke colors using existing CSS custom properties.
// These adapt to light/dark mode automatically.
//   low:  info (blue)       — calm, minimal
//   medium: success (green) — balanced
//   high: warning (amber)   — pushing harder
//   max:  destructive (red) — maximum intensity
const PULSE_COLORS: Record<EffortLevel, string> = {
  low: 'var(--info)',
  medium: 'var(--success)',
  high: 'var(--warning)',
  max: 'var(--destructive)',
};

/**
 * Pulse-line indicator for Opus 4.6 effort levels.
 * ECG-style waveform with per-level color coding.
 * Max level gets a subtle glow behind the stroke.
 */
export const EffortLevelButton: FC<EffortLevelButtonProps> = ({
  effortLevel,
  effortHoverOpen,
  setEffortHoverOpen,
  cycleEffortLevel,
  getEffortInfo,
}) => {
  const effortInfo = getEffortInfo();
  const isMax = effortLevel === 'max';
  const strokeColor = PULSE_COLORS[effortLevel];

  return (
    <HoverCard open={effortHoverOpen}>
      <div
        onMouseEnter={() => {
          setEffortHoverOpen(true);
        }}
        onMouseLeave={() => {
          setEffortHoverOpen(false);
        }}
      >
        <HoverCardTrigger asChild>
          <button
            onClick={cycleEffortLevel}
            aria-label={`Effort level: ${effortInfo.level}. Click to change.`}
            className={cn(
              'h-7 flex items-center justify-center gap-1 px-1.5 rounded-[9px]',
              TRANSITION_CLASSES.button,
              'hover:bg-lg-control-hover hover:scale-[1.02]',
              'active:scale-95',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50'
            )}
          >
            <IconImagine
              size={16}
              className="transition-colors duration-150"
              style={{ color: strokeColor }}
            />
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              {/* Faint baseline */}
              <line
                x1="0"
                y1="8"
                x2="16"
                y2="8"
                stroke="var(--muted-foreground)"
                strokeWidth="0.5"
                opacity="0.3"
              />
              {/* Glow layer for max level */}
              {isMax ? (
                <path
                  d={PULSE_PATHS[effortLevel]}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.15"
                />
              ) : null}
              {/* Main waveform stroke */}
              <path
                d={PULSE_PATHS[effortLevel]}
                fill="none"
                stroke={strokeColor}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transition: 'all 0.2s ease' }}
              />
            </svg>
          </button>
        </HoverCardTrigger>
      </div>
      <HoverCardContent
        side="top"
        align="center"
        className="w-auto p-2.5"
        onMouseEnter={() => {
          setEffortHoverOpen(true);
        }}
        onMouseLeave={() => {
          setEffortHoverOpen(false);
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path
                d={PULSE_PATHS[effortLevel]}
                fill="none"
                stroke={strokeColor}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-xs font-medium" style={{ color: strokeColor }}>
              {effortInfo.level}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">{effortInfo.description}</span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};
