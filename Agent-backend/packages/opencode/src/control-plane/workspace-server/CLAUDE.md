# control-plane/workspace-server

> **Path:** `Agent-backend/packages/opencode/src/control-plane/workspace-server/`

## Purpose

Per-workspace HTTP server that runs within an `Instance.provide()` context. Handles session routes scoped to a specific workspace directory and provides an SSE event endpoint for real-time updates from that workspace.

## Usage Status

| Product             | Status   | Notes                                                                              |
| ------------------- | -------- | ---------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Workspace-scoped request handling enables multi-project support in the desktop app |
| Orbit CLI           | `active` | Multi-workspace server delegates to these per-workspace Hono apps                  |

## Key Files

- `server.ts` — `WorkspaceServer.App()` factory that creates a Hono app requiring `workspace` and `directory` parameters; wraps all requests in `WorkspaceContext.provide()` + `Instance.provide()` with `InstanceBootstrap`; mounts session routes and workspace-specific routes
- `routes.ts` — `WorkspaceServerRoutes()` providing a `/event` SSE endpoint that streams `GlobalBus` events with heartbeat keepalive; connects/disconnects listener on stream lifecycle
