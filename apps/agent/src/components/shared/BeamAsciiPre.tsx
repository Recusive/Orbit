/**
 * BeamAsciiPre — A <pre> that reveals ASCII art with a left-to-right beam sweep.
 *
 * On mount, a beam sweeps left→right revealing each character with
 * blur fade-in, glow, and color transition that settles into the accent color.
 * Replays on hover after the initial animation completes.
 *
 * Theme-aware: uses --beam-hot (white in dark, saturated coral in light)
 * and --beam-glow-rgb for the glow shadow. Defined in globals.css.
 *
 * Respects prefers-reduced-motion: shows static text immediately.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CSSProperties, FC } from 'react';

import { cn } from '@/lib/utils';

/** Evaluate once — static for the session lifetime. */
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface BlockChar {
  readonly r: number;
  readonly c: number;
  readonly ch: string;
}

/** Extract all non-space characters sorted left-to-right, top-to-bottom */
function getBlockChars(rows: readonly string[]): BlockChar[] {
  const blocks: BlockChar[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? '';
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== ' ') {
        blocks.push({ r, c, ch: row[c] ?? '' });
      }
    }
  }
  blocks.sort((a, b) => a.c - b.c || a.r - b.r);
  return blocks;
}

/** Build a Map from "r,c" → block index for O(1) lookup during render */
function buildIndexMap(blocks: readonly BlockChar[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block !== undefined) {
      map.set(`${String(block.r)},${String(block.c)}`, i);
    }
  }
  return map;
}

/** CSS variable references — theme-aware via globals.css */
const ACCENT_COLOR = 'var(--primary)';
const ACCENT_MID = 'var(--primary-hover)';
const BEAM_HOT = 'var(--beam-hot)';
/** Glow helper: returns rgba() using the theme-aware --beam-glow-rgb variable */
const glow = (alpha: number): string => `rgba(var(--beam-glow-rgb), ${String(alpha)})`;

interface BeamAsciiPreProps {
  /** The final resolved ASCII art string (with newlines). */
  readonly text: string;
  /** Accessible label for screen readers (e.g. "Orbit Agent"). */
  readonly ariaLabel: string;
  /** Additional CSS classes for the <pre> element. */
  readonly className?: string | undefined;
  /** Animation duration in ms (default: 1800) */
  readonly duration?: number | undefined;
  /** How many blocks the beam covers (default: 16) */
  readonly beamSize?: number | undefined;
  /** How many blocks ahead of beam get blur fade-in (default: 10) */
  readonly blurLead?: number | undefined;
  /** Delay before starting the animation in ms (default: 0) */
  readonly delay?: number | undefined;
  /** Final resting color after beam completes (default: var(--primary)) */
  readonly settledColor?: string | undefined;
  /** Fires once when the beam animation completes (done transitions to true). */
  readonly onAnimationComplete?: (() => void) | undefined;
}

export const BeamAsciiPre: FC<BeamAsciiPreProps> = ({
  text,
  ariaLabel,
  className,
  duration = 1800,
  beamSize = 16,
  blurLead = 10,
  delay = 0,
  settledColor = ACCENT_COLOR,
  onAnimationComplete,
}) => {
  // Parse text into rows and build block index once per text value
  const { rows, total, indexMap } = useMemo(() => {
    const parsedRows = text.split('\n');
    const blocks = getBlockChars(parsedRows);
    return {
      rows: parsedRows,
      total: blocks.length,
      indexMap: buildIndexMap(blocks),
    };
  }, [text]);

  const [startTime, setStartTime] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);

  /** Restart the beam animation from the beginning */
  const replay = useCallback((): void => {
    if (PREFERS_REDUCED_MOTION) return;
    setStartTime(Date.now());
    setElapsed(0);
  }, []);

  useEffect(() => {
    if (PREFERS_REDUCED_MOTION) return;

    const interval = setInterval(() => {
      const raw = Date.now() - startTime;
      // Subtract delay — clamp to 0 so nothing renders until delay elapses
      const now = Math.max(0, raw - delay);
      setElapsed(now);
      if (now >= duration + 500) clearInterval(interval);
    }, 16);
    return (): void => {
      clearInterval(interval);
    };
  }, [startTime, duration, delay]);

  const progress = Math.min(1, elapsed / duration);
  const beamHead = Math.floor(progress * (total + beamSize));
  const done = PREFERS_REDUCED_MOTION || elapsed >= duration + 400;

  // Fire onAnimationComplete exactly once when done transitions to true.
  // For reduced-motion: fires on first render (done starts as true).
  const completeFiredRef = useRef(false);
  useEffect(() => {
    if (done && !completeFiredRef.current) {
      completeFiredRef.current = true;
      onAnimationComplete?.();
    }
  }, [done, onAnimationComplete]);

  /** Memoize char styles — only recompute when beamHead or done changes */
  const charStyles = useMemo(() => {
    if (done) return null;
    const styles = new Map<string, CSSProperties>();

    for (const [key, blockIdx] of indexMap) {
      const distFromHead = beamHead - blockIdx;

      if (distFromHead > beamSize) {
        styles.set(key, { color: settledColor });
        continue;
      }

      // Blur lead zone
      if (distFromHead < 0 && distFromHead > -blurLead) {
        const leadProgress = 1 - Math.abs(distFromHead) / blurLead;
        const blur = (1 - leadProgress) * 8;
        const opacity = leadProgress * 0.4;
        styles.set(key, {
          color: ACCENT_MID,
          opacity,
          filter: `blur(${String(blur)}px)`,
          display: 'inline-block',
        });
        continue;
      }

      // Not yet in range
      if (distFromHead <= -blurLead) {
        styles.set(key, { opacity: 0 });
        continue;
      }

      // In the beam zone
      const beamProgress = distFromHead / beamSize;
      const blur = Math.max(0, (1 - beamProgress) * 3);

      if (beamProgress < 0.3) {
        // Leading edge — hot color with glow
        const brightness = 1 - beamProgress / 0.3;
        styles.set(key, {
          color: BEAM_HOT,
          filter: blur > 0.2 ? `blur(${String(blur)}px)` : 'none',
          display: 'inline-block',
          textShadow: `0 0 ${String(6 + brightness * 12)}px ${glow(0.5 + brightness * 0.4)}, 0 0 ${String(14 + brightness * 8)}px ${glow(0.3 + brightness * 0.3)}`,
        });
      } else if (beamProgress < 0.6) {
        // Mid beam — transitioning from hot to accent
        const t = (beamProgress - 0.3) / 0.3;
        styles.set(key, {
          color: BEAM_HOT,
          opacity: 1 - t * 0.3,
          filter: blur > 0.2 ? `blur(${String(blur)}px)` : 'none',
          display: 'inline-block',
          textShadow: `0 0 ${String((1 - t) * 8)}px ${glow((1 - t) * 0.4)}`,
        });
      } else {
        // Trailing — settling into final color
        styles.set(key, {
          color: settledColor,
          textShadow: `0 0 ${String((1 - beamProgress) * 4)}px ${glow((1 - beamProgress) * 0.3)}`,
        });
      }
    }
    return styles;
  }, [beamHead, done, indexMap, beamSize, blurLead, settledColor]);

  return (
    <pre
      className={cn('font-mono whitespace-pre select-none', className)}
      style={done ? { color: settledColor } : undefined}
      aria-label={ariaLabel}
      role="img"
      onMouseEnter={done ? replay : undefined}
    >
      {rows.map((row, r) => (
        <div key={r}>
          {row.split('').map((ch, c) => {
            if (ch === ' ') return <span key={c}> </span>;

            if (done || charStyles === null) {
              return (
                <span key={c} style={{ color: settledColor }}>
                  {ch}
                </span>
              );
            }

            const style = charStyles.get(`${String(r)},${String(c)}`);
            return (
              <span key={c} style={style}>
                {ch}
              </span>
            );
          })}
        </div>
      ))}
    </pre>
  );
};
