# Linting & Code Quality

> **Last Updated:** January 2026
> **Purpose:** Documentation of linting, formatting, git hooks, and CI/CD configuration

---

## Overview

Orbit uses a comprehensive quality assurance stack:

- **TypeScript** - Maximum strictness configuration
- **ESLint** - Strict type-checked rules
- **Prettier** - Consistent code formatting
- **Husky** - Git hooks for pre-commit/pre-push
- **CI/CD** - 17 parallel GitHub Actions jobs

---

## TypeScript Configuration

### Compiler Options (`tsconfig.json`)

| Option             | Value     | Purpose                             |
| ------------------ | --------- | ----------------------------------- |
| `target`           | ES2022    | Modern JavaScript output            |
| `module`           | ESNext    | Native ES modules                   |
| `moduleResolution` | bundler   | Vite-compatible resolution          |
| `jsx`              | react-jsx | React 19 JSX transform              |
| `noEmit`           | true      | Type-check only (Vite handles emit) |

### Maximum Strictness Settings

All strict flags are enabled:

| Flag                                 | Status   | Description                                  |
| ------------------------------------ | -------- | -------------------------------------------- |
| `strict`                             | Enabled  | Enables all strict type-checking options     |
| `noUncheckedIndexedAccess`           | Enabled  | Array/object indexing may return `undefined` |
| `noImplicitReturns`                  | Enabled  | All code paths must return a value           |
| `noFallthroughCasesInSwitch`         | Enabled  | No implicit fallthrough in switch            |
| `noUnusedLocals`                     | Enabled  | Error on unused local variables              |
| `noUnusedParameters`                 | Enabled  | Error on unused function parameters          |
| `exactOptionalPropertyTypes`         | Enabled  | Strict optional property handling            |
| `noPropertyAccessFromIndexSignature` | Enabled  | Use bracket notation for index signatures    |
| `noImplicitOverride`                 | Enabled  | Require `override` keyword                   |
| `allowUnusedLabels`                  | Disabled | Labels must be used                          |
| `allowUnreachableCode`               | Disabled | No dead code allowed                         |
| `verbatimModuleSyntax`               | Enabled  | Preserve import/export syntax                |
| `forceConsistentCasingInFileNames`   | Enabled  | Case-sensitive file imports                  |

### Path Aliases

```json
{
  "@/*": ["./apps/agent/src/*"],
  "@canvas/*": ["./apps/canvas/src/*"],
  "@orbit/common": ["./apps/common/src/index.ts"],
  "@orbit/common/*": ["./apps/common/src/*"]
}
```

### TypeScript Projects (5 total)

| Project | Command                     | Config                                  |
| ------- | --------------------------- | --------------------------------------- |
| Agent   | `bun run typecheck`         | `tsconfig.json`                         |
| Canvas  | `bun run canvas:typecheck`  | `tsconfig.canvas.json`                  |
| Common  | `bun run common:typecheck`  | `apps/common/tsconfig.json`             |
| Bridge  | `bun run bridge:typecheck`  | `agent-bridge/tsconfig.json`            |
| Schemas | `bun run schemas:typecheck` | `packages/shared-schemas/tsconfig.json` |

---

## ESLint Configuration

### Technology Stack

| Package                       | Version | Purpose                |
| ----------------------------- | ------- | ---------------------- |
| **eslint**                    | 9.39.2  | Core linter            |
| **typescript-eslint**         | 8.52.0  | TypeScript integration |
| **eslint-plugin-react**       | 7.37.5  | React-specific rules   |
| **eslint-plugin-react-hooks** | 7.0.1   | Hooks rules            |
| **eslint-plugin-import-x**    | 4.16.1  | Import organization    |

### Base Configurations

```typescript
eslint.configs.recommended;
tseslint.configs.strictTypeChecked; // Maximum type safety
tseslint.configs.stylisticTypeChecked; // Consistent style
```

### TypeScript Rules

#### Type Safety (All Errors)

| Rule                                               | Description                  |
| -------------------------------------------------- | ---------------------------- |
| `@typescript-eslint/no-explicit-any`               | Ban `any` type               |
| `@typescript-eslint/no-unsafe-assignment`          | No unsafe assigns from `any` |
| `@typescript-eslint/no-unsafe-member-access`       | No property access on `any`  |
| `@typescript-eslint/no-unsafe-call`                | No calling `any` as function |
| `@typescript-eslint/no-unsafe-return`              | No returning `any`           |
| `@typescript-eslint/no-unsafe-argument`            | No passing `any` as argument |
| `@typescript-eslint/restrict-template-expressions` | Type-safe template literals  |
| `@typescript-eslint/no-non-null-assertion`         | No `!` assertions            |

#### Async/Promise Handling (All Errors)

| Rule                                      | Description                         |
| ----------------------------------------- | ----------------------------------- |
| `@typescript-eslint/no-floating-promises` | Must handle all promises            |
| `@typescript-eslint/await-thenable`       | Only await thenables                |
| `@typescript-eslint/no-misused-promises`  | Correct promise usage in conditions |

#### Code Style (All Errors)

| Rule                                                | Description                  |
| --------------------------------------------------- | ---------------------------- | --- | --- |
| `@typescript-eslint/consistent-type-imports`        | Use `import type` syntax     |
| `@typescript-eslint/consistent-type-exports`        | Use `export type` syntax     |
| `@typescript-eslint/explicit-function-return-type`  | Explicit return types        |
| `@typescript-eslint/explicit-module-boundary-types` | Types on exported functions  |
| `@typescript-eslint/no-unnecessary-condition`       | No redundant conditions      |
| `@typescript-eslint/prefer-nullish-coalescing`      | Use `??` over `              |     | `   |
| `@typescript-eslint/strict-boolean-expressions`     | Explicit boolean checks      |
| `@typescript-eslint/switch-exhaustiveness-check`    | Exhaustive switch statements |

### React Rules

| Rule                          | Level | Description                             |
| ----------------------------- | ----- | --------------------------------------- |
| `react/jsx-no-leaked-render`  | Error | Prevent `{count && <Component />}` bugs |
| `react/prop-types`            | Off   | TypeScript handles prop validation      |
| `react-hooks/rules-of-hooks`  | Error | Enforce hooks rules                     |
| `react-hooks/exhaustive-deps` | Error | Complete dependency arrays              |

### Import Organization Rules

| Rule                                       | Level | Description                    |
| ------------------------------------------ | ----- | ------------------------------ |
| `import-x/order`                           | Error | Alphabetized, grouped imports  |
| `import-x/no-duplicates`                   | Error | No duplicate import statements |
| `import-x/consistent-type-specifier-style` | Error | Top-level type imports         |

#### Import Order Groups

```
1. builtin   - Node.js built-ins (node:fs, node:path)
2. external  - npm packages (react, zustand)
3. internal  - Workspace packages (@/, @canvas/)
4. parent    - Parent directory imports (../)
5. sibling   - Sibling imports (./)
6. index     - Index imports (./index)
7. type      - Type-only imports
```

### General Rules

| Rule                   | Level | Description                       |
| ---------------------- | ----- | --------------------------------- |
| `no-console`           | Error | Only `console.warn/error` allowed |
| `eqeqeq`               | Error | Always use `===` and `!==`        |
| `no-restricted-syntax` | Error | No emojis in code (custom rule)   |

### Linting Directories (6 total)

```bash
bun run lint  # Lints all of:
# - apps/agent/src
# - apps/canvas/src
# - apps/editor/src
# - apps/common/src
# - agent-bridge/src
# - packages/shared-schemas/src
```

---

## Prettier Configuration

### Settings (`.prettierrc`)

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

| Setting            | Value    | Description                        |
| ------------------ | -------- | ---------------------------------- |
| **semi**           | `true`   | Always use semicolons              |
| **singleQuote**    | `true`   | Use single quotes for strings      |
| **tabWidth**       | `2`      | 2-space indentation                |
| **trailingComma**  | `es5`    | Trailing commas where valid in ES5 |
| **printWidth**     | `100`    | Line wrap at 100 characters        |
| **bracketSpacing** | `true`   | Spaces in object literals          |
| **arrowParens**    | `always` | Always wrap arrow function params  |
| **endOfLine**      | `lf`     | Unix-style line endings            |

### Usage

```bash
bun run format        # Format all files
bun run format:check  # Check formatting (CI)
```

---

## Rust Linting

### Workspace Lints (`Cargo.toml`)

#### Safety (Forbid - Cannot Override)

| Lint                     | Level  | Description                   |
| ------------------------ | ------ | ----------------------------- |
| `unsafe_code`            | Forbid | No unsafe blocks              |
| `unsafe_op_in_unsafe_fn` | Forbid | Explicit unsafe in unsafe fns |

#### Correctness (Deny)

| Lint                            | Level | Description                   |
| ------------------------------- | ----- | ----------------------------- |
| `dead_code`                     | Deny  | No unused code                |
| `unused`                        | Deny  | No unused items               |
| `deprecated`                    | Deny  | No deprecated APIs            |
| `missing_docs`                  | Deny  | All public items documented   |
| `missing_debug_implementations` | Deny  | Debug trait required          |
| `unreachable_pub`               | Deny  | No unnecessarily public items |

### Clippy Configuration

#### Category Enables

```toml
clippy::all = "deny"
clippy::pedantic = "deny"
clippy::nursery = "warn"
clippy::cargo = "warn"
```

#### Panic Prevention (All Deny)

| Lint                       | Description                  |
| -------------------------- | ---------------------------- |
| `clippy::unwrap_used`      | No `.unwrap()`               |
| `clippy::expect_used`      | No `.expect()`               |
| `clippy::panic`            | No `panic!()`                |
| `clippy::indexing_slicing` | No `array[i]` (use `.get()`) |

#### Debug Code (All Deny)

| Lint                    | Description           |
| ----------------------- | --------------------- |
| `clippy::dbg_macro`     | No `dbg!()`           |
| `clippy::print_stdout`  | No `println!()`       |
| `clippy::print_stderr`  | No `eprintln!()`      |
| `clippy::todo`          | No `todo!()`          |
| `clippy::unimplemented` | No `unimplemented!()` |

#### Cast Safety (All Deny)

| Lint                               | Description                  |
| ---------------------------------- | ---------------------------- |
| `clippy::cast_possible_truncation` | Prevent data loss            |
| `clippy::cast_possible_wrap`       | Prevent overflow             |
| `clippy::cast_precision_loss`      | Prevent float precision loss |
| `clippy::cast_sign_loss`           | Prevent sign loss            |

### Rust Commands

```bash
bun run rust:fmt          # Check formatting
bun run rust:fmt:fix      # Fix formatting
bun run rust:lint         # Run clippy
bun run rust:lint:fix     # Fix clippy issues
bun run rust:test         # Run tests
bun run rust:check        # Type check only
```

---

## Cargo Deny (`deny.toml`)

### License Allowlist

```toml
allow = [
    "MIT",
    "Apache-2.0",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "BSL-1.0",
    "CC0-1.0",
    "Zlib",
    "MPL-2.0",
    "Unicode-3.0",
]
```

### Security Settings

| Setting             | Value | Description                |
| ------------------- | ----- | -------------------------- |
| `unknown-registry`  | Deny  | Only crates.io allowed     |
| `unknown-git`       | Deny  | No git dependencies        |
| `multiple-versions` | Warn  | Warn on duplicate versions |

### Ignored Advisories

Transitive dependencies from Tauri with no available fix:

- `RUSTSEC-2025-0057` - fxhash (no security issue)
- `RUSTSEC-2025-0075` - unic-char-range
- `RUSTSEC-2025-0080` - unic-common
- `RUSTSEC-2025-0081` - unic-char-property
- `RUSTSEC-2025-0098` - unic-ucd-version
- `RUSTSEC-2025-0100` - unic-ucd-ident

---

## Git Hooks (Husky)

### Pre-Commit Hook

Runs on every commit:

```bash
# 1. Frontend: Lint staged files only
bunx lint-staged

# 2. Rust: Check formatting
cargo fmt --all -- --check

# 3. Rust: Run clippy
cargo clippy --all-targets --all-features -- -D warnings
```

### Pre-Push Hook

Runs before pushing:

```bash
# 1. TypeScript: All 5 projects
bun run typecheck
bun run canvas:typecheck
bun run common:typecheck
bun run bridge:typecheck
bun run schemas:typecheck

# 2. ESLint: All frontend code
bun run lint

# 3. Frontend tests (fast only)
bun run canvas:test

# 4. Rust tests
cargo test --all-features
```

### Lint-Staged Configuration

| Pattern                                     | Commands               |
| ------------------------------------------- | ---------------------- |
| `apps/agent/src/**/*.{ts,tsx}`              | ESLint --fix, Prettier |
| `apps/canvas/src/**/*.{ts,tsx}`             | ESLint --fix, Prettier |
| `apps/editor/src/**/*.{ts,tsx}`             | ESLint --fix, Prettier |
| `apps/common/src/**/*.{ts,tsx}`             | ESLint --fix, Prettier |
| `agent-bridge/src/**/*.{ts,tsx}`            | ESLint --fix, Prettier |
| `packages/shared-schemas/src/**/*.{ts,tsx}` | ESLint --fix, Prettier |
| `src-tauri/**/*.json`                       | Prettier               |
| `*.{json,md,yml,yaml}`                      | Prettier               |

---

## CI/CD Workflows

### Main CI (`ci.yml`)

**Triggers:** Push/PR to `main`, `develop`, `port`, `feat/pranit`

#### Frontend Jobs

| Job                 | Description               | Runner        |
| ------------------- | ------------------------- | ------------- |
| `typecheck`         | Agent TypeScript          | ubuntu-latest |
| `lint`              | ESLint all frontend       | ubuntu-latest |
| `build`             | Vite production build     | ubuntu-latest |
| `common-typecheck`  | Common lib TypeScript     | ubuntu-latest |
| `schemas-typecheck` | Shared schemas TypeScript | ubuntu-latest |
| `canvas-typecheck`  | Canvas TypeScript         | ubuntu-latest |
| `canvas-test`       | Canvas Bun tests          | ubuntu-latest |
| `canvas-build`      | Canvas production build   | ubuntu-latest |
| `bridge-typecheck`  | Agent-bridge TypeScript   | ubuntu-latest |
| `bridge-test`       | Agent-bridge Bun tests    | ubuntu-latest |

#### Rust Jobs

| Job            | Description                 | Runner        |
| -------------- | --------------------------- | ------------- |
| `rust-fmt`     | `cargo fmt --check`         | ubuntu-latest |
| `rust-clippy`  | `cargo clippy -D warnings`  | ubuntu-latest |
| `rust-test`    | `cargo test --all-features` | ubuntu-latest |
| `rust-deny`    | License/advisory checks     | ubuntu-latest |
| `rust-machete` | Unused dependencies         | ubuntu-latest |
| `rust-doc`     | Documentation build         | ubuntu-latest |
| `rust-msrv`    | MSRV 1.85 compatibility     | ubuntu-latest |

#### Quality Gate

| Job         | Description                  |
| ----------- | ---------------------------- |
| `ci-passed` | All jobs must pass for merge |

### Tauri Build (`tauri-build.yml`)

**Triggers:** Version tags (`v*`) or manual

| Target                   | Runner         | Output                 |
| ------------------------ | -------------- | ---------------------- |
| `aarch64-apple-darwin`   | macos-latest   | `.dmg` (Apple Silicon) |
| `x86_64-apple-darwin`    | macos-latest   | `.dmg` (Intel Mac)     |
| `x86_64-pc-windows-msvc` | windows-latest | `.exe`, `.msi`         |

### Release (`release.yml`)

**Triggers:** Version tags (`v*`) or manual dispatch

1. Run typecheck, lint, tests, build
2. Create `.zip` and `.tar.gz` archives
3. Create GitHub Release with notes

### Auto-Merge (`auto-merge.yml`)

**Triggers:** Dependabot PRs

- Auto-merges **minor** and **patch** updates
- Major updates require manual review

---

## Local Quality Scripts

### Comprehensive Lint Script

```bash
./scripts/lint-all.sh              # Full check
./scripts/lint-all.sh --fix        # Auto-fix mode
./scripts/lint-all.sh --no-test    # Skip tests (faster)
./scripts/lint-all.sh --ts-only    # TypeScript only
./scripts/lint-all.sh --rust-only  # Rust only
```

### Checks Performed

1. **TypeScript** - 5 project typechecks
2. **ESLint** - 6 directory linting
3. **Knip** - Unused code detection
4. **jscpd** - Duplicate code detection (10% threshold)
5. **Canvas tests** - Bun test runner
6. **Rust formatting** - `cargo fmt`
7. **Rust clippy** - Linting
8. **Rust tests** - `cargo test`

### Other Commands

```bash
# TypeScript
bun run typecheck           # Agent app
bun run canvas:typecheck    # Canvas app
bun run common:typecheck    # Common lib
bun run bridge:typecheck    # Agent-bridge
bun run schemas:typecheck   # Shared schemas

# ESLint
bun run lint                # Check all
bun run lint:fix            # Fix all

# Prettier
bun run format              # Format all
bun run format:check        # Check only

# Rust
bun run rust:fmt            # Check formatting
bun run rust:lint           # Run clippy
bun run rust:test           # Run tests

# Full CI simulation
bun run ci                  # All checks
bun run check               # Frontend only
bun run check:rust          # Rust only
bun run check:all           # Everything
```

---

## Code Quality Tools

| Tool              | Purpose                       | Version      |
| ----------------- | ----------------------------- | ------------ |
| **TypeScript**    | Static type checking          | 5.9.3        |
| **ESLint**        | JavaScript/TypeScript linting | 9.39.2       |
| **Prettier**      | Code formatting               | 3.7.4        |
| **Husky**         | Git hooks                     | 9.1.7        |
| **lint-staged**   | Staged file processing        | 16.2.7       |
| **Knip**          | Dead code detection           | 5.80.0       |
| **jscpd**         | Duplicate code detection      | (via bunx)   |
| **Vitest**        | Frontend testing              | 4.0.16       |
| **Bun test**      | Agent-bridge testing          | (built-in)   |
| **Cargo clippy**  | Rust linting                  | (built-in)   |
| **Cargo fmt**     | Rust formatting               | (built-in)   |
| **Cargo deny**    | License/security audit        | (installed)  |
| **Cargo machete** | Unused Rust deps              | (via action) |

---

## Quality Metrics

### CI Performance

- **17 jobs** run in parallel
- **Total CI time:** ~3-5 minutes
- **Concurrency:** Auto-cancels superseded runs

### Code Coverage

| Component    | Testing Framework      |
| ------------ | ---------------------- |
| Canvas       | Bun test (unit)        |
| Agent-bridge | Bun test (integration) |
| Rust crates  | Cargo test             |

### Enforcement Points

| Stage          | Checks                          |
| -------------- | ------------------------------- |
| **Pre-commit** | lint-staged + Rust fmt + Clippy |
| **Pre-push**   | All TypeScript + ESLint + Tests |
| **CI**         | 17 parallel jobs (quality gate) |
| **Merge**      | All CI jobs must pass           |

---

## Troubleshooting

### Common ESLint Errors

| Error                                           | Solution                           |
| ----------------------------------------------- | ---------------------------------- |
| `@typescript-eslint/no-explicit-any`            | Use proper types or `unknown`      |
| `@typescript-eslint/no-floating-promises`       | Add `await` or `.catch()`          |
| `@typescript-eslint/strict-boolean-expressions` | Use explicit `!== undefined`       |
| `no-console`                                    | Use `console.warn/error` or logger |

### Common TypeScript Errors

| Error                        | Solution                          |
| ---------------------------- | --------------------------------- | --------------------- |
| `noUncheckedIndexedAccess`   | Add null check after array access |
| `exactOptionalPropertyTypes` | Use `                             | undefined` explicitly |
| `noUnusedLocals`             | Remove or prefix with `_`         |

### Common Rust Errors

| Error                 | Solution                       |
| --------------------- | ------------------------------ |
| `clippy::unwrap_used` | Use `?` or `.ok_or()`          |
| `clippy::expect_used` | Use `?` with proper error type |
| `missing_docs`        | Add `///` doc comments         |

---

## Adding New Linting Rules

### ESLint

1. Edit `eslint.config.ts`
2. Add rule to `rules` object
3. Run `bun run lint` to verify

### TypeScript

1. Edit `tsconfig.json`
2. Add flag to `compilerOptions`
3. Run `bun run typecheck` to verify

### Rust

1. Edit `Cargo.toml` under `[workspace.lints.clippy]`
2. Run `cargo clippy` to verify
