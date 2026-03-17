# cli/cmd/tui/routes/session

> **Path:** `Agent-backend/packages/opencode/src/cli/cmd/tui/routes/session/`

## Purpose

Session route view for the TUI — the active conversation screen. Renders the scrollable message list with tool call visualizations, file diffs, permission prompts, sidebar file tree, header with model/cost info, and footer with session status.

## Usage Status

| Product             | Status   | Notes                                                                              |
| ------------------- | -------- | ---------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Message rendering patterns and tool visualization logic inform the desktop chat UI |
| Orbit CLI           | `active` | Primary view when a session is active in the TUI                                   |

## Key Files

- `index.tsx` — Main session view with scrollable message list, tool call rendering (Bash, Read, Write, Edit, Glob, Grep, Task, etc.), permission prompts, question handling, diff rendering, and keyboard navigation
- `header.tsx` — Session header showing model name, token usage, cost, and agent indicator
- `footer.tsx` — Session footer with status bar and context information
- `sidebar.tsx` — File tree sidebar showing files touched during the session
- `file-tree.tsx` — File tree component for hierarchical file display
- `file-viewer.tsx` — Inline file content viewer for Read tool results
- `permission.tsx` — Permission prompt component for tool approval/denial
- `question.tsx` — Question component for agent-to-user queries
- `dialog-message.tsx` — Dialog for viewing full message content
- `dialog-timeline.tsx` — Timeline dialog for session history navigation
- `dialog-fork-from-timeline.tsx` — Fork session from a specific timeline point
- `dialog-subagent.tsx` — Subagent task detail dialog
