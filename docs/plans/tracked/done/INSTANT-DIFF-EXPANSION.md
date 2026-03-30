# Instant DiffFileCard Expansion — Background Preparation Pipeline

## Context

When clicking a modified file in Source Control, the card stays frozen for 2-3 seconds before expanding. New/untracked files expand instantly. Three operations block the main thread synchronously:

1. `parseDiffFromFile()` — Myers diff via `diff` npm package (~300-800ms, sync on main thread)
2. `preloadFileDiff()` — Shiki SSR highlighting (~500-1500ms, sync on main thread)
3. `gitFileDiffContent()` — Tauri IPC roundtrip (~50-500ms for libgit2 blob read)

The fix follows the architecture used by VS Code (show immediately, highlight lazily via workers) and Zed (compute diffs in Rust backend). The goal: the expand animation is unblocked in the common case. Background prep runs `parseDiffFromFile` on the main thread during idle time (yielded between files). Each call blocks ≤300ms (200KB content gate). If a user click lands during an active parse slice, the click handler queues behind it — worst case ~300ms stall, not the current 2-3s. Once the cache is warm (typical: ~800ms after panel open), clicks are pure cache reads (0ms). Phase 2 (Rust `similar` crate) eliminates the main-thread parse entirely.

**Reference codebases for auditing:**

- VS Code: `/Users/no9labs/Developer/Recursive/Snowflake-v0/reference/vscode-reference/`
  - Diff computation: `src/vs/editor/common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer.ts`
  - Worker RPC: `src/vs/editor/browser/services/editorWorkerService.ts`
  - Diff view model: `src/vs/editor/browser/widget/diffEditor/diffEditorViewModel.ts`
  - Viewport tokenization: `src/vs/editor/common/model/tokens/tokenizerSyntaxTokenBackend.ts`
  - Background tokenizer (idle callback, 1ms slices): `src/vs/editor/common/model/textModelTokens.ts`
- Zed: `/Users/no9labs/Developer/Recursive/Snowflake-v0/reference/zed-reference/`
  - Diff engine: `crates/buffer_diff/src/buffer_diff.rs` (libgit2 `Patch::from_buffers`, background executor)
  - Git blob reads: `crates/git/src/repository.rs` (`load_index_text`, `load_committed_text`)
  - Hunk storage: `SumTree<InternalDiffHunk>` in `buffer_diff.rs`
  - Viewport-only rendering: `crates/editor/src/element.rs` (`display_diff_hunks_for_rows`)

---

## Target Flow

```
Panel opens → useSourceControl() fetches git status + structured diffs
  │
  ├─ IMMEDIATELY: Batch Tauri invoke for ELIGIBLE changed files
  │  (skips: binary, pathological from structured diff data, untracked)
  │  Rust (spawn_blocking): opens repo ONCE, reads old+new content for each file
  │  Returns: BatchFileContentResult[] (~200-400ms total for 10-20 files)
  │
  ├─ As results arrive (main thread, YIELDED between files):
  │  parseDiffFromFile() per file, CAPPED at 50ms per yield slice
  │  Files exceeding cap: deferred to on-demand (expand triggers individual fetch)
  │  Cache: PreparedDiff stored per file
  │
  └─ ~500-800ms later: all small/medium diffs cached and ready

User clicks ANY card:
  1. setIsExpanded(true) → animation starts (0ms, never blocked)
  2. Cache lookup → HIT (99% of the time for small/medium files)
  3. Mount <PierreFileDiff> WITHOUT prerenderedHTML (if workers available)
     OR with SSR prerenderedHTML (if worker pool unavailable — fallback)
  4. Pierre 4-worker pool highlights visible lines → colors in ~50-100ms

  Perceived (cache warm): INSTANT expand + ~100ms to full syntax color
  Perceived (click during active parse slice): ≤300ms stall, then expand
  Perceived (cache cold, no in-flight): "Loading diff..." briefly, then expand
```

---

## Implementation

### Step 1 — Rust: Extract shared content-reading helper

**File:** `crates/common/git/src/lib.rs`

Refactor `get_single_file_content` (line ~893) to extract the inner logic into a reusable function:

```rust
fn extract_single_file_content(
    repo: &Repository,
    repo_path: &Path,
    relative_file: &Path,
    scope: DiffScope,
    relative_old_path: Option<&Path>,
) -> Result<SingleFileContent>
```

Then `get_single_file_content` becomes a thin wrapper: `open(repo_path)` → `extract_single_file_content(...)`.

### Step 2 — Rust: Add batch content function

**File:** `crates/common/git/src/lib.rs`

Add types and batch function:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchFileRequest {
    pub file: String,
    pub scope: DiffScope,
    pub old_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchFileContentResult {
    pub file: String,
    pub scope: DiffScope,
    pub content: Option<SingleFileContent>,
    pub error: Option<String>,
}

pub fn get_batch_file_contents(
    repo_path: &Path,
    files: &[BatchFileRequest],
) -> Result<Vec<BatchFileContentResult>>
```

Key: opens repository ONCE via `open(repo_path)`, iterates all files, per-file failures produce error entries (not batch failure).

### Step 3 — Tauri: Register batch command

**File:** `src-tauri/src/commands/common/git.rs`

```rust
#[tauri::command]
pub async fn git_batch_file_contents(
    repo_path: String,
    files: Vec<BatchFileRequest>,
) -> Result<Vec<BatchFileContentResult>> {
    spawn_git(move || {
        orbit_git::get_batch_file_contents(Path::new(&repo_path), &files)
            .capture("git_batch_file_contents")
    })
    .await
}
```

**File:** `src-tauri/src/lib.rs` — add `git::git_batch_file_contents` to `generate_handler!`

### Step 4 — Frontend API: Batch wrapper

**File:** `apps/agent/src/lib/api/git.ts`

```typescript
export interface BatchFileRequest {
  file: string;
  scope: DiffScope;
  oldPath?: string | null;
}

export interface BatchFileContentResult {
  file: string;
  scope: DiffScope;
  content: SingleFileContent | null;
  error: string | null;
}

export async function gitBatchFileContents(
  repoPath: string,
  files: BatchFileRequest[]
): Promise<BatchFileContentResult[]>;
```

### Step 5 — New: Background diff preparation service

**New file:** `apps/agent/src/lib/utils/diff-prep-service.ts`

#### Core architecture:

**Single-flight with trailing rerun semantics:** Only one batch IPC runs at a time. If `startDiffPrep` is called while a previous batch is in-flight, the previous session is cancelled and the new request is queued as a trailing rerun. When the in-flight IPC returns, the cancelled session's results are discarded and the trailing rerun starts. This prevents stale Rust work from overlapping newer revisions.

```typescript
let currentSession: PrepSession | null = null;
let pendingRerun: (() => void) | null = null; // trailing rerun
let batchIpcInFlight = false;

function cancelDiffPrep(): void {
  if (currentSession) {
    currentSession.cancelled = true;
    currentSession = null;
  }
  // CRITICAL: also clear pending rerun — prevents stale work after unmount/repo change
  pendingRerun = null;
}

async function startDiffPrep(repoPath, files, statusRevision, structuredDiffs): Promise<void> {
  cancelDiffPrep();

  // If a batch IPC is already in-flight (from cancelled session),
  // queue this as a trailing rerun instead of starting immediately
  if (batchIpcInFlight) {
    pendingRerun = () => startDiffPrep(repoPath, files, statusRevision, structuredDiffs);
    return;
  }

  const session = { id: ++sessionCounter, cancelled: false };
  currentSession = session;
  batchIpcInFlight = true;

  try {
    const results = await gitBatchFileContents(repoPath, batchRequests);
    // ... process results (see per-file loop below)
  } catch {
    // Batch-level failure: silent, files fall back to on-demand
  } finally {
    batchIpcInFlight = false;
    // Fire trailing rerun if queued AND not cancelled in the meantime
    const rerun = pendingRerun;
    pendingRerun = null;
    if (rerun && currentSession === null) {
      // No active session means cancelDiffPrep wasn't called after the rerun was queued
      // but the rerun itself calls cancelDiffPrep + creates a new session, so this is safe
      rerun();
    } else if (rerun && currentSession !== session) {
      // A newer session was created — the rerun is stale, discard it
      // (pendingRerun already cleared above)
    }
  }
}
```

**Key guarantee:** `cancelDiffPrep()` clears BOTH the active session AND any pending rerun. After unmount or repo change calls `cancelDiffPrep()`, no stale work can fire — even if a batch IPC is still in-flight in Rust.

#### Per-file main-thread cost and content-size gating:

`parseDiffFromFile` is synchronous. Its cost scales with content size:

- <50KB combined old+new: ~10-50ms (acceptable)
- 50-200KB: ~50-300ms (noticeable jank during background prep)
- > 200KB: ~300-800ms (unacceptable single-call block)

**The prep service gates files by content size before calling `parseDiffFromFile`:**

```typescript
const MAX_PREP_CONTENT_BYTES = 200_000; // 200KB combined old+new

for (const file of filesToPrep) {
  if (session.cancelled) return;
  await yieldToMain();
  if (session.cancelled) return;

  const content = resultMap.get(`${file.scope}::${file.path}`)?.content;
  if (!content || content.isBinary) continue;

  // Gate: skip files too large for background parsing
  // These fall back to on-demand when the user actually clicks them
  const combinedBytes = content.oldContent.length + content.newContent.length;
  if (combinedBytes > MAX_PREP_CONTENT_BYTES) {
    logger.debug('Skipping prep for large file', { file: file.path, bytes: combinedBytes });
    continue;
  }

  try {
    const oldFile = buildGitFileContents({ ... });
    const newFile = buildGitFileContents({ ... });
    const result = parseDiffFromFile(oldFile, newFile);
    // ... count changes, cache result
    setCachedParsedDiff(cacheKey, result);
  } catch {
    // Skip file, continue to next
  }
}
```

**What this guarantees:**

- Each `parseDiffFromFile` call blocks ≤ ~300ms (200KB cap)
- The yield before each call ensures the browser can paint between files
- Files >200KB skip background prep and fall back to on-demand (current behavior) when clicked
- The expand animation is never blocked — it runs during a yield gap

**Honest accounting:** `parseDiffFromFile` still runs on the main thread. A 200KB file may block for up to ~300ms during background prep. This is acceptable because:

1. It happens BEFORE the user clicks (during panel browsing)
2. Each call is preceded by a yield (animations/clicks are serviced between files)
3. It's strictly better than the current 2-3s block on click
4. Phase 2 (Rust `similar` crate) eliminates this cost entirely

#### File eligibility filtering:

The prep service receives structured diff data (additions/deletions from `fetchDiffs`) and skips files that won't benefit from prep.

**Critical:** The same file path can appear in BOTH staged and unstaged diff arrays (e.g., a file with both staged and unstaged changes). The eligibility lookup must use a **scope+path composite key**, not path alone:

```typescript
// Build a scope-aware lookup map from structured diffs
function buildEligibilityMap(
  stagedDiffs: FileDiff[],
  unstagedDiffs: FileDiff[]
): Map<string, FileDiff> {
  const map = new Map<string, FileDiff>();
  for (const d of stagedDiffs) map.set(`staged::${d.path}`, d);
  for (const d of unstagedDiffs) map.set(`unstaged::${d.path}`, d);
  return map;
}

function isEligibleForPrep(file: FileSpec, eligibilityMap: Map<string, FileDiff>): boolean {
  const diff = eligibilityMap.get(`${file.scope}::${file.path}`);

  // No structured diff entry (e.g., conflicted files): default to eligible.
  // Content-size gate (200KB) in the parse loop provides the safety net.
  if (!diff) return true;

  // Binary files: skip (no diff to render)
  if (diff.isBinary) return false;

  // Pathological files (>10k changed lines): skip (routed to "Open in tab")
  const changedLines = countChangedLines(diff);
  if (changedLines >= PATHOLOGICAL_DIFF_THRESHOLD) return false;

  return true;
}
```

This correctly handles a file appearing in both staged (small change) and unstaged (pathological change) — the staged entry is prepped while the unstaged entry is skipped.

#### Exposed API:

```typescript
export function startDiffPrep(repoPath, files, statusRevision, structuredDiffs): Promise<void>;
export function cancelDiffPrep(): void;
export function getPreparedDiff(
  repoPath,
  scope,
  path,
  oldPath,
  statusFingerprint
): PreparedDiffEntry | undefined;
export function getInflightPromise(cacheKey): Promise<PreparedDiffEntry | null> | undefined;
```

`getInflightPromise(cacheKey)` stores per-file promises so `DiffFileCard.fetchAndPrepare` can await an in-flight prep instead of issuing a duplicate IPC.

#### Error handling:

- **Batch-level IPC rejection** (repo locked, timeout): log warning, set `batchIpcInFlight = false`, check for pending rerun. All files fall back to on-demand.
- **Per-file `parseDiffFromFile` throw**: catch, skip file, continue to next. Failed file falls back to on-demand on click.
- **Session cancelled mid-batch**: results from the cancelled batch are discarded (session.cancelled check after IPC returns).

### Step 6 — Wire prep service into useSourceControl

**File:** `apps/agent/src/components/git/source-control/hooks/use-source-control.ts`

Trigger background preparation AFTER `setStagedDiffs`/`setUnstagedDiffs` complete, using the resolved diff arrays as the source of truth for which files to prep:

```typescript
import { startDiffPrep, cancelDiffPrep } from '@/lib/utils/diff-prep-service';

// Inside fetchDiffs .then() AFTER setStagedDiffs/setUnstagedDiffs:
// Note: `status` is not in closure scope — read from store directly
const { statusRevision, status: currentStatus } = useGitStore.getState();
const conflicted = currentStatus?.conflicted ?? [];

// Build file list — conflicted files use scope 'unstaged' and have no
// structured diff entry (they're status-only). The eligibility map
// will find no match and default to eligible (prep them).
const allFiles = [
  ...staged.map((d) => ({ path: d.path, scope: 'staged' as const, oldPath: d.oldPath ?? null })),
  ...unstaged
    .filter((d) => !d.isBinary)
    .map((d) => ({ path: d.path, scope: 'unstaged' as const, oldPath: d.oldPath ?? null })),
  ...conflicted.map((e) => ({ path: e.path, scope: 'unstaged' as const, oldPath: null })),
  // Skip untracked — they expand instantly already (empty old content = trivial diff)
];

// Pass staged and unstaged diff arrays SEPARATELY for scope-aware eligibility filtering
void startDiffPrep(repo, allFiles, statusRevision, staged, unstaged);
```

Update `startDiffPrep` signature to accept separate arrays:

```typescript
export async function startDiffPrep(
  repoPath: string,
  files: FileSpec[],
  statusRevision: number,
  stagedDiffs: FileDiff[],
  unstagedDiffs: FileDiff[]
): Promise<void> {
  // Build scope-aware eligibility map from separate arrays
  const eligibilityMap = buildEligibilityMap(stagedDiffs, unstagedDiffs);
  // ... rest of prep logic
}
```

Add cleanup: `cancelDiffPrep()` on unmount.

### Step 7 — DiffFileCard: Skip SSR when workers available, preserve fallback

**File:** `apps/agent/src/components/git/source-control/components/DiffFileCard.tsx`

**Critical**: SSR prerendering must be preserved as a fallback for when the Pierre worker pool is unavailable (e.g., WKWebView fails to construct workers). The change is conditional, not unconditional removal.

Changes:

1. **Wire `workerPoolAvailable` via React context from `PierreProvider`**: `PierreProvider` already computes `workerPoolEnabled` state (line 73). Expose this via a new `PierreCapabilitiesContext` (or add to existing context). `DiffFileCard` reads it via `useContext`. This avoids re-probing `supportsPierreWorkerPool()` per card and keeps the single source of truth in `PierreProvider`.

   **File:** `apps/agent/src/providers/pierre-provider.tsx` — add context:

   ```typescript
   export const PierreCapabilitiesContext = createContext({ workerPoolAvailable: false });
   // In PierreProvider, wrap children:
   <PierreCapabilitiesContext.Provider value={{ workerPoolAvailable: workerPoolEnabled }}>
   ```

   **File:** `apps/agent/src/components/git/source-control/components/DiffFileCard.tsx` — consume:

   ```typescript
   const { workerPoolAvailable } = useContext(PierreCapabilitiesContext);
   ```

2. **Conditionally skip SSR**: `shouldPrerender = !workerPoolAvailable && diffTier === 'small'`
   - Workers available → skip SSR, Pierre workers handle highlighting natively
   - Workers unavailable → keep SSR (main-thread Shiki), same as current behavior
3. **Conditionally remove `prerenderedHTML`**: Only omit the prop when workers are available
4. **Simplify `hydratePreparedDiff`** when workers available: just return `parsed` (no SSR call)

```typescript
// In DiffFileCard or via a context/prop:
const workerPoolAvailable = supportsPierreWorkerPool(); // cached, doesn't re-probe

// In fetchAndPrepare:
const shouldPrerender = !workerPoolAvailable && diffTier === 'small';

// In JSX — when workers available, omit prerenderedHTML so Pierre uses workers:
{workerPoolAvailable ? (
  <PierreFileDiff
    fileDiff={preparedDiff.fileDiff}
    metrics={isLargeInlineDiff ? PIERRE_VIRTUAL_FILE_METRICS : undefined}
    style={PIERRE_DIFF_STYLE as CSSProperties}
    options={pierreOptions}
  />
) : (
  // Existing path with prerenderedHTML for no-worker fallback
  <PierreFileDiff
    fileDiff={preparedDiff.fileDiff}
    style={PIERRE_DIFF_STYLE as CSSProperties}
    options={pierreOptions}
    {...(preparedDiff.prerenderedHTML ? { prerenderedHTML: preparedDiff.prerenderedHTML } : {})}
  />
)}
```

5. **Add in-flight promise check** in `fetchAndPrepare`, after cache check, before scheduler dispatch:

```typescript
const inflight = getInflightPromise(parsedCacheKey);
if (inflight) {
  preloadRef.current = { key: requestKey, promise: inflight };
  const result = await inflight;
  if (result && latestRequestKeyRef.current === requestKey) return result;
}
// ... existing scheduler fallback
```

### Step 8 — Increase cache capacity

**File:** `apps/agent/src/lib/utils/pierre-diff-cache.ts`

Change `MAX_PARSED_DIFF_CACHE_ENTRIES` from `20` to `80`. With proactive prep, the cache needs to hold all currently changed files. 80 entries at ~50-100KB each ≈ 4-8MB, acceptable for desktop.

Add a secondary **byte-size bound** to prevent unbounded memory:

```typescript
export const MAX_PARSED_DIFF_CACHE_ENTRIES = 80;
export const MAX_PARSED_DIFF_CACHE_BYTES = 50_000_000; // 50MB total content

// Track total cached content bytes
let totalCachedBytes = 0;

export function setCachedParsedDiff(key: string, entry: CachedParsedDiff): void {
  const entryBytes = entry.oldContent.length + entry.newContent.length;

  // Evict until under byte limit
  while (totalCachedBytes + entryBytes > MAX_PARSED_DIFF_CACHE_BYTES && cache.size > 0) {
    const oldest = cache.keys().next().value;
    const evicted = cache.get(oldest);
    if (evicted) totalCachedBytes -= evicted.oldContent.length + evicted.newContent.length;
    cache.delete(oldest);
  }

  // ... existing entry-count LRU eviction
  cache.set(key, entry);
  totalCachedBytes += entryBytes;
}
```

This prevents pathological scenarios where 80 entries of 1MB files would consume 80MB.

### Step 9 — Bump scheduler fallback concurrency

**File:** `apps/agent/src/lib/utils/diff-scheduler.ts`

Increase content lane limit from `2` to `4` for faster fallback when batch prep hasn't completed.

---

## Edge Cases

| Scenario                                              | Handling                                                                                                                                                                                                                                                       |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User clicks before prep completes                     | `fetchAndPrepare` checks in-flight prep promise first (no duplicate IPC). If no promise, falls back to diff scheduler. Shows "Loading diff..." briefly.                                                                                                        |
| Concurrent IPC for same file                          | Prep service exposes `getInflightPromise(cacheKey)`. `fetchAndPrepare` awaits it instead of issuing duplicate `gitFileDiffContent`.                                                                                                                            |
| Git status changes while batch IPC is in Rust         | Previous session cancelled synchronously. In-flight Rust work completes but results are discarded (session.cancelled check). New batch starts via trailing rerun.                                                                                              |
| Two rapid `fetchDiffs` resolutions                    | Session cancellation is synchronous (no async gap). Second call cancels first. If batch IPC is in-flight, queued as trailing rerun.                                                                                                                            |
| Worker pool unavailable                               | SSR fallback preserved — `shouldPrerender` is true when `!workerPoolAvailable`. Same behavior as current code.                                                                                                                                                 |
| Binary files                                          | Filtered out by eligibility check using structured diff data. Batch skips them.                                                                                                                                                                                |
| Pathological diffs (>10k lines)                       | Filtered out by eligibility check. Not sent to batch. Existing "Open in tab" gate unchanged.                                                                                                                                                                   |
| Large file (>200KB combined)                          | Skipped by content-size gate in prep loop. Falls back to on-demand when clicked. Phase 2 Rust diff eliminates this limitation.                                                                                                                                 |
| File <200KB but parseDiffFromFile still slow (~300ms) | Acceptable — happens during background prep, not during click. Yield before next file ensures animations/clicks are serviced between files.                                                                                                                    |
| Same file in both staged and unstaged                 | Eligibility map keyed by `scope::path`. Each scope's diff checked independently — staged (small) may be prepped while unstaged (pathological) is skipped.                                                                                                      |
| 100+ changed files                                    | Batch IPC runs in Rust `spawn_blocking`. Frontend yields between each file. Pathological/binary filtered. First visible files ready within ~500ms.                                                                                                             |
| 100+ changed files with multi-MB contents             | Content-size gate (200KB) prevents multi-MB files from entering cache. LRU caps at 80 entries. For extra safety, add a `MAX_CACHE_BYTES = 50_000_000` (50MB) check: if total cached content exceeds this, stop prepping and let remaining files use on-demand. |
| Cleanup after trailing rerun queued                   | `cancelDiffPrep()` clears both `currentSession` AND `pendingRerun`. After unmount, no stale work can fire.                                                                                                                                                     |
| `workerPoolAvailable` wiring                          | `PierreCapabilitiesContext` created in `PierreProvider`, consumed via `useContext` in `DiffFileCard`. Single source of truth, no re-probing.                                                                                                                   |
| Repo path changes                                     | Existing `clearParsedDiffCache()` + new `cancelDiffPrep()`                                                                                                                                                                                                     |
| Individual file failure in batch                      | Per-entry error (try/catch in prep loop), rest of batch continues. Failed file falls back to on-demand.                                                                                                                                                        |
| Batch-level IPC rejection                             | Repo locked, timeout, etc. — log warning, clear in-flight flag, check trailing rerun. All files fall back to on-demand.                                                                                                                                        |
| Conflicted files                                      | Included in prep file list (mapped to `scope: 'unstaged'`). No structured diff entry exists — eligibility defaults to `true`, content-size gate provides safety.                                                                                               |
| Click during active parse slice                       | Click handler queues behind the running `parseDiffFromFile` (~150-300ms worst case with 200KB gate). Strictly better than current 2-3s. Phase 2 eliminates this entirely.                                                                                      |
| Panel browsing during prep                            | Each parse call is ≤300ms. Scroll, hover, and other interactions may stutter briefly during active slices. Acceptable trade-off vs current click-time blocking.                                                                                                |
| Renamed files                                         | `oldPath` passed through from structured diffs. Batch request includes both paths.                                                                                                                                                                             |
| Deleted files                                         | Content has empty new side. `parseDiffFromFile` handles this (all-deletions diff).                                                                                                                                                                             |
| Rapid expand/collapse during prep                     | `DiffFileCard` cleanup effect releases demand + clears `preparedDiff`. Next expand re-checks cache (now warm from prep).                                                                                                                                       |
| `parseDiffFromFile` throws                            | Per-file try/catch in prep loop. Error logged, file skipped, continues to next.                                                                                                                                                                                |

---

## Files Modified

| File                                                                       | Change                                                                                                       |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `crates/common/git/src/lib.rs`                                             | Extract content helper, add `BatchFileRequest`/`BatchFileContentResult` types, add `get_batch_file_contents` |
| `src-tauri/src/commands/common/git.rs`                                     | Add `git_batch_file_contents` command                                                                        |
| `src-tauri/src/lib.rs`                                                     | Register new command                                                                                         |
| `apps/agent/src/lib/api/git.ts`                                            | Add batch types and `gitBatchFileContents` wrapper                                                           |
| `apps/agent/src/lib/utils/diff-prep-service.ts`                            | **NEW** — background preparation service with single-flight semantics                                        |
| `apps/agent/src/lib/utils/index.ts`                                        | Export diff-prep-service                                                                                     |
| `apps/agent/src/providers/pierre-provider.tsx`                             | Add `PierreCapabilitiesContext` exposing `workerPoolAvailable`                                               |
| `apps/agent/src/components/git/source-control/hooks/use-source-control.ts` | Trigger `startDiffPrep` after fetchDiffs, pass structured diffs for filtering                                |
| `apps/agent/src/components/git/source-control/components/DiffFileCard.tsx` | Conditional SSR skip via context, in-flight promise check, preserve no-worker fallback                       |
| `apps/agent/src/lib/utils/pierre-diff-cache.ts`                            | Increase cache to 80 entries, add 50MB byte-size bound                                                       |
| `apps/agent/src/lib/utils/diff-scheduler.ts`                               | Bump content lane from 2→4                                                                                   |

---

## Verification

### Quality Checks

```bash
cargo test -p orbit-git          # Rust batch function tests
bun run typecheck                # No TS errors
bun run lint                     # Zero warnings
bun run test                     # All frontend tests pass
```

### Rust Tests

1. Create temp repo with 5 modified files → `get_batch_file_contents` returns 5 correct results
2. Include one non-existent file → batch returns 4 successes + 1 error entry
3. Include a binary file → result has `is_binary: true`
4. Include a renamed file with `old_path` → both paths resolved correctly

### Frontend Tests

1. `diff-prep-service.ts`: mock `gitBatchFileContents` and `parseDiffFromFile`, verify:
   - Files cached after `startDiffPrep`
   - Cancellation stops processing
   - Trailing rerun fires after in-flight IPC completes
   - Pathological files filtered out
   - `getInflightPromise` returns active promise during prep
2. `DiffFileCard.tsx`: verify SSR skipped when `workerPoolAvailable = true`, preserved when `false`

### Manual Testing

1. Open Source Control with 5-10 modified files → all expand instantly on click (no "Loading diff..." flash)
2. Click a file within 500ms of panel open → either instant (prep finished) or brief "Loading diff..." (fallback)
3. Stage/unstage a file → prep re-runs, expansion still instant
4. Switch branches → caches clear, prep restarts
5. Open repo with 100+ changes → UI stays responsive during background prep
6. Verify worker fallback: temporarily set `supportsPierreWorkerPool` to return `false` → SSR still works, diffs still render (slower but functional)
7. Verify Pierre worker pool logs: `Pierre worker pool active {"poolSize":4}`

### Performance Measurement

- Add `performance.mark`/`performance.measure` in `startDiffPrep` for total prep time and per-file parse time
- Chrome DevTools Performance tab: individual `parseDiffFromFile` slices should be ≤300ms (200KB gate). Verify yields between slices — the gap between slices should show idle time where clicks/animations are serviceable
- Expected: 10 modified files ready in ~500-800ms background time

---

## Future Optimization (Phase 2)

**Rust-native diff via `similar` crate**: Move Myers diff from JS (`parseDiffFromFile`) to Rust (`similar` crate). This eliminates the ~50-300ms per-file `parseDiffFromFile` cost entirely. Requires building Pierre's `FileDiffMetadata` format from Rust output or having Rust return a unified diff string that Pierre's internal parser can consume directly. This would bring per-file prep time from ~300ms to ~12ms and eliminate the per-file time budget concern entirely.
