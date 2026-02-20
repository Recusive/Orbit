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

export const SourceControlTab: React.FC<SourceControlTabProps> = ({ className = '' }) => {
  const {
    // Status
    status,
    isLoading,
    error,

    // File lists
    stagedFiles,
    unstagedFiles,

    // Diffs
    stagedDiffs,
    unstagedDiffs,

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
  } = useSourceControl();

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
        <button
          onClick={() => void refresh()}
          className="text-sm text-gray-12 hover:text-foreground hover:underline"
        >
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
        className="flex items-center justify-between px-4 shrink-0"
        style={{ height: HEADER_HEIGHT }} // Extracted constant
      >
        <BranchSelector
          status={status}
          branches={branches}
          isCheckingOut={isCheckingOut}
          onCheckout={(branch) => void handleCheckout(branch)}
        />
        <div className="flex items-center gap-1.5">
          <SyncStatus status={status} />
          <button
            onClick={() => void handleFetch()}
            disabled={isFetching}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium',
              'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
              'active:scale-[0.97] transition-[background-color,color,transform] duration-150',
              'disabled:opacity-40'
            )}
          >
            <CloudDownload className={cn('h-3 w-3', isFetching && 'animate-pulse')} />
            <span>Fetch</span>
          </button>
          <button
            onClick={() => void refresh()}
            disabled={isLoading}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium',
              'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
              'active:scale-[0.97] transition-[background-color,color,transform] duration-150',
              'disabled:opacity-40'
            )}
          >
            <RefreshCw className={cn('h-3 w-3', isLoading && 'animate-spin')} />
            <span>Refresh</span>
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

        {/* Commit Message + Actions */}
        <CommitForm
          value={commitMessage}
          onChange={setCommitMessage}
          onCommit={handleCommit}
          error={commitError}
        />
        <GitActions
          onCommit={handleCommit}
          isCommitting={isCommitting}
          canCommit={canCommit}
          onPull={handlePull}
          isPulling={isPulling}
          onPush={handlePush}
          isPushing={isPushing}
        />

        {/* Changes List */}
        <ChangesList
          stagedFiles={stagedFiles}
          unstagedFiles={unstagedFiles}
          stagedDiffs={stagedDiffs}
          unstagedDiffs={unstagedDiffs}
          isStaging={isStaging}
          onStageFile={handleStageFile}
          onUnstageFile={handleUnstageFile}
          onStageAll={handleStageAll}
          onUnstageAll={handleUnstageAll}
          onRequestDiscard={handleRequestDiscard}
        />
      </div>
    </div>
  );
};
