import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

import type { FileStatus, GitBranch, GitStatus, StatusEntry } from '@/lib/backend';

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
          state.repoPath = repoPath;
        });
      },

      setStatus: (status): void => {
        set((state) => {
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

      reset: (): void => {
        set((state) => {
          state.repoPath = initialState.repoPath;
          state.status = initialState.status;
          state.isLoading = initialState.isLoading;
          state.error = initialState.error;
          state.lastUpdated = initialState.lastUpdated;
          state.branches = initialState.branches;
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

/** Select upstream branch name, null if none */
export const selectUpstream = (state: GitStore): string | null => state.status?.upstream ?? null;

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

/**
 * Create a selector for checking if a file is staged
 * Usage: useGitStore(selectIsStaged('/path/to/file'))
 */
export const selectIsStaged =
  (path: string) =>
  (state: GitStore): boolean => {
    if (!state.status) return false;
    return state.status.staged.some(
      (e) => e.path === path || path.endsWith(e.path) || e.path.endsWith(path)
    );
  };

/** Select all entries for a specific status type */
export const selectEntriesByStatus =
  (fileStatus: FileStatus) =>
  (state: GitStore): StatusEntry[] => {
    if (!state.status) return [];
    return [
      ...state.status.staged,
      ...state.status.modified,
      ...state.status.untracked,
      ...state.status.conflicted,
    ].filter((e) => e.status === fileStatus);
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
