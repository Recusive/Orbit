//! Git commands for Tauri
//!
//! These commands provide git repository operations.
//! Errors are captured to Sentry for monitoring via the `SentryCapture` trait.

#![allow(
    clippy::needless_pass_by_value,
    reason = "Tauri commands receive owned types from JSON deserialization"
)]

use std::path::Path;

use orbit_core::{Error, GitBranch, GitCommit, GitStatus, Result};
use orbit_git::{
    BlameLine, BranchDiffStats, BranchInfo, FileDiff, GitManager, WorktreeAddOptions, WorktreeInfo,
    WorktreeRemoveResult,
};
use tokio::task::spawn_blocking;

use crate::core::sentry_utils::SentryCapture as _;

/// Run a blocking git closure on a dedicated thread.
async fn spawn_git<F, T>(f: F) -> Result<T>
where
    F: FnOnce() -> Result<T> + Send + 'static,
    T: Send + 'static,
{
    spawn_blocking(f)
        .await
        .map_err(|e| Error::Other(format!("git task panicked: {e}")))?
}

/// Discover the git repository containing the given path.
///
/// Searches upward to find the repository root.
#[tauri::command]
pub async fn git_discover(path: String) -> Result<String> {
    spawn_git(move || {
        let repo_path = orbit_git::discover(Path::new(&path))?;
        Ok(repo_path.to_string_lossy().to_string())
    })
    .await
}

/// Get git repository status.
#[tauri::command]
pub async fn git_status(repo_path: String) -> Result<GitStatus> {
    spawn_git(move || {
        let manager = GitManager::new();
        manager.status(&repo_path).capture("git_status")
    })
    .await
}

/// Stage files for commit.
#[tauri::command]
pub async fn git_stage(repo_path: String, files: Vec<String>) -> Result<()> {
    spawn_git(move || {
        let manager = GitManager::new();
        manager.stage(&repo_path, &files).capture("git_stage")
    })
    .await
}

/// Unstage files.
#[tauri::command]
pub async fn git_unstage(repo_path: String, files: Vec<String>) -> Result<()> {
    spawn_git(move || {
        let manager = GitManager::new();
        manager.unstage(&repo_path, &files).capture("git_unstage")
    })
    .await
}

/// Create a commit.
#[tauri::command]
pub async fn git_commit(repo_path: String, message: String) -> Result<String> {
    spawn_git(move || {
        let manager = GitManager::new();
        manager.commit(&repo_path, &message).capture("git_commit")
    })
    .await
}

/// Get diff for changes (as unified diff string).
#[tauri::command]
pub async fn git_diff(repo_path: String, file: Option<String>) -> Result<String> {
    spawn_git(move || {
        let manager = GitManager::new();
        manager
            .diff(&repo_path, file.as_deref())
            .capture("git_diff")
    })
    .await
}

/// Get structured diff for changes.
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

/// Get staged diff (structured).
#[tauri::command]
pub async fn git_staged_diff(repo_path: String) -> Result<Vec<FileDiff>> {
    spawn_git(move || orbit_git::get_staged_diff(Path::new(&repo_path)).capture("git_staged_diff"))
        .await
}

/// Read a file at a given git ref (e.g. "HEAD", ":0:" for index).
#[tauri::command]
pub async fn git_file_at_ref(repo_path: String, file: String, git_ref: String) -> Result<String> {
    spawn_git(move || {
        orbit_git::get_file_at_ref(Path::new(&repo_path), Path::new(&file), &git_ref)
            .capture("git_file_at_ref")
    })
    .await
}

/// Get diff stats for current branch vs a base branch (e.g. "main").
///
/// Returns total additions, deletions, and files changed.
#[tauri::command]
pub async fn git_branch_diff_stats(
    repo_path: String,
    base_branch: Option<String>,
) -> Result<BranchDiffStats> {
    spawn_git(move || {
        let base = base_branch.as_deref().unwrap_or("main");
        orbit_git::branch_diff_stats(Path::new(&repo_path), base).capture("git_branch_diff_stats")
    })
    .await
}

/// Discard changes in files.
#[tauri::command]
pub async fn git_discard(repo_path: String, files: Vec<String>) -> Result<()> {
    spawn_git(move || {
        let manager = GitManager::new();
        manager.discard(&repo_path, &files).capture("git_discard")
    })
    .await
}

/// Get commit history.
#[tauri::command]
pub async fn git_log(repo_path: String, limit: Option<u32>) -> Result<Vec<GitCommit>> {
    spawn_git(move || {
        let manager = GitManager::new();
        manager.log(&repo_path, limit).capture("git_log")
    })
    .await
}

/// List branches.
#[tauri::command]
pub async fn git_branches(repo_path: String) -> Result<Vec<GitBranch>> {
    spawn_git(move || {
        let manager = GitManager::new();
        manager.branches(&repo_path).capture("git_branches")
    })
    .await
}

/// Get branch info (with more details).
#[tauri::command]
pub async fn git_branch_info(repo_path: String) -> Result<Vec<BranchInfo>> {
    spawn_git(move || orbit_git::branches(Path::new(&repo_path)).capture("git_branch_info")).await
}

/// Checkout a branch.
#[tauri::command]
pub async fn git_checkout(repo_path: String, branch: String) -> Result<()> {
    spawn_git(move || {
        let manager = GitManager::new();
        manager
            .checkout(&repo_path, &branch)
            .capture("git_checkout")
    })
    .await
}

/// Create a new branch.
#[tauri::command]
pub async fn git_create_branch(repo_path: String, name: String) -> Result<()> {
    spawn_git(move || {
        orbit_git::create_branch(Path::new(&repo_path), &name).capture("git_create_branch")
    })
    .await
}

/// Delete a branch.
#[tauri::command]
pub async fn git_delete_branch(repo_path: String, name: String) -> Result<()> {
    spawn_git(move || {
        orbit_git::delete_branch(Path::new(&repo_path), &name).capture("git_delete_branch")
    })
    .await
}

/// Get blame information for a file.
#[tauri::command]
pub async fn git_blame(repo_path: String, file: String) -> Result<Vec<BlameLine>> {
    spawn_git(move || {
        let manager = GitManager::new();
        manager.blame(&repo_path, &file).capture("git_blame")
    })
    .await
}

/// Stage all changes.
#[tauri::command]
pub async fn git_stage_all(repo_path: String) -> Result<()> {
    spawn_git(move || orbit_git::stage_all(Path::new(&repo_path)).capture("git_stage_all")).await
}

/// Push commits to the remote repository.
#[tauri::command]
pub async fn git_push(repo_path: String, remote: Option<String>) -> Result<()> {
    orbit_git::push(Path::new(&repo_path), remote.as_deref())
        .await
        .capture("git_push")
}

/// Pull changes from the remote repository.
#[tauri::command]
pub async fn git_pull(repo_path: String, remote: Option<String>) -> Result<()> {
    orbit_git::pull(Path::new(&repo_path), remote.as_deref())
        .await
        .capture("git_pull")
}

/// Fetch updates from the remote repository.
///
/// This updates remote tracking refs without modifying the working directory.
#[tauri::command]
pub async fn git_fetch(repo_path: String, remote: Option<String>) -> Result<()> {
    orbit_git::fetch(Path::new(&repo_path), remote.as_deref())
        .await
        .capture("git_fetch")
}

/// Clone a git repository to a target directory.
#[tauri::command]
pub async fn git_clone(url: String, target_path: String) -> Result<()> {
    orbit_git::clone(&url, Path::new(&target_path))
        .await
        .capture("git_clone")
}

/// List all worktrees for the repository.
#[tauri::command]
pub async fn git_worktree_list(repo_path: String) -> Result<Vec<WorktreeInfo>> {
    orbit_git::worktree_list(Path::new(&repo_path))
        .await
        .capture("git_worktree_list")
}

/// Add a new worktree.
#[tauri::command]
pub async fn git_worktree_add(
    repo_path: String,
    worktree_path: String,
    options: WorktreeAddOptions,
) -> Result<WorktreeInfo> {
    orbit_git::worktree_add(Path::new(&repo_path), Path::new(&worktree_path), &options)
        .await
        .capture("git_worktree_add")
}

/// Remove a worktree.
///
/// # Arguments
/// * `repo_path` - Path to the main repository
/// * `worktree_path` - Path to the worktree to remove
/// * `force` - Force removal even if worktree has uncommitted changes
/// * `delete_branch` - Also delete the associated branch
#[tauri::command]
pub async fn git_worktree_remove(
    repo_path: String,
    worktree_path: String,
    force: bool,
    delete_branch: bool,
) -> Result<WorktreeRemoveResult> {
    orbit_git::worktree_remove(
        Path::new(&repo_path),
        Path::new(&worktree_path),
        force,
        delete_branch,
    )
    .await
    .capture("git_worktree_remove")
}

/// Prune stale worktree entries.
///
/// Cleans up orphaned entries in `.git/worktrees/` that reference
/// worktrees whose directories no longer exist.
#[tauri::command]
pub async fn git_worktree_prune(repo_path: String) -> Result<()> {
    orbit_git::worktree_prune(Path::new(&repo_path))
        .await
        .capture("git_worktree_prune")
}
