# global

> **Path:** `Agent-backend/packages/opencode/src/global/`

## Purpose

Global filesystem paths following XDG Base Directory Specification. Defines and creates the standard data, cache, config, state, bin, and log directories for the `orbit` application. Also handles cache versioning -- bumping `CACHE_VERSION` clears stale caches on upgrade.

## Usage Status

| Product             | Status   | Notes                                                                                 |
| ------------------- | -------- | ------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Provides `Global.Path.*` used by database, storage, logging, LSP, and skill discovery |
| Orbit CLI           | `active` | Provides `Global.Path.*` used by database, storage, logging, LSP, and skill discovery |

## Key Files

| File       | Purpose                                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts` | `Global` namespace -- XDG-based path constants (data, cache, config, state, bin, log), directory creation, cache version management |
