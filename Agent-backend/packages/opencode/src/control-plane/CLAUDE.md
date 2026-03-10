# control-plane

> **Path:** `Agent-backend/packages/opencode/src/control-plane/`

## Purpose

Multi-workspace orchestration layer. Manages workspace lifecycle (create, remove, connect, ready), routes requests to the correct workspace instance, provides SSE event streaming, and supports pluggable workspace adaptors (currently git worktree).

## Usage Status

| Product             | Status   | Notes                                                                              |
| ------------------- | -------- | ---------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Enables the desktop app to manage multiple project workspaces from a single server |
| Orbit CLI           | `active` | `orbit workspace-serve` and workspace switching in the TUI use this system         |

## Key Files

- `workspace.ts` — `Workspace` namespace with CRUD operations (create, remove, fromRow), bus events (Ready, Failed), database persistence via `WorkspaceTable`, adaptor delegation for workspace setup, and `connect()` for SSE streaming to a workspace
- `workspace.sql.ts` — Drizzle schema for the workspace table (id, type, branch, name, directory, extra, project_id)
- `types.ts` — `WorkspaceInfo` Zod schema and `Adaptor` interface (configure, create, remove, fetch)
- `sse.ts` — `parseSSE()` function for consuming Server-Sent Event streams with reconnection support
- `workspace-context.ts` — `WorkspaceContext` async local storage provider for passing workspace ID through request handlers
- `workspace-router-middleware.ts` — Hono middleware that routes requests to the appropriate workspace
- `adaptors/` — Workspace adaptor implementations (see `adaptors/CLAUDE.md`)
- `workspace-server/` — Per-workspace HTTP server (see `workspace-server/CLAUDE.md`)
