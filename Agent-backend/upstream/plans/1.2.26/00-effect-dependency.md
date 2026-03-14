# Phase 0: Add Effect.ts Dependency

## Summary

Add the `effect` package (v4.0.0-beta.31) and its language service plugin to the monorepo, establishing the foundation all subsequent branded-type phases depend on.

## What We Have Today

- **No `effect` packages anywhere** -- not in root catalog, not in `packages/opencode/package.json`, not in `tsconfig.json`
- Current relevant dependencies in `packages/opencode/package.json`:
  - `zod: "catalog:"` (4.1.8 via root catalog) -- runtime validation, used everywhere
  - `ai: "catalog:"` (5.0.124) -- Vercel AI SDK core
  - `drizzle-orm` (1.0.0-beta.16-ea816b6) -- SQLite ORM
  - `@opentui/core` + `@opentui/solid` (0.1.86) -- TUI framework
  - `solid-js: "catalog:"` (1.9.10) -- TUI rendering
  - `ulid: "catalog:"` (3.0.1) -- used by `src/id/id.ts` indirectly (custom implementation, not the `ulid` package)
- Root `package.json` catalog has no `effect` entry
- `packages/opencode/tsconfig.json` has no `plugins` array

## What Changes

### 1. Root `package.json` -- add `effect` to workspace catalog

Add to the `"catalog"` object:

```json
"effect": "4.0.0-beta.31"
```

This makes `"effect": "catalog:"` available to all workspace packages.

### 2. `packages/opencode/package.json` -- add two dependencies

**dependencies** (runtime -- Effect Schema is used at runtime for branded type construction):

```json
"effect": "catalog:"
```

**devDependencies** (editor tooling only):

```json
"@effect/language-service": "0.79.0"
```

### 3. `packages/opencode/tsconfig.json` -- add language service plugin

Add a `plugins` array to `compilerOptions`:

```json
"plugins": [
  {
    "name": "@effect/language-service",
    "transform": "@effect/language-service/transform",
    "namespaceImportPackages": ["effect", "@effect/*"]
  }
]
```

This gives IDE support (autocomplete, go-to-definition) for Effect's namespace imports like `Schema.String`, `Schema.brand()`, etc. It does NOT affect compilation -- `tsgo --noEmit` ignores plugins.

## Steps

### Step 1: Add `effect` to root catalog

Edit `/Users/no9labs/Developer/Recursive/Snowflake-v0/Agent-backend/package.json`:

In the `"catalog"` object, after the `"drizzle-orm"` line, add:

```json
"effect": "4.0.0-beta.31",
```

### Step 2: Add dependencies to opencode package.json

Edit `/Users/no9labs/Developer/Recursive/Snowflake-v0/Agent-backend/packages/opencode/package.json`:

In `"dependencies"`, after the `"drizzle-orm"` line, add:

```json
"effect": "catalog:",
```

In `"devDependencies"`, after the `"@babel/core"` line, add:

```json
"@effect/language-service": "0.79.0",
```

### Step 3: Add tsconfig plugin

Edit `/Users/no9labs/Developer/Recursive/Snowflake-v0/Agent-backend/packages/opencode/tsconfig.json`:

Replace the current `compilerOptions` closing to add the `plugins` array:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "@tsconfig/bun/tsconfig.json",
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@opentui/solid",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "types": [],
    "noUncheckedIndexedAccess": false,
    "customConditions": ["browser"],
    "paths": {
      "@/*": ["./src/*"],
      "@tui/*": ["./src/cli/cmd/tui/*"]
    },
    "plugins": [
      {
        "name": "@effect/language-service",
        "transform": "@effect/language-service/transform",
        "namespaceImportPackages": ["effect", "@effect/*"]
      }
    ]
  }
}
```

### Step 4: Install

```bash
cd /Users/no9labs/Developer/Recursive/Snowflake-v0/Agent-backend
bun install
```

## Breaking Changes

- **None.** This only adds a new dependency. No existing code is modified.
- Effect v4 beta is ESM-only, which aligns with our `"type": "module"` config.
- Effect v4 beta has zero transitive dependencies (it is a single package).

## Rename Required

- **None for this phase.** No user-facing strings are introduced.

## Verification

```bash
# 1. Install succeeds
cd /Users/no9labs/Developer/Recursive/Snowflake-v0/Agent-backend
bun install

# 2. Effect resolves correctly
cd packages/opencode
bun -e "import { Schema } from 'effect'; console.log(typeof Schema.String)"
# Expected: "object"

# 3. TypeScript still compiles
cd packages/opencode
bun run typecheck
# Expected: no new errors

# 4. Existing tests still pass
cd packages/opencode
bun test --timeout 30000
# Expected: same results as before
```

## Files Changed

| File                                            | Change                                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Agent-backend/package.json`                    | Add `"effect": "4.0.0-beta.31"` to catalog                                                            |
| `Agent-backend/packages/opencode/package.json`  | Add `"effect": "catalog:"` to dependencies, `"@effect/language-service": "0.79.0"` to devDependencies |
| `Agent-backend/packages/opencode/tsconfig.json` | Add `plugins` array with `@effect/language-service`                                                   |
| `Agent-backend/bun.lockb`                       | Updated by `bun install` (binary lockfile)                                                            |
