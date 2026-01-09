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
  useGitBranch,
  useGitAhead,
  useGitBehind,
  useGitIsClean,
  useGitTotalChanges,
  useIsGitRepo,
} from './git-store';
export type { FileStatus, GitBranch, GitStatus, StatusEntry } from './git-store';
