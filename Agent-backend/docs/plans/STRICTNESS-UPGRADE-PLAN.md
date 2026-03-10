# Agent-Backend: Strictness Upgrade Plan

## Goal

Bring `Agent-backend/` up to the same code quality and strictness level as our primary repo (`Snowflake-v0/`). The primary repo enforces `tseslint.configs.strictTypeChecked` + `stylisticTypeChecked` with 20+ explicit rules, zero tolerance for `any`, and structured logging. This repo currently has **zero linting** — not even an ESLint config file exists.

## Important Context

- This is a **Bun monorepo** with Turbo orchestration — NOT React.
- The TUI uses **SolidJS + opentui** for terminal rendering; the engine is plain TypeScript.
- Type checking uses **`tsgo`** (Microsoft's Go port of `tsc`) — keep it, it's 10x faster and same rules as `tsc`.
- Auto-generated SDK files (`packages/sdk/js/src/gen/`, `packages/sdk/js/src/v2/gen/`) must be **excluded** from linting.
- Reference packages (`packages/app/`, `packages/desktop/`, `packages/ui/`) are **read-only** — do NOT lint or modify them.
- The CLI code (`packages/opencode/src/cli/`) legitimately uses `console.log` for user output — allow it there.
- Test files (`packages/opencode/test/`) should have relaxed `no-unsafe-*` rules (same as Orbit).

## Current State (Verified Counts)

### Violations

| Pattern                            | Count   | Files | Worst Offenders                                                                                                                |
| ---------------------------------- | ------- | ----- | ------------------------------------------------------------------------------------------------------------------------------ |
| `: any` or `as any` (engine src)   | **136** | 39    | `provider/provider.ts` (16), `util/log.ts` (11), `provider/transform.ts` (8), `plugin/copilot.ts` (8), `session/prompt.ts` (8) |
| `: any` or `as any` (all packages) | **215** | 50    | Includes tests (81 in `transform.test.ts` alone) and auto-generated SDK                                                        |
| `@ts-ignore` / `@ts-expect-error`  | **18**  | 12    | `provider/provider.ts` (4), `provider/models.ts` (2), `session/index.ts` (2), `plugin/index.ts` (2)                            |
| `console.log/warn/error`           | **107** | 13    | `cli/cmd/stats.ts` (41), `cli/cmd/github.ts` (42) — these are CLI commands, expected                                           |

### What's Missing vs Orbit

| Missing                        | Orbit Has                                                        | Impact                                                                     |
| ------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **ESLint** (zero config)       | `strictTypeChecked` + `stylisticTypeChecked` + 20 explicit rules | No static analysis for unsafe patterns                                     |
| **`noUncheckedIndexedAccess`** | `true` (via `@tsconfig/bun`)                                     | `false` override in tsconfig — `array[0]` returns `T` not `T \| undefined` |
| **Pre-commit hook**            | Lint + format on commit                                          | Only pre-push (typecheck only)                                             |
| **Import ordering**            | `import-x/order` with groups + alphabetize                       | No import organization                                                     |
| **Consistent type imports**    | `consistent-type-imports` enforced                               | `import type {}` not enforced                                              |
| **Explicit return types**      | `explicit-function-return-type` on exports                       | No return type enforcement                                                 |
| **Strict boolean expressions** | `strict-boolean-expressions`                                     | Implicit truthy checks allowed                                             |
| **Exhaustive switches**        | `switch-exhaustiveness-check`                                    | Missing cases not caught                                                   |
| **No floating promises**       | `no-floating-promises`                                           | Unhandled promises not caught                                              |
| **Structured logging**         | `createLogger('Name')` required                                  | `console.log` used directly (engine code)                                  |
| **Dead code analysis** (Knip)  | Configured and running                                           | No unused file/export detection                                            |

### What EXISTS and Works

| Tool                                        | Status                                |
| ------------------------------------------- | ------------------------------------- |
| TypeScript (`tsgo`) with `strict: true`     | Working — pre-push hook runs it       |
| Prettier (`semi: false`, `printWidth: 120`) | Config exists but no enforcement hook |
| Bun test                                    | Working from `packages/opencode/`     |
| Turbo orchestration                         | Working for `typecheck` and `build`   |

### Junk in `packages/opencode/package.json` (Clean Up)

These scripts are fake/broken and should be removed or replaced:

```json
"random": "echo 'Random script updated at...'",        // Junk
"lint": "echo 'Running lint checks...' && bun test --coverage",  // FAKE — runs tests, not lint
"format": "echo 'Formatting code...' && bun run --prettier --write src/**/*.ts",  // Broken syntax
"docs": "echo 'Generating documentation...' && find src -name '*.ts' -exec echo 'Processing: {}' \\;",  // Useless
"deploy": "echo 'Deploying application...' && bun run build && echo 'Deployment completed successfully'"  // Dead
```

Also remove: `"randomField": "this-is-a-random-value-12345"` (line 25).

---

## Execution Plan

### Phase 1: Infrastructure Setup (Non-Breaking)

**Goal:** Install ESLint, create config, add scripts — but don't enforce yet. Everything should pass with the current codebase (all rules set to `warn` initially or excluded).

#### Step 1.1: Clean up `packages/opencode/package.json`

Remove these scripts: `random`, `lint` (the fake one), `format`, `docs`, `deploy`.
Remove: `"randomField": "this-is-a-random-value-12345"`.

#### Step 1.2: Install ESLint dependencies

From repo root:

```bash
bun add -d eslint @eslint/js typescript-eslint eslint-plugin-import-x
```

**Do NOT install React/React Hooks plugins** — this is not a React codebase. The engine is plain TS, the TUI is SolidJS.

#### Step 1.3: Create `eslint.config.ts` at repo root

Model after Orbit's config but adapted for this codebase:

```typescript
import eslint from "@eslint/js"
import { defineConfig } from "eslint/config"
import importPlugin from "eslint-plugin-import-x"
import tseslint from "typescript-eslint"

export default defineConfig(
  {
    ignores: [
      "dist/",
      "node_modules/",
      "*.config.js",
      "*.config.mjs",
      // Reference packages — read-only, do not lint
      "packages/app/",
      "packages/desktop/",
      "packages/ui/",
      // Auto-generated SDK code
      "packages/sdk/js/src/gen/",
      "packages/sdk/js/src/v2/gen/",
      // Migration files
      "packages/opencode/migration/",
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: {
      // @ts-expect-error - Plugin types have legacy config format incompatibility
      "import-x": importPlugin,
    },
    rules: {
      /* TypeScript strict — MATCH ORBIT */
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/restrict-template-expressions": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/strict-boolean-expressions": [
        "error",
        { allowNullableBoolean: true, allowNullableString: true },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-non-null-assertion": "error",

      /* Imports */
      "import-x/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index", "type"],
          "newlines-between": "always",
          alphabetize: { order: "asc" },
        },
      ],
      "import-x/no-duplicates": "error",
      "import-x/consistent-type-specifier-style": ["error", "prefer-top-level"],

      /* General */
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
    },
  },
  /* Test files — relaxed type checking */
  {
    files: ["**/test/**/*.ts", "**/*.test.ts", "**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  /* CLI commands — console.log is expected output */
  {
    files: ["packages/opencode/src/cli/**/*.ts", "packages/opencode/src/util/log.ts"],
    rules: {
      "no-console": "off",
    },
  },
  /* TUI (SolidJS) — may need relaxed rules */
  {
    files: ["packages/opencode/src/cli/cmd/tui/**/*.ts"],
    rules: {
      // SolidJS patterns may trigger some rules differently than expected
      "@typescript-eslint/no-unnecessary-condition": "off",
    },
  },
)
```

#### Step 1.4: Add lint scripts

**Root `package.json`:**

```json
"scripts": {
  "lint": "eslint .",
  "lint:fix": "eslint . --fix"
}
```

**`packages/opencode/package.json`** — replace the fake lint script:

```json
"lint": "eslint src/"
```

#### Step 1.5: Verify ESLint runs

```bash
bun run lint 2>&1 | head -100
```

Expect hundreds of errors. This is the baseline. Count them.

---

### Phase 2: TypeScript Strictness (Moderate Risk)

**Goal:** Enable `noUncheckedIndexedAccess` and fix the resulting type errors.

#### Step 2.1: Enable `noUncheckedIndexedAccess`

In `packages/opencode/tsconfig.json`, change:

```json
"noUncheckedIndexedAccess": true
```

#### Step 2.2: Run type checker and fix errors

```bash
cd packages/opencode && bun run typecheck 2>&1 | head -200
```

Every `array[index]` access will now return `T | undefined` instead of `T`. Fix patterns:

```typescript
// Before (unsafe)
const item = array[0]
item.doSomething()

// After (safe)
const item = array[0]
if (item) {
  item.doSomething()
}

// Or with nullish coalescing
const name = items[0]?.name ?? "default"
```

**Expected impact:** This will touch many files. It's the single highest-value strictness change.

#### Step 2.3: Verify all tests still pass

```bash
cd packages/opencode && bun test --timeout 30000
```

---

### Phase 3: Fix `any` Usages (High Effort — File by File)

**Goal:** Eliminate all 136 `any` usages in engine source code.

#### Priority Order (by file severity)

Work through files from worst to cleanest. For each file:

1. Read the file to understand why `any` was used
2. Replace with proper types (generics, `unknown`, specific interfaces)
3. Run typecheck after each file
4. Run tests to verify no regressions

| Priority | File                        | Count | Notes                                          |
| -------- | --------------------------- | ----- | ---------------------------------------------- |
| 1        | `provider/provider.ts`      | 16    | Provider registry — needs AI SDK type imports  |
| 2        | `util/log.ts`               | 11    | Logging utility — likely `unknown` or generics |
| 3        | `provider/transform.ts`     | 8     | Response transforms — AI SDK types             |
| 4        | `plugin/copilot.ts`         | 8     | Copilot plugin — external API types            |
| 5        | `session/prompt.ts`         | 8     | Prompt building — message types                |
| 6        | `storage/json-migration.ts` | 6     | Legacy migration — `unknown` + type guards     |
| 7        | `installation/index.ts`     | 5     | Installation detection                         |
| 8        | `lsp/index.ts`              | 4     | LSP — `vscode-languageserver-types`            |
| 9        | `bus/index.ts`              | 3     | Event bus — generics                           |
| 10       | `lsp/server.ts`             | 3     | LSP server                                     |

**Common replacement strategies:**

| `any` Pattern           | Replacement                                     |
| ----------------------- | ----------------------------------------------- |
| `catch (e: any)`        | `catch (e: unknown)` + type narrowing           |
| `as any` to bypass type | Find the real type from the library             |
| Function params `: any` | Use generics `<T>` or `unknown`                 |
| `Record<string, any>`   | `Record<string, unknown>` or specific interface |
| AI SDK callback params  | Import types from `@ai-sdk/provider`            |
| JSON parsed data        | `unknown` + Zod validation or type guards       |

**Files that are likely AUTO-GENERATED and should be EXCLUDED, not fixed:**

- `packages/sdk/js/src/gen/**` — auto-generated from OpenAPI spec
- `packages/sdk/js/src/v2/gen/**` — auto-generated v2 client

---

### Phase 4: Fix `@ts-ignore` / `@ts-expect-error` (18 Occurrences)

**Goal:** Remove all suppression comments by fixing underlying type issues.

For each one:

1. Read the suppressed line and the error it hides
2. Fix the type error properly
3. Remove the suppression comment
4. Run typecheck

| File                   | Count | Likely Cause           |
| ---------------------- | ----- | ---------------------- |
| `provider/provider.ts` | 4     | AI SDK type mismatches |
| `provider/models.ts`   | 2     | Model definition types |
| `session/index.ts`     | 2     | Session lifecycle      |
| `plugin/index.ts`      | 2     | Plugin loading         |
| Others (8 files × 1)   | 8     | Various                |

---

### Phase 5: Structured Logging (Engine Code Only)

**Goal:** Replace `console.log` in engine source code with a structured logger. CLI commands keep `console.log`.

#### Step 5.1: Audit `util/log.ts`

The codebase already has a logging utility at `packages/opencode/src/util/log.ts`. Understand what it provides and whether it's sufficient as a structured logger.

#### Step 5.2: Classify console usage

The 107 `console.*` calls break down as:

- **CLI commands** (~95): `cli/cmd/stats.ts` (41), `cli/cmd/github.ts` (42), others — these are **expected and should stay** (user-facing output)
- **Engine code** (~12): These should use structured logging

Only fix engine-internal code. CLI commands that print to stdout keep `console.log`.

#### Step 5.3: Replace engine console calls

For non-CLI files that use `console.*`, switch to the structured logger from `util/log.ts`.

---

### Phase 6: Pre-Commit Hook + CI Scripts

**Goal:** Prevent regressions with hooks and scripts.

#### Step 6.1: Add pre-commit hook

Create `.husky/pre-commit`:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Lint staged files (fast — only changed files)
bunx lint-staged
```

Install lint-staged:

```bash
bun add -d lint-staged
```

Add to root `package.json`:

```json
"lint-staged": {
  "*.ts": ["eslint --fix", "prettier --write"],
  "*.tsx": ["eslint --fix", "prettier --write"]
}
```

#### Step 6.2: Update root `package.json` scripts

```json
"scripts": {
  "lint": "eslint .",
  "lint:fix": "eslint . --fix",
  "check": "bun turbo typecheck && bun run lint",
  "ci": "bun turbo typecheck && bun run lint && cd packages/opencode && bun test --timeout 30000"
}
```

#### Step 6.3: Update pre-push hook

The existing `.husky/pre-push` runs `bun typecheck`. Add lint:

```bash
bun turbo typecheck && bun run lint
```

---

### Phase 7: Validation

**Goal:** Verify everything works end to end.

```bash
# 1. Type checking passes
bun turbo typecheck

# 2. Linting passes with zero errors
bun run lint

# 3. All tests pass
cd packages/opencode && bun test --timeout 30000

# 4. Build still works
cd packages/opencode && bun run build

# 5. Pre-commit hook works
echo "test" >> /tmp/test-file && git add -A && git commit -m "test" --dry-run
```

---

## Rules for This Session

1. **Work phase by phase.** Complete each phase before moving to the next.
2. **Run typecheck after every file change.** Don't accumulate errors.
3. **Run tests after each phase.** Catch regressions early.
4. **Do NOT modify reference packages** (`packages/app/`, `packages/desktop/`, `packages/ui/`).
5. **Do NOT modify auto-generated files** (`packages/sdk/js/src/gen/`, `packages/sdk/js/src/v2/gen/`).
6. **Keep `tsgo`** — do not switch to `tsc`. Same rules, faster.
7. **CLI commands keep `console.log`** — only engine code needs structured logging.
8. **Fix types properly** — don't just swap `any` for `unknown` blindly. Understand what type should actually be there.
9. **Preserve style conventions** — no semicolons, `printWidth: 120`, early returns, no destructuring, single-word names.
10. **Commit after each phase** — so we can revert if needed.

## Target State

When done, this repo should have:

- [x] ESLint with `strictTypeChecked` + `stylisticTypeChecked` (matching Orbit)
- [x] Zero `any` in engine source code
- [x] Zero `@ts-ignore` / `@ts-expect-error`
- [x] `noUncheckedIndexedAccess: true`
- [x] Structured logging in engine code
- [x] Import ordering enforced
- [x] Consistent type imports enforced
- [x] Explicit return types on exports
- [x] Strict boolean expressions
- [x] Exhaustive switch statements
- [x] No floating promises
- [x] Pre-commit hook (lint-staged + prettier)
- [x] `check` and `ci` scripts
- [x] Clean `package.json` (no junk scripts)

## Reference Files

| File                                            | Purpose                                                 |
| ----------------------------------------------- | ------------------------------------------------------- |
| `Snowflake-v0/eslint.config.ts`                 | **THE TARGET** — Orbit's ESLint config with all rules   |
| `Agent-backend/CLAUDE.md`                       | Current code quality status and gap analysis            |
| `Agent-backend/AGENTS.md`                       | Style conventions (advisory — we're adding enforcement) |
| `Agent-backend/packages/opencode/tsconfig.json` | TypeScript config to modify                             |
| `Agent-backend/packages/opencode/package.json`  | Scripts to clean up                                     |
| `Agent-backend/.husky/pre-push`                 | Existing hook to extend                                 |
