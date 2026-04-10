import type { SessionSwitchStatus } from '@/stores/chat/session-switch-store';

import { findChatScroller } from '@/lib/chat/chat-selectors';
import { useChatStore } from '@/stores/chat/chat-store';
import { useSessionSwitchStore } from '@/stores/chat/session-switch-store';

const MAX_TRACE_RECORDS = 50;
const MAX_TRACE_EVENTS = 300;
const POST_COMMIT_DRIFT_WINDOW_MS = 1000;
const POST_COMMIT_DRIFT_CORRECTIVE_MS = 500;
const POST_COMMIT_DRIFT_POLL_MS = 100;
const MATERIAL_SCROLL_DELTA_PX = 16;
const DRIFT_BOTTOM_TOLERANCE_PX = 4;

export type SessionSwitchAbortReason =
  | 'superseded_by_new_request'
  | 'startup_restore_replayed'
  | 'missing_surface'
  | 'hidden_timeout'
  | 'visible_timeout'
  | 'stale_generation'
  | 'stale_workspace_epoch'
  | 'stale_conversation_generation'
  | 'explicit_phase_reset'
  | 'invalid_ready_instance'
  | 'unexpected_pending_clear'
  | 'verification_aborted';

export interface SessionSwitchTraceGeometry {
  readonly scrollTop: number | null;
  readonly clientHeight: number | null;
  readonly scrollHeight: number | null;
  readonly bottomTop: number | null;
  readonly renderedRowCount: number | null;
  readonly tailSentinelRendered: boolean | null;
  readonly layoutPendingCount: number | null;
  readonly lastLayoutMutationAt: number | null;
  readonly overscanPhase: string | null;
  readonly sizeCacheRestored: boolean | null;
  readonly restorePath: 'exact' | 'warm' | 'cold' | null;
}

interface SessionSwitchTraceEvent {
  readonly abortReason?: SessionSwitchAbortReason;
  readonly data?: Record<string, unknown>;
  readonly event: string;
  readonly geometry: SessionSwitchTraceGeometry;
  readonly instanceGeneration: number | null;
  readonly pendingPhase: SessionSwitchStatus;
  readonly pendingSessionId: string | null;
  readonly requestId: number | null;
  readonly sessionId: string | null;
  readonly shownSessionId: string | null;
  readonly timestamp: number;
  readonly verificationKey: string | null;
  readonly verificationPhase: string | null;
}

interface SessionSwitchTraceRecord {
  readonly events: SessionSwitchTraceEvent[];
  readonly requestId: number | null;
  readonly sessionId: string | null;
  readonly startedAt: number;
}

interface TraceableWindow extends Window {
  __dumpLatestSwitchTrace?: () => SessionSwitchTraceRecord | null;
  __dumpSessionSwitchTrace?: (sessionId?: string) => SessionSwitchTraceRecord[];
}

const traceBuffer: SessionSwitchTraceRecord[] = [];
const shownRequestBySessionId = new Map<string, number>();
const driftMonitorCleanupBySessionId = new Map<string, () => void>();

function getChatTraceRoot(sessionId: string | null): HTMLElement | null {
  if (!sessionId || typeof document === 'undefined') {
    return null;
  }

  const escapedSessionId =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(sessionId)
      : sessionId.replaceAll('"', '\\"');

  return document.querySelector<HTMLElement>(
    `[data-session-instance="${escapedSessionId}"] [data-switch-trace-root="true"]`
  );
}

function getSessionScrollerElement(sessionId: string | null): HTMLElement | null {
  if (!sessionId || typeof document === 'undefined') {
    return null;
  }

  const escapedSessionId =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(sessionId)
      : sessionId.replaceAll('"', '\\"');
  const instance = document.querySelector<HTMLElement>(
    `[data-session-instance="${escapedSessionId}"]`
  );

  return instance ? findChatScroller(instance) : null;
}

function readTraceRootNumber(traceRoot: HTMLElement | null, key: string): number | null {
  const raw = traceRoot?.dataset[key];
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function readTraceRootBoolean(traceRoot: HTMLElement | null, key: string): boolean | null {
  const raw = traceRoot?.dataset[key];
  if (!raw) {
    return null;
  }
  return raw === 'true';
}

export function getSessionSwitchGeometrySnapshot(
  sessionId: string | null
): SessionSwitchTraceGeometry {
  if (!sessionId || typeof document === 'undefined') {
    return {
      scrollTop: null,
      clientHeight: null,
      scrollHeight: null,
      bottomTop: null,
      renderedRowCount: null,
      tailSentinelRendered: null,
      layoutPendingCount: null,
      lastLayoutMutationAt: null,
      overscanPhase: null,
      sizeCacheRestored: null,
      restorePath: null,
    };
  }

  const escapedSessionId =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(sessionId)
      : sessionId.replaceAll('"', '\\"');
  const instance = document.querySelector<HTMLElement>(
    `[data-session-instance="${escapedSessionId}"]`
  );
  const scroller = instance ? findChatScroller(instance) : null;
  const traceRoot = getChatTraceRoot(sessionId);
  const session = useChatStore.getState().sessions[sessionId];
  const scrollHeight = scroller?.scrollHeight ?? null;
  const clientHeight = scroller?.clientHeight ?? null;

  return {
    scrollTop: scroller?.scrollTop ?? null,
    clientHeight,
    scrollHeight,
    bottomTop:
      scrollHeight !== null && clientHeight !== null
        ? Math.max(0, scrollHeight - clientHeight)
        : null,
    renderedRowCount: readTraceRootNumber(traceRoot, 'renderedRowCount'),
    tailSentinelRendered: readTraceRootBoolean(traceRoot, 'tailSentinelRendered'),
    layoutPendingCount: session?.layoutPendingCount ?? null,
    lastLayoutMutationAt: session?.lastLayoutMutationAt ?? null,
    overscanPhase: traceRoot?.dataset['overscanPhase'] ?? null,
    sizeCacheRestored: readTraceRootBoolean(traceRoot, 'sizeCacheRestored'),
    restorePath:
      (traceRoot?.dataset['restorePath'] as SessionSwitchTraceGeometry['restorePath']) ?? null,
  };
}

function getOrCreateTraceRecord(
  requestId: number | null,
  sessionId: string | null
): SessionSwitchTraceRecord {
  const existing = traceBuffer.find(
    (record) => record.requestId === requestId && record.sessionId === sessionId
  );
  if (existing) {
    return existing;
  }

  const created: SessionSwitchTraceRecord = {
    requestId,
    sessionId,
    startedAt: Date.now(),
    events: [],
  };
  traceBuffer.unshift(created);
  if (traceBuffer.length > MAX_TRACE_RECORDS) {
    traceBuffer.length = MAX_TRACE_RECORDS;
  }
  return created;
}

export function recordSessionSwitchTrace(input: {
  readonly abortReason?: SessionSwitchAbortReason;
  readonly data?: Record<string, unknown>;
  readonly event: string;
  readonly geometry?: SessionSwitchTraceGeometry;
  readonly instanceGeneration?: number | null;
  readonly requestId?: number | null;
  readonly sessionId?: string | null;
  readonly verificationKey?: string | null;
  readonly verificationPhase?: string | null;
}): void {
  const switchState = useSessionSwitchStore.getState();
  const requestId = input.requestId ?? switchState.requestId;
  const sessionId =
    input.sessionId ??
    switchState.pending?.sessionId ??
    useChatStore.getState().activeSessionId ??
    null;
  const traceEvent: SessionSwitchTraceEvent = {
    event: input.event,
    timestamp: Date.now(),
    requestId,
    sessionId,
    instanceGeneration: input.instanceGeneration ?? null,
    verificationPhase: input.verificationPhase ?? null,
    verificationKey: input.verificationKey ?? null,
    shownSessionId: useChatStore.getState().activeSessionId,
    pendingSessionId: switchState.pending?.sessionId ?? null,
    pendingPhase: switchState.status,
    geometry: input.geometry ?? getSessionSwitchGeometrySnapshot(sessionId),
    ...(input.data ? { data: input.data } : {}),
    ...(input.abortReason ? { abortReason: input.abortReason } : {}),
  };

  const record = getOrCreateTraceRecord(requestId, sessionId);
  record.events.push(traceEvent);
  if (record.events.length > MAX_TRACE_EVENTS) {
    record.events.shift();
  }
}

export function setShownSessionTraceRequest(sessionId: string, requestId: number): void {
  shownRequestBySessionId.set(sessionId, requestId);
}

export function getShownSessionTraceRequest(sessionId: string): number | null {
  return shownRequestBySessionId.get(sessionId) ?? null;
}

export function clearShownSessionTraceRequest(sessionId: string): void {
  shownRequestBySessionId.delete(sessionId);
}

function logPostCommitDrift(
  requestId: number,
  sessionId: string,
  previous: SessionSwitchTraceGeometry,
  next: SessionSwitchTraceGeometry
): void {
  const scrollHeightDelta =
    next.scrollHeight !== null && previous.scrollHeight !== null
      ? next.scrollHeight - previous.scrollHeight
      : 0;
  const scrollTopDelta =
    next.scrollTop !== null && previous.scrollTop !== null
      ? next.scrollTop - previous.scrollTop
      : 0;
  const renderedRowDelta =
    next.renderedRowCount !== null && previous.renderedRowCount !== null
      ? next.renderedRowCount - previous.renderedRowCount
      : 0;
  const layoutPendingChanged = next.layoutPendingCount !== previous.layoutPendingCount;

  if (
    Math.abs(scrollHeightDelta) < MATERIAL_SCROLL_DELTA_PX &&
    Math.abs(scrollTopDelta) < MATERIAL_SCROLL_DELTA_PX &&
    renderedRowDelta === 0 &&
    !layoutPendingChanged
  ) {
    return;
  }

  recordSessionSwitchTrace({
    event: 'post_commit_drift',
    requestId,
    sessionId,
    geometry: next,
    data: {
      scrollHeightDelta,
      scrollTopDelta,
      renderedRowDelta,
      layoutPendingChanged,
    },
  });
}

export function startPostCommitDriftMonitor(requestId: number, sessionId: string): void {
  driftMonitorCleanupBySessionId.get(sessionId)?.();

  const startedAt = Date.now();
  const committed = getSessionSwitchGeometrySnapshot(sessionId);
  const committedAtBottom =
    committed.scrollTop !== null &&
    committed.bottomTop !== null &&
    committed.scrollTop >= committed.bottomTop - DRIFT_BOTTOM_TOLERANCE_PX;
  let previous = committed;
  const timerId = window.setInterval(() => {
    let next = getSessionSwitchGeometrySnapshot(sessionId);
    const withinCorrectiveWindow = Date.now() - startedAt <= POST_COMMIT_DRIFT_CORRECTIVE_MS;

    if (
      withinCorrectiveWindow &&
      committedAtBottom &&
      next.scrollTop !== null &&
      next.bottomTop !== null &&
      next.scrollTop < next.bottomTop - DRIFT_BOTTOM_TOLERANCE_PX
    ) {
      const scroller = getSessionScrollerElement(sessionId);
      if (scroller) {
        const previousScrollTop = next.scrollTop;
        scroller.scrollTop = next.bottomTop;
        next = getSessionSwitchGeometrySnapshot(sessionId);
        recordSessionSwitchTrace({
          event: 'drift_corrected',
          requestId,
          sessionId,
          geometry: next,
          data: {
            previousScrollTop,
            correctedScrollTop: next.scrollTop,
            bottomTop: next.bottomTop,
          },
        });
      }
    }

    logPostCommitDrift(requestId, sessionId, previous, next);
    previous = next;
  }, POST_COMMIT_DRIFT_POLL_MS);

  const stopTimerId = window.setTimeout(() => {
    window.clearInterval(timerId);
    driftMonitorCleanupBySessionId.delete(sessionId);
  }, POST_COMMIT_DRIFT_WINDOW_MS);

  driftMonitorCleanupBySessionId.set(sessionId, () => {
    window.clearInterval(timerId);
    window.clearTimeout(stopTimerId);
    driftMonitorCleanupBySessionId.delete(sessionId);
  });
}

// ── Session Switch Timeline ──────────────────────────────────────────
// Clean waterfall log: one grouped output per switch showing each phase
// and its cumulative timing from click to reveal.

interface TimelineMark {
  readonly phase: string;
  readonly elapsed: number;
  readonly detail: string;
}

interface ActiveTimeline {
  readonly requestId: number;
  readonly sessionId: string;
  readonly from: string | null;
  readonly title: string | null;
  readonly msgCount: number;
  readonly startedAt: number;
  readonly marks: TimelineMark[];
}

let activeTimeline: ActiveTimeline | null = null;

// ── Frame Budget Monitor ─────────────────────────────────────────────
// Measures actual frame durations during a session switch using rAF.
// Reports every frame that exceeds the 120fps budget (8.3ms) so we can
// see exactly which frames drop and correlate with timeline marks.

interface FrameSample {
  readonly frameIndex: number;
  readonly durationMs: number;
  readonly elapsedMs: number;
}

let frameBudgetRafId: number | null = null;
let frameBudgetSamples: FrameSample[] = [];
let frameBudgetStartedAt = 0;
let frameBudgetLastFrameAt = 0;
let frameBudgetFrameIndex = 0;

const FRAME_BUDGET_120FPS_MS = 8.33;
const FRAME_BUDGET_MONITOR_MAX_MS = 3000;

function frameBudgetTick(now: number): void {
  if (activeTimeline === null) {
    stopFrameBudgetMonitor();
    return;
  }

  const elapsed = now - frameBudgetStartedAt;
  if (elapsed > FRAME_BUDGET_MONITOR_MAX_MS) {
    stopFrameBudgetMonitor();
    return;
  }

  if (frameBudgetLastFrameAt > 0) {
    const duration = now - frameBudgetLastFrameAt;
    if (duration > FRAME_BUDGET_120FPS_MS) {
      frameBudgetSamples.push({
        frameIndex: frameBudgetFrameIndex,
        durationMs: Math.round(duration * 100) / 100,
        elapsedMs: Math.round(elapsed * 100) / 100,
      });
    }
  }

  frameBudgetLastFrameAt = now;
  frameBudgetFrameIndex += 1;
  frameBudgetRafId = requestAnimationFrame(frameBudgetTick);
}

function startFrameBudgetMonitor(): void {
  stopFrameBudgetMonitor();
  frameBudgetSamples = [];
  frameBudgetStartedAt = performance.now();
  frameBudgetLastFrameAt = 0;
  frameBudgetFrameIndex = 0;
  frameBudgetRafId = requestAnimationFrame(frameBudgetTick);
}

function stopFrameBudgetMonitor(): void {
  if (frameBudgetRafId !== null) {
    cancelAnimationFrame(frameBudgetRafId);
    frameBudgetRafId = null;
  }
}

function flushFrameBudgetReport(): FrameSample[] {
  stopFrameBudgetMonitor();
  const samples = frameBudgetSamples;
  frameBudgetSamples = [];
  return samples;
}

export function startSwitchTimeline(opts: {
  readonly requestId: number;
  readonly sessionId: string;
  readonly from: string | null;
  readonly title: string | null;
  readonly msgCount: number;
}): void {
  // End any stale timeline (e.g. if abort didn't clean up)
  if (activeTimeline !== null) {
    endSwitchTimeline('aborted', 'superseded');
  }
  activeTimeline = {
    ...opts,
    startedAt: performance.now(),
    marks: [],
  };
  startFrameBudgetMonitor();
}

export function markSwitchTimeline(phase: string, detail?: string): void {
  if (activeTimeline === null) return;
  activeTimeline.marks.push({
    phase,
    elapsed: performance.now() - activeTimeline.startedAt,
    detail: detail ?? '',
  });
}

export function isActiveTimelineSession(sessionId: string): boolean {
  return activeTimeline !== null && activeTimeline.sessionId === sessionId;
}

export function endSwitchTimeline(
  result: 'complete' | 'aborted' | 'timeout' | 'instant',
  detail?: string
): void {
  if (activeTimeline === null) return;

  const timeline = activeTimeline;
  activeTimeline = null;

  const totalMs = performance.now() - timeline.startedAt;
  const sid = timeline.sessionId.slice(-6);

  const suffix =
    result === 'instant'
      ? `instant, ${String(Math.round(totalMs))}ms`
      : result === 'aborted'
        ? `aborted @ ${String(Math.round(totalMs))}ms`
        : result === 'timeout'
          ? `timeout @ ${String(Math.round(totalMs))}ms`
          : `${String(Math.round(totalMs))}ms`;

  // Add final mark
  timeline.marks.push({
    phase: result === 'complete' ? 'DONE' : result.toUpperCase(),
    elapsed: totalMs,
    detail: detail ?? '',
  });

  // Format marks as aligned table
  const maxPhaseLen = Math.max(...timeline.marks.map((m) => m.phase.length));
  const lines = timeline.marks.map((mark) => {
    const ms = `${String(Math.round(mark.elapsed))}ms`.padStart(7);
    const phase = mark.phase.padEnd(maxPhaseLen);
    return mark.detail !== '' ? `  ${ms}  ${phase}  ${mark.detail}` : `  ${ms}  ${phase}`;
  });

  // eslint-disable-next-line no-console
  console.groupCollapsed(
    `%cSessionSwitch %c#${String(timeline.requestId)} → ${sid}%c (${suffix})`,
    'color: #7c93c3; font-weight: bold',
    'color: #e0a866; font-weight: bold',
    'color: #8a8a8a; font-weight: normal'
  );
  // eslint-disable-next-line no-console
  console.log(
    `from ${timeline.from?.slice(-6) ?? '—'} · ${String(timeline.msgCount)} msgs · ${timeline.title ?? 'untitled'}`
  );
  for (const line of lines) {
    // eslint-disable-next-line no-console
    console.log(line);
  }

  // Frame budget report (during switch)
  const switchFrames = [...frameBudgetSamples];
  const switchDropped = switchFrames.filter((f) => f.elapsedMs <= totalMs);
  if (switchDropped.length > 0) {
    const worst = Math.max(...switchDropped.map((f) => f.durationMs));
    // eslint-disable-next-line no-console
    console.log(
      `  %c[warn] ${String(switchDropped.length)} dropped frames during switch (>${String(Math.round(FRAME_BUDGET_120FPS_MS))}ms) - worst: ${String(worst)}ms`,
      'color: #e06c75'
    );
    for (const frame of switchDropped) {
      // eslint-disable-next-line no-console
      console.log(
        `    frame #${String(frame.frameIndex)} @ ${String(frame.elapsedMs)}ms → ${String(frame.durationMs)}ms`
      );
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('  %c✓ no dropped frames during switch (all <8.3ms)', 'color: #98c379');
  }

  // eslint-disable-next-line no-console
  console.groupEnd();

  // Keep frame monitor running 500ms after commit to capture post-commit drops
  // (overscan entry→steady, VelocityScroll attach, prefetch sidebar work)
  const postCommitSid = sid;
  const postCommitTotalMs = totalMs;
  setTimeout(() => {
    const allFrames = flushFrameBudgetReport();
    const postFrames = allFrames.filter((f) => f.elapsedMs > postCommitTotalMs);
    if (postFrames.length > 0) {
      const worst = Math.max(...postFrames.map((f) => f.durationMs));
      // eslint-disable-next-line no-console
      console.groupCollapsed(
        `%cPostCommit %c${postCommitSid}%c ${String(postFrames.length)} dropped frames - worst: ${String(worst)}ms`,
        'color: #7c93c3; font-weight: bold',
        'color: #e0a866; font-weight: bold',
        'color: #e06c75; font-weight: normal'
      );
      for (const frame of postFrames) {
        const offsetMs = Math.round((frame.elapsedMs - postCommitTotalMs) * 10) / 10;
        // eslint-disable-next-line no-console
        console.log(
          `    +${String(offsetMs)}ms  frame #${String(frame.frameIndex)} → ${String(frame.durationMs)}ms`
        );
      }
      // eslint-disable-next-line no-console
      console.groupEnd();
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `%cPostCommit %c${postCommitSid}%c ✓ no dropped frames 500ms after commit`,
        'color: #7c93c3; font-weight: bold',
        'color: #e0a866; font-weight: bold',
        'color: #98c379; font-weight: normal'
      );
    }
  }, 500);
}

function installTraceDebugHelpers(): void {
  if (typeof window === 'undefined' || !import.meta.env.DEV) {
    return;
  }

  const traceWindow = window as TraceableWindow;
  traceWindow.__dumpLatestSwitchTrace = () => traceBuffer[0] ?? null;
  traceWindow.__dumpSessionSwitchTrace = (sessionId?: string) =>
    sessionId ? traceBuffer.filter((record) => record.sessionId === sessionId) : [...traceBuffer];
}

installTraceDebugHelpers();
