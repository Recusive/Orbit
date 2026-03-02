# Plan: Folder Git Status Dots (VS Code-style)

## Context

The file explorer shows git status indicators (colored text + letter badges) on individual files, but **folders have no visual indicator** when they contain changed files. When a folder is collapsed, there's zero signal that anything inside has been modified/added/untracked. VS Code solves this by propagating the highest-priority child status up to every ancestor folder, showing a colored dot and tinting the folder name — regardless of expanded/collapsed state.

## Approach

Three files to modify, plus tests. No backend changes needed — all git status data already exists in the frontend store.

---

### Step 1: Add `selectDirectoryStatus` selector to git-store.ts

**File:** `apps/agent/src/stores/git/git-store.ts`

Build a **pre-computed directory status map** once per git status change (not per row). This avoids O(N) scans per visible directory.

**Add:**

#### `STATUS_PRIORITY`

Priority ordering as a `Record<FileStatus, number>`:

```ts
const STATUS_PRIORITY: Record<FileStatus, number> = {
  conflicted: 8,
  modified: 7,
  added: 6,
  deleted: 5,
  renamed: 4,
  typechange: 3,
  copied: 2,
  untracked: 1,
};
```

#### `parentDir(relativePath)`

Walk up one directory level. Must handle repo-root files correctly:

```ts
/**
 * Walk up one directory level.
 * "src/components/file.ts" → "src/components"
 * "src/file.ts" → "src"
 * "file.ts" → "" (repo root)
 * "" → null (stop iteration)
 */
function parentDir(relativePath: string): string | null {
  if (relativePath === '') return null;
  const lastSlash = relativePath.lastIndexOf('/');
  return lastSlash === -1 ? '' : relativePath.slice(0, lastSlash);
}
```

**Key detail:** When a file is at the repo root (e.g., `"README.md"` — no `/`), `lastIndexOf('/')` returns `-1`. Its parent must be `''` (repo root), not `null`. When we reach `''` itself, return `null` to stop the walk.

#### `buildDirectoryStatusMap(status)`

Walk every changed file's ancestors, set highest-priority status per directory. Returns `Map<string, FileStatus>` keyed by relative dir path.

**Important:** A file can appear in multiple status categories (e.g., both `staged` and `modified` for partially staged changes). Always compare against the existing map entry before overwriting — only upgrade, never downgrade priority:

```ts
function buildDirectoryStatusMap(status: GitStatus): Map<string, FileStatus> {
  const dirMap = new Map<string, FileStatus>();

  const allEntries = [
    ...status.staged,
    ...status.modified,
    ...status.untracked,
    ...status.conflicted,
  ];

  for (const entry of allEntries) {
    let dir = parentDir(entry.path);
    while (dir !== null) {
      const existing = dirMap.get(dir);
      // Only overwrite if new status has HIGHER priority
      if (existing === undefined || STATUS_PRIORITY[entry.status] > STATUS_PRIORITY[existing]) {
        dirMap.set(dir, entry.status);
      }
      dir = parentDir(dir);
    }
  }

  return dirMap;
}
```

#### Module-level cache

`cachedStatus` / `cachedDirMap` — map only rebuilt when `state.status` identity changes (already guarded by `listSignature` in `setStatus`).

> **Note:** The cache is keyed on `state.status` identity only, not `repoPath`. This is correct because the map is keyed by git-relative paths (from `StatusEntry.path`), which don't depend on the absolute `repoPath`. If `repoPath` changes, `state.status` also changes (new repo = new status), which invalidates the cache.

#### `selectDirectoryStatus(absolutePath)`

Factory selector that converts absolute path to relative using `state.repoPath`, then does O(1) `Map.get` lookup. Must handle the root path case where `absolutePath === repoPath`:

```ts
export const selectDirectoryStatus =
  (absolutePath: string) =>
  (state: GitStore): FileStatus | null => {
    if (!state.status || !state.repoPath) return null;

    // Rebuild map only when status identity changes
    if (state.status !== cachedStatus) {
      cachedDirMap = buildDirectoryStatusMap(state.status);
      cachedStatus = state.status;
    }

    // Convert absolute path to repo-relative path
    if (!absolutePath.startsWith(state.repoPath)) return null;
    const relativePath =
      absolutePath === state.repoPath ? '' : absolutePath.slice(state.repoPath.length + 1);

    return cachedDirMap.get(relativePath) ?? null;
  };
```

**Why pre-computed map:** The naive approach (per-row O(N) scan) would run 10-15 scans per render for visible directories. The map approach does one O(N×D) build pass (F files × D depth), then O(1) per row. The first selector call after a status change triggers the rebuild; all subsequent calls reuse the cached map.

---

### Step 2: Export from barrel

**File:** `apps/agent/src/stores/git/index.ts`

Add `selectDirectoryStatus` to the export list.

---

### Step 3: Update FileTreeRow in file-explorer.tsx

**File:** `apps/agent/src/components/files/file-explorer.tsx`

**Changes:**

1. Import `selectDirectoryStatus`

2. Add a stable no-op selector outside the component: `const selectNull = (): null => null;`

3. In `FileTreeRow`, make **both** Zustand subscriptions conditional to avoid wasted work:

   ```ts
   // Skip selectFileStatus O(N) scan for directories (always returns null since
   // directories don't appear in git status entries)
   const gitStatus = useGitStore(node.isDirectory ? selectNull : selectFileStatus(path));
   const dirGitStatus = useGitStore(node.isDirectory ? selectDirectoryStatus(path) : selectNull);
   const effectiveGitStatus = node.isDirectory ? dirGitStatus : gitStatus;
   ```

   > **Why conditional `selectFileStatus`:** The existing `selectFileStatus(path)` does an O(N) scan of all status entries per call. For directory rows, this always returns `null` because git status only contains files. Making it conditional eliminates N × (visible directories) comparisons per status poll.

4. **Folder name tinting** (line ~698): Apply `GIT_STATUS_STYLES[effectiveGitStatus].fileColor` to the name `<span>` for both files and directories

5. **Dot indicator** (line ~708): Replace the current `!node.isDirectory` guard. For directories, show a small `·` (middle dot) character with the status color. For files, keep the existing `GitStatusBadge`:

   ```tsx
   {
     effectiveGitStatus && !isRenaming ? (
       node.isDirectory ? (
         <span
           className={cn(
             'text-lg leading-none shrink-0 mr-2',
             GIT_STATUS_STYLES[effectiveGitStatus].color
           )}
           title={`Contains ${GIT_STATUS_STYLES[effectiveGitStatus].title.toLowerCase()} files`}
         >
           {'·'}
         </span>
       ) : (
         <GitStatusBadge status={effectiveGitStatus} />
       )
     ) : null;
   }
   ```

The dot is visible whether the folder is expanded or collapsed, matching VS Code behavior.

---

### Step 4: Add tests

**File:** `apps/agent/src/__tests__/unit/stores/git/git-store.test.ts`

Add a `describe('selectDirectoryStatus')` block with tests for:

- Returns null when no status / no repoPath
- Returns correct status for a directory with one changed child file
- Priority resolution: directory with both `modified` and `untracked` files returns `modified`
- Priority with multi-category files: file in both `staged` (added) and `modified` arrays → directory gets higher-priority status
- Ancestor propagation: deeply nested file propagates status to all parent directories
- Repo root: `''` entry in map receives highest-priority status from all changed files
- Path conversion: absolute path with repoPath prefix is correctly relativized
- Root path edge case: `absolutePath === repoPath` returns the root entry
- Non-repo path: directory not under repoPath returns null
- Cache rebuild: changing status updates the result; unchanged status reuses the map

---

## Critical Files

| File                                                         | Action                                                                                        |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `apps/agent/src/stores/git/git-store.ts`                     | Add `STATUS_PRIORITY`, `parentDir`, `buildDirectoryStatusMap`, cache, `selectDirectoryStatus` |
| `apps/agent/src/stores/git/index.ts`                         | Export `selectDirectoryStatus`                                                                |
| `apps/agent/src/components/files/file-explorer.tsx`          | Conditional subscriptions, directory dot + name tint                                          |
| `apps/agent/src/__tests__/unit/stores/git/git-store.test.ts` | Add `selectDirectoryStatus` test block                                                        |

## Verification

1. `bun run typecheck` — no type errors
2. `bun run lint` — no lint warnings
3. `bun run test` — all tests pass including new ones
4. Manual: `bunx tauri dev` → open a folder with git changes → verify:
   - Collapsed folders with changes show colored dot + tinted name
   - Expanded folders still show the dot (not just when collapsed)
   - Deeply nested changes propagate to all ancestor folders
   - Dot color matches highest-priority child status
   - Files still show letter badges (A, M, U, etc.) as before
   - Repo-root files (e.g., `README.md`) propagate status to root directory
