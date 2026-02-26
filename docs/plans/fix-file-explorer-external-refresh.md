# Fix: File explorer doesn't refresh when files are added externally

## Context

When a user opens a folder in Orbit, then adds a file via macOS Finder, the file explorer doesn't update to show the new file. The file watcher pipeline (Rust `notify` crate → Tauri events → frontend handlers) detects the change correctly, but the refresh mechanism for `created` events is unreliable.

**Root cause**: `handleFileChanged('created')` in `file-store.ts:608-613` only clears the parent directory's cache via `Reflect.deleteProperty(state.treeNodes, parentPath)`. It then relies on a React useEffect in `use-file-tree.ts:498-530` to detect the missing key through a string-serialized selector (`Object.keys(treeNodes).join('\0')`) and trigger a re-fetch. This indirect chain is fragile. In contrast, the `deleted` handler works instantly because it directly modifies the children array.

**Fix**: Replace the indirect cache-clear mechanism with a direct debounced re-fetch of the parent directory.

## Files to modify

| File                                                   | Change                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `apps/agent/src/lib/utils/file-constants.ts`           | **NEW** — shared `EXCLUDED_ENTRY_NAMES` + `toFileNodes()`                                  |
| `apps/agent/src/lib/utils/index.ts`                    | Export from new file                                                                       |
| `apps/agent/src/hooks/file/use-file-tree.ts`           | Add debounced `scheduleDirectoryRefresh` at module level; call from `file:changed` handler |
| `apps/agent/src/stores/file/file-store.ts`             | Remove `Reflect.deleteProperty` for `created` events (now a no-op)                         |
| `apps/agent/src/hooks/agent/handlers/file-handlers.ts` | Import shared `EXCLUDED_ENTRY_NAMES` + `toFileNodes` instead of local definitions          |

## Implementation

### 1. Create shared constants — `lib/utils/file-constants.ts`

Extract `EXCLUDED_ENTRY_NAMES` (currently local to `file-handlers.ts:15-22`) and the `FileEntry → FileNode` mapping (currently inline at `file-handlers.ts:128-140`) into a shared utility.

```typescript
// EXCLUDED_ENTRY_NAMES: ReadonlySet<string> — 7 system entries (.git, .ds_store, etc.)
// toFileNodes(entries: FileEntry[]): FileNode[] — filter + map
```

Export from `lib/utils/index.ts` barrel.

### 2. Add debounced refresh to `use-file-tree.ts`

Add at **module level** (not inside the hook — avoids closure/lifecycle issues):

- **`scheduleDirectoryRefresh(dirPath: string)`** — debounces per-path (150ms). Cancels previous timer for same path. Checks visibility (root or expanded) before scheduling.
- **`refreshDirectory(dirPath: string)`** — async. Calls `listDirectory(dirPath, true)` via Tauri invoke, applies `toFileNodes()`, writes to store via `useFileStore.getState().setTreeChildren(dirPath, children)`.

Import `listDirectory` from `@/lib/api` and `toFileNodes` from `@/lib/utils`.

### 3. Trigger refresh from `file:changed` handler

In `use-file-tree.ts:319-326`, after calling `handleFileChanged`, add:

```typescript
if (message.change_type === 'created') {
  const lastSlash = message.path.lastIndexOf('/');
  const parentPath =
    lastSlash > 0 ? message.path.substring(0, lastSlash) : useFileStore.getState().rootPath;
  if (parentPath) scheduleDirectoryRefresh(parentPath);
}
```

`scheduleDirectoryRefresh` is a module-level function — accessible from the `useCallback` without closure issues.

### 4. Remove cache-clear for `created` events in `file-store.ts`

Change `file-store.ts:608-613` from:

```typescript
} else if (changeType === 'created') {
  if (parentPath && state.treeNodes[parentPath]) {
    Reflect.deleteProperty(state.treeNodes, parentPath);
  }
}
```

To a no-op with comment explaining the refresh is handled by `scheduleDirectoryRefresh` in `use-file-tree.ts`. This prevents the existing useEffect from triggering a redundant second fetch.

### 5. Update `file-handlers.ts` to use shared constants

Replace local `EXCLUDED_ENTRY_NAMES` (lines 15-22) and inline filter+map (lines 128-140) with imports from `@/lib/utils/file-constants`.

## Why 150ms debounce

- TauriProvider posts `file:changed` immediately (~0ms)
- File watcher module posts after 75ms batch + throttle
- 150ms coalesces both into a single `listDirectory` call
- Still feels instant to the user (~200ms total with Tauri roundtrip)

## Verification

1. `bunx tauri dev` — open a folder
2. In Finder, create a file in that folder → should appear in explorer within ~200ms
3. Create a file in an expanded subfolder → subfolder should refresh
4. Create 5 files rapidly → only 1 `listDirectory` call (check debug logs)
5. Delete a file in Finder → should still disappear immediately (regression check)
6. `bun run check` — typecheck + lint + tests pass
