# cli/cmd/tui

> **Path:** `Agent-backend/packages/opencode/src/cli/cmd/tui/`

## Purpose

Full terminal UI (TUI) application built with SolidJS and opentui. Provides an interactive chat interface with session management, prompt input, dialogs, theming, keybindings, and real-time agent streaming -- all rendered in the terminal.

## Usage Status

| Product             | Status   | Notes                                                                     |
| ------------------- | -------- | ------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | TUI shares the same SDK client interface used by the desktop app          |
| Orbit CLI           | `active` | The primary interactive interface when running `orbit` with no subcommand |

## Key Files

- `app.tsx` — Root TUI application; sets up all providers (SDK, Theme, Keybind, Dialog, Toast, etc.), route switching between Home and Session views, global keyboard shortcuts
- `attach.ts` — `AttachCommand` to connect TUI to a remote running orbit server
- `thread.ts` — Thread management command for TUI sessions, creates worker and RPC bridge
- `worker.ts` — Background worker that runs the HTTP server and forwards events via RPC
- `event.ts` — `TuiEvent` bus event definitions for prompt append, command execution, toast, and session selection
- `win32.ts` — Windows-specific terminal input handling (Ctrl+C guard, processed input mode)
- `component/` — TUI UI components (see `component/CLAUDE.md`)
- `context/` — SolidJS context providers (see `context/CLAUDE.md`)
- `routes/` — TUI route views (see `routes/CLAUDE.md`)
- `ui/` — Reusable TUI dialog and widget primitives (see `ui/CLAUDE.md`)
- `util/` — TUI utility modules (see `util/CLAUDE.md`)
