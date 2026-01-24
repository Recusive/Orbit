/**
 * useSourceControl - Git state management hook
 *
 * Consolidates all git operations and state for the source control tab.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { GIT_STATUS_POLL_INTERVAL, OPERATION_ERROR_TIMEOUT } from '../constants';

import type { DisplayFileStatus, FileItem } from '../types';
import type { FileStatus as BackendFileStatus, GitSettings } from '@/lib/api';

import { useAutoFetch } from '@/hooks/git/use-auto-fetch';
import { useGitStatus } from '@/hooks/git/use-git-status';
import { useEffectivePath } from '@/hooks/use-effective-path';
import { getSettings } from '@/lib/api';

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

export interface UseSourceControlOptions {
  workspacePath: string | null;
}

export interface UseSourceControlReturn {
  // Status
  status: ReturnType<typeof useGitStatus>['status'];
  isLoading: boolean;
  error: string | null;

  // File lists
  stagedFiles: FileItem[];
  unstagedFiles: FileItem[];
  hasChanges: boolean;

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
  branches: ReturnType<typeof useGitStatus>['branches'];
  isCheckingOut: boolean;
  handleCheckout: (branch: string) => Promise<void>;

  // Fetch
  isFetching: boolean;
  lastFetchedAt: number | null;
  handleFetch: () => Promise<void>;

  // Operations
  operationError: string | null;
  refresh: () => Promise<void>;
}

export function useSourceControl({
  workspacePath,
}: UseSourceControlOptions): UseSourceControlReturn {
  // Use the effective path (active worktree or main workspace) for git operations
  // This ensures git status/commit/push/pull target the correct worktree directory
  const effectivePath = useEffectivePath();
  const gitPath = effectivePath ?? workspacePath;

  const {
    status,
    repoPath,
    isLoading,
    error,
    refresh,
    stage: gitStage,
    unstage: gitUnstage,
    commit: gitCommit,
    discard: gitDiscard,
    push: gitPush,
    pull: gitPull,
    branches,
    listBranches,
    checkout: gitCheckout,
  } = useGitStatus(gitPath, {
    pollInterval: GIT_STATUS_POLL_INTERVAL, // Extracted constant
  });

  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [isStaging, setIsStaging] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [pendingDiscard, setPendingDiscard] = useState<string | null>(null);

  // Git settings for auto-fetch
  const [gitSettings, setGitSettings] = useState<GitSettings | null>(null);

  // Load git settings on mount
  useEffect(() => {
    void getSettings().then((settings) => {
      setGitSettings(settings.git);
    });
  }, []);

  // Auto-fetch hook
  const {
    fetch: autoFetch,
    isFetching,
    lastFetchedAt,
  } = useAutoFetch(repoPath, {
    enabled: gitSettings?.autoFetchEnabled ?? true,
    intervalSeconds: gitSettings?.autoFetchInterval ?? 180,
    pauseWhenHidden: true,
  });

  // Track ongoing operations to prevent concurrent actions
  const operationInProgress = useRef(false);

  // Fetch branches when status loads
  useEffect(() => {
    if (status) {
      void listBranches();
    }
  }, [status, listBranches]);

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

  // Clear operation error after timeout
  const clearOperationError = useCallback((): void => {
    setTimeout(() => {
      setOperationError(null);
    }, OPERATION_ERROR_TIMEOUT); // Extracted constant
  }, []);

  // Stage handlers
  const handleStageFile = useCallback(
    async (path: string): Promise<void> => {
      if (operationInProgress.current) return;
      operationInProgress.current = true;
      setIsStaging(true);
      setOperationError(null);
      try {
        await gitStage([path]);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setOperationError(`Failed to stage: ${message}`);
        clearOperationError();
      } finally {
        setIsStaging(false);
        operationInProgress.current = false;
      }
    },
    [gitStage, clearOperationError]
  );

  const handleUnstageFile = useCallback(
    async (path: string): Promise<void> => {
      if (operationInProgress.current) return;
      operationInProgress.current = true;
      setIsStaging(true);
      setOperationError(null);
      try {
        await gitUnstage([path]);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setOperationError(`Failed to unstage: ${message}`);
        clearOperationError();
      } finally {
        setIsStaging(false);
        operationInProgress.current = false;
      }
    },
    [gitUnstage, clearOperationError]
  );

  const handleStageAll = useCallback(async (): Promise<void> => {
    if (operationInProgress.current) return;
    const allPaths = unstagedFiles.map((f) => f.path);
    if (allPaths.length === 0) return;

    operationInProgress.current = true;
    setIsStaging(true);
    setOperationError(null);
    try {
      await gitStage(allPaths);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setOperationError(`Failed to stage all: ${message}`);
      clearOperationError();
    } finally {
      setIsStaging(false);
      operationInProgress.current = false;
    }
  }, [unstagedFiles, gitStage, clearOperationError]);

  const handleUnstageAll = useCallback(async (): Promise<void> => {
    if (operationInProgress.current) return;
    const allPaths = stagedFiles.map((f) => f.path);
    if (allPaths.length === 0) return;

    operationInProgress.current = true;
    setIsStaging(true);
    setOperationError(null);
    try {
      await gitUnstage(allPaths);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setOperationError(`Failed to unstage all: ${message}`);
      clearOperationError();
    } finally {
      setIsStaging(false);
      operationInProgress.current = false;
    }
  }, [stagedFiles, gitUnstage, clearOperationError]);

  // Discard handlers
  const handleRequestDiscard = useCallback((path: string): void => {
    setPendingDiscard(path);
  }, []);

  const handleCancelDiscard = useCallback((): void => {
    setPendingDiscard(null);
  }, []);

  const handleConfirmDiscard = useCallback(async (): Promise<void> => {
    if (!pendingDiscard || operationInProgress.current) return;

    operationInProgress.current = true;
    setOperationError(null);
    const pathToDiscard = pendingDiscard;
    setPendingDiscard(null);

    try {
      await gitDiscard([pathToDiscard]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setOperationError(`Failed to discard: ${message}`);
      clearOperationError();
    } finally {
      operationInProgress.current = false;
    }
  }, [pendingDiscard, gitDiscard, clearOperationError]);

  // Commit handler
  const handleCommit = useCallback(async (): Promise<void> => {
    if (!commitMessage.trim() || stagedFiles.length === 0 || operationInProgress.current) {
      return;
    }

    operationInProgress.current = true;
    setIsCommitting(true);
    setCommitError(null);
    try {
      await gitCommit(commitMessage.trim());
      setCommitMessage('');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setCommitError(message);
    } finally {
      setIsCommitting(false);
      operationInProgress.current = false;
    }
  }, [commitMessage, stagedFiles.length, gitCommit]);

  // Push/Pull handlers
  const handlePush = useCallback(async (): Promise<void> => {
    if (operationInProgress.current) return;
    operationInProgress.current = true;
    setIsPushing(true);
    setOperationError(null);
    try {
      await gitPush();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setOperationError(`Push failed: ${message}`);
      clearOperationError();
    } finally {
      setIsPushing(false);
      operationInProgress.current = false;
    }
  }, [gitPush, clearOperationError]);

  const handlePull = useCallback(async (): Promise<void> => {
    if (operationInProgress.current) return;
    operationInProgress.current = true;
    setIsPulling(true);
    setOperationError(null);
    try {
      await gitPull();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setOperationError(`Pull failed: ${message}`);
      clearOperationError();
    } finally {
      setIsPulling(false);
      operationInProgress.current = false;
    }
  }, [gitPull, clearOperationError]);

  // Checkout handler
  const handleCheckout = useCallback(
    async (branch: string): Promise<void> => {
      if (operationInProgress.current) return;
      operationInProgress.current = true;
      setIsCheckingOut(true);
      setOperationError(null);
      try {
        await gitCheckout(branch);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setOperationError(`Checkout failed: ${message}`);
        clearOperationError();
      } finally {
        setIsCheckingOut(false);
        operationInProgress.current = false;
      }
    },
    [gitCheckout, clearOperationError]
  );

  // Wrapper for setCommitMessage that clears commit error
  const handleSetCommitMessage = useCallback((message: string): void => {
    setCommitMessage(message);
    setCommitError(null);
  }, []);

  // Fetch handler - wraps autoFetch with error handling for UI
  const handleFetch = useCallback(async (): Promise<void> => {
    if (operationInProgress.current) return;
    operationInProgress.current = true;
    setOperationError(null);
    try {
      await autoFetch();
      // Refresh status after fetch to show updated ahead/behind
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setOperationError(`Fetch failed: ${message}`);
      clearOperationError();
    } finally {
      operationInProgress.current = false;
    }
  }, [autoFetch, refresh, clearOperationError]);

  return {
    // Status
    status,
    isLoading,
    error,

    // File lists
    stagedFiles,
    unstagedFiles,
    hasChanges,

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

    // Fetch
    isFetching,
    lastFetchedAt,
    handleFetch,

    // Operations
    operationError,
    refresh,
  };
}
