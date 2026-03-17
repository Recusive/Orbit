# cli/cmd/tui/component/prompt

> **Path:** `Agent-backend/packages/opencode/src/cli/cmd/tui/component/prompt/`

## Purpose

Prompt input component for the TUI chat interface. Handles text input, file attachments, autocomplete with `@`-mentions, command palette integration, prompt history navigation, stash (saved drafts), and frecency-based suggestion ranking.

## Usage Status

| Product             | Status   | Notes                                                                           |
| ------------------- | -------- | ------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Prompt patterns and autocomplete logic inform the desktop prompt implementation |
| Orbit CLI           | `active` | Primary text input component in the TUI session view                            |

## Key Files

- `index.tsx` — Main `Prompt` component with textarea rendering, file drop handling, submit logic, agent cycling, and integration with autocomplete/stash/history
- `autocomplete.tsx` — `Autocomplete` component for `@`-mention file/command suggestions with fuzzy matching
- `history.tsx` — `PromptHistoryProvider` for navigating previous prompts with up/down arrows
- `frecency.tsx` — `FrecencyProvider` for ranking suggestions by frequency and recency of use
- `stash.tsx` — `PromptStashProvider` for saving/restoring prompt drafts across sessions
