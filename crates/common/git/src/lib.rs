//! Orbit Git - Git operations
//!
//! This crate provides git functionality using the git2 library.

use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use tokio::process::Command;
use tokio::time::timeout;

use git2::{
    BlameOptions, Delta, DiffOptions, IndexAddOption, Repository, StatusOptions, StatusShow,
};
use orbit_core::{Error, FileStatus, GitBranch, GitCommit, GitStatus, Result, StatusEntry};
use serde::{Deserialize, Serialize};
use tracing::{debug, error, info};

// ============================================
// Additional Types (not in orbit-core)
// ============================================

/// A single line in a diff.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    /// Line origin character ('+', '-', ' ').
    pub origin: char,
    /// Line content.
    pub content: String,
    /// Old line number (if applicable).
    pub old_line: Option<u32>,
    /// New line number (if applicable).
    pub new_line: Option<u32>,
}

/// A hunk in a diff.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    /// Hunk header (e.g., "@@ -1,5 +1,6 @@").
    pub header: String,
    /// Lines in this hunk.
    pub lines: Vec<DiffLine>,
}

/// Diff for a single file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    /// File path.
    pub path: String,
    /// Old path (for renames).
    pub old_path: Option<String>,
    /// Hunks in the diff.
    pub hunks: Vec<DiffHunk>,
    /// Whether this is a binary file.
    pub is_binary: bool,
}

/// Branch information.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    /// Branch name.
    pub name: String,
    /// Whether this is the current branch.
    pub is_current: bool,
    /// Upstream tracking branch name.
    pub upstream: Option<String>,
}

/// Commit information.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    /// Full commit hash.
    pub hash: String,
    /// Short commit hash (7 chars).
    pub short_hash: String,
    /// Commit message (first line only).
    pub message: String,
    /// Author name.
    pub author: String,
    /// Author email.
    pub email: String,
    /// Commit timestamp (Unix seconds).
    pub timestamp: i64,
}

/// A single line of blame output.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlameLine {
    /// Line number (1-indexed).
    pub line_number: usize,
    /// Commit hash that last modified this line.
    pub commit_hash: String,
    /// Author of the last modification.
    pub author: String,
    /// Line content.
    pub content: String,
}

/// Information about a git worktree.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    /// Absolute path to the worktree directory.
    pub path: String,
    /// Full commit hash of HEAD.
    pub head: String,
    /// Short commit hash (7 chars).
    pub short_head: String,
    /// Branch name (without refs/heads/ prefix), None if detached.
    pub branch: Option<String>,
    /// Whether this is the main worktree.
    pub is_main: bool,
    /// Whether HEAD is detached.
    pub is_detached: bool,
    /// Lock status - None if unlocked, Some(reason) if locked.
    pub locked: Option<String>,
}

/// Options for creating a new worktree.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct WorktreeAddOptions {
    /// Create a new branch with this name (-b flag).
    pub new_branch: Option<String>,
    /// Force create/reset branch (-B flag).
    pub force_branch: bool,
    /// Create detached worktree (--detach).
    pub detach: bool,
    /// Commit/branch/tag to checkout (defaults to HEAD).
    pub commit_ish: Option<String>,
}

// ============================================
// Repository Operations
// ============================================

/// Open a git repository at the given path.
///
/// # Errors
/// Returns an error if the path is not a git repository.
pub fn open(path: &Path) -> Result<Repository> {
    Repository::open(path).map_err(|e| Error::Git(format!("Failed to open repository: {e}")))
}

/// Discover the git repository containing the given path.
///
/// Searches upward from the given path to find the repository root.
///
/// # Errors
/// Returns an error if no repository is found.
pub fn discover(path: &Path) -> Result<PathBuf> {
    Repository::discover(path)
        .map(|repo| {
            repo.workdir()
                .map_or_else(|| repo.path().to_path_buf(), Path::to_path_buf)
        })
        .map_err(|e| Error::Git(format!("Failed to discover repository: {e}")))
}

/// Get the status of a git repository with detailed file information.
///
/// # Errors
/// Returns an error if the repository cannot be opened or status cannot be retrieved.
#[expect(
    clippy::cognitive_complexity,
    clippy::too_many_lines,
    reason = "Git status gathering is inherently complex with many checks"
)]
pub fn status(path: &Path) -> Result<GitStatus> {
    debug!(?path, "Getting git status");

    let repo = open(path)?;
    let mut result = GitStatus::default();

    // Get current branch and upstream info
    if let Ok(head) = repo.head() {
        if head.is_branch() {
            // Regular branch
            if let Some(name) = head.shorthand() {
                name.clone_into(&mut result.branch);
            }

            // Get upstream tracking info (only for branches)
            if let Some(name) = head.shorthand() {
                if let Ok(branch) = repo.find_branch(name, git2::BranchType::Local) {
                    if let Ok(upstream) = branch.upstream() {
                        if let Ok(Some(upstream_name)) = upstream.name() {
                            result.upstream = Some(upstream_name.to_owned());
                        }

                        // Get ahead/behind counts
                        if let (Ok(local_oid), Ok(upstream_oid)) = (
                            head.peel_to_commit().map(|c| c.id()),
                            upstream.get().peel_to_commit().map(|c| c.id()),
                        ) {
                            if let Ok((ahead, behind)) =
                                repo.graph_ahead_behind(local_oid, upstream_oid)
                            {
                                result.ahead = u32::try_from(ahead).unwrap_or(u32::MAX);
                                result.behind = u32::try_from(behind).unwrap_or(u32::MAX);
                            }
                        }
                    }
                }
            }
        } else if let Some(oid) = head.target() {
            // Detached HEAD - show short commit hash
            result.branch = format!("HEAD@{}", &oid.to_string()[..7]);
        }
    }

    // Get file statuses with rename detection
    let mut opts = StatusOptions::new();
    let _self = opts
        .show(StatusShow::IndexAndWorkdir)
        .include_untracked(true)
        .include_ignored(false)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true)
        .renames_from_rewrites(true);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| Error::Git(format!("Failed to get status: {e}")))?;

    for entry in statuses.iter() {
        // Skip entries with empty or invalid paths
        let Some(path_str) = entry.path().map(String::from) else {
            continue;
        };
        if path_str.is_empty() {
            continue;
        }

        let s = entry.status();

        // === CONFLICTED FILES (check first) ===
        if s.is_conflicted() {
            result
                .conflicted
                .push(StatusEntry::new(&path_str, FileStatus::Conflicted));
            continue; // Don't add conflicted files to other categories
        }

        // === INDEX (STAGED) CHANGES ===
        if s.is_index_new() {
            result
                .staged
                .push(StatusEntry::new(&path_str, FileStatus::Added));
        } else if s.is_index_modified() {
            result
                .staged
                .push(StatusEntry::new(&path_str, FileStatus::Modified));
        } else if s.is_index_deleted() {
            result
                .staged
                .push(StatusEntry::new(&path_str, FileStatus::Deleted));
        } else if s.is_index_renamed() {
            let (old_path, similarity) = get_rename_info(&entry, true);
            result.staged.push(StatusEntry::renamed(
                old_path.unwrap_or_default(),
                &path_str,
                similarity,
            ));
        } else if s.is_index_typechange() {
            result
                .staged
                .push(StatusEntry::new(&path_str, FileStatus::TypeChange));
        }

        // === WORKING TREE (UNSTAGED) CHANGES ===
        if s.is_wt_modified() {
            result
                .modified
                .push(StatusEntry::new(&path_str, FileStatus::Modified));
        } else if s.is_wt_deleted() {
            result
                .modified
                .push(StatusEntry::new(&path_str, FileStatus::Deleted));
        } else if s.is_wt_renamed() {
            let (old_path, similarity) = get_rename_info(&entry, false);
            result.modified.push(StatusEntry::renamed(
                old_path.unwrap_or_default(),
                &path_str,
                similarity,
            ));
        } else if s.is_wt_typechange() {
            result
                .modified
                .push(StatusEntry::new(&path_str, FileStatus::TypeChange));
        }

        // === UNTRACKED FILES ===
        if s.is_wt_new() {
            result
                .untracked
                .push(StatusEntry::new(&path_str, FileStatus::Untracked));
        }
    }

    // Log if there are conflicts
    if !result.conflicted.is_empty() {
        debug!("Found {} conflicted files", result.conflicted.len());
    }

    Ok(result)
}

/// Extract rename info from a status entry.
///
/// Note: The git2 crate doesn't expose similarity scores directly,
/// so we return None for similarity.
fn get_rename_info(entry: &git2::StatusEntry<'_>, index: bool) -> (Option<String>, Option<u8>) {
    let diff_delta = if index {
        entry.head_to_index()
    } else {
        entry.index_to_workdir()
    };

    diff_delta.map_or((None, None), |delta| {
        let old_path = delta
            .old_file()
            .path()
            .and_then(|p| p.to_str())
            .map(String::from);

        // Note: git2 crate doesn't expose similarity scores from DiffDelta
        (old_path, None)
    })
}

/// Stage files for commit.
///
/// # Errors
/// Returns an error if staging fails.
pub fn stage(path: &Path, files: &[&Path]) -> Result<()> {
    let repo = open(path)?;
    let mut index = repo
        .index()
        .map_err(|e| Error::Git(format!("Failed to get index: {e}")))?;

    for file in files {
        let relative_path = if file.is_absolute() {
            file.strip_prefix(path).unwrap_or(file)
        } else {
            file
        };

        index
            .add_path(relative_path)
            .map_err(|e| Error::Git(format!("Failed to stage {}: {e}", relative_path.display())))?;
    }

    index
        .write()
        .map_err(|e| Error::Git(format!("Failed to write index: {e}")))?;

    debug!("Staged {} files", files.len());
    Ok(())
}

/// Unstage files.
///
/// # Errors
/// Returns an error if unstaging fails.
pub fn unstage(path: &Path, files: &[&Path]) -> Result<()> {
    let repo = open(path)?;
    let head = repo.head().and_then(|h| h.peel_to_commit()).ok();

    let head_tree = head.as_ref().and_then(|c| c.tree().ok());

    for file in files {
        let relative_path = if file.is_absolute() {
            file.strip_prefix(path).unwrap_or(file)
        } else {
            file
        };

        // Reset the file to HEAD state
        if let Some(tree) = &head_tree {
            repo.reset_default(Some(&tree.as_object().clone()), [relative_path])
                .map_err(|e| {
                    Error::Git(format!(
                        "Failed to unstage {}: {e}",
                        relative_path.display()
                    ))
                })?;
        } else {
            // No HEAD commit, remove from index entirely
            let mut index = repo
                .index()
                .map_err(|e| Error::Git(format!("Failed to get index: {e}")))?;
            let _result = index.remove_path(relative_path);
            index
                .write()
                .map_err(|e| Error::Git(format!("Failed to write index: {e}")))?;
        }
    }

    debug!("Unstaged {} files", files.len());
    Ok(())
}

/// Stage all changes.
///
/// # Errors
/// Returns an error if staging fails.
pub fn stage_all(path: &Path) -> Result<()> {
    let repo = open(path)?;
    let mut index = repo
        .index()
        .map_err(|e| Error::Git(format!("Failed to get index: {e}")))?;

    index
        .add_all(["."], IndexAddOption::DEFAULT, None)
        .map_err(|e| Error::Git(format!("Failed to stage all: {e}")))?;

    index
        .write()
        .map_err(|e| Error::Git(format!("Failed to write index: {e}")))?;

    debug!("Staged all changes");
    Ok(())
}

/// Create a commit with the staged changes.
///
/// # Errors
/// Returns an error if the commit fails or if the message is empty.
pub fn commit(path: &Path, message: &str) -> Result<String> {
    // Validate message
    let message = message.trim();
    if message.is_empty() {
        return Err(Error::Git("Commit message cannot be empty".to_owned()));
    }

    let repo = open(path)?;

    // Get the index
    let mut index = repo
        .index()
        .map_err(|e| Error::Git(format!("Failed to get index: {e}")))?;

    // Write the index as a tree
    let tree_oid = index
        .write_tree()
        .map_err(|e| Error::Git(format!("Failed to write tree: {e}")))?;
    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| Error::Git(format!("Failed to find tree: {e}")))?;

    // Get the signature
    let sig = repo
        .signature()
        .map_err(|e| Error::Git(format!("Failed to get signature: {e}")))?;

    // Get parent commits
    let parents: Vec<git2::Commit<'_>> = match repo.head() {
        Ok(head) => {
            vec![head
                .peel_to_commit()
                .map_err(|e| Error::Git(format!("Failed to get HEAD commit: {e}")))?]
        },
        Err(_) => Vec::new(), // Initial commit
    };

    let parent_refs: Vec<&git2::Commit<'_>> = parents.iter().collect();

    // Create the commit
    let oid = repo
        .commit(Some("HEAD"), &sig, &sig, message, &tree, &parent_refs)
        .map_err(|e| Error::Git(format!("Failed to create commit: {e}")))?;

    debug!(hash = %oid, "Created commit");
    Ok(oid.to_string())
}

/// Get the diff of unstaged changes.
///
/// # Errors
/// Returns an error if the diff cannot be retrieved.
pub fn get_diff(path: &Path) -> Result<Vec<FileDiff>> {
    let repo = open(path)?;

    let mut opts = DiffOptions::new();
    let _self = opts.include_untracked(true);

    // Diff between index and workdir (unstaged changes)
    let diff = repo
        .diff_index_to_workdir(None, Some(&mut opts))
        .map_err(|e| Error::Git(format!("Failed to get diff: {e}")))?;

    parse_diff(&diff)
}

/// Get the diff of staged changes.
///
/// # Errors
/// Returns an error if the diff cannot be retrieved.
pub fn get_staged_diff(path: &Path) -> Result<Vec<FileDiff>> {
    let repo = open(path)?;

    // Get HEAD tree
    let head_tree = repo.head().and_then(|h| h.peel_to_tree()).ok();

    // Diff between HEAD and index (staged changes)
    let diff = repo
        .diff_tree_to_index(head_tree.as_ref(), None, None)
        .map_err(|e| Error::Git(format!("Failed to get staged diff: {e}")))?;

    parse_diff(&diff)
}

/// Get the diff for a specific file.
///
/// # Errors
/// Returns an error if the diff cannot be retrieved.
pub fn get_file_diff(path: &Path, file: &Path) -> Result<FileDiff> {
    let repo = open(path)?;

    let relative_path = if file.is_absolute() {
        file.strip_prefix(path).unwrap_or(file)
    } else {
        file
    };

    let mut opts = DiffOptions::new();
    let _self = opts.pathspec(relative_path);

    // Get unstaged diff for this file
    let diff = repo
        .diff_index_to_workdir(None, Some(&mut opts))
        .map_err(|e| Error::Git(format!("Failed to get file diff: {e}")))?;

    let diffs = parse_diff(&diff)?;
    diffs.into_iter().next().ok_or_else(|| {
        Error::Git(format!(
            "No diff found for file: {}",
            relative_path.display()
        ))
    })
}

/// Discard changes in files.
///
/// This restores files to their state in HEAD. For deleted files, this will
/// recreate them. For modified files, this will revert the changes.
///
/// # Errors
/// Returns an error if discarding fails.
pub fn discard_changes(path: &Path, files: &[&Path]) -> Result<()> {
    let repo = open(path)?;

    // Get HEAD tree for restoring deleted files
    let head_tree = repo.head().and_then(|h| h.peel_to_tree()).ok();

    for file in files {
        let relative_path = if file.is_absolute() {
            file.strip_prefix(path).unwrap_or(file)
        } else {
            file
        };

        // Try checkout from index first, then from HEAD for deleted files
        let mut opts = git2::build::CheckoutBuilder::new();
        let _self = opts.path(relative_path).force();

        let result = repo.checkout_index(None, Some(&mut opts));

        if result.is_err() {
            // File might be deleted, try checkout from HEAD
            if let Some(tree) = &head_tree {
                let mut head_opts = git2::build::CheckoutBuilder::new();
                let _self = head_opts.path(relative_path).force();

                repo.checkout_tree(tree.as_object(), Some(&mut head_opts))
                    .map_err(|e| {
                        Error::Git(format!(
                            "Failed to discard changes in {}: {e}",
                            relative_path.display()
                        ))
                    })?;
            } else {
                // No HEAD, just return the original error
                result.map_err(|e| {
                    Error::Git(format!(
                        "Failed to discard changes in {}: {e}",
                        relative_path.display()
                    ))
                })?;
            }
        }
    }

    debug!("Discarded changes in {} files", files.len());
    Ok(())
}

/// List all branches.
///
/// # Errors
/// Returns an error if branches cannot be listed.
pub fn branches(path: &Path) -> Result<Vec<BranchInfo>> {
    let repo = open(path)?;
    let current_branch = get_current_branch(&repo).ok();

    let mut result = Vec::new();

    // Get local branches
    let branches = repo
        .branches(Some(git2::BranchType::Local))
        .map_err(|e| Error::Git(format!("Failed to list branches: {e}")))?;

    for branch_result in branches {
        let (branch, _) =
            branch_result.map_err(|e| Error::Git(format!("Failed to get branch: {e}")))?;

        if let Some(name) = branch.name().ok().flatten() {
            let upstream = branch
                .upstream()
                .ok()
                .and_then(|u| u.name().ok().flatten().map(String::from));

            result.push(BranchInfo {
                name: name.to_owned(),
                is_current: current_branch.as_deref() == Some(name),
                upstream,
            });
        }
    }

    Ok(result)
}

/// Checkout a branch.
///
/// # Errors
/// Returns an error if checkout fails or if there are uncommitted changes
/// that would be overwritten.
pub fn checkout_branch(path: &Path, name: &str) -> Result<()> {
    let repo = open(path)?;

    // Find the branch
    let branch = repo
        .find_branch(name, git2::BranchType::Local)
        .map_err(|e| Error::Git(format!("Branch not found: {e}")))?;

    let commit = branch
        .get()
        .peel_to_commit()
        .map_err(|e| Error::Git(format!("Failed to get branch commit: {e}")))?;

    // Checkout the tree with safe options (don't overwrite modified files)
    let tree = commit
        .tree()
        .map_err(|e| Error::Git(format!("Failed to get tree: {e}")))?;

    let mut checkout_opts = git2::build::CheckoutBuilder::new();
    let _self = checkout_opts.safe(); // Don't overwrite modified files

    repo.checkout_tree(tree.as_object(), Some(&mut checkout_opts))
        .map_err(|e| {
            if e.code() == git2::ErrorCode::Conflict {
                Error::Git(
                    "Cannot checkout: you have uncommitted changes that would be overwritten"
                        .to_owned(),
                )
            } else {
                Error::Git(format!("Failed to checkout tree: {e}"))
            }
        })?;

    // Update HEAD
    repo.set_head(&format!("refs/heads/{name}"))
        .map_err(|e| Error::Git(format!("Failed to update HEAD: {e}")))?;

    debug!(branch = name, "Checked out branch");
    Ok(())
}

/// Create a new branch.
///
/// # Errors
/// Returns an error if branch creation fails.
pub fn create_branch(path: &Path, name: &str) -> Result<()> {
    let repo = open(path)?;

    let head = repo
        .head()
        .map_err(|e| Error::Git(format!("Failed to get HEAD: {e}")))?;

    let commit = head
        .peel_to_commit()
        .map_err(|e| Error::Git(format!("Failed to get HEAD commit: {e}")))?;

    let _branch = repo
        .branch(name, &commit, false)
        .map_err(|e| Error::Git(format!("Failed to create branch: {e}")))?;

    debug!(branch = name, "Created branch");
    Ok(())
}

/// Delete a branch.
///
/// # Errors
/// Returns an error if branch deletion fails.
pub fn delete_branch(path: &Path, name: &str) -> Result<()> {
    let repo = open(path)?;

    let mut branch = repo
        .find_branch(name, git2::BranchType::Local)
        .map_err(|e| Error::Git(format!("Branch not found: {e}")))?;

    branch
        .delete()
        .map_err(|e| Error::Git(format!("Failed to delete branch: {e}")))?;

    debug!(branch = name, "Deleted branch");
    Ok(())
}

/// Get commit log.
///
/// # Errors
/// Returns an error if the log cannot be retrieved.
/// Returns an empty list for repositories with no commits.
pub fn log(path: &Path, limit: usize) -> Result<Vec<CommitInfo>> {
    let repo = open(path)?;

    // Handle empty repos (no HEAD)
    let Ok(head) = repo.head().and_then(|h| h.peel_to_commit()) else {
        return Ok(Vec::new()); // Empty repo, no commits
    };

    let mut revwalk = repo
        .revwalk()
        .map_err(|e| Error::Git(format!("Failed to create revwalk: {e}")))?;

    revwalk
        .push(head.id())
        .map_err(|e| Error::Git(format!("Failed to push HEAD: {e}")))?;

    let mut result = Vec::new();

    for oid_result in revwalk.take(limit) {
        let oid = oid_result.map_err(|e| Error::Git(format!("Failed to get commit oid: {e}")))?;

        let commit = repo
            .find_commit(oid)
            .map_err(|e| Error::Git(format!("Failed to find commit: {e}")))?;

        let hash = oid.to_string();
        let short_hash = hash.chars().take(7).collect();

        result.push(CommitInfo {
            hash,
            short_hash,
            message: commit.summary().unwrap_or_default().to_owned(),
            author: commit.author().name().unwrap_or("Unknown").to_owned(),
            email: commit.author().email().unwrap_or("").to_owned(),
            timestamp: commit.time().seconds(),
        });
    }

    Ok(result)
}

/// Get blame information for a file.
///
/// # Errors
/// Returns an error if blame cannot be retrieved.
pub fn blame(path: &Path, file: &Path) -> Result<Vec<BlameLine>> {
    let repo = open(path)?;

    let relative_path = if file.is_absolute() {
        file.strip_prefix(path).unwrap_or(file)
    } else {
        file
    };

    let mut opts = BlameOptions::new();
    let blame = repo
        .blame_file(relative_path, Some(&mut opts))
        .map_err(|e| Error::Git(format!("Failed to get blame: {e}")))?;

    // Read the file content
    let file_path = path.join(relative_path);
    let content = fs::read_to_string(&file_path)
        .map_err(|e| Error::Git(format!("Failed to read file: {e}")))?;

    let lines: Vec<&str> = content.lines().collect();
    let mut result = Vec::new();

    for (i, line_content) in lines.iter().enumerate() {
        let line_num = i + 1;
        if let Some(hunk) = blame.get_line(line_num) {
            let commit_hash = hunk.final_commit_id().to_string();
            let author = hunk
                .final_signature()
                .name()
                .unwrap_or("Unknown")
                .to_owned();

            result.push(BlameLine {
                line_number: line_num,
                commit_hash,
                author,
                content: (*line_content).to_owned(),
            });
        }
    }

    Ok(result)
}

// ============================================
// Remote Operations
// ============================================

/// Push commits to the remote repository.
///
/// Uses the git CLI to push, which automatically handles authentication
/// via the system's credential helpers (macOS Keychain, Windows Credential Manager, etc.)
///
/// Behavior (matches VS Code):
/// 1. First tries `git push` (uses configured upstream)
/// 2. If no upstream configured, auto-publishes with `git push -u origin HEAD`
///
/// # Errors
/// Returns an error if push fails (auth issues, no remote, conflicts, etc.)
pub async fn push(path: &Path, remote_name: Option<&str>) -> Result<()> {
    let remote = remote_name.unwrap_or("origin");

    info!(path = %path.display(), remote = remote, "Starting git push");

    // First, try a simple `git push` which uses the configured upstream
    let output = Command::new("git")
        .args(["push"])
        .current_dir(path)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to execute git command");
            Error::Git(format!("Failed to run git push: {e}"))
        })?;

    let stderr = String::from_utf8_lossy(&output.stderr);

    // If push failed because there's no upstream, auto-publish the branch (like VS Code)
    if !output.status.success()
        && (stderr.contains("no upstream branch")
            || stderr.contains("has no upstream")
            || stderr.contains("set the remote as upstream"))
    {
        info!("No upstream configured, publishing branch with -u flag");

        let publish_output = Command::new("git")
            .args(["push", "-u", remote, "HEAD"])
            .current_dir(path)
            .env("GIT_TERMINAL_PROMPT", "0")
            .output()
            .await
            .map_err(|e| Error::Git(format!("Failed to run git push: {e}")))?;

        let publish_stderr = String::from_utf8_lossy(&publish_output.stderr);

        info!(
            status = %publish_output.status,
            stderr = %publish_stderr.trim(),
            "Git push -u completed"
        );

        if !publish_output.status.success() {
            let msg = publish_stderr.trim();
            return Err(Error::Git(format!("Push failed: {msg}")));
        }

        info!(remote = remote, "Branch published and pushed successfully");
        return Ok(());
    }

    info!(
        status = %output.status,
        stderr = %stderr.trim(),
        "Git push completed"
    );

    if !output.status.success() {
        let msg = stderr.trim();

        // Provide user-friendly error messages for common cases
        if msg.contains("non-fast-forward") || msg.contains("rejected") {
            return Err(Error::Git(
                "Push rejected: remote has changes you don't have. Pull first.".to_owned(),
            ));
        }
        if msg.contains("Authentication failed") || msg.contains("could not read Username") {
            return Err(Error::Git(
                "Authentication failed. Please run 'git push' in terminal first to cache credentials.".to_owned(),
            ));
        }

        return Err(Error::Git(format!("Push failed: {msg}")));
    }

    info!(remote = remote, "Push successful");
    Ok(())
}

/// Pull changes from the remote repository.
///
/// Uses the git CLI to pull, which automatically handles authentication
/// via the system's credential helpers (macOS Keychain, Windows Credential Manager, etc.)
///
/// Behavior (matches VS Code):
/// - Runs `git pull` without specifying remote (uses configured upstream)
/// - If remote is explicitly provided, uses that remote
///
/// # Errors
/// Returns an error if pull fails (auth issues, no remote, merge conflicts,
/// uncommitted changes, etc.)
pub async fn pull(path: &Path, remote_name: Option<&str>) -> Result<()> {
    info!(path = %path.display(), remote = ?remote_name, "Starting git pull");

    // Build args - only specify remote if explicitly provided
    let args: Vec<&str> = remote_name.map_or_else(|| vec!["pull"], |remote| vec!["pull", remote]);

    let output = Command::new("git")
        .args(&args)
        .current_dir(path)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to execute git command");
            Error::Git(format!("Failed to run git pull: {e}"))
        })?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    info!(
        status = %output.status,
        stdout = %stdout.trim(),
        stderr = %stderr.trim(),
        "Git pull completed"
    );

    if !output.status.success() {
        let msg = stderr.trim();

        // Provide user-friendly error messages for common cases
        if msg.contains("uncommitted changes") || msg.contains("would be overwritten") {
            return Err(Error::Git(
                "Cannot pull: you have uncommitted changes. Please commit or stash them first."
                    .to_owned(),
            ));
        }
        if msg.contains("diverged") || msg.contains("CONFLICT") {
            return Err(Error::Git(
                "Cannot pull: branches have diverged or there are conflicts. Please merge or rebase manually.".to_owned(),
            ));
        }
        if msg.contains("Authentication failed") || msg.contains("could not read Username") {
            return Err(Error::Git(
                "Authentication failed. Please run 'git pull' in terminal first to cache credentials.".to_owned(),
            ));
        }
        if msg.contains("no tracking information") || msg.contains("no upstream") {
            return Err(Error::Git(
                "No upstream branch configured. Push first to set up tracking.".to_owned(),
            ));
        }

        return Err(Error::Git(format!("Pull failed: {msg}")));
    }

    info!("Pull successful");
    Ok(())
}

/// Fetch updates from the remote repository.
///
/// Uses the git CLI to fetch, which automatically handles authentication
/// via the system's credential helpers (macOS Keychain, Windows Credential Manager, etc.)
///
/// This updates the remote tracking refs (e.g., `refs/remotes/origin/main`) without
/// modifying the working directory or local branches.
///
/// # Errors
/// Returns an error if fetch fails (auth issues, no remote, network error, timeout, etc.)
pub async fn fetch(path: &Path, remote_name: Option<&str>) -> Result<()> {
    let remote = remote_name.unwrap_or("origin");

    info!(path = %path.display(), remote = remote, "Starting git fetch");

    // Spawn the process asynchronously
    let child = Command::new("git")
        .args(["fetch", "--no-auto-gc", remote])
        .current_dir(path)
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            error!(error = %e, "Failed to spawn git command");
            Error::Git(format!("Failed to run git fetch: {e}"))
        })?;

    // Wait with 30 second timeout - child is automatically killed on drop if timeout expires
    let output = match timeout(Duration::from_secs(30), child.wait_with_output()).await {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => {
            error!(error = %e, "Failed to get git output");
            return Err(Error::Git(format!("Failed to wait for git fetch: {e}")));
        },
        Err(_) => {
            return Err(Error::Git(
                "Fetch timed out. This may be due to authentication issues - try running 'git fetch' in terminal first.".to_owned(),
            ));
        },
    };

    let stderr = String::from_utf8_lossy(&output.stderr);

    info!(
        status = %output.status,
        stderr = %stderr.trim(),
        "Git fetch completed"
    );

    if !output.status.success() {
        let msg = stderr.trim();

        // Provide user-friendly error messages for common cases
        if msg.contains("Authentication failed") || msg.contains("could not read Username") {
            return Err(Error::Git(
                "Authentication failed. Please run 'git fetch' in terminal first to cache credentials.".to_owned(),
            ));
        }
        if msg.contains("Could not resolve host") {
            return Err(Error::Git(
                "Could not connect to host. Please check your internet connection.".to_owned(),
            ));
        }
        if msg.contains("does not appear to be a git repository") {
            return Err(Error::Git(
                "Remote repository not found. Please check your remote configuration.".to_owned(),
            ));
        }

        return Err(Error::Git(format!("Fetch failed: {msg}")));
    }

    info!(remote = remote, "Fetch successful");
    Ok(())
}

/// Clone a git repository to a target directory.
///
/// Uses the git CLI to clone, which automatically handles authentication
/// via the system's credential helpers (macOS Keychain, Windows Credential Manager, etc.)
///
/// # Arguments
/// * `url` - The repository URL (HTTPS, SSH, or git:// protocol)
/// * `target_path` - The directory where the repo will be cloned
///
/// # Errors
/// Returns an error if clone fails (auth issues, invalid URL, disk full, etc.)
pub async fn clone(url: &str, target_path: &Path) -> Result<()> {
    info!(url = url, target = %target_path.display(), "Starting git clone");

    let output = Command::new("git")
        .args(["clone", url])
        .arg(target_path)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to execute git command");
            Error::Git(format!("Failed to run git clone: {e}"))
        })?;

    let stderr = String::from_utf8_lossy(&output.stderr);

    info!(
        status = %output.status,
        stderr = %stderr.trim(),
        "Git clone completed"
    );

    if !output.status.success() {
        let msg = stderr.trim();

        // Provide user-friendly error messages for common cases
        if msg.contains("Authentication failed") || msg.contains("could not read Username") {
            return Err(Error::Git(
                "Authentication failed. Please check your credentials or try cloning via terminal first.".to_owned(),
            ));
        }
        if msg.contains("not found") || msg.contains("does not exist") {
            return Err(Error::Git(
                "Repository not found. Please check the URL.".to_owned(),
            ));
        }
        if msg.contains("already exists and is not an empty directory") {
            return Err(Error::Git(
                "Target directory already exists and is not empty.".to_owned(),
            ));
        }
        if msg.contains("Could not resolve host") {
            return Err(Error::Git(
                "Could not connect to host. Please check your internet connection.".to_owned(),
            ));
        }

        return Err(Error::Git(format!("Clone failed: {msg}")));
    }

    info!(target = %target_path.display(), "Clone successful");
    Ok(())
}

// ============================================
// Worktree Operations
// ============================================

/// List all worktrees for the repository.
///
/// Uses `git worktree list --porcelain` for reliable parsing.
///
/// # Errors
/// Returns an error if the command fails or output cannot be parsed.
pub async fn worktree_list(repo_path: &Path) -> Result<Vec<WorktreeInfo>> {
    debug!(?repo_path, "Listing worktrees");

    let output = Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|e| Error::Git(format!("Failed to run git worktree list: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(Error::Git(format!(
            "git worktree list failed: {}",
            stderr.trim()
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_worktree_porcelain(&stdout))
}

/// Parse `git worktree list --porcelain` output.
///
/// Porcelain format example:
/// ```text
/// worktree /path/to/main
/// HEAD abc123...
/// branch refs/heads/main
///
/// worktree /path/to/feature
/// HEAD def456...
/// branch refs/heads/feature
/// ```
fn parse_worktree_porcelain(output: &str) -> Vec<WorktreeInfo> {
    let mut worktrees = Vec::new();
    let mut current_path: Option<String> = None;
    let mut current_head: Option<String> = None;
    let mut current_branch: Option<String> = None;
    let mut _is_bare = false;
    let mut is_detached = false;
    let mut locked: Option<String> = None;
    let mut is_first = true;

    for line in output.lines() {
        if line.is_empty() {
            // End of record - save current worktree
            if let (Some(path), Some(head)) = (current_path.take(), current_head.take()) {
                let short_head = head.chars().take(7).collect();
                worktrees.push(WorktreeInfo {
                    path,
                    head,
                    short_head,
                    branch: current_branch.take(),
                    is_main: is_first,
                    is_detached,
                    locked: locked.take(),
                });
                is_first = false;
            }
            _is_bare = false;
            is_detached = false;
            continue;
        }

        if let Some(path) = line.strip_prefix("worktree ") {
            current_path = Some(path.to_owned());
        } else if let Some(head) = line.strip_prefix("HEAD ") {
            current_head = Some(head.to_owned());
        } else if let Some(branch) = line.strip_prefix("branch ") {
            // Strip refs/heads/ prefix
            let branch_name = branch.strip_prefix("refs/heads/").unwrap_or(branch);
            current_branch = Some(branch_name.to_owned());
        } else if line == "bare" {
            _is_bare = true;
        } else if line == "detached" {
            is_detached = true;
        } else if line == "locked" {
            locked = Some(String::new());
        } else if let Some(reason) = line.strip_prefix("locked ") {
            locked = Some(reason.to_owned());
        }
    }

    // Handle last record if no trailing newline
    if let (Some(path), Some(head)) = (current_path, current_head) {
        let short_head = head.chars().take(7).collect();
        worktrees.push(WorktreeInfo {
            path,
            head,
            short_head,
            branch: current_branch,
            is_main: is_first,
            is_detached,
            locked,
        });
    }

    debug!(count = worktrees.len(), "Found worktrees");
    worktrees
}

/// Add a new worktree.
///
/// # Arguments
/// * `repo_path` - Path to the main repository
/// * `worktree_path` - Path where the new worktree will be created
/// * `options` - Configuration options for the worktree
///
/// # Errors
/// Returns an error if:
/// - The path already exists
/// - The branch is already checked out elsewhere
/// - Git command fails
pub async fn worktree_add(
    repo_path: &Path,
    worktree_path: &Path,
    options: &WorktreeAddOptions,
) -> Result<WorktreeInfo> {
    info!(?repo_path, ?worktree_path, ?options, "Adding worktree");

    let mut args = vec!["worktree", "add"];

    // Branch options
    if let Some(branch) = &options.new_branch {
        if options.force_branch {
            args.push("-B");
        } else {
            args.push("-b");
        }
        args.push(branch);
    }

    if options.detach {
        args.push("--detach");
    }

    // Worktree path
    let worktree_path_str = worktree_path.to_string_lossy();
    args.push(&worktree_path_str);

    // Commit-ish (branch/tag/commit to checkout)
    if let Some(commit_ish) = &options.commit_ish {
        args.push(commit_ish);
    }

    // Prune stale worktree entries before creating to ensure clean state.
    // This removes any orphaned metadata in .git/worktrees/ from previous
    // worktrees that were deleted or partially removed.
    worktree_prune(repo_path).await?;

    let output = Command::new("git")
        .args(&args)
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|e| Error::Git(format!("Failed to run git worktree add: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = stderr.trim();

        // Provide user-friendly error messages
        // Check more specific patterns first to avoid false matches
        if msg.contains("already checked out") {
            return Err(Error::Git(
                "Branch is already checked out in another worktree.".to_owned(),
            ));
        }
        if msg.contains("branch named") && msg.contains("already exists") {
            return Err(Error::Git(
                "A branch with this name already exists. Use a different name or checkout the existing branch.".to_owned(),
            ));
        }
        if msg.contains("already exists") {
            return Err(Error::Git(
                "Path already exists. Choose a different location.".to_owned(),
            ));
        }
        if msg.contains("is locked") {
            return Err(Error::Git(
                "Worktree is locked. Unlock it first.".to_owned(),
            ));
        }

        return Err(Error::Git(format!("Failed to add worktree: {msg}")));
    }

    // Find and return the newly created worktree
    let worktrees = worktree_list(repo_path).await?;
    let worktree_path_canonical = worktree_path
        .canonicalize()
        .unwrap_or_else(|_| worktree_path.to_path_buf());

    worktrees
        .into_iter()
        .find(|wt| {
            let wt_path = Path::new(&wt.path);
            let wt_canonical = wt_path
                .canonicalize()
                .unwrap_or_else(|_| wt_path.to_path_buf());
            wt_canonical == worktree_path_canonical
        })
        .ok_or_else(|| Error::Git("Worktree was created but not found in list".to_owned()))
}

/// Remove a worktree.
///
/// # Arguments
/// * `repo_path` - Path to the main repository
/// * `worktree_path` - Path to the worktree to remove
/// * `force` - If true, removes even if dirty/locked
/// * `delete_branch` - If true, also deletes the associated branch
///
/// # Errors
/// Returns an error if:
/// - The worktree doesn't exist
/// - The worktree is locked (and force=false)
/// - The worktree has uncommitted changes (and force=false)
/// - Branch deletion fails (if delete_branch=true)
pub async fn worktree_remove(
    repo_path: &Path,
    worktree_path: &Path,
    force: bool,
    delete_branch: bool,
) -> Result<()> {
    info!(
        ?repo_path,
        ?worktree_path,
        force,
        delete_branch,
        "Removing worktree"
    );

    // If we need to delete the branch, get the worktree info first
    let branch_to_delete = if delete_branch {
        let worktrees = worktree_list(repo_path).await?;
        let worktree_path_canonical = worktree_path
            .canonicalize()
            .unwrap_or_else(|_| worktree_path.to_path_buf());

        worktrees
            .into_iter()
            .find(|wt| {
                let wt_path = Path::new(&wt.path);
                let wt_canonical = wt_path
                    .canonicalize()
                    .unwrap_or_else(|_| wt_path.to_path_buf());
                wt_canonical == worktree_path_canonical
            })
            .and_then(|wt| wt.branch)
    } else {
        None
    };

    let mut args = vec!["worktree", "remove"];

    if force {
        args.push("--force");
    }

    let worktree_path_str = worktree_path.to_string_lossy();
    args.push(&worktree_path_str);

    let output = Command::new("git")
        .args(&args)
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|e| Error::Git(format!("Failed to run git worktree remove: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = stderr.trim();

        // Provide user-friendly error messages
        if msg.contains("is locked") {
            return Err(Error::Git(
                "Worktree is locked. Unlock or use force remove.".to_owned(),
            ));
        }
        if msg.contains("modified or untracked") || msg.contains("uncommitted changes") {
            return Err(Error::Git(
                "Worktree has uncommitted changes. Commit, stash, or use force remove.".to_owned(),
            ));
        }
        if msg.contains("not a worktree") || msg.contains("is not a working tree") {
            return Err(Error::Git("Not a valid worktree path.".to_owned()));
        }

        return Err(Error::Git(format!("Failed to remove worktree: {msg}")));
    }

    // Prune stale worktree entries to ensure clean state.
    // This removes any orphaned metadata in .git/worktrees/ that might
    // prevent creating a new worktree with the same name.
    worktree_prune(repo_path).await?;

    // Delete the branch if requested
    if let Some(branch_name) = branch_to_delete {
        info!(?branch_name, "Deleting associated branch");
        // Use -D (force delete) to delete even if branch has unmerged changes
        // The user explicitly opted in to delete, so we honor that
        let branch_output = Command::new("git")
            .args(["branch", "-D", &branch_name])
            .current_dir(repo_path)
            .output()
            .await
            .map_err(|e| Error::Git(format!("Failed to run git branch -D: {e}")))?;

        if !branch_output.status.success() {
            let stderr = String::from_utf8_lossy(&branch_output.stderr);
            // Log warning but don't fail - worktree was already removed
            error!(?branch_name, stderr = %stderr.trim(), "Failed to delete branch (worktree removed successfully)");
        } else {
            info!(?branch_name, "Branch deleted");
        }
    }

    info!(?worktree_path, "Worktree removed");
    Ok(())
}

/// Prune stale worktree information.
///
/// Cleans up orphaned entries in `.git/worktrees/` that reference
/// worktrees whose directories no longer exist. This is useful after
/// removing worktrees to ensure new worktrees can be created with the
/// same path.
///
/// # Errors
/// Returns an error if the prune command fails.
pub async fn worktree_prune(repo_path: &Path) -> Result<()> {
    debug!(?repo_path, "Pruning stale worktree entries");

    let output = Command::new("git")
        .args(["worktree", "prune"])
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|e| Error::Git(format!("Failed to run git worktree prune: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(Error::Git(format!(
            "git worktree prune failed: {}",
            stderr.trim()
        )));
    }

    debug!("Worktree prune completed");
    Ok(())
}

// ============================================
// Helper Functions
// ============================================

/// Get the current branch name.
fn get_current_branch(repo: &Repository) -> Result<String> {
    let head = repo
        .head()
        .map_err(|e| Error::Git(format!("Failed to get HEAD: {e}")))?;

    if head.is_branch() {
        head.shorthand()
            .map(String::from)
            .ok_or_else(|| Error::Git("Failed to get branch name".to_owned()))
    } else {
        // Detached HEAD - return the short hash
        let oid = head
            .target()
            .ok_or_else(|| Error::Git("Failed to get HEAD target".to_owned()))?;
        Ok(oid.to_string().chars().take(7).collect())
    }
}

/// Parse a git diff into our FileDiff structures.
fn parse_diff(diff: &git2::Diff<'_>) -> Result<Vec<FileDiff>> {
    let mut result = Vec::new();
    let mut current_file: Option<(String, Option<String>, bool, Vec<DiffHunk>)> = None;
    let mut current_hunk: Option<(String, Vec<DiffLine>)> = None;

    diff.print(git2::DiffFormat::Patch, |delta, hunk, line| {
        let new_file_path = delta
            .new_file()
            .path()
            .map(|p| p.to_string_lossy().to_string());
        let old_file_path = delta
            .old_file()
            .path()
            .map(|p| p.to_string_lossy().to_string());
        let is_binary = delta.flags().is_binary();

        // Check if we've moved to a new file
        let file_path = new_file_path
            .as_ref()
            .or(old_file_path.as_ref())
            .cloned()
            .unwrap_or_default();

        let is_new_file = current_file
            .as_ref()
            .is_none_or(|(p, _, _, _)| p != &file_path);

        if is_new_file {
            // Save previous file if exists
            if let Some((path, old_path, binary, mut hunks)) = current_file.take() {
                if let Some((header, lines)) = current_hunk.take() {
                    hunks.push(DiffHunk { header, lines });
                }
                result.push(FileDiff {
                    path,
                    old_path,
                    hunks,
                    is_binary: binary,
                });
            }

            // Determine old_path for renames
            let old_path = if delta.status() == Delta::Renamed {
                old_file_path
            } else {
                None
            };

            current_file = Some((file_path, old_path, is_binary, Vec::new()));
        }

        // Process hunk
        if let Some(h) = hunk {
            // Save previous hunk
            if let Some((_, _, _, ref mut hunks)) = current_file.as_mut() {
                if let Some((header, lines)) = current_hunk.take() {
                    hunks.push(DiffHunk { header, lines });
                }
            }

            // Safe string handling for hunk header
            let header_bytes = h.header();
            let header = String::from_utf8_lossy(header_bytes).trim().to_owned();
            current_hunk = Some((header, Vec::new()));
        }

        // Process line
        let origin = line.origin();
        if origin == '+' || origin == '-' || origin == ' ' {
            let content = String::from_utf8_lossy(line.content())
                .trim_end()
                .to_owned();

            let diff_line = DiffLine {
                origin,
                content,
                old_line: line.old_lineno(),
                new_line: line.new_lineno(),
            };

            if let Some((_, ref mut lines)) = current_hunk.as_mut() {
                lines.push(diff_line);
            }
        }

        true
    })
    .map_err(|e| Error::Git(format!("Failed to print diff: {e}")))?;

    // Save last file
    if let Some((path, old_path, binary, mut hunks)) = current_file.take() {
        if let Some((header, lines)) = current_hunk.take() {
            hunks.push(DiffHunk { header, lines });
        }
        result.push(FileDiff {
            path,
            old_path,
            hunks,
            is_binary: binary,
        });
    }

    Ok(result)
}

// ============================================
// Legacy GitManager (for compatibility)
// ============================================

/// Git manager for repository operations (legacy wrapper).
#[derive(Debug, Clone, Copy)]
pub struct GitManager;

impl GitManager {
    /// Create a new git manager.
    #[must_use]
    pub const fn new() -> Self {
        Self
    }

    /// Get repository status.
    pub fn status(&self, repo_path: &str) -> Result<GitStatus> {
        status(Path::new(repo_path))
    }

    /// Stage files.
    pub fn stage(&self, repo_path: &str, files: &[String]) -> Result<()> {
        let paths: Vec<&Path> = files.iter().map(|s| Path::new(s.as_str())).collect();
        stage(Path::new(repo_path), &paths)
    }

    /// Unstage files.
    pub fn unstage(&self, repo_path: &str, files: &[String]) -> Result<()> {
        let paths: Vec<&Path> = files.iter().map(|s| Path::new(s.as_str())).collect();
        unstage(Path::new(repo_path), &paths)
    }

    /// Create a commit.
    pub fn commit(&self, repo_path: &str, message: &str) -> Result<String> {
        commit(Path::new(repo_path), message)
    }

    /// Get diff.
    pub fn diff(&self, repo_path: &str, file: Option<&str>) -> Result<String> {
        let diffs = if let Some(f) = file {
            vec![get_file_diff(Path::new(repo_path), Path::new(f))?]
        } else {
            get_diff(Path::new(repo_path))?
        };

        // Format as unified diff string
        Ok(format_diffs_as_string(&diffs))
    }

    /// Get commit log.
    pub fn log(&self, repo_path: &str, limit: Option<u32>) -> Result<Vec<GitCommit>> {
        let limit = limit.unwrap_or(50) as usize;
        let commits = log(Path::new(repo_path), limit)?;

        Ok(commits
            .into_iter()
            .map(|c| GitCommit {
                sha: c.hash,
                short_sha: c.short_hash,
                message: c.message,
                author: c.author,
                email: c.email,
                #[expect(clippy::cast_sign_loss, reason = "timestamps are positive")]
                date: c.timestamp as u64,
            })
            .collect())
    }

    /// List branches.
    pub fn branches(&self, repo_path: &str) -> Result<Vec<GitBranch>> {
        let branches_list = branches(Path::new(repo_path))?;

        Ok(branches_list
            .into_iter()
            .map(|b| GitBranch {
                name: b.name,
                is_remote: false,
                is_current: b.is_current,
                upstream: b.upstream,
            })
            .collect())
    }

    /// Checkout a branch.
    pub fn checkout(&self, repo_path: &str, branch: &str) -> Result<()> {
        checkout_branch(Path::new(repo_path), branch)
    }

    /// Discard changes.
    pub fn discard(&self, repo_path: &str, files: &[String]) -> Result<()> {
        let paths: Vec<&Path> = files.iter().map(|s| Path::new(s.as_str())).collect();
        discard_changes(Path::new(repo_path), &paths)
    }

    /// Get blame for a file.
    pub fn blame(&self, repo_path: &str, file: &str) -> Result<Vec<BlameLine>> {
        blame(Path::new(repo_path), Path::new(file))
    }

    /// Get structured diff.
    pub fn get_diff_structured(&self, repo_path: &str) -> Result<Vec<FileDiff>> {
        get_diff(Path::new(repo_path))
    }
}

impl Default for GitManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Format diffs as a unified diff string.
fn format_diffs_as_string(diffs: &[FileDiff]) -> String {
    let mut output = String::new();

    for diff in diffs {
        let _result = writeln!(output, "--- a/{}", diff.path);
        let _result = writeln!(output, "+++ b/{}", diff.path);

        for hunk in &diff.hunks {
            output.push_str(&hunk.header);
            output.push('\n');

            for line in &hunk.lines {
                output.push(line.origin);
                output.push_str(&line.content);
                output.push('\n');
            }
        }
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_git_manager_new() {
        let manager = GitManager::new();
        // Just ensure it creates successfully
        let _debug = format!("{manager:?}");
    }
}
