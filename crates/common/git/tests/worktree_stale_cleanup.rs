//! Integration tests for stale git worktree cleanup behavior.

#![expect(
    clippy::tests_outside_test_module,
    reason = "Integration tests are intentionally defined in the tests/ directory"
)]

use std::error::Error;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command as StdCommand;
use std::slice;

use orbit_git::{worktree_add, worktree_list, WorktreeAddOptions, WorktreeInfo};
use tempfile::TempDir;

type TestResult<T = ()> = Result<T, Box<dyn Error + Send + Sync>>;

fn to_test_error(message: impl Into<String>) -> Box<dyn Error + Send + Sync> {
    Box::new(io::Error::other(message.into()))
}

fn run_git(args: &[&str], cwd: &Path) -> TestResult {
    let output = StdCommand::new("git")
        .args(args)
        .current_dir(cwd)
        .output()?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    Err(to_test_error(format!(
        "git {} failed in {} (status: {}). stdout: {} stderr: {}",
        args.join(" "),
        cwd.display(),
        output.status,
        stdout.trim(),
        stderr.trim(),
    )))
}

fn init_repo(repo_path: &Path) -> TestResult {
    fs::create_dir_all(repo_path)?;

    run_git(&["init"], repo_path)?;
    run_git(&["config", "user.name", "Orbit Test"], repo_path)?;
    run_git(
        &["config", "user.email", "orbit-test@example.com"],
        repo_path,
    )?;

    fs::write(repo_path.join("README.md"), "seed\n")?;
    run_git(&["add", "README.md"], repo_path)?;
    run_git(&["commit", "-m", "initial commit"], repo_path)?;

    Ok(())
}

fn canonical_or_original(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

fn contains_worktree_path(worktrees: &[WorktreeInfo], expected_path: &Path) -> bool {
    let expected = canonical_or_original(expected_path);
    worktrees.iter().any(|worktree| {
        let candidate = canonical_or_original(Path::new(&worktree.path));
        candidate == expected
    })
}

fn branch_options(name: &str) -> WorktreeAddOptions {
    WorktreeAddOptions {
        new_branch: Some(name.to_owned()),
        ..WorktreeAddOptions::default()
    }
}

#[tokio::test]
async fn list_excludes_externally_deleted_worktree() -> TestResult {
    let temp_dir = TempDir::new()?;
    let repo_path = temp_dir.path().join("repo");
    let deleted_worktree_path = temp_dir.path().join("deleted-worktree");

    init_repo(&repo_path)?;

    let added = worktree_add(
        &repo_path,
        &deleted_worktree_path,
        &branch_options("feature-delete-me"),
    )
    .await?;

    if !contains_worktree_path(slice::from_ref(&added), &deleted_worktree_path) {
        return Err(to_test_error(
            "Created worktree should match requested path",
        ));
    }

    fs::remove_dir_all(&deleted_worktree_path)?;

    let worktrees = worktree_list(&repo_path).await?;

    if contains_worktree_path(&worktrees, &deleted_worktree_path) {
        return Err(to_test_error(
            "Externally deleted worktree should not be returned by worktree_list()",
        ));
    }
    if !contains_worktree_path(&worktrees, &repo_path) {
        return Err(to_test_error(
            "Main worktree should remain in worktree_list() results",
        ));
    }

    Ok(())
}

#[tokio::test]
async fn list_succeeds_when_prune_is_noop() -> TestResult {
    let temp_dir = TempDir::new()?;
    let repo_path = temp_dir.path().join("repo");

    init_repo(&repo_path)?;

    let worktrees = worktree_list(&repo_path).await?;

    if worktrees.len() != 1 {
        return Err(to_test_error(format!(
            "Fresh repository should report only the main worktree, got {}",
            worktrees.len(),
        )));
    }
    if !contains_worktree_path(&worktrees, &repo_path) {
        return Err(to_test_error(
            "Main worktree should be present when prune is a no-op",
        ));
    }

    Ok(())
}

#[tokio::test]
async fn add_succeeds_after_external_delete_same_path() -> TestResult {
    let temp_dir = TempDir::new()?;
    let repo_path = temp_dir.path().join("repo");
    let reused_worktree_path = temp_dir.path().join("reused-worktree");

    init_repo(&repo_path)?;

    let _first_worktree = worktree_add(
        &repo_path,
        &reused_worktree_path,
        &branch_options("feature-first"),
    )
    .await?;

    fs::remove_dir_all(&reused_worktree_path)?;

    let recreated_worktree = worktree_add(
        &repo_path,
        &reused_worktree_path,
        &branch_options("feature-second"),
    )
    .await?;

    if !contains_worktree_path(slice::from_ref(&recreated_worktree), &reused_worktree_path) {
        return Err(to_test_error(
            "Recreated worktree path did not match requested path",
        ));
    }

    let worktrees = worktree_list(&repo_path).await?;
    if !contains_worktree_path(&worktrees, &reused_worktree_path) {
        return Err(to_test_error(
            "Recreated worktree should be visible in worktree_list()",
        ));
    }

    Ok(())
}
