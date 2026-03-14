# Phase 5: Bug Fixes and Standalone Features

## Summary

All standalone bug fixes, new features, and refactors from v1.2.24 to v1.2.26 that do NOT depend on the Effect system (Phase 0) or the Account system (Phase 4). These can be ported independently and in any order.

**Total: ~15 distinct changes across ~30 files.**

---

## Table of Contents

1. [SSE Chunk Timeout](#1-sse-chunk-timeout)
2. [Branded ID Types (Effect-based)](#2-branded-id-types)
3. [File Protection (macOS TCC)](#3-file-protection-macos-tcc)
4. [LSP Server Refactor](#4-lsp-server-refactor)
5. [MCP OAuth State Fix](#5-mcp-oauth-state-fix)
6. [Skills in System Prompt](#6-skills-in-system-prompt)
7. [Session Message Pagination](#7-session-message-pagination)
8. [Bun Shell ($) Removal](#8-bun-shell-removal)
9. [Data URL Utility](#9-data-url-utility)
10. [Instance State (Effect-based)](#10-instance-state)
11. [Process Utility Enhancements](#11-process-utility-enhancements)
12. [ACP Branded IDs](#12-acp-branded-ids)
13. [Symlink / Instance Reload Fix](#13-symlink-instance-reload-fix)
14. [Workspace Root in System Prompt](#14-workspace-root-in-system-prompt)
15. [Ripgrep Glob Quoting Fix](#15-ripgrep-glob-quoting-fix)

---

## 1. SSE Chunk Timeout

### What it fixes

Prevents hung streaming connections. If an LLM provider stops sending SSE chunks mid-stream (network issue, server hang), the request now aborts after a configurable timeout instead of hanging forever.

### Current state in our fork

No chunk timeout exists. Only a per-request `timeout` config (full request timeout).

### Upstream change

- New `DEFAULT_CHUNK_TIMEOUT = 120_000` (2 minutes) constant
- New `wrapSSE(res, ms, ctl)` function: wraps the SSE `ReadableStream` with a per-chunk timer. If no chunk arrives within `ms`, fires `AbortController.abort()` and cancels the reader.
- Provider `fetch` wrapper now creates a `chunkAbortCtl` and combines it with the existing request-level `AbortSignal` via `AbortSignal.any()`
- New `chunkTimeout` config field on provider options (set in `config.ts`)

### Files changed

| File                       | Change                                                         |
| -------------------------- | -------------------------------------------------------------- |
| `src/provider/provider.ts` | Add `wrapSSE`, `DEFAULT_CHUNK_TIMEOUT`, modify `fetch` wrapper |
| `src/config/config.ts`     | Add `chunkTimeout` to provider config schema                   |

### Rename needed

None.

### Desktop app impact

None -- provider config is server-side only. Frontend doesn't need to know about chunk timeouts.

### Depends on

Nothing. Fully independent.

---

## 2. Branded ID Types

### What it adds

Type-safe branded IDs for sessions, messages, parts, providers, and models using Effect `Schema.brand()`. Replaces raw `z.string()` validators in route handlers, message schemas, and bus events with `SessionID.zod`, `MessageID.zod`, `ProviderID.zod`, `ModelID.zod`, `PartID.zod`.

### Current state in our fork

All IDs are plain `string` everywhere.

### Upstream change

Two new schema files:

**`src/session/schema.ts`** (new):

- `SessionID` -- branded string with `descending()` factory, Zod bridge via `Identifier.schema("session")`
- `MessageID` -- branded string with `ascending()` factory
- `PartID` -- branded string with `ascending()` factory

**`src/provider/schema.ts`** (new):

- `ProviderID` -- branded string with well-known constants (`ProviderID.anthropic`, `ProviderID.openai`, `ProviderID.amazonBedrock`, etc.)
- `ModelID` -- branded string

Both depend on `src/util/schema.ts` (`withStatics` helper) which is in Phase 4.

### Files changed (wide ripple)

| File                           | Change                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `src/session/schema.ts`        | **New file**                                                                                         |
| `src/provider/schema.ts`       | **New file**                                                                                         |
| `src/session/message-v2.ts`    | Replace all `z.string()` IDs with branded types                                                      |
| `src/server/routes/session.ts` | Replace all `z.string()` param validators with branded types                                         |
| `src/provider/provider.ts`     | `getProvider`, `getModel`, `closest`, `getSmallModel`, `parseModel`, error schemas use branded types |
| `src/acp/agent.ts`             | Uses `ProviderID.make()` and `ModelID.make()` casts                                                  |
| `src/session/index.ts`         | Session creation/lookup uses `SessionID`                                                             |
| `src/session/session.sql.ts`   | May use branded types in schema                                                                      |
| `src/permission/schema.ts`     | `PermissionID` branded type                                                                          |

### Rename needed

| Location                 | Upstream                       | Our version                                        |
| ------------------------ | ------------------------------ | -------------------------------------------------- |
| `src/provider/schema.ts` | `ProviderID.opencode` constant | Change to `ProviderID.orbit` (or remove if unused) |

### Desktop app impact

**Medium.** The SDK client types change -- IDs that were `string` become branded strings. The generated SDK (`packages/sdk/js/`) will need regeneration. Our frontend adapter layer casts strings freely, so runtime impact is nil, but TypeScript types will shift.

### Depends on

Phase 4's `src/util/schema.ts` (the `withStatics` helper). Can be ported together or `withStatics` can be extracted as a standalone prerequisite.

---

## 3. File Protection (macOS TCC)

### What it adds

Prevents the file watcher and directory scanner from accessing macOS protected directories that trigger TCC (Transparency, Consent, and Control) permission prompts (e.g., Desktop, Documents, Downloads, Photos, Library subdirectories).

### Current state in our fork

Simple hardcoded check: skips `Library` on macOS and `AppData` on Windows.

### Upstream change

**`src/file/protected.ts`** (new file):

- `Protected.names()` -- returns `Set<string>` of directory basenames to skip (Music, Pictures, Movies, Downloads, Desktop, Documents, Public, Applications, Library on macOS; AppData, Downloads, etc. on Windows)
- `Protected.paths()` -- returns absolute paths including Library subdirectories (AddressBook, Calendars, Mail, Messages, Safari, TCC db, etc.) and root paths (`/.DocumentRevisions-V100`, `/.Spotlight-V100`, etc.)

**`src/file/index.ts`**:

- Replaces hardcoded `ignore` set with `Protected.names()`

**`src/file/watcher.ts`**:

- Adds `...Protected.paths()` to the watcher ignore list

### Files changed

| File                    | Change                                           |
| ----------------------- | ------------------------------------------------ |
| `src/file/protected.ts` | **New file**                                     |
| `src/file/index.ts`     | Use `Protected.names()` instead of hardcoded set |
| `src/file/watcher.ts`   | Add `Protected.paths()` to watcher ignore list   |

### Rename needed

None.

### Desktop app impact

**Positive.** Eliminates macOS TCC permission popups that users may encounter when opening the Orbit agent in their home directory. This is especially important for macOS 15+ where TCC prompts became more aggressive.

### Depends on

Nothing. Fully independent.

---

## 4. LSP Server Refactor

### What it fixes

Large refactor replacing `bun:shell` (`$`) usage with `Process.run()` calls throughout the LSP server. Also replaces `Bun.resolve()` with portable `Module.resolve()` from `@opencode-ai/util/module`, and replaces `$\`chmod +x\``with`fs.chmod(bin, 0o755)`.

### Current state in our fork

Uses `$` (bun shell), `Bun.resolve()`, and shell commands for chmod throughout `lsp/server.ts`.

### Upstream change

- `spawn` import renamed to `launch`, wrapped with `windowsHide: true`
- All `$\`...\``calls replaced with`Process.run()`or`Process.text()`
- All `Bun.resolve()` calls replaced with `Module.resolve()` (from `@opencode-ai/util/module`)
- All `$\`chmod +x\``replaced with`fs.chmod(bin, 0o755)`
- All `$\`curl ...\``replaced with native`fetch()`+`Filesystem.writeStream()`
- JDTLS: improved Gradle monorepo root detection with `NearestRoot` exclusions
- JDTLS: `ls` command replaced with `fs.readdir()` + regex filter
- Kotlin LS: download via `fetch()` instead of `curl`
- Java version check: `$\`java -version\``to`Process.run()`

### Files changed

| File                | Change                                               |
| ------------------- | ---------------------------------------------------- |
| `src/lsp/server.ts` | ~200 lines changed across 15+ LSP server definitions |

### New dependency

- `@opencode-ai/util/module` -- `Module.resolve()` function. This is in our `packages/util/` directory. Need to verify the module export exists or add it.

### Rename needed

None.

### Desktop app impact

None directly. LSP servers are spawned by the engine process. Better Windows support (windowsHide).

### Depends on

- `Process.text()` and `Process.lines()` (see item 11)
- `@opencode-ai/util/module` -- `Module.resolve()` utility

---

## 5. MCP OAuth State Fix

### What it fixes

MCP OAuth flow fails on first connect because `state()` was called before `startAuth()` saved the state. The SDK calls `state()` as a generator (to create new state), not just a reader.

### Current state in our fork

`state()` throws `Error("No OAuth state saved for MCP server: ...")` if no state exists.

### Upstream change

Instead of throwing, `state()` now generates a new random hex state string (32 bytes), persists it via `McpAuth.updateOAuthState()`, and returns it. Falls through to generation only if no existing state is found.

### Files changed

| File                        | Change                                          |
| --------------------------- | ----------------------------------------------- |
| `src/mcp/oauth-provider.ts` | `state()` method: generate + persist if missing |

### Rename needed

None.

### Desktop app impact

**Positive.** Fixes MCP OAuth connections that fail silently on first attempt. Users connecting to OAuth-protected MCP servers will no longer need to retry.

### Depends on

Nothing. Fully independent.

---

## 6. Skills in System Prompt

### What it adds

Skills are now included in the system prompt (not just the tool description). This gives the LLM better context about available skills before it decides to invoke the skill tool.

### Current state in our fork

Skills are only described in the skill tool's description parameter. The system prompt has no mention of skills.

### Upstream change

**`src/session/system.ts`**:

- New `SystemPrompt.skills(agent)` async function
- Checks if skill permission is not denied for the agent
- Calls `Skill.available(agent)` to get filtered list
- Returns XML-formatted skill descriptions using `Skill.fmt(list, { verbose: true })`

**`src/skill/skill.ts`**:

- New `Skill.available(agent?)` -- filters skills by agent permission
- New `Skill.fmt(list, { verbose })` -- formats skill list as XML (verbose) or Markdown (compact)

**`src/tool/skill.ts`**:

- Refactored to use `Skill.available()` and `Skill.fmt(list, { verbose: false })` instead of inline formatting
- Fixes `.then((x) => Object.keys(x).join(", "))` to `.then((x) => x.map((skill) => skill.name).join(", "))`

### Files changed

| File                    | Change                                                       |
| ----------------------- | ------------------------------------------------------------ |
| `src/session/system.ts` | Add `SystemPrompt.skills()`                                  |
| `src/skill/skill.ts`    | Add `available()` and `fmt()`                                |
| `src/tool/skill.ts`     | Refactor to use shared `Skill.available()` and `Skill.fmt()` |

### Rename needed

None (skills are user-defined, not branded).

### Desktop app impact

None -- system prompt is server-side only.

### Depends on

Nothing. Fully independent.

---

## 7. Session Message Pagination

### What it adds

Cursor-based pagination for the `GET /session/:sessionID/messages` endpoint. Previously returned all messages; now supports `?limit=N&before=<cursor>` query parameters with `Link` header and `X-Next-Cursor` response header for traversal.

### Current state in our fork

Returns all messages with optional `?limit=N` (simple truncation, no cursor).

### Upstream change

**`src/server/routes/session.ts`**:

- Adds `before` query parameter with cursor validation
- When `limit` is provided with `before`, calls new `MessageV2.page()` instead of `Session.messages()`
- Returns pagination headers: `Link: <url>; rel="next"` and `X-Next-Cursor`
- When `limit=0` or no limit, returns all messages (backward compatible)
- All route param validators changed from `z.string()` to branded ID types

**`src/session/message-v2.ts`**:

- New `MessageV2.page()` function: cursor-based pagination using compound index `(session_id, time_created, id)`
- New `MessageV2.cursor` encode/decode utilities
- Branded ID types throughout (see item 2)

**DB migration** (`20260312043431_session_message_cursor`):

- Replaces `message_session_idx` with compound `message(session_id, time_created, id)` index
- Replaces `part_message_idx` with compound `part(message_id, id)` index

### Files changed

| File                                               | Change                                |
| -------------------------------------------------- | ------------------------------------- |
| `src/server/routes/session.ts`                     | Pagination logic + branded ID params  |
| `src/session/message-v2.ts`                        | `page()`, `cursor` codec, branded IDs |
| `migration/20260312043431_session_message_cursor/` | New compound indexes                  |

### Rename needed

None.

### Desktop app impact

**Medium.** Our frontend SSE adapter fetches messages via `GET /session/:id/messages`. The endpoint remains backward compatible (no `limit` = all messages), but we should update the SDK client types after regeneration. Future optimization: use pagination for large sessions.

### Depends on

- Branded ID types (item 2) -- routes use `SessionID.zod`, `MessageID.zod`, etc.
- DB migration (can be included in Phase 4's migration batch)

---

## 8. Bun Shell ($) Removal

### What it fixes

Systematic removal of `import { $ } from "bun"` (bun shell) across ~10 files, replaced with `Process.run()`, `Process.text()`, native `fetch()`, `fs.chmod()`, and the new `git()` utility. Improves portability and error handling.

### Current state in our fork

Many files use `$` for shell commands.

### Upstream change

| File                    | `$` usage removed                    | Replaced with                            |
| ----------------------- | ------------------------------------ | ---------------------------------------- |
| `src/file/index.ts`     | `$\`git diff\``, `$\`git ls-files\`` | `git()` utility                          |
| `src/file/watcher.ts`   | `$\`git rev-parse\``                 | `git()` utility                          |
| `src/file/ripgrep.ts`   | `$\`${raw}\``                        | `Process.text()`                         |
| `src/lsp/server.ts`     | ~15 shell commands                   | `Process.run()`, `fetch()`, `fs.chmod()` |
| `src/snapshot/index.ts` | `$\`git --git-dir\``                 | `Process.run()` with args helper         |

### New utility

**`src/util/git.ts`** -- Already exists in our fork. Wraps `Process.run(["git", ...args])` with stdin ignored. Returns `{ exitCode, text(), stdout, stderr }`.

### Rename needed

None.

### Desktop app impact

None.

### Depends on

- `Process.text()` and `Process.lines()` (item 11)
- `git()` utility (already in our fork)

---

## 9. Data URL Utility

### What it adds

Small utility function `decodeDataUrl(url)` that handles both base64 and percent-encoded data URLs.

### Current state in our fork

Does not exist.

### Upstream change

**`src/util/data-url.ts`** (new file, 8 lines):

```typescript
export function decodeDataUrl(url: string) {
  const idx = url.indexOf(",")
  if (idx === -1) return ""
  const head = url.slice(0, idx)
  const body = url.slice(idx + 1)
  if (head.includes(";base64")) return Buffer.from(body, "base64").toString("utf8")
  return decodeURIComponent(body)
}
```

### Files changed

| File                   | Change       |
| ---------------------- | ------------ |
| `src/util/data-url.ts` | **New file** |

### Rename needed

None.

### Desktop app impact

None.

### Depends on

Nothing. Fully independent.

---

## 10. Instance State (Effect-based)

### What it adds

`InstanceState` -- an Effect-based scoped cache for per-instance state that automatically invalidates when an instance is reloaded or disposed. Uses Effect `ScopedCache`.

### Current state in our fork

Does not exist. `Instance.reload()` and `Instance.dispose()` only call `State.dispose()`.

### Upstream change

**`src/util/instance-state.ts`** (new file):

- `InstanceState.make({ lookup, release })` -- creates a scoped cache keyed by instance directory
- `InstanceState.get/has/invalidate` -- cache operations
- `InstanceState.dispose(key)` -- invalidates all registered caches for a directory
- Uses Effect `ScopedCache` and global `tasks` set for cleanup

**`src/project/instance.ts`**:

- `reload()` and `dispose()` now call `Promise.all([State.dispose(directory), Effect.runPromise(InstanceState.dispose(directory))])`

### Files changed

| File                         | Change                                          |
| ---------------------------- | ----------------------------------------------- |
| `src/util/instance-state.ts` | **New file**                                    |
| `src/project/instance.ts`    | Add `InstanceState.dispose()` to reload/dispose |

### Rename needed

| Location                     | Upstream                                | Our version                  |
| ---------------------------- | --------------------------------------- | ---------------------------- |
| `src/util/instance-state.ts` | `Symbol.for("@opencode/InstanceState")` | Keep as-is (internal symbol) |

### Desktop app impact

None -- internal state management.

### Depends on

Effect dependency (Phase 0).

---

## 11. Process Utility Enhancements

### What it adds

New `Process.text()` and `Process.lines()` convenience methods, `windowsHide` support, and better error handling.

### Current state in our fork

`Process.run()` exists. No `text()` or `lines()`. No `windowsHide`.

### Upstream change

**`src/util/process.ts`**:

- New `TextResult` interface: extends `Result` with `text: string`
- New `Process.text(cmd, opts)`: runs command, returns result with `text` property (stdout as string)
- New `Process.lines(cmd, opts)`: runs command, returns stdout split into lines
- `spawn()` now adds `windowsHide: true` on Windows
- `run()` now wraps the `Promise.all` with a `.catch()` when `nothrow` is set -- prevents unhandled rejections when the process fails before stdout/stderr are available

### Files changed

| File                  | Change                                                               |
| --------------------- | -------------------------------------------------------------------- |
| `src/util/process.ts` | Add `text()`, `lines()`, `TextResult`, `windowsHide`, error handling |

### Rename needed

None.

### Desktop app impact

None.

### Depends on

Nothing. Fully independent. **Should be ported first** since many other changes depend on it.

---

## 12. ACP Branded IDs

### What it fixes

Type safety improvements in the ACP (Agent Client Protocol) module using branded `ProviderID` and `ModelID` types instead of raw strings.

### Current state in our fork

All provider/model IDs in ACP are plain strings.

### Upstream change

- `import { ModelID, ProviderID } from "../provider/schema"`
- `import { pathToFileURL } from "url"` (was `from "bun"`)
- `getContextLimit` params typed as `ProviderID` / `ModelID`
- All `providerID` string literals wrapped with `ProviderID.make()`
- All `modelID` string literals wrapped with `ModelID.make()`
- Null check added: `if (!msg.providerID || !msg.modelID) return`

### Files changed

| File               | Change                                                 |
| ------------------ | ------------------------------------------------------ |
| `src/acp/agent.ts` | Branded ID casts, null guard, pathToFileURL import fix |

### Rename needed

None.

### Desktop app impact

None -- ACP is a separate protocol layer.

### Depends on

Branded ID types (item 2).

---

## 13. Symlink / Instance Reload Fix

### What it fixes

When reloading or disposing an instance, Effect-based `InstanceState` caches were not being cleaned up, potentially leaving stale state for the directory.

### Current state in our fork

`Instance.reload()` and `Instance.dispose()` only call `State.dispose()`.

### Upstream change

Both methods now run `State.dispose()` and `InstanceState.dispose()` in parallel via `Promise.all`.

### Files changed

| File                      | Change                                          |
| ------------------------- | ----------------------------------------------- |
| `src/project/instance.ts` | Add `InstanceState.dispose()` to reload/dispose |

### Rename needed

None.

### Desktop app impact

None.

### Depends on

Instance State (item 10).

---

## 14. Workspace Root in System Prompt

### What it adds

Adds `Workspace root folder: ${Instance.worktree}` to the environment section of the system prompt, giving the LLM context about the git worktree root (which may differ from the working directory in monorepos or worktree checkouts).

### Current state in our fork

System prompt only includes `Working directory: ${Instance.directory}`.

### Upstream change

One line addition in `src/session/system.ts`:

```
`  Workspace root folder: ${Instance.worktree}`,
```

### Files changed

| File                    | Change            |
| ----------------------- | ----------------- |
| `src/session/system.ts` | Add worktree line |

### Rename needed

None.

### Desktop app impact

None -- system prompt is server-side only.

### Depends on

Nothing. Fully independent.

---

## 15. Ripgrep Glob Quoting Fix

### What it fixes

The ripgrep glob argument was wrapped in quotes (`--glob='!.git/*'`) which could cause issues on some platforms. Changed to unquoted (`--glob=!.git/*`).

Also adds `arm64-win32` platform support for ripgrep downloads.

### Current state in our fork

Uses quoted glob argument.

### Upstream change

- `"--glob='!.git/*'"` changed to `"--glob=!.git/*"`
- `$` shell execution replaced with `Process.text()`
- Added `"arm64-win32"` platform entry for ripgrep binary downloads

### Files changed

| File                  | Change                                                |
| --------------------- | ----------------------------------------------------- |
| `src/file/ripgrep.ts` | Fix glob quoting, add arm64-win32, use Process.text() |

### Rename needed

None.

### Desktop app impact

None.

### Depends on

`Process.text()` (item 11).

---

## Recommended Porting Order

The items have varying dependencies. Here's the recommended order:

### Wave 1: No dependencies (port immediately)

1. **Process utility enhancements** (item 11) -- many other items depend on this
2. **Data URL utility** (item 9) -- trivial, no deps
3. **MCP OAuth state fix** (item 5) -- bug fix, no deps
4. **Workspace root in system prompt** (item 14) -- one line, no deps
5. **File protection** (item 3) -- new file + 2 small edits, no deps

### Wave 2: Depends on Process utility

6. **Bun shell removal** (item 8) -- uses Process.text(), git()
7. **Ripgrep glob fix** (item 15) -- uses Process.text()
8. **LSP server refactor** (item 4) -- uses Process.run(), Module.resolve()

### Wave 3: Depends on Effect (Phase 0) + util/schema (Phase 4)

9. **Branded ID types** (item 2) -- needs util/schema.ts + Effect
10. **SSE chunk timeout** (item 1) -- independent but touches provider.ts heavily; port alongside branded IDs to avoid merge conflicts

### Wave 4: Depends on branded IDs

11. **Session message pagination** (item 7) -- needs branded IDs
12. **ACP branded IDs** (item 12) -- needs branded IDs
13. **Skills in system prompt** (item 6) -- independent but touches same files

### Wave 5: Depends on Effect

14. **Instance state** (item 10) -- needs Effect ScopedCache
15. **Instance reload fix** (item 13) -- needs instance state

---

## Files Summary

### New files (5)

```
src/file/protected.ts
src/util/data-url.ts
src/util/instance-state.ts
src/session/schema.ts
src/provider/schema.ts
```

### Modified files (~25)

```
src/provider/provider.ts        (SSE timeout + branded IDs + baseURL refactor + provider loaders)
src/lsp/server.ts               ($ removal, Module.resolve, fetch, fs.chmod, JDTLS root)
src/mcp/oauth-provider.ts       (state generation fix)
src/session/system.ts           (skills + worktree)
src/skill/skill.ts              (available + fmt)
src/tool/skill.ts               (refactor to use Skill.available/fmt)
src/server/routes/session.ts    (pagination + branded IDs)
src/session/message-v2.ts       (page() + cursor + branded IDs)
src/file/index.ts               (Protected.names + git utility)
src/file/watcher.ts             (Protected.paths + git utility)
src/file/ripgrep.ts             (glob fix + arm64-win32 + Process.text)
src/snapshot/index.ts           ($ removal → Process.run)
src/project/instance.ts         (InstanceState.dispose)
src/util/process.ts             (text + lines + windowsHide + error handling)
src/acp/agent.ts                (branded IDs + pathToFileURL fix)
src/config/config.ts            (chunkTimeout field, also touched by Phase 4)
```

### Depends on Phase 0 (Effect)

```
src/session/schema.ts           (Effect Schema.brand)
src/provider/schema.ts          (Effect Schema.brand)
src/util/instance-state.ts      (Effect ScopedCache)
src/project/instance.ts         (Effect.runPromise for InstanceState)
```

### Depends on Phase 4 (util/schema.ts)

```
src/session/schema.ts           (withStatics)
src/provider/schema.ts          (withStatics)
```
