/**
 * Git Operations
 *
 * Functions for interacting with git repositories.
 */

import { invoke } from './core';

// ============================================
// Types
// ============================================

/**
 * File status in git.
 */
export type FileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'conflicted'
  | 'typechange';

/**
 * A file's status entry in git.
 */
export interface StatusEntry {
  /** File path relative to repository root */
  path: string;
  /** Status type */
  status: FileStatus;
  /** Original path for renames/copies */
  oldPath: string | null;
  /** Similarity percentage for renames/copies (0-100) */
  similarity: number | null;
}

/**
 * Complete git repository status.
 */
export interface GitStatus {
  /** Current branch name (empty if detached HEAD) */
  branch: string;
  /** Upstream branch name if tracking */
  upstream: string | null;
  /** Number of commits ahead of upstream */
  ahead: number;
  /** Number of commits behind upstream */
  behind: number;
  /** Files staged for commit (in index) */
  staged: StatusEntry[];
  /** Files modified but not staged (in working tree) */
  modified: StatusEntry[];
  /** Untracked files */
  untracked: StatusEntry[];
  /** Files with merge conflicts */
  conflicted: StatusEntry[];
}

export interface GitCommit {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  email: string;
  date: number;
}

export interface GitBranch {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  upstream?: string;
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  upstream?: string;
}

export interface DiffLine {
  origin: string;
  content: string;
  oldLine?: number;
  newLine?: number;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  oldPath?: string;
  hunks: DiffHunk[];
  isBinary: boolean;
}

export interface BlameLine {
  lineNumber: number;
  commitHash: string;
  author: string;
  content: string;
}

/** Information about a git worktree */
export interface WorktreeInfo {
  path: string;
  head: string;
  shortHead: string;
  branch: string | null;
  isMain: boolean;
  isDetached: boolean;
  locked: string | null;
}

/** Options for creating a new worktree */
export interface WorktreeAddOptions {
  /** Create a new branch with this name */
  newBranch?: string;
  /** Force create branch even if it exists (reset it) */
  forceBranch?: boolean;
  /** Create detached HEAD instead of branch */
  detach?: boolean;
  /** Commit/branch to checkout (defaults to HEAD) */
  commitIsh?: string;
}

// ============================================
// Git Operations
// ============================================

export async function gitDiscover(path: string): Promise<string> {
  return invoke<string>('git_discover', { path });
}

export async function gitStatus(repoPath: string): Promise<GitStatus> {
  return invoke<GitStatus>('git_status', { repoPath });
}

export async function gitStage(repoPath: string, files: string[]): Promise<void> {
  return invoke('git_stage', { repoPath, files });
}

export async function gitUnstage(repoPath: string, files: string[]): Promise<void> {
  return invoke('git_unstage', { repoPath, files });
}

export async function gitStageAll(repoPath: string): Promise<void> {
  return invoke('git_stage_all', { repoPath });
}

export async function gitCommit(repoPath: string, message: string): Promise<string> {
  return invoke<string>('git_commit', { repoPath, message });
}

export async function gitDiff(repoPath: string, file?: string): Promise<string> {
  return invoke<string>('git_diff', { repoPath, file });
}

export async function gitDiffStructured(repoPath: string): Promise<FileDiff[]> {
  return invoke<FileDiff[]>('git_diff_structured', { repoPath });
}

export async function gitStagedDiff(repoPath: string): Promise<FileDiff[]> {
  return invoke<FileDiff[]>('git_staged_diff', { repoPath });
}

export async function gitDiscard(repoPath: string, files: string[]): Promise<void> {
  return invoke('git_discard', { repoPath, files });
}

export async function gitLog(repoPath: string, limit?: number): Promise<GitCommit[]> {
  return invoke<GitCommit[]>('git_log', { repoPath, limit });
}

export async function gitBranches(repoPath: string): Promise<GitBranch[]> {
  return invoke<GitBranch[]>('git_branches', { repoPath });
}

export async function gitBranchInfo(repoPath: string): Promise<BranchInfo[]> {
  return invoke<BranchInfo[]>('git_branch_info', { repoPath });
}

export async function gitCheckout(repoPath: string, branch: string): Promise<void> {
  return invoke('git_checkout', { repoPath, branch });
}

export async function gitCreateBranch(repoPath: string, name: string): Promise<void> {
  return invoke('git_create_branch', { repoPath, name });
}

export async function gitDeleteBranch(repoPath: string, name: string): Promise<void> {
  return invoke('git_delete_branch', { repoPath, name });
}

export async function gitBlame(repoPath: string, file: string): Promise<BlameLine[]> {
  return invoke<BlameLine[]>('git_blame', { repoPath, file });
}

export async function gitPush(repoPath: string, remote?: string): Promise<void> {
  return invoke('git_push', { repoPath, remote });
}

export async function gitPull(repoPath: string, remote?: string): Promise<void> {
  return invoke('git_pull', { repoPath, remote });
}

/**
 * Fetch updates from the remote repository.
 *
 * This updates remote tracking refs without modifying the working directory.
 * @param repoPath - Path to the repository
 * @param remote - Remote name (defaults to "origin")
 */
export async function gitFetch(repoPath: string, remote?: string): Promise<void> {
  return invoke('git_fetch', { repoPath, remote });
}

/**
 * Clone a git repository to a target directory.
 * @param url - The repository URL (HTTPS, SSH, or git:// protocol)
 * @param targetPath - The directory where the repo will be cloned
 */
export async function gitClone(url: string, targetPath: string): Promise<void> {
  return invoke('git_clone', { url, targetPath });
}

// ============================================
// Git Worktree Operations
// ============================================

/**
 * List all worktrees for a repository.
 * @param repoPath - Path to the repository
 */
export async function gitWorktreeList(repoPath: string): Promise<WorktreeInfo[]> {
  return invoke<WorktreeInfo[]>('git_worktree_list', { repoPath });
}

/**
 * Add a new worktree.
 * @param repoPath - Path to the main repository
 * @param worktreePath - Path where the new worktree will be created
 * @param options - Options for creating the worktree
 */
export async function gitWorktreeAdd(
  repoPath: string,
  worktreePath: string,
  options?: WorktreeAddOptions
): Promise<WorktreeInfo> {
  return invoke<WorktreeInfo>('git_worktree_add', {
    repoPath,
    worktreePath,
    options: options ?? {},
  });
}

/**
 * Remove a worktree.
 * @param repoPath - Path to the main repository
 * @param worktreePath - Path to the worktree to remove
 * @param force - Force removal even if worktree has uncommitted changes
 */
export async function gitWorktreeRemove(
  repoPath: string,
  worktreePath: string,
  force?: boolean
): Promise<void> {
  return invoke('git_worktree_remove', { repoPath, worktreePath, force: force ?? false });
}
