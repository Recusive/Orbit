# Phase 4: Account System

## How to Execute

**Mostly NEW files (copy from upstream) + delete old `control/` module.**

New files — copy directly:

```bash
cd Agent-backend/upstream/repo/clone
mkdir -p ../../packages/opencode/src/account
git show v1.2.26:packages/opencode/src/account/account.sql.ts > ../../packages/opencode/src/account/account.sql.ts
git show v1.2.26:packages/opencode/src/account/schema.ts > ../../packages/opencode/src/account/schema.ts
git show v1.2.26:packages/opencode/src/account/repo.ts > ../../packages/opencode/src/account/repo.ts
git show v1.2.26:packages/opencode/src/account/service.ts > ../../packages/opencode/src/account/service.ts
git show v1.2.26:packages/opencode/src/account/index.ts > ../../packages/opencode/src/account/index.ts
mkdir -p ../../packages/opencode/src/cli/effect
git show v1.2.26:packages/opencode/src/cli/effect/prompt.ts > ../../packages/opencode/src/cli/effect/prompt.ts
git show v1.2.26:packages/opencode/src/cli/cmd/account.ts > ../../packages/opencode/src/cli/cmd/account.ts
```

Delete old module:

```bash
rm -rf Agent-backend/packages/opencode/src/control/
```

Then rename any "opencode" references in the copied files. Also copy DB migrations.

## Summary

Replace the legacy `control/` module (simple Zod-based account lookup + token refresh) with a full Effect-based `account/` system. This adds multi-account management, org switching, device-code OAuth login, remote config fetching, and 4 new CLI commands. The old `control/` directory is deleted entirely.

**Scope:** 5 new account files + 1 CLI command file + 1 CLI prompt utility + 1 Effect runtime + 1 auth service + 3 DB migrations + delete 2 control files + update config.ts and storage schema.

**Depends on:** Phase 0 (Effect dependency must be installed first). The account system is built entirely on Effect `ServiceMap`, `Schema`, `Layer`, and `ManagedRuntime`.

---

## What We Have Today

### `control/` module (2 files)

**`src/control/control.sql.ts`** -- Drizzle schema for `control_account` table:

- Composite primary key on `(email, url)`
- Fields: email, url, access_token, refresh_token, token_expiry, active (boolean)

**`src/control/index.ts`** -- `Control` namespace:

- `Control.Account` -- Zod schema (email + url)
- `Control.account()` -- sync, returns active account row
- `Control.token()` -- async, returns access token with refresh-on-expiry via raw `fetch`

### Current importers

| File                    | Import                                                         | Usage                                                                |
| ----------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| `src/config/config.ts`  | `import { Control } from "@/control"`                          | `Control.token()` -- fetches token, but result is unused (dead code) |
| `src/storage/schema.ts` | `export { ControlAccountTable } from "../control/control.sql"` | Re-exports table for Drizzle migration system                        |

### Current migration directory

Our fork has 6 migrations:

```
migration/
  20260127222353_familiar_lady_ursula/
  20260211171708_add_project_commands/
  20260213144116_wakeful_the_professor/
  20260225215848_workspace/
  20260227213759_add_session_workspace_id/
  20260303231226_add_workspace_fields/
```

Upstream adds 3 new migrations between v1.2.24 and v1.2.26.

---

## What Gets Deleted

### `src/control/control.sql.ts`

- Entire file removed
- The `ControlAccountTable` Drizzle schema **moves** into `src/account/account.sql.ts` as a legacy compatibility table
- Upstream keeps it there so existing databases with `control_account` rows don't break Drizzle migrations

### `src/control/index.ts`

- Entire file removed
- `Control.account()` replaced by `Account.active()`
- `Control.token()` replaced by `Account.token(accountID)`
- The Zod-based namespace is replaced by an Effect `Schema.Class`-based system

### `src/control/CLAUDE.md`

- Delete this too (our fork has it)

---

## What Gets Added

### New files (9 total)

#### Account module (5 files)

| File                         | Purpose                                                                                                                                                                                                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/account/schema.ts`      | Effect Schema definitions: `AccountID`, `OrgID`, `AccessToken`, `RefreshToken`, `DeviceCode`, `UserCode` (branded strings); `Account` class; `Org` class; error types (`AccountRepoError`, `AccountServiceError`); `Login`, `PollResult` union for device auth flow               |
| `src/account/account.sql.ts` | Drizzle tables: new `AccountTable` (id PK, email, url, tokens, expiry), new `AccountStateTable` (singleton row tracking active account + org), legacy `ControlAccountTable` (kept for migration compatibility)                                                                    |
| `src/account/repo.ts`        | `AccountRepo` Effect service: CRUD operations on `AccountTable`/`AccountStateTable`. Methods: `active`, `list`, `remove`, `use`, `getRow`, `persistToken`, `persistAccount`. Uses `ServiceMap.Service` pattern.                                                                   |
| `src/account/service.ts`     | `AccountService` Effect service: high-level operations. Token refresh via HTTP, device-code OAuth login/poll, org listing, remote config fetch. Depends on `AccountRepo` + `HttpClient`. Exports `defaultLayer` (composed with `FetchHttpClient`). Re-exports all of `schema.ts`. |
| `src/account/index.ts`       | Public API: wraps Effect service calls with `runtime.runSync`/`runtime.runPromise` for use in non-Effect code. Exposes `Account.active()`, `Account.config()`, `Account.token()`.                                                                                                 |

#### CLI commands (2 files)

| File                       | Purpose                                                                                                                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli/cmd/account.ts`   | 4 CLI commands: `login <url>` (device-code OAuth with browser open + spinner), `logout [email]` (interactive account selection), `switch` (org switcher), `orgs` (list orgs). All wrapped as yargs commands under a `console` parent command. |
| `src/cli/effect/prompt.ts` | Effect wrappers around `@clack/prompts`: `intro`, `outro`, `log.info`, `select`, `spinner`. Used by account CLI commands.                                                                                                                     |

#### Effect infrastructure (2 files)

| File                    | Purpose                                                                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/effect/runtime.ts` | `ManagedRuntime` instance composing `AccountService.defaultLayer` + `AuthService.defaultLayer`. This is the bridge between Effect-based services and the imperative codebase. |
| `src/auth/service.ts`   | `AuthService` Effect service with Schema classes: `Oauth`, `Api`, `WellKnown`. Reads/writes auth credentials from the state directory. Provides a `Layer` for the runtime.    |

### New utility file (1 file)

| File                 | Purpose                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/util/schema.ts` | `withStatics` helper -- attaches static methods to an Effect Schema. Used by `AccountID.make()`, `SessionID.zod`, `ProviderID.anthropic`, etc. Required by account, session, and provider schema files. |

### New migrations (3)

| Migration                               | SQL                                                                                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260228203230_blue_harpoon`           | Creates `account` table (id PK, email, url, tokens, expiry, selected_org_id) and `account_state` table (singleton with active_account_id FK)                   |
| `20260309230000_move_org_to_state`      | Moves `selected_org_id` from `account` to `account_state.active_org_id` column; drops column from account                                                      |
| `20260312043431_session_message_cursor` | Replaces `message_session_idx` and `part_message_idx` with compound indexes for pagination: `message(session_id, time_created, id)` and `part(message_id, id)` |

Note: The third migration (`session_message_cursor`) is not account-specific -- it supports the session pagination feature (Plan 5). Include it here since it's a DB migration.

---

## Modified Files

### `src/config/config.ts`

- **Remove:** `import { Control } from "@/control"` and the dead `Control.token()` call
- **Add:** `import { Account } from "@/account"`
- **Add:** `import { Env } from "../env"`, `import { Process } from "@/util/process"`, `import { Lock } from "@/util/lock"`
- **Add:** New block after global config that checks `Account.active()` -- if active account has an org, fetches remote config and token via `Account.config()` / `Account.token()`, sets `OPENCODE_CONSOLE_TOKEN` env var
- **Add:** `chunkTimeout` field to provider config schema (positive int, optional)
- **Add:** `Lock.write("bun-install")` around dependency installation
- **Add:** Better error handling for dependency install failures with `Process.RunFailedError`

### `src/storage/schema.ts`

- **Change:** `export { ControlAccountTable } from "../control/control.sql"` becomes `export { AccountTable, AccountStateTable, ControlAccountTable } from "../account/account.sql"`

### `src/index.ts` (CLI entry point)

- **Add:** Registration of `ConsoleCommand` (login/logout/switch/orgs) in yargs command chain

---

## Rename Required

| Location                     | Current (upstream)                                 | Our version                                                                       |
| ---------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/account/repo.ts`        | `ServiceMap.Service(...)("@opencode/AccountRepo")` | Keep as-is (internal Effect service tag, not user-facing)                         |
| `src/account/service.ts`     | `ServiceMap.Service(...)("@opencode/Account")`     | Keep as-is (internal Effect service tag)                                          |
| `src/account/service.ts`     | `clientId = "opencode-cli"`                        | Change to `"orbit-cli"` -- this is sent to the auth server as the OAuth client ID |
| `src/effect/runtime.ts`      | No user-facing strings                             | No changes needed                                                                 |
| `src/util/instance-state.ts` | `Symbol.for("@opencode/InstanceState")`            | Keep as-is (internal symbol, not user-facing)                                     |
| `src/cli/cmd/account.ts`     | CLI help text                                      | Review for any "opencode" references in command descriptions                      |
| `src/config/config.ts`       | `OPENCODE_CONSOLE_TOKEN` env var                   | Keep as-is (matches existing env var convention in the fork)                      |

**Decision needed:** The OAuth `clientId` (`"opencode-cli"`) is sent to external auth servers. If we're authenticating against our own servers, change to `"orbit-cli"`. If authenticating against upstream opencode servers, keep as-is for compatibility.

---

## Desktop App Impact

### API routes

- No new API routes added for accounts in this phase
- Account state is local to the server process (SQLite)
- The remote config fetch happens during `Config.get()` which the server already calls

### Frontend changes needed

- **None required immediately** -- the account system is CLI-only for now
- Future: may want to expose account status in the Orbit desktop settings UI
- The `OPENCODE_CONSOLE_TOKEN` env var may affect provider authentication if the desktop app inherits it

### Sidecar binary

- The `orbit-server` binary will include the account system
- Account commands (`login`, `logout`, `switch`, `orgs`) are CLI-only -- they won't be available through the HTTP API
- SQLite database gets new tables automatically via migration on first run

---

## Implementation Order

1. **Add `src/util/schema.ts`** -- `withStatics` helper (no dependencies)
2. **Add `src/account/schema.ts`** -- Effect Schema types (depends on util/schema)
3. **Add `src/account/account.sql.ts`** -- New Drizzle tables + legacy ControlAccountTable (depends on schema)
4. **Add 3 migrations** -- Copy from upstream (depends on account.sql.ts)
5. **Add `src/auth/service.ts`** -- Effect service for auth credentials
6. **Add `src/account/repo.ts`** -- Effect repo (depends on account.sql.ts, schema)
7. **Add `src/account/service.ts`** -- Effect service (depends on repo, schema, auth)
8. **Add `src/effect/runtime.ts`** -- ManagedRuntime (depends on account/service, auth/service)
9. **Add `src/account/index.ts`** -- Public API (depends on service, runtime)
10. **Add `src/cli/effect/prompt.ts`** -- CLI prompt utilities
11. **Add `src/cli/cmd/account.ts`** -- CLI commands (depends on account/index, prompt)
12. **Update `src/config/config.ts`** -- Replace Control with Account
13. **Update `src/storage/schema.ts`** -- Add new table exports
14. **Update `src/index.ts`** -- Register account CLI commands
15. **Delete `src/control/index.ts`** and `src/control/control.sql.ts` and `src/control/CLAUDE.md`

---

## Verification

- [ ] `bun turbo typecheck` passes
- [ ] DB migrations run on fresh database (no existing data)
- [ ] DB migrations run on existing database (with control_account data)
- [ ] `Control` namespace fully removed -- `grep -r "from.*control" src/ --include="*.ts"` returns no `@/control` imports
- [ ] `Account.active()` returns `undefined` with empty DB (no crash)
- [ ] `Account.token(id)` handles expired token refresh
- [ ] `orbit console login <url>` initiates device-code flow
- [ ] `orbit console logout` lists accounts for removal
- [ ] `orbit console switch` allows org selection
- [ ] `orbit console orgs` displays org list
- [ ] `chunkTimeout` config field accepted without error
- [ ] Remote config fetch works when active account has an org
- [ ] Lock prevents concurrent `bun install` operations

---

## Risk Assessment

| Risk                                 | Severity | Mitigation                                                                                               |
| ------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------- |
| Effect dependency not installed      | Blocker  | Phase 0 must complete first                                                                              |
| Legacy `control_account` data lost   | Medium   | `ControlAccountTable` kept in `account.sql.ts` for backward compat; migration doesn't touch legacy table |
| OAuth client ID mismatch             | Low      | Decide on `"orbit-cli"` vs `"opencode-cli"` before implementation                                        |
| `ManagedRuntime` initialization cost | Low      | Runtime is lazy (created on first use); account operations are infrequent                                |
| `@clack/prompts` not installed       | Low      | Already a dependency in upstream; verify in our `package.json`                                           |

---

## Files Summary

### New files (11)

```
src/util/schema.ts
src/account/schema.ts
src/account/account.sql.ts
src/account/repo.ts
src/account/service.ts
src/account/index.ts
src/auth/service.ts
src/effect/runtime.ts
src/cli/cmd/account.ts
src/cli/effect/prompt.ts
migration/20260228203230_blue_harpoon/migration.sql
migration/20260309230000_move_org_to_state/migration.sql
migration/20260312043431_session_message_cursor/migration.sql
```

### Modified files (3)

```
src/config/config.ts
src/storage/schema.ts
src/index.ts
```

### Deleted files (3)

```
src/control/index.ts
src/control/control.sql.ts
src/control/CLAUDE.md
```
