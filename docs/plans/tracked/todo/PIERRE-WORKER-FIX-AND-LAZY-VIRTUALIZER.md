# Fix Pierre Worker Pool + Lazy Virtualizer

## Context

Pierre's Web Worker pool is disabled in Tauri's WKWebView because `new Worker()` rejects `tauri://localhost` URLs. All Shiki syntax highlighting falls back to the main thread, causing a 4-5 second plain-text flash when expanding diffs. Separately, the Pierre Virtualizer in SourceControlTab is created eagerly on mount, installing IntersectionObserver + ResizeObserver on all 75+ collapsed cards, dropping scroll FPS to ~21 even with no diffs expanded.

These are two independent fixes — the worker fix enables off-thread highlighting, the virtualizer fix restores smooth scrolling.

---

## Fix 1: Pierre Workers via Blob URL (WKWebView)

### Root Cause

`pierre-worker-factory.ts:19` creates workers with:

```
new Worker(new URL('@pierre/diffs/worker/worker.js', import.meta.url), { type: 'module' })
```

Vite resolves this to `tauri://localhost/assets/worker-XXXX.js`. WKWebView blocks `new Worker()` from custom `tauri://` protocol URLs. `supportsPierreWorkerPool()` catches the error, returns `false`, and `PierreProvider` renders without the `WorkerPoolContextProvider`.

### Why Blob URL Works

- CSP already permits it: `worker-src: 'self' blob:` (`tauri.conf.json:43`)
- macOS 15+ (Tauri's minimum) ships Safari 18+ which supports module workers from Blob URLs
- `WorkerPoolManager` calls `workerFactory()` synchronously in a loop — Blob URL creation must be sync

**Important:** Both `worker.js` and `worker-portable.js` contain a dynamic `import("./wasm-*.js")` guarded by `preferredHighlighter === "shiki-wasm"` (`worker-portable.js:15882-15886`). Dynamic `import()` inside a Blob URL worker cannot resolve relative to the app origin — it crashes if the WASM path triggers. The JS regex engine IS the current default, but this is an implicit upstream dependency. **Mitigations:**

1. Use `worker-portable.js` (lower risk — fewer external imports than `worker.js`)
2. Pin `preferredHighlighter: 'shiki-js'` explicitly in `pierre-provider.tsx` highlighter options
3. Treat the WASM path as a latent crash — if Pierre ever changes the default, our worker breaks

### Approach: Vite `?worker&inline`

Use Vite's `?worker&inline` import suffix. Vite bundles the worker with all dependencies, base64-encodes it into the main bundle, and returns a constructor that creates Workers from a Blob URL internally. This is the cleanest approach — no sync XHR, no manual Blob creation.

**Fallback if `?worker&inline` fails:** Manual Blob URL via cached sync XHR fetch (documented below).

### Changes

**File: `apps/agent/src/lib/utils/pierre-worker-factory.ts`**

Replace the current `workerFactory`:

```typescript
// Before:
workerFactory: () =>
  new Worker(new URL('@pierre/diffs/worker/worker.js', import.meta.url), {
    type: 'module',
  }),

// After — use worker-portable.js (lower import risk, pin shiki-js to avoid wasm path):
import PierreInlineWorker from '@pierre/diffs/worker/worker-portable.js?worker&inline';

workerFactory: () => new PierreInlineWorker(),
```

TypeScript types: `vite-env.d.ts` already has `/// <reference types="vite/client" />` which includes `*?worker&inline` module declarations.

`supportsPierreWorkerPool()` stays unchanged — it creates a test worker from the factory and terminates it. If the inline worker works, it returns `true`.

**File: `apps/agent/src/providers/pierre-provider.tsx`**

1. Pin `preferredHighlighter: 'shiki-js'` explicitly in highlighter options (removes implicit upstream dependency):

```typescript
const highlighterOptions = useMemo(
  () => ({
    theme: PIERRE_THEME,
    langs: PRELOAD_LANGUAGES,
    lineDiffType: 'word' as const,
    tokenizeMaxLineLength: 1000,
    preferredHighlighter: 'shiki-js' as const, // Pin JS engine — WASM path crashes in Blob URL workers
  }),
  []
);
```

2. Update logging:

```typescript
if (!enabled) {
  logger.warn('Pierre worker pool unavailable in this WebView; main-thread highlighting active');
}
if (enabled) {
  logger.info('Pierre worker pool active', { poolSize: PIERRE_WORKER_POOL_OPTIONS.poolSize });
}
```

### Fallback: Manual Blob URL (if `?worker&inline` fails)

If Vite can't inline Pierre's worker (complex dependency tree), fall back to:

```typescript
let cachedBlobUrl: string | null = null;

function getOrCreateWorkerBlobUrl(): string {
  if (cachedBlobUrl !== null) return cachedBlobUrl;
  const workerUrl = new URL('@pierre/diffs/worker/worker-portable.js', import.meta.url);
  const xhr = new XMLHttpRequest();
  xhr.open('GET', workerUrl.href, false); // sync — runs once at pool init
  xhr.send();
  const blob = new Blob([xhr.responseText], { type: 'application/javascript' });
  cachedBlobUrl = URL.createObjectURL(blob);
  return cachedBlobUrl;
}

workerFactory: () => new Worker(getOrCreateWorkerBlobUrl(), { type: 'module' }),
```

Only use this if `?worker&inline` produces build errors or runtime failures. **Caveat:** The cached object URL is never revoked (intentional — the worker pool is app-lifetime). In HMR/dev, Vite's full-reload on worker changes handles cleanup. In production, the single Blob URL persists until app close. Verify in a packaged Tauri build, not just `bunx tauri dev`.

---

## Fix 2: Lazy-Init Virtualizer via Demand Ref-Counting

### Root Cause

`SourceControlTab.tsx:113-139` creates `PierreVirtualizerCore` in `useLayoutEffect` as soon as the scroll container mounts. This calls `instance.setup(scrollNode, contentNode)` which installs IntersectionObserver + ResizeObserver on ALL children of the content wrapper — including 75 collapsed DiffFileCards. Observers fire every scroll frame causing layout thrash.

Only "large" tier diffs (400+ changed lines) consume the virtualizer. Small diffs explicitly disable it via `VirtualizerContext.Provider value={undefined}`.

### Approach: Demand Callbacks from DiffFileCard to SourceControlTab

DiffFileCard signals when it needs the virtualizer. SourceControlTab tracks a ref count and creates/destroys the virtualizer based on demand.

### Changes

**File: `apps/agent/src/components/git/source-control/types.ts`**

Add callback type:

```typescript
/** Callbacks for DiffFileCard to signal virtualizer demand */
export interface VirtualizerDemandCallbacks {
  readonly onVirtualizerNeeded: () => void;
  readonly onVirtualizerReleased: () => void;
}
```

**File: `apps/agent/src/components/git/source-control/SourceControlTab.tsx`**

1. **Remove** the eager `useLayoutEffect` (lines 113-139) that creates `PierreVirtualizerCore`
2. **Add** a `demandCountRef = useRef(0)` for ref counting
3. **Add** `handleVirtualizerNeeded` callback — increments count, creates virtualizer when 0→1
4. **Add** `handleVirtualizerReleased` callback — decrements count, destroys when 1→0
5. **Add** a `useEffect` on `[scrollParent]` that recreates virtualizer if demand > 0 and scroll container changes
6. **Add** cleanup on unmount: destroy virtualizer if demand > 0
7. **Pass** both callbacks AND a `virtualizerReady` boolean through to `<ChangesList>`

The `virtualizerReady` boolean is derived from whether `pierreVirtualizer` is defined. This is passed down so DiffFileCard can gate large-diff mounts on virtualizer availability.

Key implementation detail for both callbacks:

```typescript
const handleVirtualizerNeeded = useCallback((): void => {
  demandCountRef.current += 1;
  if (demandCountRef.current === 1) {
    const scrollNode = scrollNodeRef.current;
    const contentNode = contentWrapperRef.current;
    if (!scrollNode || !contentNode) return;
    if (pierreVirtualizerRef.current) {
      pierreVirtualizerRef.current.cleanUp();
    }
    const instance = new PierreVirtualizerCore({
      overscrollSize: PIERRE_VIRTUALIZER_OVERSCROLL_SIZE,
    });
    instance.setup(scrollNode, contentNode);
    pierreVirtualizerRef.current = instance;
    setPierreVirtualizer(instance);
  }
}, []);

const handleVirtualizerReleased = useCallback((): void => {
  demandCountRef.current = Math.max(0, demandCountRef.current - 1);
  if (demandCountRef.current === 0 && pierreVirtualizerRef.current) {
    pierreVirtualizerRef.current.cleanUp();
    pierreVirtualizerRef.current = null;
    setPierreVirtualizer(undefined);
  }
}, []);
```

**File: `apps/agent/src/components/git/source-control/components/ChangesList.tsx`**

1. **Add** `onVirtualizerNeeded`, `onVirtualizerReleased`, and `virtualizerReady` to `ChangesListProps`
2. **Pass** all three through to `<DiffFileCard>` in the Virtuoso `itemContent` callback (line 221-230)

**File: `apps/agent/src/components/git/source-control/components/DiffFileCard.tsx`**

1. **Add** `onVirtualizerNeeded`, `onVirtualizerReleased`, and `virtualizerReady` to `DiffFileCardProps`
2. **Add** a `isDemanderRef = useRef(false)` to track whether THIS card is currently requesting the virtualizer
3. **Add** a `useEffect` that watches `[isExpanded, preparedDiffTier]` for demand signaling
4. **Gate large-diff mount on virtualizer readiness** — Pierre chooses `VirtualizedFileDiff` vs `FileDiff` at mount time (`useFileDiffInstance.js:13-20`). If a large diff mounts before the virtualizer is in context, it stays on the plain path forever.

Demand signaling effect:

```typescript
const isDemanderRef = useRef(false);

useEffect(() => {
  const shouldDemand = isExpanded && preparedDiffTier === 'large';
  if (shouldDemand && !isDemanderRef.current) {
    isDemanderRef.current = true;
    onVirtualizerNeeded();
  } else if (!shouldDemand && isDemanderRef.current) {
    isDemanderRef.current = false;
    onVirtualizerReleased();
  }
  return (): void => {
    if (isDemanderRef.current) {
      isDemanderRef.current = false;
      onVirtualizerReleased();
    }
  };
}, [isExpanded, preparedDiffTier, onVirtualizerNeeded, onVirtualizerReleased]);
```

Large-diff mount gate (in the render path, replaces the existing conditional at lines 696-718):

```typescript
// Gate: don't mount PierreFileDiff on the large path until virtualizer is ready.
// Pierre picks VirtualizedFileDiff vs FileDiff at mount — the choice is permanent.
const shouldDelayLargeMount = isLargeInlineDiff && !virtualizerReady;

{shouldDelayLargeMount ? (
  <div className="px-3 py-2 text-xs text-muted-foreground/60">Preparing diff…</div>
) : isLargeInlineDiff ? (
  <PierreFileDiff
    key={`virtualized-${String(virtualizerReady)}`}
    fileDiff={preparedDiff.fileDiff}
    metrics={PIERRE_VIRTUAL_FILE_METRICS}
    style={PIERRE_DIFF_STYLE as CSSProperties}
    options={pierreOptions}
    {...(preparedDiff.prerenderedHTML ? { prerenderedHTML: preparedDiff.prerenderedHTML } : {})}
  />
) : (
  <VirtualizerContext.Provider value={undefined}>
    <PierreFileDiff ... />
  </VirtualizerContext.Provider>
)}
```

The `key` prop forces a remount if `virtualizerReady` changes — safety net in case a large diff somehow mounted before the virtualizer was ready.

**File: `apps/agent/src/__tests__/unit/components/git/source-control/SourceControlTab.test.tsx`**

The existing test at line 125-135 asserts `context-ready` on mount — it expects the virtualizer to exist immediately. With lazy init, the context is `undefined` on mount (no large diffs expanded). Update the test:

```typescript
// Before (line 129):
expect(screen.getByTestId('changes-list')).toHaveTextContent('context-ready');

// After — virtualizer is NOT created on mount (lazy init):
expect(screen.getByTestId('changes-list')).toHaveTextContent('context-missing');
```

Also update the `setupMock` assertion: `setup()` should NOT be called on mount.

**Note on test seams:** `SourceControlTab.test.tsx` fully mocks `ChangesList` to a context sentinel — it CANNOT exercise real diff expansion, hover-prefetch, tab switching, or placeholder gating. Keep only the mount-level assertion here. Move interactive scenarios to the correct test files.

**File: `apps/agent/src/__tests__/unit/components/git/source-control/components/DiffFileCard.test.tsx`**

These tests need real DiffFileCard rendering with mocked git API and Pierre renderer:

```typescript
it('gates large diff render on virtualizerReady', async () => {
  // 1. Render DiffFileCard with virtualizerReady=false, expand it
  // 2. Assert "Preparing diff…" placeholder shown (not PierreFileDiff)
  // 3. Re-render with virtualizerReady=true
  // 4. Assert PierreFileDiff mounts with metrics (virtualized path)
});

it('signals demand on expand and release on collapse', async () => {
  // 1. Render with onVirtualizerNeeded/Released mocks
  // 2. Expand card with large diff — assert onVirtualizerNeeded called once
  // 3. Collapse card — assert onVirtualizerReleased called once
});

it('releases demand on unmount (Virtuoso recycling)', async () => {
  // 1. Expand a large diff (onVirtualizerNeeded called)
  // 2. Unmount the component (simulates Virtuoso recycling)
  // 3. Assert onVirtualizerReleased called in cleanup
});

it('mounts prefetched large diff on virtualized path when ready', async () => {
  // 1. Trigger hover prefetch for a large diff
  // 2. Expand the card with virtualizerReady=true
  // 3. Assert PierreFileDiff mounts WITH metrics, not on the plain path
});
```

**File: `apps/agent/src/__tests__/unit/components/git/source-control/ChangesList.test.tsx`**

```typescript
it('threads virtualizer callbacks and readiness to DiffFileCard', () => {
  // Assert onVirtualizerNeeded, onVirtualizerReleased, and virtualizerReady
  // are passed through to each DiffFileCard in the Virtuoso itemContent
});
```

**File: `apps/agent/src/__tests__/unit/providers/pierre-provider.test.tsx`**

The worker-init failure path is handled by Pierre's own `WorkerPoolManager.isWorkingPool()` check in the renderers — NOT by PierreProvider unmounting the context. Test the actual degradation seam:

```typescript
it('degrades to main-thread highlighting when worker pool reports failure', async () => {
  // Pierre's renderers check isWorkingPool() and fall back internally.
  // This test verifies that PierreProvider's supportsPierreWorkerPool() probe
  // catches constructor failures (the current behavior) — NOT async init failures.
  // Async init failures are Pierre's internal concern, not ours.
  // 1. Mock workerFactory to throw
  // 2. Assert PierreProvider renders children WITHOUT WorkerPoolContextProvider
  // 3. Assert logger.warn called with fallback message
});
```

### Edge Cases

| Edge Case                                                                   | Handling                                                                                                                                                            |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Virtuoso recycles DiffFileCard during scroll                                | `useEffect` cleanup calls `onVirtualizerReleased()` if card was a demander                                                                                          |
| `preparedDiffTier` unknown until async fetch completes                      | Effect re-runs when `preparedDiffTier` updates — demand starts late, which is correct                                                                               |
| `scrollParent` changes while virtualizer active                             | Separate `useEffect` on `[scrollParent]` recreates virtualizer if `demandCountRef.current > 0`                                                                      |
| Negative ref count                                                          | `Math.max(0, demandCountRef.current - 1)` prevents underflow                                                                                                        |
| Tab switch (Staged ↔ Changes)                                               | Virtuoso unmounts cards → cleanup fires release → count drops to 0 → virtualizer destroyed                                                                          |
| `preparedDiffTier` oscillation (hunk-based "small" → content-aware "large") | Demand effect re-fires when tier updates. `virtualizerReady` gate prevents premature mount on large path. Brief "Preparing diff…" shown while virtualizer spins up. |
| `handleVirtualizerNeeded` called while `scrollParent` is null               | Demand count increments to 1 but no virtualizer created (early return). The `[scrollParent]` useEffect fills this gap when the scroll ref attaches.                 |
| Hover-prefetched large diff expands before virtualizer                      | `virtualizerReady` gate shows placeholder. Demand callback fires → virtualizer created → `virtualizerReady` flips → large diff mounts on virtualized path.          |
| Future Pierre default changes to `shiki-wasm`                               | `preferredHighlighter: 'shiki-js'` pin protects us. Dynamic WASM import in Blob URL worker would crash silently otherwise.                                          |

---

## Verification

### 1. Worker Pool Active

```bash
bunx tauri dev
```

1. Open Source Control with a repo that has changes
2. Open DevTools console
3. Verify `[PierreProvider] Pierre worker pool active` appears (NOT "unavailable")
4. Expand a diff card — highlighting should appear immediately (no plain-text flash)

### 2. Scroll FPS Restored

1. Open the stress repo: `/tmp/orbit-git-stress-repo` (75 files)
2. Scroll through collapsed cards — should be smooth (no virtualizer overhead)
3. Expand a large diff (400+ lines) — virtualizer activates, rendering stays smooth
4. Collapse it — virtualizer cleans up

### 3. Stress Test

```javascript
window.__orbit_debug.runGitScalingStressTest();
```

All assertions should pass, especially heap growth during scroll.

### 4. Quality Checks

```bash
bun run typecheck    # No errors
bun run lint         # Zero warnings
bun run test         # All tests pass (including pierre-provider.test.tsx, SourceControlTab.test.tsx, DiffFileCard.test.tsx)
```

---

## Risks and Mitigations

| Risk                                                                                    | Likelihood | Mitigation                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?worker&inline` fails for `worker-portable.js` (bundling issue)                        | Low        | `worker-portable.js` is pre-bundled — simplest possible inline target. Fall back to manual Blob URL if needed.                                                                                                 |
| Worker Blob URL blocked by CSP in production build                                      | Low        | CSP already has `blob:` in `worker-src` — verified at `tauri.conf.json:43`.                                                                                                                                    |
| Inline worker increases startup bundle (~484KB raw, ~180KB gzipped)                     | Medium     | `PierreProvider` wraps the full app — consider async-loading the worker constructor during `supportsPierreWorkerPool()` and caching it, so `workerFactory` stays sync but startup code-splitting is preserved. |
| Dynamic `import("./wasm-*.js")` in `worker-portable.js` crashes from Blob URL           | Low        | Mitigated by pinning `preferredHighlighter: 'shiki-js'`. Latent risk if Pierre changes upstream default.                                                                                                       |
| `supportsPierreWorkerPool()` passes but pool init fails                                 | Low        | Support probe only tests constructor+terminate, not the `initialize` message path. Add a manual Tauri smoke test.                                                                                              |
| Large diff mounts before virtualizer is ready (Pierre's mount-time choice is permanent) | N/A        | Eliminated by gating large-diff render on `virtualizerReady` prop + `key` remount safety net.                                                                                                                  |
| Virtualizer demand ref count drifts (leak)                                              | Low        | `useEffect` cleanup in DiffFileCard releases on unmount. `Math.max(0, ...)` prevents negative. Tab switch unmounts all cards → count resets to 0.                                                              |
| React Virtuoso recycles DiffFileCard during scroll                                      | Low        | Cleanup function fires `onVirtualizerReleased()` only if `isDemanderRef.current` is true. Recycled cards that weren't demanding don't fire.                                                                    |
| `scrollParent` changes while large diffs expanded                                       | Low        | Dedicated `useEffect` on `[scrollParent]` recreates virtualizer if `demandCountRef.current > 0`.                                                                                                               |

## Files Modified

| File                                                                                           | Change                                                                                                  |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/lib/utils/pierre-worker-factory.ts`                                            | Replace URL-based worker with `worker-portable.js?worker&inline` import                                 |
| `apps/agent/src/providers/pierre-provider.tsx`                                                 | Improve diagnostic logging                                                                              |
| `apps/agent/src/components/git/source-control/types.ts`                                        | Add `VirtualizerDemandCallbacks` type                                                                   |
| `apps/agent/src/components/git/source-control/SourceControlTab.tsx`                            | Lazy virtualizer with demand ref-counting                                                               |
| `apps/agent/src/components/git/source-control/components/ChangesList.tsx`                      | Thread virtualizer callbacks to DiffFileCard                                                            |
| `apps/agent/src/components/git/source-control/components/DiffFileCard.tsx`                     | Signal virtualizer demand on expand/collapse                                                            |
| `apps/agent/src/__tests__/unit/components/git/source-control/SourceControlTab.test.tsx`        | Update mount assertion only (context-ready → context-missing, no setup() on mount)                      |
| `apps/agent/src/__tests__/unit/components/git/source-control/components/DiffFileCard.test.tsx` | Add: mount gate on virtualizerReady, demand signal/release, unmount cleanup, prefetched large-diff path |
| `apps/agent/src/__tests__/unit/components/git/source-control/components/ChangesList.test.tsx`  | Add: virtualizer callback + readiness prop threading to DiffFileCard                                    |
| `apps/agent/src/__tests__/unit/providers/pierre-provider.test.tsx`                             | Add: constructor-failure fallback (existing behavior, not async init failure)                           |
