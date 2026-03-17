import { useCallback, useEffect, useRef } from 'react';

import type { FC } from 'react';

function DiffCode(): React.JSX.Element {
  return (
    <div className="diff-container">
      {/* LEFT: deletions — old way */}
      <div className="diff-side side-old">
        <div className="dl">
          <span className="ln">01</span>
          <span className="c">
            <span className="m">{'/**'}</span>
          </span>
        </div>
        <div className="dl hl">
          <span className="ln">02</span>
          <span className="c">
            <span className="dh-r">
              <span className="m">{' * One surface. Copy-paste context.'}</span>
            </span>
          </span>
        </div>
        <div className="dl hl">
          <span className="ln">03</span>
          <span className="c">
            <span className="dh-r">
              <span className="m">{" * The agent can't see your app."}</span>
            </span>
          </span>
        </div>
        <div className="dl">
          <span className="ln">04</span>
          <span className="c">
            <span className="m"> */</span>
          </span>
        </div>
        <div className="dl">
          <span className="ln">05</span>
          <span className="c">
            <span className="k">export const</span> <span className="f">Workspace</span>{' '}
            <span className="o">=</span> <span className="w">{'() => {'}</span>
          </span>
        </div>
        <div className="dl">
          <span className="ln">06</span>
          <span className="c">
            <span className="w">{'  <'}</span>
            <span className="v">Dev.Environment</span>
            <span className="w">{'>'}</span>
          </span>
        </div>
        <div className="dl hl">
          <span className="ln">07</span>
          <span className="c">
            <span className="w">{'    <'}</span>
            <span className="dh-r">
              <span className="k">EditorOnly</span>
            </span>
            <span className="w">{' />'}</span>
          </span>
        </div>
        <div className="dl hl">
          <span className="ln">08</span>
          <span className="c">
            <span className="w">{'    <'}</span>
            <span className="dh-r">
              <span className="k">PastedLogs</span>
            </span>
            <span className="w">{' />'}</span>
          </span>
        </div>
        <div className="dl hl">
          <span className="ln">09</span>
          <span className="c">
            <span className="w">{'    <'}</span>
            <span className="dh-r">
              <span className="k">TabSwitch</span>
            </span>
            <span className="w">{' />'}</span>
          </span>
        </div>
        <div className="dl">
          <span className="ln">10</span>
          <span className="c">
            <span className="w">{'  </'}</span>
            <span className="v">Dev.Environment</span>
            <span className="w">{'>'}</span>
          </span>
        </div>
        <div className="dl">
          <span className="ln">11</span>
          <span className="c">
            <span className="w">{'}'}</span>
            <span className="m">;</span>
          </span>
        </div>
      </div>

      {/* RIGHT: additions — Orbit way */}
      <div className="diff-side side-new">
        <div className="dl">
          <span className="ln">01</span>
          <span className="c">
            <span className="m">{'/**'}</span>
          </span>
        </div>
        <div className="dl hl">
          <span className="ln">02</span>
          <span className="c">
            <span className="dh-g">
              <span className="m">{' * Every surface. Full context.'}</span>
            </span>
          </span>
        </div>
        <div className="dl hl">
          <span className="ln">03</span>
          <span className="c">
            <span className="dh-g">
              <span className="m">{' * The agent sees your running app.'}</span>
            </span>
          </span>
        </div>
        <div className="dl">
          <span className="ln">04</span>
          <span className="c">
            <span className="m"> */</span>
          </span>
        </div>
        <div className="dl">
          <span className="ln">05</span>
          <span className="c">
            <span className="k">export const</span> <span className="f">Workspace</span>{' '}
            <span className="o">=</span> <span className="w">{'() => {'}</span>
          </span>
        </div>
        <div className="dl">
          <span className="ln">06</span>
          <span className="c">
            <span className="w">{'  <'}</span>
            <span className="v">Dev.Environment</span>
            <span className="w">{'>'}</span>
          </span>
        </div>
        <div className="dl hl">
          <span className="ln">07</span>
          <span className="c">
            <span className="w">{'    <'}</span>
            <span className="dh-g">
              <span className="s">Browser</span>
            </span>
            <span className="w">{' />'}</span>
          </span>
        </div>
        <div className="dl hl">
          <span className="ln">08</span>
          <span className="c">
            <span className="w">{'    <'}</span>
            <span className="dh-g">
              <span className="s">Terminal</span>
            </span>
            <span className="w">{' />'}</span>
          </span>
        </div>
        <div className="dl hl">
          <span className="ln">09</span>
          <span className="c">
            <span className="w">{'    <'}</span>
            <span className="dh-g">
              <span className="s">Vault</span>
            </span>
            <span className="w">{' />'}</span>
          </span>
        </div>
        <div className="dl">
          <span className="ln">10</span>
          <span className="c">
            <span className="w">{'  </'}</span>
            <span className="v">Dev.Environment</span>
            <span className="w">{'>'}</span>
          </span>
        </div>
        <div className="dl">
          <span className="ln">11</span>
          <span className="c">
            <span className="w">{'}'}</span>
            <span className="m">;</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Animation engine ────────────────────────────────────────────────

const LINE_COUNT = 11;
const LINGER_MS = 150;
const SWEEP_MS = 900;
const REVERSE_MS = 600;
const ENTER_ANIM_MS = 900;

function easeOutQuint(t: number): number {
  return 1 - (1 - t) ** 5;
}
function easeInQuint(t: number): number {
  return t ** 5;
}

function collectLineGroups(wrapper: HTMLElement): Element[][] {
  const groups: Element[][] = Array.from({ length: LINE_COUNT }, () => []);
  wrapper.querySelectorAll('.diff-side').forEach((side) => {
    side.querySelectorAll(':scope > .dl').forEach((dl, i) => {
      groups[i]?.push(dl);
    });
  });
  return groups;
}

/**
 * Promise-based sweep. Resolves when the animation finishes.
 * `direction`: 'forward' scans top→bottom adding .scanned,
 *              'reverse' scans bottom→top removing .scanned.
 */
function sweep(
  sl: HTMLElement,
  lineGroups: Element[][],
  lineHeight: number,
  direction: 'forward' | 'reverse'
): Promise<void> {
  return new Promise((resolve) => {
    const totalDistance = LINE_COUNT * lineHeight;
    let t0 = -1;

    if (direction === 'forward') {
      let revealed = 0;
      sl.style.opacity = '0';
      sl.style.transform = 'translateY(0px)';

      const tick = (now: number): void => {
        if (t0 < 0) t0 = now;
        const elapsed = now - t0;

        if (elapsed < LINGER_MS) {
          sl.style.opacity = '1';
          sl.style.transform = 'translateY(0px)';
          requestAnimationFrame(tick);
          return;
        }

        const progress = Math.min((elapsed - LINGER_MS) / SWEEP_MS, 1);
        const y = easeOutQuint(progress) * totalDistance;

        sl.style.transform = `translateY(${String(y)}px)`;
        sl.style.opacity = progress > 0.92 ? String(1 - (progress - 0.92) / 0.08) : '1';

        const passedIndex = Math.min(Math.floor(y / lineHeight), LINE_COUNT - 1);
        for (let i = revealed; i <= passedIndex; i++) {
          lineGroups[i]?.forEach((el) => {
            el.classList.add('scanned');
          });
        }
        revealed = passedIndex + 1;

        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          sl.style.opacity = '0';
          lineGroups.forEach((g) => {
            g.forEach((el) => {
              el.classList.add('scanned');
            });
          });
          resolve();
        }
      };
      requestAnimationFrame(tick);
    } else {
      let unrevealed = LINE_COUNT - 1;
      sl.style.opacity = '1';
      sl.style.transform = `translateY(${String(totalDistance)}px)`;

      const tick = (now: number): void => {
        if (t0 < 0) t0 = now;
        const progress = Math.min((now - t0) / REVERSE_MS, 1);
        const y = totalDistance * (1 - easeInQuint(progress));

        sl.style.transform = `translateY(${String(y)}px)`;
        sl.style.opacity = progress > 0.92 ? String(1 - (progress - 0.92) / 0.08) : '1';

        const passedIndex = Math.max(Math.ceil(y / lineHeight) - 1, 0);
        for (let i = unrevealed; i > passedIndex; i--) {
          lineGroups[i]?.forEach((el) => {
            el.classList.remove('scanned');
          });
        }
        unrevealed = passedIndex;

        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          sl.style.opacity = '0';
          lineGroups.forEach((g) => {
            g.forEach((el) => {
              el.classList.remove('scanned');
            });
          });
          resolve();
        }
      };
      requestAnimationFrame(tick);
    }
  });
}

// ── Component ───────────────────────────────────────────────────────

interface DiffSectionProps {
  /** When true, triggers the entrance + scanline animation. */
  readonly animate?: boolean | undefined;
  /** Fires once after entrance + scanline complete. */
  readonly onAnimationComplete?: (() => void) | undefined;
}

export const DiffSection: FC<DiffSectionProps> = ({ animate = true, onAnimationComplete }) => {
  const sectionRef = useRef<HTMLElement>(null);
  const pendingRef = useRef<'forward' | 'reverse' | null>(null);
  const runningRef = useRef(false);
  const destroyedRef = useRef(false);
  const onCompleteRef = useRef(onAnimationComplete);
  onCompleteRef.current = onAnimationComplete;

  const getElements = useCallback((): {
    sl: HTMLElement;
    lineGroups: Element[][];
    lineHeight: number;
  } | null => {
    const section = sectionRef.current;
    if (!section) return null;
    const wrapper = section.querySelector<HTMLElement>('.diff-wrapper');
    if (!wrapper) return null;
    const sl = wrapper.querySelector<HTMLElement>('.scanline');
    if (!sl) return null;
    const firstLine = wrapper.querySelector<HTMLElement>('.diff-sharp .dl');
    if (!firstLine) return null;
    const lineHeight = firstLine.offsetHeight;
    if (lineHeight === 0) return null;
    sl.style.height = `${String(lineHeight)}px`;
    return { sl, lineGroups: collectLineGroups(wrapper), lineHeight };
  }, []);

  const runSweep = useCallback(
    async (direction: 'forward' | 'reverse'): Promise<void> => {
      if (destroyedRef.current) return;

      if (runningRef.current) {
        pendingRef.current = direction;
        return;
      }

      const els = getElements();
      if (!els) return;

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const cls = direction === 'forward' ? 'add' : 'remove';
        els.lineGroups.forEach((g) => {
          g.forEach((el) => {
            el.classList[cls]('scanned');
          });
        });
        return;
      }

      runningRef.current = true;
      await sweep(els.sl, els.lineGroups, els.lineHeight, direction);
      runningRef.current = false;

      if (destroyedRef.current as boolean) return;
      const next = pendingRef.current;
      pendingRef.current = null;
      if (next !== null) {
        void runSweep(next);
      }
    },
    [getElements]
  );

  // Entrance: triggered when `animate` becomes true
  useEffect(() => {
    if (!animate) return;
    destroyedRef.current = false;

    const section = sectionRef.current;
    if (!section) return;
    const wrapper = section.querySelector<HTMLElement>('.diff-wrapper');
    if (!wrapper) return;

    // Reset for strict-mode double-mount
    wrapper.classList.remove('diff-enter');
    wrapper.querySelectorAll('.scanned').forEach((el) => {
      el.classList.remove('scanned');
    });

    // Reduced motion: show everything immediately, fire callback
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      wrapper.classList.add('diff-enter');
      const els = getElements();
      if (els) {
        els.lineGroups.forEach((g) => {
          g.forEach((el) => {
            el.classList.add('scanned');
          });
        });
      }
      onCompleteRef.current?.();
      return;
    }

    // 1. Depth entrance animation
    // Use rAF to ensure the removal above is flushed before re-adding
    const enterRaf = requestAnimationFrame(() => {
      wrapper.classList.add('diff-enter');
    });

    // 2. Scanline starts after entrance settles, then fires complete
    const scanTimeout = window.setTimeout(() => {
      if (destroyedRef.current) return;
      void runSweep('forward').then(() => {
        if (!destroyedRef.current) {
          onCompleteRef.current?.();
        }
      });
    }, ENTER_ANIM_MS);

    return (): void => {
      destroyedRef.current = true;
      cancelAnimationFrame(enterRaf);
      window.clearTimeout(scanTimeout);
    };
  }, [animate, runSweep, getElements]);

  const handleMouseEnter = useCallback((): void => {
    void runSweep('reverse');
  }, [runSweep]);

  const handleMouseLeave = useCallback((): void => {
    void runSweep('forward');
  }, [runSweep]);

  return (
    <section
      className="diff-section"
      ref={sectionRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="diff-wrapper">
        <div className="diff-panel">
          <div className="diff-glow" aria-hidden="true">
            <DiffCode />
          </div>
          <div className="diff-sharp">
            <div className="scanline" aria-hidden="true" />
            <DiffCode />
          </div>
        </div>
      </div>
    </section>
  );
};
