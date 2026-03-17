# command/template

> **Path:** `Agent-backend/packages/opencode/src/command/template/`

## Purpose

Plain-text prompt templates for built-in slash commands. Templates use `$ARGUMENTS` and `$N` placeholders that are substituted at invocation time. The `${path}` variable is replaced with the workspace worktree path.

## Usage Status

| Product             | Status   | Notes                                                      |
| ------------------- | -------- | ---------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Built-in commands use these templates for prompt injection |
| Orbit CLI           | `active` | Same templates power `/init` and `/review` in the TUI      |

## Key Files

- `initialize.txt` — Template for the `/init` command; instructs the agent to analyze the codebase and create/update an AGENTS.md file with build commands, style guidelines, and formatting conventions
- `review.txt` — Template for the `/review` command; instructs the agent to review changes (commit, branch, or PR) with uncommitted changes as the default
