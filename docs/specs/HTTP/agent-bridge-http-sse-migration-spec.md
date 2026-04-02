# Spec: Agent-Bridge HTTP+SSE Migration

> **Companion plan**: `docs/plans/tracked/todo/AGENT-BRIDGE-HTTP-SSE-MIGRATION.md`
>
> **Status**: Draft (Rev 2 — post-audit)
> **Date**: 2026-04-01
> **Scope**: Replace the stdin/stdout Rust proxy with HTTP+SSE for the agent hot path while keeping Rust as the orchestrator for session lifecycle, conversations, and credentials.
>
> **Plan alignment**: The companion plan's implementation phases (1-4), dependency graph, security section, and key files table have been rewritten to match this spec's migration boundary. The plan's introductory audit section still contains language from the original lifecycle-only analysis (e.g., "frontend can HTTP directly", "3 things must stay in Rust") — treat that as historical context for why the migration was proposed, not as the current design. The phases are authoritative; the intro is background.

---

## 1. Problem Statement

### What's Broken

Every message between the frontend and the Claude Agent SDK sidecar crosses 8 serialization boundaries through a Rust process that does zero meaningful processing. The Rust layer (`session.rs`: ~800 lines wrapping `AgentBridge`, `lifecycle.rs`: 36 Tauri commands, `protocol.rs`: 38 request variants + 11 event variants) deserializes JSON from the sidecar, clones it, re-serializes it, and emits a Tauri event. The `AgentBridge` struct in `bridge.rs` uses a `crossbeam_channel::bounded(1000)` channel with a dedicated reader thread blocking on `BufReader::read_line()`, a `parking_lot::Mutex<ChildStdin>` for request serialization, and a 5-minute timeout for responses. This architecture was built when the sidecar had 5 commands; it now proxies 35 invoke functions and 10 event types. Note: the Rust layer is not a pure passthrough for all commands — `lifecycle.rs` validates permission decisions (lines 103-123), parses model strings (lines 178-195), and validates command scopes (lines 344-412). These validations must be preserved in the cold-path Rust→HTTP delegation or replicated in the sidecar HTTP routes.

### Why It Matters

First-token latency is ~50-65ms higher than necessary. The stdin/stdout JSON-line protocol is fragile: any stray `console.log` in the sidecar breaks parsing. Any Rust panic in the reader thread kills streaming silently. The Rust proxy is the single largest source of agent communication failures because errors at any of the 8 layers (JS serialize, stdout write, pipe buffer, Rust readline, Rust deser, crossbeam send, Tauri emit serialize, WebKit deser) produce opaque failures that are difficult to diagnose. Users experience this as "the agent doesn't respond" with no actionable error.

### What Success Looks Like

The agent hot path (message send, streaming tokens, tool calls, permissions, interrupt) bypasses Rust entirely via direct HTTP+SSE between frontend and sidecar (2 serialization boundaries). Everything else (session lifecycle, conversations, credentials, definitions, fork/rewind) continues through Rust, which delegates to the sidecar via HTTP instead of stdin. The frontend-to-Rust interface for cold-path operations remains stable so that if the sidecar is replaced with a Rust-native agent in the future, the cold path is unchanged. The hot path would switch from sidecar HTTP+SSE to Rust-native Tauri IPC+events — the `window.postMessage` consumer layer stays the same either way, but the transport setup code (SSE client vs Tauri listeners) would need swapping.

---

## 2. Users and Use Cases

### Users

| User                        | Context                                                | Current Pain                                                                                  |
| --------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Developer using Orbit       | Sending messages, waiting for agent responses          | First-token delay, opaque "agent not responding" errors                                       |
| Developer using rewind      | Rewinding conversation to earlier checkpoint           | Rewind triggers 2 sequential stdin writes (fork + file restore), either can timeout           |
| Developer changing settings | Switching model, toggling thinking mode before sending | 2-3 sequential Tauri IPC round-trips before message send (thinking + model + optional effort) |

### Use Cases

**UC-1: Send message with streaming response**

> "I type a message, hit send, and want to see tokens appear immediately."

1. User types message in ChatInput and presses Enter
2. Frontend calls `httpSetConfig()` with batch config (thinking, model, effort, plan, accept) — single HTTP PUT
3. Frontend calls `httpSendMessage()` — single HTTP POST, returns 204 immediately
4. SSE stream delivers `agent_message` events as tokens arrive
5. SSE client transforms events to `window.postMessage({ type: 'agent:chunk', ... })`
6. ChatMessageService RAF-batches tokens into ChatStore
7. Agent completes, SSE delivers `agent_message` with `type: 'result'`
8. SSE client posts `window.postMessage({ type: 'agent:complete', ... })`

**Key property**: Token streaming has exactly 2 serialization boundaries (sidecar JSON.stringify → frontend JSON.parse). No Rust process in the path.

**UC-2: Permission request during tool execution**

> "The agent wants to run `rm -rf`, I need to approve or deny before it continues."

1. Agent reaches a tool call requiring permission
2. Sidecar emits `permission_request` event via SSE
3. SSE client posts `window.postMessage({ type: 'permission:request', ... })`
4. ToolStore shows permission dialog
5. User clicks Approve
6. Frontend calls `httpRespondPermission()` — HTTP POST to sidecar
7. Sidecar resolves the pending promise, tool execution continues
8. SSE delivers `agent_message` with `type: 'tool_use'` and `status: 'success'`

**Key property**: Permission request→response round-trip bypasses Rust entirely. The blocking promise in the sidecar (`permissionResolvers` Map) is resolved directly by the HTTP handler.

**UC-3: Session creation and conversation persistence (cold path)**

> "I open Orbit and start a new conversation. My messages are saved to disk."

1. User opens Orbit, types first message
2. `ensureSession()` calls `agentCreateSession()` via Tauri IPC → Rust → HTTP POST to sidecar
3. Sidecar creates SDK session, emits `session_init` via SSE
4. Rust's `SessionManager` tracks the session in `active_sessions: HashSet<String>`
5. `conversationCreate()` via Tauri IPC writes JSONL to disk (Rust-native, no sidecar)
6. Streaming response arrives via SSE (UC-1 flow)
7. `conversationAddMessage()` via Tauri IPC persists messages to JSONL

**Key property**: Session lifecycle and conversation persistence go through Rust. Only streaming bypasses it.

**UC-4: Interrupt agent execution**

> "The agent is writing too much code, I hit Stop."

1. User clicks Stop button during active streaming
2. Frontend immediately sets `isAgentRunning = false` and `stopPending = true` in ChatStore (optimistic UI — no round-trip)
3. Frontend calls `httpInterrupt()` — HTTP POST to sidecar
4. Sidecar cancels current SDK query via `AbortController`
5. SDK stream ends — sidecar may emit a final `agent_message` with `type: 'result'` (if the SDK sends one), or the stream simply completes
6. Frontend's ChatMessageService handles the `result` event normally (or the turn ends without one — `stopPending` already cleared the running state)

**Key property**: The frontend does NOT wait for a server-side `turn_cancel` event. Stop is optimistic: the UI updates immediately on click. The HTTP POST is fire-and-forget. The sidecar's `AgentMessage` type does not include `turn_cancel` — the 5 valid types are `text | thinking | tool_use | result | error`.

**UC-5: Auth error recovery (failure recovery)**

Two distinct credential flows exist. The spec must handle both.

**UC-5a: OAuth token refresh failure (sidecar-owned)**

> "My OAuth token expires mid-conversation."

1. Sidecar's `refreshIfNeeded()` (in `credentials.ts`) detects token expiry with 5-minute buffer
2. Sidecar attempts Keychain refresh via `getOAuthTokenFromKeychain()` — this happens inside the sidecar, not Rust
3. If refresh fails, sidecar emits `auth_error` via SSE with `category: 'REFRESH_FAILED'`, `recoverable: true`
4. SSE client calls `useAuthStore.getState().setExpired(...)` and shows classified error toast
5. Sidecar's auto-refresh scheduler (`scheduleAutoRefresh()`) retries periodically
6. When a later refresh succeeds, sidecar emits `auth_error` with `category: 'AUTH_RECOVERED'`
7. SSE client calls `useAuthStore.getState().setRecovered(...)` and shows success toast

**Key property**: OAuth token lifecycle is entirely sidecar-owned. Rust has no role in OAuth refresh. The three auth error categories the sidecar emits are `NO_CREDENTIALS`, `REFRESH_FAILED`, and `AUTH_RECOVERED` (not `TOKEN_EXPIRED` or `INVALID_TOKEN`).

**UC-5b: API key update (Rust-owned)**

> "I paste a new API key in Settings."

1. User saves API key in Settings UI
2. `store_api_key()` Tauri command encrypts key to `credentials.enc` on disk
3. Rust calls `credential_bridge.push_to_running()` which sends `PUT /credentials` with `{ apiKey: string }` to sidecar
4. Sidecar updates in-memory API key via `UpdateCredentials` handler
5. Next user message uses new API key

**Key property**: API key push is Rust→sidecar. The `/credentials` endpoint only carries `apiKey`. OAuth tokens are never sent over this endpoint.

**UC-6: Rewind to previous checkpoint (backward compatibility)**

> "I want to undo the agent's last action and restore my files."

1. User clicks Rewind button on a message
2. `handleConversationRewind()` calls `agentRewindFiles()` via Tauri IPC → Rust → HTTP POST to sidecar
3. Sidecar restores files to checkpoint state (10s timeout, best-effort)
4. Handler calls `agentForkSessionAt()` via Tauri IPC → Rust → HTTP POST to sidecar
5. Sidecar creates new SDK session with context truncated at target message
6. Handler builds rewound message list and posts `conversation:rewound` window message
7. ChatStore replaces messages with rewound list

**Key property**: Rewind is a cold-path operation. It goes through Rust for session lifecycle management, then Rust delegates to sidecar via HTTP.

**UC-7: Sidecar crash and recovery**

> "The sidecar process dies unexpectedly. The app should detect this and allow me to continue."

1. Sidecar process exits (crash, OOM, signal)
2. SSE connection drops — `ReadableStream` completes or errors
3. SSE client enters RETRYING state, shows "Reconnecting" indicator in StatusBar
4. SSE client's reconnection attempts fail (sidecar is dead)
5. Frontend calls `invoke('agent_notify_sidecar_down')` to inform Rust
6. Rust's `ensure_running()` (triggered by the notification or by any cold-path Tauri command) detects process exit via `try_wait()`
7. Rust respawns sidecar with NEW port + NEW auth token + API key from `credentials.enc` (via `CredentialBridge::inject_at_spawn()`)
8. Rust waits for `/health` to return 200 (poll 500ms, max 30s)
9. Frontend calls `invoke('agent_get_bridge_info')` to get new port + token
10. Frontend calls `configureBridge(newPort, newToken)` to update HTTP client
11. Frontend clears `createdSessions` Set (stale IDs from dead sidecar)
12. SSE client connects to new port with new token
13. User sees toast: "Agent reconnected"
14. User sends next message → `ensureSession()` recreates session (createdSessions was cleared)

**Key property**: Crash recovery requires coordination between frontend and Rust. The frontend detects the failure first (SSE disconnect), notifies Rust, Rust respawns, frontend gets fresh connection info. Auth token is regenerated per spawn (not reused). The `createdSessions` Set in `use-tauri-session.ts` (line 21) MUST be cleared after crash to prevent `ensureSession()` from short-circuiting with a stale session ID.

**Open design choice**: Whether Rust should also run a background watchdog (periodic `try_wait()` poll) or only detect sidecar death reactively. See Open Question #2.

---

## 3. Expected Behavior

### 3.1 Sidecar HTTP Server

The sidecar adds a Hono HTTP server alongside the existing stdin loop. Both transports work simultaneously during migration.

**Server startup:**

- Input: `ORBIT_BRIDGE_PORT` env var (required — Rust picks the port and passes it)
- Input: `ORBIT_BRIDGE_AUTH_TOKEN` env var (UUID generated by Rust at spawn)
- Output: Server listening on `http://127.0.0.1:{port}`
- After server starts, emit the existing `{"type":"ready"}` event on stdout (no payload change — preserves backward compatibility with the current Rust `BridgeEvent::Ready` unit variant in `protocol.rs` line 568)
- Rust already knows the port (it set `ORBIT_BRIDGE_PORT`), so no port communication via stdout is needed
- Rust then polls `GET /health` to confirm the HTTP server is actually accepting connections

**Auth middleware:**

- All routes except `GET /health` and `OPTIONS *` require `Authorization: Bearer {token}` header
- Missing/invalid token returns `401 Unauthorized` with JSON body `{ "error": "Invalid or missing auth token" }`

**CORS middleware** (required — frontend origin differs from sidecar origin):

- The frontend runs from `http://localhost:5176` (dev) or `tauri://localhost` / `http://tauri.localhost` (production Tauri WebView). The sidecar runs on `http://127.0.0.1:{port}`. All requests are cross-origin.
- `OPTIONS` preflight requests must respond `204 No Content` with CORS headers and NO auth check
- Response headers on ALL routes (including non-preflight):
  - `Access-Control-Allow-Origin`: Match against allowlist `['tauri://localhost', 'http://tauri.localhost', 'http://localhost:5176']`. Reflect the matched origin (not `*`, because `Authorization` header requires explicit origin).
  - `Access-Control-Allow-Methods`: `GET, POST, PUT, DELETE, OPTIONS`
  - `Access-Control-Allow-Headers`: `Authorization, Content-Type`
  - `Access-Control-Max-Age`: `86400` (cache preflight for 24h — reduces OPTIONS round-trips)
- SSE endpoint (`GET /events`) also requires CORS headers since `fetch()` is used (not `EventSource`)
- Requests from unlisted origins receive no CORS headers (browser blocks the response)

#### Hot Path Routes (Frontend → Sidecar directly)

| Route                        | Method | Purpose               | Request Body                                                                                                                         | Response                           |
| ---------------------------- | ------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `/sessions/:id/messages`     | POST   | Send message          | `{ message: string, attachments?: AttachmentContentBlock[] }`                                                                        | `204 No Content` (fire-and-forget) |
| `/sessions/:id/interrupt`    | POST   | Stop agent            | None                                                                                                                                 | `200 { success: true }`            |
| `/sessions/:id/permission`   | POST   | Permission response   | `{ requestId: string, decision: 'approve'\|'deny', always?: boolean, answers?: Record<string,string> }`                              | `200 { success: true }`            |
| `/sessions/:id/config`       | PUT    | Batch config          | `{ thinking?: { enabled: boolean, maxTokens?: number }, model?: string, effort?: string, planMode?: boolean, acceptMode?: boolean }` | `200 { success: true }`            |
| `/sessions/:id/browser-tool` | POST   | Browser tool response | `{ requestId: string, success: boolean, result?: unknown, error?: string }`                                                          | `200 { success: true }`            |
| `/events`                    | GET    | SSE stream            | None                                                                                                                                 | `text/event-stream`                |
| `/health`                    | GET    | Health check          | None                                                                                                                                 | `200 { status: "ok" }` (no auth)   |

#### Cold Path Routes (Rust → Sidecar via HTTP)

| Route                   | Method | Purpose              | Request Body                                                 | Response                                                                                                                                                                                    |
| ----------------------- | ------ | -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/sessions`             | POST   | Create session       | `{ sessionId: string, config?: SessionConfig }`              | `200 { success: true }`                                                                                                                                                                     |
| `/sessions/:id`         | DELETE | Delete session       | None                                                         | `200 { success: true }`                                                                                                                                                                     |
| `/sessions/:id/ready`   | GET    | Check ready          | None                                                         | `200 { ready: boolean }`                                                                                                                                                                    |
| `/sessions/:id/sdk-id`  | GET    | Get SDK session ID   | None                                                         | `200 { sdkSessionId: string\|null }`                                                                                                                                                        |
| `/sessions/:id/stored`  | GET    | Get stored session   | None                                                         | `200 { sdkSessionId: string\|null }`                                                                                                                                                        |
| `/sessions/cleanup`     | POST   | Cleanup sessions     | `{ maxAgeDays?: number }`                                    | `200 { cleaned: number }`                                                                                                                                                                   |
| `/sessions/:id/fork`    | POST   | Fork session         | `{ options?: ForkSessionOptions }`                           | `200 { sdkSessionId: string, orbitSessionId?: string }`                                                                                                                                     |
| `/sessions/:id/rewind`  | POST   | Rewind files         | `{ checkpointId: string }`                                   | `200 { success: true }`                                                                                                                                                                     |
| `/sessions/:id/fork-at` | POST   | Fork at message      | `{ atMessageUuid: string }`                                  | `200 { sdkSessionId: string }`                                                                                                                                                              |
| `/agents`               | GET    | List agents          | Query: `workspacePath`                                       | `200 { agents: SubagentDefinition[] }`                                                                                                                                                      |
| `/agents`               | POST   | Create agent         | `{ workspacePath: string, agent: SubagentDefinition }`       | `200 { agent: SubagentDefinition }`                                                                                                                                                         |
| `/agents/:name`         | PUT    | Update agent         | `{ workspacePath: string, agent: SubagentDefinition }`       | `200 { agent: SubagentDefinition }`                                                                                                                                                         |
| `/agents/:name`         | DELETE | Delete agent         | Query: `workspacePath`                                       | `200 { success: true }`                                                                                                                                                                     |
| `/skills`               | GET    | List skills          | Query: `workspacePath`                                       | `200 { skills: SkillDefinition[] }`                                                                                                                                                         |
| `/commands`             | GET    | List commands        | Query: `workspacePath`                                       | `200 { commands: SlashCommandDefinition[] }`                                                                                                                                                |
| `/commands`             | POST   | Create command       | `{ workspacePath: string, command: SlashCommandDefinition }` | `200 { command: SlashCommandDefinition }`                                                                                                                                                   |
| `/commands/:name`       | PUT    | Update command       | `{ workspacePath: string, command: SlashCommandDefinition }` | `200 { command: SlashCommandDefinition }`                                                                                                                                                   |
| `/commands/:name`       | DELETE | Delete command       | Query: `workspacePath, scope`                                | `200 { success: true }`                                                                                                                                                                     |
| `/generate/agent`       | POST   | Generate agent def   | `{ description: string }`                                    | `200 { agent: SubagentDefinition }`                                                                                                                                                         |
| `/generate/command`     | POST   | Generate command def | `{ description: string }`                                    | `200 { command: SlashCommandDefinition }`                                                                                                                                                   |
| `/generate/title`       | POST   | Generate title       | `{ userMessage: string }`                                    | `200 { title: string }`                                                                                                                                                                     |
| `/enhance-bug-report`   | POST   | Enhance bug report   | `{ description: string, messageContent: string }`            | `200 { enhanced: string }` where `enhanced` is a JSON-encoded string containing `{ title: string, body: string }` (matches current sidecar return format consumed by `feedback-dialog.tsx`) |
| `/credentials`          | PUT    | Update credentials   | `{ apiKey?: string }`                                        | `200 { success: true }`                                                                                                                                                                     |
| `/shutdown`             | POST   | Graceful shutdown    | None                                                         | `200 { success: true }`                                                                                                                                                                     |

#### SSE Event Stream

Single endpoint `GET /events` delivers all 10 event types (plus `ready`).

| SSE Event Name         | Payload                                                                                                                                                                                    | When                                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent_message`        | `{ sessionId: string, message: AgentMessage }`                                                                                                                                             | Text/thinking/tool tokens streaming                                                                                                                                                                                                                              |
| `permission_request`   | `{ sessionId: string, toolName: string, toolInput: Record<string,unknown>, requestId: string }`                                                                                            | Tool needs user approval                                                                                                                                                                                                                                         |
| `session_init`         | `{ sessionId: string, sdkSessionId: string, isResumed: boolean, isForked: boolean, contextWindow?: number, model?: string, tools?: string[], mcpServers?: {name:string,status:string}[] }` | SDK session initialized                                                                                                                                                                                                                                          |
| `plan_mode_changed`    | `{ sessionId: string, enabled: boolean }`                                                                                                                                                  | Plan mode toggled                                                                                                                                                                                                                                                |
| `accept_mode_changed`  | `{ sessionId: string, enabled: boolean }`                                                                                                                                                  | Accept mode toggled                                                                                                                                                                                                                                              |
| `error_event`          | `{ message: string, sessionId?: string, stack?: string }`                                                                                                                                  | Session or global error                                                                                                                                                                                                                                          |
| `checkpoint`           | `{ sessionId: string, checkpointId: string }`                                                                                                                                              | File rewind point created                                                                                                                                                                                                                                        |
| `compact_complete`     | `{ sessionId: string }`                                                                                                                                                                    | Context compaction finished                                                                                                                                                                                                                                      |
| `browser_tool_request` | `{ sessionId: string, request: McpToolRequest }`                                                                                                                                           | Browser tool needs frontend execution                                                                                                                                                                                                                            |
| `auth_error`           | `{ sessionId: string, category: 'NO_CREDENTIALS' \| 'REFRESH_FAILED' \| 'AUTH_RECOVERED', message: string, recoverable: boolean }`                                                         | OAuth/credential failure or recovery. These are the 3 categories the sidecar actually emits (verified: `session-manager.ts`). Note: `TOKEN_EXPIRED` and `INVALID_TOKEN` appear in the frontend `AuthErrorEvent` type but are not emitted by the current sidecar. |

SSE protocol:

- `: keepalive\n\n` comment every 15 seconds (prevents connection timeout)
- Each event uses `event:` field + `data:` field per SSE spec
- Note: The `retry:` SSE directive has NO effect because the client uses `fetch()` + `ReadableStream`, not `EventSource`. Reconnection is entirely client-owned (exponential backoff in `agent-sse.ts`). The server MAY include `retry:` for future compatibility if `EventSource` is ever adopted, but it is not a behavioral requirement.

#### SSE Event Subscriptions

The SSE handler subscribes to the same `SessionManager` emitters that currently power stdout events in `index.ts` lines 147-258. No changes to `SessionManager` event emission logic.

| SessionManager Emitter | SSE Event Name         |
| ---------------------- | ---------------------- |
| `onAgentMessage`       | `agent_message`        |
| `onPermissionRequest`  | `permission_request`   |
| `onSessionInit`        | `session_init`         |
| `onPlanModeChanged`    | `plan_mode_changed`    |
| `onAcceptModeChanged`  | `accept_mode_changed`  |
| `onError`              | `error_event`          |
| `onCheckpoint`         | `checkpoint`           |
| `onCompactComplete`    | `compact_complete`     |
| `onBrowserToolRequest` | `browser_tool_request` |
| `onAuthError`          | `auth_error`           |

### 3.2 Rust Backend Changes

#### Sidecar Spawn

Rust generates an ephemeral auth token and finds an available port:

```
1. auth_token = UUID v4
2. port = first available in 4200..4299
3. Spawn sidecar with env vars:
   - ORBIT_BRIDGE_AUTH_TOKEN={auth_token}
   - ORBIT_BRIDGE_PORT={port}
   - CLAUDE_CLI_PATH={cli_path}
   - CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1
   - ANTHROPIC_API_KEY={from credentials.enc via CredentialBridge::inject_at_spawn(), if set}
   - ORBIT_SETTINGS_API_KEY=1 (flag indicating key came from Settings, set by inject_at_spawn)
4. Wait for existing stdout Ready event (no payload change — BridgeEvent::Ready unit variant)
5. Poll GET /health every 500ms until 200 (max 30s)
```

#### New Tauri Commands

`agent_get_bridge_info` — returns `{ port: u16, authToken: String }` to frontend. Blocks until sidecar is healthy (30s timeout).

`agent_notify_sidecar_down` — called by the frontend when SSE reconnection fails repeatedly. Triggers Rust's `ensure_running()` which detects the dead process via `try_wait()`, respawns the sidecar with a new port + token, and waits for `/health`. Returns the new `BridgeInfo` on success. This command is the bridge between frontend failure detection (SSE disconnect) and Rust process management (spawn/health-check).

#### New Frontend Helper

`clearStaleSessions()` — exported from `use-tauri-session.ts`. Clears the module-level `createdSessions` Set (line 21). Called by the SSE client's recovery path after `agent_notify_sidecar_down` succeeds, so that `ensureSession()` will recreate sessions on the next message send instead of short-circuiting with stale IDs.

#### Session Manager Internal Transport

`SessionManager` methods that delegate to the sidecar change from stdin-based IPC to HTTP via `reqwest::Client`:

| Before                                                                 | After                                                      |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| `self.bridge.lock().send_request(&BridgeRequest::CreateSession {...})` | `self.bridge.lock().http_post("/sessions", &json!({...}))` |
| Reader thread + crossbeam channel for events                           | No event relay in Rust (frontend gets events via SSE)      |
| `setup_event_callbacks()` wiring events to `app.emit()`                | Deleted — events go directly from sidecar SSE to frontend  |

#### Credential Push

`credential_bridge.rs::push_to_running()` changes from:

```rust
bridge.send_request(&BridgeRequest::UpdateCredentials { api_key })
```

to:

```rust
bridge.http_put("/credentials", &json!({ "apiKey": api_key }))
```

#### Shutdown

`bridge.rs::shutdown()` changes from stdin write to `POST /shutdown`, with force-kill fallback after 5 seconds.

### 3.3 Frontend Changes

#### New HTTP Client (`agent-http.ts`)

5 exported functions for hot-path operations:

| Function                                                                   | HTTP Call                         | Used By                                               |
| -------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------- |
| `httpSendMessage(sessionId, message, attachments?)`                        | `POST /sessions/:id/messages`     | `agent-sdk-handlers.ts:handleMessageSend`             |
| `httpInterrupt(sessionId)`                                                 | `POST /sessions/:id/interrupt`    | `agent-sdk-handlers.ts:handleAgentStop`               |
| `httpRespondPermission(sessionId, requestId, decision, always?, answers?)` | `POST /sessions/:id/permission`   | `agent-sdk-handlers.ts:handlePermissionResponse`      |
| `httpSetConfig(sessionId, config)`                                         | `PUT /sessions/:id/config`        | `agent-sdk-handlers.ts` (replaces 5 individual calls) |
| `httpBrowserToolResponse(sessionId, response)`                             | `POST /sessions/:id/browser-tool` | `browser-tool-handler.ts`                             |

Plus `configureBridge(port: number, token: string): void` for initialization.

All functions use `fetch()` with:

- `Authorization: Bearer {token}` header
- `Content-Type: application/json`
- Sentry performance span wrapping (preserving existing observability from `core.ts`)

#### New SSE Client (`agent-sse.ts`)

Single exported function:

```typescript
function connectSSE(
  port: number,
  token: string,
  handlers: SSEEventHandlers
): { disconnect: () => void };
```

Uses `fetch()` + `ReadableStream` (not `EventSource`, because `EventSource` does not support custom `Authorization` headers).

Reconnection: exponential backoff starting at 1s, doubling to max 30s, reset on successful connection.

The SSE client replicates the event transformation logic currently in `tauri-provider.tsx` lines 259-663:

| SSE Event                                               | Window Message(s)        | Transformation                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent_message` (type: text)                            | `agent:chunk`            | messageId fallback to `crypto.randomUUID()`, content passthrough                                                                                                                                                                                                                                                                          |
| `agent_message` (type: thinking)                        | `agent:thinking`         | content → thinking field                                                                                                                                                                                                                                                                                                                  |
| `agent_message` (type: tool_use, no status)             | `tool:start`             | toolId fallback to UUID, contentOffset passthrough                                                                                                                                                                                                                                                                                        |
| `agent_message` (type: tool_use, status: success/error) | `tool:end`               | status → boolean success                                                                                                                                                                                                                                                                                                                  |
| `agent_message` (type: result)                          | `agent:complete`         | camelCase → snake_case for usage fields. Note: the sidecar only emits `result`, not `turn_complete` or `turn_cancel`. The frontend `tauri-provider.tsx` has handlers for `turn_complete` and `turn_cancel` but the sidecar never produces them. The SSE client should map `result` → `agent:complete` and not expect the other two types. |
| `agent_message` (type: error)                           | `agent:error`            | content → error                                                                                                                                                                                                                                                                                                                           |
| `permission_request`                                    | `permission:request`     | camelCase → snake_case                                                                                                                                                                                                                                                                                                                    |
| `session_init`                                          | `system:init`            | camelCase → snake_case                                                                                                                                                                                                                                                                                                                    |
| `plan_mode_changed`                                     | `agent:plan_mode`        | passthrough                                                                                                                                                                                                                                                                                                                               |
| `accept_mode_changed`                                   | `agent:accept_mode`      | passthrough                                                                                                                                                                                                                                                                                                                               |
| `error_event`                                           | `agent:error`            | `classifyAgentError()` + AuthStore mutation if auth error                                                                                                                                                                                                                                                                                 |
| `checkpoint`                                            | `agent:checkpoint`       | passthrough                                                                                                                                                                                                                                                                                                                               |
| `compact_complete`                                      | `agent:compact_complete` | passthrough                                                                                                                                                                                                                                                                                                                               |
| `auth_error`                                            | (no window message)      | AuthStore mutation + toast. AUTH_RECOVERED → `setRecovered()` + success toast                                                                                                                                                                                                                                                             |
| `browser_tool_request`                                  | `browser:tool_request`   | passthrough                                                                                                                                                                                                                                                                                                                               |

After transformation, events are delivered via `window.postMessage()` in the exact same format that `ChatMessageService` and downstream consumers already expect. No changes to message consumers.

#### TauriProvider Changes

**Remove** (lines 258-663 in current `tauri-provider.tsx`):

- `onAgentMessage()` listener registration
- `onAgentPermissionRequest()` listener registration
- `onAgentSessionInit()` listener registration
- `onAgentPlanModeChanged()` listener registration
- `onAgentAcceptModeChanged()` listener registration
- `onAgentError()` listener registration
- `onAgentCheckpoint()` listener registration
- `onAgentCompactComplete()` listener registration
- `onAgentAuthError()` listener registration
- `onBrowserToolRequest()` listener registration (from sidecar, not Rust browser plugin)

**Add** (after `bootstrapRuntimeHealth`):

```
1. invoke('agent_get_bridge_info') → { port, authToken }
2. configureBridge(port, authToken)
3. connectSSE(port, authToken, handlers)
```

**Keep** (Rust-native events only):

- `onTerminalOutput()` (line 667) — from Rust PTY, not sidecar
- `onTerminalExit()` (line 688) — from Rust PTY
- `onTerminalForeground()` (line 709) — from Rust PTY
- `onBrowserNavigated()` (line 731) — from Rust WKWebView plugin
- `onBrowserLoading()` (line 751) — from Rust WKWebView plugin

**Remove from same line range** (sidecar-origin, moves to SSE):

- `onBrowserToolRequest()` (line 771) — this is physically in the 666-788 range but is a sidecar event, not a Rust event. It moves to the SSE handler.

#### Agent SDK Handlers Changes

**`agent-sdk-handlers.ts`** — 8 hot-path calls switch from Tauri IPC to HTTP:

| Current Code                                                                                                                          | New Code                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `agentSendMessage(sessionId, message, attachments)`                                                                                   | `httpSendMessage(sessionId, message, attachments)`                                   |
| `agentInterrupt(sessionId)`                                                                                                           | `httpInterrupt(sessionId)`                                                           |
| `agentRespondPermission(requestId, decision, always, answers)`                                                                        | `httpRespondPermission(sessionId, requestId, decision, always, answers)`             |
| `agentSetThinkingMode(...)` + `agentSetModel(...)` + `agentSetEffortLevel(...)` + `agentSetPlanMode(...)` + `agentSetAcceptMode(...)` | Single `httpSetConfig(sessionId, { thinking, model, effort, planMode, acceptMode })` |

#### No Changes Required

| Component                            | Why Unchanged                                      |
| ------------------------------------ | -------------------------------------------------- |
| `chat-message-service.ts`            | Receives `window.postMessage` — transport-agnostic |
| `use-tauri-message-listener.ts`      | Routes window messages — transport-agnostic        |
| All Zustand stores                   | Consume window messages, not transport events      |
| `agent.ts` (existing Tauri wrappers) | Still used for cold-path calls                     |
| `conversation-handlers.ts`           | All conversation ops stay on Tauri IPC             |
| `use-tauri-session.ts`               | `ensureSession()` stays on Tauri IPC → Rust        |
| `session-title-service.ts`           | `generateSessionTitle()` stays on Tauri IPC → Rust |
| Terminal, file, git handlers         | Rust-native operations                             |
| Browser navigation listeners         | From Rust WKWebView plugin                         |
| Agent-bridge `SessionManager`        | Same emitters, dual-subscribed (stdout + SSE)      |
| Agent-bridge `TextEventBatcher`      | Same 16ms batching, events go to SSE               |
| Agent-bridge `BrowserToolBridge`     | Same promise pattern, events go via SSE            |

---

## 4. Acceptance Criteria

### P0: Blocks Release

**AC-1 (P0): Sidecar starts and becomes healthy via HTTP**

- **Input**: `bunx tauri dev` from clean state
- **Action**: App launches, Rust spawns sidecar with port + token env vars
- **Expected output**: `GET http://127.0.0.1:{port}/health` returns `200 { status: "ok" }` within 30 seconds. `invoke('agent_get_bridge_info')` returns `{ port: number, authToken: string }`.

**AC-2 (P0): Message send via HTTP produces streaming response via SSE**

- **Input**: Active session, user sends "Say hello"
- **Action**: Frontend calls `httpSendMessage()`, SSE stream connected
- **Expected output**: SSE delivers one or more `agent_message` events with `type: 'text'`. ChatStore shows streaming text. SSE delivers `agent_message` with `type: 'result'` containing `usage` object.

**AC-3 (P0): Permission dialog works via HTTP+SSE**

- **Input**: Agent invokes a tool requiring permission (e.g., Bash with `rm`)
- **Action**: SSE delivers `permission_request` event. User clicks Approve. Frontend calls `httpRespondPermission()`.
- **Expected output**: Sidecar's blocked promise resolves. Tool executes. SSE delivers `agent_message` with `type: 'tool_use'` and `status: 'success'` or `'error'`.

**AC-4 (P0): Interrupt stops agent via HTTP**

- **Input**: Agent is actively streaming a response
- **Action**: User clicks Stop button
- **Expected output**: ChatStore `isAgentRunning` becomes false immediately (optimistic). `httpInterrupt()` sends HTTP POST. Sidecar cancels query. Streaming ceases within 1 second. No `turn_cancel` event expected — the sidecar's AgentMessage types are `text | thinking | tool_use | result | error` only.

**AC-5 (P0): Session creation stays on Tauri IPC through Rust**

- **Input**: User sends first message (no active session)
- **Action**: `ensureSession()` calls `agentCreateSession()` via Tauri IPC
- **Expected output**: Rust's `SessionManager` delegates to sidecar via HTTP POST `/sessions`. Session is tracked in `active_sessions` HashSet. SSE delivers `session_init` event.

**AC-6 (P0): Conversation persistence stays on Tauri IPC**

- **Input**: Agent completes a response
- **Action**: `conversationAddMessage()` called via Tauri IPC
- **Expected output**: Message persisted to JSONL file on disk via Rust `ConversationManager`. No HTTP calls for conversation operations.

**AC-7 (P0): API-key credentials stay in Rust**

- **Input**: User saves API key in Settings
- **Action**: `store_api_key()` Tauri command encrypts + saves to disk, then calls `session_manager.update_credentials()` which delegates to sidecar via `PUT /credentials`
- **Expected output**: Sidecar receives updated API key. Next message uses new credentials.

**AC-8 (P0): Auth error recovery via SSE**

- **Input**: OAuth token refresh fails during agent execution
- **Action**: SSE delivers `auth_error` with `category: 'REFRESH_FAILED'`, `recoverable: true`
- **Expected output**: AuthStore transitions to expired state. Error toast shown with classified description. Sidecar's internal `scheduleAutoRefresh()` retries. On success, SSE delivers `auth_error` with `category: 'AUTH_RECOVERED'`. AuthStore transitions to recovered state. Success toast shown. The three valid auth error categories are `NO_CREDENTIALS`, `REFRESH_FAILED`, and `AUTH_RECOVERED`.

**AC-9 (P0): CSP permits HTTP+SSE to localhost**

- **Input**: Production build (`bunx tauri build`)
- **Action**: Frontend attempts `fetch('http://127.0.0.1:{port}/...')` and SSE connection
- **Expected output**: No CSP violation. Verified: `tauri.conf.json` line 40 `connect-src` already includes `http://127.0.0.1:*`.

**AC-10 (P0): CORS preflight works for all hot-path routes**

- **Input**: Frontend running at `http://localhost:5176` (dev) or `tauri://localhost` (prod)
- **Action**: `fetch()` to `http://127.0.0.1:{port}/sessions/:id/messages` with `Authorization` header
- **Expected output**: Browser sends `OPTIONS` preflight first. Sidecar responds `204` with `Access-Control-Allow-Origin: {requesting origin}`, `Access-Control-Allow-Headers: Authorization, Content-Type`, `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`. No auth check on `OPTIONS`. Subsequent POST succeeds with CORS headers in response.

**AC-11 (P0): All quality gates pass**

- **Input**: Complete implementation
- **Action**: Run `./scripts/lint-all.sh && cargo check && cd agent-bridge && bun test`
- **Expected output**: Zero errors, zero warnings. TypeScript compiles. ESLint passes. Clippy passes. All existing tests pass.

**AC-12 (P0): Transport-level integration tests exist**

- **Input**: New test files for HTTP+SSE transport
- **Action**: Run `cd agent-bridge && bun test`
- **Expected output**: Tests verify: (1) auth middleware rejects missing/invalid tokens, (2) CORS preflight returns correct headers, (3) SSE stream delivers events in correct format, (4) SSE reconnection works after server restart, (5) cold-path Rust→HTTP delegation round-trips correctly.

### P1: Core Experience

**AC-13 (P1): Batch config replaces 2-3 sequential IPC calls at send time**

- **Input**: User has thinking=on, model=opus, effort=high
- **Action**: User sends message — `httpSetConfig()` called once before `httpSendMessage()`
- **Expected output**: Single HTTP PUT to `/sessions/:id/config` with applicable settings. No Tauri IPC for config pre-flight. Note: immediate mode/model changes triggered from Settings UI (outside send flow) still use individual Tauri IPC calls through the cold path — only the pre-send batch moves to HTTP.

**AC-14 (P1): SSE reconnects on disconnect**

- **Input**: SSE connection established and receiving events
- **Action**: Network interruption or sidecar restart
- **Expected output**: SSE client detects disconnect, attempts reconnection with exponential backoff (1s, 2s, 4s, ..., 30s max). On success, events resume.

**AC-14a (P1): Full crash recovery — sidecar death and respawn**

- **Input**: Active session with SSE connected. Sidecar process killed.
- **Action**: SSE client detects disconnect, reconnection attempts fail (sidecar is dead). Frontend calls `invoke('agent_notify_sidecar_down')`.
- **Expected output**: Rust detects dead process, respawns with new port+token, waits for `/health`. Command returns new `BridgeInfo`. Frontend calls `configureBridge(newPort, newToken)`, calls `clearStaleSessions()` (exported from `use-tauri-session.ts`), reconnects SSE. User sees "reconnecting" then "reconnected" toast. Next message triggers `ensureSession()` which recreates the session (createdSessions was cleared).

**AC-15 (P1): Rewind works via Rust→sidecar HTTP**

- **Input**: Active session with messages and checkpoints
- **Action**: User clicks Rewind on a message
- **Expected output**: `agentRewindFiles()` via Tauri IPC → Rust → `POST /sessions/:id/rewind` to sidecar. Files restored. `agentForkSessionAt()` via Tauri IPC → Rust → `POST /sessions/:id/fork-at` to sidecar. New session created.

**AC-16 (P1): Browser tool round-trip works across 3 transports**

- **Input**: Agent invokes `browser_click` tool
- **Action**: SSE delivers `browser_tool_request`. Frontend executes in WebKit. Frontend sends result via `httpBrowserToolResponse()`.
- **Expected output**: Sidecar's `BrowserToolBridge` pending promise resolves. Tool execution continues.

**AC-17 (P1): Sentry performance spans preserved**

- **Input**: User sends message via HTTP
- **Action**: `httpSendMessage()` creates Sentry span
- **Expected output**: Sentry dashboard shows `http.post:send_message` spans (replacing previous `tauri.invoke:agent_send_message` spans).

### P2: Can Defer

**AC-18 (P2): Definition CRUD works via Rust→sidecar HTTP**

- **Input**: User creates a custom agent definition
- **Action**: `createAgent()` via Tauri IPC → Rust → `POST /agents` to sidecar
- **Expected output**: Agent definition saved. `listAgents()` returns it.

**AC-19 (P2): Title generation works via Rust→sidecar HTTP**

- **Input**: User sends first message
- **Action**: `generateSessionTitle()` via Tauri IPC → Rust → `POST /generate/title` to sidecar
- **Expected output**: Title generated and persisted to UIStore + JSONL.

**AC-20 (P2): Remove stdin/stdout from sidecar**

- **Input**: All operations working via HTTP
- **Action**: Remove readline loop, sendResponse/sendEvent stdout functions from `index.ts`
- **Expected output**: Sidecar has no stdin/stdout dependency. Main function: create SessionManager → start HTTP server → register SIGTERM handler.

### P3: Nice to Have

**AC-21 (P3): TextEventBatcher interval set to 0 (immediate)**

- **Input**: Frontend RAF batcher handles coalescing
- **Action**: Set batcher interval to 0 in SessionManager
- **Expected output**: Events emitted immediately. First-token latency reduced by 0-16ms.

---

## 5. Non-Functional Requirements

### Performance

| Metric                              | Baseline (current)                                            | Target                | Measurement                                                              |
| ----------------------------------- | ------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------ |
| First-token latency overhead        | ~50-65ms (estimate)                                           | <10ms                 | Sentry span: time from POST /messages to first SSE `agent_message` event |
| Pre-flight config round-trips       | 2-3 sequential IPC calls (thinking + model + optional effort) | 1 HTTP PUT            | Count network requests in DevTools before message send                   |
| Serialization boundaries (hot path) | 5 (JS→stdout→Rust deser→Rust ser→Tauri emit→JS)               | 2 (JS→HTTP→JS)        | Architecture audit                                                       |
| SSE reconnection time               | N/A                                                           | <2s for first attempt | Measure from disconnect to reconnection                                  |
| Sidecar binary size increase        | ~80MB (estimate)                                              | <+5MB from Hono       | `ls -la target/debug/agent-bridge` before and after                      |

### Reliability

| Metric            | Target                  | Measurement                       |
| ----------------- | ----------------------- | --------------------------------- |
| SSE keepalive     | 15s interval            | No connection timeout during idle |
| Health check      | 200 within 30s of spawn | Timeout on startup                |
| Graceful shutdown | Clean exit within 5s    | POST /shutdown → process exit     |
| Crash recovery    | Respawn within 10s      | `check_and_recover()` timing      |

### Security

| Requirement | Implementation                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth token  | Random UUID v4, generated per spawn, passed via env var. Regenerated on every sidecar restart.                                                                                                    |
| Port        | 4200-4299 range (Rust picks), `127.0.0.1` binding only (not `0.0.0.0`)                                                                                                                            |
| Token scope | Ephemeral per sidecar process. Frontend gets fresh token via `agent_get_bridge_info` after respawn.                                                                                               |
| CORS        | Explicit origin allowlist: `tauri://localhost`, `http://tauri.localhost`, `http://localhost:5176`. Reflected origin (not `*`). `OPTIONS` preflight without auth. `Access-Control-Max-Age: 86400`. |
| CSP         | Already allows `http://127.0.0.1:*` in `connect-src` (verified: `tauri.conf.json` line 40)                                                                                                        |
| SSE auth    | Uses `fetch()` with `Authorization` header, not `EventSource` (which cannot send custom headers). CORS applies to SSE.                                                                            |

### Compatibility

| Requirement     | Detail                                                                        |
| --------------- | ----------------------------------------------------------------------------- |
| Backward compat | Stdin/stdout loop stays during migration (removed in AC-18)                   |
| Frontend compat | `window.postMessage` format unchanged — all downstream consumers work         |
| Rust API compat | All 36 Tauri commands keep same signatures — cold-path callers unchanged      |
| Future compat   | Frontend→Rust IPC interface stable for eventual Rust-native agent replacement |

---

## 6. Constraints

| Constraint                                                      | Rationale                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hono for HTTP server                                            | Lightweight, Bun-native, type-safe. No Express/Fastify — overkill for localhost sidecar.                                                                                                                                                                                                                               |
| `fetch()` + `ReadableStream` for SSE client (not `EventSource`) | `EventSource` does not support custom `Authorization` headers                                                                                                                                                                                                                                                          |
| `reqwest` for Rust HTTP client                                  | Already in workspace `Cargo.toml` (line 54). No new dependency required.                                                                                                                                                                                                                                               |
| Port range 4200-4299                                            | Avoids conflicts with common dev ports (3000, 4000, 5173, 5176, 8080)                                                                                                                                                                                                                                                  |
| `127.0.0.1` not `localhost`                                     | `localhost` may resolve to IPv6 `::1` on some systems. `127.0.0.1` is unambiguous.                                                                                                                                                                                                                                     |
| CORS with reflected origin                                      | `Access-Control-Allow-Origin` must reflect the requesting origin from the allowlist, not `*`. Using `*` with `Authorization` header is forbidden by the CORS spec. `OPTIONS` preflight must respond without auth.                                                                                                      |
| Conversations stay in Rust                                      | Disk I/O via `ConversationManager` — no sidecar involvement. 7 Tauri commands.                                                                                                                                                                                                                                         |
| API-key credentials stay in Rust; OAuth is sidecar-owned        | API keys: stored in Rust's encrypted `credentials.enc`, injected at spawn via `CredentialBridge::inject_at_spawn()`, runtime updates pushed via `PUT /credentials`. OAuth: the sidecar reads/refreshes tokens from macOS Keychain directly via `credentials.ts::refreshIfNeeded()`. Rust has no role in OAuth refresh. |
| Session lifecycle stays in Rust                                 | `SessionManager.active_sessions` HashSet for tracking. Future Rust-native agent replaces sidecar, Rust remains orchestrator.                                                                                                                                                                                           |
| No `any` in new TypeScript                                      | ESLint enforced. All HTTP response types explicitly typed.                                                                                                                                                                                                                                                             |
| Structured logging for HTTP client                              | Use `createLogger('AgentHTTP')` and `createLogger('AgentSSE')` per project convention.                                                                                                                                                                                                                                 |

---

## 7. Error Taxonomy

### HTTP Client Errors (Frontend)

| Error                 | Message Template                                             | Recovery                                                               |
| --------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Bridge not configured | `Agent bridge not configured. Call configureBridge() first.` | Ensure `agent_get_bridge_info` is called during TauriProvider init.    |
| HTTP request failed   | `HTTP {method} {path} failed: {status} {statusText}`         | Log error. If 401, token may have expired — trigger sidecar restart.   |
| Network error         | `Network error calling {path}: {error.message}`              | SSE reconnection logic handles this. For one-off requests, show toast. |
| Timeout               | `Request to {path} timed out after {timeoutMs}ms`            | Retry once. If second attempt fails, show toast to user.               |

### SSE Client Errors (Frontend)

| Error                 | Message Template                                            | Recovery                                                         |
| --------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| SSE connection failed | `SSE connection to 127.0.0.1:{port}/events failed: {error}` | Exponential backoff reconnection (1s→2s→4s→8s→16s→30s max).      |
| SSE parse error       | `Failed to parse SSE event: {rawData}`                      | Log and skip malformed event. Do not disconnect.                 |
| SSE auth rejected     | `SSE connection rejected: 401 Unauthorized`                 | Token mismatch. Call `agent_get_bridge_info` to get fresh token. |

### CORS Errors (Frontend)

| Error                   | Message Template                                                 | Recovery                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| CORS preflight rejected | Browser blocks request — no `Access-Control-Allow-Origin` header | Verify sidecar CORS middleware is configured with correct origin allowlist. Check that `OPTIONS` handler exists and does not require auth. |
| Origin not in allowlist | Browser blocks response — origin mismatch                        | Add the requesting origin to the CORS allowlist in sidecar middleware.                                                                     |

### Sidecar HTTP Server Errors

| Error                                     | Status | Message Template                                                | Recovery                                                                                                                                                                             |
| ----------------------------------------- | ------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Invalid auth                              | 401    | `Invalid or missing auth token`                                 | Caller should refresh token via `agent_get_bridge_info`.                                                                                                                             |
| Session not found                         | 404    | `Session {sessionId} not found`                                 | Caller should create session first.                                                                                                                                                  |
| Invalid request body                      | 400    | `Invalid request: {zodErrorMessage}`                            | Fix request payload.                                                                                                                                                                 |
| Unknown permission request                | 200    | (Silent — permission resolver not found for `{requestId}`)      | The sidecar silently drops permission responses for unknown request IDs (`session-manager.ts` line ~2088). Not an HTTP error — the request succeeds, but the response has no effect. |
| Message during rewind                     | 409    | `Session {sessionId} is currently rewinding — message rejected` | Wait for rewind to complete, then retry.                                                                                                                                             |
| Interrupt with no active query            | 200    | (No-op — no query to cancel)                                    | Not an error. The interrupt succeeds vacuously.                                                                                                                                      |
| Browser tool response for missing session | 500    | `Session {sessionId} not found`                                 | Session was deleted or crashed. Log and discard.                                                                                                                                     |
| Internal error                            | 500    | `Internal error: {error.message}`                               | Log on sidecar. Caller should retry or report to user.                                                                                                                               |
| Sidecar not ready                         | 503    | `Service starting up`                                           | Health check should wait.                                                                                                                                                            |

### Rust HTTP Client Errors

| Error                | Message Template                                            | Recovery                              |
| -------------------- | ----------------------------------------------------------- | ------------------------------------- |
| Sidecar unreachable  | `Failed to connect to sidecar at 127.0.0.1:{port}: {error}` | Check process alive. Respawn if dead. |
| Health check timeout | `Sidecar health check timed out after 30s`                  | Kill process and respawn.             |
| Request failed       | `Sidecar HTTP {method} {path} failed: {status}`             | Return error to Tauri command caller. |

---

## 8. Data Contracts

### Frontend Types (New)

```typescript
/** Bridge connection info returned by Rust */
interface BridgeInfo {
  port: number;
  authToken: string;
}

/** Batch config for PUT /sessions/:id/config */
interface SessionConfigBatch {
  thinking?: { enabled: boolean; maxTokens?: number };
  model?: 'haiku' | 'claude-sonnet-4-6' | 'claude-opus-4-6';
  effort?: 'low' | 'medium' | 'high' | 'max';
  planMode?: boolean;
  acceptMode?: boolean;
}

/** Permission response (needs sessionId for route path) */
interface PermissionResponseRequest {
  sessionId: string;
  requestId: string;
  decision: 'approve' | 'deny';
  always?: boolean;
  answers?: Record<string, string>;
}

/** SSE event handler callbacks */
interface SSEEventHandlers {
  onAgentMessage: (data: { sessionId: string; message: AgentMessage }) => void;
  onPermissionRequest: (data: PermissionRequestEvent) => void;
  onSessionInit: (data: SessionInitEvent) => void;
  onPlanModeChanged: (data: ModeChangedEvent) => void;
  onAcceptModeChanged: (data: ModeChangedEvent) => void;
  onError: (data: AgentErrorEvent) => void;
  onCheckpoint: (data: CheckpointEvent) => void;
  onCompactComplete: (data: CompactCompleteEvent) => void;
  onAuthError: (data: AuthErrorEvent) => void;
  onBrowserToolRequest: (data: { sessionId: string; request: McpToolRequest }) => void;
}

/** SSE connection handle */
interface SSEConnection {
  disconnect: () => void;
}
```

All existing types (`AgentMessage`, `PermissionRequestEvent`, `SessionInitEvent`, `ModeChangedEvent`, `AgentErrorEvent`, `CheckpointEvent`, `CompactCompleteEvent`, `AuthErrorEvent`) remain unchanged — imported from existing `agent.ts`.

### Existing Types (Unchanged)

The following types from `apps/agent/src/lib/api/agent.ts` lines 13-190 are reused without modification: `SessionConfig`, `AttachmentContentBlock`, `AgentMessage`, `ToolMetadata`, `PermissionRequestEvent`, `SessionInitEvent`, `ModeChangedEvent`, `AgentErrorEvent`, `CheckpointEvent`, `AuthErrorEvent`, `SubagentDefinition`, `SlashCommandDefinition`, `SkillDefinition`, `ForkSessionOptions`, `ForkSessionResult`.

### SSE Client State Machine

```
                    ┌─────────────┐
                    │ DISCONNECTED │
                    └──────┬──────┘
                           │ connectSSE() called
                           ▼
                    ┌─────────────┐
          ┌────────│ CONNECTING   │────────┐
          │        └──────┬──────┘        │
          │               │ 200 OK        │ non-200 or network error
          │               ▼               ▼
          │        ┌─────────────┐  ┌───────────┐
          │        │  CONNECTED  │  │ RETRYING  │
          │        └──────┬──────┘  └─────┬─────┘
          │               │               │ backoff elapsed
          │               │ stream ends   │
          │               │ or error      ▼
          │               └──────►  ┌───────────┐
          │                        │ RETRYING  │──► (loop back to CONNECTING)
          │                        └───────────┘
          │
          │ disconnect() called (from any state)
          ▼
   ┌─────────────┐
   │ DISCONNECTED │
   └─────────────┘
```

### Rust Types (New)

```rust
/// Bridge connection info for frontend
#[derive(serde::Serialize)]
pub struct BridgeInfo {
    pub port: u16,
    #[serde(rename = "authToken")]
    pub auth_token: String,
}
```

---

## 9. Out of Scope

| Item                                        | Why Deferred                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| WebSocket transport                         | SSE is simpler and sufficient for server→client streaming. Revisit only if bidirectional streaming is needed. |
| Multi-sidecar / multi-window                | Current architecture: one sidecar per Orbit instance. Multi-window would need shared port.                    |
| HTTP/2 or HTTP/3                            | Localhost communication. HTTP/1.1 is sufficient.                                                              |
| gRPC                                        | Adds protobuf dependency. JSON over HTTP is simpler for the same localhost scenario.                          |
| Remove stdin/stdout from sidecar at Phase 0 | Both transports coexist during migration. Cleanup is AC-20 (P2).                                              |
| Frontend service worker for SSE             | Direct fetch+ReadableStream is simpler. Service worker adds lifecycle complexity.                             |
| iOS sidecar support                         | iOS does not support spawning sidecar processes. Separate architecture needed.                                |
| Rust-native agent replacement               | This migration preserves the Rust interface for future native agent. Implementation is a separate project.    |
| Session multiplexing over single SSE        | All events go through one `/events` endpoint. Session filtering is done client-side.                          |

---

## 10. Risks and Mitigations

| Risk                                                                                                      | Likelihood | Impact | Mitigation                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Port collision** — Multiple Orbit instances race for ports                                              | Medium     | Medium | Scan 4200-4299 with `bind()` check. If all taken, fail with clear error.                                                                                        |
| **SSE reconnection race** — Frontend reconnects while Rust is respawning sidecar                          | Medium     | High   | SSE client retries with backoff. Rust health check blocks until sidecar is ready. Frontend shows "reconnecting" state.                                          |
| **Event ordering** — SSE events arrive in different order than stdin events did                           | Low        | High   | Sidecar emits events in same order via same emitters. SSE is TCP-ordered. No reordering possible on localhost.                                                  |
| **Binary size regression** — Hono adds unexpected weight to compiled Bun binary                           | Low        | Low    | Hono core is ~30KB. Measure before/after. If >5MB increase, investigate tree-shaking.                                                                           |
| **Dual-transport confusion** — Developers unsure which transport a call uses                              | Medium     | Medium | Document in code: `// HOT PATH: direct HTTP` vs `// COLD PATH: Tauri IPC → Rust → HTTP`.                                                                        |
| **CORS preflight on every hot-path request** — Browser sends OPTIONS before each POST with custom headers | High       | Medium | Set `Access-Control-Max-Age: 86400` to cache preflight for 24h. Verify Tauri's WKWebView respects this (WebKit has a 10-minute cap per spec).                   |
| **Stale session IDs after crash** — `createdSessions` Set prevents session recreation                     | High       | High   | Clear `createdSessions` Set when SSE connection is lost. Alternatively, add a `clearStaleSessions()` export from `use-tauri-session.ts` called during recovery. |
| **Token leak in DevTools** — Auth token visible in Network tab                                            | Medium     | Low    | Localhost-only, ephemeral per session. Acceptable risk for desktop app.                                                                                         |
| **reqwest dependency conflict** — Adding reqwest to src-tauri may conflict with existing deps             | Low        | Medium | reqwest already in workspace Cargo.toml. Use workspace dependency.                                                                                              |
| **Stdin removal breaks agent-bridge tests** — Integration tests use stdin/stdout protocol                 | High       | High   | Rewrite tests to use HTTP before removing stdin (AC-18). Tests must pass before cleanup.                                                                        |
| **WKWebView fetch behavior** — Tauri's WKWebView may handle localhost fetch differently                   | Low        | High   | CSP already allows it (verified). Test in production build early.                                                                                               |
| **Thinking block interleaving** — contentOffset calculation depends on TextEventBatcher flush timing      | Medium     | High   | TextEventBatcher logic unchanged. SSE preserves same event ordering. Test with multi-tool responses.                                                            |

---

## 11. Success Metrics

| Metric                                | Baseline (current)                                                                                          | Target (post-launch)                                  | How to Measure                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| First-token latency overhead          | ~50-65ms (estimate)                                                                                         | <10ms                                                 | Sentry span: `http.post:send_message` → first SSE chunk timestamp |
| Pre-flight config calls per message   | 2-3 Tauri IPC calls (thinking + model + optional effort)                                                    | 1 HTTP PUT                                            | DevTools network tab count                                        |
| Rust bridge IPC code removed          | Reader thread, crossbeam channel, stdin/stdout pipes, 10 emit functions, setup_event_callbacks (~380 lines) | 0 lines (all deleted)                                 | `git diff --stat` on bridge.rs + lifecycle.rs after migration     |
| Rust cold-path commands retained      | 36 Tauri commands in lifecycle.rs, 7 in conversations.rs                                                    | 36 + 7 + 2 new (bridge_info + notify_down) = 45 total | Commands stay but internal transport changes from stdin to HTTP   |
| Agent communication failures per week | Unknown — no current telemetry                                                                              | Establish baseline, then <50% of current              | Sentry error count for agent:error events                         |
| Sidecar restart recovery time         | Manual app restart required                                                                                 | <10s automatic recovery                               | Time from crash detection to successful SSE reconnection          |

---

## 12. Open Questions

| #   | Question                                                                             | Default if Unanswered                                                                                                                          | Impact                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Should the SSE stream be per-session (`/sessions/:id/events`) or global (`/events`)? | Global `/events` — simpler, client filters by sessionId                                                                                        | Per-session would reduce unnecessary event parsing but adds connection management complexity                                                                                                                   |
| 2   | Should Rust health-check the sidecar periodically or only on failure?                | Only on failure — frontend SSE disconnect triggers `agent_notify_sidecar_down` which makes Rust check. No background watchdog poll.            | Periodic health checks add background load but catch zombie processes. The default reactive approach means a zombie sidecar (process alive, HTTP dead) would go undetected until the next hot-path call fails. |
| 3   | What should happen when `agent_get_bridge_info` is called before sidecar is ready?   | Block until ready (with 30s timeout, return error after)                                                                                       | Could return immediately with error, forcing frontend to retry                                                                                                                                                 |
| 4   | Should the HTTP client use connection keep-alive or new connections per request?     | Keep-alive (default for fetch and reqwest)                                                                                                     | Keep-alive reduces TCP handshake overhead for sequential requests                                                                                                                                              |
| 5   | Should SSE events include a sequence number for gap detection?                       | No — TCP ordering is sufficient on localhost                                                                                                   | Adding sequence numbers would enable detecting missed events after reconnection                                                                                                                                |
| 6   | When should stdin/stdout be removed from the sidecar?                                | After all operations verified working via HTTP (AC-20, P2)                                                                                     | Removing too early blocks rollback if HTTP has issues                                                                                                                                                          |
| 7   | Should the frontend show a visual indicator while SSE is reconnecting?               | Yes — subtle "reconnecting" status in StatusBar                                                                                                | Helps users understand why agent isn't responding                                                                                                                                                              |
| 8   | **RESOLVED**: Should the auth token be reused or regenerated on sidecar respawn?     | **Regenerated per spawn.** Frontend calls `agent_get_bridge_info` after respawn to get fresh port + token. Old token becomes invalid.          | This was contradictory in Rev 1 (UC-7 said "same token", Section 5 said "regenerated"). Now consistent: always regenerated.                                                                                    |
| 9   | How should immediate mode/model changes (outside send flow) work?                    | Immediate changes from Settings UI continue using individual Tauri IPC calls through the cold path. Only the pre-send batch uses HTTP.         | The 4 immediate handlers in `chat-actions.ts` (lines 571-621) post messages that trigger individual mode/model set calls. These are infrequent (user manually clicks a toggle) so IPC latency is acceptable.   |
| 10  | Should `/sessions/:id/config` validate incompatible setting combinations?            | No server-side validation — trust the frontend. The frontend UI already prevents invalid combinations (e.g., planMode + acceptMode both true). | Server-side validation would duplicate frontend logic and couple the sidecar to UI constraints.                                                                                                                |

---

## Appendix A: Full Inventory

### Frontend Functions Moving to HTTP (Hot Path)

| #   | Function                                        | Current Transport | New Transport    | Status      |
| --- | ----------------------------------------------- | ----------------- | ---------------- | ----------- |
| 1   | `agentSendMessage`                              | Tauri IPC         | HTTP POST        | **Updated** |
| 2   | `agentInterrupt`                                | Tauri IPC         | HTTP POST        | **Updated** |
| 3   | `agentRespondPermission`                        | Tauri IPC         | HTTP POST        | **Updated** |
| 4   | `agentSetThinkingMode`                          | Tauri IPC         | HTTP PUT (batch) | **Updated** |
| 5   | `agentSetModel`                                 | Tauri IPC         | HTTP PUT (batch) | **Updated** |
| 6   | `agentSetPlanMode`                              | Tauri IPC         | HTTP PUT (batch) | **Updated** |
| 7   | `agentSetAcceptMode`                            | Tauri IPC         | HTTP PUT (batch) | **Updated** |
| 8   | `agentSetEffortLevel`                           | Tauri IPC         | HTTP PUT (batch) | **Updated** |
| 9   | `browserToolResponse()` (`browser.ts` line 351) | Tauri IPC         | HTTP POST        | **Updated** |

### Frontend Functions Staying on Tauri IPC (Cold Path)

| #   | Function                    | Tauri Command                       | Rust Delegates to Sidecar? | Status       |
| --- | --------------------------- | ----------------------------------- | -------------------------- | ------------ |
| 1   | `agentCreateSession`        | `agent_create_session`              | Yes, via HTTP              | **Existing** |
| 2   | `agentDeleteSession`        | `agent_delete_session`              | Yes, via HTTP              | **Existing** |
| 3   | `agentIsSessionReady`       | `agent_is_session_ready`            | Yes, via HTTP              | **Existing** |
| 4   | `agentGetSdkSessionId`      | `agent_get_sdk_session_id`          | Yes, via HTTP              | **Existing** |
| 5   | `agentGetStoredSession`     | `agent_get_stored_session`          | Yes, via HTTP              | **Existing** |
| 6   | `agentCleanupSessions`      | `agent_cleanup_sessions`            | Yes, via HTTP              | **Existing** |
| 7   | `agentGetThinkingMode`      | `agent_get_thinking_mode`           | Yes, via HTTP              | **Existing** |
| 8   | `agentGetPlanMode`          | `agent_get_plan_mode`               | Yes, via HTTP              | **Existing** |
| 9   | `agentGetAcceptMode`        | `agent_get_accept_mode`             | Yes, via HTTP              | **Existing** |
| 10  | `agentRewindFiles`          | `agent_rewind_files`                | Yes, via HTTP              | **Existing** |
| 11  | `agentForkSessionAt`        | `agent_fork_session_at`             | Yes, via HTTP              | **Existing** |
| 12  | `forkSession`               | `agent_fork_session`                | Yes, via HTTP              | **Existing** |
| 13  | `listAgents`                | `agent_list_agents`                 | Yes, via HTTP              | **Existing** |
| 14  | `getAgent`                  | `agent_get_agent`                   | Yes, via HTTP              | **Existing** |
| 15  | `createAgent`               | `agent_create_agent`                | Yes, via HTTP              | **Existing** |
| 16  | `updateAgent`               | `agent_update_agent`                | Yes, via HTTP              | **Existing** |
| 17  | `deleteAgent`               | `agent_delete_agent`                | Yes, via HTTP              | **Existing** |
| 18  | `listSkills`                | `agent_list_skills`                 | Yes, via HTTP              | **Existing** |
| 19  | `listCommands`              | `agent_list_commands`               | Yes, via HTTP              | **Existing** |
| 20  | `getCommand`                | `agent_get_command`                 | Yes, via HTTP              | **Existing** |
| 21  | `createCommand`             | `agent_create_command`              | Yes, via HTTP              | **Existing** |
| 22  | `updateCommand`             | `agent_update_command`              | Yes, via HTTP              | **Existing** |
| 23  | `deleteCommand`             | `agent_delete_command`              | Yes, via HTTP              | **Existing** |
| 24  | `generateAgentDefinition`   | `agent_generate_agent_definition`   | Yes, via HTTP              | **Existing** |
| 25  | `generateCommandDefinition` | `agent_generate_command_definition` | Yes, via HTTP              | **Existing** |
| 26  | `generateSessionTitle`      | `agent_generate_title`              | Yes, via HTTP              | **Existing** |
| 27  | `enhanceBugReport`          | `agent_enhance_bug_report`          | Yes, via HTTP              | **Existing** |

### Rust-Native Functions (No Sidecar)

| #   | Function                  | Tauri Command                              | Status       |
| --- | ------------------------- | ------------------------------------------ | ------------ |
| 1   | `conversationCreate`      | `conversation_create`                      | **Existing** |
| 2   | `conversationList`        | `conversation_list`                        | **Existing** |
| 3   | `conversationLoad`        | `conversation_load`                        | **Existing** |
| 4   | `conversationDelete`      | `conversation_delete`                      | **Existing** |
| 5   | `conversationUpdateTitle` | `conversation_update_title`                | **Existing** |
| 6   | `conversationAddMessage`  | `conversation_add_message`                 | **Existing** |
| 7   | `conversationFork`        | `conversation_fork`                        | **Existing** |
| 8   | Credential operations     | `store_api_key`, `retrieve_api_key`, etc.  | **Existing** |
| 9   | Terminal operations       | `terminal_create`, `terminal_write`, etc.  | **Existing** |
| 10  | File operations           | `read_file`, `write_file`, etc.            | **Existing** |
| 11  | Git operations            | `git_status`, `git_commit`, etc.           | **Existing** |
| 12  | Browser operations        | `browser_create`, `browser_navigate`, etc. | **Existing** |

### New Components

| #   | Component                      | Location                                                                                   | Status  |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------ | ------- |
| 1   | Hono HTTP server               | `agent-bridge/src/server/index.ts`                                                         | **New** |
| 2   | Auth middleware                | `agent-bridge/src/server/middleware/auth.ts`                                               | **New** |
| 3   | Hot-path routes                | `agent-bridge/src/server/routes/hot-path.ts`                                               | **New** |
| 4   | Session routes                 | `agent-bridge/src/server/routes/sessions.ts`                                               | **New** |
| 5   | Definition routes              | `agent-bridge/src/server/routes/definitions.ts`                                            | **New** |
| 6   | Operation routes               | `agent-bridge/src/server/routes/operations.ts`                                             | **New** |
| 7   | SSE event route                | `agent-bridge/src/server/routes/events.ts`                                                 | **New** |
| 8   | Frontend HTTP client           | `apps/agent/src/lib/api/agent-http.ts`                                                     | **New** |
| 9   | Frontend SSE client            | `apps/agent/src/lib/api/agent-sse.ts`                                                      | **New** |
| 10  | Rust bridge info command       | `agent_get_bridge_info` in `lifecycle.rs`                                                  | **New** |
| 11  | Rust sidecar-down notification | `agent_notify_sidecar_down` in `lifecycle.rs` — triggers respawn, returns new `BridgeInfo` | **New** |
| 12  | Frontend stale session reset   | `clearStaleSessions()` exported from `use-tauri-session.ts` — clears `createdSessions` Set | **New** |

### Event Listeners Migration

| #   | Event                       | Current Source        | New Source                 | Status                   |
| --- | --------------------------- | --------------------- | -------------------------- | ------------------------ |
| 1   | `agent:message`             | Tauri event from Rust | SSE `agent_message`        | **Updated**              |
| 2   | `agent:permission_request`  | Tauri event from Rust | SSE `permission_request`   | **Updated**              |
| 3   | `agent:session_init`        | Tauri event from Rust | SSE `session_init`         | **Updated**              |
| 4   | `agent:plan_mode_changed`   | Tauri event from Rust | SSE `plan_mode_changed`    | **Updated**              |
| 5   | `agent:accept_mode_changed` | Tauri event from Rust | SSE `accept_mode_changed`  | **Updated**              |
| 6   | `agent:error`               | Tauri event from Rust | SSE `error_event`          | **Updated**              |
| 7   | `agent:checkpoint`          | Tauri event from Rust | SSE `checkpoint`           | **Updated**              |
| 8   | `agent:compact_complete`    | Tauri event from Rust | SSE `compact_complete`     | **Updated**              |
| 9   | `agent:auth_error`          | Tauri event from Rust | SSE `auth_error`           | **Updated**              |
| 10  | `browser:tool_request`      | Tauri event from Rust | SSE `browser_tool_request` | **Updated**              |
| 11  | `terminal:output`           | Tauri event from Rust | Tauri event from Rust      | **Existing** (unchanged) |
| 12  | `terminal:exit`             | Tauri event from Rust | Tauri event from Rust      | **Existing** (unchanged) |
| 13  | `terminal:foreground`       | Tauri event from Rust | Tauri event from Rust      | **Existing** (unchanged) |
| 14  | `browser:navigated`         | Tauri event from Rust | Tauri event from Rust      | **Existing** (unchanged) |
| 15  | `browser:loading`           | Tauri event from Rust | Tauri event from Rust      | **Existing** (unchanged) |

### Rust Code Deletion

| #         | Code                                             | Location                     | Lines (approx)         |
| --------- | ------------------------------------------------ | ---------------------------- | ---------------------- |
| 1         | Reader thread + crossbeam channel                | `bridge.rs`                  | ~80                    |
| 2         | `send_request()` / `send_request_async()`        | `bridge.rs`                  | ~60                    |
| 3         | `set_event_callback()`                           | `bridge.rs` + `session.rs`   | ~10                    |
| 4         | 10 `emit_*` functions                            | `lifecycle.rs` lines 511-643 | ~130                   |
| 5         | `setup_event_callbacks()`                        | `lifecycle.rs` line 646      | ~50                    |
| 6         | `BridgeEvent` enum (if no longer parsed by Rust) | `protocol.rs`                | ~50                    |
| 7         | `crossbeam-channel` dependency                   | `Cargo.toml`                 | 1                      |
| **Total** |                                                  |                              | **~380 lines deleted** |

---

## Appendix B: Glossary

| Term                    | Definition                                                                                                                                                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sidecar**             | The agent-bridge Bun binary (`agent-bridge-aarch64-apple-darwin`). Wraps the Claude Agent SDK. Spawned once by Rust at app startup.                                                                                                                                                    |
| **Hot path**            | The message send → streaming response → tool calls → permissions flow. Latency-critical. Moves to direct HTTP+SSE.                                                                                                                                                                     |
| **Cold path**           | Session lifecycle, definitions CRUD, fork/rewind, title generation. Infrequent. Stays on Tauri IPC → Rust → sidecar HTTP.                                                                                                                                                              |
| **SSE**                 | Server-Sent Events. HTTP-based protocol for server→client streaming. Uses `text/event-stream` content type.                                                                                                                                                                            |
| **TextEventBatcher**    | Sidecar component that accumulates streaming text deltas for 16ms before emitting, reducing ~200 events per response to ~4-8.                                                                                                                                                          |
| **contentOffset**       | Character position in the accumulated text stream where a tool widget should be rendered. Calculated by `TextEventBatcher.getAccumulatedLength()`.                                                                                                                                     |
| **Session remap**       | When the SDK creates a session, it assigns an `sdkSessionId`. The frontend must remap from its temporary UUID to this ID. Triggered by `session_init` event.                                                                                                                           |
| **Permission resolver** | A pending Promise in the sidecar's `SessionManager.permissionResolvers` Map. Blocks tool execution until the user approves or denies.                                                                                                                                                  |
| **BrowserToolBridge**   | Sidecar component that sends browser automation requests to the frontend WebKit view and waits for results via pending Promise.                                                                                                                                                        |
| **ConversationManager** | Rust component in `orbit-conversations` crate. Reads/writes JSONL conversation files to disk. No sidecar involvement.                                                                                                                                                                  |
| **CredentialBridge**    | Rust component in `credential_bridge.rs`. Manages API key synchronization between Rust's encrypted `credentials.enc` file and the running sidecar. Injects API key at spawn via env var, pushes runtime updates via `PUT /credentials`. Does NOT handle OAuth — that is sidecar-owned. |
| **RAF batcher**         | RequestAnimationFrame-based text accumulator in `ChatMessageService`. Coalesces multiple `agent:chunk` window messages into single store updates at 60fps.                                                                                                                             |
