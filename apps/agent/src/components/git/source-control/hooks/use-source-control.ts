/**
 * useSourceControl - Git state management hook
 *
 * Consolidates all git operations and state for the source control tab.
 *
 * NOTE: Git status polling is handled globally by useGitPolling (mounted in RootLayout).
 * This hook reads from the shared GitStore and provides operations (stage, commit, etc.).
 */
import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { OPERATION_ERROR_TIMEOUT } from '../constants';

import type { DisplayFileStatus, FileItem } from '../types';
import type { FileStatus as BackendFileStatus, FileDiff } from '@/lib/api';
import type { GitBranch, GitStatus } from '@/stores/git/git-store';

import {
  gitBranches,
  gitCheckout,
  gitCommit,
  gitCreateBranch,
  gitDiffStructured,
  gitDiscard,
  gitFetch,
  gitPull,
  gitPush,
  gitStage,
  gitStagedDiff,
  gitStatus,
  gitUnstage,
} from '@/lib/api';
import { useGitStore } from '@/stores/git/git-store';

const logger = createLogger('useSourceControl');
const MAX_EAGER_UNTRACKED = 300;

/** Convert backend status to display status */
const toDisplayStatus = (backendStatus: BackendFileStatus): DisplayFileStatus => {
  switch (backendStatus) {
    case 'added':
      return 'added';
    case 'modified':
      return 'modified';
    case 'deleted':
      return 'deleted';
    case 'renamed':
      return 'renamed';
    case 'copied':
      return 'renamed'; // Treat copies like renames for display
    case 'untracked':
      return 'untracked';
    case 'conflicted':
      return 'conflicted';
    case 'typechange':
      return 'modified'; // Treat typechange as modified for display
    default:
      return 'modified';
  }
};

export const toUserGitError = (err: unknown): string => {
  const raw = err instanceof Error ? err.message : String(err);
  const message = raw.replace(/^Git error:\s*/i, '');
  if (/already exists/i.test(message)) return 'Branch already exists.';
  if (/Failed to get HEAD|unborn branch/i.test(message)) {
    return 'Cannot create a branch before the first commit.';
  }
  if (/invalid.*ref|invalid.*name/i.test(message)) return 'Invalid branch name.';
  return message;
};

/** Marks a checkout failure after successful branch creation - prevents duplicate toasts */
class CheckoutAfterCreateError extends Error {}

export interface UseSourceControlReturn {
  // Status
  status: GitStatus | null;
  isLoading: boolean;
  error: string | null;

  // File lists
  stagedFiles: FileItem[];
  unstagedFiles: FileItem[];
  hasChanges: boolean;
  untrackedDiffSkipped: boolean;

  // Diffs (structured, per-file)
  stagedDiffs: FileDiff[];
  unstagedDiffs: FileDiff[];

  // Commit
  commitMessage: string;
  setCommitMessage: (message: string) => void;
  commitError: string | null;
  isCommitting: boolean;
  handleCommit: () => Promise<void>;

  // Staging
  isStaging: boolean;
  handleStageFile: (path: string) => Promise<void>;
  handleUnstageFile: (path: string) => Promise<void>;
  handleStageAll: () => Promise<void>;
  handleUnstageAll: () => Promise<void>;

  // Discard
  pendingDiscard: string | null;
  handleRequestDiscard: (path: string) => void;
  handleCancelDiscard: () => void;
  handleConfirmDiscard: () => Promise<void>;

  // Push/Pull
  isPushing: boolean;
  isPulling: boolean;
  handlePush: () => Promise<void>;
  handlePull: () => Promise<void>;

  // Branches
  branches: GitBranch[];
  isCheckingOut: boolean;
  handleCheckout: (branch: string) => Promise<void>;
  handleCreateAndCheckout: (branchName: string) => Promise<void>;

  // Fetch
  isFetching: boolean;
  lastFetchedAt: number | null;
  handleFetch: () => Promise<void>;

  // Operations
  operationError: string | null;
  refresh: () => Promise<void>;
}

export function useSourceControl(isVisible = true): UseSourceControlReturn {
  // Read all git state from the shared GitStore (populated by useGitPolling in RootLayout)
  const status = useGitStore((s) => s.status);
  const repoPath = useGitStore((s) => s.repoPath);
  const isLoading = useGitStore((s) => s.isLoading);
  const error = useGitStore((s) => s.error);
  const branches = useGitStore((s) => s.branches);
  const isFetching = useGitStore((s) => s.isFetching);
  const lastFetchedAt = useGitStore((s) => s.lastFetchedAt);
  const lastUpdated = useGitStore((s) => s.lastUpdated);

  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [isStaging, setIsStaging] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [pendingDiscard, setPendingDiscard] = useState<string | null>(null);

  // Structured diffs for inline diff view
  const [stagedDiffs, setStagedDiffs] = useState<FileDiff[]>([]);
  const [unstagedDiffs, setUnstagedDiffs] = useState<FileDiff[]>([]);

  // Track ongoing operations to prevent concurrent actions
  const operationInProgress = useRef(false);
  const inflightRef = useRef<Promise<void> | null>(null);
  const needsRefetchRef = useRef(false);

  /** Fetch structured diffs for both staged and unstaged changes */
  const fetchDiffs = useCallback(async (): Promise<void> => {
    const repo = useGitStore.getState().repoPath;
    if (!repo) return;

    if (inflightRef.current) {
      // Coalesce repeated triggers while a fetch is running into one trailing refresh.
      needsRefetchRef.current = true;
      return inflightRef.current;
    }

    const untrackedCount = useGitStore.getState().status?.untracked.length ?? 0;
    const includeUntracked = untrackedCount <= MAX_EAGER_UNTRACKED;

    const run = Promise.all([gitStagedDiff(repo), gitDiffStructured(repo, includeUntracked)])
      .then(([staged, unstaged]) => {
        setStagedDiffs(staged);
        setUnstagedDiffs(unstaged);
      })
      .catch((error: unknown) => {
        logger.debug('Failed to fetch diffs', { error });
      })
      .finally(() => {
        inflightRef.current = null;
        if (needsRefetchRef.current) {
          needsRefetchRef.current = false;
          void fetchDiffs();
        }
      });

    inflightRef.current = run;
    return run;
  }, []);

  // Fetch branches when status first becomes available (for branch selector)
  useEffect(() => {
    if (status && repoPath) {
      void gitBranches(repoPath).then((branchList) => {
        useGitStore.getState().setBranches(branchList);
      });
    }
  }, [status, repoPath]);

  // Re-fetch diffs on status updates and background polling ticks (when visible).
  useEffect(() => {
    if (!repoPath || !status || !isVisible) return;
    const timer = window.setTimeout(() => {
      void fetchDiffs();
    }, 300);
    return () => {
      window.clearTimeout(timer);
    };
  }, [lastUpdated, repoPath, status, fetchDiffs, isVisible]);

  // Immediate refresh when switching from hidden -> visible.
  // Skip first mount to avoid duplicate initial fetch with the debounced effect.
  const prevVisibleRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevVisibleRef.current === null) {
      prevVisibleRef.current = isVisible;
      return;
    }
    if (isVisible && !prevVisibleRef.current && repoPath && status) {
      void fetchDiffs();
    }
    prevVisibleRef.current = isVisible;
  }, [isVisible, repoPath, status, fetchDiffs]);

  /** Refresh git status by calling the API and writing to the store */
  const refreshStatus = useCallback(async (): Promise<void> => {
    const repo = useGitStore.getState().repoPath;
    if (!repo) return;
    const result = await gitStatus(repo);
    useGitStore.getState().applyPolledStatus(result);
    // Fire-and-forget: refresh diffs after status is updated
    if (isVisible) {
      void fetchDiffs();
    }
  }, [fetchDiffs, isVisible]);

  /** Refresh branches from the repository */
  const refreshBranches = useCallback(async (): Promise<void> => {
    const repo = useGitStore.getState().repoPath;
    if (!repo) return;
    const branchList = await gitBranches(repo);
    useGitStore.getState().setBranches(branchList);
  }, []);

  // Build file lists from git status
  const stagedFiles = useMemo<FileItem[]>(
    () =>
      (status?.staged ?? []).map((entry) => ({
        path: entry.path,
        displayStatus: toDisplayStatus(entry.status),
        backendStatus: entry.status,
        oldPath: entry.oldPath,
      })),
    [status?.staged]
  );

  const unstagedFiles = useMemo<FileItem[]>(
    () => [
      ...(status?.modified ?? []).map((entry) => ({
        path: entry.path,
        displayStatus: toDisplayStatus(entry.status),
        backendStatus: entry.status,
        oldPath: entry.oldPath,
      })),
      ...(status?.untracked ?? []).map((entry) => ({
        path: entry.path,
        displayStatus: 'untracked' as const,
        backendStatus: entry.status,
        oldPath: entry.oldPath,
      })),
      ...(status?.conflicted ?? []).map((entry) => ({
        path: entry.path,
        displayStatus: 'conflicted' as const,
        backendStatus: entry.status,
        oldPath: entry.oldPath,
      })),
    ],
    [status?.modified, status?.untracked, status?.conflicted]
  );

  const hasChanges = stagedFiles.length > 0 || unstagedFiles.length > 0;
  const untrackedDiffSkipped = (status?.untracked.length ?? 0) > MAX_EAGER_UNTRACKED;

  // Clear operation error after timeout
  const clearOperationError = useCallback((): void => {
    setTimeout(() => {
      setOperationError(null);
    }, OPERATION_ERROR_TIMEOUT);
  }, []);

  // Stage handlers
  const handleStageFile = useCallback(
    async (path: string): Promise<void> => {
      if (operationInProgress.current || !repoPath) return;
      operationInProgress.current = true;
      setIsStaging(true);
      setOperationError(null);
      try {
        await gitStage(repoPath, [path]);
        await refreshStatus();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setOperationError(`Failed to stage: ${message}`);
        clearOperationError();
      } finally {
        setIsStaging(false);
        operationInProgress.current = false;
      }
    },
    [repoPath, refreshStatus, clearOperationError]
  );

  const handleUnstageFile = useCallback(
    async (path: string): Promise<void> => {
      if (operationInProgress.current || !repoPath) return;
      operationInProgress.current = true;
      setIsStaging(true);
      setOperationError(null);
      try {
        await gitUnstage(repoPath, [path]);
        await refreshStatus();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setOperationError(`Failed to unstage: ${message}`);
        clearOperationError();
      } finally {
        setIsStaging(false);
        operationInProgress.current = false;
      }
    },
    [repoPath, refreshStatus, clearOperationError]
  );

  const handleStageAll = useCallback(async (): Promise<void> => {
    if (operationInProgress.current || !repoPath) return;
    const allPaths = unstagedFiles.map((f) => f.path);
    if (allPaths.length === 0) return;

    operationInProgress.current = true;
    setIsStaging(true);
    setOperationError(null);
    try {
      await gitStage(repoPath, allPaths);
      await refreshStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setOperationError(`Failed to stage all: ${message}`);
      clearOperationError();
    } finally {
      setIsStaging(false);
      operationInProgress.current = false;
    }
  }, [repoPath, unstagedFiles, refreshStatus, clearOperationError]);

  const handleUnstageAll = useCallback(async (): Promise<void> => {
    if (operationInProgress.current || !repoPath) return;
    const allPaths = stagedFiles.map((f) => f.path);
    if (allPaths.length === 0) return;

    operationInProgress.current = true;
    setIsStaging(true);
    setOperationError(null);
    try {
      await gitUnstage(repoPath, allPaths);
      await refreshStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setOperationError(`Failed to unstage all: ${message}`);
      clearOperationError();
    } finally {
      setIsStaging(false);
      operationInProgress.current = false;
    }
  }, [repoPath, stagedFiles, refreshStatus, clearOperationError]);

  // Discard handlers
  const handleRequestDiscard = useCallback((path: string): void => {
    setPendingDiscard(path);
  }, []);

  const handleCancelDiscard = useCallback((): void => {
    setPendingDiscard(null);
  }, []);

  const handleConfirmDiscard = useCallback(async (): Promise<void> => {
    if (!pendingDiscard || operationInProgress.current || !repoPath) return;

    operationInProgress.current = true;
    setOperationError(null);
    const pathToDiscard = pendingDiscard;
    setPendingDiscard(null);

    try {
      await gitDiscard(repoPath, [pathToDiscard]);
      await refreshStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setOperationError(`Failed to discard: ${message}`);
      clearOperationError();
    } finally {
      operationInProgress.current = false;
    }
  }, [pendingDiscard, repoPath, refreshStatus, clearOperationError]);

  // Commit handler
  const handleCommit = useCallback(async (): Promise<void> => {
    if (
      !commitMessage.trim() ||
      stagedFiles.length === 0 ||
      operationInProgress.current ||
      !repoPath
    ) {
      return;
    }

    operationInProgress.current = true;
    setIsCommitting(true);
    setCommitError(null);
    try {
      await gitCommit(repoPath, commitMessage.trim());
      setCommitMessage('');
      await refreshStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setCommitError(message);
    } finally {
      setIsCommitting(false);
      operationInProgress.current = false;
    }
  }, [commitMessage, stagedFiles.length, repoPath, refreshStatus]);

  // Push/Pull handlers
  const handlePush = useCallback(async (): Promise<void> => {
    if (operationInProgress.current || !repoPath) return;
    operationInProgress.current = true;
    setIsPushing(true);
    setOperationError(null);
    try {
      await gitPush(repoPath);
      await refreshStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setOperationError(`Push failed: ${message}`);
      clearOperationError();
    } finally {
      setIsPushing(false);
      operationInProgress.current = false;
    }
  }, [repoPath, refreshStatus, clearOperationError]);

  const handlePull = useCallback(async (): Promise<void> => {
    if (operationInProgress.current || !repoPath) return;
    operationInProgress.current = true;
    setIsPulling(true);
    setOperationError(null);
    try {
      await gitPull(repoPath);
      await refreshStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setOperationError(`Pull failed: ${message}`);
      clearOperationError();
    } finally {
      setIsPulling(false);
      operationInProgress.current = false;
    }
  }, [repoPath, refreshStatus, clearOperationError]);

  // Checkout handler
  const handleCheckout = useCallback(
    async (branch: string): Promise<void> => {
      if (operationInProgress.current || !repoPath) return;
      operationInProgress.current = true;
      setIsCheckingOut(true);
      setOperationError(null);
      try {
        await gitCheckout(repoPath, branch);
        await refreshStatus();
        await refreshBranches();
        toast.success(`Switched to ${branch}`);
      } catch (err) {
        const displayMessage = toUserGitError(err);
        toast.error('Checkout failed', { description: displayMessage });
      } finally {
        setIsCheckingOut(false);
        operationInProgress.current = false;
      }
    },
    [repoPath, refreshStatus, refreshBranches]
  );

  const handleCreateAndCheckout = useCallback(
    async (rawName: string): Promise<void> => {
      const branchName = rawName.trim();
      if (operationInProgress.current || !repoPath || branchName.length === 0) return;

      operationInProgress.current = true;
      setIsCheckingOut(true);
      setOperationError(null);

      try {
        await gitCreateBranch(repoPath, branchName);
        try {
          await gitCheckout(repoPath, branchName);
        } catch (checkoutErr) {
          const display = toUserGitError(checkoutErr);
          toast.error('Branch created, but checkout failed', { description: display });

          try {
            await Promise.all([refreshStatus(), refreshBranches()]);
          } catch {
            // Non-blocking. Polling will reconcile shortly.
          }

          throw new CheckoutAfterCreateError(display);
        }

        await Promise.all([refreshStatus(), refreshBranches()]);
        toast.success(`Created and switched to ${branchName}`);
      } catch (err) {
        if (err instanceof CheckoutAfterCreateError) {
          throw err;
        }

        const display = toUserGitError(err);
        toast.error('Create branch failed', { description: display });
        throw new Error(display, { cause: err });
      } finally {
        setIsCheckingOut(false);
        operationInProgress.current = false;
      }
    },
    [repoPath, refreshStatus, refreshBranches]
  );

  // Wrapper for setCommitMessage that clears commit error
  const handleSetCommitMessage = useCallback((message: string): void => {
    setCommitMessage(message);
    setCommitError(null);
  }, []);

  // Fetch handler - calls git fetch API directly + refreshes status
  const handleFetch = useCallback(async (): Promise<void> => {
    if (operationInProgress.current || !repoPath) return;
    operationInProgress.current = true;
    setOperationError(null);
    const store = useGitStore.getState();
    store.setFetching(true);
    try {
      await gitFetch(repoPath);
      useGitStore.getState().setLastFetchedAt(Date.now());
      await refreshStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setOperationError(`Fetch failed: ${message}`);
      clearOperationError();
    } finally {
      useGitStore.getState().setFetching(false);
      operationInProgress.current = false;
    }
  }, [repoPath, refreshStatus, clearOperationError]);

  return {
    // Status
    status,
    isLoading,
    error,

    // File lists
    stagedFiles,
    unstagedFiles,
    hasChanges,
    untrackedDiffSkipped,

    // Diffs
    stagedDiffs,
    unstagedDiffs,

    // Commit
    commitMessage,
    setCommitMessage: handleSetCommitMessage,
    commitError,
    isCommitting,
    handleCommit,

    // Staging
    isStaging,
    handleStageFile,
    handleUnstageFile,
    handleStageAll,
    handleUnstageAll,

    // Discard
    pendingDiscard,
    handleRequestDiscard,
    handleCancelDiscard,
    handleConfirmDiscard,

    // Push/Pull
    isPushing,
    isPulling,
    handlePush,
    handlePull,

    // Branches
    branches,
    isCheckingOut,
    handleCheckout,
    handleCreateAndCheckout,

    // Fetch
    isFetching,
    lastFetchedAt,
    handleFetch,

    // Operations
    operationError,
    refresh: refreshStatus,
  };
}
