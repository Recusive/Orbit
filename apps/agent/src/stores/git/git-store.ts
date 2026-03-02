import { createLogger } from '@orbit/common/lib';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

import type { BranchDiffStats, FileStatus, GitBranch, GitStatus, StatusEntry } from '@/lib/api';

import { toRelativePath } from '@/lib/utils/path-utils';

const logger = createLogger('GitStore');

// Re-export types for convenience
export type { BranchDiffStats, FileStatus, GitBranch, GitStatus, StatusEntry };

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
  /** Branch diff stats (current branch vs main) */
  branchDiffStats: BranchDiffStats | null;
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
  /** Set branch diff stats */
  setBranchDiffStats: (stats: BranchDiffStats | null) => void;
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
  branchDiffStats: null,
};

/** Compute a stable, order-independent fingerprint for a status entry list */
function listSignature(entries: readonly StatusEntry[]): string {
  if (entries.length === 0) return '';

  return entries
    .map((entry) => {
      return `${entry.path}\0${entry.status}\0${entry.oldPath ?? ''}\0${String(entry.similarity ?? '')}`;
    })
    .sort()
    .join('\x01');
}

const STATUS_PRIORITY: Record<FileStatus, number> = {
  conflicted: 8,
  modified: 7,
  added: 6,
  deleted: 5,
  renamed: 4,
  typechange: 3,
  copied: 2,
  untracked: 1,
};

function pickHigherStatus(current: FileStatus | null, next: FileStatus): FileStatus {
  if (current === null) return next;
  return STATUS_PRIORITY[next] > STATUS_PRIORITY[current] ? next : current;
}

function normalizeEntryPath(entryPath: string, repoPath: string): string {
  let normalized = entryPath.replace(/\\/g, '/');
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  if (/^[A-Za-z]:[\\/]/.test(repoPath)) {
    return normalized.toLowerCase();
  }

  return normalized;
}

function parentDir(relativePath: string): string | null {
  if (relativePath === '') return null;

  const lastSlash = relativePath.lastIndexOf('/');
  return lastSlash === -1 ? '' : relativePath.slice(0, lastSlash);
}

interface StatusMaps {
  fileMap: Map<string, FileStatus>;
  dirMap: Map<string, FileStatus>;
}

function buildStatusMaps(status: GitStatus, repoPath: string): StatusMaps {
  const fileMap = new Map<string, FileStatus>();
  const dirMap = new Map<string, FileStatus>();

  const allEntries = [
    ...status.staged,
    ...status.modified,
    ...status.untracked,
    ...status.conflicted,
  ];

  for (const entry of allEntries) {
    const key = normalizeEntryPath(entry.path, repoPath);

    const existingFile = fileMap.get(key);
    fileMap.set(key, pickHigherStatus(existingFile ?? null, entry.status));

    let dir = parentDir(key);
    while (dir !== null) {
      const existingDir = dirMap.get(dir);
      if (
        existingDir !== undefined &&
        STATUS_PRIORITY[existingDir] >= STATUS_PRIORITY[entry.status]
      ) {
        break;
      }

      dirMap.set(dir, pickHigherStatus(existingDir ?? null, entry.status));
      dir = parentDir(dir);
    }
  }

  return { fileMap, dirMap };
}

let cachedStatus: GitStatus | null = null;
let cachedRepoPath: string | null = null;
let cachedMaps: StatusMaps | null = null;

function getStatusMaps(status: GitStatus, repoPath: string): StatusMaps {
  if (cachedMaps === null || status !== cachedStatus || repoPath !== cachedRepoPath) {
    cachedMaps = buildStatusMaps(status, repoPath);
    cachedStatus = status;
    cachedRepoPath = repoPath;
  }

  return cachedMaps;
}

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
              listSignature(prev.staged) === listSignature(status.staged) &&
              listSignature(prev.modified) === listSignature(status.modified) &&
              listSignature(prev.untracked) === listSignature(status.untracked) &&
              listSignature(prev.conflicted) === listSignature(status.conflicted);
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

      setBranchDiffStats: (stats): void => {
        set((state) => {
          state.branchDiffStats = stats;
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
          state.branchDiffStats = initialState.branchDiffStats;
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
  (absolutePath: string) =>
  (state: GitStore): FileStatus | null => {
    if (!state.status || !state.repoPath) return null;

    const maps = getStatusMaps(state.status, state.repoPath);
    const relativePath = toRelativePath(absolutePath, state.repoPath);
    if (relativePath === null) return null;

    return maps.fileMap.get(relativePath) ?? null;
  };

/**
 * Create a selector for a specific directory's propagated git status.
 * Usage: useGitStore(selectDirectoryStatus('/path/to/folder'))
 */
export const selectDirectoryStatus =
  (absolutePath: string) =>
  (state: GitStore): FileStatus | null => {
    if (!state.status || !state.repoPath) return null;

    const maps = getStatusMaps(state.status, state.repoPath);
    const relativePath = toRelativePath(absolutePath, state.repoPath);
    if (relativePath === null) return null;

    return maps.dirMap.get(relativePath) ?? null;
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

/** Hook to get branch diff stats */
export const useBranchDiffStats = (): BranchDiffStats | null =>
  useGitStore((state) => state.branchDiffStats);
