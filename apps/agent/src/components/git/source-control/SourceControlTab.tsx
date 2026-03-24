/**
 * SourceControlTab - Git status and operations panel
 *
 * Main container that orchestrates all source control sub-components.
 *
 * NOTE: Git status styling comes from @/lib/utils/constants.
 * To change status colors or labels, update GIT_STATUS_STYLES in constants.ts.
 */
import { Virtualizer as PierreVirtualizerCore } from '@pierre/diffs';
import { VirtualizerContext } from '@pierre/diffs/react';
import { AlertCircle, CloudDownload, GitBranch, Loader2, RefreshCw } from 'lucide-react';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

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

import { useSmoothScroll } from '@/hooks/ui';
import { cn, diffScheduler } from '@/lib/utils';
import { PIERRE_VIRTUALIZER_OVERSCROLL_SIZE } from '@/lib/utils/pierre-adapter';
import { clearParsedDiffCache } from '@/lib/utils/pierre-diff-cache';
import { useGitStore } from '@/stores/git/git-store';

export const SourceControlTab: React.FC<SourceControlTabProps> = ({
  className = '',
  isVisible = true,
}) => {
  const smoothScrollRef = useSmoothScroll(0.08);
  const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null);
  const [pierreVirtualizer, setPierreVirtualizer] = useState<PierreVirtualizerCore | undefined>();
  const pierreVirtualizerRef = useRef<PierreVirtualizerCore | null>(null);
  const scrollNodeRef = useRef<HTMLDivElement | null>(null);
  const contentWrapperRef = useRef<HTMLDivElement | null>(null);
  const repoPath = useGitStore((state) => state.repoPath);
  const mergedScrollRef = useCallback(
    (node: HTMLDivElement | null): void => {
      scrollNodeRef.current = node;
      setScrollParent(node);
      smoothScrollRef(node);
    },
    [smoothScrollRef]
  );

  const {
    // Status
    status,
    isLoading,
    error,

    // File lists
    stagedFiles,
    unstagedFiles,
    untrackedDiffSkipped,

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
    handleCreateAndCheckout,

    // Fetch
    isFetching,
    handleFetch,

    // Operations
    operationError,
    refresh,
  } = useSourceControl(isVisible);

  useEffect(() => {
    diffScheduler.cancelAll();
    clearParsedDiffCache();
  }, [repoPath]);

  useLayoutEffect(() => {
    const scrollNode = scrollNodeRef.current;
    const contentNode = contentWrapperRef.current;

    if (pierreVirtualizerRef.current) {
      pierreVirtualizerRef.current.cleanUp();
      pierreVirtualizerRef.current = null;
    }

    if (!scrollNode || !contentNode) {
      setPierreVirtualizer(undefined);
      return;
    }

    const instance = new PierreVirtualizerCore({
      overscrollSize: PIERRE_VIRTUALIZER_OVERSCROLL_SIZE,
    });
    instance.setup(scrollNode, contentNode);
    pierreVirtualizerRef.current = instance;
    setPierreVirtualizer(instance);

    return (): void => {
      instance.cleanUp();
      pierreVirtualizerRef.current = null;
      setPierreVirtualizer(undefined);
    };
  }, [scrollParent]);

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
          className="text-sm text-foreground hover:text-foreground hover:underline"
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
        className="flex items-center justify-between px-3 shrink-0"
        style={{ height: HEADER_HEIGHT }} // Extracted constant
      >
        <BranchSelector
          status={status}
          branches={branches}
          isCheckingOut={isCheckingOut}
          onCheckout={(branch) => void handleCheckout(branch)}
          onCreateAndCheckout={handleCreateAndCheckout}
        />
        <div className="flex items-center gap-1.5">
          <SyncStatus status={status} />
          <button
            onClick={() => void handleFetch()}
            disabled={isFetching}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-[9px] text-[11px] font-medium',
              'bg-lg-control text-secondary-foreground shadow-sm hover:bg-lg-control-hover',
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
              'flex items-center gap-1 px-2.5 py-1 rounded-[9px] text-[11px] font-medium',
              'bg-lg-control text-secondary-foreground shadow-sm hover:bg-lg-control-hover',
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
      <div
        ref={mergedScrollRef}
        data-testid="source-control-scroll"
        className="flex-1 overflow-y-scroll overscroll-y-contain [scrollbar-gutter:stable_both-edges]"
      >
        <div ref={contentWrapperRef}>
          {operationError ? <OperationError message={operationError} /> : null}

          {pendingDiscard ? (
            <DiscardConfirmation
              path={pendingDiscard}
              onConfirm={handleConfirmDiscard}
              onCancel={handleCancelDiscard}
            />
          ) : null}

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

          <div className="mx-3 my-1.5 h-px bg-foreground/5" />

          <VirtualizerContext.Provider value={pierreVirtualizer}>
            <ChangesList
              scrollParent={scrollParent}
              stagedFiles={stagedFiles}
              unstagedFiles={unstagedFiles}
              untrackedDiffSkipped={untrackedDiffSkipped}
              stagedDiffs={stagedDiffs}
              unstagedDiffs={unstagedDiffs}
              isStaging={isStaging}
              onStageFile={handleStageFile}
              onUnstageFile={handleUnstageFile}
              onStageAll={handleStageAll}
              onUnstageAll={handleUnstageAll}
              onRequestDiscard={handleRequestDiscard}
            />
          </VirtualizerContext.Provider>
        </div>
      </div>
    </div>
  );
};
