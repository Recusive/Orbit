# cli/cmd

> **Path:** `Agent-backend/packages/opencode/src/cli/cmd/`

## Purpose

All CLI subcommands registered via yargs. Each file exports a `CommandModule` wrapped in the `cmd()` helper. Includes commands for the TUI, headless server, authentication, MCP management, session operations, and debugging tools.

## Usage Status

| Product             | Status   | Notes                                                                           |
| ------------------- | -------- | ------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | `serve.ts` starts the headless HTTP+SSE server that the desktop app connects to |
| Orbit CLI           | `active` | Every command here is a `orbit <subcommand>` entry point                        |

## Key Files

- `cmd.ts` — `cmd()` helper that wraps yargs `CommandModule` with double-dash support
- `serve.ts` — Headless HTTP+SSE server command (`orbit serve`)
- `run.ts` — Default TUI command (no subcommand)
- `auth.ts` — Authentication management (`orbit auth`)
- `agent.ts` — Run agent non-interactively
- `mcp.ts` — MCP server management
- `models.ts` — List available models
- `session.ts` — Session CRUD operations
- `export.ts` / `import.ts` — Session export/import
- `github.ts` / `pr.ts` — GitHub and PR integration
- `web.ts` — Open web UI
- `upgrade.ts` — Self-upgrade command
- `uninstall.ts` — Remove installation
- `generate.ts` — SDK code generation
- `workspace-serve.ts` — Multi-workspace server (dev only)
- `stats.ts` — Usage statistics
- `acp.ts` — ACP server command
- `db.ts` — Database operations (Drizzle Kit)
- `debug/` — Debug utilities (see `debug/CLAUDE.md`)
- `tui/` — Terminal UI (see `tui/CLAUDE.md`)
