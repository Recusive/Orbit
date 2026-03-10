# cli/cmd/tui/util

> **Path:** `Agent-backend/packages/opencode/src/cli/cmd/tui/util/`

## Purpose

Utility modules for the TUI application. Provides clipboard access (OSC 52 for SSH), external editor integration, text selection handling, debounced signals, terminal color detection, and session transcript formatting.

## Usage Status

| Product             | Status   | Notes                                                                    |
| ------------------- | -------- | ------------------------------------------------------------------------ |
| Orbit Desktop (SDK) | `active` | Transcript formatting logic can be reused for desktop session export     |
| Orbit CLI           | `active` | All TUI utility functions power clipboard, editor, and terminal features |

## Key Files

- `clipboard.ts` — `Clipboard` namespace with OSC 52 escape sequence support for clipboard write over SSH/tmux, fallback to `clipboardy` native clipboard
- `editor.ts` — `Editor` namespace with `open()` function that suspends the TUI renderer, launches `$VISUAL`/`$EDITOR` with a temp file, and returns the edited content
- `selection.ts` — `Selection` namespace with `copy()` function that reads selected text from the opentui renderer and copies to clipboard
- `signal.ts` — `createDebouncedSignal()` helper combining SolidJS signals with `@solid-primitives/scheduled` debounce
- `terminal.ts` — `Terminal` namespace with `colors()` function that queries terminal background/foreground/palette via OSC escape sequences for theme auto-detection
- `transcript.ts` — `formatTranscript()` function that renders a session's messages into a Markdown transcript with optional thinking, tool details, and assistant metadata
