import { createLogger } from '@orbit/common/lib';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

import type { FileStatus, GitBranch, GitStatus, StatusEntry } from '@/lib/api';

const logger = createLogger('GitStore');

// Re-export types for convenience
export type { FileStatus, GitBranch, GitStatus, StatusEntry };

// ============================================
// State Interface
// ============================================

interface GitState {
  /** Path to the git repository root, null if not in a git repo */
  repoPath: string | null;
  /** Git status data */
  status: GitStatus | null;
  /** Whether the initial load is in progress */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Timestamp of last successful status update */
  lastUpdated: number | null;
  /** List of branches */
  branches: GitBranch[];
  /** Whether a fetch from remote is in progress */
  isFetching: boolean;
  /** Timestamp of last successful fetch from remote */
  lastFetchedAt: number | null;
}

interface GitActions {
  /** Set the repository path */
  setRepoPath: (path: string | null) => void;
  /** Set git status (also clears error and sets lastUpdated) */
  setStatus: (status: GitStatus) => void;
  /** Set loading state */
  setLoading: (loading: boolean) => void;
  /** Set error state (also clears loading) */
  setError: (error: string | null) => void;
  /** Set branches list */
  setBranches: (branches: GitBranch[]) => void;
  /** Set whether a fetch from remote is in progress */
  setFetching: (fetching: boolean) => void;
  /** Set timestamp of last successful fetch from remote */
  setLastFetchedAt: (timestamp: number) => void;
  /** Reset all state to initial values */
  reset: () => void;
}

type GitStore = GitState & GitActions;

// ============================================
// Initial State
// ============================================

const initialState: GitState = {
  repoPath: null,
  status: null,
  isLoading: false,
  error: null,
  lastUpdated: null,
  branches: [],
  isFetching: false,
  lastFetchedAt: null,
};

// ============================================
// Store
// ============================================

export const useGitStore = create<GitStore>()(
  subscribeWithSelector(
    immer((set) => ({
      ...initialState,

      setRepoPath: (repoPath): void => {
        set((state) => {
          // Skip update if value hasn't changed (prevents cascading re-renders)
          if (state.repoPath === repoPath) {
            return;
          }
          logger.info(`Git repo path set: ${repoPath ?? 'none'}`);
          state.repoPath = repoPath;
        });
      },

      setStatus: (status): void => {
        set((state) => {
          // Skip update if status hasn't meaningfully changed
          const prev = state.status;
          if (prev) {
            const unchanged =
              prev.branch === status.branch &&
              prev.ahead === status.ahead &&
              prev.behind === status.behind &&
              prev.staged.length === status.staged.length &&
              prev.modified.length === status.modified.length &&
              prev.untracked.length === status.untracked.length &&
              prev.conflicted.length === status.conflicted.length;
            if (unchanged) {
              // Only update lastUpdated for background refreshes, don't trigger re-renders
              state.lastUpdated = Date.now();
              return;
            }
          }
          logger.debug(`Git status updated`, {
            branch: status.branch,
            ahead: status.ahead,
            behind: status.behind,
          });
          state.status = status;
          state.error = null;
          state.isLoading = false;
          state.lastUpdated = Date.now();
        });
      },

      setLoading: (isLoading): void => {
        set((state) => {
          state.isLoading = isLoading;
        });
      },

      setError: (error): void => {
        if (error) {
          logger.error(`Git error: ${error}`);
        }
        set((state) => {
          state.error = error;
          state.isLoading = false;
        });
      },

      setBranches: (branches): void => {
        set((state) => {
          state.branches = branches;
        });
      },

      setFetching: (isFetching): void => {
        set((state) => {
          state.isFetching = isFetching;
        });
      },

      setLastFetchedAt: (timestamp): void => {
        set((state) => {
          logger.debug(`Fetch completed at ${new Date(timestamp).toISOString()}`);
          state.lastFetchedAt = timestamp;
        });
      },

      reset: (): void => {
        set((state) => {
          state.repoPath = initialState.repoPath;
          state.status = initialState.status;
          state.isLoading = initialState.isLoading;
          state.error = initialState.error;
          state.lastUpdated = initialState.lastUpdated;
          state.branches = initialState.branches;
          state.isFetching = initialState.isFetching;
          state.lastFetchedAt = initialState.lastFetchedAt;
        });
      },
    }))
  )
);

// ============================================
// Selectors (for optimized subscriptions)
// ============================================

/** Select current branch name, null if not in a repo */
export const selectBranch = (state: GitStore): string | null => state.status?.branch ?? null;

/** Select commits ahead of upstream */
export const selectAhead = (state: GitStore): number => state.status?.ahead ?? 0;

/** Select commits behind upstream */
export const selectBehind = (state: GitStore): number => state.status?.behind ?? 0;

/** Select whether the repo is clean (no changes) */
export const selectIsClean = (state: GitStore): boolean =>
  state.status
    ? state.status.staged.length === 0 &&
      state.status.modified.length === 0 &&
      state.status.untracked.length === 0 &&
      state.status.conflicted.length === 0
    : true;

/** Select whether there are merge conflicts */
export const selectHasConflicts = (state: GitStore): boolean =>
  (state.status?.conflicted.length ?? 0) > 0;

/** Select total count of all changes */
export const selectTotalChanges = (state: GitStore): number =>
  state.status
    ? state.status.staged.length +
      state.status.modified.length +
      state.status.untracked.length +
      state.status.conflicted.length
    : 0;

/** Select staged files count */
export const selectStagedCount = (state: GitStore): number => state.status?.staged.length ?? 0;

/** Select modified files count */
export const selectModifiedCount = (state: GitStore): number => state.status?.modified.length ?? 0;

/** Select untracked files count */
export const selectUntrackedCount = (state: GitStore): number =>
  state.status?.untracked.length ?? 0;

/**
 * Create a selector for a specific file's git status
 * Usage: useGitStore(selectFileStatus('/path/to/file'))
 */
export const selectFileStatus =
  (path: string) =>
  (state: GitStore): FileStatus | null => {
    if (!state.status) return null;

    const allEntries = [
      ...state.status.staged,
      ...state.status.modified,
      ...state.status.untracked,
      ...state.status.conflicted,
    ];

    // Try exact match first
    const exactMatch = allEntries.find((e) => e.path === path);
    if (exactMatch) return exactMatch.status;

    // Fall back to suffix match (for when path includes repo root)
    const suffixMatch = allEntries.find((e) => path.endsWith(e.path) || e.path.endsWith(path));
    return suffixMatch?.status ?? null;
  };

// ============================================
// Convenience Hooks
// ============================================

/** Hook to get branch name */
export const useGitBranch = (): string | null => useGitStore(selectBranch);

/** Hook to get commits ahead */
export const useGitAhead = (): number => useGitStore(selectAhead);

/** Hook to get commits behind */
export const useGitBehind = (): number => useGitStore(selectBehind);

/** Hook to check if repo is clean */
export const useGitIsClean = (): boolean => useGitStore(selectIsClean);

/** Hook to get total changes count */
export const useGitTotalChanges = (): number => useGitStore(selectTotalChanges);

/** Hook to check if in a git repo */
export const useIsGitRepo = (): boolean => useGitStore((state) => state.repoPath !== null);
