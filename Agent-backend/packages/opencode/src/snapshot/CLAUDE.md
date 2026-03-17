# snapshot

> **Path:** `Agent-backend/packages/opencode/src/snapshot/`

## Purpose

Git-based file snapshot system for session revert (undo). Creates lightweight git commits in a separate `.opencode` git directory to track file state before and after agent operations. Supports periodic garbage collection and can restore files to any previous snapshot point.

## Usage Status

| Product             | Status   | Notes                                             |
| ------------------- | -------- | ------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | File state tracking for revert/undo functionality |
| Orbit CLI           | `active` | File state tracking for revert/undo functionality |

## Key Files

| File       | Purpose                                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts` | `Snapshot` namespace -- `track()` creates git snapshots, `cleanup()` runs periodic GC, `restore()` reverts files to a snapshot, scheduler integration |
