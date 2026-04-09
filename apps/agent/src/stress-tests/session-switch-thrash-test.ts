/**
 * Session Switch Thrash Test
 *
 * A brutal stress test that hammers the session switching pipeline at inhuman
 * speeds. Measures FPS drops, main thread stalls, memory leaks, and pipeline
 * integrity under sustained rapid switching.
 *
 * Phases:
 *   Phase 1: Sequential — switch through every session once, measure baseline
 *   Phase 2: Rapid fire — switch every 50ms across all sessions (20 switches/sec)
 *   Phase 3: Burst — 10 switches in <100ms, then pause, repeat 5x
 *   Phase 4: Ping-pong — alternate between 2 sessions as fast as possible (100x)
 *   Phase 5: Random chaos — random session every 16ms (one per frame) for 5 seconds
 *   Phase 6: Cooldown — switch to each session once, verify all render correctly
 *
 * Monitors:
 *   - FPS via rAF timing (120fps = 8.3ms, 60fps = 16.6ms, <30fps = stall)
 *   - Long frames (>16ms between rAFs)
 *   - Main thread blocks (>50ms gaps)
 *   - Memory heap snapshots (before/after each phase)
 *   - Session switch trace timings (from session-switch-trace.ts)
 *   - Pending switch leaks (switch starts but never completes)
 *   - Virtuoso render state integrity
 *
 * Usage (DevTools console):
 *   window.__orbit_debug.runSwitchThrashTest()
 *   window.__orbit_debug.runSwitchThrashTest({ rapidIntervalMs: 30 })
 *
 * Prerequisites:
 *   - Multiple conversations in the sidebar (the more the better, 5+ ideal)
 *   - Works with existing sessions — does NOT create new conversations
 */

import { createLogger } from '@orbit/common/lib';

import { useSessionSwitchStore } from '@/stores/chat/session-switch-store';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('SwitchThrashTest');

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface SwitchThrashTestConfig {
  /** Interval between switches in rapid-fire phase (ms). Default: 50 */
  rapidIntervalMs?: number;
  /** Number of ping-pong round trips. Default: 100 */
  pingPongCount?: number;
  /** Duration of random chaos phase (ms). Default: 5000 */
  chaosDurationMs?: number;
  /** Number of burst rounds. Default: 5 */
  burstRounds?: number;
  /** Switches per burst. Default: 10 */
  burstSize?: number;
  /** Pause between bursts (ms). Default: 500 */
  burstPauseMs?: number;
  /** Skip phases (e.g. [3, 5] to skip ping-pong and chaos). Default: [] */
  skipPhases?: number[];
}

interface FrameSample {
  timestamp: number;
  deltaMs: number;
}

interface PhaseResult {
  phase: string;
  durationMs: number;
  switchCount: number;
  avgSwitchMs: number;
  fps: FpsStats;
  longFrames: number;
  mainThreadStalls: number;
  memoryDeltaMb: number | null;
  pendingSwitchLeaks: number;
  errors: string[];
}

interface FpsStats {
  avg: number;
  min: number;
  p1: number;
  p5: number;
  p50: number;
  framesBelow60: number;
  framesBelow30: number;
  totalFrames: number;
}

// ────────────────────────────────────────────────────────────────────────────
// FPS Monitor — rAF-based frame timing
// ────────────────────────────────────────────────────────────────────────────

class FpsMonitor {
  private samples: FrameSample[] = [];
  private rafId: number | null = null;
  private lastTimestamp: number | null = null;
  private running = false;

  start(): void {
    this.samples = [];
    this.lastTimestamp = null;
    this.running = true;
    this.tick(performance.now());
  }

  stop(): FpsStats {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    return this.computeStats();
  }

  private tick(now: number): void {
    if (!this.running) return;

    if (this.lastTimestamp !== null) {
      const delta = now - this.lastTimestamp;
      this.samples.push({ timestamp: now, deltaMs: delta });
    }
    this.lastTimestamp = now;
    this.rafId = requestAnimationFrame((t) => {
      this.tick(t);
    });
  }

  private computeStats(): FpsStats {
    if (this.samples.length === 0) {
      return {
        avg: 0,
        min: 0,
        p1: 0,
        p5: 0,
        p50: 0,
        framesBelow60: 0,
        framesBelow30: 0,
        totalFrames: 0,
      };
    }

    const deltas = this.samples.map((s) => s.deltaMs).sort((a, b) => a - b);
    const totalFrames = deltas.length;
    const avgDelta = deltas.reduce((sum, d) => sum + d, 0) / totalFrames;

    const p = (pct: number): number => deltas[Math.floor((pct / 100) * (totalFrames - 1))] ?? 0;

    return {
      avg: Math.round(1000 / avgDelta),
      min: Math.round(1000 / (deltas[totalFrames - 1] ?? 1)),
      p1: Math.round(1000 / p(99)), // worst 1%
      p5: Math.round(1000 / p(95)), // worst 5%
      p50: Math.round(1000 / p(50)),
      framesBelow60: deltas.filter((d) => d > 16.67).length,
      framesBelow30: deltas.filter((d) => d > 33.33).length,
      totalFrames,
    };
  }

  /** Get raw long-frame count (>16.67ms = below 60fps) */
  getLongFrameCount(): number {
    return this.samples.filter((s) => s.deltaMs > 16.67).length;
  }

  /** Get main-thread stall count (>50ms gaps) */
  getStallCount(): number {
    return this.samples.filter((s) => s.deltaMs > 50).length;
  }

  /** Get the raw samples for detailed analysis */
  getSamples(): FrameSample[] {
    return [...this.samples];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Switch executor — fires claudeUiBridge.select and tracks completion
// ────────────────────────────────────────────────────────────────────────────

async function selectSession(sessionId: string): Promise<void> {
  const { getConversationUiBridge } = await import('@/services/conversations');
  await getConversationUiBridge().select(sessionId);
}

function getSessionIds(): string[] {
  return useUIStore.getState().conversations.map((c) => c.sessionId);
}

function getActiveSessionId(): string | null {
  return useUIStore.getState().activeConversationId;
}

function getPendingSwitchState(): {
  pending: boolean;
  requestId: number;
  sessionId: string | null;
} {
  const state = useSessionSwitchStore.getState();
  return {
    pending: state.pending !== null,
    requestId: state.requestId,
    sessionId: state.pending?.sessionId ?? null,
  };
}

function getMemoryMb(): number | null {
  const perf = performance as { memory?: { usedJSHeapSize?: number } };
  if (perf.memory?.usedJSHeapSize !== undefined) {
    return Math.round(perf.memory.usedJSHeapSize / 1024 / 1024);
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function waitForFrame(): Promise<number> {
  return new Promise((resolve) => {
    requestAnimationFrame(resolve);
  });
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function formatFps(stats: FpsStats): string {
  return `avg=${String(stats.avg)} min=${String(stats.min)} p1=${String(stats.p1)} p5=${String(stats.p5)} <60fps=${String(stats.framesBelow60)}/${String(stats.totalFrames)} stalls(<30fps)=${String(stats.framesBelow30)}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Phase runners
// ────────────────────────────────────────────────────────────────────────────

async function runPhase(
  name: string,
  fn: (monitor: FpsMonitor) => Promise<{ switchCount: number; errors: string[] }>
): Promise<PhaseResult> {
  const monitor = new FpsMonitor();
  const memBefore = getMemoryMb();

  logger.info(`\n${'═'.repeat(60)}`);
  logger.info(`PHASE: ${name}`);
  logger.info('═'.repeat(60));

  const startedAt = performance.now();
  monitor.start();

  const { switchCount, errors } = await fn(monitor);

  const fps = monitor.stop();
  const durationMs = Math.round(performance.now() - startedAt);
  const memAfter = getMemoryMb();
  const pendingState = getPendingSwitchState();

  const result: PhaseResult = {
    phase: name,
    durationMs,
    switchCount,
    avgSwitchMs: switchCount > 0 ? Math.round(durationMs / switchCount) : 0,
    fps,
    longFrames: monitor.getLongFrameCount(),
    mainThreadStalls: monitor.getStallCount(),
    memoryDeltaMb: memBefore !== null && memAfter !== null ? memAfter - memBefore : null,
    pendingSwitchLeaks: pendingState.pending ? 1 : 0,
    errors,
  };

  logger.info(
    `Duration: ${String(durationMs)}ms | Switches: ${String(switchCount)} | Avg: ${String(result.avgSwitchMs)}ms/switch`
  );
  logger.info(`FPS: ${formatFps(fps)}`);
  if (result.mainThreadStalls > 0) {
    logger.warn(`[WARN] Main thread stalls (>50ms): ${String(result.mainThreadStalls)}`);
  }
  if (result.pendingSwitchLeaks > 0) {
    logger.warn(`[WARN] Pending switch leak detected after phase`);
  }
  if (memBefore !== null && memAfter !== null) {
    logger.info(
      `Memory: ${String(memBefore)}MB → ${String(memAfter)}MB (Δ${String(memAfter - memBefore)}MB)`
    );
  }
  if (errors.length > 0) {
    logger.error(`Errors: ${errors.join(', ')}`);
  }

  return result;
}

// Phase 1: Sequential baseline
async function phaseSequential(sessions: string[]): Promise<PhaseResult> {
  return runPhase(`1 — Sequential baseline (${String(sessions.length)} sessions)`, async () => {
    const errors: string[] = [];
    let switchCount = 0;

    for (const sessionId of sessions) {
      try {
        await selectSession(sessionId);
        switchCount++;
        // Wait for render to settle
        await waitForFrame();
        await waitForFrame();
      } catch (e) {
        errors.push(
          `select(${sessionId.slice(-6)}): ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    return { switchCount, errors };
  });
}

// Phase 2: Rapid fire
async function phaseRapidFire(sessions: string[], intervalMs: number): Promise<PhaseResult> {
  const totalSwitches = sessions.length * 3; // 3 full cycles
  return runPhase(
    `2 — Rapid fire (${String(totalSwitches)} switches @ ${String(intervalMs)}ms)`,
    async () => {
      const errors: string[] = [];
      let switchCount = 0;

      for (let i = 0; i < totalSwitches; i++) {
        const sessionId = sessions[i % sessions.length] ?? sessions[0] ?? '';
        try {
          // Fire and forget — don't await, just blast
          void selectSession(sessionId);
          switchCount++;
        } catch (e) {
          errors.push(`rapid-${String(i)}: ${e instanceof Error ? e.message : String(e)}`);
        }
        await sleep(intervalMs);
      }

      // Wait for last switch to settle
      await sleep(500);

      return { switchCount, errors };
    }
  );
}

// Phase 3: Burst
async function phaseBurst(
  sessions: string[],
  rounds: number,
  burstSize: number,
  pauseMs: number
): Promise<PhaseResult> {
  return runPhase(
    `3 — Burst (${String(rounds)}x${String(burstSize)} switches, ${String(pauseMs)}ms pause)`,
    async () => {
      const errors: string[] = [];
      let switchCount = 0;

      for (let round = 0; round < rounds; round++) {
        logger.info(`  Burst round ${String(round + 1)}/${String(rounds)}`);

        // Fire burst — all at once, no waiting
        const burstStart = performance.now();
        for (let i = 0; i < burstSize; i++) {
          const sessionId =
            sessions[(round * burstSize + i) % sessions.length] ?? sessions[0] ?? '';
          try {
            void selectSession(sessionId);
            switchCount++;
          } catch (e) {
            errors.push(
              `burst-${String(round)}-${String(i)}: ${e instanceof Error ? e.message : String(e)}`
            );
          }
        }
        const burstMs = Math.round(performance.now() - burstStart);
        logger.info(`    ${String(burstSize)} switches fired in ${String(burstMs)}ms`);

        // Wait for pipeline to drain
        await sleep(pauseMs);

        // Check for leaks
        const pending = getPendingSwitchState();
        if (pending.pending) {
          logger.warn(`    [WARN] Switch still pending after ${String(pauseMs)}ms pause`);
        }
      }

      return { switchCount, errors };
    }
  );
}

// Phase 4: Ping-pong
async function phasePingPong(sessions: string[], count: number): Promise<PhaseResult> {
  const sessionA = sessions[0] ?? '';
  const sessionB = sessions[Math.min(1, sessions.length - 1)] ?? '';

  return runPhase(
    `4 — Ping-pong (${sessionA.slice(-6)} ↔ ${sessionB.slice(-6)}, ${String(count)}x)`,
    async () => {
      const errors: string[] = [];
      let switchCount = 0;

      for (let i = 0; i < count; i++) {
        const target = i % 2 === 0 ? sessionA : sessionB;
        try {
          void selectSession(target);
          switchCount++;
        } catch (e) {
          errors.push(`pp-${String(i)}: ${e instanceof Error ? e.message : String(e)}`);
        }
        // One frame between each — absolute minimum for the UI to react
        await waitForFrame();
      }

      // Wait for final settle
      await sleep(500);

      return { switchCount, errors };
    }
  );
}

// Phase 5: Random chaos
async function phaseChaos(sessions: string[], durationMs: number): Promise<PhaseResult> {
  return runPhase(`5 — Random chaos (${String(durationMs)}ms @ 1 switch/frame)`, async () => {
    const errors: string[] = [];
    let switchCount = 0;
    const deadline = performance.now() + durationMs;

    while (performance.now() < deadline) {
      const target = pickRandom(sessions);
      try {
        void selectSession(target);
        switchCount++;
      } catch (e) {
        errors.push(`chaos-${String(switchCount)}: ${e instanceof Error ? e.message : String(e)}`);
      }
      await waitForFrame();
    }

    // Wait for pipeline to drain
    await sleep(1000);

    return { switchCount, errors };
  });
}

// Phase 6: Cooldown verification
async function phaseCooldown(sessions: string[]): Promise<PhaseResult> {
  return runPhase(`6 — Cooldown verification (${String(sessions.length)} sessions)`, async () => {
    const errors: string[] = [];
    let switchCount = 0;

    for (const sessionId of sessions) {
      try {
        await selectSession(sessionId);
        switchCount++;

        // Wait for render to fully settle
        await sleep(200);

        // Verify the session actually became active
        const activeId = getActiveSessionId();
        if (activeId !== sessionId) {
          errors.push(`verify(${sessionId.slice(-6)}): active=${activeId?.slice(-6) ?? 'null'}`);
        }

        // Check no pending switch leak
        const pending = getPendingSwitchState();
        if (pending.pending) {
          errors.push(
            `verify(${sessionId.slice(-6)}): switch still pending (req=${String(pending.requestId)})`
          );
        }
      } catch (e) {
        errors.push(`cool-${sessionId.slice(-6)}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { switchCount, errors };
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Main runner
// ────────────────────────────────────────────────────────────────────────────

export async function runSwitchThrashTest(
  config: SwitchThrashTestConfig = {}
): Promise<PhaseResult[]> {
  const {
    rapidIntervalMs = 50,
    pingPongCount = 100,
    chaosDurationMs = 5000,
    burstRounds = 5,
    burstSize = 10,
    burstPauseMs = 500,
    skipPhases = [],
  } = config;

  const sessions = getSessionIds();
  if (sessions.length < 2) {
    logger.error('Need at least 2 sessions in sidebar. Aborting.');
    return [];
  }

  const memStart = getMemoryMb();

  logger.info('\n' + '▓'.repeat(60));
  logger.info('  SESSION SWITCH THRASH TEST');
  logger.info(
    `  Sessions: ${String(sessions.length)} | rapid=${String(rapidIntervalMs)}ms | pingPong=${String(pingPongCount)}x | chaos=${String(chaosDurationMs)}ms`
  );
  logger.info('▓'.repeat(60));

  const results: PhaseResult[] = [];
  const skip = new Set(skipPhases);

  // Phase 1: Sequential baseline
  if (!skip.has(1)) {
    results.push(await phaseSequential(sessions));
    await sleep(1000);
  }

  // Phase 2: Rapid fire
  if (!skip.has(2)) {
    results.push(await phaseRapidFire(sessions, rapidIntervalMs));
    await sleep(1000);
  }

  // Phase 3: Burst
  if (!skip.has(3)) {
    results.push(await phaseBurst(sessions, burstRounds, burstSize, burstPauseMs));
    await sleep(1000);
  }

  // Phase 4: Ping-pong
  if (!skip.has(4)) {
    results.push(await phasePingPong(sessions, pingPongCount));
    await sleep(1000);
  }

  // Phase 5: Random chaos
  if (!skip.has(5)) {
    results.push(await phaseChaos(sessions, chaosDurationMs));
    await sleep(1000);
  }

  // Phase 6: Cooldown
  if (!skip.has(6)) {
    results.push(await phaseCooldown(sessions));
  }

  // ── Summary ──────────────────────────────────────────────────────────
  const memEnd = getMemoryMb();
  const totalSwitches = results.reduce((sum, r) => sum + r.switchCount, 0);
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const totalStalls = results.reduce((sum, r) => sum + r.mainThreadStalls, 0);
  const totalLeaks = results.reduce((sum, r) => sum + r.pendingSwitchLeaks, 0);
  const worstFps = results.reduce((worst, r) => (r.fps.min < worst ? r.fps.min : worst), Infinity);

  logger.info('\n' + '▓'.repeat(60));
  logger.info('  RESULTS SUMMARY');
  logger.info('▓'.repeat(60));
  logger.info(`  Total switches:    ${String(totalSwitches)}`);
  logger.info(`  Total duration:    ${String(totalDuration)}ms`);
  logger.info(
    `  Avg switch:        ${String(totalSwitches > 0 ? Math.round(totalDuration / totalSwitches) : 0)}ms`
  );
  logger.info(`  Worst FPS:         ${String(worstFps === Infinity ? 'N/A' : worstFps)}`);
  logger.info(`  Main thread stalls: ${String(totalStalls)}`);
  logger.info(`  Pending leaks:     ${String(totalLeaks)}`);
  logger.info(`  Errors:            ${String(totalErrors)}`);
  if (memStart !== null && memEnd !== null) {
    logger.info(
      `  Memory:            ${String(memStart)}MB → ${String(memEnd)}MB (Δ${String(memEnd - memStart)}MB)`
    );
  }

  // Per-phase table
  logger.info('\n  Phase breakdown:');
  for (const r of results) {
    const status = r.errors.length === 0 && r.pendingSwitchLeaks === 0 ? '✓' : '✗';
    logger.info(
      `  ${status} ${r.phase.padEnd(50)} ${String(r.switchCount).padStart(4)} switches  ${String(r.durationMs).padStart(6)}ms  fps:${String(r.fps.avg).padStart(4)}avg ${String(r.fps.min).padStart(4)}min  stalls:${String(r.mainThreadStalls)}`
    );
  }

  // Worst frame analysis across all phases
  logger.info('\n  Frame budget analysis (120fps = 8.3ms, 60fps = 16.6ms):');
  for (const r of results) {
    logger.info(
      `  ${r.phase.slice(0, 40).padEnd(42)} <60fps: ${String(r.fps.framesBelow60).padStart(4)}/${String(r.fps.totalFrames).padStart(5)}  <30fps: ${String(r.fps.framesBelow30).padStart(4)}/${String(r.fps.totalFrames).padStart(5)}`
    );
  }

  logger.info('\n' + '▓'.repeat(60));
  logger.info(
    totalErrors === 0 && totalLeaks === 0 ? '  ALL PHASES PASSED' : '  FAILURES DETECTED'
  );
  logger.info('▓'.repeat(60));

  return results;
}
