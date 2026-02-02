/**
 * ScrambleAsciiPre — A <pre> that scramble-decodes its ASCII art on hover.
 *
 * Static by default; on mouseEnter the text scrambles into random noise
 * then resolves left-to-right back into the final art. On mouseLeave
 * (or when the decode completes) it snaps back to the resolved state.
 *
 * Emil Kowalski principles applied:
 * - ease-out decode (fast start, gentle settle)
 * - prefers-reduced-motion: skip animation, just show text
 * - touch device guard: hover effect only on pointer: fine
 * - subtle opacity lift on hover for visual feedback
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

// ─── Scramble engine ────────────────────────────────────────────────

const SCRAMBLE_CHARS =
  '!@#$%^&*()_+-=[]{}|;:,.<>?/\\~`0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Base ms between ticks — actual interval eases out */
const BASE_TICK_MS = 14;

/** Evaluate once — static for the session lifetime. */
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** True when the device supports real hover (not touch tap-hover). */
const SUPPORTS_HOVER =
  typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

function randomChar(): string {
  return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)] ?? '?';
}

function buildFrame(final: string, resolvedCount: number): string {
  const chars: string[] = [];
  for (let i = 0; i < final.length; i++) {
    const char = final[i] ?? ' ';
    if (char === '\n' || char === ' ') {
      chars.push(char);
    } else if (i < resolvedCount) {
      chars.push(char);
    } else {
      chars.push(randomChar());
    }
  }
  return chars.join('');
}

/** Ease-out interval: starts fast, slows toward the end. */
function easeOutInterval(progress: number, base: number): number {
  return base * (1 + progress * progress * 2);
}

// ─── Component ──────────────────────────────────────────────────────

interface ScrambleAsciiPreProps {
  /** The final resolved ASCII art string (with newlines). */
  readonly text: string;
  /** Accessible label for screen readers (e.g. "Orbit Agent"). */
  readonly ariaLabel: string;
  /** Additional CSS classes for the <pre> element. */
  readonly className?: string;
}

export const ScrambleAsciiPre: FC<ScrambleAsciiPreProps> = ({ text, ariaLabel, className }) => {
  const [display, setDisplay] = useState(text);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvedRef = useRef(0);
  const hoveringRef = useRef(false);

  const stop = useCallback((): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleMouseEnter = useCallback((): void => {
    // Skip animation for reduced-motion or touch devices
    if (PREFERS_REDUCED_MOTION || !SUPPORTS_HOVER) return;

    hoveringRef.current = true;
    stop();
    resolvedRef.current = 0;

    // Start fully scrambled, then ease-out decode left→right
    setDisplay(buildFrame(text, 0));

    const tick = (): void => {
      resolvedRef.current += 4;
      const progress = resolvedRef.current / text.length;
      setDisplay(buildFrame(text, resolvedRef.current));

      if (resolvedRef.current >= text.length) {
        setDisplay(text);
        stop();
      } else {
        timerRef.current = setTimeout(tick, easeOutInterval(progress, BASE_TICK_MS));
      }
    };
    timerRef.current = setTimeout(tick, BASE_TICK_MS);
  }, [text, stop]);

  const handleMouseLeave = useCallback((): void => {
    hoveringRef.current = false;
    stop();
    setDisplay(text);
  }, [text, stop]);

  // Cleanup on unmount
  useEffect(() => stop, [stop]);

  // Sync if text prop changes while not hovering
  useEffect(() => {
    if (!hoveringRef.current) {
      setDisplay(text);
    }
  }, [text]);

  return (
    <pre
      className={cn(
        'font-mono text-[3.5px] leading-[1.1] whitespace-pre select-none',
        'text-primary',
        className
      )}
      aria-label={ariaLabel}
      role="img"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {display}
    </pre>
  );
};
