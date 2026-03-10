# cli/cmd/tui/component/workspace

> **Path:** `Agent-backend/packages/opencode/src/cli/cmd/tui/component/workspace/`

## Purpose

Workspace-scoped TUI components. Currently contains a specialized session list dialog that filters sessions by workspace ID, used when the multi-workspace feature is active.

## Usage Status

| Product             | Status   | Notes                                                                              |
| ------------------- | -------- | ---------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Workspace-scoped session filtering applies to the desktop app's session management |
| Orbit CLI           | `active` | Used in TUI when running in multi-workspace mode                                   |

## Key Files

- `dialog-session-list.tsx` — Workspace-scoped variant of the session list dialog; filters sessions by `workspaceID` and supports a `localOnly` mode
