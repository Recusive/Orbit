# context

> **Path:** `Agent-backend/packages/app/src/context/`

## Purpose

SolidJS context providers — the reactive state layer for the entire OpenCode web app. Each major domain (SDK, sync, files, terminal, settings, permissions, commands, layout, etc.) has a dedicated context provider that manages its state, side effects, and API calls. These providers are composed in a strict order in `app.tsx` (15+ nested providers). Two subdirectories (`file/`, `global-sync/`) extract complex logic into focused modules.

## Usage Status

| Product             | Status      | Notes                                                                                                                                                                                                                                                |
| ------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `reference` | The provider architecture is the primary reference for Orbit's Zustand store design. Each context maps roughly to a Zustand store slice. The SDK/sync/global-sync data flow pattern (SSE events → store updates → reactive UI) is directly relevant. |
| Orbit CLI           | `reference` | Same                                                                                                                                                                                                                                                 |

## When to Reference This

| If you're building...                                      | Read these files                                                                        | What you'll learn                                                                                                                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **SDK client setup** for connecting to the OpenCode server | `global-sdk.tsx`, `sdk.tsx`                                                             | How to create per-workspace SDK clients, set up SSE event bus, dispatch events to directory-specific listeners                                                     |
| **Real-time state sync** from server events                | `global-sync.tsx`, `global-sync/event-reducer.ts`                                       | SSE event → store mutation for 13 event types (session, message, part, permission, todo, MCP, LSP, VCS, config, project updates) with binary search sorted inserts |
| **App bootstrap / initial data loading**                   | `global-sync/bootstrap.ts`, `global-sync/session-load.ts`                               | How to fetch initial state (projects, providers, config, sessions, agents, commands, MCP, LSP, VCS) and paginated session lists                                    |
| **Per-session message state** with optimistic updates      | `sync.tsx`                                                                              | Messages, parts, status, permissions, diffs, todos, questions — with optimistic add/remove and rollback                                                            |
| **Server connection management** and mDNS discovery        | `server.tsx`                                                                            | Active server URL tracking, connection type, mDNS discovery list, URL normalization                                                                                |
| **Settings schema and persistence**                        | `settings.tsx`                                                                          | Full `Settings` interface (general, updates, appearance, keybinds, permissions, notifications, sounds) with localStorage persistence                               |
| **Permission system UI** (accept once/always/reject)       | `permission.tsx`, `permission-auto-respond.ts`                                          | Pending permission tracking per session, auto-accept logic with localStorage keys                                                                                  |
| **Panel layout state** (sidebar, terminal, tabs)           | `layout.tsx`, `layout-scroll.ts`                                                        | Default panel widths (sidebar=344, session=600, terminal=280), tab management, scroll position persistence                                                         |
| **Command palette + keybindings**                          | `command.tsx`                                                                           | Keybind string parsing (`mod+shift+p`), Mac vs non-Mac modifier mapping, signature-based lookup                                                                    |
| **Model picker + thinking level cycling**                  | `models.tsx`, `model-variant.ts`                                                        | Active model per directory, hidden models, variant rotation logic                                                                                                  |
| **File tree + content caching**                            | `file.tsx`, `file/tree-store.ts`, `file/content-cache.ts`                               | File tree expand/collapse, LRU content cache with byte accounting, file watcher invalidation                                                                       |
| **Platform abstraction** (web vs desktop)                  | `platform.tsx`                                                                          | `Platform` type with `notify`, `openLink`, `back`, `forward`, `restart`, `getDefaultServerUrl` — the boundary Orbit's Tauri bridge replaces                        |
| **Session cache eviction** at scale                        | `global-sync/session-cache.ts`, `global-sync/child-store.ts`, `global-sync/eviction.ts` | LRU eviction for 50+ sessions, directory store eviction for 30+ workspaces with idle TTL                                                                           |
| **Notification triggers** (agent complete, errors)         | `notification.tsx`, `notification-index.ts`                                             | When and how to fire browser notifications via platform abstraction                                                                                                |
| **Code review comments**                                   | `comments.tsx`                                                                          | Comment thread state on file selections                                                                                                                            |

## Key Data Patterns (portable to React/Zustand)

### Two-tier state architecture

```
GlobalSync (all projects, all sessions, all config)    →  Orbit: global app store
    └── Sync (per-session messages, parts, status)     →  Orbit: ChatStore
```

Read `global-sync.tsx` + `sync.tsx` to understand this split.

### SSE event reduction pattern

`global-sync/event-reducer.ts` is the single most relevant file for Orbit's `chat-message-service.ts`. It handles 13 event types with binary search sorted inserts — the same pattern Orbit uses for Tauri events. The reducer is mostly framework-agnostic logic.

### Optimistic updates

`sync.tsx` shows: user sends message → `applyOptimisticAdd()` inserts immediately → server confirms or `applyOptimisticRemove()` rolls back. Uses `Binary.search()` for sorted position.

### Settings interface (directly reusable)

`settings.tsx` defines the full `Settings` shape — theme, font, update channel, keybinds, permission rules, notification preferences, sound toggles. The interface structure maps to Orbit's settings store.

### Constants worth knowing

| Constant                        | Value  | File                           |
| ------------------------------- | ------ | ------------------------------ |
| `DEFAULT_PANEL_WIDTH` (sidebar) | 344px  | `layout.tsx`                   |
| `DEFAULT_SESSION_WIDTH`         | 600px  | `layout.tsx`                   |
| `DEFAULT_TERMINAL_HEIGHT`       | 280px  | `layout.tsx`                   |
| `MAX_DIR_STORES`                | 30     | `global-sync/types.ts`         |
| `DIR_IDLE_TTL_MS`               | 20 min | `global-sync/types.ts`         |
| `SESSION_RECENT_LIMIT`          | 50     | `global-sync/types.ts`         |
| `SESSION_CACHE_LIMIT`           | 50     | `global-sync/session-cache.ts` |

## Architecture

```
GlobalSDK ─→ GlobalSync ─→ SDK ─→ Sync
   │              │          │       │
   │              │          │       └─ Per-session messages, parts, optimistic updates
   │              │          └─ Per-directory SDK client + event emitter
   │              └─ Global state: projects, sessions, config, providers, MCP, LSP
   └─ Root SDK client factory, SSE event bus, multi-directory support

Settings, Layout, Terminal, Command, Permission, File, Prompt, etc.
   └─ Independent providers consuming GlobalSync/SDK for their domain
```

### Provider Nesting Order (from `app.tsx`)

```
Platform → Language → I18n → Theme → Font → Meta → Dialog → File →
Server → SDK → Settings → GlobalSDK → GlobalSync → Layout → Models →
Permission → Notification → Command → Comments → Highlights → Prompt →
Terminal → Router
```

**Order matters** — each provider may depend on providers above it in the chain.

## File Inventory

### Core Data Flow (8 files)

| File              | Purpose                                                                                                                                                                                                                                                                                             | Tests                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `global-sdk.tsx`  | Root SDK client factory. Creates `OpencodeClient` instances per directory. Manages the SSE event bus that dispatches events to directory-specific listeners. All other SDK/sync providers depend on this.                                                                                           |                           |
| `global-sync.tsx` | Global state store — projects, sessions, config, providers, MCP status, LSP status, VCS info. Bootstraps on mount (fetches initial state), then applies incremental SSE events. Manages per-directory child stores with eviction (max 30 dirs, 20min idle TTL). Uses `GlobalStore` type.            | `global-sync.test.ts`     |
| `sdk.tsx`         | Per-directory SDK client wrapper. Provides `client` (for API calls) and `event` (emitter for SSE events filtered to this directory). Uses `createSimpleContext` pattern.                                                                                                                            |                           |
| `sync.tsx`        | Per-session reactive state. Provides `messages`, `parts`, `status`, `permissions`, `diffs`, `todos`, and `questions` for the active session. Includes optimistic update support (`applyOptimisticAdd/Remove`). Uses binary search for sorted inserts. Session cache eviction (default 50 sessions). | `sync-optimistic.test.ts` |
| `server.tsx`      | Server connection management. Tracks active server URL, connection type (`http`), mDNS discovery list. `ServerConnection` namespace with `Key`, `Any`, and URL normalization.                                                                                                                       |                           |
| `platform.tsx`    | Platform abstraction — defines `Platform` type with `notify`, `openLink`, `back`, `forward`, `restart`, `getDefaultServerUrl`. Web implementation uses native `Notification`, `window.open`, `history.back/forward`. Desktop overrides via Tauri.                                                   |                           |
| `local.tsx`       | Local-only session state (not synced to server) — sidebar collapse state, pending review items.                                                                                                                                                                                                     |                           |
| `prompt.tsx`      | Prompt input state — content parts (text, image, agent, file attachments), `@`-mention tracking, prompt equality comparison, default prompt template.                                                                                                                                               |                           |

### UI State Providers (8 files)

| File               | Purpose                                                                                                                                                                                                                                                          | Tests                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `settings.tsx`     | Settings persistence via `settings.v3` localStorage key. Defines `Settings` interface (general, updates, appearance, keybinds, permissions, notifications, sounds). Default values for all fields. Uses `persisted()` utility.                                   |                                              |
| `layout.tsx`       | Panel layout state — sidebar width (`DEFAULT_PANEL_WIDTH = 344`), session width (`600`), terminal height (`280`), session tabs (active + all), session view state (scroll position, review panel, pending message). Avatar color system (6 colors).              | `layout.test.ts`                             |
| `layout-scroll.ts` | Scroll position persistence — saves/restores scroll position per session using `requestAnimationFrame` for smooth restoration.                                                                                                                                   | `layout-scroll.test.ts`                      |
| `command.tsx`      | Command palette + keybinding system. Parses keybind strings (`mod+shift+p`), builds signature-based lookup map, handles Mac vs non-Mac modifier mapping (`mod` → `metaKey` on Mac, `ctrlKey` elsewhere). Editable keybinds for terminal and file-attach actions. | `command.test.ts`, `command-keybind.test.ts` |
| `models.tsx`       | Model selection and visibility. Tracks active model per directory, hidden models list, model variants (thinking levels).                                                                                                                                         |                                              |
| `model-variant.ts` | Model variant cycling logic — rotates through provider-specific variants (e.g., Claude thinking levels).                                                                                                                                                         | `model-variant.test.ts`                      |
| `language.tsx`     | i18n context — locale selection, dictionary loading via `@solid-primitives/i18n`.                                                                                                                                                                                |                                              |
| `highlights.tsx`   | Syntax highlighting via Shiki — lazy-loads highlighter, caches themes, provides `highlight()` function for code blocks.                                                                                                                                          |                                              |

### Permission & Notification (4 files)

| File                         | Purpose                                                                                                                                                              | Tests                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `permission.tsx`             | Permission request handling — tracks pending permissions per session, provides `respond()` function (once/always/reject). Checks config for permission prompt rules. |                                   |
| `permission-auto-respond.ts` | Auto-accept logic — localStorage-based accept keys per directory, `autoRespondsPermission()` checks if a permission should be auto-approved.                         | `permission-auto-respond.test.ts` |
| `notification.tsx`           | Browser notification triggers — fires on agent completion, permission requests, errors. Uses `Notification` API via platform abstraction.                            | `notification.test.ts`            |
| `notification-index.ts`      | Notification event index/tracking.                                                                                                                                   |                                   |

### Comments (1 file)

| File           | Purpose                                                                                 | Tests              |
| -------------- | --------------------------------------------------------------------------------------- | ------------------ |
| `comments.tsx` | Code review comment state — tracks inline comments on file selections, comment threads. | `comments.test.ts` |

### Subdirectory: `file/` (6 files)

File system state management — tree, content caching, view state, file watching.

| File               | Purpose                                                                                                                                                                                       | Tests                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `tree-store.ts`    | File tree state — expand/collapse nodes, builds tree from flat file list.                                                                                                                     |                                                                         |
| `content-cache.ts` | LRU content cache with byte-level accounting — tracks total bytes loaded, evicts least-recently-used entries when approaching memory limits. Uses `approxBytes()` for string byte estimation. | (tested via `file-content-eviction-accounting.test.ts` at parent level) |
| `view-cache.ts`    | Per-file view state cache — scroll position, cursor position, tab association.                                                                                                                |                                                                         |
| `watcher.ts`       | File change watcher — invalidates content cache entries when files change on disk (via SSE events).                                                                                           | `watcher.test.ts`                                                       |
| `path.ts`          | Path helper utilities — `relative()`, `isChild()`, `dirname()`, `basename()` for file tree navigation.                                                                                        | `path.test.ts`                                                          |
| `types.ts`         | Shared types — `FileState`, `FileSelection`, `SelectedLineRange`, `FileViewState`, `selectionFromLines()`.                                                                                    |                                                                         |

### Subdirectory: `global-sync/` (10 files)

Complex logic extracted from `global-sync.tsx` — per-directory child store management, SSE event reduction, session loading, eviction, and caching.

| File               | Purpose                                                                                                                                                                                                                                                                                                               | Tests                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `types.ts`         | Core types — `State` (per-directory store shape with agents, commands, sessions, messages, parts, permissions, MCP, LSP, VCS), `ProjectMeta`, `EvictPlan`, `ChildOptions`. Constants: `MAX_DIR_STORES=30`, `DIR_IDLE_TTL_MS=20min`, `SESSION_RECENT_LIMIT=50`.                                                        |                         |
| `child-store.ts`   | Per-directory store lifecycle — creates/pins/unpins/evicts SolidJS stores per workspace directory. Manages VCS, meta, and icon caches per directory. Eviction runs when new stores exceed `MAX_DIR_STORES`.                                                                                                           | `child-store.test.ts`   |
| `event-reducer.ts` | SSE event → store mutation. Handles `session.updated`, `session.deleted`, `message.updated`, `part.updated`, `permission.updated`, `todo.updated`, `mcp.updated`, `lsp.updated`, `vcs.updated`, `config.updated`, `project.updated`, `global.disposed`, `server.connected`. Binary search for sorted inserts/updates. | `event-reducer.test.ts` |
| `bootstrap.ts`     | Initial data fetch — `bootstrapGlobal()` fetches projects + providers + config. `bootstrapDirectory()` fetches sessions + agents + commands + MCP + LSP + VCS for a workspace.                                                                                                                                        |                         |
| `session-load.ts`  | Root session loading with fallback — estimates total session count, loads paginated session list, handles API failures gracefully.                                                                                                                                                                                    |                         |
| `session-trim.ts`  | Session list trimming — keeps recent sessions (within 4h window) + limits total to `SESSION_RECENT_LIMIT`.                                                                                                                                                                                                            | `session-trim.test.ts`  |
| `session-cache.ts` | Session cache LRU — evicts message/part data for sessions beyond `SESSION_CACHE_LIMIT` (default 50).                                                                                                                                                                                                                  | `session-cache.test.ts` |
| `eviction.ts`      | Directory store eviction — `pickDirectoriesToEvict()` selects idle stores beyond max count, `canDisposeDirectory()` checks if safe to evict.                                                                                                                                                                          |                         |
| `queue.ts`         | Refresh queue — debounced fetch queue for re-bootstrapping directories after reconnection events.                                                                                                                                                                                                                     |                         |
| `utils.ts`         | Utility — `sanitizeProject()` cleans project data from API responses.                                                                                                                                                                                                                                                 |                         |

## Test Coverage

| Test File                                     | Covers                                                   |
| --------------------------------------------- | -------------------------------------------------------- |
| `command.test.ts` + `command-keybind.test.ts` | Keybinding parsing, signature generation, Mac vs non-Mac |
| `comments.test.ts`                            | Comment thread state                                     |
| `file-content-eviction-accounting.test.ts`    | Content cache byte accounting and eviction               |
| `file/path.test.ts`                           | Path utilities                                           |
| `file/watcher.test.ts`                        | File change invalidation                                 |
| `global-sync.test.ts`                         | Global sync bootstrap and event handling                 |
| `global-sync/child-store.test.ts`             | Directory store lifecycle and eviction                   |
| `global-sync/event-reducer.test.ts`           | SSE event → state mutation                               |
| `global-sync/session-cache.test.ts`           | Session cache LRU eviction                               |
| `global-sync/session-trim.test.ts`            | Session list trimming                                    |
| `layout.test.ts`                              | Panel dimensions and tab state                           |
| `layout-scroll.test.ts`                       | Scroll position persistence                              |
| `model-variant.test.ts`                       | Model variant cycling                                    |
| `notification.test.ts`                        | Notification triggers                                    |
| `permission-auto-respond.test.ts`             | Auto-accept logic                                        |
| `sync-optimistic.test.ts`                     | Optimistic add/remove                                    |

## Dependencies

- **SDK:** `@opencode-ai/sdk/v2/client` for all data types (`Session`, `Message`, `Part`, `Config`, `Project`, `PermissionRequest`, `Todo`, `FileDiff`, `McpStatus`, `LspStatus`, etc.)
- **UI library:** `@opencode-ai/ui/context` (`createSimpleContext`), `@opencode-ai/ui/toast` (`showToast`)
- **Utilities:** `@opencode-ai/util/binary` (sorted array operations), `@opencode-ai/util/retry`, `@opencode-ai/util/path`, `@opencode-ai/util/encode`
- **Internal:** `@/utils/persist` (localStorage wrapper), `@/utils/base64`, `@/utils/same` (deep equality), `@/utils/server-health`, `@/utils/server-errors`
- **SolidJS:** `solid-js`, `solid-js/store` (`createStore`, `produce`, `reconcile`), `@solidjs/router`, `@solid-primitives/i18n`, `@solid-primitives/storage`, `@solid-primitives/event-bus`

## Recommendation

**KEEP** — This is the most valuable reference layer in `packages/app/`. It shows exactly how the upstream app wires up SDK data fetching, SSE event processing, session state, and optimistic updates. Orbit's Zustand stores are direct analogs. The 3 pure-logic files in `global-sync/` (event-reducer, session-cache, session-trim) are near-portable to React. 19 test files make this the most thoroughly tested frontend layer — patterns worth studying before writing Orbit equivalents.

## Orbit Mapping

| OpenCode context                   | Orbit equivalent                            | Status                    |
| ---------------------------------- | ------------------------------------------- | ------------------------- |
| `global-sync.tsx` + `global-sync/` | Global app store (TBD)                      | Reference for future work |
| `sync.tsx`                         | `chat-store.ts` + `chat-message-service.ts` | Already implemented       |
| `settings.tsx`                     | `settings-store.ts`                         | Already implemented       |
| `layout.tsx`                       | `ui-store.ts`                               | Already implemented       |
| `permission.tsx`                   | Permission handling in agent-bridge         | Already implemented       |
| `file.tsx` + `file/`               | `file-store.ts`                             | Already implemented       |
| `platform.tsx`                     | Tauri bridge (`src-tauri/`)                 | Already implemented       |
| `command.tsx`                      | Command palette (TBD)                       | Not yet built             |
| `models.tsx`                       | Model picker in agent-bridge                | Partially implemented     |

## Notes

- **`createSimpleContext` pattern** — most providers use `@opencode-ai/ui/context`'s `createSimpleContext`, which auto-generates `useX()` hook and `XProvider` component from an `init()` function. Orbit's Zustand stores serve the same purpose without the SolidJS context boilerplate.
- **Binary search everywhere** — sorted arrays + `Binary.search()` from `@opencode-ai/util/binary` is the canonical pattern for sessions, messages, and parts. All stores maintain sorted order by ID.
- **Multi-directory support** — `GlobalSync` manages state for multiple workspace directories simultaneously (up to 30), with idle eviction after 20 minutes. This is more complex than Orbit currently needs but shows how to scale.
- **19 test files** across context + subdirectories — the most thoroughly tested layer of the frontend.
- **`reconcile()` for state updates** — SolidJS's `reconcile()` (like React's reconciliation) is used to efficiently update store arrays from server responses. Orbit uses Immer's `produce()` instead.
