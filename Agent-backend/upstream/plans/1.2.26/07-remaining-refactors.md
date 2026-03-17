# ✅ Phase 7: Server Refactor + CLI Rename + Misc Refactors

## How to Execute

**Mix: server.ts may already be done in our fork. CLI rename = copy + rename file. Misc = apply diffs.**

```bash
cd Agent-backend/upstream/repo/clone

# Server — compare first, our fork may already have createApp()
git diff v1.2.24..v1.2.26 -- packages/opencode/src/server/server.ts | head -30

# CLI rename — copy new file, delete old
git show v1.2.26:packages/opencode/src/cli/cmd/providers.ts > ../../packages/opencode/src/cli/cmd/providers.ts
rm ../../packages/opencode/src/cli/cmd/auth.ts

# Misc — apply diffs per file
git diff v1.2.24..v1.2.26 -- packages/opencode/src/<path>
```

## Summary

This phase covers structural refactors from upstream v1.2.24 -> v1.2.26 that are NOT Bun shell removal (Phase 6) or full rename (Phase 8). The three major areas are: (A) server.ts singleton-to-factory refactor, (B) CLI `auth` -> `providers` rename, and (C) miscellaneous refactors including branded IDs, new Account system, and provider changes.

---

## Subplan 7A: Server.ts Refactor (Singleton -> Factory)

### What We Have Today

Our fork already has the refactored server structure:

```typescript
export const Default = lazy(() => createApp({}))
export const createApp = (opts: { cors?: string[] }): Hono => {
```

**Status: ALREADY DONE.** Our fork's `server/server.ts` already uses the `createApp` factory pattern with `Default` lazy singleton. The old `App()` / `_url` / `_corsWhitelist` mutable state pattern has been replaced.

### What Upstream Changed

- Removed `let _url: URL | undefined` and `let _corsWhitelist: string[] = []` mutable state
- Replaced `export const App: () => Hono = lazy(...)` with `export const Default = lazy(() => createApp({}))`
- Extracted `createApp(opts: { cors?: string[] })` factory that creates a fresh Hono instance
- `export let url: URL | undefined` as a mutable export (set during `listen()`)
- Moved `lazy` import from `../util/lazy` to `@/util/lazy`
- Added `WorkspaceID` and `ProviderID` branded type imports

### Impact on Tauri Sidecar

The Tauri sidecar calls the server via HTTP. The API surface is unchanged -- only internal construction is different. **No breaking changes** for the desktop app.

### Action Items

- [x] Already converted to createApp factory
- [ ] Verify `export let url` is used correctly (not the old `url()` function)
- [ ] Verify branded type imports (`WorkspaceID`, `ProviderID`) are present if those schema files exist in our fork

---

## Subplan 7B: CLI auth.ts -> providers.ts Rename

### What Changes

| Before                         | After                                           |
| ------------------------------ | ----------------------------------------------- |
| `src/cli/cmd/auth.ts`          | `src/cli/cmd/providers.ts`                      |
| `AuthCommand`                  | `ProvidersCommand`                              |
| `AuthLoginCommand`             | `ProvidersLoginCommand`                         |
| `AuthLogoutCommand`            | `ProvidersLogoutCommand`                        |
| `AuthListCommand`              | `ProvidersListCommand`                          |
| Command: `auth`                | Command: `providers` (with `auth` as alias)     |
| Describe: "manage credentials" | Describe: "manage AI providers and credentials" |

### Provider Priority Reorder

The `login` command reorders provider selection priority:

| Provider       | Old Priority | New Priority |
| -------------- | ------------ | ------------ |
| opencode       | 0            | 0            |
| anthropic      | **1**        | **4**        |
| github-copilot | 2            | 2            |
| openai         | **3**        | **1**        |
| google         | 4            | 3            |
| openrouter     | 5            | 5            |
| vercel         | 6            | 6            |

### Hint Text Changes

| Provider  | Old Hint                      | New Hint    |
| --------- | ----------------------------- | ----------- |
| anthropic | "Claude Max or API key"       | "API key"   |
| openai    | "ChatGPT Plus/Pro or API key" | (unchanged) |

### Other Changes in providers.ts

- Removed `setTimeout as sleep` import, replaced with inline `new Promise((r) => setTimeout(r, 10))`
- Removed several JSDoc comments (4 doc blocks deleted)
- Variable rename: `selected` -> `method` in plugin auth selection
- Handler signatures: `async handler()` -> `async handler(_args)` for unused args

### Our Fork Status

Our fork still has `src/cli/cmd/auth.ts` with the old names. This file needs to be:

1. Renamed to `providers.ts`
2. All exports renamed (`Auth*` -> `Providers*`)
3. Priority reorder applied
4. Hint text updated

### index.ts Update

```typescript
// Old
import { AuthCommand } from "./cli/cmd/auth"
.command(AuthCommand)

// New
import { ConsoleCommand } from "./cli/cmd/account"  // NEW FILE (see 7C)
import { ProvidersCommand } from "./cli/cmd/providers"
.command(ConsoleCommand)
.command(ProvidersCommand)
```

### Rename Required (opencode -> Orbit)

- `providers.ts` line 344: `opencode: 0` priority entry -- rename to `orbit: 0`
- `providers.ts` line 371: `opencode: "recommended"` hint -- rename to `orbit: "recommended"`
- `providers.ts` line 447: `if (provider === "opencode")` -- rename to `if (provider === "orbit")`
- `providers.ts` line 448: `"Create an api key at https://opencode.ai/auth"` -- update URL
- Command describe text: "manage AI providers and credentials" -- no opencode reference, OK as-is

---

## Subplan 7C: Misc Refactors

### 7C.1: New Account System (NEW FILES)

Upstream added a new `Account` namespace replacing the old `Control` namespace:

| New File                     | Purpose                                                               |
| ---------------------------- | --------------------------------------------------------------------- |
| `src/account/account.sql.ts` | SQLite tables: `account`, `account_state`, `control_account` (legacy) |
| `src/account/index.ts`       | `Account` namespace with `active()`, `config()`, `token()`            |
| `src/account/repo.ts`        | Database repository layer (Effect-based)                              |
| `src/account/schema.ts`      | Branded types: `AccountID`, `OrgID`, `AccessToken`, `RefreshToken`    |
| `src/account/service.ts`     | `AccountService` Effect service with login, poll, list, remove        |
| `src/cli/cmd/account.ts`     | `ConsoleCommand` CLI command for account management                   |
| `src/cli/effect/prompt.ts`   | Effect-wrapped @clack/prompts helpers                                 |
| `src/effect/runtime.ts`      | Effect runtime singleton                                              |

**Removed:**
| Removed File | Replaced By |
|-------------|-------------|
| `src/control/control.sql.ts` | `src/account/account.sql.ts` |
| `src/control/index.ts` | `src/account/index.ts` |

**DEPENDENCY:** This requires the `effect` npm package (see `00-effect-dependency.md` plan). The Account system uses Effect for service composition, error handling, and async flows. If Effect is not yet installed, these files cannot be ported.

**Impact on config.ts:** The old `Control.token()` call is replaced by `Account.active()` + `Account.config()` + `Account.token()`. Config loading now fetches remote config from the active org's console API.

### 7C.2: Branded ID Types (NEW SCHEMA FILES)

Upstream added branded type wrappers for all domain IDs:

| New File                      | Types Exported                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `src/session/schema.ts`       | `SessionID`, `MessageID`, `PartID` with `.zod`, `.make()`, `.ascending()`          |
| `src/provider/schema.ts`      | `ProviderID`, `ModelID` with `.zod`, `.make()`, constants like `ProviderID.openai` |
| `src/project/schema.ts`       | `ProjectID` with `.zod`, `.make()`, `.global`                                      |
| `src/control-plane/schema.ts` | `WorkspaceID` with `.zod`, `.make()`                                               |
| `src/permission/schema.ts`    | Permission-related branded types                                                   |
| `src/question/schema.ts`      | Question-related branded types                                                     |
| `src/pty/schema.ts`           | PTY-related branded types                                                          |

These are consumed pervasively -- every file that previously used `string` for session/message/provider IDs now uses the branded type. This is a large mechanical change but low risk.

**Pattern:**

```typescript
// Old
export function get(sessionID: string) { ... }

// New
import { SessionID } from "./schema"
export function get(sessionID: SessionID) { ... }
```

### 7C.3: Provider Changes

| File                        | Change                                                                                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/provider/error.ts`     | Removed `github-copilot` special-case error message. Removed intermediate `error()` function. `message()` and `parseAPICallError` now take `ProviderID` branded type.                                                                      |
| `src/provider/transform.ts` | Added `@ai-sdk/amazon-bedrock` to Anthropic empty-content filter. Added SAP provider adaptive thinking support. Added Gemini 2.5 thinking config for SAP. Removed `@mymediset/sap-ai-provider` (only `@jerome-benoit/sap-ai-provider-v2`). |
| `src/provider/auth.ts`      | Significant refactor -- split into `auth.ts` (simplified) + new `auth-service.ts` (Effect-based AuthService).                                                                                                                              |
| `src/provider/provider.ts`  | Branded ID types throughout.                                                                                                                                                                                                               |

### 7C.4: Project Changes

| File                         | Change                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/project/project.ts`     | Major refactor: (1) `readCachedId()` extracted. (2) `git-common-dir` resolution moved earlier (before root commit check). (3) `migrateFromGlobal()` deleted, replaced by inline DB update after upsert. (4) All `string` -> `ProjectID` branded type. (5) `"global"` -> `ProjectID.global`. (6) Removed `work()` queue import. (7) Added `and` to drizzle imports for compound WHERE. |
| `src/project/project.sql.ts` | Updated to use `ProjectID` type.                                                                                                                                                                                                                                                                                                                                                      |
| `src/project/instance.ts`    | Minor typed ID changes.                                                                                                                                                                                                                                                                                                                                                               |

### 7C.5: Plugin Changes

| File                  | Change                                                                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/plugin/index.ts` | `Server.App()` -> `Server.Default()`. Plugin client now sends auth headers when `OPENCODE_SERVER_PASSWORD` is set. `serverUrl` changed from value to getter (`get serverUrl()`). |
| `src/plugin/codex.ts` | `ModelID.make()` and `ProviderID.openai` branded types.                                                                                                                          |

### 7C.6: Config Changes

| File                   | Change                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/config/config.ts` | (1) Removed `Control.token()` call. (2) Added `Account.active()` integration for remote org config. (3) Added `Lock.write("bun-install")` around dependency installation. (4) Better error handling for `Process.RunFailedError` in install. (5) New `OPENCODE_STRICT_CONFIG_DEPS` flag. (6) New `chunkTimeout` provider option. (7) `Env.set()` for console token. |

### 7C.7: Flag Changes

| File               | Change                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `src/flag/flag.ts` | `OPENCODE_EXPERIMENTAL_WORKSPACES_TUI` -> `OPENCODE_EXPERIMENTAL_WORKSPACES`. Added `OPENCODE_STRICT_CONFIG_DEPS`. |

### 7C.8: Command/Session Changes

| File                         | Change                                                                                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/command/index.ts`       | `Identifier.schema("session")` -> `SessionID.zod`, `Identifier.schema("message")` -> `MessageID.zod`                                                                                      |
| `src/session/prompt.ts`      | `Identifier.schema(...)` -> branded `.zod` types. `Identifier.ascending(...)` -> `MessageID.ascending()`, `PartID.ascending()`. `pathToFileURL`/`fileURLToPath` from `"url"` not `"bun"`. |
| `src/session/index.ts`       | Branded ID types throughout.                                                                                                                                                              |
| `src/session/session.sql.ts` | Branded ID types.                                                                                                                                                                         |

### 7C.9: Installation Changes

| File                        | Change                                                                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/installation/index.ts` | Already covered in Phase 6 (Bun removal). Also added `upgradeCurl()` helper that pipes install script to bash via `Process.spawn()` instead of `$\`curl ... \| bash\``. |

### 7C.10: Share Changes

| File                      | Change                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/share/share-next.ts` | (1) `ApiEndpoints` type + `apiEndpoints()` factory for legacy vs console API paths. (2) `request()` helper that returns `{headers, api, baseUrl}` based on active Account. (3) Console account integration (`Account.active()`, `Account.token()`). (4) Proper error handling (`response.ok` checks). (5) Branded `SessionID`, `ProviderID`, `ModelID` types. |

### 7C.11: Shell Changes

| File                 | Change                                                    |
| -------------------- | --------------------------------------------------------- |
| `src/shell/shell.ts` | Added `windowsHide: true` to `taskkill` spawn on Windows. |

### 7C.12: New Utility Files

| File                   | Purpose                                                                |
| ---------------------- | ---------------------------------------------------------------------- |
| `src/util/lock.ts`     | `Lock.write(name)` -- file-based write lock using `Disposable` pattern |
| `src/util/data-url.ts` | `decodeDataUrl()` -- parses `data:` URLs (used in prompt.ts)           |

### 7C.13: File System Changes

| File                    | Change                                |
| ----------------------- | ------------------------------------- |
| `src/file/index.ts`     | Refactored file operations            |
| `src/file/protected.ts` | **NEW** -- protected file paths logic |
| `src/file/watcher.ts`   | Updated file watcher                  |
| `src/file/ripgrep.ts`   | Minor changes                         |

### 7C.14: LSP Changes

| File                | Change                                                                 |
| ------------------- | ---------------------------------------------------------------------- |
| `src/lsp/server.ts` | Major refactor (145 lines changed). `lsp/index.ts` adds 1 line export. |

### 7C.15: Other Minor Changes

| File                                               | Change                                     |
| -------------------------------------------------- | ------------------------------------------ |
| `src/session/message-v2.ts`                        | Major refactor (213 lines). Branded types. |
| `src/session/compaction.ts`                        | Branded types.                             |
| `src/session/status.ts`                            | Branded types.                             |
| `src/session/summary.ts`                           | Branded types.                             |
| `src/session/system.ts`                            | New (18 lines).                            |
| `src/session/revert.ts`                            | Branded types.                             |
| `src/session/todo.ts`                              | Branded types.                             |
| `src/session/processor.ts`                         | Branded types.                             |
| `src/session/message.ts`                           | Minor.                                     |
| `src/permission/index.ts`                          | Major refactor (112 lines).                |
| `src/permission/next.ts`                           | Refactored.                                |
| `src/question/index.ts`                            | Branded types.                             |
| `src/pty/index.ts`                                 | Branded types.                             |
| `src/acp/agent.ts`                                 | Branded types (59 lines changed).          |
| `src/acp/types.ts`                                 | Branded types.                             |
| `src/bun/index.ts`                                 | 28 lines changed.                          |
| `src/bun/registry.ts`                              | 18 lines changed.                          |
| `src/mcp/index.ts`                                 | 10 lines changed.                          |
| `src/mcp/oauth-provider.ts`                        | 15 lines changed.                          |
| `src/auth/index.ts`                                | 40 lines changed.                          |
| `src/auth/service.ts`                              | **NEW** -- Effect-based auth service.      |
| `src/agent/agent.ts`                               | 7 lines changed.                           |
| `src/cli/cmd/export.ts`                            | Branded types.                             |
| `src/cli/cmd/import.ts`                            | 56 lines changed.                          |
| `src/cli/cmd/models.ts`                            | 7 lines changed.                           |
| `src/cli/cmd/run.ts`                               | 4 lines changed.                           |
| `src/cli/cmd/session.ts`                           | 6 lines changed.                           |
| `src/cli/cmd/debug/agent.ts`                       | 6 lines changed.                           |
| `src/cli/cmd/uninstall.ts`                         | 19 lines changed.                          |
| `src/control-plane/types.ts`                       | 7 lines changed.                           |
| `src/control-plane/workspace-context.ts`           | 5 lines changed.                           |
| `src/control-plane/workspace-router-middleware.ts` | 5 lines changed.                           |
| `src/control-plane/workspace-server/server.ts`     | 7 lines changed.                           |
| `src/control-plane/workspace.sql.ts`               | 7 lines changed.                           |
| `src/control-plane/workspace.ts`                   | 13 lines changed.                          |
| `src/server/routes/session.ts`                     | 117 lines changed.                         |
| `src/server/routes/provider.ts`                    | 5 lines changed.                           |
| `src/server/routes/permission.ts`                  | 3 lines changed.                           |
| `src/server/routes/question.ts`                    | 5 lines changed.                           |
| `src/server/routes/pty.ts`                         | 11 lines changed.                          |
| `src/server/routes/experimental.ts`                | 3 lines changed.                           |
| `src/server/routes/project.ts`                     | 3 lines changed.                           |
| TUI files (various)                                | Minor branded type / route changes.        |

---

## Breaking Changes

1. **Effect dependency required** for Account system (7C.1). Without `effect`, the Account module, auth service, and CLI account command cannot be ported.
2. **Branded ID types** (7C.2) are pervasive -- touching 50+ files. Can be done incrementally (file by file) since branded types are structurally compatible with `string` at runtime.
3. **`Server.App()`** callers must update to `Server.Default()` -- affects `plugin/index.ts` and any Tauri-side code that references the server.
4. **`Control` namespace deleted** -- replaced by `Account`. Any code referencing `Control.token()` must switch.
5. **`auth` CLI command** still works as alias, but primary is now `providers`.

## Rename Required (opencode -> Orbit)

Files in this phase with user-facing "opencode" strings:

| File                       | Line             | Current Text               | Rename To                     |
| -------------------------- | ---------------- | -------------------------- | ----------------------------- |
| `src/cli/cmd/providers.ts` | priority map     | `opencode: 0`              | `orbit: 0`                    |
| `src/cli/cmd/providers.ts` | hint map         | `opencode: "recommended"`  | `orbit: "recommended"`        |
| `src/cli/cmd/providers.ts` | provider check   | `provider === "opencode"`  | `provider === "orbit"`        |
| `src/cli/cmd/providers.ts` | login URL        | `https://opencode.ai/auth` | (Orbit equivalent URL)        |
| `src/cli/cmd/account.ts`   | (new file)       | "Log in" prompts           | Check for opencode references |
| `src/flag/flag.ts`         | all flags        | `OPENCODE_*`               | Defer to Phase 8              |
| `src/plugin/index.ts`      | username default | `"opencode"`               | `"orbit"`                     |

## Verification

```bash
cd Agent-backend/packages/opencode

# Type check
bun run typecheck

# Verify auth.ts renamed
ls src/cli/cmd/auth.ts        # Should NOT exist
ls src/cli/cmd/providers.ts   # Should exist

# Verify Control removed
ls src/control/               # Should NOT exist
ls src/account/               # Should exist

# Verify Server.App() not used
grep -rn 'Server\.App()' src/ --include="*.ts"
# Expected: 0 results

# Tests pass
bun test --timeout 30000
```

## Recommended Order of Operations

1. **Schema files first** (7C.2) -- `session/schema.ts`, `provider/schema.ts`, `project/schema.ts`, `control-plane/schema.ts`, `permission/schema.ts`, `question/schema.ts`, `pty/schema.ts`. These are leaf dependencies.
2. **New utility files** (7C.12) -- `util/lock.ts`, `util/data-url.ts`
3. **Account system** (7C.1) -- requires Effect. Create `account/` directory with all 5 files + `cli/effect/prompt.ts` + `effect/runtime.ts`.
4. **CLI rename** (7B) -- rename `auth.ts` -> `providers.ts`, update `index.ts`
5. **Server verification** (7A) -- already done, just verify
6. **Provider changes** (7C.3) -- `error.ts`, `transform.ts`, `auth.ts` split, `provider.ts` branded types
7. **Project changes** (7C.4) -- `project.ts` refactor
8. **Remaining consumers** (7C.5-7C.15) -- work through files in dependency order
9. **Delete old files** -- `src/control/control.sql.ts`, `src/control/index.ts`

## Notes

- The branded ID migration (7C.2) is the largest mechanical change. Consider doing it as a single batch commit since it touches 50+ files but each change is trivial (`string` -> `BrandedID`).
- The Account system (7C.1) is the most complex new feature. It brings in Effect as a runtime dependency for the first time. The `00-effect-dependency.md` plan must be completed first.
- Server.ts (7A) is already done in our fork -- just needs verification.
- The `share-next.ts` changes (7C.10) depend on the Account system being present.
