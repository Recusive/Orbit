# cli/cmd/debug

> **Path:** `Agent-backend/packages/opencode/src/cli/cmd/debug/`

## Purpose

Debugging and troubleshooting CLI subcommands grouped under `orbit debug`. Provides introspection into config, LSP, ripgrep, files, skills, snapshots, agents, and global paths.

## Usage Status

| Product             | Status   | Notes                                           |
| ------------------- | -------- | ----------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Debug commands help diagnose server-side issues |
| Orbit CLI           | `active` | `orbit debug <subcommand>` for troubleshooting  |

## Key Files

- `index.ts` — `DebugCommand` entry point registering all debug subcommands plus an inline `paths` command and `wait` command (indefinite pause for debugging)
- `config.ts` — Dump resolved configuration
- `lsp.ts` — LSP server diagnostics
- `ripgrep.ts` — Ripgrep search debugging
- `file.ts` — File operation testing
- `skill.ts` — Skill discovery debugging
- `snapshot.ts` — Snapshot inspection
- `agent.ts` — Agent configuration debugging
- `scrap.ts` — Scratch/experimental debugging
