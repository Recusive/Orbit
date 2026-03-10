# components

> **Path:** `Agent-backend/packages/app/src/components/`

## Purpose

All SolidJS UI components for the OpenCode web app. Flat structure with three subdirectories (`prompt-input/`, `session/`, `server/`). Contains dialogs, settings tabs, the prompt input system, terminal wrapper, session header, file tree, status popover, titlebar, and debug bar. Components depend heavily on the `@/context/` providers and `@opencode-ai/ui` component library (Kobalte).

## Usage Status

| Product             | Status      | Notes                                                                                                                                                                                |
| ------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Orbit Desktop (SDK) | `reference` | SolidJS code doesn't directly port, but the component architecture, data flows, state management patterns, and UI logic are the primary reference for Orbit's React reimplementation |
| Orbit CLI           | `reference` | Same                                                                                                                                                                                 |

## File Inventory

### Dialogs (13 files)

| File                             | Purpose                                                       |
| -------------------------------- | ------------------------------------------------------------- |
| `dialog-connect-provider.tsx`    | OAuth/API key flow for connecting a new LLM provider          |
| `dialog-custom-provider.tsx`     | Custom provider configuration (endpoint, API key, model list) |
| `dialog-edit-project.tsx`        | Edit project settings (workspace, environment)                |
| `dialog-fork.tsx`                | Fork/branch a session conversation                            |
| `dialog-manage-models.tsx`       | Manage visible models in the model picker                     |
| `dialog-release-notes.tsx`       | Display release notes on version update                       |
| `dialog-select-directory.tsx`    | Directory picker with file-system browsing                    |
| `dialog-select-file.tsx`         | File picker with search and preview                           |
| `dialog-select-mcp.tsx`          | MCP server selection                                          |
| `dialog-select-model.tsx`        | Model picker popover with provider grouping                   |
| `dialog-select-model-unpaid.tsx` | Model selection with unpaid/upgrade prompt                    |
| `dialog-select-provider.tsx`     | Provider selection from configured list                       |
| `dialog-select-server.tsx`       | Server connection picker (local, remote, mDNS-discovered)     |

### Settings Tabs (8 files)

| File                       | Purpose                                                      |
| -------------------------- | ------------------------------------------------------------ |
| `settings-general.tsx`     | General preferences (theme, font, telemetry, update channel) |
| `settings-keybinds.tsx`    | Keybinding editor with conflict detection                    |
| `settings-models.tsx`      | Model visibility and default selection                       |
| `settings-providers.tsx`   | Provider configuration and credentials                       |
| `settings-permissions.tsx` | Tool permission rules                                        |
| `settings-mcp.tsx`         | MCP server configuration                                     |
| `settings-agents.tsx`      | Agent configuration (build, plan)                            |
| `settings-commands.tsx`    | Slash command configuration                                  |
| `dialog-settings.tsx`      | Settings dialog container (hosts tab components)             |

### Core Components (9 files)

| File                        | Purpose                                                                                                                                                                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prompt-input.tsx`          | **Largest component (52KB)** — the chat input area. ContentEditable editor with `@`-mention popover, `/`-slash commands, image attachments, file drag-and-drop, shell mode toggle, model selector, prompt history navigation, and submit logic. Imports all `prompt-input/` submodules. |
| `terminal.tsx`              | Ghostty WASM terminal wrapper. Lazy-loads `ghostty-web`, handles theming (oklch → hex color conversion), keybinding interception, PTY connection via SDK, and serialization for buffer persistence.                                                                                     |
| `file-tree.tsx`             | File explorer tree with expand/collapse, file icons, git status indicators, and context menus. Has unit test (`file-tree.test.ts`).                                                                                                                                                     |
| `titlebar.tsx`              | App titlebar — session tabs, "open in" menu (VS Code, Cursor, Zed, etc.), sidebar toggle, status popover trigger, session management actions                                                                                                                                            |
| `titlebar-history.ts`       | Browser-style back/forward navigation state for session history. Has unit test (`titlebar-history.test.ts`).                                                                                                                                                                            |
| `status-popover.tsx`        | 4-tab popover (Servers, MCP, LSP, Plugins) with server health polling, plugin enable/disable toggles, and toast notifications. Uses `ServerRow` from `server/`.                                                                                                                         |
| `debug-bar.tsx`             | Performance monitoring bar showing FPS, memory usage, INP (Interaction to Next Paint), CLS, and route transitions. Uses `PerformanceObserver` API.                                                                                                                                      |
| `link.tsx`                  | External link component using platform `openLink` abstraction                                                                                                                                                                                                                           |
| `model-tooltip.tsx`         | Model info tooltip with provider, context window, and pricing                                                                                                                                                                                                                           |
| `session-context-usage.tsx` | Compact context usage indicator (tokens used vs limit)                                                                                                                                                                                                                                  |

### Subdirectory: `prompt-input/` (15 files)

Extracted logic modules for the prompt input system. Pure functions + small SolidJS components.

| File                     | Purpose                                                                                                                                           | Tests                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `submit.ts`              | Submit orchestration — builds request parts, handles session creation, worktree setup, abort controllers, comment attachment, shell mode dispatch | `submit.test.ts`              |
| `build-request-parts.ts` | Converts `Prompt` (content parts) into SDK `UserMessagePart[]` with base64-encoded images                                                         | `build-request-parts.test.ts` |
| `history.ts`             | Prompt history navigation (up/down arrow), max 100 entries, cursor position awareness                                                             | `history.test.ts`             |
| `editor-dom.ts`          | ContentEditable DOM helpers — cursor position get/set, text fragment creation, range edge clamping                                                | `editor-dom.test.ts`          |
| `placeholder.ts`         | Dynamic placeholder text generator based on context (new session, shell mode, file selected)                                                      | `placeholder.test.ts`         |
| `attachments.ts`         | File attachment processing — drag-and-drop, paste, accepted MIME types                                                                            |                               |
| `slash-popover.tsx`      | `@`-mention and `/`-slash command popover with fuzzy search and keyboard navigation                                                               |                               |
| `context-items.tsx`      | Renders attached context items (files, selections) as removable chips                                                                             |                               |
| `image-attachments.tsx`  | Image attachment preview grid with remove action                                                                                                  |                               |
| `drag-overlay.tsx`       | Drag-and-drop overlay indicator                                                                                                                   |                               |

### Subdirectory: `session/` (10 files)

Session chrome — header, tabs, context breakdown.

| File                                | Purpose                                                                                                                                                                                                                          | Tests                               |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `session-header.tsx`                | **Second-largest component (29KB)** — session titlebar with model selector, thinking level toggle, "open in" apps menu, share, archive, session actions dropdown. Shows project name, worktree indicator, and context usage bar. |                                     |
| `session-context-tab.tsx`           | Full context breakdown panel — accordion per message, raw content viewer, token metrics, breakdown by role (system/user/assistant/tool) with color-coded bars                                                                    |                                     |
| `session-context-breakdown.ts`      | Estimates token breakdown by message role using character-based heuristics                                                                                                                                                       | `session-context-breakdown.test.ts` |
| `session-context-metrics.ts`        | Computes session context metrics (total tokens, cost estimate, message counts)                                                                                                                                                   | `session-context-metrics.test.ts`   |
| `session-context-format.ts`         | Formats token counts and percentages for display                                                                                                                                                                                 |                                     |
| `session-new-view.tsx`              | New session welcome view (greeting, suggested actions)                                                                                                                                                                           |                                     |
| `session-sortable-tab.tsx`          | Draggable session tab with close button, title, and `FileVisual` icon                                                                                                                                                            |                                     |
| `session-sortable-terminal-tab.tsx` | Draggable terminal tab with workspace label, close/split actions                                                                                                                                                                 |                                     |
| `index.ts`                          | Barrel export of all session components                                                                                                                                                                                          |                                     |

### Subdirectory: `server/` (1 file)

| File             | Purpose                                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server-row.tsx` | Server connection row with health indicator (dot), name, version, truncation tooltip. Used by `status-popover.tsx`. Exports `ServerHealthIndicator`. |

## Dependencies

- **Internal contexts:** Nearly every component imports from `@/context/` (sdk, sync, server, layout, settings, language, platform, command, permission, prompt, file, terminal, comments, highlights, local, models)
- **UI library:** `@opencode-ai/ui` — Button, Icon, IconButton, Popover, Tabs, Select, Tooltip, Switch, Accordion, ScrollView, Markdown, etc.
- **SDK:** `@opencode-ai/sdk/v2/client` for `Message`, `Part`, `UserMessage` types
- **Utilities:** `@opencode-ai/util` (path, encode, array), `@/utils/` (persist, base64, id, server-health, server-errors, runtime-adapters, terminal-writer, worktree, same)
- **SolidJS:** `solid-js`, `solid-js/store`, `solid-js/web`, `@solidjs/router`
- **External:** `ghostty-web` (terminal), `fuzzysort` (search)

## Development Guide

For Orbit, study these patterns:

1. **Prompt input architecture** — the `prompt-input.tsx` + `prompt-input/` split shows how to decompose a complex input component. Pure logic (history, DOM helpers, placeholder, submit) is extracted into testable modules. The main component wires them together with SolidJS reactivity.

2. **Session header** — demonstrates how to build a dense toolbar with model selection, thinking level cycling, "open in" app launchers, and session lifecycle actions (archive, share, fork, rename).

3. **Status popover tabs** — shows 4-tab architecture (Servers, MCP, LSP, Plugins) with periodic health polling (`pollMs = 10_000`), reconcile-based store updates, and empty-state messaging.

4. **Terminal integration** — Ghostty WASM lazy-loading pattern, theme color conversion (oklch → hex via `resolveThemeVariant`), PTY lifecycle management, and serialization for buffer persistence.

5. **Dialog patterns** — all dialogs use `@opencode-ai/ui` Dialog/Popover primitives from Kobalte. Form state uses `createStore` (SolidJS store), not multiple signals.

## Notes

- **SolidJS, not React** — all components use `createSignal`, `createEffect`, `createMemo`, `createStore`, `Show`, `For`, `Switch/Match`. No `useState`, `useEffect`, or React JSX patterns.
- **`prompt-input.tsx` is 52KB** — the single largest component. In Orbit's React reimplementation, consider further decomposition.
- **5 test files** in `prompt-input/` covering submit, build-request-parts, history, editor-dom, and placeholder. Plus `file-tree.test.ts` and `titlebar-history.test.ts` at the component root. Tests use HappyDOM.
- **`session-header.tsx` is 29KB** — the second-largest. Contains the "open in" apps list (VS Code, Cursor, Zed, Ghostty, iTerm2, Warp, Xcode, Android Studio, Finder, Terminal).
- **Ghostty terminal** is lazy-loaded via dynamic `import("ghostty-web")` with a shared singleton promise. The `loadGhostty` function ensures only one WASM load across all terminal instances.
- **`debug-bar.tsx`** monitors Core Web Vitals (INP, CLS) via `PerformanceObserver` with 5-second rolling windows. Development/debugging tool only.
