# layout

> **Path:** `Agent-backend/packages/app/src/pages/layout/`

## Purpose

Sidebar components and layout helpers for the OpenCode web app's main shell. Contains the full sidebar system (project list, workspace grouping, session items, shell sessions), deep link handling, inline text editing, and shared helper utilities.

## Usage Status

| Product             | Status      | Notes                                                                                                                |
| ------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `reference` | Sidebar architecture, session sorting, drag-and-drop patterns, and deep link routing directly inform Orbit's sidebar |
| Orbit CLI           | `not used`  | CLI TUI has its own sidebar in `packages/opencode/src/cli/cmd/tui/`                                                  |

## Recommendation

**KEEP AS REFERENCE** — Shows how to build a complete sidebar with project→workspace→session hierarchy, drag-and-drop reordering, and deep link routing. `helpers.ts` contains portable pure logic. The sidebar is one of the most complex UI pieces in any code editor — worth studying before building Orbit's.

## When to Reference This

| If you're building...                                 | Read this file                             | What you'll learn                                                                                                               |
| ----------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **Session list in sidebar** with sorting and grouping | `sidebar-workspace.tsx` + `helpers.ts`     | Session sorting (recent-first with 1min recency window), root session filtering, parent→child map for nested sessions           |
| **Project list** with drag-and-drop cards             | `sidebar-project.tsx`                      | Sortable project cards, hover cards showing session previews, context menus (archive, rename, workspaces toggle)                |
| **Session list items** (title, time, status)          | `sidebar-items.tsx`                        | `SessionItem` component with title truncation, relative timestamps, status indicators, `ProjectIcon` with 6-color avatar system |
| **Workspace ordering** and multi-workspace sidebar    | `helpers.ts` → `effectiveWorkspaceOrder()` | How to merge persisted ordering with live workspaces, dedup by workspace key                                                    |
| **Shell/terminal sessions** grouped separately        | `sidebar-shell.tsx`                        | Terminal-initiated sessions as a separate sidebar section                                                                       |
| **Deep link handling** (`opencode://` URLs)           | `deep-links.ts`                            | Protocol URL parsing and routing to correct project/session                                                                     |
| **Inline rename** in sidebar                          | `inline-editor.tsx`                        | Inline text editing component with focus management, escape/enter handling                                                      |

## Files

| File                           | Size  | Purpose                                                                                                                                                            | Portable?            | Tests                             |
| ------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | --------------------------------- |
| `sidebar-workspace.tsx`        | 21KB  | Workspace sidebar — session list grouped by workspace, expand/collapse, drag-and-drop reorder                                                                      | SolidJS-specific     | `sidebar-workspace.test.ts`       |
| `sidebar-project.tsx`          | 15KB  | Project sidebar — sortable cards, hover cards, context menus                                                                                                       | SolidJS-specific     | —                                 |
| `sidebar-items.tsx`            | 15KB  | Session list items — title, time, status indicator, `ProjectIcon` avatar                                                                                           | SolidJS-specific     | —                                 |
| `sidebar-shell.tsx`            | 4.5KB | Shell sessions sidebar section                                                                                                                                     | SolidJS-specific     | `sidebar-shell.test.ts`           |
| `helpers.ts`                   | 3.7KB | **Pure logic.** `sortSessions()`, `childMapByParent()`, `sortedRootSessions()`, `effectiveWorkspaceOrder()`, `displayName()`, `errorMessage()`, `getDraggableId()` | **Yes — no SolidJS** | `helpers.test.ts`                 |
| `deep-links.ts`                | 1.5KB | `opencode://` protocol URL routing                                                                                                                                 | Mostly portable      | —                                 |
| `inline-editor.tsx`            | 3.4KB | Inline text editing for rename actions                                                                                                                             | SolidJS-specific     | —                                 |
| `sidebar-project-helpers.ts`   | 0.4KB | `projectSelected()`, `projectTileActive()` selection state                                                                                                         | **Yes — pure logic** | `sidebar-project-helpers.test.ts` |
| `sidebar-workspace-helpers.ts` | 0.1KB | Workspace-level helper                                                                                                                                             | **Yes — pure logic** | —                                 |
| `sidebar-shell-helpers.ts`     | 0.1KB | Shell session helper                                                                                                                                               | **Yes — pure logic** | —                                 |

## Key Data Patterns (portable to React)

### Session sorting

`helpers.ts` → `sortSessions(now)`: sorts sessions recent-first. Sessions updated within the last 60 seconds are treated as "recent" and sorted by ID (stable order). Older sessions sort by `time.updated` descending. This is the same sort Orbit's sidebar needs.

### Parent→child session map

`helpers.ts` → `childMapByParent(sessions)`: builds a `Map<parentId, childId[]>` for nested/forked sessions. Used to render session trees in the sidebar.

### Workspace ordering

`helpers.ts` → `effectiveWorkspaceOrder(local, dirs, persisted?)`: merges live workspace directories with persisted user ordering, deduplicates by workspace key, and always puts the local directory first. Handles Windows drive letters and trailing slash normalization.

## Notes

- **`sidebar-workspace.tsx` is 21KB** — the largest file, managing session list rendering with expand/collapse, drag-and-drop, context menus, and workspace-level actions. Consider decomposing when building Orbit's equivalent.
- **4 helper files are pure logic** — `helpers.ts`, `sidebar-project-helpers.ts`, `sidebar-workspace-helpers.ts`, `sidebar-shell-helpers.ts` have zero SolidJS imports. Directly usable in React.
- **Drag-and-drop** uses `@thisbeyond/solid-dnd` — Orbit would use `@dnd-kit` (React equivalent) but the drag data shapes and reorder logic are the same.
