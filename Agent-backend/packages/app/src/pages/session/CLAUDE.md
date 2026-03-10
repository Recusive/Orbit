# session

> **Path:** `Agent-backend/packages/app/src/pages/session/`

## Purpose

Session page extracted logic — the most complex subdirectory in the app. Contains everything the user sees during an active conversation: message timeline, terminal panel, file tabs, side panel, review tab, composer (permission/question/todo docks), session commands, model sync, gestures, and deep linking.

## Usage Status

| Product             | Status      | Notes                                                                                                                             |
| ------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `reference` | Blueprint for Orbit's entire session view — message timeline, composer state machine, session commands, file tabs, terminal panel |
| Orbit CLI           | `not used`  | CLI TUI has its own session rendering in `packages/opencode/src/cli/cmd/tui/`                                                     |

## Recommendation

**KEEP AS REFERENCE** — This is the session view blueprint. The composer state machine, message timeline architecture, and session command catalog are directly relevant to Orbit. Several helper files are pure logic (no SolidJS dependency). 13 test files provide good coverage of the portable logic.

## When to Reference This

| If you're building...                                    | Read this file                                                            | What you'll learn                                                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Chat message list** with virtual scrolling             | `message-timeline.tsx`                                                    | Virtual-scrolled message rendering, message actions (fork, copy, revert, comment), file diff display, binary search for message lookups, scroll-to-bottom behavior |
| **Permission/question/todo docks** (agent blocked UI)    | `composer/session-composer-state.ts` + `composer/session-request-tree.ts` | State machine detecting when agent is blocked (pending permission, question, or todo), auto-close timer for resolved items                                         |
| **Permission request UI** (Allow Once / Always / Reject) | `composer/session-permission-dock.tsx`                                    | How to render permission requests with tool name, arguments, and action buttons                                                                                    |
| **Agent question UI** (text input for agent queries)     | `composer/session-question-dock.tsx`                                      | How to render agent questions with freeform text response                                                                                                          |
| **Todo checklist dock**                                  | `composer/session-todo-dock.tsx`                                          | Agent-generated todo items with checkboxes                                                                                                                         |
| **Session keyboard shortcuts** and command palette       | `use-session-commands.tsx`                                                | Full catalog of session commands: archive, rename, copy URL, share, fork, toggle terminal, toggle sidebar, file navigation                                         |
| **File tab bar** with scroll management                  | `file-tabs.tsx` + `file-tab-scroll.ts`                                    | Sortable open-file tabs, horizontal scroll with mouse wheel, overflow detection                                                                                    |
| **Terminal panel** with tabs and split                   | `terminal-panel.tsx`                                                      | Terminal tabs, split/close actions, resize handle, buffer persistence                                                                                              |
| **Side panel** (file tree + review)                      | `session-side-panel.tsx`                                                  | Resizable panel with file tree and review tab side-by-side with chat                                                                                               |
| **Code review panel** with diffs                         | `review-tab.tsx`                                                          | Unified/split diff view toggle, expand/collapse, comment annotations                                                                                               |
| **Model sync** between session and global selection      | `session-model-helpers.ts`                                                | `syncSessionModel()` and `resetSessionModel()` keep session model in sync with global picker                                                                       |
| **Scroll to message** via URL hash                       | `use-session-hash-scroll.ts` + `message-id-from-hash.ts`                  | `#message-<id>` deep linking with scroll animation                                                                                                                 |
| **Wheel gesture detection** at scroll boundaries         | `message-gesture.ts`                                                      | `normalizeWheelDelta()` (handles deltaMode 0/1/2), `shouldMarkBoundaryGesture()` for edge detection                                                                |
| **Session context handoff** between routes               | `handoff.ts`                                                              | Pass session state across route navigations without re-fetching                                                                                                    |
| **Mobile tab layout**                                    | `session-mobile-tabs.tsx`                                                 | Chat/files/review tab switching for narrow viewports (<600px)                                                                                                      |
| **Responsive layout calculations**                       | `helpers.ts`                                                              | `createSizing()` for panel widths, `createOpenReviewFile()` for review file resolution                                                                             |

## Files

| File                         | Size  | Portable?                                                         | Tests                             |
| ---------------------------- | ----- | ----------------------------------------------------------------- | --------------------------------- |
| `message-timeline.tsx`       | 31KB  | SolidJS-specific                                                  | —                                 |
| `session-side-panel.tsx`     | 19KB  | SolidJS-specific                                                  | —                                 |
| `use-session-commands.tsx`   | 18KB  | SolidJS-specific (but command list is reusable)                   | `use-session-commands.test.ts`    |
| `file-tabs.tsx`              | 14KB  | SolidJS-specific                                                  | —                                 |
| `terminal-panel.tsx`         | 10KB  | SolidJS-specific                                                  | `terminal-panel.test.ts`          |
| `review-tab.tsx`             | 6KB   | SolidJS-specific                                                  | —                                 |
| `use-session-hash-scroll.ts` | 5.7KB | SolidJS-specific                                                  | `use-session-hash-scroll.test.ts` |
| `helpers.ts`                 | 4.2KB | Mostly pure logic                                                 | `helpers.test.ts`                 |
| `file-tab-scroll.ts`         | 1.8KB | **Yes — pure DOM logic**                                          | `file-tab-scroll.test.ts`         |
| `session-model-helpers.ts`   | 1.1KB | **Yes — pure logic** (uses SolidJS `batch` but logic is portable) | `session-model-helpers.test.ts`   |
| `handoff.ts`                 | 1KB   | Pattern reusable                                                  | —                                 |
| `message-gesture.ts`         | 0.7KB | **Yes — pure math**                                               | `message-gesture.test.ts`         |
| `terminal-label.ts`          | 0.6KB | **Yes — pure string**                                             | —                                 |
| `session-command-helpers.ts` | 0.3KB | **Yes — pure logic**                                              | —                                 |
| `session-prompt-helpers.ts`  | 0.2KB | Minimal                                                           | `session-prompt-dock.test.ts`     |
| `message-id-from-hash.ts`    | 0.2KB | **Yes — pure string**                                             | —                                 |
| `session-mobile-tabs.tsx`    | 1.2KB | SolidJS-specific                                                  | —                                 |

### `composer/` Subdirectory

| File                          | Size  | Portable?                       | Tests                            |
| ----------------------------- | ----- | ------------------------------- | -------------------------------- |
| `session-question-dock.tsx`   | 15KB  | SolidJS-specific                | —                                |
| `session-todo-dock.tsx`       | 11KB  | SolidJS-specific                | —                                |
| `session-composer-region.tsx` | 7.8KB | SolidJS-specific                | —                                |
| `session-composer-state.ts`   | 5.4KB | Logic portable (SolidJS wiring) | `session-composer-state.test.ts` |
| `session-permission-dock.tsx` | 2.6KB | SolidJS-specific                | —                                |
| `session-request-tree.ts`     | 1.5KB | **Yes — pure logic**            | —                                |
| `index.ts`                    | 0.2KB | Barrel export                   | —                                |

## Key Data Patterns (portable to React)

### Composer "blocked" detection

`composer/session-composer-state.ts` → `createSessionComposerBlocked()`: returns `true` when the agent is waiting for the user — pending permission request OR pending question. Orbit's equivalent: check if `permissions.length > 0 || questions.length > 0` in the chat store.

### Permission/question request extraction

`composer/session-request-tree.ts` → `sessionPermissionRequest()` / `sessionQuestionRequest()`: finds the next pending request for the active session by filtering the request arrays. Pure logic, directly reusable.

### Wheel delta normalization

`message-gesture.ts` → `normalizeWheelDelta()`: converts `deltaMode` 0 (pixels), 1 (lines → ×40), 2 (pages → ×clientHeight) to pixel values. Universal browser compat logic.

### File tab scroll

`file-tab-scroll.ts`: horizontal scroll helpers for tab overflow — detects if tabs overflow container, calculates scroll direction from mouse wheel events.

## Orbit Mapping

| Session feature                    | Orbit equivalent                                 | Status                |
| ---------------------------------- | ------------------------------------------------ | --------------------- |
| Message timeline                   | `chat-messages.tsx`                              | Already implemented   |
| Composer state (blocked detection) | Permission handling in `chat-message-service.ts` | Already implemented   |
| Permission dock                    | Tool approval UI in agent panel                  | Already implemented   |
| Terminal panel                     | `terminal/` components                           | Already implemented   |
| File tabs                          | Editor tabs                                      | Already implemented   |
| Session commands                   | Keyboard shortcuts (partial)                     | Partially implemented |
| Code review panel                  | Activity panel diffs                             | Already implemented   |
| Side panel                         | File explorer panel                              | Already implemented   |
| Model sync                         | Model selection in bridge                        | Partially implemented |
| Hash scroll / deep linking         | Not yet built                                    | Reference             |
| Mobile tabs                        | Not applicable (desktop only)                    | N/A                   |

## Notes

- **`message-timeline.tsx` is 31KB** — the single largest file in the entire session system. Uses virtual scrolling via `ScrollView` + `SessionTurn` components. Consider aggressive decomposition when building Orbit's equivalent.
- **`use-session-commands.tsx` is 18KB** — catalogs every session command. The command _list_ (names, keybinds, descriptions) is reusable even though the SolidJS wiring isn't.
- **6 files are pure logic** — `message-gesture.ts`, `file-tab-scroll.ts`, `session-model-helpers.ts`, `terminal-label.ts`, `message-id-from-hash.ts`, `session-request-tree.ts`. Directly usable in React.
- **Composer auto-close timer** — `session-composer-state.ts` has a configurable `closeMs` for auto-dismissing resolved permission/question docks. Default behavior: dock stays visible briefly after resolution so the user sees the outcome.
