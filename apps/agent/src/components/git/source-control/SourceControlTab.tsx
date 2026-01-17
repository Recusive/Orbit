/**
 * SourceControlTab - Git status and operations panel
 *
 * Main container that orchestrates all source control sub-components.
 *
 * NOTE: Git status styling comes from @/lib/utils/constants.
 * To change status colors or labels, update GIT_STATUS_STYLES in constants.ts.
 */
import { AlertCircle, CloudDownload, GitBranch, Loader2, RefreshCw } from 'lucide-react';
import React from 'react';

import { BranchSelector } from './components/BranchSelector';
import { ChangesList } from './components/ChangesList';
import { CommitForm } from './components/CommitForm';
import { DiscardConfirmation } from './components/DiscardConfirmation';
import { GitActions } from './components/GitActions';
import { OperationError } from './components/OperationError';
import { SyncStatus } from './components/SyncStatus';
import { HEADER_HEIGHT } from './constants';
import { useSourceControl } from './hooks/use-source-control';

import type { SourceControlTabProps } from './types';

import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui/ui-store';

export const SourceControlTab: React.FC<SourceControlTabProps> = ({ className = '' }) => {
  const workspacePath = useUIStore((state) => state.workspacePath);

  const {
    // Status
    status,
    isLoading,
    error,

    // File lists
    stagedFiles,
    unstagedFiles,

    // Commit
    commitMessage,
    setCommitMessage,
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
    handleFetch,

    // Operations
    operationError,
    refresh,
  } = useSourceControl({ workspacePath });

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
        <p className="text-sm text-muted-foreground">{error}</p>
        <button onClick={() => void refresh()} className="text-sm text-primary hover:underline">
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

  const canCommit = commitMessage.trim().length > 0 && stagedFiles.length > 0;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header with Branch Dropdown */}
      <div
        className="flex items-center justify-between px-4 border-b border-border shrink-0"
        style={{ height: HEADER_HEIGHT }} // Extracted constant
      >
        <BranchSelector
          status={status}
          branches={branches}
          isCheckingOut={isCheckingOut}
          onCheckout={(branch) => void handleCheckout(branch)}
        />
        <div className="flex items-center gap-1">
          <SyncStatus status={status} />
          <button
            onClick={() => void handleFetch()}
            disabled={isFetching}
            className="p-1.5 rounded-md hover:bg-muted/60 text-muted-foreground/70 hover:text-foreground active:scale-95 transition-[background-color,color,transform] duration-150"
            title="Fetch from remote"
          >
            <CloudDownload className={cn('h-3.5 w-3.5', isFetching && 'animate-pulse')} />
          </button>
          <button
            onClick={() => void refresh()}
            disabled={isLoading}
            className="p-1.5 rounded-md hover:bg-muted/60 text-muted-foreground/70 hover:text-foreground active:scale-95 transition-[background-color,color,transform] duration-150"
            title="Refresh"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Operation Error Banner */}
        {operationError ? <OperationError message={operationError} /> : null}

        {/* Discard Confirmation */}
        {pendingDiscard ? (
          <DiscardConfirmation
            path={pendingDiscard}
            onConfirm={handleConfirmDiscard}
            onCancel={handleCancelDiscard}
          />
        ) : null}

        {/* Commit Message */}
        <CommitForm
          value={commitMessage}
          onChange={setCommitMessage}
          onCommit={handleCommit}
          error={commitError}
        />

        {/* Changes List */}
        <ChangesList
          stagedFiles={stagedFiles}
          unstagedFiles={unstagedFiles}
          isStaging={isStaging}
          onStageFile={handleStageFile}
          onUnstageFile={handleUnstageFile}
          onStageAll={handleStageAll}
          onUnstageAll={handleUnstageAll}
          onRequestDiscard={handleRequestDiscard}
        />
      </div>

      {/* Footer with Commit/Push/Pull */}
      <GitActions
        onCommit={handleCommit}
        isCommitting={isCommitting}
        canCommit={canCommit}
        onPull={handlePull}
        isPulling={isPulling}
        onPush={handlePush}
        isPushing={isPushing}
      />
    </div>
  );
};
