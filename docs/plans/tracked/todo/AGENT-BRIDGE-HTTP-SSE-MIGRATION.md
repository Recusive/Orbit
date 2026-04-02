# Plan: Agent-Bridge HTTP+SSE Migration

> **Companion spec**: `docs/specs/HTTP/agent-bridge-http-sse-migration-spec.md` — defines behavioral contracts, acceptance criteria, and data types.
>
> **Migration boundary**: Hot path (9 functions + 10 event listeners) → direct HTTP+SSE. Cold path (sessions, definitions, fork/rewind, generate) → Tauri IPC through Rust, which delegates to sidecar via HTTP instead of stdin. The 36 Tauri commands are retained with internal transport changed from stdin to reqwest.

## Context

The agent-bridge sidecar (Claude Agent SDK wrapper) communicates with the frontend via stdin/stdout pipes proxied through Rust. Every streaming token crosses 5 serialization boundaries through a Rust process that does zero meaningful processing — it deserializes JSON from the sidecar, clones it, re-serializes it, and emits a Tauri event. This adds ~50-65ms of overhead per first-token delivery and causes Rust to block Tokio threads on crossbeam channel recv.

**Goal:** Remove Rust from the streaming data path. Frontend talks directly to the sidecar via HTTP+SSE. Rust only spawns the sidecar, health-checks it, and monitors for crashes.

**Result:** 5 serialization boundaries → 2. Eliminate the Rust reader thread, stdin mutex, crossbeam channel, and double-serde on every streaming token.

## Why This Is Safe — Rust Layer Audit

Code audit of `session.rs` (805 lines), `bridge.rs` (395 lines), and `lifecycle.rs` (677 lines) confirms the Rust layer is a transparent proxy. Every method follows the same pattern:

```rust
pub fn set_thinking_mode(&self, ...) -> Result<()> {
    self.ensure_running()?;                      // check sidecar alive
    let request = BridgeRequest::SetThinkingMode { .. }; // build enum
    let bridge = self.bridge.lock();             // lock mutex
    let response = bridge.send_request(&request)?;       // ser → stdin → wait → deser
    Self::check_response(response)               // check error string
}
```

32 out of 36 commands follow this exact pattern. Zero validation, zero transformation, zero business logic.

| What Rust does                                             | Count          | Needed?                                                                                       |
| ---------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| Lock → serialize → pipe → wait → deserialize → check error | 32 methods     | **No** — frontend can HTTP directly                                                           |
| Same + track session ID in HashSet                         | 2 methods      | **No** — `has_session()` and `get_active_sessions()` have zero callers in the entire codebase |
| Manage API credentials via macOS Keychain                  | 1 method       | **Yes** — needs native Keychain access                                                        |
| Spawn sidecar process                                      | 1 function     | **Yes** — needs native process spawn                                                          |
| Health check (try_wait on child)                           | 1 function     | **Yes** — needs native process API                                                            |
| Deserialize events → re-serialize → app.emit               | 10 event types | **No** — SSE delivers directly                                                                |

The event callback (`setup_event_callbacks` in `lifecycle.rs`) destructures each `BridgeEvent` variant and re-serializes it into `serde_json::json!({...})` for `app.emit()`. No filtering, no aggregation, no transformation. A photocopier.

**3 things must stay in Rust:** spawn, health check, Keychain credentials. Everything else is provably a no-op proxy.

---

## Protocol Surface (39 requests, 10 events)

**Hot path (streaming):** send_message, interrupt, 10 event types via SSE
**Session lifecycle:** create_session, delete_session, is_session_ready, get_sdk_session_id, get_stored_session, cleanup_sessions
**Config (9):** set/get thinking, effort, model, plan_mode, accept_mode, permission_response
**Definitions CRUD (13):** agents (5), commands (6), skills (1), generate agent/command
**Operations (7):** fork, rewind, fork_at, generate_title, enhance_bug_report, update_credentials, shutdown

---

## Phase 0: Add HTTP+SSE Server to Sidecar (Additive Only)

No breaking changes. Both stdin/stdout and HTTP work simultaneously.

### Create

| File                                            | Purpose                                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `agent-bridge/src/server/index.ts`              | Hono app factory — creates server with `sessionManager` reference                         |
| `agent-bridge/src/server/middleware/auth.ts`    | Bearer token validation from `ORBIT_BRIDGE_AUTH_TOKEN` env var                            |
| `agent-bridge/src/server/routes/sessions.ts`    | Session lifecycle: POST/DELETE /sessions, GET /sessions/:id/ready etc.                    |
| `agent-bridge/src/server/routes/chat.ts`        | Hot path: POST /sessions/:id/messages (fire-and-forget 204), POST /sessions/:id/interrupt |
| `agent-bridge/src/server/routes/config.ts`      | PUT /sessions/:id/config (batch), individual setters, POST /sessions/:id/permission       |
| `agent-bridge/src/server/routes/definitions.ts` | Agents, commands, skills CRUD — standard REST                                             |
| `agent-bridge/src/server/routes/operations.ts`  | Fork, rewind, generate, credentials, shutdown                                             |
| `agent-bridge/src/server/routes/events.ts`      | GET /events — single SSE stream for all 10 event types                                    |

### Modify

| File                        | Change                                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent-bridge/src/index.ts` | After SessionManager init, start Hono server on `ORBIT_BRIDGE_PORT` (env var) or port-scan 4200-4300. SSE handler subscribes to same event emitters as stdout. Stdin loop stays. |
| `agent-bridge/package.json` | Add `hono` dependency                                                                                                                                                            |

### HTTP API Shape

```
GET  /health                              → { status: "ok" } (no auth)
GET  /events                              → SSE stream (all events)

POST   /sessions                          → create (body: { sessionId, config? })
DELETE /sessions/:id                      → delete
GET    /sessions/:id/ready                → is_session_ready
GET    /sessions/:id/sdk-id               → get_sdk_session_id
GET    /sessions/:id/stored               → get_stored_session
POST   /sessions/cleanup                  → cleanup_sessions

POST   /sessions/:id/messages             → send_message (204 fire-and-forget)
POST   /sessions/:id/interrupt            → interrupt
POST   /sessions/:id/browser-tool         → browser:tool_response

PUT    /sessions/:id/config               → batch: { thinking?, effort?, model?, planMode?, acceptMode? }
POST   /sessions/:id/permission           → permission_response

GET    /agents                            → list (query: workspacePath)
POST   /agents                            → create
PUT    /agents/:name                      → update
DELETE /agents/:name                      → delete
POST   /generate/agent                    → generate_agent_definition

GET    /commands                           → list
POST   /commands                           → create
PUT    /commands/:name                     → update
DELETE /commands/:name                     → delete
POST   /generate/command                   → generate_command_definition

GET    /skills                             → list

POST   /sessions/:id/fork                 → fork_session
POST   /sessions/:id/rewind               → rewind_files
POST   /sessions/:id/fork-at              → fork_session_at
POST   /generate/title                    → generate_title
POST   /enhance-bug-report                → enhance_bug_report
PUT    /credentials                        → update_credentials
POST   /shutdown                           → shutdown
```

### SSE Event Format

```
event: agent_message
data: {"type":"agent_message","sessionId":"...","message":{...}}

event: permission_request
data: {"type":"permission_request","request":{...}}

event: session_init
data: {"type":"session_init","event":{...}}

(+ checkpoint, compact_complete, plan_mode_changed, accept_mode_changed, error_event, auth_error, browser_tool_request)
```

15-second keepalive comments. `retry: 1000` directive for auto-reconnect.

### Test

```bash
cd agent-bridge && bun run start  # start with stdin
curl http://localhost:4200/health
curl -N -H "Authorization: Bearer $TOKEN" http://localhost:4200/events  # SSE stream
# Send message via stdin → verify SSE receives same events
```

---

## Phase 1: Rust Internal Transport — stdin to HTTP

Replace the `AgentBridge` stdin/stdout IPC with `reqwest` HTTP calls to the sidecar. All 36 Tauri commands keep their existing signatures. The frontend sees no change.

### Modify

| File                                        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/agent/bridge.rs`             | Remove: `stdin` field, `response_rx` field, `event_callback` field, `reader_thread()`, `send_request()` (stdin-based), `send_request_async()`, `set_event_callback()`, `wait_for_ready()` (crossbeam-based). Add: `port: u16`, `auth_token: String`, `http_client: reqwest::Client`, `get_port()`, `get_auth_token()`. New `send_request()` does HTTP POST via reqwest. New `wait_for_ready()` polls `GET /health` (500ms intervals, 30s timeout). Keep: `spawn()` / `spawn_with_extra_env()` (add `ORBIT_BRIDGE_PORT` + `ORBIT_BRIDGE_AUTH_TOKEN` env vars), `check_and_recover()`, `shutdown()` (change to `POST /shutdown`), `is_running()`. |
| `src-tauri/src/agent/session.rs`            | All methods that call `bridge.send_request(&BridgeRequest::...)` change to `bridge.http_post("/endpoint", &json!({...}))`. Public API unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src-tauri/src/agent/credential_bridge.rs`  | `push_to_running()`: replace `bridge.send_request(&BridgeRequest::UpdateCredentials {...})` with `bridge.http_put("/credentials", &json!({...}))`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src-tauri/src/commands/agent/lifecycle.rs` | Remove: 10 `emit_*` functions (lines 511-643), `setup_event_callbacks()` (line 646). Add: `agent_get_bridge_info` command (returns `{ port, authToken }`), `agent_notify_sidecar_down` command (triggers respawn, returns new `BridgeInfo`). All other 36 commands stay unchanged.                                                                                                                                                                                                                                                                                                                                                              |
| `src-tauri/src/lib.rs`                      | Remove `setup_event_callbacks()` call. Add `agent_get_bridge_info` and `agent_notify_sidecar_down` to `generate_handler![]`. Keep `.manage(session_manager)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src-tauri/Cargo.toml`                      | Activate `reqwest` with `json` feature (already in workspace deps). Remove `crossbeam-channel`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### Spawn changes

```rust
let auth_token = uuid::Uuid::new_v4().to_string();
let port = scan_ports(4200..4300)?;
Command::new(sidecar_path)
    .env("ORBIT_BRIDGE_AUTH_TOKEN", &auth_token)
    .env("ORBIT_BRIDGE_PORT", port.to_string())
    .env("CLAUDE_CLI_PATH", &cli_path)
    .env("CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING", "1")
    // inject_at_spawn() adds ANTHROPIC_API_KEY from credentials.enc if set
    .stdout(Stdio::piped())  // still read stdout for Ready event during transition
    .stderr(Stdio::inherit())
    .spawn()
```

Bootstrap: wait for existing `{"type":"ready"}` stdout event (no payload change), then poll `GET /health` until 200.

### Test

```bash
bunx tauri dev
# Verify sidecar spawns, health check passes
# invoke('agent_get_bridge_info') → { port: 4200, authToken: "..." }
# curl http://127.0.0.1:4200/health → { status: "ok" }
# All existing agent operations work (session create, send message, etc.)
# Events still flow via Tauri (emit functions removed in Phase 2)
```

---

## Phase 2: Frontend Hot Path — Direct HTTP+SSE

Move 9 hot-path functions and 10 event listeners from Tauri IPC to direct HTTP+SSE. Cold-path functions stay on Tauri IPC → Rust → sidecar HTTP.

### Create

| File                                   | Purpose                                                                                                                                                                                                                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/lib/api/agent-http.ts` | HTTP client for hot path only: `configureBridge()`, `httpSendMessage()`, `httpInterrupt()`, `httpRespondPermission()`, `httpSetConfig()`, `httpBrowserToolResponse()`. Uses `fetch()` with `Authorization: Bearer` header and Sentry span wrapping.                                           |
| `apps/agent/src/lib/api/agent-sse.ts`  | SSE client: `connectSSE(port, token, handlers)`. Uses `fetch()` + `ReadableStream` (not `EventSource` — need custom `Authorization` header). Exponential backoff reconnection (1s→2s→4s→...→30s). Translates SSE events to `window.postMessage()` in the format `ChatMessageService` expects. |

### Modify

| File                                                          | Change                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/providers/tauri-provider.tsx`                 | After `bootstrapRuntimeHealth`: call `invoke('agent_get_bridge_info')` → `configureBridge(port, token)` → `connectSSE(port, token, handlers)`. Remove 10 `onAgent*` Tauri listener registrations (lines 258-663) + `onBrowserToolRequest` (line 771). Keep: `onTerminalOutput` (667), `onTerminalExit` (688), `onTerminalForeground` (709), `onBrowserNavigated` (731), `onBrowserLoading` (751). |
| `apps/agent/src/hooks/agent/handlers/agent-sdk-handlers.ts`   | `handleMessageSend`: `agentSendMessage()` → `httpSendMessage()`. `handleAgentStop`: `agentInterrupt()` → `httpInterrupt()`. `handlePermissionResponse`: `agentRespondPermission()` → `httpRespondPermission()`. `handleThinkingSet/ModelSet/EffortSet/InputModeSet`: replace 2-3 individual calls with single `httpSetConfig()`.                                                                  |
| `apps/agent/src/hooks/agent/handlers/browser-tool-handler.ts` | `browserToolResponse()` → `httpBrowserToolResponse()`.                                                                                                                                                                                                                                                                                                                                            |
| `apps/agent/src/hooks/agent/use-tauri-session.ts`             | Export `clearStaleSessions()` that clears the `createdSessions` Set. Called by SSE recovery path after sidecar respawn.                                                                                                                                                                                                                                                                           |
| `apps/agent/src/lib/api/agent.ts`                             | No changes — existing Tauri IPC wrappers stay for cold-path calls.                                                                                                                                                                                                                                                                                                                                |

### SSE → Window Message Bridge

The SSE client replicates the event transformation logic from `tauri-provider.tsx` lines 259-663:

```
SSE agent_message (type: text)     → postWindowMessage({ type: 'agent:chunk', ... })
SSE agent_message (type: thinking) → postWindowMessage({ type: 'agent:thinking', ... })
SSE agent_message (type: tool_use) → postWindowMessage({ type: 'tool:start' or 'tool:end', ... })
SSE agent_message (type: result)   → postWindowMessage({ type: 'agent:complete', ... })
SSE agent_message (type: error)    → postWindowMessage({ type: 'agent:error', ... })
SSE permission_request             → postWindowMessage({ type: 'permission:request', ... })
SSE session_init                   → postWindowMessage({ type: 'system:init', ... })
SSE auth_error                     → AuthStore mutation + toast (no window message)
SSE browser_tool_request           → postWindowMessage({ type: 'browser:tool_request', ... })
```

ChatMessageService, RAF batchers, and all Zustand stores need zero changes.

### CORS

Sidecar CORS middleware required (frontend origin differs from sidecar origin):

- Origin allowlist: `tauri://localhost`, `http://tauri.localhost`, `http://localhost:5176`
- `OPTIONS` preflight responds `204` with CORS headers, no auth check
- `Access-Control-Allow-Headers: Authorization, Content-Type`
- `Access-Control-Max-Age: 86400`

### Crash Recovery

On SSE disconnect:

1. SSE client retries with backoff
2. If all retries fail → call `invoke('agent_notify_sidecar_down')`
3. Rust respawns sidecar → returns new `BridgeInfo`
4. Frontend calls `configureBridge(newPort, newToken)`, `clearStaleSessions()`
5. SSE reconnects to new port

### Test

- Send message → streaming tokens via SSE
- Permission dialog → approve/deny via HTTP → agent continues/stops
- Stop button → `httpInterrupt()` → streaming ceases
- Rewind → Tauri IPC → Rust → sidecar HTTP (cold path unchanged)
- Kill sidecar → SSE reconnect → `agent_notify_sidecar_down` → respawn → recovery
- Terminal, browser nav, files → still work via Tauri IPC
- CORS: verify `OPTIONS` returns correct headers in both dev and production

---

## Phase 3: Cleanup — Remove stdin/stdout from Sidecar

After all operations work via HTTP, remove the stdin/stdout IPC from the sidecar.

### Modify

| File                        | Change                                                                                                                                                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent-bridge/src/index.ts` | Remove readline stdin loop, `sendResponse()`/`sendEvent()` stdout functions. Main becomes: create SessionManager → start HTTP server → register SIGTERM handler. The `{"type":"ready"}` bootstrap event also removed (Rust uses `/health` polling). |

### Delete

| Code                              | Location                                               |
| --------------------------------- | ------------------------------------------------------ |
| Reader thread + crossbeam channel | `bridge.rs` — already removed in Phase 1               |
| `BridgeEvent` enum (if unused)    | `protocol.rs` — Rust no longer parses events           |
| Stdout-based `wait_for_ready()`   | `bridge.rs` — replaced by `/health` polling in Phase 1 |

### Test

Full regression. Verify:

- Zero stdout writes from sidecar
- Zero Tauri agent events emitted
- All HTTP+SSE paths work
- All cold-path Tauri IPC → Rust → HTTP paths work
- `cd agent-bridge && bun test` passes (tests must be rewritten to use HTTP before this phase)

---

## Phase 4: Batcher Optimization

### Modify

| File                                                | Change                                                                                                               |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `agent-bridge/src/agent/session/session-manager.ts` | Set TextEventBatcher interval to 0 (immediate emission). Keep `getAccumulatedLength()` API for tool content offsets. |

Frontend RAF batcher coalesces at 60fps. Server-side batching adds 0-16ms first-token delay with no benefit over SSE.

---

## Dependency Graph

```
Phase 0 (sidecar HTTP server — additive, no breaks)
    ↓
Phase 1 (Rust stdin→HTTP — internal refactor, frontend unchanged)
    ↓
Phase 2 (Frontend hot path → direct HTTP+SSE)
    ↓
Phase 3 (Cleanup — remove stdin/stdout)
    ↓
Phase 4 (Batcher — independent)
```

Phase 1 alone gives ~30% latency improvement (removes crossbeam + reader thread + stdout pipe).
Phase 2 gives the remaining ~70% (bypasses Rust for streaming).

## Security

- **Auth:** Random Bearer token generated per sidecar spawn, passed via env var, regenerated on every restart
- **Port:** 4200-4299 range, `127.0.0.1` binding only, communicated via `agent_get_bridge_info` Tauri command
- **CORS:** Reflected origin from allowlist `[tauri://localhost, http://tauri.localhost, http://localhost:5176]`. `OPTIONS` preflight without auth. `Access-Control-Max-Age: 86400`.
- **CSP:** Already allows `http://127.0.0.1:*` in connect-src (tauri.conf.json line 40)
- **Credentials:** API keys stay in Rust (`credentials.enc` + `CredentialBridge`). OAuth tokens are sidecar-owned (Keychain access in `credentials.ts`).

## Key Files

| File                                                        | Role in migration                                                |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| `agent-bridge/src/index.ts`                                 | Add HTTP server (Phase 0), remove stdin (Phase 3)                |
| `agent-bridge/src/server/`                                  | New HTTP routes + SSE + CORS middleware (Phase 0)                |
| `src-tauri/src/agent/bridge.rs`                             | stdin→reqwest (Phase 1), remove reader thread (Phase 1)          |
| `src-tauri/src/agent/session.rs`                            | Internal transport changes (Phase 1), public API unchanged       |
| `src-tauri/src/commands/agent/lifecycle.rs`                 | Remove 10 emit functions (Phase 1), add 2 new commands (Phase 1) |
| `apps/agent/src/lib/api/agent-http.ts`                      | New hot-path HTTP client (Phase 2)                               |
| `apps/agent/src/lib/api/agent-sse.ts`                       | New SSE client with event transformation (Phase 2)               |
| `apps/agent/src/providers/tauri-provider.tsx`               | SSE connection setup, remove 10 Tauri listeners (Phase 2)        |
| `apps/agent/src/hooks/agent/handlers/agent-sdk-handlers.ts` | Switch 8 hot-path calls to HTTP (Phase 2)                        |
| `apps/agent/src/hooks/agent/use-tauri-session.ts`           | Export `clearStaleSessions()` for crash recovery (Phase 2)       |

## Verification

After each phase, verify:

1. `bunx tauri dev` — app starts, sidecar spawns
2. Send a message — streaming tokens appear
3. Permission dialog works — approve/deny
4. Stop button works — agent halts
5. Rewind works — files restored
6. Terminal, browser, file explorer — still work via Tauri IPC
7. `cd agent-bridge && bun test` — integration tests pass
8. `cargo check` — Rust compiles
9. `bun run check` — frontend typecheck + lint
