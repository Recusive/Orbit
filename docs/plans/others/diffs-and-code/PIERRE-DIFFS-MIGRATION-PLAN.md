# Plan: Replace Custom Diff Rendering with @pierre/diffs

> **Audited**: 2026-02-25 by Codex — see `reviews/audit-plan.md` for full audit report.
> **Verdict**: APPROVE WITH CHANGES — all critical findings incorporated below.

## Context

Orbit has three diff rendering surfaces — all custom-built with no external diff library. The Edit tool widget uses a particularly naive approach (all old lines = red, all new lines = green, no word-level diffing). The user wants to adopt `@pierre/diffs` by The Pierre Computer Co. for a more polished, professional diff UX — the same library used by other modern code tools.

**Key wins:** Word-level inline change highlighting (biggest gap), split/stacked view toggle, CSS Grid rendering (fewer DOM nodes), and less custom code to maintain (~500 lines of rendering replaced).

---

## Surfaces to Migrate

| Surface                  | File                   | Input Data                                  | Pierre Component                           |
| ------------------------ | ---------------------- | ------------------------------------------- | ------------------------------------------ |
| **Edit tool** (chat)     | `edit-tool-widget.tsx` | `oldString` + `newString`                   | `parseDiffFromFile()` → `<FileDiff>`       |
| **Git source control**   | `DiffFileCard.tsx`     | `FileDiff` + `FileStatus` from Rust backend | Reconstruct unified string → `<PatchDiff>` |
| **File viewer diff tab** | `file-diff-viewer.tsx` | `ViewedFileDiff` (old/new content)          | `parseDiffFromFile()` → `<FileDiff>`       |

**NOT migrating:** `write-tool-widget.tsx` (not a diff — shows new file only), `diff-stat.tsx` (stats bar — Pierre doesn't replace this), `diff-stats.tsx` (text stats).

---

## Implementation Steps

### Phase 0: Install & Configure

1. **Install packages**

   ```bash
   bun add @pierre/diffs @pierre/precision-diffs
   ```

2. **Update `vite.config.ts`**
   - Add `@pierre/diffs` to `optimizeDeps.include` (prevent stale cache in dev)
   - Add `manualChunks` entry for `@pierre/diffs` (it bundles Shiki internally — check for conflicts with our existing `vendor-shiki` chunk)

3. **Add Pierre CSS variable overrides in `globals.css`**
   - **Import Pierre's base stylesheet** at the top of `globals.css` (e.g., `@import '@pierre/diffs/styles.css'`) — verify exact import path from Pierre docs. Without this, Pierre components render with missing base styles.
   - Map Pierre's CSS variables to our oklch color system in both `:root` and `html.dark` blocks
   - Variables: `--diffs-bg`, `--diffs-fg`, `--diffs-addition-*`, `--diffs-deletion-*`, etc.
   - For syntax highlighting: use `github-dark` / `github-light` Shiki themes (already familiar from our `useHighlightedTokens`)

4. **Add `WorkerPoolContextProvider` in `App.tsx`**
   - Wrap inside `<ThemeProvider>` → `<PierreProvider>` → `<TauriProvider>`
   - Create thin `apps/agent/src/providers/pierre-provider.tsx` wrapper
   - **Provider-absent fallback:** Pierre components must degrade gracefully (no highlighting, but still render diff) if WorkerPoolContextProvider is missing or fails. Verify this behavior early — if Pierre throws without provider, add a catch boundary or conditional wrapper.
   - If Web Workers have issues in Tauri's WKWebView, this is optional — Pierre falls back to main-thread highlighting

5. **Lazy-load Pierre rendering modules** (from audit — Recommended #1)
   - Current syntax highlighting uses lazy Shiki loading via `use-syntax-highlight.ts`. Pierre imports in always-loaded modules may shift large syntax/highlight payloads into the startup path.
   - Use `React.lazy()` or dynamic `import()` for Pierre rendering components to keep startup characteristics close to current behavior.
   - Pierre components are only needed when diffs are visible — never on initial load.

### Phase 1: Adapter Layer

**Create `apps/agent/src/lib/utils/pierre-adapter.ts`**

Two adapter functions for converting our data to Pierre's input format:

```
editToolToPierreDiff(filePath, oldString, newString)
  → calls parseDiffFromFile() from @pierre/diffs
  → returns FileDiffMetadata for <FileDiff> component

structuredDiffToUnified(diff: GitFileDiff, status?: FileStatus)
  → reconstructs unified diff string from our Rust-parsed DiffHunk[]
  → uses status to set correct /dev/null headers for added/deleted files
  → uses diff.oldPath ?? diff.path for "--- a/" on modified/renamed
  → returns string | null (null for binary; consumers show fallback)
```

The second function avoids adding new Rust commands — we reconstruct unified diff from the structured data we already have from `gitDiffStructured()` / `gitStagedDiff()`.

**Header reconstruction rules** (from audit — Critical #2):

Note: `FileDiff` (`lib/api/git.ts:96`) has no `status` field — only `path`, `oldPath?`, `hunks`, `isBinary`. The adapter accepts an optional `status` parameter (from the corresponding `StatusEntry`) to distinguish added/deleted from modified.

| Case     | Old header                | New header      | Hunk body                | Detection                                        |
| -------- | ------------------------- | --------------- | ------------------------ | ------------------------------------------------ |
| Modified | `--- a/{oldPath ?? path}` | `+++ b/{path}`  | Emit all lines           | Default (no status or `status === 'modified'`)   |
| Renamed  | `--- a/{oldPath}`         | `+++ b/{path}`  | Emit all lines           | `oldPath` present, or `status === 'renamed'`     |
| Added    | `--- /dev/null`           | `+++ b/{path}`  | Emit all lines (all `+`) | `status === 'added'` or `status === 'untracked'` |
| Deleted  | `--- a/{path}`            | `+++ /dev/null` | Emit all lines (all `-`) | `status === 'deleted'`                           |
| Binary   | —                         | —               | —                        | `diff.isBinary === true` → return `null`         |

**Reference implementation:**

```ts
import type { FileDiff as GitFileDiff, FileStatus } from '@/lib/api/git';

export function structuredDiffToUnified(diff: GitFileDiff, status?: FileStatus): string | null {
  // Binary files have no textual diff
  if (diff.isBinary) return null;

  // Build path headers based on status
  let oldHeader: string;
  let newHeader: string;

  if (status === 'added' || status === 'untracked') {
    oldHeader = '--- /dev/null';
    newHeader = `+++ b/${diff.path}`;
  } else if (status === 'deleted') {
    oldHeader = `--- a/${diff.path}`;
    newHeader = '+++ /dev/null';
  } else {
    // Modified, renamed, copied, or unknown — use oldPath for old side
    oldHeader = `--- a/${diff.oldPath ?? diff.path}`;
    newHeader = `+++ b/${diff.path}`;
  }

  const out: string[] = [oldHeader, newHeader];

  for (const hunk of diff.hunks) {
    out.push(hunk.header);
    for (const line of hunk.lines) {
      if (line.origin === '+' || line.origin === '-' || line.origin === ' ') {
        out.push(`${line.origin}${line.content}`);
      }
    }
  }

  return `${out.join('\n')}\n`;
}
```

**Error handling:** Wrap `parseDiffFromFile()` and `structuredDiffToUnified()` call sites in try/catch — on failure, log structured error and return `null` so consumers can fall back gracefully (not throw into React render).

### Phase 2: Migrate Edit Tool Widget (Highest Impact)

**Modify: `apps/agent/src/components/chat/tools/edit-tool-widget.tsx`**

This is the biggest visual upgrade — naive "all old red, all new green" becomes proper word-level diffs.

- Replace the manual `displayOldLines` / `displayNewLines` rendering (lines ~176-261) with Pierre's `<FileDiff>` component
- Use `parseDiffFromFile({ filename: filePath, contents: oldString }, { filename: filePath, contents: newString })`
- **Keep unchanged:** Header row (icon, filename link, status badges, DiffStat, chevron), AnimatePresence expand/collapse, tree-style gutter connector, success/failure indicator, "Show more/less" toggle (wrap Pierre output in `max-h-[300px] overflow-auto`)
- **Remove:** `useHighlightedTokens` calls for `oldTokens`/`newTokens` (Pierre handles highlighting)

### Phase 3: Migrate DiffFileCard (Git Source Control)

**Modify: `apps/agent/src/components/git/source-control/components/DiffFileCard.tsx`**

- Replace `DiffLineRow` rendering + the flatIndex hunk iteration (lines ~93-154, ~325-341) with Pierre's `<FileDiff>` or `<PatchDiff>`
- Use adapter `structuredDiffToUnified(diff, status)` to convert our `FileDiff` from `gitDiffStructured()` into a unified diff string (status comes from the corresponding `StatusEntry`)
- **Keep unchanged:** Header (status badge, filename, directory, DiffStat, stage/unstage/discard buttons, chevron), AnimatePresence animation, binary file fallback
- **Remove:** Internal `DiffLineRow` component, `useHighlightedTokens`, `fullContent` useMemo

**Critical: Preserve expansion gating** (from audit — Critical #3):

Current `DiffFileCard` intentionally gates heavy work behind `isExpanded` (~lines 183-190). The Pierre migration must preserve this pattern — unified diff reconstruction + Pierre parsing must NOT run for collapsed cards:

```tsx
const unifiedPatch = useMemo(() => {
  if (!isExpanded || !diff || diff.isBinary) return null;
  return structuredDiffToUnified(diff, status);
}, [isExpanded, diff, status]);

// Render Pierre only when unifiedPatch is non-null
```

This is critical for Source Control views with many changed files — parsing all diffs on mount would cause visible frame drops.

**Race condition guard:** If source control refreshes (new diff arrives) while old conversion is rendering, ensure the memoized input (`diff` reference) changes so stale output is never shown. The `useMemo` dep on `diff` handles this naturally as long as `diff` is referentially new on refresh.

### Phase 4: Migrate FileDiffViewer (File Tab Diffs)

> **Audit note (Recommended #2):** `FileDiffViewer` / `openFileWithDiff()` may be effectively dormant — current call sites appear test-only. **Before starting this phase, confirm real runtime entry points exist.** If unused, defer this phase to reduce migration scope and risk.

**Modify: `apps/agent/src/components/git/file-diff-viewer.tsx`**

- `ViewedFileDiff` already carries `oldContent` and `newContent` — pass directly to `parseDiffFromFile()`
- Replace `<DiffViewer hunks={...}>` with Pierre's `<FileDiff>`
- Theme follows dark mode via CSS variables
- **Contract simplification (post-migration):** `ViewedFileDiff` currently stores both `old/new` content and precomputed `diff` hunks. Pierre path only needs `old/new`. Once migration is stable, consider evolving `ViewedFileDiff` to a cleaner contract (keep compatibility shim during transition).

### Phase 5: Cleanup Dead Code

> **Audit Critical #1:** `computeSimpleDiff` is actively imported by `chat-message-service.ts` at lines ~31, ~1336, ~1349. It is used to populate `FileChange.diff` for the Edit tool's metadata — this is runtime code, not just rendering. **Removing it without migrating call sites will break the build.**

| Action                                             | File                              | Reason                                                                                  |
| -------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------- |
| Delete                                             | `components/git/diff-line.tsx`    | Replaced by Pierre                                                                      |
| Delete                                             | `components/git/diff-viewer.tsx`  | Replaced by Pierre                                                                      |
| **Keep OR atomically migrate** `computeSimpleDiff` | `lib/utils/diff-utils.ts`         | **Still called by `chat-message-service.ts`** — keep `getLanguageFromPath()` regardless |
| Update barrel                                      | `components/git/index.ts`         | Remove `DiffViewer`, `DiffLine` exports                                                 |
| Keep                                               | `diff-stat.tsx`, `diff-stats.tsx` | Stats bars not replaced                                                                 |
| Keep                                               | `use-syntax-highlight.ts`         | Still used by Write, Bash, Read tool widgets                                            |
| Keep                                               | `file-store.ts` types             | `FileDiff`/`DiffHunk`/`DiffLine` types may still be used by non-rendering consumers     |

**`computeSimpleDiff` migration strategy:**

Option A (safer): Keep `computeSimpleDiff` in `diff-utils.ts` — it's a small function (~20 lines) and its consumers are unrelated to rendering. Pierre replaces the _rendering_, not the diff-computation-for-metadata path.

Option B (full cleanup): Migrate all `chat-message-service.ts` call sites in the _same PR_ to use a Pierre-based equivalent or a lightweight inline diff, then remove. Never remove the function in a separate PR from its consumers.

### Phase 5.5: Adapter Tests (NEW — from audit Critical #4)

**Create `apps/agent/src/__tests__/unit/lib/pierre-adapter.test.ts`**

Automated tests for `structuredDiffToUnified()` and `editToolToPierreDiff()` — must pass before deleting old renderer code. Manual visual checks alone are insufficient for core transformation logic with many edge modes.

**Required test cases:**

```ts
// Rename: uses oldPath for old side, path for new side
it('uses oldPath for renamed files', () => {
  const text = structuredDiffToUnified(
    {
      path: 'new/name.ts',
      oldPath: 'old/name.ts',
      isBinary: false,
      hunks: [
        {
          header: '@@ -1 +1 @@',
          lines: [
            { origin: '-', content: 'a' },
            { origin: '+', content: 'b' },
          ],
        },
      ],
    },
    'renamed'
  );
  expect(text).toContain('--- a/old/name.ts');
  expect(text).toContain('+++ b/new/name.ts');
});

// Added: /dev/null on old side
it('uses /dev/null for added files', () => {
  const text = structuredDiffToUnified(
    {
      path: 'new-file.ts',
      isBinary: false,
      hunks: [{ header: '@@ -0,0 +1 @@', lines: [{ origin: '+', content: 'hello' }] }],
    },
    'added'
  );
  expect(text).toContain('--- /dev/null');
  expect(text).toContain('+++ b/new-file.ts');
});

// Deleted: /dev/null on new side
it('uses /dev/null for deleted files', () => {
  const text = structuredDiffToUnified(
    {
      path: 'old-file.ts',
      isBinary: false,
      hunks: [{ header: '@@ -1 +0,0 @@', lines: [{ origin: '-', content: 'goodbye' }] }],
    },
    'deleted'
  );
  expect(text).toContain('--- a/old-file.ts');
  expect(text).toContain('+++ /dev/null');
});

// Binary: returns null
it('returns null for binary files', () => {
  const text = structuredDiffToUnified({ path: 'image.png', isBinary: true, hunks: [] });
  expect(text).toBeNull();
});

// No status: defaults to modified (oldPath ?? path on both sides)
// Empty hunks array: valid — returns headers only
// Large hunk: 1000+ lines, verify no truncation
// Malformed input: missing fields → returns null, doesn't throw
```

### Phase 6: Verify

1. Run `bun run check` (typecheck + lint + tests) — **must include new adapter tests from Phase 5.5**
2. Run `bun run knip` to catch any remaining dead code
3. Visual testing with `bunx tauri dev`:
   - Edit tool diffs in chat messages
   - DiffFileCard expansion in source control panel
   - File viewer diff tab (if Phase 4 was not deferred)
   - Dark/light mode switching
   - Binary file handling
   - Expand/collapse animations (AnimatePresence + Pierre)
   - **Renamed file diffs** (verify `--- a/old` / `+++ b/new` headers)
   - **Added/deleted files** (one side empty)
   - **Large diffs** (100+ changed files in source control — verify no frame drops from collapsed cards)
   - **Provider-absent behavior** (temporarily remove PierreProvider — verify graceful degradation)
4. Run `cargo test` (no Rust changes expected, but confirm)

---

## Files Summary

### New Files

| File                                                       | Purpose                                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `apps/agent/src/lib/utils/pierre-adapter.ts`               | Convert Orbit diff types → Pierre input formats                                  |
| `apps/agent/src/providers/pierre-provider.tsx`             | WorkerPoolContextProvider wrapper                                                |
| `apps/agent/src/__tests__/unit/lib/pierre-adapter.test.ts` | Adapter correctness tests (rename, add, delete, binary, empty, large, malformed) |

### Modified Files

| File                                                                       | Change                                                                                                           |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `package.json`                                                             | Add `@pierre/diffs`, `@pierre/precision-diffs`                                                                   |
| `vite.config.ts`                                                           | optimizeDeps + manualChunks for Pierre                                                                           |
| `apps/agent/src/globals.css`                                               | Pierre CSS variable overrides                                                                                    |
| `apps/agent/src/App.tsx`                                                   | Wrap with PierreProvider                                                                                         |
| `apps/agent/src/components/chat/tools/edit-tool-widget.tsx`                | Replace inline diff rendering                                                                                    |
| `apps/agent/src/components/git/source-control/components/DiffFileCard.tsx` | Replace DiffLineRow                                                                                              |
| `apps/agent/src/components/git/file-diff-viewer.tsx`                       | Replace DiffViewer                                                                                               |
| `apps/agent/src/lib/utils/diff-utils.ts`                                   | Remove `computeSimpleDiff` only if call sites in `chat-message-service.ts` are migrated in same PR (see Phase 5) |
| `apps/agent/src/components/git/index.ts`                                   | Update barrel exports                                                                                            |

### Deleted Files

| File                                            | Reason         |
| ----------------------------------------------- | -------------- |
| `apps/agent/src/components/git/diff-line.tsx`   | Fully replaced |
| `apps/agent/src/components/git/diff-viewer.tsx` | Fully replaced |

---

## Risks

| Risk                                                                  | Mitigation                                                                                                           |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Shiki version conflict (we pin `shiki@^3.22`, Pierre bundles its own) | Check peer deps; add `overrides` in package.json if needed                                                           |
| AnimatePresence height animation with Pierre's DOM                    | Pierre renders standard DOM (not Shadow DOM per docs research); `height: 'auto'` should work. Test early.            |
| Tauri WKWebView + Web Workers                                         | WorkerPoolContextProvider is optional; Pierre falls back to main-thread. Skip if issues.                             |
| Bundle size (~Pierre bundles Shiki internally)                        | manualChunks to isolate; acceptable for desktop app. Use lazy imports (Phase 0, step 5) to avoid startup regression. |
| Pierre's `<FileDiff>` chrome conflicts with our header/wrapper        | We only use Pierre for the diff content area inside our existing wrappers                                            |
| `computeSimpleDiff` removal breaks build (audit Critical #1)          | Keep function or atomically migrate all `chat-message-service.ts` call sites in same PR (Phase 5)                    |
| Renamed file paths misrepresented (audit Critical #2)                 | Use `oldPath ?? path` for `---` header, `path` for `+++` header (Phase 1 adapter rules)                              |
| Collapsed DiffFileCard performance regression (audit Critical #3)     | Gate unified reconstruction + Pierre parse behind `isExpanded` with `useMemo` (Phase 3)                              |
| Parse failure on malformed diff content or unexpected encoding        | Adapter functions return `null` on error; consumers show fallback or "unable to render diff" message                 |
| Source control refresh race (new diff arrives while old renders)      | `useMemo` dep on `diff` reference ensures stale output replaced when input changes                                   |
| Extremely large diffs (1000+ lines) across multiple expanded cards    | Addressed by expansion gating; monitor with optional render timing instrumentation                                   |

---

## Future Enhancements (from audit nice-to-haves)

These are optional improvements to consider after the core migration is stable:

| Enhancement                                                                   | Benefit                                                             |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Single `DiffSurface` wrapper used by all three surfaces                       | Centralizes Pierre config, theming, fallback, and telemetry         |
| Persist user split/stacked diff layout preference in settings store           | UX continuity and personalization                                   |
| Lightweight render timing instrumentation around adapter + diff render        | Detects regressions early on large repos and long chat edit outputs |
| Evolve `ViewedFileDiff` to drop precomputed hunks (Pierre only needs old/new) | Cleaner contract, less redundant data                               |
