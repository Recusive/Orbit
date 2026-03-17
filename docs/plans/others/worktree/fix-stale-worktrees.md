# Plan: Fix stale worktrees not removed after external deletion

## Context

When a user creates a worktree in the app, then manually deletes the worktree folder via Finder (outside the app), the app still shows the worktree in the sidebar. The stale entry persists because `worktree_list()` does not prune orphaned git metadata before listing.

**Root cause**: `git worktree list --porcelain` returns entries from `.git/worktrees/` metadata even when the actual directory no longer exists on disk. The `worktree_prune()` call (which runs `git worktree prune` to clean orphaned metadata) is only called inside `worktree_add()` and `worktree_remove()` — but NOT inside `worktree_list()`. So when a worktree directory is deleted externally, stale entries persist indefinitely.

## Fix

### Step 1: Best-effort prune in `worktree_list()`

**File**: `crates/common/git/src/lib.rs:1239`

Add a **best-effort** `worktree_prune()` call at the start of `worktree_list()`, before the `git worktree list --porcelain` command. Use `if let Err` instead of `?` so that prune failures (permissions, locks) don't prevent listing from succeeding.

```rust
pub async fn worktree_list(repo_path: &Path) -> Result<Vec<WorktreeInfo>> {
    debug!(?repo_path, "Listing worktrees");

    // Best-effort prune: remove stale worktree entries before listing
    // to ensure we don't return worktrees whose directories were deleted
    // externally. Non-fatal — listing should still succeed if prune fails.
    if let Err(err) = worktree_prune(repo_path).await {
        error!(?repo_path, error = %err, "Worktree prune failed before listing; continuing");
    }

    let output = Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        // ... existing code
```

**Why best-effort**: The frontend catch handler in `loadWorktrees()` (`use-sidebar-actions.ts:213-223`) clears the entire worktree sidebar on any list failure. If prune fails due to permissions or locks but listing would otherwise succeed, propagating the prune error would unnecessarily blank the sidebar.

### Step 2: Keep pre-add prune in `worktree_add()` (NO CHANGE)

The existing `worktree_prune(repo_path).await?;` in `worktree_add()` (line 1388) must stay. It runs _before_ `git worktree add` and is required for correctness: if stale metadata still registers a deleted path, git will refuse to create a new worktree there ("already registered"). The prune in `worktree_list()` doesn't help because `worktree_add()` calls `worktree_list()` _after_ the add — too late.

This means `worktree_add()` will prune twice (once in add, once in the post-add list lookup). This is acceptable — `git worktree prune` is cheap, and correctness > performance here.

### Step 3: Add Rust integration tests

**File**: `crates/common/git/tests/worktree_stale_cleanup.rs` (new)

```rust
#[tokio::test]
async fn list_excludes_externally_deleted_worktree() {
    // 1) Create temp directory with git init + initial commit
    // 2) Create worktree via orbit_git::worktree_add()
    // 3) Delete worktree directory via std::fs::remove_dir_all()
    // 4) Call orbit_git::worktree_list()
    // 5) Assert deleted worktree path is absent from results
    // 6) Assert main worktree is still present
}

#[tokio::test]
async fn list_succeeds_when_prune_is_noop() {
    // 1) Create temp directory with git init + initial commit
    // 2) Call worktree_list() with no stale worktrees
    // 3) Assert only main worktree returned (prune is a no-op)
}

#[tokio::test]
async fn add_succeeds_after_external_delete_same_path() {
    // 1) Create temp directory with git init + initial commit
    // 2) Create worktree at path P via orbit_git::worktree_add()
    // 3) Delete P externally via std::fs::remove_dir_all()
    // 4) Call orbit_git::worktree_add(repo, P, ...) again
    // 5) Assert success and path P present in worktree_list()
}
```

### Step 4: Add `TESTED:` annotation per repo policy

**File**: `crates/common/git/src/lib.rs`

Add a `TESTED:` warning comment to `worktree_list()` doc comment linking to the new test file and run command:

```rust
/// List all worktrees for the repository.
///
/// Prunes stale worktree metadata (best-effort) before listing to ensure
/// externally deleted worktrees are excluded from results.
///
/// [warning] TESTED: This function is covered by integration tests.
///     If you modify this, run: cargo test -p orbit-git
///     Test file: crates/common/git/tests/worktree_stale_cleanup.rs
pub async fn worktree_list(repo_path: &Path) -> Result<Vec<WorktreeInfo>> {
```

## Files to modify

| File                                                | Change                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `crates/common/git/src/lib.rs`                      | Best-effort `worktree_prune()` at start of `worktree_list()` + `TESTED:` annotation |
| `crates/common/git/tests/worktree_stale_cleanup.rs` | New integration test file (3 tests)                                                 |

## No frontend changes required

The frontend (`loadWorktrees()` in `use-sidebar-actions.ts`) already:

- Validates `activeWorktreePath` against the returned worktree list (line 184-206)
- Resets to main worktree if active path is stale
- Preserves `isExpanded` state when refreshing

Once `worktree_list()` prunes before listing, externally-deleted worktrees will simply not appear in the returned list, and the existing frontend validation handles the rest.

## Recommended improvements (non-blocking)

Items from the audit that are worth considering but not required for this fix:

1. **Double-prune optimization (deferred)**: `worktree_add()` will prune twice — once in its own pre-add call, once in the post-add `worktree_list()`. If this becomes a concern at scale, add an internal `worktree_list_impl(prune: bool)` helper. Not blocking since `git worktree prune` is cheap.

2. **Prune-failure observability test**: Add a test or assertion that verifies when prune fails, the error is logged and `worktree_list()` still returns valid entries. Currently the best-effort behavior is implemented but not explicitly tested.

3. **Frontend hook tests for stale path reset**: `loadWorktrees()` in `use-sidebar-actions.ts` has untested stale `activeWorktreePath` fallback logic (lines 184-206) and zero-worktree handling (lines 173-180). Targeted hook tests would improve confidence but are not required for this backend fix.

4. **Porcelain `prunable` record filtering**: As a secondary guardrail, `parse_worktree_porcelain()` could filter out entries marked `prunable` in the porcelain output. This would keep list quality resilient even if prune is skipped or fails.

5. **Timing telemetry**: Add tracing spans with timing around prune/list subprocess calls to detect performance regressions as repo/worktree count grows.

## Verification

1. Run `cargo test -p orbit-git` — all 3 new integration tests pass
2. Run `cargo test` — no regressions across all crates
3. Build and run the app: `bunx tauri dev`
4. Open a git repo folder in the app
5. Create a worktree via the app UI
6. Go to Finder and delete the worktree folder
7. Switch back to the app — the worktree should be gone from the sidebar
8. Verify creating a new worktree at the same path still works
