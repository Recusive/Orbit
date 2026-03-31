# Orbit Roadmap

> **Last Updated:** March 30, 2026
> **Status:** Active

## Direction

Orbit is now a single-product desktop IDE with a Claude-powered agent workflow.

Current priorities:

1. Improve agent quality and desktop reliability.
2. Deepen browser, file, git, terminal, and review workflows inside the desktop app.
3. Keep the Rust/Tauri backend and Claude sidecar integration fast and stable.

## Near-Term Focus

### 1. Desktop Agent Quality

- faster first response latency
- stronger tool execution and recovery flows
- better review, rewind, and conversation continuity

### 2. Workspace Workflows

- worktree-aware navigation
- richer embedded browser tooling
- better file, diff, and terminal ergonomics

### 3. Reliability

- keep the app Claude-only unless a new backend is intentionally designed
- remove stale dual-backend assumptions from code and docs
- keep build, test, and release tooling aligned with the active product only

## Not On The Active Roadmap

- reviving OpenCode or `orbit-server`
- shipping a separate Orbit CLI product
- building a dedicated terminal app in the current roadmap window

Those ideas remain archival exploration only and are not part of the active implementation plan.
