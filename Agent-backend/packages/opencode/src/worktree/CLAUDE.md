# worktree

> **Path:** `Agent-backend/packages/opencode/src/worktree/`

## Purpose

Git worktree management for multi-workspace support. Creates, lists, and removes git worktrees to enable parallel development on different branches within the same project. Each worktree gets its own session context, file state, and can run an optional startup script.

## Usage Status

| Product             | Status   | Notes                                            |
| ------------------- | -------- | ------------------------------------------------ |
| Orbit Desktop (SDK) | `active` | Multi-workspace feature for parallel branch work |
| Orbit CLI           | `active` | Multi-workspace feature for parallel branch work |

## Key Files

| File       | Purpose                                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts` | `Worktree` namespace -- `create()`, `list()`, `remove()` git worktrees, startup command execution, event bus integration (Ready, Failed) |
