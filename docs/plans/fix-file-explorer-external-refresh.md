# Fix: File explorer doesn't refresh when files are added externally

## Context

When a user opens a folder in Orbit, then adds a file via macOS Finder, the file explorer doesn't update to show the new file. The file watcher pipeline (Rust `notify` crate → Tauri events → frontend handlers) detects the change correctly, but the refresh mechanism for `created` events is unreliable.

**Root cause**: `handleFileChanged('created')` in `file-store.ts:608-613` only clears the parent directory's cache via `Reflect.deleteProperty(state.treeNodes, parentPath)`. It then relies on a React useEffect in `use-file-tree.ts:498-530` to detect the missing key through a string-serialized selector (`Object.keys(treeNodes).join('\0')`) and trigger a re-fetch. This indirect chain is fragile. In contrast, the `deleted` handler works instantly because it directly modifies the children array.

**Fix**: Replace the indirect cache-clear mechanism with a direct debounced re-fetch of the parent directory, with stale-response guards and proper lifecycle cleanup.

## Files to modify

| File                                                   | Change                                                                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/lib/mappers/files.ts`                  | **NEW** — `toFileNodes()` mapping + `EXCLUDED_ENTRY_NAMES`                                                                 |
| `apps/agent/src/lib/mappers/index.ts`                  | Export from new file                                                                                                       |
| `apps/agent/src/hooks/file/use-file-tree.ts`           | Add debounced `scheduleDirectoryRefresh` at module level with stale guards + HMR cleanup; call from `file:changed` handler |
| `apps/agent/src/stores/file/file-store.ts`             | Remove `Reflect.deleteProperty` for `created` events (now a no-op)                                                         |
| `apps/agent/src/hooks/agent/handlers/file-handlers.ts` | Import shared `toFileNodes` instead of local definitions                                                                   |
| `apps/agent/src/providers/tauri-provider.tsx`          | Remove duplicate file watcher setup (consolidate to single batched pipeline)                                               |

## Implementation

### 1. Create shared mapping — `lib/mappers/files.ts`

Extract `EXCLUDED_ENTRY_NAMES` (currently local to `file-handlers.ts:15-22`) and the `FileEntry → FileNode` mapping (currently inline at `file-handlers.ts:128-140`) into the existing mappers directory (matches codebase convention — `lib/mappers/conversations.ts` already exists for DTO-to-UI transforms).

```typescript
import type { FileEntry } from '@/lib/api';
import type { FileNode } from '@/types/protocol';

/**
 * System entries to hide from the file explorer.
 * Lowercase — matched case-insensitively for macOS/Windows.
 */
export const EXCLUDED_ENTRY_NAMES: ReadonlySet<string> = new Set([
  '.git',
  '.ds_store',
  '.spotlight-v100',
  '.trashes',
  'thumbs.db',
  'desktop.ini',
]);

/**
 * Filter and map raw FileEntry[] from Tauri into FileNode[] for the tree store.
 */
export function toFileNodes(entries: readonly FileEntry[]): FileNode[] {
  return entries
    .filter((entry) => !EXCLUDED_ENTRY_NAMES.has(entry.name.toLowerCase()))
    .map((entry) => ({
      name: entry.name,
      path: entry.path,
      isDirectory: entry.isDir,
      isFile: !entry.isDir,
      isSymlink: entry.isSymlink,
      isGitIgnored: entry.isGitIgnored,
    }));
}
```

Export from `lib/mappers/index.ts` barrel.

### 2. Add debounced refresh to `use-file-tree.ts`

Add at **module level** (not inside the hook — avoids closure/lifecycle issues).

**Imports to add:**

- `listDirectory` from `@/lib/api`
- `toFileNodes` from `@/lib/mappers`
- `isPathEqualOrWithin` from `@/lib/utils/path-utils` (already exists)
- `isMac` from `@/lib/utils` (existing platform detection helper)
- `type RefObject` from `react` (for `activeTimerRefs` Set type)

**Named constant:**

```typescript
/** Debounce delay for file-watcher-triggered directory refreshes (ms).
 *  Intentionally distinct from DELAYS.debounce (generic UI debounce) because
 *  this value is tuned to the dual-watcher pipeline: TauriProvider fires at ~0ms,
 *  file watcher fires after 75ms batch + throttle. 150ms coalesces both into
 *  a single listDirectory call while keeping perceived latency under 200ms. */
const FILE_TREE_REFRESH_DEBOUNCE_MS = 150;
```

**Timer key type** (module level):

```typescript
type RefreshTimers = Map<string, ReturnType<typeof setTimeout>>;
```

**Module-level functions** (accept timers map as parameter — instance-scoped, no shared state):

```typescript
function clearScheduledDirectoryRefreshes(timers: RefreshTimers): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}

/** Normalize timer key for case-insensitive filesystems (macOS/Windows).
 *  Only the lookup key is lowercased — the real dirPath is preserved
 *  for listDirectory and setTreeChildren calls. */
function timerKey(dirPath: string): string {
  // macOS is case-insensitive; Linux is case-sensitive.
  // Uses existing isMac() from @/lib/utils (navigator.userAgent-based).
  return isMac() ? dirPath.toLowerCase() : dirPath;
}

function scheduleDirectoryRefresh(timers: RefreshTimers, dirPath: string): void {
  const key = timerKey(dirPath);

  // Cancel any existing pending refresh for this path
  const existing = timers.get(key);
  if (existing !== undefined) clearTimeout(existing);

  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      void refreshDirectory(dirPath);
    }, FILE_TREE_REFRESH_DEBOUNCE_MS)
  );
}

async function refreshDirectory(dirPath: string): Promise<void> {
  try {
    // Capture rootPath BEFORE the async call for stale detection
    const rootAtStart = useFileStore.getState().rootPath;
    if (!rootAtStart) return;

    // Guard: only refresh paths within active workspace
    if (!isPathEqualOrWithin(dirPath, rootAtStart)) return;

    // Re-check visibility: folder may have been collapsed during debounce
    const storeBeforeFetch = useFileStore.getState();
    const isVisible = dirPath === rootAtStart || storeBeforeFetch.expandedFolders.has(dirPath);
    if (!isVisible) {
      // Folder is collapsed but may have cached children from before.
      // Invalidate the cache so the next expand triggers a fresh fetch
      // via toggleFolder() → requestChildren(). Without this, the stale
      // treeNodes[dirPath] entry persists and new files never appear.
      if (storeBeforeFetch.treeNodes[dirPath]) {
        useFileStore.setState((state) => {
          Reflect.deleteProperty(state.treeNodes, dirPath);
        });
      }
      return;
    }

    const entries = await listDirectory(dirPath, true);

    // Stale guard: rootPath may have changed during the await
    const storeAfterFetch = useFileStore.getState();
    if (storeAfterFetch.rootPath !== rootAtStart) return;
    if (!isPathEqualOrWithin(dirPath, storeAfterFetch.rootPath)) return;

    storeAfterFetch.setTreeChildren(dirPath, toFileNodes(entries));
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';
    logger.warn('Failed to refresh directory after file change', {
      path: dirPath,
      error: message,
    });
  }
}
```

**Instance-scoped timer ref** (inside useFileTree hook):

```typescript
// Each useFileTree instance owns its own timer map — prevents
// multiple consumers from canceling each other's pending refreshes.
const refreshTimersRef = useRef<RefreshTimers>(new Map());
```

**HMR cleanup** (module level, outside the hook — clears ALL instance refs via dispose registry):

```typescript
// Track active timer refs for HMR cleanup
const activeTimerRefs = new Set<RefObject<RefreshTimers>>();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const ref of activeTimerRefs) {
      if (ref.current) clearScheduledDirectoryRefreshes(ref.current);
    }
    activeTimerRefs.clear();
  });
}
```

**Lifecycle registration + unmount cleanup** (inside useFileTree hook):

```typescript
useEffect(() => {
  const ref = refreshTimersRef;
  activeTimerRefs.add(ref);
  return (): void => {
    if (ref.current) clearScheduledDirectoryRefreshes(ref.current);
    activeTimerRefs.delete(ref);
  };
}, []);
```

### 3. Trigger refresh from `file:changed` handler

In `use-file-tree.ts:319-326`, after calling `handleFileChanged`, add:

```typescript
if (message.change_type === 'created') {
  const parentPath = getParentPath(message.path); // from @/lib/utils/path-utils
  if (parentPath) scheduleDirectoryRefresh(refreshTimersRef.current, parentPath);
}
```

Reuse `getParentPath` from `path-utils.ts` (already exists, handles edge cases like root paths and Windows drive letters) instead of inline `lastIndexOf('/')`.

### 4. Remove cache-clear for `created` events in `file-store.ts`

Change `file-store.ts:608-613` from:

```typescript
} else if (changeType === 'created') {
  if (parentPath && state.treeNodes[parentPath]) {
    Reflect.deleteProperty(state.treeNodes, parentPath);
  }
}
```

To a no-op:

```typescript
} else if (changeType === 'created') {
  // Created events are handled by scheduleDirectoryRefresh() in use-file-tree.ts.
  // It directly re-fetches the parent directory via listDirectory and calls
  // setTreeChildren — more reliable than the indirect cache-clear + useEffect chain.
}
```

This prevents the existing useEffect from triggering a redundant second fetch.

### 5. Update `file-handlers.ts` to use shared mapper

Replace local `EXCLUDED_ENTRY_NAMES` (lines 15-22) and inline filter+map (lines 128-140) with:

```typescript
import { toFileNodes } from '@/lib/mappers';

// In handleFileTreeRequest:
const entries = await listDirectory(targetPath, true);
const children = toFileNodes(entries);
```

Remove the local `EXCLUDED_ENTRY_NAMES` constant and `FileEntry` type import (if no longer needed).

### 6. Update existing tests

**`file-store.test.ts`** — Update the assertion that expects `created` to clear parent cache:

```typescript
it('should not clear parent cache for created file (refresh handled by hook)', () => {
  const { setRootPath, setTreeChildren, handleFileChanged } = useFileStore.getState();
  setRootPath('/workspace');
  setTreeChildren('/workspace/src', [createFileNode('a.ts', '/workspace/src/a.ts')]);

  handleFileChanged('/workspace/src/b.ts', 'created');

  // Cache is NOT cleared — async refresh in use-file-tree.ts handles the update
  expect(useFileStore.getState().treeNodes['/workspace/src']).toBeDefined();
});
```

**Verify `deleted` regression** — Ensure existing delete tests still pass (they directly modify children, unaffected by this change).

**Update `file-handlers.test.ts` mock** — The existing `vi.mock('@/lib/mappers')` only exports `toConversationSummaries`. Adding `toFileNodes` import to `file-handlers.ts` requires the mock to also export `toFileNodes`:

```typescript
vi.mock('@/lib/mappers', () => ({
  toConversationSummaries: vi.fn(),
  toFileNodes: vi.fn((entries: FileEntry[]) =>
    entries
      .filter((e: FileEntry) => !['.git', '.ds_store'].includes(e.name.toLowerCase()))
      .map((entry: FileEntry) => ({
        name: entry.name,
        path: entry.path,
        isDirectory: entry.isDir,
        isFile: !entry.isDir,
        isSymlink: entry.isSymlink,
        isGitIgnored: entry.isGitIgnored,
      }))
  ),
}));
```

Existing exclusion/mapping tests must still pass with the new import path.

**Hook-level tests to add** (new test file for `scheduleDirectoryRefresh` / `refreshDirectory`):

1. **Coalesces burst events** — two `created` events for the same parent within 150ms produce only one `listDirectory` call
2. **Stale guard on root switch** — `refreshDirectory` ignores results when `rootPath` changed during the async `listDirectory` call
3. **Skips collapsed directory** — `refreshDirectory` returns early if the target directory is no longer expanded or the root
4. **Delete regression** — `file:changed` with `change_type: 'deleted'` still removes the child directly (no debounce involved)
5. **Collapsed folder cache invalidation** — `refreshDirectory` on a collapsed-but-cached folder deletes `treeNodes[dirPath]` so next expand triggers fresh fetch
6. **Case-variant path coalescing** — `scheduleDirectoryRefresh` with `/Workspace/Src` and `/workspace/src` on macOS produces one timer, not two
7. **Instance isolation** — two `useFileTree` mounts maintain independent timer maps; unmounting one doesn't cancel the other's pending refreshes

## Codebase precedent

The module-level debounce + lifecycle cleanup pattern is already established in this codebase:

- **`services/chat/chat-message-service.ts`** — module-level coalescing with lifecycle-safe state access (getState() snapshots before/after async)
- **`services/terminal/terminal-fit-debouncer.ts`** — debouncer with explicit cleanup/dispose semantics

## Why 150ms debounce

- TauriProvider posts `file:changed` immediately (~0ms)
- File watcher module posts after 75ms batch + throttle
- 150ms coalesces both into a single `listDirectory` call
- Still feels instant to the user (~200ms total with Tauri roundtrip)

## Edge cases handled

| Edge case                                       | How handled                                                                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Workspace switch during async fetch             | Stale guard: `rootPath` captured before `listDirectory`, verified after                                              |
| Parent deleted/renamed during debounce          | `listDirectory` will fail → caught by try/catch, logged as warning                                                   |
| Folder collapsed during debounce                | Re-check visibility before `listDirectory` call; invalidate cache so next expand re-fetches                          |
| Rapid burst of creates in same dir              | 150ms per-path debounce coalesces into one fetch                                                                     |
| Duplicate events (TauriProvider + file watcher) | Same debounce absorbs second event                                                                                   |
| `rootPath` not yet initialized (startup race)   | `if (!rootAtStart) return` guard                                                                                     |
| HMR during development                          | `import.meta.hot.dispose` clears all timers                                                                          |
| Component unmount                               | useEffect cleanup clears all timers                                                                                  |
| Case-variant paths on macOS/Windows             | `timerKey()` uses `isMac()` from `@/lib/utils` to normalize to lowercase on macOS; real path preserved for API calls |
| Multiple `useFileTree` consumers                | `refreshTimersRef` scoped per hook instance via `useRef`; `activeTimerRefs` Set tracks all instances for HMR cleanup |

### 7. Add debug counters for refresh lifecycle

Add a module-level counter object in `use-file-tree.ts` to track refresh activity. Logged at `debug` level (dev-only, zero cost in production).

```typescript
const refreshStats = {
  scheduled: 0,
  coalesced: 0,
  executed: 0,
  skippedStale: 0,
  skippedInvisible: 0,
};

// In scheduleDirectoryRefresh:
//   - If replacing an existing timer for the same key: refreshStats.coalesced++
//   - Otherwise: refreshStats.scheduled++

// In refreshDirectory:
//   - On successful setTreeChildren: refreshStats.executed++
//   - On stale rootPath guard: refreshStats.skippedStale++
//   - On invisible/collapsed guard: refreshStats.skippedInvisible++

// Log summary periodically or on each execution:
logger.debug('Directory refresh', { path: dirPath, stats: { ...refreshStats } });
```

### 8. Consolidate dual watcher pipeline

Currently TWO separate `onFileChange` listeners both call `listen('file:change', ...)` for the same Rust event:

| Source        | File                                        | Behavior                                                                                                                                 |
| ------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| TauriProvider | `providers/tauri-provider.tsx:190`          | Immediate — basic `shouldIgnorePath` (case-sensitive), no workspace check, posts `file:changed` instantly                                |
| File watcher  | `hooks/agent/use-tauri-file-watcher.ts:373` | Batched — case-aware `shouldIgnorePath` + `isInWorkspace` check, 75ms batch → VS Code coalescing → 200ms throttle → posts `file:changed` |

Every FS event produces **two** `file:changed` window messages. Our 150ms debounce absorbs both, but the duplication wastes CPU on redundant filtering/coalescing/posting.

**Fix**: Remove the file watcher setup from TauriProvider and rely solely on `use-tauri-file-watcher.ts`. The batched path is strictly superior:

- Case-aware filtering (macOS/Windows safe)
- Workspace boundary check (prevents cross-workspace events)
- VS Code coalescing rules (ADDED+DELETED cancellation, atomic save detection)
- Throttle protection (prevents event floods from overwhelming the UI)

**Changes:**

In `providers/tauri-provider.tsx`:

- Remove `setupFileWatcher()` function (lines 180-216)
- Remove its call from `setupListeners()`
- Remove local `IGNORED_PATH_PATTERNS` and `shouldIgnorePath` (lines 47-85) — duplicated in `use-tauri-file-watcher.ts` with better case handling
- Remove `onFileChange` and `watchPath` imports

No other files change — `initFileWatcher()` in `use-tauri-file-watcher.ts` is already called from `file-handlers.ts:101` when the workspace loads and from `useWorktreeFileTreeSync` on workspace switch.

**Impact on debounce timing**: With TauriProvider removed, only the batched events arrive (~75ms + 200ms after FS event). The 150ms `FILE_TREE_REFRESH_DEBOUNCE_MS` is now slightly generous but still correct — it coalesces the throttled worker's per-event posts into one `listDirectory` call. No timing change needed.

### 9. Use existing platform detection helper

Replace inline `navigator.platform` fallback in `timerKey()` with the existing `isMac()` from `@/lib/utils`:

```typescript
import { isMac } from '@/lib/utils';

function timerKey(dirPath: string): string {
  // macOS and Windows are case-insensitive; Linux is case-sensitive.
  // isMac() uses navigator.userAgent — always available in webview context.
  // Treat non-Mac as case-sensitive (Linux). Windows is not a target platform
  // for Tauri/Orbit, but if added, a dedicated isWindows() check can be introduced.
  return isMac() ? dirPath.toLowerCase() : dirPath;
}
```

This also removes the `globalThis.process?.platform` dependency, addressing the audit concern about unavailable `process` in webview contexts. Add `isMac` to the imports list for `use-file-tree.ts`.

## Verification

1. `bunx tauri dev` — open a folder
2. In Finder, create a file in that folder → should appear in explorer within ~200ms
3. Create a file in an expanded subfolder → subfolder should refresh
4. Create 5 files rapidly → only 1 `listDirectory` call (check debug logs)
5. Delete a file in Finder → should still disappear immediately (regression check)
6. Switch workspace while files are being created → no stale writes to new tree
7. Collapse a subfolder, create a file in it via Finder, re-expand → new file appears (cache invalidated)
8. After watcher consolidation, verify only ONE `file:changed` message per FS event (not two) in DevTools console
9. `bun run check` — typecheck + lint + tests pass
