# global-sync

> **Path:** `Agent-backend/packages/app/src/context/global-sync/`

See parent CLAUDE.md at `packages/app/CLAUDE.md` for detailed documentation of this directory.

## Purpose

Global SSE sync submodules for real-time state synchronization between the OpenCode server and the web UI. Handles bootstrap (initial state load), child store management, event reduction (processing SSE events into state updates), eviction of stale data, session caching/trimming, and an ordered event queue.

## Usage Status

| Product             | Status      | Notes                                                                                                                                             |
| ------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `reference` | The event reducer pattern (SSE events to state updates) and session cache/trim logic are directly relevant to Orbit's SSE-based sync architecture |
| Orbit CLI           | `reference` | Same                                                                                                                                              |
