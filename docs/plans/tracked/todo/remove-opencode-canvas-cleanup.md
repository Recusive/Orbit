# Plan: Remove Agent-Backend, OpenCode, and Canvas from Orbit

## Context

Orbit currently has two systems being removed:

1. **Agent-Backend/OpenCode** — A dual-backend engine (2.7GB, 2,987 git-tracked files) that powers the OpenCode backend, Orbit CLI, and orbit-server sidecar. The frontend has a backend adapter layer (`BackendId = 'claude' | 'opencode'`) that switches between Claude and OpenCode backends.
2. **Canvas-UI-Builder** — A visual component customization app (53 TS/TSX files + ~4,900 LOC Rust commands).

After removal, Orbit becomes a single-backend app (Claude only via agent-bridge sidecar). The backend adapter abstraction is fully collapsed. The Orbit Terminal App plans are archived for potential future revival with a different engine.

---

## Phase 1: Rust Backend Cleanup

**Goal**: Remove all opencode + canvas Rust code. `cargo check` passes.
**Verify**: `cargo check --all-features && cargo clippy --all-targets --all-features -- -D warnings`

### 1.1 Delete directories

- `rm -rf src-tauri/src/opencode/` (mod.rs, process.rs)
- `rm -rf src-tauri/src/commands/opencode/` (mod.rs, lifecycle.rs)
- `rm -rf src-tauri/src/commands/canvas/` (9 files: mod.rs, lifecycle.rs, setup.rs, download.rs, preview.rs, save.rs, persist.rs, transform.rs, tests.rs)

### 1.2 Edit `src-tauri/src/commands/mod.rs`

- Remove line 5: `pub mod canvas;`
- Remove lines 8-9: `/// OpenCode lifecycle commands.` + `pub mod opencode;`

### 1.3 Edit `src-tauri/src/lib.rs` — 5 surgical zones

**Zone A — Module declaration (line 9-10):**

- Remove `/// OpenCode backend process management.` + `pub mod opencode;`

**Zone B — Imports (lines 25-32, 38, 40):**

- Remove all `commands::canvas::*` imports (lines 25-32)
- Remove `commands::opencode::lifecycle as opencode_cmd;` (line 38)
- Remove `opencode::process::{resolve_opencode_binary_path, OpenCodeProcessState};` (line 40)

**Zone C — State init (lines 299-305, 316-317):**

- Remove the `opencode_binary_path` resolution block (lines 299-305)
- Remove `.manage(PreviewServerState::new())` (line 316)
- Remove `.manage(OpenCodeProcessState::new(opencode_binary_path))` (line 317)

**Zone D — Command registration (lines 445-487, 658-660):**

- Remove all canvas command registrations (lines 445-487, 43 entries)
- Remove opencode command registrations (lines 658-660, 3 entries)

**Zone E — Lifecycle cleanup (lines 706-717):**

- Remove the entire OpenCode shutdown block in `RunEvent::Exit` (lines 706-717)
- Keep the agent-bridge shutdown block above it (lines 696-704)

### 1.4 Edit `src-tauri/build.rs`

- Remove `warn_if_missing(&binary_dir, "orbit-server", false);` (line 41)

### 1.5 Edit `src-tauri/src/agent/protocol.rs`

- Remove Canvas variants from `BridgeRequest` enum: `CanvasCreateSession`, `CanvasDeleteSession`, `CanvasSendMessage`, `CanvasInterrupt`, `CanvasToolResponse`
- Remove Canvas variants from `BridgeEvent` enum: `CanvasMessage`, `CanvasToolRequest`, `CanvasError`
- Remove ALL Canvas type definitions (10 structs/enums):
  - `CanvasPosition` (line 784)
  - `CanvasNodeType` (line 792)
  - `CanvasNode` (line 924)
  - `CanvasEdge` (line 942)
  - `CanvasState` (line 957)
  - `CanvasSessionConfig` (line 969)
  - `PageLayout`, `PageViewport`, `SlotPositionMode`, `LayoutOptions` (between CanvasNodeType and CanvasNode)
- **KEEP `McpToolRequest` and `McpToolResponse`** — these are shared types used by the browser system (`emit_browser_tool_request`, `browser_tool_response`). Do NOT delete them.

### 1.6 Edit `src-tauri/src/commands/agent/lifecycle.rs`

- Remove canvas match arms in event callback (lines 699-709): `BridgeEvent::CanvasMessage`, `BridgeEvent::CanvasToolRequest`, `BridgeEvent::CanvasError`
- Remove 3 canvas helper functions:
  - `emit_canvas_message` (line 603)
  - `emit_canvas_tool_request` (line 614)
  - `emit_canvas_error` (line 636)
- Remove `SDKMessage` from the import on line 506 — it's only used by `emit_canvas_message`. After that function is deleted, the unused import will fail clippy (`unused_imports`)

### 1.7 Edit `src-tauri/src/agent/session.rs`

- Remove canvas methods: `canvas_create_session`, `canvas_delete_session`, `canvas_send_message`, `canvas_interrupt`, `canvas_tool_response`
- Remove canvas-related imports (e.g. `CanvasSessionConfig`, `CanvasState`)
- **KEEP `browser_tool_response`** — browser system still uses it

### 1.8 Edit `src-tauri/src/core/preflight.rs`

- Remove line 10: `use crate::opencode::process::resolve_opencode_binary_path;`
- Remove lines 363-388: the entire `orbit_server` preflight check block (resolves path, checks existence, generates warn/ok status)

---

## Phase 1B: Agent-Bridge Canvas Cleanup (Node.js Sidecar)

**Goal**: Remove all canvas code from the agent-bridge sidecar. `cd agent-bridge && bun run typecheck` passes.
**Verify**: `cd agent-bridge && bun run typecheck && bun test`

### 1B.1 Delete canvas directory

- `rm -rf agent-bridge/src/canvas/` (32 files across 6 subdirectories):
  - `core/` — canvas-agent.ts, mission-agent-factory.ts
  - `mcp/` — canvas-mcp-server.ts, canvas-tool-bridge.ts, canvas-tools.ts
  - `orchestrator/` — orchestrator.ts, intent-analyzer.ts, task-decomposer.ts, task-executor.ts, blackboard.ts, conflict-resolver.ts, node-lock-manager.ts, types.ts + `agents/` subfolder (base-agent.ts, component-agent.ts, layout-agent.ts, style-agent.ts, integration-agent.ts)
  - `session/` — canvas-session-manager.ts
  - `prompts/` — system-prompt.ts
  - `types/` — types.ts, schemas.ts

### 1B.2 Delete canvas test files (9 files, ~130KB)

- `agent-bridge/src/__tests__/canvas-e2e.test.ts`
- `agent-bridge/src/__tests__/canvas-real-e2e.test.ts`
- `agent-bridge/src/__tests__/canvas-types.test.ts`
- `agent-bridge/src/__tests__/canvas-integration.test.ts`
- `agent-bridge/src/__tests__/canvas-mcp-server.test.ts`
- `agent-bridge/src/__tests__/canvas-integration-terminal.ts`
- `agent-bridge/src/__tests__/canvas-terminal-test.ts`
- `agent-bridge/src/__tests__/orchestrator-e2e.test.ts` (tests canvas orchestrator)
- `agent-bridge/src/__tests__/blackboard.test.ts` (tests canvas orchestrator blackboard)

### 1B.3 Edit `agent-bridge/src/index.ts`

- Remove line 61: `CanvasSessionManager` import
- Remove line 147: CanvasSessionManager instantiation
- Remove lines 262-287: canvas event handler wiring (onMessage, onToolRequest, onError)
- Remove lines 724-749: canvas request handlers (`canvas:create_session`, `canvas:delete_session`, `canvas:send_message`, `canvas:interrupt`, `canvas:tool_response`)

### 1B.4 Edit `agent-bridge/src/protocol/schemas.ts`

- Remove lines 521-530: `CanvasSessionConfigSchema`
- Remove lines 563-606: Canvas request schemas (create_session, delete_session, send_message, interrupt, tool_response)
- Remove lines 696-730: Canvas response/event schemas (canvas:message, canvas:tool_request, canvas:error)

### 1B.5 Relocate `McpToolRequest`/`McpToolResponse` before deleting canvas

These types are **defined** in `agent-bridge/src/canvas/types/types.ts` (lines 239, 248) but **used by the browser system** via `agent-bridge/src/protocol/protocol.ts` line 21. Deleting the canvas directory without relocating them breaks the browser tool flow.

- **Move** `McpToolRequest` and `McpToolResponse` interfaces from `canvas/types/types.ts` → `agent-bridge/src/protocol/protocol.ts` (inline) or `agent-bridge/src/common/types/mcp.ts` (new shared file)
- Update the import in `protocol.ts` line 21: remove `../canvas/types/types.js`, import from new location
- Update any other files that import these types from canvas

### 1B.6 Edit `agent-bridge/src/protocol/protocol.ts`

- Remove canvas type imports (`CanvasSessionConfig`, `CanvasState`, `SDKMessage`) from line 21-27
- Remove lines 392-428: Canvas request interfaces
- Remove lines 696-730: Canvas event interfaces

### 1B.7 Edit `agent-bridge/src/protocol/index.ts`

- Remove lines 42-46: Canvas request/event type re-exports (`CanvasCreateSessionRequest`, `CanvasDeleteSessionRequest`, `CanvasSendMessageRequest`, `CanvasInterruptRequest`, `CanvasToolResponseRequest`)
- Remove any canvas response/event type re-exports

---

## Preserved OpenCode UI Components

These OpenCode-unique UI components are **NOT deleted** — they are preserved as reference implementations in `reference/preserved-oc-components/` (outside the source tree, not compiled/linted/typechecked).

| Component              | Source File                             | Unique UI Pattern                                                                                                             |
| ---------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **OcModelSelector**    | `oc-control-bar/OcModelSelector.tsx`    | Multi-provider model dropdown with search, filter mode, hidden model toggle, scroll-aware mask gradient                       |
| **OcProviderDialog**   | `oc-control-bar/OcProviderDialog.tsx`   | Provider connection dialog — Connected/Available groups, contextual state buttons, scroll-aware mask                          |
| **OcThinkingSelector** | `oc-control-bar/OcThinkingSelector.tsx` | Model variant/thinking level selector with auto-format                                                                        |
| **ProvidersSettings**  | `settings/pages/ProvidersSettings.tsx`  | Multi-provider auth flow UI — API key input, OAuth code flow, OAuth auto flow, provider catalog, post-connection model picker |
| **BackendSettings**    | `settings/pages/BackendSettings.tsx`    | Engine health status indicator with pulsing dot animation, Start/Stop/Restart process controls                                |

**Note:** `QuestionPrompt` (`input/question-prompt.tsx`) is NOT preserved here — it is **live shared UI** used by both `oc-question-modal.tsx` AND `ask-user-question-modal.tsx`. It stays in place as a canonical shared component.

### Preservation steps

1. Create `reference/preserved-oc-components/` (outside `apps/agent/src/` — avoids tsconfig/eslint/knip conflicts)
2. Copy the 6 files above into it as flat `.tsx` files
3. Add a `README.md` explaining these are preserved UI pattern references, not importable code
4. These files are **not compiled, linted, or typechecked** — they live outside the source tree as reference only
5. No config changes needed since `reference/` is not in any tsconfig `include`, eslint target, or knip entry

---

## Phase 2: Frontend — Delete OpenCode Leaf Modules

**Goal**: Remove all pure-opencode frontend code (nothing depends on these). Preserved components (above) are moved first.

### 2.1 Delete directories

- `apps/agent/src/services/opencode/` (6 files)
- `apps/agent/src/stores/opencode/` (5 files)
- `apps/agent/src/hooks/opencode/` (use-opencode-lifecycle.ts)
- `apps/agent/src/types/opencode/` (index.ts)

### 2.2 Delete individual files (after copying preserved components to `reference/preserved-oc-components/`)

- `apps/agent/src/hooks/chat/use-oc-chat.ts`
- `apps/agent/src/hooks/chat/use-oc-chat-adapter.ts`
- `apps/agent/src/hooks/chat/use-oc-streaming-reveal.ts`
- `apps/agent/src/components/chat/OcAgentSurface.tsx`
- `apps/agent/src/components/chat/BackendChatSurface.tsx`
- `apps/agent/src/components/chat/input/oc-question-modal.tsx`
- `apps/agent/src/components/chat/oc-control-bar/` (originals deleted after copy to `reference/`)
- `apps/agent/src/components/modals/settings/pages/BackendSettings.tsx` (original deleted after copy to `reference/`)
- `apps/agent/src/components/modals/settings/pages/ProvidersSettings.tsx` (original deleted after copy to `reference/`)
- `apps/agent/src/lib/api/opencode.ts`
- `apps/agent/src/data/opencode-providers.json`
- `apps/agent/src/services/conversations/oc-ui-bridge.ts`
- `apps/agent/src/services/conversations/oc-conversation-repo.ts`

### 2.3 Delete ALL opencode test files (~18 files)

- `apps/agent/src/__tests__/unit/stores/opencode/`
- `apps/agent/src/__tests__/unit/services/opencode/`
- `apps/agent/src/__tests__/unit/services/conversations/oc-ui-bridge.test.ts`
- `apps/agent/src/__tests__/unit/hooks/opencode/`
- `apps/agent/src/__tests__/unit/hooks/chat/use-oc-streaming-reveal.test.ts`
- `apps/agent/src/__tests__/unit/hooks/chat/use-oc-chat-streaming.test.ts`
- `apps/agent/src/__tests__/unit/hooks/chat/use-oc-chat-adapter.test.ts`
- `apps/agent/src/__tests__/unit/hooks/chat/use-oc-chat-adapter-compact.test.ts`
- `apps/agent/src/__tests__/integration/services/opencode/`
- `apps/agent/src/__tests__/unit/components/chat/input/oc-question-modal.test.tsx`

---

## Phase 3: Frontend — Collapse Backend Adapter Layer

**Goal**: Remove the dual-backend abstraction. Only claude backend remains.

### 3.1 Delete adapter infrastructure

- `apps/agent/src/types/backend/` (adapter.ts, conversation-repository.ts, conversation-ui-bridge.ts, index.ts)
- `apps/agent/src/stores/backend/` (backend-store.ts, index.ts)

### 3.2 Collapse conversation service dispatch

File: `apps/agent/src/services/conversations/index.ts`

- Remove imports of oc repos, BackendId, useBackendStore
- `getConversationRepo()` → direct export of claude implementation
- `getConversationUiBridge()` → direct export of claude implementation

### 3.3 Update ~28 files that reference `useActiveBackend` / `useBackendStore`

Two mechanical patterns:

- **Pattern A (conditional render)**: Delete the `if (activeBackend === 'opencode')` branch, keep claude path. Remove `useActiveBackend` import.
- **Pattern B (dispatch/capability check)**: Replace `getConversationUiBridge(activeBackend)` with direct call. Remove capability map lookups.

Key files (non-exhaustive — grep will find all):

- `BackendChatSurface.tsx` → becomes direct render of ClaudeChatSurface
- `InputControls.tsx` → remove OcModelSelector, OcThinkingSelector imports
- `MessageItem.tsx` → inline claude capability values
- `PrimarySidebar.tsx` → remove backend branching
- `use-sidebar-actions.ts` → remove backend dispatch
- `use-conversation-list.ts` → always use claude conversation mapping
- `use-conversation-meta.ts` → always use claude meta
- `tauri-provider.tsx` → remove `onOpencodeReady`/`onOpencodeCrashed` listeners
- `use-chat-input.ts` → remove backend branching
- `AccountSettings.tsx` → remove backend guard
- `navigation-tracker.ts` → remove opencode session imports

### 3.4 Fix barrel exports

- `hooks/chat/index.ts` → remove oc re-exports
- `hooks/index.ts` → remove `export * from '@orbit/common/hooks/canvas'` (line 13)
- `components/chat/input/index.ts` → remove OcQuestionModal export and `OcQuestionRequest`/`OcQuestionAnswer` types
- `lib/api/index.ts` → remove `export * from './opencode'`
- `services/conversations/index.ts` → simplified in 3.2

### 3.5 Fix root-level files with stale imports

- `ChatInput.tsx` (line 15): Remove `import { OcQuestionModal } from './oc-question-modal'` and all OcQuestionModal JSX usage
- `chat-area/types.ts` (line 5): Remove `import type { OcQuestionAnswer, OcQuestionRequest } from '@/types/opencode'` and remove these from the type definitions
- `todo-bar.tsx` (lines 20-22): Remove `import { useActiveBackend } from '@/stores/backend'` and `import { useOcActiveSessionId } from '@/stores/opencode'`. Replace with claude-only session ID logic.

### 3.6 Fix settings page registry and navigation

Deleting `BackendSettings.tsx` and `ProvidersSettings.tsx` leaves blank runtime states unless ALL references are removed:

- `settings/pages/index.ts`:
  - Line 9: Remove `export { BackendSettings } from './BackendSettings';` (direct re-export)
  - Line 17: Remove `export { ProvidersSettings } from './ProvidersSettings';` (direct re-export)
  - Line 49: Remove `backend: lazyWithMinDelay(...)` from `SETTINGS_PAGE_COMPONENTS`
  - Line 53: Remove `providers: lazyWithMinDelay(...)` from `SETTINGS_PAGE_COMPONENTS`
- `settings/types.ts` (line 3): Remove `'backend'` and `'providers'` from `SettingsSection` union type
- `SettingsSidebar.tsx`:
  - Line 31: Remove the `'backend'` nav item (Engine icon entry)
  - Line 59-63: Remove the `'providers'` nav item (User icon entry)
- `SettingsNavList.tsx` (line 19): Remove `'backend'` and `'providers'` from the Agent nav group ids
- `SettingsPage.tsx`: No code change needed — the dynamic lookup already returns `undefined` → `null` for missing pages, but removing from registry/types ensures they're unreachable

### 3.7 Fix remaining tests that mock backend/opencode stores and hooks

- Remove `vi.mock('@/stores/backend')` from surviving test files
- Remove `vi.mock('@/stores/opencode')` references
- Remove `vi.mock('@/hooks/opencode/use-opencode-lifecycle')` from `app-settings-surface.test.tsx` (line 150) — stale mock for deleted hook
- Remove any test assertions that use deleted enum values like `'canvas'`, `'providers'`, `'backend'` for settings sections
- Key test files: `input-mode.test.tsx`, `slash-command-badge.test.tsx`, `account-settings.test.tsx`, `message-item-action-bar.test.tsx`, `app-settings-surface.test.tsx`

**Verify**: `bun run typecheck && bun run lint && bun run test`

---

## Phase 4: Frontend — Remove Canvas

### 4.1 Delete directories

- `apps/Canvas-UI-Builder/` (entire directory, 53 files)
- `apps/common/src/hooks/canvas/` (use-canvas.ts, index.ts)

### 4.2 Edit `apps/agent/src/App.tsx`

- Remove `import { CanvasApp } from '@canvas/CanvasApp';` (line 1)
- Remove `import { useOpencodeLifecycle } from '@/hooks/opencode/use-opencode-lifecycle';` (line 35)
- Remove `useOpencodeLifecycle();` call (line 379) — **must be removed in same pass as the hook file deletion, otherwise app won't compile**
- Remove canvas from `useMountedTabs` logic
- Remove `'canvas'` from `TAB_LABELS`
- Remove the `CanvasMode` component definition (lines 364-366)
- Remove the canvas mount block in render
- Remove `'canvas'` from URL param check (line 469): `tabParam === 'canvas'` — so `?tab=canvas` no longer activates a dead tab

### 4.3 Edit `apps/agent/src/stores/ui/ui-store.ts`

- Change `HeaderTab = 'agent' | 'editor' | 'canvas'` → `HeaderTab = 'agent' | 'editor'`
- This triggers compiler errors for any remaining canvas references (intentional — use as sweep)

### 4.4 Edit `apps/agent/src/main.tsx`

- Remove `import '@xyflow/react/dist/style.css';` (line 7) — ReactFlow CSS for canvas. Must be removed BEFORE the `@xyflow/react` dep is removed from package.json, otherwise Vite will error on missing CSS

### 4.5 Fix `apps/common/` — canvas types, hooks, exports, and mocks

- Delete `apps/common/src/types/canvas.ts` (357 lines of canvas Zod schemas — entirely canvas-specific)
- Delete `apps/common/src/hooks/canvas/` (use-canvas.ts, index.ts)
- `apps/common/src/hooks/index.ts` → remove canvas re-export
- `apps/common/src/types/index.ts` → remove canvas type re-export
- `apps/common/package.json`: Remove both canvas subpath exports:
  - Line 11: `"./hooks/canvas": "./src/hooks/canvas/index.ts"`
  - Line 15: `"./types/canvas": "./src/types/canvas.ts"`
- `apps/common/src/testing/tauri-mocks.ts`: Remove canvas mock helpers:
  - `canvasSetup` mock response factory (line 144)
  - `CanvasSetupResponse` type import
  - Canvas command examples in doc comments (lines 59-64)

### 4.6 Fix test mocks

- `apps/agent/src/__tests__/unit/app-settings-surface.test.tsx` → remove `vi.mock('@canvas/CanvasApp')`

### 4.7 Review `@xyflow/react` dependency

- Check if `@xyflow/react` (line 140 in root `package.json`) is used anywhere besides canvas
- If canvas-only: remove from `dependencies` in `package.json`
- Run `bun install` to update lockfile

**Verify**: `bun run typecheck && bun run lint && bun run test`

---

## Phase 5: Configuration Cleanup

### 5.1 Delete files

- `scripts/build-opencode.ts`
- `scripts/opencode-models-cache/` (directory, ~5.9MB)
- `vite.config.canvas.ts`
- `tsconfig.canvas.json`

### 5.2 Edit `package.json` — scripts

Remove entirely: `build:opencode`, `build:opencode:full`, `test:canvas`, all `canvas:*` scripts (11 scripts)

Modify:

- `dev` → remove `bun run build:opencode &&`
- `dev:debug` → remove `bun run build:opencode &&`
- `dev:quiet` → remove `bun run build:opencode &&`
- `build` → remove `bun run build:opencode:full &&`
- `build:debug` → remove `bun run build:opencode &&`
- `lint` / `lint:fix` → remove `apps/Canvas-UI-Builder/src`
- `check` → remove `bun run canvas:typecheck &&`
- `ci` → remove `bun run canvas:typecheck &&` and `&& bun run build:opencode`

### 5.3 Edit `vite.config.ts`

- Remove `'@canvas'` path alias (line 67)

### 5.4 Edit `tsconfig.json`

- Remove `"@canvas/*"` path (line 45)

### 5.5 Edit `vitest.config.ts`

- Remove Canvas-UI-Builder from test includes, coverage includes, resolve aliases

### 5.6 Edit `knip.config.ts`

- Remove Canvas-UI-Builder entry, project pattern, path alias

### 5.7 Edit `lint-staged.config.js`

- Remove Canvas-UI-Builder linting entry

### 5.8 Edit `src-tauri/tauri.conf.json`

- Remove `"binaries/orbit-server"` from `externalBin` array
- **Do NOT tighten CSP** `connect-src` wildcard `http://127.0.0.1:*` — the embedded browser system also uses it

### 5.9 Edit `scripts/verify-binaries.ts`

- Remove orbit-server from BINARY_SPECS

### 5.10 Edit `scripts/lint-all.sh`

- Remove canvas typecheck block, canvas build block
- Update workspace count in summary output

**Verify**: `cargo check && bun run typecheck && bun run lint && bun run test && bun run check`

---

## Phase 6: Delete Agent-Backend Directory

**Goal**: Remove the 2.7GB tracked directory (2,987 git files).

- `git rm -r Agent-backend/` (tracked, requires git rm)
- Delete `src-tauri/binaries/orbit-server-*` if present

**Verify**: Full build: `bun run check && cargo check`

---

## Phase 7: Documentation Cleanup

### 7.1 CLAUDE.md files to edit

**Root `CLAUDE.md`** — Major rewrite:

- `<sub_level_docs>`: Remove Canvas-UI-Builder, Agent-backend entries
- `<project_overview>`: Remove dual-backend language, canvas, opencode, orbit-cli
- `<technology_stack>`: Delete entire `<engine>` block
- `<project_structure>`: Remove Canvas-UI-Builder/ and Agent-backend/ trees
- `<commands>`: Delete Agent-backend category
- `<testing_architecture>`: Remove Agent-backend row, remove Canvas-UI-Builder from Frontend row
- `<hot_reload_behavior>`: Remove Agent-backend entry
- `<css_architecture>`: Remove canvas import note
- Delete entire `<canvas_ui_builder>` section
- Delete entire `<backend_adapter_system>` section
- Delete entire `<orbit_cli>` section
- `<dead_code_analysis>`: Remove Canvas-UI-Builder reference
- `<changelog>`: Update March 2026 to note removals

**`src-tauri/CLAUDE.md`**:

- Remove canvas commands section, opencode module from directory structure
- Remove `PreviewServerState` from managed state
- Remove `orbit-server` from sidecar binaries
- Remove canvas/opencode protocol types from bridge documentation

**`apps/agent/CLAUDE.md`**:

- Remove `canvas/` from directory structure (types section)

**`packages/shared-schemas/CLAUDE.md`**:

- Remove Canvas AI integration schema reference

**`apps/common/CLAUDE.md`**:

- Remove Canvas-UI-Builder references, canvas hooks/types from exports table

**`docs/strategy/ROADMAP.md`**:

- Remove three-product vision (CLI, Desktop, Terminal) — now single-product (Desktop IDE)
- Remove Codex engine migration phases — no longer applicable
- Update competitive positioning to reflect single-backend architecture

### 7.2 Files to delete

- `apps/Canvas-UI-Builder/CLAUDE.md` (gone with directory)
- `Agent-backend/CLAUDE.md` (gone with directory)
- `Agent-backend/learnings.md` (gone with directory)
- `docs/architecture/ENGINE-MIGRATION.md`
- `docs/development/NPM-PUBLISH-GUIDE.md` (references Agent-backend packages only)
- `docs/reference/canvas-rebuild-prompt.md`
- `docs/plans/others/canvas/` (3 plan files)

### 7.3 Plans to delete from tracked/todo (will never be implemented)

- `OPENCODE-HOOKS-SYSTEM.md`
- `OPENCODE-STRUCTURED-LOGGING.md`
- `opencode-plan-mode-e2e.md`
- `ghost-commit-file-undo.md` (all implementation paths are in Agent-backend code)
- `ORBIT-CLI-DISTRIBUTION.md` (CLI binary no longer exists)

### 7.4 Plans to archive

- Move `docs/plans/tracked/todo/terminal-app/` → `docs/plans/others/terminal-app/`

### 7.5 Update `docs/CLAUDE.md` index

- Remove all entries for deleted/moved files

### 7.6 Leave as-is

- `docs/plans/tracked/done/*` — historical record (44+ files)

---

## Phase 8: Memory Cleanup

### 8.1 Delete memory files

- `feedback_no_opencode_in_ui.md` — moot (opencode is gone)
- `project_codex_migration.md` — stale (describes replacing with Codex, but we just removed it)

### 8.2 Edit `MEMORY.md`

- Remove "No OpenCode in UI" feedback entry (line 18)
- Remove "Engine Migration" section (lines 24-25)
- Update "Orbit Terminal App" section (lines 30-32) — note that plans are archived, engine removed, product on hold

---

## Phase 9: Final Sweep

Run TWO grep sweeps — one for exact terms, one for generic canvas references:

**Sweep 1 — Exact terms** (zero tolerance):

```bash
grep -r "opencode\|OpenCode\|orbit-server\|Canvas-UI-Builder\|@canvas\|CanvasApp\|useCanvas\|CanvasSession\|canvasSetup" \
  --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" \
  --include="*.rs" --include="*.toml" --include="*.sh" --include="*.js" \
  -l --exclude-dir=node_modules --exclude-dir=target --exclude-dir=dist \
  --exclude-dir=.git --exclude-dir="plans/tracked/done" \
  --exclude-dir="plans/others" --exclude-dir="reference/preserved-oc-components"
```

**Sweep 2 — Generic canvas** (review each hit, some may be legitimate e.g. HTML canvas):

```bash
grep -ri "canvas" \
  --include="*.ts" --include="*.tsx" --include="*.rs" \
  -l --exclude-dir=node_modules --exclude-dir=target --exclude-dir=dist \
  --exclude-dir=.git --exclude-dir="reference/preserved-oc-components"
```

Any remaining files need individual review. Expected false positives: HTML `<canvas>` element refs, CSS canvas properties, this plan file itself (`remove-opencode-canvas-cleanup.md` — archive to `tracked/done/` before final sweep or exclude). Everything else must be cleaned.

**Final Verify**: `bun run check && cargo check && cargo clippy --all-targets --all-features -- -D warnings && bun run knip`

---

## Edge Cases

### localStorage stale data

Users who had `activeBackend: 'opencode'` persisted in localStorage (key: `orbit-backend-mode`) will boot into a broken state after the backend-store is deleted. **Mitigation**: Add a conditional one-time cleanup in `main.tsx` before React mounts:

```typescript
// One-time cleanup: remove stale backend selection from pre-removal era
if (localStorage.getItem('orbit-backend-mode') !== null) {
  localStorage.removeItem('orbit-backend-mode');
}
```

This is a no-op after first boot and avoids unconditional writes on every startup.

### Shared MCP types across subsystems

`McpToolRequest` and `McpToolResponse` exist in TWO places:

- **Rust** (`protocol.rs`): Keep as-is — already standalone structs, browser uses them
- **agent-bridge** (`canvas/types/types.ts`): Must be **relocated** before canvas directory deletion. Move to `protocol/protocol.ts` or `common/types/mcp.ts`. The browser tool bridge imports these via `protocol.ts` line 21.

### ReactFlow CSS import ordering

`main.tsx` imports `@xyflow/react/dist/style.css` (line 7). This import must be removed BEFORE `@xyflow/react` is uninstalled from `package.json`, otherwise Vite/build will fail on missing CSS module. Phase 4.4 (remove CSS import) must happen before Phase 5 (remove dep).

### `?tab=canvas` URL parameter

`App.tsx` line 469 accepts `?tab=canvas` as a valid URL parameter. After removal, this should be stripped so stale bookmarks/links don't set an invalid tab state.

### Settings page blank states

After deleting `BackendSettings.tsx` and `ProvidersSettings.tsx`, the settings page registry must also be cleaned (Phase 3.6). If a user has `?settings=backend` in a deep link or the settings nav isn't updated, they'd see a blank page. The `SETTINGS_PAGE_COMPONENTS` registry, `SettingsSection` type, `NAV_ITEMS`, and `NAV_GROUPS` all need the `'backend'`/`'providers'` entries removed.

### ROADMAP.md references three-product vision

`docs/strategy/ROADMAP.md` references the CLI/Desktop/Terminal three-product vision and Codex engine migration phases. This file needs updating in Phase 7 to reflect the new single-product reality.

---

## Execution Strategy

Phases 1-6 should be done in a single commit session (code removal). Phase 7-8 (docs/memory) can be a separate commit. Phase 9 is validation.

Use parallel subagents for:

- Phase 1 (Rust) + Phase 2 (Frontend leaf deletion) can partially overlap
- Phase 7 (docs) + Phase 8 (memory) are independent

**Estimated files touched**: ~190+ files modified/deleted (including 39 agent-bridge canvas files)
**Estimated LOC removed**: ~42,000+ TypeScript + ~5,000 Rust + 2.7GB Agent-backend
