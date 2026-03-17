# cli/cmd/tui/ui

> **Path:** `Agent-backend/packages/opencode/src/cli/cmd/tui/ui/`

## Purpose

Reusable TUI dialog and widget primitives built on opentui. Provides the base dialog overlay system, common dialog variants (alert, confirm, prompt, select, help, export options), link rendering, spinner, and toast notifications.

## Usage Status

| Product             | Status   | Notes                                                 |
| ------------------- | -------- | ----------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Dialog patterns inform the desktop app's modal system |
| Orbit CLI           | `active` | All TUI dialogs are composed from these primitives    |

## Key Files

- `dialog.tsx` — Base `Dialog` component (centered overlay with backdrop dismiss) and `DialogProvider` / `useDialog()` context for dialog stack management
- `dialog-alert.tsx` — Alert dialog with title and message
- `dialog-confirm.tsx` — Confirmation dialog with yes/no actions
- `dialog-prompt.tsx` — Text input dialog
- `dialog-select.tsx` — Searchable selection list dialog with keyboard navigation
- `dialog-help.tsx` — Help/keybinding reference dialog
- `dialog-export-options.tsx` — Export format selection dialog
- `link.tsx` — Clickable link component for terminal URLs
- `spinner.ts` — Spinner animation utilities (frame generation, color cycling)
- `toast.tsx` — `ToastProvider` / `useToast()` for timed notification messages with variants (info, success, warning, error)
