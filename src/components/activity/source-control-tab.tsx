import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  GitBranch,
  GitCommit,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import React, { useCallback, useMemo, useRef, useState } from 'react';

import type { FileStatus as BackendFileStatus, GitStatus } from '@/lib/backend';

import { useGitStatus } from '@/hooks/use-git-status';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';

export interface SourceControlTabProps {
  className?: string;
  onPush?: () => void;
}

// UI file status for display purposes
type DisplayFileStatus = 'added' | 'modified' | 'untracked' | 'deleted' | 'renamed' | 'conflicted';

interface FileItem {
  path: string;
  displayStatus: DisplayFileStatus;
  /** Backend file status */
  backendStatus: BackendFileStatus;
  /** Original path for renamed files */
  oldPath?: string | null;
}

function getStatusIcon(status: DisplayFileStatus): React.ReactNode {
  switch (status) {
    case 'added':
      return <span className="text-green-500 text-xs font-bold">A</span>;
    case 'modified':
      return <span className="text-yellow-500 text-xs font-bold">M</span>;
    case 'untracked':
      return <span className="text-gray-400 text-xs font-bold">U</span>;
    case 'deleted':
      return <span className="text-red-500 text-xs font-bold">D</span>;
    case 'renamed':
      return <span className="text-blue-500 text-xs font-bold">R</span>;
    case 'conflicted':
      return <span className="text-orange-500 text-xs font-bold">!</span>;
    default:
      return null;
  }
}

function getFileName(path: string): string {
  return path.split('/').pop() ?? path;
}

function getFileDirectory(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/');
}

export const SourceControlTab: React.FC<SourceControlTabProps> = ({ className = '', onPush }) => {
  const workspacePath = useUIStore((state) => state.workspacePath);
  const {
    status,
    isLoading,
    error,
    refresh,
    stage: gitStage,
    unstage: gitUnstage,
    commit: gitCommit,
    discard: gitDiscard,
  } = useGitStatus(workspacePath, {
    pollInterval: 5000,
  });

  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [isStaging, setIsStaging] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [pendingDiscard, setPendingDiscard] = useState<string | null>(null);

  // Track ongoing operations to prevent concurrent actions
  const operationInProgress = useRef(false);

  // Helper to convert backend status to display status
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

  // Build file lists from git status
  // Note: Staged files keep their actual status (added/modified/deleted/renamed)
  // The fact that they're staged is indicated by being in the "Staged Changes" section
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

  // Clear operation error after 5 seconds
  const clearOperationError = useCallback((): void => {
    setTimeout(() => {
      setOperationError(null);
    }, 5000);
  }, []);

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

  // Request discard confirmation
  const handleRequestDiscard = useCallback((path: string): void => {
    setPendingDiscard(path);
  }, []);

  // Cancel discard
  const handleCancelDiscard = useCallback((): void => {
    setPendingDiscard(null);
  }, []);

  // Confirm and execute discard
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

  // Handle Ctrl/Cmd+Enter to commit
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void handleCommit();
      }
    },
    [handleCommit]
  );

  const handlePush = useCallback((): void => {
    onPush?.();
  }, [onPush]);

  // Loading state
  if (isLoading && !status) {
    return (
      <div className={cn('flex items-center justify-center h-32', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn('p-4 space-y-2', className)}>
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Git Error</span>
        </div>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <button onClick={refresh} className="text-sm text-primary hover:underline">
          Retry
        </button>
      </div>
    );
  }

  // Not a git repo
  if (!status) {
    return (
      <div className={cn('p-4 text-center', className)}>
        <GitBranch className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Not a git repository</p>
      </div>
    );
  }

  const hasChanges = stagedFiles.length > 0 || unstagedFiles.length > 0;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header with Branch Info */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span
            className={cn('font-medium truncate', !status.branch && 'text-muted-foreground italic')}
          >
            {status.branch || 'No commits yet'}
          </span>
          <SyncStatus status={status} />
        </div>
        <button
          onClick={refresh}
          disabled={isLoading}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          title="Refresh"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Operation Error Banner */}
        {operationError ? (
          <div className="px-3 py-2 bg-destructive/10 border-b border-destructive/20">
            <p className="text-xs text-destructive">{operationError}</p>
          </div>
        ) : null}

        {/* Discard Confirmation */}
        {pendingDiscard ? (
          <div className="px-3 py-2 bg-yellow-500/10 border-b border-yellow-500/20">
            <p className="text-xs text-foreground mb-2">
              Discard changes to <strong>{getFileName(pendingDiscard)}</strong>?
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleConfirmDiscard}
                className="px-2 py-1 text-xs rounded bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Discard
              </button>
              <button
                onClick={handleCancelDiscard}
                className="px-2 py-1 text-xs rounded border border-border hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {/* Commit Message */}
        <div className="p-3 border-b border-border">
          <textarea
            value={commitMessage}
            onChange={(e) => {
              setCommitMessage(e.target.value);
              setCommitError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Commit message (Ctrl+Enter to commit)..."
            rows={3}
            className="
              w-full px-2 py-1.5 rounded-md text-sm
              bg-background border border-border
              focus:outline-none focus:ring-1 focus:ring-ring
              resize-none
            "
          />
          {commitError ? <p className="text-xs text-destructive mt-1">{commitError}</p> : null}
        </div>

        {/* Staged Changes */}
        <FileSection
          title="Staged Changes"
          files={stagedFiles}
          isLoading={isStaging}
          onFileAction={handleUnstageFile}
          actionIcon={<Minus className="h-3 w-3" />}
          actionTitle="Unstage"
          headerAction={
            stagedFiles.length > 0 ? (
              <button
                onClick={handleUnstageAll}
                disabled={isStaging}
                className="text-xs text-muted-foreground hover:text-foreground"
                title="Unstage All"
              >
                <Minus className="h-3 w-3" />
              </button>
            ) : null
          }
        />

        {/* Changes */}
        <FileSection
          title="Changes"
          files={unstagedFiles}
          isLoading={isStaging}
          onFileAction={handleStageFile}
          actionIcon={<Plus className="h-3 w-3" />}
          actionTitle="Stage"
          secondaryAction={handleRequestDiscard}
          secondaryIcon={<X className="h-3 w-3" />}
          secondaryTitle="Discard"
          headerAction={
            unstagedFiles.length > 0 ? (
              <button
                onClick={handleStageAll}
                disabled={isStaging}
                className="text-xs text-muted-foreground hover:text-foreground"
                title="Stage All"
              >
                <Plus className="h-3 w-3" />
              </button>
            ) : null
          }
        />

        {/* Clean state */}
        {!hasChanges ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            <Check className="h-5 w-5 mx-auto mb-1 text-green-500" />
            Working tree clean
          </div>
        ) : null}
      </div>

      {/* Footer with Commit/Push */}
      <div className="p-3 border-t border-border flex gap-2">
        <button
          onClick={handleCommit}
          disabled={isCommitting || !commitMessage.trim() || stagedFiles.length === 0}
          className="
            flex-1 flex items-center justify-center gap-2
            px-3 py-1.5 rounded-md text-sm font-medium
            bg-primary text-primary-foreground
            hover:bg-primary/90
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {isCommitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GitCommit className="h-4 w-4" />
          )}
          Commit
        </button>
        <button
          onClick={handlePush}
          className="
            px-3 py-1.5 rounded-md
            border border-border hover:bg-accent
            text-sm
          "
          title="Push"
        >
          <Upload className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

// ============================================
// Sub-components
// ============================================

interface SyncStatusProps {
  status: GitStatus;
}

const SyncStatus: React.FC<SyncStatusProps> = ({ status }) => {
  if (status.ahead === 0 && status.behind === 0) return null;

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      {status.ahead > 0 ? (
        <span className="flex items-center gap-0.5">
          <ArrowUp className="h-3 w-3" />
          {status.ahead}
        </span>
      ) : null}
      {status.behind > 0 ? (
        <span className="flex items-center gap-0.5">
          <ArrowDown className="h-3 w-3" />
          {status.behind}
        </span>
      ) : null}
    </div>
  );
};

interface FileSectionProps {
  title: string;
  files: FileItem[];
  isLoading: boolean;
  onFileAction: (path: string) => Promise<void>;
  actionIcon: React.ReactNode;
  actionTitle: string;
  secondaryAction?: (path: string) => void;
  secondaryIcon?: React.ReactNode;
  secondaryTitle?: string;
  headerAction?: React.ReactNode;
}

const FileSection: React.FC<FileSectionProps> = ({
  title,
  files,
  isLoading,
  onFileAction,
  actionIcon,
  actionTitle,
  secondaryAction,
  secondaryIcon,
  secondaryTitle,
  headerAction,
}) => {
  if (files.length === 0) return null;

  return (
    <div className="border-b border-border">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {title} ({files.length})
        </span>
        {headerAction}
      </div>
      <div className="py-1">
        {files.map((file) => (
          <div
            key={file.path}
            className="group flex items-center gap-2 px-3 py-1 hover:bg-accent/50"
          >
            <span className="w-4 flex justify-center shrink-0">
              {getStatusIcon(file.displayStatus)}
            </span>
            <div className="flex-1 min-w-0 text-sm">
              {file.oldPath ? (
                // Renamed file: show "oldName → newName"
                <span className="truncate block">
                  <span className="text-muted-foreground">{getFileName(file.oldPath)}</span>
                  <span className="text-muted-foreground mx-1">→</span>
                  <span>{getFileName(file.path)}</span>
                </span>
              ) : (
                <span className="truncate block">{getFileName(file.path)}</span>
              )}
              <span className="text-xs text-muted-foreground truncate block">
                {file.oldPath && getFileDirectory(file.oldPath) !== getFileDirectory(file.path)
                  ? `${getFileDirectory(file.oldPath)} → ${getFileDirectory(file.path)}`
                  : getFileDirectory(file.path)}
              </span>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {secondaryAction ? (
                <button
                  onClick={() => {
                    secondaryAction(file.path);
                  }}
                  disabled={isLoading}
                  className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive"
                  title={secondaryTitle}
                >
                  {secondaryIcon}
                </button>
              ) : null}
              <button
                onClick={() => void onFileAction(file.path)}
                disabled={isLoading}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                title={actionTitle}
              >
                {actionIcon}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
