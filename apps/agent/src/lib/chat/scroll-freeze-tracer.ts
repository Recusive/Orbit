/**
 * Scroll Freeze Tracer
 *
 * Instrumentation for diagnosing the "fast scroll → freeze → blank screen →
 * reappears at random position" symptom in long chat virtualized lists.
 *
 * Three categories:
 *
 *   1. Periodic debug logs — rate-limited snapshots of virtualizer and
 *      velocity-scroll state. Use `logger.debug` so they're dev-only. Filter
 *      by `[ScrollFreeze]` in the console.
 *
 *   2. Smoking-gun warnings — fire when a freeze symptom is detected:
 *      blank frame, large scroll jump, measurement outlier. Use `logger.warn`
 *      so they appear in both dev and packaged builds.
 *
 *   3. Measurement ledger — tracks per-index row heights to detect when
 *      estimate/measurement divergence is large enough to destabilize the
 *      virtualizer's range calculation.
 *
 * Removal: when the freeze is fixed, delete this file and its imports in
 * chat-messages.tsx and use-velocity-scroll.ts. All integration is
 * additive — no runtime behavior changes if this module is removed.
 */
import { createLogger } from '@orbit/common/lib';

export const scrollFreezeLogger = createLogger('ScrollFreeze');

/** Log every Nth event to prevent console flooding. */
const VIRTUALIZER_LOG_EVERY_N = 10;
const VELOCITY_LOG_EVERY_N = 10;
const WHEEL_LOG_EVERY_N = 5;

/** Large-jump threshold: ratio of clientHeight that counts as a "jump". */
const LARGE_JUMP_RATIO = 1.0;

/** Measurement outlier threshold: measured/estimate ratio (2x = outlier). */
const MEASUREMENT_OUTLIER_RATIO = 2.0;

/** Maximum number of measurement outliers to log per session (prevents flood). */
const MAX_OUTLIER_LOGS = 30;

interface VirtualizerSnapshot {
  sessionKey: string;
  renderCount: number;
  virtualItemCount: number;
  rangeStart: number;
  rangeEnd: number;
  scrollOffset: number;
  totalSize: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  virtualizedRowCount: number;
  nonVirtualizedRowCount: number;
  overscan: number;
}

/**
 * Rate-limited virtualizer state snapshot. Call once per render; the helper
 * decides whether to emit based on the render counter.
 */
export function logVirtualizerState(snapshot: VirtualizerSnapshot): void {
  if (snapshot.renderCount % VIRTUALIZER_LOG_EVERY_N !== 0) {
    return;
  }
  scrollFreezeLogger.debug('virtualizer state', {
    sessionKey: snapshot.sessionKey,
    render: snapshot.renderCount,
    items: snapshot.virtualItemCount,
    range: `${String(snapshot.rangeStart)}..${String(snapshot.rangeEnd)}`,
    offset: snapshot.scrollOffset,
    total: snapshot.totalSize,
    scrollTop: snapshot.scrollTop,
    scrollHeight: snapshot.scrollHeight,
    clientHeight: snapshot.clientHeight,
    virtualizedRows: snapshot.virtualizedRowCount,
    tailRows: snapshot.nonVirtualizedRowCount,
    overscan: snapshot.overscan,
  });
}

/**
 * Blank frame detector. "Blank frame" = the virtualizer rendered zero items
 * even though there are virtualized rows and the scroll position is past the
 * first overscan zone. This is the signature of the "blank screen" symptom.
 *
 * When detected, emits a warning with full state so the user can share it
 * without re-running the repro.
 */
export function detectBlankFrame(snapshot: VirtualizerSnapshot): boolean {
  if (snapshot.virtualizedRowCount === 0) {
    return false;
  }
  if (snapshot.virtualItemCount > 0) {
    return false;
  }
  // Allow zero-item frames at the very top (nothing scrolled past yet).
  if (snapshot.scrollOffset < snapshot.clientHeight) {
    return false;
  }
  scrollFreezeLogger.warn('BLANK FRAME detected', {
    sessionKey: snapshot.sessionKey,
    render: snapshot.renderCount,
    virtualizedRows: snapshot.virtualizedRowCount,
    tailRows: snapshot.nonVirtualizedRowCount,
    scrollTop: snapshot.scrollTop,
    scrollHeight: snapshot.scrollHeight,
    clientHeight: snapshot.clientHeight,
    totalSize: snapshot.totalSize,
    overscan: snapshot.overscan,
  });
  return true;
}

/**
 * Large scroll-jump detector. Called from the native scroll event handler.
 * When scrollTop changes by more than one viewport in a single frame, it's
 * either a programmatic clamp (e.g. scrollHeight shrank) or a measurement
 * reconciliation. Either way, it's interesting for diagnosing freezes.
 */
export function detectLargeScrollJump(
  sessionKey: string,
  previousScrollTop: number,
  currentScrollTop: number,
  clientHeight: number,
  scrollHeight: number
): void {
  const delta = currentScrollTop - previousScrollTop;
  const absDelta = Math.abs(delta);
  if (clientHeight <= 0 || absDelta < clientHeight * LARGE_JUMP_RATIO) {
    return;
  }
  scrollFreezeLogger.warn('LARGE SCROLL JUMP', {
    sessionKey,
    previousScrollTop,
    currentScrollTop,
    delta,
    viewport: clientHeight,
    scrollHeight,
    ratio: Math.round((absDelta / clientHeight) * 10) / 10,
  });
}

/**
 * Per-index measurement ledger. Tracks the last N measured sizes so the
 * outlier detector can compare a fresh measurement against the running
 * history. Lives as a mutable ref on the consumer.
 */
export interface MeasurementLedger {
  sizesByIndex: Map<number, number>;
  outlierLogCount: number;
}

export function createMeasurementLedger(): MeasurementLedger {
  return {
    sizesByIndex: new Map(),
    outlierLogCount: 0,
  };
}

/**
 * Record a measurement and detect outliers against the previous measurement
 * for the same index. Outliers are logged once up to MAX_OUTLIER_LOGS per
 * ledger lifetime.
 */
export function recordMeasurement(
  ledger: MeasurementLedger,
  sessionKey: string,
  index: number,
  measuredSize: number,
  estimatedSize: number
): void {
  const previous = ledger.sizesByIndex.get(index);
  ledger.sizesByIndex.set(index, measuredSize);
  if (measuredSize <= 0 || estimatedSize <= 0) {
    return;
  }
  const ratio = Math.max(measuredSize / estimatedSize, estimatedSize / measuredSize);
  if (ratio < MEASUREMENT_OUTLIER_RATIO) {
    return;
  }
  if (ledger.outlierLogCount >= MAX_OUTLIER_LOGS) {
    return;
  }
  ledger.outlierLogCount += 1;
  scrollFreezeLogger.warn('MEASUREMENT OUTLIER', {
    sessionKey,
    index,
    estimated: Math.round(estimatedSize),
    measured: Math.round(measuredSize),
    previous: previous === undefined ? null : Math.round(previous),
    ratio: Math.round(ratio * 10) / 10,
    outliersLogged: ledger.outlierLogCount,
  });
}

/**
 * Velocity scroll tick tracer. Rate-limited debug log of velocity state.
 * Call once per animation frame tick from the velocity scroll hook.
 */
export function logVelocityTick(
  tickCount: number,
  velocity: number,
  scrollTop: number,
  scrollHeight: number,
  compensation: number
): void {
  if (tickCount % VELOCITY_LOG_EVERY_N !== 0) {
    return;
  }
  scrollFreezeLogger.debug('velocity tick', {
    tick: tickCount,
    velocity: Math.round(velocity * 10) / 10,
    scrollTop,
    scrollHeight,
    compensation: Math.round(compensation),
  });
}

/**
 * Velocity clamp event. Fires when a wheel input would have driven velocity
 * beyond maxPxPerFrame and the hook capped it. Frequent clamps during fast
 * scroll indicate the cap is engaging — good for correlating with freezes.
 */
export function logVelocityClamp(
  tickCount: number,
  requestedVelocity: number,
  clampedVelocity: number,
  maxPxPerFrame: number
): void {
  scrollFreezeLogger.debug('velocity clamp', {
    tick: tickCount,
    requested: Math.round(requestedVelocity * 10) / 10,
    clamped: Math.round(clampedVelocity * 10) / 10,
    max: maxPxPerFrame,
  });
}

/**
 * Wheel event tracer. Rate-limited debug log of wheel inputs so we can see
 * the shape of the user's scroll gesture (delta, frequency, warmup state).
 */
export function logWheelEvent(
  wheelCount: number,
  deltaY: number,
  velocityAfter: number,
  warmupComplete: boolean
): void {
  if (wheelCount % WHEEL_LOG_EVERY_N !== 0) {
    return;
  }
  scrollFreezeLogger.debug('wheel', {
    wheel: wheelCount,
    deltaY: Math.round(deltaY),
    velocity: Math.round(velocityAfter * 10) / 10,
    warmup: warmupComplete ? 'done' : 'active',
  });
}

// ── Round 2: Deeper traces for root-cause diagnosis ──────────────────────

/**
 * Trace 1 — Full cache dump on save or load. Captures every {index, size}
 * tuple so we can compare what was saved vs what was loaded vs what the rows
 * actually measure at render time. Answers "is the cache wrong?"
 */
interface CacheDumpEntry {
  index: number;
  size: number;
  key?: string;
}

export function logCacheDump(
  phase: 'save' | 'load',
  sessionKey: string,
  entries: readonly CacheDumpEntry[],
  meta: {
    viewportWidth: number | null;
    messageCount: number;
    source: string;
  }
): void {
  scrollFreezeLogger.warn(`cache ${phase}`, {
    sessionKey,
    phase,
    entryCount: entries.length,
    viewportWidth: meta.viewportWidth,
    messageCount: meta.messageCount,
    source: meta.source,
    entries: entries.map((entry) => ({
      i: entry.index,
      size: Math.round(entry.size),
      ...(entry.key !== undefined ? { key: entry.key } : {}),
    })),
  });
}

/**
 * Trace 2 — Raw measurement wrapper. Logs every TanStack measureElement call
 * with the element's actual DOM height, TanStack's reported size, the
 * previously-cached size, and whether this is a fresh or re-measurement.
 * Answers "are measurements stable?" and "is the DOM agreeing with the
 * virtualizer?"
 */
export function logRawMeasurement(
  sessionKey: string,
  index: number,
  domHeight: number,
  reportedSize: number,
  previousCachedSize: number | undefined,
  isFresh: boolean,
  renderCount: number
): void {
  scrollFreezeLogger.debug('raw measurement', {
    sessionKey,
    render: renderCount,
    i: index,
    dom: Math.round(domHeight),
    reported: Math.round(reportedSize),
    prev: previousCachedSize === undefined ? null : Math.round(previousCachedSize),
    delta: previousCachedSize === undefined ? null : Math.round(reportedSize - previousCachedSize),
    fresh: isFresh,
    domVsReported: Math.round(domHeight - reportedSize),
  });
}

/**
 * Trace 3 — `rowVirtualizer.measure()` call instrumentation. Logs before/after
 * cache length and total size so we can verify whether `measure()` is actually
 * wiping cached measurements. Answers "does measure() nuke the cache?"
 */
export function logMeasureCall(
  sessionKey: string,
  callSite: string,
  before: { cacheLength: number; totalSize: number },
  after: { cacheLength: number; totalSize: number },
  renderCount: number
): void {
  scrollFreezeLogger.warn('measure() called', {
    sessionKey,
    render: renderCount,
    callSite,
    beforeLen: before.cacheLength,
    beforeTotal: Math.round(before.totalSize),
    afterLen: after.cacheLength,
    afterTotal: Math.round(after.totalSize),
    lenDelta: after.cacheLength - before.cacheLength,
    totalDelta: Math.round(after.totalSize - before.totalSize),
  });
}

/**
 * Trace 4 — `shouldAdjustScrollPositionOnItemSizeChange` full invocation log.
 * Logs every call with full parameters and the decision reason, including the
 * `isScrolling` state. Answers "is the adjustment path active during scroll?"
 */
export function logShouldAdjustCall(
  sessionKey: string,
  params: {
    itemIndex: number;
    itemStart: number;
    itemEnd: number;
    delta: number;
    scrollOffset: number;
    viewportHeight: number;
    isScrolling: boolean;
    totalSize: number;
  },
  decision: boolean,
  reason: string
): void {
  scrollFreezeLogger.debug('shouldAdjust', {
    sessionKey,
    i: params.itemIndex,
    itemRange: `${String(Math.round(params.itemStart))}..${String(Math.round(params.itemEnd))}`,
    delta: Math.round(params.delta),
    offset: Math.round(params.scrollOffset),
    viewport: Math.round(params.viewportHeight),
    scrolling: params.isScrolling,
    total: Math.round(params.totalSize),
    decision,
    reason,
  });
}

/**
 * Trace 5 — Row divergence between virtualizer's cached size and DOM reality.
 * Called periodically to compare what the virtualizer thinks rows are sized vs
 * what they actually measure in the DOM. Significant drift means the cache is
 * silently wrong.
 */
interface RowDivergence {
  index: number;
  reported: number;
  dom: number;
  delta: number;
}

const DIVERGENCE_THRESHOLD_PX = 10;

export function logRowDivergence(
  sessionKey: string,
  renderCount: number,
  divergences: readonly RowDivergence[]
): void {
  if (divergences.length === 0) return;
  const significant = divergences.filter((d) => Math.abs(d.delta) > DIVERGENCE_THRESHOLD_PX);
  if (significant.length === 0) return;
  scrollFreezeLogger.warn('row divergence', {
    sessionKey,
    render: renderCount,
    rowsChecked: divergences.length,
    significantCount: significant.length,
    divergences: significant.map((d) => ({
      i: d.index,
      reported: Math.round(d.reported),
      dom: Math.round(d.dom),
      delta: Math.round(d.delta),
    })),
  });
}

/**
 * Trace 6 — Freeze snapshot. Dumps the FULL state of the virtualizer, DOM,
 * and scroll position when instability is detected. Designed to be a forensic
 * capture — one big datadump per freeze event.
 */
export interface FreezeSnapshotData {
  readonly trigger: string;
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly virtualizerTotal: number;
  readonly rangeStart: number;
  readonly rangeEnd: number;
  readonly itemCount: number;
  readonly measurementsCache: readonly {
    index: number;
    size: number;
    start: number;
    end: number;
  }[];
  readonly domRows: readonly {
    index: number;
    height: number;
    top: number;
  }[];
}

export function dumpFreezeSnapshot(
  sessionKey: string,
  renderCount: number,
  data: FreezeSnapshotData
): void {
  scrollFreezeLogger.error('FREEZE SNAPSHOT', {
    sessionKey,
    render: renderCount,
    trigger: data.trigger,
    scrollTop: data.scrollTop,
    scrollHeight: data.scrollHeight,
    clientHeight: data.clientHeight,
    virtualizerTotal: data.virtualizerTotal,
    divergence: data.scrollHeight - data.virtualizerTotal,
    range: `${String(data.rangeStart)}..${String(data.rangeEnd)}`,
    itemCount: data.itemCount,
    measurementCache: data.measurementsCache.slice(0, 60).map((m) => ({
      i: m.index,
      size: Math.round(m.size),
      start: Math.round(m.start),
      end: Math.round(m.end),
    })),
    domRows: data.domRows.map((r) => ({
      i: r.index,
      h: Math.round(r.height),
      top: Math.round(r.top),
    })),
  });
}
