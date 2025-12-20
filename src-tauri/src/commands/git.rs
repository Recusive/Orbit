//! Git commands

use snowflake_core::{GitBranch, GitCommit, GitStatus, Result};
use snowflake_git::GitManager;
use std::sync::OnceLock;

static GIT_MANAGER: OnceLock<GitManager> = OnceLock::new();

fn get_git_manager() -> &'static GitManager {
    GIT_MANAGER.get_or_init(GitManager::new)
}

/// Get git repository status
#[tauri::command]
pub async fn git_status(repo_path: String) -> Result<GitStatus> {
    get_git_manager().status(&repo_path).await
}

/// Stage files for commit
#[tauri::command]
pub async fn git_stage(repo_path: String, files: Vec<String>) -> Result<()> {
    get_git_manager().stage(&repo_path, &files).await
}

/// Unstage files
#[tauri::command]
pub async fn git_unstage(repo_path: String, files: Vec<String>) -> Result<()> {
    get_git_manager().unstage(&repo_path, &files).await
}

/// Create a commit
#[tauri::command]
pub async fn git_commit(repo_path: String, message: String) -> Result<String> {
    get_git_manager().commit(&repo_path, &message).await
}

/// Get diff for changes
#[tauri::command]
pub async fn git_diff(repo_path: String, file: Option<String>) -> Result<String> {
    get_git_manager().diff(&repo_path, file.as_deref()).await
}

/// Get commit history
#[tauri::command]
pub async fn git_log(repo_path: String, limit: Option<u32>) -> Result<Vec<GitCommit>> {
    get_git_manager().log(&repo_path, limit).await
}

/// List branches
#[tauri::command]
pub async fn git_branches(repo_path: String) -> Result<Vec<GitBranch>> {
    get_git_manager().branches(&repo_path).await
}

/// Checkout a branch
#[tauri::command]
pub async fn git_checkout(repo_path: String, branch: String) -> Result<()> {
    get_git_manager().checkout(&repo_path, &branch).await
}
