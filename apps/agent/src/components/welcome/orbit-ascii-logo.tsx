/**
 * OrbitAsciiLogo — Welcome page branding with selectable animation style.
 *
 * Reads the user's preferred animation from the welcome-animation store:
 * - "beam": BeamAsciiPre sweep with glow (default)
 * - "scramble": Looping scramble-decode with cursor blink (classic)
 */
import { useEffect, useRef, useState } from 'react';

import type { FC } from 'react';

import { BeamAsciiPre } from '@/components/shared';
import { cn } from '@/lib/utils';
import { selectWelcomeAnimation, useWelcomeAnimationStore } from '@/stores/ui';

interface OrbitAsciiLogoProps {
  readonly className?: string;
  /** When false, ASCII art is not rendered (container remains for layout). Default true. */
  readonly showAscii?: boolean | undefined;
  /** Fires once when the beam/scramble animation completes. */
  readonly onAnimationComplete?: (() => void) | undefined;
}

const ORBIT_ART = ` ██████╗ ██████╗ ██████╗ ██╗████████╗
██╔═══██╗██╔══██╗██╔══██╗██║╚══██╔══╝
██║   ██║██████╔╝██████╔╝██║   ██║
██║   ██║██╔══██╗██╔══██╗██║   ██║
╚██████╔╝██║  ██║██████╔╝██║   ██║
 ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚═╝   ╚═╝`;

const TAGLINE = 'One workspace. Agent, editor, canvas.';

export const OrbitAsciiLogo: FC<OrbitAsciiLogoProps> = ({
  className,
  showAscii = true,
  onAnimationComplete,
}) => {
  const animation = useWelcomeAnimationStore(selectWelcomeAnimation);

  if (animation === 'scramble') {
    return (
      <ScrambleOrbitLogo
        className={className}
        showAscii={showAscii}
        onAnimationComplete={onAnimationComplete}
      />
    );
  }

  return (
    <div className={cn('flex flex-col items-center', className)}>
      {showAscii ? (
        <>
          <BeamAsciiPre
            text={ORBIT_ART}
            ariaLabel="ORBIT"
            className="text-[22px] leading-[1.15]"
            duration={1600}
            settledColor="var(--foreground)"
          />

          {/* Tagline — beam starts after the main art finishes.
              onAnimationComplete fires here (not on logo) so it triggers
              after BOTH logo + tagline finish. */}
          <div className="h-6 mt-3">
            <BeamAsciiPre
              text={TAGLINE}
              ariaLabel="One workspace. Agent, editor, canvas."
              className="text-sm leading-normal text-center"
              duration={800}
              beamSize={8}
              blurLead={6}
              delay={1600}
              settledColor="var(--foreground)"
              onAnimationComplete={onAnimationComplete}
            />
          </div>
        </>
      ) : null}
    </div>
  );
};

// ─── Scramble-decode animation (classic) ──────────────────────────────

const SCRAMBLE_CHARS =
  '!@#$%^&*()_+-=[]{}|;:,.<>?/\\~`0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const BASE_TICK_MS = 28;
const HOLD_MS = 4000;

const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

function easeOutInterval(progress: number, base: number): number {
  return base * (1 + progress * progress * 1.5);
}

type Phase = 'decode-logo' | 'decode-tagline' | 'hold' | 'scramble';

interface ScrambleOrbitLogoProps {
  readonly className?: string | undefined;
  readonly showAscii?: boolean | undefined;
  readonly onAnimationComplete?: (() => void) | undefined;
}

const ScrambleOrbitLogo: FC<ScrambleOrbitLogoProps> = ({
  className,
  showAscii = true,
  onAnimationComplete,
}) => {
  const [logoDisplay, setLogoDisplay] = useState(PREFERS_REDUCED_MOTION ? ORBIT_ART : '');
  const [taglineDisplay, setTaglineDisplay] = useState(PREFERS_REDUCED_MOTION ? TAGLINE : '');

  const phaseRef = useRef<Phase>('decode-logo');
  const resolvedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeFiredRef = useRef(false);
  // Stable ref for onAnimationComplete — avoids re-running the entire animation
  // effect when the callback prop changes (it won't, but satisfies exhaustive-deps)
  const onCompleteRef = useRef(onAnimationComplete);
  onCompleteRef.current = onAnimationComplete;

  useEffect(() => {
    if (PREFERS_REDUCED_MOTION) return;

    const clearTimers = (): void => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      if (holdTimerRef.current !== null) clearTimeout(holdTimerRef.current);
    };

    const scheduleTick = (tickPhase: Phase, tickFn: () => void, progress: number): void => {
      const interval =
        tickPhase === 'decode-tagline'
          ? easeOutInterval(progress, BASE_TICK_MS * 1.8)
          : easeOutInterval(progress, BASE_TICK_MS);
      timerRef.current = setTimeout(tickFn, interval);
    };

    const startPhase = (nextPhase: Phase): void => {
      clearTimers();
      phaseRef.current = nextPhase;
      resolvedRef.current = 0;

      if (nextPhase === 'decode-logo') {
        const tick = (): void => {
          resolvedRef.current += 3;
          const progress = resolvedRef.current / ORBIT_ART.length;
          setLogoDisplay(buildFrame(ORBIT_ART, resolvedRef.current));

          if (resolvedRef.current >= ORBIT_ART.length) {
            setLogoDisplay(ORBIT_ART);
            startPhase('decode-tagline');
          } else {
            scheduleTick('decode-logo', tick, progress);
          }
        };
        setLogoDisplay(buildFrame(ORBIT_ART, 0));
        scheduleTick('decode-logo', tick, 0);
      }

      if (nextPhase === 'decode-tagline') {
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

      if (nextPhase === 'hold') {
        // Fire completion callback once on first hold (animation cycle complete)
        if (!completeFiredRef.current) {
          completeFiredRef.current = true;
          onCompleteRef.current?.();
        }
        holdTimerRef.current = setTimeout(() => {
          startPhase('scramble');
        }, HOLD_MS);
      }

      if (nextPhase === 'scramble') {
        resolvedRef.current = ORBIT_ART.length;
        setTaglineDisplay('');
        const tick = (): void => {
          resolvedRef.current -= 3;
          if (resolvedRef.current <= 0) {
            resolvedRef.current = 0;
            setLogoDisplay(buildFrame(ORBIT_ART, 0));
            startPhase('decode-logo');
          } else {
            setLogoDisplay(buildFrame(ORBIT_ART, resolvedRef.current));
            const progress = 1 - resolvedRef.current / ORBIT_ART.length;
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
      {showAscii ? (
        <>
          <pre
            className="font-mono text-[22px] leading-[1.15] text-foreground whitespace-pre select-none"
            aria-label="ORBIT"
            role="img"
          >
            {logoDisplay}
          </pre>

          <div className="h-6 mt-3">
            <pre className="font-mono text-sm text-foreground/60 whitespace-pre select-none text-center">
              {taglineDisplay}
            </pre>
          </div>
        </>
      ) : null}
    </div>
  );
};
