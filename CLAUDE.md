# CLAUDE.md

This file provides guidance to Claude Code when working with the Orbit codebase.

> **Extended Documentation:** For detailed examples, historical context, and verbose explanations, see [`CLAUDE-CONTINUOUS.md`](./CLAUDE-CONTINUOUS.md).

## Project Overview

Orbit is a modern AI-powered code editor built with **Tauri 2** (Rust backend) and **React 19** (TypeScript frontend). It's a monorepo containing three frontend apps (Orbit Agent, Orbit Canvas, Orbit Editor) that share a common Rust backend.

## Technology Stack

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

**IMPORTANT:** This project uses **Bun** exclusively. Never use `npm` or `pnpm`.

| Context         | Use     | Why                                                          |
| --------------- | ------- | ------------------------------------------------------------ |
| Root monorepo   | **Bun** | Fast package management with workspace support               |
| `apps/*`        | **Bun** | Part of Bun workspace                                        |
| `agent-bridge/` | **Bun** | Claude Agent SDK sidecar - compiles to standalone Bun binary |

**Rules:**

1. **Never use `npm` or `pnpm`** - Always use `bun`
2. **Use `bun run`** for all scripts
3. **Use `bun install`** for installing dependencies
4. **Run tests with `bun test`**

```bash
# ✅ CORRECT
bun install                 # Install dependencies
bun run dev                 # Start Vite dev server
bun run build               # Build the app
bun test                    # Run tests

# ❌ WRONG - Never use npm or pnpm
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
│   ├── Canvas-UI-Builder/          # Canvas UI Builder app (Active)
│   │   └── src/
│   │       ├── components/
│   │       │   ├── setup/          # Setup wizard
│   │       │   ├── inspector/      # Props editor panel
│   │       │   ├── preview/        # Live preview panel
│   │       │   ├── sidebar/        # Component library
│   │       │   ├── dialogs/        # Save component dialog
│   │       │   └── layout/         # Layout components
│   │       ├── hooks/              # Canvas-specific hooks
│   │       └── stores/             # Canvas Zustand stores
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
│   │   │   ├── canvas/             # Canvas UI Builder commands
│   │   │   │   ├── setup.rs        # ~/.orbit/canvas directory management
│   │   │   │   ├── download.rs     # Download shadcn components
│   │   │   │   ├── save.rs         # Save/export customized components
│   │   │   │   ├── preview.rs      # Vite preview server lifecycle
│   │   │   │   └── tests.rs        # Type serialization tests
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

## Development Workflow

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

Then restart Tauri (`Cmd+C` → `bunx tauri dev`).

**Build outputs:**

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

- **No `any`** - All unsafe operations are errors
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

## Agent Skills

This project includes AI coding assistant skills adapted from [Vercel's agent-skills](https://github.com/vercel-labs/agent-skills). These provide performance optimization and design guidelines that should be applied when writing or reviewing code.

### Available Skills

| Skill                     | File                                             | When to Apply                                                  |
| ------------------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| **React Best Practices**  | `.claude/skills/react-best-practices.md`         | Writing React components, data fetching, bundle optimization   |
| **Web Design Guidelines** | `.claude/skills/web-design-guidelines.md`        | UI review, accessibility checks, form implementation           |
| **Web Animation**         | `.claude/skills/web-animation-best-practices.md` | CSS animations, Framer Motion, transitions, micro-interactions |

### Key Rules by Priority

**CRITICAL Impact:**

- `async-parallel` - Use `Promise.all()` for independent async operations
- `bundle-dynamic-imports` - Lazy-load heavy components (CodeMirror, Shiki, etc.)
- `bundle-barrel-imports` - Import from specific files, not barrel `index.ts`
- `anim-transform-opacity` - Only animate `transform` and `opacity` properties
- `anim-reduced-motion` - Always respect `prefers-reduced-motion` media query

**HIGH Impact:**

- `server-cache-react` - Use React.cache() for per-request deduplication
- `rerender-defer-reads` - Don't subscribe to state only used in callbacks
- Accessibility: All icon buttons need `aria-label`
- `anim-easing-custom` - Use custom cubic-bezier curves, not default `ease`/`linear`
- `anim-duration-300ms` - Keep animations under 300ms for perceived performance

**MEDIUM Impact:**

- `rerender-functional-setstate` - Use functional setState for stable callbacks
- `js-index-maps` - Build Map for O(1) lookups in repeated operations
- Forms: Use correct input `type`, `autocomplete`, and `inputMode`
- `anim-transform-origin` - Animate from contextually meaningful locations
- `anim-interruptible` - Ensure animations can be smoothly interrupted

See `.claude/skills/` for complete guidelines. Code examples in `CLAUDE-CONTINUOUS.md`.

## Module Organization Patterns

| Layer              | Pattern                 | Reason                            |
| ------------------ | ----------------------- | --------------------------------- |
| Frontend TS        | **Barrel** (`index.ts`) | Users import from modules         |
| Tauri commands     | **Explicit paths**      | Internal, registered by function  |
| Shared Rust crates | **Selective re-export** | Convenience for cross-crate types |

- **Frontend:** Every folder with multiple files should have an `index.ts` barrel
- **Rust commands:** Use explicit `pub mod` declarations, no re-exports
- **Shared crates:** Re-export commonly used types at crate root

See `CLAUDE-CONTINUOUS.md` for detailed examples.

## Monorepo Structure

### Apps (`apps/`)

| App                 | Description                          | Status |
| ------------------- | ------------------------------------ | ------ |
| `agent`             | Chat/AI agent interface              | Active |
| `Canvas-UI-Builder` | Visual component builder with shadcn | Active |
| `editor`            | Code editor                          | Stub   |

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

| Folder    | Description                                        |
| --------- | -------------------------------------------------- |
| `common/` | Shared commands (files, terminal, git, etc.)       |
| `agent/`  | Agent-specific commands (ai, conversations)        |
| `canvas/` | Canvas UI Builder (setup, download, save, preview) |
| `editor/` | Editor-specific commands (stub)                    |

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
- [x] Embedded browser panel (WebKit via Tauri multiwebview)
- [x] Canvas UI Builder (setup, download, preview, save, export)

### In Progress

- [ ] Editor app implementation
- [ ] Shared packages extraction

### TODO

- [ ] Tree-sitter syntax highlighting
- [ ] LSP/diagnostics integration
- [ ] Advanced search features

## Troubleshooting

### Zod Schema Validation Errors

If you see "Invalid credentials", "Unrecognized keys", or parsing errors, **check Zod schemas first**:

- `agent-bridge/src/schemas.ts` - Bridge IPC schemas
- `packages/shared-schemas/` - Shared validation schemas

**Quick fix:** Use `.loose()` for external data, `.strict()` for internal. See `CLAUDE-CONTINUOUS.md` for examples.

### Integration Test Coverage

**IMPORTANT:** When creating integration tests for a function or feature, always add a warning comment to the source file being tested. This ensures future developers know to run and update tests when modifying the code.

**Comment format:**

```typescript
/**
 * [existing docstring...]
 *
 * ⚠️  TESTED: This function is covered by integration tests.
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

**When adding new tests:** Always add the ⚠️ TESTED comment to the source function/handler being tested.

### Mandatory Test Requirements

**CRITICAL:** We follow **real integration testing**, not unit testing with mocks.

| ❌ DO NOT                        | ✅ DO                                |
| -------------------------------- | ------------------------------------ |
| Mock the Claude SDK              | Use REAL Claude API calls            |
| Test single files in isolation   | Test full module integration         |
| Use fake data that always passes | Use real data through real pipelines |

**Running Tests:**

```bash
cd agent-bridge && bun test   # Integration tests (run locally, skipped in CI)
```

**Note:** Tests require Claude Code CLI OAuth credentials (macOS Keychain). They auto-skip in GitHub Actions.

### Known Security Vulnerabilities

**Last audited:** January 2025

| Package                     | Severity | CVE           | Status              | Notes                                           |
| --------------------------- | -------- | ------------- | ------------------- | ----------------------------------------------- |
| `@modelcontextprotocol/sdk` | High     | CVE-2026-0621 | ⏳ Waiting upstream | ReDoS in UriTemplate class. No patch available. |

CVE-2026-0621: ReDoS in UriTemplate. Low practical risk (local sidecar only). Update `@modelcontextprotocol/sdk` when patched.

## CSS Architecture

**IMPORTANT:** The app uses a unified color system with agent as the source of truth.

### File Structure

```text
apps/
├── agent/src/globals.css              ← SOURCE OF TRUTH for all colors
└── Canvas-UI-Builder/src/globals.css  ← Canvas-specific styles only (NO color definitions)
```

### Import Order (apps/agent/src/main.tsx)

```typescript
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

1. **NEVER define `:root` color variables in canvas globals.css** - They will override agent colors
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

## Canvas UI Builder

The Canvas UI Builder is a visual component customization tool that lets you browse, customize, and export shadcn/ui components.

### Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│  Canvas UI Builder                                               │
│  ┌─────────────┬──────────────────────┬───────────────────────┐ │
│  │ Left Sidebar│   Preview Panel      │   Inspector Panel     │ │
│  │             │                      │                       │ │
│  │ Component   │   Live component     │   Props Editor        │ │
│  │ Library     │   preview via Vite   │   (variant, size,     │ │
│  │             │   dev server         │    disabled, etc.)    │ │
│  │             │                      │                       │ │
│  │ [Button]    │   ┌──────────────┐   │   Variant: [default]  │ │
│  │ [Card]      │   │   Button     │   │   Size: [md]          │ │
│  │ [Dialog]    │   │   Preview    │   │   Disabled: [ ]       │ │
│  │ [Input]     │   └──────────────┘   │                       │ │
│  │ ...         │                      │   [Save Component]    │ │
│  └─────────────┴──────────────────────┴───────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### First-Run Setup

On first launch, the `CanvasSetupWizard` initializes `~/.orbit/canvas/`:

1. Creates directory structure
2. Downloads shadcn/ui components from registry
3. Sets up Vite preview server config
4. Installs npm dependencies

### Backend Commands (Rust)

| Command                       | Description                              |
| ----------------------------- | ---------------------------------------- |
| `canvas_check_setup`          | Check if ~/.orbit/canvas is initialized  |
| `canvas_initialize`           | Create directory structure               |
| `canvas_download_components`  | Download shadcn components from registry |
| `canvas_start_preview_server` | Start Vite dev server for live preview   |
| `canvas_stop_preview_server`  | Stop the preview server                  |
| `canvas_save_component`       | Save customized component to registry    |
| `canvas_export_to_project`    | Export component to external project     |

### Frontend Hooks

| Hook                   | Description                         |
| ---------------------- | ----------------------------------- |
| `useCanvasSetup`       | Setup state and initialization flow |
| `useComponentRegistry` | Local component registry CRUD       |
| `usePreviewServer`     | Preview server lifecycle management |

### Canvas Directory Structure

```text
apps/Canvas-UI-Builder/src/
├── components/
│   ├── setup/              # CanvasSetupWizard
│   ├── inspector/          # InspectorPanel, PropsEditor
│   ├── preview/            # PreviewPanel (Vite iframe)
│   ├── sidebar/            # ComponentList
│   ├── dialogs/            # SaveComponentDialog
│   └── layout/             # CanvasRootLayout, sidebars
├── hooks/
│   ├── use-canvas-setup.ts
│   ├── use-component-registry.ts
│   └── use-preview-server.ts
├── stores/
│   ├── css-customization-store.ts
│   └── design-tokens-store.ts
├── CanvasApp.tsx           # Root component
└── globals.css             # Canvas styles (no colors!)
```

### ~/.orbit/canvas Structure

```text
~/.orbit/canvas/
├── components/
│   └── ui/                 # Downloaded shadcn components
│       ├── button.tsx
│       ├── card.tsx
│       └── ...
├── lib/
│   └── utils.ts            # cn() utility
├── registry/
│   └── local.json          # Saved customized components
├── package.json            # Dependencies
└── vite.config.ts          # Preview server config
```

---

## Feature Documentation

For detailed documentation on specific features, see the `docs/` folder:

| Feature          | Documentation                                                                    | Description                                                                  |
| ---------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Embedded Browser | [`docs/architecture/EMBEDDED_BROWSER.md`](docs/architecture/EMBEDDED_BROWSER.md) | Tauri multiwebview browser panel, WKWebView workarounds, idle timeout system |
| CSP Security     | [`docs/architecture/CSP-SECURITY.md`](docs/architecture/CSP-SECURITY.md)         | Content Security Policy config, why `unsafe-eval` is required for streamdown |

---

## Changelog

### January 2026

- **Canvas UI Builder** - Visual component builder with shadcn/ui (Rust backend + React frontend)
- **Agent Skills** - Vercel's react-best-practices and web-design-guidelines
- **Embedded browser** - WebKit via Tauri multiwebview
- **pnpm → Bun** migration

See `CLAUDE-CONTINUOUS.md` for detailed changelog.
