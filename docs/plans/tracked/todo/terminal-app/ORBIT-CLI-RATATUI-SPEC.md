# Orbit CLI — Ratatui Terminal Spec

> **Status:** Approved — Implementation target: Week of 2026-03-25
> **Supersedes:** `orbit-terminal-design.md` (SwiftUI sidebar approach) and `orbit-terminal-plan.md` (SwiftUI implementation plan)
> **Decision:** ALL panels rendered in Ratatui inside Ghostty. No SwiftUI. Pure terminal.

---

## 1. Vision

Build the best AI coding CLI in existence. 100x better than Claude Code.

**The stack:**

- **Ghostty** (libghostty) — Metal GPU-accelerated terminal rendering, 120fps, sub-pixel fonts
- **Ratatui** (forked from Codex) — Full TUI framework with chat, streaming, input, menus
- **OpenCode engine** (Agent-backend) — AI agent supporting 200+ models via AI SDK

**The product:**
A native macOS terminal app where every panel — sessions, file tree, chat, code viewer, git status — is a Ratatui widget rendered inside Ghostty. It looks and feels like a terminal, not a GUI. It starts in 50ms, uses 15MB of memory, never flickers, and supports every LLM provider.

**The killer feature:**
Inline "+" commenting on code — users navigate to a line in the code viewer, press "+", type an instruction ("make this async"), and the AI immediately acts on it. GitHub PR review meets AI agent.

**Why not Claude Code:**
| Problem | Claude Code | Orbit CLI |
|---------|------------|-----------|
| Flickering | 1/3 sessions affected (architectural — React/Ink impedance mismatch) | Impossible (Ratatui double-buffer diffing) |
| Startup | 3-4 seconds (V8 + React + Yoga WASM boot) | ~50ms (native Rust binary) |
| Memory | 360 MB baseline, peaks at 746 MB | ~15 MB |
| Models | Claude only | 200+ models (Anthropic, OpenAI, Google, Azure, Ollama, etc.) |
| File browser | None | Built-in file tree + syntax-highlighted viewer |
| Code review | None | Inline "+" comments that become agent instructions |
| Git | None | Built-in status, diffs, staging |
| Sessions | Basic | Full session tree with branching + fork |

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    Ghostty (Native macOS App)                      │
│             libghostty — Metal GPU, 120fps rendering              │
│             Untouched. Renders ANSI output from orbit binary.     │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────┐  ┌──────────────────────────┐  ┌──────────────────┐  │
│  │ Left    │  │      Center Panel         │  │   Right Panel    │  │
│  │ Sidebar │  │                            │  │                  │  │
│  │         │  │   Chat + Streaming +       │  │  Code Viewer     │  │
│  │Sessions │  │   Tool Widgets +           │  │  with "+" inline │  │
│  │File Tree│  │   Slash Commands +         │  │  comments        │  │
│  │Git Stat │  │   Agent Swarm Status       │  │                  │  │
│  │         │  │                            │  │  Git Diff View   │  │
│  │         │  ├────────────────────────────┤  │                  │  │
│  │         │  │ > /com█  [autocomplete]    │  │                  │  │
│  └─────────┘  └──────────────────────────┘  └──────────────────┘  │
│                                                                    │
│  ── model: claude-sonnet │ tokens: 1.2k │ cost: $0.003 ────────  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘

                         ALL RATATUI
                    Rendered as ANSI in Ghostty
```

### Process Architecture

```
┌──────────────────────┐
│  Ghostty App (macOS)  │
│  - Launches orbit     │
│  - Renders terminal   │
│  - Handles fonts/GPU  │
└──────────┬───────────┘
           │ PTY (spawns)
           ▼
┌──────────────────────┐     HTTP + SSE      ┌──────────────────────┐
│  orbit (Rust binary)  │ ◄────────────────► │  orbit-server (Bun)   │
│                        │    localhost:4096   │                        │
│  - Ratatui TUI         │                    │  - OpenCode engine     │
│  - All panels/widgets  │                    │  - AI SDK (200+ models)│
│  - Input handling      │                    │  - Tool execution      │
│  - TestBackend tests   │                    │  - SQLite sessions     │
│                        │                    │  - MCP support         │
│  ~15 MB, 50ms start    │                    │  - File ops, search    │
└────────────────────────┘                    └────────────────────────┘
```

**Key design decisions:**

1. `orbit` binary handles ALL rendering. No SwiftUI. No native panels. Pure Ratatui.
2. `orbit-server` is a separate process (same binary, different mode: `orbit serve`). The TUI connects via HTTP + SSE.
3. Ghostty is just the terminal emulator. It renders whatever ANSI the `orbit` binary outputs. libghostty is untouched.
4. The `orbit` binary can also run standalone in any terminal (iTerm2, Terminal.app, Kitty, Alacritty). Ghostty just makes it look best.

---

## 3. Codex Fork Strategy

### What We Take (Wholesale)

The Codex TUI (`codex-rs/tui/`) is Apache 2.0 licensed. We fork the entire TUI crate and adapt it.

| Component            | Source File                 | Size   | Status                                                |
| -------------------- | --------------------------- | ------ | ----------------------------------------------------- |
| Chat rendering       | `chatwidget.rs`             | 380 KB | **KEEP** — core chat viewport, transcript, streaming  |
| App event loop       | `app.rs`                    | 312 KB | **KEEP** — main loop, session mgmt, thread routing    |
| Text input           | `chat_composer.rs`          | 374 KB | **KEEP** — rich input, paste, history, slash commands |
| Multi-agent UI       | `multi_agents.rs`           | ~20 KB | **KEEP** — agent picker, status dots, shortcuts       |
| Streaming controller | `streaming/controller.rs`   | ~12 KB | **KEEP** — newline-gated streaming, batch animation   |
| Custom layout engine | `render/renderable.rs`      | 12 KB  | **KEEP** — Renderable trait, Flex/Column/Row/Inset    |
| Syntax highlighting  | `render/highlight.rs`       | 55 KB  | **KEEP** — syntect-based code highlighting            |
| Approval overlay     | `approval_overlay.rs`       | 57 KB  | **KEEP** — permission dialogs                         |
| Event bus            | `app_event.rs`              | 15 KB  | **KEEP** — AppEvent enum, centralized routing         |
| History cells        | `history_cell.rs`           | 148 KB | **KEEP** — transcript cell trait + implementations    |
| Exec cells           | `exec_cell/`                | ~15 KB | **KEEP** — command output rendering                   |
| Footer/status        | `footer.rs`                 | 63 KB  | **KEEP** — status line, model, tokens, cost           |
| Slash command menu   | `list_selection_view.rs`    | 67 KB  | **KEEP** — picker UI with fuzzy search                |
| Frame rate control   | `tui/frame_rate_limiter.rs` | ~5 KB  | **KEEP** — FPS limiting                               |

### What We Strip

These are Codex backend crates the TUI imports but we don't need (our backend is orbit-server):

| Crate                  | Why Strip                                             |
| ---------------------- | ----------------------------------------------------- |
| `codex-core`           | Replaced by `orbit_client` (HTTP+SSE to orbit-server) |
| `codex-api`            | LLM calls happen in orbit-server                      |
| `codex-client`         | LLM client abstraction — not needed                   |
| `codex-state`          | Session storage — orbit-server uses SQLite            |
| `codex-login`          | Auth — different for Orbit                            |
| `codex-shell-command`  | Tool execution — orbit-server handles this            |
| `codex-git`            | Git ops — orbit-server handles this                   |
| `codex-file-search`    | Search — orbit-server has `/find` endpoint            |
| `codex-execpolicy`     | Permissions — orbit-server has `/permission`          |
| `codex-chatgpt`        | ChatGPT-specific — irrelevant                         |
| `codex-backend-client` | Backend HTTP client — replaced                        |
| `codex-rmcp-client`    | MCP — orbit-server has `/mcp`                         |

### What We Replace — `orbit_client` Module

One new Rust module replaces `codex-core` as the TUI's backend interface:

```
orbit-cli/src/
├── orbit_client/
│   ├── mod.rs              # OrbitThread (replaces CodexThread)
│   ├── http.rs             # reqwest client to orbit-server
│   ├── sse.rs              # SSE event stream → EventMsg translation
│   ├── protocol.rs         # Op → HTTP request mapping
│   └── types.rs            # Response types (Session, Message, Part, etc.)
```

**OrbitThread interface** (mirrors CodexThread):

```rust
pub struct OrbitThread {
    session_id: String,
    client: OrbitHttpClient,
    event_rx: mpsc::UnboundedReceiver<EventMsg>,
}

impl OrbitThread {
    /// Send a user message (maps to POST /session/:id/message)
    pub async fn submit(&self, op: Op) -> Result<String>;

    /// Receive next event from SSE stream
    pub async fn next_event(&self) -> Result<Event>;

    /// Get current agent status
    pub async fn agent_status(&self) -> AgentStatus;

    /// Subscribe to status changes
    pub fn subscribe_status(&self) -> watch::Receiver<AgentStatus>;

    /// Shut down the session
    pub async fn shutdown(&self) -> Result<()>;
}
```

**Protocol mapping** (Codex Op → orbit-server HTTP):

| Codex Op                               | HTTP Call | Endpoint                 |
| -------------------------------------- | --------- | ------------------------ |
| `Op::UserTurn { items, model, ... }`   | `POST`    | `/session/:id/message`   |
| `Op::Interrupt`                        | `POST`    | `/session/:id/abort`     |
| `Op::ExecApproval { id, decision }`    | `POST`    | `/permission/:id/reply`  |
| `Op::UserInputAnswer { id, response }` | `POST`    | `/question/:id/reply`    |
| `Op::ListModels`                       | `GET`     | `/provider/`             |
| `Op::ListSkills { ... }`               | `GET`     | `/skill`                 |
| `Op::ListMcpTools`                     | `GET`     | `/mcp/`                  |
| `Op::Undo`                             | `POST`    | `/session/:id/revert`    |
| `Op::ThreadRollback { num_turns }`     | `POST`    | `/session/:id/revert`    |
| `Op::Compact`                          | `POST`    | `/session/:id/summarize` |
| `Op::SetThreadName { name }`           | `PATCH`   | `/session/:id`           |
| `Op::Shutdown`                         | `POST`    | `/global/dispose`        |
| `Op::RunUserShellCommand { command }`  | `POST`    | `/session/:id/shell`     |

**SSE event mapping** (orbit-server SSE → Codex EventMsg):

| orbit-server SSE Event                | Codex EventMsg                          |
| ------------------------------------- | --------------------------------------- |
| `message.created` (role=assistant)    | `TurnStarted`                           |
| `message.streamed` (type=text)        | `AgentMessageDelta`                     |
| `message.streamed` (type=tool_call)   | `ExecCommandBegin` / `McpToolCallBegin` |
| `message.streamed` (type=tool_result) | `ExecCommandEnd` / `McpToolCallEnd`     |
| `message.completed`                   | `TurnComplete`                          |
| `permission.requested`                | `ExecApprovalRequest`                   |
| `question.asked`                      | `RequestUserInput`                      |
| `session.updated`                     | `TokenCount` (extract usage)            |
| `server.heartbeat`                    | (internal — reset connection timeout)   |

### What We Add (New Panels)

These don't exist in Codex and are built from scratch:

| Component              | Description                                        | Complexity  |
| ---------------------- | -------------------------------------------------- | ----------- |
| **Left Sidebar**       | Session tree + File tree + Git status (tabbed)     | Medium      |
| **Right Panel**        | Code viewer with syntax + "+" comments + diff view | Medium-High |
| **Three-panel layout** | Resizable split with collapse/expand               | Low         |
| **File tree widget**   | Recursive tree with expand/collapse, icons         | Medium      |
| **Code viewer widget** | Syntax-highlighted file with line selection        | Medium      |
| **Inline "+" comment** | Text input overlay on selected line                | Medium      |
| **Git status widget**  | Modified/added/deleted files with diff preview     | Low-Medium  |

---

## 4. Crate Structure

```
orbit-cli/                          # New Rust crate (binary)
├── Cargo.toml
├── src/
│   ├── main.rs                     # Entry point: parse args, spawn orbit-server, launch TUI
│   ├── orbit_client/               # NEW: HTTP+SSE client to orbit-server
│   │   ├── mod.rs                  # OrbitThread, OrbitThreadManager
│   │   ├── http.rs                 # reqwest HTTP client
│   │   ├── sse.rs                  # SSE stream consumer → EventMsg
│   │   ├── protocol.rs            # Op ↔ HTTP mapping
│   │   └── types.rs               # API response types
│   │
│   ├── app.rs                      # FORKED from Codex: main event loop
│   ├── app_event.rs                # FORKED: AppEvent enum (extended)
│   ├── chatwidget.rs               # FORKED: chat viewport + streaming
│   ├── chatwidget/
│   │   ├── agent.rs                # FORKED: subagent spawning
│   │   └── interrupts.rs          # FORKED: interrupt handling
│   │
│   ├── bottom_pane/                # FORKED: input + menus
│   │   ├── chat_composer.rs        # FORKED: text input
│   │   ├── approval_overlay.rs    # FORKED: permission dialogs
│   │   ├── footer.rs              # FORKED: status line
│   │   ├── list_selection_view.rs # FORKED: picker/menu
│   │   └── textarea.rs           # FORKED: text area widget
│   │
│   ├── history_cell.rs            # FORKED: transcript cell trait
│   ├── multi_agents.rs            # FORKED: multi-agent UI
│   │
│   ├── streaming/                  # FORKED: streaming animation
│   │   ├── controller.rs
│   │   ├── chunking.rs
│   │   └── commit_tick.rs
│   │
│   ├── render/                     # FORKED: rendering engine
│   │   ├── renderable.rs          # Renderable trait + layout primitives
│   │   ├── highlight.rs           # syntect syntax highlighting
│   │   └── line_utils.rs
│   │
│   ├── panels/                     # NEW: Orbit-specific panels
│   │   ├── mod.rs
│   │   ├── layout.rs             # Three-panel split layout
│   │   ├── left_sidebar/
│   │   │   ├── mod.rs
│   │   │   ├── session_tree.rs   # Session list with branching
│   │   │   ├── file_tree.rs      # Recursive file explorer
│   │   │   └── git_status.rs     # Git modified/staged files
│   │   └── right_panel/
│   │       ├── mod.rs
│   │       ├── code_viewer.rs    # Syntax-highlighted file viewer
│   │       ├── inline_comment.rs # "+" comment input overlay
│   │       └── diff_viewer.rs    # Git diff rendering
│   │
│   ├── exec_cell/                 # FORKED: command output
│   │   ├── render.rs
│   │   └── model.rs
│   │
│   └── tui/                       # FORKED: terminal management
│       ├── event_stream.rs
│       ├── frame_requester.rs
│       └── frame_rate_limiter.rs
│
└── tests/
    ├── test_utils.rs              # Buffer inspection helpers
    ├── test_chat.rs               # Chat rendering tests
    ├── test_slash_commands.rs     # Command menu tests
    ├── test_panels.rs            # Panel layout tests
    ├── test_code_viewer.rs       # Code viewer + "+" comment tests
    └── test_streaming.rs         # Streaming animation tests
```

### Dependencies

```toml
[dependencies]
# TUI framework (same versions as Codex)
ratatui = { version = "0.29.0", features = [
    "scrolling-regions",
    "unstable-backend-writer",
    "unstable-rendered-line-info",
    "unstable-widget-ref",
] }
crossterm = { version = "0.28.1", features = ["bracketed-paste", "event-stream"] }

# Async runtime
tokio = { version = "1", features = [
    "io-std", "macros", "process", "rt-multi-thread",
    "signal", "time"
] }

# HTTP + SSE client
reqwest = { version = "0.12", features = ["json"] }
reqwest-eventsource = "0.6"

# Syntax highlighting
syntect = "5"

# Serialization
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# Error handling
anyhow = "1"

# Clipboard (non-Android)
arboard = "3"
```

---

## 5. Panel Specifications

### 5.1 Three-Panel Layout

```rust
// panels/layout.rs

pub struct PanelLayout {
    pub left_visible: bool,      // Toggle with Ctrl+B
    pub right_visible: bool,     // Toggle with Ctrl+R
    pub left_width: u16,         // Default: 25 columns
    pub right_width: u16,        // Default: 45 columns
    pub left_active_tab: LeftTab,
    pub right_active_tab: RightTab,
}

pub enum LeftTab {
    Sessions,    // Session tree
    Files,       // File explorer
    Git,         // Git status
}

pub enum RightTab {
    CodeViewer,  // Syntax-highlighted file with "+" comments
    DiffView,    // Git diff for selected file
}
```

**Layout constraints:**

```rust
let chunks = Layout::horizontal([
    Constraint::Length(if layout.left_visible { layout.left_width } else { 0 }),
    Constraint::Min(40),  // Chat always gets at least 40 cols
    Constraint::Length(if layout.right_visible { layout.right_width } else { 0 }),
]).split(frame.area());
```

**Keyboard shortcuts:**

| Shortcut         | Action                             |
| ---------------- | ---------------------------------- |
| `Ctrl+B`         | Toggle left sidebar                |
| `Ctrl+R`         | Toggle right panel                 |
| `Ctrl+1`         | Focus left sidebar                 |
| `Ctrl+2`         | Focus chat panel                   |
| `Ctrl+3`         | Focus right panel                  |
| `Tab`            | Cycle focus between visible panels |
| `Alt+Left/Right` | Switch agent threads (from Codex)  |

### 5.2 Left Sidebar — Session Tree

**Data source:** `GET /session/?roots=true` + `GET /session/:id/children`

```
┌─ Sessions ─────────────┐
│ ▸ Fix auth bug      ●  │  ← active (green dot)
│   ├─ Fork: retry logic  │  ← child session
│   └─ Fork: refactor     │
│   Debug CSS layout      │
│   Refactor API layer    │
│   Add tests          ◌  │  ← idle (dim dot)
│                          │
│ [+] New Session          │
└──────────────────────────┘
```

**Interactions:**

- `j/k` — navigate sessions
- `Enter` — switch to selected session
- `n` — create new session (`POST /session/`)
- `d` — delete session (with confirmation)
- `a` — archive session (`PATCH /session/:id` with `time.archived`)
- `/` — search sessions (uses `search` query param)
- `f` — fork current session at last message (`POST /session/:id/fork`)

**Rendering:**

- Active session: green `●` dot, bold title
- Idle sessions: dim `◌` dot, normal text
- Child sessions: indented with `├─` / `└─` tree lines
- Session status from SSE `session.updated` events

### 5.3 Left Sidebar — File Tree

**Data source:** `GET /file?path=/project/root` (recursive on expand)

```
┌─ Files ────────────────┐
│ ▾ src/                  │
│   ▾ auth/               │
│     ● middleware.ts      │  ← modified (yellow dot)
│       handler.ts         │
│   ▾ api/                 │
│     + routes.ts          │  ← new file (green +)
│     ● client.ts          │
│   ▸ utils/               │  ← collapsed
│   package.json           │
│   tsconfig.json          │
└──────────────────────────┘
```

**Interactions:**

- `j/k` — navigate files
- `Enter` — open file in right panel code viewer
- `l` or `Right` — expand directory
- `h` or `Left` — collapse directory
- `r` — refresh tree
- `/` — fuzzy find file (uses `GET /find/file?query=...`)

**Git integration:**

- Modified files: yellow `●` prefix
- New/untracked files: green `+` prefix
- Deleted files: red `-` prefix (dimmed)
- Data from `GET /file/status?path=...` for visible files

### 5.4 Left Sidebar — Git Status

**Data source:** `GET /file/status` for project root, individual file diffs

```
┌─ Git: main ────────────┐
│                          │
│ Modified (2)             │
│   ● src/auth/middleware  │
│   ● src/api/client.ts    │
│                          │
│ Added (1)                │
│   + src/api/routes.ts    │
│                          │
│ Untracked (1)            │
│   ? .env.local           │
│                          │
│ Branch: feat/auth-fix    │
│ Ahead: 3  Behind: 0     │
└──────────────────────────┘
```

**Interactions:**

- `j/k` — navigate files
- `Enter` — show diff in right panel
- `d` — show inline diff (expand/collapse)

### 5.5 Center Panel — Chat (Forked from Codex)

This is the Codex `chatwidget.rs` + `chat_composer.rs` + `streaming/` — taken wholesale.

**Already included from Codex:**

- Streaming text rendering with newline-gated animation
- Markdown rendering with syntax highlighting
- Tool execution cells (Bash output, file reads/writes, patches)
- Slash command menu with fuzzy search (`/compact`, `/commit`, `/models`, etc.)
- Ghost text autocomplete on slash commands
- Approval overlay for tool permissions
- Multi-agent status (agent picker, status dots, Alt+Left/Right switching)
- Status bar (model, tokens, cost, reasoning effort)
- History navigation (Up/Down for previous messages)
- Bracketed paste support
- Image attachments (display as `[Image #N]` rows)

**Orbit-specific additions to chat:**

- **Model switching**: `/model` shows all 200+ available models from `GET /provider/`
- **Session forking**: `/fork` forks at the last message via `POST /session/:id/fork`
- **Revert**: `/undo` reverts last agent turn via `POST /session/:id/revert`
- **File mentions**: `@filename` autocomplete using `GET /find/file?query=...`
- **Agent selection**: `/agent` shows available agents from `GET /agent`

### 5.6 Right Panel — Code Viewer with "+" Comments

**Data source:** `GET /file/content?path=...` + syntect for highlighting

```
┌─ src/auth/middleware.ts ─────────────┐
│                                        │
│  1│ import { NextRequest } from 'next' │
│  2│ import { verify } from './jwt'     │
│  3│                                    │
│  4│ export async function auth(        │  ← cursor line (highlighted)
│  5│   req: NextRequest                 │
│  6│ ) {                                │
│  7│   const token = req.headers.get(   │
│  8│     'authorization'                │
│  9│   )                                │
│ 10│   if (!token) {                    │
│ 11│     return Response.json(          │
│ 12│       { error: 'Unauthorized' },   │
│ 13│       { status: 401 }              │
│ 14│     )                              │
│ 15│   }                                │
│ 16│   // TODO: add retry logic         │
│ 17│   const user = await verify(token) │
│ 18│   return user                      │
│ 19│ }                                  │
│                                        │
│ ┌─ Comment on line 4 ───────────────┐  │
│ │ make this function handle retry   │  │
│ │ with exponential backoff and add  │  │
│ │ proper error types                │  │
│ └───────────────────────────────────┘  │
│                                        │
│ [Enter] Send  [Esc] Cancel             │
└────────────────────────────────────────┘
```

**Interactions:**

- `j/k` — navigate lines
- `+` — open inline comment on current line
- `Enter` (in comment) — send as agent message with file context
- `Esc` — cancel comment
- `g g` / `G` — jump to top/bottom
- `Ctrl+D/U` — half-page scroll
- `/` — search within file
- `q` — close file viewer

**"+" Comment → Agent Message Pipeline:**

When the user presses Enter on a comment, the TUI constructs a message:

````
Context: In file src/auth/middleware.ts, at line 4:
```export async function auth(```

Instruction: make this function handle retry with exponential backoff and add proper error types
````

This is sent as a `POST /session/:id/message` with the constructed content. The agent receives the file path, line number, surrounding code context, and the user's instruction — everything it needs to make a targeted edit.

**Syntax highlighting:**

- Uses `syntect` (same as Codex `render/highlight.rs`)
- Language detection from file extension
- Theme matches terminal background (dark/light auto-detect via OSC 11)
- Line numbers in dimmed color, left-aligned with padding

### 5.7 Right Panel — Diff View

**Data source:** `GET /session/:id/diff?messageID=...` or `GET /file/status?path=...`

```
┌─ Diff: middleware.ts ────────────────┐
│                                        │
│  @@ -4,6 +4,15 @@                     │
│  4│  export async function auth(       │
│  5│    req: NextRequest                │
│  6│  ) {                               │
│  7│-   const token = req.headers.get(  │  ← red (deleted)
│  8│+   const token = await retry(      │  ← green (added)
│  9│+     () => req.headers.get(        │
│ 10│+       'authorization'             │
│ 11│+     ),                            │
│ 12│+     { maxRetries: 3,              │
│ 13│+       backoff: 'exponential' }    │
│ 14│+   )                               │
│ 15│                                    │
└────────────────────────────────────────┘
```

**Rendering:**

- Added lines: green foreground with `+` prefix
- Deleted lines: red foreground with `-` prefix
- Context lines: normal foreground, no prefix
- Hunk headers (`@@`): cyan, bold
- File path in header: bold

---

## 6. Testing Strategy

### 6.1 Unit Tests — Ratatui TestBackend

Every visual component is testable by rendering to an in-memory buffer and asserting on cell contents, colors, and modifiers.

```rust
// tests/test_utils.rs — shared helpers

/// Check if buffer contains text anywhere
pub fn buffer_contains(buf: &Buffer, text: &str) -> bool;

/// Check if a specific row contains text
pub fn buffer_row_contains(buf: &Buffer, row: u16, text: &str) -> bool;

/// Find which row contains the given text
pub fn find_row_containing(buf: &Buffer, text: &str) -> Option<u16>;

/// Get full text content of a row
pub fn buffer_row_text(buf: &Buffer, row: u16) -> String;

/// Assert a cell has specific character, color, and modifier
pub fn assert_styled(
    buf: &Buffer, x: u16, y: u16,
    expected_char: &str,
    expected_fg: Color,
    expected_modifier: Modifier,
);

/// Print full buffer for debugging (used in test failure output)
pub fn print_buffer_debug(buf: &Buffer);
```

**Example test categories:**

```rust
// Slash command autocomplete
#[test] fn slash_command_opens_menu_on_slash() { ... }
#[test] fn slash_command_filters_on_typing() { ... }
#[test] fn slash_command_ghost_text_is_dimmed() { ... }
#[test] fn tab_completes_slash_command() { ... }
#[test] fn arrow_keys_navigate_menu() { ... }
#[test] fn enter_executes_selected_command() { ... }
#[test] fn esc_closes_menu() { ... }

// Code viewer
#[test] fn code_viewer_shows_line_numbers() { ... }
#[test] fn code_viewer_highlights_cursor_line() { ... }
#[test] fn plus_opens_inline_comment() { ... }
#[test] fn comment_sends_message_with_context() { ... }

// Panel layout
#[test] fn ctrl_b_toggles_left_sidebar() { ... }
#[test] fn ctrl_r_toggles_right_panel() { ... }
#[test] fn panels_resize_correctly() { ... }

// Session tree
#[test] fn session_tree_shows_active_dot() { ... }
#[test] fn session_tree_shows_children_indented() { ... }

// Streaming
#[test] fn streaming_renders_partial_lines() { ... }
#[test] fn streaming_batch_catches_up() { ... }

// Multi-agent
#[test] fn agent_picker_shows_status_dots() { ... }
#[test] fn alt_arrows_switch_agents() { ... }
```

### 6.2 E2E Tests — PTY Scripting

For end-to-end tests that verify the real binary against a real orbit-server:

```bash
#!/bin/bash
# tests/e2e/test_slash_commands.sh

export TERM=xterm-256color

expect -c '
    spawn ./target/debug/orbit --test-server localhost:4096
    sleep 0.3

    # Type "/" to open command menu
    send "/"
    sleep 0.2
    expect "compact" { } timeout { puts "FAIL: menu did not open"; exit 1 }

    # Type "com" to filter
    send "com"
    sleep 0.1
    expect "compact" { } timeout { puts "FAIL: filter failed"; exit 1 }

    # Tab to complete
    send "\t"
    sleep 0.1
    expect "/compact" { puts "PASS: autocomplete works" } timeout { exit 1 }

    send "q"
'
```

### 6.3 AI-Driven Development Loop

This is the key advantage over GUI development. Claude Code (or any AI coding agent) can:

1. **Write a feature** → Ratatui widget code
2. **Write a TestBackend test** → assert on buffer contents (text, colors, modifiers)
3. **Run `cargo test`** → instant feedback (sub-second)
4. **Read the failure** → "expected DarkGray at (5,23), got White"
5. **Fix the code** → targeted fix based on precise error
6. **Repeat** → until all tests pass

Then for E2E validation:

1. **Write an `expect` script** → drive the real CLI with keystrokes
2. **Run the script** → full binary, real terminal, ~1 second total
3. **Read output** → PASS/FAIL with context
4. **Fix** → iterate

**The feedback loop is 2 seconds per iteration.** Compare to Playwright (30+ seconds per iteration for a GUI app). This is why AI can build CLI features 10-50x faster than GUI features.

---

## 7. orbit-server Integration

### 7.1 Server Lifecycle

The `orbit` binary manages the server process:

```rust
// main.rs

async fn main() {
    let args = parse_args();

    // 1. Find or start orbit-server
    let server_port = match find_running_server().await {
        Some(port) => port,
        None => {
            // Spawn orbit-server as background process
            let port = find_available_port(4096..4196);
            spawn_server(port).await?;
            wait_for_health(port, 40, Duration::from_millis(250)).await?;
            port
        }
    };

    // 2. Create HTTP+SSE client
    let client = OrbitHttpClient::new(format!("http://127.0.0.1:{}", server_port));

    // 3. Subscribe to global SSE events
    let event_stream = client.subscribe_events().await?;

    // 4. Launch TUI
    let app = App::new(client, event_stream);
    app.run().await?;
}
```

**Health check:** `GET /global/health` — retries 40 times at 250ms intervals (same pattern as Tauri sidecar).

### 7.2 SSE Event Stream

The TUI subscribes to `GET /event` (workspace-scoped SSE) for real-time updates:

```rust
// orbit_client/sse.rs

pub async fn subscribe(base_url: &str) -> Result<EventStream> {
    let url = format!("{}/event", base_url);
    let source = reqwest_eventsource::EventSource::get(&url);

    // Process events in background task
    tokio::spawn(async move {
        while let Some(event) = source.next().await {
            match event {
                Ok(Event::Message(msg)) => {
                    let orbit_event: OrbitSSEEvent = serde_json::from_str(&msg.data)?;
                    let codex_event = translate_to_event_msg(orbit_event);
                    event_tx.send(codex_event)?;
                }
                Ok(Event::Open) => { /* connected */ }
                Err(e) => {
                    // Reconnect logic
                    tokio::time::sleep(Duration::from_secs(1)).await;
                }
            }
        }
    });
}
```

**Heartbeat:** Server sends `server.heartbeat` every 10 seconds. If no heartbeat for 30 seconds, reconnect.

### 7.3 Key API Endpoints Used by TUI

| TUI Action            | Endpoint                          | Method                    |
| --------------------- | --------------------------------- | ------------------------- |
| Send message          | `/session/:id/message`            | POST (streaming response) |
| Abort generation      | `/session/:id/abort`              | POST                      |
| Create session        | `/session/`                       | POST                      |
| List sessions         | `/session/?roots=true`            | GET                       |
| Get session children  | `/session/:id/children`           | GET                       |
| Fork session          | `/session/:id/fork`               | POST                      |
| Revert (undo)         | `/session/:id/revert`             | POST                      |
| Approve permission    | `/permission/:id/reply`           | POST                      |
| Answer question       | `/question/:id/reply`             | POST                      |
| List providers/models | `/provider/`                      | GET                       |
| List files            | `/file?path=...`                  | GET                       |
| Read file content     | `/file/content?path=...`          | GET                       |
| File git status       | `/file/status?path=...`           | GET                       |
| Search files          | `/find/file?query=...`            | GET                       |
| Search content        | `/find?pattern=...`               | GET                       |
| Get diff              | `/session/:id/diff?messageID=...` | GET                       |
| Get VCS info          | `/vcs`                            | GET                       |
| Health check          | `/global/health`                  | GET                       |
| List agents           | `/agent`                          | GET                       |
| List skills           | `/skill`                          | GET                       |
| Server log            | `/log`                            | POST                      |

---

## 8. Development Phases

### Phase 1: Foundation (Days 1-4)

**Goal:** Codex TUI fork compiles and renders basic chat against orbit-server.

- [ ] Fork `codex-rs/tui/` into `orbit-cli/` crate
- [ ] Strip all codex-\* backend crate dependencies
- [ ] Create `orbit_client` module with `OrbitThread` stub
- [ ] Implement HTTP client (`reqwest` → orbit-server)
- [ ] Implement SSE stream consumer (`reqwest-eventsource`)
- [ ] Map `POST /session/:id/message` → `Op::UserTurn` → streaming response
- [ ] Map SSE events → `EventMsg` variants (text delta, turn complete)
- [ ] Get basic chat working: type message → see streaming response
- [ ] Write first TestBackend tests: message renders, streaming works

### Phase 2: Full Chat (Days 5-8)

**Goal:** Complete chat experience with tools, permissions, slash commands.

- [ ] Map tool events (bash output, file read/write) to Codex ExecCell rendering
- [ ] Wire permission requests (`permission.requested` SSE → approval overlay)
- [ ] Wire question requests (`question.asked` SSE → input dialog)
- [ ] Connect slash command menu to orbit-server (`/provider/`, `/agent`, `/skill`)
- [ ] Implement `/model` command — list 200+ models, switch
- [ ] Implement `/undo` → `POST /session/:id/revert`
- [ ] Implement `/fork` → `POST /session/:id/fork`
- [ ] Connect session create/switch to API
- [ ] Write tests for each command, each tool widget, permissions

### Phase 3: Panels (Days 9-14)

**Goal:** Three-panel layout with file tree, code viewer, git status.

- [ ] Implement `PanelLayout` with resizable splits
- [ ] Build session tree widget (left sidebar tab 1)
- [ ] Build file tree widget (left sidebar tab 2)
- [ ] Build git status widget (left sidebar tab 3)
- [ ] Build code viewer widget (right panel tab 1) with syntect highlighting
- [ ] Build diff viewer widget (right panel tab 2)
- [ ] Implement "+" inline comment system
- [ ] Wire "+" comment → agent message with file context
- [ ] Implement all keyboard shortcuts (Ctrl+B, Ctrl+R, Ctrl+1/2/3, Tab)
- [ ] Write tests for panel toggles, file tree expand/collapse, code viewer navigation

### Phase 4: Polish (Days 15-20)

**Goal:** Ship-ready experience.

- [ ] Multi-agent swarm dashboard (extend Codex multi_agents.rs)
- [ ] Agent status indicators in status bar
- [ ] Session branching visualization in session tree
- [ ] File watcher integration (auto-refresh file tree on changes)
- [ ] Theme support (dark/light auto-detect via OSC 11, manual override)
- [ ] Clipboard integration (copy from chat, code viewer)
- [ ] Search within chat transcript
- [ ] `@file` mention autocomplete in chat input
- [ ] E2E test suite (PTY scripts for critical flows)
- [ ] Performance profiling and optimization
- [ ] Error handling: server disconnect → reconnect, graceful degradation

### Phase 5: Ghostty Integration (Days 21-25)

**Goal:** Orbit Terminal native macOS app.

- [ ] Fork Ghostty repo (or configure to launch `orbit` binary)
- [ ] Rebrand: "Orbit Terminal" title, icon, about dialog
- [ ] Configure default shell command to launch `orbit`
- [ ] Optimize font rendering for code (ligatures, variable weight)
- [ ] Test on ProMotion displays (120fps)
- [ ] Package as `.dmg` / `.app` for distribution

---

## 9. Technical Reference

### 9.1 Ratatui Version & Features

```toml
# Exact version used by Codex (our baseline)
ratatui = "0.29.0"

# Features:
# - scrolling-regions: Terminal scrolling support
# - unstable-backend-writer: Low-level backend writing
# - unstable-rendered-line-info: Line info for measurement
# - unstable-widget-ref: WidgetRef for trait object rendering
```

**Note:** Codex uses a patched fork of ratatui 0.29.0 (`nornagon-v0.29.0-patch` branch). Evaluate whether the patches are needed or if upstream 0.29.0 suffices.

### 9.2 Codex Protocol Types (Complete Reference)

**Op variants (user → agent):** 30+ variants including:
`UserTurn`, `Interrupt`, `ExecApproval`, `PatchApproval`, `UserInputAnswer`, `RequestPermissionsResponse`, `ListMcpTools`, `ListSkills`, `ListModels`, `Compact`, `Undo`, `ThreadRollback`, `SetThreadName`, `Shutdown`, `RunUserShellCommand`, `Review`, `AddToHistory`, `OverrideTurnContext`, `ResolveElicitation`, `DynamicToolResponse`, `RefreshMcpServers`, `ReloadUserConfig`, `ListCustomPrompts`, `DropMemories`, `UpdateMemories`, `CleanBackgroundTerminals`, `ListRemoteSkills`, `DownloadRemoteSkill`, `GetHistoryEntryRequest`

**EventMsg variants (agent → user):** 65+ variants including:
`AgentMessageDelta`, `AgentMessage`, `AgentReasoningDelta`, `TurnStarted`, `TurnComplete`, `TurnAborted`, `ExecCommandBegin`, `ExecCommandOutputDelta`, `ExecCommandEnd`, `ExecApprovalRequest`, `RequestPermissions`, `RequestUserInput`, `McpToolCallBegin`, `McpToolCallEnd`, `TokenCount`, `SessionConfigured`, `CollabAgentSpawnBegin/End`, `CollabWaitingBegin/End`, `CollabCloseEnd`, `PatchApplyBegin/End`, `WebSearchBegin/End`, `ImageGenerationBegin/End`, `PlanDelta`, `BackgroundEvent`, `UndoStarted/Completed`, `ShutdownComplete`, `Warning`, `Error`

**See:** `/reference/codex/codex-rs/protocol/src/protocol.rs` for exact type definitions.

### 9.3 orbit-server API (Complete Reference)

**Base URL:** `http://localhost:4096` (port range 4096-4196)

**Core routes:**

- `/global/health` (GET) — health check
- `/global/event` (GET SSE) — global event stream
- `/session/` (GET, POST) — session CRUD
- `/session/:id/message` (GET, POST) — messages + streaming
- `/session/:id/abort` (POST) — cancel generation
- `/session/:id/fork` (POST) — fork at message
- `/session/:id/revert` (POST) — undo last turn
- `/session/:id/diff` (GET) — file changes per message
- `/permission/` (GET) — pending permissions
- `/permission/:id/reply` (POST) — approve/deny
- `/question/` (GET) — pending questions
- `/question/:id/reply` (POST) — answer
- `/provider/` (GET) — models and providers
- `/file` (GET) — directory listing
- `/file/content` (GET) — read file
- `/file/status` (GET) — git status
- `/find` (GET) — content search (ripgrep)
- `/find/file` (GET) — file name search
- `/agent` (GET) — available agents
- `/skill` (GET) — available skills
- `/mcp/` (GET, POST) — MCP servers
- `/vcs` (GET) — git branch info
- `/config/` (GET, PATCH) — configuration

**SSE event types:**
`session.created`, `session.updated`, `session.deleted`, `message.created`, `message.streamed`, `message.completed`, `permission.requested`, `permission.responded`, `question.asked`, `question.answered`, `tool.started`, `tool.completed`, `server.heartbeat`

**See:** OpenAPI docs at `http://localhost:4096/doc` when server is running.

### 9.4 Keyboard Shortcut Map (Complete)

| Context          | Shortcut      | Action                           |
| ---------------- | ------------- | -------------------------------- |
| **Global**       | `Ctrl+B`      | Toggle left sidebar              |
| **Global**       | `Ctrl+R`      | Toggle right panel               |
| **Global**       | `Ctrl+1`      | Focus left sidebar               |
| **Global**       | `Ctrl+2`      | Focus center (chat)              |
| **Global**       | `Ctrl+3`      | Focus right panel                |
| **Global**       | `Tab`         | Cycle panel focus                |
| **Global**       | `Ctrl+C`      | Interrupt agent / copy selection |
| **Global**       | `Alt+Left`    | Previous agent thread            |
| **Global**       | `Alt+Right`   | Next agent thread                |
| **Chat**         | `Enter`       | Send message                     |
| **Chat**         | `Up/Down`     | History navigation               |
| **Chat**         | `/`           | Open slash command menu          |
| **Chat**         | `@`           | File mention autocomplete        |
| **Chat**         | `Esc`         | Close menu / cancel              |
| **Session Tree** | `j/k`         | Navigate                         |
| **Session Tree** | `Enter`       | Switch session                   |
| **Session Tree** | `n`           | New session                      |
| **Session Tree** | `d`           | Delete session                   |
| **Session Tree** | `f`           | Fork session                     |
| **Session Tree** | `/`           | Search sessions                  |
| **File Tree**    | `j/k`         | Navigate                         |
| **File Tree**    | `Enter`       | Open in code viewer              |
| **File Tree**    | `l` / `Right` | Expand directory                 |
| **File Tree**    | `h` / `Left`  | Collapse directory               |
| **File Tree**    | `/`           | Fuzzy find file                  |
| **Code Viewer**  | `j/k`         | Navigate lines                   |
| **Code Viewer**  | `+`           | Open inline comment              |
| **Code Viewer**  | `g g`         | Jump to top                      |
| **Code Viewer**  | `G`           | Jump to bottom                   |
| **Code Viewer**  | `Ctrl+D/U`    | Half-page scroll                 |
| **Code Viewer**  | `/`           | Search in file                   |
| **Code Viewer**  | `q`           | Close viewer                     |
| **Comment**      | `Enter`       | Send comment as message          |
| **Comment**      | `Esc`         | Cancel comment                   |
| **Git Status**   | `j/k`         | Navigate files                   |
| **Git Status**   | `Enter`       | Show diff in right panel         |
| **Git Status**   | `d`           | Toggle inline diff               |

---

## 10. Risk Assessment

| Risk                                                        | Likelihood | Impact | Mitigation                                                                  |
| ----------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------- |
| Codex fork has hidden coupling to OpenAI internals          | Low        | Medium | Codex protocol is well-abstracted; strip unused crates early                |
| Ratatui patched fork diverges from upstream                 | Medium     | Low    | Evaluate if patches are needed; prefer upstream 0.29.0                      |
| orbit-server SSE events don't map cleanly to Codex EventMsg | Medium     | Medium | Build translation layer early; add missing events to orbit-server if needed |
| File tree performance on large repos (100k+ files)          | Medium     | Medium | Lazy loading (only expand visible dirs), debounced refresh                  |
| "+" comment UX is confusing for new users                   | Low        | Low    | Add onboarding tooltip; clear keybinding hints in UI                        |
| Multi-agent UI from Codex doesn't match orbit-server agents | Medium     | Medium | Adapt agent model; orbit-server already supports multiple agents            |

---

## 11. Success Criteria

The Orbit CLI is "100x better than Claude Code" when:

- [ ] **Startup < 100ms** (vs Claude Code's 3-4 seconds)
- [ ] **Memory < 30MB** (vs Claude Code's 360MB)
- [ ] **Zero flicker** in 100% of sessions (vs Claude Code's 1/3 failure rate)
- [ ] **200+ models** accessible via `/model` command
- [ ] **File tree** shows project structure with git status indicators
- [ ] **Code viewer** renders any file with syntax highlighting
- [ ] **"+" commenting** sends targeted instructions to the agent
- [ ] **Git diff** view shows changes per agent turn
- [ ] **Session branching** with visual tree in sidebar
- [ ] **All features testable** via `cargo test` with TestBackend (no Playwright needed)
- [ ] **AI can iterate** on features in <2 second feedback loops

---

## Appendix A: File Reference

| File                    | Location                                                         | Purpose                       |
| ----------------------- | ---------------------------------------------------------------- | ----------------------------- |
| This spec               | `docs/plans/tracked/todo/terminal-app/ORBIT-CLI-RATATUI-SPEC.md` | Primary reference             |
| Old design (superseded) | `docs/plans/tracked/todo/terminal-app/orbit-terminal-design.md`  | SwiftUI approach (archived)   |
| Old plan (superseded)   | `docs/plans/tracked/todo/terminal-app/orbit-terminal-plan.md`    | SwiftUI tasks (archived)      |
| CLI distribution        | `docs/plans/tracked/todo/ORBIT-CLI-DISTRIBUTION.md`              | Install script, binary naming |
| Codex TUI reference     | `reference/codex/codex-rs/tui/`                                  | Source code to fork           |
| Codex protocol          | `reference/codex/codex-rs/protocol/src/protocol.rs`              | Op/EventMsg definitions       |
| OpenCode engine         | `Agent-backend/packages/opencode/`                               | Backend source                |
| OpenCode server routes  | `Agent-backend/packages/opencode/src/server/`                    | HTTP API handlers             |
| Tauri sidecar spawn     | `src-tauri/src/opencode/process.rs`                              | Server lifecycle reference    |

## Appendix B: Conversation Context

This spec was developed through a detailed technical conversation covering:

1. **Ratatui vs Ink vs opentui comparison** — Ratatui chosen for zero-flicker rendering, 15MB memory, 50ms startup
2. **Codex TUI analysis** — 380KB chatwidget, 374KB composer, multi-agent UI, streaming controller
3. **Codex fork feasibility** — Apache 2.0 license, one-interface surgery (CodexThread → OrbitThread)
4. **Testing strategy** — TestBackend pixel-perfect assertions, PTY scripting for E2E, AI-driven dev loop
5. **"+" inline commenting** — the differentiating feature no other CLI has
6. **Architecture decision** — ALL panels in Ratatui (no SwiftUI), orbit-server as separate process

Key architectural insight: The Codex TUI rendering layer has zero knowledge of the backend. It only knows `submit(Op)` and `next_event() → EventMsg`. Replace that one interface, inherit 380KB of battle-tested chat rendering for free.
