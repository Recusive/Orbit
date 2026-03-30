/**
 * Unit tests for use-source-control.ts
 *
 * Tests:
 * - toUserGitError normalization
 * - create + checkout flow success/failure/partial-success
 * - guard clauses for empty names and concurrent operations
 */
import { act, renderHook, waitFor } from '@testing-library/react';

import type { GitBranch, GitStatus, GitStatusResponse } from '@/lib/api';

import {
  toUserGitError,
  useSourceControl,
} from '@/components/git/source-control/hooks/use-source-control';
import { useGitStore } from '@/stores/git/git-store';

const {
  mockGitBranches,
  mockGitCheckout,
  mockGitCommit,
  mockGitCreateBranch,
  mockGitDiffStructured,
  mockGitDiscard,
  mockGitFetch,
  mockGitPull,
  mockGitPush,
  mockGitStage,
  mockGitStagedDiff,
  mockGitStatus,
  mockGitUnstage,
  mockCancelDiffPrep,
  mockStartDiffPrep,
  mockToastError,
  mockToastSuccess,
} = vi.hoisted(() => ({
  mockGitBranches: vi.fn<[string], Promise<GitBranch[]>>(),
  mockGitCheckout: vi.fn<[string, string], Promise<void>>(),
  mockGitCommit: vi.fn<[string, string], Promise<string>>(),
  mockGitCreateBranch: vi.fn<[string, string], Promise<void>>(),
  mockGitDiffStructured: vi.fn<[string, boolean?], Promise<[]>>(),
  mockGitDiscard: vi.fn<[string, string[]], Promise<void>>(),
  mockGitFetch: vi.fn<[string], Promise<void>>(),
  mockGitPull: vi.fn<[string], Promise<void>>(),
  mockGitPush: vi.fn<[string], Promise<void>>(),
  mockGitStage: vi.fn<[string, string[]], Promise<void>>(),
  mockGitStagedDiff: vi.fn<[string], Promise<[]>>(),
  mockGitStatus: vi.fn<[string], Promise<GitStatusResponse>>(),
  mockGitUnstage: vi.fn<[string, string[]], Promise<void>>(),
  mockCancelDiffPrep: vi.fn(),
  mockStartDiffPrep: vi.fn<[string, unknown[], number, unknown[], unknown[]], Promise<void>>(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  gitBranches: mockGitBranches,
  gitCheckout: mockGitCheckout,
  gitCommit: mockGitCommit,
  gitCreateBranch: mockGitCreateBranch,
  gitDiffStructured: mockGitDiffStructured,
  gitDiscard: mockGitDiscard,
  gitFetch: mockGitFetch,
  gitPull: mockGitPull,
  gitPush: mockGitPush,
  gitStage: mockGitStage,
  gitStagedDiff: mockGitStagedDiff,
  gitStatus: mockGitStatus,
  gitUnstage: mockGitUnstage,
}));

vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
    success: mockToastSuccess,
  },
}));

vi.mock('@/lib/utils/diff-prep-service', () => ({
  cancelDiffPrep: mockCancelDiffPrep,
  startDiffPrep: mockStartDiffPrep,
}));

function createMockStatus(overrides: Partial<GitStatus> = {}): GitStatus {
  return {
    branch: 'main',
    upstream: 'origin/main',
    ahead: 0,
    behind: 0,
    staged: [],
    modified: [],
    untracked: [],
    conflicted: [],
    ...overrides,
  };
}

function createStatusResponse(
  status: GitStatus,
  overrides: Partial<GitStatusResponse> = {}
): GitStatusResponse {
  return {
    changed: true,
    fingerprint: overrides.fingerprint ?? 'status-fingerprint',
    status,
    ...overrides,
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();

  useGitStore.setState(useGitStore.getInitialState(), true);
  useGitStore.setState({ repoPath: '/repo' });

  mockGitBranches.mockResolvedValue([]);
  mockGitCheckout.mockResolvedValue(undefined);
  mockGitCommit.mockResolvedValue('commit-sha');
  mockGitCreateBranch.mockResolvedValue(undefined);
  mockGitDiffStructured.mockResolvedValue([]);
  mockGitDiscard.mockResolvedValue(undefined);
  mockGitFetch.mockResolvedValue(undefined);
  mockGitPull.mockResolvedValue(undefined);
  mockGitPush.mockResolvedValue(undefined);
  mockGitStage.mockResolvedValue(undefined);
  mockGitStagedDiff.mockResolvedValue([]);
  mockGitStatus.mockResolvedValue(createStatusResponse(createMockStatus()));
  mockGitUnstage.mockResolvedValue(undefined);
  mockStartDiffPrep.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('toUserGitError', () => {
  it('normalizes duplicate-branch errors', () => {
    expect(toUserGitError("Git error: reference 'refs/heads/foo' already exists")).toBe(
      'Branch already exists.'
    );
  });

  it('normalizes unborn-branch/HEAD errors', () => {
    expect(toUserGitError('Git error: Failed to get HEAD for new branch')).toBe(
      'Cannot create a branch before the first commit.'
    );
    expect(toUserGitError(new Error('Git error: unborn branch'))).toBe(
      'Cannot create a branch before the first commit.'
    );
  });

  it('normalizes invalid ref/name errors', () => {
    expect(toUserGitError('Git error: invalid reference name')).toBe('Invalid branch name.');
  });

  it('passes through unknown errors', () => {
    expect(toUserGitError('some unknown error')).toBe('some unknown error');
  });
});

describe('useSourceControl handleCreateAndCheckout', () => {
  it('creates, checks out, refreshes, and shows success toast', async () => {
    mockGitStatus.mockResolvedValue(
      createStatusResponse(createMockStatus({ branch: 'feature/new-ui' }))
    );

    const { result } = renderHook(() => useSourceControl());

    await act(async () => {
      await result.current.handleCreateAndCheckout('  feature/new-ui  ');
    });

    expect(mockGitCreateBranch).toHaveBeenCalledWith('/repo', 'feature/new-ui');
    expect(mockGitCheckout).toHaveBeenCalledWith('/repo', 'feature/new-ui');
    expect(mockGitStatus).toHaveBeenCalled();
    expect(mockGitBranches).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledWith('Created and switched to feature/new-ui');
    expect(mockToastError).not.toHaveBeenCalled();
    expect(result.current.isCheckingOut).toBe(false);
  });

  it('shows normalized duplicate-branch error and re-throws', async () => {
    mockGitCreateBranch.mockRejectedValue(
      new Error("Git error: reference 'refs/heads/main' already exists")
    );

    const { result } = renderHook(() => useSourceControl());

    await act(async () => {
      await expect(result.current.handleCreateAndCheckout('main')).rejects.toThrow(
        'Branch already exists.'
      );
    });

    expect(mockGitCheckout).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith('Create branch failed', {
      description: 'Branch already exists.',
    });
    expect(result.current.isCheckingOut).toBe(false);
  });

  it('shows partial-success toast when checkout fails without duplicate create-failed toast', async () => {
    mockGitCheckout.mockRejectedValue(new Error('Git error: cannot switch to branch'));

    const { result } = renderHook(() => useSourceControl());

    await act(async () => {
      await expect(result.current.handleCreateAndCheckout('feature/partial')).rejects.toThrow(
        'cannot switch to branch'
      );
    });

    expect(mockGitCreateBranch).toHaveBeenCalledWith('/repo', 'feature/partial');
    expect(mockGitCheckout).toHaveBeenCalledWith('/repo', 'feature/partial');
    expect(mockToastError).toHaveBeenCalledTimes(1);
    expect(mockToastError).toHaveBeenCalledWith('Branch created, but checkout failed', {
      description: 'cannot switch to branch',
    });
    expect(mockToastError).not.toHaveBeenCalledWith('Create branch failed', expect.anything());
    expect(mockGitStatus).toHaveBeenCalled();
    expect(mockGitBranches).toHaveBeenCalled();
  });

  it('shows normalized invalid-name error', async () => {
    mockGitCreateBranch.mockRejectedValue(new Error('Git error: invalid reference name'));

    const { result } = renderHook(() => useSourceControl());

    await act(async () => {
      await expect(result.current.handleCreateAndCheckout('bad branch')).rejects.toThrow(
        'Invalid branch name.'
      );
    });

    expect(mockToastError).toHaveBeenCalledWith('Create branch failed', {
      description: 'Invalid branch name.',
    });
  });

  it('returns early for empty branch names', async () => {
    const { result } = renderHook(() => useSourceControl());

    await act(async () => {
      await result.current.handleCreateAndCheckout('   ');
    });

    expect(mockGitCreateBranch).not.toHaveBeenCalled();
    expect(mockGitCheckout).not.toHaveBeenCalled();
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('returns early while another operation is in progress', async () => {
    const deferred = createDeferred<undefined>();
    mockGitCreateBranch.mockImplementation(async () => deferred.promise);

    const { result } = renderHook(() => useSourceControl());

    let firstCall: Promise<void> | undefined;
    await act(async () => {
      firstCall = result.current.handleCreateAndCheckout('feature/first');
      await Promise.resolve();
      await result.current.handleCreateAndCheckout('feature/second');
      deferred.resolve(undefined);
      await firstCall;
    });

    await waitFor(() => {
      expect(mockGitCreateBranch).toHaveBeenCalledTimes(1);
    });
    expect(mockGitCreateBranch).toHaveBeenCalledWith('/repo', 'feature/first');
    expect(mockGitCheckout).toHaveBeenCalledTimes(1);
    expect(result.current.isCheckingOut).toBe(false);
  });
});

describe('useSourceControl diff fetching behavior', () => {
  it('exposes when eager untracked diffs are skipped', () => {
    useGitStore.getState().setStatus(
      createMockStatus({
        untracked: Array.from({ length: 301 }, (_, index) => ({
          path: `src/file-${String(index)}.ts`,
          status: 'untracked',
          oldPath: null,
          similarity: null,
        })),
      })
    );

    const { result } = renderHook(() => useSourceControl(true));

    expect(result.current.untrackedDiffSkipped).toBe(true);
  });

  it('debounces status tick diff fetches to a single call', async () => {
    vi.useFakeTimers();
    renderHook(() => useSourceControl(true));

    act(() => {
      useGitStore.getState().setStatus(createMockStatus({ ahead: 1 }));
      useGitStore.getState().setStatus(createMockStatus({ ahead: 2 }));
    });

    expect(mockGitStagedDiff).not.toHaveBeenCalled();
    expect(mockGitDiffStructured).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(mockGitStagedDiff).toHaveBeenCalledTimes(1);
    expect(mockGitDiffStructured).toHaveBeenCalledTimes(1);
    expect(mockStartDiffPrep).toHaveBeenCalledTimes(1);
  });

  it('deduplicates inflight fetches and drains one trailing refetch', async () => {
    vi.useFakeTimers();
    const firstStaged = createDeferred<[]>();
    const firstUnstaged = createDeferred<[]>();
    let stagedCalls = 0;
    let unstagedCalls = 0;

    mockGitStagedDiff.mockImplementation(async () => {
      stagedCalls += 1;
      if (stagedCalls === 1) {
        return firstStaged.promise;
      }
      return [];
    });
    mockGitDiffStructured.mockImplementation(async () => {
      unstagedCalls += 1;
      if (unstagedCalls === 1) {
        return firstUnstaged.promise;
      }
      return [];
    });

    renderHook(() => useSourceControl(true));

    act(() => {
      useGitStore.getState().setStatus(createMockStatus({ ahead: 1 }));
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(mockGitStagedDiff).toHaveBeenCalledTimes(1);
    expect(mockGitDiffStructured).toHaveBeenCalledTimes(1);

    act(() => {
      useGitStore.getState().setStatus(createMockStatus({ ahead: 2 }));
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    // Still inflight, so second fetch should be queued instead of starting now.
    expect(mockGitStagedDiff).toHaveBeenCalledTimes(1);
    expect(mockGitDiffStructured).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstStaged.resolve([]);
      firstUnstaged.resolve([]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockGitStagedDiff).toHaveBeenCalledTimes(2);
    expect(mockGitDiffStructured).toHaveBeenCalledTimes(2);
    expect(mockStartDiffPrep).toHaveBeenCalledTimes(2);
  });

  it('does not fetch diffs when the source control tab is hidden', async () => {
    vi.useFakeTimers();
    renderHook(() => useSourceControl(false));

    act(() => {
      useGitStore.getState().setStatus(createMockStatus({ ahead: 1 }));
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    expect(mockGitStagedDiff).not.toHaveBeenCalled();
    expect(mockGitDiffStructured).not.toHaveBeenCalled();
    expect(mockStartDiffPrep).not.toHaveBeenCalled();
  });

  it('fetches immediately on visibility transition from hidden to visible', async () => {
    vi.useFakeTimers();
    const { rerender } = renderHook(
      ({ isVisible }: { isVisible: boolean }) => useSourceControl(isVisible),
      {
        initialProps: { isVisible: false },
      }
    );

    act(() => {
      useGitStore.getState().setStatus(createMockStatus({ ahead: 1 }));
    });

    await act(async () => {
      rerender({ isVisible: true });
      await Promise.resolve();
    });

    expect(mockGitStagedDiff).toHaveBeenCalledTimes(1);
    expect(mockGitDiffStructured).toHaveBeenCalledTimes(1);
    expect(mockStartDiffPrep).toHaveBeenCalledTimes(1);
  });

  it('runs a single fetch on first visible mount (mount guard prevents double call)', async () => {
    vi.useFakeTimers();
    useGitStore.getState().setStatus(createMockStatus({ ahead: 1 }));

    renderHook(() => useSourceControl(true));

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(mockGitStagedDiff).toHaveBeenCalledTimes(1);
    expect(mockGitDiffStructured).toHaveBeenCalledTimes(1);
    expect(mockStartDiffPrep).toHaveBeenCalledTimes(1);
  });

  it('cancels background diff prep when the hook unmounts', () => {
    const { unmount } = renderHook(() => useSourceControl(true));

    unmount();

    expect(mockCancelDiffPrep).toHaveBeenCalledTimes(1);
  });
});
