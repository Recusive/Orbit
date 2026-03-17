# Fix: DiffFileCard expansion for untracked files

## Context

On the Source Control "Changes" tab, ~95% of file cards don't expand when clicked. These are primarily untracked files (2855 in this case, from a vendored `codex-rs/` directory). Staging the files first and viewing them under "Staged" works fine — the bug is isolated to the unstaged/Changes tab.

**Root cause**: Two bugs work together:

1. **Rust backend**: `get_diff()` calls `include_untracked(true).show_untracked_content(true)` but omits `recurse_untracked_dirs(true)`. Without recursion, libgit2 reports untracked directories as single entries (e.g., `codex-rs/`) instead of individual files (`codex-rs/core/src/remote.rs`). Meanwhile, `status()` DOES use `recurse_untracked_dirs(true)`, creating a **path mismatch** between the diff map and the file list.

2. **Frontend guard**: `DiffFileCard.canExpand` is `false` when `diff === undefined`, preventing expansion. The component already has on-demand diff loading (`fetchAndPreload`) that can compute diffs from git refs + file reads, but it never runs because of the `canExpand` gate AND a `!diff` early return inside `fetchAndPreload` itself.

## Changes

### 1. Fix Rust backend: add `recurse_untracked_dirs(true)` and `include_untracked` parameter

**File**: `crates/common/git/src/lib.rs`

**a) Add `include_untracked` parameter to `get_diff()` (line ~501)**:

```rust
// Before:
pub fn get_diff(path: &Path) -> Result<Vec<FileDiff>> {
    let repo = open(path)?;
    let mut opts = DiffOptions::new();
    let _self = opts.include_untracked(true).show_untracked_content(true);
    let diff = repo
        .diff_index_to_workdir(None, Some(&mut opts))
        .map_err(|e| Error::Git(format!("Failed to get diff: {e}")))?;
    parse_diff(&diff)
}

// After:
pub fn get_diff(path: &Path, include_untracked: bool) -> Result<Vec<FileDiff>> {
    let repo = open(path)?;
    let mut opts = DiffOptions::new();
    if include_untracked {
        let _self = opts
            .include_untracked(true)
            .show_untracked_content(true)
            .recurse_untracked_dirs(true);
    }
    let diff = repo
        .diff_index_to_workdir(None, Some(&mut opts))
        .map_err(|e| Error::Git(format!("Failed to get diff: {e}")))?;
    parse_diff(&diff)
}
```

When `include_untracked` is `true`, all three flags are set consistently (matching `status()`). When `false`, only tracked modified/conflicted files appear in the diff — untracked files are deferred to per-card on-demand loading.

**b) Update `GitManager::get_diff_structured` to forward parameter (line ~1838)**:

```rust
// Before:
pub fn get_diff_structured(&self, repo_path: &str) -> Result<Vec<FileDiff>> {
    get_diff(Path::new(repo_path))
}

// After:
pub fn get_diff_structured(&self, repo_path: &str, include_untracked: bool) -> Result<Vec<FileDiff>> {
    get_diff(Path::new(repo_path), include_untracked)
}
```

**c) Update `GitManager::diff` (text diff) to always include untracked (line ~1777)**:

```rust
// The text diff API is used by the agent, not polling — always include untracked:
pub fn diff(&self, repo_path: &str, file: Option<&str>) -> Result<String> {
    let diffs = if let Some(f) = file {
        vec![get_file_diff(Path::new(repo_path), Path::new(f))?]
    } else {
        get_diff(Path::new(repo_path), true)?  // always true for agent diff
    };
    Ok(format_diffs_as_string(&diffs))
}
```

**d) Fix `branch_diff_stats()` (line ~629)** — same class of bug:

```rust
// Before:
let _self = opts.include_untracked(true).show_untracked_content(true);

// After:
let _self = opts
    .include_untracked(true)
    .show_untracked_content(true)
    .recurse_untracked_dirs(true);
```

Without this, `branch_diff_stats()` undercounts files when untracked directories contain nested files. Keeps all git functions consistent with `status()`.

### 2. Update Tauri command to accept `include_untracked`

**File**: `src-tauri/src/commands/common/git.rs`

```rust
// Before:
#[tauri::command]
pub async fn git_diff_structured(repo_path: String) -> Result<Vec<FileDiff>> {
    spawn_git(move || {
        let manager = GitManager::new();
        manager
            .get_diff_structured(&repo_path)
            .capture("git_diff_structured")
    })
    .await
}

// After:
#[tauri::command]
pub async fn git_diff_structured(
    repo_path: String,
    include_untracked: Option<bool>,
) -> Result<Vec<FileDiff>> {
    spawn_git(move || {
        let manager = GitManager::new();
        manager
            .get_diff_structured(&repo_path, include_untracked.unwrap_or(true))
            .capture("git_diff_structured")
    })
    .await
}
```

Defaults to `true` for backwards compatibility — existing callers (agent diff) get the same behavior.

### 3. Update frontend API and add polling guard

**File**: `apps/agent/src/lib/api/git.ts`

```typescript
// Before:
export async function gitDiffStructured(repoPath: string): Promise<FileDiff[]> {
  return invoke<FileDiff[]>('git_diff_structured', { repoPath });
}

// After:
export async function gitDiffStructured(
  repoPath: string,
  includeUntracked = true
): Promise<FileDiff[]> {
  return invoke<FileDiff[]>('git_diff_structured', { repoPath, includeUntracked });
}
```

**File**: `apps/agent/src/components/git/source-control/hooks/use-source-control.ts`

```typescript
// In fetchDiffs(), use the parameter to skip untracked in large repos:
const MAX_EAGER_UNTRACKED = 300;

const untrackedCount = useGitStore.getState().status?.untracked.length ?? 0;
const includeUntracked = untrackedCount <= MAX_EAGER_UNTRACKED;

const run = Promise.all([gitStagedDiff(repo), gitDiffStructured(repo, includeUntracked)]).then(
  ([staged, unstaged]) => {
    setStagedDiffs(staged);
    setUnstagedDiffs(unstaged);
  }
);
// ... existing catch/finally
```

When untracked count exceeds 300, bulk diff still returns diffs for **modified and conflicted files** — only untracked content is deferred to per-card on-demand loading. This preserves instant DiffStat badges for tracked changes while avoiding large IPC payloads from vendored directories.

### 4. Fix frontend: allow expansion when diff is missing

**File**: `apps/agent/src/components/git/source-control/components/DiffFileCard.tsx`

Three changes:

**a) Relax `canExpand` guard (line ~107)**:

```typescript
// Before:
const canExpand = hasDiff || isBinary;

// After — also expandable when diff is simply missing (will load on demand):
const canExpand = hasDiff || isBinary || diff === undefined;
```

Allows cards to expand for ANY file where the bulk diff wasn't available, including deleted files. Deleted files produce a valid removal diff (old content from HEAD/INDEX, empty new content via `readFile` catching to `''`).

**b) Remove `!diff` early return in `fetchAndPreload` (line ~148)**:

```typescript
// Before:
if (!diff || diff.isBinary) return Promise.resolve(null);

// After — only bail for known binary files:
if (diff?.isBinary === true) return Promise.resolve(null);
```

The rest of `fetchAndPreload` already handles the missing-diff case: it fetches old content from git ref (returns `''` for untracked files via `.catch(() => '')`) and new content from disk via `readFile`. Pierre's `parseDiffFromFile` then computes a proper diff showing all content as additions.

**c) Use `oldPath` for rename fallback in `fetchAndPreload` (line ~158)**:

```typescript
// Before:
const promise = Promise.all([
  gitFileAtRef(repoPath, file.path, oldRef).catch(() => ''),
  // ...
]);

// After — resolve old-side path from oldPath for renames:
const oldPath = file.oldPath ?? file.path;

const promise = Promise.all([
  gitFileAtRef(repoPath, oldPath, oldRef).catch(() => ''),
  // ...
]);
```

Without this, renamed files missing from the bulk diff would show a full-add diff instead of a proper rename diff. The old content must come from the original path.

## Design notes

The fix has three complementary layers:

- **Rust fix** resolves 95%+ of cases by providing diffs in the bulk response (path mismatch eliminated, recursive traversal added)
- **Frontend fix** handles remaining edge cases where diffs are still missing from the bulk response (transient errors, future regressions, large-repo threshold)
- **Polling guard** prevents the Rust fix from becoming a performance problem in tail cases — passes `includeUntracked: false` to the backend so modified/conflicted diffs still flow eagerly while untracked content is deferred to per-card on-demand loading

After the Rust fix, most cards will have `diff` defined and follow the existing fast path. The frontend fallback triggers for files the backend couldn't diff or when untracked content was excluded by the polling guard.

## Known limitations

- **DiffStat badge stays at 0/0 for on-demand loaded diffs**: When `diff` is undefined, the header shows no additions/deletions count. After `fetchAndPreload` computes the diff internally, the header doesn't update because `additions`/`deletions` are memoized on the `diff` prop. This is a cosmetic gap — the expanded diff body shows the correct content.

### 5. Edge case hardening in DiffFileCard

**File**: `apps/agent/src/components/git/source-control/components/DiffFileCard.tsx`

Three targeted fixes for edge cases identified during audit:

**a) Invalidate stale fallback when bulk diff arrives**:

When the `diff` prop transitions from `undefined` to a real `FileDiff` (bulk diff refreshed by polling), the stale fallback preload must be discarded AND a refetch must trigger. The existing expand effect depends on `[isExpanded, prefetchKey]` — neither changes when `diff` transitions. Fix by including a diff-derived signal in `prefetchKey`:

```typescript
// Before:
const prefetchKey = `${file.path}:${isStaged ? 'staged' : 'unstaged'}:${themeType}`;

// After — include diff identity so bulk diff arrival triggers refetch:
const diffKey = diff === undefined ? 'fallback' : 'bulk';
const prefetchKey = `${file.path}:${isStaged ? 'staged' : 'unstaged'}:${themeType}:${diffKey}`;
```

When `diff` goes undefined → defined, `diffKey` flips from `'fallback'` to `'bulk'`, `prefetchKey` changes, the existing `[isExpanded, prefetchKey]` effect re-runs. Inside `fetchAndPreload`, `prefetchRef.current?.key` no longer matches the new key → fresh fetch starts using the now-available bulk `diff`. No separate invalidation effect needed — the existing architecture handles it.

**b) Detect binary and unreadable content in fallback path**:

When `diff === undefined` and the file is binary or unreadable, the fallback path must explicitly detect this rather than showing empty/garbled content. Two failure modes need handling:

1. **Read succeeds but content is binary** — null bytes in content
2. **Read fails entirely** — `.catch(() => '')` silently collapses to empty string (permissions, file deleted, etc.)

Track read failures alongside content, then detect both:

```typescript
// In fetchAndPreload, replace the existing Promise.all (~line 158):
let newReadFailed = false;

const promise = Promise.all([
  gitFileAtRef(repoPath, oldPath, oldRef).catch(() => ''),
  isStaged
    ? gitFileAtRef(repoPath, file.path, 'INDEX').catch(() => '')
    : readFile(absolutePath).catch(() => {
        newReadFailed = true;
        return '';
      }),
]).then(async ([oldContent, newContent]): Promise<PreloadedDiff | null> => {
  // Detect likely binary content — null bytes in first 8KB (same heuristic as git)
  const sample = (oldContent + newContent).slice(0, 8192);
  if (sample.includes('\0')) {
    setPreloadError('Binary file — diff not available');
    return null;
  }

  // Both sides empty + new-side read failed → file is unreadable
  if (newReadFailed && oldContent === '' && newContent === '') {
    setPreloadError('Could not read file — it may be binary or inaccessible.');
    return null;
  }

  const oldFile: FileContents = { name: file.path, contents: oldContent };
  const newFile: FileContents = { name: file.path, contents: newContent };
  const fileDiff = parseDiffFromFile(oldFile, newFile);
  // ... rest unchanged
});
```

This covers:

- Binary files with null bytes → explicit "Binary file" label (same UX as `diff.isBinary`)
- Permission errors / deleted-between-status-and-click → explicit "Could not read" label
- Legitimate new untracked files → `newReadFailed` is false, so empty old content is fine (shows all-additions diff)

Note: `handleMouseEnter` continues to use `schedulePrefetch` for all cards — the 150ms delay and cross-card serializer are preserved. Bypassing `schedulePrefetch` for `diff === undefined` cards would skip `runPrefetch`'s serialization, allowing concurrent fan-out of heavy I/O + Shiki preloads under rapid hover. The serializer (1 in-flight + 1 queued) is more valuable than saving 150ms.

## Files Modified

| File                                                                       | Change                                                                                                                                                                                 |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crates/common/git/src/lib.rs`                                             | Add `include_untracked` param to `get_diff()`, add `recurse_untracked_dirs(true)`, fix `branch_diff_stats()`                                                                           |
| `src-tauri/src/commands/common/git.rs`                                     | Add `include_untracked` param to `git_diff_structured` command                                                                                                                         |
| `apps/agent/src/lib/api/git.ts`                                            | Add `includeUntracked` param to `gitDiffStructured()`                                                                                                                                  |
| `apps/agent/src/components/git/source-control/hooks/use-source-control.ts` | Add `MAX_EAGER_UNTRACKED` guard using `includeUntracked` param                                                                                                                         |
| `apps/agent/src/components/git/source-control/components/DiffFileCard.tsx` | Relax `canExpand`, fix `fetchAndPreload` early return, use `oldPath` for renames, immediate hover preload for missing diffs, stale fallback invalidation, binary detection in fallback |

## Tests

### Rust: nested untracked directory regression test

**File**: `crates/common/git/tests/diff_untracked_recursion.rs`

```rust
// 1) Create temp repo with nested untracked files: vendor/x/y.rs, vendor/x/z.rs
// 2) Call status() — assert untracked contains "vendor/x/y.rs" (not just "vendor/")
// 3) Call get_diff(path, true) — assert result contains entry with path "vendor/x/y.rs"
// 4) Assert status untracked paths ⊆ diff paths (the core invariant this bug violated)
// 5) Call get_diff(path, false) — assert result does NOT contain untracked paths
// 6) Call get_diff(path, false) with a modified tracked file — assert modified file IS present
// 7) Call branch_diff_stats() — assert files_changed includes nested file count
```

### Frontend: DiffFileCard missing-diff expansion

**File**: `apps/agent/src/__tests__/unit/components/git/source-control/components/DiffFileCard.test.tsx`

```typescript
// Core expansion behavior:
// 1) diff === undefined + untracked file → card expands, fetchAndPreload triggers
// 2) diff === undefined + renamed file (oldPath set) → old-side uses oldPath
// 3) diff === undefined + deleted file → card expands, renders removal diff
// 4) diff defined + normal flow → existing behavior unchanged (no regression)

// Stale fallback invalidation:
// 5) diff transitions undefined → defined while expanded → prefetchKey changes → refetch fires
// 6) diff transitions undefined → defined while collapsed → no refetch (lazy on next expand)

// Binary / unreadable detection:
// 7) diff === undefined + file content contains null bytes → shows "Binary file" error label
// 8) diff === undefined + readFile fails (permissions, deleted) → shows "Could not read" error
// 9) diff === undefined + readFile fails but old content exists → shows removal diff (not error)
```

### Frontend: polling guard threshold

**File**: `apps/agent/src/__tests__/unit/components/git/source-control/hooks/use-source-control.test.ts`

```typescript
// 1) untracked.length <= 300 → gitDiffStructured called with includeUntracked=true
// 2) untracked.length > 300 → gitDiffStructured called with includeUntracked=false
// 3) untracked.length > 300 + modified files → modified diffs still present in result
```

## Verification

1. `cargo test -p orbit-git` — ensure existing + new git tests pass
2. `bun run test` — ensure existing + new frontend tests pass
3. `bunx tauri dev` — open Source Control tab, verify:
   - Untracked file cards in "Changes" tab expand on click
   - Modified file cards still expand correctly (including with >300 untracked)
   - Staged file cards still expand correctly
   - Deleted file cards expand and show removal diff
   - Renamed file cards show proper rename diff in fallback
   - Binary untracked files show "Binary file" message (not empty/garbled diff)
   - Branch diff stats in header reflect correct file count
   - With large untracked count (>300), modified cards still show instant DiffStat
   - With large untracked count (>300), untracked cards expand via on-demand loading
   - Expand a card via fallback, wait for poll refresh → card content updates to bulk diff (no stale data)
