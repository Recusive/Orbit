# Phase 10: Tests, Migrations & Config

## Summary

v1.2.24 to v1.2.26 adds 14 new test files, modifies 36 existing test files, introduces 3 new DB migrations, and updates `tsconfig.json`, `package.json`, and `script/build.ts`. The test modifications are primarily mechanical (branded ID adoption in test contexts), while the new tests cover the account system, Effect-based utilities, message pagination, and share infrastructure. The migrations add account tables, reorganize org tracking, and optimize message query indexes.

---

## 10A: New Test Files (14 files)

### Account System Tests (require Phase 4 + Effect)

| File                           | Tests                                                                                             | Dependencies                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `test/account/repo.test.ts`    | AccountRepo CRUD: list, active, create, set-active, remove, token handling (338 lines)            | Effect, `AccountRepo` layer, `Database`, branded IDs (`AccountID`, `OrgID`, `AccessToken`, `RefreshToken`) |
| `test/account/service.test.ts` | AccountService OAuth flows: device code, token refresh, org listing (224 lines)                   | Effect, `AccountService` layer, `HttpClient` mocks, branded account schemas                                |
| `test/fixture/effect.ts`       | `testEffect` helper: wraps `test()` to run `Effect.Effect` values with a provided Layer (7 lines) | Effect                                                                                                     |

### Share System Tests (require Phase 4 Account)

| File                            | Tests                                                                               | Dependencies                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `test/share/share-next.test.ts` | ShareNext.request: legacy API without account, org API with auth headers (76 lines) | `Account`, `Config`, branded `AccountID`/`OrgID`/`AccessToken` |

### Server & Session Tests (require branded IDs)

| File                                       | Tests                                                                                        | Dependencies                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `test/server/session-messages.test.ts`     | Server session message listing: pagination, cursor-based retrieval, ordering (119 lines)     | `Server`, `Session`, `MessageV2`, branded `MessageID`/`PartID`/`SessionID` |
| `test/session/messages-pagination.test.ts` | Direct Session.messages pagination: cursor, limit, ordering, boundary conditions (115 lines) | `Session`, `MessageV2`, branded `MessageID`/`PartID`/`SessionID`           |

### Project Tests

| File                                  | Tests                                                                                | Dependencies                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `test/project/migrate-global.test.ts` | Global config migration: session reassignment across project directories (140 lines) | `Database`, `SessionTable`, `ProjectTable`, branded `ProjectID`/`SessionID` |
| `test/project/state.test.ts`          | Instance.state caching: per-instance isolation, disposal cleanup (115 lines)         | `Instance`, `tmpdir` fixture                                                |

### Provider Tests

| File                         | Tests                                                      | Dependencies                                 |
| ---------------------------- | ---------------------------------------------------------- | -------------------------------------------- |
| `test/provider/auth.test.ts` | ProviderAuth.api: persists auth via AuthService (20 lines) | `Auth`, `ProviderAuth`, branded `ProviderID` |

### MCP Tests

| File                                  | Tests                                                                      | Dependencies                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `test/mcp/oauth-auto-connect.test.ts` | MCP OAuth auto-connect: reconnection with auth provider on 401 (199 lines) | Complex mocking of MCP transports (`StreamableHTTPClientTransport`, `SSEClientTransport`) |

### Utility Tests

| File                               | Tests                                                                               | Dependencies                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `test/util/data-url.test.ts`       | `decodeDataUrl`: base64 and plain data URL decoding (14 lines)                      | `decodeDataUrl` from `@/util/data-url`                                   |
| `test/util/effect-zod.test.ts`     | `zod()` bridge: converts Effect schemas to Zod, preserves refs and shape (61 lines) | Effect `Schema`, `zod` from `@/util/effect-zod`                          |
| `test/util/instance-state.test.ts` | `InstanceState`: caching, disposal, acquisition lifecycle (139 lines)               | Effect, `InstanceState`, `Instance`, `tmpdir` fixture                    |
| `test/util/module.test.ts`         | `Module.resolve`: package subpath resolution, ancestor node_modules (59 lines)      | `Module` from `@opencode-ai/util/module`, `Filesystem`, `tmpdir` fixture |

### Classification by Dependency Tier

- **No special deps** (can port immediately): `data-url.test.ts`, `module.test.ts`, `state.test.ts`
- **Requires branded IDs** (Phase 2): `auth.test.ts`, `migrate-global.test.ts`, `session-messages.test.ts`, `messages-pagination.test.ts`
- **Requires Effect** (Phase 0): `effect.ts` fixture, `effect-zod.test.ts`, `instance-state.test.ts`
- **Requires Account system** (Phase 4): `repo.test.ts`, `service.test.ts`, `share-next.test.ts`
- **Complex mocking**: `oauth-auto-connect.test.ts`

---

## 10B: Modified Test Files (36 files)

### Dominant Change Pattern: Branded ID Adoption in Test Contexts

Most modified test files follow the same mechanical pattern -- replacing plain string IDs with branded ID constructors:

```typescript
// Before (v1.2.24)
const ctx = {
  sessionID: "test",
  messageID: "",
  // ...
}

// After (v1.2.26)
import { SessionID, MessageID } from "../../src/session/schema"
const ctx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make(""),
  // ...
}
```

**Files with this pattern (tool tests -- all identical change):**

- `test/tool/apply_patch.test.ts`
- `test/tool/bash.test.ts`
- `test/tool/edit.test.ts`
- `test/tool/external-directory.test.ts`
- `test/tool/grep.test.ts`
- `test/tool/question.test.ts`
- `test/tool/read.test.ts`
- `test/tool/webfetch.test.ts`
- `test/tool/write.test.ts`

**Files with branded IDs + other changes:**

- `test/tool/skill.test.ts` -- also adds `PartID` for skill result IDs
- `test/agent/agent.test.ts` -- wraps expect comparisons in `String()` for branded types
- `test/session/session.test.ts` -- `SessionID.make()` for session creation
- `test/session/llm.test.ts` -- branded IDs + updated mock structures
- `test/session/message-v2.test.ts` -- branded IDs, simplified assertions
- `test/session/prompt.test.ts` -- branded `ProviderID`/`ModelID`
- `test/session/retry.test.ts` -- branded session/message IDs
- `test/session/revert-compact.test.ts` -- branded IDs + updated revert flow
- `test/session/structured-output.test.ts` -- branded IDs
- `test/permission/next.test.ts` -- branded `SessionID`/`MessageID`
- `test/question/question.test.ts` -- branded `SessionID`/`MessageID`
- `test/pty/pty-session.test.ts` -- branded `SessionID`
- `test/memory/abort-leak.test.ts` -- branded `SessionID`

### Other Modifications

- `test/fixture/fixture.ts` -- Adds `git config user.email` and `git config user.name` to `tmpdir()` git init (fixes test failures in environments without global git config)
- `test/cli/github-action.test.ts` -- Updated for refactored CLI action interface
- `test/cli/import.test.ts` -- Updated import paths/structure
- `test/cli/plugin-auth-picker.test.ts` -- Minor branded ID update
- `test/config/config.test.ts` -- Expanded config test coverage (+86 lines)
- `test/control-plane/session-proxy-middleware.test.ts` -- Branded ID updates
- `test/control-plane/workspace-sync.test.ts` -- Branded ID updates
- `test/provider/provider.test.ts` -- Branded `ProviderID`/`ModelID` + restructured
- `test/provider/transform.test.ts` -- Major expansion (+181 lines) for transform logic
- `test/server/project-init-git.test.ts` -- Minor path updates
- `test/server/session-select.test.ts` -- Branded ID updates
- `test/storage/json-migration.test.ts` -- Updated for new migration flow
- `test/util/filesystem.test.ts` -- Expanded filesystem utility coverage (+52 lines)

---

## 10C: DB Migrations (3 new)

Our fork's migration directory: `packages/opencode/migration/`

**Fork's current migrations (6):**

1. `20260127222353_familiar_lady_ursula` -- initial schema
2. `20260211171708_add_project_commands` -- project commands
3. `20260213144116_wakeful_the_professor` -- unknown
4. `20260225215848_workspace` -- workspace tables
5. `20260227213759_add_session_workspace_id` -- session workspace column
6. `20260303231226_add_workspace_fields` -- workspace field expansion

**Upstream's new migrations (3):**

### Migration 1: `20260228203230_blue_harpoon` (Account Tables)

```sql
CREATE TABLE `account` (
  `id` text PRIMARY KEY,
  `email` text NOT NULL,
  `url` text NOT NULL,
  `access_token` text NOT NULL,
  `refresh_token` text NOT NULL,
  `token_expiry` integer,
  `selected_org_id` text,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL
);

CREATE TABLE `account_state` (
  `id` integer PRIMARY KEY NOT NULL,
  `active_account_id` text,
  FOREIGN KEY (`active_account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE set null
);
```

- **Purpose:** Creates account and account_state tables for the account system (Phase 4)
- **Schema export:** `storage/schema.ts` updated to export `AccountTable`, `AccountStateTable` from `@/account/account.sql`
- **Timestamp:** Feb 28 -- slots between our `add_session_workspace_id` (Feb 27) and `add_workspace_fields` (Mar 3)
- **Conflict risk:** Medium. Our fork has 3 migrations after Feb 27 that upstream doesn't have. The snapshot.json files will differ. Migration SQL itself is additive (new tables) so it should apply cleanly, but the snapshot ordering needs manual attention.

### Migration 2: `20260309230000_move_org_to_state` (Org Tracking)

```sql
ALTER TABLE `account_state` ADD `active_org_id` text;
UPDATE `account_state` SET `active_org_id` = (SELECT `selected_org_id` FROM `account` WHERE ...);
ALTER TABLE `account` DROP COLUMN `selected_org_id`;
```

- **Purpose:** Moves `selected_org_id` from `account` to `account_state` as `active_org_id`
- **Depends on:** Migration 1 (`blue_harpoon`)
- **Timestamp:** Mar 9 -- after all our fork's existing migrations

### Migration 3: `20260312043431_session_message_cursor` (Index Optimization)

```sql
DROP INDEX IF EXISTS `message_session_idx`;
DROP INDEX IF EXISTS `part_message_idx`;
CREATE INDEX `message_session_time_created_id_idx` ON `message` (`session_id`,`time_created`,`id`);
CREATE INDEX `part_message_id_id_idx` ON `part` (`message_id`,`id`);
```

- **Purpose:** Replaces simple indexes with compound indexes optimized for cursor-based message pagination
- **Depends on:** Existing message/part tables (already in our fork)
- **Timestamp:** Mar 12 -- latest migration, no conflicts

### How to Apply

Each migration needs:

1. The `migration.sql` file (small, shown above)
2. The `snapshot.json` file (large, ~1100 lines each -- full Drizzle schema snapshot)

**Strategy:**

- Copy migration 1 (`blue_harpoon`) directory -- but its snapshot.json won't include our fork's workspace migrations. We need to either:
  - (a) Regenerate snapshots by running `drizzle-kit generate` after merging schema changes, OR
  - (b) Copy upstream snapshots and manually add our workspace table entries, OR
  - (c) Copy the SQL files only and regenerate snapshots later
- Migrations 2 and 3 are straightforward copies (timestamps after our latest migration)

**Recommended approach:** Copy all 3 migration directories from upstream, then run the app to verify migrations apply cleanly. Drizzle ORM applies migrations in timestamp order, so the interleaving with our workspace migrations should work as long as there are no conflicting table modifications.

### Storage Layer Changes

The upstream also modifies 3 files in `src/storage/`:

- **`storage/schema.ts`** -- Adds `AccountTable`, `AccountStateTable` exports from `@/account/account.sql`; reorders existing exports
- **`storage/db.ts`** -- Changes `Client` type from `SQLiteBunDatabase<Schema>` to `SQLiteBunDatabase` (untyped); changes `drizzle()` call to omit `schema` parameter; changes `TxOrDb` type to use `any` for transaction generics
- **`storage/storage.ts`** -- Replaces `bun:$` shell calls with `git()` utility function for `git rev-list`

---

## 10D: Config Changes

### `tsconfig.json`

**Diff:** Adds `@effect/language-service` plugin for Effect IDE integration.

```json
"plugins": [
  {
    "name": "@effect/language-service",
    "transform": "@effect/language-service/transform",
    "namespaceImportPackages": ["effect", "@effect/*"]
  }
]
```

- **Impact:** IDE-only (provides better autocomplete/go-to-definition for Effect code)
- **Dependency:** Requires `@effect/language-service` devDependency
- **Action:** Copy after Phase 0 (Effect dependency) is done

### `package.json`

**Version bump:** `1.2.24` to `1.2.26`

**New dependencies:**

| Package                       | Type | Version    | Purpose                     |
| ----------------------------- | ---- | ---------- | --------------------------- |
| `@effect/language-service`    | dev  | `0.79.0`   | IDE plugin for Effect       |
| `@parcel/watcher-win32-arm64` | dev  | `2.5.1`    | Windows ARM64 build support |
| `@types/semver`               | dev  | `^7.5.8`   | Types for semver package    |
| `effect`                      | prod | `catalog:` | Effect runtime (Phase 0)    |
| `semver`                      | prod | `^7.6.3`   | Semantic version parsing    |

**Updated dependencies:**

| Package          | From     | To       |
| ---------------- | -------- | -------- |
| `@opentui/core`  | `0.1.86` | `0.1.87` |
| `@opentui/solid` | `0.1.86` | `0.1.87` |

- **Action:** Update version, add new deps, bump opentui. The `effect` dep uses `catalog:` (Bun workspace catalog) which is defined in the root workspace.
- **Note:** Our fork has its own version number. Only add new deps, don't change version.

### `script/build.ts`

Two changes:

1. **New build target:** Adds `{ os: "win32", arch: "arm64" }` to the target list (Windows ARM64 support)
2. **Remove sourcemap:** Removes `sourcemap: "external"` from the build config

- **Action:** Copy both changes. The Windows ARM64 target is harmless (only used when building for that platform). Removing external sourcemaps reduces binary build size.

---

## Order of Operations

```
1. package.json        -- Add new dependencies (effect, semver, @effect/language-service, etc.)
   └── bun install     -- Install new deps
2. tsconfig.json       -- Add @effect/language-service plugin
3. storage/db.ts       -- Update Client/TxOrDb types (unblocks schema changes)
4. storage/schema.ts   -- Add AccountTable exports (requires account.sql from Phase 4)
5. storage/storage.ts  -- Replace bun:$ with git() utility
6. Migrations          -- Copy 3 migration directories (blue_harpoon, move_org_to_state, session_message_cursor)
7. script/build.ts     -- Add win32-arm64 target, remove sourcemap
8. test/fixture/        -- Copy effect.ts, update fixture.ts (git user config)
9. Modified tests      -- Apply branded ID changes across all 36 files
10. New tests          -- Copy 14 new test files (some will fail until their Phase dependencies land)
```

**Critical ordering:**

- Steps 1-2 must happen before any Effect-based code (tests or source)
- Step 3-5 must happen before step 6 (schema exports needed for migrations)
- Step 4 requires Phase 4 account system source files to exist
- Step 9 requires Phase 2 branded IDs to be complete
- Step 10 (account tests) requires Phase 4 to be complete

---

## Verification

```bash
# Dependencies install cleanly
cd Agent-backend/packages/opencode && bun install

# TypeScript passes with new tsconfig
cd Agent-backend && bun turbo typecheck

# Migrations apply (start the server, it auto-migrates)
cd Agent-backend/packages/opencode && bun dev serve

# Tests pass
cd Agent-backend/packages/opencode && bun test --timeout 30000

# Build script works
cd Agent-backend/packages/opencode && bun script/build.ts
```

### Expected Test Failures Before Phase Completion

| Phase Required        | Tests That Will Fail                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 (Effect)      | `effect-zod.test.ts`, `instance-state.test.ts`, `repo.test.ts`, `service.test.ts`                                                |
| Phase 2 (Branded IDs) | All 36 modified test files + `auth.test.ts`, `migrate-global.test.ts`, `session-messages.test.ts`, `messages-pagination.test.ts` |
| Phase 4 (Account)     | `repo.test.ts`, `service.test.ts`, `share-next.test.ts`                                                                          |
