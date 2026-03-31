# CLAUDE.md - Orbit Tauri Backend

This file provides guidance to Claude Code when working specifically in the `src-tauri` directory.

> **Parent Documentation:** See [`../CLAUDE.md`](../CLAUDE.md) for monorepo-wide guidance.

---

## Overview

The Tauri backend is the Rust core of Orbit. It provides:

- Desktop app framework (window management, system integration)
- File system operations (read, write, watch)
- Terminal emulation (PTY via portable-pty)
- Git integration (libgit2 wrapper)
- LSP server management
- Agent bridge (Node.js sidecar for Claude SDK)
- Embedded browser (WebKit via Tauri multiwebview)

---

## Quick Commands

```bash
# From monorepo root
bunx tauri dev           # Full app (Vite + Tauri + Rust)
bunx tauri build         # Production build (.dmg/.exe/.AppImage)

# Rust only (from project root)
cargo build              # Build all crates
cargo check              # Fast type checking
cargo test               # Run tests
cargo clippy             # Lint Rust code

# With logging
ORBIT_LOG_MODE=debug bunx tauri dev    # Verbose logging
ORBIT_LOG_MODE=prod bunx tauri build   # Minimal logging
```

---

## Directory Structure

```text
src-tauri/
├── Cargo.toml                    # Package manifest
├── build.rs                      # Tauri build script
├── tauri.conf.json               # App config (window, CSP, bundle)
├── Entitlements.plist            # macOS entitlements
│
├── binaries/                     # Sidecar binaries (dev)
│   ├── agent-bridge-aarch64-apple-darwin
│   └── claude-aarch64-apple-darwin
│
├── capabilities/                 # Tauri ACL permissions
│   ├── default.json              # Core permissions
│   └── filesystem.json           # FS-specific permissions
│
├── icons/                        # App icons (all platforms)
│
└── src/
    ├── main.rs                   # Entry point (delegates to lib.rs)
    ├── lib.rs                    # App initialization, state setup
    │
    ├── agent/                    # Agent bridge module
    │   ├── mod.rs
    │   ├── bridge.rs             # IPC with Node.js sidecar
    │   ├── protocol.rs           # Message types (Rust ↔ Node.js)
    │   └── session.rs            # High-level session API
    │
    ├── commands/                 # Tauri command handlers
    │   ├── mod.rs                # Command registration
    │   ├── common/               # Shared commands (all apps)
    │   │   ├── files.rs          # File I/O
    │   │   ├── terminal.rs       # PTY management
    │   │   ├── git.rs            # Git operations
    │   │   ├── lsp.rs            # Language server
    │   │   ├── search.rs         # Ripgrep search
    │   │   ├── settings.rs       # Settings persistence
    │   │   ├── workspace.rs      # Project path
    │   │   ├── browser.rs        # Embedded browser
    │   │   ├── credentials.rs    # Keychain API keys
    │   │   ├── providers.rs      # OAuth detection
    │   │   ├── dev_monitor.rs    # Dev monitoring
    │   │   └── diagnostics.rs    # Crash reporting
    │   ├── agent/                # Agent-specific
    │   │   ├── lifecycle.rs      # Session create/delete/message
    │   │   ├── ai.rs             # AI operations (stub)
    │   │   └── conversations.rs  # Chat persistence
    │   └── editor/               # Editor-specific (stub)
    │       └── mod.rs
    │
    └── core/                     # Core utilities
        ├── mod.rs
        ├── crash.rs              # Panic handling
        └── devmonitor.rs         # Dev monitoring utils
```

---

## Agent Bridge Architecture

The agent bridge manages a **Node.js sidecar process** for Claude SDK integration:

```text
┌─────────────────────────────────────────────────────────────┐
│  Rust (Tauri)                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  SessionManager (agent/session.rs)                    │  │
│  │  - High-level API: create_session, send_message, etc. │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  AgentBridge (agent/bridge.rs)                        │  │
│  │  - Spawns sidecar once at startup                     │  │
│  │  - JSON-line IPC over stdin/stdout                    │  │
│  │  - Reader thread for continuous output                │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │ stdin (JSON)                      │
│                          ▼                                   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Node.js Sidecar (agent-bridge binary)                      │
│  - Built with Bun, runs as standalone binary                │
│  - Wraps Claude Agent SDK                                   │
│  - Sends events back via stdout (JSON)                      │
└─────────────────────────────────────────────────────────────┘
```

### Key Characteristics

| Aspect        | Detail                                    |
| ------------- | ----------------------------------------- |
| **Lifecycle** | Spawned once at app startup, kept alive   |
| **IPC**       | JSON-line protocol (one message per line) |
| **Channel**   | Bounded crossbeam channel (1000 items)    |
| **Timeout**   | 5-minute timeout for requests             |
| **Events**    | Async streaming via callback registration |

### Sidecar Discovery

```rust
// Development: Look in src-tauri/binaries/
// Production: Look next to executable (bundled by Tauri)

// Platform-specific suffixes:
// macOS: agent-bridge-aarch64-apple-darwin
// Windows: agent-bridge-x86_64-pc-windows-msvc.exe
// Linux: agent-bridge-x86_64-unknown-linux-gnu
```

---

## Commands Organization

Commands use `#[tauri::command]` macro. Function names map directly to frontend:

- `agent_create_session` → `invoke('agent_create_session')`

### Common Commands (`commands/common/`)

**File operations** (`files.rs`):

- `read_file`, `read_file_bytes`, `write_file`, `write_file_bytes`
- `list_directory`, `create_file`, `create_directory`
- `delete_file`, `rename_file`, `copy_file`
- `file_exists`, `is_directory`, `get_file_info`
- `watch_path`, `unwatch_path` (500ms debounce)

**Terminal** (`terminal.rs`):

- `terminal_create`, `terminal_write`, `terminal_resize`
- `terminal_close`, `terminal_list`, `terminal_signal`
- `terminal_foreground_process`, `terminal_pending_bytes`

**Git** (`git.rs`):

- Discovery: `git_discover`
- Status: `git_status`, `git_diff`, `git_staged_diff`
- Staging: `git_stage`, `git_unstage`, `git_stage_all`
- Commit: `git_commit`, `git_discard`
- History: `git_log`, `git_blame`
- Branches: `git_branches`, `git_branch_info`, `git_checkout`
- Remote: `git_push`, `git_pull`, `git_fetch`, `git_clone`
- Worktrees: `git_worktree_list`, `git_worktree_add`, `git_worktree_remove`

**LSP** (`lsp.rs`):

- Lifecycle: `lsp_start`, `lsp_stop`, `lsp_is_running`
- Features: `lsp_completions`, `lsp_hover`, `lsp_goto_definition`
- Text sync: `lsp_did_open`, `lsp_did_change`, `lsp_did_save`, `lsp_did_close`

**Browser** (`browser.rs`):

- `browser_create`, `browser_navigate`, `browser_back`, `browser_forward`
- `browser_eval`, `browser_eval_async`, `browser_screenshot`
- `browser_show`, `browser_hide`, `browser_close`

### Agent Commands (`commands/agent/`)

**Session lifecycle** (`lifecycle.rs`):

- `agent_create_session`, `agent_delete_session`
- `agent_send_message`, `agent_interrupt`
- `agent_is_session_ready`, `agent_get_sdk_session_id`
- `agent_respond_permission`

**Mode configuration**:

- `agent_set_thinking_mode`, `agent_get_thinking_mode`
- `agent_set_plan_mode`, `agent_get_plan_mode`
- `agent_set_accept_mode`, `agent_get_accept_mode`
- `agent_set_model`

**Advanced**:

- `agent_fork_session`, `agent_rewind_files`
- `agent_generate_agent_definition`, `agent_generate_command_definition`

**Conversations** (`conversations.rs`):

- `conversation_create`, `conversation_list`, `conversation_load`
- `conversation_delete`, `conversation_update_title`
- `conversation_add_message`, `conversation_fork`

---

## Protocol Types (`agent/protocol.rs`)

### Session Configuration

```rust
pub struct SessionConfig {
    pub cwd: Option<String>,
    pub thinking_enabled: Option<bool>,
    pub max_thinking_tokens: Option<u32>,
    pub plan_enabled: Option<bool>,
    pub accept_enabled: Option<bool>,
    pub model: Option<Model>,           // Haiku | Sonnet | Opus
    pub session_mode: Option<SessionMode>, // Chat | Agent
}
```

### Agent Messages (Sidecar → Rust)

```rust
pub struct AgentMessage {
    pub message_type: AgentMessageType, // Text | Thinking | ToolUse | Result | Error
    pub content: String,
    pub message_id: Option<String>,
    pub content_offset: Option<u32>,
    pub metadata: Option<ToolMetadata>,
    pub usage: Option<TokenUsage>,
    pub total_cost_usd: Option<f64>,
    pub duration_ms: Option<u64>,
}
```

### Bridge Request Types (Rust → Sidecar)

- Session: `CreateSession`, `DeleteSession`, `SendMessage`, `Interrupt`
- Modes: `SetThinkingMode`, `GetThinkingMode`, `SetModel`, `SetPlanMode`, `SetAcceptMode`
- Storage: `GetStoredSession`, `CleanupSessions`
- Agents: `ListAgents`, `GetAgent`, `CreateAgent`, `UpdateAgent`, `DeleteAgent`
- Commands: `ListCommands`, `GetCommand`, `CreateCommand`, `UpdateCommand`, `DeleteCommand`
- Advanced: `ForkSession`, `RewindFiles`, `GenerateAgentDefinition`

### Bridge Events (Sidecar → Rust, async)

- `AgentMessage` - Text/thought/tool output streaming
- `PermissionRequest` - Tool approval needed
- `SessionInit` - Session started/resumed/forked
- `Checkpoint` - Savepoint created
- `PlanModeChanged`, `AcceptModeChanged`
- `BrowserToolRequest`
- `Ready` - Sidecar initialized

---

## Managed State

In `lib.rs`, Tauri `.manage()` registers shared state accessible to commands:

```rust
.manage(settings_manager)        // SettingsManager
.manage(conversation_manager)    // ConversationManager
.manage(session_manager)         // Arc<SessionManager>
.manage(browser_state)           // EmbeddedBrowserState
.manage(browser_result_state)    // BrowserResultState
```

Access in commands via `State<'_, T>`:

```rust
#[tauri::command]
pub async fn my_command(
    state: State<'_, Arc<SessionManager>>
) -> Result<String, String> {
    state.some_method().map_err(to_error)
}
```

---

## Error Handling Pattern

Commands return `Result<T, String>` (not `orbit_core::Result`):

```rust
fn to_error<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[tauri::command]
pub async fn my_command(state: State<'_, Manager>) -> Result<Data, String> {
    state.operation().map_err(to_error)
}
```

---

## Event Emission

Commands emit Tauri events for async notifications:

```rust
app.emit("event-name", payload)?;
```

Common events:

| Event                | Purpose                    |
| -------------------- | -------------------------- |
| `file:changed`       | File watcher notifications |
| `terminal:output`    | Terminal data stream       |
| `agent:message`      | Agent message stream       |
| `permission:request` | Tool approval needed       |
| `browser:*`          | Embedded browser events    |

---

## Logging Configuration

Three log levels via `ORBIT_LOG_MODE` environment variable:

| Mode    | Dependencies | Orbit Crates | Default For     |
| ------- | ------------ | ------------ | --------------- |
| `prod`  | warn/error   | warn/error   | Release builds  |
| `dev`   | info         | debug        | Debug builds    |
| `debug` | debug        | trace        | Troubleshooting |

```bash
# Verbose logging for development
ORBIT_LOG_MODE=debug bunx tauri dev

# Minimal logging for production
ORBIT_LOG_MODE=prod bunx tauri build
```

---

## Tauri Configuration (`tauri.conf.json`)

### Key Settings

| Setting         | Value                   | Purpose          |
| --------------- | ----------------------- | ---------------- |
| `productName`   | Orbit                   | App display name |
| `identifier`    | com.recursive.orbit     | Unique app ID    |
| `Window`        | 1280x800 (min: 800x600) | Default viewport |
| `titleBarStyle` | Overlay                 | Custom title bar |
| `frontendDist`  | ../dist                 | Built frontend   |
| `devUrl`        | http://localhost:5176   | Vite dev server  |

### Content Security Policy

```text
script-src:  'self' + 'unsafe-eval' + https://streamdown.ai
style-src:   'self' + 'unsafe-inline' + https://streamdown.ai
connect-src: 'self' + IPC + https://api.anthropic.com + https://streamdown.ai
frame-src:   'none'
object-src:  'none'
```

> **Note:** `unsafe-eval` is required for the streamdown markdown library.

### Sidecar Binaries

Bundled in `externalBin`:

- `binaries/agent-bridge` - Claude SDK wrapper
- `binaries/claude` - Claude CLI binary

---

## Capabilities (ACL Permissions)

Defined in `capabilities/default.json`:

**File System:**

- `fs:scope-home-recursive` - Access ~ and subdirectories
- `fs:allow-read-file`, `fs:allow-write-file`
- `fs:allow-read-dir`, `fs:allow-create`, `fs:allow-remove`

**Shell:**

- `shell:allow-spawn`, `shell:allow-execute`
- `shell:allow-stdin-write`, `shell:allow-kill`

**Other:**

- `dialog:*` - File dialogs
- `clipboard:*` - Copy/paste
- `window:*` - Window management
- `event:*` - Event system

---

## App Initialization Flow (`lib.rs`)

1. **Initialize panic handler** - Crash reporting (FIRST!)
2. **Load settings** - SettingsManager from disk
3. **Load conversations** - ConversationManager from disk
4. **Resolve sidecar path** - Find agent-bridge binary
5. **Create SessionManager** - Wrap agent bridge
6. **Build Tauri app**:
   - Register managed state (`.manage()`)
   - Install logging plugin
   - Install Tauri plugins (fs, shell, dialog, clipboard, decorum, window-state)
   - Setup event callbacks
   - Register all ~120 commands
   - Start app window

---

## Workspace Crates

The Tauri app depends on workspace crates in `crates/common/`:

| Crate                 | Purpose                          |
| --------------------- | -------------------------------- |
| `orbit-core`          | Core types, error handling       |
| `orbit-fs`            | File system operations           |
| `orbit-terminal`      | PTY/terminal emulation           |
| `orbit-git`           | Git command wrapper              |
| `orbit-lsp`           | Language server protocol         |
| `orbit-search`        | Ripgrep search wrapper           |
| `orbit-settings`      | Settings persistence             |
| `orbit-conversations` | Conversation storage             |
| `orbit-ai`            | Claude API (stub - uses sidecar) |

---

## Adding New Features

### Adding a New Command

1. Create function with `#[tauri::command]`:

   ```rust
   // commands/common/my_feature.rs
   #[tauri::command]
   pub async fn my_new_command(
       state: State<'_, MyState>,
       param: String,
   ) -> Result<Data, String> {
       state.operation(&param).map_err(to_error)
   }
   ```

2. Export from module:

   ```rust
   // commands/common/mod.rs
   pub mod my_feature;
   pub use my_feature::*;
   ```

3. Register in `lib.rs`:

   ```rust
   .invoke_handler(tauri::generate_handler![
       // ... existing commands
       my_new_command,
   ])
   ```

### Adding Managed State

1. Create state struct:

   ```rust
   pub struct MyState {
       data: Mutex<Data>,
   }
   ```

2. Register in `lib.rs`:

   ```rust
   .manage(MyState::new())
   ```

3. Access in commands:

   ```rust
   state: State<'_, MyState>
   ```

### Adding a New Event

1. Emit from Rust:

   ```rust
   app.emit("my:event", MyPayload { data })?;
   ```

2. Listen in frontend:

   ```typescript
   import { listen } from '@tauri-apps/api/event';

   await listen('my:event', (event) => {
     console.log(event.payload);
   });
   ```

---

## Common Patterns

### Module Organization

```rust
// commands/mod.rs - Just declare modules, no re-exports
pub mod agent;
pub mod common;

// commands/common/mod.rs - Declare submodules
pub mod files;
pub mod git;
pub mod terminal;

// crates/common/core/src/lib.rs - Re-export commonly used types
pub mod types;
pub mod error;
pub use error::{Error, Result};
pub use types::{FileStatus, GitStatus};
```

### Sidecar Communication

```rust
// Send request, wait for response
let response = state.session_manager
    .send_message(session_id, text, attachments)
    .await
    .map_err(to_error)?;

// Fire-and-forget
state.session_manager
    .interrupt(session_id)
    .map_err(to_error)?;
```

### File Watcher Debouncing

File changes are debounced by 500ms to prevent event storms:

```rust
// In files.rs
const DEBOUNCE_MS: u64 = 500;
```

### Git Operation Safety

Always validate repo exists before operations:

```rust
let repo_path = git_discover(&path).map_err(to_error)?;
// Now safe to operate on repo_path
```

---

## Troubleshooting

### Sidecar Not Starting

1. Check binary exists in `src-tauri/binaries/`
2. Verify correct platform suffix (aarch64-apple-darwin, etc.)
3. Check `CLAUDE_CLI_PATH` environment variable
4. Look for spawn errors in console

### Commands Not Found

1. Verify function has `#[tauri::command]` attribute
2. Check it's exported from module
3. Confirm registered in `generate_handler![]`

### State Access Errors

1. Ensure state is `.manage()`'d in `lib.rs`
2. Use correct type in `State<'_, T>` parameter
3. For `Arc<T>`, use `State<'_, Arc<T>>`

### Event Not Received

1. Verify event name matches exactly (case-sensitive)
2. Check frontend `listen()` is awaited
3. Confirm `app.emit()` call succeeded

---

## Testing

The Tauri backend uses **Cargo test** for Rust unit and integration tests.

### Commands

```bash
# From project root
cargo test                  # Run all Rust tests
cargo test --workspace      # All workspace crates
cargo test -p orbit-git     # Specific crate

# With output
cargo test -- --nocapture   # Show println! output
```

### Test Organization

Tests are located alongside the code they test:

```rust
// src-tauri/src/commands/common/tests.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_serialization() {
        // Test Serde serialization
    }
}
```

### Workspace Crate Tests

Each crate in `crates/common/` has its own tests:

```bash
cargo test -p orbit-core    # Core types
cargo test -p orbit-fs      # File system ops
cargo test -p orbit-git     # Git operations
cargo test -p orbit-terminal # PTY tests
```

### Integration Tests

For full end-to-end testing with the Claude SDK, use agent-bridge tests:

```bash
cd agent-bridge && bun test
```

These require OAuth credentials and auto-skip in CI.

---

## Changelog

### January 2026

- Initial CLAUDE.md for src-tauri
- Documented agent bridge architecture
- Added command organization reference
- Documented protocol types and events
- Added testing section
