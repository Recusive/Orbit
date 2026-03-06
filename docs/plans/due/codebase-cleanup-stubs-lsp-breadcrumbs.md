# Plan: Codebase Cleanup — Remove Dead Stubs, Centralize Exclusions, Wire LSP Breadcrumbs

## Context

After evaluating Tree-sitter, Meriyah, and the existing LSP infrastructure, we established that:

- **Tree-sitter is not needed** — LSP already provides symbol resolution, and Shiki/Lezer handle highlighting
- **Two Rust crates are dead weight** — `orbit-syntax` (zero consumers) and `orbit-ai` (imported but never called from frontend)
- **File exclusion patterns are scattered** across 3 locations with overlapping entries
- **LSP breadcrumbs for code files are the real gap** — the backend supports it, the UI only works for Markdown

This plan removes what shouldn't exist, centralizes what's duplicated, and wires what's already built but unused.

**Branch**: New branch off `main` (e.g., `cleanup/stubs-and-lsp-breadcrumbs`), separate from `fix/0.0.5`.

---

## Phase 1: Remove Dead Stub Crates

### 1A: Remove `orbit-syntax` (ZERO risk)

Completely dead — zero imports anywhere in the codebase. The workspace uses `members = ["crates/common/*"]` glob, so deleting the directory removes it from the workspace automatically.

| Action           | File                    |
| ---------------- | ----------------------- |
| Delete directory | `crates/common/syntax/` |

Nothing else needed. No code references it.

### 1B: Remove `orbit-ai` (LOW risk)

Imported by `src-tauri/src/commands/agent/ai.rs` which registers 3 Tauri commands (`ai_chat`, `ai_complete`, `ai_stop`), but **zero frontend `invoke()` calls** exist. All AI goes through agent-bridge sidecar.

| Action           | File                                          | Detail                                                                                                                                                                                                  |
| ---------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delete directory | `crates/common/ai/`                           | Entire crate                                                                                                                                                                                            |
| Delete file      | `src-tauri/src/commands/agent/ai.rs`          | 3 dead commands                                                                                                                                                                                         |
| Edit             | `src-tauri/src/commands/agent/mod.rs`         | Remove `pub mod ai;`                                                                                                                                                                                    |
| Edit             | `src-tauri/Cargo.toml`                        | Remove `orbit-ai` dependency (line 31)                                                                                                                                                                  |
| Edit             | `src-tauri/src/lib.rs`                        | Remove `ai::ai_chat, ai::ai_complete, ai::ai_stop` from `generate_handler![]` (lines 507-509). Fix the `use commands::agent::{ai, conversations};` import to just `use commands::agent::conversations;` |
| Edit (optional)  | `crates/common/core/src/diagnostics/error.rs` | Remove `Error::Ai(String)` variant (line 46) — only used by orbit-ai. Enum is `#[non_exhaustive]` so keeping it is harmless, but removing is cleaner.                                                   |

**Leave alone**: `ChatMessage`, `ChatResponse`, `ChatRole`, `TokenUsage` types in `orbit-core` — they're public API types, don't trigger lints, and could be reused if direct Rust-Claude integration returns.

**Leave alone**: `reqwest` workspace dependency — used by Canvas download commands.

### 1C: Update Documentation

| File                      | Change                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `crates/common/CLAUDE.md` | Remove `ai` and `syntax` rows from crate table. Update dependency graph.                                                          |
| `src-tauri/CLAUDE.md`     | Remove `orbit-ai` from workspace crates table. Remove AI commands from commands listing. Remove `ai.rs` from directory structure. |

### 1 Verification

```bash
cargo check && cargo clippy && cargo test   # Rust compilation + lints
bun run typecheck && bun run lint           # Frontend unchanged
```

---

## Phase 2: Centralize File Exclusion Patterns

### 2A: Create shared module

**New file**: `apps/agent/src/lib/utils/system-files.ts`

```typescript
/**
 * System file/directory names hidden from the file explorer.
 * Lowercase for case-insensitive matching (macOS/Windows).
 */
export const SYSTEM_ENTRY_NAMES: ReadonlySet<string> = new Set([
  '.git',
  '.ds_store',
  '.spotlight-v100',
  '.trashes',
  'thumbs.db',
  'desktop.ini',
]);

/** Case-insensitive check */
export function isSystemEntry(name: string): boolean {
  return SYSTEM_ENTRY_NAMES.has(name.toLowerCase());
}

/**
 * Path substrings that generate noise in file watchers.
 * Superset of SYSTEM_ENTRY_NAMES — includes build artifacts, caches, VCS internals.
 */
export const NOISY_PATH_PATTERNS: readonly string[] = [
  '/.git/',
  '/node_modules/',
  '/.next/',
  '/dist/',
  '/build/',
  '/.turbo/',
  '/.parcel-cache/',
  '/venv/',
  '/.venv/',
  '/site-packages/',
  '/__pycache__/',
  '/.mypy_cache/',
  '/.pytest_cache/',
  '/env/',
  '/.env/',
  '/target/',
  '/.cache/',
  '/.DS_Store',
  '/coverage/',
  '/.idea/',
  '/.vscode/',
];
```

### 2B: Update consumers

| File                                                   | Change                                                                                                                                         |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/lib/mappers/files.ts`                  | Remove local `EXCLUDED_ENTRY_NAMES`. Import `isSystemEntry` from `@/lib/utils/system-files`. Use in `.filter()`.                               |
| `apps/agent/src/hooks/agent/use-tauri-file-watcher.ts` | Remove local `IGNORED_PATH_PATTERNS` (lines 25-52). Import `NOISY_PATH_PATTERNS` from `@/lib/utils/system-files`. Update `shouldIgnorePath()`. |

### 2C: Note on Rust-side exclusion

`crates/common/search/src/file_index.rs` line 228 has its own hardcoded list for the fuzzy file index. This is intentionally separate — it operates at the Rust level with `OsStr` matching during `WalkBuilder::filter_entry`. No centralization with frontend patterns. Optionally extract to a named constant at top of file for clarity.

### 2 Verification

```bash
bun run check                  # typecheck + lint + tests
# Manual: file explorer hides .git/.DS_Store but shows .gitignore/.env
# Manual: file watcher doesn't react to node_modules/target changes
```

---

## Phase 3: Wire LSP `documentSymbol` to Code Breadcrumbs

This is a 5-layer change (Rust → Tauri command → API wrapper → Hook → UI) that follows the exact pattern of the existing `completion`/`hover`/`definition` pipeline.

### 3A: Rust — Add `document_symbols()` to LSP crate

**File**: `crates/common/lsp/src/lib.rs`

- Add `document_symbols(&self, path: &Path) -> Result<Vec<DocumentSymbol>>` to `LspClient`
  - Sends `textDocument/documentSymbol` LSP request
  - Parses response (handles both `DocumentSymbol[]` and `SymbolInformation[]` formats)
  - Converts to `orbit_core::DocumentSymbol` type
- Add `get_document_symbols(&self, path: &str)` to `LspManager` (delegates to client)
- Add `hierarchical_document_symbol_support: true` to initialize capabilities

### 3B: Rust — Add types to orbit-core

**File**: `crates/common/core/src/types.rs`

Add `SymbolKind` enum and `DocumentSymbol` struct (with `range`, `selection_range`, `children`, `detail`). Follow existing patterns for `CompletionItem`, `HoverInfo`, etc.

### 3C: Tauri — Add command

**File**: `src-tauri/src/commands/common/lsp.rs`

```rust
#[tauri::command]
pub async fn lsp_document_symbols(path: String) -> Result<Vec<DocumentSymbol>, String> { ... }
```

Register in `src-tauri/src/lib.rs` `generate_handler![]`.

### 3D: Frontend API — Add invoke wrapper

**File**: `apps/agent/src/lib/api/lsp.ts`

Add `DocumentSymbol` and `SymbolKind` types. Add `getDocumentSymbols(path)` function.

### 3E: Frontend Hook — Add to `useLsp`

**File**: `apps/agent/src/hooks/lsp/use-lsp.ts`

Add `getDocumentSymbols` to `UseLspResult` interface and implement callback (same pattern as `getCompletions`).

### 3F: Editor — Wire symbols to breadcrumbs

**File**: `apps/agent/src/components/editor/editor-breadcrumbs.tsx` + parent that renders it

- For non-markdown files: call `getDocumentSymbols(path)` on file open
- Flatten hierarchical `DocumentSymbol[]` → `OutlineItem[]`
- Map `SymbolKind` → `OutlineItem.kind` (`function`/`class`/`method`/`property`/`variable`)
- Track cursor position to determine active breadcrumb
- Add icons for code symbol kinds (currently only `heading` has an icon)
- Markdown outline continues to use regex extraction (no regression)

### 3 Verification

```bash
cargo check && cargo clippy && cargo test
bun run check
bunx tauri dev
# Manual: Open .ts file → breadcrumbs show function/class/method symbols
# Manual: Move cursor into a function → breadcrumb updates to show that function
# Manual: Open .md file → headings still work (regression check)
# Manual: Open file with no LSP → breadcrumbs show filename only (graceful fallback)
```

---

## Files Modified (Summary)

| Phase | File                                                      | Action                                      |
| ----- | --------------------------------------------------------- | ------------------------------------------- |
| 1A    | `crates/common/syntax/`                                   | DELETE directory                            |
| 1B    | `crates/common/ai/`                                       | DELETE directory                            |
| 1B    | `src-tauri/src/commands/agent/ai.rs`                      | DELETE file                                 |
| 1B    | `src-tauri/src/commands/agent/mod.rs`                     | Remove `pub mod ai;`                        |
| 1B    | `src-tauri/Cargo.toml`                                    | Remove `orbit-ai` dep                       |
| 1B    | `src-tauri/src/lib.rs`                                    | Remove 3 AI commands + fix import           |
| 1B    | `crates/common/core/src/diagnostics/error.rs`             | Remove `Error::Ai` variant (optional)       |
| 1C    | `crates/common/CLAUDE.md`                                 | Remove ai/syntax from docs                  |
| 1C    | `src-tauri/CLAUDE.md`                                     | Remove ai from docs                         |
| 2A    | `apps/agent/src/lib/utils/system-files.ts`                | CREATE shared module                        |
| 2B    | `apps/agent/src/lib/mappers/files.ts`                     | Import from shared module                   |
| 2B    | `apps/agent/src/hooks/agent/use-tauri-file-watcher.ts`    | Import from shared module                   |
| 3A    | `crates/common/lsp/src/lib.rs`                            | Add documentSymbol support                  |
| 3B    | `crates/common/core/src/types.rs`                         | Add SymbolKind + DocumentSymbol types       |
| 3C    | `src-tauri/src/commands/common/lsp.rs`                    | Add lsp_document_symbols command            |
| 3C    | `src-tauri/src/lib.rs`                                    | Register command                            |
| 3D    | `apps/agent/src/lib/api/lsp.ts`                           | Add types + invoke wrapper                  |
| 3E    | `apps/agent/src/hooks/lsp/use-lsp.ts`                     | Add getDocumentSymbols                      |
| 3F    | `apps/agent/src/components/editor/editor-breadcrumbs.tsx` | Add code symbol icons + kind mapping        |
| 3F    | Editor parent component                                   | Wire symbols on file open + cursor tracking |

## Risk Assessment

| Phase           | Risk     | Why                                                                                                                                         |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 (stubs)       | Zero/Low | No consumers. `cargo check` catches any missed reference.                                                                                   |
| 2 (exclusions)  | Low      | Same behavior, different source file. Existing tests cover it.                                                                              |
| 3 (breadcrumbs) | Medium   | New feature across 5 layers, but follows established LSP patterns exactly. Graceful degradation (empty symbols = filename-only breadcrumb). |
