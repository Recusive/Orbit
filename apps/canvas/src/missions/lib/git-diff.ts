/**
 * Git Diff Utilities for Review Agent
 *
 * Fetches git diffs based on ReviewScope configuration.
 * Uses the existing Tauri git commands from @/lib/api/git.
 *
 * Each scope maps to specific git operations:
 * - uncommitted: git diff + git diff --cached
 * - staged: git diff --cached
 * - branch: git diff main...HEAD
 * - pr: gh pr diff <ref>
 * - commit: git show <sha>
 */

import { invoke } from '@tauri-apps/api/core';

import type { ReviewAgentTypeConfig, ReviewScope } from '../types/agent-types';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a diff fetch operation
 */
export interface DiffResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** The unified diff content */
  diff: string;
  /** Human-readable description of what was diffed */
  description: string;
  /** Number of files changed */
  filesChanged: number;
  /** Number of lines added */
  linesAdded: number;
  /** Number of lines removed */
  linesRemoved: number;
  /** Error message if operation failed */
  error?: string;
}

/**
 * Structured file diff from Tauri backend
 */
interface FileDiff {
  path: string;
  oldPath?: string;
  hunks: DiffHunk[];
  isBinary: boolean;
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

interface DiffLine {
  origin: string;
  content: string;
  oldLine?: number;
  newLine?: number;
}

// ============================================================================
// Diff Statistics
// ============================================================================

/**
 * Parse unified diff to extract statistics
 */
function parseDiffStats(diff: string): {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
} {
  const lines = diff.split('\n');
  let filesChanged = 0;
  let linesAdded = 0;
  let linesRemoved = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git') || line.startsWith('diff --combined')) {
      filesChanged++;
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      linesAdded++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      linesRemoved++;
    }
  }

  return { filesChanged, linesAdded, linesRemoved };
}

/**
 * Convert structured file diffs to unified diff string
 */
function structuredDiffToUnified(fileDiffs: FileDiff[]): string {
  const parts: string[] = [];

  for (const file of fileDiffs) {
    if (file.isBinary) {
      parts.push(`diff --git a/${file.path} b/${file.path}`);
      parts.push(`Binary files differ`);
      continue;
    }

    const oldPath = file.oldPath ?? file.path;
    parts.push(`diff --git a/${oldPath} b/${file.path}`);
    parts.push(`--- a/${oldPath}`);
    parts.push(`+++ b/${file.path}`);

    for (const hunk of file.hunks) {
      parts.push(hunk.header);
      for (const line of hunk.lines) {
        parts.push(`${line.origin}${line.content}`);
      }
    }
  }

  return parts.join('\n');
}

// ============================================================================
// Scope-Specific Diff Fetchers
// ============================================================================

/**
 * Fetch uncommitted changes (unstaged + staged)
 */
async function fetchUncommittedDiff(repoPath: string): Promise<DiffResult> {
  try {
    // Get both unstaged and staged diffs
    const [unstagedDiff, stagedDiffs] = await Promise.all([
      invoke<string>('git_diff', { repoPath }),
      invoke<FileDiff[]>('git_staged_diff', { repoPath }),
    ]);

    // Convert staged structured diff to unified format
    const stagedDiff = structuredDiffToUnified(stagedDiffs);

    // Combine diffs with headers
    const parts: string[] = [];

    if (stagedDiff.length > 0) {
      parts.push('# Staged Changes\n');
      parts.push(stagedDiff);
    }

    if (unstagedDiff.length > 0) {
      if (parts.length > 0) {
        parts.push('\n\n# Unstaged Changes\n');
      }
      parts.push(unstagedDiff);
    }

    const combinedDiff = parts.join('');

    if (combinedDiff.length === 0) {
      return {
        success: true,
        diff: '',
        description: 'No uncommitted changes found',
        filesChanged: 0,
        linesAdded: 0,
        linesRemoved: 0,
      };
    }

    const stats = parseDiffStats(combinedDiff);

    return {
      success: true,
      diff: combinedDiff,
      description: `Uncommitted changes: ${String(stats.filesChanged)} files, +${String(stats.linesAdded)}/-${String(stats.linesRemoved)} lines`,
      ...stats,
    };
  } catch (error) {
    return {
      success: false,
      diff: '',
      description: 'Failed to fetch uncommitted changes',
      filesChanged: 0,
      linesAdded: 0,
      linesRemoved: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Fetch staged changes only
 */
async function fetchStagedDiff(repoPath: string): Promise<DiffResult> {
  try {
    const stagedDiffs = await invoke<FileDiff[]>('git_staged_diff', { repoPath });
    const diff = structuredDiffToUnified(stagedDiffs);

    if (diff.length === 0) {
      return {
        success: true,
        diff: '',
        description: 'No staged changes found',
        filesChanged: 0,
        linesAdded: 0,
        linesRemoved: 0,
      };
    }

    const stats = parseDiffStats(diff);

    return {
      success: true,
      diff,
      description: `Staged changes: ${String(stats.filesChanged)} files, +${String(stats.linesAdded)}/-${String(stats.linesRemoved)} lines`,
      ...stats,
    };
  } catch (error) {
    return {
      success: false,
      diff: '',
      description: 'Failed to fetch staged changes',
      filesChanged: 0,
      linesAdded: 0,
      linesRemoved: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Fetch branch diff (current branch vs main/master)
 */
async function fetchBranchDiff(repoPath: string, baseBranch = 'main'): Promise<DiffResult> {
  try {
    // Use git_diff_range command if available, otherwise fall back to shell
    // For now, we'll use a shell command since git_diff doesn't support ranges
    const diff = await invoke<string>('run_shell_command', {
      cwd: repoPath,
      command: 'git',
      args: ['diff', `${baseBranch}...HEAD`],
    }).catch(async () => {
      // Fallback: try with 'master' if 'main' fails
      if (baseBranch === 'main') {
        return invoke<string>('run_shell_command', {
          cwd: repoPath,
          command: 'git',
          args: ['diff', 'master...HEAD'],
        });
      }
      throw new Error(`Branch '${baseBranch}' not found`);
    });

    if (diff.length === 0) {
      return {
        success: true,
        diff: '',
        description: `No changes from ${baseBranch}`,
        filesChanged: 0,
        linesAdded: 0,
        linesRemoved: 0,
      };
    }

    const stats = parseDiffStats(diff);

    return {
      success: true,
      diff,
      description: `Branch diff vs ${baseBranch}: ${String(stats.filesChanged)} files, +${String(stats.linesAdded)}/-${String(stats.linesRemoved)} lines`,
      ...stats,
    };
  } catch (error) {
    return {
      success: false,
      diff: '',
      description: `Failed to fetch branch diff against ${baseBranch}`,
      filesChanged: 0,
      linesAdded: 0,
      linesRemoved: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Fetch PR diff using GitHub CLI
 */
async function fetchPRDiff(repoPath: string, prRef: string): Promise<DiffResult> {
  try {
    // Extract PR number from URL or use directly
    const prNumber = prRef.includes('/') ? (prRef.split('/').pop() ?? prRef) : prRef;

    const diff = await invoke<string>('run_shell_command', {
      cwd: repoPath,
      command: 'gh',
      args: ['pr', 'diff', prNumber],
    });

    if (diff.length === 0) {
      return {
        success: true,
        diff: '',
        description: `PR #${prNumber} has no changes`,
        filesChanged: 0,
        linesAdded: 0,
        linesRemoved: 0,
      };
    }

    const stats = parseDiffStats(diff);

    return {
      success: true,
      diff,
      description: `PR #${prNumber}: ${String(stats.filesChanged)} files, +${String(stats.linesAdded)}/-${String(stats.linesRemoved)} lines`,
      ...stats,
    };
  } catch (error) {
    return {
      success: false,
      diff: '',
      description: `Failed to fetch PR diff for ${prRef}`,
      filesChanged: 0,
      linesAdded: 0,
      linesRemoved: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Fetch commit diff
 */
async function fetchCommitDiff(repoPath: string, commitSha: string): Promise<DiffResult> {
  try {
    // Check if it's a range (sha1..sha2) or single commit
    const isRange = commitSha.includes('..');
    const args = isRange ? ['diff', commitSha] : ['show', '--format=', commitSha]; // --format= suppresses commit message

    const diff = await invoke<string>('run_shell_command', {
      cwd: repoPath,
      command: 'git',
      args,
    });

    if (diff.length === 0) {
      return {
        success: true,
        diff: '',
        description: `Commit ${commitSha.substring(0, 7)} has no changes`,
        filesChanged: 0,
        linesAdded: 0,
        linesRemoved: 0,
      };
    }

    const stats = parseDiffStats(diff);
    const shortSha = isRange ? commitSha : commitSha.substring(0, 7);

    return {
      success: true,
      diff,
      description: `Commit ${shortSha}: ${String(stats.filesChanged)} files, +${String(stats.linesAdded)}/-${String(stats.linesRemoved)} lines`,
      ...stats,
    };
  } catch (error) {
    return {
      success: false,
      diff: '',
      description: `Failed to fetch commit diff for ${commitSha}`,
      filesChanged: 0,
      linesAdded: 0,
      linesRemoved: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Fetch diff based on ReviewScope configuration.
 *
 * @param repoPath - Path to the git repository
 * @param config - Review agent configuration with scope settings
 * @returns DiffResult with the unified diff and metadata
 *
 * @example
 * ```typescript
 * const result = await fetchDiffForReview('/path/to/repo', {
 *   id: 'agent-1',
 *   name: 'Code Review',
 *   agentType: 'review',
 *   reviewScope: 'uncommitted',
 * });
 *
 * if (result.success) {
 *   console.log(`Found ${result.filesChanged} files to review`);
 *   console.log(result.diff);
 * }
 * ```
 */
export async function fetchDiffForReview(
  repoPath: string,
  config: ReviewAgentTypeConfig
): Promise<DiffResult> {
  const { reviewScope, baseBranch, prRef, commitSha } = config;

  switch (reviewScope) {
    case 'uncommitted':
      return fetchUncommittedDiff(repoPath);

    case 'staged':
      return fetchStagedDiff(repoPath);

    case 'branch':
      return fetchBranchDiff(repoPath, baseBranch ?? 'main');

    case 'pr':
      if (prRef === undefined || prRef === '') {
        return {
          success: false,
          diff: '',
          description: 'PR reference is required for PR scope',
          filesChanged: 0,
          linesAdded: 0,
          linesRemoved: 0,
          error: 'Missing prRef configuration',
        };
      }
      return fetchPRDiff(repoPath, prRef);

    case 'commit':
      if (commitSha === undefined || commitSha === '') {
        return {
          success: false,
          diff: '',
          description: 'Commit SHA is required for commit scope',
          filesChanged: 0,
          linesAdded: 0,
          linesRemoved: 0,
          error: 'Missing commitSha configuration',
        };
      }
      return fetchCommitDiff(repoPath, commitSha);
  }
}

/**
 * Get a human-readable description for a review scope
 */
export function getReviewScopeDescription(
  scope: ReviewScope,
  config: ReviewAgentTypeConfig
): string {
  switch (scope) {
    case 'uncommitted':
      return 'all uncommitted changes (staged and unstaged)';
    case 'staged':
      return 'staged changes only';
    case 'branch':
      return `branch changes vs ${config.baseBranch ?? 'main'}`;
    case 'pr':
      return `pull request ${config.prRef ?? ''}`;
    case 'commit':
      return `commit ${config.commitSha?.substring(0, 7) ?? ''}`;
  }
}
