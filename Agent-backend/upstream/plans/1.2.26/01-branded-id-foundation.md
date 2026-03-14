# Phase 1: Branded ID Foundation

## Summary

Create 9 new `schema.ts` files defining branded ID types (SessionID, MessageID, PartID, ProviderID, ModelID, WorkspaceID, PermissionID, ProjectID, PtyID, QuestionID, ToolID) plus 2 utility files (`withStatics` helper and Effect-to-Zod bridge), giving compile-time type safety to IDs that are currently raw strings.

## What We Have Today

- All IDs are generated via `Identifier.ascending("prefix")` / `Identifier.descending("prefix")` in `src/id/id.ts`
- IDs are raw `string` types -- no compile-time distinction between a SessionID and a MessageID
- Zod validation schemas exist in `id.ts` via `Identifier.schema("prefix")` (returns `z.string().startsWith(...)`)
- The `src/util/` directory has 28 utility files but no `schema.ts` or `effect-zod.ts`
- No `schema.ts` file exists in any of the 9 domain directories

### Current usage example (no type safety):

```typescript
// src/session/index.ts -- today
id: Identifier.descending("session", input.id),  // returns string

// src/session/prompt.ts -- today
id: Identifier.ascending("message"),  // returns string
id: Identifier.ascending("part"),     // returns string

// Nothing prevents: sessionId = Identifier.ascending("message")  -- wrong prefix, compiles fine
```

### After this phase (compile-time safety):

```typescript
// Future (Phase 2 migration -- NOT this phase)
id: SessionID.descending(),      // returns SessionID (branded string)
id: MessageID.ascending(),       // returns MessageID (branded string)
id: PartID.ascending(),          // returns PartID (branded string)

// SessionID = MessageID.ascending()  -- TypeScript ERROR: Type 'MessageID' is not assignable to type 'SessionID'
```

## What Changes

- **2 utility files** providing infrastructure for all branded types
- **9 domain schema files** defining 11 branded ID types total
- All files are **new additions** -- no existing code is modified in this phase

### File inventory

| #   | File                          | Defines                                                                    | Depends on                           |
| --- | ----------------------------- | -------------------------------------------------------------------------- | ------------------------------------ |
| 1   | `src/util/schema.ts`          | `withStatics()` -- pipe helper to attach static methods to Effect schemas  | `effect` (Schema)                    |
| 2   | `src/util/effect-zod.ts`      | `zod()` -- converts Effect Schema AST to Zod schema (bridge function)      | `effect` (Schema, SchemaAST), `zod`  |
| 3   | `src/session/schema.ts`       | `SessionID`, `MessageID`, `PartID` -- 3 branded types                      | `effect`, `@/util/schema`, `@/id/id` |
| 4   | `src/provider/schema.ts`      | `ProviderID`, `ModelID` -- 2 branded types + well-known provider constants | `effect`, `@/util/schema`            |
| 5   | `src/control-plane/schema.ts` | `WorkspaceID` -- 1 branded type                                            | `effect`, `@/util/schema`, `@/id/id` |
| 6   | `src/permission/schema.ts`    | `PermissionID` -- 1 branded type                                           | `effect`, `@/util/schema`, `@/id/id` |
| 7   | `src/project/schema.ts`       | `ProjectID` -- 1 branded type + `global` constant                          | `effect`, `@/util/schema`            |
| 8   | `src/pty/schema.ts`           | `PtyID` -- 1 branded type                                                  | `effect`, `@/util/schema`, `@/id/id` |
| 9   | `src/question/schema.ts`      | `QuestionID` -- 1 branded type                                             | `effect`, `@/util/schema`, `@/id/id` |
| 10  | `src/tool/schema.ts`          | `ToolID` -- 1 branded type                                                 | `effect`, `@/util/schema`, `@/id/id` |

**Total: 11 branded ID types across 9 domain files.**

## New Files (create)

### 1. `src/util/schema.ts` -- withStatics helper

**Path:** `packages/opencode/src/util/schema.ts`
**Exports:** `withStatics`
**Dependencies:** `effect` (Schema namespace -- type-level only, used in generic constraint)

A generic pipe helper that attaches static methods to an Effect Schema object. Designed for the pattern:

```typescript
export const Foo = fooSchema.pipe(
  withStatics((schema) => ({
    make: (id: string) => schema.makeUnsafe(id),
    ascending: () => schema.makeUnsafe(Identifier.ascending("foo")),
  })),
)
```

This is pure utility code with no domain knowledge. 15 lines.

### 2. `src/util/effect-zod.ts` -- Effect Schema to Zod bridge

**Path:** `packages/opencode/src/util/effect-zod.ts`
**Exports:** `zod` (function)
**Dependencies:** `effect` (Schema, SchemaAST), `zod`

Walks an Effect Schema AST and produces an equivalent Zod schema. Handles: String, Number, Boolean, Null, Undefined, Any/Unknown, Never, Literal, Union, Objects (including records), Arrays, Declaration, and Optional. Preserves descriptions and identifier metadata via `.describe()` and `.meta({ ref })`.

This bridge allows the branded types to expose a `.zod` property so existing Zod-based validation (Hono validators, API schemas, Drizzle) continues working without modification. ~90 lines.

### 3. `src/session/schema.ts` -- SessionID, MessageID, PartID

**Path:** `packages/opencode/src/session/schema.ts`
**Exports:** `SessionID` (type + value), `MessageID` (type + value), `PartID` (type + value)
**Dependencies:** `effect` (Schema), `zod`, `@/util/schema` (withStatics), `@/id/id` (Identifier)

Three branded string types for the session domain:

| Type        | Brand         | ID Direction | Prefix |
| ----------- | ------------- | ------------ | ------ |
| `SessionID` | `"SessionID"` | descending   | `ses_` |
| `MessageID` | `"MessageID"` | ascending    | `msg_` |
| `PartID`    | `"PartID"`    | ascending    | `prt_` |

Each exposes:

- `.make(id: string)` -- wrap an existing string as branded type
- `.ascending(id?)` or `.descending(id?)` -- generate new ID (delegates to `Identifier`)
- `.zod` -- Zod schema for validation (uses `Identifier.schema()` + `z.custom<T>()`)

### 4. `src/provider/schema.ts` -- ProviderID, ModelID

**Path:** `packages/opencode/src/provider/schema.ts`
**Exports:** `ProviderID` (type + value), `ModelID` (type + value)
**Dependencies:** `effect` (Schema), `zod`, `@/util/schema` (withStatics)

Two branded string types. `ProviderID` is unique in that it does NOT use `Identifier.ascending/descending` -- provider IDs are well-known slugs (not generated). It also exposes pre-made constants for all known providers:

| Constant                   | Value                         |
| -------------------------- | ----------------------------- |
| `.anthropic`               | `"anthropic"`                 |
| `.openai`                  | `"openai"`                    |
| `.google`                  | `"google"`                    |
| `.googleVertex`            | `"google-vertex"`             |
| `.githubCopilot`           | `"github-copilot"`            |
| `.githubCopilotEnterprise` | `"github-copilot-enterprise"` |
| `.amazonBedrock`           | `"amazon-bedrock"`            |
| `.azure`                   | `"azure"`                     |
| `.openrouter`              | `"openrouter"`                |
| `.mistral`                 | `"mistral"`                   |
| `.opencode`                | `"opencode"`                  |

`ModelID` has only `.make(id)` and `.zod` -- model IDs are free-form strings like `"claude-sonnet-4-20250514"`.

### 5. `src/control-plane/schema.ts` -- WorkspaceID

**Path:** `packages/opencode/src/control-plane/schema.ts`
**Exports:** `WorkspaceID` (type + value)
**Dependencies:** `effect` (Schema), `zod`, `@/util/schema` (withStatics), `@/id/id` (Identifier)

Single branded type for workspace IDs. Ascending, prefix `wrk_`.

### 6. `src/permission/schema.ts` -- PermissionID

**Path:** `packages/opencode/src/permission/schema.ts`
**Exports:** `PermissionID` (type + value)
**Dependencies:** `effect` (Schema), `zod`, `@/util/schema` (withStatics), `@/id/id` (Identifier)

Single branded type for permission IDs. Ascending, prefix `per_`.

### 7. `src/project/schema.ts` -- ProjectID

**Path:** `packages/opencode/src/project/schema.ts`
**Exports:** `ProjectID` (type + value)
**Dependencies:** `effect` (Schema), `zod`, `@/util/schema` (withStatics)

Single branded type for project IDs. Does NOT use `Identifier` -- project IDs are arbitrary strings. Exposes `.global` constant (`schema.makeUnsafe("global")`) for the global project context.

### 8. `src/pty/schema.ts` -- PtyID

**Path:** `packages/opencode/src/pty/schema.ts`
**Exports:** `PtyID` (type + value)
**Dependencies:** `effect` (Schema), `zod`, `@/util/schema` (withStatics), `@/id/id` (Identifier)

Single branded type for pseudo-terminal IDs. Ascending, prefix `pty_`.

### 9. `src/question/schema.ts` -- QuestionID

**Path:** `packages/opencode/src/question/schema.ts`
**Exports:** `QuestionID` (type + value)
**Dependencies:** `effect` (Schema), `zod`, `@/util/schema` (withStatics), `@/id/id` (Identifier)

Single branded type for question IDs. Ascending, prefix `que_`.

### 10. `src/tool/schema.ts` -- ToolID

**Path:** `packages/opencode/src/tool/schema.ts`
**Exports:** `ToolID` (type + value)
**Dependencies:** `effect` (Schema), `zod`, `@/util/schema` (withStatics), `@/id/id` (Identifier)

Single branded type for tool IDs. Ascending, prefix `tool_`.

## Rename Required

**One rename in `src/provider/schema.ts`:**

The upstream file defines a well-known provider constant:

```typescript
opencode: schema.makeUnsafe("opencode"),
```

This is an internal provider ID string (not user-facing UI text), but it references the "opencode" brand. Per our convention:

- **Rename the property name:** `opencode` -> `orbit`
- **Rename the value:** `"opencode"` -> `"orbit"`

The full line becomes:

```typescript
orbit: schema.makeUnsafe("orbit"),
```

**No other schema files contain "opencode" references.** The remaining 9 files are brand-neutral.

> **Note:** This rename is cosmetic within the schema file itself. The actual impact on provider registration code (which maps provider IDs to SDK adapters) happens in a later phase when those files are migrated to use `ProviderID.orbit` instead of the string literal `"opencode"`.

## Breaking Changes

- **None.** All 11 files are new additions. No existing code is modified. No existing imports change.
- The branded types are additive -- existing `string` IDs continue to work. The migration from raw strings to branded types happens in Phase 2 (not this phase).
- The `effect-zod.ts` bridge is a new module that nothing imports yet. It will be consumed once schema files are used.

## Verification

```bash
# 1. All files created (from packages/opencode/)
ls -la src/util/schema.ts src/util/effect-zod.ts \
       src/session/schema.ts src/provider/schema.ts \
       src/control-plane/schema.ts src/permission/schema.ts \
       src/project/schema.ts src/pty/schema.ts \
       src/question/schema.ts src/tool/schema.ts

# 2. TypeScript compiles with new files
cd /Users/no9labs/Developer/Recursive/Snowflake-v0/Agent-backend/packages/opencode
bun run typecheck
# Expected: no errors (files are self-contained, no existing code imports them yet)

# 3. Branded types work at runtime
bun -e "
import { SessionID, MessageID } from './src/session/schema.ts'
import { ProviderID } from './src/provider/schema.ts'

const sid = SessionID.descending()
const mid = MessageID.ascending()
console.log('SessionID:', sid)
console.log('MessageID:', mid)
console.log('ProviderID.orbit:', ProviderID.orbit)
console.log('All branded IDs working')
"

# 4. Effect-to-Zod bridge works
bun -e "
import { zod } from './src/util/effect-zod.ts'
import { Schema } from 'effect'
const s = Schema.String.pipe(Schema.brand('Test'))
const z = zod(s)
console.log('Zod schema from Effect:', z.parse('hello'))
"

# 5. Existing tests still pass
bun test --timeout 30000
```

## Files Changed

| File                                            | Status  | What it defines                                        |
| ----------------------------------------------- | ------- | ------------------------------------------------------ |
| `packages/opencode/src/util/schema.ts`          | **NEW** | `withStatics()` pipe helper                            |
| `packages/opencode/src/util/effect-zod.ts`      | **NEW** | `zod()` Effect-to-Zod bridge                           |
| `packages/opencode/src/session/schema.ts`       | **NEW** | `SessionID`, `MessageID`, `PartID`                     |
| `packages/opencode/src/provider/schema.ts`      | **NEW** | `ProviderID`, `ModelID` (rename `opencode` -> `orbit`) |
| `packages/opencode/src/control-plane/schema.ts` | **NEW** | `WorkspaceID`                                          |
| `packages/opencode/src/permission/schema.ts`    | **NEW** | `PermissionID`                                         |
| `packages/opencode/src/project/schema.ts`       | **NEW** | `ProjectID`                                            |
| `packages/opencode/src/pty/schema.ts`           | **NEW** | `PtyID`                                                |
| `packages/opencode/src/question/schema.ts`      | **NEW** | `QuestionID`                                           |
| `packages/opencode/src/tool/schema.ts`          | **NEW** | `ToolID`                                               |
