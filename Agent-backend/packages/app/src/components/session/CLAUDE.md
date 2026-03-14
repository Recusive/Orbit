# session

> **Path:** `Agent-backend/packages/app/src/components/session/`

## Purpose

Session UI chrome for the OpenCode web app — toolbar, context metrics, tab strips, and new-session view. These components show how the upstream app fetches session data from the SDK, computes token usage, manages session lifecycle actions, and renders draggable tab strips.

## Usage Status

| Product             | Status      | Notes                                                                                                                             |
| ------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `reference` | Patterns for session toolbar, token metrics, context breakdown, and tab management directly inform Orbit's React reimplementation |
| Orbit CLI           | `not used`  | CLI TUI has its own session chrome in `packages/opencode/src/cli/cmd/tui/`                                                        |

## When to Reference This

| If you're building...                                                                     | Read this file                                                                              |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Session toolbar** with model picker, thinking level, share/archive/fork actions         | `session-header.tsx`                                                                        |
| **Token usage display** (input/output/reasoning/cache breakdown, cost, % of context used) | `session-context-metrics.ts` + `session-context-format.ts`                                  |
| **Context breakdown panel** showing per-message token usage with role-colored bars        | `session-context-tab.tsx` + `session-context-breakdown.ts`                                  |
| **Draggable session tabs** with close buttons and file icons                              | `session-sortable-tab.tsx`                                                                  |
| **Draggable terminal tabs** with workspace labels and split actions                       | `session-sortable-terminal-tab.tsx`                                                         |
| **New session welcome screen** with greeting and suggested actions                        | `session-new-view.tsx`                                                                      |
| **"Open in" app launcher** menu (VS Code, Cursor, Zed, Ghostty, iTerm2, etc.)             | `session-header.tsx` — `OPEN_APPS` array and `MAC_APPS`/`WINDOWS_APPS`/`LINUX_APPS` configs |

## Files

| File                                | Size  | Purpose                                                                                                                                                                                                                                                                                  | Tests                               |
| ----------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `session-header.tsx`                | 29KB  | **Largest component.** Session toolbar: model selector via `useSync().providers`/`useSync().models`, thinking level cycling, "open in" app launcher (14 apps × 3 OS), share popover, archive, fork, rename, context usage bar. Fetches providers and session data from SDK sync context. | —                                   |
| `session-context-tab.tsx`           | 12KB  | Full context breakdown panel. Accordion per message showing raw JSON content, token stats per role (system/user/assistant/tool) with color-coded bars. Uses `getSessionContextMetrics()` and `estimateSessionContextBreakdown()`.                                                        | —                                   |
| `session-context-metrics.ts`        | 2KB   | **Pure logic (no SolidJS).** Computes session metrics from SDK `Message[]`: total cost, last assistant token breakdown (input/output/reasoning/cache read/cache write), context usage percentage. Finds last assistant message with tokens via reverse iteration.                        | `session-context-metrics.test.ts`   |
| `session-context-breakdown.ts`      | 4KB   | **Pure logic (no SolidJS).** Estimates token breakdown by message role using character-based heuristics (chars ÷ 4 ≈ tokens). Groups by system/user/assistant/tool.                                                                                                                      | `session-context-breakdown.test.ts` |
| `session-context-format.ts`         | 0.6KB | **Pure logic (no SolidJS).** Formats token counts ("12.3k") and percentages for display.                                                                                                                                                                                                 | —                                   |
| `session-new-view.tsx`              | 3.6KB | New session welcome view — time-based greeting, suggested action buttons.                                                                                                                                                                                                                | —                                   |
| `session-sortable-tab.tsx`          | 2.6KB | Draggable session tab using `@thisbeyond/solid-dnd`. Shows `FileVisual` icon (dual-layer mono/color file icon), title, close button with tooltip keybind.                                                                                                                                | —                                   |
| `session-sortable-terminal-tab.tsx` | 6.2KB | Draggable terminal tab with workspace label, PTY status indicator, close/split actions, rename popover.                                                                                                                                                                                  | —                                   |
| `index.ts`                          | 0.3KB | Barrel export of all session components.                                                                                                                                                                                                                                                 | —                                   |

## Key Data Patterns

### Token metrics (portable to React)

`session-context-metrics.ts` is framework-agnostic. Takes SDK `Message[]` + provider list, returns:

```typescript
{ totalCost: number, context: { input, output, reasoning, cacheRead, cacheWrite, total, usage: percent | null } }
```

This can be imported directly into Orbit's React code — no SolidJS dependency.

### Session toolbar data flow

`session-header.tsx` fetches data via:

- `useSync().session` — current session state (title, status, worktree)
- `useSync().messages` — message list for context metrics
- `useSync().providers` — provider list for model labels
- `useGlobalSDK()` — SDK client for session actions (rename, archive, share, fork)
- `useLayout()` — panel visibility, sidebar state

### "Open in" apps

14 apps defined per-OS with `id`, `label`, `icon`, and `openWith` (macOS app name for `open -a`). The session header renders these as a dropdown menu. Orbit can reuse the app list and open-with logic.

## Dependencies

- **SDK types:** `@orbit.build/sdk/v2/client` — `Message`, `AssistantMessage`, `Part`, `UserMessage`
- **UI library:** `@orbit.build/ui` — Accordion, Button, DropdownMenu, Icon, IconButton, Popover, Tooltip, FileIcon, Markdown, ScrollView, Spinner, TextField
- **Utilities:** `@orbit.build/util` — `path.getFilename()`, `encode.checksum()`, `array.findLast()`
- **SolidJS contexts:** `@/context/sync`, `@/context/layout`, `@/context/command`, `@/context/language`, `@/context/platform`, `@/context/server`, `@/context/global-sdk`, `@/context/file`
- **DnD:** `@thisbeyond/solid-dnd` — sortable tab drag-and-drop

## Notes

- **3 files are pure logic** — `session-context-metrics.ts`, `session-context-breakdown.ts`, and `session-context-format.ts` have zero SolidJS imports. They operate on SDK types and return plain objects. Directly reusable in React.
- **`session-header.tsx` is 29KB** — the second-largest component in the entire app. Consider decomposing when building Orbit's equivalent.
- **Token estimation is approximate** — `session-context-breakdown.ts` uses chars ÷ 4, not a real tokenizer. Good enough for UI display, not for billing.
