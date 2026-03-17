# Orbit SDK Migration Plan — Replace agent-bridge with Agent-backend

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `agent-bridge/` sidecar (Claude Agent SDK, stdin/stdout pipe, Claude-only) with `Agent-backend/` (opencode fork, HTTP + SSE server, multi-provider) while keeping all existing UI, stores, and components unchanged.

**Architecture:** Agent-backend runs as a standalone Bun HTTP server. The Snowflake React frontend talks to it directly via `fetch()` + `EventSource`. Rust only spawns the process and returns the URL. Everything downstream of the API adapter layer stays identical.

**Tech Stack:** Agent-backend (Bun HTTP server, Hono, Vercel AI SDK, SQLite), Tauri 2 sidecar, EventSource SSE, existing React/Zustand/Tauri frontend.

**Two Products from Agent-backend:**

1. **Orbit Desktop SDK** — HTTP server consumed by Snowflake-v0 desktop app
2. **Orbit CLI** — Rebranded standalone terminal AI coding tool

---

## Phases Overview

```
Phase 0: Discovery        ← CLAUDE.md files for every folder (separate session)
Phase 1: SDK Prep         ← Get Agent-backend running, verify endpoints, add custom routes
Phase 2: Sidecar Setup    ← Rust spawner, health check, URL propagation
Phase 3: Frontend Swap    ← Rewrite API layer + event system in Snowflake
Phase 4: Integration Test ← End-to-end: chat, stream, tools, permissions, rewind
Phase 5: Cleanup          ← Delete agent-bridge, Rust bridge, JSONL crate
```

**Current status:** Phase 0 in progress (MASTER-PROMPT.md created for CLAUDE.md session).

---

## Architecture: Before vs After

```
BEFORE (agent-bridge):
React → invoke('agent_*') → Rust AgentBridge → stdin/stdout pipe → agent-bridge → Claude SDK
       40+ Tauri commands    ~1000 lines         proprietary         Claude-only

AFTER (Agent-backend):
React → fetch() + EventSource → Agent-backend HTTP server → Vercel AI SDK → Any LLM
       Standard HTTP            ~60 lines Rust (spawner)    17+ providers

UNCHANGED (Rust crates — not part of migration):
React → invoke('read_file')    → Rust file system crate
React → invoke('git_*')        → Rust git crate
React → invoke('terminal_*')   → Rust PTY crate
React → invoke('browser_*')    → Rust WKWebView
React → invoke('search_*')     → Rust ripgrep crate
React → invoke('lsp_*')        → Rust LSP crate
React → invoke('get_settings') → Rust settings crate
```

---

## Feature Mapping: agent-bridge → Agent-backend

### Direct Mappings (no custom work needed)

| Current invoke()            | Agent-backend HTTP                       | Notes                          |
| --------------------------- | ---------------------------------------- | ------------------------------ |
| `agent_create_session`      | `POST /session`                          | Returns `Session.Info` with ID |
| `agent_delete_session`      | `DELETE /session/:id`                    | Direct                         |
| `agent_send_message`        | `POST /session/:id/prompt_async`         | Fire-and-forget, SSE events    |
| `agent_interrupt`           | `POST /session/:id/abort`                | Direct                         |
| `agent_respond_permission`  | `POST /permission/:requestID/reply`      | `once`/`always`/`reject`       |
| `agent_fork_session_at`     | `POST /session/:id/fork`                 | `{ messageID }` body           |
| `agent_rewind_files`        | `POST /session/:id/revert`               | Git-snapshot-based             |
| `agent_generate_title`      | **Automatic** — built-in `ensureTitle()` | `session.updated` SSE event    |
| `agent_list_agents`         | `GET /agent`                             | Direct                         |
| `agent_list_skills`         | `GET /skill`                             | Direct                         |
| `agent_list_commands`       | `GET /command`                           | Direct                         |
| `agent_is_session_ready`    | `GET /session/status`                    | Check for `idle`               |
| `agent_get_stored_session`  | `GET /session/:id`                       | SQLite persistence             |
| `conversation_list`         | `GET /session`                           | Sorted by updated              |
| `conversation_load`         | `GET /session/:id/message`               | Full message list              |
| `conversation_delete`       | `DELETE /session/:id`                    | Direct                         |
| `conversation_update_title` | `PATCH /session/:id`                     | `{ title }` body               |
| `conversation_create`       | `POST /session`                          | `{ title? }` body              |

### Adaptation Required (no custom endpoints, different approach)

| Current Feature            | Agent-backend Equivalent        | Adaptation                                     |
| -------------------------- | ------------------------------- | ---------------------------------------------- |
| `agent_set_model`          | Per-message `PromptInput.model` | `{ providerID, modelID }` on each prompt       |
| `agent_set_plan_mode`      | `PromptInput.agent = "plan"`    | Agent selection per-prompt                     |
| `agent_set_accept_mode`    | Permission ruleset on session   | Map to `PermissionNext.Ruleset`                |
| `agent_set_thinking_mode`  | Provider-level config           | Anthropic supports thinking via AI SDK         |
| `agent_set_effort_level`   | Provider-level config           | Anthropic-specific option                      |
| `conversation_add_message` | **Not needed**                  | Agent-backend persists to SQLite automatically |

### Custom Endpoints to Build (in Agent-backend fork)

| Endpoint                   | Purpose                            | Priority |
| -------------------------- | ---------------------------------- | -------- |
| `POST /agent`              | Create agent definition (.md file) | High     |
| `PUT /agent/:name`         | Update agent definition            | High     |
| `DELETE /agent/:name`      | Delete agent definition            | High     |
| `POST /command`            | Create slash command               | High     |
| `PUT /command/:name`       | Update slash command               | High     |
| `DELETE /command/:name`    | Delete slash command               | High     |
| `POST /agent/generate`     | AI-generate agent definition       | Medium   |
| `POST /command/generate`   | AI-generate command definition     | Medium   |
| `POST /enhance-bug-report` | AI-enhance bug report              | Low      |
| Browser tool bridge        | WKWebView ↔ agent tool calls       | Medium   |

### SSE Event Mapping

| Current Tauri Event                | Agent-backend SSE Event      | Translation                                 |
| ---------------------------------- | ---------------------------- | ------------------------------------------- |
| `agent:message` (text)             | `message.part.delta`         | `{ field: "text", delta }`                  |
| `agent:message` (thinking)         | `message.part.delta`         | `{ field: "reasoning", delta }`             |
| `agent:message` (tool_use running) | `message.part.updated`       | `ToolPart.state.type = "running"`           |
| `agent:message` (tool_use done)    | `message.part.updated`       | `ToolPart.state.type = "completed"/"error"` |
| `agent:message` (result)           | `session.status`             | `{ type: "idle" }`                          |
| `agent:message` (error)            | `session.error`              | `{ error: NamedError }`                     |
| `agent:permission_request`         | `permission.asked`           | `PermissionRequest` with `id`, `patterns`   |
| `agent:session_init`               | `session.created`            | `Session.Info` with ID                      |
| `agent:checkpoint`                 | `message.part.updated`       | `SnapshotPart`                              |
| `agent:error`                      | `session.error`              | Direct                                      |
| `agent:ready`                      | `GET /global/health` success | One-time on startup                         |
| `agent:auth_error`                 | HTTP 401 response            | Handle in fetch wrapper                     |

---

## Phase 0: Discovery (CLAUDE.md Pass)

**Status:** In progress
**Session:** Use `Agent-backend/MASTER-PROMPT.md` in a new Claude Code session
**Output:** `CLAUDE.md` file in every folder and subfolder of `Agent-backend/`

This phase produces the knowledge base needed for Phases 1-5. No code changes. Read-only exploration + CLAUDE.md creation.

**Completion criteria:** Every folder in `Agent-backend/` has a `CLAUDE.md` with purpose, key files, usage status (per product), dependencies, and development guide.

---

## Phase 1: SDK Prep (Agent-backend)

> **Work location:** `Agent-backend/` only. Do NOT touch Snowflake-v0 code in this phase.

### 1.1: Verify the server runs standalone

- [ ] Install dependencies: `cd Agent-backend && bun install`
- [ ] Start the server: `cd Agent-backend/packages/opencode && bun run dev`
- [ ] Verify health: `curl http://localhost:<port>/global/health`
- [ ] Verify SSE: `curl -N http://localhost:<port>/event` (should stream heartbeats)
- [ ] Verify session creation: `curl -X POST http://localhost:<port>/session`
- [ ] Verify session list: `curl http://localhost:<port>/session`

### 1.2: Test core chat flow via CLI

- [ ] Start the CLI/TUI: `cd Agent-backend && bun run packages/opencode/src/index.ts tui`
- [ ] Send a message, verify streaming response
- [ ] Verify tool execution (bash, read, write)
- [ ] Verify permission prompts work
- [ ] Verify session persists across restarts (SQLite)
- [ ] Test with Anthropic API key: `export ANTHROPIC_API_KEY=sk-ant-...`

### 1.3: Test fork and revert

- [ ] Create a session, send messages, verify files are written
- [ ] Fork: `curl -X POST http://localhost:<port>/session/:id/fork -d '{"messageID":"..."}'`
- [ ] Revert: `curl -X POST http://localhost:<port>/session/:id/revert -d '{"messageID":"..."}'`
- [ ] Verify file state matches expectations

### 1.4: Build the sidecar binary

- [ ] Build: `cd Agent-backend/packages/opencode && bun run build --single`
- [ ] Verify binary runs: `./dist/opencode-darwin-arm64/bin/opencode serve --help`
- [ ] Verify binary serves: `./dist/opencode-darwin-arm64/bin/opencode serve --port 4096`

### 1.5: Add custom CRUD endpoints

Create new route files (don't modify existing upstream routes):

- [ ] Create `Agent-backend/packages/opencode/src/server/routes/orbit-agent.ts`
  - `POST /agent` — create agent definition (write to `.orbit/agents/{name}.md`)
  - `PUT /agent/:name` — update agent definition
  - `DELETE /agent/:name` — delete agent definition

- [ ] Create `Agent-backend/packages/opencode/src/server/routes/orbit-command.ts`
  - `POST /command` — create command definition
  - `PUT /command/:name` — update command definition
  - `DELETE /command/:name` — delete command definition

- [ ] Register routes in `server.ts` with one import line:

  ```typescript
  import { orbitAgentRoutes } from './routes/orbit-agent';
  import { orbitCommandRoutes } from './routes/orbit-command';
  app.route('/', orbitAgentRoutes);
  app.route('/', orbitCommandRoutes);
  ```

- [ ] Test CRUD via curl

### 1.6: Add AI generation endpoints (optional — can defer)

- [ ] Create `Agent-backend/packages/opencode/src/server/routes/orbit-generate.ts`
  - `POST /agent/generate` — one-shot AI prompt to generate agent markdown
  - `POST /command/generate` — one-shot AI prompt to generate command markdown
  - `POST /enhance-bug-report` — AI-enhance bug report with context

### 1.7: Override the catch-all UI proxy route

The catch-all `/*` route in opencode proxies to `app.opencode.ai`. Override it so it doesn't interfere:

- [ ] Add at the end of route registration (after all other routes):
  ```typescript
  app.all('/*', (c) => c.json({ error: 'Not found' }, 404));
  ```

### 1.8: Verify everything still builds

- [ ] `cd Agent-backend/packages/opencode && bun run build --single`
- [ ] Test the binary with custom endpoints

---

## Phase 2: Sidecar Setup (Snowflake-v0 Rust)

> **Work location:** `src-tauri/` in Snowflake-v0.

### 2.1: Create the Agent-backend sidecar spawner

**Files:**

- Create: `src-tauri/src/opencode/mod.rs` — sidecar spawner + health check
- Create: `src-tauri/src/opencode/client.rs` — Tauri command to expose URL

```rust
// src-tauri/src/opencode/mod.rs
pub mod client;

use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use uuid::Uuid;

pub struct OpencodeServer {
    process: Mutex<Option<Child>>,
    pub url: String,
    pub password: String,
    pub port: u16,
}

impl OpencodeServer {
    pub fn spawn(binary_path: &str, cwd: &str) -> Result<Self, String> {
        let port = portpicker::pick_unused_port()
            .ok_or("Failed to find unused port")?;
        let password = Uuid::new_v4().to_string();

        let child = Command::new(binary_path)
            .args(["serve", "--hostname", "127.0.0.1",
                   "--port", &port.to_string(),
                   "--password", &password])
            .env("OPENCODE_DIR", cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("Failed to spawn opencode: {e}"))?;

        let server = Self {
            process: Mutex::new(Some(child)),
            url: format!("http://127.0.0.1:{port}"),
            password, port,
        };
        server.wait_for_healthy()?;
        Ok(server)
    }

    fn wait_for_healthy(&self) -> Result<(), String> {
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(30);
        let client = reqwest::blocking::Client::new();
        loop {
            if start.elapsed() > timeout {
                return Err("Health check timed out after 30s".into());
            }
            if let Ok(resp) = client
                .get(format!("{}/global/health", self.url))
                .basic_auth("opencode", Some(&self.password))
                .send()
            {
                if resp.status().is_success() { return Ok(()); }
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
    }

    pub fn shutdown(&self) {
        if let Ok(mut guard) = self.process.lock() {
            if let Some(ref mut child) = *guard {
                let _ = child.kill();
                let _ = child.wait();
            }
            *guard = None;
        }
    }
}
```

```rust
// src-tauri/src/opencode/client.rs
use tauri::State;
use super::OpencodeServer;

#[derive(serde::Serialize)]
pub struct ServerInfo { pub url: String, pub password: String }

#[tauri::command]
pub fn get_opencode_server(server: State<'_, OpencodeServer>) -> Result<ServerInfo, String> {
    Ok(ServerInfo { url: server.url.clone(), password: server.password.clone() })
}
```

- [ ] Create `src-tauri/src/opencode/mod.rs`
- [ ] Create `src-tauri/src/opencode/client.rs`
- [ ] Wire into `lib.rs` — spawn on init, register `get_opencode_server` command
- [ ] Update `tauri.conf.json` — add `orbit-sdk` to `externalBin`
- [ ] Create `scripts/build-orbit-sdk.sh` — builds binary from Agent-backend
- [ ] `cargo check` — verify Rust compiles
- [ ] Commit

### 2.2: Create build script

```bash
#!/bin/bash
# scripts/build-orbit-sdk.sh
set -e
cd "$(dirname "$0")/../Agent-backend/packages/opencode"
bun run build --single
cp dist/opencode-darwin-arm64/bin/opencode \
   "$(dirname "$0")/../src-tauri/binaries/orbit-sdk-aarch64-apple-darwin"
echo "Orbit SDK sidecar built"
```

- [ ] Create script
- [ ] Test: `./scripts/build-orbit-sdk.sh`
- [ ] Verify binary exists at `src-tauri/binaries/orbit-sdk-aarch64-apple-darwin`
- [ ] Commit

---

## Phase 3: Frontend Swap (Snowflake-v0 React)

> **Work location:** `apps/agent/src/` in Snowflake-v0. The internal `window.postMessage` protocol is preserved — stores, hooks, and components don't change.

### 3.1: Create the HTTP client

**File:** `apps/agent/src/lib/api/opencode-client.ts`

- [ ] Create typed HTTP client with auth (Basic Auth), GET/POST/PATCH/DELETE helpers
- [ ] Create SSE EventSource factory with auth
- [ ] Create session ID mapping utility (frontend UUID ↔ opencode ULID)
- [ ] Commit

### 3.2: Rewrite agent API layer

**File:** `apps/agent/src/lib/api/agent.ts` — replace all `invoke('agent_*')` with `fetch()`

Keep the same function signatures so callers don't change:

- [ ] Session lifecycle: `agentCreateSession`, `agentDeleteSession`
- [ ] Messaging: `agentSendMessage` → `POST /session/:id/prompt_async`
- [ ] Interrupt: `agentInterrupt` → `POST /session/:id/abort`
- [ ] Permission: `agentRespondPermission` → `POST /permission/:id/reply`
- [ ] Rewind: `agentForkSessionAt` → `POST /session/:id/fork`, `agentRewindFiles` → `POST /session/:id/revert`
- [ ] Mode toggles: become frontend-only state (stored in ToolStore, sent per-prompt)
- [ ] Agent/command/skill listing: `GET /agent`, `GET /command`, `GET /skill`
- [ ] Agent/command CRUD: call custom orbit-agent/orbit-command endpoints
- [ ] `bun run typecheck` — verify compiles
- [ ] Commit

### 3.3: Rewrite conversation API layer

**File:** `apps/agent/src/lib/api/conversations.ts` — replace JSONL Rust commands with Agent-backend session API

- [ ] `conversationList` → `GET /session`
- [ ] `conversationLoad` → `GET /session/:id/message`
- [ ] `conversationDelete` → `DELETE /session/:id`
- [ ] `conversationUpdateTitle` → `PATCH /session/:id`
- [ ] `conversationCreate` → `POST /session`
- [ ] Remove `conversationAddMessage`, `conversationFork` (not needed — Agent-backend persists automatically)
- [ ] Commit

### 3.4: Rewrite TauriProvider event system

**File:** `apps/agent/src/providers/tauri-provider.tsx`

Replace ~12 Tauri agent event listeners with a single SSE `EventSource`. Non-agent listeners (terminal, file, browser, LSP) stay unchanged.

- [ ] Connect to SSE: `opencodeSSE()` → `EventSource`
- [ ] `message.part.delta` → `window.postMessage({ type: 'agent:chunk' })` or `agent:thinking`
- [ ] `message.part.updated` (ToolPart) → `tool:start` or `tool:end`
- [ ] `message.part.updated` (SnapshotPart) → `agent:checkpoint`
- [ ] `session.status` (idle) → `agent:complete`
- [ ] `session.error` → `agent:error`
- [ ] `permission.asked` → `permission:request`
- [ ] `session.created` → `system:init`
- [ ] `session.updated` → `conversation:title_updated`
- [ ] Handle SSE reconnection on disconnect
- [ ] Handle HTTP 401 → auth error toast
- [ ] Keep all non-agent Tauri listeners unchanged
- [ ] `bun run typecheck` — verify compiles
- [ ] Commit

### 3.5: Simplify session management

**File:** `apps/agent/src/hooks/agent/use-tauri-session.ts`

- [ ] Simplify `ensureSession` — opencode persists in SQLite, no stored session lookup needed
- [ ] Remove SDK-specific resume logic (resumeSessionId, resumeSessionAt, forkSession flags)
- [ ] Commit

### 3.6: Adapt conversation handlers

**File:** `apps/agent/src/hooks/agent/handlers/conversation-handlers.ts`

- [ ] Rewrite `handleConversationRewind` — `revert` + `fork` (2 steps instead of 5)
- [ ] Rewrite `handleConversationLoad` — map opencode message format to `ConversationDto`
- [ ] Commit

---

## Phase 4: Integration Test

> **Do NOT proceed to Phase 5 until all tests pass.**

### 4.1: Core chat flow

- [ ] Start Snowflake with `bunx tauri dev`
- [ ] Send a message, verify streaming response appears
- [ ] Verify thinking blocks render (if using Anthropic with thinking enabled)
- [ ] Verify tool execution widgets appear (bash, read, write, edit)
- [ ] Verify tool output renders correctly
- [ ] Verify turn completion (loading spinner stops)

### 4.2: Permission system

- [ ] Trigger a permission-required tool (e.g., bash command)
- [ ] Verify permission dialog appears
- [ ] Approve once — tool executes
- [ ] Approve always — subsequent tools auto-execute
- [ ] Deny — tool shows rejected state

### 4.3: Session management

- [ ] Create new session — verify sidebar updates
- [ ] Switch sessions — verify message history loads
- [ ] Rename session — verify title updates
- [ ] Delete session — verify removal from sidebar
- [ ] Restart app — verify sessions persist (SQLite)

### 4.4: Conversation rewind

- [ ] Send multiple messages with file-modifying tools
- [ ] Rewind to an earlier message
- [ ] Verify files are restored to earlier state
- [ ] Verify new session is created (fork)
- [ ] Verify old session is still browsable in sidebar

### 4.5: Model switching

- [ ] Switch model mid-conversation
- [ ] Send message — verify new model is used
- [ ] Try different providers (Anthropic, OpenAI) if API keys available

### 4.6: Multi-provider (optional)

- [ ] Configure OpenAI: `PUT /auth/openai` with API key
- [ ] Send message with `{ providerID: "openai", modelID: "gpt-4o" }`
- [ ] Verify response streams correctly

---

## Phase 5: Cleanup

> **Only after Phase 4 is fully green.** Keep agent-bridge as fallback until then.

### 5.1: Remove agent-bridge

- [ ] Delete `agent-bridge/` directory
- [ ] Remove from `package.json` workspaces array
- [ ] Remove `bun run build:sidecar` scripts
- [ ] Remove `agent-bridge` from `knip.config.ts` exclusions
- [ ] `bun install` — verify no broken workspace references

### 5.2: Remove Rust agent bridge

- [ ] Delete `src-tauri/src/agent/` (bridge.rs, protocol.rs, session.rs, mod.rs)
- [ ] Remove all `agent_*` command registrations from `src-tauri/src/lib.rs`
- [ ] Remove agent bridge imports and setup from `lib.rs`
- [ ] Remove `src-tauri/src/commands/agent/` directory
- [ ] `cargo check` — verify compiles

### 5.3: Remove JSONL conversation system

- [ ] Delete `crates/common/conversations/` crate
- [ ] Remove from `Cargo.toml` workspace members
- [ ] Remove conversation commands from `src-tauri/src/commands/common/`
- [ ] Remove conversation command registrations from `lib.rs`
- [ ] `cargo check` — verify compiles

### 5.4: Clean up shared schemas

- [ ] Review `packages/shared-schemas/` — remove agent-bridge-specific schemas
- [ ] Keep schemas used by frontend (ModelSchema, ThinkingModeSchema, etc.)
- [ ] `bun run typecheck` — verify compiles

### 5.5: Update documentation

- [ ] Update root `CLAUDE.md` — replace agent-bridge references with Agent-backend
- [ ] Update `src-tauri/CLAUDE.md` — document opencode spawner instead of agent bridge
- [ ] Update `docs/CLAUDE.md` — add Agent-backend to index
- [ ] Remove `agent-bridge/CLAUDE.md` reference from root `CLAUDE.md`

### 5.6: Final verification

- [ ] `cargo check && bun run typecheck && bun run lint`
- [ ] `bunx tauri dev` — full smoke test
- [ ] All Phase 4 integration tests pass again
- [ ] Commit: `chore: remove agent-bridge, Rust bridge, and JSONL conversation system`

---

## How to Add Custom Endpoints (Reference)

When you need a new feature in Agent-backend that the frontend can consume:

### Step 1: Create the route in Agent-backend

```typescript
// Agent-backend/packages/opencode/src/server/routes/orbit-{feature}.ts
import { Hono } from 'hono';

const app = new Hono();

app.post('/my-feature', async (c) => {
  const body = await c.req.json();
  // ... your logic ...
  return c.json({ result: 'done' });
});

export const orbitFeatureRoutes = app;
```

### Step 2: Register in server.ts

```typescript
import { orbitFeatureRoutes } from './routes/orbit-{feature}';
app.route('/', orbitFeatureRoutes);
```

### Step 3: Test in CLI

```bash
cd Agent-backend && bun run packages/opencode/src/index.ts serve --port 4096
curl -X POST http://localhost:4096/my-feature -d '{"input":"test"}'
```

### Step 4: Rebuild the sidecar

```bash
./scripts/build-orbit-sdk.sh
```

### Step 5: Call from frontend

```typescript
// apps/agent/src/lib/api/agent.ts (or new file)
import { opencodePost } from './opencode-client';

export async function myFeature(input: string): Promise<Result> {
  return opencodePost<Result>('/my-feature', { input });
}
```

### Step 6: Wire into UI component

```typescript
// In your React component
const result = await myFeature('test');
```

---

## Risk Assessment

| Risk                                                   | Severity | Mitigation                                         |
| ------------------------------------------------------ | -------- | -------------------------------------------------- |
| Session ID mismatch (UUID vs ULID)                     | High     | Bidirectional map + integration tests              |
| SSE event format differences                           | Medium   | Translation tests per event type                   |
| File revert differs (git snapshots vs SDK checkpoints) | Medium   | End-to-end rewind testing before cleanup           |
| Missing features (effort level, accept mode)           | Low      | Frontend-only state, sent per-prompt               |
| Browser tool integration                               | High     | Design as MCP proxy, implement after core          |
| EventSource auth (no custom headers)                   | Low      | URL-encoded Basic auth or fetch-based SSE polyfill |
| Agent-backend server crash recovery                    | Medium   | Health check polling, auto-restart in Rust spawner |

---

## Files Changed Per Phase

### Phase 1 (Agent-backend only)

- `Agent-backend/packages/opencode/src/server/routes/orbit-agent.ts` (new)
- `Agent-backend/packages/opencode/src/server/routes/orbit-command.ts` (new)
- `Agent-backend/packages/opencode/src/server/routes/orbit-generate.ts` (new)
- `Agent-backend/packages/opencode/src/server/server.ts` (one import line)

### Phase 2 (Rust only)

- `src-tauri/src/opencode/mod.rs` (new — ~60 lines)
- `src-tauri/src/opencode/client.rs` (new — ~15 lines)
- `src-tauri/src/lib.rs` (modify — swap agent bridge for opencode spawner)
- `src-tauri/tauri.conf.json` (modify — externalBin)
- `scripts/build-orbit-sdk.sh` (new)

### Phase 3 (Frontend only — 4 files)

- `apps/agent/src/lib/api/opencode-client.ts` (new)
- `apps/agent/src/lib/api/agent.ts` (rewrite)
- `apps/agent/src/lib/api/conversations.ts` (rewrite)
- `apps/agent/src/providers/tauri-provider.tsx` (rewrite event listeners)
- `apps/agent/src/hooks/agent/use-tauri-session.ts` (simplify)
- `apps/agent/src/hooks/agent/handlers/conversation-handlers.ts` (adapt)

### Phase 5 (Cleanup — deletions)

- `agent-bridge/` (delete entire directory)
- `src-tauri/src/agent/` (delete — bridge.rs, protocol.rs, session.rs)
- `src-tauri/src/commands/agent/` (delete)
- `crates/common/conversations/` (delete)
- ~2500 lines of Rust removed, ~60 lines of Rust added
