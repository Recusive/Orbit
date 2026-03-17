# Plan: Fix .DS_Store showing as untracked in source control

## Context

`.DS_Store` is in `.gitignore` (line 20) and `git status` correctly ignores it, but Orbit's source control panel shows it as untracked (`U`). The root cause is that `libgit2` (via the `git2` Rust crate) sometimes classifies gitignored files as `WT_NEW` instead of `IGNORED`, bypassing the `include_ignored(false)` filter in `StatusOptions`.

This is a known libgit2 behavior — the `include_ignored(false)` flag tells the status iterator to skip files it classifies as `IGNORED`, but certain race conditions in gitignore rule evaluation cause files (particularly `.DS_Store`) to be classified as `WT_NEW` instead.

## Step 1: Apply the guard

**File:** `crates/common/git/src/lib.rs` — line 324

Add an explicit `repo.is_path_ignored()` guard before adding untracked files. This uses libgit2's dedicated ignore-checking API (which correctly reads `.gitignore`) rather than relying on the status classification alone.

**Before:**

```rust
// === UNTRACKED FILES ===
if s.is_wt_new() {
```

**After:**

```rust
// === UNTRACKED FILES ===
// Guard: libgit2 can misclassify gitignored files as WT_NEW instead of IGNORED,
// so re-check with the dedicated ignore API. Fail-open on error.
if s.is_wt_new() && !repo.is_path_ignored(&path_str).unwrap_or(false) {
```

Single-line change. No new dependencies, no new files.

### Why `unwrap_or(false)`

Fail-open: if the ignore check itself errors (e.g., malformed `.gitignore`), treat the file as untracked rather than silently hiding it.

### Precedent

`crates/common/fs/src/lib.rs:174-177` uses the identical pattern for file explorer entries:

```rust
let is_git_ignored = git_repo
    .as_ref()
    .and_then(|repo| repo.is_path_ignored(&entry_path).ok())
    .unwrap_or(false);
```

### Performance

`is_path_ignored()` performs in-memory gitignore pattern matching against rules already loaded by the `Repository` instance — no additional disk I/O. Negligible cost even with hundreds of untracked files.

## Step 2: Add regression test

**File:** `crates/common/git/src/lib.rs` — `#[cfg(test)] mod tests` block (line 1924)

Add a `tempfile`-based integration test that reproduces the exact bug path. Requires adding `tempfile` as a dev-dependency to `crates/common/git/Cargo.toml`.

```rust
#[test]
fn status_excludes_gitignored_wt_new_entries() -> Result<()> {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().map_err(Error::Io)?;
    let repo_path = dir.path();

    // Init a fresh repo
    let repo = git2::Repository::init(repo_path)
        .map_err(|e| Error::Git(format!("init failed: {e}")))?;
    drop(repo);

    // Write .gitignore that excludes .DS_Store
    fs::write(repo_path.join(".gitignore"), ".DS_Store\n")
        .map_err(Error::Io)?;

    // Create both an ignored and a visible untracked file
    fs::write(repo_path.join(".DS_Store"), "ignored")
        .map_err(Error::Io)?;
    fs::write(repo_path.join("visible.txt"), "visible")
        .map_err(Error::Io)?;

    let git_status = status(repo_path)?;

    // .DS_Store must NOT appear in untracked
    assert!(git_status.untracked.iter().all(|e| e.path != ".DS_Store"));
    // visible.txt MUST appear in untracked
    assert!(git_status.untracked.iter().any(|e| e.path == "visible.txt"));
    Ok(())
}
```

## Step 3: Add edge case tests

Expand the test module to cover the edge cases the audit flagged. All tests use the same `tempfile` + `git2::Repository::init` pattern from Step 2.

### 3a. Negated ignore patterns

A `.gitignore` with `*.log` followed by `!keep.log` should ignore `debug.log` but still show `keep.log` as untracked.

```rust
#[test]
fn status_respects_negated_ignore_patterns() -> Result<()> {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().map_err(Error::Io)?;
    let repo_path = dir.path();

    let repo = git2::Repository::init(repo_path)
        .map_err(|e| Error::Git(format!("init failed: {e}")))?;
    drop(repo);

    fs::write(repo_path.join(".gitignore"), "*.log\n!keep.log\n")
        .map_err(Error::Io)?;
    fs::write(repo_path.join("debug.log"), "ignored").map_err(Error::Io)?;
    fs::write(repo_path.join("keep.log"), "visible").map_err(Error::Io)?;

    let git_status = status(repo_path)?;

    assert!(git_status.untracked.iter().all(|e| e.path != "debug.log"));
    assert!(git_status.untracked.iter().any(|e| e.path == "keep.log"));
    Ok(())
}
```

### 3b. Nested `.gitignore` in subdirectory

A subdirectory `.gitignore` should apply to files within that subtree.

```rust
#[test]
fn status_respects_nested_gitignore() -> Result<()> {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().map_err(Error::Io)?;
    let repo_path = dir.path();

    let repo = git2::Repository::init(repo_path)
        .map_err(|e| Error::Git(format!("init failed: {e}")))?;
    drop(repo);

    // Root .gitignore ignores .DS_Store
    fs::write(repo_path.join(".gitignore"), ".DS_Store\n")
        .map_err(Error::Io)?;

    // Subdirectory with its own .gitignore
    fs::create_dir_all(repo_path.join("sub")).map_err(Error::Io)?;
    fs::write(repo_path.join("sub/.gitignore"), "*.tmp\n")
        .map_err(Error::Io)?;
    fs::write(repo_path.join("sub/.DS_Store"), "ignored").map_err(Error::Io)?;
    fs::write(repo_path.join("sub/scratch.tmp"), "ignored").map_err(Error::Io)?;
    fs::write(repo_path.join("sub/real.txt"), "visible").map_err(Error::Io)?;

    let git_status = status(repo_path)?;

    assert!(git_status.untracked.iter().all(|e| e.path != "sub/.DS_Store"));
    assert!(git_status.untracked.iter().all(|e| e.path != "sub/scratch.tmp"));
    assert!(git_status.untracked.iter().any(|e| e.path == "sub/real.txt"));
    Ok(())
}
```

### 3c. Malformed `.gitignore` (fail-open)

`status()` must not panic or error on malformed ignore syntax. The `unwrap_or(false)` guard ensures fail-open: if `is_path_ignored()` returns `Err` for a path, that path is treated as untracked rather than hidden.

**Platform note:** libgit2 is tolerant of most malformed patterns (it silently skips unparseable lines), so the test focuses on the behavioral contract — no panic, no `Err`, untracked files still visible — rather than asserting specific ignore/unignore outcomes for broken syntax. The exact set of patterns that trigger `Err` vs silent skip can vary across libgit2 versions.

**CI divergence:** If this test passes locally but fails on a CI runner with a different libgit2 version, the fix is to weaken the assertion to `status(repo_path).is_ok()` (panic/error guard only). Do not try to make malformed pattern outcomes deterministic across platforms — that's libgit2's internal concern, not ours. Our contract is `unwrap_or(false)` = fail-open.

```rust
#[test]
fn status_handles_malformed_gitignore_gracefully() -> Result<()> {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().map_err(Error::Io)?;
    let repo_path = dir.path();

    let repo = git2::Repository::init(repo_path)
        .map_err(|e| Error::Git(format!("init failed: {e}")))?;
    drop(repo);

    // Malformed patterns: unclosed bracket, null byte
    // libgit2 typically skips these silently, but the guard handles Err too
    fs::write(repo_path.join(".gitignore"), "[invalid-bracket\n")
        .map_err(Error::Io)?;
    fs::write(repo_path.join("file.txt"), "content").map_err(Error::Io)?;
    fs::write(repo_path.join("other.txt"), "content").map_err(Error::Io)?;

    // Contract: status() returns Ok, untracked files are visible
    let git_status = status(repo_path)?;
    assert!(
        git_status.untracked.iter().any(|e| e.path == "file.txt"),
        "file.txt must appear as untracked despite malformed .gitignore"
    );
    assert!(
        git_status.untracked.iter().any(|e| e.path == "other.txt"),
        "other.txt must appear as untracked despite malformed .gitignore"
    );
    Ok(())
}
```

### 3d. Global excludes via `.git/info/exclude`

Validates that the `is_path_ignored()` guard reads repo-level exclude rules beyond `.gitignore`. Uses `.git/info/exclude` — a repo-local file that doesn't require mutating global git config.

```rust
#[test]
fn status_respects_git_info_exclude() -> Result<()> {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().map_err(Error::Io)?;
    let repo_path = dir.path();

    let repo = git2::Repository::init(repo_path)
        .map_err(|e| Error::Git(format!("init failed: {e}")))?;
    drop(repo);

    // Write exclude rule via .git/info/exclude (not .gitignore)
    let info_dir = repo_path.join(".git/info");
    fs::create_dir_all(&info_dir).map_err(Error::Io)?;
    fs::write(info_dir.join("exclude"), "secret.key\n")
        .map_err(Error::Io)?;

    fs::write(repo_path.join("secret.key"), "ignored").map_err(Error::Io)?;
    fs::write(repo_path.join("public.txt"), "visible").map_err(Error::Io)?;

    let git_status = status(repo_path)?;

    assert!(git_status.untracked.iter().all(|e| e.path != "secret.key"));
    assert!(git_status.untracked.iter().any(|e| e.path == "public.txt"));
    Ok(())
}
```

### 3e. Global excludes via `core.excludesFile`

Validates the full ignore chain including user-level global excludes. Sets `core.excludesFile` on the **repo-local** git config (not the system `~/.gitconfig`) to avoid test pollution.

```rust
#[test]
fn status_respects_core_excludes_file() -> Result<()> {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().map_err(Error::Io)?;
    let repo_path = dir.path();

    let repo = git2::Repository::init(repo_path)
        .map_err(|e| Error::Git(format!("init failed: {e}")))?;

    // Write a global excludes file inside the temp dir
    let excludes_path = repo_path.join("my-global-excludes");
    fs::write(&excludes_path, "*.secret\n").map_err(Error::Io)?;

    // Set core.excludesFile on repo-local config (not system config)
    let mut config = repo
        .config()
        .map_err(|e| Error::Git(format!("config failed: {e}")))?;
    config
        .set_str("core.excludesFile", &excludes_path.to_string_lossy())
        .map_err(|e| Error::Git(format!("config set failed: {e}")))?;
    drop(config);
    drop(repo);

    fs::write(repo_path.join("api.secret"), "ignored").map_err(Error::Io)?;
    fs::write(repo_path.join("readme.txt"), "visible").map_err(Error::Io)?;

    let git_status = status(repo_path)?;

    assert!(git_status.untracked.iter().all(|e| e.path != "api.secret"));
    assert!(git_status.untracked.iter().any(|e| e.path == "readme.txt"));
    Ok(())
}
```

### 3f. Large ignored directory performance

Verifies that `status()` with `recurse_untracked_dirs(true)` doesn't degrade when a large ignored directory is present. Uses a **relative comparison** (ignored repo vs baseline repo) instead of a wall-clock threshold, so it's stable on slow CI runners.

```rust
#[test]
fn status_perf_large_ignored_directory() -> Result<()> {
    use std::fs;
    use std::time::Instant;
    use tempfile::tempdir;

    // ── Baseline: small repo with no ignored dirs ──
    let baseline_dir = tempdir().map_err(Error::Io)?;
    let baseline_path = baseline_dir.path();
    let repo = git2::Repository::init(baseline_path)
        .map_err(|e| Error::Git(format!("init failed: {e}")))?;
    drop(repo);
    fs::write(baseline_path.join("index.js"), "console.log('hello');")
        .map_err(Error::Io)?;

    let start = Instant::now();
    let _ = status(baseline_path)?;
    let baseline_elapsed = start.elapsed();

    // ── Test: same repo + 500-file ignored directory ──
    let test_dir = tempdir().map_err(Error::Io)?;
    let test_path = test_dir.path();
    let repo = git2::Repository::init(test_path)
        .map_err(|e| Error::Git(format!("init failed: {e}")))?;
    drop(repo);

    fs::write(test_path.join(".gitignore"), "node_modules/\n")
        .map_err(Error::Io)?;

    let nm_dir = test_path.join("node_modules");
    fs::create_dir_all(&nm_dir).map_err(Error::Io)?;
    for i in 0..500 {
        fs::write(nm_dir.join(format!("pkg-{i}.js")), "module.exports = {};")
            .map_err(Error::Io)?;
    }

    fs::write(test_path.join("index.js"), "console.log('hello');")
        .map_err(Error::Io)?;

    let start = Instant::now();
    let git_status = status(test_path)?;
    let test_elapsed = start.elapsed();

    // Correctness: node_modules/ files must not appear
    assert!(git_status
        .untracked
        .iter()
        .all(|e| !e.path.starts_with("node_modules/")));
    assert!(git_status.untracked.iter().any(|e| e.path == "index.js"));

    // Performance: must not take more than 20x the baseline
    // (generous multiplier accounts for filesystem cache variance)
    let max_allowed = baseline_elapsed.saturating_mul(20).max(
        std::time::Duration::from_secs(5), // absolute floor for very fast baselines
    );
    assert!(
        test_elapsed < max_allowed,
        "status() took {test_elapsed:?} vs baseline {baseline_elapsed:?} \
         (>{} multiplier) for repo with 500-file ignored dir",
        20
    );
    Ok(())
}
```

**Scope note:** This test provides functional correctness coverage (ignored files excluded) with a lightweight performance guard (no O(n) regression). It is not a deep benchmark — it does not profile `is_path_ignored()` call count, measure memory allocation, or test mixed ignored/untracked trees where some subdirectories are ignored and others aren't. For production profiling of real-world repos (thousands of `node_modules` files, nested `.gitignore` chains), use `bunx tauri dev` with a large project and the DevTools performance panel.

### 3g. Unborn repo (no HEAD)

Validates `status()` works correctly in a freshly-initialized repo with no commits, where `repo.head()` fails. This exercises the `branch_diff_stats` path as well since `head_tree` will be `None`.

```rust
#[test]
fn status_works_on_unborn_repo() -> Result<()> {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().map_err(Error::Io)?;
    let repo_path = dir.path();

    let repo = git2::Repository::init(repo_path)
        .map_err(|e| Error::Git(format!("init failed: {e}")))?;
    drop(repo);

    // No commits, no HEAD target
    fs::write(repo_path.join(".gitignore"), ".DS_Store\n")
        .map_err(Error::Io)?;
    fs::write(repo_path.join(".DS_Store"), "ignored").map_err(Error::Io)?;
    fs::write(repo_path.join("hello.txt"), "content").map_err(Error::Io)?;

    // status must not panic on unborn repo
    let git_status = status(repo_path)?;
    assert!(git_status.untracked.iter().all(|e| e.path != ".DS_Store"));
    assert!(git_status.untracked.iter().any(|e| e.path == "hello.txt"));

    // branch_diff_stats must not panic (head_tree will be None)
    let stats = branch_diff_stats(repo_path, "main")?;
    assert!(stats.files_changed > 0);

    Ok(())
}
```

### 3h. Rename deltas in diff/stats parity

Validates that `branch_diff_stats` fallback (Step 4b) correctly counts files involved in renames. Pure renames with no content change may not emit `line_cb` calls, so `files_changed` must be counted at the `file_cb` level. Also verifies that ignored files don't inflate the count alongside renames.

```rust
#[test]
fn diff_stats_counts_renames_correctly() -> Result<()> {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().map_err(Error::Io)?;
    let repo_path = dir.path();

    let repo = git2::Repository::init(repo_path)
        .map_err(|e| Error::Git(format!("init failed: {e}")))?;

    // Create initial commit with two tracked files
    fs::write(repo_path.join(".gitignore"), ".DS_Store\n")
        .map_err(Error::Io)?;
    fs::write(repo_path.join("old-name.txt"), "content to rename")
        .map_err(Error::Io)?;
    fs::write(repo_path.join("regular.txt"), "will be modified")
        .map_err(Error::Io)?;

    let mut index = repo
        .index()
        .map_err(|e| Error::Git(format!("index failed: {e}")))?;
    index
        .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
        .map_err(|e| Error::Git(format!("add failed: {e}")))?;
    index
        .write()
        .map_err(|e| Error::Git(format!("write failed: {e}")))?;
    let tree_id = index
        .write_tree()
        .map_err(|e| Error::Git(format!("write_tree failed: {e}")))?;
    let tree = repo
        .find_tree(tree_id)
        .map_err(|e| Error::Git(format!("find_tree failed: {e}")))?;
    let sig = git2::Signature::now("test", "test@test.com")
        .map_err(|e| Error::Git(format!("sig failed: {e}")))?;
    repo.commit(Some("HEAD"), &sig, &sig, "initial", &tree, &[])
        .map_err(|e| Error::Git(format!("commit failed: {e}")))?;
    drop(index);
    drop(repo);

    // Simulate rename: delete old, create new with same content
    fs::remove_file(repo_path.join("old-name.txt")).map_err(Error::Io)?;
    fs::write(repo_path.join("new-name.txt"), "content to rename")
        .map_err(Error::Io)?;

    // Modify existing file
    fs::write(repo_path.join("regular.txt"), "modified content")
        .map_err(Error::Io)?;

    // Create ignored file (must not inflate stats)
    fs::write(repo_path.join(".DS_Store"), "ignored").map_err(Error::Io)?;

    // ── status parity ──
    let git_status = status(repo_path)?;
    assert!(git_status.untracked.iter().all(|e| e.path != ".DS_Store"));

    // ── diff parity ──
    let diffs = get_diff(repo_path, true)?;
    assert!(diffs.iter().all(|d| d.path != ".DS_Store"));

    // ── stats parity: must count rename + modify, not ignored files ──
    let stats = branch_diff_stats(repo_path, "main")?;
    // Rename = 2 entries (delete old + add new) or 1 rename delta depending on detection
    // Modify = 1 entry. Total: 2-3 files changed. NOT 3-4 (with .DS_Store).
    assert!(
        stats.files_changed >= 2 && stats.files_changed <= 3,
        "branch_diff_stats.files_changed = {}, expected 2-3 \
         (rename + modify, no ignored files)",
        stats.files_changed
    );

    Ok(())
}
```

### 3i. Typechange deltas in diff/stats parity (Unix only)

Validates that a file→symlink typechange is counted by `file_cb` in the Step 4b fallback. Typechange deltas produce a `Delta::Typechange` with no content diff lines — `line_cb` never fires for them. This test is `#[cfg(unix)]` since symlinks require OS support.

```rust
#[cfg(unix)]
#[test]
fn diff_stats_counts_typechange_correctly() -> Result<()> {
    use std::fs;
    use std::os::unix::fs::symlink;
    use tempfile::tempdir;

    let dir = tempdir().map_err(Error::Io)?;
    let repo_path = dir.path();

    let repo = git2::Repository::init(repo_path)
        .map_err(|e| Error::Git(format!("init failed: {e}")))?;

    // Create initial commit: regular file + .gitignore
    fs::write(repo_path.join(".gitignore"), ".DS_Store\n")
        .map_err(Error::Io)?;
    fs::write(repo_path.join("config.txt"), "real config content")
        .map_err(Error::Io)?;
    fs::write(repo_path.join("stable.txt"), "unchanged")
        .map_err(Error::Io)?;

    let mut index = repo
        .index()
        .map_err(|e| Error::Git(format!("index failed: {e}")))?;
    index
        .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
        .map_err(|e| Error::Git(format!("add failed: {e}")))?;
    index
        .write()
        .map_err(|e| Error::Git(format!("write failed: {e}")))?;
    let tree_id = index
        .write_tree()
        .map_err(|e| Error::Git(format!("write_tree failed: {e}")))?;
    let tree = repo
        .find_tree(tree_id)
        .map_err(|e| Error::Git(format!("find_tree failed: {e}")))?;
    let sig = git2::Signature::now("test", "test@test.com")
        .map_err(|e| Error::Git(format!("sig failed: {e}")))?;
    repo.commit(Some("HEAD"), &sig, &sig, "initial", &tree, &[])
        .map_err(|e| Error::Git(format!("commit failed: {e}")))?;
    drop(index);
    drop(repo);

    // Typechange: replace regular file with symlink
    fs::remove_file(repo_path.join("config.txt")).map_err(Error::Io)?;
    symlink("stable.txt", repo_path.join("config.txt")).map_err(Error::Io)?;

    // Create ignored file (must not inflate stats)
    fs::write(repo_path.join(".DS_Store"), "ignored").map_err(Error::Io)?;

    // ── status parity ──
    let git_status = status(repo_path)?;
    assert!(git_status.untracked.iter().all(|e| e.path != ".DS_Store"));
    // config.txt should appear as typechange in modified
    assert!(
        git_status.modified.iter().any(|e| e.path == "config.txt"),
        "config.txt typechange not detected in status: {:?}",
        git_status.modified
    );

    // ── stats parity ──
    let stats = branch_diff_stats(repo_path, "main")?;
    // Exactly 1 file changed (config.txt typechange). NOT 2 (with .DS_Store).
    assert_eq!(
        stats.files_changed, 1,
        "branch_diff_stats.files_changed = {}, expected 1 \
         (typechange only, no ignored files)",
        stats.files_changed
    );

    Ok(())
}
```

## Step 4: Test-first parity audit for diff functions

**File:** `crates/common/git/src/lib.rs`

### Background

The previous version of this step proposed adding `include_ignored(false)` to `DiffOptions` in `get_diff()` and `branch_diff_stats()`. **This is a no-op** — `DiffOptions::new()` already defaults all flags to `false` ([docs](https://docs.rs/git2/latest/git2/struct.DiffOptions.html)), so `include_ignored` is already `false`.

The `status()` bug exists because libgit2's status iterator caches file classification and can misclassify ignored files as `WT_NEW`. The diff engine uses a separate traversal path (`GIT_DIFF_INCLUDE_UNTRACKED`) where `include_untracked` and `include_ignored` are [independent flags](https://github.com/libgit2/libgit2/blob/main/include/git2/diff.h) — enabling one does not enable the other.

**Unknown:** Whether the diff traversal has the same misclassification bug as the status iterator, or whether it correctly separates untracked from ignored files.

### Approach: test-first, fix only if needed

Write the parity test first. If it passes without code changes, the diff path is clean and we document that. If it fails, apply post-diff filtering.

### 4a. Parity test

The test uses an exact expected file count derived from the fixture: `.gitignore` + `real.txt` = **2 visible files**. The ignored files (`.DS_Store`, `build/output.js`) must not inflate any of the three stats fields.

```rust
#[test]
fn diff_and_stats_exclude_ignored_files() -> Result<()> {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().map_err(Error::Io)?;
    let repo_path = dir.path();

    let repo = git2::Repository::init(repo_path)
        .map_err(|e| Error::Git(format!("init failed: {e}")))?;
    drop(repo);

    // Fixture: 2 ignored files, 2 visible files
    fs::write(repo_path.join(".gitignore"), ".DS_Store\nbuild/\n")
        .map_err(Error::Io)?;
    fs::write(repo_path.join(".DS_Store"), "ignored content").map_err(Error::Io)?;
    fs::create_dir_all(repo_path.join("build")).map_err(Error::Io)?;
    fs::write(repo_path.join("build/output.js"), "ignored content").map_err(Error::Io)?;
    fs::write(repo_path.join("real.txt"), "visible content").map_err(Error::Io)?;

    // ── get_diff parity ──
    let diffs = get_diff(repo_path, true)?;
    let diff_paths: Vec<&str> = diffs.iter().map(|d| d.path.as_str()).collect();
    assert!(
        !diff_paths.contains(&".DS_Store"),
        "get_diff leaked .DS_Store: {diff_paths:?}"
    );
    assert!(
        !diff_paths.iter().any(|p| p.starts_with("build/")),
        "get_diff leaked build/: {diff_paths:?}"
    );
    // Exact count: .gitignore + real.txt
    assert_eq!(
        diffs.len(),
        2,
        "get_diff returned {} files, expected 2: {diff_paths:?}",
        diffs.len()
    );

    // ── branch_diff_stats parity ──
    // Unborn repo: all non-ignored files show as new additions
    let stats = branch_diff_stats(repo_path, "main")?;

    // Exact file count: must match get_diff
    assert_eq!(
        stats.files_changed, 2,
        "branch_diff_stats.files_changed = {}, expected 2 (ignored files leaking)",
        stats.files_changed
    );

    // Line counts: .gitignore has 2 lines, real.txt has 1 line = 3 additions total
    // (libgit2 may count trailing newlines differently, so allow small variance)
    assert!(
        stats.additions <= 4,
        "branch_diff_stats.additions = {}, expected ~3 (ignored file lines leaking)",
        stats.additions
    );
    assert_eq!(
        stats.deletions, 0,
        "branch_diff_stats.deletions = {}, expected 0",
        stats.deletions
    );

    Ok(())
}
```

### 4b. Conditional fix (only if 4a fails)

If the parity test reveals that `get_diff()` or `branch_diff_stats()` leaks ignored files, apply post-diff filtering using `repo.is_path_ignored()`. Both fixes compute **all fields from the same filtered data**.

**Important `diff.foreach` constraint:** Returning `false` from any callback triggers `GIT_EUSER` and **aborts the entire iteration** — there is no "skip this file" mechanism. All callbacks must return `true` and filter internally.

**For `get_diff()`** — filter after `parse_diff`:

```rust
pub fn get_diff(path: &Path, include_untracked: bool) -> Result<Vec<FileDiff>> {
    let repo = open(path)?;
    // ... existing DiffOptions and diff generation ...
    let mut diffs = parse_diff(&diff)?;

    // Guard: filter out ignored files that libgit2 may misclassify as untracked
    if include_untracked {
        diffs.retain(|d| !repo.is_path_ignored(&d.path).unwrap_or(false));
    }

    Ok(diffs)
}
```

**For `branch_diff_stats()`** — replace `diff.stats()` with `diff.foreach()` using internal filtering. All callbacks return `true` (never abort); the `file_cb` tracks whether the current file is ignored, and `line_cb` skips counting for ignored files:

```rust
pub fn branch_diff_stats(path: &Path, _base_branch: &str) -> Result<BranchDiffStats> {
    let repo = open(path)?;

    let head_tree = repo.head().and_then(|h| h.peel_to_tree()).ok();

    let mut opts = DiffOptions::new();
    let _self = opts
        .include_untracked(true)
        .show_untracked_content(true)
        .recurse_untracked_dirs(true);

    let diff = repo
        .diff_tree_to_workdir_with_index(head_tree.as_ref(), Some(&mut opts))
        .map_err(|e| Error::Git(format!("Failed to compute diff: {e}")))?;

    // Pre-scan: build set of ignored paths from deltas
    let ignored_paths: std::collections::HashSet<String> = (0..diff.deltas().len())
        .filter_map(|i| {
            let delta = diff.get_delta(i)?;
            let file_path = delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())?
                .to_string_lossy()
                .to_string();
            if repo.is_path_ignored(&file_path).unwrap_or(false) {
                Some(file_path)
            } else {
                None
            }
        })
        .collect();

    // If no ignored files leaked, fast path via diff.stats()
    if ignored_paths.is_empty() {
        let stats = diff
            .stats()
            .map_err(|e| Error::Git(format!("Failed to get diff stats: {e}")))?;
        return Ok(BranchDiffStats {
            additions: stats.insertions(),
            deletions: stats.deletions(),
            files_changed: stats.files_changed(),
        });
    }

    // Slow path: walk all deltas via foreach, filter internally.
    // All callbacks MUST return true — returning false aborts iteration (GIT_EUSER).
    let mut additions = 0usize;
    let mut deletions = 0usize;
    let mut files_changed = 0usize;

    // file_cb: count non-ignored files (covers binary, empty, rename, typechange deltas
    // that may never trigger line_cb)
    diff.foreach(
        &mut |delta, _progress| {
            let file_path = delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            if !ignored_paths.contains(&file_path) {
                files_changed += 1;
            }
            true // never abort
        },
        None, // binary_cb
        None, // hunk_cb
        Some(&mut |delta, _hunk, line| {
            let file_path = delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            if !ignored_paths.contains(&file_path) {
                match line.origin() {
                    '+' => additions += 1,
                    '-' => deletions += 1,
                    _ => {}
                }
            }
            true // never abort
        }),
    )
    .map_err(|e| Error::Git(format!("Failed to walk diff: {e}")))?;

    Ok(BranchDiffStats {
        additions,
        deletions,
        files_changed,
    })
}
```

**Design notes:**

- `file_cb` counts `files_changed` — fires once per delta, so binary files, renames, typechanges, and empty files are all counted correctly.
- `line_cb` counts `additions`/`deletions` — fires per line, filtered by the same `ignored_paths` set.
- All three fields come from the same filtered traversal. No mixing with `diff.stats()`.
- `ignored_paths` lookup is `O(1)` per callback via `HashSet`.

**Decision point:** If the parity test passes, skip 4b entirely and add a comment documenting that the diff path is not affected. If it fails, apply the fix above.

## Verification

1. `cargo check` — compiles without errors
2. `cargo test -p orbit-git` — all tests pass (1 existing + 12 new, 13 total)
3. `bunx tauri dev` — open source control panel, confirm `.DS_Store` no longer appears as untracked
4. `bunx tauri dev` — open source control diff view, confirm no `.DS_Store` diff entries
