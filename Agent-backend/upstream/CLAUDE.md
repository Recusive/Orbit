# upstream/ — OpenCode Upstream Sync Workspace

This directory manages the process of syncing upstream OpenCode changes into the Orbit fork.

## What's Here

| Path                        | Tracked?       | Purpose                                                  |
| --------------------------- | -------------- | -------------------------------------------------------- |
| `UPSTREAM-SYNC-PROCESS.md`  | Yes            | Step-by-step guide for future syncs. Start here.         |
| `diffs/<version>/DIFF.md`   | Yes            | Per-sync diff analysis with PICK decisions               |
| `plans/<version>/`          | Yes            | Per-phase implementation plans                           |
| `repo/`                     | **Gitignored** | All upstream repo data (clone + reference snapshots)     |
| `repo/clone/`               | **Gitignored** | Full git clone of `github.com/sst/opencode` for diffing  |
| `repo/reference/<version>/` | **Gitignored** | IDE-browsable snapshots of upstream packages per version |

## Current State

- **Fork version:** v1.2.26 (`Agent-backend/packages/opencode/`)
- **Last synced from:** v1.2.24
- **Status:** Sync complete. All phases executed and verified.
- **Sync session:** `claude --resume 09fd32d9-4702-4035-a617-5a336e5c60ca`

## Quick Commands

```bash
# Check upstream for new releases
cd upstream/repo/clone && git fetch origin --tags
gh api repos/sst/opencode/releases/latest --jq '.tag_name'

# Diff any two versions (run from opencode-upstream/)
git diff v1.2.24..v1.2.26 --stat -- packages/opencode/

# Read a file at a specific version
git show v1.2.26:packages/opencode/src/<path>

# Get a specific file's diff
git diff v1.2.24..v1.2.26 -- packages/opencode/src/<path>
```

## Plans (Execution Order)

All plans for this sync live in `plans/1.2.26/`. **All phases complete.**

| Phase | File                                    | What                                                    | Status  |
| ----- | --------------------------------------- | ------------------------------------------------------- | ------- |
| 0     | `00-effect-dependency.md`               | Add `effect@4.0.0-beta.31`                              | Done    |
| 1     | `01-branded-id-foundation.md`           | 10 new schema files, 11 branded ID types                | Done    |
| 2     | `02-branded-id-adoption.md`             | Update 25+ files to use branded IDs                     | Done    |
| 3     | `03-effect-services.md`                 | Auth + provider → Effect service layer                  | Done    |
| 4     | `04-account-system.md`                  | Account module + delete control/ + migrations           | Done    |
| 5     | `05-bug-fixes-and-features.md`          | 15 standalone fixes (SSE timeout, LSP, etc.)            | Done    |
| 5B    | `05b-tui-and-cli-changes.md`            | TUI workspace, bug fixes, provider hints                | Done    |
| 6     | `06-bun-removal.md`                     | Replace `$` shell syntax → `Process.run()`              | Done    |
| 7     | `07-remaining-refactors.md`             | Server factory, CLI rename, misc                        | Done    |
| 8     | `08-rename-opencode-to-orbit.md`        | 212 user-facing renames across 58 files                 | Done    |
| 9     | `09-desktop-app-integration.md`         | SDK regen, frontend adapters, Tauri sidecar             | Done    |
| 10    | `10-tests-and-migrations.md`            | 14 new tests, 36 modified, 3 DB migrations              | Done    |
| 11    | `11-shared-packages.md`                 | Plugin SDK ESM fix + util/module.ts                     | Done    |
| 12    | `12-package-import-rewrite.md`          | `@opencode-ai/*` → `@orbit.build/*` in all copied files | Done    |
| —     | `11-feature-ideas-from-upstream-app.md` | Reference: features to port from their app (pick list)  | Backlog |

## Rules

- **Never modify `repo/clone/`** — it's a read-only reference clone
- **Never modify `repo/reference/`** — these are frozen snapshots for study
- **Plans are the source of truth** — read the plan before executing a phase
- **One commit per phase** — makes bisecting easy if something breaks
- **Always diff the FULL repo** — not just `packages/opencode/src/` (lesson from v1.2.24→v1.2.26 sync)

## Key Decisions (v1.2.24 → v1.2.26)

| Decision       | Choice                | Why                                                       |
| -------------- | --------------------- | --------------------------------------------------------- |
| Effect.ts      | **Adopt**             | Upstream is committed; divergence cost grows each release |
| Branded IDs    | **Full adoption**     | Type safety for SessionID, MessageID, ProviderID, etc.    |
| Account system | **Bring it**          | Effect runtime depends on AccountService.defaultLayer     |
| Bun removal    | **Yes, all 12 files** | Portability; upstream won't go back                       |
| Rename scope   | **User-facing only**  | 212 occurrences; env vars deferred for backward compat    |
