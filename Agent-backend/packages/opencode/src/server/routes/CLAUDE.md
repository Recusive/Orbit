# server/routes

> **Path:** `Agent-backend/packages/opencode/src/server/routes/`

## Purpose

Hono route handlers for the HTTP API. Each file defines a set of REST endpoints for a specific domain, using `hono-openapi` for OpenAPI spec generation and `@hono/zod-validator` for request validation.

## Usage Status

| Product             | Status   | Notes                                          |
| ------------------- | -------- | ---------------------------------------------- |
| Orbit Desktop (SDK) | `active` | All API endpoints consumed by the frontend SDK |
| Orbit CLI           | `active` | Internal API for TUI and external integrations |

## Key Files

| File              | Purpose                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| `session.ts`      | Session CRUD, message send, abort, revert, title generation, compaction |
| `file.ts`         | File read, list, search, status (git diff)                              |
| `pty.ts`          | PTY create, list, resize, WebSocket upgrade                             |
| `permission.ts`   | Permission list, respond (allow/deny/always)                            |
| `question.ts`     | Question list, respond with answers                                     |
| `mcp.ts`          | MCP server status, connect, disconnect, tools, auth                     |
| `provider.ts`     | Provider/model listing, auth methods, credential management             |
| `config.ts`       | Configuration read/write                                                |
| `project.ts`      | Project info, update, git init                                          |
| `workspace.ts`    | Workspace (worktree) management                                         |
| `global.ts`       | Global info (version, installation, paths)                              |
| `tui.ts`          | TUI-specific events (toast, navigate)                                   |
| `experimental.ts` | Experimental/preview feature endpoints                                  |
