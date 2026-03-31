# Orbit Autoresearch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an autonomous pipeline hardening system that runs overnight via Claude Code + program.md, writing stress test probes, booting the app, reading results from files on disk, and patching bugs it finds.

**Architecture:** Self-terminating probes run inside the real Tauri app, writing results to `$HOME/.orbit-autoresearch/`. The external agent reads 3 files (probe result JSON, console JSONL, terminal log), diagnoses boundary bugs via `[PERF]` timestamp correlation, patches source code, and loops. ~150-200 lines of new infrastructure across Rust, TypeScript, and the sidecar.

**Tech Stack:** Tauri 2 (Rust), React 19 (TypeScript), Zustand, Bun (sidecar), existing `dev_monitor` JSONL infrastructure, `PerformanceObserver` API.

**Spec:** `docs/superpowers/specs/2026-03-31-orbit-autoresearch-design.md`

---

## Task 1: Add `sidecar_pid()` Accessor to SessionManager

**Files:**

- Modify: `src-tauri/src/agent/session.rs:30` (inside `impl SessionManager`)

- [ ] **Step 1: Add the accessor method**

Add after `session.rs:44` (after the `set_event_callback` method):

```rust
/// Get the sidecar process PID (for dev monitoring).
/// Returns None if the sidecar is not running.
pub fn sidecar_pid(&self) -> Option<u32> {
    self.bridge.lock().child.as_ref().and_then(|c| c.id())
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p orbit-tauri`
Expected: compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/agent/session.rs
git commit -m "feat(autoresearch): add sidecar_pid() accessor to SessionManager"
```

---

## Task 2: Add `dev_get_process_rss` Rust Command

**Files:**

- Modify: `src-tauri/src/commands/common/diagnostics.rs` (add command)
- Modify: `src-tauri/src/commands/common/mod.rs` (export)
- Modify: `src-tauri/src/lib.rs:554` (register in `generate_handler![]`)

- [ ] **Step 1: Add the command to diagnostics.rs**

Add at the end of `src-tauri/src/commands/common/diagnostics.rs`:

```rust
/// Returns combined RSS (in MB) for the main Tauri process + sidecar.
/// Dev-only: returns 0.0 in release builds.
#[tauri::command]
pub fn dev_get_process_rss(
    session_manager: tauri::State<'_, std::sync::Arc<crate::agent::session::SessionManager>>,
) -> Result<f64, String> {
    if !cfg!(debug_assertions) {
        return Ok(0.0);
    }

    let main_pid = std::process::id();
    let sidecar_pid = session_manager.sidecar_pid();

    let mut total_kb: f64 = 0.0;
    for pid in [Some(main_pid), sidecar_pid].into_iter().flatten() {
        let output = std::process::Command::new("ps")
            .args(["-o", "rss=", "-p", &pid.to_string()])
            .output()
            .map_err(|e| e.to_string())?;
        let kb: f64 = String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse()
            .unwrap_or(0.0);
        total_kb += kb;
    }

    Ok(total_kb / 1024.0)
}
```

- [ ] **Step 2: Export from mod.rs**

In `src-tauri/src/commands/common/mod.rs`, verify `diagnostics` module is already exported (it should be). The new function is `pub` so it's accessible via `diagnostics::dev_get_process_rss`.

- [ ] **Step 3: Register in lib.rs**

In `src-tauri/src/lib.rs`, add `diagnostics::dev_get_process_rss,` to the `generate_handler![]` macro near line 554 (next to the existing `diagnostics::sentry_test_capture`).

- [ ] **Step 4: Verify it compiles and clippy passes**

Run: `cargo check -p orbit-tauri && cargo clippy -p orbit-tauri -- -D warnings`
Expected: compiles with no errors or warnings.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/common/diagnostics.rs src-tauri/src/commands/common/mod.rs src-tauri/src/lib.rs
git commit -m "feat(autoresearch): add dev_get_process_rss command (main + sidecar RSS)"
```

---

## Task 3: Add `[PERF]` Boundary Logging in Rust

**Files:**

- Modify: `src-tauri/src/agent/bridge.rs:211` (reader_thread)
- Modify: `src-tauri/src/commands/agent/lifecycle.rs:511` (emit_agent_message)

- [ ] **Step 1: Add [PERF] logging in bridge.rs reader_thread**

In `src-tauri/src/agent/bridge.rs`, inside the `reader_thread` function, after line 211 (`if let Some(event) = response.as_event()`), add inside the existing `if let Some(event)` block, before the `if let Some(callback)` line:

```rust
#[cfg(debug_assertions)]
if let BridgeEvent::AgentMessage { message, .. } = event {
    if let Some(ref msg_id) = message.message_id {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        log::info!("[PERF] {msg_id} rust_received {ts}");
    }
}
```

Note: `BridgeEvent` is already imported at the top of `bridge.rs` via `use crate::agent::protocol::*` or equivalent. The `event` variable from `response.as_event()` is a `&BridgeEvent`, so pattern match with a reference: `if let BridgeEvent::AgentMessage { message, .. } = event`.

- [ ] **Step 2: Add [PERF] logging in lifecycle.rs emit_agent_message**

In `src-tauri/src/commands/agent/lifecycle.rs`, inside `emit_agent_message` (line 511), add before the `drop(app.emit(...))` call:

```rust
#[cfg(debug_assertions)]
if let Some(ref msg_id) = message.message_id {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    log::info!("[PERF] {msg_id} rust_emitted {ts}");
}
```

- [ ] **Step 3: Verify it compiles and clippy passes**

Run: `cargo check -p orbit-tauri && cargo clippy -p orbit-tauri -- -D warnings`
Expected: compiles with no errors or warnings.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/agent/bridge.rs src-tauri/src/commands/agent/lifecycle.rs
git commit -m "feat(autoresearch): add [PERF] boundary timestamps in Rust bridge + lifecycle"
```

---

## Task 4: Add `[PERF]` Boundary Logging in Sidecar

**Files:**

- Modify: `agent-bridge/src/agent/core/agent.ts` (stderr logging at SDK response points)

- [ ] **Step 1: Find the SDK response iteration point**

Read `agent-bridge/src/agent/core/agent.ts` and locate the `for await` loop over `this.currentQuery` (the SDK streaming response). Add stderr logging at the point where a message is first received from the SDK, and at the point where an event is emitted to stdout.

At the SDK response receipt point:

```typescript
if (process.env.NODE_ENV !== 'production') {
  const msgId = message.messageId ?? 'unknown';
  process.stderr.write(`[PERF] ${msgId} sidecar_received ${Date.now()}\n`);
}
```

At the stdout emit point (where the bridge writes JSON to stdout):

```typescript
if (process.env.NODE_ENV !== 'production') {
  const msgId = message.messageId ?? 'unknown';
  process.stderr.write(`[PERF] ${msgId} sidecar_emitted ${Date.now()}\n`);
}
```

Note: The exact insertion points depend on the code structure. The implementer should read the file, locate the streaming loop and the stdout write, and insert at those two points.

- [ ] **Step 2: Verify typecheck passes**

Run: `cd agent-bridge && bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Rebuild sidecar binary**

Run: `cd agent-bridge && bun run build:sidecar`
Expected: binary built to `src-tauri/binaries/agent-bridge-aarch64-apple-darwin`.

**IMPORTANT:** Use `build:sidecar`, NOT `build:dev` — wrong output path per CLAUDE.md.

- [ ] **Step 4: Commit**

```bash
git add agent-bridge/src/agent/core/agent.ts
git commit -m "feat(autoresearch): add [PERF] boundary timestamps in sidecar stderr"
```

---

## Task 5: Add Console Capture

**Files:**

- Create: `apps/agent/src/lib/dev/console-capture.ts`
- Modify: `apps/agent/src/providers/tauri-provider.tsx:819`

- [ ] **Step 1: Create console-capture.ts**

Create `apps/agent/src/lib/dev/console-capture.ts`:

```typescript
/**
 * Dev-only console capture — intercepts console.log/warn/error and flushes
 * to $HOME/.orbit-autoresearch/console.jsonl via dev_monitor_write_batch.
 *
 * Only active when import.meta.env.DEV is true.
 */

import type { DevLogEntry } from '@/types/dev-monitor';

const OUTPUT_DIR = `${typeof window !== 'undefined' ? '' : ''}/.orbit-autoresearch`;

let buffer: DevLogEntry[] = [];
let flushInterval: ReturnType<typeof setInterval> | null = null;

function stringify(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function intercept(
  level: 'log' | 'warn' | 'error',
  original: (...args: unknown[]) => void
): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    original(...args);
    buffer.push({
      timestamp: Date.now(),
      severity: level === 'log' ? 'info' : level,
      category: `console:${level}`,
      file: 'unknown',
      title: stringify(args[0]),
      details: args.length > 1 ? args.slice(1).map(stringify).join(' ') : undefined,
      context: null,
      dedupCount: 1,
    });
  };
}

async function flush(): Promise<void> {
  if (buffer.length === 0) return;
  const entries = buffer.splice(0);
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const homedir = await invoke<string>('get_home_dir').catch(() => '~');
    await invoke('dev_monitor_write_batch', {
      filePath: `${homedir}/.orbit-autoresearch/console.jsonl`,
      entries,
    });
  } catch {
    // Silently drop — monitoring must never crash the app
  }
}

export function setupConsoleCapture(): void {
  if (!import.meta.env.DEV) return;

  console.log = intercept('log', console.log);
  console.warn = intercept('warn', console.warn);
  console.error = intercept('error', console.error);

  window.addEventListener('error', (event) => {
    buffer.push({
      timestamp: Date.now(),
      severity: 'error',
      category: 'window:error',
      file: event.filename ?? 'unknown',
      title: event.message,
      details: event.error?.stack,
      context: null,
      dedupCount: 1,
    });
  });

  flushInterval = setInterval(() => void flush(), 1000);
}

export function teardownConsoleCapture(): void {
  if (flushInterval !== null) {
    clearInterval(flushInterval);
    flushInterval = null;
  }
}
```

Note: The `DevLogEntry` type may need to be defined locally or imported from wherever the dev_monitor types are declared in the frontend. The implementer should check if a TypeScript type matching `dev_monitor.rs:DevLogEntry` already exists, or define a minimal interface inline. Also, `get_home_dir` may not exist as a Tauri command — the implementer should check and either use an existing command or resolve `$HOME` via `import.meta.env` or the Tauri `path` plugin (`await path.homeDir()`).

- [ ] **Step 2: Wire into tauri-provider.tsx**

In `apps/agent/src/providers/tauri-provider.tsx`, after the `logger.info` call at line 819 (after `Promise.all(listenerPromises)` completes), add:

```typescript
// Dev-only: capture console output for autoresearch probes
if (import.meta.env.DEV) {
  import('@/lib/dev/console-capture')
    .then(({ setupConsoleCapture }) => {
      setupConsoleCapture();
    })
    .catch(() => {
      // Silently ignore — monitoring is optional
    });
}
```

- [ ] **Step 3: Verify typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: no errors, zero warnings.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/src/lib/dev/console-capture.ts apps/agent/src/providers/tauri-provider.tsx
git commit -m "feat(autoresearch): add dev-only console capture to JSONL"
```

---

## Task 6: Add `[PERF]` Boundary Logging in Frontend

**Files:**

- Modify: `apps/agent/src/providers/tauri-provider.tsx:282`
- Modify: `apps/agent/src/stores/chat/chat-store.ts:291`

- [ ] **Step 1: Add [PERF] at frontend_received point**

In `apps/agent/src/providers/tauri-provider.tsx`, after line 282 (where `messageId` is assigned), add:

```typescript
if (import.meta.env.DEV) {
  console.log(`[PERF] ${messageId} frontend_received ${Date.now()}`);
}
```

- [ ] **Step 2: Add [PERF] at store_updated point**

In `apps/agent/src/stores/chat/chat-store.ts`, inside `appendToLastMessage` at line 291, add after the `set((draft) => { ... })` call completes (after the closing `});` of the set call):

```typescript
if (import.meta.env.DEV) {
  console.log(`[PERF] ${messageId} store_updated ${Date.now()}`);
}
```

- [ ] **Step 3: Verify typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: no errors, zero warnings.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/src/providers/tauri-provider.tsx apps/agent/src/stores/chat/chat-store.ts
git commit -m "feat(autoresearch): add [PERF] boundary timestamps in frontend"
```

---

## Task 7: Add Probe Primitives

**Files:**

- Create: `apps/agent/src/stress-tests/probe-primitives.ts`

- [ ] **Step 1: Create probe-primitives.ts**

Create `apps/agent/src/stress-tests/probe-primitives.ts`:

```typescript
/**
 * Shared primitives for autoresearch probes.
 * Used by all probes in apps/agent/src/stress-tests/probes/.
 */

import { createLogger } from '@orbit/common/lib';

import { useChatStore } from '@/stores/chat/chat-store';

const logger = createLogger('AutoProbe');

// ── Types ──────────────────────────────────────────────────────────

export interface ProbeAssertion {
  name: string;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
}

export interface PipelineMetrics {
  messages_sent: number;
  messages_arrived: number;
  boundary_deltas_ms?: Record<string, number>;
}

export interface PerfMetrics {
  long_tasks: number;
  avg_frame_ms: number;
  p99_frame_ms: number;
  dom_nodes: { before: number; after: number };
  rss_mb: { before: number; after: number };
}

export interface ProbeResult {
  probe: string;
  timestamp: string;
  duration_ms: number;
  overall_success: boolean;
  assertions: ProbeAssertion[];
  pipeline?: PipelineMetrics;
  performance?: PerfMetrics;
}

// ── Readiness ──────────────────────────────────────────────────────

export async function waitForReady(timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  return new Promise<void>((resolve, reject) => {
    const check = (): void => {
      const state = useChatStore.getState();
      if (state.activeSessionId !== null && !state.isAgentRunning) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`waitForReady timed out after ${timeoutMs}ms`));
        return;
      }
      setTimeout(check, 500);
    };
    check();
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitForAgentComplete(timeoutMs = 120_000, label = 'agent'): Promise<void> {
  const start = Date.now();
  return new Promise<void>((resolve, reject) => {
    const unsub = useChatStore.subscribe((state) => {
      if (!state.isAgentRunning) {
        unsub();
        resolve();
      }
    });
    const timer = setInterval(() => {
      if (Date.now() - start > timeoutMs) {
        unsub();
        clearInterval(timer);
        reject(new Error(`waitForAgentComplete(${label}) timed out after ${timeoutMs}ms`));
      }
    }, 1000);
  });
}

// ── Performance Measurement ────────────────────────────────────────

export interface PerfSnapshot {
  long_tasks: number;
  frame_times: number[];
  dom_nodes: number;
}

export function startPerfMeasurement(): { stop: () => PerfSnapshot } {
  let longTasks = 0;
  const frameTimes: number[] = [];
  let lastFrame = performance.now();
  let measuring = true;

  const observer = new PerformanceObserver((list) => {
    longTasks += list.getEntries().length;
  });
  observer.observe({ entryTypes: ['longtask'] });

  const rafLoop = (): void => {
    const now = performance.now();
    frameTimes.push(now - lastFrame);
    lastFrame = now;
    if (measuring) requestAnimationFrame(rafLoop);
  };
  requestAnimationFrame(rafLoop);

  return {
    stop: () => {
      measuring = false;
      observer.disconnect();
      return {
        long_tasks: longTasks,
        frame_times: frameTimes,
        dom_nodes: document.querySelectorAll('*').length,
      };
    },
  };
}

// ── Result Writing ─────────────────────────────────────────────────

export async function writeProbeResult(result: ProbeResult): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const { homeDir } = await import('@tauri-apps/api/path');
    const home = await homeDir();
    const dir = `${home}.orbit-autoresearch`;

    // Ensure directory exists
    await invoke('dev_monitor_ensure_dir', { dirPath: dir });

    // Write result as a single JSONL entry
    await invoke('dev_monitor_write_batch', {
      filePath: `${dir}/probe-result.json`,
      entries: [
        {
          timestamp: Date.now(),
          severity: 'info',
          category: 'probe:result',
          file: result.probe,
          title: result.overall_success ? 'PASS' : 'FAIL',
          details: JSON.stringify(result),
          context: null,
          dedupCount: 1,
        },
      ],
    });

    logger.info(`Probe result written: ${result.overall_success ? 'PASS' : 'FAIL'}`);
  } catch (e) {
    logger.error('Failed to write probe result', e);
  }
}

// ── App Termination ────────────────────────────────────────────────

export async function exitApp(): Promise<void> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  getCurrentWindow().close();
}
```

- [ ] **Step 2: Verify typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: no errors, zero warnings.

- [ ] **Step 3: Commit**

```bash
git add apps/agent/src/stress-tests/probe-primitives.ts
git commit -m "feat(autoresearch): add probe primitives (readiness, perf, result writer, exit)"
```

---

## Task 8: Add Auto-Probe Runner + Wire to `__orbit_debug`

**Files:**

- Create: `apps/agent/src/stress-tests/auto-probe-runner.ts`
- Modify: `apps/agent/src/hooks/chat/use-chat-messages.ts:64-87,574,577`
- Create or modify: `apps/agent/env.d.ts` (TypeScript env var declaration)

- [ ] **Step 1: Add TypeScript env declaration**

Check if `apps/agent/env.d.ts` or `apps/agent/src/vite-env.d.ts` exists. Add or merge:

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ORBIT_AUTO_PROBE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 2: Create auto-probe-runner.ts**

Create `apps/agent/src/stress-tests/auto-probe-runner.ts`:

```typescript
/**
 * Auto-probe runner for Orbit Autoresearch.
 *
 * When VITE_ORBIT_AUTO_PROBE is set, this module:
 * 1. Waits for the Claude session to be fully initialized
 * 2. Dynamically imports the named probe from probes/<name>.ts
 * 3. Runs the probe
 * 4. Writes results to $HOME/.orbit-autoresearch/probe-result.json
 * 5. Terminates the app (so bunx tauri dev returns)
 */

import { createLogger } from '@orbit/common/lib';

import { exitApp, waitForReady, writeProbeResult } from '@/stress-tests/probe-primitives';

import type { ProbeResult } from '@/stress-tests/probe-primitives';

const logger = createLogger('AutoProbeRunner');

export interface AutoProbeDeps {
  handleSend: (text: string) => void;
  handleRewind: (messageId: string) => void;
  handleStop: () => void;
}

export async function runAutoProbe(probeName: string, deps: AutoProbeDeps): Promise<void> {
  logger.info(`Auto-probe starting: ${probeName}`);

  try {
    // Wait for session readiness (30s timeout)
    logger.info('Waiting for session readiness...');
    await waitForReady(30_000);
    logger.info('Session ready. Running probe...');

    // Dynamically import the probe module
    const probeModule = await import(`@/stress-tests/probes/${probeName}.ts`);

    if (typeof probeModule.runProbe !== 'function') {
      throw new Error(`Probe "${probeName}" does not export a runProbe() function`);
    }

    // Run the probe
    const startTime = Date.now();
    const result: ProbeResult = await probeModule.runProbe(deps);
    result.duration_ms = Date.now() - startTime;
    result.timestamp = new Date().toISOString();

    // Write results
    await writeProbeResult(result);
    logger.info(
      `Probe complete: ${result.overall_success ? 'PASS' : 'FAIL'} (${result.duration_ms}ms)`
    );
  } catch (error) {
    logger.error('Auto-probe crashed', error);

    // Write crash result
    await writeProbeResult({
      probe: probeName,
      timestamp: new Date().toISOString(),
      duration_ms: 0,
      overall_success: false,
      assertions: [{ name: 'probe_execution', passed: false, actual: String(error) }],
    });
  }

  // Terminate the app so bunx tauri dev returns
  logger.info('Exiting app...');
  await exitApp();
}
```

- [ ] **Step 3: Update Window.\_\_orbit_debug interface**

In `apps/agent/src/hooks/chat/use-chat-messages.ts`, update the `Window['__orbit_debug']` interface at lines 64-87. Add `runAutoProbe` to the interface:

```typescript
declare global {
  interface Window {
    __orbit_debug?:
      | {
          // ... all existing entries unchanged ...
          runAutoProbe?: (probeName: string) => Promise<void>;
        }
      | undefined;
  }
}
```

- [ ] **Step 4: Add dynamic import entry in debugEntries**

In the same file, inside the `debugEntries` object (after the last existing entry, around line 573), add:

```typescript
runAutoProbe: async (probeName: string) => {
  const { runAutoProbe } = await import('@/stress-tests/auto-probe-runner');
  return runAutoProbe(probeName, {
    handleSend: actions.handleSend,
    handleRewind: actions.handleRewind,
    handleStop: actions.handleStop,
  });
},
```

- [ ] **Step 5: Add auto-trigger after window.\_\_orbit_debug assignment**

After line 580 (`window.__orbit_debug = { ...existingDebug, ...debugEntries };`), add:

```typescript
// Auto-run probe if VITE_ORBIT_AUTO_PROBE is set
const autoProbe = import.meta.env.VITE_ORBIT_AUTO_PROBE;
if (typeof autoProbe === 'string' && autoProbe.length > 0) {
  // Delay slightly to ensure all listeners are wired
  setTimeout(() => {
    window.__orbit_debug?.runAutoProbe?.(autoProbe);
  }, 2000);
}
```

- [ ] **Step 6: Verify typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: no errors, zero warnings.

- [ ] **Step 7: Commit**

```bash
git add apps/agent/src/stress-tests/auto-probe-runner.ts apps/agent/src/hooks/chat/use-chat-messages.ts apps/agent/env.d.ts
git commit -m "feat(autoresearch): add auto-probe runner with session readiness + app exit"
```

---

## Task 9: Create First Probe (Pipeline Baseline)

**Files:**

- Create: `apps/agent/src/stress-tests/probes/pipeline-baseline.ts`

- [ ] **Step 1: Create the probes directory**

Run: `mkdir -p apps/agent/src/stress-tests/probes`

- [ ] **Step 2: Create pipeline-baseline.ts**

Create `apps/agent/src/stress-tests/probes/pipeline-baseline.ts`:

```typescript
/**
 * Pipeline Baseline Probe
 *
 * Establishes baseline measurements:
 * 1. Sends 3 simple messages through the full pipeline
 * 2. Measures boundary timing via [PERF] correlation
 * 3. Records performance metrics (long tasks, DOM nodes, RSS)
 * 4. Verifies all messages arrive in the correct order
 *
 * Usage: VITE_ORBIT_AUTO_PROBE=pipeline-baseline bunx tauri dev
 */

import { createLogger } from '@orbit/common/lib';

import { useChatStore } from '@/stores/chat/chat-store';
import { sleep, startPerfMeasurement, waitForAgentComplete } from '@/stress-tests/probe-primitives';

import type { AutoProbeDeps } from '@/stress-tests/auto-probe-runner';
import type { ProbeAssertion, ProbeResult } from '@/stress-tests/probe-primitives';

const logger = createLogger('PipelineBaseline');

export async function runProbe(deps: AutoProbeDeps): Promise<ProbeResult> {
  const assertions: ProbeAssertion[] = [];
  const { handleSend } = deps;

  // Start performance measurement
  let rssBefore = 0;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    rssBefore = await invoke<number>('dev_get_process_rss');
  } catch {
    // RSS measurement optional
  }

  const perf = startPerfMeasurement();
  const domBefore = document.querySelectorAll('*').length;

  // Get initial state
  const initialState = useChatStore.getState();
  const sessionId = initialState.activeSessionId;

  assertions.push({
    name: 'session_exists',
    passed: sessionId !== null,
    actual: sessionId,
  });

  if (sessionId === null) {
    const perfSnap = perf.stop();
    return {
      probe: 'pipeline-baseline',
      timestamp: new Date().toISOString(),
      duration_ms: 0,
      overall_success: false,
      assertions,
      performance: {
        long_tasks: perfSnap.long_tasks,
        avg_frame_ms: 0,
        p99_frame_ms: 0,
        dom_nodes: { before: domBefore, after: perfSnap.dom_nodes },
        rss_mb: { before: rssBefore, after: 0 },
      },
    };
  }

  // Send 3 messages
  const messageTexts = [
    'Say exactly: BASELINE_ONE',
    'Say exactly: BASELINE_TWO',
    'Say exactly: BASELINE_THREE',
  ];

  for (let i = 0; i < messageTexts.length; i++) {
    logger.info(`Sending message ${i + 1}/3...`);
    handleSend(messageTexts[i]);

    try {
      await waitForAgentComplete(60_000, `message_${i + 1}`);
    } catch (e) {
      assertions.push({
        name: `message_${i + 1}_completed`,
        passed: false,
        actual: String(e),
      });
      break;
    }

    assertions.push({
      name: `message_${i + 1}_completed`,
      passed: true,
    });

    await sleep(500);
  }

  // Verify all messages arrived
  const finalState = useChatStore.getState();
  const session = finalState.sessions[sessionId];
  const messageCount = session?.messages.length ?? 0;

  // Each send produces: user message + assistant response = 2 messages
  // 3 sends = 6 messages minimum
  assertions.push({
    name: 'all_messages_arrived',
    passed: messageCount >= 6,
    expected: '>= 6',
    actual: messageCount,
  });

  assertions.push({
    name: 'agent_not_stuck',
    passed: !finalState.isAgentRunning,
    actual: finalState.isAgentRunning,
  });

  // Stop perf measurement
  const perfSnap = perf.stop();
  let rssAfter = 0;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    rssAfter = await invoke<number>('dev_get_process_rss');
  } catch {
    // RSS measurement optional
  }

  const avgFrameMs =
    perfSnap.frame_times.length > 0
      ? perfSnap.frame_times.reduce((a, b) => a + b, 0) / perfSnap.frame_times.length
      : 0;
  const sortedFrames = [...perfSnap.frame_times].sort((a, b) => a - b);
  const p99FrameMs =
    sortedFrames.length > 0 ? (sortedFrames[Math.floor(sortedFrames.length * 0.99)] ?? 0) : 0;

  return {
    probe: 'pipeline-baseline',
    timestamp: new Date().toISOString(),
    duration_ms: 0, // filled by auto-runner
    overall_success: assertions.every((a) => a.passed),
    assertions,
    pipeline: {
      messages_sent: 3,
      messages_arrived: Math.floor(messageCount / 2), // user+assistant pairs
    },
    performance: {
      long_tasks: perfSnap.long_tasks,
      avg_frame_ms: avgFrameMs,
      p99_frame_ms: p99FrameMs,
      dom_nodes: { before: domBefore, after: perfSnap.dom_nodes },
      rss_mb: { before: rssBefore, after: rssAfter },
    },
  };
}
```

- [ ] **Step 3: Verify typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: no errors, zero warnings.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/src/stress-tests/probes/pipeline-baseline.ts
git commit -m "feat(autoresearch): add pipeline-baseline probe (3 messages + perf)"
```

---

## Task 10: Create program.md (Agent Brain)

**Files:**

- Create: `docs/autoresearch/program.md`

- [ ] **Step 1: Create the autoresearch directory**

Run: `mkdir -p docs/autoresearch`

- [ ] **Step 2: Create program.md**

Create `docs/autoresearch/program.md` — this is the complete operating manual for the autonomous agent. It must be self-contained: an agent reading only this file must be able to run experiments all night.

The implementer should write this based on the spec's "Program.md Content" section, including:

- Setup procedure (agree on tag, create branch, verify data dir exists, run baseline)
- The exact experiment loop (numbered steps with exact shell commands)
- Decision rules (keep/fixed/crash/transient with precise criteria)
- results.tsv format (tab-separated, 6 columns: commit, probe, assertions_passed, boundary_p50_ms, status, description)
- Kill sequence (`pkill -f "tauri dev" && pkill -f "vite" && sleep 2`)
- Transient failure handling (retry once after 60s, then skip)
- Context management (write progress.md + run /compact every 15 experiments)
- NEVER STOP directive

- [ ] **Step 3: Commit**

```bash
git add docs/autoresearch/program.md
git commit -m "feat(autoresearch): add program.md — autonomous agent instructions"
```

---

## Task 11: End-to-End Verification

**Files:** None (verification only)

- [ ] **Step 1: Build the full app**

Run: `cargo build -p orbit-tauri`
Expected: compiles with no errors.

- [ ] **Step 2: Run all quality checks**

Run: `bun run typecheck && bun run lint && cargo clippy --workspace -- -D warnings`
Expected: all pass.

- [ ] **Step 3: Manual test — run the baseline probe**

Run:

```bash
rm -f $HOME/.orbit-autoresearch/probe-result.json
VITE_ORBIT_AUTO_PROBE=pipeline-baseline timeout 180 bunx tauri dev > $HOME/.orbit-autoresearch/terminal.log 2>&1
```

Wait ~90 seconds. The app should boot, run the probe, and self-terminate.

- [ ] **Step 4: Verify output files exist**

Run:

```bash
cat $HOME/.orbit-autoresearch/probe-result.json | head -5
cat $HOME/.orbit-autoresearch/console.jsonl | wc -l
grep "\[PERF\]" $HOME/.orbit-autoresearch/terminal.log | head -5
```

Expected: probe-result.json has valid JSON with assertions, console.jsonl has entries, terminal.log has `[PERF]` boundary timestamps.

- [ ] **Step 5: Commit all remaining changes**

```bash
git add -A
git commit -m "feat(autoresearch): complete infrastructure — verified end-to-end"
```

---

## Task Dependencies

```
Task 1 (sidecar_pid accessor) ──→ Task 2 (RSS command) ──→ Task 3 (Rust [PERF])
                                                            │
Task 4 (Sidecar [PERF]) ────────────────────────────────────┤
                                                            │
Task 5 (Console capture) ──→ Task 6 (Frontend [PERF]) ─────┤
                                                            │
Task 7 (Probe primitives) ──→ Task 8 (Auto-runner) ────────┤
                                                            │
                                          ┌─────────────────┘
                                          ▼
                                   Task 9 (First probe)
                                          │
                                          ▼
                                   Task 10 (program.md)
                                          │
                                          ▼
                                   Task 11 (E2E verification)
```

Tasks 1-3 (Rust) and Tasks 4 (Sidecar) can run in parallel.
Tasks 5-6 (Frontend logging) and Task 7 (Primitives) can run in parallel.
Task 8 depends on Task 7.
Task 9 depends on Tasks 7+8.
Task 10 is independent (just a markdown file).
Task 11 depends on everything.
