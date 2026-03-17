# Fix: Diff Card Performance & Pierre Rendering

## Context

When many files have changes, hovering over diff cards causes significant UI lag. The root causes are:

1. **All diff cards rendered to DOM at once** — no virtualization in `ChangesList.tsx`
2. **Eager structured diff fetching** — `fetchDiffs()` calls `gitStagedDiff` + `gitDiffStructured` on every 5s git status poll, fetching ALL file diffs even when the source control tab isn't visible
3. **Hover triggers expensive preload per card** — `handleMouseEnter` → `fetchAndPreload()` → `parseDiffFromFile()` + `preloadFileDiff()` (Shiki highlighting) all on the main thread, and rapid hovering triggers many concurrent preloads
4. **Edit tool widgets lack Shiki preloading** — unlike `DiffFileCard` which pre-renders HTML via `preloadFileDiff`, the `EditToolWidget` passes no `prerenderedHTML` to Pierre, so Shiki runs synchronously during React render
5. **Git commands are sync `fn`** — 19 of 27 git commands are synchronous and block Tokio worker threads via libgit2, starving concurrent operations (8 are already `async fn`: `git_push`, `git_pull`, `git_fetch`, `git_clone`, `git_worktree_list`, `git_worktree_add`, `git_worktree_remove`, `git_worktree_prune`)

## Plan

### Fix 1: Git commands → `async fn` + `spawn_blocking`

**Why first:** Unblocks Tokio workers so multiple concurrent git operations (diff fetch, status poll, file-at-ref) don't starve each other. Highest backend impact.

**Files:**

- `src-tauri/src/commands/common/git.rs` — the 19 synchronous commands

**Skip these 8 commands** (already `async fn` calling async orbit_git functions):
`git_push`, `git_pull`, `git_fetch`, `git_clone`, `git_worktree_list`, `git_worktree_add`, `git_worktree_remove`, `git_worktree_prune`

**Shared helper** to reduce boilerplate:

```rust
/// Run a blocking git closure on a dedicated thread.
async fn spawn_git<F, T>(f: F) -> Result<T>
where
    F: FnOnce() -> Result<T> + Send + 'static,
    T: Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| orbit_core::Error::Other(format!("git task panicked: {e}")))?
}
```

**Pattern for each sync command:**

```rust
// BEFORE:
#[tauri::command]
fn git_status(repo_path: String) -> Result<GitStatus> {
    let manager = GitManager::new();
    manager.status(&repo_path).capture("git_status")
}

// AFTER:
#[tauri::command]
async fn git_status(repo_path: String) -> Result<GitStatus> {
    spawn_git(move || {
        let manager = GitManager::new();
        manager.status(&repo_path).capture("git_status")
    })
    .await
}
```

Each command creates a fresh `GitManager::new()` — no shared state (unit struct), so `spawn_blocking` is safe with no lock concerns.

> **Note:** `orbit_core::Error` has no `Internal` variant. Use `Error::Other` for the JoinError mapping.

**Verify:** `cargo check` after conversion.

---

### Fix 2: Debounce & gate diff fetching + immediate fetch on visibility

**Why:** `fetchDiffs` runs on every `lastUpdated` change (~5s poll). With many files, this creates constant backend load even when the user isn't looking at the source control tab.

> **Audit note:** `SourceControlTab` currently renders via a ternary in `activity-panel.tsx` — it unmounts when not visible, so the `isVisible` gate is redundant today. However, the 300ms debounce alone is valuable (prevents redundant `fetchDiffs` when `lastUpdated` ticks with no status change). Keep `isVisible` as a forward-compatible guard in case the component switches to keep-alive rendering later.

**File:** `apps/agent/src/components/git/source-control/hooks/use-source-control.ts`

**Changes:**

1. Accept an `isVisible` parameter (whether source control tab is active)
2. Skip `fetchDiffs` when source control tab is not visible
3. Add 300ms debounce to `fetchDiffs` to coalesce rapid status updates
4. **Immediate fetch on `isVisible` false→true transition** — so user doesn't see stale data when switching back
5. **Single-flight + generation guard** — prevent overlapping `fetchDiffs` calls from racing and producing stale→correct flashes

**First, harden `fetchDiffs` with inflight dedup + generation counter:**

The current `fetchDiffs` can be called concurrently from the debounced effect, the visibility-transition effect, and `refreshStatus`. Without ordering controls, an older response can overwrite a newer one. Add an inflight guard (skip if a fetch is already running) and a generation counter (discard out-of-order responses):

```typescript
const inflightRef = useRef<Promise<void> | null>(null);
const needsRefetchRef = useRef(false);

const fetchDiffs = useCallback(async (): Promise<void> => {
  const repo = useGitStore.getState().repoPath;
  if (!repo) return;

  if (inflightRef.current) {
    // A fetch is already running — mark that we need a trailing refresh
    needsRefetchRef.current = true;
    return;
  }

  const run = Promise.all([gitStagedDiff(repo), gitDiffStructured(repo)])
    .then(([staged, unstaged]) => {
      setStagedDiffs(staged);
      setUnstagedDiffs(unstaged);
    })
    .catch((error: unknown) => {
      logger.debug('Failed to fetch diffs', { error });
    })
    .finally(() => {
      inflightRef.current = null;
      // Drain trailing request — status may have changed while we were fetching
      if (needsRefetchRef.current) {
        needsRefetchRef.current = false;
        void fetchDiffs();
      }
    });

  inflightRef.current = run;
  return run;
}, []);
```

This pattern ensures at most one trailing refresh: rapid status changes during a fetch are coalesced into a single follow-up call, preventing stale windows while avoiding unbounded recursion.

**Then gate on visibility with debounce:**

```typescript
// Add to useSourceControl parameters:
export function useSourceControl(isVisible: boolean): UseSourceControlReturn {

// Gate diff fetching on visibility:
useEffect(() => {
  if (!repoPath || !status || !isVisible) return;
  const timer = setTimeout(() => void fetchDiffs(), 300);
  return () => clearTimeout(timer);
}, [lastUpdated, repoPath, status, fetchDiffs, isVisible]);

// Immediate fetch on tab switch (false→true transition).
// Use null initial to skip the FIRST mount — the debounced effect handles it.
// Without this guard, both effects fire on mount → double fetchDiffs().
const prevVisible = useRef<boolean | null>(null);
useEffect(() => {
  if (prevVisible.current === null) {
    prevVisible.current = isVisible;
    return; // debounced lastUpdated effect handles first mount
  }
  if (isVisible && !prevVisible.current && repoPath && status) {
    void fetchDiffs(); // no debounce — user just opened the tab
  }
  prevVisible.current = isVisible;
}, [isVisible, repoPath, status, fetchDiffs]);
```

**Caller:** `SourceControlTab` is rendered inside `activity-panel.tsx` when `activityTab` is neither `'file'` nor `'browser'` (i.e., `activityTab === 'source'`). The type is `ActivityTab = 'file' | 'source' | 'browser'` from `ui-store.ts:77`. Pass `isVisible={activityTab === 'source'}` as a prop. `SourceControlTab.tsx` passes it through to `useSourceControl`.

**Verify:** `bun run typecheck`

---

### Fix 3: Throttle hover preloads + cancel across cards

**Why:** Rapidly moving the mouse over 20+ diff cards fires 20+ concurrent `fetchAndPreload()` calls, each doing 2 Tauri invokes + Pierre parse + Shiki preload.

**Files:**

- `apps/agent/src/components/git/source-control/components/DiffFileCard.tsx`
- `apps/agent/src/components/git/source-control/components/ChangesList.tsx`

**Changes:**

1. **150ms hover delay** — if mouse leaves before 150ms, cancel the timer
2. **Shared latest-wins scheduler** — lift a centralized prefetch scheduler to `ChangesList` and pass it down. Only the most recently hovered card's preload actually executes, with max concurrency 1. This prevents stacking 10+ concurrent heavy preloads when scrolling across cards.

> **Codex audit note:** The original plan used a per-card `cancelled` flag pattern, but that only guards `setState` — it does NOT cancel the expensive `parseDiffFromFile` + `preloadFileDiff` work. With 20+ cards at >150ms dwell each, heavy preloads still stack on the main thread. The shared scheduler below ensures only ONE preload runs at a time, and only for the latest hovered card.

`ChangesList` creates a centralized scheduler with **trailing pending slot** — if a hover arrives while a preload is running, it's stored and executes immediately after the current task completes (true latest-wins):

```typescript
// In ChangesList.tsx:
const latestHoverIdRef = useRef(0);
const activeTaskRef = useRef<Promise<void> | null>(null);
const pendingStartRef = useRef<(() => Promise<void>) | null>(null);

/** Run a prefetch, draining the pending slot on completion */
const runPrefetch = useCallback((start: () => Promise<void>): void => {
  if (activeTaskRef.current) {
    // Another preload is running — store as pending (latest-wins: overwrite previous pending)
    pendingStartRef.current = start;
    return;
  }
  const task = start().finally(() => {
    if (activeTaskRef.current === task) activeTaskRef.current = null;
    // Drain pending slot — the most recent hover gets to run
    const pending = pendingStartRef.current;
    pendingStartRef.current = null;
    if (pending) runPrefetch(pending);
  });
  activeTaskRef.current = task;
}, []);

/** Schedule a prefetch with 150ms delay — latest-wins with max concurrency 1 + trailing */
const schedulePrefetch = useCallback((start: () => Promise<void>): (() => void) => {
  const hoverId = ++latestHoverIdRef.current;
  const timer = window.setTimeout(() => {
    // Stale hover — a newer card was hovered during the delay
    if (hoverId !== latestHoverIdRef.current) return;
    runPrefetch(start);
  }, 150);
  return () => window.clearTimeout(timer);
}, [runPrefetch]);

// Pass to each DiffFileCard:
<DiffFileCard schedulePrefetch={schedulePrefetch} ... />
```

`DiffFileCard` uses the scheduler:

```typescript
const cancelScheduledRef = useRef<(() => void) | null>(null);

const handleMouseEnter = (): void => {
  if (!canExpand || isExpanded) return;
  cancelScheduledRef.current?.();
  cancelScheduledRef.current = schedulePrefetch(async () => {
    await fetchAndPreload();
  });
};

const handleMouseLeave = (): void => {
  cancelScheduledRef.current?.();
  cancelScheduledRef.current = null;
};
```

Add `onMouseLeave={handleMouseLeave}` to the header div. Clean up on unmount.

**Important:** Also clear the scheduled prefetch in `handleToggle` — if the user clicks to expand while the 150ms timer is pending, both the timer callback and the expand `useEffect` would fire:

```typescript
const handleToggle = (): void => {
  if (!canExpand) return;
  // Clear pending hover prefetch — the expand useEffect handles the fetch
  cancelScheduledRef.current?.();
  cancelScheduledRef.current = null;
  setIsExpanded((prev) => {
    // ... existing mount/unmount logic
    return !prev;
  });
};
```

**Note:** `fetchAndPreload` caches via `prefetchRef` keyed by file path — so results from completed preloads are still cached for when the user actually expands. The scheduler only prevents _starting_ new heavy work while another is running.

**Verify:** `bun run typecheck`

---

### Fix 4: Add `prerenderedHTML` to EditToolWidget

**Why:** `EditToolWidget` renders `<FileDiff>` without `prerenderedHTML`, forcing Pierre to run Shiki highlighting synchronously during React render. With many Edit tool results in a conversation, this blocks the main thread.

**File:** `apps/agent/src/components/chat/tools/edit-tool-widget.tsx`

**Changes:**

1. After `editToolToPierreDiff` produces the `fileDiff`, call `preloadFileDiff` asynchronously
2. Show "Loading diff..." until preload completes, then render with `prerenderedHTML`
3. This matches the pattern already used in `DiffFileCard`

**First, memoize `pierreOptions`** — the current inline object creates a new reference every render, which would cause the effect to re-fire continuously. Match the pattern from `DiffFileCard` (lines 128-139):

```typescript
const themeType: 'dark' | 'light' = isDarkMode ? 'dark' : 'light';
const pierreOptions = useMemo(
  () => ({
    theme: PIERRE_THEME,
    themeType,
    diffStyle: 'unified' as const,
    diffIndicators: 'bars' as const,
    lineDiffType: 'word' as const,
    overflow: 'wrap' as const,
    disableFileHeader: true,
    unsafeCSS: PIERRE_DIFF_UNSAFE_CSS,
  }),
  [themeType]
);
```

Then add the preload effect:

```typescript
const [preloaded, setPreloaded] = useState<{
  fileDiff: FileDiffMetadata;
  prerenderedHTML: string;
} | null>(null);

useEffect(() => {
  if (!isExpanded) {
    setPreloaded(null);
    return;
  }
  let cancelled = false;
  const diff = editToolToPierreDiff(filePath, oldString, newString);
  if (!diff) return;

  void preloadFileDiff({ fileDiff: diff, options: pierreOptions }).then((result) => {
    if (!cancelled) {
      setPreloaded({ fileDiff: result.fileDiff, prerenderedHTML: result.prerenderedHTML });
    }
  });

  return () => {
    cancelled = true;
  };
}, [isExpanded, filePath, oldString, newString, pierreOptions]);
```

Then render with error/retry states (matching `DiffFileCard`'s pattern at lines 355-366):

```typescript
// Render the diff body:
{preloaded ? (
  <PierreFileDiff
    fileDiff={preloaded.fileDiff}
    prerenderedHTML={preloaded.prerenderedHTML}
    style={PIERRE_DIFF_STYLE as React.CSSProperties}
    options={pierreOptions}
  />
) : preloadError ? (
  <div className="px-3 py-2 text-xs text-destructive/90 flex items-center gap-2">
    <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    <span className="flex-1">{preloadError}</span>
    <button type="button" onClick={handleRetry} className="text-xs underline-offset-2 hover:underline">
      Retry
    </button>
  </div>
) : (
  <div className="px-3 py-2 text-xs text-muted-foreground/60">Loading diff…</div>
)}
```

Without error/retry states, a failed `preloadFileDiff` call leaves the widget stuck on "Loading diff..." indefinitely.

**Also apply to:** `apps/agent/src/components/chat/tools/write-tool-widget.tsx` (same pattern).

**Note:** `editToolToPierreDiff` is synchronous diff computation — for very large files, this could be expensive. Flagged for future Web Worker offloading if needed, but fine as a first pass.

> **Codex audit note — theme cache key:** `DiffFileCard`'s `prefetchKey` (`DiffFileCard.tsx:124`) does not include `themeType`, so cached prerendered HTML can mismatch after a theme switch. Include `themeType` in the prefetch cache key or invalidate the cache on theme change. Same applies to the tool widget preload effect — `pierreOptions` already changes on theme switch (keyed on `themeType`), so the effect re-fires correctly. But `DiffFileCard`'s `prefetchRef` cache is stale until next hover.

**Verify:** `bun run typecheck`, visually confirm diffs render correctly.

---

### Fix 5: Virtualize ChangesList

**Why:** With many changed files, rendering all `DiffFileCard` components to the DOM at once is wasteful. Most are collapsed (just headers), but DOM node count still matters for layout/paint performance.

**File:** `apps/agent/src/components/git/source-control/components/ChangesList.tsx`

**Changes:**

Always virtualize — no threshold split. One code path, no edge cases.

Use `react-virtuoso` — handles dynamic heights automatically via internal ResizeObserver. No manual `measureElement` refs, no absolute positioning, no `estimateSize`. Cards expand/collapse and Virtuoso repositions automatically. This is the right tool for the accordion pattern (expand/collapse diff cards with varying heights).

**Install:** `bun add react-virtuoso`

**Scroll integration:** `ChangesList` lives inside `SourceControlTab`'s `<div className="flex-1 overflow-y-auto">` alongside `CommitForm` and `GitActions`. A bare `<Virtuoso>` cannot manage its own scroll here — it would either render all items (defeating virtualization) or create a nested scrollbar. Use `customScrollParent` to share the parent scroll container.

> **Codex audit note — callback ref:** The original plan used `useRef<HTMLDivElement>(null)` and gated on `scrollParentRef.current`, which renders nothing on the first pass (ref isn't populated until after mount) and stays blank if no rerender happens. Use a callback ref + `useState` instead — the state setter triggers a rerender when the DOM node becomes available:

```typescript
// SourceControlTab.tsx — callback ref for scroll container readiness
const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null);
const mergedScrollRef = useCallback((node: HTMLDivElement | null): void => {
  setScrollParent(node);
  smoothScrollRef(node); // existing smooth scroll setup
}, [smoothScrollRef]);

<div ref={mergedScrollRef} className="flex-1 overflow-y-auto overscroll-y-contain">
  <CommitForm ... />
  <GitActions ... />
  <ChangesList scrollParent={scrollParent} ... />
</div>
```

```typescript
// ChangesList.tsx
import { Virtuoso } from 'react-virtuoso';

// Add to ChangesListProps:
scrollParent: HTMLDivElement | null;

// Render with customScrollParent + item spacing (replaces space-y-1):
{scrollParent ? (
  <Virtuoso
    customScrollParent={scrollParent}
    data={activeFiles}
    overscan={10}
    itemContent={(_index, file) => (
      <div className="pb-1">
        <DiffFileCard
          file={file}
          diff={activeDiffMap.get(file.path)}
          isStaged={isStaged}
          isLoading={isStaging}
          onAction={activeAction}
          onDiscard={activeDiscard}
          schedulePrefetch={schedulePrefetch}
        />
      </div>
    )}
  />
) : (
  <div className="px-3 py-4 text-xs text-lg-text-secondary">Loading changes...</div>
)}
```

**Why Virtuoso over TanStack:** The codebase already uses `@tanstack/react-virtual` for the file explorer (`file-explorer.tsx:190-196`), which has fixed row heights (`ROW_HEIGHT`). TanStack is ideal there. But diff cards have **dynamic heights** — collapsed headers (~38px) vs expanded diffs (potentially hundreds of pixels). TanStack requires manual `measureElement` ref wiring and `data-index` attributes for dynamic heights — if ResizeObserver misses a size change during fast expand/collapse animations, you get layout glitches. Virtuoso handles dynamic heights out of the box with zero configuration. Only using the MIT-licensed core `Virtuoso` component (not the commercial `VirtuosoMessageList`).

> **Bundle impact:** `react-virtuoso` adds ~20KB gzipped. Worth documenting this tradeoff — if a future TanStack dynamic-height pattern proves reliable, consider consolidating to one library.

**Edge case — expanded card state loss:** When a user expands a diff card then scrolls it out of Virtuoso's viewport, the card unmounts. On scroll back, it remounts collapsed (initial state). This is acceptable for the first pass — expand state is transient UI state. If it becomes a UX issue, lift `expandedPaths: Set<string>` to `ChangesList` and pass `isExpanded` / `onToggle` props to each card.

**Verify:** `bun run typecheck`, test expand/collapse with large and small changesets.

---

## Follow-up (not in this PR)

**On-demand diff fetching:** Currently `fetchDiffs()` fetches structured diffs for ALL changed files upfront. For repos with 100+ changed files, the real fix is: fetch only the file list + status on the 5s poll, then fetch individual file diffs on demand (on expand or hover preload). This is a larger refactor — the current fixes eliminate visible lag for the common case (<50 files).

## Execution Order

1. **Fix 1** — Git `spawn_blocking` (Rust, independent, `cargo check`)
2. **Fix 2** — Debounce/gate diff fetching (TS, independent, `bun run typecheck`)
3. **Fix 3** — Throttle hover preloads (TS, independent, `bun run typecheck`)
4. **Fix 4** — Preload Shiki in EditToolWidget + WriteToolWidget (TS, independent, `bun run typecheck`)
5. **Fix 5** — Virtualize ChangesList (TS, `bun add react-virtuoso`, `bun run typecheck`)

Each fix is independent and can be committed separately. Fix 1 is Rust-only; Fixes 2-5 are TS-only.

## Verification

### Automated tests (add with implementation)

Existing test files to extend:

- `apps/agent/src/__tests__/unit/components/git/source-control/hooks/use-source-control.test.ts`
- `apps/agent/src/__tests__/unit/stores/git/git-store.test.ts`

New test files to create:

- `apps/agent/src/__tests__/unit/components/git/source-control/components/ChangesList.test.tsx`

**Fix 2 — Hook scheduling tests** (extend `use-source-control.test.ts`):

1. Debounce: trigger `lastUpdated` twice within 300ms → `fetchDiffs` called once
2. Inflight dedup: call `fetchDiffs` while one is running → only one concurrent `Promise.all`
3. Trailing refetch: skip during inflight → `needsRefetchRef` drains after completion
4. Visibility gate: `isVisible=false` → no `fetchDiffs` on `lastUpdated` change
5. Visibility transition: `false→true` → immediate `fetchDiffs` (no 300ms delay)
6. Mount guard: first mount with `isVisible=true` → single `fetchDiffs` (not double)

**Fix 3 — Hover scheduler tests** (new or in `ChangesList.test.tsx`):

1. Latest-wins: hover card A then card B within 150ms → only card B preloads
2. Trailing pending: hover card C while card B's preload is running → card C preloads after B completes
3. Mouse leave cancels: hover then leave within 150ms → no preload starts
4. Click clears timer: hover then click within 150ms → expand effect handles fetch, not timer

**Fix 5 — Virtualization tests** (in `ChangesList.test.tsx`):

1. Renders Virtuoso when `scrollParent` is provided
2. Shows loading fallback when `scrollParent` is null
3. Passes correct props to DiffFileCard for each file item

### Manual tests

- After all fixes: `cargo check && bun run typecheck`
- Open source control tab with 30+ changed files, hover rapidly over cards — should be smooth
- Switch away from source control tab, wait >5s, switch back — diffs should load immediately (not stale)
- Expand an Edit tool widget in chat — diff should appear after brief loading state with no UI freeze
- Slowly hover across 10+ cards — only the last hovered card should be actively preloading
- Switch theme while a diff card has cached prerendered HTML — verify card re-renders with correct theme colors

---

## Audit Findings

Full audit: `reviews/audit-plan.md`

### Round 1 (2026-03-01) — Claude audit

**Resolved in-place above:**

- Fix 1: `orbit_core::Error::Internal` → `Error::Other` (variant doesn't exist)
- Fix 1: Scoped to 19 sync commands (8 already async), added `spawn_git` helper
- Fix 2: `prevVisible` double-fetch guard on mount
- Fix 3: Clear hover timer on click (prevents timer/expand-effect collision)
- Fix 4: `pierreOptions` must be memoized (`useMemo` keyed on `themeType`)
- Fix 5: `customScrollParent` for nested scroll integration
- Fix 5: `space-y-1` → `pb-1` per item (Virtuoso manages layout)
- Fix 5: Documented expanded-state-loss edge case

### Round 2 (2026-03-02) — Codex audit

**Resolved in-place above:**

- Fix 2: Added inflight dedup + trailing `needsRefetchRef` to `fetchDiffs` (promoted from edge case to addressed — prevents overlapping calls from racing and producing stale→correct flashes)
- Fix 3: Replaced per-card `cancelled` flag with shared latest-wins scheduler in `ChangesList` (per-card cancel only guards setState, not expensive parseDiffFromFile + preloadFileDiff work)
- Fix 4: Added error/retry states to tool widget preload (prevents indefinite "Loading diff..." on preload failure)
- Fix 4: Documented theme cache key issue (`prefetchKey` omits `themeType` → stale HTML after theme switch)
- Fix 5: Replaced `useRef` + `.current` gating with callback-ref + `useState` (prevents blank render if no rerender occurs after mount)
- Fix 5: Added explicit TanStack vs Virtuoso justification (file explorer = fixed heights → TanStack; diff cards = dynamic heights → Virtuoso) and documented ~20KB bundle impact

### Round 3 (2026-03-02) — Codex audit of updated plan

**Resolved in-place above:**

- Fix 2: Corrected tab literal `'files'` → `'file'` and variable `activeTab` → `activityTab` (`ActivityTab = 'file' | 'source' | 'browser'` from `ui-store.ts:77`)
- Fix 2: Added trailing `needsRefetchRef` to `fetchDiffs` — skipped calls during inflight are drained on completion (prevents stale windows)
- Fix 3: Added trailing pending slot to hover scheduler — `pendingStartRef` stores the latest hover during an active preload, executes after completion (true latest-wins, not drop-on-busy)
- Added automated test section with specific test cases for debounce/inflight, hover scheduler, and virtualization

**Remaining edge cases (not blocking, monitor during implementation):**

- Fix 4: `editToolToPierreDiff` is synchronous — very large Edit/Write diffs (10k+ lines) will block the main thread during `parseDiffFromFile`. Acceptable for first pass; flag for Web Worker offloading if seen in practice.
- Fix 5: Expanded diff cards reset to collapsed after virtualization remount (scroll out and back). Documented in Fix 5 as acceptable for first pass. If it becomes a UX issue, lift `expandedPaths: Set<string>` to `ChangesList`.
- Fix 5: Rapid workspace/repo switches can produce out-of-order diff result application — `needsRefetchRef` trailing pattern mitigates but doesn't fully guard against stale repo paths in closures. A repo generation token (increment on workspace switch, check before applying results) would fully solve this.
- Fix 3: Under sustained hover churn with long-running preloads, the trailing pending slot ensures the latest hover eventually executes, but it can lag behind real-time cursor position. Bounded and non-blocking — at most 1 running + 1 pending at any time.
- Fix 1: Tokio blocking thread pool defaults to 512 threads. Unlikely to exhaust in practice but worth noting for future profiling.
- Fix 1: No observability/timing logs around `spawn_git` — consider adding command-level timing to detect latency/queueing regressions after rollout.
