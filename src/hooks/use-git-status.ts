import { useCallback, useEffect, useRef, useState } from 'react';

import type { FileStatus, GitBranch, GitStatus, StatusEntry } from '@/lib/backend';

import {
  gitBranches,
  gitCheckout,
  gitCommit,
  gitDiscover,
  gitDiscard,
  gitPull,
  gitPush,
  gitStage,
  gitStatus,
  gitUnstage,
} from '@/lib/backend';

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
  error: Error | null;
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
 * Hook to fetch and poll git status for a workspace
 *
 * @param workspacePath - The path to check for git status
 * @param options - Configuration options
 * @returns Git status, repo path, loading state, error, and refresh function
 *
 * @example
 * ```tsx
 * function GitPanel() {
 *   const { status, isLoading, refresh } = useGitStatus('/path/to/project');
 *
 *   if (isLoading) return <Spinner />;
 *   if (!status) return <div>Not a git repository</div>;
 *
 *   return (
 *     <div>
 *       <p>Branch: {status.branch}</p>
 *       <p>Modified: {status.modified.length} files</p>
 *       <button onClick={refresh}>Refresh</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useGitStatus(
  workspacePath: string | null,
  options: UseGitStatusOptions = {}
): UseGitStatusResult {
  const { pollInterval = 5000, enabled = true, pauseWhenHidden = true } = options;

  const [status, setStatus] = useState<GitStatus | null>(null);
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [branches, setBranches] = useState<GitBranch[]>([]);

  // Request counter to handle race conditions - only apply results from latest request
  const requestIdRef = useRef(0);
  // Track if we have data (to distinguish initial load from background refresh)
  const hasLoadedRef = useRef(false);

  // Normalize workspace path: treat empty/whitespace-only string as null
  const trimmedPath = workspacePath?.trim();
  const normalizedPath = trimmedPath && trimmedPath.length > 0 ? trimmedPath : null;

  const loadStatus = useCallback(
    async (isBackgroundRefresh: boolean): Promise<void> => {
      if (!normalizedPath) {
        setStatus(null);
        setRepoPath(null);
        setError(null);
        hasLoadedRef.current = false;
        return;
      }

      // Increment request ID to invalidate any in-flight requests
      const currentRequestId = ++requestIdRef.current;

      // Only show loading spinner for initial load or manual refresh, not background polling
      if (!isBackgroundRefresh) {
        setIsLoading(true);
      }
      setError(null);

      try {
        // First discover the git repo root
        const discovered = await gitDiscover(normalizedPath);

        // Check if this request is still current
        if (requestIdRef.current !== currentRequestId) {
          return;
        }

        setRepoPath(discovered);

        // Then fetch the status
        const result = await gitStatus(discovered);

        // Check again after second async operation
        if (requestIdRef.current !== currentRequestId) {
          return;
        }

        setStatus(result);
        hasLoadedRef.current = true;

        if (!isBackgroundRefresh) {
          setIsLoading(false);
        }
      } catch (err) {
        // Only update state if this is still the current request
        if (requestIdRef.current !== currentRequestId) {
          return;
        }

        // Not a git repo or other error
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus(null);
        setRepoPath(null);
        hasLoadedRef.current = false;

        if (!isBackgroundRefresh) {
          setIsLoading(false);
        }
      }
    },
    [normalizedPath]
  );

  // Wrap for external refresh (always shows loading)
  const refresh = useCallback(async (): Promise<void> => {
    await loadStatus(false);
  }, [loadStatus]);

  // Initial load and reload when workspace changes
  useEffect(() => {
    if (enabled) {
      hasLoadedRef.current = false;
      void loadStatus(false);
    } else {
      // Clear state when disabled
      setStatus(null);
      setRepoPath(null);
      setError(null);
      hasLoadedRef.current = false;
    }
  }, [loadStatus, enabled]);

  // Polling with visibility awareness
  useEffect(() => {
    if (!enabled || pollInterval <= 0 || !normalizedPath) {
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = (): void => {
      if (intervalId) return;
      intervalId = setInterval(() => {
        void loadStatus(true); // Background refresh, no loading spinner
      }, pollInterval);
    };

    const stopPolling = (): void => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = (): void => {
      if (document.hidden && pauseWhenHidden) {
        stopPolling();
      } else {
        // Refresh immediately when becoming visible, then resume polling
        if (!document.hidden && pauseWhenHidden) {
          void loadStatus(true);
        }
        startPolling();
      }
    };

    // Start polling if document is visible (or if we don't care about visibility)
    if (!pauseWhenHidden || !document.hidden) {
      startPolling();
    }

    // Listen for visibility changes
    if (pauseWhenHidden) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return (): void => {
      stopPolling();
      if (pauseWhenHidden) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [loadStatus, pollInterval, enabled, normalizedPath, pauseWhenHidden]);

  // Derived values
  const isClean =
    !status ||
    (status.staged.length === 0 &&
      status.modified.length === 0 &&
      status.untracked.length === 0 &&
      status.conflicted.length === 0);

  const hasConflicts = (status?.conflicted.length ?? 0) > 0;

  const totalChanges =
    (status?.staged.length ?? 0) +
    (status?.modified.length ?? 0) +
    (status?.untracked.length ?? 0) +
    (status?.conflicted.length ?? 0);

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
      await loadStatus(true); // Background refresh
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
      await loadStatus(true); // Background refresh
    },
    [repoPath, loadStatus]
  );

  // Git operations - commit staged changes
  const commit = useCallback(
    async (message: string): Promise<string> => {
      if (!repoPath) {
        throw new Error('Not a git repository');
      }
      const hash = await gitCommit(repoPath, message);
      await loadStatus(true); // Background refresh
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
      await loadStatus(true); // Background refresh
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
      await loadStatus(true); // Background refresh
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
      await loadStatus(true); // Background refresh
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
  }, [repoPath]);

  // Git operations - checkout branch
  const checkout = useCallback(
    async (branch: string): Promise<void> => {
      if (!repoPath) {
        throw new Error('Not a git repository');
      }
      await gitCheckout(repoPath, branch);
      await loadStatus(true); // Background refresh
      await listBranches(); // Refresh branch list
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
