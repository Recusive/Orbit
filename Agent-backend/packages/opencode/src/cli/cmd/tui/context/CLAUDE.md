# cli/cmd/tui/context

> **Path:** `Agent-backend/packages/opencode/src/cli/cmd/tui/context/`

## Purpose

SolidJS context providers for the TUI application. Each context encapsulates a specific concern (SDK connection, theming, routing, keybindings, sync state, etc.) and is composed in `app.tsx` to provide global state to all TUI components.

## Usage Status

| Product             | Status   | Notes                                                                           |
| ------------------- | -------- | ------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | SDK context pattern mirrors the desktop app's connection to the headless server |
| Orbit CLI           | `active` | All TUI components consume these contexts for state and behavior                |

## Key Files

- `sdk.tsx` — `SDKProvider` / `useSDK()` — creates the opencode SDK client, manages SSE event subscription with batched flushing, and provides the client + event emitter to the TUI
- `theme.tsx` — `ThemeProvider` / `useTheme()` — loads 34+ built-in themes from JSON, supports custom themes from disk, auto-detects terminal background, provides RGBA color tokens and syntax styles
- `keybind.tsx` — `KeybindProvider` / `useKeybind()` — parses keybind config, provides key matching with leader key support and 2-second timeout
- `route.tsx` — Route provider for navigation between Home and Session views
- `sync.tsx` — Sync provider that maintains real-time state from SSE events (sessions, MCP, config)
- `local.tsx` — Local state provider for TUI-specific ephemeral state
- `args.tsx` — `ArgsProvider` / `useArgs()` — passes CLI arguments (model, agent, prompt, continue, sessionID, fork) into the TUI
- `exit.tsx` — Exit handler provider for clean shutdown
- `kv.tsx` — Key-value store provider for persistent TUI preferences
- `prompt.tsx` — Prompt ref provider for accessing the prompt component imperatively
- `directory.ts` — Directory context for the current working directory
- `helper.tsx` — `createSimpleContext()` factory for creating provider/hook pairs with minimal boilerplate
- `tui-config.tsx` — TUI configuration provider (loads tui.json settings)
- `theme/` — Theme JSON files (see `theme/CLAUDE.md`)
