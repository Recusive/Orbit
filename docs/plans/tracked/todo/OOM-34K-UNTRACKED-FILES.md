# IDE-Grade Git Scaling — Fix OOM Crash with 34k Untracked Files

## Context

A user on a 24GB MacBook opened a repo where `node_modules` wasn't gitignored (~34,000 untracked files). The source control panel crashed the app in two scenarios:

1. **Panel opens, no scroll**: ~40 visible `DiffFileCard` components each fire `fetchBaseDiff()` after 220ms — reading FULL file content from disk via 2 Tauri IPC calls (`gitFileAtRef` + `readFile`). With large minified bundles (1-10MB each), memory explodes in 2-3 seconds.
2. **Scrolling the list**: Rapid mount/unmount of DiffFileCards creates hundreds of in-flight `fetchBaseDiff` promises with no concurrency limiter or cancellation. Memory spirals to 24GB → OOM crash.

**Root cause**: The bulk diff gate (`MAX_EAGER_UNTRACKED = 300` in `use-source-control.ts`) correctly skips batch diff fetching, but leaves `diff === undefined` on all cards. Each `DiffFileCard` independently tries to fill that gap by reading full file content into JS via IPC — the gate doesn't propagate down.

**Secondary causes**: `listSignature()` in `git-store.ts` creates ~20MB of temporary strings (`.map().sort().join()` on 34k entries) every 5s. `buildStatusMaps()` creates ~170k dirMap entries from deeply nested paths.

## Design Principle

Keep the existing UI, interactions, and features exactly as they are. Fix the crash by moving expensive work behind the UI into bounded backend APIs and request scheduling. No feature degradation — header stats, hover prefetch, expand/collapse, and directory badges all continue working.

---

## Changes

### 1. Rust-Side Status Fingerprinting + `applyPolledStatus` Store Action

**Goal**: Unchanged 5s polls should not send the full 34k-entry status payload across IPC, while preserving the `lastUpdated` contract that drives diff refreshes.

**Files**:

- `crates/common/git/src/lib.rs` — add `compute_status_fingerprint()` function
- `orbit_core` types — add `GitStatusResponse` wrapper struct
- `src-tauri/src/commands/common/git.rs` — add `git_status_conditional` command
- `apps/agent/src/lib/api/git.ts` — add `gitStatusConditional()` wrapper + `GitStatusResponse` type
- `apps/agent/src/stores/git/git-store.ts` — add `applyPolledStatus()` action, `statusFingerprint` + `statusRevision` fields, delete `listSignature()` entirely
- `apps/agent/src/hooks/git/use-git-status.ts` — use conditional status in `loadStatus()`, pass fingerprint from store

**Critical contract preservation** (audit issue #1):

Today, `setStatus()` bumps `lastUpdated` even on unchanged polls (`git-store.ts:237-239`), and `useSourceControl()` watches `lastUpdated` to refetch diffs (`use-source-control.ts:207-216`). A fingerprint-only `changed: false` path must NOT break this.

**Solution**: Separate `statusRevision` (advances only when status object changes) from `lastUpdated` (advances every poll). Single-file diff caches key off `statusRevision` for invalidation. Bulk diff refetches still fire off `lastUpdated`.

```typescript
// New store fields
interface GitState {
  // ... existing fields ...
  statusFingerprint: string | null; // Rust-computed, used for conditional polling
  statusRevision: number; // Increments only when status object actually changes
}

// New centralized store action — ALL status writers use this
applyPolledStatus: (result: GitStatusPollResult): void => {
  set((state) => {
    state.statusFingerprint = result.fingerprint;
    state.lastUpdated = Date.now(); // Always advance — preserves diff refresh contract

    if (!result.changed || !result.status) {
      return; // Unchanged poll: lastUpdated advanced, status object untouched
    }

    state.status = sanitizeStatus(result.status);
    state.error = null;
    state.isLoading = false;
    state.statusRevision += 1; // Only on actual change — invalidates single-file diff caches
  });
};
```

**Polling ownership** (audit issue #2):

The actual `gitStatus()` call lives in `use-git-status.ts:170` (not `use-git-polling.ts`). There are also direct full-status writers in `WorktreeItem.tsx:129,133,183,187` and `use-source-control.ts:233-240`.

**Solution**:

- `useGitStatus.loadStatus()` — switch from `gitStatus()` to `gitStatusConditional(discovered, store.statusFingerprint)` for background polls. Non-background refreshes continue using full `gitStatus()`.
- All writers (WorktreeItem, useSourceControl.refresh) continue calling full `gitStatus()`. To keep fingerprints consistent, make the standard `git_status` Tauri command also return a fingerprint alongside the status (add fingerprint to the existing `GitStatus` response — no separate conditional call needed). Writers call `applyPolledStatus({ changed: true, fingerprint, status })`. This is the single authoritative path — no client-side fingerprint computation, no ambiguity.
- Reset `statusFingerprint` and `statusRevision` on workspace/repo path change (in `reset()` and `setRepoPath()`).

**Fingerprint completeness** (audit recommendation #1):

Hash includes ALL fields that affect equality: `branch`, `upstream`, `ahead`, `behind`, plus `{path, status, oldPath, similarity}` per entry per bucket. Use FNV-1a with explicit field delimiters. Order-sensitive (not sorted) — libgit2 returns deterministic order for a given working tree state.

```rust
pub fn compute_status_fingerprint(status: &GitStatus) -> String {
    let mut h: u64 = 14695981039346656037;
    // Branch + upstream + ahead + behind
    mix_str(&mut h, &status.branch);
    mix_str(&mut h, status.upstream.as_deref().unwrap_or(""));
    mix_u64(&mut h, u64::from(status.ahead));
    mix_u64(&mut h, u64::from(status.behind));
    // Each bucket: count + entries (path + status + oldPath + similarity)
    for list in [&status.staged, &status.modified, &status.untracked, &status.conflicted] {
        mix_u64(&mut h, list.len() as u64);
        for entry in list {
            mix_str(&mut h, &entry.path);
            mix_str(&mut h, &format!("{:?}", entry.status));
            mix_str(&mut h, entry.old_path.as_deref().unwrap_or(""));
            mix_u64(&mut h, u64::from(entry.similarity.unwrap_or(0)));
        }
    }
    format!("{h:016x}")
}
```

---

### 2. Backend Single-File Diff APIs (Two-Tier: Stats + Content)

**Goal**: Two separate APIs optimized for different use cases:

- **Stats** (~50 bytes over IPC): for header counts — never reads file content into JS
- **Content** (full old/new text): for expand/hover — feeds `parseDiffFromFile()` which Pierre needs

**Why not hunk-only structured diff?** The current Pierre renderer (`@pierre/diffs`) requires full old/new file content, not just hunks. `parseDiffFromFile(oldFile, newFile)` produces `FileDiffMetadata` with `oldLines`/`newLines` arrays needed for "N unmodified lines" expansion (`DiffFileCard.tsx:235-237`, `@pierre/diffs/dist/types.d.ts:48-60`). A hunk-only payload would break expand/collapse.

**Files**:

- `crates/common/git/src/lib.rs` — add `get_single_file_diff_stats()` and `get_single_file_content()` functions
- `src-tauri/src/commands/common/git.rs` — add `git_file_diff_stats` and `git_file_diff_content` commands
- `src-tauri/src/lib.rs` — register new commands in `generate_handler![]`
- `apps/agent/src/lib/api/git.ts` — add `gitFileDiffStats()` and `gitFileDiffContent()` wrappers + types

**New Rust types** (in `crates/common/git/src/lib.rs`):

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiffStats {
    pub additions: usize,
    pub deletions: usize,
    pub is_binary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SingleFileContent {
    pub old_content: String,   // Content at old ref (empty for untracked/added)
    pub new_content: String,   // Content at new ref (empty for deleted)
    pub is_binary: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DiffScope {
    Staged,
    Unstaged,
}
```

**Rust implementation**:

`get_single_file_diff_stats()`: Use `git2::Diff::stats()` and `delta.flags().is_binary()` via `diff.foreach()`. Do NOT route through `parse_diff()` — that allocates every line into `String`s, which is unnecessary for header counts. Scope to single file via `pathspec()`.

`get_single_file_content()`: Read old + new content with proper scope handling:

- **Staged** (`HEAD → index`): old = `get_file_at_ref(repo, file, "HEAD")`, new = `get_file_at_ref(repo, file, "INDEX")`
- **Unstaged** (`index → worktree`): old = `get_file_at_ref(repo, file, "INDEX")`, new = read from working tree (`fs::read_to_string`)
- **Untracked**: old = empty string, new = read from working tree
- **Deleted**: old = content at ref, new = empty string
- **Renamed**: use `old_path` for old ref, `file` for new ref
- **Binary**: detect via delta flags or null byte scan, return `is_binary: true` with empty content strings

This replaces the current `gitFileAtRef() + readFile()` JS composition with a single scoped Rust call — same data, but with correct scope handling and one IPC round-trip instead of two.

Both functions handle all file states:

- **Untracked**: `diff_index_to_workdir` with `include_untracked(true)` + `pathspec`
- **Modified/Staged/Deleted/Renamed/Typechange**: libgit2 Delta types handle naturally
- **Binary**: `delta.flags().is_binary()`
- **Unborn repo**: `diff_tree_to_index(None, ...)` (same as `get_staged_diff`)

**New Tauri commands** (typed end-to-end):

```rust
#[tauri::command]
pub async fn git_file_diff_stats(
    repo_path: String, file: String, scope: DiffScope, old_path: Option<String>,
) -> Result<FileDiffStats> {
    spawn_git(move || {
        orbit_git::get_single_file_diff_stats(
            Path::new(&repo_path), &file, scope, old_path.as_deref(),
        )
    }).await
}

#[tauri::command]
pub async fn git_file_diff_content(
    repo_path: String, file: String, scope: DiffScope, old_path: Option<String>,
) -> Result<SingleFileContent> {
    spawn_git(move || {
        orbit_git::get_single_file_content(
            Path::new(&repo_path), &file, scope, old_path.as_deref(),
        )
    }).await
}
```

**New frontend API** (in `apps/agent/src/lib/api/git.ts`):

```typescript
export interface FileDiffStats {
  additions: number;
  deletions: number;
  isBinary: boolean;
}
export interface SingleFileContent {
  oldContent: string;
  newContent: string;
  isBinary: boolean;
}
type DiffScope = 'staged' | 'unstaged';

export async function gitFileDiffStats(
  repoPath: string,
  file: string,
  scope: DiffScope,
  oldPath?: string
): Promise<FileDiffStats> {
  return invoke<FileDiffStats>('git_file_diff_stats', { repoPath, file, scope, oldPath });
}

export async function gitFileDiffContent(
  repoPath: string,
  file: string,
  scope: DiffScope,
  oldPath?: string
): Promise<SingleFileContent> {
  return invoke<SingleFileContent>('git_file_diff_content', { repoPath, file, scope, oldPath });
}
```

**How DiffFileCard uses the content API for expand/hover** (preserves Pierre rendering):

```typescript
// Current: two separate IPC calls + JS-side scope composition
const oldContent = await gitFileAtRef(repoPath, oldPath, oldRef); // ← scope logic in JS
const newContent = await readFile(absolutePath); // ← always worktree
const fileDiff = parseDiffFromFile(
  { name: file.path, contents: oldContent },
  { name: file.path, contents: newContent }
);

// New: single scoped IPC call, same parseDiffFromFile
const { oldContent, newContent, isBinary } = await gitFileDiffContent(
  repoPath,
  file.path,
  scope,
  file.oldPath
);
if (isBinary) {
  setIsFallbackBinary(true);
  return null;
}
const fileDiff = parseDiffFromFile(
  { name: file.path, contents: oldContent },
  { name: file.path, contents: newContent }
);
```

Pierre rendering is unchanged — `parseDiffFromFile` still receives full content and produces `FileDiffMetadata` with `oldLines`/`newLines` for expand.

---

### 3. Prefix Trie for Directory Status (Replace dirMap)

**Goal**: Preserve all directory badges without the ~170k flat Map entries.

**File**: `apps/agent/src/stores/git/git-store.ts`

**Approach**: Replace the flat `dirMap: Map<string, FileStatus>` with a compact prefix trie built from path segments.

```typescript
interface TrieNode {
  status: FileStatus | null;
  children: Map<string, TrieNode>;
}
```

- Build once per changed status snapshot from path segments
- Store max status at each trie node via `pickHigherStatus`
- `selectDirectoryStatus()` walks the trie by splitting the path instead of looking up a materialized ancestor key
- No count-based cutoff — works correctly at any scale
- Memory: trie shares path prefix nodes (e.g., `node_modules/a/b/c` and `node_modules/a/b/d` share the `node_modules/a/b` node)
- Path normalization: apply existing `normalizeEntryPath()` (handles Windows drive-letter casing, `./` prefix stripping) before trie insertion
- Repo-root: represented by the trie root node, which accumulates the max status across all entries

**Replace `buildStatusMaps` function** — keep `fileMap` as-is (flat Map for O(1) file lookups), replace `dirMap` with trie. The `getStatusMaps` cache continues working — just swap the data structure.

---

### 4. DiffFileCard Data Source Migration — Universal Fallback

**Goal**: Same UI behavior (auto stats, hover prefetch, expand diff) backed by cheap Rust APIs. The new single-file APIs are the **universal fallback** for ANY missing card diff — not just deferred untracked files.

**Files**:

- `apps/agent/src/components/git/source-control/hooks/use-source-control.ts` — expose `untrackedDiffSkipped: boolean`
- `apps/agent/src/components/git/source-control/SourceControlTab.tsx` — thread signal to ChangesList
- `apps/agent/src/components/git/source-control/components/ChangesList.tsx` — compute per-card `deferredDiffMode: boolean`
- `apps/agent/src/components/git/source-control/components/DiffFileCard.tsx` — replace ALL `readFile`/`gitFileAtRef` fallback paths with new backend APIs

**Universal fallback** (audit issue #3):

The current DiffFileCard fallback triggers whenever `diff === undefined` — not just for untracked files. This happens on transient bulk-diff failures, when `gitDiffStructured()` omits a file, etc. Limiting the new backend APIs to only deferred untracked cards would leave other `diff === undefined` cards using the old expensive path.

**Solution**: Use the new single-file backend APIs as the universal fallback for ANY card where `diff === undefined`. Keep `deferredDiffMode` only as a **timing policy** signal:

- `deferredDiffMode = true` (untracked + bulk skipped): auto-stats fires after 220ms delay
- `deferredDiffMode = false` (normal card with missing diff): auto-stats fires immediately (preserves current resilience for transient bulk-diff holes)
- Both paths use the same `gitFileDiffStats()` backend call — never `readFile` + JS parsing

**Fallback cache invalidation** (audit critical issue #1):

Cards with bulk diffs use `statusRevision` for invalidation (status change = new bulk diffs fetched). But fallback cards (`diff === undefined`) can go stale when file content changes while the status list stays identical (e.g., editing an already-untracked file). For these cards, `statusRevision` doesn't move.

**Solution**: Fallback cards use `lastUpdated` (advances every 5s poll) in their cache key, not `statusRevision`. This means fallback stats refresh every poll cycle — but since `gitFileDiffStats()` returns ~50 bytes, this is cheap. The scheduler limits concurrency to 8 concurrent stats requests.

```typescript
// In DiffFileCard — two-level invalidation
const statusRevision = useGitStore((s) => s.statusRevision);
const lastUpdated = useGitStore((s) => s.lastUpdated);

// Cards with bulk diffs: invalidate on status change only
// Cards on fallback path: invalidate every poll (content may have changed)
const fallbackRevision = diff === undefined ? (lastUpdated ?? 0) : statusRevision;
const requestKey = `${file.path}:${isStaged ? 'staged' : 'unstaged'}:${themeType}:${fallbackRevision}`;
const needsSingleFileFallback = diff === undefined && !showBinary;

useEffect(() => {
  if (!needsSingleFileFallback || !repoPath) return;
  const scope: DiffScope = isStaged ? 'staged' : 'unstaged';

  if (deferredDiffMode) {
    // Deferred: 220ms delay (matches current behavior for >300 untracked)
    const timer = window.setTimeout(() => {
      void scheduler
        .requestStats(requestKey, () =>
          gitFileDiffStats(repoPath, file.path, scope, file.oldPath ?? undefined)
        )
        .then(handleStatsResult);
    }, 220);
    return () => {
      window.clearTimeout(timer);
      scheduler.cancel(requestKey);
    };
  }

  // Immediate: preserve resilience for transient bulk-diff failures
  void scheduler
    .requestStats(requestKey, () =>
      gitFileDiffStats(repoPath, file.path, scope, file.oldPath ?? undefined)
    )
    .then(handleStatsResult);

  return () => {
    scheduler.cancel(requestKey);
  };
}, [needsSingleFileFallback, deferredDiffMode, repoPath, requestKey]);
```

**Signal threading** (unchanged from previous):

- `useSourceControl` computes `untrackedDiffSkipped = untrackedCount > MAX_EAGER_UNTRACKED`
- `ChangesList` computes per-card: `deferredDiffMode = !isStaged && untrackedDiffSkipped && file.backendStatus === 'untracked'`
- DiffFileCard receives `deferredDiffMode: boolean`

**Remove from source-control card path**: Direct `readFile`, `readFileBytes`, and `gitFileAtRef` calls in `fetchBaseDiff` and `fetchAndPreload`. Replace with `gitFileDiffStats` (for header counts) and `gitFileDiffContent` (for hover/expand).

**Hover and expand** still work via the scheduler's content lane:

- Hover: `scheduler.requestContent(requestKey, () => gitFileDiffContent(...))` → receives `{ oldContent, newContent }` → `parseDiffFromFile()` → `preloadFileDiff()` (Pierre prerender)
- Expand: same pipeline — `parseDiffFromFile()` produces `FileDiffMetadata` with `oldLines`/`newLines` → Pierre renders with full expand/collapse

**Stale result handling** (edge case — file staged/unstaged/renamed/discarded after request queued):

- `requestKey` includes `statusRevision` — any status change bumps the revision, making old keys stale
- Scheduler's `cancel(key)` on unmount/key change prevents queued work from starting
- In-flight results are discarded if `requestKey` has changed by the time they resolve

---

### 5. Request Scheduler with Backpressure

**Goal**: Prevent request fan-out during rapid scrolling, even with cheap backend APIs.

**Files**:

- `apps/agent/src/lib/utils/diff-scheduler.ts` — new module
- `apps/agent/src/lib/utils/index.ts` — export
- `apps/agent/src/components/git/source-control/components/DiffFileCard.tsx` — use scheduler

**Scheduler spec**:

```typescript
interface DiffScheduler {
  requestStats(key: string, fn: () => Promise<FileDiffStats>): Promise<FileDiffStats | null>;
  requestContent(
    key: string,
    fn: () => Promise<SingleFileContent>
  ): Promise<SingleFileContent | null>;
  cancel(key: string): void;
  cancelAll(): void;
}

export function createDiffScheduler(): DiffScheduler;
```

**Behavior**:

- Dedupe by `key` — same key returns existing pending promise
- Two lanes: stats (max 8 concurrent) and content (max 2 concurrent)
- Queued work is marked stale on `cancel(key)` — exits before starting IPC if canceled
- Stale results are discarded on resolve (return `null`)
- Module-level singleton shared across all DiffFileCard instances

**Interaction with existing ChangesList `schedulePrefetch`** (audit recommendation #3):

Keep the existing `schedulePrefetch()` hover-delay/coalescing behavior in `ChangesList.tsx:63-101`. The scheduler sits **underneath** it and only bounds backend concurrency. `schedulePrefetch` handles UI-level hover timing (150ms delay, latest-wins); the scheduler handles IPC-level backpressure. Two clearly separate concerns — no duplication.

**State lifecycle** (audit recommendation #4):

Fingerprint, statusRevision, and scheduler state are ephemeral per repo. On workspace/repo change:

- `GitStore.reset()` clears `statusFingerprint` and resets `statusRevision` to 0
- `scheduler.cancelAll()` is called on repo path change from `SourceControlTab` (single owner — individual cards only call `cancel(key)`, never `cancelAll()`)

**Dev-only logging** (audit nice-to-have #1):

Use `createLogger('DiffScheduler')` with `logger.debug` for queue depth, stale drops, and per-request latency. Follows existing structured logging pattern.

---

## Implementation Order

| Phase | Change                                                   | Scope                                      | Dependencies    |
| ----- | -------------------------------------------------------- | ------------------------------------------ | --------------- |
| 1     | **Change 3** — Prefix trie for dirMap                    | `git-store.ts` only                        | None            |
| 2     | **Change 1** — Rust fingerprinting + `applyPolledStatus` | Rust + Tauri + store + `use-git-status.ts` | None            |
| 3     | **Change 2** — Backend single-file diff APIs             | Rust + Tauri + `lib/api/git.ts`            | None            |
| 4     | **Change 5** — Request scheduler                         | New `diff-scheduler.ts`                    | None            |
| 5     | **Change 4** — DiffFileCard migration                    | 4 TS files                                 | Changes 2, 3, 5 |

Phases 1-4 are independent and can be done in parallel. Phase 5 wires everything together.

---

## Files Modified

| File                                                                       | Change                                                                                                                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `crates/common/git/src/lib.rs`                                             | `compute_status_fingerprint()`, `get_single_file_diff_stats()`, `get_single_file_content()`, `FileDiffStats`, `SingleFileContent`, `DiffScope`                           |
| `src-tauri/src/commands/common/git.rs`                                     | `git_status_conditional`, `git_file_diff_stats`, `git_file_diff_content` commands; also return fingerprint from standard `git_status`                                    |
| `src-tauri/src/lib.rs`                                                     | Register 3 new commands in `generate_handler![]`                                                                                                                         |
| `apps/agent/src/lib/api/git.ts`                                            | `gitStatusConditional()`, `gitFileDiffStats()`, `gitFileDiffContent()` + `FileDiffStats`, `SingleFileContent`, `GitStatusResponse` types                                 |
| `apps/agent/src/stores/git/git-store.ts`                                   | Prefix trie for dirMap, `applyPolledStatus()`, `statusFingerprint` + `statusRevision`, delete `listSignature()`                                                          |
| `apps/agent/src/hooks/git/use-git-status.ts`                               | Use `gitStatusConditional()` for background polls, write through `applyPolledStatus()`                                                                                   |
| `apps/agent/src/components/git/source-control/hooks/use-source-control.ts` | Expose `untrackedDiffSkipped`                                                                                                                                            |
| `apps/agent/src/components/git/source-control/SourceControlTab.tsx`        | Thread `untrackedDiffSkipped` to ChangesList                                                                                                                             |
| `apps/agent/src/components/git/source-control/components/ChangesList.tsx`  | Compute per-card `deferredDiffMode`                                                                                                                                      |
| `apps/agent/src/components/git/source-control/components/DiffFileCard.tsx` | Universal fallback: `gitFileDiffStats` for headers, `gitFileDiffContent` + `parseDiffFromFile` for expand/hover. Remove direct `readFile`/`readFileBytes`/`gitFileAtRef` |
| `apps/agent/src/lib/utils/diff-scheduler.ts`                               | **New**: request scheduler with backpressure                                                                                                                             |
| `apps/agent/src/lib/utils/index.ts`                                        | Export scheduler                                                                                                                                                         |

---

## Test Plan

### Rust tests

- `compute_status_fingerprint`: same status → same fingerprint, different status → different fingerprint, includes `oldPath`/`similarity`/`upstream`
- `git_status_conditional`: first load (no fingerprint), unchanged poll, changed poll
- `git_status` (standard): returns fingerprint alongside status
- `get_single_file_diff_stats`: correct counts for modified, added, deleted, renamed, binary, untracked, typechange files + unborn repos. Uses `Diff::stats()` path (not `parse_diff`)
- `get_single_file_content`: correct old/new content for staged, unstaged, untracked, deleted, renamed files. Binary returns `is_binary: true` with empty strings
- Regression: stable `status()` enumeration with ~34,000 untracked files

### Frontend tests

- `git-store.ts`: `applyPolledStatus` — unchanged poll advances `lastUpdated` but not `statusRevision`; changed poll advances both; workspace change resets fingerprint/revision
- `git-store.ts`: trie-based `selectDirectoryStatus` returns correct values for nested paths, repo root, sibling-prefix rejection, Windows normalization
- `use-git-status.ts`: background polls use `gitStatusConditional` with fingerprint; non-background refreshes use full `gitStatus`
- `use-source-control`: `untrackedDiffSkipped` is `true` above `MAX_EAGER_UNTRACKED`, `false` below; `lastUpdated` ticks still trigger diff refetches
- `ChangesList`: untracked unstaged cards get `deferredDiffMode = true`; staged and tracked unstaged cards get `false`
- `DiffFileCard`: universal fallback — any `diff === undefined` card uses `gitFileDiffStats` (not `readFile`); deferred mode adds 220ms delay; non-deferred fires immediately; hover/expand use `gitFileDiffContent` → `parseDiffFromFile`; stale results discarded after key change; fallback `requestKey` uses `lastUpdated` (content-only edits still invalidate)
- `DiffFileCard`: Pierre metadata test — expanded card shows unchanged-line separators / expansion (validates `parseDiffFromFile` from `gitFileDiffContent` produces same `FileDiffMetadata` as old `readFile` + `gitFileAtRef` path)
- `diff-scheduler.ts`: enforces concurrency limits (8 stats, 2 content), dedupes by key, drops stale queued work, cancel prevents execution, `cancelAll()` called only from SourceControlTab

### Manual acceptance

- Open repo with ~34,000 untracked `node_modules` files — panel opens without runaway memory
- Header stats appear on visible cards (computed via Rust)
- Scrolling does not create request fan-out
- Clicking a card still opens its diff
- File-explorer directory badges still work
- Unchanged 5s polls do not resend the full 34k-entry status payload
- Content-only edits (file modified, same status bucket) still refresh diffs — bulk cards via `lastUpdated` → refetch, fallback cards via `lastUpdated` in requestKey
- Transient bulk-diff failure: individual cards self-heal via universal fallback (immediate stats, not 220ms deferred)
- Expand a card → verify "N unmodified lines" separators and expand buttons work (Pierre metadata produced from `gitFileDiffContent` → `parseDiffFromFile`)
- WorktreeItem checkout/create-branch: status + fingerprint stay consistent
- Normal repo (<300 untracked files): everything works identically to before

---

## Edge Cases Addressed

| Edge Case                                                                 | How Handled                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File contents change but status buckets unchanged (card has bulk diff)    | `lastUpdated` advances every poll → bulk diff refetch fires → new `diff` prop flows down. `statusRevision` unchanged — correct, bulk diffs handle it                                                                                   |
| File contents change but status buckets unchanged (card on fallback path) | Fallback `requestKey` uses `lastUpdated` (not `statusRevision`) → key changes every poll → stats refetch automatically. Cheap: ~50 bytes per `gitFileDiffStats` response                                                               |
| `gitDiffStructured()` repeatedly omits a tracked file                     | Card stays on universal fallback (`diff === undefined`). `requestKey` uses `lastUpdated` → stats refresh every 5s poll. No stale data accumulation                                                                                     |
| `gitDiffStructured()` fails or omits a file                               | Universal fallback: any `diff === undefined` card uses `gitFileDiffStats` (immediate, not deferred). No feature degradation for non-untracked cards                                                                                    |
| Single-file diff resolves after file staged/unstaged/renamed/discarded    | `requestKey` includes `statusRevision` → status change bumps revision → old key stale → scheduler cancels/discards                                                                                                                     |
| Workspace switch while requests in-flight                                 | `GitStore.reset()` clears fingerprint/revision; `scheduler.cancelAll()` on repo path change                                                                                                                                            |
| Binary files in single-file API                                           | `delta.flags().is_binary()` in Rust → `isBinary: true` in `FileDiffStats`. Card renders "Binary file" state                                                                                                                            |
| Symlinks/typechanges                                                      | libgit2 Delta handles natively. `DiffScope::Unstaged` → `diff_index_to_workdir` catches typechange                                                                                                                                     |
| Deleted files                                                             | libgit2 handles: old blob exists, new is empty → correct additions=0, deletions=N                                                                                                                                                      |
| Unborn repo                                                               | `diff_tree_to_index(None, ...)` — same as existing `get_staged_diff`                                                                                                                                                                   |
| Repo-root badges in trie                                                  | Trie root node accumulates max status across all entries                                                                                                                                                                               |
| Windows drive-letter casing in trie                                       | `normalizeEntryPath()` applied before trie insertion (existing function, handles `A:\` → lowercase)                                                                                                                                    |
| Manual refresh while conditional polling active                           | All writers use `applyPolledStatus()` with `changed: true` → fingerprint/revision stay consistent                                                                                                                                      |
| Pierre metadata from new content API                                      | `gitFileDiffContent()` returns `{ oldContent, newContent }` → `parseDiffFromFile()` builds `FileDiffMetadata` with `oldLines`/`newLines` → Pierre rendering unchanged. No hunk-to-metadata conversion needed                           |
| Fingerprint authority on full-refresh paths                               | Standard `git_status` command also returns fingerprint (Rust computes it alongside status). All paths — polling, manual refresh, WorktreeItem — get fingerprints from Rust. No client-side fingerprint computation, no divergence risk |

---

## Constraints and Defaults

- **No visible UI changes** — same source-control panel, same cards, same stats, same hover, same expand, same badges
- **No feature removal** — header stats and hover prefetch continue working (backed by cheap Rust APIs)
- **Universal single-file fallback** — not limited to deferred untracked cards; covers all missing-diff scenarios
- **New IPC contracts are allowed** — internal plumbing required for IDE-grade scaling
- **Rust/Tauri surface changes scoped to git** — no changes to other commands or crates
- **The diff renderer (Pierre) stays unchanged** — only the data-fetch layers under it are replaced
- **Fingerprint/scheduler state is ephemeral per repo** — reset on workspace change, never persisted
