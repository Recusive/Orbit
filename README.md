<p align="center">
  <img src="src-tauri/icons/app-icons/orbit-primary/icon-Default.png" alt="Orbit" width="128" />
</p>

<h1 align="center">Orbit</h1>

<p align="center">
  <strong>Built for the way software gets built now.</strong><br/>
  AI-native development environment. Full context. Zero switching. One agent across everything you build with.
</p>

<p align="center">
  <a href="https://github.com/Recusive/Orbit/actions/workflows/ci.yml"><img src="https://github.com/Recusive/Orbit/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/Tauri-2.0-24C8D8?logo=tauri&logoColor=white" alt="Tauri" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Rust-1.85-DEA584?logo=rust&logoColor=black" alt="Rust" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/macOS-Apple%20Silicon-000000?logo=apple&logoColor=white" alt="macOS" />
</p>

---

## What is Orbit

Orbit is an AI-native development environment — a native desktop app where one AI agent works across every surface you build with: editor, browser, terminal, and docs. The agent builds its own context from all of these surfaces rather than relying on you to provide it.

In most AI coding tools, the agent writes code but can't see your running app. You copy error logs from the browser and paste them into the chat. You screenshot a UI bug and describe it. The agent works with whatever context you give it — and wrong context means wrong code.

Orbit eliminates that gap. The agent takes screenshots of your browser. It reads your terminal output. It sees your code. It reads your docs. It builds its own understanding instead of depending on yours.

---

## V1 Surfaces

### Agent

- Full conversational AI agent powered by the Claude Agent SDK
- Sub-agents for delegated, parallel task execution
- Configurable interaction: plan-first mode (shows plan, you approve) or direct execution
- Slash commands for quick actions
- Skills system — add, remove, and create custom agent skills
- Skills marketplace — browse and install from 20,000+ community skills (skills.sh) directly inside Orbit
- Plugin architecture for extensibility
- MCP creator built in — create Model Context Protocol servers inside Orbit
- BYOK — bring your own Anthropic API key, no token markup
- Claude OAuth — sign in with any Claude account (Free, Pro, Max) and start building. No API key required.

### Editor

- CodeMirror 6 with full language server protocol (LSP) support
- Syntax highlighting, autocomplete, and code intelligence for major languages
- Complete file system access and management
- Git A-Z — staging, commits, branches, merges, diffs, history, push/pull

### Browser

- Embedded browser inside the development environment
- Agent takes screenshots — it visually sees your running app
- Full autonomous agent control — navigate, click, scroll, fill forms without human input
- Click-to-select: click any element in your running app, then tell the agent what to change

### Terminal

- Integrated terminal with tabbed interface
- Agent has full terminal access for commands, scripts, and process management

### Vault

- Built-in markdown editor for notes, documentation, planning, and PRDs
- Agent reads vault content as context while building

---

## What V1 Does Not Have

Be informed before you download:

- **No VS Code extensions** — Orbit has its own skills/plugin system
- **No inline code completions** — all AI interaction is through the agent conversation
- **Claude only** — multi-model support is on the roadmap
- **macOS only** (Apple Silicon) — Windows and Linux coming
- **No canvas/whiteboard**
- **No one-click deploy**

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        Orbit Desktop App                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Rust Backend (Tauri Main Process)                             │ │
│  │                                                                │ │
│  │  src-tauri/          Commands & app entry point                │ │
│  │  crates/common/      Shared Rust libraries                    │ │
│  │    ├── core/         Text editing, diagnostics                │ │
│  │    ├── fs/           File system + watching                   │ │
│  │    ├── git/          Git operations (git2)                    │ │
│  │    ├── terminal/     PTY management (portable-pty)            │ │
│  │    ├── settings/     Config persistence                       │ │
│  │    ├── lsp/          Language server protocol                 │ │
│  │    ├── search/       Ripgrep integration                      │ │
│  │    ├── ai/           Claude API types                         │ │
│  │    └── conversations/ Chat history storage                    │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                              │ Tauri IPC                            │
│                              │                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  React Frontend (Webview)                                     │ │
│  │                                                                │ │
│  │  apps/agent/         Main chat & editor UI                    │ │
│  │  apps/editor/        Standalone editor (stub)                 │ │
│  │  apps/common/        Shared React utilities                   │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                              │ Spawned as sidecar                   │
│                              │                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Agent Bridge (Bun Sidecar)                                   │ │
│  │                                                                │ │
│  │  agent-bridge/       Claude Agent SDK integration             │ │
│  │                      Compiled to standalone Bun binary        │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Communication Flow

```text
User Input → React UI → Tauri IPC → Rust Backend
                                         │
                                         ├── File ops (orbit-fs)
                                         ├── Git ops (orbit-git)
                                         ├── Terminal (orbit-terminal)
                                         └── AI → Agent Bridge (sidecar)
                                                      │
                                                      └── Claude API
```

---

## Technology Stack

### Frontend

| Technology          | Purpose                          |
| ------------------- | -------------------------------- |
| **React 19**        | UI framework with React Compiler |
| **TypeScript 5.7**  | Type safety                      |
| **Vite 7**          | Build tooling                    |
| **Tailwind CSS v4** | Styling                          |
| **Zustand + Immer** | State management                 |
| **CodeMirror 6**    | Code editor                      |
| **xterm.js**        | Terminal emulation               |
| **Shiki**           | Syntax highlighting (chat)       |
| **Radix UI**        | Accessible primitives            |
| **Zod 4**           | Runtime validation               |

### Backend (Rust)

| Technology       | Purpose           |
| ---------------- | ----------------- |
| **Tauri 2**      | Desktop framework |
| **Tokio**        | Async runtime     |
| **git2**         | Git operations    |
| **notify**       | File watching     |
| **portable-pty** | Terminal PTY      |
| **tower-lsp**    | LSP support       |
| **serde**        | Serialization     |

### Agent Bridge

| Technology            | Purpose           |
| --------------------- | ----------------- |
| **Bun**               | Runtime & bundler |
| **Claude Agent SDK**  | AI integration    |
| **Standalone binary** | Compiled sidecar  |

---

## Development

### Prerequisites

- macOS (Apple Silicon)
- Bun 1.1+
- Rust 1.85+
- Node.js 22+

### Quick Start

```bash
# Clone and install
git clone https://github.com/Recursive/Snowflake-V0.git
cd Snowflake-V0
bun install

# Run the full app (Vite + Tauri + Rust)
bunx tauri dev
```

### Commands

| Command                 | Description                       |
| ----------------------- | --------------------------------- |
| `bunx tauri dev`        | Start full app with hot-reload    |
| `bun run dev`           | Frontend only (port 5176)         |
| `bun run build`         | Production build                  |
| `bun run typecheck`     | TypeScript check                  |
| `bun run lint`          | ESLint (zero warnings)            |
| `bun run check`         | TypeScript + ESLint + tests       |
| `bun run ci`            | Full CI: typecheck + lint + tests |
| `bunx tauri build`      | Build distributable (.dmg)        |
| `./scripts/lint-all.sh` | Comprehensive lint (all checks)   |

> **Note:** This project uses Bun exclusively. Never use `npm` or `pnpm`.

### Hot Reload Behavior

| Change           | Reload                      |
| ---------------- | --------------------------- |
| React/TypeScript | Instant HMR                 |
| CSS/Tailwind     | Instant HMR                 |
| Rust code        | Auto-rebuild + restart      |
| agent-bridge     | **Manual rebuild required** |

### Agent Bridge Rebuilding

The agent-bridge is a compiled Bun binary. Changes require manual rebuild:

```bash
cd agent-bridge
bun run build:dev    # → target/debug/agent-bridge
```

Then restart Tauri (`Cmd+C` → `bunx tauri dev`).

---

## Project Structure

```text
Orbit/
│
├── apps/                           # Frontend applications (React)
│   ├── agent/                      # Main app (chat, editor, browser, vault)
│   │   ├── src/
│   │   │   ├── components/         # UI components
│   │   │   │   ├── ui/             # Radix primitives (button, dialog, etc.)
│   │   │   │   ├── chat/           # Chat messages, markdown, tools
│   │   │   │   ├── editor/         # CodeMirror editor
│   │   │   │   ├── terminal/       # xterm.js terminal
│   │   │   │   ├── files/          # File explorer, icons
│   │   │   │   ├── layout/         # Panels, sidebar, header
│   │   │   │   └── activity/       # Git status, diffs
│   │   │   ├── hooks/              # React hooks
│   │   │   ├── stores/             # Zustand state
│   │   │   ├── providers/          # Context providers
│   │   │   ├── services/           # Business logic
│   │   │   ├── types/              # TypeScript definitions
│   │   │   └── lib/                # Utilities
│   │   └── index.html
│   │
│   ├── editor/                     # Standalone editor (stub)
│   │
│   └── common/                     # Shared React code
│       └── src/utils/              # Shared utilities (cn, etc.)
│
├── agent-bridge/                   # Claude Agent SDK sidecar
│   ├── src/                        # TypeScript source
│   ├── dist/                       # Compiled JS (bun build)
│   └── package.json                # Uses Bun runtime
│
├── crates/                         # Rust libraries
│   └── common/                     # Shared crates
│       ├── core/                   # Text buffer, document, diagnostics
│       ├── fs/                     # File ops, directory listing, watcher
│       ├── git/                    # Git2 wrapper
│       ├── terminal/               # PTY via portable-pty
│       ├── settings/               # JSON config persistence
│       ├── lsp/                    # Language server management
│       ├── search/                 # Ripgrep wrapper
│       ├── ai/                     # AI types and traits
│       ├── conversations/          # Chat history storage
│       └── syntax/                 # Syntax highlighting (stub)
│
├── src-tauri/                      # Tauri app entry
│   ├── src/
│   │   ├── commands/               # IPC command handlers
│   │   │   ├── common/             # Shared commands
│   │   │   │   ├── files.rs
│   │   │   │   ├── terminal.rs
│   │   │   │   ├── git.rs
│   │   │   │   ├── workspace.rs
│   │   │   │   └── settings.rs
│   │   │   └── agent/              # Agent-specific commands
│   │   │       ├── agent.rs
│   │   │       ├── ai.rs
│   │   │       └── conversations.rs
│   │   ├── agent/                  # Sidecar bridge (Rust side)
│   │   ├── core/                   # App core (devmonitor, etc.)
│   │   ├── lib.rs
│   │   └── main.rs
│   ├── tauri.conf.json             # Tauri configuration
│   └── Cargo.toml
│
├── packages/                       # NPM packages
│   └── shared-schemas/             # Zod schemas shared across apps
│
├── docs/                           # Documentation
│
├── Cargo.toml                      # Rust workspace root
├── package.json                    # Bun workspace root
├── bun.lockb                       # Bun lockfile
├── vite.config.ts                  # Vite (agent app)
├── tsconfig.json                   # TypeScript (main)
└── CLAUDE.md                       # AI assistant guide
```

---

## State Management

Zustand stores in `apps/agent/src/stores/`:

| Store               | Purpose                               |
| ------------------- | ------------------------------------- |
| `ui-store`          | Panel layout, dimensions, active tabs |
| `chat-store`        | Conversations, messages               |
| `agent-store`       | Task execution state                  |
| `terminal-store`    | xterm sessions                        |
| `file-store`        | File tree state                       |
| `file-viewer-store` | Open tabs, content, modified state    |
| `git-store`         | Branch, status, ahead/behind          |
| `tool-store`        | Tool execution visualization          |
| `browser-store`     | Embedded browser state                |
| `checkpoint-store`  | File rewind checkpoints               |

---

## Frontend-Backend Communication

### Protocol Types

All messages defined in `apps/agent/src/types/protocol.ts` with Zod schemas.

**Frontend → Backend (WebviewMessage):**

- `message:send` - Send chat message
- `agent:stop` - Stop AI generation
- `file:read`, `file:write` - File operations
- `terminal:create`, `terminal:write` - Terminal operations
- `conversation:create`, `conversation:load` - Chat history

**Backend → Frontend (ExtensionMessage):**

- `agent:chunk`, `agent:complete` - AI streaming
- `tool:start`, `tool:end` - Tool execution
- `terminal:output`, `terminal:created` - Terminal data
- `conversation:loaded`, `conversation:rewound` - History

---

## Code Quality

| Area           | Rules                                          |
| -------------- | ---------------------------------------------- |
| **TypeScript** | Maximum strictness, no `any`, explicit returns |
| **ESLint**     | Zero warnings tolerance                        |
| **Rust**       | Zero unsafe, clippy pedantic                   |
| **Pre-commit** | Husky + lint-staged                            |
| **Pre-push**   | Full test suite                                |

---

## On the Roadmap

These are upcoming — not in V1:

- Multi-model support (OpenAI, Google, local models)
- Windows and Linux builds
- Specialized agents: Tester, PR Reviewer, Research, DevOps
- Visual canvas / design surface
- Inline code completions
- One-click deploy integration

---

## Build Outputs

```bash
bunx tauri build
```

Outputs in `src-tauri/target/release/bundle/`:

- **macOS**: `.dmg`, `.app`

---

Built by [Recursive Labs](https://orbit.build)
