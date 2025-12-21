<div align="center">

# Snowflake

**A modern AI-powered code editor built with Tauri 2 and React 19**

[![CI](https://github.com/Recusive/Snowflake-V0/actions/workflows/ci.yml/badge.svg)](https://github.com/Recusive/Snowflake-V0/actions/workflows/ci.yml)
[![Tauri Build](https://github.com/Recusive/Snowflake-V0/actions/workflows/tauri-build.yml/badge.svg)](https://github.com/Recusive/Snowflake-V0/actions/workflows/tauri-build.yml)
![Tauri](https://img.shields.io/badge/Tauri-2.0-24C8D8?logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Rust](https://img.shields.io/badge/Rust-1.85-DEA584?logo=rust&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)

[Features](#features) • [Quick Start](#quick-start) • [Architecture](#architecture) • [Contributing](#contributing)

</div>

---

## Features

| Feature                | Description                                                                 |
| ---------------------- | --------------------------------------------------------------------------- |
| **AI Chat**            | Streaming responses with Claude AI, markdown rendering, syntax highlighting |
| **Code Editor**        | CodeMirror 6 with 10+ language support and custom themes                    |
| **Terminal**           | Full PTY terminal with xterm.js                                             |
| **File Explorer**      | Tree navigation with real-time file watching                                |
| **Git Integration**    | Stage, commit, diff, branch, log operations                                 |
| **Tool Visualization** | Watch AI execute tools in real-time                                         |
| **Multi-Panel Layout** | Resizable IDE-style panels                                                  |
| **Cross-Platform**     | macOS, Windows, Linux                                                       |

---

## Quick Start

```bash
# Prerequisites: Node.js 22+, pnpm 9+, Rust 1.85+

# Clone and install
git clone https://github.com/Recusive/Snowflake-V0.git
cd Snowflake-V0
pnpm install

# Run the app (opens desktop window with hot-reload)
pnpm dev
```

> **Note:** First build compiles Rust and may take a few minutes. Subsequent starts are fast.

---

## Keyboard Shortcuts

| Shortcut               | Action          |
| ---------------------- | --------------- |
| `Cmd/Ctrl + S`         | Save file       |
| `Cmd/Ctrl + P`         | Quick open file |
| `Cmd/Ctrl + Shift + P` | Command palette |
| `Cmd/Ctrl + B`         | Toggle sidebar  |
| `Cmd/Ctrl + J`         | Toggle terminal |
| `Cmd/Ctrl + \``        | New terminal    |
| `Cmd/Ctrl + N`         | New chat        |
| `Cmd/Ctrl + Enter`     | Send message    |

---

## Technology Stack

<table>
<tr>
<td valign="top" width="50%">

### Frontend

- **React 19** + TypeScript 5.9
- **Vite 7** for builds
- **Tailwind CSS v4**
- **Zustand + Immer** state
- **CodeMirror 6** editor
- **xterm.js** terminal
- **Shiki** highlighting
- **Radix UI** components

</td>
<td valign="top" width="50%">

### Backend (Rust)

- **Tauri 2** framework
- **Tokio** async runtime
- **git2** for Git ops
- **notify** file watcher
- **portable-pty** terminal
- **tower-lsp** LSP support
- **serde** serialization

</td>
</tr>
</table>

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    Snowflake Desktop App                    │
├────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Rust Backend (Main Process)                          │  │
│  │  • Claude AI streaming    • File system + watching    │  │
│  │  • Git operations         • Terminal PTY              │  │
│  │  • Settings persistence   • Search (ripgrep)          │  │
│  └─────────────────────────┬────────────────────────────┘  │
│                            │ Tauri IPC                      │
│  ┌─────────────────────────▼────────────────────────────┐  │
│  │  React Frontend (Renderer)                            │  │
│  │  • Chat interface         • CodeMirror editor         │  │
│  │  • File explorer          • xterm terminal            │  │
│  │  • Tool visualization     • Zustand state             │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
Snowflake-v0/
├── src/                      # React frontend
│   ├── components/           # 90+ UI components
│   ├── hooks/                # Custom React hooks
│   ├── stores/               # Zustand state (10 stores)
│   └── types/                # TypeScript definitions
│
├── src-tauri/                # Tauri app
│   └── src/commands/         # IPC command handlers
│
└── crates/                   # Rust libraries
    ├── snowflake-core/       # Core types & text editing
    ├── snowflake-fs/         # File system + watching
    ├── snowflake-git/        # Git operations
    ├── snowflake-terminal/   # PTY management
    ├── snowflake-settings/   # Config persistence
    └── snowflake-search/     # Ripgrep integration
```

---

## Development

### Commands

| Command           | Description               |
| ----------------- | ------------------------- |
| `pnpm dev`        | Start app with hot-reload |
| `pnpm dev:web`    | Frontend only (port 5176) |
| `pnpm build`      | Production build          |
| `pnpm check`      | TypeScript + ESLint       |
| `pnpm check:rust` | Rust fmt + clippy + test  |
| `pnpm check:all`  | All quality checks        |

### Hot Reload

| Change           | Behavior               |
| ---------------- | ---------------------- |
| React/TypeScript | Instant HMR            |
| CSS/Tailwind     | Instant HMR            |
| Rust code        | Auto-rebuild + restart |

---

## Code Quality

### Enforced Standards

| Area           | Rules                                   |
| -------------- | --------------------------------------- |
| **Rust**       | Zero unsafe, no panics, clippy pedantic |
| **TypeScript** | Maximum strictness, no `any`            |
| **ESLint**     | Zero warnings tolerance                 |
| **Pre-commit** | Husky + lint-staged                     |
| **CI**         | 11 parallel checks on every push        |

### CI Pipeline

```
Frontend:  TypeScript → ESLint → Build
Backend:   Format → Clippy → Test → Deny → Doc → MSRV
           ↓
        CI Passed (quality gate)
```

---

## Implementation Status

### Done

- [x] Tauri 2 + React 19 setup
- [x] CodeMirror editor with themes
- [x] File system with watching
- [x] Git integration (full)
- [x] Settings persistence
- [x] Multi-panel layout
- [x] Light/dark themes

### In Progress

- [ ] Claude AI streaming
- [ ] LSP completions
- [ ] Full terminal PTY

---

## Contributing

1. Fork the repo
2. Create feature branch
3. Run `pnpm check:all`
4. Submit PR

All 11 CI checks must pass.

---

<div align="center">

**Built with Rust and React**

Private • Recursive Labs

</div>
