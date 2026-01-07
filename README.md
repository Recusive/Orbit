# Orbit

> AI-Powered Code Editor Built with Tauri 2 + React 19

[![CI](https://github.com/Recusive/Orbit/actions/workflows/ci.yml/badge.svg)](https://github.com/Recusive/Orbit/actions/workflows/ci.yml)
![Tauri](https://img.shields.io/badge/Tauri-2.0-24C8D8?logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Rust](https://img.shields.io/badge/Rust-1.85-DEA584?logo=rust&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)

---

## Overview

Orbit is a desktop AI code editor that combines Claude AI with a full-featured IDE. It's built as a Tauri 2 app with a Rust backend and React 19 frontend, designed for agentic coding workflows.

### Key Capabilities

| Feature             | Description                                               |
| ------------------- | --------------------------------------------------------- |
| **Claude AI Chat**  | Streaming responses, tool execution, conversation history |
| **Code Editor**     | CodeMirror 6 with 10+ languages, custom themes            |
| **Terminal**        | Full PTY terminal via xterm.js                            |
| **File Explorer**   | Tree navigation with real-time watching                   |
| **Git Integration** | Stage, commit, diff, branch, log                          |
| **Canvas Mode**     | Visual node-based workflows (ReactFlow)                   |
| **Cross-Platform**  | macOS, Windows, Linux                                     |

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        Orbit Desktop App                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Rust Backend (Tauri Main Process)                              │ │
│  │                                                                  │ │
│  │  src-tauri/          Commands & app entry point                 │ │
│  │  crates/common/      Shared Rust libraries                      │ │
│  │    ├── core/         Text editing, diagnostics                  │ │
│  │    ├── fs/           File system + watching                     │ │
│  │    ├── git/          Git operations (git2)                      │ │
│  │    ├── terminal/     PTY management (portable-pty)              │ │
│  │    ├── settings/     Config persistence                         │ │
│  │    ├── lsp/          Language server protocol                   │ │
│  │    ├── search/       Ripgrep integration                        │ │
│  │    ├── ai/           Claude API types                           │ │
│  │    └── conversations/ Chat history storage                      │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │                                       │
│                              │ Tauri IPC                             │
│                              │                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  React Frontend (Webview)                                       │ │
│  │                                                                  │ │
│  │  apps/agent/         Main chat & editor UI                      │ │
│  │  apps/canvas/        Visual workflow canvas                     │ │
│  │  apps/editor/        Standalone editor (stub)                   │ │
│  │  apps/common/        Shared React utilities                     │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │                                       │
│                              │ Spawned as sidecar                    │
│                              │                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Agent Bridge (Bun Sidecar)                                     │ │
│  │                                                                  │ │
│  │  agent-bridge/       Claude Agent SDK integration               │ │
│  │                      Compiled to standalone Bun binary          │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
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

## Project Structure

```text
Orbit/
│
├── apps/                           # Frontend applications (React)
│   ├── agent/                      # Main chat/editor app
│   │   ├── src/
│   │   │   ├── components/         # 90+ UI components
│   │   │   │   ├── ui/             # Radix primitives (button, dialog, etc.)
│   │   │   │   ├── chat/           # Chat messages, markdown, tools
│   │   │   │   ├── editor/         # CodeMirror editor
│   │   │   │   ├── terminal/       # xterm.js terminal
│   │   │   │   ├── files/          # File explorer, icons
│   │   │   │   ├── layout/         # Panels, sidebar, header
│   │   │   │   └── activity/       # Git status, diffs
│   │   │   ├── hooks/              # React hooks
│   │   │   │   └── agent/          # Tauri communication (split modules)
│   │   │   ├── stores/             # Zustand state (10 stores)
│   │   │   ├── providers/          # Context providers
│   │   │   ├── services/           # Business logic
│   │   │   ├── types/              # TypeScript definitions
│   │   │   └── lib/                # Utilities
│   │   └── index.html
│   │
│   ├── canvas/                     # Visual workflow canvas
│   │   └── src/
│   │       ├── components/         # ReactFlow nodes, panels
│   │       ├── stores/             # Canvas-specific state
│   │       └── CanvasApp.tsx       # Root component
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
│   ├── CI-CD-GUIDE.md
│   ├── DEVELOPMENT.md
│   ├── DMG-BUILD-GUIDE.md
│   └── tauri-plugins.md
│
├── Cargo.toml                      # Rust workspace root
├── package.json                    # Bun workspace root
├── bun.lockb                       # Bun lockfile
├── vite.config.ts                  # Vite (agent app)
├── vite.config.canvas.ts           # Vite (canvas standalone)
├── tsconfig.json                   # TypeScript (main)
├── tsconfig.canvas.json            # TypeScript (canvas standalone)
└── CLAUDE.md                       # AI assistant guide
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
| **ReactFlow**       | Canvas nodes                     |
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

| Technology            | Purpose                 |
| --------------------- | ----------------------- |
| **Bun**               | Runtime & bundler       |
| **Claude Agent SDK**  | AI integration          |
| **Standalone binary** | Compiled sidecar (58MB) |

---

## Package Manager Policy

> **Note:** This project migrated from pnpm to Bun in January 2026 for faster installs and unified tooling.

| Context         | Use     | Why                                               |
| --------------- | ------- | ------------------------------------------------- |
| Root monorepo   | **Bun** | Fast package management with workspace support    |
| `apps/*`        | **Bun** | Part of Bun workspace                             |
| `agent-bridge/` | **Bun** | Claude SDK sidecar, compiles to standalone binary |

**Rules:**

- Never use `npm` or `pnpm` - always use `bun`
- Use `bun run` for all scripts
- Use `bun install` for installing dependencies

---

## Development

### Prerequisites

- Node.js 22+
- Bun 1.1+
- Rust 1.85+

### Quick Start

```bash
# Clone and install
git clone https://github.com/Recusive/Orbit.git
cd Orbit
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
| `bunx tauri build`      | Build distributable (.dmg/.exe)   |
| `./scripts/lint-all.sh` | Comprehensive lint (all checks)   |

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
| `browser-store`     | Webpage viewing state                 |
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

### useTauri Hook

The `useTauri` hook (`apps/agent/src/hooks/agent/`) handles all communication:

```typescript
const { postMessage, isConnected, isMockMode } = useTauri({
  onMessage: (message) => {
    // Handle backend messages
  },
});

// Send to backend
postMessage({ type: 'message:send', uuid, session_id, content });
```

The hook is split into focused modules:

- `use-tauri.ts` - Main hook composition
- `use-tauri-handlers.ts` - Tauri command handlers
- `use-tauri-message-listener.ts` - Window message listener
- `use-tauri-session.ts` - Session management
- `use-tauri-context.ts` - Conversation formatting
- `use-tauri-mock.ts` - Browser dev mode

---

## Code Quality

### Enforced Standards

| Area           | Rules                                          |
| -------------- | ---------------------------------------------- |
| **TypeScript** | Maximum strictness, no `any`, explicit returns |
| **ESLint**     | Zero warnings tolerance                        |
| **Rust**       | Zero unsafe, clippy pedantic                   |
| **Pre-commit** | Husky + lint-staged                            |
| **Pre-push**   | Full test suite                                |

### CI Pipeline

```text
Frontend:  TypeScript → ESLint → Build → Canvas Build
Backend:   Format → Clippy → Test → Doc
                    ↓
              CI Passed
```

---

## CSS Architecture

The app uses a unified color system with agent as source of truth:

```text
apps/agent/src/globals.css    ← All color variables defined here
apps/canvas/src/globals.css   ← Canvas-specific styles only (no colors)
```

Import order in `apps/agent/src/main.tsx`:

```typescript
import '@xyflow/react/dist/style.css'; // ReactFlow base
import './globals.css'; // Agent colors (source of truth)
import '@canvas/globals.css'; // Canvas styles
```

---

## Keyboard Shortcuts

| Shortcut               | Action          |
| ---------------------- | --------------- |
| `Cmd/Ctrl + S`         | Save file       |
| `Cmd/Ctrl + P`         | Quick open file |
| `Cmd/Ctrl + Shift + P` | Command palette |
| `Cmd/Ctrl + B`         | Toggle sidebar  |
| `Cmd/Ctrl + J`         | Toggle terminal |
| `Cmd/Ctrl + `` `       | New terminal    |
| `Cmd/Ctrl + N`         | New chat        |
| `Cmd/Ctrl + Enter`     | Send message    |

---

## Build Outputs

### Development Build

```bash
bunx tauri dev
```

- Vite dev server on port 5176
- Rust auto-recompiles on changes
- Agent bridge at `target/debug/agent-bridge`

### Production Build

```bash
bunx tauri build
```

Outputs in `src-tauri/target/release/bundle/`:

- **macOS**: `.dmg`, `.app`
- **Windows**: `.exe`, `.msi`
- **Linux**: `.AppImage`, `.deb`

---

## Configuration Files

| File                        | Purpose                  |
| --------------------------- | ------------------------ |
| `src-tauri/tauri.conf.json` | Tauri app config         |
| `vite.config.ts`            | Vite (agent app)         |
| `vite.config.canvas.ts`     | Vite (canvas standalone) |
| `tsconfig.json`             | TypeScript (main)        |
| `tsconfig.canvas.json`      | TypeScript (canvas)      |
| `Cargo.toml`                | Rust workspace           |
| `package.json`              | Bun workspace config     |
| `CLAUDE.md`                 | AI assistant guide       |

---

Built by Recursive Labs • Private Repository
