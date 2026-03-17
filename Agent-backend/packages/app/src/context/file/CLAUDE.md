# file

> **Path:** `Agent-backend/packages/app/src/context/file/`

See parent CLAUDE.md at `packages/app/CLAUDE.md` for detailed documentation of this directory.

## Purpose

File context submodules for the file tree and editor. Manages file path resolution and normalization, tree store state, content caching with eviction, view cache for scroll/cursor positions, and a file system watcher that syncs changes from the backend.

## Usage Status

| Product             | Status      | Notes                                                                                             |
| ------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `reference` | Content eviction strategy and tree store patterns are useful references for Orbit's file explorer |
| Orbit CLI           | `reference` | Same                                                                                              |
