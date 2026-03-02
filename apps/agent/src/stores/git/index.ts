/**
 * Git store - Git repository state
 */

export {
  useGitStore,
  selectBranch,
  selectAhead,
  selectBehind,
  selectIsClean,
  selectHasConflicts,
  selectTotalChanges,
  selectStagedCount,
  selectModifiedCount,
  selectUntrackedCount,
  selectFileStatus,
  selectDirectoryStatus,
  useGitBranch,
  useGitAhead,
  useGitBehind,
  useGitIsClean,
  useGitTotalChanges,
  useIsGitRepo,
  useBranchDiffStats,
} from './git-store';
export type { BranchDiffStats, FileStatus, GitBranch, GitStatus, StatusEntry } from './git-store';
