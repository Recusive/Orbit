# Plan: Replace Custom Diff Rendering with @pierre/diffs

## Context

Orbit has three diff rendering surfaces — all custom-built with no external diff library. The Edit tool widget uses a particularly naive approach (all old lines = red, all new lines = green, no word-level diffing). The user wants to adopt `@pierre/diffs` by The Pierre Computer Co. for a more polished, professional diff UX — the same library used by other modern code tools.

**Key wins:** Word-level inline change highlighting (biggest gap), split/stacked view toggle, CSS Grid rendering (fewer DOM nodes), and less custom code to maintain (~500 lines of rendering replaced).

---

## Surfaces to Migrate

| Surface                  | File                   | Input Data                         | Pierre Component                           |
| ------------------------ | ---------------------- | ---------------------------------- | ------------------------------------------ |
| **Edit tool** (chat)     | `edit-tool-widget.tsx` | `oldString` + `newString`          | `parseDiffFromFile()` → `<FileDiff>`       |
| **Git source control**   | `DiffFileCard.tsx`     | `FileDiff` from Rust backend       | Reconstruct unified string → `<PatchDiff>` |
| **File viewer diff tab** | `file-diff-viewer.tsx` | `ViewedFileDiff` (old/new content) | `parseDiffFromFile()` → `<FileDiff>`       |

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
   - Map Pierre's CSS variables to our oklch color system in both `:root` and `html.dark` blocks
   - Variables: `--diffs-bg`, `--diffs-fg`, `--diffs-addition-*`, `--diffs-deletion-*`, etc.
   - For syntax highlighting: use `github-dark` / `github-light` Shiki themes (already familiar from our `useHighlightedTokens`)

4. **Add `WorkerPoolContextProvider` in `App.tsx`**
   - Wrap inside `<ThemeProvider>` → `<PierreProvider>` → `<TauriProvider>`
   - Create thin `apps/agent/src/providers/pierre-provider.tsx` wrapper
   - If Web Workers have issues in Tauri's WKWebView, this is optional — Pierre falls back to main-thread highlighting

### Phase 1: Adapter Layer

**Create `apps/agent/src/lib/utils/pierre-adapter.ts`**

Two adapter functions for converting our data to Pierre's input format:

```
editToolToPierreDiff(filePath, oldString, newString)
  → calls parseDiffFromFile() from @pierre/diffs
  → returns FileDiffMetadata for <FileDiff> component

structuredDiffToUnified(diff: GitFileDiff)
  → reconstructs unified diff string from our Rust-parsed DiffHunk[]
  → "--- a/{path}\n+++ b/{path}\n" + hunk headers + origin lines
  → returns string for <PatchDiff> component (or parsePatchFiles())
```

The second function avoids adding new Rust commands — we reconstruct unified diff from the structured data we already have from `gitDiffStructured()` / `gitStagedDiff()`.

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
- Use adapter `structuredDiffToUnified(diff)` to convert our `FileDiff` from `gitDiffStructured()` into a unified diff string
- **Keep unchanged:** Header (status badge, filename, directory, DiffStat, stage/unstage/discard buttons, chevron), AnimatePresence animation, binary file fallback
- **Remove:** Internal `DiffLineRow` component, `useHighlightedTokens`, `fullContent` useMemo

### Phase 4: Migrate FileDiffViewer (File Tab Diffs)

**Modify: `apps/agent/src/components/git/file-diff-viewer.tsx`**

- `ViewedFileDiff` already carries `oldContent` and `newContent` — pass directly to `parseDiffFromFile()`
- Replace `<DiffViewer hunks={...}>` with Pierre's `<FileDiff>`
- Theme follows dark mode via CSS variables

### Phase 5: Cleanup Dead Code

| Action                     | File                              | Reason                                                                              |
| -------------------------- | --------------------------------- | ----------------------------------------------------------------------------------- |
| Delete                     | `components/git/diff-line.tsx`    | Replaced by Pierre                                                                  |
| Delete                     | `components/git/diff-viewer.tsx`  | Replaced by Pierre                                                                  |
| Remove `computeSimpleDiff` | `lib/utils/diff-utils.ts`         | Pierre computes diffs; keep `getLanguageFromPath()`                                 |
| Update barrel              | `components/git/index.ts`         | Remove `DiffViewer`, `DiffLine` exports                                             |
| Keep                       | `diff-stat.tsx`, `diff-stats.tsx` | Stats bars not replaced                                                             |
| Keep                       | `use-syntax-highlight.ts`         | Still used by Write, Bash, Read tool widgets                                        |
| Keep                       | `file-store.ts` types             | `FileDiff`/`DiffHunk`/`DiffLine` types may still be used by non-rendering consumers |

### Phase 6: Verify

1. Run `bun run check` (typecheck + lint + tests)
2. Run `bun run knip` to catch any remaining dead code
3. Visual testing with `bunx tauri dev`:
   - Edit tool diffs in chat messages
   - DiffFileCard expansion in source control panel
   - File viewer diff tab
   - Dark/light mode switching
   - Binary file handling
   - Expand/collapse animations (AnimatePresence + Pierre)
4. Run `cargo test` (no Rust changes expected, but confirm)

---

## Files Summary

### New Files

| File                                           | Purpose                                         |
| ---------------------------------------------- | ----------------------------------------------- |
| `apps/agent/src/lib/utils/pierre-adapter.ts`   | Convert Orbit diff types → Pierre input formats |
| `apps/agent/src/providers/pierre-provider.tsx` | WorkerPoolContextProvider wrapper               |

### Modified Files

| File                                                                       | Change                                         |
| -------------------------------------------------------------------------- | ---------------------------------------------- |
| `package.json`                                                             | Add `@pierre/diffs`, `@pierre/precision-diffs` |
| `vite.config.ts`                                                           | optimizeDeps + manualChunks for Pierre         |
| `apps/agent/src/globals.css`                                               | Pierre CSS variable overrides                  |
| `apps/agent/src/App.tsx`                                                   | Wrap with PierreProvider                       |
| `apps/agent/src/components/chat/tools/edit-tool-widget.tsx`                | Replace inline diff rendering                  |
| `apps/agent/src/components/git/source-control/components/DiffFileCard.tsx` | Replace DiffLineRow                            |
| `apps/agent/src/components/git/file-diff-viewer.tsx`                       | Replace DiffViewer                             |
| `apps/agent/src/lib/utils/diff-utils.ts`                                   | Remove `computeSimpleDiff`                     |
| `apps/agent/src/components/git/index.ts`                                   | Update barrel exports                          |

### Deleted Files

| File                                            | Reason         |
| ----------------------------------------------- | -------------- |
| `apps/agent/src/components/git/diff-line.tsx`   | Fully replaced |
| `apps/agent/src/components/git/diff-viewer.tsx` | Fully replaced |

---

## Risks

| Risk                                                                  | Mitigation                                                                                                |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Shiki version conflict (we pin `shiki@^3.22`, Pierre bundles its own) | Check peer deps; add `overrides` in package.json if needed                                                |
| AnimatePresence height animation with Pierre's DOM                    | Pierre renders standard DOM (not Shadow DOM per docs research); `height: 'auto'` should work. Test early. |
| Tauri WKWebView + Web Workers                                         | WorkerPoolContextProvider is optional; Pierre falls back to main-thread. Skip if issues.                  |
| Bundle size (~Pierre bundles Shiki internally)                        | manualChunks to isolate; acceptable for desktop app                                                       |
| Pierre's `<FileDiff>` chrome conflicts with our header/wrapper        | We only use Pierre for the diff content area inside our existing wrappers                                 |
