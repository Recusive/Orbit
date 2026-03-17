# Fix: Orbit Threading Architecture (v2 — Post-Audit Review)

You are fixing threading and async issues in Orbit, a Tauri 2.9.x + React 19 + Rust desktop app. An architecture audit and a plan review have been completed. This prompt incorporates corrections from the review.

**Important constraints:**

- This is a Bun-only repo. Use `bun` for all package commands (`bun add`, `bun run typecheck`, `bun test`). Never use `pnpm` or `npm`.
- Verify Rust changes with `cargo check`. Verify TS changes with `bun run typecheck`.
- Do NOT proceed to the next fix if the current one doesn't compile.

---

## Step 0: Build Authoritative Command Manifest

Before making any changes, scan the actual codebase and build a complete manifest. The prior audit had stale paths and counts.

1. Find every `#[tauri::command]` in `src-tauri/`:

```bash
rg -n "#\[tauri::command\]" src-tauri --glob "*.rs" | sort
```

2. For each command, record:
   - Exact file path
   - Function name
   - `async fn` or `fn`
   - Whether it uses `std::fs`, `std::process::Command`, `tokio::fs`, `tokio::process`, `spawn_blocking`, `crossbeam`, or shared locks
   - What module it belongs to
   - Classify as: `sync`, `async`, or `async+blocking-offload`

3. Find all `invoke()` calls in the frontend (scan all workspace paths, not just `src/`):

```bash
rg -n "invoke\(" apps --glob "*.ts" --glob "*.tsx" | sort
```

4. Find all Tauri event emitters and listeners:

```bash
rg -n "app\.emit|emit_to|\.emit\(" src-tauri --glob "*.rs" | sort
rg -n "listen\(" apps --glob "*.ts" --glob "*.tsx" | sort
```

5. Find any existing Web Workers:

```bash
find apps -name "*.worker.ts" -o -name "*.worker.js" 2>/dev/null
```

Write the manifest to `reviews/command-manifest.md`. Use this as the source of truth for all subsequent fixes — not the prior audit's counts or paths.

---

## Fix 1: Agent Bridge Async Refactor with Request Correlation

**Problem:** Agent commands call through a bridge that uses `crossbeam::recv_timeout(Duration::from_secs(300))` inside `async fn`, blocking Tokio workers for the entire sidecar round-trip.

**The deeper problem the prior plan missed:** The current sidecar protocol uses `requestType` to match responses, not unique request IDs. If two commands of the same `requestType` are in flight concurrently, responses can be misrouted.

### Fix — Full Protocol

**IMPORTANT: The sidecar emits TWO kinds of messages on stdout:**

1. **Command responses** — correlated replies to a specific request (e.g., `createSession`, `sendMessage` results)
2. **Unsolicited events** — stream events pushed by the sidecar without a prior request (e.g., `agent:chunk`, `agent:complete`, `tool:start`)

These MUST remain distinguishable. A unified `BridgeResponse { requestId, ... }` for all messages would break event parsing. Use a discriminated union: command responses include `requestId`; events remain event-shaped without `requestId`.

**Step 1: Add `requestId` to command responses only (preserve event separation)**

In the Rust bridge layer (find the actual struct — likely in `bridge.rs` or `protocol.rs`):

```rust
use uuid::Uuid;

#[derive(Serialize, Deserialize)]
struct BridgeRequest {
    request_id: String,      // NEW — unique per request
    request_type: String,
    payload: serde_json::Value,
}

/// Discriminated union: command responses carry request_id, events do not.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum BridgeMessage {
    CommandResponse(CommandResponse),
    Event(Box<BridgeEvent>),  // Existing event type, unchanged
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResponse {
    pub request_id: String,      // Correlates to request
    pub request_type: String,
    pub payload: serde_json::Value,
    pub error: Option<String>,
}
```

**Step 2: Build an async response router in Rust**

Replace the blocking crossbeam pattern with a pending request map:

```rust
use tokio::sync::oneshot;
use dashmap::DashMap;

struct AsyncBridge {
    pending: Arc<DashMap<String, oneshot::Sender<BridgeResponse>>>,
    stdin_tx: tokio::sync::mpsc::Sender<BridgeRequest>,
}

impl AsyncBridge {
    async fn send_request(&self, request_type: &str, payload: serde_json::Value) -> Result<BridgeResponse, String> {
        let request_id = Uuid::new_v4().to_string();
        let (tx, rx) = oneshot::channel();

        // Register pending response handler
        self.pending.insert(request_id.clone(), tx);

        // Send request to sidecar
        let request = BridgeRequest {
            request_id: request_id.clone(),
            request_type: request_type.to_string(),
            payload,
        };
        self.stdin_tx.send(request).await
            .map_err(|_| "Bridge stdin closed".to_string())?;

        // Await response without blocking a Tokio worker
        match tokio::time::timeout(Duration::from_secs(300), rx).await {
            Ok(Ok(response)) => {
                if let Some(err) = response.error {
                    Err(err)
                } else {
                    Ok(response)
                }
            }
            Ok(Err(_)) => {
                // Sender dropped — sidecar crashed or bridge shut down
                Err("Bridge response channel dropped".to_string())
            }
            Err(_) => {
                // Timeout — clean up pending entry
                self.pending.remove(&request_id);
                Err("Bridge request timed out after 300s".to_string())
            }
        }
    }
}
```

**Step 3: Fix the sidecar stdout reader to discriminate events from command responses**

The existing `std::thread::spawn` stdout reader (in `bridge.rs`) must first determine whether a line is a command response or an unsolicited event, then route accordingly:

```rust
// In the stdout reader thread:
fn handle_message(
    pending: &Arc<DashMap<String, oneshot::Sender<CommandResponse>>>,
    event_tx: &tokio::sync::mpsc::UnboundedSender<BridgeEvent>,
    message: BridgeMessage,
) {
    match message {
        BridgeMessage::CommandResponse(resp) => {
            if let Some((_, sender)) = pending.remove(&resp.request_id) {
                let _ = sender.send(resp);
            } else {
                // Late response after timeout — log and discard
                tracing::warn!(request_id = %resp.request_id, "late or unknown command response");
            }
        }
        BridgeMessage::Event(event) => {
            // Forward to the existing event channel, unchanged
            let _ = event_tx.send(*event);
        }
    }
}
```

**Edge case — interleaved events and command responses:** Under heavy load, the sidecar may emit event lines and command response lines on adjacent stdout reads. The discriminated union (`BridgeMessage`) is parsed per-line, so each line is independently classified. No buffering or ordering dependency exists between the two types.

**Step 4: Update the sidecar (Bun/TS side) to echo `requestId` on command responses only**

In the agent sidecar TypeScript code, update the message handler to include `requestId` in command responses. Unsolicited events (e.g., `agent:chunk`, `tool:start`) continue to be emitted WITHOUT `requestId`:

```typescript
// In the sidecar's stdin message handler
interface BridgeRequest {
  requestId: string; // NEW
  requestType: string;
  payload: unknown;
}

// Command response — includes requestId for correlation
interface CommandResponse {
  requestId: string; // Echo back from request
  requestType: string;
  payload: unknown;
  error?: string;
}

// Events — NO requestId, emitted asynchronously
interface BridgeEvent {
  type: string; // e.g. "agent:chunk", "tool:start"
  sessionId: string;
  // ... existing event fields
}

async function handleRequest(req: BridgeRequest): Promise<void> {
  try {
    const result = await dispatch(req.requestType, req.payload);
    sendCommandResponse({
      requestId: req.requestId,
      requestType: req.requestType,
      payload: result,
    });
  } catch (err) {
    sendCommandResponse({
      requestId: req.requestId,
      requestType: req.requestType,
      payload: null,
      error: String(err),
    });
  }
}

// Events are emitted separately, without requestId:
function emitEvent(event: BridgeEvent): void {
  process.stdout.write(JSON.stringify(event) + '\n');
}
```

**Step 5: Update Zod schemas to reflect the discriminated union**

If the frontend or bridge layer uses Zod schemas for bridge message validation (check `agent-bridge/src/protocol/schemas.ts`), update them to match the command/event split:

- Add `requestId: z.string()` to command request and response schemas only
- Event schemas remain unchanged (no `requestId` field)
- Use `z.discriminatedUnion` or `z.union` to parse the `BridgeMessage` envelope

**Edge cases to handle:**

- **Concurrent same-requestType calls:** Now safe — routed by `requestId`, not `requestType`
- **Late responses after timeout:** The `pending.remove(&request_id)` in the timeout branch cleans up. The router's `let _ = sender.send()` handles the case where the oneshot receiver is already dropped.
- **Late responses after bridge restart:** Request IDs are UUIDs — collision probability across process lifetimes is negligible. After sidecar restart, the `pending` DashMap is drained (all old senders dropped), so even if a zombie process somehow echoed an old `requestId`, it would hit the `"late or unknown"` warn branch and be discarded.
- **Interleaved events and command responses:** Parsed per-line via `serde(untagged)` discriminated union. Each line is independently classified as `CommandResponse` (has `request_id`) or `Event` (has `type`). No cross-line buffering or ordering dependency.
- **Sidecar crash mid-request:** When the stdout reader thread detects EOF/broken pipe, it should drain `pending` and drop all senders, which causes all waiting `rx.await` to return `Err(RecvError)`.
- **Sidecar restart with many in-flight requests:** During teardown, partial responses may arrive on stdout before EOF. The router must handle this gracefully: any `CommandResponse` with a valid `request_id` in `pending` gets delivered normally; any response after the reader detects EOF is unreachable (pipe is closed). After EOF, drain ALL remaining `pending` entries — iterate and drop every sender so callers get `RecvError` rather than hanging until the 300s timeout. The new sidecar process gets a fresh `pending` DashMap, so no cross-lifetime contamination is possible.
- **Bridge shutdown:** Drop the `pending` DashMap, all outstanding oneshot receivers get `RecvError`.

**Test:** After this change, verify:

1. `agent_send_message` doesn't block other Tauri commands while waiting
2. Two concurrent `agent_send_message` calls resolve to the correct responses
3. A timed-out request doesn't leak entries in `pending`
4. Sidecar restart doesn't leave zombie pending entries

---

## Fix 2: Git Commands — spawn_blocking

**Problem:** Git commands use libgit2 which does blocking `std::fs` I/O. These are currently sync `fn` commands.

**Fix:** Convert each to `async fn` + `spawn_blocking`. First, use the command manifest from Step 0 to get the exact list — the prior audit listed 19 but the actual count may differ.

Pattern for each:

```rust
// BEFORE:
#[tauri::command]
fn git_status(path: String) -> Result<GitStatusResponse, String> {
    // ... blocking libgit2 calls
}

// AFTER:
#[tauri::command]
async fn git_status(path: String) -> Result<GitStatusResponse, String> {
    tokio::task::spawn_blocking(move || {
        // ... exact same blocking libgit2 calls, unchanged
    }).await.map_err(|e| e.to_string())?
}
```

**Important:** Only the git commands that use libgit2 (blocking) need this. The ones that already use `tokio::process::Command` for shell git operations (`git_push`, `git_pull`, `git_fetch`, `git_clone`, `git_worktree_*`) are already correct — don't touch them.

Apply to every sync libgit2-based git command found in the manifest.

---

## Fix 3: Vault Commands — spawn_blocking

**Problem:** Vault commands use `std::fs` inside `async fn`.

**Fix:** Wrap the blocking portions in `spawn_blocking`. Same pattern as git. Apply to all vault commands that do sync file I/O per the manifest.

---

## Fix 4: Canvas Commands — Mixed Async/Sync (Do NOT Blanket spawn_blocking)

**Problem:** Canvas commands mix async operations (HTTP via reqwest, tokio::process) with sync operations (std::fs, std::process::Command::output()). The prior plan incorrectly suggested wrapping entire commands in `spawn_blocking` — this is wrong for mixed flows because you lose the ability to `.await` async operations inside `spawn_blocking`.

**Fix — case by case:**

**4a: `canvas_install_preview_deps`** — Replace `std::process::Command::output()` with `tokio::process::Command::output().await`:

```rust
// BEFORE:
let output = std::process::Command::new("bun")
    .arg("install")
    .current_dir(&path)
    .output()  // blocking
    .map_err(|e| e.to_string())?;

// AFTER:
let output = tokio::process::Command::new("bun")
    .arg("install")
    .current_dir(&path)
    .output()
    .await  // non-blocking
    .map_err(|e| e.to_string())?;
```

**4b: `canvas_stop_preview_server`** — The blocking `std::thread::sleep` is NOT directly in the command; it's inside the sync helper `graceful_shutdown` in `preview.rs`. Two options:

**Option A (minimal):** Wrap the entire `graceful_shutdown` call in `spawn_blocking`:

```rust
// In canvas_stop_preview_server:
tokio::task::spawn_blocking(move || {
    graceful_shutdown(/* ... */);
}).await.map_err(|e| e.to_string())?;
```

**Option B (cleaner, preferred):** Convert `graceful_shutdown` to an async function, replacing `std::thread::sleep` with `tokio::time::sleep` and any sync process operations with `tokio::process` equivalents:

```rust
async fn graceful_shutdown(/* ... */) -> Result<(), String> {
    // ... signal the process to stop ...
    tokio::time::sleep(Duration::from_millis(500)).await;
    // ... verify it exited ...
}
```

If `graceful_shutdown` holds a lock or mutex across the sleep, ensure the lock is dropped before the await point (split into lock-acquire → unlock → sleep → re-acquire if needed).

**4c: `canvas_start_preview_server`** — Replace `std::thread::spawn` log readers with `tokio::spawn` + `tokio::io::BufReader`.

**Edge case — backpressure behavior change:** The current `std::thread::spawn` log readers use blocking `BufReader::read_line`, which applies OS-level backpressure to stderr when the reader can't keep up. Migrating to `tokio::io::BufReader` + `tokio::spawn` changes the backpressure model — tokio's async reader yields to the runtime on each `.await`, which may alter stderr buffering behavior if the preview process writes faster than the reader polls. Monitor for stalled or lost log lines after migration. If issues arise, consider a bounded channel between the reader task and the log consumer to restore explicit backpressure.

**4d: `canvas_download_all_components`** — This mixes reqwest (async HTTP) with `std::fs` writes. Do NOT wrap in `spawn_blocking`. Instead, keep the async HTTP as-is and replace only the `std::fs` writes with `tokio::fs`:

```rust
// BEFORE (inside an async loop):
let bytes = reqwest::get(&url).await?.bytes().await?;
std::fs::write(&path, &bytes)?;  // blocking

// AFTER:
let bytes = reqwest::get(&url).await?.bytes().await?;
tokio::fs::write(&path, &bytes).await?;  // non-blocking
```

**4e: Purely sync canvas commands** (canvas_persist_styles, canvas_save_custom_component, etc.) — These ARE safe to wrap in `spawn_blocking` since they only do sync file I/O. Check each command in the manifest to confirm it has no async calls before wrapping.

**Error handling:** Ensure error types are consistent. `spawn_blocking` returns `JoinError` on panic, while `tokio::process` returns `io::Error`. Map them consistently at the command boundary.

---

## Fix 5: Web Workers for Frontend Processing

**Problem:** Zero Web Workers. All computation on JS main thread.

**Before creating workers, verify WKWebView Worker support:** Tauri uses WKWebView on macOS. Web Workers work in WKWebView but have some quirks:

- Module workers (`type: "module"`) may require Vite worker config
- Verify with a minimal test worker before building all three

**Step 1: Create a test worker first**

```typescript
// apps/agent/src/workers/test.worker.ts
self.onmessage = (e) => {
  self.postMessage({ echo: e.data, timestamp: Date.now() });
};

// In a component, test it:
const w = new Worker(new URL('../workers/test.worker.ts', import.meta.url), { type: 'module' });
w.onmessage = (e) => console.log('Worker response:', e.data);
w.postMessage('test');
```

Build and run the app. If the worker responds, proceed. If not, investigate Vite/Tauri worker configuration before continuing.

**Step 2: Conversation processor worker (highest impact)**

Move from `chat-message-service.ts`:

- `getActiveChain()` chain traversal
- The filter/map/Set/reduce pipeline from `conversation_load` post-processing
- `computeSimpleDiff` for Write/Edit tool display
- Tool state restoration

Use Comlink (`bun add comlink`) for typed communication:

```typescript
// apps/agent/src/workers/conversation.worker.ts
import { expose } from 'comlink';

const api = {
  processConversationLoad(rawMessages: RawMessage[]): ProcessedConversation {
    // Move the chain traversal + filtering + tool restore here
  },
  computeSimpleDiff(oldContent: string, newContent: string): DiffResult {
    // Move diff logic here
  },
};

export type ConversationWorkerApi = typeof api;
expose(api);
```

```typescript
// apps/agent/src/workers/use-conversation-worker.ts
import { wrap, type Remote } from 'comlink';
import type { ConversationWorkerApi } from './conversation.worker';

let worker: Remote<ConversationWorkerApi> | null = null;

export function getConversationWorker(): Remote<ConversationWorkerApi> {
  if (!worker) {
    worker = wrap<ConversationWorkerApi>(
      new Worker(new URL('./conversation.worker.ts', import.meta.url), { type: 'module' })
    );
  }
  return worker;
}

export function terminateConversationWorker() {
  // Call when switching away from Agent mode
  worker = null;
}
```

**Edge case — stale worker results after session remap/rewind:**
If the user rewinds or forks a conversation while the worker is processing, the worker's result is stale. Handle this with an epoch counter:

```typescript
let epoch = 0;

async function loadConversation(id: string) {
  const currentEpoch = ++epoch;
  const worker = getConversationWorker();
  const result = await worker.processConversationLoad(rawMessages);
  if (currentEpoch !== epoch) return; // stale — a newer load superseded this one
  setState(result);
}
```

**Step 3: Agent stream processor worker**

Move from `use-tauri-message-listener.ts`:

- Zod validation of incoming agent messages
- Message deduplication (rolling UUID Set)
- Message transformation

**Step 4: Data processor worker**

For:

- base64 decoding of terminal output
- `git_blame` / `git_diff_structured` result processing
- Large JSON parse from any invoke result

**Worker lifecycle:**

- Create workers lazily on first use
- Terminate workers when switching modes (Agent ↔ Canvas ↔ Editor) to free memory
- Handle worker init failure gracefully — fall back to main thread processing with a structured logger warning (not `console.warn`)
- Log worker init failures and stale-result drops via `createLogger('Worker')` for runtime telemetry

**Edge case — WKWebView worker differences:**
Tauri uses WKWebView on macOS, which supports Web Workers but may behave differently from Chromium:

- Module workers (`type: "module"`) require Vite's `?worker` import or explicit worker plugin config
- Some macOS versions may restrict worker `importScripts` or ES module imports
- The test worker in Step 1 MUST be validated in a packaged Tauri build (not just `bun run dev` in browser) before proceeding to production workers
- If workers fail in WKWebView, fall back to main-thread processing and file a Tauri upstream issue

**Edge case — stale results after session navigation:**
The epoch counter pattern handles rewind/fork, but also cover manual sidebar session switches:

- Increment epoch on ANY session change (rewind, fork, sidebar click, new conversation)
- Worker results arriving after epoch change must be silently discarded — never apply stale state
- Log discarded results at `debug` level for diagnostics

**Edge case — rapid session switch + rewind in the same frame:**
If the user clicks a sidebar session AND triggers a rewind before the first navigation's worker result returns, epoch may be incremented twice in rapid succession. The epoch counter handles this naturally (both increments happen synchronously before any async result returns), BUT the epoch must be a single shared module-level variable — not split across different hooks or handlers. If `loadConversation` and `handleRewind` each maintain separate counters, they can diverge. Ensure a single `conversationEpoch` is imported from one module (e.g., `apps/agent/src/workers/use-conversation-worker.ts`) and incremented from all code paths that invalidate in-flight worker results.

---

## Fix 6: Conversation Commands — Sync Disk I/O

**Problem:** Conversation commands are sync and do JSONL file I/O. The prior plan incorrectly claimed there was a command-layer `ConversationManager` mutex serialization — verify the actual locking structure from the manifest before proceeding.

**Fix:** If the commands are sync `fn`, convert to `async fn` + `spawn_blocking` (same pattern as git). If they're already `async fn` doing `std::fs`, wrap only the sync file I/O portions in `spawn_blocking`.

Check the actual code to determine which case applies.

---

## Fix 7: Credential / Keychain — Async Subprocess

**Location:** Find the actual paths from the manifest (likely under `commands/common/`).

**Fix:** Replace `std::process::Command::output()` with `tokio::process::Command::output().await`.

---

## Fix 8: Settings Commands — spawn_blocking

Low frequency, low priority. Wrap sync file I/O in `spawn_blocking`.

---

## Fix 9: LSP Per-Server Locks

**Problem:** All LSP commands serialize through one global `tokio::sync::Mutex<LspManager>`.

**Fix:** Refactor to per-server granularity:

```rust
struct LspManager {
    servers: DashMap<LanguageId, Arc<tokio::sync::Mutex<LspServer>>>,
}

impl LspManager {
    async fn get_server(&self, lang: &str) -> Option<Arc<tokio::sync::Mutex<LspServer>>> {
        self.servers.get(lang).map(|entry| entry.value().clone())
    }
}
```

This is a larger refactor. Only do this after Fixes 1-8 are complete and stable.

---

## Fix 10: Lower Priority Items

These are real issues but lower impact. Address after the above are stable:

- **`read_file_bytes` returns `number[]`:** Consider returning base64 and decoding in the data worker, or using `Uint8Array` via Tauri's binary response support.
- **Terminal write batching:** Debounce `terminal_write` invoke calls with 16ms batching. Collect keystrokes, send as one batch.
- **Sentry span exclusion list:** Skip `Sentry.startSpan` for `terminal_write`, `terminal_acknowledge`, `lsp_completions`, `lsp_did_change`, `lsp_hover`.
- **Dual terminal event listeners:** Deduplicate the two `window.addEventListener('message')` handlers.
- **RAF 120fps verification:** Test on a ProMotion Mac that the RAF batcher actually fires at 120Hz in WKWebView. If not, use `setTimeout(fn, 8)` as fallback.

---

## Execution Order

1. **Step 0: Command manifest** — source of truth for all file paths and command names
2. **Fix 1: Agent bridge** — highest impact, unblocks entire Tokio runtime
3. **Fix 2: Git spawn_blocking** — highest frequency blocker (5s poll)
4. **Fix 5: Web Workers** — unblocks JS main thread (start with test worker, then conversation worker)
5. **Fix 4: Canvas async/sync** — case-by-case, not blanket
6. **Fix 3: Vault spawn_blocking** — straightforward
7. **Fix 6: Conversation sync I/O** — straightforward once locking is verified
8. **Fix 7: Credential async subprocess** — quick
9. **Fix 8: Settings spawn_blocking** — quick
10. **Fix 9: LSP per-server locks** — larger refactor, do last
11. **Fix 10: Lower priority** — as time permits

For each fix: make the change → `cargo check` / `bun run typecheck` → verify no regressions → commit → next fix.
