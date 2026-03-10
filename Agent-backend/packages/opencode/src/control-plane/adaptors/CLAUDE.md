# control-plane/adaptors

> **Path:** `Agent-backend/packages/opencode/src/control-plane/adaptors/`

## Purpose

Pluggable workspace adaptor implementations. Each adaptor defines how to configure, create, remove, and fetch from a specific workspace type. Currently only the git worktree adaptor is implemented, with an experimental `installAdaptor()` hook for custom adaptors.

## Usage Status

| Product             | Status   | Notes                                                                              |
| ------------------- | -------- | ---------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Worktree adaptor enables git-based workspace isolation for parallel agent sessions |
| Orbit CLI           | `active` | Same adaptor used when creating workspaces via the TUI or CLI                      |

## Key Files

- `index.ts` — Adaptor registry with `getAdaptor()` (lazy-loads adaptor by type) and `installAdaptor()` (experimental hook for registering custom adaptors at runtime)
- `worktree.ts` — `WorktreeAdaptor` implementing the `Adaptor` interface: `configure()` resolves worktree name/branch/directory, `create()` creates a git worktree, `remove()` deletes it, `fetch()` routes HTTP requests through the workspace server with directory header injection
