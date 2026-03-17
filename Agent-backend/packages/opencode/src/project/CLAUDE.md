# project

> **Path:** `Agent-backend/packages/opencode/src/project/`

## Purpose

Project detection, identity, and lifecycle management. Detects projects from git repositories (using root commit hash as stable ID), manages project metadata (name, icon, worktree, sandboxes) in the database, handles the global project fallback, and migrates sessions from global to project-specific storage when a project is first detected.

## Usage Status

| Product             | Status   | Notes                                                 |
| ------------------- | -------- | ----------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Project identity, workspace discovery, icon detection |
| Orbit CLI           | `active` | Project identity, workspace discovery, icon detection |

## Key Files

| File             | Purpose                                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `project.ts`     | `Project` namespace -- `fromDirectory()` git-based project detection, database CRUD, icon discovery, sandbox management, `initGit()`     |
| `instance.ts`    | `Instance` -- per-project runtime state container (directory, project info, worktree), provides `Instance.state()` for scoped singletons |
| `bootstrap.ts`   | `InstanceBootstrap` -- project initialization sequence (config, provider, LSP, formatter, file watcher, MCP, plugin)                     |
| `state.ts`       | Project state management utilities                                                                                                       |
| `vcs.ts`         | `Vcs` -- version control system operations (git branch, remote, commit info)                                                             |
| `project.sql.ts` | Drizzle schema for the `project` table                                                                                                   |
