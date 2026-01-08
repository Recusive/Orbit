//! Git commands for Tauri
//!
//! These commands provide git repository operations.

#![allow(
    clippy::needless_pass_by_value,
    reason = "Tauri commands receive owned types from JSON deserialization"
)]

use std::path::Path;

use orbit_core::{GitBranch, GitCommit, GitStatus, Result};
use orbit_git::{BlameLine, BranchInfo, FileDiff, GitManager, WorktreeAddOptions, WorktreeInfo};

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
    manager.status(&repo_path)
}

/// Stage files for commit.
#[tauri::command]
pub fn git_stage(repo_path: String, files: Vec<String>) -> Result<()> {
    let manager = GitManager::new();
    manager.stage(&repo_path, &files)
}

/// Unstage files.
#[tauri::command]
pub fn git_unstage(repo_path: String, files: Vec<String>) -> Result<()> {
    let manager = GitManager::new();
    manager.unstage(&repo_path, &files)
}

/// Create a commit.
#[tauri::command]
pub fn git_commit(repo_path: String, message: String) -> Result<String> {
    let manager = GitManager::new();
    manager.commit(&repo_path, &message)
}

/// Get diff for changes (as unified diff string).
#[tauri::command]
pub fn git_diff(repo_path: String, file: Option<String>) -> Result<String> {
    let manager = GitManager::new();
    manager.diff(&repo_path, file.as_deref())
}

/// Get structured diff for changes.
#[tauri::command]
pub fn git_diff_structured(repo_path: String) -> Result<Vec<FileDiff>> {
    let manager = GitManager::new();
    manager.get_diff_structured(&repo_path)
}

/// Get staged diff (structured).
#[tauri::command]
pub fn git_staged_diff(repo_path: String) -> Result<Vec<FileDiff>> {
    orbit_git::get_staged_diff(Path::new(&repo_path))
}

/// Discard changes in files.
#[tauri::command]
pub fn git_discard(repo_path: String, files: Vec<String>) -> Result<()> {
    let manager = GitManager::new();
    manager.discard(&repo_path, &files)
}

/// Get commit history.
#[tauri::command]
pub fn git_log(repo_path: String, limit: Option<u32>) -> Result<Vec<GitCommit>> {
    let manager = GitManager::new();
    manager.log(&repo_path, limit)
}

/// List branches.
#[tauri::command]
pub fn git_branches(repo_path: String) -> Result<Vec<GitBranch>> {
    let manager = GitManager::new();
    manager.branches(&repo_path)
}

/// Get branch info (with more details).
#[tauri::command]
pub fn git_branch_info(repo_path: String) -> Result<Vec<BranchInfo>> {
    orbit_git::branches(Path::new(&repo_path))
}

/// Checkout a branch.
#[tauri::command]
pub fn git_checkout(repo_path: String, branch: String) -> Result<()> {
    let manager = GitManager::new();
    manager.checkout(&repo_path, &branch)
}

/// Create a new branch.
#[tauri::command]
pub fn git_create_branch(repo_path: String, name: String) -> Result<()> {
    orbit_git::create_branch(Path::new(&repo_path), &name)
}

/// Delete a branch.
#[tauri::command]
pub fn git_delete_branch(repo_path: String, name: String) -> Result<()> {
    orbit_git::delete_branch(Path::new(&repo_path), &name)
}

/// Get blame information for a file.
#[tauri::command]
pub fn git_blame(repo_path: String, file: String) -> Result<Vec<BlameLine>> {
    let manager = GitManager::new();
    manager.blame(&repo_path, &file)
}

/// Stage all changes.
#[tauri::command]
pub fn git_stage_all(repo_path: String) -> Result<()> {
    orbit_git::stage_all(Path::new(&repo_path))
}

/// Push commits to the remote repository.
#[tauri::command]
pub fn git_push(repo_path: String, remote: Option<String>) -> Result<()> {
    orbit_git::push(Path::new(&repo_path), remote.as_deref())
}

/// Pull changes from the remote repository.
#[tauri::command]
pub fn git_pull(repo_path: String, remote: Option<String>) -> Result<()> {
    orbit_git::pull(Path::new(&repo_path), remote.as_deref())
}

/// Clone a git repository to a target directory.
#[tauri::command]
pub fn git_clone(url: String, target_path: String) -> Result<()> {
    orbit_git::clone(&url, Path::new(&target_path))
}

/// List all worktrees for the repository.
#[tauri::command]
pub fn git_worktree_list(repo_path: String) -> Result<Vec<WorktreeInfo>> {
    orbit_git::worktree_list(Path::new(&repo_path))
}

/// Add a new worktree.
#[tauri::command]
pub fn git_worktree_add(
    repo_path: String,
    worktree_path: String,
    options: WorktreeAddOptions,
) -> Result<WorktreeInfo> {
    orbit_git::worktree_add(Path::new(&repo_path), Path::new(&worktree_path), &options)
}

/// Remove a worktree.
#[tauri::command]
pub fn git_worktree_remove(repo_path: String, worktree_path: String, force: bool) -> Result<()> {
    orbit_git::worktree_remove(Path::new(&repo_path), Path::new(&worktree_path), force)
}
