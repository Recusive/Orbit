/**
 * Frame Attribution Monitor
 *
 * Tracks FPS via requestAnimationFrame and attributes frame drops to
 * specific operations. When a frame exceeds the refresh-rate budget
 * (8.3ms at 120Hz), the monitor reads all measures recorded during
 * that frame and reports what consumed the time.
 *
 * Other code instruments hot paths with `markOperation('name')`.
 * React subtrees are wrapped with `<Profiler onRender={onProfilerRender}>`.
 * Both write to a shared measure buffer that the frame loop drains.
 *
 * Dev-only — every public function no-ops in production builds so
 * call-sites don't need conditional guards.
 */

// ── Types ────────────────────────────────────────────────────────────

interface PerfMeasure {
  name: string;
  start: number;
  duration: number;
}

export interface Attribution {
  name: string;
  totalMs: number;
  count: number;
}

export interface FrameDrop {
  timestamp: number;
  durationMs: number;
  budgetMs: number;
  jsMs: number;
  browserMs: number;
  attribution: Attribution[];
}

export interface FrameMonitorState {
  fps: number;
  frameBudgetMs: number;
  recentDrops: readonly FrameDrop[];
  isRunning: boolean;
}

type FrameListener = (state: FrameMonitorState) => void;

// ── Constants ────────────────────────────────────────────────────────

const BUDGET_120HZ = 8.33;
const BUDGET_60HZ = 16.67;
const FPS_WINDOW = 60;
// No cap — keep full history so the entire session can be reviewed.
const SLOW_MULTIPLIER = 1.5;
const MIN_MEASURE_MS = 0.3;

// ── State ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-empty-function -- intentional no-op for production code paths
const NOOP = (): void => {};

let measures: PerfMeasure[] = [];
let listeners: FrameListener[] = [];
let frameTimes: number[] = [];
let frameIdx = 0;
let lastFrameT = 0;
let lastTickEndT = 0;
let raf = 0;

const state: FrameMonitorState = {
  fps: 0,
  frameBudgetMs: BUDGET_120HZ,
  recentDrops: [],
  isRunning: false,
};

// Mutable copy of drops so we can push without replacing the readonly array
let drops: FrameDrop[] = [];

// ── Internal ─────────────────────────────────────────────────────────

function detectBudget(): number {
  if (frameTimes.length < 20) return BUDGET_120HZ;
  let sum = 0;
  for (const t of frameTimes) sum += t;
  return sum / frameTimes.length > 12 ? BUDGET_60HZ : BUDGET_120HZ;
}

function drainMeasures(): Attribution[] {
  if (measures.length === 0) return [];

  const groups = new Map<string, { totalMs: number; count: number }>();
  for (const m of measures) {
    const g = groups.get(m.name);
    if (g !== undefined) {
      g.totalMs += m.duration;
      g.count += 1;
    } else {
      groups.set(m.name, { totalMs: m.duration, count: 1 });
    }
  }
  measures = [];

  return Array.from(groups.entries())
    .map(([name, g]) => ({ name, totalMs: Math.round(g.totalMs * 10) / 10, count: g.count }))
    .sort((a, b) => b.totalMs - a.totalMs);
}

function tick(now: number): void {
  if (lastFrameT > 0) {
    const dt = now - lastFrameT;

    // JS vs browser split: time between last tick END and this tick START
    // is browser work (layout, paint, compositing, idle). Everything inside
    // our rAF callbacks is JS.
    const browserTime = lastTickEndT > 0 ? Math.max(0, now - lastTickEndT) : 0;
    const jsTime = Math.max(0, dt - browserTime);

    frameTimes[frameIdx % FPS_WINDOW] = dt;
    frameIdx += 1;

    const n = Math.min(frameIdx, FPS_WINDOW);
    let sum = 0;
    for (let i = 0; i < n; i += 1) sum += frameTimes[i] ?? 0;
    state.fps = Math.round(1000 / (sum / n));
    state.frameBudgetMs = detectBudget();

    const threshold = state.frameBudgetMs * SLOW_MULTIPLIER;
    if (dt > threshold) {
      const attribution = drainMeasures();
      const drop: FrameDrop = {
        timestamp: now,
        durationMs: Math.round(dt * 10) / 10,
        budgetMs: Math.round(state.frameBudgetMs * 100) / 100,
        jsMs: Math.round(jsTime * 10) / 10,
        browserMs: Math.round(browserTime * 10) / 10,
        attribution,
      };
      drops.push(drop);
      state.recentDrops = drops;
    } else {
      // Clear even on fast frames to prevent accumulation
      measures = [];
    }

    for (const fn of listeners) fn(state);
  }

  lastFrameT = now;
  lastTickEndT = performance.now();
  raf = requestAnimationFrame(tick);
}

// ── Public API ───────────────────────────────────────────────────────

/** Start the rAF frame loop. Returns a cleanup function. */
export function startFrameMonitor(): () => void {
  if (!import.meta.env.DEV) return NOOP;
  if (state.isRunning) return NOOP;

  state.isRunning = true;
  lastFrameT = 0;
  frameTimes = new Array<number>(FPS_WINDOW).fill(0);
  frameIdx = 0;
  drops = [];
  state.recentDrops = drops;
  raf = requestAnimationFrame(tick);

  return (): void => {
    cancelAnimationFrame(raf);
    state.isRunning = false;
  };
}

/** Subscribe to state changes (fires once per frame). Returns unsubscribe. */
export function subscribeFrameMonitor(listener: FrameListener): () => void {
  if (!import.meta.env.DEV) return NOOP;
  listeners.push(listener);
  return (): void => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

/** Read current state (non-reactive). */
export function getFrameMonitorState(): Readonly<FrameMonitorState> {
  return state;
}

/**
 * Mark a synchronous operation for frame attribution.
 * Call the returned function when the operation finishes.
 *
 * @example
 *   const end = markOperation('store-commit');
 *   doExpensiveWork();
 *   end();
 */
export function markOperation(name: string): () => void {
  if (!import.meta.env.DEV) return NOOP;
  const start = performance.now();
  return (): void => {
    const duration = performance.now() - start;
    if (duration >= MIN_MEASURE_MS) {
      measures.push({ name, start, duration });
    }
  };
}

/**
 * Record a zero-duration event for frame attribution.
 * Use for decision points (cache hit/miss, path taken, bail conditions)
 * where knowing THAT it happened matters more than how long it took.
 *
 * @example
 *   markEvent('cache-MISS');
 *   markEvent('prefetch-bail-empty');
 */
export function markEvent(name: string): void {
  if (!import.meta.env.DEV) return;
  measures.push({ name, start: performance.now(), duration: 0 });
}

/**
 * React Profiler onRender callback factory.
 * Wrap key subtrees: `<Profiler id="name" onRender={onProfilerRender}>`
 *
 * Writes to the measure buffer so the frame loop can attribute React
 * render cost to specific component trees.
 */
export function onProfilerRender(
  id: string,
  _phase: 'mount' | 'update' | 'nested-update',
  actualDuration: number,
  _baseDuration: number,
  startTime: number
): void {
  if (!import.meta.env.DEV) return;
  if (actualDuration >= MIN_MEASURE_MS) {
    measures.push({
      name: `react:${id}`,
      start: startTime,
      duration: actualDuration,
    });
  }
}

/** Clear the drop log (e.g. after switching focus). */
export function clearDrops(): void {
  drops = [];
  state.recentDrops = drops;
}
