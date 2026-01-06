# CLAUDE.md

This file provides guidance to Claude Code when working with the Snowflake codebase.

## Project Overview

Snowflake is a modern AI-powered code editor built with **Tauri 2** (Rust backend) and **React 19** (TypeScript frontend). It's a monorepo containing three frontend apps (Agent, Canvas, Editor) that share a common Rust backend.

## Technology Stack

### Frontend

- **React 19** + TypeScript + Vite
- **pnpm** workspaces for monorepo management
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

## Project Structure

```
Snowflake-v0/
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
│   ├── common/                     # Shared crates
│   │   ├── core/                   # Core types, config, state
│   │   ├── fs/                     # File system operations
│   │   ├── terminal/               # PTY management
│   │   ├── git/                    # Git operations
│   │   ├── ai/                     # Claude API integration
│   │   ├── lsp/                    # Language server
│   │   ├── search/                 # Ripgrep search
│   │   ├── syntax/                 # Syntax highlighting
│   │   ├── settings/               # Settings persistence
│   │   └── conversations/          # Conversation storage
│   │
│   ├── agent/                      # Agent-specific Rust (stub)
│   ├── canvas/                     # Canvas-specific Rust (stub)
│   └── editor/                     # Editor-specific Rust (stub)
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
├── package.json                    # pnpm workspace root
├── pnpm-workspace.yaml             # Workspace config
├── vite.config.ts                  # Vite config (root: apps/agent)
└── tsconfig.json                   # TypeScript config
```

## Commands

```bash
# Frontend Development
pnpm install             # Install dependencies
pnpm dev                 # Start Vite dev server only (port 5176)
pnpm build               # TypeScript check + production build
pnpm preview             # Preview production build

# Quality Checks
pnpm typecheck           # TypeScript only (tsc --noEmit)
pnpm lint                # ESLint with zero warnings tolerance
pnpm lint:fix            # ESLint with auto-fix
pnpm check               # typecheck + lint
pnpm ci                  # Full CI: typecheck + lint + build

# Tauri Development (RECOMMENDED)
pnpm tauri dev           # Start full app (Vite + Tauri + Rust)
pnpm tauri build         # Build production app (.dmg/.exe/.AppImage)

# Rust Only (from project root)
cargo build              # Build all Rust crates
cargo check              # Fast type checking
cargo test               # Run Rust tests
cargo clippy             # Lint Rust code
```

## Development Workflow

### Starting Development

```bash
pnpm tauri dev           # Starts everything: Vite (5176) + Tauri + Rust
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
npm run build:dev    # Compiles to target/debug/agent-bridge
```

Then restart the Tauri app (`Cmd+C` → `pnpm tauri dev`).

**Why manual rebuild?**

- Tauri watches Rust code, not the agent-bridge TypeScript
- The sidecar is a standalone binary (58MB) with embedded Bun runtime
- Located at `target/debug/agent-bridge` in dev mode

**Two build outputs:**
| Script | Output | Purpose |
|--------|--------|---------|
| `npm run build` | `dist/index.js` | JS bundle (requires Bun to run) |
| `npm run build:dev` | `target/debug/agent-bridge` | Standalone binary for Tauri |

### Production Build

```bash
pnpm tauri build
```

Creates distributable app in `src-tauri/target/release/bundle/`:

- **macOS**: `.dmg` and `.app`
- **Windows**: `.exe` and `.msi`
- **Linux**: `.AppImage` and `.deb`

### Frontend-Only Development

If you only need to work on React/UI without Tauri:

```bash
pnpm dev                 # Vite only on port 5176
```

Note: Backend features (file system, terminal, etc.) won't work in browser-only mode.

### Configuration Files

| File                        | Purpose                                       |
| --------------------------- | --------------------------------------------- |
| `src-tauri/tauri.conf.json` | Tauri app config (window, permissions, build) |
| `vite.config.ts`            | Vite bundler config (root: apps/agent)        |
| `Cargo.toml`                | Rust workspace root                           |
| `pnpm-workspace.yaml`       | pnpm workspace packages                       |
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

| Store               | Purpose                                 |
| ------------------- | --------------------------------------- |
| `ui-store`          | Panel layout, dimensions, active tabs   |
| `chat-store`        | Conversations, messages                 |
| `agent-store`       | Task execution state                    |
| `terminal-store`    | xterm sessions                          |
| `file-store`        | File tree state                         |
| `file-viewer-store` | Open file tabs, content, modified state |
| `git-store`         | Git branch, status, ahead/behind        |
| `tool-store`        | Tool execution & visualization          |
| `browser-store`     | Browser/webpage viewing state           |

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

### App-Specific Crates (`crates/{agent,canvas,editor}/`)

Currently stubs - will contain app-specific Rust code as needed.

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
- [x] pnpm workspace management
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

**CRITICAL:** Tests are not optional. We follow **real integration testing**, not unit testing with mocks.

#### Testing Philosophy

1. **NO MOCK DATA** - Tests must use real systems, real API calls, real data flows
2. **NO FAKE PASSES** - A test that just "passes" without exercising real code paths is worthless
3. **FULL INTEGRATION** - Test the entire system flow, not isolated files
4. **INDUSTRY STANDARD** - Follow proper integration testing practices used in production systems

#### What We Test

| ❌ DO NOT                        | ✅ DO                                    |
| -------------------------------- | ---------------------------------------- |
| Mock the Claude SDK              | Use REAL Claude API calls                |
| Test single files in isolation   | Test full module integration             |
| Use fake data that always passes | Use real data through real pipelines     |
| Skip API calls to "save time"    | Make actual API calls to verify behavior |
| Test only the happy path         | Test error paths, edge cases, cleanup    |

#### Test Structure

```
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
   - Add the ⚠️ TESTED comment to the source file

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
// ❌ BAD: Mock test that proves nothing
it('should analyze intent', () => {
  const mockAnalyzer = { analyze: () => ({ useFastPath: true }) };
  expect(mockAnalyzer.analyze('test').useFastPath).toBe(true);
});

// ✅ GOOD: Real integration test
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

#### Why This Matters

```
❌ WRONG: "Tests pass" with mocked data
   → Deploys to production
   → Real system fails because mock didn't match reality
   → Hours of debugging

✅ RIGHT: Tests pass with real integration
   → Actual API calls verified working
   → Full data flow tested
   → Confidence that production will work
```

**Example - Adding orchestrator to session manager:**

```
❌ WRONG:
   - Mocked IntentAnalyzer to return fake results
   - Mocked Orchestrator to skip real execution
   - Tests pass but nothing actually works

✅ RIGHT:
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
