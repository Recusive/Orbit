# Orbit Autoresearch — Autonomous Pipeline Hardening

## Context

Orbit is a Tauri 2 desktop app (Rust backend + React 19 frontend + Claude Agent SDK sidecar) with 160+ tests across three layers. All tests pass in isolation (`cargo test`, `bun test`, `vitest`). But the full pipeline breaks at boundaries between layers — the handoffs where SDK responses cross from sidecar to Rust to Tauri events to Zustand stores.

Karpathy's [autoresearch](https://github.com/karpathy/autoresearch) demonstrates that an autonomous agent can run overnight, iterating on code with a fixed metric, and produce measurable improvements. This design adapts that pattern to codebase hardening: instead of optimizing `val_bpb`, the agent finds and patches pipeline bugs, performance bottlenecks, and boundary failures.

**Reference:** `reference/autoresearch/program.md` — the blueprint for the experiment loop.

**Validated by:** 9 expert audits across 3 rounds (systems architect, Rust/Tauri engineer, React/TypeScript engineer), each reading actual source code.

---

## Design Principles

1. **Observation is external to the system under test.** Files on disk, not middleware inside the app. If the app crashes, the log files still exist.
2. **Probes run inside the app through the real pipeline.** Not mocked, not isolated — the full SDK → sidecar → Rust → Tauri → store → render path.
3. **Metrics are objective and automatable.** Pipeline assertions (pass/fail), boundary timing deltas (lower = better), performance counters (long tasks, DOM nodes, RSS).
4. **Infrastructure is minimal.** ~48 lines of new code, reusing existing `dev_monitor`, `writeFile`, and stress test patterns.
5. **The agent is just Claude Code + program.md.** No SDK wrapper, no custom harness. Identical to how autoresearch runs.

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
Human says:   "read program.md and kick off"
Claude Code:  reads program.md → enters LOOP FOREVER:
  │
  ├─ Write probe: apps/agent/src/stress-tests/probes/<name>.ts
  ├─ Boot app: VITE_ORBIT_AUTO_PROBE=<name> bunx tauri dev > /tmp/orbit-terminal.log 2>&1 &
  ├─ Wait: poll for /tmp/orbit-probe-result.json (timeout 2 min)
  ├─ Read 3 files:
  │   ├─ /tmp/orbit-probe-result.json  → assertions + boundary deltas + perf metrics
  │   ├─ /tmp/orbit-console.jsonl      → frontend console.log/warn/error
  │   └─ /tmp/orbit-terminal.log       → Rust logs, sidecar stderr, build errors
  │
  ├─ Evaluate:
  │   ├─ Assertions failed? → which boundary? (grep [PERF] for timing)
  │   ├─ Performance degraded? → which layer? (boundary deltas)
  │   └─ Crash? → read terminal log for stack trace
  │
  ├─ If broken: diagnose → patch → cargo check / bun run typecheck → verify → commit
  ├─ If resilient: log to results.tsv → next hypothesis
  └─ Every 20 experiments: write progress.md (context management)
```

- **Files:** `docs/autoresearch/program.md` (instructions), `apps/agent/src/stress-tests/probes/` (probes)
- **Entry:** Human opens Claude Code in repo, says "read program.md"
- **Observation:** Three files on disk (external to system under test)
- **Metrics:** Pipeline assertions (pass/fail), boundary deltas (ms, lower = better), system health (long tasks, FPS, DOM nodes, RSS)
- **Revert:** `git checkout -- .` (discard uncommitted changes)

### Layer Comparison

| Layer             | Autoresearch                    | Orbit Autoresearch                                       |
| ----------------- | ------------------------------- | -------------------------------------------------------- |
| Agent runtime     | Claude Code CLI                 | Claude Code CLI                                          |
| Instructions      | `program.md`                    | `docs/autoresearch/program.md`                           |
| Editable scope    | `train.py`                      | Any file (Rust, TS, sidecar)                             |
| Experiment runner | `uv run train.py > run.log`     | `bunx tauri dev > /tmp/orbit-terminal.log`               |
| Observation       | `grep val_bpb run.log`          | `cat /tmp/orbit-probe-result.json` + 2 log files         |
| Metric            | `val_bpb` (float)               | Assertions (bool) + boundary deltas (ms) + perf counters |
| Revert            | `git reset --hard HEAD~1`       | `git checkout -- .`                                      |
| Cadence           | ~12/hour (5 min per experiment) | ~3-8/hour (depends on Rust vs TS-only changes)           |

---

## Infrastructure — 5 Pieces (~48 Lines Total)

### Piece 1: Console Capture (~10 lines TS, 0 lines Rust)

Intercepts `console.log/warn/error` in dev mode. Flushes to disk via existing `dev_monitor_write_batch` command. No new Rust code needed.

**File:** `apps/agent/src/lib/dev/console-capture.ts` (new)
**Insertion point:** Called from `tauri-provider.tsx` after `Promise.all(listenerPromises)` completes (~line 818), inside the `!controller.isAborted()` check.
**Uses:** Existing `dev_monitor_write_batch` from `src-tauri/src/commands/common/dev_monitor.rs`
**Output:** `/tmp/orbit-console.jsonl`

**Startup race mitigation:** Only begin flushing after `bootstrapRuntimeHealth` completes (`tauri-provider.tsx:268`), which is the first successful round-trip to the backend.

### Piece 2: Auto-Run Trigger (~10 lines TS)

When `VITE_ORBIT_AUTO_PROBE` env var is set, auto-runs the named probe after session readiness.

**File:** `apps/agent/src/stress-tests/auto-probe-runner.ts` (new)
**Insertion point:** Wired into `use-chat-messages.ts` inside the `window.__orbit_debug` useEffect (~line 435), following the existing dynamic import pattern.
**Env var:** Must be `VITE_ORBIT_AUTO_PROBE` (Vite prefix required; value baked at build time).
**Readiness gate:** Wait for `activeSessionId !== null` AND `isAgentRunning === false` with 30-second pre-flight timeout after `system:init`. Copy readiness pattern from `session-stress-test.ts`.

**Critical night-1 risk:** If the probe fires before session init completes, it produces a false-fail timeout that wastes the overnight session. The readiness gate is mandatory.

### Piece 3: `[PERF]` Boundary Timestamps (~14 lines across 4 files)

Timestamped log lines at each pipeline boundary, correlated by message ID.

| Boundary            | File                                          | Line                                | Log Sink                      |
| ------------------- | --------------------------------------------- | ----------------------------------- | ----------------------------- |
| `sidecar_received`  | `agent-bridge/src/agent/core/agent.ts`        | ~1250 (for-await loop)              | stderr → terminal log         |
| `sidecar_emitted`   | `agent-bridge/src/agent/core/agent.ts`        | stdout emit point                   | stderr → terminal log         |
| `rust_received`     | `src-tauri/src/agent/bridge.rs`               | ~212 (after `Ok(response)` match)   | `log::info!` → terminal log   |
| `rust_emitted`      | `src-tauri/src/commands/agent/lifecycle.rs`   | event callback                      | `log::info!` → terminal log   |
| `frontend_received` | `apps/agent/src/providers/tauri-provider.tsx` | ~282 (after messageId assignment)   | `console.log` → console JSONL |
| `store_updated`     | `apps/agent/src/stores/chat/chat-store.ts`    | ~100 (inside `appendToLastMessage`) | `console.log` → console JSONL |

**Format:** `[PERF] <message_id> <boundary_name> <unix_timestamp_ms>`
**Rust guard:** `#[cfg(debug_assertions)]` or runtime `if cfg!(debug_assertions)` (matching existing pattern in `diagnostics.rs`).
**Message ID extraction in Rust:** Available after `serde_json::from_str::<BridgeResponse>` succeeds, via `response.as_event()` → `AgentMessage.message_id`.

### Piece 4: RSS Measurement (~12 lines Rust)

Tauri command that measures process memory (both Tauri main process and sidecar child).

**File:** `src-tauri/src/commands/common/diagnostics.rs` (add to existing file)
**Registration:** Add to `generate_handler![]` in `lib.rs` (~line 375-621)
**Implementation:** `ps -o rss= -p <pid>` via `std::process::Command`. Measure both `std::process::id()` (Tauri) and sidecar child PID (from `AgentBridge.child.id()`).
**Guard:** Runtime `if !cfg!(debug_assertions)` (matching `sentry_test_capture` pattern in same file).

### Piece 5: Probe Result Writing (~2 lines TS)

Probes write structured JSON results to disk.

**Uses:** Existing `writeFile` from `apps/agent/src/lib/api/files.ts` — already exposed, no new Rust command needed.
**Output:** `/tmp/orbit-probe-result.json` (atomic: write to `.tmp`, rename)
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

---

## Behavioral Contracts to Preserve

### Contract 1: Dev-Only Code Never Ships to Production

- **What:** All autoresearch infrastructure must be excluded from production builds.
- **Where:** `vite.config.ts` (tree-shaking on `import.meta.env.DEV`), Rust `#[cfg(debug_assertions)]`
- **Why:** Zero performance cost to users. No debug surface in released binaries.
- **How:** Console capture gated on `import.meta.env.DEV`. Rust commands use runtime guard. Probes are dynamic imports inside `import.meta.env.DEV` blocks.

### Contract 2: Existing Stress Tests Continue Working

- **What:** `window.__orbit_debug.runMegaStressTest()` and all existing stress tests remain functional.
- **Where:** `apps/agent/src/hooks/chat/use-chat-messages.ts:430-500`
- **Why:** Existing tests are battle-tested; auto-probe is additive, not a replacement.
- **How:** Auto-probe runner is a new entry in `debugEntries`, wired identically to existing tests.

### Contract 3: No New Dependencies

- **What:** The entire system uses only existing packages and crates.
- **Where:** `package.json`, `Cargo.toml`
- **Why:** Zero binary size impact, zero compile time impact.
- **How:** Uses `dev_monitor_write_batch` (existing), `writeFile` (existing), `console.*` (built-in), `PerformanceObserver` (built-in), `ps` (system tool).

### Contract 4: Sidecar Stderr Inherits to Parent

- **What:** Sidecar `[PERF]` lines written to `process.stderr` appear in the terminal log.
- **Where:** `src-tauri/src/agent/bridge.rs:133` — `stderr(Stdio::inherit())`
- **Why:** The agent reads `/tmp/orbit-terminal.log` which captures stderr.
- **How:** Verified: `Stdio::inherit()` is already set. No change needed.

---

## Engineering Stages Assessment

| Stage                | Applies? | Notes                                                                                            |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| 1. Data Modeling     | Yes      | `ProbeResult`, `DevLogEntry` (existing), `[PERF]` line format                                    |
| 2. State Ownership   | N/A      | No new persistent state. Log files are ephemeral (`/tmp/`).                                      |
| 3. Error Enumeration | Yes      | Probe timeout, build failure, session not ready, sidecar crash                                   |
| 4. Concurrency       | Partial  | Bridge mutex blocks during active sessions; probes run sequentially                              |
| 5. Public API        | Yes      | `dev_get_process_rss` command, `window.__orbit_debug.runAutoProbe`                               |
| 6. Config            | N/A      | Single env var `VITE_ORBIT_AUTO_PROBE`. No settings file changes.                                |
| 7. Dependencies      | N/A      | Zero new dependencies                                                                            |
| 8. Top-Down Design   | Yes      | Covered in System Design section above                                                           |
| 9. Testing           | Partial  | The system tests itself. Manual verification via DevTools console.                               |
| 10. Migration        | N/A      | No existing state to migrate                                                                     |
| 11. Performance      | Yes      | `[PERF]` lines are `log::info!` level (no-op in prod). Console capture flushes every 1s.         |
| 12. Security         | Yes      | `dev_get_process_rss` gated behind `debug_assertions`. No new file system access beyond `/tmp/`. |
| 13. Integration      | Yes      | Touches bridge.rs reader thread, tauri-provider.tsx, chat-store.ts, lifecycle.rs                 |
| 14. Convention Audit | Yes      | Follows existing stress test 3-file wiring pattern, `dev_monitor` command pattern                |
| 16. Alien Code Test  | Yes      | New code must look like it belongs next to existing stress tests and dev_monitor commands        |

---

## Implementation Phases

### Phase 1: Rust Commands (one reboot, done once)

**File:** `src-tauri/src/commands/common/diagnostics.rs` — add `dev_get_process_rss`

```rust
/// Returns process RSS in MB (main process + sidecar).
/// Dev-only: returns 0.0 in release builds.
#[tauri::command]
pub fn dev_get_process_rss(
    session_manager: State<'_, Arc<SessionManager>>,
) -> Result<f64, String> {
    if !cfg!(debug_assertions) {
        return Ok(0.0);
    }
    // Shell out to ps for both PIDs, sum and return MB
}
```

**File:** `src-tauri/src/commands/common/mod.rs` — export
**File:** `src-tauri/src/lib.rs` — register in `generate_handler![]`

**File:** `src-tauri/src/agent/bridge.rs` — add `[PERF]` logging at ~line 212

```rust
// Inside reader_thread, after Ok(response) match:
#[cfg(debug_assertions)]
if let Some(event) = response.as_event() {
    if let Some(msg_id) = event.message_id.as_deref() {
        log::info!("[PERF] {msg_id} rust_received {}", timestamp_ms());
    }
}
```

**File:** `src-tauri/src/commands/agent/lifecycle.rs` — add `[PERF]` in event callback

**Tests:** `cargo check` (compiles), `cargo clippy` (no warnings)

### Phase 2: Frontend Probe Scaffold (TS-only, HMR after Phase 1)

**File:** `apps/agent/src/lib/dev/console-capture.ts` (new, ~10 lines)

- Intercepts `console.log/warn/error`
- Buffers entries, flushes every 1s via `dev_monitor_write_batch`
- Only activates when `import.meta.env.DEV && VITE_ORBIT_AUTO_PROBE`

**File:** `apps/agent/src/stress-tests/auto-probe-runner.ts` (new, ~30 lines)

- Reads `VITE_ORBIT_AUTO_PROBE` env var
- Waits for session readiness (copies pattern from `session-stress-test.ts`)
- Dynamically imports the named probe
- Runs it, writes result via `writeFile` to `/tmp/orbit-probe-result.json`

**File:** `apps/agent/src/stress-tests/probe-primitives.ts` (new, ~40 lines)

- `writeProbeResult(result: ProbeResult)` — atomic write (tmp + rename)
- `startPerfMeasurement()` — returns `{ stop: () => PerfSnapshot }` (PerformanceObserver + rAF counter)
- `waitForReady(timeout)` — session readiness gate
- `measureBoundaryDelta(logFile, messageId)` — parses `[PERF]` lines from log

**File:** `apps/agent/src/hooks/chat/use-chat-messages.ts` — wire auto-probe-runner

- Add type declaration for `runAutoProbe` to `Window.__orbit_debug`
- Add dynamic import entry in the dev-mode useEffect (~line 435)

**File:** `apps/agent/src/providers/tauri-provider.tsx` — add `[PERF]` at ~line 282 and init console capture

**File:** `apps/agent/src/stores/chat/chat-store.ts` — add `[PERF]` inside `appendToLastMessage`

**Tests:** `bun run typecheck` (no errors), `bun run lint` (zero warnings)

### Phase 3: Sidecar Boundary Markers (one sidecar rebuild)

**File:** `agent-bridge/src/agent/core/agent.ts` — add `[PERF]` stderr logging

```typescript
// At SDK response receipt point:
process.stderr.write(`[PERF] ${messageId} sidecar_received ${Date.now()}\n`);
// At event emit point:
process.stderr.write(`[PERF] ${messageId} sidecar_emitted ${Date.now()}\n`);
```

**Rebuild:** `cd agent-bridge && bun run build:sidecar`
**Tests:** `cd agent-bridge && bun run typecheck`

### Phase 4: First Probe + Program.md

**File:** `apps/agent/src/stress-tests/probes/pipeline-baseline.ts` (new)

- Establishes baseline: send 3 messages, measure boundary deltas, record perf metrics
- Uses all probe primitives from Phase 2

**File:** `docs/autoresearch/program.md` (new)

- Full experiment loop instructions (the agent's "brain")
- Setup procedure, probe writing guide, results.tsv format
- HMR vs reboot decision logic
- Context management (progress.md every 20 experiments)
- "NEVER STOP" directive

**File:** `docs/autoresearch/results.tsv` (new, created by agent on first run)

**Tests:** Manual — run `VITE_ORBIT_AUTO_PROBE=pipeline-baseline bunx tauri dev`, verify result file appears.

---

## Phase Dependencies

```
Phase 1 (Rust commands + bridge logging)
    │
    ├─→ Phase 2 (Frontend scaffold, console capture, auto-runner)
    │       │
    │       └─→ Phase 4 (First probe + program.md)
    │
    └─→ Phase 3 (Sidecar markers)
            │
            └─→ Phase 4
```

Phase 1 must complete first (requires Rust recompile).
Phases 2 and 3 can run in parallel after Phase 1.
Phase 4 requires both 2 and 3.

---

## Operational Parameters

| Parameter              | Value                                      | Rationale                                 |
| ---------------------- | ------------------------------------------ | ----------------------------------------- |
| Experiments per night  | 25-48                                      | 8-12 min/cycle with mixed Rust/TS changes |
| API cost per night     | ~$1-3                                      | Sonnet with prompt caching                |
| Probe timeout          | 2 min                                      | Covers 60s boot + 60s probe execution     |
| Session readiness wait | 30s                                        | Sidecar spawn + OAuth + session init      |
| Console flush interval | 1s                                         | Balances latency vs overhead              |
| `[PERF]` log format    | `[PERF] <msgId> <boundary> <timestamp_ms>` | Grep-parsable, correlatable               |
| Context management     | progress.md every 20 experiments           | Prevents context window overflow          |

## HMR Optimization

For TS-only probe changes (no Rust edits), the agent skips kill/reboot:

- Edit probe `.ts` file → Vite HMR delivers in <1s
- Probe re-runs automatically (auto-probe-runner detects file change)
- Per-experiment overhead drops from 60s to <5s
- Doubles experiment throughput for frontend-focused campaigns

**Decision encoded in program.md:** "Did I edit a Rust file? If yes → kill + restart. If TS only → let HMR handle it."

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

# Phase 4
VITE_ORBIT_AUTO_PROBE=pipeline-baseline bunx tauri dev  # Probe runs
cat /tmp/orbit-probe-result.json               # Result file exists with valid JSON
```

### Manual

1. Start app with `VITE_ORBIT_AUTO_PROBE=pipeline-baseline bunx tauri dev > /tmp/orbit-terminal.log 2>&1`
2. Wait ~90 seconds for boot + probe execution
3. Verify `/tmp/orbit-probe-result.json` exists with `overall_success: true`
4. Verify `/tmp/orbit-console.jsonl` has entries
5. Verify `grep "\[PERF\]" /tmp/orbit-terminal.log` shows boundary timestamps
6. Open Claude Code in repo, say "read docs/autoresearch/program.md and kick off"
7. Observe: agent writes first probe, boots app, reads results, begins experiment loop

---

## Files Changed Summary

| File                                                      | Action                                         | Phase |
| --------------------------------------------------------- | ---------------------------------------------- | ----- |
| `src-tauri/src/commands/common/diagnostics.rs`            | Modify — add `dev_get_process_rss`             | 1     |
| `src-tauri/src/commands/common/mod.rs`                    | Modify — export new command                    | 1     |
| `src-tauri/src/lib.rs`                                    | Modify — register in `generate_handler![]`     | 1     |
| `src-tauri/src/agent/bridge.rs`                           | Modify — add `[PERF]` logging (~line 212)      | 1     |
| `src-tauri/src/commands/agent/lifecycle.rs`               | Modify — add `[PERF]` in event callback        | 1     |
| `apps/agent/src/lib/dev/console-capture.ts`               | **New** — console interceptor (~10 lines)      | 2     |
| `apps/agent/src/stress-tests/auto-probe-runner.ts`        | **New** — auto-run trigger (~30 lines)         | 2     |
| `apps/agent/src/stress-tests/probe-primitives.ts`         | **New** — shared probe utilities (~40 lines)   | 2     |
| `apps/agent/src/hooks/chat/use-chat-messages.ts`          | Modify — wire auto-probe to `__orbit_debug`    | 2     |
| `apps/agent/src/providers/tauri-provider.tsx`             | Modify — `[PERF]` line + console capture init  | 2     |
| `apps/agent/src/stores/chat/chat-store.ts`                | Modify — `[PERF]` inside `appendToLastMessage` | 2     |
| `agent-bridge/src/agent/core/agent.ts`                    | Modify — `[PERF]` stderr logging               | 3     |
| `apps/agent/src/stress-tests/probes/pipeline-baseline.ts` | **New** — first probe                          | 4     |
| `docs/autoresearch/program.md`                            | **New** — agent instructions                   | 4     |
