//! Snowflake Git - Git operations
//!
//! This crate provides git functionality using the git2 library.

use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};

use git2::{
    BlameOptions, Delta, DiffOptions, IndexAddOption, Repository, StatusOptions, StatusShow,
};
use serde::{Deserialize, Serialize};
use snowflake_core::{Error, FileStatus, GitBranch, GitCommit, GitStatus, Result, StatusEntry};
use tracing::debug;

// ============================================
// Additional Types (not in snowflake-core)
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
/// Pushes the current branch to its upstream remote. If no upstream is set,
/// pushes to origin.
///
/// # Errors
/// Returns an error if push fails (auth issues, no remote, conflicts, etc.)
pub fn push(path: &Path, remote_name: Option<&str>) -> Result<()> {
    let repo = open(path)?;

    // Get current branch
    let head = repo
        .head()
        .map_err(|e| Error::Git(format!("Failed to get HEAD: {e}")))?;

    if !head.is_branch() {
        return Err(Error::Git("Cannot push: HEAD is detached".to_owned()));
    }

    let branch_name = head
        .shorthand()
        .ok_or_else(|| Error::Git("Failed to get branch name".to_owned()))?;

    // Get the remote
    let remote_name = remote_name.unwrap_or("origin");
    let mut remote = repo
        .find_remote(remote_name)
        .map_err(|e| Error::Git(format!("Remote '{remote_name}' not found: {e}")))?;

    // Build refspec for push
    let refspec = format!("refs/heads/{branch_name}:refs/heads/{branch_name}");

    // Set up callbacks for authentication
    let mut callbacks = git2::RemoteCallbacks::new();

    // Use credential helper from git config or SSH agent
    let _self = callbacks.credentials(|_url, username_from_url, allowed_types| {
        if allowed_types.contains(git2::CredentialType::SSH_KEY) {
            // Try SSH agent first
            git2::Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"))
        } else if allowed_types.contains(git2::CredentialType::DEFAULT) {
            git2::Cred::default()
        } else {
            Err(git2::Error::from_str(
                "Authentication failed. Please ensure SSH agent is running or use SSH keys.",
            ))
        }
    });

    // Set up push options
    let mut push_options = git2::PushOptions::new();
    let _self = push_options.remote_callbacks(callbacks);

    // Push
    remote
        .push(&[&refspec], Some(&mut push_options))
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("non-fast-forward") {
                Error::Git(
                    "Push rejected: remote has changes you don't have. Pull first.".to_owned(),
                )
            } else if msg.contains("authentication") || msg.contains("credential") {
                Error::Git(
                    "Authentication failed. Please ensure SSH agent is running or use SSH keys."
                        .to_owned(),
                )
            } else {
                Error::Git(format!("Push failed: {e}"))
            }
        })?;

    debug!(
        branch = branch_name,
        remote = remote_name,
        "Pushed to remote"
    );
    Ok(())
}

/// Pull changes from the remote repository.
///
/// Fetches and merges changes from the upstream remote into the current branch.
/// Uses fast-forward only strategy - fails if merge is required.
///
/// # Errors
/// Returns an error if pull fails (auth issues, no remote, merge conflicts,
/// uncommitted changes, etc.)
pub fn pull(path: &Path, remote_name: Option<&str>) -> Result<()> {
    let repo = open(path)?;

    // Check for uncommitted changes first
    let statuses = repo
        .statuses(None)
        .map_err(|e| Error::Git(format!("Failed to get status: {e}")))?;

    let has_changes = statuses.iter().any(|s| {
        let status = s.status();
        status.is_wt_modified()
            || status.is_wt_deleted()
            || status.is_wt_renamed()
            || status.is_index_new()
            || status.is_index_modified()
            || status.is_index_deleted()
    });

    if has_changes {
        return Err(Error::Git(
            "Cannot pull: you have uncommitted changes. Please commit or stash them first."
                .to_owned(),
        ));
    }

    // Get current branch
    let head = repo
        .head()
        .map_err(|e| Error::Git(format!("Failed to get HEAD: {e}")))?;

    if !head.is_branch() {
        return Err(Error::Git("Cannot pull: HEAD is detached".to_owned()));
    }

    let branch_name = head
        .shorthand()
        .ok_or_else(|| Error::Git("Failed to get branch name".to_owned()))?;

    // Get the remote
    let remote_name = remote_name.unwrap_or("origin");
    let mut remote = repo
        .find_remote(remote_name)
        .map_err(|e| Error::Git(format!("Remote '{remote_name}' not found: {e}")))?;

    // Set up callbacks for authentication
    let mut callbacks = git2::RemoteCallbacks::new();
    let _self = callbacks.credentials(|_url, username_from_url, allowed_types| {
        if allowed_types.contains(git2::CredentialType::SSH_KEY) {
            git2::Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"))
        } else if allowed_types.contains(git2::CredentialType::DEFAULT) {
            git2::Cred::default()
        } else {
            Err(git2::Error::from_str(
                "Authentication failed. Please ensure SSH agent is running or use SSH keys.",
            ))
        }
    });

    // Fetch
    let mut fetch_options = git2::FetchOptions::new();
    let _self = fetch_options.remote_callbacks(callbacks);

    let refspec = format!("refs/heads/{branch_name}:refs/remotes/{remote_name}/{branch_name}");
    remote
        .fetch(&[&refspec], Some(&mut fetch_options), None)
        .map_err(|e| Error::Git(format!("Fetch failed: {e}")))?;

    // Get the fetch head - might not exist if branch doesn't exist on remote
    let fetch_head = repo
        .find_reference(&format!("refs/remotes/{remote_name}/{branch_name}"))
        .map_err(|_e| {
            Error::Git(format!(
                "Branch '{branch_name}' does not exist on remote '{remote_name}'"
            ))
        })?;

    let fetch_commit = fetch_head
        .peel_to_commit()
        .map_err(|e| Error::Git(format!("Failed to get fetch commit: {e}")))?;

    // Get local HEAD commit
    let local_commit = head
        .peel_to_commit()
        .map_err(|e| Error::Git(format!("Failed to get local commit: {e}")))?;

    // Check if fast-forward is possible
    let (ahead, behind) = repo
        .graph_ahead_behind(local_commit.id(), fetch_commit.id())
        .map_err(|e| Error::Git(format!("Failed to compare commits: {e}")))?;

    if ahead > 0 && behind > 0 {
        return Err(Error::Git(
            "Cannot pull: branches have diverged. Please merge or rebase manually.".to_owned(),
        ));
    }

    if behind == 0 {
        debug!("Already up to date");
        return Ok(());
    }

    // Fast-forward merge
    let refname = format!("refs/heads/{branch_name}");
    let mut reference = repo
        .find_reference(&refname)
        .map_err(|e| Error::Git(format!("Failed to find branch reference: {e}")))?;

    let _ref = reference
        .set_target(fetch_commit.id(), "pull: fast-forward")
        .map_err(|e| Error::Git(format!("Failed to update reference: {e}")))?;

    // Checkout the new HEAD (safe mode since we checked for changes above)
    repo.set_head(&refname)
        .map_err(|e| Error::Git(format!("Failed to set HEAD: {e}")))?;

    let mut checkout_opts = git2::build::CheckoutBuilder::new();
    let _self = checkout_opts.safe(); // Safe checkout - won't overwrite uncommitted changes
    repo.checkout_head(Some(&mut checkout_opts))
        .map_err(|e| Error::Git(format!("Failed to checkout: {e}")))?;

    debug!(
        branch = branch_name,
        remote = remote_name,
        commits = behind,
        "Pulled from remote"
    );
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
