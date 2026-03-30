import { render, screen } from '@testing-library/react';

import { SourceControlTab } from '@/components/git/source-control/SourceControlTab';
import { useGitStore } from '@/stores/git/git-store';

const { setupMock, cleanUpMock } = vi.hoisted(() => ({
  setupMock: vi.fn(),
  cleanUpMock: vi.fn(),
}));

vi.mock('@pierre/diffs', async (importOriginal: () => Promise<Record<string, unknown>>) => {
  const actual = await importOriginal();
  return {
    ...actual,
    Virtualizer: class MockVirtualizer {
      setup = setupMock;
      cleanUp = cleanUpMock;
    },
  };
});

vi.mock('@pierre/diffs/react', async () => {
  const React = await import('react');
  return {
    VirtualizerContext: React.createContext(undefined),
  };
});

vi.mock('@/hooks/ui', () => ({
  useSmoothScroll: () => vi.fn(),
}));

vi.mock('@/components/git/source-control/hooks/use-source-control', () => ({
  useSourceControl: () => ({
    status: {
      branch: 'main',
      upstream: null,
      ahead: 0,
      behind: 0,
      staged: [],
      modified: [],
      untracked: [],
      conflicted: [],
    },
    isLoading: false,
    error: null,
    stagedFiles: [],
    unstagedFiles: [],
    untrackedDiffSkipped: false,
    stagedDiffs: [],
    unstagedDiffs: [],
    commitMessage: '',
    setCommitMessage: vi.fn(),
    commitError: null,
    isCommitting: false,
    handleCommit: vi.fn(),
    isStaging: false,
    handleStageFile: vi.fn(),
    handleUnstageFile: vi.fn(),
    handleStageAll: vi.fn(),
    handleUnstageAll: vi.fn(),
    pendingDiscard: null,
    handleRequestDiscard: vi.fn(),
    handleCancelDiscard: vi.fn(),
    handleConfirmDiscard: vi.fn(),
    isPushing: false,
    isPulling: false,
    handlePush: vi.fn(),
    handlePull: vi.fn(),
    branches: [],
    isCheckingOut: false,
    handleCheckout: vi.fn(),
    handleCreateAndCheckout: vi.fn(),
    isFetching: false,
    handleFetch: vi.fn(),
    operationError: null,
    refresh: vi.fn(),
  }),
}));

vi.mock('@/components/git/source-control/components/BranchSelector', () => ({
  BranchSelector: () => <div data-testid="branch-selector">branch</div>,
}));

vi.mock('@/components/git/source-control/components/CommitForm', () => ({
  CommitForm: () => <div data-testid="commit-form">commit</div>,
}));

vi.mock('@/components/git/source-control/components/DiscardConfirmation', () => ({
  DiscardConfirmation: () => <div data-testid="discard-confirmation">discard</div>,
}));

vi.mock('@/components/git/source-control/components/GitActions', () => ({
  GitActions: () => <div data-testid="git-actions">actions</div>,
}));

vi.mock('@/components/git/source-control/components/OperationError', () => ({
  OperationError: () => <div data-testid="operation-error">error</div>,
}));

vi.mock('@/components/git/source-control/components/SyncStatus', () => ({
  SyncStatus: () => <div data-testid="sync-status">sync</div>,
}));

vi.mock('@/components/git/source-control/components/ChangesList', async () => {
  const React = await import('react');
  const { VirtualizerContext } = await import('@pierre/diffs/react');

  return {
    ChangesList: () => {
      const virtualizer = React.useContext(VirtualizerContext);
      return (
        <div data-testid="changes-list">{virtualizer ? 'context-ready' : 'context-missing'}</div>
      );
    },
  };
});

describe('SourceControlTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGitStore.setState({ repoPath: '/repo' });
  });

  it('does not create the shared Pierre virtualizer until a large diff requests it', () => {
    const { unmount } = render(<SourceControlTab />);

    expect(screen.getByTestId('source-control-scroll')).toBeInTheDocument();
    expect(screen.getByTestId('changes-list')).toHaveTextContent('context-missing');
    expect(setupMock).not.toHaveBeenCalled();

    unmount();

    expect(cleanUpMock).not.toHaveBeenCalled();
  });
});
