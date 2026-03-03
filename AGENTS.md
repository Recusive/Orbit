# Repository Guidelines

## Project Overview

Orbit is a modern AI-powered code editor built with Tauri 2 (Rust backend) and React 19 (TypeScript frontend). It is a monorepo containing three frontends (Agent, Canvas, Editor) that share a common Rust backend.

## Technology Stack

Frontend:

- React 19 + TypeScript + Vite

- Bun workspaces for monorepo management

- Tailwind CSS v4

- Zustand + Immer for state management

- CodeMirror 6 for code editing

- xterm.js for terminal emulation

- Shiki for code block highlighting

- Zod 4 for runtime validation

Backend:

- Tauri 2 for the desktop app framework

- Rust workspace with multiple crates

- portable-pty for terminal emulation

- Tree-sitter for syntax parsing (planned)

## Package Manager Policy (Bun Only)

Migration note (January 2026): this project moved from pnpm to Bun for faster installs, unified tooling, and simpler workspace configuration. The `pnpm-workspace.yaml` file was removed; workspaces are defined in `package.json`.

Rules:

1. Never use `npm` or `pnpm`.
2. Use `bun run` for all scripts.
3. Use `bun install` for dependencies.
4. Run tests with `bun test`.

Examples:

```bash
# Correct
bun install
bun run dev
bun run build
bun test

# Incorrect
npm install
pnpm dev
```

## Project Structure & Module Organization

```text
Orbit/
├── apps/
│   ├── agent/                      # Main UI
│   ├── canvas/                     # Canvas app
│   └── editor/                     # Editor app
├── apps/common/                    # Shared TS code
├── packages/shared-schemas/        # Shared Zod schemas
├── agent-bridge/                   # Bun-compiled sidecar
├── crates/                         # Rust library crates
├── src-tauri/                      # Tauri entrypoint
├── Cargo.toml                      # Rust workspace root
├── package.json                    # Bun workspace root
└── tsconfig.json                   # TypeScript config
```

Tests live under `apps/agent/src/__tests__/` and `apps/canvas/src/*.test.ts`.

## Build, Test, and Development Commands

Core:

- `bun install` — install workspace dependencies.

- `bunx tauri dev` — full app (Vite + Tauri + Rust).

- `bun run dev` — frontend only (Vite, port 5176).

- `bun run build` — production build (includes sidecar).

- `bun run preview` — preview production build.

Quality:

- `bun run typecheck` — TypeScript `tsc --noEmit`.

- `bun run lint` / `bun run lint:fix` — ESLint (zero warnings).

- `bun run check` — typecheck + lint + tests.

- `bun run ci` — typecheck + lint + tests + Rust checks.

- `./scripts/lint-all.sh` — comprehensive linting (use `--fix` or `--no-test`).

Rust:

- `cargo build`, `cargo check`, `cargo test`, `cargo clippy`.

- `bun run rust:fmt` / `bun run rust:lint` / `bun run rust:test` (repo shortcuts).

## Development Workflow

Start development with:

```bash
bunx tauri dev
```

This builds the agent-bridge sidecar, starts Vite on port 5176, compiles the Rust backend, opens the Tauri window, and enables hot reload.

Hot reload behavior:

| Change Type                          | Reload Behavior             |
| ------------------------------------ | --------------------------- |
| React/TypeScript (`apps/agent/src/`) | Instant HMR via Vite        |
| CSS/Tailwind                         | Instant HMR via Vite        |
| Rust (`src-tauri/`, `crates/`)       | Auto-rebuilds, restarts app |

## Coding Style & Naming Conventions

- TypeScript is strict (`tsconfig.json`) with explicit types and no unuseds.

- ESLint enforces import ordering and separate `import type` blocks (`import-x/order`).

- Use Prettier for formatting (`bun run format`).

- React components use `PascalCase`; hooks use `use-` prefixes; stores live in `apps/agent/src/stores/`.

## Testing Guidelines

- Unit tests use Vitest APIs and live alongside feature areas.

- Use `bun run check` for the repo baseline; use `bun run rust:test` for Rust.

- Prefer adding tests for store logic and message/handler behavior.

## Commit & Pull Request Guidelines

- Commit messages follow a Conventional Commits style (e.g., `feat:`, `fix:`).

- No PR template found; include a concise summary and list tests run.

- For UI changes, add screenshots or short clips when behavior is visual.

## CLAUDE.md (Full)

This file provides guidance to Claude Code when working with the Orbit codebase.

## Claude Project Overview

Orbit is a modern AI-powered code editor built with **Tauri 2** (Rust backend) and **React 19** (TypeScript frontend). It's a monorepo containing three frontend apps (Orbit Agent, Orbit Canvas, Orbit Editor) that share a common Rust backend.

## Claude Technology Stack

### Frontend

- **React 19** + TypeScript + Vite

- **Bun** workspaces for monorepo management

- **Tailwind CSS v4** for styling

- **Zustand + Immer** for state management

- **CodeMirror 6** for code editing with custom themes

- **xterm.js** for terminal emulation

- **Shiki** for code block highlighting in chat

- **Zod 4** for runtime validation

### Backend

- **Tauri 2** for desktop app framework

- **Rust** workspace with multiple crates

- **portable-pty** for terminal emulation

- Tree-sitter for syntax parsing (planned)

### Package Manager Policy

> **Migration Note (January 2026):** This project migrated from **pnpm** to **Bun** for faster installs,
> unified tooling (Bun handles both package management and the agent-bridge runtime), and simpler
> workspace configuration. The `pnpm-workspace.yaml` file was removed - workspaces are now defined
> directly in `package.json`. If you encounter old documentation or scripts referencing pnpm,
> replace with the Bun equivalents below.

**IMPORTANT:** This project uses **Bun** as the primary package manager/runtime everywhere.

| Context         | Use     | Why                                                          |
| --------------- | ------- | ------------------------------------------------------------ |
| Root monorepo   | **Bun** | Fast package management with workspace support               |
| `apps/*`        | **Bun** | Part of Bun workspace                                        |
| `agent-bridge/` | **Bun** | Claude Agent SDK sidecar - compiles to standalone Bun binary |

**Rules:**

1. **Never use** **`npm`** **or** **`pnpm`** - Always use `bun`
2. **Use** **`bun run`** for all scripts
3. **Use** **`bun install`** for installing dependencies
4. **Run tests with** **`bun test`**

```bash
# [ok] CORRECT
bun install                 # Install dependencies
bun run dev                 # Start Vite dev server
bun run build               # Build the app
bun test                    # Run tests

# [bad] WRONG - Never use npm or pnpm
npm run build               # NO!
npm install                 # NO!
pnpm dev                    # NO!
```

## Project Structure

```text
Orbit/
├── apps/                           # Frontend applications
│   ├── agent/                      # Chat/Agent app (main app)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── ui/             # Radix UI primitives
│   │   │   │   ├── layout/         # Panels, sidebar, header
│   │   │   │   ├── chat/           # Chat messages, tools
│   │   │   │   ├── input/          # Chat input, mentions
│   │   │   │   ├── terminal/       # xterm.js terminal
│   │   │   │   ├── editor/         # CodeMirror editor
│   │   │   │   ├── files/          # File explorer, icons
│   │   │   │   ├── activity/       # Source control, diffs
│   │   │   │   ├── sidebar/        # Conversation list
│   │   │   │   ├── settings/       # Settings dialogs
│   │   │   │   └── shared/         # Common components
│   │   │   ├── hooks/              # React hooks
│   │   │   ├── stores/             # Zustand state
│   │   │   ├── services/           # Business logic
│   │   │   ├── types/              # TypeScript types
│   │   │   ├── lib/                # Utilities
│   │   │   └── providers/          # Context providers
│   │   └── index.html
│   │
│   ├── canvas/                     # Canvas/Design app (stub)
│   │   └── src/
│   │
│   └── editor/                     # Editor app (stub)
│       └── src/
│
├── agent-bridge/                   # AI Bridge (Claude Agent SDK sidecar)
│   ├── src/                        # TypeScript source
│   ├── dist/                       # Compiled output
│   └── package.json
│
├── crates/                         # Rust library crates
│   └── common/                     # Shared crates
│       ├── core/                   # Core types, config, state
│       ├── fs/                     # File system operations
│       ├── terminal/               # PTY management
│       ├── git/                    # Git operations
│       ├── ai/                     # Claude API integration (stub - uses agent-bridge)
│       ├── lsp/                    # Language server
│       ├── search/                 # Ripgrep search
│       ├── syntax/                 # Syntax highlighting (stub - uses frontend Shiki)
│       ├── settings/               # Settings persistence
│       └── conversations/          # Conversation storage
│
├── src-tauri/                      # Tauri app entry point
│   ├── src/
│   │   ├── commands/
│   │   │   ├── common/             # Shared commands
│   │   │   │   ├── files.rs
│   │   │   │   ├── terminal.rs
│   │   │   │   ├── git.rs
│   │   │   │   ├── lsp.rs
│   │   │   │   ├── search.rs
│   │   │   │   ├── settings.rs
│   │   │   │   └── workspace.rs
│   │   │   ├── agent/              # Agent-specific commands
│   │   │   │   ├── agent.rs
│   │   │   │   ├── ai.rs
│   │   │   │   └── conversations.rs
│   │   │   ├── canvas/             # Canvas commands (stub)
│   │   │   └── editor/             # Editor commands (stub)
│   │   ├── agent/                  # Agent bridge (Rust side)
│   │   ├── lib.rs
│   │   └── main.rs
│   └── tauri.conf.json
│
├── Cargo.toml                      # Rust workspace root
├── package.json                    # Bun workspace root (workspaces defined here)
├── bun.lockb                       # Bun lockfile
├── vite.config.ts                  # Vite config (root: apps/agent)
└── tsconfig.json                   # TypeScript config
```

## Commands

```bash
# Frontend Development
bun install              # Install dependencies
bun run dev              # Start Vite dev server only (port 5176)
bun run build            # TypeScript check + production build
bun run preview          # Preview production build

# Quality Checks
bun run typecheck        # TypeScript only (tsc --noEmit)
bun run lint             # ESLint with zero warnings tolerance
bun run lint:fix         # ESLint with auto-fix
bun run check            # typecheck + lint + tests
bun run ci               # Full CI: typecheck + lint + tests + rust checks

# Comprehensive Linting (all checks in one command)
./scripts/lint-all.sh              # Run all checks (TypeScript, ESLint, Rust, tests)
./scripts/lint-all.sh --fix        # Run with auto-fix
./scripts/lint-all.sh --no-test    # Skip tests for faster checking

# Tauri Development (RECOMMENDED)
bunx tauri dev           # Start full app (Vite + Tauri + Rust)
bunx tauri build         # Build production app (.dmg/.exe/.AppImage)

# Rust Only (from project root)
cargo build              # Build all Rust crates
cargo check              # Fast type checking
cargo test               # Run Rust tests
cargo clippy             # Lint Rust code
```

## Claude Development Workflow

### Starting Development

```bash
bunx tauri dev           # Starts everything: Vite (5176) + Tauri + Rust
```

This command:

1. Builds the agent-bridge sidecar
2. Starts Vite dev server on port 5176
3. Compiles Rust backend
4. Opens the Tauri desktop window
5. Enables hot-reload for both frontend and backend

### Hot Reload Behavior

| Change Type                          | Reload Behavior             |
| ------------------------------------ | --------------------------- |
| React/TypeScript (`apps/agent/src/`) | Instant HMR via Vite        |
| CSS/Tailwind                         | Instant HMR via Vite        |
| Rust (`src-tauri/`)                  | Auto-rebuilds, restarts app |
| Rust crates (`crates/`)              | Auto-rebuilds, restarts app |
| agent-bridge (`agent-bridge/`)       | **Manual rebuild required** |

### Agent Bridge Sidecar (IMPORTANT)

The agent-bridge is a **compiled Bun binary** that Tauri spawns as a sidecar process. Unlike other code, **changes to agent-bridge require manual rebuilding**:

```bash
cd agent-bridge
bun run build:dev    # Compiles to target/debug/agent-bridge
```

Then restart the Tauri app (`Cmd+C` → `bunx tauri dev`).

**Why manual rebuild?**

- Tauri watches Rust code, not the agent-bridge TypeScript

- The sidecar is a standalone binary (58MB) with embedded Bun runtime

- Located at `target/debug/agent-bridge` in dev mode

**Two build outputs:**

| Script              | Output                      | Purpose                         |
| ------------------- | --------------------------- | ------------------------------- |
| `bun run build`     | `dist/index.js`             | JS bundle (requires Bun to run) |
| `bun run build:dev` | `target/debug/agent-bridge` | Standalone binary for Tauri     |

### Production Build

```bash
bunx tauri build
```

Creates distributable app in `src-tauri/target/release/bundle/`:

- **macOS**: `.dmg` and `.app`

- **Windows**: `.exe` and `.msi`

- **Linux**: `.AppImage` and `.deb`

### Frontend-Only Development

If you only need to work on React/UI without Tauri:

```bash
bun run dev              # Vite only on port 5176
```

Note: Backend features (file system, terminal, etc.) won't work in browser-only mode.

### Configuration Files

| File                        | Purpose                                       |
| --------------------------- | --------------------------------------------- |
| `src-tauri/tauri.conf.json` | Tauri app config (window, permissions, build) |
| `vite.config.ts`            | Vite bundler config (root: apps/agent)        |
| `Cargo.toml`                | Rust workspace root                           |
| `package.json`              | Bun workspace config (workspaces array)       |
| `tsconfig.json`             | TypeScript config (paths: apps/agent/src)     |
| `components.json`           | shadcn/ui configuration                       |

## Frontend-Backend Communication

### Tauri Hook (`apps/agent/src/hooks/use-tauri.ts`)

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

### Backend API (`apps/agent/src/lib/backend.ts`)

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

The editor (`apps/agent/src/components/editor/CodeMirrorEditor.tsx`) provides:

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

Zustand stores in `apps/agent/src/stores/`:

| Store                  | Purpose                                        |
| ---------------------- | ---------------------------------------------- |
| `ui-store`             | Panel layout, dimensions, active tabs          |
| `file-store`           | File tree state, changes, selections           |
| `file-viewer-store`    | Open file tabs, content, modified state        |
| `terminal-store`       | xterm sessions, output buffers                 |
| `git-store`            | Git branch, status, ahead/behind               |
| `tool-store`           | Tool execution, permissions, token tracking    |
| `browser-store`        | Browser/webpage viewing state                  |
| `checkpoint-store`     | Conversation checkpoints for rewind            |
| `queued-message-store` | Pending message queue buffer                   |
| `onboarding-store`     | First-launch setup (persisted to localStorage) |
| `provider-store`       | OAuth provider configuration                   |

## Protocol Types

All message types in `apps/agent/src/types/protocol.ts` with Zod schemas:

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

- **No** **`any`** - All unsafe operations are errors

- **Explicit return types** on functions

- **Consistent type imports** - Use `import type { }` separately

- **Import order** - External → Types → Internal, alphabetized. Use `bun run lint --fix` if unsure

- **No console.log** - Use structured logger (see below)

- **Strict boolean expressions** - No implicit truthy checks

- **Exhaustive switches** - All cases must be handled

### Structured Logging

**IMPORTANT:** Use the structured logger instead of `console.*` calls:

```typescript
import { createLogger } from '@/lib/logger';

const logger = createLogger('MyComponent');

// Log levels
logger.debug('Dev-only message', { count: 42 }); // Filtered in production
logger.info('Operational message'); // Always shown
logger.warn('Potential issue', { userId: '123' }); // Always shown
logger.error('Error occurred', new Error('fail')); // Always shown with stack
```

**Benefits:**

- **Context prefix** - Easily identify source: `[MyComponent] message`

- **Log levels** - Debug messages hidden in production

- **Structured data** - JSON metadata for log aggregation

- **Error handling** - Proper error serialization with stack traces

### Tailwind + Dynamic Styles

- **Never use dynamic Tailwind classes** like `` `w-[${value}px]` ``

- Use inline styles for dynamic dimensions: `style={{ width: value }}`

- Static Tailwind classes work normally: `w-px`, `h-[32px]`

### React Patterns

- Functional components with explicit `FC` type

- Ternary for conditional rendering

- Props interfaces marked `readonly`

## Module Organization Patterns

### Frontend (TypeScript) - Barrel Pattern

Use `index.ts` barrel files to organize exports. Every folder with multiple files should have an `index.ts`.

**Structure:**

```text
components/chat/messages/
├── index.ts              ← Barrel file (exports all public items)
├── MessageItem.tsx       ← Main component
├── ToolWidgetRenderer.tsx
├── message-utils.ts      ← Utilities
└── types.ts              ← Types
```

**Barrel file pattern:**

```typescript
// index.ts
export { MessageItem } from './MessageItem';
export { ToolWidgetRenderer } from './ToolWidgetRenderer';
export type { ChatMessage, MessageItemProps } from './types';
export { buildSegments } from './message-utils';
```

**For folders with subfolders** (e.g., `components/`, `hooks/`):

```text
primary-sidebar/
├── index.ts              ← Imports from subfolders
├── PrimarySidebar.tsx
├── types.ts
├── components/
│   ├── index.ts          ← Subfolder barrel
│   └── *.tsx
└── hooks/
    ├── index.ts          ← Subfolder barrel
    └── *.ts
```

**Two valid sub-patterns:**

| Pattern         | When to Use                             | Example                                   |
| --------------- | --------------------------------------- | ----------------------------------------- |
| **Full export** | Reusable component libraries            | `chat/tools/` - all widgets exported      |
| **Facade**      | Complex modules with single entry point | `chat/input/` - only `ChatInput` exported |

### Backend (Rust) - Explicit Paths

For Tauri commands, use **explicit module paths** (no barrel re-exports). This is appropriate because:

1. Commands are registered by function reference, not imported by users
2. Frontend calls commands by string name via `invoke('command_name')`
3. Explicit paths make code easier to trace

**Structure:**

```rust
// commands/mod.rs - Just declare modules
pub mod agent;
pub mod common;

// commands/common/mod.rs - Declare submodules
pub mod files;
pub mod git;
pub mod terminal;

// No `pub use` needed - commands use full paths
```

**For shared types in crates**, use selective re-exports:

```rust
// crates/common/core/src/lib.rs
pub mod types;
pub mod error;

// Re-export commonly used types for convenience
pub use error::{Error, Result};
pub use types::{FileStatus, GitStatus};
```

**Summary:**

| Layer              | Pattern                 | Reason                            |
| ------------------ | ----------------------- | --------------------------------- |
| Frontend TS        | **Barrel** (`index.ts`) | Users import from modules         |
| Tauri commands     | **Explicit paths**      | Internal, registered by function  |
| Shared Rust crates | **Selective re-export** | Convenience for cross-crate types |

## Monorepo Structure

### Apps (`apps/`)

| App      | Description                | Status |
| -------- | -------------------------- | ------ |
| `agent`  | Chat/AI agent interface    | Active |
| `canvas` | Design canvas (Figma-like) | Stub   |
| `editor` | Code editor                | Stub   |

### Shared Crates (`crates/common/`)

| Crate      | Description               |
| ---------- | ------------------------- |
| `core`     | Core types, config, state |
| `fs`       | File system operations    |
| `terminal` | PTY management            |
| `git`      | Git operations            |
| `ai`       | Claude API integration    |
| `lsp`      | Language server protocol  |
| `search`   | Ripgrep search            |

### Commands (`src-tauri/src/commands/`)

| Folder    | Description                                  |
| --------- | -------------------------------------------- |
| `common/` | Shared commands (files, terminal, git, etc.) |
| `agent/`  | Agent-specific commands (ai, conversations)  |
| `canvas/` | Canvas-specific commands (stub)              |
| `editor/` | Editor-specific commands (stub)              |

## Implementation Status

### Completed

- [x] Tauri 2 project setup with Rust workspace

- [x] Monorepo restructure (apps/, crates/common/, commands/)

- [x] CodeMirror 6 editor with custom themes

- [x] File editing with save (Cmd-S)

- [x] Modified indicator on tabs

- [x] Theme switching (light/dark)

- [x] Frontend-backend communication layer

- [x] Terminal with xterm.js

- [x] Git status & operations

- [x] Bun workspace management

- [x] CI/CD with GitHub Actions

### In Progress

- [ ] Canvas app implementation

- [ ] Editor app implementation

- [ ] Shared packages extraction

### TODO

- [ ] Tree-sitter syntax highlighting

- [ ] LSP/diagnostics integration

- [ ] Advanced search features

## Troubleshooting

### Zod Schema Validation Errors

**IMPORTANT:** If you encounter runtime errors or unexpected behavior with data parsing/validation, **check the Zod schemas first** before debugging elsewhere.

Common symptoms:

- "Invalid credentials" or "No credentials found" errors

- Data parsing silently returning `null`

- "Unrecognized keys" or "Invalid input: expected X, received Y" in logs

**Root cause:** Schemas using `.strict()` will reject data with extra fields, and type mismatches (e.g., `number` vs `string`) cause validation failures.

**Where to look:**

- `agent-bridge/src/schemas.ts` - Bridge IPC schemas

- `packages/shared-schemas/` - Shared validation schemas

**Quick fix pattern:**

- For **external data** (APIs, Keychain, SDK responses): Use `.loose()` instead of `.strict()`

- For **type mismatches**: Use `z.union([z.number(), z.string()])` for flexible types

- For **internal data** (your own code): `.strict()` is fine

**Example fix (from KeychainCredentialsSchema):**

```typescript
// BAD: Too strict for external data
.object({ expiresAt: z.string() }).strict()

// GOOD: Flexible for external data that may change
.object({ expiresAt: z.union([z.number(), z.string()]) }).loose()
```

### Integration Test Coverage

**IMPORTANT:** When creating integration tests for a function or feature, always add a warning comment to the source file being tested. This ensures future developers know to run and update tests when modifying the code.

**Comment format:**

```typescript
/**
 * [existing docstring...]
 *
 * [warning] TESTED: This function is covered by integration tests.
 *     If you modify this, run: cd agent-bridge && bun test
 *     Test file: src/__tests__/[test-file-name].test.ts
 */
```

**Currently tested features:**

| Feature                     | Source File                                                     | Test File                                                |
| --------------------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| File Rewind                 | `agent-bridge/src/agent.ts:rewindFiles()`                       | `agent-bridge/src/__tests__/file-rewind.test.ts`         |
| Conversation Context Format | `apps/agent/src/hooks/use-tauri.ts:formatConversationContext()` | `agent-bridge/src/__tests__/conversation-rewind.test.ts` |
| Combined Rewind Flow        | `apps/agent/src/hooks/use-tauri.ts:conversation:rewind handler` | `agent-bridge/src/__tests__/combined-rewind.test.ts`     |

**When adding new tests:** Always add the \[warning] TESTED comment to the source function/handler being tested.

### Mandatory Test Requirements

**CRITICAL:** Tests are not optional. We follow **real integration testing**, not unit testing with mocks.

#### Testing Philosophy

1. **NO MOCK DATA** - Tests must use real systems, real API calls, real data flows
2. **NO FAKE PASSES** - A test that just "passes" without exercising real code paths is worthless
3. **FULL INTEGRATION** - Test the entire system flow, not isolated files
4. **INDUSTRY STANDARD** - Follow proper integration testing practices used in production systems

#### What We Test

| \[bad] DO NOT                    | \[ok] DO                                 |
| -------------------------------- | ---------------------------------------- |
| Mock the Claude SDK              | Use REAL Claude API calls                |
| Test single files in isolation   | Test full module integration             |
| Use fake data that always passes | Use real data through real pipelines     |
| Skip API calls to "save time"    | Make actual API calls to verify behavior |
| Test only the happy path         | Test error paths, edge cases, cleanup    |

#### Test Structure

```text
agent-bridge/src/__tests__/
├── canvas-e2e.test.ts       # Full Canvas integration (REAL SDK, REAL sessions)
├── canvas-types.test.ts     # Type/schema validation
└── [feature]-e2e.test.ts    # Each feature gets E2E tests
```

#### When Adding/Modifying Code

1. **When creating a new file:**
   - Add tests to the relevant E2E test file (e.g., `canvas-e2e.test.ts`)

   - Tests must exercise the FULL flow through real systems

   - Run the complete test suite to verify integration

   - Add the \[warning] TESTED comment to the source file

2. **When modifying a file that has existing tests:**
   - Find the E2E test file for that module

   - **ADD NEW TESTS** that cover your new functionality

   - Tests must verify the new code integrates with existing systems

   - Do NOT just run existing tests - that defeats the purpose

   - Run the FULL test suite to verify nothing broke

3. **When modifying a file without existing tests:**
   - Create E2E tests if the module doesn't have them

   - Tests must cover the full integration path

#### Real Integration Test Example

```typescript
// [bad] BAD: Mock test that proves nothing
it('should analyze intent', () => {
  const mockAnalyzer = { analyze: () => ({ useFastPath: true }) };
  expect(mockAnalyzer.analyze('test').useFastPath).toBe(true);
});

// [ok] GOOD: Real integration test
it('should route simple requests to fast path via real session', async () => {
  // Create REAL session with REAL Claude SDK
  const manager = new CanvasSessionManager();
  await manager.createSession('test-session', {
    model: 'claude-sonnet-4-20250514',
  });

  // Verify REAL IntentAnalyzer is initialized
  const intentAnalyzer = manager['intentAnalyzer'];
  expect(intentAnalyzer).toBeDefined();

  // Test REAL analysis with REAL routing logic
  const state: CanvasState = { nodes: [], edges: [] };
  const snapshot = manager['convertToSnapshot'](state);
  const analysis = intentAnalyzer.analyze('Create a button', snapshot);

  // Verify REAL routing decision
  expect(analysis.useFastPath).toBe(true);
  expect(analysis.fastPathAgent).toBe('component');

  // Cleanup REAL session
  await manager.deleteSession('test-session');
});
```

#### Test Checklist Before PR

- [ ] Added tests for ALL new functionality

- [ ] Tests use REAL systems (no mocks for core functionality)

- [ ] Tests verify FULL integration flow

- [ ] Tests cover error cases and cleanup

- [ ] Ran complete test suite: `cd agent-bridge && bun test`

- [ ] All tests pass with real API calls

#### Running Tests Locally (IMPORTANT)

**Integration tests MUST be run locally** - they will NOT pass in GitHub Actions CI.

**Why?** The integration tests require Claude API credentials, which are provided via OAuth through the Claude Code CLI. OAuth credentials are stored in the macOS Keychain and are only available on local development machines. GitHub Actions runners don't have access to this keychain, so integration tests are automatically skipped in CI.

```bash
# Run tests locally (OAuth credentials available via Claude Code CLI)
cd agent-bridge
bun test

# All integration tests will run with real Claude SDK connections
# [ok] Pass = Code works with real Claude API
```

**Test Skip Logic:**

Tests use `describe.skipIf(process.env.GITHUB_ACTIONS === 'true')` to:

- **Run locally**: OAuth from Claude Code CLI keychain is available

- **Skip in CI**: GitHub Actions has no OAuth access, tests would fail with "No credentials found"

**If tests fail locally with "No credentials found":**

1. Ensure Claude Code CLI is installed and authenticated
2. Run `claude --version` to verify CLI is working
3. The CLI stores OAuth tokens in macOS Keychain automatically

#### Why This Matters

```text
[bad] WRONG: "Tests pass" with mocked data
   → Deploys to production
   → Real system fails because mock didn't match reality
   → Hours of debugging

[ok] RIGHT: Tests pass with real integration
   → Actual API calls verified working
   → Full data flow tested
   → Confidence that production will work
```

**Example - Adding orchestrator to session manager:**

```text
[bad] WRONG:
   - Mocked IntentAnalyzer to return fake results
   - Mocked Orchestrator to skip real execution
   - Tests pass but nothing actually works

[ok] RIGHT:
   - Created REAL sessions with REAL Claude SDK
   - Tested REAL IntentAnalyzer routing decisions
   - Verified REAL orchestrator lifecycle (create, cleanup)
   - Tested REAL snapshot conversion with actual canvas state
   - All 44 tests pass with REAL integration
```

### Tauri WebView Blur/Rendering Issues

**IMPORTANT:** Tauri's WebView (WKWebView on macOS) has different rendering behavior than Chrome/Electron. Certain CSS properties cause blurry/fuzzy text and elements during interactions (hover, click, transitions).

#### CSS Properties That Cause Blur in Tauri WebView

The following CSS properties trigger GPU compositing issues that result in momentary or persistent blur:

| Property                                       | Effect                                             | Solution                                                  |
| ---------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| `backdrop-filter: blur()`                      | Causes blur on the element and surrounding content | Remove entirely or use solid backgrounds                  |
| `color-mix()` CSS function                     | Triggers repaints that cause momentary blur        | Replace with solid CSS variables or `rgba()`              |
| `transition` on hover/click                    | GPU compositing during transition causes blur      | Remove transitions or use only on non-critical elements   |
| `animation` with `scale()`                     | Scale transforms cause blur during animation       | Remove scale animations or use opacity-only               |
| `opacity` transitions combined with transforms | Compound effect causes severe blur                 | Avoid combining opacity transitions with other transforms |

#### Example: Fixing Blurry Nodes in ReactFlow

**Problem:** Workflow nodes in Canvas app appeared blurry in Tauri but crisp in browser.

**Root Cause:** The `MarkdownCardNode.css` had these problematic styles:

```css
/* BAD - causes blur in Tauri WebView */
.card-action-toolbar {
  background: color-mix(in oklch, var(--card) 95%, transparent);
  backdrop-filter: blur(12px);
}

.card-action-toolbar__button:hover {
  background: color-mix(in oklch, var(--muted) 60%, transparent);
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.markdown-card-node {
  transition:
    box-shadow 0.15s ease,
    border-color 0.15s ease;
}
```

**Solution:** Replace with solid values and remove transitions:

```css
/* GOOD - crisp rendering in Tauri WebView */
.card-action-toolbar {
  background: var(--card);
  /* No backdrop-filter */
}

.card-action-toolbar__button:hover {
  background: var(--muted);
  /* No transition */
}

.markdown-card-node {
  /* No transition */
}
```

#### Quick Checklist for Tauri-Compatible CSS

- [ ] No `backdrop-filter: blur()` on interactive elements

- [ ] No `color-mix()` function - use CSS variables or `rgba()` instead

- [ ] No `transition` on elements inside ReactFlow's transformed viewport

- [ ] No `animation` on elements inside ReactFlow's transformed viewport

- [ ] Avoid combining `opacity` transitions with other transforms

- [ ] Test in Tauri app, not just browser (blur won't appear in browser)

**Note:** `contain: layout style paint` and `will-change: transform` do NOT fix the blur issue. The only solution for elements inside ReactFlow's viewport is to completely remove transitions and animations.

#### Debugging Blur Issues

1. **Identify the blurry element** - Check if it's specific to certain components
2. **Compare with working components** - Find similar components that render crisp
3. **Check CSS differences** - Look for `backdrop-filter`, `color-mix()`, `transition`, `animation`
4. **Remove one property at a time** - Isolate which property causes the blur
5. **Replace with solid alternatives** - Use CSS variables and remove transitions

### Known Security Vulnerabilities

**Last audited:** January 2025

| Package                     | Severity | CVE           | Status                      | Notes                                           |
| --------------------------- | -------- | ------------- | --------------------------- | ----------------------------------------------- |
| `@modelcontextprotocol/sdk` | High     | CVE-2026-0621 | \[pending] Waiting upstream | ReDoS in UriTemplate class. No patch available. |

#### MCP SDK ReDoS (CVE-2026-0621)

**Advisory:** [GHSA-8r9q-7v3j-jr4g](https://github.com/advisories/GHSA-8r9q-7v3j-jr4g)

**Issue:** The `@modelcontextprotocol/sdk` (versions ≤1.25.1) has a Regular Expression Denial of Service vulnerability in the UriTemplate class. Attackers can craft malicious URIs that trigger catastrophic regex backtracking, causing CPU exhaustion.

**Risk Assessment for Orbit:** **Low practical risk** because:

1. The agent-bridge runs as a local sidecar, not exposed to the internet
2. URIs come from our own Claude SDK calls, not untrusted user input
3. An attacker would need local access to craft malicious URIs

**Mitigation:** We've added an override for `qs>=6.14.1` to fix a related DoS vulnerability in the transitive dependency chain. The MCP SDK issue requires an upstream fix from Anthropic - update `@modelcontextprotocol/sdk` when a patched version is released.

**To check for updates:**

```bash
bun pm audit                  # Check current vulnerabilities (use npm audit if needed)
bun pm view @modelcontextprotocol/sdk version  # Check latest version
```

## CSS Architecture

**IMPORTANT:** The app uses a unified color system with agent as the source of truth.

### File Structure

```text
apps/
├── agent/src/globals.css     ← SOURCE OF TRUTH for all colors
└── canvas/src/globals.css    ← Canvas-specific styles only (NO color definitions)
```

### Import Order (apps/agent/src/main.tsx)

```typescript
import '@xyflow/react/dist/style.css'; // ReactFlow base styles
import './globals.css'; // Agent colors (source of truth)
import '@canvas/globals.css'; // Canvas styles (no color overrides)
```

### Color Variables

All color variables are defined in `apps/agent/src/globals.css`:

| Variable       | Light Mode        | Dark Mode         | Purpose               |
| -------------- | ----------------- | ----------------- | --------------------- |
| `--background` | `oklch(0.95 ...)` | `oklch(0.16 ...)` | Main app background   |
| `--chat-area`  | `oklch(0.93 ...)` | `oklch(0.18 ...)` | Chat messages area    |
| `--card`       | `oklch(0.90 ...)` | `oklch(0.20 ...)` | Cards, headers, input |
| `--sidebar`    | `oklch(0.96 ...)` | `oklch(0.20 ...)` | Sidebar background    |
| `--primary`    | `oklch(0.56 ...)` | `oklch(0.68 ...)` | Coral accent          |

### Rules

1. **NEVER define** **`:root`** **color variables in canvas globals.css** - They will override agent colors
2. **Canvas uses agent's variables** - e.g., `var(--background)`, `var(--card)`, `var(--primary)`
3. **Canvas globals.css contains only:**
   - Tailwind `@theme` mappings (pointing to agent's variables)

   - ReactFlow style overrides (`.react-flow__*`)

   - Scrollbar styling

   - Base layout (html, body, #root)

### Adding New Colors

1. Add the variable to `apps/agent/src/globals.css` in both `:root` and `html.dark` sections
2. Add the Tailwind mapping in `@theme inline { }` block
3. Canvas will automatically have access to the new variable

## Canvas App

The Canvas app is embedded within the Agent app as a mode/tab (not a separate Tauri window).

### Architecture

```text
┌─────────────────────────────────────────────────┐
│  Orbit App (Single Tauri Window)                │
│  ┌───────────────────────────────────────────┐  │
│  │  HeaderBar [Agent] [Canvas] [Editor]      │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │  activeTab === 'agent'  → RootLayout      │  │
│  │  activeTab === 'canvas' → CanvasApp       │  │
│  │  activeTab === 'editor' → EditorMode      │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │  StatusBar                                │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Canvas Libraries

- **@xyflow/react** (ReactFlow) - Node-based canvas

- **@codesandbox/sandpack-react** - Code playground integration

- **Zustand** - State management (`apps/canvas/src/stores/`)

### Canvas Directory Structure

```text
apps/canvas/src/
├── components/          # React components (nodes, panels, toolbars)
├── hooks/               # Custom React hooks
├── lib/                 # Utilities and design tokens
├── types/               # TypeScript type definitions
├── config/              # Configuration files
├── sandpack/            # Sandpack integration
├── stores/              # Zustand stores
├── main.tsx             # Entry point (standalone mode only)
├── globals.css          # Canvas styles (no colors!)
└── CanvasApp.tsx        # Root component (imported by agent)
```

---

## Changelog

### January 2026

- **Migrated from pnpm to Bun** - All package management now uses Bun for faster installs and unified tooling
  - Removed `pnpm-workspace.yaml` - workspaces defined in `package.json`

  - Removed `pnpm-lock.yaml` - replaced by `bun.lockb`

  - Updated all scripts, CI workflows, and husky hooks to use `bun`

  - Added comprehensive `lint-all.sh` script for running all checks

- **Added comprehensive audit** - Aligned all linting, TypeScript, and CI checks across the monorepo

- **Documented module organization patterns** - Barrel pattern for frontend, explicit paths for Rust backend
  - Frontend: Every folder with multiple files gets an `index.ts` barrel

  - Backend: Tauri commands use explicit paths, shared crates use selective re-exports
