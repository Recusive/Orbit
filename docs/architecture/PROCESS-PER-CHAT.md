# Process-Per-Chat Architecture Migration Plan

## Goal

Migrate from a single shared `agent-bridge` sidecar to **one process per chat session**, with backend message buffering and crash persistence. Sessions continue running in the background when the user switches chats (like terminal tabs), and recover after app crashes.

---

## Current Architecture (Single Sidecar)

```
Tauri Main ──→ SessionManager ──→ ONE AgentBridge ──→ ONE agent-bridge process
                                    (Mutex)            manages N sessions internally
```

- `src-tauri/src/agent/bridge.rs` — Spawns ONE sidecar, JSON-line IPC via stdin/stdout
- `src-tauri/src/agent/session.rs` — `SessionManager` wraps single `Mutex<AgentBridge>`
- `agent-bridge/src/index.ts` — Entry point, routes requests to `SessionManager`
- `agent-bridge/src/agent/session/session-manager.ts` — In-memory `Map<SessionId, OrbitAgent>`
- Frontend `MessageBufferStore` (Zustand) — Buffers messages client-side when ChatArea unmounted

**Problems**: Single event loop blocks all chats, one crash kills everything, frontend buffer is fragile (5min expiry, race conditions).

---

## Target Architecture (Process Per Chat)

```
Tauri Main ──→ ProcessManager ──→ AgentBridge A ──→ agent-bridge process A (Chat A)
                                 ├─ AgentBridge B ──→ agent-bridge process B (Chat B)
                                 ├─ AgentBridge C ──→ agent-bridge process C (Chat C)
                                 └─ UtilityBridge ──→ agent-bridge process (global ops)
```

Each chat gets its own OS process with own main thread, event loop, memory heap. Messages are buffered in each backend process, not the frontend.

**Hard process limit**: Maximum 15 concurrent chat processes. Beyond that, the oldest idle session is auto-hibernated (shutdown + state saved to registry). If no idle sessions exist, spawn is rejected with a user-facing error: "Too many active chats. Close or idle a chat first."

---

## Phase 1: ProcessManager Wrapper (No Behavior Change)

**Goal**: Replace `SessionManager` with `ProcessManager` that initially delegates to a single bridge (same behavior, new API surface).

### Files to Create

- `src-tauri/src/agent/process_manager.rs` — New module

### Files to Modify

- `src-tauri/src/agent/mod.rs` — Add `pub mod process_manager;`
- `src-tauri/src/lib.rs` — Manage `ProcessManager` instead of `SessionManager`
- `src-tauri/src/commands/agent/lifecycle.rs` — Use `State<'_, Arc<ProcessManager>>`

### Design

```rust
// src-tauri/src/agent/process_manager.rs
pub struct ProcessManager {
    /// Legacy single bridge for Phase 1 (removed in Phase 2)
    legacy_bridge: Mutex<AgentBridge>,

    /// Per-session bridges (populated in Phase 2)
    /// RwLock on the HashMap for concurrent lookup; each handle has its own
    /// Mutex<AgentBridge> to serialize request/response per session.
    session_bridges: RwLock<HashMap<String, Arc<ProcessHandle>>>,

    /// Utility bridge for non-session operations (see "Utility Bridge Routing" below)
    utility_bridge: Mutex<AgentBridge>,

    /// Sidecar binary path
    sidecar_path: PathBuf,

    /// Session registry for crash recovery (Phase 4)
    registry: Mutex<SessionRegistry>,

    /// AppHandle clone for per-bridge event emission
    app_handle: AppHandle,

    /// Feature flag: when false, all calls route through legacy_bridge
    multi_process_enabled: bool,
}

pub struct ProcessHandle {
    /// Mutex serializes send_request calls so request/response pairs
    /// cannot interleave on the shared crossbeam channel.
    bridge: Mutex<AgentBridge>,
    /// Process child handle for exit detection via try_wait() (R8)
    child: std::process::Child, // or tokio::process::Child if using async reader
    session_id: String,
    state: AtomicU8, // Starting, Ready, Idle, Streaming, WaitingPermission, Stopping
    /// Process start time for PID-reuse-safe orphan detection (Phase 4)
    started_at: u64,
    /// OS process ID for health checks and orphan cleanup
    pid: u32,
}
```

**Feature flag**: `ProcessManager` reads `ORBIT_PROCESS_PER_CHAT=1` env var at construction. When disabled (default), all calls route through `legacy_bridge` — identical to current `SessionManager` behavior. This is the **rollback path** if multi-process causes issues.

`ProcessManager` exposes the same API as `SessionManager` (create_session, send_message, etc). All existing Tauri commands work unchanged.

### Concurrency Design (Critical)

The current `AgentBridge::send_request()` writes to stdin then loops on `response_rx` waiting for a `CommandResponse`. This is safe only when callers are serialized. In the multi-process world:

> **Future-proofing (R1)**: Add an optional `request_id` field to `BridgeRequest` and `CommandResponse`. In v1, each session has one caller at a time (Mutex-serialized), so correlation IDs aren't needed. But if the utility bridge ever handles concurrent requests (e.g., multiple agent CRUD operations), correlation IDs will be essential. Adding the field now costs nothing and avoids a protocol migration later.

- **HashMap lookup**: `RwLock` read-lock (concurrent lookups OK)
- **Per-bridge operations**: `Mutex<AgentBridge>` per `ProcessHandle` (serializes request/response pairs)
- **Rationale**: Two Tauri commands targeting different sessions run concurrently. Two commands targeting the same session serialize on that session's Mutex. This matches the terminal pattern where each PTY has its own lock.

### Utility Bridge Routing

The utility bridge handles all **non-session** operations. These are operations that don't target a specific chat process:

| Operation                                                                                     | Route to                       |
| --------------------------------------------------------------------------------------------- | ------------------------------ |
| `create_session` / `delete_session` / `send_message` / `interrupt`                            | Session bridge                 |
| `set_thinking_mode` / `set_model` / `set_plan_mode` / `set_accept_mode`                       | Session bridge                 |
| `respond_permission` / `fork_session` / `rewind_files`                                        | Session bridge                 |
| `get_stored_session` / `cleanup_sessions`                                                     | Utility bridge                 |
| `list_agents` / `get_agent` / `create_agent` / `update_agent` / `delete_agent`                | Utility bridge                 |
| `list_commands` / `get_command` / `create_command` / `update_command` / `delete_command`      | Utility bridge                 |
| `generate_agent_definition` / `generate_command_definition`                                   | Utility bridge                 |
| `canvas:create_session` / `canvas:send_message` / `canvas:interrupt` / `canvas:tool_response` | Utility bridge                 |
| `browser:tool_response`                                                                       | Session bridge (by session_id) |

### Utility Bridge Lifecycle (C11)

The utility bridge is a **single point of failure** for all non-session operations (CRUD, canvas, agent/command generation). Its lifecycle must be explicitly managed:

1. **Spawn at app startup** — same timing as the current single bridge. Do NOT lazy-spawn on first use; canvas setup and agent listing happen immediately after launch.
2. **Auto-restart on crash** — exponential backoff: 0s → 1s → 3s → 10s, max 3 retries. If all retries fail, show user-facing error: "Background service unavailable — restart Orbit." Log each crash + restart to stderr.
3. **Health monitoring** — include the utility bridge in Phase 5's health check loop (`try_wait()` + IPC ping). Mark it as `dead` if unresponsive for 10s.
4. **Canvas reconnect** — if the utility bridge restarts, active canvas sessions are lost (they're in-memory on the dead process). The frontend must **automatically re-create** the canvas session on the new bridge, not just show "disconnected":
   - `ProcessManager` emits `utility_bridge:restarted` event after successful restart
   - Frontend `useCanvasSetup` hook listens for this event and calls `canvas_create_session` on the new bridge
   - Canvas component state (inspector props, selected component) is in frontend Zustand stores and survives bridge restart
   - Only the AI conversation context in the canvas session is lost — show a toast: "Canvas AI reconnected" (not a blocking error)
5. **Generation recovery** — `generate_agent_definition` / `generate_command_definition` can take 30+ seconds. If the utility bridge crashes mid-generation, the Rust side gets a `BridgeError::ReceiveError` (channel disconnected). Surface this as a user-friendly error: "Generation interrupted — please try again."
6. **Process limit** — the utility bridge does NOT count against the 15-chat-session limit. Total OS processes = up to 15 chat bridges + 1 utility bridge = **16 maximum**.

---

## Phase 2: Process-Per-Session Spawning

**Goal**: `create_session` spawns a dedicated `agent-bridge` process. Each session gets its own bridge.

### Files to Modify

- `src-tauri/src/agent/process_manager.rs` — Core multi-process logic, configurable limits
- `src-tauri/src/agent/bridge.rs` — Per-bridge event callback; separate event/response channels; use async reader or keep `std::thread::spawn` (NOT `spawn_blocking`)
- `agent-bridge/src/index.ts` — Add `--single-session` CLI flag with `validateSession()` guard, `beforeExit` handler
- `agent-bridge/src/agent/session/session-manager.ts` — Respect single-session mode (reject extra sessions)

### Key Design Decisions

**Spawning**: Each `create_session(session_id, config)` call:

1. Check process count against hard limit (15). If exceeded, auto-hibernate oldest idle session or reject with error.
2. Spawn a new `agent-bridge` binary with `--single-session` flag
3. Record PID and `Instant::now()` as `started_at` on the `ProcessHandle`
4. Wait for `Ready` event (30s timeout)
5. Send `create_session` IPC to the new process
6. Write-lock `session_bridges`, insert `Arc<ProcessHandle>`

**Routing**: `send_message(session_id, ...)`:

1. Read-lock `session_bridges`
2. Find `Arc<ProcessHandle>` by `session_id`, clone the Arc
3. Drop read-lock
4. Lock `handle.bridge` Mutex
5. Send request through the bridge (serialized per-session, concurrent across sessions)

> **CRITICAL (C6)**: `send_message` **MUST** be fire-and-forget. Current code (`session.rs:189-206`) acquires `self.bridge.lock()`, calls `bridge.send_request()`, and blocks until it gets a `CommandResponse`. Since `#[tauri::command] async fn agent_send_message(...)` runs on Tokio's async worker pool (default: `num_cpus` threads, e.g. 8 on M3), each blocking `send_message` consumes one Tokio worker for the entire agent response (minutes). With 8 concurrent chats, **the entire Tauri command system deadlocks** — no file reads, no terminal writes, nothing.
>
> The TypeScript side already returns success immediately (`index.ts:383`). Use `bridge.send_request_async()` (the existing fire-and-forget method at `bridge.rs:276`) instead of `bridge.send_request()`. This transforms the Mutex hold time from minutes to microseconds.
>
> ```rust
> // FIXED: fire-and-forget send_message
> pub fn send_message(&self, session_id: &str, message: &str, ...) -> Result<()> {
>     self.ensure_running()?;
>     let bridge = self.bridge.lock();
>     bridge.send_request_async(&request) // returns immediately after writing to stdin
> }
> ```

**Killing**: `delete_session(session_id)`:

1. Send `shutdown` to the process
2. Wait 5s, then SIGKILL if needed
3. Write-lock `session_bridges`, remove entry

**Events**: Each `AgentBridge` gets its own `EventCallback` set during construction. The callback captures a cloned `AppHandle` (cheap — it's `Arc<>` internally) and emits Tauri events directly. This eliminates the shared closure in `setup_event_callbacks` and avoids contention when N reader threads emit events simultaneously.

```rust
// Per-bridge event wiring (replaces shared setup_event_callbacks)
fn spawn_bridge(&self, session_id: &str) -> Result<ProcessHandle> {
    let mut bridge = AgentBridge::new();
    let app = self.app_handle.clone();
    bridge.set_event_callback(Arc::new(move |event| {
        emit_bridge_event(&app, &event);
    }));

    // on_exit: reader thread calls this on stdout EOF → instant crash detection
    let sid = session_id.to_string();
    let mgr = self.weak_self.clone(); // Weak<ProcessManager>
    bridge.set_on_exit(move || {
        if let Some(mgr) = mgr.upgrade() {
            mgr.mark_dead(&sid);
        }
    });

    bridge.spawn(&self.sidecar_path)?;
    // ...
}
```

**Reader Thread**: Keep `std::thread::spawn` for reader threads (or migrate to `tokio::process::Command` with async stdout reading). **Do NOT use `tokio::task::spawn_blocking`** — it's designed for short CPU-bound or brief I/O tasks, and Tokio's blocking thread pool (default 512 slots) would have slots permanently consumed by long-lived reader loops. This can interact poorly with other `spawn_blocking` calls in the Tauri app (file I/O, git operations, etc.).

**Preferred approach**: Use `tokio::process::Command` with async readers, which integrates with the Tokio event loop without consuming blocking threads:

```rust
// bridge.rs — async process with async reader (preferred)
let child = tokio::process::Command::new(sidecar_path)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::inherit())
    .spawn()?;

// Async reader task (NOT spawn_blocking)
tokio::spawn(async move {
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();
    while let Some(line) = lines.next_line().await? {
        // Process line...
    }
});
```

**Alternative**: Keep `std::thread::spawn` (current approach) — it's simple and correct. The OS thread overhead (~8MB stack each) is acceptable at 15 processes.

**Event/Response Channel Separation (Critical)**: The reader thread must separate event dispatch from the response channel. Currently, ALL responses (events + command responses) go into the same `crossbeam::bounded(1000)` channel. If streaming events fill the channel, the reader thread blocks on `tx.send()`, which back-pressures stdout, which blocks the child's `process.stdout.write()`, which blocks the child's event loop.

```rust
// FIXED: Separate event dispatch from response channel
// + on_exit callback for instant crash detection (not reliant on 30s health check)
fn reader_thread(
    stdout: ChildStdout,
    response_tx: &Sender<CommandResponse>,  // Only command responses
    event_callback: Option<&EventCallback>,
    on_exit: impl FnOnce() + Send + 'static,  // Notify ProcessManager on EOF
) {
    let reader = BufReader::new(stdout);
    for line in reader.lines() {
        let Ok(line) = line else { break; };
        if line.is_empty() { continue; }

        let Ok(response) = serde_json::from_str::<BridgeResponse>(&line) else {
            log::warn!("Failed to parse bridge response: {line}"); // (R14)
            continue;
        };

        match response {
            BridgeResponse::Event(event) => {
                if let Some(cb) = event_callback { cb(event); }
                // DON'T put events in the response channel — they're dispatched immediately
            }
            BridgeResponse::Command(cmd) => {
                if response_tx.send(cmd).is_err() { break; }
            }
        }
    }
    // stdout closed → child process exited or crashed.
    // Call back immediately so ProcessManager::mark_dead() fires
    // within milliseconds, not after the 30s health check interval.
    on_exit();
}
```

**Utility Bridge**: Non-session operations route to a separate lightweight bridge process. Canvas sessions also run on the utility bridge (lightweight, short-lived).

> **Important (R12)**: The utility bridge must **NOT** use `--single-session`. Operations like `generate_agent_definition` and `generate_command_definition` (session-manager.ts:1380-1510) create temporary `OrbitAgent` instances not associated with any chat session. In single-session mode, the utility bridge would reject the temporary session creation. The utility bridge should be a standard multi-session bridge that handles all non-chat-session operations.

> **Canvas migration (R6)**: The current `SessionManager` handles canvas via `canvas_create_session`, `canvas_send_message`, etc., which all go through the same `Mutex<AgentBridge>`. When `ProcessManager` routes session operations to per-process bridges but canvas to the utility bridge, ensure the utility bridge's `CanvasSessionManager` is initialized correctly — it currently relies on being in the same process as the main `SessionManager`. Validate this path in Phase 2.

> **`ensure_running` migration (R17)**: The current `SessionManager` has `ensure_running()` which lazy-spawns the bridge on first use. In the multi-process world, `ProcessManager.send_message()` must handle the case where the session bridge doesn't exist (frontend bug, race condition, or crash). Decision: **return a clear error** (`SessionNotFound`) rather than silently auto-creating. The frontend always calls `create_session` first via `ensureSession()` in `useTauri`. If `send_message` is called without a session, it's a bug that should surface immediately, not be masked by auto-creation.

### Agent-Bridge Single-Session Mode

```typescript
// index.ts
const singleSession = process.argv.includes('--single-session');

// If --single-session, the first create_session sets the session ID
// All subsequent requests must match that ID or get rejected
let boundSessionId: string | null = null;

function validateSession(requestSessionId: string): void {
  if (!singleSession) return;

  if (boundSessionId === null) {
    boundSessionId = requestSessionId;
    logger.info({ sessionId: boundSessionId }, 'Bound to session in single-session mode');
    return;
  }

  if (requestSessionId !== boundSessionId) {
    throw new Error(
      `Single-session mode: bound to ${boundSessionId}, ` +
        `rejected request for ${requestSessionId}`
    );
  }
}

// (R10, R18) Ensure JSONL buffer files are flushed on any exit path.
// IMPORTANT: `beforeExit` does NOT fire on explicit `process.exit()` calls
// (Node.js docs: "not emitted for conditions causing explicit termination").
// The 30s bind timeout above calls process.exit(1), so we need BOTH hooks:

// 1. `exit` fires on ALL exit paths (but is synchronous-only)
process.on('exit', () => {
  flushBufferStreamsSync(); // Must be synchronous — no async I/O in 'exit' handler
});

// 2. Use a shared helper for explicit exits to flush before calling process.exit()
function flushAndExit(code: number): never {
  flushBufferStreams(); // async flush (best-effort)
  process.exit(code); // triggers 'exit' handler above for sync cleanup
}

// Self-terminate uses flushAndExit instead of process.exit directly
if (singleSession) {
  const bindTimeout = setTimeout(() => {
    logger.error('No session created within 30s in single-session mode, exiting');
    flushAndExit(1); // NOT process.exit(1)
  }, 30_000);
}
```

---

## Phase 3: Backend Message Buffering + Frontend Cleanup

**Goal**: Each agent-bridge process buffers all messages internally. Frontend replaces `MessageBufferStore` with backend buffer fetch.

> **(R13) Recommended sub-phasing**: This phase touches 7+ files across Rust, TypeScript, and React with zero rollback granularity. Split into two sub-phases:
>
> - **Phase 3a** — Add backend `MessageBuffer` + `get_buffered_messages` IPC endpoint + `_seq` wire protocol (C7). Frontend still uses `MessageBufferStore`. Both systems run in parallel. Verify backend buffer correctness via logging and manual testing.
> - **Phase 3b** — Swap frontend to use backend buffer fetch with watermark dedup. Remove `MessageBufferStore`. This is the breaking change, but now the backend buffer is proven working.
>
> If sub-phasing is skipped, this phase is the highest-risk single change in the migration — test thoroughly before merging.

### Files to Create

- `agent-bridge/src/common/buffering/message-buffer.ts` — In-memory ring buffer with sequence numbers

### Files to Remove

- `apps/agent/src/stores/agent/message-buffer-store.ts` — Entirely replaced by backend

### Files to Modify

- `agent-bridge/src/protocol/protocol.ts` — **(C7)** Add `_seq?: number` to `BridgeEvent` (AgentMessageEvent)
- `agent-bridge/src/index.ts` — Add `get_buffered_messages` IPC handler
- `agent-bridge/src/agent/session/session-manager.ts` — Append to buffer in background consumer; set `_seq` from buffer before `sendEvent()` **(C7)**
- `src-tauri/src/agent/protocol.rs` — Add `GetBufferedMessages` request + `BufferedMessages` response; add `pub seq: Option<u64>` to `AgentMessage` **(C7)**
- `src-tauri/src/agent/process_manager.rs` — Add `get_buffered_messages` method
- `src-tauri/src/commands/agent/lifecycle.rs` — Add `agent_get_buffered_messages` command; include `seq` in Tauri event payload **(C7)**
- `apps/agent/src/types/protocol/message.ts` — Add `_seq?: number` to `ExtensionMessage` union members **(C7)**
- `apps/agent/src/stores/agent/index.ts` — Remove `MessageBufferStore` export + types
- `apps/agent/src/hooks/chat/use-chat-messages.ts` — Replace buffer hydration with backend call + ref-based watermark dedup **(C9)**
- `apps/agent/src/hooks/agent/use-tauri-message-listener.ts` — Remove `shouldBuffer`/`bufferMessage` logic; add `_seq` watermark check
- `apps/agent/src/hooks/chat/handlers/message-handler.ts` — Remove `clearLoadPending` import from buffer store
- `apps/agent/src/lib/api/agent.ts` (or new file) — Add `agentGetBufferedMessages()` invoke wrapper
- `apps/editor/src/components/EditorChatPanel.tsx` — Verify works with updated `useChatMessages` (uses same hook)

### Sequence Number Wire Protocol (C7)

The `_seq` field must flow through the **entire stack** for watermark dedup to work. This is a full-stack protocol change:

| Layer          | File                                                | Change                                                                                           |
| -------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| TS types       | `agent-bridge/src/protocol/protocol.ts`             | Add `_seq?: number` to `BridgeEvent` (specifically `AgentMessageEvent`)                          |
| TS buffer      | `agent-bridge/src/agent/session/session-manager.ts` | Set `_seq` from `MessageBuffer.append()` return value on each event before calling `sendEvent()` |
| TS IPC         | `agent-bridge/src/index.ts`                         | Transparent — `sendEvent` serializes the full object                                             |
| Rust types     | `src-tauri/src/agent/protocol.rs`                   | Add `pub seq: Option<u64>` to `AgentMessage` struct                                              |
| Rust emit      | `src-tauri/src/commands/agent/lifecycle.rs`         | Include `seq` field in the Tauri event payload emitted to frontend                               |
| Frontend types | `apps/agent/src/types/protocol/message.ts`          | Add `_seq?: number` to `ExtensionMessage` union members                                          |

Without this, the watermark dedup in `use-chat-messages.ts` has nothing to compare against and the entire race-condition-safe mount flow doesn't function.

**Runtime validation**: Add a `log.warn()` in the Tauri event callback (Rust side) if `seq` is `None` on an `AgentMessage` that originated from a buffered session bridge. This catches any layer silently dropping the field without waiting for a user to report duplicate messages. In Phase 3a (parallel mode), compare `_seq` from the backend buffer against the frontend `MessageBufferStore` to validate correctness before removing the frontend buffer in 3b.

### Buffer Design

```typescript
// agent-bridge: MessageBuffer
class MessageBuffer {
  private messages: AgentMessage[] = [];
  private readonly MAX_SIZE = 5000;
  private sequenceCounter = 0;

  append(message: AgentMessage): number {
    const seq = this.sequenceCounter++;
    this.messages.push({ ...message, _seq: seq });
    if (this.messages.length > this.MAX_SIZE) {
      this.messages.shift();
    }
    return seq;
  }

  /** Get all messages after the given sequence number.
   *  Returns messages + nextSequence for the caller to track. */
  getSince(afterSequence: number): { messages: AgentMessage[]; nextSequence: number } {
    const filtered = this.messages.filter((m) => m._seq > afterSequence);
    return {
      messages: filtered,
      nextSequence: this.sequenceCounter,
    };
  }

  getAll(): { messages: AgentMessage[]; nextSequence: number } {
    return {
      messages: [...this.messages],
      nextSequence: this.sequenceCounter,
    };
  }

  clear(): void {
    this.messages = [];
    // Don't reset sequenceCounter — ensures no collisions after clear
  }
}
```

### Updated Chat Mount Flow (Race-Condition-Safe)

The critical insight: the buffer fetch and live event subscription must be **sequenced** to avoid duplicating messages that arrive between the buffer snapshot and the subscription start. The `nextSequence` from the buffer response acts as a deduplication watermark.

**Subtle race condition**: The buffer fetch is async (IPC round-trip). While in flight, Tauri events arrive and are dispatched to `messageHandler.handleMessage()`. Since the watermark is `null` until the buffer response returns, those live events are processed immediately. When the buffer response arrives, those same events are in the buffer → **duplicates**.

**Fix (C9)**: Use `useRef` for watermark state instead of mutating `messageHandler.handleMessage`. Mutating the handler function creates stale closure bugs — if the hook re-renders between mount and async buffer fetch completion, `originalHandler` points to a stale closure, and the cleanup function restores the wrong handler.

```typescript
// use-chat-messages.ts — ref-based approach (no mutable handler)
const watermarkRef = useRef<number | null>(null);
const pendingEventsRef = useRef<ExtensionMessage[]>([]);
const watermarkReadyRef = useRef(false);

// Expose a gate function to the Tauri event listener (via context or stable callback)
const handleLiveEvent = useCallback(
  (msg: ExtensionMessage) => {
    if (!watermarkReadyRef.current) {
      pendingEventsRef.current.push(msg); // Queue until watermark ready
      return;
    }
    const seq = (msg as { _seq?: number })._seq;
    if (seq !== undefined && seq <= (watermarkRef.current ?? -1)) return;
    messageHandler.handleMessage(msg);
  },
  [messageHandler]
);

useLayoutEffect(() => {
  if (!sessionId) return;
  let cancelled = false;

  // Reset refs for new session
  watermarkReadyRef.current = false;
  watermarkRef.current = null;
  pendingEventsRef.current = [];

  void (async () => {
    const { messages, nextSequence } = await agentGetBufferedMessages(sessionId);
    if (cancelled) return;

    // Step 1: Render all buffered messages
    for (const message of messages) {
      messageHandler.handleMessage(message);
    }
    messageHandler.flush();

    // Step 2: Set watermark and mark as ready
    watermarkRef.current = nextSequence;
    watermarkReadyRef.current = true;

    // Step 3: Replay queued events with dedup
    for (const evt of pendingEventsRef.current) {
      const seq = (evt as { _seq?: number })._seq;
      if (seq !== undefined && seq <= nextSequence) continue;
      messageHandler.handleMessage(evt);
    }
    pendingEventsRef.current = [];
  })();

  return () => {
    cancelled = true;
    watermarkReadyRef.current = false;
    watermarkRef.current = null;
    pendingEventsRef.current = [];
  };
}, [sessionId, messageHandler, handleLiveEvent]);
```

> **Why not mutate `messageHandler.handleMessage`?** React hooks can re-render between mount and async completion. If `messageHandler` is recreated by a parent re-render, the saved `originalHandler` becomes stale, and the cleanup function restores a dead reference. The `useRef` approach is immune to re-renders because refs persist across the component lifecycle without triggering updates.

The live event listener in `use-tauri-message-listener.ts` checks:

```typescript
// In the Tauri event handler:
const watermark = getBufferWatermark(sessionId);
if (watermark !== null && message._seq !== undefined && message._seq <= watermark) {
  return; // Already rendered from buffer fetch — skip duplicate
}
```

### Complete Buffer Consumer List (All Files Affected)

The `MessageBufferStore` is consumed by **6 files** (not 3):

| File                                             | Dependency                        | Action                                                                                     |
| ------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------ |
| `stores/agent/message-buffer-store.ts`           | Definition                        | **Delete**                                                                                 |
| `stores/agent/index.ts`                          | Barrel export                     | Remove export + types                                                                      |
| `hooks/chat/use-chat-messages.ts`                | `startConsuming`, `stopConsuming` | Replace with backend buffer fetch                                                          |
| `hooks/agent/use-tauri-message-listener.ts`      | `shouldBuffer`, `bufferMessage`   | Remove buffering logic, add watermark check                                                |
| `hooks/chat/handlers/message-handler.ts`         | `clearLoadPending`                | Remove import; move load-pending tracking to a simple `Set<string>` in `use-chat-messages` |
| `apps/editor/src/components/EditorChatPanel.tsx` | Uses `useChatMessages` hook       | Verify no breakage (indirect consumer)                                                     |

---

## Phase 4: Crash Persistence & Recovery

**Goal**: Sessions survive app crashes. On restart, recover state and allow users to continue.

### Files to Create

- `src-tauri/src/agent/registry.rs` — Session registry with SQLite persistence

### Files to Modify

- `src-tauri/src/agent/mod.rs` — Add `pub mod registry;`
- `src-tauri/src/agent/process_manager.rs` — Integrate registry updates on lifecycle events
- `src-tauri/src/lib.rs` — Run recovery on app startup
- `src-tauri/src/commands/agent/lifecycle.rs` — Add `agent_list_active_sessions` command
- `agent-bridge/src/agent/session/session-manager.ts` — Write async append-only buffer file for mid-stream crash recovery
- `apps/agent/src/hooks/agent/use-tauri.ts` — Handle `session:recovered` event

### Registry Design — SQLite

JSON with atomic rename is fragile for multi-entry updates and wastes I/O on heartbeats. SQLite with WAL mode gives atomic transactions, partial updates, concurrent reads during writes, and built-in crash consistency.

**Avoiding single-writer bottleneck**: `rusqlite::Connection` is `!Send + !Sync` — it can't be shared across threads without a Mutex. With 15 sessions each having periodic heartbeat checks and state updates, a `Mutex<Connection>` becomes a contention point. Two approaches:

1. **Connection pool** (preferred): Use `r2d2_sqlite` for concurrent access:

   ```rust
   pub struct SessionRegistry {
       pool: r2d2::Pool<r2d2_sqlite::SqliteConnectionManager>,
   }
   ```

2. **Dedicated writer task**: A single Tokio task receives updates via `mpsc::channel`, avoiding Mutex contention entirely. Since writes are infrequent (state transitions only, not every 30s), this works well:
   ```rust
   pub struct SessionRegistry {
       write_tx: mpsc::Sender<RegistryUpdate>,
       read_pool: r2d2::Pool<r2d2_sqlite::SqliteConnectionManager>,
   }
   ```

```rust
// src-tauri/src/agent/registry.rs

/// Persisted at {data_dir}/process-registry.sqlite
pub struct SessionRegistry {
    pool: r2d2::Pool<r2d2_sqlite::SqliteConnectionManager>,  // WAL mode enabled at creation
}

/// Schema:
/// CREATE TABLE sessions (
///     session_id       TEXT PRIMARY KEY,
///     sdk_session_id   TEXT,
///     config_json      TEXT NOT NULL,
///     state            TEXT NOT NULL,  -- 'starting' | 'idle' | 'streaming' | 'waiting_permission'
///     workspace_path   TEXT,
///     pid              INTEGER NOT NULL,
///     started_at       INTEGER NOT NULL,  -- process start timestamp (for PID reuse detection)
///     created_at       INTEGER NOT NULL,
///     last_heartbeat   INTEGER NOT NULL,
///     recovering       INTEGER NOT NULL DEFAULT 0  -- (R9) 1 = in-progress recovery, for idempotency
/// );

pub struct RegistryEntry {
    pub session_id: String,
    pub sdk_session_id: Option<String>,
    pub config: SessionConfig,
    pub state: ProcessState,
    pub workspace_path: Option<String>,
    pub pid: u32,
    pub started_at: u64,  // process start time — for PID-reuse-safe orphan detection
    pub created_at: u64,
    pub last_heartbeat: u64,
}
```

**WAL checkpoint (R16)**: With `r2d2_sqlite` and WAL mode, the WAL file grows until auto-checkpointed (default: 1000 pages, ~4MB). With a connection pool, auto-checkpoint only runs on the connection that triggered the threshold. Run an explicit `PRAGMA wal_checkpoint(TRUNCATE)` on app startup and on graceful shutdown to keep the WAL file small.

**Persistence triggers** (individual SQL statements, not full-table rewrites):

- Session created → `INSERT`
- Session state change → `UPDATE ... SET state = ?`
- Session deleted → `DELETE`
- Heartbeat → `UPDATE ... SET last_heartbeat = ?` (in-band IPC ping, only writes to DB on state _change_, not every 30s — see Heartbeat Design below)

### Heartbeat Design

Instead of writing to disk every 30s, use **in-band IPC pings** with disk writes only on state transitions:

1. `ProcessManager` spawns a single Tokio task that pings each process every 30s via `is_session_ready` IPC
2. If a process doesn't respond within 5s, mark it as `dead` in the registry
3. Registry `last_heartbeat` is updated in SQLite **only when state changes** (idle→streaming, streaming→idle, etc.)
4. This reduces disk I/O from `N writes/30s` to near-zero during steady state

### PID-Reuse-Safe Orphan Detection

PIDs are reused by the OS. Killing a stale PID can kill an unrelated process. Each `RegistryEntry` stores both `pid` and `started_at` (process start timestamp).

On startup recovery:

```
For each "running" entry:
    → Check if process with entry.pid exists
    → If exists: verify its start time matches entry.started_at
        → macOS: sysctl kern.proc.pid.{pid} → kp_proc.p_starttime
        → Linux: /proc/{pid}/stat field 22
        → If start time matches: this is our orphan → SIGTERM, wait 3s, SIGKILL
        → If start time differs: PID was reused → process is already gone, skip kill
    → If not exists: process already exited, skip kill
    → Check for pending buffer file ({data_dir}/buffers/{session_id}.jsonl)
        → If exists: flush partial messages to conversation storage as interrupted
    → Mark entry for recovery
```

### Mid-Stream Buffer (Agent-Bridge Side) — Async I/O

Each process writes an append-only JSONL file during streaming using **async I/O** to avoid blocking the event loop:

```typescript
// In session-manager.ts background consumer:
import * as fs from 'node:fs';

const bufferPath = path.join(storageDir, 'buffers', `${sessionId}.jsonl`);
const bufferStream = fs.createWriteStream(bufferPath, { flags: 'a' });

for await (const sdkMessage of agent.receiveResponse()) {
  // Async write to disk buffer BEFORE sending to IPC
  // bufferStream.write() is non-blocking — queues to OS write buffer
  bufferStream.write(JSON.stringify(agentMessage) + '\n');

  // Send to Rust via IPC (existing flow)
  sendEvent({ type: 'agent_message', sessionId, message: agentMessage });
}

// On turn complete: close stream and delete buffer
// (messages committed to conversation storage by this point)
await new Promise<void>((resolve) => bufferStream.end(resolve));
try {
  fs.unlinkSync(bufferPath);
} catch {
  /* already deleted */
}
```

**Why not `fs.appendFileSync`**: Synchronous file I/O blocks the event loop on every streaming token (~200 events per response). This adds 20-200ms total latency and prevents IPC reads/writes during the syscall — defeating the purpose of per-process isolation.

**Buffer size concern**: A long streaming response could produce a large JSONL file. Mitigations:

- Buffer is deleted on turn complete (normal case — file lives for seconds)
- **Rotating file pair** (instead of truncation): Use two files (`buffer-a.jsonl`, `buffer-b.jsonl`). When one exceeds 25MB, start writing to the other and delete the old one. This is O(1) and avoids the complexity of truncating JSONL from the beginning (which requires finding a newline boundary by reading the file — non-trivial for a 100MB+ file during streaming).
- On crash recovery, both files are read (if present), concatenated in order, and deleted — not kept long-term

### Startup Recovery Flow

**Idempotent recovery (R9)**: If the app crashes DURING recovery, on the second startup the registry may be partially processed and buffer files partially consumed. Use a `recovering` flag column in SQLite to ensure idempotency:

```
App launches
    → Open registry SQLite DB
    → For each entry with state != 'stopped':
        → Set `recovering = true` on the entry (marks it as in-progress)
        → PID-reuse-safe orphan detection (see above)
        → Check for pending buffer files ({data_dir}/buffers/{session_id}-{a,b}.jsonl)
            → If exists: flush partial messages to conversation storage as interrupted
        → Mark entry for recovery
        → Set `recovering = false`, update state to 'recovered'
    → On startup, entries with `recovering = true` are re-processed (crash during previous recovery)
    → Clear all recovered entries (fresh start)
    → Emit 'sessions:recovered' event to frontend with list of recovered session IDs
    → Frontend reloads affected conversations from disk
```

### Recovery of Mid-Stream Permission Requests

If the app crashes while a session was in `waiting_permission` state, the pending permission request is lost. On recovery:

- The conversation is loaded from disk showing the last committed messages
- The tool that was awaiting permission is shown as "interrupted"
- User can send a new message to retry the operation

This is acceptable — the alternative (persisting permission state and auto-resuming) adds substantial complexity for a rare edge case.

---

## Phase 5: Process Health & Idle Management

**Goal**: Monitor process health, kill idle processes to conserve memory. **Not optional** — without this, 10 open chats consume 600MB permanently.

### Design

- **Health check**: Two-tier approach:
  1. **Process exit detection** (cheap, no IPC): Use `Child::try_wait()` which is non-blocking. A process stuck in an infinite loop or deadlocked won't respond to IPC pings but is still "alive" — `try_wait()` catches the exit case cheaply:
     ```rust
     // Cheap exit detection (no IPC needed)
     if let Some(status) = handle.child.try_wait()? {
         // Process exited unexpectedly
         mark_dead(session_id);
     }
     ```
  2. **IPC readiness ping** (30s interval): Single Tokio task pings each process via `is_session_ready` for session-level readiness verification (in-band, no disk I/O)
- **Idle timeout**: Processes idle for >60 minutes get `shutdown` → killed
  - 60 minutes, not 15: users context-switch, take breaks, attend meetings, and expect chats to persist
  - When memory pressure is detected (macOS `os_proc_available_memory()` < 1GB), reduce timeout to 15 minutes
- **Process limit**: Hard cap of 15 concurrent processes. When exceeded, auto-hibernate oldest idle session. If no idle sessions, reject spawn with user-facing error.
- **UI indicator**: Frontend shows dot indicator (green=active, yellow=idle, red=dead) per chat in sidebar
- **Auto-restart**: If a process dies unexpectedly, show "Session disconnected — click to reconnect" in ChatArea. Click re-spawns process and fetches buffer from conversation storage.
- **No pre-warming**: Skip process pool in v1. The 1-2s spawn cost is acceptable for first chat. Add pre-warming later if profiling shows it's needed — it adds complexity (unbound process must accept session binding, handle idle timeout, etc.) for marginal gain.

### Error Propagation: Process Exit → Frontend

When a session bridge dies mid-stream, the frontend must know. The detection → notification path:

```
1. Health check Tokio task detects exit via try_wait()
     OR reader thread sees EOF on stdout (broken pipe)

2. ProcessManager::mark_dead(session_id)
   - Updates ProcessHandle.state → Dead
   - Updates registry: state = 'dead'

3. Emits Tauri event:
   app.emit("session:disconnected", SessionDisconnectedPayload {
       session_id,
       reason: "process_exited" | "ipc_timeout" | "crashed",
       exit_code: Option<i32>,  // from try_wait()
   })

4. Frontend TauriProvider listens for "session:disconnected"
   - Updates ToolStore or a new SessionHealthStore: session state → dead
   - ChatArea renders "Session disconnected — click to reconnect" overlay
   - Sidebar dot indicator turns red

5. On reconnect click:
   - Frontend calls agent_create_session(session_id, config)
   - ProcessManager spawns new bridge
   - Frontend calls agentGetBufferedMessages → empty (new process)
   - Frontend loads conversation from disk storage (existing flow)
   - User can send new messages in the recovered session
```

This path also handles the case where the reader thread detects EOF before the health check loop runs — the reader thread's `on_exit` callback (see reader thread snippet above) calls `ProcessManager::mark_dead()` on stdout close, providing ~instant detection vs the 30s health check interval. The health check loop serves as a secondary fallback for edge cases where the reader thread itself panics.

### Cross-Platform Orphan Detection

PID-reuse-safe orphan detection uses OS-specific APIs:

| Platform    | Process start time API                               | Notes                                                                                                                         |
| ----------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **macOS**   | `sysctl kern.proc.pid.{pid}` → `kp_proc.p_starttime` | Stable API, works in sandboxed apps                                                                                           |
| **Linux**   | `/proc/{pid}/stat` field 22 (`starttime`)            | Clock ticks since boot, divide by `sysconf(_SC_CLK_TCK)`                                                                      |
| **Windows** | `OpenProcess` + `GetProcessTimes` → `lpCreationTime` | FILETIME (100ns intervals since 1601). Process groups use `CreateJobObject` + `AssignProcessToJobObject` instead of `setpgid` |

The `setpgid` approach for orphan cleanup is Unix-only. On Windows, use **Job Objects** — all child processes assigned to a Job Object are automatically terminated when the Job handle closes (which happens when the parent exits):

```rust
#[cfg(windows)]
fn setup_job_object() -> Result<()> {
    // Create Job Object with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    // Assign current process to the job
    // All spawned children inherit the job
    // On parent exit (even crash), OS kills all children automatically
}
```

Phase 1 ships macOS-only (primary target). Linux support uses the `/proc` fallback. Windows Job Objects are deferred until Windows builds are supported.

---

## Memory & Performance Considerations

| Metric                       | Single Process                | 10 Processes                                    |
| ---------------------------- | ----------------------------- | ----------------------------------------------- |
| Base memory (Bun process)    | ~60-80 MB                     | ~600-800 MB                                     |
| Claude CLI subprocess        | ~40-60 MB                     | ~400-600 MB                                     |
| **Total memory per session** | **~100-140 MB**               | **~1.0-1.4 GB**                                 |
| CPU cores used               | 1 (JS single-threaded)        | Up to 10                                        |
| Startup per chat             | 0ms (already running)         | ~1-2s (spawn + ready)                           |
| Crash blast radius           | All chats                     | 1 chat                                          |
| Event loop blocking          | Affects all chats             | Affects 1 chat                                  |
| Reader threads               | 1 OS thread                   | 1 per process (std::thread) or 0 (async reader) |
| Per-session lock contention  | Global Mutex (serializes ALL) | Per-session Mutex (concurrent across sessions)  |

> **Memory estimate detail (R3)**: The agent-bridge binary is a Bun compile target loading `@anthropic-ai/claude-agent-sdk`, `@anthropic-ai/claude-code`, `@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`, and Zod. Each process also spawns a Claude CLI subprocess (via `query()`). The real cost is ~60-80MB for the Bun process + ~40-60MB for the spawned CLI subprocess = **~100-140MB per chat session**. This must be validated empirically before shipping Phase 2.

**Mitigations**:

- 60-minute idle timeout reclaims memory from inactive chats
- Hard limit of 15 concurrent **chat** processes (+ 1 utility bridge = 16 total OS processes) prevents runaway resource usage (configurable — see below). The utility bridge does NOT count against the user-facing 15-session limit (R19).
- Memory-pressure-aware: reduce idle timeout when system memory is low
- On M-series Mac (8-12 cores), 10 parallel processes is excellent
- On Windows/Linux with less memory, the process limit can be reduced via settings

**Process limit configuration (R5)**: The hard limit of 15 is reasonable for M-series Macs with 16GB+ RAM but aggressive for 8GB machines. Make it configurable via settings:

```rust
pub struct ProcessManagerConfig {
    max_processes: usize,         // Default: 15
    idle_timeout_minutes: u64,    // Default: 60
    memory_pressure_timeout: u64, // Default: 15
}
```

**Realistic memory**: Measure actual `agent-bridge` RSS on macOS with:

```bash
# After starting a session and sending one message:
ps -o rss,vsz,pid,comm | grep agent-bridge
# Expected: RSS ~60-80MB for Bun + ~40-60MB for Claude CLI subprocess
# Total per session: ~100-140MB
```

---

## Files Changed Summary

### New Files

| File                                                  | Phase | Purpose                                     |
| ----------------------------------------------------- | ----- | ------------------------------------------- |
| `src-tauri/src/agent/process_manager.rs`              | 1     | Multi-process orchestrator                  |
| `src-tauri/src/agent/registry.rs`                     | 4     | SQLite crash-persistent session registry    |
| `agent-bridge/src/common/buffering/message-buffer.ts` | 3     | In-memory ring buffer with sequence numbers |

### Modified Files

| File                                                       | Phase | Change                                                                                                                                                           |
| ---------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/agent/mod.rs`                               | 1     | Add module declarations                                                                                                                                          |
| `src-tauri/src/lib.rs`                                     | 1,2,4 | Manage `ProcessManager`, add startup recovery, register **both** `on_window_event(CloseRequested)` + `RunEvent::ExitRequested` shutdown hooks (C8)               |
| `src-tauri/src/commands/agent/lifecycle.rs`                | 1,3,4 | Use ProcessManager, add buffer + recovery commands, per-bridge event wiring                                                                                      |
| `src-tauri/src/agent/bridge.rs`                            | 2     | Separate event/response channels (C1); use async reader or std::thread (NOT spawn_blocking — C2); per-bridge event callback; fire-and-forget `send_message` (C6) |
| `src-tauri/src/agent/session.rs`                           | 2     | Change `send_message` to use `send_request_async` (fire-and-forget) (C6)                                                                                         |
| `src-tauri/src/agent/protocol.rs`                          | 3     | Add `GetBufferedMessages` request/response with sequence numbers; add `pub seq: Option<u64>` to `AgentMessage` (C7); add optional `request_id` field (R1)        |
| `agent-bridge/src/protocol/protocol.ts`                    | 3     | Add `_seq?: number` to `BridgeEvent` / `AgentMessageEvent` (C7)                                                                                                  |
| `agent-bridge/src/index.ts`                                | 2,3   | Single-session flag with `validateSession()` guard, 30s bind timeout with `flushAndExit()` (R18), buffer IPC handler                                             |
| `agent-bridge/src/agent/session/session-manager.ts`        | 2,3,4 | Single-session mode, buffer writes with `_seq` assignment (C7), rotating file pair for async disk buffer (R4)                                                    |
| `apps/agent/src/types/protocol/message.ts`                 | 3     | Add `_seq?: number` to `ExtensionMessage` union members (C7)                                                                                                     |
| `apps/agent/src/stores/agent/index.ts`                     | 3     | Remove `MessageBufferStore` export + types                                                                                                                       |
| `apps/agent/src/hooks/chat/use-chat-messages.ts`           | 3     | Replace buffer hydration with backend call + ref-based watermark dedup (C9, replaces C4 handler mutation approach)                                               |
| `apps/agent/src/hooks/agent/use-tauri-message-listener.ts` | 3     | Remove frontend buffering logic, add `_seq` watermark check                                                                                                      |
| `apps/agent/src/hooks/chat/handlers/message-handler.ts`    | 3     | Remove `clearLoadPending` import from deleted buffer store                                                                                                       |
| `apps/agent/src/lib/api/agent.ts`                          | 3     | Add `agentGetBufferedMessages()` invoke wrapper                                                                                                                  |
| `apps/editor/src/components/EditorChatPanel.tsx`           | 3     | Verify compatibility (uses `useChatMessages` hook)                                                                                                               |
| `apps/agent/src/hooks/agent/use-tauri.ts`                  | 4     | Handle `session:recovered` event                                                                                                                                 |
| `Cargo.toml` (src-tauri)                                   | 4     | Add `rusqlite`, `r2d2_sqlite` dependencies (C5)                                                                                                                  |

### Removed Files

| File                                                  | Phase | Reason                        |
| ----------------------------------------------------- | ----- | ----------------------------- |
| `apps/agent/src/stores/agent/message-buffer-store.ts` | 3     | Replaced by backend buffering |

---

## Rollback Strategy

Every phase has a rollback path:

| Phase | Rollback                                                                                              |
| ----- | ----------------------------------------------------------------------------------------------------- |
| 1     | `ProcessManager` wraps `SessionManager` — remove wrapper, restore direct `SessionManager` usage       |
| 2     | Set `ORBIT_PROCESS_PER_CHAT=0` — `ProcessManager` routes all calls through `legacy_bridge` at runtime |
| 3     | Revert frontend changes, restore `MessageBufferStore` — backend buffer is additive and harmless       |
| 4     | SQLite registry is additive — disable recovery code path, registry sits idle                          |
| 5     | Disable idle management — processes stay alive, higher memory but functional                          |

**Critical**: The `legacy_bridge` field in `ProcessManager` must remain functional through Phase 2 as the runtime fallback. Remove it only after Phase 2 is stable in production for at least 2 weeks.

---

## Verification Plan

### Phase 1 Verification

- `bunx tauri dev` — app starts, creates sessions, sends messages (no behavior change)
- All existing Tauri commands work through ProcessManager wrapper
- `cargo test` — Rust tests pass
- Verify feature flag: `ORBIT_PROCESS_PER_CHAT=0` routes through legacy bridge

### Phase 2 Verification

- Open 3 chats, verify 3 separate `agent-bridge` processes in Activity Monitor
- Send messages in Chat A, switch to Chat B, verify Chat A process still running
- Kill one process manually — verify other chats unaffected
- Verify reader threads don't cause backpressure: stream rapidly in one chat while sending in another
- Verify event/response channel separation: no channel full errors during heavy streaming
- Verify single-session mode: manually send mismatched session ID → expect rejection with clear error
- Verify 30s bind timeout: spawn process, don't create session → process self-terminates
- Verify process limit: open 16+ chats → expect user-facing error or auto-hibernate
- Feature flag test: set `ORBIT_PROCESS_PER_CHAT=0`, verify single-process fallback still works
- Concurrent stress test: send messages to 5 chats simultaneously from frontend → no response corruption
- Verify utility bridge accepts multiple session types (agent def generation, canvas, CRUD operations)
- **(C11)** Verify utility bridge auto-restarts on crash: kill utility bridge process → verify CRUD/canvas operations recover within 3s
- Verify utility bridge crash during `generate_agent_definition` surfaces a user-friendly error (not hang)
- Verify graceful shutdown kills ALL processes: Cmd+Q → check Activity Monitor for orphan `agent-bridge` processes

### Phase 3 Verification

- Start streaming in Chat A, switch to Chat B while streaming
- Switch back to Chat A — verify all messages appear (fetched from backend buffer)
- No message loss, no duplicates
- Rapid switching test: click Chat A → B → A in <1 second — verify no duplicate messages (watermark dedup)
- Verify `MessageBufferStore` no longer imported anywhere: `grep -r "message-buffer-store" apps/`
- **(R20)** Verify EditorChatPanel renders correctly with backend buffering (open editor mode, send message, switch tabs, switch back)
- Verify `_seq` field flows end-to-end: backend buffer → IPC → Tauri event → frontend message (add temporary logging)
- Buffer fetch timeout test: kill session bridge while chat is switching → verify user sees error within 5s, not infinite blank screen
- `bun run check` passes (TypeScript + ESLint)

### Phase 4 Verification

- Start streaming in Chat A, force-kill Orbit (`kill -9`)
- Relaunch Orbit — verify Chat A conversation shows interrupted message
- Send new message in Chat A — verify it resumes correctly
- PID reuse test: kill process, spawn unrelated process with same PID → verify recovery doesn't kill it
- SQLite corruption test: truncate registry DB mid-write → verify app starts with empty state (not crash)
- Buffer file test: create large (100MB+) rotating buffer pair → verify recovery doesn't OOM
- **Idempotent recovery test**: force-kill during recovery (after partial processing) → relaunch → verify entries with `recovering = true` are re-processed correctly
- **Connection pool test**: spawn 15 sessions, rapid state transitions → verify no SQLite lock contention errors
- **SQLite write frequency**: with 15 sessions doing rapid prompt/response cycles (idle→streaming→idle), log actual `UPDATE` frequency and verify **< 5 writes/second** sustained (the "write only on state change" design should achieve this; if not, add debouncing)

### Phase 5 Verification

- Open 5 chats, leave idle for 60+ minutes → verify idle ones are shut down
- Verify "Session disconnected" UI when process is killed
- Click reconnect → verify session restarts and conversation loads
- Memory pressure test: simulate low memory → verify timeout reduces to 15 minutes

### Full Integration

- `cargo test` — Rust tests pass
- `bun run check` — Frontend checks pass
- `./scripts/lint-all.sh` — All lints pass
- Manual: full workflow with 5+ concurrent chats, switching, streaming, interrupting, crash recovery

---

## Security Considerations

### Credential Handling

Each spawned process gets OAuth/API credentials via environment variables (`CLAUDE_CLI_PATH`, etc.). These are visible in `ps aux -e` output. This is acceptable because:

- The parent Tauri app already passes these env vars to the single sidecar today
- macOS Keychain access is per-process (each bridge reads credentials independently)
- No additional credential exposure vs current architecture

### Buffer File Security

JSONL buffer files contain full conversation content. Mitigations:

- Files are created with user-only permissions (`0o600` on Unix)
- Files are deleted on turn complete (live for seconds in normal operation)
- Files are in the app's data directory (same security as conversation storage)
- Encryption is not added in v1 — same threat model as existing conversation JSON files

### Orphan Process Prevention

- **(C10)** Parent Tauri process sets child processes to same process group using `setpgid`/`killpg` (macOS does NOT have `prctl(PR_SET_PDEATHSIG)` — that's Linux-only). **Critical**: capture the parent's PGID _before_ the fork — do NOT use `getppid()` inside `pre_exec`, because if the parent crashes between `fork()` and `exec()`, `getppid()` returns `1` (launchd on macOS), and `setpgid(0, 1)` puts the child in launchd's process group where `killpg` can't reach it:

  ```rust
  use std::os::unix::process::CommandExt;

  // Capture PGID BEFORE fork (in parent context)
  let parent_pgid = unsafe { libc::getpgrp() };

  let mut cmd = Command::new(sidecar_path);
  unsafe {
      cmd.pre_exec(move || {
          // Use captured PGID, not getppid() which races with parent exit
          libc::setpgid(0, parent_pgid);
          Ok(())
      });
  }
  ```

- **(C8)** On Tauri app exit: Register **two shutdown hooks** — `on_window_event(CloseRequested)` for window close AND `RunEvent::ExitRequested` for app quit (Cmd+Q). On macOS, closing all windows doesn't quit the app — the user must Cmd+Q. `CloseRequested` fires for window close, not app quit. Both hooks call `graceful_shutdown()` which is idempotent. `ProcessManager::drop()` is a synchronous last-resort SIGKILL only (the Tokio runtime may already be shutting down):

  ```rust
  // In lib.rs setup:
  let pm_for_window = process_manager.clone();
  let pm_for_exit = process_manager.clone();

  // Hook 1: Window close (macOS hides; other platforms may quit)
  app.on_window_event(move |_window, event| {
      if let WindowEvent::CloseRequested { .. } = event {
          pm_for_window.graceful_shutdown();
      }
  });

  // Hook 2: App quit (Cmd+Q, Dock → Quit) — the definitive exit hook
  app.build(tauri::generate_context!())?.run(move |_app, event| {
      if let tauri::RunEvent::ExitRequested { .. } = event {
          pm_for_exit.graceful_shutdown();
      }
  });

  // Drop is synchronous last resort
  impl Drop for ProcessManager {
      fn drop(&mut self) {
          // Synchronous SIGKILL of any remaining children
          for handle in self.session_bridges.get_mut().values() {
              unsafe { libc::kill(handle.pid as i32, libc::SIGKILL); }
          }
      }
  }
  ```

- On Tauri app crash: startup recovery detects orphans via registry + PID validation
- Single-session mode 30s bind timeout prevents leaked unbound processes
- Idle management (Phase 5) catches processes that somehow evade other cleanup

### Process Isolation

Each `agent-bridge` process runs with the same permissions as the parent Tauri app. A buggy process cannot:

- Affect other processes (separate address spaces)
- Corrupt the parent's state (IPC is the only channel)
- Escalate privileges (inherits parent's sandbox)

A malicious process could theoretically:

- Read/write files with user permissions (same as current architecture)
- Consume unbounded CPU/memory (mitigated by process limit + idle management)

---

## Test Coverage Plan

### Existing Tests to Verify

- `cargo test` — All Rust crates pass (no regressions in bridge, session, protocol)
- `bun run check` — Frontend TypeScript + ESLint passes
- `cd agent-bridge && bun test` — Integration tests pass (these test SDK interaction, not IPC)

### New Tests to Add

| Test                                       | Type                | Phase | Description                                                                                                |
| ------------------------------------------ | ------------------- | ----- | ---------------------------------------------------------------------------------------------------------- |
| ProcessManager wrapper                     | Rust unit           | 1     | Verify all SessionManager APIs work through ProcessManager delegation                                      |
| Feature flag routing                       | Rust unit           | 1     | Verify `ORBIT_PROCESS_PER_CHAT=0` routes through legacy bridge                                             |
| Multi-bridge spawn                         | Rust integration    | 2     | Spawn 3 bridges, send requests to each, verify responses don't cross                                       |
| Concurrent request safety                  | Rust integration    | 2     | Send requests to same bridge from 2 threads, verify no response corruption                                 |
| Reader task cleanup                        | Rust integration    | 2     | Spawn bridge, shutdown, verify Tokio task exits cleanly                                                    |
| MessageBuffer sequence                     | TS unit             | 3     | Append N messages, getSince(K), verify correct subset returned                                             |
| Watermark dedup                            | TS unit             | 3     | Simulate buffer fetch + live events, verify no duplicates                                                  |
| Buffer store removal                       | TS compile          | 3     | `bun run typecheck` passes with store deleted                                                              |
| SQLite registry CRUD                       | Rust unit           | 4     | Insert, update, delete, query entries                                                                      |
| PID reuse detection                        | Rust unit           | 4     | Mock process start times, verify orphan detection logic                                                    |
| Crash recovery flow                        | Rust integration    | 4     | Write registry + buffer file, simulate startup, verify recovery                                            |
| Idle timeout                               | Rust integration    | 5     | Spawn process, wait, verify shutdown after timeout                                                         |
| Event/response separation                  | Rust unit           | 2     | Verify events never enter response channel, responses never trigger event callback                         |
| Watermark race condition                   | TS unit             | 3     | Simulate live events arriving during buffer fetch IPC round-trip, verify event queuing prevents duplicates |
| Idempotent recovery                        | Rust unit           | 4     | Simulate crash during recovery (entries with `recovering = true`), verify re-processing                    |
| Connection pool contention                 | Rust integration    | 4     | 15 concurrent sessions with rapid state transitions, verify no SQLite lock errors                          |
| Process exit detection                     | Rust unit           | 5     | Verify `try_wait()` detects exited process without IPC                                                     |
| Fire-and-forget send_message               | Rust unit           | 2     | Verify `send_message` returns immediately (not after agent response) (C6)                                  |
| `_seq` end-to-end                          | TS integration      | 3     | Verify `_seq` flows from MessageBuffer → IPC → Tauri event → frontend message (C7)                         |
| Dual shutdown hooks                        | Rust integration    | 2     | Verify both `CloseRequested` and `ExitRequested` trigger `graceful_shutdown()` (C8)                        |
| Ref-based watermark dedup                  | TS unit             | 3     | Simulate React re-render during async buffer fetch → verify no stale closure (C9)                          |
| Utility bridge auto-restart                | Rust integration    | 2     | Kill utility bridge → verify it restarts and CRUD operations recover within 3s (C11)                       |
| Utility bridge crash during generation     | Rust integration    | 2     | Kill utility bridge mid-`generate_agent_definition` → verify error surfaces (C11)                          |
| `_seq` runtime validation                  | Rust unit           | 3     | Emit `AgentMessage` with `seq: None` from a buffered bridge → verify `log::warn` fires                     |
| Canvas auto-reconnect                      | TS integration      | 2     | Kill utility bridge during active canvas session → verify canvas re-creates session on new bridge (C11)    |
| Error propagation: process exit → frontend | Rust/TS integration | 5     | Kill session bridge mid-stream → verify `session:disconnected` event reaches frontend within 1s            |
| Cross-platform orphan detection            | Rust unit           | 4     | Mock macOS `sysctl` and Linux `/proc/stat` → verify correct PID reuse detection on both                    |

### Stress Testing (Manual + Quantified Pass Criteria)

Each test has explicit pass/fail thresholds — "no response mixing" is not sufficient.

| Test                 | Procedure                                                                                          | Pass Criteria                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concurrent streaming | Open 15 chats, send 10 messages each simultaneously                                                | **0** messages routed to wrong session, **0** duplicates, **0** missing messages. Verify by comparing frontend message count per session against backend buffer counts. |
| Rapid chat switching | Click through Chat A → B → C → A → B → C, 100 switches in 60s, while all chats stream              | **0** duplicate messages rendered, **0** messages lost (compare rendered count to `_seq` range). p99 buffer fetch latency **< 500ms**.                                  |
| Crash recovery       | Force-kill Orbit (`kill -9 $PID`) while 5 chats are mid-stream                                     | On relaunch: all 5 conversations show "interrupted" marker, **0** data loss (all committed messages present), **0** orphan `agent-bridge` processes after 10s.          |
| Memory stability     | Leave 10 chats open for 4+ hours, 5 idle + 5 with periodic messages                                | Idle chats shut down after 60min. Total RSS stays **< 2GB** (10 sessions × ~140MB + overhead). No monotonic memory growth (check RSS at 1h, 2h, 4h — delta **< 50MB**). |
| Thread pool health   | Send messages to 8 chats concurrently while performing file reads, terminal writes, and git status | File reads complete **< 200ms** (not blocked by agent operations). Terminal output is **not delayed** by agent streaming. Proves C6 fire-and-forget fix works.          |

---

## Nice-to-Haves (Optional Enhancements)

These are not required for the migration but would significantly improve observability and robustness. Consider implementing after Phase 5 is stable.

### ~~N1. Structured Logging for Process Lifecycle~~ → **Promoted to Phase 2 requirement**

> Moved inline: structured logging for every process lifecycle transition (spawn, ready, idle, streaming, shutdown, crash) with session IDs is **required in Phase 2**, not optional. Without it, debugging production multi-process issues is nearly impossible. Each `ProcessManager` method logs:
>
> ```
> [ProcessManager] session=abc123 event=spawn pid=1234 duration_ms=1500
> [ProcessManager] session=abc123 event=dead pid=1234 exit_code=1 reason=process_exited
> ```
>
> Use Rust's `log::info!` (structured via `log` crate) on the Rust side and the existing `createLogger` on the TypeScript side. Log process spawn duration (N6) as part of this.

### ~~N2. Process Memory Monitoring~~ → **Promoted to Phase 2 requirement**

> Moved inline: on macOS, log each process's RSS after it reports `Ready` and periodically (every 5 minutes) during the health check loop. Use `proc_pidinfo(pid, PROC_PIDTASKINFO)` (macOS) or `/proc/{pid}/status` (Linux). This data is essential for validating the ~100-140MB per session estimate and tuning `max_processes` before shipping Phase 2. Without empirical RSS data, the 15-process limit is a guess.

### N3. Frontend Process Health Visualization

Beyond the dot indicator (green/yellow/red), show memory usage per chat in a developer panel (behind a feature flag). This helps users understand why their machine is slow with many chats open.

### N4. Graceful Degradation to Single-Process

If process spawning fails 3 times consecutively, automatically fall back to the legacy single-process mode for the remainder of the session, with a notification to the user. This prevents a broken spawn mechanism from blocking all chat creation.

### N5. Integration Test Harness for Multi-Process

Create a test binary that simulates the agent-bridge IPC protocol (echo server) for Rust-side integration tests without needing real Claude SDK credentials. This enables CI testing of the process lifecycle without API keys.

### N6. Process Spawn Telemetry

Log spawn duration (time from `Command::spawn()` to `Ready` event) for each session bridge. This gives empirical data for whether pre-warming is needed later. The plan measures memory but not spawn latency.

### N7. Buffer Fetch Timeout

The watermark dedup flow fetches from the backend buffer (`agentGetBufferedMessages(sessionId)`) but has no timeout. If the IPC hangs (bridge crashed between event dispatch and buffer fetch), the pending events queue grows unbounded and the user sees a blank chat forever. Add a 5s timeout that falls back to "Session disconnected — click to reconnect."

### N8. Sequence Number Overflow

`MessageBuffer.sequenceCounter` is a JavaScript `number`. At `Number.MAX_SAFE_INTEGER` (2^53), it silently loses precision. With ~200 events per agent response and ~100 responses per day, overflow takes ~1.4 billion years. Non-issue — documented for completeness.

### N9. Session Bridge Restart UX

Phase 5 describes "click to reconnect" but doesn't specify the reconnection flow. Two options:
(a) Spawn a new bridge and send `create_session` with the same session ID, relying on the SDK's `--resume` to restore conversation context. More seamless but requires SDK session resumability.
(b) Treat as a new session and load conversation from disk. Simpler but loses SDK conversation context (user must re-explain context).
Document the chosen approach when implementing Phase 5.

### N10. Stress Test Automation

The "Stress Testing (Manual)" section should have at least partial automation. A script that opens N chat sessions, sends messages to each, and verifies no response mixing would catch concurrency regressions. This is high-value because the bugs this migration introduces are exactly the kind that slip through manual testing.

---

## Audit Trail

### Audit 1 — Comprehensive Review (January 2026)

**Verdict**: APPROVE WITH CHANGES

**Critical issues addressed in this revision:**

| ID  | Issue                                                         | Fix Applied                                                                                              |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| C1  | Event channel fills up, back-pressuring child stdout          | Separated event dispatch from response channel in reader thread                                          |
| C2  | `tokio::task::spawn_blocking` wrong for long-lived readers    | Changed to async reader (`tokio::process::Command`) or keep `std::thread::spawn`                         |
| C3  | `ProcessManager::drop()` races with Tokio runtime shutdown    | Added `on_window_event(CloseRequested)` handler for graceful shutdown; `Drop` is synchronous last-resort |
| C4  | Watermark dedup race: live events arrive before watermark set | Added event queuing: live events buffered until watermark established, then replayed with dedup          |
| C5  | `Mutex<rusqlite::Connection>` single-writer bottleneck        | Changed to `r2d2_sqlite` connection pool (or dedicated writer task via mpsc)                             |

**Recommended improvements incorporated:**

| ID  | Improvement                                                     | Where                                |
| --- | --------------------------------------------------------------- | ------------------------------------ |
| R1  | Request correlation IDs for future-proofing                     | Phase 1 Concurrency Design           |
| R2  | macOS process groups via `setpgid`/`killpg` (not Linux `prctl`) | Security → Orphan Process Prevention |
| R3  | Realistic memory estimate: ~100-140MB per session               | Memory & Performance table           |
| R4  | Rotating file pair instead of JSONL truncation                  | Phase 4 Mid-Stream Buffer            |
| R5  | Configurable process limit via `ProcessManagerConfig`           | Memory & Performance section         |
| R6  | Canvas session migration path for utility bridge                | Phase 2 Utility Bridge               |
| R7  | `send_message` fire-and-forget consideration                    | Phase 2 Routing                      |
| R8  | Two-tier health check: `try_wait()` + IPC ping                  | Phase 5 Health Check                 |
| R9  | Idempotent startup recovery with `recovering` flag              | Phase 4 Startup Recovery             |
| R10 | `process.on('beforeExit')` for buffer flush                     | Phase 2 Single-Session Mode          |
| R12 | Utility bridge must NOT use `--single-session`                  | Phase 2 Utility Bridge               |

### Audit 2 — Deep Code Review (January 2026)

**Verdict**: APPROVE WITH CHANGES

**Critical issues addressed in this revision:**

| ID  | Issue                                                                                                  | Fix Applied                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| C6  | `send_message` blocks Tokio async thread for minutes → thread pool exhaustion with ≥8 concurrent chats | Changed R7 from "consider" to **mandatory** fire-and-forget using `send_request_async()`       |
| C7  | `_seq` field not wired through full IPC stack → watermark dedup non-functional                         | Added "Sequence Number Wire Protocol" section with all 6 files requiring changes               |
| C8  | Shutdown only hooks `on_window_event(CloseRequested)` — misses macOS Cmd+Q                             | Added dual hook: `on_window_event` + `RunEvent::ExitRequested` for definitive app quit         |
| C9  | Watermark dedup mutates `messageHandler.handleMessage` → stale closure bug on re-render                | Replaced with `useRef`-based approach immune to React re-render lifecycle                      |
| C10 | `setpgid(0, getppid())` in `pre_exec` races with parent exit → child joins launchd's PGID              | Changed to capture `getpgrp()` before fork and pass via closure                                |
| C11 | Utility bridge lifecycle unspecified → single point of failure for CRUD/canvas/generation              | Added "Utility Bridge Lifecycle" subsection with spawn timing, auto-restart, health monitoring |

**Recommended improvements incorporated:**

| ID  | Improvement                                                                 | Where                         |
| --- | --------------------------------------------------------------------------- | ----------------------------- |
| R13 | Phase 3 sub-phasing (3a: backend buffer, 3b: frontend swap)                 | Phase 3 header                |
| R14 | Log warning in reader thread if event leaks into response channel           | Phase 2 reader thread code    |
| R16 | SQLite WAL checkpoint on startup and shutdown                               | Phase 4 Registry Design       |
| R17 | `ensure_running` migration — return `SessionNotFound` error                 | Phase 2 Canvas migration note |
| R18 | `beforeExit` doesn't fire on `process.exit()` — use `flushAndExit()` helper | Phase 2 Single-Session Mode   |
| R19 | Process limit is 15 chat + 1 utility = 16 total                             | Memory & Performance section  |
| R20 | EditorChatPanel verification missing from Phase 3                           | Phase 3 Verification          |

**Nice-to-haves added:**

| ID  | Enhancement                                                   |
| --- | ------------------------------------------------------------- |
| N6  | Process spawn telemetry (latency logging)                     |
| N7  | Buffer fetch timeout (5s fallback to "disconnected")          |
| N8  | Sequence number overflow analysis (non-issue, documented)     |
| N9  | Session bridge restart UX decision (SDK resume vs fresh load) |
| N10 | Stress test automation script                                 |

### Audit 2 Addendum — User Feedback Integration (January 2026)

**User verdict**: "Ship-ready after Phase 3 verification passes with the `_seq` end-to-end test."

**Concerns addressed:**

| Concern                                                                             | Resolution                                                                                               |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Phase 3 is the riskiest — need runtime `_seq` validation                            | Added `log.warn` on out-of-order `_seq` in reader thread; added `_seq` end-to-end test to coverage table |
| Utility bridge is SPOF — canvas should auto-reconnect, not just show "disconnected" | Upgraded to automatic `canvas_create_session` on new bridge via `utility_bridge:restarted` Tauri event   |
| No quantified stress test criteria                                                  | Replaced prose with pass/fail threshold table (0 duplicates, 0 missing, <500ms p99, <2GB RSS, etc.)      |
| SQLite in hot path                                                                  | Added write frequency measurement to Phase 4 verification (<5 writes/sec threshold)                      |

**Missing items added:**

| Item                                                          | Resolution                                                                                                                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metrics/observability from day one (N1/N2 should be required) | Promoted N1 (structured logging) and N2 (memory monitoring) from nice-to-haves to Phase 2 requirements                                                            |
| Error propagation path for process exit → frontend            | Added 5-step detection → notification flow: `try_wait()` → `process:exited` Tauri event → frontend toast + disable input                                          |
| Windows/Linux cross-platform orphan detection                 | Added platform table: macOS (`sysctl kern.proc`), Linux (`/proc/{pid}/stat`), Windows (Job Objects with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`)                     |
| Reader thread EOF → `mark_dead()` callback missing from code  | Added `on_exit: impl FnOnce()` parameter to `reader_thread()` and `set_on_exit` in `spawn_bridge()` — instant crash detection, health check is secondary fallback |
