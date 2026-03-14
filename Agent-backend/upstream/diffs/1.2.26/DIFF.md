# OpenCode Upstream Diff: v1.2.24 → v1.2.26

> **Your fork:** v1.2.24 | **Upstream latest:** v1.2.26 (March 13, 2026)
> **Total:** 186 files changed, +9,882 / -2,190 lines
> **Upstream clone:** `Agent-backend/upstream/opencode-upstream/`
>
> To read any file at v1.2.26:
>
> ```bash
> cd Agent-backend/upstream/opencode-upstream
> git show v1.2.26:packages/opencode/<path>
> ```
>
> To get a specific file's diff:
>
> ```bash
> git diff v1.2.24..v1.2.26 -- packages/opencode/<path>
> ```

---

## How to Use This Document

Each section has a **PICK?** column. Mark items as:

- **YES** — bring into our fork
- **NO** — skip entirely
- **LATER** — revisit in a future pass
- **PARTIAL** — bring the concept but adapt to our codebase

---

## TABLE OF CONTENTS

1. [NEW FILES (24 files)](#1-new-files-24-files)
2. [MODIFIED FILES — By Theme](#2-modified-files-by-theme)
3. [DELETED FILES (2 files)](#3-deleted-files)
4. [RENAMED FILES (1 file)](#4-renamed-files)
5. [NEW TESTS (15+ files)](#5-new-tests)
6. [DB MIGRATIONS (3 new)](#6-db-migrations)
7. [CONFIG CHANGES](#7-config-changes)

---

## 1. NEW FILES (24 files)

### 1A. Account System (5 files) — Entirely new module

Cloud account management with OAuth device flow, org switching, and remote config fetching. Built entirely with Effect.ts.

| #   | File                         | What it does                                                                                                                                                                                                   | PICK? |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | `src/account/account.sql.ts` | Drizzle ORM tables: `AccountTable` (OAuth tokens, email, server URL), `AccountStateTable` (active account + org context), legacy `ControlAccountTable`                                                         |       |
| 2   | `src/account/schema.ts`      | Effect Schema branded types: `AccountID`, `OrgID`, `AccessToken`, `RefreshToken`, `DeviceCode`, `UserCode`. Domain models: `Account`, `Org`, `Login`. OAuth poll result union (6 tagged classes). Error types. |       |
| 3   | `src/account/repo.ts`        | Data access layer with Effect Layers. CRUD: `active()`, `list()`, `remove()`, `use()`, `persistToken()`, `persistAccount()`. Uses Drizzle transactions. Single-row `AccountStateTable` for active context.     |       |
| 4   | `src/account/service.ts`     | High-level service: token refresh via `/auth/device/token`, OAuth login flow (`login()` → `poll()`), org/config fetching with bearer tokens, HTTP retry (2x exponential backoff + jitter).                     |       |
| 5   | `src/account/index.ts`       | Public API: `Account.active()` (sync), `Account.config(accountID, orgID)` (async), `Account.token(accountID)` (async, auto-refreshes). Wraps Effect with `runSync`/`runPromise`.                               |       |

**Context:** This is their cloud account system (likely for opencode.ai hosted service). If you don't have a cloud offering, you probably don't need this.

---

### 1B. Auth Service — Effect refactor (1 file)

| #   | File                  | What it does                                                           | PICK? |
| --- | --------------------- | ---------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 6   | `src/auth/service.ts` | Generic credential storage as Effect service. Union type `Info = Oauth | Api   | WellKnown`. Reads/writes `~/.opencode/data/auth.json`. CRUD: `get()`, `all()`, `set()`, `remove()`. Normalizes keys (strips trailing slashes). |     |

**Context:** This replaces the old imperative auth storage with an Effect-based service. The old `auth/index.ts` now wraps this service. If you're using Effect, this is cleaner. If not, the old pattern still works.

---

### 1C. Provider Auth Service — Effect-based (1 file)

| #   | File                           | What it does                                                                                                                                                                                                                                               | PICK? |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 7   | `src/provider/auth-service.ts` | Effect service for provider OAuth + API key management. Loads plugin auth methods indexed by `ProviderID`. Tracks pending OAuth in memory. Methods: `methods()`, `authorize()`, `callback()`, `api()`. Uses `InstanceState` for per-instance plugin cache. |       |

**Context:** This is the Effect-ified version of what was previously in `provider/auth.ts`. The old file now delegates to this service via `runPromise()`.

---

### 1D. CLI Account Commands (2 files)

| #   | File                       | What it does                                                                                                                                                                                           | PICK? |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 8   | `src/cli/cmd/account.ts`   | yargs commands: `LoginCommand` (device OAuth flow), `LogoutCommand`, `SwitchCommand` (org picker), `OrgsCommand` (list accounts), `ConsoleCommand` (parent grouping). Uses clack prompts + Effect.gen. |       |
| 9   | `src/cli/effect/prompt.ts` | Effect wrappers around `@clack/prompts`: `intro()`, `outro()`, `log.info()`, `select()` (returns `Option<Value>`), `spinner()`.                                                                        |       |

**Context:** CLI commands for cloud account management. Only needed if you bring in the account system.

---

### 1E. Branded ID Schemas (9 files) — Type safety foundation

All follow the same pattern: `Schema.String.pipe(Schema.brand("XxxID"), withStatics({ make(), ascending/descending(), zod }))`. The `withStatics` helper attaches static factory methods to Effect schemas.

| #   | File                          | Branded Type                       | Statics                                                                                                                                                                            | PICK? |
| --- | ----------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 10  | `src/util/schema.ts`          | _(helper)_                         | `withStatics<S, M>(methods)` — HOF to attach statics to any Effect schema. **Foundation for ALL branded IDs.**                                                                     |       |
| 11  | `src/session/schema.ts`       | `SessionID`, `MessageID`, `PartID` | `.make()`, `.descending()` (SessionID), `.ascending()` (Message/Part), `.zod`                                                                                                      |       |
| 12  | `src/provider/schema.ts`      | `ProviderID`, `ModelID`            | `.make()`, `.zod`, well-known constants: `.anthropic`, `.openai`, `.google`, `.googleVertex`, `.githubCopilot`, `.amazonBedrock`, `.azure`, `.openrouter`, `.mistral`, `.opencode` |       |
| 13  | `src/control-plane/schema.ts` | `WorkspaceID`                      | `.make()`, `.ascending()`, `.zod`                                                                                                                                                  |       |
| 14  | `src/permission/schema.ts`    | `PermissionID`                     | `.make()`, `.ascending()`, `.zod`                                                                                                                                                  |       |
| 15  | `src/project/schema.ts`       | `ProjectID`                        | `.make()`, `.global` (returns "global"), `.zod`                                                                                                                                    |       |
| 16  | `src/pty/schema.ts`           | `PtyID`                            | `.make()`, `.ascending()`, `.zod`                                                                                                                                                  |       |
| 17  | `src/question/schema.ts`      | `QuestionID`                       | `.make()`, `.ascending()`, `.zod`                                                                                                                                                  |       |
| 18  | `src/tool/schema.ts`          | `ToolID`                           | `.make()`, `.ascending()`, `.zod`                                                                                                                                                  |       |

**Context:** These branded IDs ripple through ~25 modified files. If you adopt them, you'll need to update every file that creates/passes IDs. If you skip them, the modified files with BRANDED_ID changes can be ignored too. It's all-or-nothing for the typing benefits.

---

### 1F. Effect Utilities (4 files)

| #   | File                             | What it does                                                                                                                                                                                       | PICK? |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 19  | `src/effect/runtime.ts`          | Singleton `ManagedRuntime` merging `AccountService.defaultLayer` + `AuthService.defaultLayer`. Used globally for running all Effects.                                                              |       |
| 20  | `src/util/effect-http-client.ts` | HTTP client with transient error retry: 2x exponential backoff (200ms base) + jitter. Wraps Effect `HttpClient`.                                                                                   |       |
| 21  | `src/util/effect-zod.ts`         | AST-based converter from Effect Schema → Zod. Walks schema AST recursively (String, Number, Boolean, Literal, Union, Objects, Arrays). Enables branded types to expose `.zod` for Hono validators. |       |
| 22  | `src/util/instance-state.ts`     | Scoped cache for per-instance state (plugins, config). `get/has/invalidate/dispose()`. Auto-cleanup on scope exit. Used by provider auth for plugin caching.                                       |       |

**Context:** These are foundational for the Effect migration. `effect-zod.ts` is particularly important — it's the bridge that lets Effect schemas work with Zod validators in HTTP routes. `instance-state.ts` replaces ad-hoc caching patterns.

---

### 1G. Standalone Utilities (2 files)

| #   | File                    | What it does                                                                                                                                                                                                                                                                | PICK? |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 23  | `src/util/data-url.ts`  | `decodeDataUrl(url)` — parses `data:[type];[encoding],<body>`. Handles base64 and URL-encoded. Returns decoded string. 9 lines.                                                                                                                                             |       |
| 24  | `src/file/protected.ts` | Platform-specific protected paths that should never be watched/scanned. macOS: Music, Pictures, Movies, Downloads, Desktop, Documents, iCloud, TCC paths (Safari, Mail, AddressBook). Windows: AppData, OneDrive, Downloads. Prevents TCC permission prompts + perf issues. |       |

**Context:** `data-url.ts` is used by `session/prompt.ts` for text attachments. `file/protected.ts` is a good defensive addition for file watchers.

---

## 2. MODIFIED FILES — By Theme

### 2A. Bun Removal (12 files) — Replacing `$\`...\``with portable`Process.run()`

They're decoupling from Bun's shell syntax (`import { $ } from "bun"`) and using Node-compatible APIs instead. Also changed `pathToFileURL` from `bun` to `url` module.

| #   | File                           | What changed                                                                                                                                                       | Impact                               | PICK? |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ----- |
| 1   | `src/util/process.ts`          | Removed `import { $ } from "bun"`. All git/shell calls → `Process.run()` / `Process.text()`. Added `TextResult` interface, `lines()` helper, `windowsHide` option. | **HIGH** — Central process execution |       |
| 2   | `src/snapshot/index.ts`        | Removed Bun `$` syntax. All git snapshot commands → `Process.run()` / `Process.text()`. Added `args()` helper for git command building. ~100 net lines changed.    | **HIGH** — Snapshot system           |       |
| 3   | `src/worktree/index.ts`        | Removed `$` syntax. Git worktree commands → `git()` wrapper / `Process.run()`. Added `ProjectID` branded type to `runStartScripts`.                                | **HIGH** — Worktree system           |       |
| 4   | `src/tool/bash.ts`             | Removed `import { $ } from "bun"`. Replaced with `fs.realpath()` + native Node APIs. Added `windowsHide: process.platform === "win32"`.                            | **MEDIUM** — Bash tool               |       |
| 5   | `src/cli/cmd/github.ts`        | Removed `$` syntax. Added `gitText`, `gitRun`, `gitStatus`, `commitChanges` helpers. Error handling `$.ShellError` → `Process.RunFailedError`.                     | **HIGH** — GitHub integration        |       |
| 6   | `src/cli/cmd/pr.ts`            | Removed `$` syntax → `Process.run()` / `Process.text()`. `.exitCode` → `.code`, `.text()` → `.text`.                                                               | **MEDIUM**                           |       |
| 7   | `src/cli/cmd/uninstall.ts`     | Removed `$` syntax → `Process.run()`. `.exitCode` → `.code`.                                                                                                       | **MEDIUM**                           |       |
| 8   | `src/cli/cmd/run.ts`           | `pathToFileURL` from `bun` → `url` module. `Server.App()` → `Server.Default()`.                                                                                    | **LOW**                              |       |
| 9   | `src/cli/cmd/tui/clipboard.ts` | Removed `$` syntax → `Process.run()`. Added `fs.rm()` instead of shell `rm`.                                                                                       | **HIGH** — Clipboard                 |       |
| 10  | `src/cli/cmd/tui/worker.ts`    | `Server.App()` → `Server.Default()`.                                                                                                                               | **LOW**                              |       |
| 11  | `src/bun/index.ts`             | Bun-specific cleanup                                                                                                                                               | **LOW**                              |       |
| 12  | `src/bun/registry.ts`          | `Process.text()` for registry reads. `stdout`/`stderr` read before `await proc.exited`.                                                                            | **MEDIUM**                           |       |

**Context:** If you're still running on Bun (which you are), these changes aren't strictly necessary. But they make the code more portable and remove dependency on Bun's non-standard shell API.

---

### 2B. Effect.ts Migration (8 files) — Auth/provider services to Effect pattern

| #   | File                        | What changed                                                                                                                                                                                               | Impact                                     | PICK? |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----- |
| 1   | `src/auth/index.ts`         | Now wraps `AuthService` (Effect) via `runPromise()`. All functions delegate to service. Exports `OAUTH_DUMMY_KEY`.                                                                                         | **HIGH** — Auth API surface                |       |
| 2   | `src/provider/auth.ts`      | Gutted ~90 lines of imperative state management. Now delegates to `ProviderAuthService` (Effect) via `runPromise()`. All error types via `export import`.                                                  | **HIGH** — Provider auth API               |       |
| 3   | `src/provider/provider.ts`  | Added `DEFAULT_CHUNK_TIMEOUT` (120s). `wrapSSE()` for SSE read timeouts with AbortController. `shouldUseCopilotResponsesApi()` excludes gpt-5-mini. Branded ID types for provider/model params.            | **MEDIUM** — SSE timeout is a good bug fix |       |
| 4   | `src/server/server.ts`      | `App` singleton → `createApp(opts: { cors?: string[] })` factory. `Default = lazy(() => createApp({}))`. Workspace ID parsing now uses `WorkspaceID.make()`. Major re-indentation. ~450 net lines changed. | **HIGH** — Server initialization           |       |
| 5   | `src/config/config.ts`      | 64 lines changed — likely Effect integration for config loading                                                                                                                                            | **MEDIUM**                                 |       |
| 6   | `src/index.ts`              | 6 lines — updated exports for new modules                                                                                                                                                                  | **LOW**                                    |       |
| 7   | `src/installation/index.ts` | 118 lines changed — installation flow updates, likely Effect/branded types                                                                                                                                 | **MEDIUM**                                 |       |
| 8   | `src/share/share-next.ts`   | 102 lines changed — share API updates, auth header logic, endpoint path changes (`/api/share/` → `/api/shares/`)                                                                                           | **MEDIUM**                                 |       |

---

### 2C. Branded ID Adoption (25+ files) — `Identifier.schema()` → typed IDs

These are the ripple effects of the branded ID schemas. Each file replaces raw `Identifier.ascending("prefix")` calls with typed equivalents like `SessionID.descending()`, `MessageID.ascending()`, etc.

| #   | File                         | Impact     | Notes                                                                                                      | PICK? |
| --- | ---------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- | ----- |
| 1   | `src/session/index.ts`       | **HIGH**   | 100+ replacements. Added `workspaceID` param to `createNext()`. Fork preserves workspace context.          |       |
| 2   | `src/session/message-v2.ts`  | **MEDIUM** | 10+ replacements. Added `ModelID`, `ProviderID` to type annotations. New DB imports for pagination.        |       |
| 3   | `src/session/prompt.ts`      | **HIGH**   | Message/part ID generation now typed. Skills system integrated into system prompt. `decodeDataUrl` import. |       |
| 4   | `src/session/session.sql.ts` | **MEDIUM** | Schema column types updated for branded IDs                                                                |       |
| 5   | `src/session/compaction.ts`  | **MEDIUM** | Branded ID updates                                                                                         |       |
| 6   | `src/session/message.ts`     | **LOW**    | Minor                                                                                                      |       |
| 7   | `src/session/processor.ts`   | **LOW**    | Minor                                                                                                      |       |
| 8   | `src/session/revert.ts`      | **LOW**    | Minor                                                                                                      |       |
| 9   | `src/session/status.ts`      | **LOW**    | Minor                                                                                                      |       |
| 10  | `src/session/summary.ts`     | **LOW**    | Minor                                                                                                      |       |
| 11  | `src/session/todo.ts`        | **LOW**    | Minor                                                                                                      |       |
| 12  | `src/permission/index.ts`    | **LOW**    | Minor                                                                                                      |       |
| 13  | `src/permission/next.ts`     | **LOW**    | Minor                                                                                                      |       |
| 14  | `src/tool/registry.ts`       | **MEDIUM** | `tools()` now takes branded `ProviderID` + `ModelID`. Provider check uses `ProviderID.opencode` constant.  |       |
| 15  | `src/tool/bash.ts`           | **LOW**    | Minor                                                                                                      |       |
| 16  | `src/tool/batch.ts`          | **LOW**    | Minor                                                                                                      |       |
| 17  | `src/tool/plan.ts`           | **LOW**    | Minor                                                                                                      |       |
| 18  | `src/tool/task.ts`           | **LOW**    | Minor                                                                                                      |       |
| 19  | `src/tool/tool.ts`           | **LOW**    | Minor                                                                                                      |       |
| 20  | `src/tool/truncation.ts`     | **LOW**    | Minor                                                                                                      |       |
| 21  | `src/question/index.ts`      | **MEDIUM** | 62 lines changed                                                                                           |       |
| 22  | `src/pty/index.ts`           | **LOW**    | Minor                                                                                                      |       |
| 23  | `src/project/project.sql.ts` | **LOW**    | Minor                                                                                                      |       |
| 24  | `src/storage/db.ts`          | **LOW**    | Minor                                                                                                      |       |
| 25  | `src/storage/schema.ts`      | **LOW**    | Minor                                                                                                      |       |
| 26  | `src/storage/storage.ts`     | **LOW**    | Minor                                                                                                      |       |

---

### 2D. Bug Fixes (standalone, not tied to refactors)

| #   | File                                       | Bug Fixed                                                                                                        | Impact     | PICK? |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------- | ----- |
| 1   | `src/provider/provider.ts`                 | SSE streams now timeout on read stalls (120s default) via `wrapSSE()` + AbortController. Prevents hung sessions. | **MEDIUM** |       |
| 2   | `src/provider/provider.ts`                 | `shouldUseCopilotResponsesApi()` now excludes `gpt-5-mini` (uses completions endpoint instead).                  | **LOW**    |       |
| 3   | `src/cli/cmd/import.ts`                    | Share API path: `/api/share/` → `/api/shares/`. Auth headers conditional. Schema parsing updated.                | **MEDIUM** |       |
| 4   | `src/cli/cmd/tui/routes/home.tsx`          | `--prompt` auto-submit now waits for model store ready (was firing before models loaded).                        | **MEDIUM** |       |
| 5   | `src/cli/cmd/tui/routes/session/index.tsx` | Share/unshare error messages now show actual error instead of generic "Failed to share session".                 | **LOW**    |       |
| 6   | `src/mcp/oauth-provider.ts`                | OAuth auto-connect fix on first MCP connection.                                                                  | **LOW**    |       |
| 7   | `src/lsp/server.ts`                        | Multiple jdtls LSPs eating memory in Java monorepos — fix for duplicate LSP instances. 145+ lines changed.       | **MEDIUM** |       |
| 8   | `src/project/instance.ts`                  | Resolve symlinks in Instance cache to prevent duplicate contexts.                                                | **LOW**    |       |

---

### 2E. Features (new behavior, not refactors)

| #   | File                                         | Feature                                                                                   | Impact     | PICK? |
| --- | -------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------- | ----- |
| 1   | `src/session/prompt.ts`                      | Skills system integrated into system prompt via `SystemPrompt.skills(agent)`.             | **MEDIUM** |       |
| 2   | `src/session/system.ts`                      | 18 lines added — system prompt helpers for skills presentation.                           | **MEDIUM** |       |
| 3   | `src/skill/skill.ts`                         | 29 lines added — skills system improvements (presentation adjustments).                   | **LOW**    |       |
| 4   | `src/tool/skill.ts`                          | 28 lines — skills tool integration updates.                                               | **LOW**    |       |
| 5   | `src/file/protected.ts`                      | **(NEW)** macOS TCC + Windows protected paths. Prevents permission prompts + perf issues. | **MEDIUM** |       |
| 6   | `src/server/routes/session.ts`               | 117 lines — session pagination support for improved server performance.                   | **MEDIUM** |       |
| 7   | `src/cli/cmd/tui/component/prompt/index.tsx` | Workspace support: `workspaceID` prop, session creation with workspace context.           | **LOW**    |       |
| 8   | `src/acp/agent.ts`                           | 59 lines changed — ACP agent updates (likely snapshot re-enable).                         | **LOW**    |       |
| 9   | `src/snapshot/index.ts`                      | Snapshot refactored + re-enabled in ACP.                                                  | **MEDIUM** |       |

---

### 2F. Refactors (internal cleanup, no behavior change)

| #   | File                                        | What                                                                                               | PICK? |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----- |
| 1   | `src/provider/error.ts`                     | Removed GitHub Copilot 403 error transformation. Simplified.                                       |       |
| 2   | `src/provider/transform.ts`                 | Minor refactor (64 lines).                                                                         |       |
| 3   | `src/cli/cmd/providers.ts`                  | Renamed from `auth.ts`. Command `auth` → `providers` (alias kept). Provider priority reordered.    |       |
| 4   | `src/cli/cmd/tui/app.tsx`                   | Removed OpenRouter warning. Flag rename `EXPERIMENTAL_WORKSPACES_TUI` → `EXPERIMENTAL_WORKSPACES`. |       |
| 5   | `src/cli/cmd/tui/routes/session/header.tsx` | Same flag rename.                                                                                  |       |
| 6   | `src/command/index.ts`                      | 5 lines — command registration updates.                                                            |       |
| 7   | `src/flag/flag.ts`                          | 4 lines — flag definition updates.                                                                 |       |
| 8   | `src/plugin/codex.ts`                       | 5 lines — minor.                                                                                   |       |
| 9   | `src/plugin/index.ts`                       | 12 lines — plugin server URL getter restored.                                                      |       |
| 10  | `src/shell/shell.ts`                        | 5 lines — minor.                                                                                   |       |
| 11  | `src/project/vcs.ts`                        | 16 lines — VCS updates.                                                                            |       |
| 12  | `src/project/project.ts`                    | 160 lines — project management updates (likely workspace/state migration).                         |       |

---

## 3. DELETED FILES

| #   | File                         | What it was                                                                | Why deleted                                                          | PICK? |
| --- | ---------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----- |
| 1   | `src/control/control.sql.ts` | Drizzle table `ControlAccountTable` (email, url, tokens).                  | Replaced by `account/account.sql.ts` (which includes legacy compat). |       |
| 2   | `src/control/index.ts`       | `Control.account()` and `Control.token()` methods for OAuth token refresh. | Replaced by `account/service.ts` Effect-based service.               |       |

---

## 4. RENAMED FILES

| #   | Old Path              | New Path                   | What changed                                                                                                                                                                       | PICK? |
| --- | --------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | `src/cli/cmd/auth.ts` | `src/cli/cmd/providers.ts` | Command `auth` → `providers` (backward alias kept). Handlers renamed. Provider priority: anthropic moved from rank 1→4, openai stays 1. Hint: "Claude Max or API key" → "API key". |       |

---

## 5. NEW TESTS

| #   | File                                       | Tests for                              | PICK? |
| --- | ------------------------------------------ | -------------------------------------- | ----- |
| 1   | `test/account/repo.test.ts`                | Account repository CRUD (338 lines)    |       |
| 2   | `test/account/service.test.ts`             | Account service OAuth flow (224 lines) |       |
| 3   | `test/mcp/oauth-auto-connect.test.ts`      | MCP OAuth auto-connect fix (199 lines) |       |
| 4   | `test/project/migrate-global.test.ts`      | Global project migration (140 lines)   |       |
| 5   | `test/project/state.test.ts`               | Project state management (115 lines)   |       |
| 6   | `test/server/session-messages.test.ts`     | Session message pagination (119 lines) |       |
| 7   | `test/session/messages-pagination.test.ts` | Message pagination queries (115 lines) |       |
| 8   | `test/share/share-next.test.ts`            | Share-next API updates (76 lines)      |       |
| 9   | `test/util/data-url.test.ts`               | Data URL decoding (14 lines)           |       |
| 10  | `test/util/effect-zod.test.ts`             | Effect→Zod conversion (61 lines)       |       |
| 11  | `test/util/filesystem.test.ts`             | Filesystem utilities (52 lines)        |       |
| 12  | `test/util/instance-state.test.ts`         | Instance state caching (139 lines)     |       |
| 13  | `test/util/module.test.ts`                 | Module utilities (59 lines)            |       |
| 14  | `test/provider/auth.test.ts`               | Provider auth (20 lines added)         |       |

---

## 6. DB MIGRATIONS

| #   | Migration                                          | What                                        | PICK? |
| --- | -------------------------------------------------- | ------------------------------------------- | ----- |
| 1   | `drizzle/20260228203230_blue_harpoon/`             | Initial migration for account system tables |       |
| 2   | `drizzle/20260309230000_move_org_to_state/`        | Move org tracking to AccountStateTable      |       |
| 3   | `drizzle/20260313153000_add_workspace_to_session/` | Add workspace column to sessions table      |       |

---

## 7. CONFIG CHANGES

| #   | File              | What changed                                                           | PICK? |
| --- | ----------------- | ---------------------------------------------------------------------- | ----- |
| 1   | `package.json`    | 11 lines: likely new deps (Effect, semver), version bump 1.2.24→1.2.26 |       |
| 2   | `tsconfig.json`   | 9 lines: compiler option updates                                       |       |
| 3   | `script/build.ts` | 5 lines: build script adjustments (removed sourcemaps?)                |       |
| 4   | `AGENTS.md`       | 34 lines: new file — AI agent instructions for the OpenCode codebase   |       |

---

## DECISION MATRIX — Quick Reference

| Theme                  | Files                        | Effort     | Dependencies                                    | Recommendation                                         |
| ---------------------- | ---------------------------- | ---------- | ----------------------------------------------- | ------------------------------------------------------ |
| **Bun Removal**        | 12                           | Medium     | `Process.run()` API in `util/process.ts`        | Good for portability, but you're on Bun                |
| **Branded IDs**        | 9 new + 25 modified          | High       | `util/schema.ts` + `effect-zod.ts` + Effect dep | All-or-nothing. Major typing refactor.                 |
| **Effect Migration**   | 8 new + 8 modified           | High       | Effect library + branded IDs                    | Architectural shift. Big commitment.                   |
| **Account System**     | 5 new + 2 CLI + 3 migrations | Medium     | Effect + branded IDs                            | Cloud-specific. Skip unless you have a cloud offering. |
| **Bug Fixes**          | 8 files                      | Low        | Standalone                                      | Cherry-pick individually. SSE timeout is valuable.     |
| **Features**           | 9 files                      | Low-Medium | Some need branded IDs                           | Skills integration + file protection are standalone.   |
| **File Protection**    | 1 new file                   | Low        | None                                            | Easy win. Prevents TCC prompts on macOS.               |
| **LSP Memory Fix**     | 1 file                       | Low        | None                                            | Easy win for Java users.                               |
| **Session Pagination** | 2 files                      | Medium     | Branded IDs                                     | Good for perf but tied to type refactor.               |

---

## RECOMMENDED QUICK WINS (no dependency chain)

1. **`src/file/protected.ts`** — Drop-in. Prevents macOS TCC permission prompts.
2. **SSE timeout in `src/provider/provider.ts`** — `wrapSSE()` + `DEFAULT_CHUNK_TIMEOUT`. Prevents hung sessions.
3. **`src/util/data-url.ts`** — 9-line utility, used by prompt system for text attachments.
4. **LSP memory fix in `src/lsp/server.ts`** — Prevents duplicate jdtls instances in Java monorepos.
5. **Symlink resolution in `src/project/instance.ts`** — Prevents duplicate Instance contexts.
6. **MCP OAuth auto-connect fix in `src/mcp/oauth-provider.ts`** — Small fix.
