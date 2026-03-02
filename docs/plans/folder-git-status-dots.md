# Plan: Folder Git Status Dots (VS Code-style)

## Context

The file explorer shows git status indicators (colored text + letter badges) on individual files, but **folders have no visual indicator** when they contain changed files. When a folder is collapsed, there's zero signal that anything inside has been modified/added/untracked. VS Code solves this by propagating the highest-priority child status up to every ancestor folder, showing a colored dot and tinting the folder name — regardless of expanded/collapsed state.

## Approach

Four files to modify, plus tests. No backend changes needed — all git status data already exists in the frontend store. The key design choice: build both a file-status map and a directory-status map in a single pass, sharing priority resolution via `pickHigherStatus`. This unifies precedence semantics (no divergence between file badges and folder dots) and upgrades `selectFileStatus` from O(N) scan to O(1) lookup.

---

### Step 1: Build unified status maps in git-store.ts

**File:** `apps/agent/src/stores/git/git-store.ts`

Build **pre-computed file and directory status maps** once per git status change. Both maps share the same priority-based resolution, eliminating the precedence divergence between file badges and folder dots. Also replaces the existing O(N)-per-row `selectFileStatus` scan with O(1) map lookups.

**Add:**

#### `STATUS_PRIORITY` + `pickHigherStatus`

Shared priority ordering and comparator used by BOTH file and directory resolution:

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

/** Return the higher-priority status, or `next` if `current` is null. */
function pickHigherStatus(current: FileStatus | null, next: FileStatus): FileStatus {
  if (current === null) return next;
  return STATUS_PRIORITY[next] > STATUS_PRIORITY[current] ? next : current;
}
```

#### `normalizeEntryPath(entryPath, repoPath)`

Normalize git entry paths so map keys match `toRelativePath` output on all platforms:

```ts
/**
 * Normalize a git-relative entry path to match `toRelativePath` output.
 * - Strips leading "./" (some git configs emit "./src/file.ts" instead of "src/file.ts")
 * - Converts backslashes to forward slashes (Windows git clients)
 * - Lowercases on Windows (matching `normalizePathForComparison` behavior)
 */
function normalizeEntryPath(entryPath: string, repoPath: string): string {
  let normalized = entryPath.replace(/\\/g, '/');
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }
  // toRelativePath lowercases the entire path on Windows (drive prefix detected)
  if (/^[A-Za-z]:[\\/]/.test(repoPath)) {
    return normalized.toLowerCase();
  }
  return normalized;
}
```

> **Why this is needed:** `toRelativePath` normalizes the lookup path via `normalizePathForComparison`, which lowercases the entire path when a Windows drive prefix is detected. Git entry paths are relative (no drive prefix), so they skip that lowercasing. Without `normalizeEntryPath`, map keys on Windows could be `Src/Foo.ts` while the lookup produces `src/foo.ts` → miss.

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

#### `buildStatusMaps(status, repoPath)`

Build BOTH maps in a single pass over all status entries. The file map and directory map share the same `pickHigherStatus` comparator, ensuring a file and its parent folder always agree on priority semantics:

```ts
interface StatusMaps {
  fileMap: Map<string, FileStatus>;
  dirMap: Map<string, FileStatus>;
}

function buildStatusMaps(status: GitStatus, repoPath: string): StatusMaps {
  const fileMap = new Map<string, FileStatus>();
  const dirMap = new Map<string, FileStatus>();

  const allEntries = [
    ...status.staged,
    ...status.modified,
    ...status.untracked,
    ...status.conflicted,
  ];

  for (const entry of allEntries) {
    const key = normalizeEntryPath(entry.path, repoPath);

    // File map: priority-resolve for files appearing in multiple categories
    const existingFile = fileMap.get(key);
    fileMap.set(key, pickHigherStatus(existingFile ?? null, entry.status));

    // Directory map: walk ancestors, early-break when priority can't increase
    let dir = parentDir(key);
    while (dir !== null) {
      const existingDir = dirMap.get(dir);
      if (
        existingDir !== undefined &&
        STATUS_PRIORITY[existingDir] >= STATUS_PRIORITY[entry.status]
      ) {
        // This directory already has equal or higher priority.
        // All its ancestors do too (set by whatever entry gave it that priority).
        break;
      }
      dirMap.set(dir, pickHigherStatus(existingDir ?? null, entry.status));
      dir = parentDir(dir);
    }
  }

  return { fileMap, dirMap };
}
```

**Early-break optimization:** When the walk reaches a directory that already has priority ≥ the current entry's status, it `break`s. All ancestors of that directory are guaranteed to have ≥ that priority too (from whichever prior entry set it). This caps worst-case work for repos with many low-priority changes (untracked) after a high-priority change (conflicted) has already propagated to root.

#### Module-level cache

```ts
let cachedStatus: GitStatus | null = null;
let cachedRepoPath: string | null = null;
let cachedMaps: StatusMaps | null = null;

function getStatusMaps(status: GitStatus, repoPath: string): StatusMaps {
  if (cachedMaps === null || status !== cachedStatus || repoPath !== cachedRepoPath) {
    cachedMaps = buildStatusMaps(status, repoPath);
    cachedStatus = status;
    cachedRepoPath = repoPath;
  }
  // cachedMaps is guaranteed non-null: either reused from cache or just rebuilt above
  return cachedMaps;
}
```

> **Note:** Cache is now keyed on BOTH `state.status` identity AND `state.repoPath`. This handles workspace switches where `repoPath` changes — the cache invalidates and map keys are re-normalized for the new repo's platform conventions.

#### Refactored `selectFileStatus(absolutePath)`

Replace the existing O(N) first-match scan (lines 247-266) with O(1) map lookup + `toRelativePath`. This also unifies precedence: a file in both `staged` (added) and `modified` now returns `modified` (priority 7) instead of `added` (first-match).

```ts
import { toRelativePath } from '@/lib/utils/path-utils';

export const selectFileStatus =
  (absolutePath: string) =>
  (state: GitStore): FileStatus | null => {
    if (!state.status || !state.repoPath) return null;

    const maps = getStatusMaps(state.status, state.repoPath);
    const relativePath = toRelativePath(absolutePath, state.repoPath);
    if (relativePath === null) return null;

    return maps.fileMap.get(relativePath) ?? null;
  };
```

> **Breaking change from old behavior:** The suffix-match fallback (`path.endsWith(entry.path)`) is removed. All callers now pass absolute paths, and `toRelativePath` handles the conversion. The one consumer (`file-explorer.tsx:448`) already passes absolute paths. Existing tests that rely on suffix matching must be updated to set `repoPath` and pass absolute paths.

#### `selectDirectoryStatus(absolutePath)`

Same pattern as refactored `selectFileStatus`, using `dirMap`:

```ts
export const selectDirectoryStatus =
  (absolutePath: string) =>
  (state: GitStore): FileStatus | null => {
    if (!state.status || !state.repoPath) return null;

    const maps = getStatusMaps(state.status, state.repoPath);
    const relativePath = toRelativePath(absolutePath, state.repoPath);
    if (relativePath === null) return null;

    return maps.dirMap.get(relativePath) ?? null;
  };
```

**Why `toRelativePath`:** The existing utility in `path-utils.ts` (line 76) handles trailing slash normalization, sibling path rejection (`/repo` vs `/repo-copy`), Windows drive letter case normalization, and the root case (`path === rootPath` → `''`).

**Why pre-computed maps:** The old `selectFileStatus` did O(N) per file row per status change. The new approach does one O(N×D) build pass, then O(1) per row for both files and directories. The first selector call after a status change triggers the rebuild; all subsequent calls reuse the cache.

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

   > **Why no state parameter:** `GitStore` is not exported from `git-store.ts` (line 59). A zero-parameter function is valid here because TypeScript allows functions with fewer parameters to satisfy function types expecting more — Zustand's `useStore(selector: (state: T) => U)` accepts `() => null`. This avoids coupling to an unexported internal type.

3. In `FileTreeRow`, make **both** Zustand subscriptions conditional — one for files, one for directories:

   ```ts
   const gitStatus = useGitStore(node.isDirectory ? selectNull : selectFileStatus(path));
   const dirGitStatus = useGitStore(node.isDirectory ? selectDirectoryStatus(path) : selectNull);
   const effectiveGitStatus = node.isDirectory ? dirGitStatus : gitStatus;
   ```

   > **Why conditional:** Directories don't appear in git status entries (file map always returns null for them), and files don't need directory propagation. Splitting the subscription avoids wasted map lookups. Both selectors are now O(1) (cached map lookup via `toRelativePath`).

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

### Step 4: Add and update tests

**File:** `apps/agent/src/__tests__/unit/stores/git/git-store.test.ts`

#### Update existing `selectFileStatus` tests

The refactored `selectFileStatus` now requires `repoPath` to be set and takes absolute paths. Update existing tests:

- Set `repoPath` via `setRepoPath('/repo')` in each test
- Change relative path tests to absolute: `selectFileStatus('/repo/src/file.ts')` instead of `selectFileStatus('src/file.ts')`
- Remove suffix-match test (behavior removed — `toRelativePath` handles the conversion properly)
- Add: multi-category priority test — file in both `staged` (added) and `modified` returns `modified` (priority 7 > 6)

#### Add `describe('selectDirectoryStatus')` block

- Returns null when no status / no repoPath
- Returns correct status for a directory with one changed child file
- Priority resolution: directory with both `modified` and `untracked` children returns `modified`
- Priority with multi-category files: file in both `staged` (added) and `modified` arrays → directory gets higher-priority status
- Ancestor propagation: deeply nested file propagates status to all parent directories
- Repo root: `absolutePath === repoPath` returns highest-priority status from all changed files
- Non-repo path: directory not under repoPath returns null
- Sibling path: `/repo-copy/src` is not treated as inside `/repo`
- Cache rebuild: changing status updates the result; unchanged status reuses the map
- Early-break: directory already at max priority (conflicted) stops ancestor walk for lower-priority entries

---

## Critical Files

| File                                                         | Action                                                                                               |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `apps/agent/src/stores/git/git-store.ts`                     | Refactor `selectFileStatus`, add `selectDirectoryStatus`, `buildStatusMaps`, shared priority helpers |
| `apps/agent/src/stores/git/index.ts`                         | Export `selectDirectoryStatus`                                                                       |
| `apps/agent/src/lib/utils/path-utils.ts`                     | No changes (consumed as-is via `toRelativePath`)                                                     |
| `apps/agent/src/components/files/file-explorer.tsx`          | Conditional subscriptions, directory dot + name tint                                                 |
| `apps/agent/src/__tests__/unit/stores/git/git-store.test.ts` | Update `selectFileStatus` tests + add `selectDirectoryStatus` test block                             |

---

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
   - Partially staged file (staged A + working tree M): file badge shows M, parent dot shows M (unified)
   - Repo-root files (e.g., `README.md`) propagate status to root directory
   - Sibling paths outside repo don't show false positives
   - Inline-renaming a folder hides the dot (same as file badges — `isRenaming` guard)
   - No visible jank during git status polling (map rebuild is bounded by early-break)
