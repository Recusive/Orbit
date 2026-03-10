# cli

> **Path:** `Agent-backend/packages/opencode/src/cli/`

## Purpose

CLI infrastructure layer providing workspace bootstrapping, error formatting, terminal UI helpers (logo, spinners, ANSI styles), network options, and the self-upgrade mechanism. Houses the `cmd/` subdirectory containing all CLI subcommands.

## Usage Status

| Product             | Status   | Notes                                                                       |
| ------------------- | -------- | --------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | `bootstrap.ts` is used by the serve command to initialize workspace context |
| Orbit CLI           | `active` | All CLI commands, error formatting, and UI helpers power the `orbit` binary |

## Key Files

- `bootstrap.ts` — `bootstrap()` function that wraps a callback in `Instance.provide()` with proper initialization and disposal
- `error.ts` — `FormatError()` function that maps typed errors (MCP, provider, config) to human-readable messages
- `ui.ts` — `UI` namespace with ANSI color constants, `println()`/`print()` output helpers, and `CancelledError`
- `logo.ts` — ASCII art logo glyphs for the terminal
- `network.ts` — Network option helpers for CLI commands (URL, password, headers)
- `upgrade.ts` — Self-upgrade logic for the CLI binary
- `cmd/` — Subdirectory with all CLI subcommands (see `cli/cmd/CLAUDE.md`)
