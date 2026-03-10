# Fix: File explorer doesn't remove externally deleted files

## Context

When a file is added externally (e.g., from macOS Finder), it correctly appears in the file tree with an untracked "U" badge. But when the same file is **deleted** externally, only the git badge is removed (via independent 5-second git status polling in `use-git-polling.ts:27`) — the file entry itself stays visible in the tree. Manual refresh works.

**Root cause:** The file watcher pipeline relies on the `notify` crate's FSEvents backend on macOS to emit `EventKind::Remove` events. On macOS, FSEvents can report file deletions as `Modify` events or coalesce them. The handler in `use-file-tree.ts:513` only schedules `refreshDirectory` for `created` and `deleted` change types — `modified` events are silently ignored, so the tree never refreshes when FSEvents misreports a deletion.

**Why Codex's changes didn't fix it:** Codex implemented `scheduleDirectoryRefresh` for `created` AND `deleted` events, plus made `handleFileChanged('deleted')` do synchronous removal. Both are correct, but both depend on receiving a `file:changed` message with `change_type: 'deleted'`. If macOS FSEvents reports the deletion as a `modified` event instead, neither path executes.

## Fix (6 changes in 1 file)

**File:** `apps/agent/src/hooks/file/use-file-tree.ts`

### 1. Schedule directory refresh for ALL change types

**Location:** `use-file-tree.ts:513`

Remove the `created || deleted` filter so that `modified` events (and any future event types) also trigger a debounced directory refresh.

Remove the `if` gate entirely and dedent the inner code. The `case` block already provides scope — no bare `{` block needed.

```typescript
// BEFORE (line 506–523):
case 'file:changed': {
  // ...
  useFileStore.getState().handleFileChanged(message.path, message.change_type);

  if (message.change_type === 'created' || message.change_type === 'deleted') {
    const parentPath = getParentPath(message.path);
    if (parentPath) {
      scheduleDirectoryRefresh(refreshTimersRef.current, parentPath);
    } else {
      const rootPath = useFileStore.getState().rootPath;
      if (rootPath) {
        scheduleDirectoryRefresh(refreshTimersRef.current, rootPath);
      }
    }
  }
  break;
}

// AFTER:
case 'file:changed': {
  if (debug) {
    logger.debug('File changed', { path: message.path, changeType: message.change_type });
  }
  // Handle immediate tree updates (delete events update children synchronously).
  useFileStore.getState().handleFileChanged(message.path, message.change_type);

  // Schedule debounced directory refresh for ALL change types — macOS FSEvents
  // may report file deletions as 'modified' events. The 150ms debounce +
  // structural equality guard in refreshDirectory() prevents unnecessary re-renders.
  const parentPath = getParentPath(message.path);
  if (parentPath) {
    scheduleDirectoryRefresh(refreshTimersRef.current, parentPath, message.change_type);
  } else {
    const rootPath = useFileStore.getState().rootPath;
    if (rootPath) {
      scheduleDirectoryRefresh(refreshTimersRef.current, rootPath, message.change_type);
    }
  }
  break;
}
```

All `file:changed` events now schedule a `refreshDirectory` for the parent path. No cast needed — TypeScript already narrows `message.change_type` to `'created' | 'modified' | 'deleted'` inside the `case 'file:changed':` branch.

The existing 150ms debounce per-directory (`FILE_TREE_REFRESH_DEBOUNCE_MS = 150`) protects against excessive calls from rapid `modified` events (e.g., auto-save).

### 2. Add structural equality guard in `refreshDirectory`

**Location:** `use-file-tree.ts` (in `refreshDirectory` function, ~line 284)

Before calling `setTreeChildren`, compare incoming children against existing ones. If the node signatures are identical, skip the store update entirely. This prevents unnecessary Zustand state changes and React re-renders when `modified` events fire for unchanged directories.

**Why metadata must be included:** `FileTreeRow` rendering depends on `isGitIgnored` (opacity/title at `file-explorer.tsx:496, 647`) and `isSymlink`. A path-only comparator would suppress legitimate updates when `.gitignore` changes or symlink targets change type. Including `isDirectory`, `isSymlink`, and `isGitIgnored` in the signature preserves correctness without changing complexity.

Add at module level:

```typescript
/**
 * Build a stable signature for a FileNode.
 * Includes metadata fields that affect rendering (isGitIgnored → opacity/title,
 * isSymlink → icon, isDirectory → expand/collapse). Path is normalized for
 * case-insensitive filesystems (macOS/Windows).
 *
 * Keep in sync with FileNode fields that affect tree row rendering.
 */
function getFileNodeSignature(node: FileNode): string {
  const normalizedPath = normalizePathForFsComparison(node.path);
  const isDir = node.isDirectory ? '1' : '0';
  const isSymlink = node.isSymlink === true ? '1' : '0';
  const isIgnored = node.isGitIgnored === true ? '1' : '0';
  // Include raw name for display-casing changes (e.g., README.md → readme.md on macOS).
  // normalizedPath is lowercased on case-insensitive FS, so it can't detect casing changes alone.
  return `${node.name}\0${normalizedPath}\0${isDir}\0${isSymlink}\0${isIgnored}`;
}

/**
 * Fast structural equality check for directory children (O(n) string comparison).
 * Compares both paths AND rendering-relevant metadata to avoid suppressing
 * legitimate updates (e.g., .gitignore changes, symlink type changes).
 *
 * Assumes listDirectory returns children in stable sort order.
 */
function areChildrenStructurallyEqual(
  existing: readonly FileNode[],
  incoming: readonly FileNode[]
): boolean {
  if (existing.length !== incoming.length) return false;
  for (let i = 0; i < existing.length; i++) {
    if (getFileNodeSignature(existing[i]) !== getFileNodeSignature(incoming[i])) return false;
  }
  return true;
}
```

In `refreshDirectory`, before `setTreeChildren`:

```typescript
const newChildren = toFileNodes(entries);

// Skip if directory structure and metadata are unchanged
// (prevents re-renders from 'modified' events on unchanged directories)
const existingChildren = storeAfterFetch.treeNodes[targetDirPath];
if (existingChildren && areChildrenStructurallyEqual(existingChildren, newChildren)) {
  refreshStats.skippedEqual += 1;
  logger.debug('Directory refresh skipped (structure unchanged)', {
    path: targetDirPath,
    stats: { ...refreshStats },
  });
  return;
}

storeAfterFetch.setTreeChildren(targetDirPath, newChildren);
```

Add `skippedEqual` to the existing `refreshStats` object:

```typescript
const refreshStats = {
  scheduled: 0,
  coalesced: 0,
  executed: 0,
  skippedStale: 0,
  skippedInvisible: 0,
  skippedEqual: 0, // ← new
  pendingHighWater: 0, // ← new: peak pendingRefreshWork.size
  dirtyHighWater: 0, // ← new: peak dirtyCollapsedFolders.size
  dirtyExpandRefreshes: 0, // ← new: how often dirty-on-expand fired
};
```

### 3. Aggregate structural intent across debounce window

**Location:** `scheduleDirectoryRefresh` + `refreshDirectory` + timer data structure

**Problem with naive `changeType` pass-through:** The debounce timer is per-directory and last-writer-wins. If a `created` event fires, then a `modified` event fires for the same parent within the 150ms window, the timer is replaced with `changeType: 'modified'`. When `refreshDirectory` finally runs, it sees only `modified` and would incorrectly skip cache eviction for collapsed folders — even though a structural change (`created`) occurred in the window.

**Fix:** Track a `hasStructuralChange` boolean per timer key instead of the raw change type. Any `created` or `deleted` event in the window sets the flag to `true`. The flag is sticky — once set, subsequent `modified` events in the same window cannot clear it.

Change `RefreshTimers` from `Map<string, ReturnType<typeof setTimeout>>` to:

```typescript
interface PendingRefresh {
  timerId: ReturnType<typeof setTimeout>;
  /** True if any created/deleted event occurred in this debounce window. */
  hasStructuralChange: boolean;
}

type RefreshTimers = Map<string, PendingRefresh>;
```

Update `scheduleDirectoryRefresh`:

```typescript
import type { FileChanged } from '@/types/protocol';

/** Change types recognized by the refresh scheduler (derived from protocol — single source of truth). */
type TreeChangeType = FileChanged['change_type'];

function scheduleDirectoryRefresh(
  timers: RefreshTimers,
  dirPath: string,
  changeType: TreeChangeType
): void {
  const key = timerKey(dirPath);
  const existing = timers.get(key);
  const isStructural = changeType === 'created' || changeType === 'deleted';

  // Aggregate intent: once structural, always structural for this window.
  // (Structural intent is sticky in debounce window — a 'modified' event
  // cannot clear a flag set by an earlier 'created' or 'deleted' event.)
  const hasStructuralChange = isStructural || (existing?.hasStructuralChange ?? false);

  if (existing !== undefined) {
    clearTimeout(existing.timerId);
    refreshStats.coalesced += 1;
  } else {
    refreshStats.scheduled += 1;
  }

  timers.set(key, {
    hasStructuralChange,
    timerId: setTimeout(() => {
      timers.delete(key);
      void refreshDirectory(dirPath, hasStructuralChange);
    }, FILE_TREE_REFRESH_DEBOUNCE_MS),
  });
}
```

Update `clearScheduledDirectoryRefreshes`:

```typescript
function clearScheduledDirectoryRefreshes(timers: RefreshTimers): void {
  for (const pending of timers.values()) clearTimeout(pending.timerId);
  timers.clear();
}
```

Update `refreshDirectory` to accept and use the flag:

```typescript
async function refreshDirectory(dirPath: string, hasStructuralChange: boolean): Promise<void> {
  // ... existing guards ...

  if (!isVisible) {
    // Only evict cache for structural changes (create/delete).
    // Pure modified events don't change directory structure — skip eviction
    // to avoid unnecessary re-fetches when the folder is next expanded.
    if (hasStructuralChange && storeBeforeFetch.treeNodes[targetDirPath]) {
      useFileStore.setState((state) => {
        Reflect.deleteProperty(state.treeNodes, targetDirPath);
      });
    }
    refreshStats.skippedInvisible += 1;
    // ... existing logging ...
    return;
  }

  // ... rest of function unchanged ...
}
```

The caller in the `file:changed` handler (shown in change 1) passes `message.change_type` directly — no cast needed since TypeScript already narrows it to `'created' | 'modified' | 'deleted'` inside the `case 'file:changed':` branch, which matches `TreeChangeType` (derived from `FileChanged['change_type']`).

### 4. Deduped concurrency limiter for burst refreshes

**Location:** `use-file-tree.ts` (module level, near `refreshStats`) + `scheduleDirectoryRefresh` timer callback

**Problem:** When a large operation (e.g., `git checkout`) touches many parent directories, each parent gets its own debounced timer. After 150ms, all timers fire simultaneously, creating N concurrent `listDirectory` IPC calls to the Rust backend. With 50+ directories this can overwhelm the backend.

**Why not drop-on-overflow:** A bounded queue that drops excess refreshes creates a stale-state risk — if no subsequent `file:changed` event arrives for a dropped directory, the explorer stays stale indefinitely. Every enqueued refresh intent must be guaranteed to execute.

**Fix:** A deduped work map with bounded concurrency. Instead of a queue of anonymous callbacks, use a `Map<normalizedPath, entry>` that naturally dedupes by directory. Memory is bounded by the number of unique pending directories (not event count). No refresh intent is ever dropped.

The concurrency gate moves from inside `refreshDirectory` (wrapping `listDirectory`) to the **scheduling boundary** — `enqueueRefresh` decides whether to run immediately or park. `refreshDirectory` stays a pure async function with no semaphore awareness.

Add at module level:

```typescript
/**
 * Deduped work map with bounded concurrency for directory refreshes.
 * Prevents overwhelming the Rust backend during large bursts
 * (e.g., `git checkout` touching many parent directories at once).
 *
 * No refresh intent is ever dropped. Duplicate requests for the same
 * directory are naturally deduped by the Map key (normalized path).
 * Memory is bounded by unique pending directory count, not event count.
 *
 * hasStructuralChange aggregates across deduped entries (sticky: true wins).
 * Map preserves insertion order → FIFO processing.
 *
 * Module-level state: survives across React renders, reset on HMR.
 */
const MAX_CONCURRENT_REFRESHES = 5;
let inFlightRefreshCount = 0;

interface PendingRefreshEntry {
  dirPath: string;
  hasStructuralChange: boolean;
}

/** Deduped pending refresh work. Key is timerKey(dirPath). */
const pendingRefreshWork = new Map<string, PendingRefreshEntry>();

function enqueueRefresh(dirPath: string, hasStructuralChange: boolean): void {
  const key = timerKey(dirPath);

  if (inFlightRefreshCount < MAX_CONCURRENT_REFRESHES) {
    // Slot available — run immediately
    inFlightRefreshCount += 1;
    void refreshDirectory(dirPath, hasStructuralChange).finally(() => {
      inFlightRefreshCount -= 1;
      drainPendingRefreshWork();
    });
    return;
  }

  // At capacity — park intent (deduped by normalized path)
  const existing = pendingRefreshWork.get(key);
  pendingRefreshWork.set(key, {
    dirPath,
    // Sticky structural intent: true wins across deduped entries
    hasStructuralChange: hasStructuralChange || (existing?.hasStructuralChange ?? false),
  });

  // Track peak queue depth for observability / tuning MAX_CONCURRENT_REFRESHES
  if (pendingRefreshWork.size > refreshStats.pendingHighWater) {
    refreshStats.pendingHighWater = pendingRefreshWork.size;
  }
}

function drainPendingRefreshWork(): void {
  while (inFlightRefreshCount < MAX_CONCURRENT_REFRESHES && pendingRefreshWork.size > 0) {
    // Pull first entry (FIFO via Map insertion order)
    const iterator = pendingRefreshWork.entries().next();
    if (iterator.done) break;
    const [key, entry] = iterator.value;
    pendingRefreshWork.delete(key);

    inFlightRefreshCount += 1;
    void refreshDirectory(entry.dirPath, entry.hasStructuralChange).finally(() => {
      inFlightRefreshCount -= 1;
      drainPendingRefreshWork();
    });
  }
}
```

Update the timer callback in `scheduleDirectoryRefresh` to use `enqueueRefresh` instead of calling `refreshDirectory` directly:

```typescript
// BEFORE (in scheduleDirectoryRefresh):
timerId: setTimeout(() => {
  timers.delete(key);
  void refreshDirectory(dirPath, hasStructuralChange);
}, FILE_TREE_REFRESH_DEBOUNCE_MS),

// AFTER:
timerId: setTimeout(() => {
  timers.delete(key);
  enqueueRefresh(dirPath, hasStructuralChange);
}, FILE_TREE_REFRESH_DEBOUNCE_MS),
```

`refreshDirectory` is unchanged — it calls `listDirectory` directly (no wrapper):

```typescript
// No change needed — refreshDirectory still calls listDirectory directly:
const entries = await listDirectory(targetDirPath, true);
```

Add HMR cleanup for the concurrency state in the existing `import.meta.hot.dispose` block:

```typescript
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const ref of activeTimerRefs) {
      clearScheduledDirectoryRefreshes(ref.current);
    }
    activeTimerRefs.clear();
    // Reset concurrency limiter state on HMR
    pendingRefreshWork.clear();
    inFlightRefreshCount = 0;
  });
}
```

**Behavior:** Max 5 concurrent `refreshDirectory` calls. Excess is parked in a deduped Map (key: normalized path). When a slot frees, `drainPendingRefreshWork` pulls the next entry (FIFO). Duplicate requests for the same directory aggregate `hasStructuralChange` (sticky). No intent is ever dropped — every directory that needs refreshing will eventually be processed.

### 5. Clear refresh timers on workspace switch

**Location:** `use-file-tree.ts` (in the existing `useEffect` that watches `currentRootPath`, ~line 749)

**Problem:** When the workspace switches, pending refresh timers from the old workspace fire after 150ms, make `listDirectory` calls for paths in the old workspace, and get rejected by the stale-root guard. Harmless but wasteful — unnecessary IPC calls.

**Fix:** Clear pending refresh timers when `currentRootPath` changes, alongside the existing pending-request cleanup. This is a one-liner addition to an existing effect — no new coupling needed since `refreshTimersRef` is already in scope.

```typescript
// In the existing useEffect that watches currentRootPath (~line 749):
useEffect(() => {
  if (prevRootPathRef.current !== currentRootPath && prevRootPathRef.current !== null) {
    // ... existing pending request cleanup ...

    // Clear pending refresh timers for the old workspace.
    // Without this, timers fire and enqueue wasted refreshes that
    // the stale-root guard would reject — harmless but wasteful.
    clearScheduledDirectoryRefreshes(refreshTimersRef.current);

    // Clear any pending refresh work parked by the concurrency limiter.
    // These directories belong to the old workspace.
    pendingRefreshWork.clear();
  }
  prevRootPathRef.current = currentRootPath;
}, [currentRootPath, debug]);
```

### 6. Dirty marker for collapsed folders with modified events

**Location:** `use-file-tree.ts` (module level + `refreshDirectory` invisible path + `toggleFolder`)

**Problem:** If FSEvents reports a file deletion as `modified` on a collapsed folder, `hasStructuralChange` is `false` → cache not evicted → user expands → stale children shown. Always evicting on `modified` would reintroduce auto-save churn for every collapsed folder.

**Fix:** Deferred invalidation via dirty markers. When a `modified` event arrives for a collapsed (invisible) folder that has cached children, mark it as dirty in a lightweight `Set`. When the user expands that folder, evict the stale cache and re-fetch fresh data. Cost of marking is O(1); the re-fetch is deferred to when the user actually needs the data.

Add at module level:

```typescript
/**
 * Collapsed folders that received 'modified' events while invisible.
 * On next expand, their cached children are evicted and re-fetched.
 * Key is timerKey(dirPath) for case-insensitive dedup.
 *
 * Module-level state: survives across React renders, reset on HMR.
 */
const dirtyCollapsedFolders = new Set<string>();
```

In `refreshDirectory`, update the invisible-folder branch to mark dirty instead of silently skipping:

```typescript
if (!isVisible) {
  if (hasStructuralChange && storeBeforeFetch.treeNodes[targetDirPath]) {
    // Structural change (create/delete) — evict cache immediately
    useFileStore.setState((state) => {
      Reflect.deleteProperty(state.treeNodes, targetDirPath);
    });
  } else if (storeBeforeFetch.treeNodes[targetDirPath]) {
    // Modified event on collapsed folder — mark dirty for refresh on next expand.
    // Avoids immediate eviction churn from auto-save while ensuring stale data
    // (e.g., deletion misreported as 'modified') is caught when user expands.
    dirtyCollapsedFolders.add(timerKey(targetDirPath));
    // Track peak dirty set size for observability
    if (dirtyCollapsedFolders.size > refreshStats.dirtyHighWater) {
      refreshStats.dirtyHighWater = dirtyCollapsedFolders.size;
    }
  }
  refreshStats.skippedInvisible += 1;
  // ... existing logging ...
  return;
}

// ... after successful visible refresh, clear any stale dirty marker ...
dirtyCollapsedFolders.delete(timerKey(targetDirPath));
```

In `toggleFolder`, check the dirty set before expanding:

```typescript
const toggleFolder = useCallback(
  (path: string): void => {
    const store = useFileStore.getState();
    const wasExpanded = store.expandedFolders.has(path);

    store.toggleFolder(path);

    if (!wasExpanded) {
      const key = timerKey(path);
      if (dirtyCollapsedFolders.has(key)) {
        // Dirty folder — evict stale cache so requestChildren re-fetches
        dirtyCollapsedFolders.delete(key);
        refreshStats.dirtyExpandRefreshes += 1;
        useFileStore.setState((state) => {
          Reflect.deleteProperty(state.treeNodes, path);
        });
      }
      // Re-check after potential eviction
      if (!(path in useFileStore.getState().treeNodes)) {
        requestChildren(path);
      }
    }
  },
  [requestChildren]
);
```

Add cleanup to workspace-switch effect and HMR:

```typescript
// In workspace-switch useEffect (alongside timer and pending work cleanup):
dirtyCollapsedFolders.clear();

// In import.meta.hot.dispose (alongside timer and concurrency cleanup):
dirtyCollapsedFolders.clear();
```

**Behavior:** Auto-save on collapsed folder → marks dirty (Set add, O(1)), no churn. Deletion misreported as `modified` on collapsed folder → marks dirty → user expands → stale cache evicted, fresh listing fetched. User sees brief loading state on expand (same as first-time expand), but gets correct data.

### Why this combination works

| Scenario                                                      | What happens                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File deleted, `notify` emits `Remove`                         | `handleFileChanged('deleted')` removes synchronously ✅ + `refreshDirectory` confirms ✅                                                                                                                                                                                                       |
| File deleted, `notify` emits `Modify`                         | `handleFileChanged('modified')` is no-op, but `refreshDirectory` catches it via `listDirectory` ✅                                                                                                                                                                                             |
| File saved (normal edit)                                      | `refreshDirectory` fires, but `areChildrenStructurallyEqual` returns true → no re-render ✅                                                                                                                                                                                                    |
| Rapid saves (auto-save)                                       | 150ms debounce coalesces into single `listDirectory` call → equality check skips update ✅                                                                                                                                                                                                     |
| File created externally                                       | Works as before — `scheduleDirectoryRefresh` + `listDirectory` shows new file ✅                                                                                                                                                                                                               |
| `.gitignore` changed                                          | `isGitIgnored` flags differ → signature mismatch → `setTreeChildren` updates tree ✅                                                                                                                                                                                                           |
| Symlink target changes type                                   | `isSymlink`/`isDirectory` flags differ → signature mismatch → update ✅                                                                                                                                                                                                                        |
| Collapsed folder + auto-save                                  | `modified`-only window → `hasStructuralChange: false` → marks dirty (O(1) Set add) → no churn ✅                                                                                                                                                                                               |
| Collapsed folder + create then modify                         | `created` sets `hasStructuralChange: true` → sticky through window → cache evicted correctly ✅                                                                                                                                                                                                |
| Collapsed folder + deletion misreported as `modified`         | Dirty marker set → user expands → cache evicted, fresh `requestChildren` fetches correct listing without deleted file ✅                                                                                                                                                                       |
| Case-only rename on macOS (e.g., `README.md` → `readme.md`)   | Raw `name` in signature detects display casing change → `setTreeChildren` updates tree ✅                                                                                                                                                                                                      |
| Root/worktree switch with pending timers                      | `clearScheduledDirectoryRefreshes` cancels all pending timers; `pendingRefreshWork.clear()` cancels parked work; `dirtyCollapsedFolders.clear()` clears stale dirty markers → no wasted `listDirectory` calls ✅                                                                               |
| Root/worktree switch with in-flight refreshes                 | At most `MAX_CONCURRENT_REFRESHES` (5) old-root calls complete. Stale-root guard (`rootAtStart !== rootAfterFetch`) rejects all. `drainPendingRefreshWork` finds empty map → no further drain. Tauri `invoke()` has no cancellation API — stale-root guard is the correct and only approach ✅ |
| Large burst across many parent folders (e.g., `git checkout`) | `enqueueRefresh` caps concurrency to 5, excess parked in deduped Map (no drops). `drainPendingRefreshWork` processes FIFO as slots free. Equality guard prevents unnecessary store updates ✅                                                                                                  |

## Accepted limitations

| Concern                                                 | Why it's acceptable                                                                                                                                                                                                                                                                                            | Mitigation                                                                                                                                                                                                                                  |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Extremely large unique-directory bursts**             | `pendingRefreshWork` Map grows proportionally to unique directories touched. 200 dirs = 200 entries × ~50 bytes = ~10 KB memory. Processing: 200 / 5 concurrent = 40 batches × ~50ms = ~2 seconds of background work. Both are negligible compared to the `treeNodes` cache itself (~100+ KB for large repos). | `refreshStats.pendingHighWater` tracks peak queue depth for empirical tuning of `MAX_CONCURRENT_REFRESHES`. Deduplication prevents duplicate entries. Map drains completely as slots free.                                                  |
| **In-flight old-root refreshes after workspace switch** | At most `MAX_CONCURRENT_REFRESHES` (5) `listDirectory` calls from the previous root may still be in-flight when the workspace switches. Tauri `invoke()` has no cancellation API — these calls will complete.                                                                                                  | Stale-root guard (`rootAtStart !== rootAfterFetch`) in `refreshDirectory` rejects all completed old-root calls. `pendingRefreshWork.clear()` prevents draining additional old-root work. At most 5 wasted IPC calls with no state mutation. |

Previously unaddressed edge cases now resolved:

- Large multi-parent bursts: deduped concurrency limiter with no drops (change 4)
- Workspace switch stale timers: proactive timer clearing (change 5)
- Queue overflow with no follow-up event: deduped work map — no intent ever dropped (change 4)
- Collapsed folder + misreported deletion: dirty markers + refresh-on-expand (change 6)
- In-flight old-root completions: stale-root guard + empty pending map prevents drain (test added)

## Files to modify

| File                                         | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/hooks/file/use-file-tree.ts` | (1) Remove change-type filter on `scheduleDirectoryRefresh`, (2) add `getFileNodeSignature` / `areChildrenStructurallyEqual` guard + `skippedEqual` counter, (3) aggregate structural intent via `PendingRefresh.hasStructuralChange` sticky flag for collapsed-folder cache eviction, (4) deduped concurrency limiter (`enqueueRefresh` / `drainPendingRefreshWork`) for burst protection with no dropped intent, (5) clear refresh timers + pending work + dirty markers on workspace switch, (6) dirty markers (`dirtyCollapsedFolders`) for deferred refresh-on-expand of collapsed folders with `modified` events |

**No other files change.** The existing `handleFileChanged`, `scheduleDirectoryRefresh`, `refreshDirectory`, and `setTreeChildren` functions are all correct — they just weren't being triggered for all event types.

## Tests

**File:** `apps/agent/src/__tests__/unit/hooks/file/use-file-tree-refresh.test.ts`

Required test cases:

Tests are behavior-driven: emit `file:changed` messages through the hook's message handler rather than calling internal helpers directly. This matches the existing test architecture.

```typescript
it('schedules refresh for modified events in expanded folders', async () => {
  // Arrange: root + expanded parent with existing children
  // Act: emit file:changed with change_type='modified' for a file in the parent
  // Advance timers past FILE_TREE_REFRESH_DEBOUNCE_MS
  // Assert: listDirectory called once for the parent directory
});

it('does not call setTreeChildren when listing is structurally identical', async () => {
  // Arrange: expanded parent with children; mock listDirectory returns same nodes
  // Act: emit file:changed(modified) for a file in the parent
  // Advance timers
  // Assert: treeNodes reference for the parent is unchanged (same object identity)
});

it('applies refresh when metadata changes without path changes', async () => {
  // Arrange: expanded parent with children; mock listDirectory returns same paths
  //          but one node has isGitIgnored flipped
  // Act: emit file:changed(modified)
  // Advance timers
  // Assert: tree updates — treeNodes reference changed, metadata reflected in node
});

it('preserves structural intent when created then modified events coalesce', async () => {
  // Arrange: collapsed folder with cached children in treeNodes
  // Act: emit file:changed(created), then file:changed(modified) for same parent
  //      (both within the 150ms debounce window)
  // Advance timers past debounce
  // Assert: collapsed-folder cache is evicted (structural intent preserved)
});

it('skips cache eviction for collapsed folder when only modified events in window', async () => {
  // Arrange: collapsed folder with cached children in treeNodes
  // Act: emit file:changed(modified) for a file in the parent
  // Advance timers past debounce
  // Assert: collapsed-folder cache is NOT evicted (no structural change)
});

it('limits concurrent listDirectory calls during burst refreshes', async () => {
  // Arrange: root with 10 expanded subdirectories; mock listDirectory with delayed resolution
  // Act: emit file:changed(created) for a file in each of the 10 subdirectories
  // Advance timers past debounce
  // Assert: at most MAX_CONCURRENT_REFRESHES (5) listDirectory calls are in-flight simultaneously
  // Resolve first batch; assert remaining 5 drain from pending work map
});

it('dedupes pending refreshes for the same directory', async () => {
  // Arrange: root with expanded parent; mock listDirectory with delayed resolution
  //          Fill all 5 concurrency slots with other directories
  // Act: emit file:changed(modified) twice for same parent (same debounce window → coalesced,
  //      but also test: two separate windows both enqueue while at capacity)
  // Assert: only one listDirectory call for that parent after slots free (deduped)
});

it('never drops refresh intent — all enqueued directories eventually processed', async () => {
  // Arrange: root with 15 expanded subdirectories; mock listDirectory with delayed resolution
  // Act: emit file:changed(created) for all 15 directories
  // Advance timers past debounce → 5 in-flight, 10 pending
  // Resolve all in-flight; let drainPendingRefreshWork process remaining
  // Assert: listDirectory called exactly 15 times (none dropped)
});

it('logs error and preserves tree state when listDirectory rejects during modified-triggered refresh', async () => {
  // Arrange: expanded parent with existing children; mock listDirectory to reject
  // Act: emit file:changed(modified) for a file in the parent
  // Advance timers past debounce
  // Assert: error is logged, treeNodes for parent remain unchanged
});

it('marks collapsed folder as dirty on modified event and refreshes on expand', async () => {
  // Arrange: collapsed folder with cached children in treeNodes
  // Act: emit file:changed(modified) for a file in the parent
  // Advance timers past debounce
  // Assert: treeNodes cache is NOT evicted (no immediate churn)
  // Act: expand the folder (toggleFolder)
  // Assert: stale cache evicted, requestChildren called, fresh listing shown
});

it('does not mark expanded folder as dirty (refresh runs normally)', async () => {
  // Arrange: expanded folder with children
  // Act: emit file:changed(modified) for a file in the parent
  // Advance timers past debounce
  // Assert: refreshDirectory ran (visible path), no dirty marker set
});

it('clears pending refresh timers when workspace root changes', async () => {
  // Arrange: root with expanded parent; emit file:changed(modified) to schedule a timer
  // Act: change rootPath (simulating workspace switch) before debounce fires
  // Advance timers past debounce
  // Assert: listDirectory was NOT called (timer was cleared on workspace switch)
});

it('rejects in-flight old-root refresh completions after workspace switch', async () => {
  // Arrange: root-A with expanded parent; emit file:changed(created) to enqueue refresh
  //          mock listDirectory with delayed resolution (simulating in-flight call)
  // Act: switch rootPath to root-B while listDirectory for root-A is still pending
  // Assert: pendingRefreshWork is cleared, dirtyCollapsedFolders is cleared
  // Act: resolve the in-flight listDirectory call (returns root-A children)
  // Assert: root-B treeNodes are NOT mutated (stale-root guard rejected)
  //         drainPendingRefreshWork does NOT start new work (map is empty)
});
```

## Verification

1. `bunx tauri dev` — open a folder
2. In Finder, create a file → should appear in explorer (blue "U")
3. In Finder, delete that file → **should disappear from explorer** (not just lose its badge)
4. Save an existing file → tree should NOT flicker/re-render (equality guard prevents it)
5. Edit `.gitignore` to ignore a visible file → file should gain ignored styling
6. `bun run check` — typecheck + lint + tests pass
