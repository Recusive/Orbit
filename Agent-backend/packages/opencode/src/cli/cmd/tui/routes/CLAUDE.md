# cli/cmd/tui/routes

> **Path:** `Agent-backend/packages/opencode/src/cli/cmd/tui/routes/`

## Purpose

Top-level route views for the TUI application. The TUI has two main views: Home (session list with prompt) and Session (active conversation with message rendering and tool visualization).

## Usage Status

| Product             | Status   | Notes                                                                                     |
| ------------------- | -------- | ----------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Route structure mirrors the desktop app's navigation between session list and active chat |
| Orbit CLI           | `active` | `app.tsx` switches between these routes based on navigation state                         |

## Key Files

- `home.tsx` — Home route displaying the logo, prompt input, tips, and MCP status indicators; handles first-time user detection and auto-continue from CLI args
- `session/` — Session route directory (see `session/CLAUDE.md`)
