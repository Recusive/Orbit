# Orbit Autoresearch — Autonomous Pipeline Hardening

## Context

Orbit is a Tauri 2 desktop app (Rust backend + React 19 frontend + Claude Agent SDK sidecar) with 160+ tests across three layers. All tests pass in isolation (`cargo test`, `bun test`, `vitest`). But the full pipeline breaks at boundaries between layers — the handoffs where SDK responses cross from sidecar to Rust to Tauri events to Zustand stores.

Karpathy's [autoresearch](https://github.com/karpathy/autoresearch) demonstrates that an autonomous agent can run overnight, iterating on code with a fixed metric, and produce measurable improvements. This design adapts that pattern to codebase hardening: instead of optimizing `val_bpb`, the agent finds and patches pipeline bugs, performance bottlenecks, and boundary failures.

**Reference:** `reference/autoresearch/program.md` — the blueprint for the experiment loop.

**Validated by:** 12 expert audits across 4 rounds (systems architect, Rust/Tauri engineer, React/TypeScript engineer, implementer, QA failure analyst), each reading actual source code.

---

## Design Principles

1. **Observation is external to the system under test.** Files on disk, not middleware inside the app. If the app crashes, the log files still exist.
2. **Probes run inside the app through the real pipeline.** Not mocked, not isolated — the full SDK → sidecar → Rust → Tauri → store → render path.
3. **Metrics are objective and automatable.** Pipeline assertions (pass/fail), boundary timing deltas (lower = better), performance counters (long tasks, DOM nodes, RSS).
4. **Infrastructure is ~150-200 lines of new code**, reusing existing `dev_monitor`, stress test patterns, and Tauri APIs.
5. **The agent is just Claude Code + program.md.** No SDK wrapper, no custom harness. Identical to how autoresearch runs.
6. **Probes self-terminate the app after writing results.** This makes the launch a foreground process that naturally completes, avoiding background process management issues.

---

## System Design — Complete Data Flow

### Autoresearch (reference architecture)

```
Human writes: program.md (experiment loop instructions)
Human says:   "read program.md and kick off"
Claude Code:  reads program.md → enters LOOP FOREVER:
  │
  ├─ Edit train.py (one hypothesis per iteration)
  ├─ git commit
  ├─ Run: uv run train.py > run.log 2>&1
  ├─ Read: grep "^val_bpb:" run.log → single metric
  ├─ Keep (val_bpb improved) or discard (git reset)
  └─ Log to results.tsv → next hypothesis
```

- **File:** `reference/autoresearch/program.md`
- **Entry:** Human opens Claude Code in repo, says "read program.md"
- **Observation:** `grep` on stdout (OS-level, external to system under test)
- **Metric:** `val_bpb` (single scalar, lower = better)
- **Revert:** `git reset --hard HEAD~1`

### Orbit Autoresearch (target — mirrors autoresearch)

```
Human writes: docs/autoresearch/program.md (experiment loop instructions)
Human says:   "read docs/autoresearch/program.md and kick off"
Claude Code:  reads program.md → enters LOOP FOREVER:
  │
  ├─ Write probe: apps/agent/src/stress-tests/probes/<name>.ts
  ├─ Clear old results: rm -f $HOME/.orbit-autoresearch/probe-result.json
  ├─ Run app (foreground, self-terminates after probe):
  │   VITE_ORBIT_AUTO_PROBE=<name> timeout 180 bunx tauri dev \
  │     > $HOME/.orbit-autoresearch/terminal.log 2>&1
  ├─ Read 3 files:
  │   ├─ $HOME/.orbit-autoresearch/probe-result.json  → assertions + deltas + perf
  │   ├─ $HOME/.orbit-autoresearch/console.jsonl       → frontend logs + errors
  │   └─ $HOME/.orbit-autoresearch/terminal.log        → Rust logs, sidecar stderr
  │
  ├─ Evaluate:
  │   ├─ Assertions failed? → which boundary? (grep [PERF] for timing)
  │   ├─ Performance degraded? → which layer? (boundary deltas)
  │   └─ Crash? → read terminal log for stack trace
  │
  ├─ If broken: diagnose → patch → cargo check / bun run typecheck → verify → commit
  ├─ If resilient: log to results.tsv → next hypothesis
  └─ Every 15 experiments: write progress.md, run /compact (context management)
```

- **Files:** `docs/autoresearch/program.md` (instructions), `apps/agent/src/stress-tests/probes/` (probes)
- **Entry:** Human opens Claude Code in repo, says "read docs/autoresearch/program.md"
- **Observation:** Three files on disk at `$HOME/.orbit-autoresearch/` (external to system under test, within Tauri ACL scope)
- **Metrics:** Pipeline assertions (pass/fail), boundary deltas (ms, lower = better), system health (long tasks, FPS, DOM nodes, RSS)
- **Revert:** `git checkout -- .` (discard uncommitted changes)
- **App lifecycle:** Probe calls `getCurrentWindow().close()` after writing results → `bunx tauri dev` terminates → agent reads files → next experiment

### Layer Comparison

| Layer             | Autoresearch                       | Orbit Autoresearch                                             |
| ----------------- | ---------------------------------- | -------------------------------------------------------------- |
| Agent runtime     | Claude Code CLI                    | Claude Code CLI                                                |
| Instructions      | `program.md`                       | `docs/autoresearch/program.md`                                 |
| Editable scope    | `train.py`                         | Any file (Rust, TS, sidecar)                                   |
| Experiment runner | `uv run train.py > run.log`        | `timeout 180 bunx tauri dev > terminal.log`                    |
| Observation       | `grep val_bpb run.log`             | `cat probe-result.json` + 2 log files                          |
| Metric            | `val_bpb` (float)                  | Assertions (bool) + boundary deltas (ms) + perf counters       |
| Revert            | `git reset --hard HEAD~1`          | `git checkout -- .`                                            |
| App termination   | Script self-terminates after 5 min | Probe calls `getCurrentWindow().close()` after writing results |
| Cadence           | ~12/hour (5 min per experiment)    | ~4-6/hour (Rust recompile + probe execution)                   |

---

## Critical Design Decisions (From Audits)

### Output directory: `$HOME/.orbit-autoresearch/` (NOT `/tmp/`)

Tauri's ACL scope is `$HOME/**`. The `writeFile` API enforces `ensure_workspace_paths`. Neither allows `/tmp/`. All probe output MUST go to `$HOME/.orbit-autoresearch/` which is within the existing ACL scope. Additionally, `dev_monitor_write_batch` (which has no workspace check) is used for probe results instead of `writeFile`.

### Foreground execution (NOT background `&`)

Claude Code's Bash tool does not reliably support background processes via `&`. The probe self-terminates the app after writing results, making `bunx tauri dev` a foreground process that naturally completes. Combined with `timeout 180`, this gives a clean lifecycle with no orphaned processes and no PID management.

### No HMR optimization

Vite HMR hot-reloads module code but does NOT re-trigger React `useEffect` hooks. The auto-probe-runner fires once on mount. After HMR, the new probe code is loaded but never executed. Every experiment requires a full app restart. TS-only changes are still faster than Rust changes (~15s vs ~60s recompile) but both need a reboot.

### Context management via `/compact`

Writing `progress.md` to disk does not compress the Claude Code conversation context. After ~15 experiments, context accumulates ~60-90K tokens. The program.md instructs the agent to write `progress.md` AND run `/compact` every 15 experiments. If the session degrades, the human starts a fresh session seeded by `progress.md`.

---

## Infrastructure — 5 Pieces (~150-200 Lines Total)

### Piece 1: Console Capture (~25 lines TS, 0 lines Rust)

Intercepts `console.log/warn/error` in dev mode. Maps to `DevLogEntry` schema. Flushes to disk via existing `dev_monitor_write_batch` command. No new Rust code.

**File:** `apps/agent/src/lib/dev/console-capture.ts` (new)
**Insertion point:** Called from `tauri-provider.tsx` after `Promise.all(listenerPromises)` completes (~line 807), between the `logger.info` call and `initializedRef.current = true` (~line 819).
**Uses:** Existing `dev_monitor_write_batch` from `src-tauri/src/commands/common/dev_monitor.rs`
**Output:** `$HOME/.orbit-autoresearch/console.jsonl`

**DevLogEntry field mapping for raw console calls:**

```typescript
// console.error("something broke", { detail: "xyz" })
// maps to:
{
  timestamp: Date.now(),
  severity: "error",
  category: "console:error",
  file: "unknown",           // console.* doesn't provide source location
  title: "something broke",  // first argument stringified
  details: '{"detail":"xyz"}',  // remaining arguments JSON-stringified
  context: null,
  dedupCount: 1,
}
```

**Startup race mitigation:** The insertion point at line 819 is already after `bootstrapRuntimeHealth` (line 268) and all listener setup, so Tauri IPC is guaranteed ready. No additional guarding needed.

### Piece 2: Auto-Run Trigger + Probe Self-Termination (~35 lines TS)

When `VITE_ORBIT_AUTO_PROBE` env var is set, auto-runs the named probe after session readiness, then exits the app.

**File:** `apps/agent/src/stress-tests/auto-probe-runner.ts` (new)
**Insertion point:** Wired into `use-chat-messages.ts` inside the `window.__orbit_debug` useEffect.

**Three files need changes (following existing stress test pattern from `stress-tests/CLAUDE.md`):**

1. **Type declaration** — `use-chat-messages.ts:64-87`: Add `runAutoProbe` to `Window['__orbit_debug']` interface. MUST be done before the `satisfies NonNullable<Window['__orbit_debug']>` check at line 549 or TypeScript will reject the build.

2. **Dynamic import** — `use-chat-messages.ts:~540` (inside `debugEntries` object):

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

3. **Auto-trigger on mount** — At the end of the useEffect (after `window.__orbit_debug = {...}`):
   ```typescript
   const autoProbe = import.meta.env.VITE_ORBIT_AUTO_PROBE;
   if (typeof autoProbe === 'string' && autoProbe.length > 0) {
     window.__orbit_debug?.runAutoProbe(autoProbe);
   }
   ```

**TypeScript env declaration** — Add to `apps/agent/env.d.ts` or `vite-env.d.ts`:

```typescript
interface ImportMetaEnv {
  readonly VITE_ORBIT_AUTO_PROBE?: string;
}
```

**Readiness gate:** Wait for `activeSessionId !== null` AND `isAgentRunning === false` with 30-second pre-flight timeout after `system:init`. Copy readiness pattern from `session-stress-test.ts`.

**Self-termination:** After writing probe results, the auto-runner terminates the app via the Tauri window API:

```typescript
import { getCurrentWindow } from '@tauri-apps/api/window';
getCurrentWindow().close(); // Closes last window → Tauri process exits
```

This makes the agent's `bunx tauri dev` call return naturally. Note: `process.exit(0)` does not exist in the browser context, and the DOM `window.close()` is silently ignored in Tauri WebView. Only the Tauri API works.

**Critical night-1 risk:** If the probe fires before session init completes, it produces a false-fail timeout. The readiness gate is mandatory.

### Piece 3: `[PERF]` Boundary Timestamps (~20 lines across 4 files)

Timestamped log lines at each pipeline boundary, correlated by message ID.

| Boundary            | File                                          | Insertion Point                                                  | Log Sink                      |
| ------------------- | --------------------------------------------- | ---------------------------------------------------------------- | ----------------------------- |
| `sidecar_received`  | `agent-bridge/src/agent/core/agent.ts`        | for-await query loop                                             | stderr → terminal log         |
| `sidecar_emitted`   | `agent-bridge/src/agent/core/agent.ts`        | stdout emit point                                                | stderr → terminal log         |
| `rust_received`     | `src-tauri/src/agent/bridge.rs`               | line 211, after `Ok(response)`                                   | `log::info!` → terminal log   |
| `rust_emitted`      | `src-tauri/src/commands/agent/lifecycle.rs`   | inside `setup_event_callbacks` (~line 633)                       | `log::info!` → terminal log   |
| `frontend_received` | `apps/agent/src/providers/tauri-provider.tsx` | line 282, after messageId assignment                             | `console.log` → console JSONL |
| `store_updated`     | `apps/agent/src/stores/chat/chat-store.ts`    | line 291 (actual `appendToLastMessage` impl), after `set()` call | `console.log` → console JSONL |

**Format:** `[PERF] <message_id> <boundary_name> <unix_timestamp_ms>`

**Rust code (correct pattern — must match on BridgeEvent variant):**

```rust
// src-tauri/src/agent/bridge.rs, inside reader_thread after line 211:
#[cfg(debug_assertions)]
if let Some(crate::agent::protocol::BridgeEvent::AgentMessage { message, .. }) = response.as_event() {
    if let Some(ref msg_id) = message.message_id {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        log::info!("[PERF] {msg_id} rust_received {ts}");
    }
}
```

**Frontend logger note:** The `[PERF]` lines use `console.log` directly (not the structured `createLogger`), because they need to be intercepted by the console capture (Piece 1). The structured logger (`createLogger`) also routes through `console.*` internally (`apps/common/src/lib/logger.ts:108,124,139,159`), so either works. Use `console.log` for simplicity and explicitness.

### Piece 4: RSS Measurement (~20 lines Rust)

Tauri command that measures process memory (both Tauri main process and sidecar child).

**File:** `src-tauri/src/commands/common/diagnostics.rs` — add to existing file
**Registration:** Add to `generate_handler![]` in `lib.rs`

**Required: New accessor on SessionManager** — `bridge` is a private field on `SessionManager` (`session.rs:22`). The RSS command needs the sidecar child PID. Add to `session.rs`:

```rust
impl SessionManager {
    pub fn sidecar_pid(&self) -> Option<u32> {
        self.bridge.lock().child.as_ref().and_then(|c| c.id())
    }
}
```

**Command implementation:**

```rust
#[tauri::command]
pub fn dev_get_process_rss(
    session_manager: State<'_, Arc<SessionManager>>,
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

    Ok(total_kb / 1024.0) // Return MB
}
```

**Guard:** Runtime `if !cfg!(debug_assertions)` (matching `sentry_test_capture` pattern in `diagnostics.rs`).

### Piece 5: Probe Result Writing (~15 lines TS)

Probes write structured JSON results to disk via `dev_monitor_write_batch`.

**IMPORTANT:** Cannot use `writeFile` from `lib/api/files.ts` — that API calls `ensure_workspace_paths` which blocks writes outside the workspace directory. Use `dev_monitor_write_batch` instead (no workspace check).

**Output:** `$HOME/.orbit-autoresearch/probe-result.json`
**Write strategy:** Direct write via `dev_monitor_write_batch`. No atomic rename — `fs:allow-rename` may not be in ACL, and the agent polls with `sleep 2` so partial-read risk is negligible. The probe writes the complete JSON in a single `dev_monitor_write_batch` call.

**Result format:** Extends existing `StepResult` from `rewind-mega-stress-test.ts:79-88`

```typescript
interface ProbeResult {
  probe: string;
  timestamp: string;
  duration_ms: number;
  overall_success: boolean;

  assertions: Array<{
    name: string;
    passed: boolean;
    expected?: unknown;
    actual?: unknown;
  }>;

  pipeline?: {
    messages_sent: number;
    messages_arrived: number;
    boundary_deltas_ms?: Record<string, number>;
  };

  performance?: {
    long_tasks: number;
    avg_frame_ms: number;
    p99_frame_ms: number;
    dom_nodes: { before: number; after: number };
    rss_mb: { before: number; after: number };
  };

  steps: StepResult[]; // Reuse existing type from mega stress test
}
```

**Probe primitives file** (`apps/agent/src/stress-tests/probe-primitives.ts`, ~50 lines):

- `writeProbeResult(result: ProbeResult)` — writes via `dev_monitor_write_batch` to `$HOME/.orbit-autoresearch/`
- `startPerfMeasurement()` — returns `{ stop: () => PerfSnapshot }` (PerformanceObserver + rAF counter + DOM node count)
- `waitForReady(timeout)` — session readiness gate (copied from `session-stress-test.ts`)
- `exitApp()` — calls `getCurrentWindow().close()` from `@tauri-apps/api/window` to terminate the Tauri app after probe completion

---

## Behavioral Contracts to Preserve

### Contract 1: Dev-Only Code Never Ships to Production

- **What:** All autoresearch infrastructure must be excluded from production builds.
- **Where:** `vite.config.ts` (tree-shaking on `import.meta.env.DEV`), Rust `#[cfg(debug_assertions)]`
- **Why:** Zero performance cost to users. No debug surface in released binaries.
- **How:** Console capture gated on `import.meta.env.DEV`. Rust commands use runtime guard. Probes are dynamic imports inside `import.meta.env.DEV` blocks.

### Contract 2: Existing Stress Tests Continue Working

- **What:** `window.__orbit_debug.runMegaStressTest()` and all existing stress tests remain functional.
- **Where:** `apps/agent/src/hooks/chat/use-chat-messages.ts:430-549`
- **Why:** Existing tests are battle-tested; auto-probe is additive, not a replacement.
- **How:** Auto-probe runner is a new entry in `debugEntries`, wired identically to existing tests. `Window.__orbit_debug` interface updated at lines 64-87 before the `satisfies` check at line 549.

### Contract 3: No New Dependencies

- **What:** The entire system uses only existing packages and crates.
- **Where:** `package.json`, `Cargo.toml`
- **Why:** Zero binary size impact, zero compile time impact.
- **How:** Uses `dev_monitor_write_batch` (existing), `console.*` (built-in), `PerformanceObserver` (built-in), `ps` (system tool).

### Contract 4: Sidecar Stderr Inherits to Parent

- **What:** Sidecar `[PERF]` lines written to `process.stderr` appear in the terminal log.
- **Where:** `src-tauri/src/agent/bridge.rs:133` — `stderr(Stdio::inherit())`
- **Why:** The agent reads `$HOME/.orbit-autoresearch/terminal.log` which captures stderr.
- **How:** Verified: `Stdio::inherit()` is already set. No change needed.

### Contract 5: Output Directory Within Tauri ACL Scope

- **What:** All probe output goes to `$HOME/.orbit-autoresearch/`, NOT `/tmp/`.
- **Where:** Tauri ACL at `src-tauri/capabilities/default.json` — scope is `$HOME/**`
- **Why:** `/tmp/` resolves to `/private/tmp` on macOS, outside the ACL scope. `writeFile` also enforces `ensure_workspace_paths` (`files.rs:314-338`) which blocks non-workspace paths.
- **How:** Use `dev_monitor_write_batch` (no workspace check) for all disk writes. Output directory is `$HOME/.orbit-autoresearch/`.

---

## Implementation Phases

### Phase 1: Rust Commands + Bridge Logging (one recompile)

**File:** `src-tauri/src/agent/session.rs` — add `sidecar_pid()` accessor

```rust
pub fn sidecar_pid(&self) -> Option<u32> {
    self.bridge.lock().child.as_ref().and_then(|c| c.id())
}
```

**File:** `src-tauri/src/commands/common/diagnostics.rs` — add `dev_get_process_rss` (see Piece 4 above)

**File:** `src-tauri/src/commands/common/mod.rs` — export new command

**File:** `src-tauri/src/lib.rs` — register `dev_get_process_rss` in `generate_handler![]`

**File:** `src-tauri/src/agent/bridge.rs` — add `[PERF]` logging at line 211 (see Piece 3 Rust code above). Must match on `BridgeEvent::AgentMessage(msg)`, not call `event.message_id` directly.

**File:** `src-tauri/src/commands/agent/lifecycle.rs` — add `[PERF]` in `setup_event_callbacks` (~line 633)

**Tests:** `cargo check` (compiles), `cargo clippy --workspace -- -D warnings` (no warnings)

### Phase 2: Frontend Probe Scaffold (requires Phase 1 recompile)

**File:** `apps/agent/src/lib/dev/console-capture.ts` (new, ~25 lines)

- Intercepts `console.log/warn/error`
- Maps to `DevLogEntry` schema (see Piece 1 field mapping)
- Flushes every 1s via `dev_monitor_write_batch`
- Only activates when `import.meta.env.DEV`

**File:** `apps/agent/src/stress-tests/auto-probe-runner.ts` (new, ~35 lines)

- Reads `import.meta.env.VITE_ORBIT_AUTO_PROBE`
- Waits for session readiness (copies pattern from `session-stress-test.ts`)
- Dynamically imports the named probe from `@/stress-tests/probes/<name>`
- Runs probe, writes result to `$HOME/.orbit-autoresearch/probe-result.json`
- Self-terminates app after writing results

**File:** `apps/agent/src/stress-tests/probe-primitives.ts` (new, ~50 lines)

- `writeProbeResult()`, `startPerfMeasurement()`, `waitForReady()`, `exitApp()`

**File:** `apps/agent/env.d.ts` or `vite-env.d.ts` — add `VITE_ORBIT_AUTO_PROBE` declaration

**File:** `apps/agent/src/hooks/chat/use-chat-messages.ts` — three changes:

1. Add `runAutoProbe` to `Window.__orbit_debug` interface (lines 64-87)
2. Add dynamic import entry in `debugEntries` (after line 540)
3. Add auto-trigger at end of useEffect (after `window.__orbit_debug` assignment)

**File:** `apps/agent/src/providers/tauri-provider.tsx` — add `[PERF]` at line 282 + init console capture at line 819

**File:** `apps/agent/src/stores/chat/chat-store.ts` — add `[PERF]` at line 291 (inside `appendToLastMessage` implementation, after `set()` call)

**Tests:** `bun run typecheck` (no errors), `bun run lint` (zero warnings)

### Phase 3: Sidecar Boundary Markers (one sidecar rebuild)

**File:** `agent-bridge/src/agent/core/agent.ts` — add `[PERF]` stderr logging

```typescript
process.stderr.write(`[PERF] ${messageId} sidecar_received ${Date.now()}\n`);
process.stderr.write(`[PERF] ${messageId} sidecar_emitted ${Date.now()}\n`);
```

**Rebuild:** `cd agent-bridge && bun run build:sidecar` (NOT `build:dev` — wrong output path per CLAUDE.md)
**Tests:** `cd agent-bridge && bun run typecheck`

### Phase 4: First Probe + Program.md

**File:** `apps/agent/src/stress-tests/probes/pipeline-baseline.ts` (new)

- Establishes baseline: send 3 messages, measure boundary deltas, record perf metrics
- Uses all probe primitives from Phase 2
- Self-terminates app after writing results

**File:** `docs/autoresearch/program.md` (new) — see Program.md Content section below

**File:** `docs/autoresearch/results.tsv` (created by agent on first run)

**Tests:** Manual — run `VITE_ORBIT_AUTO_PROBE=pipeline-baseline bunx tauri dev`, verify result file appears at `$HOME/.orbit-autoresearch/probe-result.json`.

---

## Phase Dependencies

```
Phase 1 (Rust commands + bridge logging) ──→ Phase 2 (Frontend scaffold)
                                          ──→ Phase 3 (Sidecar markers)
                                                      │
Phase 2 + Phase 3 ─────────────────────────────────→ Phase 4 (First probe + program.md)
```

Phase 1 must complete first (requires Rust recompile).
Phases 2 and 3 can run in parallel after Phase 1.
Phase 4 requires both 2 and 3.

---

## Program.md Content (Phase 4 Deliverable)

This is the agent's "brain." It must be complete — an agent reading this document alone must be able to run experiments all night.

### results.tsv Format

```
commit	probe	assertions_passed	boundary_p50_ms	status	description
a1b2c3d	pipeline-baseline	5/5	12.3	keep	baseline established
b2c3d4e	rapid-fire-10	4/5	45.7	fixed	message ordering bug in appendToLastMessage
c3d4e5f	perf-file-load	3/5	0.0	fixed	CodeMirror not unmounting on file close
```

Tab-separated. Columns: short commit hash, probe name, assertion pass count, median boundary delta (0.0 for non-pipeline probes), status (`keep`/`fixed`/`crash`/`transient`), description.

### Decision Rules

- **Assertions all pass, no regression:** Log as `keep`, move to next hypothesis.
- **Assertion fails, reproducible:** Diagnose → patch → verify same probe passes → `git commit` → log as `fixed`.
- **Assertion fails, not reproducible on retry:** Log as `transient`, move on. Do NOT patch.
- **`cargo check` fails after patch:** Try to fix the compile error once. If second fix also fails, `git checkout -- .` and move on. Never spend more than 2 attempts on a single compile error.
- **App crashes (no result file after timeout):** Read terminal log. If obvious bug (typo, missing import), fix and retry. If fundamentally broken, revert and move on.

### Kill Sequence

```bash
# Kill ALL processes from bunx tauri dev (Vite + Tauri + Rust binary)
pkill -f "tauri dev" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
sleep 2
```

The probe self-terminates, so this is only needed for crashes where the app hangs.

### Transient Failure Handling

If a probe fails with "Timeout" and the terminal log shows OAuth/network errors:

1. Wait 60 seconds
2. Retry the exact same probe (no code changes)
3. If retry passes → log as `transient`, continue
4. If retry fails → log as `transient`, skip, move to next hypothesis
5. Do NOT patch for transient failures

### Context Management

After every 15 experiments:

1. Write findings summary to `docs/autoresearch/progress.md`
2. Run `/compact` to compress conversation context
3. Continue experimenting

If the session becomes unresponsive or reasoning quality degrades, write a final note to `progress.md`: "Context restart needed. Resume from progress.md." The human starts a fresh session.

---

## Operational Parameters

| Parameter                | Value                                        | Rationale                                                         |
| ------------------------ | -------------------------------------------- | ----------------------------------------------------------------- |
| Experiments per night    | 15-25                                        | ~8-15 min/cycle (Rust recompile + boot + probe + read + diagnose) |
| API cost per night       | ~$1-3                                        | Sonnet with prompt caching                                        |
| App timeout              | 180s                                         | Covers ~60s compile + ~60s boot + ~60s probe                      |
| Session readiness wait   | 30s                                          | Sidecar spawn + OAuth + session init                              |
| Console flush interval   | 1s                                           | Balances latency vs overhead                                      |
| `[PERF]` log format      | `[PERF] <msgId> <boundary> <timestamp_ms>`   | Grep-parsable, correlatable                                       |
| Context management       | Every 15 experiments: progress.md + /compact | Prevents context window overflow                                  |
| Max compile fix attempts | 2                                            | Prevents repair loops                                             |
| Transient retry          | 1 retry after 60s wait                       | Distinguishes real bugs from network blips                        |
| Output directory         | `$HOME/.orbit-autoresearch/`                 | Within Tauri ACL scope (`$HOME/**`)                               |

---

## Scope Boundaries

### In Scope

- Pipeline data flow correctness (message arrives intact at each boundary)
- Boundary performance bottlenecks (which layer is slow, via timing deltas)
- System performance under load (long tasks, FPS, DOM growth, RSS)
- Crash reproduction and patching
- Sidecar type boundary bugs (LocalSDKMessage cast mismatches)
- Race conditions observable through store state (rewind epoch, checkpoint debounce)

### Out of Scope (Accepted Limitations)

- Pure rendering bugs (store correct, React/CSS produced wrong output)
- Local `useState` component state (invisible to Zustand observation)
- Visual regression (pixel-level comparison)
- Schema drift between TS/Rust/Zod types (better as CI job)
- JS heap measurement in WKWebView (`performance.memory` is undefined)
- Multi-user / concurrent session testing

---

## Verification

### Automated (per phase)

```bash
# Phase 1
cargo check                                    # Rust compiles
cargo clippy --workspace -- -D warnings        # No lint warnings

# Phase 2
bun run typecheck                              # TS compiles
bun run lint                                   # Zero ESLint warnings

# Phase 3
cd agent-bridge && bun run typecheck           # Sidecar compiles
cd agent-bridge && bun run build:sidecar       # Sidecar binary builds

# Phase 4 — end-to-end
VITE_ORBIT_AUTO_PROBE=pipeline-baseline timeout 180 bunx tauri dev \
  > $HOME/.orbit-autoresearch/terminal.log 2>&1
cat $HOME/.orbit-autoresearch/probe-result.json  # Valid JSON with overall_success
```

### Manual

1. Start app with `VITE_ORBIT_AUTO_PROBE=pipeline-baseline timeout 180 bunx tauri dev > $HOME/.orbit-autoresearch/terminal.log 2>&1`
2. Wait ~90 seconds for boot + probe execution + self-termination
3. Verify `$HOME/.orbit-autoresearch/probe-result.json` exists with `overall_success: true`
4. Verify `$HOME/.orbit-autoresearch/console.jsonl` has entries
5. Verify `grep "\[PERF\]" $HOME/.orbit-autoresearch/terminal.log` shows boundary timestamps
6. Open Claude Code in repo, say "read docs/autoresearch/program.md and kick off"
7. Observe: agent writes first probe, boots app, reads results, begins experiment loop

---

## Files Changed Summary

| File                                                      | Action                                                    | Phase |
| --------------------------------------------------------- | --------------------------------------------------------- | ----- |
| `src-tauri/src/agent/session.rs`                          | Modify — add `sidecar_pid()` accessor                     | 1     |
| `src-tauri/src/commands/common/diagnostics.rs`            | Modify — add `dev_get_process_rss`                        | 1     |
| `src-tauri/src/commands/common/mod.rs`                    | Modify — export new command                               | 1     |
| `src-tauri/src/lib.rs`                                    | Modify — register in `generate_handler![]`                | 1     |
| `src-tauri/src/agent/bridge.rs`                           | Modify — add `[PERF]` logging (~line 211)                 | 1     |
| `src-tauri/src/commands/agent/lifecycle.rs`               | Modify — add `[PERF]` in event callback                   | 1     |
| `apps/agent/src/lib/dev/console-capture.ts`               | **New** — console interceptor + DevLogEntry mapping       | 2     |
| `apps/agent/src/stress-tests/auto-probe-runner.ts`        | **New** — auto-run trigger + app self-termination         | 2     |
| `apps/agent/src/stress-tests/probe-primitives.ts`         | **New** — shared probe utilities                          | 2     |
| `apps/agent/env.d.ts`                                     | Modify — add `VITE_ORBIT_AUTO_PROBE` type                 | 2     |
| `apps/agent/src/hooks/chat/use-chat-messages.ts`          | Modify — wire auto-probe to `__orbit_debug` (3 changes)   | 2     |
| `apps/agent/src/providers/tauri-provider.tsx`             | Modify — `[PERF]` line (282) + console capture init (819) | 2     |
| `apps/agent/src/stores/chat/chat-store.ts`                | Modify — `[PERF]` at line 291 (appendToLastMessage impl)  | 2     |
| `agent-bridge/src/agent/core/agent.ts`                    | Modify — `[PERF]` stderr logging                          | 3     |
| `apps/agent/src/stress-tests/probes/pipeline-baseline.ts` | **New** — first probe                                     | 4     |
| `docs/autoresearch/program.md`                            | **New** — agent instructions (complete content)           | 4     |
