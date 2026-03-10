# env

> **Path:** `Agent-backend/packages/opencode/src/env/`

## Purpose

Instance-scoped environment variable management. Provides isolated per-instance environment state so parallel test runs and multi-workspace scenarios do not interfere with each other's env vars.

## Usage Status

| Product             | Status   | Notes                                             |
| ------------------- | -------- | ------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Environment variable access throughout the engine |
| Orbit CLI           | `active` | Environment variable access throughout the engine |

## Key Files

| File       | Purpose                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| `index.ts` | `Env` namespace with `get()`, `set()`, `remove()`, `all()` backed by `Instance.state()` for per-instance isolation |
