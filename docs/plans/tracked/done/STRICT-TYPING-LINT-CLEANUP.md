# Plan: Strict Typing & Lint Suppression Cleanup

## Context

The codebase has ~400+ lint suppression comments across three layers (Orbit main, Rust backend, Agent-backend). CLAUDE.md explicitly prohibits `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `#[allow(...)]`, `.unwrap()`, `.expect()`, and `panic!()`. This plan systematically removes, upgrades, or properly scopes every suppression — without breaking functionality.

**Goal:** Every remaining suppression is either (a) `#[expect]` with a reason (Rust), (b) a config-level override with justification, or (c) documented as a permanent ecosystem constraint. Zero loose per-line suppressions without clear justification.

**Approach:** 6 phases, lowest-risk first. Each phase is independently deployable.

---

## Phase 1: Config-Level Consolidation (zero runtime changes)

**Risk: Near-zero** | **Effort: 2-3h** | **Suppressions eliminated: ~162**

### 1A: Agent-backend opentui TUI eslint config block (~150 `no-unsafe-return` → 1 config rule)

All `eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types` across 47 TUI `.tsx` files share one root cause: ESLint can't resolve opentui's SolidJS JSX types.

**File to edit:** `Agent-backend/eslint.config.ts`

Add after line 130 (after the CLI `no-console` block):

```typescript
/* opentui TUI components — ESLint cannot resolve SolidJS JSX return types.
   Only no-unsafe-return is disabled globally; other unsafe-* rules stay enforced
   so non-JSX unsafe logic (e.g. Proxy accessors, dynamic dispatch) is still caught. */
{
  files: ["packages/opencode/src/cli/cmd/tui/**/*.tsx"],
  rules: {
    "@typescript-eslint/no-unsafe-return": "off",
  },
},
```

Then remove per-line `eslint-disable` comments **only for `no-unsafe-return`**. This accounts for ~150 of the 203 total suppressions.

**Keep all other per-line suppressions** (~53 remaining), including:

Non-JSX-type rules (15):

- `app.tsx:56` — `prefer-const` (timeout reassigned in setTimeout)
- `app.tsx:67` — `no-control-regex` (intentional OSC escape)
- `context/sync.tsx:254` — `no-dynamic-delete` (SolidJS produce)
- `context/theme.tsx:374` — `no-unsafe-return` for Proxy accessor (**keep as per-line** — this is a real non-JSX unsafe return, the `@ts-expect-error` on line 373 provides TypeScript-level safety but the ESLint suppression documents the pattern explicitly)
- `util/terminal.ts:26` — `prefer-const` (assigned after handler)
- `util/terminal.ts:61,68,75` — `no-control-regex` (3× intentional escape sequences)
- `component/dialog-status.tsx:12` — `no-empty-object-type`
- `routes/session/index.tsx:100` — `unbound-method` (monkey patch)
- `routes/session/index.tsx:253,271,377` — `no-unnecessary-condition` + `strict-boolean-expressions` (3× uninitialized scroll/prompt)
- `routes/session/index.tsx:1781,2159,2177` — `no-explicit-any` (3× tool union dispatch)

Other opentui-caused rules still enforced at config level (~38):

- `no-unsafe-assignment` per-line comments (~30) — kept because they can catch real non-JSX assignment issues
- `no-unsafe-call` per-line comments (~5) — kept for same reason
- `explicit-function-return-type` per-line comments (~3) — kept for same reason

**Also keep:** `@ts-expect-error` comments in `sync.tsx:311` and `theme.tsx:373` — these are TypeScript suppressions, not ESLint rules.

### 1B: Stress-test console consolidation (12 per-line → 1 file-level)

**File:** `apps/agent/src/stress-tests/update-simulation.ts`

Replace 11× `// eslint-disable-next-line no-console` + 1× `// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition` with file-level:

```typescript
/* eslint-disable no-console -- stress test: console output is the diagnostic interface */
/* eslint-disable @typescript-eslint/no-unnecessary-condition -- loop guards check externally-mutated state */
```

Remove all 12 per-line comments.

### 1C: Skip — stories @ts-nocheck already handled

`packages/ui/` is already in Agent-backend eslint `ignores` (line 14-16). The 54 `@ts-nocheck` files are reference-only SolidJS code, never compiled by Orbit. No action needed.

### Verification

```bash
cd Agent-backend && bun turbo typecheck
bun run check  # from root
```

---

## Phase 2: Rust `#[allow]` → `#[expect]` Upgrade (mechanical, zero logic changes)

**Risk: Very low** | **Effort: 1-2h** | **Suppressions upgraded: ~50+**

`#[expect]` is strictly safer than `#[allow]` — it emits a compiler warning when the suppression becomes unnecessary, catching dead suppressions automatically.

**Implementation approach:** Rather than a stale hand-enumerated file list, generate the authoritative list at execution time:

```bash
grep -rn '#\[allow\|#!\[allow' src-tauri/src/ crates/ --include='*.rs' | grep -v '#\[cfg(test)\]' | grep -v 'test'
```

Then mechanically convert each `#[allow(` → `#[expect(` and each `#![allow(` → `#![expect(`.

### 2A: src-tauri/ — all `#[allow]` → `#[expect]`

Convert every `#[allow]` and `#![allow]` in `src-tauri/src/` to `#[expect]`/`#![expect]`. Key categories:

- **`needless_pass_by_value`** (~15 Tauri command modules) — framework constraint, keep with reason
- **`unreachable`, `let_underscore_must_use`** (~8 command modules) — Tauri macro artifacts, keep with reason
- **`too_many_arguments`** (~4 commands) — Tauri RPC boundary, keep with reason
- **`disallowed_methods`** (~5 locations) — intentional thread::sleep or env::var usage, keep with reason
- **Canvas commands** (~6 files, ~25 allows total) — consolidate repetitive patterns
- **`lib.rs:63,194,198,202`** — app setup constraints

### 2B: crates/ — all `#[allow]` → `#[expect]`

Same runtime-grep approach as 2A:

```bash
grep -rn '#\[allow\|#!\[allow' crates/ --include='*.rs' | grep -v '#\[cfg(test)\]'
```

Many crate files already use `#[expect]` — skip those. Key files that still have `#[allow]`:

| File                                             | Lints                                                 |
| ------------------------------------------------ | ----------------------------------------------------- |
| `crates/common/terminal/src/lib.rs:6-9`          | `significant_drop_tightening` (module-level)          |
| `crates/common/terminal/src/lib.rs`              | function-level allows (lines 174,227,330-339,820,834) |
| `crates/common/sf-symbols/src/render.rs:161,234` | `cast_possible_truncation`                            |

### 2C: Decorum plugin — add reason strings, keep as `#[allow]` (NOT `#[expect]`)

The 12 `#[allow(clippy::missing_const_for_fn)]` in decorum are **platform-conditional** and **must stay as `#[allow]`**. On macOS, the function body is `unsafe { FFI }` (not const-eligible → lint doesn't fire). On non-macOS, the body is `let _ = param` (const-eligible → lint fires). Converting to `#[expect]` would emit "unused expect" warnings on macOS CI builds.

Add reason strings to all 12:

| File                                          | Lines                           | Count | Reason to add                                                                             |
| --------------------------------------------- | ------------------------------- | ----- | ----------------------------------------------------------------------------------------- |
| `crates/plugins/decorum/src/lib.rs`           | 186,204,222,241,263,283,307,327 | 8     | `reason = "platform-conditional: lint fires on non-macOS stub but not on macOS FFI body"` |
| `crates/plugins/decorum/src/glass_defocus.rs` | 304,330                         | 2     | same reason                                                                               |
| `crates/plugins/decorum/src/promotion.rs`     | 99,332                          | 2     | same reason                                                                               |

Also convert `frost.rs:304` `#[allow(clippy::cast_possible_truncation)]` → `#[expect]` with `reason = "rgba u8 values are always within range"` — this one is NOT platform-conditional.

### 2D: terminal meta-allow — keep as-is

`crates/common/terminal/src/lib.rs:10-12` has:

```rust
#![allow(clippy::allow_attributes, reason = "need allow instead of expect for lints that don't fire on hashbrown types")]
```

This **must stay**. The terminal crate uses hashbrown types where some clippy lints fire inconsistently depending on the HashMap implementation. The `allow_attributes` meta-allow permits function-level `#[allow]` (instead of `#[expect]`) for those specific cases. Converting the underlying allows to `#[expect]` would produce spurious warnings when hashbrown's type doesn't trigger the lint.

**Action:** Keep `lib.rs:10-12` as-is. For function-level allows in terminal that are hashbrown-sensitive (e.g., `iter_over_hash_type`), keep as `#[allow]`. Convert only non-hashbrown allows (e.g., `too_many_lines`, `cognitive_complexity`, `if_then_some_else_none`) to `#[expect]`.

### Verification

```bash
cargo clippy --workspace -- -D warnings
cargo test
```

Any `#[expect]` that warns as "unused" means the lint no longer fires → remove it entirely (free win).

---

## Phase 3: LSP Crate Blanket Allow Audit

**Risk: Medium** | **Effort: 3-4h** | **Target: 18 module-level → function-level or removed**

**File:** `crates/common/lsp/src/lib.rs` lines 7-57

Strategy: Pre-classify the 18 allows before conversion, then convert only the safe ones.

**Step 1 — Pre-classify hashbrown-sensitive lints:**

The LSP crate uses `hashbrown::HashMap` (line 61). The following lint is hashbrown-sensitive and **must stay as `#![allow]`**:

- `clippy::iter_over_hash_type` (line 11) — iteration order is nondeterministic for hashbrown but Clippy may not fire consistently. Keep as `#![allow]` with existing reason.

**Step 2 — Convert the remaining 17 `#![allow]` → `#![expect]`:**

The compiler will immediately tell us which are still needed (remain as warnings) and which are dead (emit "unused expect" warning → remove).

**Step 3 — For any that remain active:**

1. Try narrowing from module-level `#![expect]` to function-level `#[expect]` on the specific functions that trigger it
2. If pervasive (>10 functions trigger it), keep as `#![expect]` with reason

**Specific attention:**

- `clippy::indexing_slicing` (line 24) — audit each usage to verify bounds checks exist. If any are unchecked, add bounds checks and narrow the suppression.
- `clippy::map_err_ignore` (line 44) — review if dropping error context is appropriate. May hide real errors.

### Verification

```bash
cargo clippy --workspace -- -D warnings
cargo test -p orbit-lsp
```

---

## Phase 4: TypeScript Code Fixes (Orbit main)

**Risk: Low** | **Effort: 1-2h** | **Suppressions removed: 3-5**

### 4A: CanvasInputArea.tsx — remove unused vars + console.log

**File:** `apps/Canvas-UI-Builder/src/components/layout/canvas-input/CanvasInputArea.tsx`

- **Line 23:** Replace `console.log('[Canvas] Send message:', text)` with `logger.info('Send message', { text })` using `createLogger('CanvasInputArea')` from `@orbit/common/lib`. Remove `eslint-disable no-console`.
- **Lines 44, 49:** The `_effort` and `_model` handlers are stubs. Replace `eslint-disable @typescript-eslint/no-unused-vars` by using the parameters: `logger.debug('Effort change requested', { effort })`. This removes both unused-var suppressions.

### 4B: oc-message-store.ts — scope the dynamic-delete disable

**File:** `apps/agent/src/stores/opencode/oc-message-store.ts`

The file-level `/* eslint-disable @typescript-eslint/no-dynamic-delete */` is overly broad. Narrow to per-line `// eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Immer draft: delete is idiomatic for Record key removal` on each `delete` statement. This makes each usage explicitly justified rather than blanket-suppressed.

### 4C: Justified keepers — verify documentation

These suppressions are correct and must stay. Verify each has a clear reason comment:

| File                                                                               | Suppression                 | Reason                                              |
| ---------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------- |
| `eslint.config.ts:32,34`                                                           | `@ts-expect-error`          | Plugin type format incompatibility (ecosystem lag)  |
| `apps/common/src/lib/logger.ts:107,123`                                            | `no-console`                | Logger implementation wraps console by design       |
| `apps/agent/src/components/editor/CodeMirrorEditor.tsx:1052`                       | `exhaustive-deps`           | Standard CodeMirror mount pattern (well-documented) |
| `apps/agent/src/components/git/source-control/components/DiffFileCard.tsx:322,339` | `exhaustive-deps`           | Stable ref pattern with prefetch cache keys         |
| `agent-bridge/src/canvas/orchestrator/task-executor.ts:200`                        | `no-unnecessary-condition`  | External mutation during async execution            |
| `packages/orbit-sdk/src/v2/client.d.ts:1`                                          | `eslint-disable array-type` | Auto-generated SDK code                             |

### Verification

```bash
bun run check
bun run lint
```

---

## Phase 5: Agent-backend Targeted Fixes

**Risk: Medium** | **Effort: 3-4h** | **Suppressions removed: ~15**

### 5A: provider.ts dynamic-delete → three-pass refactor (8 occurrences)

**File:** `Agent-backend/packages/opencode/src/provider/provider.ts`

Lines 1200-1238 have **variant-merging logic (lines 1221-1231) interspersed between deletes**. A simple `Object.fromEntries(filter(...))` would skip the variant transform step. Restructure as three sequential passes:

**Pass 1 — Filter providers** (lines 1200-1205): Remove disallowed providers

```typescript
const allowedProviders = Object.fromEntries(
  Object.entries(providers).filter(([providerID]) => isProviderAllowed(providerID))
);
```

**Pass 2 — Filter + transform models** (lines 1209-1231): For each remaining provider, filter models AND apply variant merging on survivors

```typescript
for (const [providerID, provider] of Object.entries(allowedProviders)) {
  const configProvider = config.provider?.[providerID]
  provider.models = Object.fromEntries(
    Object.entries(provider.models)
      .filter(([modelID, model]) => {
        if (modelID === "gpt-5-chat-latest" || ...) return false
        if (model.status === "alpha" && !Flag.OPENCODE_ENABLE_EXPERIMENTAL_MODELS) return false
        if (model.status === "deprecated") return false
        if (configProvider?.blacklist?.includes(modelID) === true || ...) return false
        return true
      })
      .map(([modelID, model]) => {
        // Variant merging (previously lines 1221-1231) — runs on SURVIVING models only
        model.variants = mapValues(ProviderTransform.variants(model), (v) => v)
        const configVariants = configProvider?.models?.[modelID]?.variants
        if (configVariants !== undefined) { /* merge logic */ }
        return [modelID, model]
      })
  )
}
```

**Pass 3 — Remove empty providers** (lines 1234-1238):

```typescript
const finalProviders = Object.fromEntries(
  Object.entries(allowedProviders).filter(([, p]) => Object.keys(p.models).length > 0)
);
```

Also refactor line 236 (standalone delete in a different function) with the same filter pattern.

### 5B: Other dynamic-delete locations → `Reflect.deleteProperty`

For single-key deletions, use `Reflect.deleteProperty` — the pattern already established across the codebase (60+ usages in Orbit stores, Agent-backend env, prompt, plugin). This avoids the `no-dynamic-delete` lint without over-engineering into filter/rebuild:

```typescript
// Before:
delete record[key]; // eslint-disable-line @typescript-eslint/no-dynamic-delete

// After:
Reflect.deleteProperty(record, key);
```

Apply to:

- `Agent-backend/packages/opencode/src/session/status.ts:75` — session idle cleanup
- `Agent-backend/packages/opencode/src/mcp/auth.ts:73` — MCP auth cleanup
- `Agent-backend/packages/opencode/src/mcp/index.ts:602,629` — MCP entry removal
- `Agent-backend/packages/opencode/src/provider/transform.ts:294` — provider record removal

### 5C: Structural @ts-expect-error — document as permanent

These cannot be removed without upstream SDK/library changes. Ensure each has a clear comment:

| File                                                                  | Line    | Why permanent                                                                                                |
| --------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `Agent-backend/packages/opencode/src/session/llm.ts`                  | 238     | AI SDK private streaming property                                                                            |
| `Agent-backend/packages/opencode/src/session/message-v2.ts`           | 791     | AI SDK ToolSet type mismatch                                                                                 |
| `Agent-backend/packages/opencode/src/plugin/index.ts`                 | 119,135 | Plugin SDK v2 migration pending                                                                              |
| `Agent-backend/packages/opencode/src/control-plane/adaptors/index.ts` | 18      | Custom adaptor type extension pending                                                                        |
| `Agent-backend/packages/opencode/src/file/watcher.ts`                 | 5       | **FIX: create ambient declaration** (see 5D below)                                                           |
| `Agent-backend/packages/opencode/src/cli/cmd/tui/context/sync.tsx`    | 311     | SolidJS produce dynamic field mutation                                                                       |
| `Agent-backend/packages/opencode/src/cli/cmd/tui/context/theme.tsx`   | 373     | Dynamic Proxy access on Theme object                                                                         |
| `Agent-backend/packages/opencode/src/mcp/index.ts`                    | 153,383 | `@typescript-eslint/no-deprecated` — SSE fallback required for servers that don't support StreamableHTTP yet |
| `Agent-backend/packages/sdk/js/src/v2/gen/client/client.gen.ts`       | 69      | Auto-generated                                                                                               |
| `Agent-backend/packages/sdk/js/src/gen/client/client.gen.ts`          | 67      | Auto-generated                                                                                               |

### 5D: watcher.ts `@ts-ignore` → ambient declaration

**File:** `Agent-backend/packages/opencode/src/file/watcher.ts:4-5`

The banned `@ts-ignore` hides `@parcel/watcher/wrapper` which has no type declarations. The main package (`@parcel/watcher`) DOES have types — `watcher.ts:16` already imports `type ParcelWatcher from "@parcel/watcher"`. The wrapper's `createWrapper()` returns the same interface.

**Fix:** Create an ambient declaration file:

```typescript
// Agent-backend/packages/opencode/src/@types/parcel-watcher-wrapper.d.ts
declare module '@parcel/watcher/wrapper' {
  import type ParcelWatcher from '@parcel/watcher';
  export function createWrapper(binding: Record<string, unknown>): typeof ParcelWatcher;
}
```

Then in `watcher.ts`:

- Remove line 4 (`eslint-disable-next-line @typescript-eslint/ban-ts-comment`)
- Remove line 5 (`@ts-ignore`)
- The import on line 6 will now resolve through the ambient declaration
- Also remove line 48 (`eslint-disable-next-line @typescript-eslint/no-unsafe-call`) — with types, the call is no longer unsafe

Verify the `@types/` directory is included in `tsconfig.json`'s `typeRoots` or the declaration is auto-discovered.

### Verification

```bash
cd Agent-backend && bun turbo typecheck
cd Agent-backend/packages/opencode && bun test --timeout 30000
```

---

## Phase 6: Rust Test Code — Standardize `#[expect]` with reasons

**Risk: Very low** | **Effort: 1h** | **Suppressions standardized: ~30**

Ensure ALL test-scoped `#[allow]`/`#[expect]` for `unwrap_used`, `expect_used`, `panic_in_result_fn`, `indexing_slicing` have consistent `reason` strings. These are acceptable in test code but should be uniform:

- `#[expect(clippy::unwrap_used, reason = "test code: panics are assertion failures")]`
- `#[expect(clippy::expect_used, reason = "test code: panics are assertion failures")]`
- `#[expect(clippy::panic_in_result_fn, reason = "test code: assert! macros panic by design")]`

Files: all `#[cfg(test)]` blocks in `crates/` and `src-tauri/`.

### Verification

```bash
cargo clippy --workspace -- -D warnings
cargo test
```

---

## Summary

| Phase     | Scope                                | Removed  | Upgraded | Risk      | Effort     |
| --------- | ------------------------------------ | -------- | -------- | --------- | ---------- |
| 1         | Config consolidation (TS)            | ~162     | 0        | Near-zero | 2-3h       |
| 2         | Rust `allow` → `expect` (where safe) | 0\*      | ~35      | Very low  | 1-2h       |
| 3         | LSP crate audit                      | 0-5      | 18       | Medium    | 3-4h       |
| 4         | Orbit main TS fixes                  | 3-5      | 0        | Low       | 1-2h       |
| 5         | Agent-backend targeted               | ~18      | 0        | Medium    | 3-4h       |
| 6         | Rust test standardization            | 0        | ~30      | Very low  | 1h         |
| **Total** |                                      | **~185** | **~83+** |           | **11-16h** |

\*Phase 2 may discover dead `#[expect]` that can be removed entirely — bonus wins.

## End State

After all 6 phases:

- Zero per-line `eslint-disable` without clear justification in Orbit main
- Rust `#[allow]` converted to `#[expect]` **where safe** — platform-conditional (decorum) and hashbrown-sensitive (terminal) lints intentionally kept as `#[allow]` with reason strings
- ~150 opentui `no-unsafe-return` suppressions replaced by 1 config rule (only `no-unsafe-return` disabled globally; `no-unsafe-assignment`, `no-unsafe-call`, `explicit-function-return-type` stay enforced per-line to catch non-JSX issues like theme.tsx Proxy accessor)
- 12 stress-test suppressions replaced by 1 file-level block
- watcher.ts `@ts-ignore` eliminated via ambient declaration file (`parcel-watcher-wrapper.d.ts`)
- provider.ts dynamic-deletes refactored via three-pass restructure; single-key deletes use `Reflect.deleteProperty` (matching 60+ existing usages)
- `mcp/index.ts` `no-deprecated` (SSE fallback) documented as permanent keeper
- All permanent keepers documented with reasons
- LSP crate narrowed from 18 blanket allows to targeted suppressions
