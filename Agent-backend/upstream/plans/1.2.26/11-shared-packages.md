# ✅ Phase 11: Shared Package Updates (plugin + util)

## How to Execute

**2 small changes — apply diffs to plugin SDK, copy 1 new file to util.**

```bash
cd Agent-backend/upstream/repo/clone

# Plugin — get diffs and apply to our fork
git diff v1.2.24..v1.2.26 -- packages/plugin/src/index.ts
git diff v1.2.24..v1.2.26 -- packages/plugin/src/example.ts
git diff v1.2.24..v1.2.26 -- packages/plugin/tsconfig.json
git diff v1.2.24..v1.2.26 -- packages/plugin/package.json

# Util — copy new file
git show v1.2.26:packages/util/src/module.ts > ../../packages/util/src/module.ts
```

Then apply Phase 12 import rewrite (`@opencode-ai/*` → `@orbit.build/*`) on any copied file.

## Summary

Two shared packages outside the engine changed in v1.2.26. These are small but needed — the plugin SDK won't work in strict ESM environments without the fix, and `module.ts` is used by the plugin installation system.

## What We Have Today

**`packages/plugin/`** — Plugin SDK (`@orbit.build/plugin`, published v0.0.5 on npm)

- `src/index.ts` imports use `"./shell"` and `"./tool"` (no `.js` extension)
- `tsconfig.json` uses `"module": "preserve"`, `"moduleResolution": "bundler"`

**`packages/util/`** — Shared utilities (`@orbit.build/util`)

- Has `src/` with: array.ts, encoding.ts, error.ts, lazy.ts, path.ts, retry.ts, slug.ts
- No `module.ts` exists

## Changes

### 11A: Plugin SDK ESM Fix (4 files)

| File             | Change                                                                                             | Why                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/index.ts`   | `"./shell"` → `"./shell.js"`, `"./tool"` → `"./tool.js"`, `export * from "./tool"` → `"./tool.js"` | Node.js ESM strict mode requires `.js` extensions for local imports |
| `src/example.ts` | Same `.js` extension fix on local imports                                                          | ESM                                                                 |
| `tsconfig.json`  | `"module": "nodenext"`, `"moduleResolution": "nodenext"`                                           | Modern Node ESM resolution                                          |
| `package.json`   | Version bump 0.0.5 → match upstream                                                                | Consistency                                                         |

**Note:** Our plugin `src/index.ts` already uses `@orbit.build/*` imports (not `@opencode-ai/*`). The ESM fix is only about adding `.js` extensions to local imports within the plugin package itself.

### 11B: New Util Module (1 file)

| File                            | What                                                                                           | Why                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/module.ts` (NEW, 10 lines) | `Module.resolve(id, dir)` — resolves package IDs from a directory using Node's `createRequire` | Used by `installation/index.ts` for plugin dependency resolution |

```typescript
// The full file (10 lines):
import { createRequire } from "node:module"
import path from "node:path"

export namespace Module {
  export function resolve(id: string, dir: string) {
    try {
      return createRequire(path.join(dir, "package.json")).resolve(id)
    } catch {}
  }
}
```

## Breaking Changes

None.

## Rename Required

- `module.ts` has no `opencode` references — clean copy.
- Plugin files already use `@orbit.build/*` — no rename needed.

## Verification

```bash
# Plugin typechecks
cd Agent-backend/packages/plugin && bun run typecheck

# Util typechecks
cd Agent-backend/packages/util && bun run typecheck

# Module resolves correctly
cd Agent-backend/packages/util
bun -e "import { Module } from './src/module'; console.log(typeof Module.resolve)"
# Expected: "function"
```

## Files Changed

| Package            | File             | Type     |
| ------------------ | ---------------- | -------- |
| `packages/plugin/` | `src/index.ts`   | Modified |
| `packages/plugin/` | `src/example.ts` | Modified |
| `packages/plugin/` | `tsconfig.json`  | Modified |
| `packages/plugin/` | `package.json`   | Modified |
| `packages/util/`   | `src/module.ts`  | **New**  |
