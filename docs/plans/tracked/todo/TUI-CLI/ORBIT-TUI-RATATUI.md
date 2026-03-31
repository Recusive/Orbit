# Orbit TUI (Ratatui) — Implementation Plan

## Context

Orbit is a Tauri desktop app with a React frontend. The AI layer runs through `agent-bridge`, a Bun-compiled TypeScript sidecar that wraps the Claude Agent SDK. The Rust backend communicates with it via newline-delimited JSON over stdin/stdout.

**Goal:** Build a terminal-based AI chat interface (`orbit` CLI) using Ratatui that reuses the same agent-bridge sidecar and IPC protocol. Extract pure rendering widgets from the Codex RS TUI (100k lines of production Ratatui code at `/Users/no9labs/Developer/Recursive/codex-latest/codex-rs/tui/`).

**Why this works:** The agent-bridge IPC code in `src-tauri/src/agent/` has zero Tauri imports (verified via grep). The rendering widgets in Codex TUI have zero-to-one external codex-\* dependencies (verified per-file). The seams are clean.

---

## Phase 0: Extract `orbit-agent-bridge` Crate

**What:** Move the 4 framework-agnostic IPC files from `src-tauri/src/agent/` into a shared crate.

**Create `crates/common/agent-bridge/`:**

```
crates/common/agent-bridge/
├── Cargo.toml
└── src/
    ├── lib.rs              # Re-exports
    ├── bridge.rs           # From src-tauri/src/agent/bridge.rs (395 lines, 0 changes)
    ├── protocol.rs         # From src-tauri/src/agent/protocol.rs (747 lines, 0 changes)
    ├── session.rs          # From src-tauri/src/agent/session.rs (806 lines, update use super:: → use crate::)
    ├── credential.rs       # From src-tauri/src/agent/credential_bridge.rs (77 lines, update use super::)
    └── sidecar.rs          # NEW: Generic sidecar path resolution (env var + exe-relative)
```

**Dependencies:** serde, serde_json, crossbeam-channel, parking_lot, hashbrown, log, thiserror (all workspace)

**What stays in src-tauri:**

- `src-tauri/src/agent/mod.rs` → thin re-export: `pub use orbit_agent_bridge::*;`
- `src-tauri/src/commands/agent/lifecycle.rs` → Tauri event emission (the ONLY Tauri coupling point, line 633)
- Tauri-specific sidecar path resolution in `src-tauri/src/lib.rs`

**Modified files:**

- `Cargo.toml` (root) → add `crates/common/agent-bridge` to workspace members
- `src-tauri/Cargo.toml` → add `orbit-agent-bridge = { path = "../crates/common/agent-bridge" }` dep
- `src-tauri/src/agent/mod.rs` → replace 4 `pub mod` + `pub use` with single `pub use orbit_agent_bridge::*;`
- Delete: `src-tauri/src/agent/{bridge,protocol,session,credential_bridge}.rs`

**Verify:** `cargo check -p orbit-agent-bridge && cargo check -p orbit-app && cargo test --workspace`

---

## Phase 1: Minimal Viable TUI

**What:** A working terminal binary that can chat with Claude via agent-bridge. Plain text rendering only.

### 1A. Workspace Setup

**Create `src-tui/`:**

```
src-tui/
├── Cargo.toml
└── src/
    ├── main.rs              # CLI args (clap), terminal setup, panic hook
    ├── app.rs               # tokio::select! event loop
    ├── bridge_adapter.rs    # Async wrapper: crossbeam → tokio::sync::mpsc
    ├── event.rs             # TuiEvent enum (TerminalInput | BridgeEvent | Tick)
    ├── state.rs             # AppState, ChatMessage, PendingPermission
    ├── ui.rs                # Top-level Ratatui layout (header, chat, input, footer)
    ├── input.rs             # Input bar widget
    ├── message_list.rs      # Scrollable message list widget
    └── terminal.rs          # Terminal setup/teardown (alt screen, raw mode, panic hook)
```

**Key deps:** orbit-agent-bridge, orbit-core, ratatui, crossterm, tokio, clap, tracing, uuid, dirs

**Add to root `Cargo.toml` members:** `"src-tui"`

### 1B. Bridge Adapter (`bridge_adapter.rs`)

The existing `AgentBridge` is synchronous (crossbeam-channel). The adapter:

- Sets `EventCallback` to forward `BridgeEvent` into `tokio::sync::mpsc::UnboundedSender`
- Wraps `SessionManager` methods with `tokio::task::spawn_blocking` (5-min timeout safe)
- Exposes `async fn next_event(&mut self) -> Option<BridgeEvent>` for the event loop

This is the single integration point — replaces `app.emit()` (Tauri) with channel send.

### 1C. Event Loop (`app.rs`)

```rust
loop {
    tokio::select! {
        Some(event) = terminal_events.next() => handle_terminal_event(&mut state, event),
        Some(event) = bridge.next_event()    => handle_bridge_event(&mut state, event),
        _ = tick_interval.tick()             => { /* redraw if dirty */ }
    }
    if state.should_redraw { terminal.draw(|f| ui::render(f, &state))?; }
    if state.should_quit { break; }
}
```

### 1D. Bridge Event → State Mapping

| BridgeEvent                 | State mutation                               |
| --------------------------- | -------------------------------------------- |
| `Ready`                     | Set status "Bridge ready"                    |
| `SessionInit`               | Mark session ready                           |
| `AgentMessage { Text }`     | Append to streaming buffer or commit message |
| `AgentMessage { Thinking }` | Show `[thinking]` prefix, accumulate text    |
| `AgentMessage { ToolUse }`  | Show `[tool: name]` with input summary       |
| `AgentMessage { Result }`   | Commit final message, update cost/tokens     |
| `AgentMessage { Error }`    | Display error in message list                |
| `PermissionRequest`         | Show y/n/a dialog, switch focus              |
| `PlanModeChanged`           | Update plan_mode flag                        |
| `AcceptModeChanged`         | Update accept_mode flag                      |
| `ErrorEvent`                | Show error banner                            |
| `Checkpoint`                | Store checkpoint_id                          |
| `AuthError`                 | Show auth error, prompt for API key          |

### 1E. UI Layout

```
┌─── Orbit ──────────────────── sonnet ─── $0.03 ───┐
│                                                     │
│  You: How do I fix the login bug?                  │
│                                                     │
│  [thinking] Analyzing the codebase...              │
│  Claude: I found the issue in auth.rs...           │
│  [tool] Read(src/auth.rs) ✓                        │
│                                                     │
│ ┌── Permission Required ────────────────────────┐  │
│ │ Write → src/auth.rs                            │  │
│ │ [y] Approve  [n] Deny  [a] Always             │  │
│ └────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│ > Type a message... (Enter=send, Ctrl+C=quit)       │
└─────────────────────────────────────────────────────┘
```

### 1F. CLI Arguments

```rust
#[derive(Parser)]
struct Cli {
    #[arg(short, long)] message: Option<String>,       // One-shot message
    #[arg(short = 'C', long)] cwd: Option<PathBuf>,   // Working directory
    #[arg(long, default_value = "claude-sonnet-4-6")] model: String,
    #[arg(long)] thinking: bool,                        // Enable thinking
    #[arg(long, env = "ANTHROPIC_API_KEY")] api_key: Option<String>,
    #[arg(long, env = "ORBIT_AGENT_BRIDGE_PATH")] bridge_path: Option<PathBuf>,
}
```

**Phase 1 deliverable:** Type messages, see streaming responses, approve/deny tools, Ctrl+C to quit.

---

## Phase 2: Rich Rendering (Widget Extraction)

**What:** Port pure rendering widgets from Codex TUI into a shared widget crate. Add markdown, syntax highlighting, streaming animation.

### 2A. Create `crates/common/tui-widgets/`

```
crates/common/tui-widgets/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── markdown.rs            # From codex markdown_render.rs (~500 lines)
    ├── markdown_stream.rs     # From codex markdown_stream.rs (~110 lines)
    ├── highlight.rs           # From codex render/highlight.rs (~400 lines)
    ├── line_utils.rs          # From codex render/line_utils.rs (~60 lines)
    ├── renderable.rs          # From codex render/renderable.rs (~120 lines)
    ├── insets.rs              # From codex render/mod.rs (~50 lines)
    ├── wrapping.rs            # From codex wrapping.rs (~400 lines, sans unsafe)
    ├── color.rs               # From codex color.rs (~75 lines)
    ├── key_hint.rs            # From codex key_hint.rs (~113 lines)
    ├── frame_rate_limiter.rs  # From codex tui/frame_rate_limiter.rs (~63 lines)
    └── stream_state.rs        # From codex streaming/mod.rs (~115 lines)
```

**Deps:** ratatui, crossterm, pulldown-cmark, syntect, two-face, textwrap, regex-lite, unicode-width
**NO orbit-agent-bridge dep** — enforced purity.

### 2B. Per-File Extraction Notes

| Source (codex tui/src/)     | Target                  | Modifications                                                                                 |
| --------------------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| `markdown_render.rs`        | `markdown.rs`           | Replace `codex_utils_string::normalize_markdown_hash_location_suffix` with inline 5-line impl |
| `render/highlight.rs`       | `highlight.rs`          | Rename `CODEX_HOME` static → `ORBIT_HOME`, use `~/.orbit/themes/` for custom themes           |
| `render/line_utils.rs`      | `line_utils.rs`         | Copy verbatim                                                                                 |
| `render/renderable.rs`      | `renderable.rs`         | Adjust `crate::render::` paths to `crate::`                                                   |
| `render/mod.rs` (Insets)    | `insets.rs`             | Copy verbatim                                                                                 |
| `wrapping.rs`               | `wrapping.rs`           | Omit `wrap_ranges` fn (contains 2 unsafe blocks, only used by codex textarea)                 |
| `markdown_stream.rs`        | `markdown_stream.rs`    | Adjust internal paths                                                                         |
| `streaming/mod.rs`          | `stream_state.rs`       | Adjust internal paths                                                                         |
| `color.rs`                  | `color.rs`              | Copy verbatim                                                                                 |
| `key_hint.rs`               | `key_hint.rs`           | Copy verbatim                                                                                 |
| `tui/frame_rate_limiter.rs` | `frame_rate_limiter.rs` | Copy verbatim                                                                                 |

### 2C. Integrate into TUI

- Replace plain-text rendering with `markdown::render_markdown_text_with_width()`
- Replace text accumulation with `MarkdownStreamCollector` → `StreamState` pipeline
- Add `FrameRateLimiter` to tick logic
- Use `highlight::highlight_code_to_lines()` for code blocks and tool input

**Phase 2 deliverable:** Full markdown rendering with syntax-highlighted code blocks, smooth streaming animation.

---

## Phase 3: Tool Use & Advanced UI

- `src-tui/src/widgets/tool_cell.rs` — Tool name, JSON input (highlighted), output, status spinner
- `src-tui/src/widgets/thinking_cell.rs` — Collapsible thinking blocks, dimmed italic style
- Pager overlay (Ctrl+P) — full-screen scrollable transcript, vim-style nav
- Input history (Up/Down arrows) — persisted to `~/.orbit/tui_history`
- Enhanced permission dialog — formatted tool input, tab between options
- Status footer — model, mode, streaming indicator, tokens, cost, key hints

---

## Phase 4: Session Management & Polish

- Session resume (`resume_session_id` in SessionConfig)
- Fork/rewind support (ForkSession, RewindFiles, checkpoint tracking)
- Session picker on startup
- Model switching (Ctrl+M), thinking toggle (Ctrl+T), plan/accept toggles
- Slash commands: `/model`, `/thinking`, `/plan`, `/clear`, `/quit`, `/agents`, `/commands`
- Terminal resize, crash recovery, log file (`~/.orbit/logs/tui.log`), clipboard, mouse scroll

---

## Architecture Decisions

| Decision                         | Rationale                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| **Sync bridge + async adapter**  | Keep shared crate unchanged; `spawn_blocking` wraps the 5-min timeout safely             |
| **Separate `tui-widgets` crate** | Enforces purity (can't import business logic), matches crate-per-concern pattern         |
| **No diff rendering**            | Agent-bridge doesn't send structured diffs; file changes come as tool results            |
| **Single-session model**         | Eliminates Codex's multi-thread complexity; one fork active at a time                    |
| **120 FPS cap**                  | Codex's `FrameRateLimiter` pattern; 16ms tick for ~60 FPS effective                      |
| **Skip unsafe wrapping**         | Workspace forbids unsafe; `wrap_ranges` only needed for cursor positioning we don't port |

---

## Dependency Graph

```
orbit-tui (src-tui/)
├── orbit-agent-bridge (crates/common/agent-bridge/)  ← SHARED with src-tauri
├── orbit-tui-widgets (crates/common/tui-widgets/)    ← NO business logic deps
├── orbit-core (existing)
├── ratatui + crossterm
├── tokio + tokio-stream
├── clap, tracing, uuid, dirs
```

---

## Verification

**Phase 0:** `cargo check -p orbit-agent-bridge && cargo check -p orbit-app && cargo test --workspace`
**Phase 1:** Build binary, run `./target/debug/orbit`, send a message, see response, approve a tool, quit
**Phase 2:** Verify markdown headers/bold/code blocks render correctly, syntax highlighting works, streaming animates
**Phase 3-4:** Manual testing of each feature against live agent-bridge

---

## Codex Source Files Reference

All extracted widgets from: `/Users/no9labs/Developer/Recursive/codex-latest/codex-rs/tui/src/`

Architectural patterns from:

- `app.rs` (event loop pattern, lines 104-130)
- `tui.rs` (terminal setup/teardown)
- `chatwidget.rs` (widget coordinator, event dispatch at line 4780)
- `bottom_pane/` (input bar, approval overlay)
- `history_cell.rs` (HistoryCell trait)
