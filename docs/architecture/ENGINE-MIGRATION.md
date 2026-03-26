# Engine Migration: Codex to Rust-Native Backend

> **Status:** Planning
> **Created:** 2026-03-24
> **Replaces:** `agent-bridge/` (Claude SDK sidecar) + `Agent-backend/` (OpenCode engine sidecar)
> **Target directory:** `engine/`

---

## Why

Orbit currently runs **two TypeScript sidecar processes** for AI:

| Sidecar         | What it is               | Language                         | IPC               |
| --------------- | ------------------------ | -------------------------------- | ----------------- |
| `agent-bridge`  | Claude Agent SDK wrapper | TypeScript (compiled Bun binary) | stdin/stdout JSON |
| `Agent-backend` | OpenCode engine fork     | TypeScript (compiled Bun binary) | HTTP + SSE        |

Both are spawned by Tauri at startup and managed as child processes. Every tool call crosses 2 serialization boundaries (Tauri -> JSON -> sidecar -> JSON -> Tauri), adding ~50-100ms of IPC overhead per call. Process lifecycle management (health checks, crash recovery, port scanning) adds complexity and failure modes.

**The engine migration replaces both sidecars with a single Rust-native backend** embedded directly in the Tauri process. The source is OpenAI's open-source [Codex](https://github.com/openai/codex) agent, a production-grade Rust workspace with 50+ crates.

### Benefits

- **Zero IPC overhead** - Direct Rust function calls, no serialization boundaries
- **Single process** - No sidecar spawn, no health checks, no crash recovery
- **Shared memory** - Engine state accessible via `tauri::State<>`, no cross-process coordination
- **Startup time** - No cold start for sidecar binaries (~500ms saved)
- **Tool execution** - Engine can call `crates/common/` directly (fs, git, search, terminal)
- **One codebase** - Unified Rust workspace, one set of dependencies, one build pipeline

---

## Architecture: Before vs After

### Before (Two Sidecars)

```
Frontend (React)
    |
    |-- invoke('agent_*') --> src-tauri --> stdin/stdout JSON --> agent-bridge (Bun)
    |                                                                |
    |                                                          Claude Agent SDK
    |
    |-- invoke('opencode_start') --> src-tauri --> spawn process --> orbit-server (Bun)
    |                                                                    |
    |-- HTTP/SSE via OcSessionService -----------------------------------+
```

### After (In-Process Engine)

```
Frontend (React)
    |
    |-- invoke('engine_*') --> src-tauri/src/commands/engine.rs
                                    |
                                    | direct Rust call
                                    v
                              engine/core (orbit-core)
                              CodexThread::submit(Op) -> EventMsg
                                    |
                                    | tokio channel
                                    v
                              Event Forwarder Task
                                    |
                                    | app_handle.emit()
                                    v
                              Frontend (listen('engine:*'))
```

---

## Engine Directory Structure

The Codex repo is copied to `engine/` at the monorepo root. Internal crates are rebranded from `codex-*` to `orbit-*`.

```
engine/                              # Was: codex-rs/
  core/                            # orbit-core: agent loop, tools, sessions, config, compaction
  protocol/                        # orbit-protocol: Op, EventMsg, wire types, approvals
  connectors/                      # orbit-connectors: LLM provider adapters
  state/                           # orbit-state: SQLite metadata (thread titles, memory jobs)
  hooks/                           # orbit-hooks: lifecycle hooks (session_start, stop, after_tool_use)
  skills/                          # orbit-skills: skill discovery, embedding, remote download
  mcp-server/                      # orbit-mcp-server: expose tools as MCP server
  rmcp-client/                     # orbit-mcp-client: connect to upstream MCP servers
  tui/                             # orbit-tui: ratatui terminal UI (for Orbit CLI / Terminal app)
  app-server/                      # orbit-server: WebSocket JSON-RPC (for CLI/Terminal, not desktop)
  app-server-protocol/             # JSON-RPC v1/v2 schema types
  cli/                             # orbit CLI binary entrypoint
  login/                           # orbit-login: OAuth PKCE flow
  keyring-store/                   # OS keychain credential storage
  execpolicy/                      # per-command allow/deny prefix-rule engine
  linux-sandbox/                   # landlock + seccomp sandboxing
  network-proxy/                   # managed network proxy with audit trail
  cloud-tasks/                     # cloud task execution (async jobs)
  utils/                           # shared utilities (git ghost commits, etc.)
  Cargo.toml                       # engine workspace root
```

### Cargo Workspace Integration

```toml
# Root Cargo.toml
[workspace]
members = [
    "src-tauri",
    "crates/common/*",
    "engine/core",
    "engine/protocol",
    "engine/connectors",
    "engine/state",
    "engine/hooks",
    "engine/skills",
    # ... other engine crates as needed
]

# src-tauri/Cargo.toml
[dependencies]
orbit-core = { path = "../engine/core" }
orbit-protocol = { path = "../engine/protocol" }
```

---

## Codex Feature Inventory: What It Already Provides

### Session System

| Feature               | Implementation                                                        | Location                       |
| --------------------- | --------------------------------------------------------------------- | ------------------------------ |
| Session create/resume | `CodexThread::new()` with `RolloutRecorderParams::Create` or `Resume` | `core/src/codex_thread.rs`     |
| Streaming events      | `EventMsg` enum over async channel (SQ/EQ pattern)                    | `protocol/src/protocol.rs`     |
| Session persistence   | JSONL rollout files at `~/.codex/sessions/rollout-*.jsonl`            | `core/src/rollout/recorder.rs` |
| Session metadata      | SQLite via `codex-state` (titles, timestamps, source)                 | `state/src/lib.rs`             |
| Thread naming         | `Op::SetThreadName`                                                   | `protocol/src/protocol.rs`     |
| Session archiving     | Move to `~/.codex/archived_sessions/`                                 | `core/src/thread_manager.rs`   |

### Tool System

All tools implement the `ToolHandler` async trait. Registered via `ToolRegistry`.

| Tool                        | Handler                     | Purpose                                             |
| --------------------------- | --------------------------- | --------------------------------------------------- |
| `shell`                     | `ShellHandler`              | Execute shell commands with sandbox/approval gating |
| `unified_exec`              | `UnifiedExecHandler`        | Unified shell with background PTY support           |
| `apply_patch`               | `ApplyPatchHandler`         | Apply unified diffs to files                        |
| `read_file`                 | `ReadFileHandler`           | Read file content                                   |
| `list_dir`                  | `ListDirHandler`            | List directory contents                             |
| `grep_files`                | `GrepFilesHandler`          | Ripgrep code search                                 |
| `view_image`                | `ViewImageHandler`          | Embed images into context                           |
| `js_repl`                   | `JsReplHandler`             | JavaScript REPL execution                           |
| `tool_search`               | `ToolSearchHandler`         | BM25 semantic search across tools                   |
| `tool_suggest`              | `ToolSuggestHandler`        | Suggest appropriate tools                           |
| `mcp`                       | `McpHandler`                | Dispatch to upstream MCP servers                    |
| `mcp_resource`              | `McpResourceHandler`        | Read MCP resources                                  |
| `request_user_input`        | `RequestUserInputHandler`   | Structured prompts back to user                     |
| `request_permissions`       | `RequestPermissionsHandler` | Dynamic runtime permission grants                   |
| `plan`                      | `PlanHandler`               | Structured plan display                             |
| `artifacts`                 | `ArtifactsHandler`          | Artifact management                                 |
| `multi_agents/spawn`        | Agent spawn                 | Spawn child agent                                   |
| `multi_agents/wait`         | Agent wait                  | Wait for child completion                           |
| `multi_agents/send_input`   | Agent input                 | Send input to running child                         |
| `multi_agents/close_agent`  | Agent close                 | Terminate child agent                               |
| `multi_agents/resume_agent` | Agent resume                | Resume paused agent                                 |
| `dynamic`                   | `DynamicToolHandler`        | Client-handled tools (escape hatch for browser/iOS) |

Location: `core/src/tools/handlers/`

### Fork & Rewind System

**Codex has a complete, production-ready fork and rewind system with file restoration.**

#### Conversation Forking (Non-Destructive)

| Component                                    | Location                         | Purpose                               |
| -------------------------------------------- | -------------------------------- | ------------------------------------- |
| `fork_thread()`                              | `core/src/thread_manager.rs:489` | Fork session at user message boundary |
| `truncate_rollout_before_nth_user_message()` | `core/src/thread_manager.rs:753` | Truncate conversation history         |
| `forked_from_id`                             | `core/src/rollout/recorder.rs`   | Branch lineage tracking               |

**Flow:**

1. `fork_thread(nth_user_message, rollout_path)` loads the JSONL
2. `truncate_before_nth_user_message()` splices history at the target point
3. `spawn_thread_with_source()` creates a new session with truncated history
4. Original rollout stays on disk (non-destructive)

Tested with multi-level fork scenarios in `core/tests/suite/fork_thread.rs`.

#### File Snapshots & Restore (Git Ghost Commits)

| Component                             | Location                             | Purpose                                          |
| ------------------------------------- | ------------------------------------ | ------------------------------------------------ |
| `GhostSnapshotTask`                   | `core/src/tasks/ghost_snapshot.rs`   | Capture repository state after each turn         |
| `UndoTask`                            | `core/src/tasks/undo.rs`             | Restore files from snapshot                      |
| `GhostCommit`                         | `utils/git/src/lib.rs:41`            | Storage: commit SHA + untracked file metadata    |
| `create_ghost_commit_with_report()`   | `utils/git/src/ghost_commits.rs:302` | Snapshot creation algorithm                      |
| `restore_ghost_commit_with_options()` | `utils/git/src/ghost_commits.rs:432` | File restoration algorithm                       |
| `GhostSnapshotConfig`                 | Config types                         | Tunable thresholds (10 MiB files, 200-file dirs) |

**Flow:**

1. After every agent turn, `GhostSnapshotTask` creates a detached git commit capturing exact repo state
2. Ghost commits store: tracked file state (via git index) + untracked file metadata
3. On `Op::Undo`, `UndoTask` finds the most recent `GhostSnapshot` in rollout history
4. `restore_ghost_commit_with_options()` restores tracked files via `git checkout-index`, cleans up files created after snapshot, preserves untracked files that existed at snapshot time

**Events:** `EventMsg::UndoStarted`, `EventMsg::UndoCompleted`

**Advantages over Claude SDK checkpoint system:**

- Uses git's own object database (deduplication for free)
- No custom file-copy infrastructure or hard-linking
- Handles untracked files via metadata in `GhostCommit` struct
- Configurable thresholds for large file exclusion

### Permission System

Multi-layer, more sophisticated than either current backend:

| Layer             | Mechanism                                                           | Location                       |
| ----------------- | ------------------------------------------------------------------- | ------------------------------ |
| Sandbox policy    | `ReadOnly`, `WorkspaceWrite`, `DangerFullAccess`, `ExternalSandbox` | `protocol/src/config_types.rs` |
| Approval policy   | `UnlessTrusted`, `OnRequest`, `Granular`, `Never`                   | `protocol/src/config_types.rs` |
| Exec policy       | Token-prefix allow/deny rule engine                                 | `execpolicy/` crate            |
| FS sandbox        | Per-path allow/deny with read/write modes                           | `protocol/src/config_types.rs` |
| Network sandbox   | Host+protocol allow/deny rules                                      | `network-proxy/` crate         |
| Guardian subagent | Optional AI-based approval reviewer                                 | `core/src/agent/`              |
| Runtime grants    | `request_permissions` tool for mid-session expansion                | `core/src/tools/handlers/`     |

**Events:** `EventMsg::ExecApprovalRequest`, `EventMsg::PatchApprovalRequest`

### MCP Support (Both Directions)

| Direction                        | Crate         | Transports             |
| -------------------------------- | ------------- | ---------------------- |
| **Client** (connect to external) | `rmcp-client` | stdio, streamable HTTP |
| **Server** (expose own tools)    | `mcp-server`  | stdio (JSON-RPC)       |

Per-server config: `startup_timeout_sec`, `tool_timeout_sec`, `enabled_tools`/`disabled_tools`, OAuth login.

### Multi-Agent System

| Op/Tool                            | Purpose                                                    |
| ---------------------------------- | ---------------------------------------------------------- |
| `multi_agents/spawn`               | Spawn child `CodexThread` with its own config, role, model |
| `multi_agents/wait`                | Block until child completes                                |
| `multi_agents/send_input`          | Send text/items to running child                           |
| `multi_agents/close_agent`         | Terminate child                                            |
| `multi_agents/resume_agent`        | Resume paused agent                                        |
| Agent roles (`agent_roles` config) | Named role configs overriding model, instructions, sandbox |
| `agent_max_depth`                  | Maximum nesting depth                                      |

### Skills System

| Feature     | Details                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------- |
| Scopes      | Repository (`.codex/skills/*.md`), global (`~/.codex/skills/*.md`), system (built-in), remote |
| Invocation  | Implicit (trigger paths match) or explicit (`$skill_name` sigil)                              |
| Metadata    | TOML frontmatter: `name`, `description`, `trigger_paths`, `env_var_dependencies`              |
| Discovery   | `Op::ListSkills`, `Op::ListRemoteSkills`                                                      |
| Live reload | `SkillsChangedNotification` on filesystem change                                              |
| Injection   | Into system prompt as `<skills_instructions>...</skills_instructions>`                        |

### Context Management

| Feature          | Details                                                       |
| ---------------- | ------------------------------------------------------------- |
| Auto-compact     | Triggered mid-turn when context window is near-full           |
| Manual compact   | `Op::Compact`                                                 |
| Compaction paths | Inline (local model summarization) or remote (OpenAI backend) |
| Token counting   | `approx_token_count()` byte-based approximation               |
| Truncation       | `TruncationPolicy` for tool output, history entries           |
| Event            | `EventMsg::ContextCompacted`                                  |

### Config System

Layered TOML (lowest to highest precedence):

1. Built-in defaults
2. Cloud requirements
3. User global: `~/.codex/config.toml`
4. Repository: `<git-root>/.codex/config.toml`
5. Session flags (per-session overrides)

Live reload via `Op::ReloadUserConfig`.

### Auth System

| Mode            | Details                                        |
| --------------- | ---------------------------------------------- |
| API key         | `OPENAI_API_KEY` env var or config             |
| ChatGPT OAuth   | Browser PKCE flow (`codex login`)              |
| Keychain        | macOS Keychain, Windows DPAPI, Linux libsecret |
| MCP server auth | Per-server OAuth via JSON-RPC                  |

### Memories

Cross-session persistent memory with two-phase pipeline. Memory entries persist across conversations and are injected into system prompt for relevant sessions.

### Hooks

Lifecycle hooks: `session_start`, `stop`, `after_tool_use`. Results: `Success`, `FailedContinue`, `FailedAbort`.

### Dynamic Tools (Extension Point)

Tools whose implementation lives outside the engine. When the model calls a dynamic tool, Codex emits `DynamicToolCallRequest` and waits for `Op::DynamicToolResponse`. This is how browser automation and iOS tools plug in without engine modifications.

### Provider System (Current)

| Provider   | API Format          | Auth         |
| ---------- | ------------------- | ------------ |
| `openai`   | Responses API (SSE) | API key      |
| `ollama`   | OpenAI-compatible   | None (local) |
| `lmstudio` | OpenAI-compatible   | None (local) |
| `chatgpt`  | ChatGPT plan auth   | OAuth        |

### Streaming Events (`EventMsg`)

| Event                                                     | Purpose                                          |
| --------------------------------------------------------- | ------------------------------------------------ |
| `TurnStarted`                                             | Turn begins (includes model context window size) |
| `AgentMessageDelta`                                       | Incremental text from model                      |
| `ItemStarted` / `ItemCompleted`                           | Tool call lifecycle                              |
| `ExecCommandOutputDelta`                                  | Streaming shell output                           |
| `FileChangeOutputDelta`                                   | Streaming file edit output                       |
| `TurnComplete`                                            | Turn finished                                    |
| `TurnAborted`                                             | Turn interrupted                                 |
| `ExecApprovalRequest`                                     | User must approve command                        |
| `PatchApprovalRequest`                                    | User must approve file patch                     |
| `RequestUserInput`                                        | Structured user prompt                           |
| `McpToolCallProgress`                                     | MCP tool progress                                |
| `ContextCompacted`                                        | Context summarized                               |
| `HookStarted` / `HookCompleted`                           | Hook lifecycle                                   |
| `PlanDelta`                                               | Plan item update                                 |
| `ReasoningTextDelta`                                      | Reasoning/thinking stream                        |
| `ReasoningSummaryTextDelta` / `ReasoningSummaryPartAdded` | Reasoning summary                                |
| `ModelRerouted`                                           | Model switched mid-turn                          |
| `SkillsChanged`                                           | Skills list changed                              |
| `UndoStarted` / `UndoCompleted`                           | File restore lifecycle                           |
| `ErrorNotification`                                       | Error                                            |
| `DeprecationNotice` / `ConfigWarning`                     | Warnings                                         |

---

## Gap Analysis: What Needs to Be Built

### Gap 1: Anthropic/Claude Connector (Critical Path)

**Effort:** ~1-2 weeks

Codex's entire architecture assumes the OpenAI Responses API format. The Anthropic Messages API is structurally different:

| Aspect       | OpenAI Responses API    | Anthropic Messages API                             |
| ------------ | ----------------------- | -------------------------------------------------- |
| Tool calls   | Response items          | `tool_use` content blocks inside assistant message |
| Tool results | Separate response items | `tool_result` content blocks in user message       |
| Streaming    | SSE with typed events   | SSE with `content_block_delta` events              |
| Thinking     | Not applicable          | `thinking` content blocks with budget tokens       |
| Effort       | Not applicable          | Maps to thinking budget tiers                      |

**What to build in `engine/connectors/`:**

- New `AnthropicConnector` implementing the provider trait
- Anthropic Messages API client with streaming (SSE -> `EventMsg` mapping)
- Tool format translation (engine tools <-> Anthropic `tool_use`/`tool_result` content blocks)
- Extended thinking support (`thinking` content blocks with configurable budget)
- OAuth token management (port macOS Keychain refresh logic from `agent-bridge/src/common/auth/credentials.ts`)

### Gap 2: OpenAI-Compatible Generic Connector

**Effort:** ~days

For OpenRouter, vLLM, and any custom endpoint. Ollama and LM Studio already demonstrate the pattern — different base URL, same API format.

| Provider   | Base URL                       | Auth    | Notes                          |
| ---------- | ------------------------------ | ------- | ------------------------------ |
| OpenRouter | `https://openrouter.ai/api/v1` | API key | Model listing via their API    |
| vLLM       | `http://localhost:8000/v1`     | None    | Local, OpenAI-compatible       |
| Generic    | User-configured                | API key | Any OpenAI-compatible endpoint |

### Gap 3: Tauri Integration Layer

**Effort:** ~1 week

Three components:

#### 3a. `EngineManager` (Managed State)

```rust
pub struct EngineManager {
    sessions: RwLock<HashMap<String, EngineSession>>,
    app_handle: AppHandle,
    config: RwLock<EngineConfig>,
}

struct EngineSession {
    thread: CodexThread,
    event_task: JoinHandle<()>,
    created_at: Instant,
}
```

Registered as `tauri::State<EngineManager>`. Uses `RwLock` (not `Mutex`) because multiple commands read session state concurrently; only create/delete needs exclusive access.

#### 3b. Tauri Commands (Thin Translation)

Each command translates a frontend `invoke()` call into a `CodexThread::submit(Op)`:

| Tauri Command               | Op Submitted                                    |
| --------------------------- | ----------------------------------------------- |
| `engine_create_session`     | Spawn new `CodexThread`                         |
| `engine_send_message`       | `Op::UserMessage { content, attachments }`      |
| `engine_interrupt`          | `Op::Interrupt`                                 |
| `engine_undo`               | `Op::Undo`                                      |
| `engine_fork`               | `ThreadManager::fork_thread()`                  |
| `engine_set_model`          | Config update on thread                         |
| `engine_set_thinking_mode`  | Config update (reasoning effort/budget)         |
| `engine_set_plan_mode`      | Config update (tool restrictions)               |
| `engine_respond_permission` | `Op::ExecCommandApproval` / `Op::PatchApproval` |
| `engine_compact`            | `Op::Compact`                                   |
| `engine_list_skills`        | `Op::ListSkills`                                |
| `engine_list_sessions`      | Read from rollout directory + SQLite            |
| `engine_delete_session`     | Delete rollout + SQLite entry                   |
| `engine_generate_title`     | Call fast model with title prompt               |

#### 3c. Event Forwarder (Background Task)

Per-session tokio task that reads `EventMsg` from the engine's channel and emits Tauri events:

| EventMsg               | Tauri Event                 | Frontend Expects                                                          |
| ---------------------- | --------------------------- | ------------------------------------------------------------------------- |
| `AgentMessageDelta`    | `engine:message`            | `{ type: 'text', content, messageId }`                                    |
| `ReasoningTextDelta`   | `engine:message`            | `{ type: 'thinking', content }`                                           |
| `ItemStarted`          | `engine:message`            | `{ type: 'tool_use', metadata: { toolName, status: 'running' } }`         |
| `ItemCompleted`        | `engine:message`            | `{ type: 'tool_use', metadata: { toolName, status: 'success'/'error' } }` |
| `TurnComplete`         | `engine:message`            | `{ type: 'result', usage }`                                               |
| `ExecApprovalRequest`  | `engine:permission_request` | `{ requestId, toolName, toolInput }`                                      |
| `PatchApprovalRequest` | `engine:permission_request` | `{ requestId, toolName: 'apply_patch', toolInput }`                       |
| `UndoCompleted`        | `engine:undo_complete`      | `{ sessionId }`                                                           |
| `ContextCompacted`     | `engine:compact_complete`   | `{ sessionId }`                                                           |
| `TurnAborted`          | `engine:message`            | `{ type: 'error', content }`                                              |

### Gap 4: Title Auto-Generation

**Effort:** ~50 lines

Call a fast model (Haiku / GPT-4o-mini) with the first user message to generate a short title. Use `Op::SetThreadName` to persist.

### Gap 5: Slash Commands

**Effort:** ~100 lines

Codex has skills (`$` sigil) but not slash commands (`/` sigil). Slash commands are named prompt templates loaded from `.claude/commands/*.md`. Implement as a thin wrapper: parse `/command` syntax, load the markdown file, inject into the user message as context.

### Gap 6: Frontend Adapter

**Effort:** ~days

1. Add `BackendId = 'codex'` to `apps/agent/src/types/backend/adapter.ts`
2. Define `CODEX_CAPABILITIES` constant
3. Create `codex-conversation-repo.ts` implementing `ConversationRepository`
4. Create `codex-ui-bridge.ts` implementing `ConversationUiBridge`
5. Update `TauriProvider` to listen to `engine:*` events
6. Update `BackendStore` to include Codex as selectable backend
7. Eventually: remove Claude and OpenCode adapter paths entirely

---

## Dynamic Tools: Browser & iOS Integration

Browser automation (30+ tools) and iOS simulator (21 tools) currently live in agent-bridge as MCP servers. With the engine, register them as **dynamic tools**:

```rust
fn register_orbit_tools(thread: &mut CodexThread) {
    thread.register_dynamic_tool(DynamicToolSpec {
        name: "browser_snapshot",
        description: "Capture browser page state",
        schema: browser_snapshot_schema(),
    });
    // ... register all browser + iOS tools as dynamic
}
```

When the model calls a dynamic tool:

1. Codex emits `DynamicToolCallRequest` via the event channel
2. The event forwarder maps it to a Tauri event (`engine:tool_request`)
3. The frontend WebKit view (browser) or Appium (iOS) handles it
4. Frontend calls `invoke('engine_tool_response', { requestId, result })`
5. Tauri command submits `Op::DynamicToolResponse` to the thread

Zero engine-core modifications needed.

---

## What Gets Deleted

Once the engine is fully wired and tested:

| Path                                               | Lines (approx) | What it was                                 |
| -------------------------------------------------- | -------------: | ------------------------------------------- |
| `agent-bridge/`                                    |        ~15,000 | Claude SDK sidecar (TypeScript/Bun)         |
| `Agent-backend/`                                   |        ~30,000 | OpenCode engine fork (TypeScript/Bun)       |
| `src-tauri/src/agent/bridge.rs`                    |           ~400 | stdin/stdout IPC framing                    |
| `src-tauri/src/agent/protocol.rs`                  |           ~300 | Duplicate protocol types                    |
| `src-tauri/src/agent/session.rs`                   |           ~200 | Sidecar session wrapper                     |
| `src-tauri/src/opencode/`                          |           ~500 | Sidecar process manager                     |
| `src-tauri/src/commands/opencode/`                 |           ~300 | Sidecar lifecycle commands                  |
| `scripts/build-opencode.ts`                        |           ~100 | Sidecar binary builder                      |
| `apps/agent/src/services/opencode/`                |         ~1,500 | OC HTTP client, SSE manager                 |
| `apps/agent/src/stores/opencode/`                  |           ~800 | OC-specific Zustand stores                  |
| `apps/agent/src/hooks/chat/use-oc-chat-adapter.ts` |           ~300 | OC message transform                        |
| `apps/agent/src/types/backend/`                    |           ~200 | Dual-backend adapter (simplifies to single) |

**Total removed:** ~50,000 lines of TypeScript + supporting Rust

**Total added:** ~1,500 lines of Rust (engine commands + event forwarder + manager)

---

## Build Phases

### Phase 1: Anthropic Connector (~1-2 weeks)

- New connector in `engine/connectors/` for Claude Messages API
- Streaming support (SSE -> `EventMsg` mapping)
- Tool format translation (engine tools <-> Anthropic `tool_use`/`tool_result`)
- Extended thinking support (thinking content blocks)
- OAuth token management (macOS Keychain refresh)
- Test against real Claude API

### Phase 2: Additional Connectors (~days)

- OpenRouter (API key + base URL, OpenAI-compatible)
- vLLM (local, no auth, OpenAI-compatible)
- Generic "any OpenAI-compatible endpoint" connector

### Phase 3: Tauri Embedding (~1 week)

- Add engine crates to workspace `Cargo.toml`
- Implement `EngineManager` with `RwLock<HashMap>` session store
- Implement Tauri commands (thin `Op` translation layer)
- Implement event forwarder (background tokio task per session)
- Wire conversation persistence (rollout JSONL -> `ConversationDto`)
- Wire permission events -> frontend permission UI
- Register browser/iOS as dynamic tools

### Phase 4: Frontend Adapter (~days)

- Add `BackendId = 'codex'` and `CODEX_CAPABILITIES`
- Create `ConversationRepository` and `ConversationUiBridge` implementations
- Update `TauriProvider` event subscriptions
- Title auto-generation
- Slash command support (thin wrapper over skills)

### Phase 5: Cleanup (~days)

- Delete `agent-bridge/`, `Agent-backend/`
- Delete sidecar management code in `src-tauri/`
- Delete OpenCode frontend services/stores/adapters
- Collapse dual-backend adapter into single path
- Update CLAUDE.md, docs, build scripts

---

## Key Files Reference

### Engine (Codex Source)

| File                                      | Purpose                                                             |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `engine/core/src/codex.rs`                | Main agent loop (session, turn, compaction, tool dispatch)          |
| `engine/core/src/codex_thread.rs`         | `CodexThread` — public submission API (SQ/EQ pattern)               |
| `engine/protocol/src/protocol.rs`         | `Op` (all client->agent ops), `EventMsg` (all agent->client events) |
| `engine/protocol/src/config_types.rs`     | Sandbox, approval, web search, personality config                   |
| `engine/protocol/src/approvals.rs`        | Permission model types                                              |
| `engine/core/src/tools/handlers/mod.rs`   | All built-in tool handlers                                          |
| `engine/core/src/tools/registry.rs`       | `ToolRegistry`, `ToolHandler` trait                                 |
| `engine/core/src/rollout/recorder.rs`     | JSONL session recording                                             |
| `engine/core/src/thread_manager.rs`       | Session management, `fork_thread()`                                 |
| `engine/core/src/tasks/ghost_snapshot.rs` | File snapshot after each turn                                       |
| `engine/core/src/tasks/undo.rs`           | File restore from snapshot                                          |
| `engine/utils/git/src/ghost_commits.rs`   | Git ghost commit create/restore algorithms                          |
| `engine/core/src/compact.rs`              | Context compaction logic                                            |
| `engine/core/src/memories/mod.rs`         | Cross-session memory pipeline                                       |
| `engine/core/src/skills/mod.rs`           | Skills system                                                       |
| `engine/core/src/auth.rs`                 | Auth modes (API key + OAuth)                                        |
| `engine/core/src/config/mod.rs`           | Layered config system                                               |
| `engine/connectors/`                      | Provider adapters (extend for Anthropic)                            |
| `engine/app-server/src/transport.rs`      | WebSocket server (for CLI/Terminal, not desktop)                    |

### Tauri Integration (To Be Created)

| File                               | Purpose                                    |
| ---------------------------------- | ------------------------------------------ |
| `src-tauri/src/engine/mod.rs`      | Module root                                |
| `src-tauri/src/engine/manager.rs`  | `EngineManager` struct + session lifecycle |
| `src-tauri/src/engine/events.rs`   | `EventMsg` -> Tauri event forwarder        |
| `src-tauri/src/commands/engine.rs` | All `engine_*` Tauri commands              |

### Frontend (To Be Modified)

| File                                                             | Change                                            |
| ---------------------------------------------------------------- | ------------------------------------------------- |
| `apps/agent/src/types/backend/adapter.ts`                        | Add `'codex'` to `BackendId`, define capabilities |
| `apps/agent/src/providers/tauri-provider.tsx`                    | Subscribe to `engine:*` events                    |
| `apps/agent/src/stores/backend/backend-store.ts`                 | Add Codex as selectable backend                   |
| New: `apps/agent/src/services/engine/codex-conversation-repo.ts` | `ConversationRepository` implementation           |
| New: `apps/agent/src/services/engine/codex-ui-bridge.ts`         | `ConversationUiBridge` implementation             |

---

## Feature Migration Matrix: What We Have vs What Codex Gives vs What To Build

Legend: **HAVE** = we currently ship this | **CODEX** = Codex provides out of the box | **BUILD** = must be built for migration | **UPGRADE** = Codex provides a better version than what we have | **BONUS** = Codex gives us something we never had

### Core Agent Features

| Feature                      | What We Have Today                              | What Codex Gives Out of the Box                        | What Needs Building                                                |
| ---------------------------- | ----------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------ |
| **Session create/resume**    | HAVE: Both backends, JSONL + SQLite             | CODEX: `CodexThread` + rollout JSONL + SQLite metadata | BUILD: Tauri command wrappers (~10 lines each)                     |
| **Message streaming**        | HAVE: stdin/stdout JSON (bridge), HTTP+SSE (OC) | CODEX: `EventMsg` over async channel, zero IPC         | BUILD: Event forwarder (tokio task maps `EventMsg` → Tauri events) |
| **Interrupt/abort**          | HAVE: Both backends                             | CODEX: `Op::Interrupt`                                 | Nothing — direct mapping                                           |
| **Conversation persistence** | HAVE: JSONL (bridge) + SQLite (OC)              | CODEX: JSONL rollout files + SQLite thread index       | BUILD: `ConversationDto` adapter (~200 lines)                      |
| **Session listing/browsing** | HAVE: Sidebar with session list                 | CODEX: `ThreadManager` with list/archive/resume        | BUILD: List command that reads rollout dir + SQLite                |

### Tool System

| Feature                            | What We Have Today                                                             | What Codex Gives Out of the Box                                                         | What Needs Building                                              |
| ---------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Shell execution**                | HAVE: 1 bash tool (bridge), 1 bash tool (OC)                                   | UPGRADE: `ShellHandler` + `UnifiedExecHandler` with full sandbox gating, background PTY | Nothing                                                          |
| **File read**                      | HAVE: Both backends                                                            | CODEX: `ReadFileHandler`                                                                | Nothing                                                          |
| **File write/edit**                | HAVE: Write + Edit tools (bridge), write + edit + multiedit + apply_patch (OC) | CODEX: `ApplyPatchHandler` (unified diff format)                                        | Nothing                                                          |
| **Grep/search**                    | HAVE: Both backends                                                            | CODEX: `GrepFilesHandler`                                                               | Nothing                                                          |
| **Directory listing**              | HAVE: Both backends                                                            | CODEX: `ListDirHandler`                                                                 | Nothing                                                          |
| **Image viewing**                  | HAVE: Both backends                                                            | CODEX: `ViewImageHandler`                                                               | Nothing                                                          |
| **Web search**                     | HAVE: Both backends                                                            | CODEX: Built-in via Responses API (cached/live modes)                                   | Nothing                                                          |
| **Web fetch**                      | HAVE: Both backends                                                            | CODEX: Not built-in as separate tool                                                    | BUILD: Register as tool or use MCP                               |
| **JS REPL**                        | Don't have                                                                     | BONUS: `JsReplHandler` + reset                                                          | Free upgrade                                                     |
| **Tool search**                    | Don't have                                                                     | BONUS: BM25 semantic search across all registered tools                                 | Free upgrade                                                     |
| **Parallel tool calls**            | HAVE: Both backends                                                            | CODEX: `tools/parallel.rs` with `supports_parallel_tool_calls` flag                     | Nothing                                                          |
| **Browser automation (30+ tools)** | HAVE: agent-bridge MCP server → WebKit                                         | CODEX: `DynamicToolHandler` (client-handled)                                            | BUILD: Register as dynamic tools, wire event bridge (~100 lines) |
| **iOS simulator (21 tools)**       | HAVE: agent-bridge MCP server → Appium                                         | CODEX: `DynamicToolHandler` (client-handled)                                            | BUILD: Register as dynamic tools (~50 lines)                     |

### Fork & Rewind

| Feature               | What We Have Today                                                                                                     | What Codex Gives Out of the Box                                                                                                                                        | What Needs Building                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Conversation fork** | HAVE: `forkSessionAt` with complex JSONL truncation + intermediate session + hard-linking (~800 lines in agent-bridge) | UPGRADE: `fork_thread()` — cleaner, reads JSONL, truncates at user message boundary, spawns new thread. Non-destructive. Tested with multi-level forks.                | Nothing                                                                          |
| **File snapshots**    | HAVE: Claude SDK checkpoints in `~/.claude/file-history/` with hard-linking between sessions (~400 lines)              | UPGRADE: `GhostSnapshotTask` — git detached commits after every turn. Free deduplication via git object DB. Handles untracked files. Configurable thresholds.          | Nothing                                                                          |
| **File restore**      | HAVE: `agentRewindFiles(checkpointId)` → SDK file restore                                                              | UPGRADE: `UndoTask` → `restore_ghost_commit_with_options()` — restores via `git checkout-index`, cleans up post-snapshot files, preserves pre-snapshot untracked files | Nothing                                                                          |
| **Branch navigation** | HAVE: `parentUuid` chain + `build_active_uuid_set()` in Rust                                                           | CODEX: `forked_from_id` in rollout metadata                                                                                                                            | BUILD: Map `forked_from_id` → frontend's `parentUuid` chain for sidebar browsing |

### Permission System

| Feature                       | What We Have Today                                   | What Codex Gives Out of the Box                                                                                                      | What Needs Building                                                     |
| ----------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| **Tool approval**             | HAVE: approve/deny (bridge), once/always/reject (OC) | UPGRADE: Multi-layer — sandbox policy + exec policy prefix rules + approval modes + FS sandbox + network sandbox + guardian subagent | Nothing                                                                 |
| **Auto-approve patterns**     | HAVE: `PermissionManager` with always-allow set      | UPGRADE: `execpolicy` crate with token-prefix rule engine                                                                            | Nothing                                                                 |
| **Accept mode**               | HAVE: Claude-specific auto-approve writes            | CODEX: `DangerFullAccess` sandbox mode                                                                                               | BUILD: Map frontend "accept mode" toggle to Codex sandbox policy change |
| **Plan mode**                 | HAVE: Claude-specific read-only tools                | CODEX: `ReadOnly` sandbox mode                                                                                                       | BUILD: Map frontend "plan mode" toggle to Codex sandbox policy change   |
| **Runtime permission grants** | Don't have                                           | BONUS: `request_permissions` tool — agent asks for expanded permissions mid-session                                                  | Free upgrade                                                            |

### Provider & Model System

| Feature                         | What We Have Today                              | What Codex Gives Out of the Box                                 | What Needs Building                                                                                     |
| ------------------------------- | ----------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Claude/Anthropic**            | HAVE: agent-bridge (Claude SDK, full support)   | NOT in Codex                                                    | BUILD: Anthropic connector — Messages API, tool format translation, thinking blocks, OAuth (~1-2 weeks) |
| **OpenAI**                      | HAVE: Agent-backend (via AI SDK)                | CODEX: Native Responses API connector                           | Nothing                                                                                                 |
| **Ollama (local)**              | HAVE: Agent-backend (via AI SDK)                | CODEX: Built-in connector                                       | Nothing                                                                                                 |
| **LM Studio (local)**           | Don't have                                      | BONUS: Built-in connector                                       | Free upgrade                                                                                            |
| **OpenRouter**                  | HAVE: Agent-backend (via AI SDK)                | NOT in Codex                                                    | BUILD: OpenAI-compatible connector with custom base URL (~days)                                         |
| **vLLM (local)**                | Don't have                                      | NOT in Codex                                                    | BUILD: OpenAI-compatible connector (~days)                                                              |
| **Google/Gemini**               | HAVE: Agent-backend (via AI SDK)                | NOT in Codex                                                    | BUILD: Add via generic OpenAI-compatible connector or dedicated                                         |
| **Azure/Bedrock/etc.**          | HAVE: Agent-backend (via AI SDK, 20+ providers) | NOT in Codex                                                    | BUILD: Each needs an OpenAI-compatible or custom connector                                              |
| **Model switching mid-session** | HAVE: Both backends                             | CODEX: Config update on thread                                  | BUILD: Tauri command to update thread config                                                            |
| **Thinking mode**               | HAVE: Claude extended thinking (budget tokens)  | CODEX: `ReasoningEffort` (low/medium/high) + `ReasoningSummary` | BUILD: Map frontend thinking toggle to Codex reasoning config                                           |
| **Effort levels**               | HAVE: Claude adaptive thinking                  | CODEX: `ReasoningEffort` enum                                   | Nothing — direct mapping                                                                                |
| **Model listing**               | HAVE: Per-provider model lists                  | CODEX: `ModelsManager` with caching                             | BUILD: Extend to list models from new providers                                                         |

### Skills, Commands & Extensibility

| Feature            | What We Have Today                                    | What Codex Gives Out of the Box                                                                    | What Needs Building                                                                 |
| ------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Skills**         | HAVE: Read-only from `.claude/skills/*.md`            | UPGRADE: Full system — repo/global/system/remote, trigger paths, `$` sigil, live reload, embedding | Nothing                                                                             |
| **Slash commands** | HAVE: `.claude/commands/*.md` with CRUD               | NOT in Codex (uses `$` sigil skills instead)                                                       | BUILD: Thin `/` sigil parser that loads command `.md` files (~100 lines)            |
| **Custom agents**  | HAVE: `.claude/agents/*.md` with CRUD + AI generation | CODEX: `agent_roles` config (TOML-based role definitions)                                          | BUILD: Bridge `.claude/agents/*.md` format to Codex role config, or migrate to TOML |
| **MCP client**     | HAVE: Both backends                                   | CODEX: `rmcp-client` (stdio + HTTP transports, OAuth, per-server config)                           | Nothing                                                                             |
| **MCP server**     | Don't have                                            | BONUS: `mcp-server` crate — expose Orbit's tools to other MCP clients                              | Free upgrade                                                                        |
| **Hooks**          | HAVE: SDK hooks (PreToolUse, PostToolUse, etc.)       | CODEX: `session_start`, `stop`, `after_tool_use`                                                   | BUILD: Map frontend hook expectations to Codex hook system                          |
| **Memories**       | Don't have                                            | BONUS: Cross-session two-phase memory pipeline                                                     | Free upgrade                                                                        |
| **Dynamic tools**  | Don't have                                            | BONUS: Client-handled tool extension point                                                         | Free upgrade (used for browser/iOS)                                                 |
| **Plugin system**  | HAVE: Agent-backend has `@orbit.build/plugin`         | CODEX: `@` mention plugins (minimal, server-side)                                                  | BUILD: Port or extend plugin system                                                 |

### Context & Session Intelligence

| Feature                | What We Have Today                                      | What Codex Gives Out of the Box                                                     | What Needs Building                                                     |
| ---------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Context compaction** | HAVE: SDK-managed (bridge), AI summarization (OC)       | CODEX: Inline (local model) + remote (API backend), auto-trigger near context limit | Nothing                                                                 |
| **Title generation**   | HAVE: AI-generated (Haiku in bridge, server-side in OC) | CODEX: `Op::SetThreadName` (manual only, no auto-gen)                               | BUILD: Auto-gen function — call fast model on first message (~50 lines) |
| **Session sharing**    | HAVE: Agent-backend supports share URLs                 | CODEX: Not built-in (single-client WebSocket)                                       | Not porting — low priority                                              |
| **Worktree isolation** | HAVE: agent-bridge creates git worktrees per session    | CODEX: Not built-in                                                                 | Not porting initially — low priority                                    |
| **Attachments**        | HAVE: Images (base64), files, terminal output           | CODEX: Content blocks in `Op::UserMessage`                                          | BUILD: Map frontend attachment format to Codex content blocks           |

### Infrastructure & Security

| Feature                | What We Have Today                                  | What Codex Gives Out of the Box                                                                               | What Needs Building                                                  |
| ---------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Process model**      | HAVE: Two sidecar processes (Bun binaries)          | UPGRADE: In-process Rust (zero IPC, shared memory)                                                            | BUILD: Tauri embedding layer (`EngineManager`)                       |
| **Sandbox**            | Don't have (tools run unsandboxed)                  | BONUS: Full sandbox — Landlock (Linux), Seatbelt (macOS), exec policy prefix rules, FS sandbox, network proxy | Free upgrade                                                         |
| **Config system**      | HAVE: Env vars + Keychain (bridge), TOML + env (OC) | UPGRADE: Layered TOML (5 levels: defaults → cloud → global → repo → session) + live reload                    | Nothing                                                              |
| **Auth**               | HAVE: API key + OAuth + Keychain                    | CODEX: API key + OAuth PKCE + Keychain (macOS/Win/Linux)                                                      | BUILD: Port Anthropic OAuth refresh logic                            |
| **Error monitoring**   | HAVE: Sentry in agent-bridge                        | CODEX: Not built-in                                                                                           | BUILD: Add Sentry integration or use Tauri's existing error handling |
| **Credential storage** | HAVE: macOS Keychain only                           | UPGRADE: `keyring-store` — macOS Keychain + Windows DPAPI + Linux libsecret                                   | Nothing                                                              |

### Summary Scorecard

| Category               | Features We Have |  Codex Covers   |                Must Build                |             Bonus (New)             |
| ---------------------- | :--------------: | :-------------: | :--------------------------------------: | :---------------------------------: |
| Core agent             |        5         |       5/5       |           Tauri wrappers only            |                  —                  |
| Tools                  |        12        |      12/12      |       Browser/iOS as dynamic tools       |        JS REPL, tool search         |
| Fork & rewind          |        4         |       4/4       |            Branch nav adapter            |                  —                  |
| Permissions            |        3         |       3/3       |           Mode toggle mapping            |      Runtime grants, guardian       |
| Providers              |        6+        |       3/6       | **Anthropic, OpenRouter, vLLM, generic** |              LM Studio              |
| Skills & extensibility |        6         |       4/6       |      Slash commands, plugin bridge       | MCP server, memories, dynamic tools |
| Context & intelligence |        5         |       3/5       |          Title gen, attachments          |                  —                  |
| Infrastructure         |        4         |       4/4       |             Tauri embedding              |  Sandbox, cross-platform keychain   |
| **Total**              |     **~45**      | **~38 covered** |          **~10 items to build**          |        **~8 free upgrades**         |

**Bottom line:** Codex covers ~85% of features out of the box. The provider system (especially Anthropic) is the critical path. Everything else is thin adapter/mapping code.

---

## Migration Risks

| Risk                                       | Mitigation                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| Anthropic API format mismatch              | Build connector with comprehensive test suite against real API          |
| Engine crate compilation time              | Use `cargo check` during dev; engine crates compile independently       |
| Breaking frontend assumptions              | Run both backends in parallel during migration (engine + agent-bridge)  |
| Ghost commit performance on large repos    | Codex already has configurable thresholds (file size, dir count limits) |
| Config migration (`.claude/` -> `.codex/`) | Support both config directories initially; migrate on first run         |
| OAuth token format differences             | Port existing Keychain logic; test with real OAuth flows                |
