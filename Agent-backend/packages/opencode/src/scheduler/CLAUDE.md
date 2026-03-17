# scheduler

> **Path:** `Agent-backend/packages/opencode/src/scheduler/`

## Purpose

Simple interval-based task scheduler. Registers recurring tasks with configurable intervals at either instance scope (cleaned up when instance is destroyed) or global scope (shared across instances). Used for periodic maintenance like snapshot cleanup and auto-updates.

## Usage Status

| Product             | Status   | Notes                                                            |
| ------------------- | -------- | ---------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Snapshot cleanup, periodic maintenance tasks                     |
| Orbit CLI           | `active` | Snapshot cleanup, auto-update checks, periodic maintenance tasks |

## Key Files

| File       | Purpose                                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts` | `Scheduler` namespace -- `register()` for interval-based tasks with instance/global scope, automatic cleanup on instance teardown |
