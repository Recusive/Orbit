import { createLogger } from '@orbit/common/lib';

import { easeOutCubic } from './easing';
import { sleep } from './wait-utils';

import type { CursorConfig, DemoPoint, DemoTarget, ResolvedTarget } from './types';

const logger = createLogger('DemoCursor');

const CURSOR_ID = 'orbit-demo-cursor';
const CURSOR_STYLE_ID = 'orbit-demo-cursor-styles';

const DEFAULT_CURSOR_CONFIG: Required<CursorConfig> = {
  size: 22,
  humanize: true,
  defaultDurationMs: 550,
};

interface CursorState {
  element: HTMLDivElement;
  x: number;
  y: number;
  config: Required<CursorConfig>;
}

let cursorState: CursorState | null = null;

function createAbortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

function injectCursorStyles(): void {
  const existingStyle = document.getElementById(CURSOR_STYLE_ID);
  if (existingStyle) {
    existingStyle.remove();
  }

  const style = document.createElement('style');
  style.id = CURSOR_STYLE_ID;
  style.textContent = `
    #${CURSOR_ID} {
      position: fixed;
      top: 0;
      left: 0;
      width: var(--orbit-demo-cursor-size, 22px);
      height: calc(var(--orbit-demo-cursor-size, 22px) * 1.35);
      z-index: 99999;
      pointer-events: none;
      transform-origin: 2px 2px;
      opacity: 0;
      will-change: transform, opacity;
      transition: opacity 120ms ease-out;
    }

    #${CURSOR_ID}.is-visible {
      opacity: 1;
    }

    #${CURSOR_ID}.is-clicking {
      animation: orbit-demo-cursor-click 150ms ease-out;
    }

    .orbit-demo-cursor-ripple {
      position: fixed;
      width: 24px;
      height: 24px;
      border-radius: 9999px;
      border: 2px solid rgba(99, 102, 241, 0.5);
      background: rgba(99, 102, 241, 0.1);
      pointer-events: none;
      z-index: 99998;
      transform: translate3d(-50%, -50%, 0) scale(0.6);
      opacity: 1;
      animation: orbit-demo-ripple 240ms ease-out forwards;
      will-change: transform, opacity;
    }

    .orbit-demo-highlight {
      position: fixed;
      pointer-events: none;
      z-index: 99997;
      border-radius: 10px;
      border: 2px solid rgba(99, 102, 241, 0.75);
      box-shadow: 0 0 0 6px rgba(99, 102, 241, 0.14);
      animation: orbit-demo-highlight-pulse 900ms ease-out infinite;
      will-change: transform, opacity;
    }

    @keyframes orbit-demo-cursor-click {
      0% { transform: scale(1); }
      50% { transform: scale(0.85); }
      100% { transform: scale(1); }
    }

    @keyframes orbit-demo-ripple {
      0% {
        opacity: 1;
        transform: translate3d(-50%, -50%, 0) scale(0.6);
      }
      100% {
        opacity: 0;
        transform: translate3d(-50%, -50%, 0) scale(1.55);
      }
    }

    @keyframes orbit-demo-highlight-pulse {
      0%, 100% { opacity: 0.9; }
      50% { opacity: 0.5; }
    }
  `;

  document.head.appendChild(style);
}

function createCursorSvg(): string {
  return `
    <svg viewBox="0 0 22 30" width="100%" height="100%" fill="none" aria-hidden="true">
      <path
        d="M1.6 1.5L1.6 26.8L8.2 19.9L12.2 28.3L15.8 26.7L11.9 18.4L21 18.2L1.6 1.5Z"
        fill="#FFFFFF"
        stroke="#0F172A"
        stroke-width="1.2"
        stroke-linejoin="round"
      />
    </svg>
  `;
}

function setCursorPosition(x: number, y: number): void {
  if (!cursorState) {
    return;
  }

  cursorState.x = x;
  cursorState.y = y;
  cursorState.element.style.transform = `translate3d(${String(x)}px, ${String(y)}px, 0)`;
}

function getOrCreateCursor(): CursorState {
  if (cursorState) {
    return cursorState;
  }

  return createCursor();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function humanizePoint(point: DemoPoint, rect?: DOMRect, enabled = true): DemoPoint {
  if (!enabled || !rect) {
    return point;
  }

  const maxOffset = Math.min(3, rect.width / 4, rect.height / 4);
  const offsetX = (Math.random() * 2 - 1) * maxOffset;
  const offsetY = (Math.random() * 2 - 1) * maxOffset;

  return {
    x: clamp(point.x + offsetX, rect.left, rect.right),
    y: clamp(point.y + offsetY, rect.top, rect.bottom),
  };
}

async function animateCursor(
  from: DemoPoint,
  to: DemoPoint,
  durationMs: number,
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) {
    throw createAbortError();
  }

  if (durationMs <= 0) {
    setCursorPosition(to.x, to.y);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const startedAt = performance.now();
    let rafId = 0;

    const onAbort = (): void => {
      cancelAnimationFrame(rafId);
      reject(createAbortError());
    };

    const tick = (now: number): void => {
      if (signal?.aborted) {
        cancelAnimationFrame(rafId);
        reject(createAbortError());
        return;
      }

      const elapsed = now - startedAt;
      const progress = clamp(elapsed / durationMs, 0, 1);
      const easedProgress = easeOutCubic(progress);
      const nextX = from.x + (to.x - from.x) * easedProgress;
      const nextY = from.y + (to.y - from.y) * easedProgress;

      setCursorPosition(nextX, nextY);

      if (progress >= 1) {
        signal?.removeEventListener('abort', onAbort);
        resolve();
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    rafId = requestAnimationFrame(tick);
  });
}

export function createCursor(config: CursorConfig = {}): CursorState {
  destroyCursor();
  injectCursorStyles();

  const mergedConfig: Required<CursorConfig> = {
    ...DEFAULT_CURSOR_CONFIG,
    ...config,
  };

  const element = document.createElement('div');
  element.id = CURSOR_ID;
  element.style.setProperty('--orbit-demo-cursor-size', `${String(mergedConfig.size)}px`);
  element.innerHTML = createCursorSvg();

  // Pre-position before DOM insertion to prevent a flash at (0,0).
  // Element starts invisible (CSS opacity: 0) — showCursor() adds is-visible.
  const initialX = Math.round(window.innerWidth * 0.45);
  const initialY = Math.round(window.innerHeight * 0.55);
  element.style.transform = `translate3d(${String(initialX)}px, ${String(initialY)}px, 0)`;

  document.body.appendChild(element);

  const state: CursorState = {
    element,
    x: initialX,
    y: initialY,
    config: mergedConfig,
  };

  cursorState = state;
  logger.debug('Cursor created');
  return state;
}

export function destroyCursor(): void {
  const existingCursor = document.getElementById(CURSOR_ID);
  if (existingCursor) {
    existingCursor.remove();
  }

  const existingStyle = document.getElementById(CURSOR_STYLE_ID);
  if (existingStyle) {
    existingStyle.remove();
  }

  cursorState = null;
}

export function showCursor(): void {
  const state = getOrCreateCursor();
  state.element.classList.add('is-visible');
}

export function hideCursor(): void {
  if (!cursorState) {
    return;
  }

  cursorState.element.classList.remove('is-visible');
}

export function getCursorPosition(): DemoPoint {
  const state = getOrCreateCursor();
  return { x: state.x, y: state.y };
}

export async function moveTo(
  point: DemoPoint,
  options: {
    durationMs?: number;
    signal?: AbortSignal;
    targetRect?: DOMRect;
    humanize?: boolean;
  } = {}
): Promise<void> {
  const state = getOrCreateCursor();

  const durationMs = options.durationMs ?? state.config.defaultDurationMs;
  const destination = humanizePoint(
    point,
    options.targetRect,
    options.humanize ?? state.config.humanize
  );

  await animateCursor({ x: state.x, y: state.y }, destination, durationMs, options.signal);
}

export async function clickEffect(
  point?: DemoPoint,
  signal?: AbortSignal,
  durationMs = 150
): Promise<void> {
  const state = getOrCreateCursor();

  const clickPoint = point ?? { x: state.x, y: state.y };
  state.element.classList.remove('is-clicking');
  void state.element.offsetHeight;
  state.element.classList.add('is-clicking');

  const ripple = document.createElement('div');
  ripple.className = 'orbit-demo-cursor-ripple';
  ripple.style.left = `${String(clickPoint.x)}px`;
  ripple.style.top = `${String(clickPoint.y)}px`;
  document.body.appendChild(ripple);

  const removeRipple = (): void => {
    ripple.remove();
  };

  ripple.addEventListener('animationend', removeRipple, { once: true });

  try {
    await sleep(durationMs, signal);
  } finally {
    state.element.classList.remove('is-clicking');
    removeRipple();
  }
}

export async function highlight(
  target: HTMLElement,
  durationMs = 1_200,
  signal?: AbortSignal
): Promise<void> {
  const rect = target.getBoundingClientRect();
  const highlightElement = document.createElement('div');
  highlightElement.className = 'orbit-demo-highlight';
  highlightElement.style.left = `${String(rect.left - 6)}px`;
  highlightElement.style.top = `${String(rect.top - 6)}px`;
  highlightElement.style.width = `${String(rect.width + 12)}px`;
  highlightElement.style.height = `${String(rect.height + 12)}px`;

  document.body.appendChild(highlightElement);

  try {
    await sleep(durationMs, signal);
  } finally {
    highlightElement.remove();
  }
}

/** Find the first visible match for a selector. */
export function queryVisible(selector: string): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(selector);

  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();
    const style = window.getComputedStyle(candidate);
    if (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0
    ) {
      return candidate;
    }
  }

  return null;
}

export function resolveTarget(target: DemoTarget): ResolvedTarget {
  if (typeof target !== 'string') {
    return {
      el: null,
      point: target,
    };
  }

  const element = queryVisible(target);
  if (!element) {
    logger.warn(`[Demo] Target not found (or not visible): ${target}, skipping step`);
    return {
      el: null,
      point: { x: 0, y: 0 },
      skipped: true,
    };
  }

  const rect = element.getBoundingClientRect();
  return {
    el: element,
    rect,
    point: {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    },
  };
}
