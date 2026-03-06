import { Code, Eye, GitPullRequestArrow } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { FC } from 'react';

import { AccountBanner } from '@/components/welcome/account-banner';
import { BlurReveal } from '@/components/welcome/blur-reveal';
import { DiffSection } from '@/components/welcome/diff-section';
import { OrbitAsciiLogo } from '@/components/welcome/orbit-ascii-logo';
import { cn } from '@/lib/utils';

export interface WelcomePageProps {
  className?: string;
  /** When true, defers the account toast until the launch sequence finishes. */
  deferToast?: boolean | undefined;
  /** When true, triggers the diff entrance + scanline animation. */
  animate?: boolean | undefined;
  /** Fires once after the diff entrance + scanline complete. */
  onAnimationComplete?: (() => void) | undefined;
}

const FEATURES = [
  {
    icon: Code,
    title: 'Code',
    description:
      'Write, refactor, and debug across your entire codebase. One agent with full context — files, terminal, and history.',
  },
  {
    icon: Eye,
    title: 'Review',
    description:
      'Every diff reviewed before you ship. Catches regressions, logic errors, and edge cases humans miss.',
  },
  {
    icon: GitPullRequestArrow,
    title: 'Ship',
    description:
      'From branch to PR in one flow. Tests, commits, and deploys — without switching tools.',
  },
] as const;

/** Delay after sidebar opens before cards begin. */
const CARDS_DELAY_MS = 600;
/** Stagger between each card entrance. */
const CARD_STAGGER_MS = 200;
/** Delay after all cards are up before content crossfade starts. */
const CROSSFADE_DELAY_MS = 500;

/** ease-out-quint — smooth settle */
const ease = 'cubic-bezier(0.23,1,0.32,1)';
const FEATURE_COUNT = 3;

/**
 * Welcome page shown on startup when no workspace is open.
 * Displays a split diff visualization, feature cards, and account status.
 */
export const WelcomePage: FC<WelcomePageProps> = ({
  className,
  deferToast,
  animate,
  onAnimationComplete,
}) => {
  const [diffDone, setDiffDone] = useState(false);
  const [showCards, setShowCards] = useState(false);
  /** Which card index to reveal next (0–3, where 3 = all done). */
  const [revealIndex, setRevealIndex] = useState(-1);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    return (): void => {
      timersRef.current.forEach((t) => {
        window.clearTimeout(t);
      });
    };
  }, []);

  const handleDiffComplete = useCallback((): void => {
    setDiffDone(true);
  }, []);

  const handleAsciiComplete = useCallback((): void => {
    onAnimationComplete?.();
    const t1 = window.setTimeout(() => {
      setShowCards(true);
    }, CARDS_DELAY_MS);
    const cardsFinish = CARDS_DELAY_MS + (FEATURE_COUNT - 1) * CARD_STAGGER_MS + 700;
    const t2 = window.setTimeout(() => {
      setRevealIndex(0);
    }, cardsFinish + CROSSFADE_DELAY_MS);
    timersRef.current = [t1, t2];
  }, [onAnimationComplete]);

  const handleCardRevealComplete = useCallback((): void => {
    setRevealIndex((prev) => prev + 1);
  }, []);

  return (
    <div className={cn('flex flex-col items-center h-full w-full', 'select-none', className)}>
      {/* Spacer pushes ASCII to center */}
      <div className="flex-1 flex flex-col items-center justify-end pb-6">
        <DiffSection animate={animate} onAnimationComplete={handleDiffComplete} />
      </div>
      {/* ASCII art — always vertically centered, fixed height prevents layout shift */}
      <div className="flex items-center justify-center" style={{ minHeight: 160 }}>
        <OrbitAsciiLogo showAscii={diffDone} onAnimationComplete={handleAsciiComplete} />
      </div>
      {/* Spacer below ASCII before cards */}
      <div className="flex-1" />
      {/* Cards pinned near bottom */}
      <div className="grid grid-cols-3 gap-4 mb-8" style={{ maxWidth: 660 }}>
        {FEATURES.map((feature, i) => {
          const cardDelay = i * CARD_STAGGER_MS;
          const contentReady = revealIndex >= i;

          return (
            <div key={feature.title} className="flex flex-col gap-1.5">
              {/* Header — appears with the card */}
              <div
                className="flex items-center gap-2 px-1"
                style={{
                  opacity: showCards ? 1 : 0,
                  transform: showCards ? 'translateY(0)' : 'translateY(4px)',
                  transition: `opacity 0.5s ${ease} ${String(cardDelay)}ms, transform 0.5s ${ease} ${String(cardDelay)}ms`,
                }}
              >
                <feature.icon
                  size={14}
                  strokeWidth={1.8}
                  className="text-[var(--muted-foreground)]"
                />
                <span className="text-[12px] font-medium text-[var(--foreground)]">
                  {feature.title}
                </span>
              </div>
              {/* Card body — shows as skeleton, then crossfades to content */}
              <div
                className="flex-1 px-4 py-3 backdrop-blur-md bg-[var(--orbit-background-alpha-200)] overflow-hidden"
                style={{
                  borderRadius: 9,
                  opacity: showCards ? 1 : 0,
                  transform: showCards ? 'translateY(0)' : 'translateY(8px)',
                  transition: `opacity 0.7s ${ease} ${String(cardDelay)}ms, transform 0.7s ${ease} ${String(cardDelay)}ms`,
                }}
              >
                {/* Grid stack — skeleton + BlurReveal occupy same cell */}
                <div className="grid">
                  {/* Skeleton */}
                  <div
                    className="flex flex-col gap-2 col-start-1 row-start-1"
                    style={{
                      opacity: contentReady ? 0 : 1,
                      transition: 'opacity 0.15s ease',
                    }}
                    aria-hidden="true"
                  >
                    <div className="h-[8px] w-[85%] rounded-full bg-[var(--orbit-background-alpha-200)]" />
                    <div className="h-[8px] w-[70%] rounded-full bg-[var(--orbit-background-alpha-200)]" />
                    <div className="h-[8px] w-[50%] rounded-full bg-[var(--orbit-background-alpha-200)]" />
                  </div>
                  {/* Content — always mounted, animates sequentially */}
                  <div className="col-start-1 row-start-1">
                    <BlurReveal
                      className="text-[12px] leading-[1.5] text-[var(--muted-foreground)]"
                      trigger={contentReady}
                      onComplete={i < FEATURE_COUNT - 1 ? handleCardRevealComplete : undefined}
                    >
                      {feature.description}
                    </BlurReveal>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <AccountBanner deferToast={deferToast} />
    </div>
  );
};
