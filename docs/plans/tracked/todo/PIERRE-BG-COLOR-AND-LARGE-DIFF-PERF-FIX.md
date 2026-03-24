# Fix: Pierre Dark Mode Background + Large Diff Performance

## Context

Two issues from Codex's Pierre 1.1.3 upgrade implementation:

1. **Background color**: Diff card body shows black in dark mode instead of matching Orbit's sidebar. Setting `--diffs-bg: var(--sidebar)` doesn't work because Pierre's `style.css:133` overrides `--diffs-bg` on child elements with `light-dark(var(--diffs-light-bg), var(--diffs-dark-bg))`. The correct variables to override are `--diffs-light-bg` and `--diffs-dark-bg` — these are populated by Pierre's Shiki theme output but default to the `pierre-dark`/`pierre-light` theme backgrounds, which don't match Orbit.

2. **Performance**: Expanding a 10k-line file with 1 changed line freezes the app for 3-5+ seconds. The tier classification only checks `totalChangedLines` (additions + deletions), so a 10k-line file with 1 change is "small" tier → gets full `preloadFileDiff()` (Shiki highlights ALL 10,000 lines on main thread) + no virtualization. The app stays laggy for 10-15 seconds across pages.

**Previous plan**: `docs/plans/tracked/todo/LARGE-DIFF-PERFORMANCE-VIRTUALIZATION.md` covers the broader Pierre upgrade architecture (virtualizer wiring, worker pool, cache, diff tabs). This plan addresses the two immediate bugs that shipped with that implementation.

**Pierre source reference**: `/Users/no9labs/Developer/Recursive/Snowflake-v0/reference/pierre/` — cloned from `https://github.com/pierrecomputer/pierre.git`. Key files for auditing:

- `packages/diffs/src/style.css` — CSS variables, `--diffs-bg`, `light-dark()` usage (lines 5, 64, 128-150)
- `packages/diffs/src/utils/getHighlighterThemeStyles.ts` — generates `--diffs-light-bg`/`--diffs-dark-bg` from Shiki themes
- `packages/diffs/src/utils/iterateOverDiff.ts` — windowed line rendering (`startingLine`/`totalLines`)
- `packages/diffs/src/components/Virtualizer.ts` — IntersectionObserver-based virtualization
- `packages/diffs/src/components/VirtualizedFileDiff.ts` — virtualized diff wrapper, metrics, height reconciliation
- `packages/diffs/src/worker/WorkerPoolManager.ts` — worker pool with LRU cache
- `packages/diffs/src/renderers/DiffHunksRenderer.ts` — hunk-level rendering with `renderRange`
- `packages/diffs/src/components/FileDiff.ts` — main diff component, `themeType` handling

---

## Fix 1: Dark Mode Background Color

### Root Cause (from Pierre source: `packages/diffs/src/style.css`)

```css
/* Line 5 — host default */
:host {
  --diffs-bg: #fff;
}

/* Line 133 — OVERRIDES host default on ALL child elements */
[data-diffs-header],
[data-diff],
[data-file],
[data-error-wrapper],
[data-virtualizer-buffer] {
  --diffs-bg: light-dark(var(--diffs-light-bg), var(--diffs-dark-bg));
}
```

`--diffs-light-bg` and `--diffs-dark-bg` are set by Shiki's theme output via `getHighlighterThemeStyles()` (`packages/diffs/src/utils/getHighlighterThemeStyles.ts:30-35`):

```typescript
styles += `${prefix}dark-bg:${themeData.bg};`; // e.g., --diffs-dark-bg: #1e1e1e
styles += `${prefix}light-bg:${themeData.bg};`; // e.g., --diffs-light-bg: #ffffff
```

These get injected into Pierre's shadow DOM via `<style data-unsafe-css>`. So Pierre's dark background comes from the `pierre-dark` Shiki theme's `bg` property (`#1e1e1e`), NOT from the `--diffs-bg` CSS variable we set on the host.

Setting `--diffs-bg` on the host is useless — line 133 overrides it. Setting `--diffs-bg` via `unsafeCSS` injection would work but is fragile.

### Fix

**File**: `apps/agent/src/lib/utils/pierre-adapter.ts`

Override `--diffs-light-bg` and `--diffs-dark-bg` in `PIERRE_DIFF_STYLE`. CSS custom properties inherit through shadow DOM boundaries, and these are the actual variables Pierre's `light-dark()` resolves.

```typescript
export const PIERRE_DIFF_STYLE = {
  '--diffs-gap-fallback': '0px',
  '--diffs-gap-block': '0px',
  '--diffs-gap-inline': '0px',
  '--diffs-font-family': "'Berkeley Mono', 'Geist Mono Variable', ...",
  '--diffs-font-size': '0.8125rem',
  '--diffs-line-height': '1.5',
  '--diffs-light-bg': 'var(--sidebar)', // Orbit's light sidebar color
  '--diffs-dark-bg': 'var(--sidebar)', // Orbit's dark sidebar color
  '--diffs-bg-separator-override': `light-dark(${LIGHT_SEPARATOR}, ${DARK_SEPARATOR})`,
} as const;
```

Remove the broken `--diffs-bg: var(--sidebar)` that was added earlier — it has no effect due to line 133's override.

**Keep `--diffs-bg-context-override`** — Pierre still reads it at `style.css:152` for unchanged/context row backgrounds. If present, set it to `var(--sidebar)` to match. If absent, Pierre derives context background from `--diffs-bg` via `color-mix()`.

---

## Fix 2: Large Diff Performance — Tier Reclassification

### Root Cause

The tier classification at `DiffFileCard.tsx:172` only checks `totalChangedLines`:

```typescript
const totalChangedLines = getPierreChangedLineCount(additions, deletions);
const diffTier = getPierreDiffRenderTier(totalChangedLines);
// 10k-line file + 1 change = totalChangedLines=1 → "small" tier
```

"Small" tier means:

1. `shouldPrerender = true` → `preloadFileDiff()` runs Shiki on ALL 10,000 lines (main thread, 3-5s)
2. `VirtualizerContext.Provider value={undefined}` → NO Pierre virtualization
3. Full `prerenderedHTML` injected into shadow DOM → massive DOM tree

### Fix: Two changes

**Change A — Skip prerender for large content** (`DiffFileCard.tsx`, `hydratePreparedDiff`):

After parsing, `fileDiffMetadata.unifiedLineCount` gives the total line count. Check this BEFORE running Shiki:

```typescript
async function hydratePreparedDiff(
  parsed: Omit<PreparedDiff, 'prerenderedHTML'>,
  shouldPrerender: boolean,
  options: FileDiffOptions<undefined>
): Promise<PreparedDiff> {
  // Skip prerender for large files even if changed-line count says "small".
  // A 10k-line file with 1 change still has 10k lines of Shiki work.
  const totalContentLines = parsed.fileDiff.unifiedLineCount;
  if (!shouldPrerender || totalContentLines > LARGE_DIFF_INLINE_THRESHOLD) {
    return parsed;
  }
  // ... existing preloadFileDiff path
}
```

**Change B — Reclassify rendering tier by content size** (`DiffFileCard.tsx`, tier computation):

After `preparedDiff` is available, use the MORE conservative of changed-line tier vs content-line tier:

```typescript
const changedTier = preparedDiff
  ? getPierreDiffRenderTier(
      getPierreChangedLineCount(preparedDiff.additions, preparedDiff.deletions)
    )
  : diffTier;
const contentTier = preparedDiff
  ? getPierreDiffRenderTier(preparedDiff.fileDiff.unifiedLineCount)
  : diffTier;
// Use the MORE conservative tier
const preparedDiffTier =
  contentTier === 'pathological' || changedTier === 'pathological'
    ? 'pathological'
    : contentTier === 'large' || changedTier === 'large'
      ? 'large'
      : 'small';
```

This means:

- 10k-line file + 1 change: `changedTier=small`, `contentTier=pathological` → **pathological** (shows "Open in diff tab")
- 500-line file + 10 changes: `changedTier=small`, `contentTier=large` → **large** (virtualized, no prerender)
- 100-line file + 50 changes: `changedTier=small`, `contentTier=small` → **small** (prerendered, no virtualization)

**Change C — Apply content-size tiering to dedicated diff tab** (`file-diff-viewer.tsx`):

The inline card routes pathological diffs to "Open in diff tab", but `file-diff-viewer.tsx:69` also only checks changed-line count. A 10k-line file with 1 change opened in the diff tab can still take the non-virtualized path. Apply the same content-size tier logic there.

**Impact**: 10k-line stress repo files go from 3-5 second freeze → instant on both inline AND diff tab paths.

---

## Files Modified

| File                                                                       | Change                                                                                             |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/agent/src/lib/utils/pierre-adapter.ts`                               | Replace `--diffs-bg` with `--diffs-light-bg`/`--diffs-dark-bg`, keep `--diffs-bg-context-override` |
| `apps/agent/src/components/git/source-control/components/DiffFileCard.tsx` | Content-line threshold in `hydratePreparedDiff`, tier reclassification                             |
| `apps/agent/src/components/git/file-diff-viewer.tsx`                       | Apply same content-size tiering (don't let 10k-line + 1 change take non-virtualized path)          |

---

## Verification

1. `bun run typecheck` — no type errors (including pierre-adapter imports)
2. `bun run lint` — clean
3. **Dark mode test**: Expand a diff card → background matches sidebar color, not black
4. **Light mode test**: Expand a diff card → background matches light sidebar, not white/transparent mismatch
5. **Large file test**: Open stress repo, expand `large-file-ts.ts` (10k lines) → no freeze, "Open in diff tab" shown (pathological tier)
6. **Small file test**: Expand `small-file-1.ts` (100 lines) → instant render with prerendered HTML (small tier, unchanged)
7. **Medium file test**: Expand `medium-file-1.ts` (1000 lines) → renders via virtualization without prerender (large tier)
