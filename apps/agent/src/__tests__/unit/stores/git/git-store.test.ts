/**
 * Tests for git-store.ts
 *
 * Purpose: Manages git repository state - status, branches, loading/fetch states.
 * Uses subscribeWithSelector middleware for optimized subscriptions.
 */

import type { GitStatusResponse } from '@/lib/api';
import type { GitStatus, StatusEntry } from '@/stores/git/git-store';

import {
  selectAhead,
  selectBehind,
  selectBranch,
  selectDirectoryStatus,
  selectFileStatus,
  selectHasConflicts,
  selectIsClean,
  selectModifiedCount,
  selectStagedCount,
  selectTotalChanges,
  selectUntrackedCount,
  useGitStore,
} from '@/stores/git/git-store';

// Helper to create a minimal status entry
function createStatusEntry(path: string, status: StatusEntry['status']): StatusEntry {
  return { path, status, oldPath: null, similarity: null };
}

// Helper to create a full git status
function createGitStatus(overrides: Partial<GitStatus> = {}): GitStatus {
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

describe('git-store', () => {
  beforeEach(() => {
    // Reset store to initial state
    const { reset } = useGitStore.getState();
    reset();
    vi.clearAllMocks();
  });

  // ============================================================================
  // Initial State
  // ============================================================================

  describe('initial state', () => {
    it('should start with null repoPath', () => {
      expect(useGitStore.getState().repoPath).toBeNull();
    });

    it('should start with null status', () => {
      expect(useGitStore.getState().status).toBeNull();
    });

    it('should start with isLoading false', () => {
      expect(useGitStore.getState().isLoading).toBe(false);
    });

    it('should start with null error', () => {
      expect(useGitStore.getState().error).toBeNull();
    });

    it('should start with null fingerprint and zero status revision', () => {
      expect(useGitStore.getState().statusFingerprint).toBeNull();
      expect(useGitStore.getState().statusRevision).toBe(0);
    });

    it('should start with empty branches', () => {
      expect(useGitStore.getState().branches).toEqual([]);
    });
  });

  // ============================================================================
  // setRepoPath
  // ============================================================================

  describe('setRepoPath', () => {
    it('should set repo path', () => {
      const { setRepoPath } = useGitStore.getState();
      setRepoPath('/path/to/repo');
      expect(useGitStore.getState().repoPath).toBe('/path/to/repo');
    });

    it('should skip update if path unchanged (optimization)', () => {
      const { setRepoPath } = useGitStore.getState();
      setRepoPath('/path/to/repo');

      // Get a subscription to track changes
      let changeCount = 0;
      const unsubscribe = useGitStore.subscribe(
        (state) => state.repoPath,
        () => {
          changeCount++;
        }
      );

      // Set same path again
      setRepoPath('/path/to/repo');

      // Should not have triggered additional change
      expect(changeCount).toBe(0);

      unsubscribe();
    });

    it('should allow setting to null', () => {
      const { setRepoPath } = useGitStore.getState();
      setRepoPath('/path/to/repo');
      setRepoPath(null);
      expect(useGitStore.getState().repoPath).toBeNull();
    });
  });

  // ============================================================================
  // setStatus
  // ============================================================================

  describe('setStatus', () => {
    it('should set git status', () => {
      const { setStatus } = useGitStore.getState();
      const status = createGitStatus({ branch: 'feature/test', ahead: 2 });

      setStatus(status);

      const state = useGitStore.getState();
      expect(state.status).toEqual(status);
      expect(state.error).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.lastUpdated).not.toBeNull();
      expect(state.statusRevision).toBe(1);
      expect(state.statusFingerprint).toBeNull();
    });

    it('should replace the status object on repeated legacy writes', () => {
      const { setStatus } = useGitStore.getState();

      const status1 = createGitStatus({ branch: 'main', ahead: 0 });
      setStatus(status1);
      const status2 = createGitStatus({ branch: 'main', ahead: 0 });
      setStatus(status2);

      expect(useGitStore.getState().status).toBe(status2);
      expect(useGitStore.getState().statusRevision).toBe(2);
    });

    it('should update when status meaningfully changes', () => {
      const { setStatus } = useGitStore.getState();

      setStatus(createGitStatus({ branch: 'main', ahead: 0 }));
      setStatus(createGitStatus({ branch: 'main', ahead: 2 })); // Changed

      expect(useGitStore.getState().status?.ahead).toBe(2);
    });

    it('should update when changed entries have same list length', () => {
      const { setStatus } = useGitStore.getState();
      const firstStatus = createGitStatus({
        modified: [createStatusEntry('src/a.ts', 'modified')],
      });
      const secondStatus = createGitStatus({
        modified: [createStatusEntry('src/b.ts', 'modified')],
      });

      setStatus(firstStatus);
      setStatus(secondStatus);

      expect(useGitStore.getState().status).toBe(secondStatus);
      expect(useGitStore.getState().status?.modified[0]?.path).toBe('src/b.ts');
    });

    it('should replace the status object when entry order changes', () => {
      const { setStatus } = useGitStore.getState();
      const firstStatus = createGitStatus({
        modified: [
          createStatusEntry('src/a.ts', 'modified'),
          createStatusEntry('src/b.ts', 'modified'),
        ],
      });
      const reorderedStatus = createGitStatus({
        modified: [
          createStatusEntry('src/b.ts', 'modified'),
          createStatusEntry('src/a.ts', 'modified'),
        ],
      });

      setStatus(firstStatus);
      setStatus(reorderedStatus);

      expect(useGitStore.getState().status).toBe(reorderedStatus);
    });

    it('should clear error when status is set', () => {
      const { setError, setStatus } = useGitStore.getState();

      setError('Previous error');
      setStatus(createGitStatus());

      expect(useGitStore.getState().error).toBeNull();
    });

    it('should filter .DS_Store from untracked entries', () => {
      const { setStatus } = useGitStore.getState();
      const status = createGitStatus({
        untracked: [
          createStatusEntry('.DS_Store', 'untracked'),
          createStatusEntry('src/.DS_Store', 'untracked'),
          createStatusEntry('src/new-file.ts', 'untracked'),
        ],
      });

      setStatus(status);

      const untracked = useGitStore.getState().status?.untracked ?? [];
      expect(untracked.map((entry) => entry.path)).toEqual(['src/new-file.ts']);
    });
  });

  describe('applyPolledStatus', () => {
    it('advances lastUpdated without bumping statusRevision on unchanged polls', () => {
      const { applyPolledStatus } = useGitStore.getState();
      const first = createGitStatus({ branch: 'main', ahead: 0 });

      applyPolledStatus(createStatusResponse(first, { fingerprint: 'abc123' }));
      const previousLastUpdated = useGitStore.getState().lastUpdated;

      applyPolledStatus(
        createStatusResponse(null, {
          changed: false,
          fingerprint: 'abc123',
        })
      );

      expect(useGitStore.getState().status).toEqual(first);
      expect(useGitStore.getState().statusRevision).toBe(1);
      expect(useGitStore.getState().lastUpdated).toBeGreaterThanOrEqual(previousLastUpdated ?? 0);
    });

    it('bumps statusRevision and fingerprint when the backend fingerprint changes', () => {
      const { applyPolledStatus } = useGitStore.getState();

      applyPolledStatus(
        createStatusResponse(createGitStatus({ ahead: 0 }), { fingerprint: 'one' })
      );
      applyPolledStatus(
        createStatusResponse(createGitStatus({ ahead: 2 }), { fingerprint: 'two' })
      );

      expect(useGitStore.getState().status?.ahead).toBe(2);
      expect(useGitStore.getState().statusFingerprint).toBe('two');
      expect(useGitStore.getState().statusRevision).toBe(2);
    });
  });

  // ============================================================================
  // setLoading
  // ============================================================================

  describe('setLoading', () => {
    it('should set loading state', () => {
      const { setLoading } = useGitStore.getState();

      setLoading(true);
      expect(useGitStore.getState().isLoading).toBe(true);

      setLoading(false);
      expect(useGitStore.getState().isLoading).toBe(false);
    });
  });

  // ============================================================================
  // setError
  // ============================================================================

  describe('setError', () => {
    it('should set error and clear loading', () => {
      const { setLoading, setError } = useGitStore.getState();

      setLoading(true);
      setError('Git command failed');

      const state = useGitStore.getState();
      expect(state.error).toBe('Git command failed');
      expect(state.isLoading).toBe(false);
    });

    it('should clear error when set to null', () => {
      const { setError } = useGitStore.getState();

      setError('Error');
      setError(null);

      expect(useGitStore.getState().error).toBeNull();
    });
  });

  // ============================================================================
  // setBranches
  // ============================================================================

  describe('setBranches', () => {
    it('should set branches list', () => {
      const { setBranches } = useGitStore.getState();

      const branches = [
        { name: 'main', isCurrent: true, isRemote: false },
        { name: 'feature/test', isCurrent: false, isRemote: false },
      ];

      setBranches(branches);

      expect(useGitStore.getState().branches).toEqual(branches);
    });
  });

  // ============================================================================
  // Fetch State
  // ============================================================================

  describe('setFetching', () => {
    it('should set fetching state', () => {
      const { setFetching } = useGitStore.getState();

      setFetching(true);
      expect(useGitStore.getState().isFetching).toBe(true);

      setFetching(false);
      expect(useGitStore.getState().isFetching).toBe(false);
    });
  });

  describe('setLastFetchedAt', () => {
    it('should set last fetched timestamp', () => {
      const { setLastFetchedAt } = useGitStore.getState();
      const timestamp = Date.now();

      setLastFetchedAt(timestamp);

      expect(useGitStore.getState().lastFetchedAt).toBe(timestamp);
    });
  });

  // ============================================================================
  // reset
  // ============================================================================

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      const { setRepoPath, setStatus, setLoading, setError, setBranches, setFetching, reset } =
        useGitStore.getState();

      // Set up state
      setRepoPath('/repo');
      setStatus(createGitStatus());
      setLoading(true);
      setError('Error');
      setBranches([{ name: 'main', isCurrent: true, isRemote: false }]);
      setFetching(true);

      // Reset
      reset();

      const state = useGitStore.getState();
      expect(state.repoPath).toBeNull();
      expect(state.status).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.statusFingerprint).toBeNull();
      expect(state.statusRevision).toBe(0);
      expect(state.branches).toEqual([]);
      expect(state.isFetching).toBe(false);
      expect(state.lastFetchedAt).toBeNull();
    });

    it('should clear fingerprint and revision when repo path changes', () => {
      const { applyPolledStatus, setRepoPath } = useGitStore.getState();
      setRepoPath('/repo');
      applyPolledStatus(createStatusResponse(createGitStatus(), { fingerprint: 'repo-a' }));

      setRepoPath('/other-repo');

      expect(useGitStore.getState().statusFingerprint).toBeNull();
      expect(useGitStore.getState().statusRevision).toBe(0);
    });
  });

  // ============================================================================
  // Selectors
  // ============================================================================

  describe('selectors', () => {
    describe('selectBranch', () => {
      it('should return null when no status', () => {
        expect(selectBranch(useGitStore.getState())).toBeNull();
      });

      it('should return branch name', () => {
        const { setStatus } = useGitStore.getState();
        setStatus(createGitStatus({ branch: 'feature/test' }));
        expect(selectBranch(useGitStore.getState())).toBe('feature/test');
      });
    });

    describe('selectAhead/selectBehind', () => {
      it('should return 0 when no status', () => {
        expect(selectAhead(useGitStore.getState())).toBe(0);
        expect(selectBehind(useGitStore.getState())).toBe(0);
      });

      it('should return ahead/behind counts', () => {
        const { setStatus } = useGitStore.getState();
        setStatus(createGitStatus({ ahead: 5, behind: 3 }));

        expect(selectAhead(useGitStore.getState())).toBe(5);
        expect(selectBehind(useGitStore.getState())).toBe(3);
      });
    });

    describe('selectIsClean', () => {
      it('should return true when no status', () => {
        expect(selectIsClean(useGitStore.getState())).toBe(true);
      });

      it('should return true when all arrays empty', () => {
        const { setStatus } = useGitStore.getState();
        setStatus(createGitStatus());
        expect(selectIsClean(useGitStore.getState())).toBe(true);
      });

      it('should return false when there are changes', () => {
        const { setStatus } = useGitStore.getState();
        setStatus(
          createGitStatus({
            modified: [createStatusEntry('file.ts', 'modified')],
          })
        );
        expect(selectIsClean(useGitStore.getState())).toBe(false);
      });
    });

    describe('selectHasConflicts', () => {
      it('should return false when no conflicts', () => {
        const { setStatus } = useGitStore.getState();
        setStatus(createGitStatus());
        expect(selectHasConflicts(useGitStore.getState())).toBe(false);
      });

      it('should return true when there are conflicts', () => {
        const { setStatus } = useGitStore.getState();
        setStatus(
          createGitStatus({
            conflicted: [createStatusEntry('conflict.ts', 'conflicted')],
          })
        );
        expect(selectHasConflicts(useGitStore.getState())).toBe(true);
      });
    });

    describe('selectTotalChanges', () => {
      it('should return 0 when no status', () => {
        expect(selectTotalChanges(useGitStore.getState())).toBe(0);
      });

      it('should sum all change types', () => {
        const { setStatus } = useGitStore.getState();
        setStatus(
          createGitStatus({
            staged: [createStatusEntry('a.ts', 'added')],
            modified: [
              createStatusEntry('b.ts', 'modified'),
              createStatusEntry('c.ts', 'modified'),
            ],
            untracked: [createStatusEntry('d.ts', 'untracked')],
            conflicted: [],
          })
        );
        expect(selectTotalChanges(useGitStore.getState())).toBe(4);
      });
    });

    describe('selectStagedCount/selectModifiedCount/selectUntrackedCount', () => {
      it('should return individual counts', () => {
        const { setStatus } = useGitStore.getState();
        setStatus(
          createGitStatus({
            staged: [createStatusEntry('a.ts', 'added'), createStatusEntry('b.ts', 'added')],
            modified: [createStatusEntry('c.ts', 'modified')],
            untracked: [
              createStatusEntry('d.ts', 'untracked'),
              createStatusEntry('e.ts', 'untracked'),
              createStatusEntry('f.ts', 'untracked'),
            ],
          })
        );

        expect(selectStagedCount(useGitStore.getState())).toBe(2);
        expect(selectModifiedCount(useGitStore.getState())).toBe(1);
        expect(selectUntrackedCount(useGitStore.getState())).toBe(3);
      });
    });

    describe('selectFileStatus', () => {
      it('should return null when no status', () => {
        const selector = selectFileStatus('/path/file.ts');
        expect(selector(useGitStore.getState())).toBeNull();
      });

      it('should return null when no repoPath', () => {
        const { setStatus } = useGitStore.getState();
        setStatus(
          createGitStatus({
            modified: [createStatusEntry('src/file.ts', 'modified')],
          })
        );

        const selector = selectFileStatus('/repo/src/file.ts');
        expect(selector(useGitStore.getState())).toBeNull();
      });

      it('should find file by exact path', () => {
        const { setRepoPath, setStatus } = useGitStore.getState();
        setRepoPath('/repo');
        setStatus(
          createGitStatus({
            modified: [createStatusEntry('src/file.ts', 'modified')],
          })
        );

        const selector = selectFileStatus('/repo/src/file.ts');
        expect(selector(useGitStore.getState())).toBe('modified');
      });

      it('should use priority when file appears in multiple categories', () => {
        const { setRepoPath, setStatus } = useGitStore.getState();
        setRepoPath('/repo');
        setStatus(
          createGitStatus({
            staged: [createStatusEntry('src/file.ts', 'added')],
            modified: [createStatusEntry('src/file.ts', 'modified')],
          })
        );

        const selector = selectFileStatus('/repo/src/file.ts');
        expect(selector(useGitStore.getState())).toBe('modified');
      });

      it('should return null for non-existent file', () => {
        const { setRepoPath, setStatus } = useGitStore.getState();
        setRepoPath('/repo');
        setStatus(createGitStatus());

        const selector = selectFileStatus('/repo/nonexistent.ts');
        expect(selector(useGitStore.getState())).toBeNull();
      });
    });

    describe('selectDirectoryStatus', () => {
      it('should return null when no status', () => {
        const selector = selectDirectoryStatus('/repo/src');
        expect(selector(useGitStore.getState())).toBeNull();
      });

      it('should return null when no repoPath', () => {
        const { setStatus } = useGitStore.getState();
        setStatus(
          createGitStatus({
            modified: [createStatusEntry('src/file.ts', 'modified')],
          })
        );

        const selector = selectDirectoryStatus('/repo/src');
        expect(selector(useGitStore.getState())).toBeNull();
      });

      it('should return status for directory with changed child', () => {
        const { setRepoPath, setStatus } = useGitStore.getState();
        setRepoPath('/repo');
        setStatus(
          createGitStatus({
            modified: [createStatusEntry('src/file.ts', 'modified')],
          })
        );

        const selector = selectDirectoryStatus('/repo/src');
        expect(selector(useGitStore.getState())).toBe('modified');
      });

      it('should resolve directory priority across children', () => {
        const { setRepoPath, setStatus } = useGitStore.getState();
        setRepoPath('/repo');
        setStatus(
          createGitStatus({
            modified: [createStatusEntry('src/a.ts', 'modified')],
            untracked: [createStatusEntry('src/new.ts', 'untracked')],
          })
        );

        const selector = selectDirectoryStatus('/repo/src');
        expect(selector(useGitStore.getState())).toBe('modified');
      });

      it('should use higher priority for multi-category file contributions', () => {
        const { setRepoPath, setStatus } = useGitStore.getState();
        setRepoPath('/repo');
        setStatus(
          createGitStatus({
            staged: [createStatusEntry('src/file.ts', 'added')],
            modified: [createStatusEntry('src/file.ts', 'modified')],
          })
        );

        const selector = selectDirectoryStatus('/repo/src');
        expect(selector(useGitStore.getState())).toBe('modified');
      });

      it('should propagate status to all ancestor directories', () => {
        const { setRepoPath, setStatus } = useGitStore.getState();
        setRepoPath('/repo');
        setStatus(
          createGitStatus({
            conflicted: [createStatusEntry('a/b/c/deep.ts', 'conflicted')],
          })
        );

        expect(selectDirectoryStatus('/repo/a/b/c')(useGitStore.getState())).toBe('conflicted');
        expect(selectDirectoryStatus('/repo/a/b')(useGitStore.getState())).toBe('conflicted');
        expect(selectDirectoryStatus('/repo/a')(useGitStore.getState())).toBe('conflicted');
      });

      it('should compute repo root status from nested and root files', () => {
        const { setRepoPath, setStatus } = useGitStore.getState();
        setRepoPath('/repo');
        setStatus(
          createGitStatus({
            untracked: [createStatusEntry('README.md', 'untracked')],
            modified: [createStatusEntry('src/app.ts', 'modified')],
          })
        );

        const selector = selectDirectoryStatus('/repo');
        expect(selector(useGitStore.getState())).toBe('modified');
      });

      it('should return null for path outside repo', () => {
        const { setRepoPath, setStatus } = useGitStore.getState();
        setRepoPath('/repo');
        setStatus(
          createGitStatus({
            modified: [createStatusEntry('src/file.ts', 'modified')],
          })
        );

        const selector = selectDirectoryStatus('/outside/src');
        expect(selector(useGitStore.getState())).toBeNull();
      });

      it('should reject sibling paths that only share prefix', () => {
        const { setRepoPath, setStatus } = useGitStore.getState();
        setRepoPath('/repo');
        setStatus(
          createGitStatus({
            modified: [createStatusEntry('src/file.ts', 'modified')],
          })
        );

        const selector = selectDirectoryStatus('/repo-copy/src');
        expect(selector(useGitStore.getState())).toBeNull();
      });

      it('should update when status changes', () => {
        const { setRepoPath, setStatus } = useGitStore.getState();
        setRepoPath('/repo');
        setStatus(
          createGitStatus({
            untracked: [createStatusEntry('src/file.ts', 'untracked')],
          })
        );
        expect(selectDirectoryStatus('/repo/src')(useGitStore.getState())).toBe('untracked');

        setStatus(
          createGitStatus({
            modified: [createStatusEntry('src/file.ts', 'modified')],
          })
        );
        expect(selectDirectoryStatus('/repo/src')(useGitStore.getState())).toBe('modified');
      });

      it('should handle many lower-priority descendants under conflicted parent', () => {
        const { setRepoPath, setStatus } = useGitStore.getState();
        setRepoPath('/repo');
        setStatus(
          createGitStatus({
            conflicted: [createStatusEntry('src/conflict.ts', 'conflicted')],
            untracked: [
              createStatusEntry('src/one.ts', 'untracked'),
              createStatusEntry('src/two.ts', 'untracked'),
              createStatusEntry('src/three.ts', 'untracked'),
            ],
          })
        );

        const selector = selectDirectoryStatus('/repo/src');
        expect(selector(useGitStore.getState())).toBe('conflicted');
      });
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should handle status with all change types populated', () => {
      const { setStatus } = useGitStore.getState();

      setStatus(
        createGitStatus({
          staged: [createStatusEntry('a.ts', 'added')],
          modified: [createStatusEntry('b.ts', 'modified')],
          untracked: [createStatusEntry('c.ts', 'untracked')],
          conflicted: [createStatusEntry('d.ts', 'conflicted')],
        })
      );

      expect(selectTotalChanges(useGitStore.getState())).toBe(4);
      expect(selectIsClean(useGitStore.getState())).toBe(false);
      expect(selectHasConflicts(useGitStore.getState())).toBe(true);
    });

    it('should handle detached HEAD (empty branch)', () => {
      const { setStatus } = useGitStore.getState();
      setStatus(createGitStatus({ branch: '' }));
      expect(selectBranch(useGitStore.getState())).toBe('');
    });
  });
});
