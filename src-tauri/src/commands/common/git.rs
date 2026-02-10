//! Git commands for Tauri
//!
//! These commands provide git repository operations.
//! Errors are captured to Sentry for monitoring via the `SentryCapture` trait.

#![allow(
    clippy::needless_pass_by_value,
    reason = "Tauri commands receive owned types from JSON deserialization"
)]

use std::path::Path;

use orbit_core::{GitBranch, GitCommit, GitStatus, Result};
use orbit_git::{
    BlameLine, BranchDiffStats, BranchInfo, FileDiff, GitManager, WorktreeAddOptions, WorktreeInfo,
};

use crate::core::sentry_utils::SentryCapture as _;

/// Discover the git repository containing the given path.
///
/// Searches upward to find the repository root.
#[tauri::command]
pub fn git_discover(path: String) -> Result<String> {
    let repo_path = orbit_git::discover(Path::new(&path))?;
    Ok(repo_path.to_string_lossy().to_string())
}

/// Get git repository status.
#[tauri::command]
pub fn git_status(repo_path: String) -> Result<GitStatus> {
    let manager = GitManager::new();
    manager.status(&repo_path).capture("git_status")
}

/// Stage files for commit.
#[tauri::command]
pub fn git_stage(repo_path: String, files: Vec<String>) -> Result<()> {
    let manager = GitManager::new();
    manager.stage(&repo_path, &files).capture("git_stage")
}

/// Unstage files.
#[tauri::command]
pub fn git_unstage(repo_path: String, files: Vec<String>) -> Result<()> {
    let manager = GitManager::new();
    manager.unstage(&repo_path, &files).capture("git_unstage")
}

/// Create a commit.
#[tauri::command]
pub fn git_commit(repo_path: String, message: String) -> Result<String> {
    let manager = GitManager::new();
    manager.commit(&repo_path, &message).capture("git_commit")
}

/// Get diff for changes (as unified diff string).
#[tauri::command]
pub fn git_diff(repo_path: String, file: Option<String>) -> Result<String> {
    let manager = GitManager::new();
    manager
        .diff(&repo_path, file.as_deref())
        .capture("git_diff")
}

/// Get structured diff for changes.
#[tauri::command]
pub fn git_diff_structured(repo_path: String) -> Result<Vec<FileDiff>> {
    let manager = GitManager::new();
    manager
        .get_diff_structured(&repo_path)
        .capture("git_diff_structured")
}

/// Get staged diff (structured).
#[tauri::command]
pub fn git_staged_diff(repo_path: String) -> Result<Vec<FileDiff>> {
    orbit_git::get_staged_diff(Path::new(&repo_path)).capture("git_staged_diff")
}

/// Get diff stats for current branch vs a base branch (e.g. "main").
///
/// Returns total additions, deletions, and files changed.
#[tauri::command]
pub fn git_branch_diff_stats(
    repo_path: String,
    base_branch: Option<String>,
) -> Result<BranchDiffStats> {
    let base = base_branch.as_deref().unwrap_or("main");
    orbit_git::branch_diff_stats(Path::new(&repo_path), base).capture("git_branch_diff_stats")
}

/// Discard changes in files.
#[tauri::command]
pub fn git_discard(repo_path: String, files: Vec<String>) -> Result<()> {
    let manager = GitManager::new();
    manager.discard(&repo_path, &files).capture("git_discard")
}

/// Get commit history.
#[tauri::command]
pub fn git_log(repo_path: String, limit: Option<u32>) -> Result<Vec<GitCommit>> {
    let manager = GitManager::new();
    manager.log(&repo_path, limit).capture("git_log")
}

/// List branches.
#[tauri::command]
pub fn git_branches(repo_path: String) -> Result<Vec<GitBranch>> {
    let manager = GitManager::new();
    manager.branches(&repo_path).capture("git_branches")
}

/// Get branch info (with more details).
#[tauri::command]
pub fn git_branch_info(repo_path: String) -> Result<Vec<BranchInfo>> {
    orbit_git::branches(Path::new(&repo_path)).capture("git_branch_info")
}

/// Checkout a branch.
#[tauri::command]
pub fn git_checkout(repo_path: String, branch: String) -> Result<()> {
    let manager = GitManager::new();
    manager
        .checkout(&repo_path, &branch)
        .capture("git_checkout")
}

/// Create a new branch.
#[tauri::command]
pub fn git_create_branch(repo_path: String, name: String) -> Result<()> {
    orbit_git::create_branch(Path::new(&repo_path), &name).capture("git_create_branch")
}

/// Delete a branch.
#[tauri::command]
pub fn git_delete_branch(repo_path: String, name: String) -> Result<()> {
    orbit_git::delete_branch(Path::new(&repo_path), &name).capture("git_delete_branch")
}

/// Get blame information for a file.
#[tauri::command]
pub fn git_blame(repo_path: String, file: String) -> Result<Vec<BlameLine>> {
    let manager = GitManager::new();
    manager.blame(&repo_path, &file).capture("git_blame")
}

/// Stage all changes.
#[tauri::command]
pub fn git_stage_all(repo_path: String) -> Result<()> {
    orbit_git::stage_all(Path::new(&repo_path)).capture("git_stage_all")
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
) -> Result<()> {
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
