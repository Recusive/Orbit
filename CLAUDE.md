# CLAUDE.md

This file provides guidance to Claude Code when working with the Snowflake codebase.

## Project Overview

Snowflake is a modern AI-powered code editor built with **Tauri 2** (Rust backend) and **React 19** (TypeScript frontend). It features a multi-panel IDE-like interface with chat, terminal, file browser, and code editing capabilities.

## Technology Stack

### Frontend

- **React 19** + TypeScript + Vite
- **Tailwind CSS v4** for styling
- **Zustand + Immer** for state management
- **CodeMirror 6** for code editing with custom themes
- **xterm.js** for terminal emulation
- **Shiki** for code block highlighting in chat
- **Zod** for runtime validation

### Backend

- **Tauri 2** for desktop app framework
- **Rust** workspace with multiple crates
- Planned: Tree-sitter for syntax parsing, portable-pty for terminal

## Project Structure

```
Snowflake-v0/
├── src/                      # React frontend (TypeScript)
│   ├── components/           # UI components
│   │   ├── activity/         # File viewer, changes list
│   │   ├── chat/             # Chat interface
│   │   ├── editor/           # CodeMirror editor
│   │   ├── layout/           # Root layout, panels
│   │   ├── terminal/         # xterm.js terminal
│   │   └── ui/               # Radix UI primitives
│   ├── hooks/                # React hooks (Tauri, chat, terminal)
│   ├── providers/            # Context providers
│   ├── stores/               # Zustand state management
│   ├── types/                # TypeScript types & Zod schemas
│   └── lib/                  # Utilities (backend API, constants)
│
├── src-tauri/                # Tauri backend (Rust)
│   ├── src/
│   │   ├── commands/         # Tauri command handlers
│   │   │   ├── files.rs      # File operations
│   │   │   ├── terminal.rs   # Terminal PTY
│   │   │   ├── lsp.rs        # Language server
│   │   │   ├── git.rs        # Git operations
│   │   │   ├── ai.rs         # Claude API
│   │   │   └── search.rs     # Ripgrep search
│   │   ├── lib.rs            # Tauri app setup
│   │   └── main.rs           # Entry point
│   └── tauri.conf.json       # Tauri configuration
│
├── crates/                   # Rust library crates
│   ├── snowflake-core/       # Core types, config, state
│   ├── snowflake-fs/         # File system operations
│   ├── snowflake-terminal/   # PTY management (TODO)
│   ├── snowflake-ai/         # Claude API integration (TODO)
│   ├── snowflake-lsp/        # Language server (TODO)
│   ├── snowflake-git/        # Git operations (TODO)
│   └── snowflake-search/     # Ripgrep search (TODO)
│
└── Cargo.toml                # Rust workspace root
```

## Commands

```bash
# Frontend Development
npm install              # Install dependencies
npm run dev              # Start Vite dev server only (port 5176)
npm run build            # TypeScript check + production build
npm run preview          # Preview production build

# Quality Checks
npm run typecheck        # TypeScript only (tsc --noEmit)
npm run lint             # ESLint with zero warnings tolerance
npm run lint:fix         # ESLint with auto-fix
npm run check            # typecheck + lint
npm run ci               # Full CI: typecheck + lint + build

# Tauri Development (RECOMMENDED)
npm run tauri dev        # Start full app (Vite + Tauri + Rust)
npm run tauri build      # Build production app (.dmg/.exe/.AppImage)

# Rust Only (from project root)
cargo build              # Build all Rust crates
cargo test               # Run Rust tests
cargo clippy             # Lint Rust code
```

## Development Workflow

### Starting Development

```bash
npm run tauri dev        # Starts everything: Vite (5176) + Tauri + Rust
```

This command:

1. Starts Vite dev server on port 5176
2. Compiles Rust backend
3. Opens the Tauri desktop window
4. Enables hot-reload for both frontend and backend

### Hot Reload Behavior

| Change Type               | Reload Behavior             |
| ------------------------- | --------------------------- |
| React/TypeScript (`src/`) | Instant HMR via Vite        |
| CSS/Tailwind              | Instant HMR via Vite        |
| Rust (`src-tauri/`)       | Auto-rebuilds, restarts app |
| Rust crates (`crates/`)   | Auto-rebuilds, restarts app |

### Production Build

```bash
npm run tauri build
```

Creates distributable app in `src-tauri/target/release/bundle/`:

- **macOS**: `.dmg` and `.app`
- **Windows**: `.exe` and `.msi`
- **Linux**: `.AppImage` and `.deb`

### Frontend-Only Development

If you only need to work on React/UI without Tauri:

```bash
npm run dev              # Vite only on port 5176
```

Note: Backend features (file system, terminal, etc.) won't work in browser-only mode.

### Configuration Files

| File                        | Purpose                                       |
| --------------------------- | --------------------------------------------- |
| `src-tauri/tauri.conf.json` | Tauri app config (window, permissions, build) |
| `vite.config.ts`            | Vite bundler config (port 5176, aliases)      |
| `Cargo.toml`                | Rust workspace root                           |
| `src-tauri/Cargo.toml`      | Tauri app dependencies                        |

## Frontend-Backend Communication

### Tauri Hook (`src/hooks/use-tauri.ts`)

```typescript
// Send message to backend
const { postMessage } = useTauri();
postMessage({ type: 'message:send', uuid, session_id, content });

// Listen for backend messages
useTauri({
  onMessage: (message) => {
    if (message.type === 'agent:chunk') {
      // Handle streaming response
    }
  },
});
```

### Backend API (`src/lib/backend.ts`)

Direct Tauri invoke calls for file operations, LSP, terminal, git, etc:

```typescript
import { readFile, writeFile, listDirectory } from '@/lib/backend';

// File operations
const content = await readFile('/path/to/file');
await writeFile('/path/to/file', content);
const entries = await listDirectory('/path/to/dir');

// LSP operations
const completions = await getCompletions(path, line, column);
const hover = await getHover(path, line, column);

// Terminal operations
const info = await createTerminal(id, cwd, shell);
await writeTerminal(id, data);
```

## CodeMirror Editor

The editor (`src/components/editor/CodeMirrorEditor.tsx`) provides:

- Full editing with syntax highlighting
- Custom dark/light themes matching app colors
- Language support: TypeScript, JavaScript, Python, Rust, Go, JSON, HTML, CSS, Markdown
- LSP autocompletion integration
- Cmd-S save functionality
- Theme-aware (syncs with app light/dark mode via MutationObserver)

### Theme Colors

**Dark theme:** `oklch(0.16 0.012 60)` background with github-dark style syntax
**Light theme:** `oklch(0.98 0.005 75)` background with github-light style syntax

## State Management

Zustand stores in `src/stores/`:

| Store               | Purpose                                 |
| ------------------- | --------------------------------------- |
| `ui-store`          | Panel layout, dimensions, active tabs   |
| `chat-store`        | Conversations, messages                 |
| `agent-store`       | Task execution state                    |
| `terminal-store`    | xterm sessions                          |
| `file-store`        | File tree state                         |
| `file-viewer-store` | Open file tabs, content, modified state |

### File Viewer Store

Tracks open files with edit state:

```typescript
interface ViewedFile {
  path: string;
  content: string;
  originalContent: string; // For dirty detection
  language: string;
  isModified: boolean; // Shows coral dot on tab when true
  viewMode: 'file' | 'diff';
}
```

## Protocol Types

All message types in `src/types/protocol.ts` with Zod schemas:

### Frontend → Backend (WebviewMessage)

- `message:send` - Send chat message
- `file:read`, `file:write` - File operations
- `terminal:create`, `terminal:write` - Terminal operations
- `agent:stop` - Stop AI generation

### Backend → Frontend (ExtensionMessage)

- `agent:chunk`, `agent:complete` - AI responses
- `tool:start`, `tool:end` - Tool execution
- `file:content`, `file:tree:response` - File data
- `terminal:output`, `terminal:created` - Terminal data

## Code Style

### ESLint Rules (enforced)

- **No `any`** - All unsafe operations are errors
- **Explicit return types** on functions
- **Consistent type imports** - Use `import type { }` separately
- **Import order** - External → Internal → Types, alphabetized
- **No console.log** - Only `warn`/`error` allowed
- **Strict boolean expressions** - No implicit truthy checks
- **Exhaustive switches** - All cases must be handled

### Tailwind + Dynamic Styles

- **Never use dynamic Tailwind classes** like `` `w-[${value}px]` ``
- Use inline styles for dynamic dimensions: `style={{ width: value }}`
- Static Tailwind classes work normally: `w-px`, `h-[32px]`

### React Patterns

- Functional components with explicit `FC` type
- Ternary for conditional rendering
- Props interfaces marked `readonly`

## Implementation Status

### Completed

- [x] Tauri 2 project setup with Rust workspace
- [x] CodeMirror 6 editor with custom themes
- [x] File editing with save (Cmd-S)
- [x] Modified indicator on tabs
- [x] Theme switching (light/dark)
- [x] Frontend-backend communication layer

### TODO (Rust Backend)

- [ ] File system operations (snowflake-fs)
- [ ] Terminal PTY management (snowflake-terminal)
- [ ] Claude AI integration (snowflake-ai)
- [ ] Language server protocol (snowflake-lsp)
- [ ] Git operations (snowflake-git)
- [ ] Ripgrep search (snowflake-search)
