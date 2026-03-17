# server

> **Path:** `Agent-backend/packages/opencode/src/server/`

## Purpose

Hono-based HTTP + SSE API server. The headless backend that both the web UI and desktop app connect to. Provides REST endpoints for sessions, files, PTY, MCP, providers, config, permissions, and questions. Includes SSE streaming for real-time events, WebSocket upgrade for terminals, mDNS service discovery, and OpenAPI spec generation.

## Usage Status

| Product             | Status   | Notes                                                           |
| ------------------- | -------- | --------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | The HTTP server Orbit's frontend connects to                    |
| Orbit CLI           | `active` | `serve` command starts this server; TUI also uses it internally |

## Key Files

| File        | Purpose                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| `server.ts` | `Server` namespace -- Hono app creation with CORS, auth, error handling, SSE streaming, WebSocket support, route mounting |
| `event.ts`  | Server lifecycle events (Connected, Disposed)                                                                             |
| `error.ts`  | Standardized error response formatting                                                                                    |
| `mdns.ts`   | `MDNS` namespace -- mDNS/Bonjour service advertisement for automatic desktop client discovery                             |
| `routes/`   | API route handlers (see `routes/CLAUDE.md`)                                                                               |
