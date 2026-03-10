# shell

> **Path:** `Agent-backend/packages/opencode/src/shell/`

## Purpose

Shell environment detection and process tree management. Detects the user's login shell (bash, zsh, etc.), resolves shell paths, and provides process tree kill functionality (`killTree`) with platform-specific handling (SIGTERM/SIGKILL on Unix, taskkill on Windows).

## Usage Status

| Product             | Status   | Notes                                                    |
| ------------------- | -------- | -------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Shell detection for PTY spawning and bash tool execution |
| Orbit CLI           | `active` | Shell detection for PTY spawning and bash tool execution |

## Key Files

| File       | Purpose                                                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `shell.ts` | `Shell` namespace -- `killTree()` for process group termination, login shell detection and path resolution, shell blacklist (fish, nu) |
