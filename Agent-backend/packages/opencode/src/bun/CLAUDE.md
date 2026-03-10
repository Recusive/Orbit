# bun

> **Path:** `Agent-backend/packages/opencode/src/bun/`

## Purpose

Bun process runner and package installer. Provides functions to spawn Bun subprocesses and install npm packages into the global cache directory with version tracking, outdated detection, and lock-based concurrency control.

## Usage Status

| Product             | Status   | Notes                                                          |
| ------------------- | -------- | -------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Used to install MCP servers and plugin dependencies at runtime |
| Orbit CLI           | `active` | Same runtime package installation for plugins and MCP          |

## Key Files

- `index.ts` — `BunProc` namespace with `run()` (spawn Bun subprocess), `which()` (returns Bun executable path), `install()` (install npm package into global cache with lock, version tracking, and outdated checks)
- `registry.ts` — `PackageRegistry` namespace with `info()` (query package metadata via `bun info`) and `isOutdated()` (semver comparison against latest registry version)
