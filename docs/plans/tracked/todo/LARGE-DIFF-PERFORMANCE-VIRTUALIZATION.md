# Large Diff Performance: Production-Ready Pierre Virtualization Plan

## Problem

Expanding a `DiffFileCard` for a file with roughly 1000+ changed lines makes the Source Control panel feel sluggish even after the single-file diff fetch work was moved behind bounded backend APIs and request scheduling.

This is no longer primarily a git or IPC problem. It is a render-path problem:

- `DiffFileCard` parses the entire file diff and often pre-renders full highlighted HTML on the main thread
- Pierre mounts a very large DOM tree for expanded diffs
- the expanded diff lives inside a scrolling file list, so layout/paint cost leaks into the whole panel

This is a production issue. The app has real user volume and the fix must preserve current functionality, not trade it away.

## Goals

1. Keep Pierre as the diff renderer.
2. Preserve all current capabilities:
   - inline expand/collapse
   - hover prefetch
   - unchanged-line expansion
   - binary handling
   - stage / unstage / discard flows
   - dedicated file-viewer diff mode
3. Achieve IDE-grade behavior for large diffs:
   - opening a large diff should not freeze the panel
   - scrolling the Source Control panel while a large diff is open should remain responsive
   - reopening or remounting the same diff should be substantially cheaper
4. Keep risk contained for a production rollout.

## Non-Goals

1. Replacing Pierre with another renderer.
2. Rewriting the diff backend again.
3. Shipping a user-visible feature regression as the main solution.

## Pierre Docs Read and Applied

The production plan below is based on these Pierre sections:

- [Worker Pool](https://diffs.com/docs#worker-pool)
- [SSR](https://diffs.com/docs#ssr)
- [Virtualization](https://diffs.com/docs#virtualization)

Important facts from those sections:

1. Pierre `1.1.3` adds React-side `Virtualizer` support for very large files and long diff lists.
2. Pierre recommends using virtualization together with the worker pool for large diffs.
3. Worker pools support cached rendered AST results when files/diffs provide stable `cacheKey` values.
4. SSR / `prerenderedHTML` helps initial render and hydration, but it does not remove DOM/layout cost after mount.
5. Virtualization is beta. It should be introduced narrowly and behind strong fallbacks, not sprayed across every Pierre surface indiscriminately.

## Current Codebase Reality

The current implementation already has the following relevant pieces:

- root Pierre wrapper exists:
  - `apps/agent/src/providers/pierre-provider.tsx`
- inline Source Control diff cards:
  - `apps/agent/src/components/git/source-control/components/DiffFileCard.tsx`
- Source Control list virtualization already exists at the file-card level via React Virtuoso:
  - `apps/agent/src/components/git/source-control/components/ChangesList.tsx`
- dedicated diff tab renderer exists:
  - `apps/agent/src/components/git/file-diff-viewer.tsx`
- Source Control data fetching and diff refresh logic exists:
  - `apps/agent/src/components/git/source-control/hooks/use-source-control.ts`
- file viewer already supports opening a diff tab:
  - `apps/agent/src/stores/file/file-viewer-store.ts`
- Pierre theme/config adapter already exists:
  - `apps/agent/src/lib/utils/pierre-adapter.ts`

This means the right plan is not “bolt everything into `SourceControlTab`.” The right plan is:

- upgrade Pierre
- centralize worker-pool ownership in the existing Pierre provider
- apply Pierre virtualization only where it materially reduces DOM cost
- route pathological cases into the already-existing dedicated diff-viewer flow

## Production Architecture Decision

### 1. Upgrade Pierre to `1.1.3`

Upgrade:

- `@pierre/diffs` from `^1.0.11` to `1.1.3`

Why:

- virtualization and worker-pool APIs needed for this fix are only present in the 1.1.x line

Risk handling:

- this is a library upgrade, not just a local refactor
- the upgrade must be accompanied by typecheck, lint, and targeted runtime verification before merge

## 2. Use the Existing Root Pierre Provider as the Worker Pool Boundary

Do **not** create worker pools per diff card or per Source Control tab.

Change:

- `apps/agent/src/providers/pierre-provider.tsx`

From:

- preload-only pass-through provider

To:

- the single production `WorkerPoolContextProvider` owner for the app

Why:

- all Pierre surfaces benefit:
  - Source Control inline diff cards
  - dedicated diff viewer
  - chat write/edit tool diffs
- one shared pool is what Pierre’s React API is designed for
- it prevents per-card worker churn and duplicated caches

Production requirements:

1. Feature-detect worker availability.
2. If worker construction fails, fall back to the current non-worker render path instead of breaking diffs.
3. Keep one conservative worker-pool size rather than defaulting blindly to the maximum thread count.
4. Keep worker render options stable; avoid frequent `setRenderOptions()` churn because Pierre documents that render-option changes invalidate cache and force rerenders.

### 3. Add Stable Pierre Cache Keys

Pierre’s worker-pool cache only helps if files/diffs carry stable `cacheKey` values.

Change:

- `apps/agent/src/lib/utils/pierre-adapter.ts`
- `apps/agent/src/components/git/source-control/components/DiffFileCard.tsx`

Add:

- helper(s) that build stable `FileContents.cacheKey`
- ensure parsed diffs inherit stable cache identity

Key rule:

- cache keys must be derived from content identity, not transient poll timestamps

Good:

- file path + content hash

Bad:

- `lastUpdated`
- mount instance ids
- scroll state

Why:

- we want remount / reopen / hover / scroll-away-scroll-back to reuse cached render work
- we do **not** want cache misses every 5 seconds just because git polling happened

### 4. Wire Pierre Virtualizer into Existing Source Control Scroll Tree

**Critical architecture constraint**: Pierre's React `<Virtualizer>` wants to own the scroll container. But `SourceControlTab` already owns the scroll element (`SourceControlTab.tsx:188`), and `ChangesList` uses React Virtuoso with `customScrollParent` (`ChangesList.tsx:211`). Wrapping each large DiffFileCard in a local `<Virtualizer>` would create **nested scroll regions** — broken UX.

**Solution**: Use `VirtualizerContext.Provider` in `SourceControlTab` with a manually created Pierre `Virtualizer` instance wired to the **existing** scroll element. This gives us shared scroll ownership — Virtuoso handles file card list virtualization, Pierre handles line-level virtualization within expanded large diffs, both on the same scroll container.

**File**: `apps/agent/src/components/git/source-control/SourceControlTab.tsx`

**Content wrapper requirement** (audit critical issue): The current scroll container has multiple sibling children (OperationError, DiscardConfirmation, CommitForm, GitActions, divider, ChangesList). Pierre's `Virtualizer.setup(scrollElement, contentContainer)` requires a **single content wrapper** inside the scroll element to track total scrollable height. Using `firstElementChild` would break when conditional banners appear/disappear.

**Solution**: Add an explicit inner `<div>` wrapper around all scrollable content. The scroll ref stays on the outer element, the content wrapper ref goes to Pierre.

```tsx
import { VirtualizerContext } from '@pierre/diffs/react';
import { Virtualizer as PierreVirtualizerCore } from '@pierre/diffs';

// Inside SourceControlTab:
const pierreVirtualizerRef = useRef<PierreVirtualizerCore | null>(null);
const [pierreVirtualizer, setPierreVirtualizer] = useState<PierreVirtualizerCore | undefined>();
const scrollNodeRef = useRef<HTMLDivElement | null>(null);
const contentWrapperRef = useRef<HTMLDivElement | null>(null);

// Scroll ref callback — stable deps, no pierreVirtualizer in closure
const mergedScrollRef = useCallback((node: HTMLDivElement | null) => {
  scrollNodeRef.current = node;
  setScrollParent(node);
  smoothScrollRef(node);
}, [smoothScrollRef]);

// Setup/cleanup in useLayoutEffect — fires after both refs are mounted
useLayoutEffect(() => {
  const scrollNode = scrollNodeRef.current;
  const contentNode = contentWrapperRef.current;

  // Clean up previous
  if (pierreVirtualizerRef.current) {
    pierreVirtualizerRef.current.cleanUp();
    pierreVirtualizerRef.current = null;
  }

  if (!scrollNode || !contentNode) {
    setPierreVirtualizer(undefined);
    return;
  }

  const instance = new PierreVirtualizerCore({ overscrollSize: 600 });
  instance.setup(scrollNode, contentNode);
  pierreVirtualizerRef.current = instance;
  setPierreVirtualizer(instance);

  return () => {
    instance.cleanUp();
    pierreVirtualizerRef.current = null;
    setPierreVirtualizer(undefined);
  };
}, [scrollParent]); // Re-runs if scroll node identity changes (e.g., tab remount)

// In the JSX — wrap ALL scroll children in a single content div:
return (
  <div className={cn('flex flex-col h-full', className)}>
    {/* Header (not scrollable) */}
    <div className="..." style={{ height: HEADER_HEIGHT }}>
      {/* BranchSelector, Fetch, Refresh */}
    </div>

    {/* Scroll container — Pierre virtualizer's scrollElement */}
    <div ref={mergedScrollRef} className="flex-1 overflow-y-scroll ...">
      {/* Single content wrapper — Pierre virtualizer's contentContainer */}
      <div ref={contentWrapperRef}>
        {operationError ? <OperationError /> : null}
        {pendingDiscard ? <DiscardConfirmation /> : null}
        <CommitForm />
        <GitActions />
        <div className="mx-3 my-1.5 h-px bg-foreground/5" />
        <VirtualizerContext.Provider value={pierreVirtualizer}>
          <ChangesList scrollParent={scrollParent} ... />
        </VirtualizerContext.Provider>
      </div>
    </div>
  </div>
);
```

**Why `VirtualizerContext.Provider` wraps only `ChangesList`**: Pierre virtualization only matters for `<FileDiff>` components inside expanded cards. CommitForm, GitActions, etc. are not Pierre surfaces — they don't need the context. Scoping the provider to `ChangesList` prevents unnecessary context subscriptions.

**Key behaviors**:

- Pierre virtualizer shares the same scroll element as Virtuoso — no nested scrolling
- Content wrapper is stable (always mounted) — conditional banners inside it don't break measurement
- Any `<FileDiff>` rendered inside `VirtualizerContext` automatically virtualizes its line rendering
- Virtuoso remeasurement: when Pierre expands lines asynchronously, Virtuoso's `customScrollParent` picks up height changes via the shared scroll container
- Tab hide/show: scroll ref callback fires on remount → Pierre virtualizer recreated against same DOM structure

**Selective application**: Keep the existing non-virtualized `FileDiff` path for small diffs (Tier A). Pierre's virtualizer only adds value for large diffs where DOM weight is the bottleneck. Small diffs with `prerenderedHTML` render instantly with no measurement overhead.

### 5. Separate “Open Large Diff” from “Inline Large Diff”

For truly pathological inline cases, do **not** dump the whole experience into a plain editor.

Instead:

- show a clear inline message in the card: “Large diff (N lines changed) — Open in diff tab”
- route to the dedicated diff viewer via `openFileWithDiff`

**Scope clarification** (audit critical issue #2):

The current diff-tab flow (`file-diff-viewer.tsx`, `file-viewer-store.ts`) is **read-only** and has **no Source Control caller** today. The `ViewedFileDiff` type only holds `oldContent`/`newContent` strings.

**Decision**: The diff tab fallback is explicitly **read-only**. Stage/unstage/discard remain in the Source Control panel — the user returns to SC for those actions. This matches GitHub and VS Code behavior: opening a diff in a separate tab doesn't expose inline stage buttons.

**Required schema extension** for the diff tab to stay coherent:

```typescript
// In file-viewer-store.ts — extend ViewedFileDiff:
interface ViewedFileDiff {
  oldContent: string;
  newContent: string;
  repoPath: string; // NEW: for cache invalidation
  scope: DiffScope; // NEW: staged vs unstaged
  filePath: string; // NEW: for re-fetch on invalidation
  oldPath: string | null; // NEW: for rename tracking
  statusFingerprint: string; // NEW: stale detection
}
```

**Invalidation**: When `statusFingerprint` changes (status polled), compare with the open diff tab's fingerprint. If different, show a subtle “Diff may be outdated — reload?” banner. Don't auto-reload (user may be reading).

**New Source Control caller**: Add `handleOpenInDiffTab(file: FileItem)` in `DiffFileCard` that calls `openFileWithDiff` with the extended payload. Wire to the “Open in diff tab” button.

Why:

- removes the heaviest render from the scrolling file list
- read-only is the right scope — avoids complex action-in-tab wiring
- invalidation metadata prevents silently stale diff tabs

## Threshold Strategy

Use three tiers.

### Tier A: Small Diffs

Suggested threshold:

- fewer than `400` changed lines

Behavior:

- current inline experience
- keep `prerenderedHTML`
- no virtualization

### Tier B: Large Diffs

Suggested threshold:

- `400` to `9999` changed lines

Behavior:

- still inline-expandable
- rendered inside Pierre `Virtualizer`
- worker pool enabled globally
- stable cache keys
- skip `preloadFileDiff()` for very large inline diffs and let Pierre render progressively instead

Important:

- this is the main fix for the reported 1000+ line lag

### Tier C: Pathological Diffs

Suggested threshold:

- `10000+` changed lines

Behavior:

- do not render inline in the Source Control list
- show “Large diff — Open in diff tab”
- open the dedicated diff viewer instead

Why:

- even with virtualization, keeping a truly massive diff inside the scrolling card list is a poor production trade

Thresholds are intentionally conservative and should be measured after implementation.

### 6. Parsed Diff Cache for Reopen/Remount

**Problem** (audit critical issue #3): Today, collapsing a DiffFileCard clears `preloaded` (`DiffFileCard.tsx:269-290`). Reopening refetches content via IPC, reparses with `parseDiffFromFile()`, and regenerates SSR HTML — every single time. Pierre's worker cache only helps with Shiki highlighting, not the IPC + parse cost.

**Solution**: Add a module-level `parsedDiffCache` that survives collapse/expand cycles. Keyed by content identity (not transient timestamps), invalidated on status changes.

**File**: `apps/agent/src/lib/utils/pierre-adapter.ts` (or new `pierre-diff-cache.ts`)

```typescript
interface CachedParsedDiff {
  fileDiff: FileDiffMetadata;
  additions: number;
  deletions: number;
  oldContent: string; // Keep content for Pierre re-render without IPC
  newContent: string;
}

const parsedDiffCache = new Map<string, CachedParsedDiff>();
const MAX_CACHE_ENTRIES = 20; // LRU eviction

function getParsedDiffCacheKey(params: {
  repoPath: string;
  scope: DiffScope;
  path: string;
  oldPath: string | null;
  statusFingerprint: string;
}): string {
  return [
    params.repoPath,
    params.scope,
    params.path,
    params.oldPath ?? '',
    params.statusFingerprint,
  ].join('::');
}

export function getCachedParsedDiff(key: string): CachedParsedDiff | undefined;
export function setCachedParsedDiff(key: string, entry: CachedParsedDiff): void;
export function clearParsedDiffCache(): void;
```

**DiffFileCard integration**:

- On expand: check cache first → if hit, skip IPC + parse, go straight to Pierre render
- On successful fetch + parse: write to cache
- On collapse: do NOT clear the cache entry (only clear local `preloaded` state)
- On `statusFingerprint` change: old cache keys become stale (fingerprint is part of key)
- On workspace change: `clearParsedDiffCache()`

**Impact**: Second expand of the same file on the same revision is instant — no IPC, no parsing. Scroll-away-scroll-back also reuses cache. Only a real status change forces refetch.

---

## SSR / `prerenderedHTML` Policy

Pierre SSR support is useful, but we should not use it blindly.

Use `prerenderedHTML` for:

- small / medium diffs where instant open is worth the cost

Do **not** require it for:

- large virtualized diffs

Why:

- `preloadFileDiff()` still has real work cost
- generating giant prerendered HTML for large diffs partially defeats the point of virtualization
- for large diffs, progressive worker-backed rendering is the better production trade

## Metrics Tuning

Pierre’s virtualization docs explicitly say custom layouts should provide metrics.

Add shared metrics constants derived from the current Orbit diff styles:

- line height
- file gap
- header height
- hunk separator height

Apply these metrics consistently to:

- virtualized Source Control diff cards
- virtualized dedicated diff viewer

Why:

- better initial height estimates
- fewer measurement corrections
- less scroll jitter

## Edge Cases

| Edge Case                                                                   | How Handled                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tab hide/show** — SC tab hidden then reshown                              | Pierre virtualizer reattaches via scroll ref callback in `mergedScrollRef`. The `useCallback` fires on mount/unmount, recreating the virtualizer instance against the same DOM element.                                                                                                                                                                                                                                                                                                                                                                                |
| **Renamed files** — cache identity                                          | Cache key includes BOTH `path` AND `oldPath`. Rename cycles produce different keys, no collisions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Deferred untracked** — threshold classification when `diff === undefined` | Use `prefetchedCounts` from `gitFileDiffStats` (already fetched for header stats). `totalChangedLines = additions + deletions`. No full-content fetch needed for classification.                                                                                                                                                                                                                                                                                                                                                                                       |
| **Theme switch with mounted large diffs**                                   | Pierre's worker render-option changes clear cache. Mitigate by keeping theme in `PierreProvider` options (stable reference via `useMemo`). Theme switch triggers one re-render of mounted diffs — acceptable. Avoid frequent `setRenderOptions()` churn by using `themeType` prop (Pierre handles dark/light internally).                                                                                                                                                                                                                                              |
| **Diff tab stale after stage/unstage/discard**                              | `ViewedFileDiff.statusFingerprint` compared against current store fingerprint. Mismatch → show "Diff may be outdated — reload?" banner. Don't auto-reload.                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Multi-expand with wrapped lines causing metrics drift**                   | Pierre's virtualizer includes built-in resize reconciliation. Virtuoso's `customScrollParent` picks up height changes naturally. If jitter is observed, add `ResizeObserver` bridge.                                                                                                                                                                                                                                                                                                                                                                                   |
| **`EditToolWidget` / `WriteToolWidget` after provider change**              | These use `preloadFileDiff()` for small inline diffs. Worker pool provider is transparent — they get worker-backed highlighting for free. Add runtime verification in test plan.                                                                                                                                                                                                                                                                                                                                                                                       |
| **Diff tab opened for different repo/worktree**                             | `ViewedFileDiff.repoPath` compared against current `GitStore.repoPath`. If different repo, banner says "Diff from different workspace" instead of "outdated".                                                                                                                                                                                                                                                                                                                                                                                                          |
| **OperationError/DiscardConfirmation appearing while large diff open**      | Conditional banners render inside the stable content wrapper `<div>`. Pierre virtualizer's `contentContainer` is the wrapper, not the banners — measurement stays correct as children appear/disappear.                                                                                                                                                                                                                                                                                                                                                                |
| **parsedDiffCache invalidation granularity**                                | **Known limitation**: Cache key includes repo-wide `statusFingerprint`. Staging ONE file invalidates ALL cached entries — next expand of any file re-fetches even if that file didn't change. **Upgrade path**: Rust returns per-file content hash in `FileDiffStats`, cache keys use `path + scope + contentHash` instead of repo-wide fingerprint. Not in this PR — requires new Rust API surface. For now, the wider blast radius is acceptable because status changes are seconds apart and the cache's primary value is collapse/expand within a single revision. |

## File-Level Plan

### Dependency and Build

- `package.json`
  - upgrade `@pierre/diffs` to `1.1.3`
- `bun.lock`
  - dependency resolution update
- `vite.config.ts`
  - explicitly set `worker.format = 'es'`

### Shared Pierre Layer

- `apps/agent/src/lib/utils/pierre-worker-factory.ts`
  - new Vite-safe worker factory
- `apps/agent/src/lib/utils/pierre-adapter.ts`
  - shared virtualization metrics (line height, header height, hunk separator height)
  - stable cache-key helpers (`getFileDiffCacheKey`)
  - keep theme registration working with upgraded Pierre
- `apps/agent/src/lib/utils/pierre-diff-cache.ts`
  - new: parsed diff cache (LRU, keyed by repo/scope/path/oldPath/fingerprint)
  - `getCachedParsedDiff`, `setCachedParsedDiff`, `clearParsedDiffCache`
- `apps/agent/src/providers/pierre-provider.tsx`
  - replace placeholder provider with production worker-pool provider + fallback behavior
  - feature-detect worker availability, fall back to non-worker path on failure

### Source Control Inline Diffs

- `apps/agent/src/components/git/source-control/SourceControlTab.tsx`
  - add `data-testid="source-control-scroll"` to scroll container
  - add content wrapper `<div ref={contentWrapperRef}>` inside scroll container
  - create Pierre virtualizer in `useLayoutEffect` (deps: `[scrollParent]`)
  - wrap `ChangesList` in `VirtualizerContext.Provider`
- `apps/agent/src/components/git/source-control/components/DiffFileCard.tsx`
  - add large-diff thresholds (Tier A/B/C based on `prefetchedCounts`)
  - split `fetchAndPreload()` into: fetch content → build metadata → optionally SSR preload
  - large diffs: skip `preloadFileDiff()`, render via Pierre virtualizer + worker pool
  - check `parsedDiffCache` before IPC on expand
  - write to `parsedDiffCache` after successful parse
  - add `handleOpenInDiffTab(file)` for pathological cases
  - keep all current inline actions/features

### Dedicated Diff View

- `apps/agent/src/components/git/file-diff-viewer.tsx`
  - add large-diff virtualization (Pierre virtualizer as scroll container)
  - show "Diff may be outdated — reload?" banner when `statusFingerprint` changes
- `apps/agent/src/stores/file/file-viewer-store.ts`
  - extend `ViewedFileDiff` with `repoPath`, `scope`, `filePath`, `oldPath`, `statusFingerprint`
  - add `openFileWithDiff` caller from Source Control (currently no production caller)

### Supporting Wiring

- `apps/agent/src/components/git/source-control/hooks/use-source-control.ts`
  - keep current diff list behavior
  - no new polling semantics

## Implementation Order

### Phase 1: Upgrade + Shared Infra

1. Upgrade Pierre to `1.1.3`
2. Add worker factory
3. Update Vite worker output
4. Convert `PierreProvider` to the shared worker-pool owner with fallback
5. Add cache-key + metrics helpers

### Phase 2: Dedicated Diff View Hardening

1. Virtualize `file-diff-viewer.tsx`
2. Verify large diff tabs render smoothly on their own

### Phase 3: Source Control Large Diff Path

1. Add size thresholds in `DiffFileCard`
2. Apply virtualization to large inline diffs
3. Skip `preloadFileDiff()` for large virtualized diffs
4. Add “Open in diff tab” fallback for pathological inline diffs

### Phase 4: Tests + Calibration

1. Unit tests for threshold behavior
2. Unit tests for cache-key helpers
3. Integration tests for worker-pool provider mounting/fallback behavior
4. Manual performance calibration of thresholds and metrics

## Test Plan

### Type and Build

1. `bun run typecheck`
2. `bun run lint`

### Focused Frontend Tests

1. `DiffFileCard`
   - small diff (<400 lines) stays on non-virtualized path with `prerenderedHTML`
   - large diff (400-9999 lines) uses virtualized path, skips `preloadFileDiff()`
   - pathological diff (10000+ lines) shows “Open in diff tab”
   - expand-collapse-expand on same revision: second expand uses `parsedDiffCache` (no IPC)
   - expand-collapse-expand after status change: cache miss, fresh IPC
   - threshold classification uses `prefetchedCounts` (no full-content fetch)
2. `file-diff-viewer`
   - large diff virtualizes
   - shows “outdated” banner when `statusFingerprint` changes
3. `PierreProvider`
   - worker pool provider mounts
   - fallback path works when workers are unavailable
   - `EditToolWidget` and `WriteToolWidget` still render correctly with worker pool
4. `parsedDiffCache`
   - same content identity => cache hit
   - changed fingerprint => cache miss
   - LRU eviction at MAX_CACHE_ENTRIES
   - `clearParsedDiffCache()` on workspace change
5. cache-key helpers
   - includes `path` AND `oldPath` for renames
   - different rename cycles produce different keys
6. `SourceControlTab` Pierre virtualizer
   - virtualizer created on scroll ref mount
   - virtualizer cleaned up on unmount
   - `VirtualizerContext` provides instance to children

### Manual Validation

1. Expand a 1000+ changed-line diff in Source Control
   - panel remains responsive, no nested scroll bars
   - scrolling the SC list is smooth (single scroll container)
2. Collapse and reopen the same large diff
   - second open is instant (parsedDiffCache hit, no IPC)
3. Scroll away and back to a large diff
   - remount reuses cache, no flicker
4. Open pathological large diff (10k+ lines)
   - inline card shows "Open in diff tab" message
   - clicking opens dedicated diff viewer
5. Stage/unstage/discard while diff tab is open
   - diff tab shows "Diff may be outdated — reload?" banner
6. Theme switch with large diff mounted
   - one re-render, no storm, correct colors
7. Existing small diffs
   - no regression in appearance or interaction
8. `EditToolWidget` / `WriteToolWidget` in chat
   - still render correctly with worker pool provider
9. Tab hide/show cycle
   - hide SC tab, show again, large diff still scrollable

## Production Readiness Checklist

Before merge, confirm:

1. Worker failure does not break diff rendering.
2. Theme changes still produce correct highlighted output.
3. Cache keys are content-stable and do not use transient poll timestamps.
4. Large inline diffs no longer tank panel scroll performance.
5. Dedicated diff tab path preserves feature parity for the biggest diffs.
6. No global rerender storms were introduced by worker-pool option changes.

## Rollout and Rollback

### Rollout

Ship the change with:

1. conservative thresholds
2. virtualization only on large diff paths
3. shared worker pool

### Rollback

If Pierre `1.1.3` virtualization or worker-pool behavior is unstable in production:

1. keep the shared provider fallback path
2. disable the large-diff virtualization branch
3. keep the dedicated diff-tab fallback for pathological inline diffs

This provides a safe degradation path without reintroducing the original worst-case UX.

## Stress Test: 50k Files × 10k Lines

### Goal

After implementation, verify the source control panel handles extreme scale without crashing or leaking memory: 50,000 uncommitted file entries in the list, with individual diffs up to 10,000 changed lines.

### Architecture

Two-part test: **synthetic store injection** for the 50k file list (creating 50k real files × 10k lines = 500M lines is impractical on disk), plus **real Tauri IPC** for individual large-diff expansion testing.

### Part 1: Setup Script

**New file**: `scripts/create-git-stress-repo.sh`

Creates a temp git repo at `/tmp/orbit-git-stress-repo` with real files for diff expansion testing:

```bash
#!/bin/bash
# Generate a git stress repo with large files for diff expansion testing
set -e

REPO="/tmp/orbit-git-stress-repo"
rm -rf "$REPO"
mkdir -p "$REPO"
cd "$REPO"
git init

# Create 5 files with 10,000 lines each (various languages)
for lang in ts js css py rs; do
  python3 -c "
for i in range(10000):
    print(f'// Line {i}: export const value_{i} = {i} * Math.random();')
" > "large-file-${lang}.${lang}"
done

# Create 20 files with 1,000 lines each
for i in $(seq 1 20); do
  python3 -c "
for j in range(1000):
    print(f'const item_{j} = {{ id: {j}, name: \"item-{j}\" }};')
" > "medium-file-${i}.ts"
done

# Create 50 small files (100 lines)
for i in $(seq 1 50); do
  python3 -c "
for j in range(100):
    print(f'export const x_{j} = {j};')
" > "small-file-${i}.ts"
done

git add -A
git commit -m "initial"

# Now modify all files to create unstaged changes
find . -name '*.ts' -o -name '*.js' -o -name '*.css' -o -name '*.py' -o -name '*.rs' | while read f; do
  echo "// MODIFIED $(date +%s)" >> "$f"
done

echo "Stress repo created at $REPO"
echo "Files: $(find . -type f -not -path './.git/*' | wc -l)"
```

### Part 2: Stress Test Module

**New file**: `apps/agent/src/stress-tests/git-scaling-stress-test.ts`

```typescript
// Phases:
// 1. INJECT  — Push 50k synthetic StatusEntry into GitStore
// 2. SCROLL  — Open source control, rapid-scroll the list, measure heap
// 3. EXPAND  — Switch to stress repo, expand a 10k-line diff, measure DOM
// 4. CYCLE   — Expand/collapse 10 times, assert heap stabilizes (no leak)
// 5. MULTI   — Open 5 large diffs simultaneously, verify no crash
// 6. CLEANUP — Restore original repo, clear injected state
```

#### Phase 1 — Synthetic Injection (50k files)

```typescript
function generateSyntheticStatus(fileCount: number): GitStatus {
  const untracked: StatusEntry[] = [];
  for (let i = 0; i < fileCount; i++) {
    untracked.push({
      path: `node_modules/pkg-${Math.floor(i / 100)}/dist/file-${i}.js`,
      status: 'untracked',
      oldPath: null,
      similarity: null,
    });
  }
  return {
    branch: 'main',
    upstream: null,
    ahead: 0,
    behind: 0,
    staged: [],
    modified: [],
    untracked,
    conflicted: [],
  };
}
```

Inject via `useGitStore.getState().applyPolledStatus()` with a synthetic fingerprint. The source control panel renders via React Virtuoso — this validates that 50k entries don't OOM the list.

#### Phase 2 — Scroll Stress

```typescript
// Programmatically scroll the source control panel
// Requires data-testid="source-control-scroll" on SourceControlTab's scroll container
const scrollEl = document.querySelector('[data-testid="source-control-scroll"]');
if (!scrollEl)
  throw new Error(
    'Source control scroll container not found — add data-testid="source-control-scroll"'
  );

for (let i = 0; i < 100; i++) {
  scrollEl.scrollTop = Math.random() * scrollEl.scrollHeight;
  await sleep(50); // Rapid scroll
}
```

Measure: `performance.memory.usedJSHeapSize` before/after. Assert growth < 50MB.

#### Phase 3 — Large Diff Expansion

Switch workspace to `/tmp/orbit-git-stress-repo` (or inject repo path into GitStore), then:

```typescript
// Find a DiffFileCard and simulate click to expand
const cards = document.querySelectorAll('[role="button"][aria-label*="Expand"]');
cards[0]?.click(); // Expand first card (10k-line file)
await sleep(3000); // Wait for Pierre render

// Measure DOM weight
const diffBody = document.querySelector('[data-diff-type]');
const nodeCount = diffBody?.querySelectorAll('*').length ?? 0;
logger.info('DOM nodes in expanded diff', { nodeCount });
```

Assert: app remains responsive (no freeze > 1s), DOM nodes < 2000 (virtualization limits visible nodes).

#### Phase 4 — Expand/Collapse Cycle (Memory Leak Detection)

```typescript
const heapBefore = performance.memory?.usedJSHeapSize ?? 0;

for (let cycle = 0; cycle < 10; cycle++) {
  cards[0]?.click(); // Expand
  await sleep(1000);
  cards[0]?.click(); // Collapse
  await sleep(500);
}

// Force GC if available
if (typeof gc === 'function') gc();
await sleep(1000);

const heapAfter = performance.memory?.usedJSHeapSize ?? 0;
const leakMB = (heapAfter - heapBefore) / (1024 * 1024);
logger.info('Memory after 10 expand/collapse cycles', { leakMB });

assertLte(leakMB, 20, 'Memory leak under 20MB after 10 cycles');
```

#### Phase 5 — Multi-Expand Stress

```typescript
// Expand 5 large diffs simultaneously
for (let i = 0; i < 5 && i < cards.length; i++) {
  cards[i]?.click();
  await sleep(200);
}
await sleep(5000); // Let all 5 render

const heapMulti = performance.memory?.usedJSHeapSize ?? 0;
assertLte(heapMulti / (1024 * 1024), 500, 'Heap under 500MB with 5 open large diffs');

// Collapse all
for (let i = 0; i < 5 && i < cards.length; i++) {
  cards[i]?.click();
}
```

#### Phase 6 — Cleanup

```typescript
// Restore original repo path
useGitStore.getState().setRepoPath(originalRepoPath);
useGitStore.getState().setStatus(originalStatus);
```

### Part 3: Wire to `window.__orbit_debug`

**File**: `apps/agent/src/hooks/chat/use-chat-messages.ts`

Add to type declaration:

```typescript
runGitScalingStressTest?: (config?: GitScalingStressTestConfig) => Promise<unknown>;
```

Add to dynamic imports:

```typescript
runGitScalingStressTest: async (config?) => {
  const { runGitScalingStressTest } = await import(
    '@/stress-tests/git-scaling-stress-test'
  );
  return runGitScalingStressTest(config);
},
```

### Config Options

```typescript
export interface GitScalingStressTestConfig {
  /** Number of synthetic file entries. Default: 50_000 */
  fileCount?: number;
  /** Path to stress repo for real diff expansion. Default: '/tmp/orbit-git-stress-repo' */
  stressRepoPath?: string;
  /** Number of expand/collapse cycles for leak detection. Default: 10 */
  leakCycles?: number;
  /** Number of simultaneous large diffs to open. Default: 5 */
  multiExpandCount?: number;
  /** Skip synthetic injection (only test real repo). Default: false */
  skipSynthetic?: boolean;
}
```

### Running the Stress Test

```bash
# 1. Generate the stress repo
./scripts/create-git-stress-repo.sh

# 2. Start the app
bunx tauri dev

# 3. Open DevTools console and run:
window.__orbit_debug.runGitScalingStressTest()

# With custom config:
window.__orbit_debug.runGitScalingStressTest({
  fileCount: 50000,
  leakCycles: 20,
  multiExpandCount: 10,
})
```

### Pass Criteria

| Metric                     | Threshold                        | What it validates                                          |
| -------------------------- | -------------------------------- | ---------------------------------------------------------- |
| 50k file list render       | No OOM, heap < 200MB             | GitStore + React Virtuoso handle 50k entries               |
| Rapid scroll (100 jumps)   | Heap growth < 50MB               | Scheduler/fallback don't leak on scroll                    |
| 10k-line diff expand       | No freeze > 1s, DOM < 2000 nodes | Pierre Virtualizer renders only visible lines              |
| 10 expand/collapse cycles  | Heap leak < 20MB                 | Pierre cleanup + GC works correctly                        |
| 5 simultaneous large diffs | Heap < 500MB, no crash           | Worker pool + virtualization handle concurrent large diffs |

### Files Added

| File                                                     | Purpose                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `scripts/create-git-stress-repo.sh`                      | Generate temp repo with large files for real diff testing                      |
| `apps/agent/src/stress-tests/git-scaling-stress-test.ts` | 6-phase stress test: inject, scroll, expand, leak-check, multi-expand, cleanup |
| `apps/agent/src/hooks/chat/use-chat-messages.ts`         | Wire to `window.__orbit_debug.runGitScalingStressTest()`                       |

---

## Final Recommendation

Do not treat this as “just wrap the current `FileDiff` in a `Virtualizer`.”

The production-ready solution is:

1. upgrade Pierre
2. centralize worker-pool ownership in `PierreProvider`
3. add content-stable cache keys
4. virtualize only large diff surfaces
5. move pathological diffs into the dedicated diff viewer rather than plain file mode
6. use SSR/pre-render only where it helps, not everywhere

That is the least risky way to keep Pierre, keep current features, and reach IDE-grade large-diff behavior.
