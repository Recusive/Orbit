import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect, useRef } from 'react';

import type { FileStatus, GitBranch, GitStatus, StatusEntry } from '@/lib/api';

import {
  gitBranches,
  gitCheckout,
  gitCommit,
  gitDiscard,
  gitDiscover,
  gitPull,
  gitPush,
  gitStage,
  gitStatus,
  gitUnstage,
} from '@/lib/api';
import {
  selectHasConflicts,
  selectIsClean,
  selectTotalChanges,
  useGitStore,
} from '@/stores/git/git-store';

const logger = createLogger('Git');

export interface UseGitStatusOptions {
  /** Polling interval in ms (default: 5000, set to 0 to disable) */
  pollInterval?: number;
  /** Whether to start polling immediately (default: true) */
  enabled?: boolean;
  /** Pause polling when document is hidden (default: true) */
  pauseWhenHidden?: boolean;
}

export interface UseGitStatusResult {
  /** Git status data, null if not in a git repo or not loaded */
  status: GitStatus | null;
  /** Path to the git repository root */
  repoPath: string | null;
  /** Whether the initial load is in progress (not background polling) */
  isLoading: boolean;
  /** Error if the fetch failed */
  error: string | null;
  /** Manually refresh the status */
  refresh: () => Promise<void>;
  /** Whether repo is clean (no changes) */
  isClean: boolean;
  /** Whether there are merge conflicts */
  hasConflicts: boolean;
  /** Total count of all changes */
  totalChanges: number;
  /** Get entries by status type */
  getByStatus: (status: FileStatus) => StatusEntry[];
  /** Stage files for commit */
  stage: (files: string[]) => Promise<void>;
  /** Unstage files from index */
  unstage: (files: string[]) => Promise<void>;
  /** Commit staged changes, returns commit hash */
  commit: (message: string) => Promise<string>;
  /** Discard changes to files */
  discard: (files: string[]) => Promise<void>;
  /** Push commits to remote */
  push: (remote?: string) => Promise<void>;
  /** Pull changes from remote */
  pull: (remote?: string) => Promise<void>;
  /** List of branches */
  branches: GitBranch[];
  /** Fetch branches from repository */
  listBranches: () => Promise<GitBranch[]>;
  /** Checkout a branch */
  checkout: (branch: string) => Promise<void>;
}

/**
 * Hook to fetch and poll git status for a workspace.
 *
 * This hook manages polling and writes to the shared gitStore.
 * Components can also subscribe directly to gitStore for reads.
 *
 * @param workspacePath - The path to check for git status
 * @param options - Configuration options
 * @returns Git status, repo path, loading state, error, and actions
 *
 * @example
 * ```tsx
 * // Full usage (manages polling)
 * function GitPanel() {
 *   const { status, stage, commit } = useGitStatus('/path/to/project');
 *   // ...
 * }
 *
 * // Read-only usage (no polling overhead)
 * function StatusBar() {
 *   const branch = useGitStore(selectBranch);
 *   const { ahead, behind } = useGitStore(selectAheadBehind);
 *   // ...
 * }
 * ```
 */
export function useGitStatus(
  workspacePath: string | null,
  options: UseGitStatusOptions = {}
): UseGitStatusResult {
  const { pollInterval = 5000, enabled = true, pauseWhenHidden = true } = options;

  // Store state
  const status = useGitStore((s) => s.status);
  const repoPath = useGitStore((s) => s.repoPath);
  const isLoading = useGitStore((s) => s.isLoading);
  const error = useGitStore((s) => s.error);
  const branches = useGitStore((s) => s.branches);

  // Derived selectors (optimized subscriptions)
  const isClean = useGitStore(selectIsClean);
  const hasConflicts = useGitStore(selectHasConflicts);
  const totalChanges = useGitStore(selectTotalChanges);

  // Store actions (stable references from zustand)
  const setRepoPath = useGitStore((s) => s.setRepoPath);
  const setStatus = useGitStore((s) => s.setStatus);
  const setLoading = useGitStore((s) => s.setLoading);
  const setError = useGitStore((s) => s.setError);
  const setBranches = useGitStore((s) => s.setBranches);
  const reset = useGitStore((s) => s.reset);

  // Request counter to handle race conditions
  const requestIdRef = useRef(0);
  // Track if we have data
  const hasLoadedRef = useRef(false);

  // Normalize workspace path
  const trimmedPath = workspacePath?.trim();
  const normalizedPath = trimmedPath && trimmedPath.length > 0 ? trimmedPath : null;

  // Store normalizedPath in a ref to avoid recreating loadStatus on every render
  const normalizedPathRef = useRef(normalizedPath);
  normalizedPathRef.current = normalizedPath;

  // Store action refs to avoid recreating loadStatus callback
  const actionsRef = useRef({ reset, setRepoPath, setStatus, setLoading, setError });
  actionsRef.current = { reset, setRepoPath, setStatus, setLoading, setError };

  // loadStatus uses refs internally to avoid dependency changes causing effect re-runs
  const loadStatus = useCallback(async (isBackgroundRefresh: boolean): Promise<void> => {
    const path = normalizedPathRef.current;
    const actions = actionsRef.current;

    if (!path) {
      actions.reset();
      hasLoadedRef.current = false;
      return;
    }

    const currentRequestId = ++requestIdRef.current;

    if (!isBackgroundRefresh) {
      actions.setLoading(true);
    }

    try {
      const discovered = await gitDiscover(path);

      if (requestIdRef.current !== currentRequestId) {
        return;
      }

      actions.setRepoPath(discovered);

      const result = await gitStatus(discovered);

      if (requestIdRef.current !== currentRequestId) {
        return;
      }

      actions.setStatus(result);
      hasLoadedRef.current = true;
    } catch (err) {
      if (requestIdRef.current !== currentRequestId) {
        return;
      }

      const errStr = err instanceof Error ? err.message : String(err);

      // Not a git repo is not an error state
      if (errStr.includes('not a git repository') || errStr.includes('NOT_A_REPO')) {
        actions.reset();
      } else {
        actions.setError(errStr);
      }
      hasLoadedRef.current = false;
    }
  }, []); // Empty deps - uses refs internally for stable reference

  // Wrap for external refresh
  const refresh = useCallback(async (): Promise<void> => {
    await loadStatus(false);
  }, [loadStatus]);

  // Reset store and reload when workspace changes
  // This ensures stale data from previous workspace is cleared immediately
  useEffect(() => {
    if (enabled && normalizedPath) {
      // Reset first to clear any stale data from previous workspace
      actionsRef.current.reset();
      hasLoadedRef.current = false;
      void loadStatus(false);
    } else if (!enabled) {
      actionsRef.current.reset();
      hasLoadedRef.current = false;
    }
    // Only re-run when workspace path or enabled flag actually changes
  }, [normalizedPath, enabled, loadStatus]);

  // Polling with visibility awareness
  useEffect(() => {
    if (!enabled || pollInterval <= 0 || !normalizedPath) {
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = (): void => {
      if (intervalId !== null) return;
      intervalId = setInterval(() => {
        void loadStatus(true);
      }, pollInterval);
    };

    const stopPolling = (): void => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = (): void => {
      if (document.hidden && pauseWhenHidden) {
        stopPolling();
      } else {
        if (!document.hidden && pauseWhenHidden) {
          void loadStatus(true);
        }
        startPolling();
      }
    };

    if (!pauseWhenHidden || !document.hidden) {
      startPolling();
    }

    if (pauseWhenHidden) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return (): void => {
      stopPolling();
      if (pauseWhenHidden) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
    // loadStatus is now stable (empty deps), so this effect won't restart unnecessarily
  }, [loadStatus, pollInterval, enabled, normalizedPath, pauseWhenHidden]);

  // Derived helper
  const getByStatus = useCallback(
    (fileStatus: FileStatus): StatusEntry[] => {
      if (!status) return [];
      return [
        ...status.staged,
        ...status.modified,
        ...status.untracked,
        ...status.conflicted,
      ].filter((e) => e.status === fileStatus);
    },
    [status]
  );

  // Git operations - stage files
  const stage = useCallback(
    async (files: string[]): Promise<void> => {
      if (!repoPath) {
        throw new Error('Not a git repository');
      }
      await gitStage(repoPath, files);
      await loadStatus(true);
    },
    [repoPath, loadStatus]
  );

  // Git operations - unstage files
  const unstage = useCallback(
    async (files: string[]): Promise<void> => {
      if (!repoPath) {
        throw new Error('Not a git repository');
      }
      await gitUnstage(repoPath, files);
      await loadStatus(true);
    },
    [repoPath, loadStatus]
  );

  // Git operations - commit staged changes
  const commit = useCallback(
    async (message: string): Promise<string> => {
      if (!repoPath) {
        throw new Error('Not a git repository');
      }
      logger.info('Committing changes', { message: message.substring(0, 50) });
      const hash = await gitCommit(repoPath, message);
      logger.debug('Commit complete', { hash });
      await loadStatus(true);
      return hash;
    },
    [repoPath, loadStatus]
  );

  // Git operations - discard changes
  const discard = useCallback(
    async (files: string[]): Promise<void> => {
      if (!repoPath) {
        throw new Error('Not a git repository');
      }
      await gitDiscard(repoPath, files);
      await loadStatus(true);
    },
    [repoPath, loadStatus]
  );

  // Git operations - push to remote
  const push = useCallback(
    async (remote?: string): Promise<void> => {
      if (!repoPath) {
        throw new Error('Not a git repository');
      }
      await gitPush(repoPath, remote);
      await loadStatus(true);
    },
    [repoPath, loadStatus]
  );

  // Git operations - pull from remote
  const pull = useCallback(
    async (remote?: string): Promise<void> => {
      if (!repoPath) {
        throw new Error('Not a git repository');
      }
      await gitPull(repoPath, remote);
      await loadStatus(true);
    },
    [repoPath, loadStatus]
  );

  // Git operations - list branches
  const listBranches = useCallback(async (): Promise<GitBranch[]> => {
    if (!repoPath) {
      return [];
    }
    const branchList = await gitBranches(repoPath);
    setBranches(branchList);
    return branchList;
  }, [repoPath, setBranches]);

  // Git operations - checkout branch
  const checkout = useCallback(
    async (branchName: string): Promise<void> => {
      if (!repoPath) {
        throw new Error('Not a git repository');
      }
      logger.info('Checking out branch', { branch: branchName });
      await gitCheckout(repoPath, branchName);
      await loadStatus(true);
      await listBranches();
    },
    [repoPath, loadStatus, listBranches]
  );

  return {
    status,
    repoPath,
    isLoading,
    error,
    refresh,
    isClean,
    hasConflicts,
    totalChanges,
    getByStatus,
    stage,
    unstage,
    commit,
    discard,
    push,
    pull,
    branches,
    listBranches,
    checkout,
  };
}
