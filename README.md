# Snowflake

A modern AI-powered code editor built with **Tauri 2** (Rust) and **React 19** (TypeScript). Features conversational AI, code editing, terminal, Git integration, and file watching.

![Tauri](https://img.shields.io/badge/Tauri-2.0-blue?logo=tauri)
![React](https://img.shields.io/badge/React-19-blue?logo=react)
![Rust](https://img.shields.io/badge/Rust-1.85-orange?logo=rust)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)
![License](https://img.shields.io/badge/License-Private-red)

---

## Features

- **AI Chat Interface** - Streaming responses with Claude AI, markdown rendering, code highlighting
- **Code Editor** - CodeMirror 6 with syntax highlighting for 10+ languages
- **Integrated Terminal** - Full terminal emulation with xterm.js and PTY support
- **File Explorer** - Tree navigation with file watching and auto-refresh
- **Git Integration** - Stage, commit, diff, branch, and log operations
- **Tool Visualization** - Real-time display of AI tool execution
- **Multi-Panel Layout** - Resizable panels for chat, files, editor, and terminal
- **Cross-Platform** - macOS, Windows, and Linux support

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development (frontend + backend)
pnpm tauri dev
```

This opens the desktop app with hot-reload for both React and Rust.

---

## Technology Stack

### Frontend

| Technology          | Purpose                    |
| ------------------- | -------------------------- |
| **React 19**        | UI framework               |
| **TypeScript 5.9**  | Type safety                |
| **Vite 7**          | Build tool and dev server  |
| **Tailwind CSS v4** | Styling (CSS-first config) |
| **Zustand + Immer** | State management           |
| **CodeMirror 6**    | Code editing               |
| **xterm.js**        | Terminal emulation         |
| **Shiki**           | Syntax highlighting        |
| **Radix UI**        | Accessible components      |
| **Zod 4**           | Runtime validation         |

### Backend (Rust)

| Crate            | Purpose                  |
| ---------------- | ------------------------ |
| **tauri 2**      | Desktop framework        |
| **tokio**        | Async runtime            |
| **git2**         | Git operations           |
| **notify**       | File watching            |
| **portable-pty** | Terminal PTY             |
| **tower-lsp**    | Language Server Protocol |
| **serde**        | JSON serialization       |

---

## Project Structure

```
Snowflake-v0/
├── src/                      # React frontend
│   ├── components/           # UI components (90+ files)
│   │   ├── chat/             # Chat interface
│   │   ├── editor/           # CodeMirror integration
│   │   ├── terminal/         # xterm.js terminal
│   │   ├── activity/         # File viewer, diffs
│   │   └── ui/               # Radix primitives
│   ├── hooks/                # React hooks
│   ├── stores/               # Zustand state (10 stores)
│   └── types/                # TypeScript definitions
│
├── src-tauri/                # Tauri backend
│   ├── src/
│   │   ├── commands/         # Tauri command handlers
│   │   │   ├── files.rs      # File operations
│   │   │   ├── git.rs        # Git operations
│   │   │   ├── terminal.rs   # Terminal/PTY
│   │   │   └── settings.rs   # Configuration
│   │   └── lib.rs            # App setup
│   └── tauri.conf.json       # App config
│
├── crates/                   # Rust library crates
│   ├── snowflake-core/       # Core types
│   ├── snowflake-fs/         # File system + watching
│   ├── snowflake-git/        # Git operations
│   ├── snowflake-terminal/   # PTY management
│   ├── snowflake-settings/   # Configuration
│   └── snowflake-search/     # Ripgrep search
│
└── Cargo.toml                # Rust workspace
```

---

## Development

### Prerequisites

- **Node.js** v22+ (see `.nvmrc`)
- **pnpm** v9+
- **Rust** 1.85+ with Cargo
- **Tauri CLI**: `cargo install tauri-cli`

### Commands

```bash
# Development
pnpm tauri dev           # Full app (Vite + Tauri + Rust)
pnpm dev                 # Frontend only (port 5176)

# Quality checks
pnpm typecheck           # TypeScript check
pnpm lint                # ESLint (zero warnings)
pnpm check               # All checks (TS + ESLint + Rust)

# Build
pnpm tauri build         # Production app (.dmg/.exe/.AppImage)
pnpm build               # Frontend production build
```

### Hot Reload

| Change Type             | Behavior                    |
| ----------------------- | --------------------------- |
| React/TypeScript        | Instant HMR via Vite        |
| CSS/Tailwind            | Instant HMR via Vite        |
| Rust (`src-tauri/`)     | Auto-rebuilds, restarts app |
| Rust crates (`crates/`) | Auto-rebuilds, restarts app |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Tauri Desktop App                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Main Process (Rust)                                      │   │
│  │  - Claude AI integration                                  │   │
│  │  - File system operations                                 │   │
│  │  - Git operations (git2)                                  │   │
│  │  - Terminal PTY management                                │   │
│  │  - File watching (notify)                                 │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │ IPC (invoke/events)                  │
│  ┌────────────────────────▼─────────────────────────────────┐   │
│  │  Renderer Process (React)                                 │   │
│  │  - Chat interface                                         │   │
│  │  - CodeMirror editor                                      │   │
│  │  - xterm.js terminal                                      │   │
│  │  - File explorer                                          │   │
│  │  - Zustand state management                               │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Code Quality

### Rust

- **Zero unsafe code**: `#![forbid(unsafe_code)]`
- **No panics**: `#![deny(clippy::unwrap_used, clippy::expect_used)]`
- **Strict linting**: All clippy::pedantic rules enabled
- **cargo-deny**: License and vulnerability auditing

### TypeScript

- **Maximum strictness**: All strict options enabled
- **No implicit any**: Every type explicit
- **ESLint**: Zero warnings tolerance
- **Consistent imports**: Type imports separated

### CI/CD

- GitHub Actions for all quality checks
- Pre-commit hooks with Husky + lint-staged
- Dependabot auto-merge for patches
- Release automation on version tags

---

## Implementation Status

### Completed

- [x] Tauri 2 desktop framework
- [x] React 19 frontend with TypeScript
- [x] CodeMirror 6 editor with themes
- [x] File system operations with watching
- [x] Git integration (stage, commit, diff, log)
- [x] Settings management with persistence
- [x] Multi-panel resizable layout
- [x] Theme switching (light/dark)

### In Progress

- [ ] Claude AI streaming integration
- [ ] LSP language server support
- [ ] Terminal PTY full implementation

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run `pnpm check` before committing
4. Submit a pull request

All CI checks must pass before merging.

---

## License

Private - Recursive Labs
