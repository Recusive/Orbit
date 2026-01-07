/**
 * Git store - Git repository state
 */

export {
  useGitStore,
  selectBranch,
  selectUpstream,
  selectAhead,
  selectBehind,
  selectIsClean,
  selectHasConflicts,
  selectTotalChanges,
  selectStagedCount,
  selectModifiedCount,
  selectUntrackedCount,
  selectFileStatus,
  selectIsStaged,
  selectEntriesByStatus,
  useGitBranch,
  useGitAhead,
  useGitBehind,
  useGitIsClean,
  useGitTotalChanges,
  useIsGitRepo,
} from './git-store';
export type { FileStatus, GitBranch, GitStatus, StatusEntry } from './git-store';
