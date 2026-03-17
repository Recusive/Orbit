# pages

> **Path:** `Agent-backend/packages/app/src/pages/`

## Purpose

Route-level page components for the OpenCode web app. Three routes: Home (`/`), Session (`/:slug/session/:id`), and a shared Layout wrapper. Two subdirectories (`layout/`, `session/`) extract sidebar, session panel, and composer logic into focused modules. The `session/` subdirectory is the largest and most complex — it contains the message timeline, terminal panel, file tabs, composer (permission/question/todo docks), review panel, and extensive helper logic.

## Usage Status

| Product             | Status      | Notes                                                                                                                                                                                                                                                                       |
| ------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `reference` | The session page architecture (message timeline, composer, review panel, terminal panel, file tabs) is the primary reference for Orbit's session view. The sidebar system (project list, workspace grouping, session items, drag-and-drop reordering) is directly relevant. |
| Orbit CLI           | `reference` | Same                                                                                                                                                                                                                                                                        |

## Routes

| Route                | File                   | Purpose                                                                                                                                                                      |
| -------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                  | `home.tsx`             | Project list — shows 5 most recent projects, "Open Directory" and "Connect Server" buttons, server health indicator                                                          |
| `/:slug/session/:id` | `session.tsx`          | **Main session view** — message timeline, prompt input, file tabs, terminal panel, review panel, session header. Responsive layout with media queries.                       |
| Wrapper              | `layout.tsx`           | **Shared layout** — sidebar (project list, session list, drag-and-drop), titlebar, notification/permission listeners, theme management, session tab persistence. 400+ lines. |
| Wrapper              | `directory-layout.tsx` | Per-directory provider wrapper — wraps children with SDKProvider, SyncProvider, LocalProvider, DataProvider                                                                  |
| Error                | `error.tsx`            | Error boundary page — formats `InitError` chains (MCP, provider, config errors), shows stack traces, offers "Restart" and "Check for Updates" buttons                        |

## File Inventory

### Root Files (5)

| File                   | Purpose                                                                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `home.tsx`             | Home page — recent projects list with timestamps (Luxon), open/choose directory, server connection indicator                                                                                                                                                  |
| `session.tsx`          | Session page — composes SessionHeader, MessageTimeline, PromptInput, TerminalPanel, SessionSidePanel, SessionReviewTab. Manages session history windowing (lazy load older messages), resize handles, mobile tab switching.                                   |
| `layout.tsx`           | Main layout — sidebar with project drag-and-drop (`@thisbeyond/solid-dnd`), session tab management, sound playback on agent events, notification click routing, deep link handling, session handoff, worktree state sync                                      |
| `directory-layout.tsx` | Directory scope — wraps children with per-directory providers (SDK, Sync, Local, Data)                                                                                                                                                                        |
| `error.tsx`            | Error page — handles `InitError` types: MCPFailed, ProviderAuthError, APIError, ProviderModelNotFoundError, ConfigJsonError, ConfigDirectoryTypoError, ConfigFrontmatterError, ConfigInvalidError, UnknownError. Error chain formatting with cause traversal. |

### Subdirectory: `layout/` (11 files)

Sidebar components and helpers for the main layout.

| File                           | Purpose                                                                                                                                                                 | Tests                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `sidebar-project.tsx`          | Project sidebar section — sortable project cards with drag-and-drop, hover cards showing session lists, context menus (archive, rename, workspaces), workspace grouping |                                   |
| `sidebar-workspace.tsx`        | Workspace sidebar — workspace-level grouping of sessions with expand/collapse                                                                                           | `sidebar-workspace.test.ts`       |
| `sidebar-shell.tsx`            | Shell sidebar section — terminal-initiated sessions grouped separately                                                                                                  | `sidebar-shell.test.ts`           |
| `sidebar-items.tsx`            | Session list item components — `SessionItem` (title, time, status indicator), `ProjectIcon` (avatar with color system)                                                  |                                   |
| `sidebar-project-helpers.ts`   | Project sidebar pure logic — `projectSelected()`, `projectTileActive()` selection state                                                                                 | `sidebar-project-helpers.test.ts` |
| `sidebar-workspace-helpers.ts` | Workspace sidebar helpers — workspace-level logic                                                                                                                       |                                   |
| `sidebar-shell-helpers.ts`     | Shell sidebar helpers — shell session grouping logic                                                                                                                    |                                   |
| `helpers.ts`                   | Shared sidebar helpers — `childMapByParent()` (builds parent→children session map), `displayName()` (session display name), `sortedRootSessions()`                      | `helpers.test.ts`                 |
| `deep-links.ts`                | Deep link handler — routes `opencode://` protocol URLs to the correct session/project                                                                                   |                                   |
| `inline-editor.tsx`            | Inline text editing component — used for renaming sessions/projects in the sidebar                                                                                      |                                   |

### Subdirectory: `session/` (24 files)

Session page extracted logic — the largest subdirectory.

| File                         | Purpose                                                                                                                                                                                                 | Tests                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `message-timeline.tsx`       | **Core chat view** — virtual message list with ScrollView, session turns, message actions (fork, copy, revert, comment), file diff display, context usage indicator. Binary search for message lookups. |                                   |
| `terminal-panel.tsx`         | Terminal panel — Ghostty instances in tabs, split/close actions, resize handle, buffer persistence                                                                                                      | `terminal-panel.test.ts`          |
| `file-tabs.tsx`              | File tab bar — sortable tabs showing open files, close actions, scroll navigation                                                                                                                       |                                   |
| `file-tab-scroll.ts`         | File tab scroll helpers — horizontal scroll with mouse wheel, overflow detection                                                                                                                        | `file-tab-scroll.test.ts`         |
| `review-tab.tsx`             | Code review panel — file diffs with unified/split view toggle, expand/collapse, comment annotations                                                                                                     |                                   |
| `session-side-panel.tsx`     | Side panel — file tree + review tab in a resizable panel alongside the main chat                                                                                                                        |                                   |
| `session-mobile-tabs.tsx`    | Mobile tab switcher — chat/files/review tabs for narrow viewports                                                                                                                                       |                                   |
| `helpers.ts`                 | Session helpers — `createOpenReviewFile()`, `createSizing()` for responsive layout calculations                                                                                                         | `helpers.test.ts`                 |
| `handoff.ts`                 | Session handoff state — passes session context between route navigations                                                                                                                                |                                   |
| `terminal-label.ts`          | Terminal tab label generation — "Terminal 1", "Terminal 2", etc.                                                                                                                                        |                                   |
| `message-id-from-hash.ts`    | URL hash → message ID extraction — `#message-<id>` deep linking                                                                                                                                         |                                   |
| `message-gesture.ts`         | Touch/wheel gesture detection for message boundary scrolling — `normalizeWheelDelta()`, `shouldMarkBoundaryGesture()`                                                                                   | `message-gesture.test.ts`         |
| `session-command-helpers.ts` | Session-level command palette actions                                                                                                                                                                   |                                   |
| `session-model-helpers.ts`   | Model sync helpers — `syncSessionModel()`, `resetSessionModel()` keep session model in sync with global selection                                                                                       | `session-model-helpers.test.ts`   |
| `session-prompt-helpers.ts`  | Prompt state helpers for the session page                                                                                                                                                               |                                   |
| `use-session-commands.tsx`   | Session-specific command registrations (archive, rename, copy, share, fork, etc.)                                                                                                                       | `use-session-commands.test.ts`    |
| `use-session-hash-scroll.ts` | Hash-based scroll — scrolls to a specific message when URL contains `#message-<id>`                                                                                                                     | `use-session-hash-scroll.test.ts` |

### Subdirectory: `session/composer/` (7 files)

Composer region — the bottom dock area handling permissions, questions, and todos.

| File                          | Purpose                                                                                                                                                                                             | Tests                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `session-composer-state.ts`   | Composer state machine — tracks pending permissions, questions, todos. `createSessionComposerBlocked()` determines if agent is blocked waiting for user input. Auto-close timer for resolved items. | `session-composer-state.test.ts` |
| `session-composer-region.tsx` | Composer container — renders the appropriate dock (permission, question, or todo) based on state                                                                                                    |                                  |
| `session-permission-dock.tsx` | Permission request dock — shows tool permission with "Allow Once", "Always Allow", "Reject" buttons                                                                                                 |                                  |
| `session-question-dock.tsx`   | Question dock — shows agent question with text input for user response                                                                                                                              |                                  |
| `session-todo-dock.tsx`       | Todo dock — shows agent-generated todo items with checkboxes                                                                                                                                        |                                  |
| `session-request-tree.ts`     | Request tree helpers — `sessionPermissionRequest()`, `sessionQuestionRequest()` extract the next pending request for a session                                                                      |                                  |
| `index.ts`                    | Barrel export — `SessionComposerRegion`, `createSessionComposerState`, `createSessionComposerBlocked`                                                                                               |                                  |

## Test Coverage

| Test File                                         | Covers                                    |
| ------------------------------------------------- | ----------------------------------------- |
| `layout/helpers.test.ts`                          | Session sorting, child map, display names |
| `layout/sidebar-project-helpers.test.ts`          | Project selection state                   |
| `layout/sidebar-shell.test.ts`                    | Shell session grouping                    |
| `layout/sidebar-workspace.test.ts`                | Workspace session grouping                |
| `session/helpers.test.ts`                         | Sizing calculations, review file opening  |
| `session/file-tab-scroll.test.ts`                 | Horizontal scroll and overflow            |
| `session/message-gesture.test.ts`                 | Wheel delta normalization                 |
| `session/session-model-helpers.test.ts`           | Model sync/reset                          |
| `session/session-prompt-dock.test.ts`             | Prompt dock state                         |
| `session/terminal-panel.test.ts`                  | Terminal panel lifecycle                  |
| `session/use-session-commands.test.ts`            | Session command registrations             |
| `session/use-session-hash-scroll.test.ts`         | Hash scroll behavior                      |
| `session/composer/session-composer-state.test.ts` | Composer state machine, auto-close        |

## Dependencies

- **Internal contexts:** `@/context/sdk`, `sync`, `global-sync`, `global-sdk`, `layout`, `settings`, `platform`, `language`, `local`, `file`, `comments`, `prompt`, `permission`, `notification`, `terminal`, `command`
- **Internal components:** `@/components/session`, `@/components/prompt-input`, `@/components/dialog-*`, `@/components/status-popover`
- **UI library:** `@orbit.build/ui` — ResizeHandle, ScrollView, SessionTurn, InlineInput, Dialog, ContextMenu, HoverCard, DropdownMenu, Button, Icon, Spinner, FileIcon, Markdown, Logo, Toast, Select, DragDrop
- **SDK:** `@orbit.build/sdk/v2` for Session, Message, Part, UserMessage, AssistantMessage, PermissionRequest, QuestionRequest, Todo, FileDiff types
- **External:** `@thisbeyond/solid-dnd` (drag-and-drop), `@solid-primitives/media` (media queries), `@solid-primitives/resize-observer`, `luxon` (dates)

## Development Guide

For Orbit, study these patterns:

1. **Session page composition** — `session.tsx` shows how to compose message timeline + prompt input + terminal panel + file tabs + review panel in a responsive layout with resize handles. This is the blueprint for Orbit's session view.

2. **Composer state machine** — `session/composer/session-composer-state.ts` shows how to manage the blocked/unblocked state when the agent requests permissions, asks questions, or creates todos. The auto-close timer pattern is reusable.

3. **Sidebar architecture** — `layout/sidebar-project.tsx` demonstrates sortable project cards with drag-and-drop, hover cards, context menus, and workspace grouping. Complex multi-concern UI.

4. **Message timeline** — `session/message-timeline.tsx` is the chat message renderer with virtual scrolling, message actions (fork, copy, revert, comment), and file diff display.

5. **Error page** — `error.tsx` shows comprehensive `InitError` formatting with cause chain traversal — handles 9+ error types (MCP failures, provider auth, config issues). Reusable pattern for Orbit's error UI.

## Notes

- **`layout.tsx` is the largest page** — 400+ lines managing sidebar, tabs, sounds, notifications, deep links, handoff, and theme. Consider decomposition for Orbit.
- **13 test files** across the pages directory — good coverage of pure logic helpers.
- **Responsive design** — `session.tsx` uses `createMediaQuery("(max-width: 600px)")` for mobile layout with tab switching instead of side-by-side panels.
- **Drag-and-drop** — uses `@thisbeyond/solid-dnd` for both project ordering (sidebar) and session tab reordering (titlebar). Orbit would use `@dnd-kit` (React equivalent).
- **`directory-layout.tsx`** is a thin provider wrapper — it scopes SDK, Sync, Local, and Data providers to a specific workspace directory. This pattern maps to Orbit's per-workspace store isolation.
- **Deep links** — `layout/deep-links.ts` handles `opencode://` protocol URLs, routing to the correct project/session. Orbit would need a similar Tauri deep link handler.
