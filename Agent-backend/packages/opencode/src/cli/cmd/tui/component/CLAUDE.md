# cli/cmd/tui/component

> **Path:** `Agent-backend/packages/opencode/src/cli/cmd/tui/component/`

## Purpose

SolidJS components for the TUI application. Includes dialog panels for agent/model/MCP/session/theme selection, the prompt input area, workspace-scoped components, and shared UI elements like spinners, logos, and tips.

## Usage Status

| Product             | Status   | Notes                                                                   |
| ------------------- | -------- | ----------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Component patterns inform the desktop app's equivalent React components |
| Orbit CLI           | `active` | All TUI dialogs and interactive elements render via these components    |

## Key Files

- `dialog-agent.tsx` — Agent selection dialog
- `dialog-command.tsx` — Command palette dialog with fuzzy search
- `dialog-mcp.tsx` — MCP server status/management dialog
- `dialog-model.tsx` — Model selection dialog with provider grouping
- `dialog-provider.tsx` — Provider connection dialog
- `dialog-session-list.tsx` — Session list dialog with search and delete
- `dialog-session-rename.tsx` — Session rename dialog
- `dialog-skill.tsx` — Skill browser dialog
- `dialog-stash.tsx` — Prompt stash dialog (saved drafts)
- `dialog-status.tsx` — Session status information dialog
- `dialog-tag.tsx` — Tag management dialog
- `dialog-theme-list.tsx` — Theme picker dialog
- `dialog-workspace-list.tsx` — Workspace switcher dialog
- `border.tsx` — Custom border components for TUI layout
- `logo.tsx` — Rendered logo component
- `spinner.tsx` — Loading spinner component
- `tips.tsx` — Tip/hint display component
- `todo-item.tsx` — Todo list item component
- `textarea-keybindings.ts` — Shared textarea keybinding configuration
- `prompt/` — Prompt input components (see `prompt/CLAUDE.md`)
- `workspace/` — Workspace-scoped components (see `workspace/CLAUDE.md`)
