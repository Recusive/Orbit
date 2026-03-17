# ✅ Phase 2: Branded ID Adoption

## How to Execute

**All files already exist in our fork — apply upstream diffs as patches.**

For each modified file:

```bash
# 1. Get the exact diff
cd Agent-backend/upstream/repo/clone
git diff v1.2.24..v1.2.26 -- packages/opencode/src/<path>

# 2. Apply relevant hunks to our fork's copy (manual — fork may have diverged)
# 3. Rename any "opencode" → "orbit" in the new code
# 4. Verify: cd packages/opencode && bun run typecheck
```

Most changes are mechanical: `Identifier.ascending("session")` → `SessionID.descending()`, add import, done.

## Summary

Replace all raw `Identifier.ascending("session")` / `Identifier.schema("session")` / `Identifier.descending("session")` calls with branded ID types (`SessionID.descending()`, `SessionID.zod`, etc.) across 25+ files. This is a mechanical but sweeping refactor that touches every layer of the engine -- sessions, messages, permissions, tools, questions, pty, workspaces, and the control plane.

**Prerequisite:** Phase 0 (Effect dependency) must be complete. The branded ID schema files (`session/schema.ts`, `provider/schema.ts`, `permission/schema.ts`, etc.) must already exist with their `withStatics` helpers.

## What We Have Today

Our fork uses raw `Identifier` calls everywhere. Example from `src/session/index.ts`:

```ts
import { Identifier } from "../id/id"

export const Info = z.object({
  id: Identifier.schema("session"),
  // ...
  parentID: Identifier.schema("session").optional(),
})

export const fork = fn(
  z.object({
    sessionID: Identifier.schema("session"),
    messageID: Identifier.schema("message").optional(),
  }),
  async (input) => {
    // ...
    const newID = Identifier.ascending("message")
  },
)
```

The pattern is uniform:

- **Zod schemas:** `Identifier.schema("session")` for validation
- **ID generation:** `Identifier.ascending("message")` / `Identifier.descending("session")`
- **Function args:** `fn(Identifier.schema("session"), ...)` for runtime validation

These are all `string` at the type level -- no compile-time distinction between a session ID and a message ID.

## What Changes

Every `Identifier.*` call is replaced by the corresponding branded type:

| Old Pattern                                                    | New Pattern                       | Branded Type             |
| -------------------------------------------------------------- | --------------------------------- | ------------------------ |
| `Identifier.schema("session")`                                 | `SessionID.zod`                   | `SessionID`              |
| `Identifier.descending("session", id)`                         | `SessionID.descending(id)`        | `SessionID`              |
| `Identifier.ascending("message")`                              | `MessageID.ascending()`           | `MessageID`              |
| `Identifier.ascending("part")`                                 | `PartID.ascending()`              | `PartID`                 |
| `Identifier.ascending("permission")`                           | `PermissionID.ascending()`        | `PermissionID`           |
| `Identifier.ascending("question")`                             | `QuestionID.ascending()`          | `QuestionID`             |
| `Identifier.ascending("workspace")`                            | `WorkspaceID.ascending()`         | `WorkspaceID`            |
| `Identifier.ascending("tool")`                                 | `ToolID.ascending()`              | `ToolID`                 |
| `Identifier.schema("pty")` / `Identifier.create("pty", false)` | `PtyID.zod` / `PtyID.ascending()` | `PtyID`                  |
| `z.string()` (for providerID/modelID in schemas)               | `ProviderID.zod` / `ModelID.zod`  | `ProviderID` / `ModelID` |
| `z.string()` (for projectID in schemas)                        | `ProjectID.zod`                   | `ProjectID`              |

Function signatures also change from `string` to branded types:

```ts
// Before
export function cancel(sessionID: string) { ... }

// After
export function cancel(sessionID: SessionID) { ... }
```

## New Schema Files Required (Phase 0 prerequisite)

These must exist before starting Phase 2. They were introduced upstream between v1.2.24 and v1.2.26:

| File                          | Exports                            | Status in Fork        |
| ----------------------------- | ---------------------------------- | --------------------- |
| `src/session/schema.ts`       | `SessionID`, `MessageID`, `PartID` | **MISSING** -- create |
| `src/provider/schema.ts`      | `ProviderID`, `ModelID`            | **MISSING** -- create |
| `src/permission/schema.ts`    | `PermissionID`                     | **MISSING** -- create |
| `src/project/schema.ts`       | `ProjectID`                        | **MISSING** -- create |
| `src/control-plane/schema.ts` | `WorkspaceID`                      | **MISSING** -- create |
| `src/question/schema.ts`      | `QuestionID`                       | **MISSING** -- create |
| `src/pty/schema.ts`           | `PtyID`                            | **MISSING** -- create |
| `src/tool/schema.ts`          | `ToolID`                           | **MISSING** -- create |
| `src/util/schema.ts`          | `withStatics` helper               | **MISSING** -- create |

## Files to Modify

### Session Layer (HIGH impact -- core data model)

#### 1. `src/session/index.ts`

- **Import change:** Remove `Identifier` import, add `SessionID`, `MessageID`, `PartID` from `./schema`, `ProjectID` from `../project/schema`, `WorkspaceID` from `../control-plane/schema`, `ModelID`/`ProviderID` from `../provider/schema`
- **Schema changes:**
  - `Info.id`: `Identifier.schema("session")` -> `SessionID.zod`
  - `Info.projectID`: `z.string()` -> `ProjectID.zod`
  - `Info.workspaceID`: `z.string()` -> `WorkspaceID.zod`
  - `Info.parentID`: `Identifier.schema("session")` -> `SessionID.zod`
  - `Info.revert.messageID`: `z.string()` -> `MessageID.zod`
  - `Info.revert.partID`: `z.string()` -> `PartID.zod`
  - `ProjectInfo.id`: `z.string()` -> `ProjectID.zod`
  - `Event.Diff.sessionID`: `z.string()` -> `SessionID.zod`
  - `Event.Error.sessionID`: `z.string()` -> `SessionID.zod`
- **Function args:** `create`, `fork`, `touch`, `get`, `share`, `unshare`, `messages`, `updateMessage`, `updatePart`, `remove`, `children`, etc. -- all `Identifier.schema("session")` -> `SessionID.zod`
- **ID generation:** `Identifier.ascending("message")` -> `MessageID.ascending()`, `Identifier.ascending("part")` -> `PartID.ascending()`, `Identifier.descending("session")` -> `SessionID.descending()`
- **Type map:** `Map<string, string>` -> `Map<string, MessageID>` (in fork logic)
- **Other changes mixed in:** `workspaceID` parameter added to `create` and `fork` -- this is a functional change, not just branded IDs
- **~30 replacements total**

#### 2. `src/session/message-v2.ts`

- **Import change:** Remove `Identifier`, add `SessionID`, `MessageID`, `PartID` from `./schema`, `ModelID`/`ProviderID` from `../provider/schema`
- **Schema changes:**
  - `PartBase.id/sessionID/messageID`: `z.string()` -> `PartID.zod`/`SessionID.zod`/`MessageID.zod`
  - `Assistant.model.providerID/modelID`: `z.string()` -> `ProviderID.zod`/`ModelID.zod`
  - `Base.id/sessionID`: `z.string()` -> `MessageID.zod`/`SessionID.zod`
  - `User.model.providerID/modelID`: `z.string()` -> branded
  - `Assistant.parentID/modelID/providerID`: `z.string()` -> branded
  - All `Event` bus schemas: `sessionID`, `messageID`, `partID` -> branded
- **New additions mixed in:** `Cursor` type, `cursor.encode`/`cursor.decode`, `info()` helper, `list()` with pagination, `listMore()` -- these are pagination features, NOT just branded IDs. Handle separately.
- **Import change:** Also adds `SessionTable` import and `NotFoundError`, `and`, `lt`, `or` from db (for pagination)
- **~20 branded ID replacements + significant new pagination code**

#### 3. `src/session/prompt.ts`

- **Import change:** Remove `Identifier`, add `SessionID`, `MessageID`, `PartID` from `./schema`, `ModelID`/`ProviderID` from `../provider/schema`
- **Schema changes:** `PromptInput.sessionID/messageID`, `LoopInput.sessionID`, `PromptInput.model.providerID/modelID`
- **Function signatures:** `assertNotBusy(sessionID: string)` -> `assertNotBusy(sessionID: SessionID)`, `start(sessionID: string)` -> `start(sessionID: SessionID)`, `resume`, `cancel`
- **ID generation:** Many `Identifier.ascending("message")` -> `MessageID.ascending()`, `Identifier.ascending("part")` -> `PartID.ascending()`
- **Other changes mixed in:** `pathToFileURL`/`fileURLToPath` import moved from `bun` to `url` module, `decodeDataUrl` import added, metadata update returns part (minor bug fix)
- **~25 replacements**

#### 4. `src/session/processor.ts`

- **Import change:** Remove `Identifier`, add `PartID` from `./schema`, `type SessionID`/`type MessageID` from `./schema`
- **Function signature:** `create()` input `sessionID: string` -> `sessionID: SessionID`
- **ID generation:** 8x `Identifier.ascending("part")` -> `PartID.ascending()`
- **Pure branded ID changes, no other changes mixed in**

#### 5. `src/session/compaction.ts`

- **Import change:** Remove `Identifier`, add `SessionID`, `MessageID`, `PartID` from `./schema`, `ModelID`/`ProviderID` from `../provider/schema`
- **Schema changes:** `Event.Compacted.sessionID`: `z.string()` -> `SessionID.zod`
- **Function signatures:** `prune(input: { sessionID: string })` -> `prune(input: { sessionID: SessionID })`, `process()` params
- **ID generation:** `Identifier.ascending("message/part")` -> branded
- **~12 replacements**

#### 6. `src/session/revert.ts`

- **Import change:** Remove `Identifier`, add `SessionID`, `MessageID`, `PartID` from `./schema`
- **Schema changes:** `RevertInput.sessionID/messageID/partID`
- **Function signature:** `unrevert(input: { sessionID: string })` -> branded
- **~4 replacements**

#### 7. `src/session/summary.ts`

- **Import change:** Add `SessionID`, `MessageID` from `./schema` (keeps `Identifier` for other usage)
- **Schema changes:** `summarize` and `diff` input schemas
- **Function signature:** `summarizeSession(input: { sessionID: string })` -> branded
- **~4 replacements**

#### 8. `src/session/status.ts`

- **Import change:** Add `SessionID` from `./schema`
- **Schema changes:** `Event.Status.sessionID`, `Event.Idle.sessionID`
- **Function signature:** `get(sessionID: string)` -> `get(sessionID: SessionID)`
- **~3 replacements**

#### 9. `src/session/todo.ts`

- **Import change:** Add `SessionID` from `./schema`
- **Schema changes:** `Event.Updated.sessionID`
- **Function signatures:** `update(input: { sessionID: string })` -> branded, `get(sessionID: string)` -> branded
- **~3 replacements**

### Permission Layer (HIGH impact)

#### 10. `src/permission/index.ts`

- **Import change:** Remove `Identifier`, add `SessionID`, `MessageID` from `@/session/schema`, `PermissionID` from `./schema`
- **Schema changes:** `Info.id/sessionID/messageID`, `Event.Replied.sessionID/permissionID`
- **State refactor:** `Record<string, Record<string, ...>>` -> `Map<SessionID, Map<PermissionID, PendingEntry>>` and `Map<SessionID, Map<string, boolean>>`
- **Function signature changes:** `covered()` param `Record<string, boolean>` -> `Map<string, boolean>`
- **`covered()` implementation rewritten:** from `Object.keys` + `.some` to `Map.keys()` iteration
- **`respond()` logic rewritten:** from `delete pending[x][y]` to `session.delete(permissionID)` + cleanup
- **Always-approve cascade rewritten:** accumulates `toRespond` array first, then responds (avoids mutating map during iteration)
- **`RejectedError` constructor:** `sessionID: string` -> `sessionID: SessionID`, `permissionID: string` -> `permissionID: PermissionID`
- **MEDIUM functional change mixed in:** Record-to-Map refactor changes runtime behavior (Map iteration guarantees, cleanup of empty maps)
- **~20 replacements + structural refactor**

#### 11. `src/permission/next.ts`

- **Import change:** Remove `Identifier`, add `SessionID`, `MessageID` from `@/session/schema`, `PermissionID` from `./schema`, `ProjectID` from `@/project/schema`
- **Schema changes:** `Request.id/sessionID`, `Request.tool.messageID`, `Approval.projectID`, `Event.Replied.sessionID/requestID`
- **State refactor:** Same Record-to-Map pattern as `permission/index.ts`
- **ID generation:** `Identifier.ascending("permission")` -> `PermissionID.ascending()`
- **~12 replacements + structural refactor**

### Tool Layer (MEDIUM impact)

#### 12. `src/tool/registry.ts`

- **Import change:** Add `ProviderID`, `type ModelID` from `../provider/schema`
- **Function signature:** `tools(model: { providerID: string, modelID: string })` -> `tools(model: { providerID: ProviderID, modelID: ModelID })`
- **Comparison:** `model.providerID === "opencode"` -> `model.providerID === ProviderID.opencode`
- **~3 replacements**

#### 13. `src/tool/batch.ts`

- **Import change:** Add `ProviderID`, `ModelID` from `../provider/schema`
- **Dynamic import:** `Identifier` -> `PartID` from `../session/schema`
- **ID generation:** `Identifier.ascending("part")` -> `PartID.ascending()`
- **Constructor:** `{ modelID: "", providerID: "" }` -> `{ modelID: ModelID.make(""), providerID: ProviderID.make("") }`
- **~5 replacements**

#### 14. `src/tool/task.ts`

- **Import change:** Add `SessionID`, `MessageID` from `../session/schema` (keeps `Identifier` for other uses temporarily)
- **Usage:** `Session.get(params.task_id)` -> `Session.get(SessionID.make(params.task_id))`
- **ID generation:** `Identifier.ascending("message")` -> `MessageID.ascending()`
- **~3 replacements**

#### 15. `src/tool/plan.ts`

- **Import change:** Remove `Identifier`, add `type SessionID`, `MessageID`, `PartID` from `../session/schema`
- **Function signature:** `getLastModel(sessionID: string)` -> `getLastModel(sessionID: SessionID)`
- **ID generation:** 4x `Identifier.ascending("message/part")` -> branded
- **~6 replacements**

#### 16. `src/tool/truncation.ts`

- **Import change:** Add `ToolID` from `./schema`
- **ID generation:** `Identifier.ascending("tool")` -> `ToolID.ascending()`
- **~1 replacement**

### Other Layers (MEDIUM impact)

#### 17. `src/command/index.ts`

- **Import change:** Add `SessionID`, `MessageID` from `@/session/schema`
- **Schema changes:** `Event.Executed.sessionID/messageID`
- **~2 replacements**

#### 18. `src/question/index.ts`

- **Import change:** Remove `Identifier`, add `SessionID`, `MessageID` from `@/session/schema`, `QuestionID` from `./schema`
- **Schema changes:** `Request.id/sessionID`, `Request.tool.messageID`, `Event.Replied/Rejected`
- **State refactor:** Same Record-to-Map pattern as permission
- **ID generation:** `Identifier.ascending("question")` -> `QuestionID.ascending()`
- **~10 replacements + structural refactor**

#### 19. `src/pty/index.ts`

- **Import change:** Remove `Identifier`, add `PtyID` from `./schema`
- **Schema changes:** `Info.id`, `Event.Exited.id`, `Event.Deleted.id`
- **State type:** `Map<string, ActiveSession>` -> `Map<PtyID, ActiveSession>`
- **Function signature:** `get(id: string)` -> `get(id: PtyID)`
- **ID generation:** `Identifier.create("pty", false)` -> `PtyID.ascending()`
- **~6 replacements**

#### 20. `src/control-plane/types.ts`

- **Import change:** Remove `Identifier`, add `ProjectID` from `@/project/schema`, `WorkspaceID` from `./schema`
- **Schema changes:** `WorkspaceInfo.id/projectID`
- **~2 replacements**

#### 21. `src/control-plane/workspace.ts`

- **Import change:** Remove `Identifier`, add `ProjectID` from `@/project/schema`, `WorkspaceID` from `./schema`
- **Schema/function changes:** `CreateInput.id/projectID`, `create`, `get`, `remove`
- **ID generation:** `Identifier.ascending("workspace", input.id)` -> `WorkspaceID.ascending(input.id)`
- **~6 replacements**

### CLI Layer (LOW impact -- follow the same pattern)

#### 22. `src/cli/cmd/tui/component/prompt/index.tsx`

- **ID generation:** `Identifier.ascending("message/part")` -> branded
- **~4 replacements**

#### 23. `src/cli/cmd/debug/agent.ts`

- **ID generation:** `Identifier.ascending("message/part")` -> branded
- **~2 replacements**

#### 24. `src/cli/cmd/github.ts`

- **ID generation:** `Identifier.ascending("message/part")` -> branded
- **~5 replacements**

### Storage Layer (LOW impact)

#### 25. `src/storage/schema.ts`

- **Export change:** Add `AccountTable`, `AccountStateTable` re-exports (from new account system)
- **Reorder existing exports**
- **~1 line change**

## Breaking Changes

### API Response Shape Changes

- **None.** Branded IDs are string-branded at the TypeScript level. At runtime they are still plain strings. The Zod schemas (`SessionID.zod`, etc.) are wrappers around the same `Identifier.schema()` validators. JSON wire format is unchanged.

### Database Schema Changes

- **None from branded IDs.** The SQL columns remain `TEXT`. However, note that `session/message-v2.ts` adds new pagination queries (`list`, `listMore`, `Cursor`) that may have associated migration (`session_message_cursor`).

### Impact on Desktop App Frontend

- **None.** The Hono API server returns the same JSON shapes. The frontend receives plain strings. Branded IDs are a backend-internal type safety improvement only.

### Impact on SDK Client

- **Minimal.** The auto-generated SDK types in `packages/sdk/js/` may update string fields, but the runtime protocol is unchanged.

## Rename Required

No "opencode" -> "Orbit" renames are needed in these files. The branded ID changes are purely structural. However, note:

- `ProviderID.opencode` is a well-known constant for the Orbit-hosted provider. In our fork this should eventually be `ProviderID.orbit`, but that is a separate branding task.
- `src/tool/registry.ts` has `model.providerID === ProviderID.opencode` -- this comparison should stay as-is for now (it references the provider ID string "opencode" which is a protocol value, not a user-facing string).

## Execution Order

1. **Ensure schema files exist** (Phase 0 prerequisite): `session/schema.ts`, `provider/schema.ts`, `permission/schema.ts`, `project/schema.ts`, `control-plane/schema.ts`, `question/schema.ts`, `pty/schema.ts`, `tool/schema.ts`, `util/schema.ts`
2. **Core session layer first:** `session/index.ts`, `session/message-v2.ts`, `session/prompt.ts`, `session/processor.ts` -- these are the most referenced
3. **Permission layer:** `permission/index.ts`, `permission/next.ts` -- includes Map refactor
4. **Tool layer:** `tool/registry.ts`, `tool/batch.ts`, `tool/task.ts`, `tool/plan.ts`, `tool/truncation.ts`
5. **Remaining session files:** `session/compaction.ts`, `session/revert.ts`, `session/summary.ts`, `session/status.ts`, `session/todo.ts`
6. **Other layers:** `command/index.ts`, `question/index.ts`, `pty/index.ts`, `control-plane/types.ts`, `control-plane/workspace.ts`, `storage/schema.ts`
7. **CLI layer last:** `cli/cmd/tui/component/prompt/index.tsx`, `cli/cmd/debug/agent.ts`, `cli/cmd/github.ts`

## Verification

```bash
cd Agent-backend/packages/opencode

# Type check -- all branded IDs must be compatible
bun run typecheck

# Tests must pass
bun test --timeout 30000

# Search for remaining raw Identifier usage (should only be in id/id.ts and schema files)
grep -r "Identifier\.\(ascending\|descending\|schema\)" src/ --include="*.ts" | grep -v "schema.ts" | grep -v "id/id.ts"
```

## Files Changed

```
# New files (Phase 0, prerequisite)
src/session/schema.ts           (SessionID, MessageID, PartID)
src/provider/schema.ts          (ProviderID, ModelID)
src/permission/schema.ts        (PermissionID)
src/project/schema.ts           (ProjectID)
src/control-plane/schema.ts     (WorkspaceID)
src/question/schema.ts          (QuestionID)
src/pty/schema.ts               (PtyID)
src/tool/schema.ts              (ToolID)
src/util/schema.ts              (withStatics)

# Modified files (Phase 2)
src/session/index.ts
src/session/message-v2.ts       (branded IDs + NEW pagination code)
src/session/prompt.ts           (branded IDs + import path fix + metadata bug fix)
src/session/processor.ts
src/session/compaction.ts
src/session/revert.ts
src/session/summary.ts
src/session/status.ts
src/session/todo.ts
src/permission/index.ts         (branded IDs + Record-to-Map refactor)
src/permission/next.ts          (branded IDs + Record-to-Map refactor)
src/tool/registry.ts
src/tool/batch.ts
src/tool/task.ts
src/tool/plan.ts
src/tool/truncation.ts
src/command/index.ts
src/question/index.ts           (branded IDs + Record-to-Map refactor)
src/pty/index.ts
src/control-plane/types.ts
src/control-plane/workspace.ts
src/storage/schema.ts
src/cli/cmd/tui/component/prompt/index.tsx
src/cli/cmd/debug/agent.ts
src/cli/cmd/github.ts
```
