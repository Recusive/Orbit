import { act, renderHook } from '@testing-library/react';

import type { GitBranch, GitStatus, GitStatusResponse, StatusEntry } from '@/lib/api';

import { useGitStatus } from '@/hooks/git/use-git-status';
import { useGitStore } from '@/stores/git/git-store';

const {
  mockGitBranches,
  mockGitCheckout,
  mockGitCommit,
  mockGitDiscard,
  mockGitDiscover,
  mockGitPull,
  mockGitPush,
  mockGitStage,
  mockGitStatus,
  mockGitStatusConditional,
  mockGitUnstage,
} = vi.hoisted(() => ({
  mockGitBranches: vi.fn<[string], Promise<GitBranch[]>>(),
  mockGitCheckout: vi.fn<[string, string], Promise<void>>(),
  mockGitCommit: vi.fn<[string, string], Promise<string>>(),
  mockGitDiscard: vi.fn<[string, string[]], Promise<void>>(),
  mockGitDiscover: vi.fn<[string], Promise<string>>(),
  mockGitPull: vi.fn<[string, string?], Promise<void>>(),
  mockGitPush: vi.fn<[string, string?], Promise<void>>(),
  mockGitStage: vi.fn<[string, string[]], Promise<void>>(),
  mockGitStatus: vi.fn<[string], Promise<GitStatusResponse>>(),
  mockGitStatusConditional: vi.fn<
    [string, string | null | undefined],
    Promise<GitStatusResponse>
  >(),
  mockGitUnstage: vi.fn<[string, string[]], Promise<void>>(),
}));

vi.mock('@/lib/api', () => ({
  gitBranches: mockGitBranches,
  gitCheckout: mockGitCheckout,
  gitCommit: mockGitCommit,
  gitDiscard: mockGitDiscard,
  gitDiscover: mockGitDiscover,
  gitPull: mockGitPull,
  gitPush: mockGitPush,
  gitStage: mockGitStage,
  gitStatus: mockGitStatus,
  gitStatusConditional: mockGitStatusConditional,
  gitUnstage: mockGitUnstage,
}));

function createStatusEntry(path: string, status: StatusEntry['status']): StatusEntry {
  return { path, status, oldPath: null, similarity: null };
}

function createStatus(overrides: Partial<GitStatus> = {}): GitStatus {
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
  status: GitStatus | null,
  overrides: Partial<GitStatusResponse> = {}
): GitStatusResponse {
  return {
    changed: status !== null,
    fingerprint: overrides.fingerprint ?? 'fingerprint-1',
    status,
    ...overrides,
  };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('useGitStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useGitStore.setState(useGitStore.getInitialState(), true);

    mockGitBranches.mockResolvedValue([]);
    mockGitCheckout.mockResolvedValue(undefined);
    mockGitCommit.mockResolvedValue('commit-sha');
    mockGitDiscard.mockResolvedValue(undefined);
    mockGitDiscover.mockResolvedValue('/repo');
    mockGitPull.mockResolvedValue(undefined);
    mockGitPush.mockResolvedValue(undefined);
    mockGitStage.mockResolvedValue(undefined);
    mockGitStatus.mockResolvedValue(createStatusResponse(createStatus()));
    mockGitStatusConditional.mockResolvedValue(
      createStatusResponse(null, {
        changed: false,
        fingerprint: 'fingerprint-1',
      })
    );
    mockGitUnstage.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses a full status load first, then conditional polling with the stored fingerprint', async () => {
    renderHook(() =>
      useGitStatus('/workspace', {
        pollInterval: 1000,
        pauseWhenHidden: false,
      })
    );

    await act(async () => {
      await flushAsyncWork();
    });

    expect(useGitStore.getState().repoPath).toBe('/repo');
    expect(useGitStore.getState().status?.branch).toBe('main');

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await flushAsyncWork();
    });

    expect(mockGitStatus).toHaveBeenCalledWith('/repo');
    expect(mockGitStatusConditional).toHaveBeenCalledWith('/repo', 'fingerprint-1');
    expect(useGitStore.getState().statusRevision).toBe(1);
    expect(useGitStore.getState().statusFingerprint).toBe('fingerprint-1');
  });

  it('applies changed conditional polls and preserves status updates through the store', async () => {
    mockGitStatusConditional.mockResolvedValue(
      createStatusResponse(
        createStatus({
          modified: [createStatusEntry('src/app.ts', 'modified')],
        }),
        {
          fingerprint: 'fingerprint-2',
        }
      )
    );

    renderHook(() =>
      useGitStatus('/workspace', {
        pollInterval: 1000,
        pauseWhenHidden: false,
      })
    );

    await act(async () => {
      await flushAsyncWork();
    });

    expect(useGitStore.getState().statusFingerprint).toBe('fingerprint-1');

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await flushAsyncWork();
    });

    expect(useGitStore.getState().statusFingerprint).toBe('fingerprint-2');
    expect(useGitStore.getState().status?.modified).toHaveLength(1);
    expect(useGitStore.getState().statusRevision).toBe(2);
  });

  it('uses the full status command for explicit refreshes', async () => {
    const { result } = renderHook(() =>
      useGitStatus('/workspace', {
        pollInterval: 0,
      })
    );

    await act(async () => {
      await flushAsyncWork();
    });

    expect(useGitStore.getState().statusFingerprint).toBe('fingerprint-1');

    mockGitStatus.mockResolvedValue(
      createStatusResponse(createStatus({ ahead: 2 }), {
        fingerprint: 'fingerprint-2',
      })
    );

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockGitStatus).toHaveBeenCalledTimes(2);
    expect(mockGitStatusConditional).not.toHaveBeenCalled();
    expect(useGitStore.getState().status?.ahead).toBe(2);
    expect(useGitStore.getState().statusFingerprint).toBe('fingerprint-2');
  });
});
