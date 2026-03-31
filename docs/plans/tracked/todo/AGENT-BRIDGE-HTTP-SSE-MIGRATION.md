# Plan: Agent-Bridge HTTP+SSE Migration

## Context

The agent-bridge sidecar (Claude Agent SDK wrapper) communicates with the frontend via stdin/stdout pipes proxied through Rust. Every streaming token crosses 5 serialization boundaries through a Rust process that does zero meaningful processing — it deserializes JSON from the sidecar, clones it, re-serializes it, and emits a Tauri event. This adds ~50-65ms of overhead per first-token delivery and causes Rust to block Tokio threads on crossbeam channel recv.

The OpenCode backend (now removed) proved that HTTP+SSE works in this exact app — the frontend talked directly to a Hono server on localhost, Rust only managed process lifecycle. Claude Desktop uses Electron IPC for the same pattern (SDK in main process, IPC to renderer). Since Tauri's main process is Rust (not Node.js), HTTP+SSE is the closest equivalent.

**Goal:** Remove Rust from the streaming data path. Frontend talks directly to the sidecar via HTTP+SSE. Rust only spawns the sidecar, health-checks it, and monitors for crashes.

**Result:** 5 serialization boundaries → 2. Eliminate the Rust reader thread, stdin mutex, crossbeam channel, and double-serde on every streaming token.

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

## Phase 1: Simplify Rust to Lifecycle-Only

### Modify

| File                                        | Change                                                                                                                                                                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/agent/bridge.rs`             | Remove: reader_thread, send_request, stdin/stdout fields, crossbeam channel. Keep: spawn (with auth token + port env vars), wait_for_ready (poll GET /health), shutdown (POST /shutdown). Add: get_port(), get_auth_token() accessors. |
| `src-tauri/src/agent/session.rs`            | Remove all 30+ proxy methods. Keep: new(), ensure_running(), shutdown(), get_port(), get_auth_token(), update_credentials() (now POST to HTTP endpoint).                                                                               |
| `src-tauri/src/agent/protocol.rs`           | Delete entirely — Rust no longer serializes/deserializes bridge messages.                                                                                                                                                              |
| `src-tauri/src/commands/agent/lifecycle.rs` | Replace 36 Tauri commands with 2: `agent_get_bridge_info` (returns { port, authToken }) and `agent_update_credentials`. Remove setup*event_callbacks and all emit*\* functions.                                                        |
| `src-tauri/src/agent/credential_bridge.rs`  | `push_to_running()` now does HTTP POST to /credentials instead of stdin write.                                                                                                                                                         |
| `src-tauri/src/lib.rs`                      | Remove setup_event_callbacks call. Keep session_manager in .manage() for the 2 remaining commands.                                                                                                                                     |
| `src-tauri/src/commands/mod.rs`             | Update command registration — remove 34 commands, keep 2.                                                                                                                                                                              |

### Rust spawn changes

```rust
// Generate ephemeral auth token
let auth_token = uuid::Uuid::new_v4().to_string();
// Find available port
let port = scan_ports(4200..4300)?;
// Set env vars for sidecar
Command::new(sidecar_path)
    .env("ORBIT_BRIDGE_AUTH_TOKEN", &auth_token)
    .env("ORBIT_BRIDGE_PORT", port.to_string())
    .env("CLAUDE_CLI_PATH", &cli_path)
    .env("CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING", "1")
    .stdin(Stdio::null())  // no more stdin pipe
    .stdout(Stdio::inherit()) // for debug logging if needed
    .stderr(Stdio::inherit())
    .spawn()
```

Health check: poll `GET http://127.0.0.1:{port}/health` with 500ms intervals, up to 30s.

### Test

```bash
bunx tauri dev
# Verify sidecar spawns, health check passes
# In frontend console: invoke('agent_get_bridge_info') → { port: 4200, authToken: "..." }
# curl http://127.0.0.1:4200/health → { status: "ok" }
```

---

## Phase 2: Frontend HTTP+SSE Client

### Create

| File                                   | Purpose                                                                                                                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/lib/api/agent-http.ts` | HTTP client — configure(port, token), then all 35 agent functions as fetch() calls. Same function signatures as current agent.ts.                                                  |
| `apps/agent/src/lib/api/agent-sse.ts`  | SSE client — connectSSE(port, token, handlers). Uses fetch + ReadableStream (not EventSource, since EventSource doesn't support custom headers). Exponential backoff reconnection. |

### Modify

| File                                                        | Change                                                                                                                                                                                                                                       |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/lib/api/agent.ts`                           | Rename to `agent-tauri.ts` (no code changes). New `agent.ts` becomes a dispatch layer: if HTTP configured → use agent-http, else → use agent-tauri. This enables incremental migration.                                                      |
| `apps/agent/src/providers/tauri-provider.tsx`               | In initializeListeners: call `invoke('agent_get_bridge_info')` → `configure(port, token)` → `connectSSE(port, token, handlers)`. SSE handlers replace the 10 onAgent\* Tauri listeners. Keep terminal, browser, file listeners on Tauri IPC. |
| `apps/agent/src/hooks/chat/handlers/chat-actions.ts`        | Replace 2-3 separate pre-flight IPC calls (thinking:set, model:set, effort:set) with single `PUT /sessions/:id/config` batch call.                                                                                                           |
| `apps/agent/src/hooks/agent/handlers/agent-sdk-handlers.ts` | handleMessageSend now calls HTTP instead of Tauri invoke. ensureSession calls HTTP create session.                                                                                                                                           |

### SSE → Window Message Bridge

The SSE client translates events to the same window.postMessage format that ChatMessageService already expects:

```
SSE agent_message → postWindowMessage({ type: 'agent:chunk', ... })
SSE permission_request → postWindowMessage({ type: 'permission:request', ... })
SSE session_init → postWindowMessage({ type: 'system:init', ... })
```

This means ChatMessageService, the RAF batchers, and the streaming reveal controller need zero changes.

### Feature Flag

Natural dual-transport: if `agent_get_bridge_info` returns port+token → HTTP mode. If it fails (old Rust code) → Tauri IPC fallback. No explicit flag needed.

### Test

- Send message → verify streaming tokens appear in chat
- Permission dialog → approve/deny → verify agent continues/stops
- Interrupt (stop button) → verify agent halts
- Rewind → verify files restored + conversation forked
- Kill sidecar → verify SSE reconnects with backoff
- Terminal, browser, files → verify still work via Tauri IPC

---

## Phase 3: Cleanup

### Delete

| File                                    | Reason                                 |
| --------------------------------------- | -------------------------------------- |
| `apps/agent/src/lib/api/agent-tauri.ts` | Tauri transport no longer needed       |
| `src-tauri/src/agent/protocol.rs`       | No bridge message types needed in Rust |

### Modify

| File                                          | Change                                                                                                                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent-bridge/src/index.ts`                   | Remove readline stdin loop, sendResponse/sendEvent stdout functions. Main() now: create SessionManager → wire events → start HTTP server → register SIGTERM handler. |
| `apps/agent/src/lib/api/agent.ts`             | Remove dispatch layer, directly export from agent-http.ts                                                                                                            |
| `apps/agent/src/providers/tauri-provider.tsx` | Remove 10 onAgent\* Tauri listener registrations. Only terminal, browser, file listeners remain.                                                                     |

### Test

Full regression of all agent operations. Verify zero Tauri agent events emitted.

---

## Phase 4: Batcher Optimization

### Modify

| File                                                | Change                                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `agent-bridge/src/agent/session/session-manager.ts` | Set TextEventBatcher interval to 0 (immediate emission). Keep getAccumulatedLength() API for tool content offsets. |

The frontend RAF batcher already coalesces events at 60fps. Server-side batching adds 0-16ms first-token delay with no benefit over SSE.

---

## Dependency Graph

```
Phase 0 (additive, no breaks)
    ↓
Phase 1 (Rust) + Phase 2 (Frontend) — parallel development, test together
    ↓
Phase 3 (cleanup)
    ↓
Phase 4 (batcher, independent)
```

## Security

- **Auth:** Random Bearer token generated per sidecar spawn, passed via env var
- **Port:** Random from 4200-4300 range, communicated via Tauri command
- **CORS:** Allow `tauri://localhost`, `http://tauri.localhost`, `http://localhost:5176` (dev)
- **CSP:** Already allows `http://127.0.0.1:*` in connect-src (tauri.conf.json line 40)
- **Scope:** Token is ephemeral, localhost-only, regenerated on every restart

## Key Files

| File                                                 | Role in migration                                 |
| ---------------------------------------------------- | ------------------------------------------------- |
| `agent-bridge/src/index.ts`                          | Add HTTP server (Phase 0), remove stdin (Phase 3) |
| `src-tauri/src/agent/bridge.rs`                      | Simplify to lifecycle-only (Phase 1)              |
| `src-tauri/src/agent/session.rs`                     | Remove proxy methods (Phase 1)                    |
| `src-tauri/src/commands/agent/lifecycle.rs`          | 36 commands → 2 (Phase 1)                         |
| `apps/agent/src/lib/api/agent.ts`                    | Add HTTP transport (Phase 2)                      |
| `apps/agent/src/providers/tauri-provider.tsx`        | SSE connection setup (Phase 2)                    |
| `apps/agent/src/hooks/chat/handlers/chat-actions.ts` | Batch pre-flight config (Phase 2)                 |

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
