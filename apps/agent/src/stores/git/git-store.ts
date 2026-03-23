import { createLogger } from '@orbit/common/lib';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

import type {
  BranchDiffStats,
  FileStatus,
  GitBranch,
  GitStatus,
  GitStatusResponse,
  StatusEntry,
} from '@/lib/api';

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
  /** Backend-computed fingerprint for the current status payload */
  statusFingerprint: string | null;
  /** Monotonic revision that only advances when the status payload materially changes */
  statusRevision: number;
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
  /** Legacy full-status setter for tests and one-off local writes */
  setStatus: (status: GitStatus) => void;
  /** Apply a polled/full status response from the backend */
  applyPolledStatus: (result: GitStatusResponse) => void;
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
  statusFingerprint: null,
  statusRevision: 0,
  branches: [],
  isFetching: false,
  lastFetchedAt: null,
  branchDiffStats: null,
};

function isIgnoredNoiseUntrackedPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').toLowerCase();
  return normalized === '.ds_store' || normalized.endsWith('/.ds_store');
}

function sanitizeStatus(status: GitStatus): GitStatus {
  const filteredUntracked = status.untracked.filter(
    (entry) => !isIgnoredNoiseUntrackedPath(entry.path)
  );

  if (filteredUntracked.length === status.untracked.length) {
    return status;
  }

  return {
    ...status,
    untracked: filteredUntracked,
  };
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

interface TrieNode {
  status: FileStatus | null;
  children: Map<string, TrieNode>;
}

interface StatusMaps {
  fileMap: Map<string, FileStatus>;
  dirTrie: TrieNode;
}

function createTrieNode(): TrieNode {
  return {
    status: null,
    children: new Map<string, TrieNode>(),
  };
}

function insertDirectoryStatus(root: TrieNode, filePath: string, status: FileStatus): void {
  root.status = pickHigherStatus(root.status, status);

  const segments = filePath.split('/');
  let node = root;

  for (const segment of segments.slice(0, -1)) {
    let child = node.children.get(segment);
    if (!child) {
      child = createTrieNode();
      node.children.set(segment, child);
    }

    child.status = pickHigherStatus(child.status, status);
    node = child;
  }
}

function getDirectoryStatus(root: TrieNode, relativePath: string): FileStatus | null {
  if (relativePath === '') {
    return root.status;
  }

  let node: TrieNode | undefined = root;
  for (const segment of relativePath.split('/')) {
    node = node.children.get(segment);
    if (!node) {
      return null;
    }
  }

  return node.status;
}

function buildStatusMaps(status: GitStatus, repoPath: string): StatusMaps {
  const fileMap = new Map<string, FileStatus>();
  const dirTrie = createTrieNode();

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
    insertDirectoryStatus(dirTrie, key, entry.status);
  }

  return { fileMap, dirTrie };
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
          state.statusFingerprint = null;
          state.statusRevision = 0;
        });
      },

      setStatus: (status): void => {
        set((state) => {
          const sanitizedStatus = sanitizeStatus(status);
          logger.debug(`Git status updated`, {
            branch: sanitizedStatus.branch,
            ahead: sanitizedStatus.ahead,
            behind: sanitizedStatus.behind,
          });
          state.status = sanitizedStatus;
          state.error = null;
          state.isLoading = false;
          state.lastUpdated = Date.now();
          state.statusFingerprint = null;
          state.statusRevision += 1;
        });
      },

      applyPolledStatus: (result): void => {
        set((state) => {
          const previousFingerprint = state.statusFingerprint;

          state.statusFingerprint = result.fingerprint;
          state.lastUpdated = Date.now();
          state.error = null;
          state.isLoading = false;

          if (!result.status) {
            return;
          }

          const hasMaterialChange =
            state.status === null ||
            previousFingerprint === null ||
            previousFingerprint !== result.fingerprint;

          if (!hasMaterialChange) {
            return;
          }

          const sanitizedStatus = sanitizeStatus(result.status);
          logger.debug(`Git status updated`, {
            branch: sanitizedStatus.branch,
            ahead: sanitizedStatus.ahead,
            behind: sanitizedStatus.behind,
          });
          state.status = sanitizedStatus;
          state.statusRevision += 1;
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
          state.statusFingerprint = initialState.statusFingerprint;
          state.statusRevision = initialState.statusRevision;
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

    return maps.fileMap.get(normalizeEntryPath(relativePath, state.repoPath)) ?? null;
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

    return getDirectoryStatus(maps.dirTrie, normalizeEntryPath(relativePath, state.repoPath));
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
