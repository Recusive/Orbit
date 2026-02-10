/**
 * OrbitAsciiLogo — Looping scramble-decode ASCII wordmark
 *
 * Characters start as random noise then resolve into the final block art.
 * After holding, it scrambles back and decodes again — infinite loop.
 *
 * Emil Kowalski principles applied:
 * - ease-out decode (fast start, gentle settle)
 * - CSS-only cursor blink (no React re-renders)
 * - prefers-reduced-motion: skip animation entirely
 */
import { useEffect, useRef, useState } from 'react';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface OrbitAsciiLogoProps {
  readonly className?: string;
}

const SCRAMBLE_CHARS =
  '!@#$%^&*()_+-=[]{}|;:,.<>?/\\~`0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const FINAL_TEXT = ` ██████╗ ██████╗ ██████╗ ██╗████████╗
██╔═══██╗██╔══██╗██╔══██╗██║╚══██╔══╝
██║   ██║██████╔╝██████╔╝██║   ██║
██║   ██║██╔══██╗██╔══██╗██║   ██║
╚██████╔╝██║  ██║██████╔╝██║   ██║
 ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚═╝   ╚═╝`;

const TAGLINE = 'One workspace. Agent, editor, canvas.';

/** Base ms between ticks — actual interval eases out (gets slower) */
const BASE_TICK_MS = 28;
/** How long to hold the resolved state before re-scrambling (ms) */
const HOLD_MS = 4000;

/** Evaluate once — static for the session lifetime. */
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function randomChar(): string {
  return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)] ?? '?';
}

/**
 * Build display string for a given resolve progress.
 * Characters at index < resolvedCount show their final value.
 * Everything else is random noise. Spaces and newlines always pass through.
 */
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

/**
 * Ease-out tick interval: starts fast, slows as progress approaches 1.
 * Uses quadratic ease-out curve: interval = base * (1 + progress²)
 */
function easeOutInterval(progress: number, base: number): number {
  return base * (1 + progress * progress * 1.5);
}

type Phase = 'decode-logo' | 'decode-tagline' | 'hold' | 'scramble';

export const OrbitAsciiLogo: FC<OrbitAsciiLogoProps> = ({ className }) => {
  const [logoDisplay, setLogoDisplay] = useState(PREFERS_REDUCED_MOTION ? FINAL_TEXT : '');
  const [taglineDisplay, setTaglineDisplay] = useState(PREFERS_REDUCED_MOTION ? TAGLINE : '');
  const [phase, setPhase] = useState<Phase>(PREFERS_REDUCED_MOTION ? 'hold' : 'decode-logo');

  const phaseRef = useRef<Phase>('decode-logo');
  const resolvedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Main animation loop — skipped entirely for reduced-motion users
  useEffect(() => {
    if (PREFERS_REDUCED_MOTION) return;

    const clearTimers = (): void => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      if (holdTimerRef.current !== null) clearTimeout(holdTimerRef.current);
    };

    /** Schedule the next tick with ease-out timing */
    const scheduleTick = (phase: Phase, tickFn: () => void, progress: number): void => {
      const interval =
        phase === 'decode-tagline'
          ? easeOutInterval(progress, BASE_TICK_MS * 1.8)
          : easeOutInterval(progress, BASE_TICK_MS);
      timerRef.current = setTimeout(tickFn, interval);
    };

    const startPhase = (phase: Phase): void => {
      clearTimers();
      phaseRef.current = phase;
      resolvedRef.current = 0;

      if (phase === 'decode-logo') {
        setPhase('decode-logo');
        const tick = (): void => {
          resolvedRef.current += 3;
          const progress = resolvedRef.current / FINAL_TEXT.length;
          setLogoDisplay(buildFrame(FINAL_TEXT, resolvedRef.current));

          if (resolvedRef.current >= FINAL_TEXT.length) {
            setLogoDisplay(FINAL_TEXT);
            startPhase('decode-tagline');
          } else {
            scheduleTick('decode-logo', tick, progress);
          }
        };
        setLogoDisplay(buildFrame(FINAL_TEXT, 0));
        scheduleTick('decode-logo', tick, 0);
      }

      if (phase === 'decode-tagline') {
        setPhase('decode-tagline');
        setTaglineDisplay(buildFrame(TAGLINE, 0));
        const tick = (): void => {
          resolvedRef.current += 1;
          const progress = resolvedRef.current / TAGLINE.length;
          setTaglineDisplay(buildFrame(TAGLINE, resolvedRef.current));

          if (resolvedRef.current >= TAGLINE.length) {
            setTaglineDisplay(TAGLINE);
            startPhase('hold');
          } else {
            scheduleTick('decode-tagline', tick, progress);
          }
        };
        scheduleTick('decode-tagline', tick, 0);
      }

      if (phase === 'hold') {
        setPhase('hold');
        holdTimerRef.current = setTimeout(() => {
          startPhase('scramble');
        }, HOLD_MS);
      }

      if (phase === 'scramble') {
        setPhase('scramble');
        resolvedRef.current = FINAL_TEXT.length;
        setTaglineDisplay('');
        const tick = (): void => {
          resolvedRef.current -= 3;
          if (resolvedRef.current <= 0) {
            resolvedRef.current = 0;
            setLogoDisplay(buildFrame(FINAL_TEXT, 0));
            startPhase('decode-logo');
          } else {
            setLogoDisplay(buildFrame(FINAL_TEXT, resolvedRef.current));
            const progress = 1 - resolvedRef.current / FINAL_TEXT.length;
            scheduleTick('scramble', tick, progress);
          }
        };
        scheduleTick('scramble', tick, 0);
      }
    };

    startPhase('decode-logo');

    return clearTimers;
  }, []);

  return (
    <div className={cn('flex flex-col items-center', className)}>
      {/* ASCII Logo + full-height cursor — negative margin offsets cursor so art stays centered */}
      <div className="flex items-stretch -mr-[48px]">
        <pre
          className="font-mono text-[22px] leading-[1.15] text-accent-9 dark:text-accent-11 whitespace-pre select-none"
          aria-label="ORBIT"
          role="img"
        >
          {logoDisplay}
        </pre>
        <div
          className={cn(
            'w-[44px] ml-1',
            phase === 'decode-logo' || phase === 'scramble'
              ? 'bg-accent-9 dark:bg-accent-11 animate-blink'
              : 'bg-transparent'
          )}
        />
      </div>

      {/* Tagline + cursor */}
      <div className="h-6 mt-3">
        <pre className="font-mono text-sm text-foreground/60 whitespace-pre select-none text-center">
          {taglineDisplay}
          {phase === 'decode-tagline' ? (
            <span className="text-accent-9 dark:text-accent-11 animate-blink">█</span>
          ) : null}
        </pre>
      </div>
    </div>
  );
};
