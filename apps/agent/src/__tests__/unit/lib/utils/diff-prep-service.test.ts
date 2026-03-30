import { parseDiffFromFile } from '@pierre/diffs';

import type { FileDiff } from '@/lib/api';

import { gitBatchFileContents } from '@/lib/api';
import {
  cancelDiffPrep,
  getInflightPromise,
  getPreparedDiff,
  startDiffPrep,
} from '@/lib/utils/diff-prep-service';
import { clearParsedDiffCache, getParsedDiffCacheKey } from '@/lib/utils/pierre-diff-cache';
import { useGitStore } from '@/stores/git/git-store';

vi.mock('@pierre/diffs', async (importOriginal: () => Promise<Record<string, unknown>>) => {
  const actual = await importOriginal();
  return {
    ...actual,
    parseDiffFromFile: vi.fn(),
  };
});

vi.mock('@/lib/api', async (importOriginal: () => Promise<Record<string, unknown>>) => {
  const actual = await importOriginal();
  return {
    ...actual,
    gitBatchFileContents: vi.fn(),
  };
});

const parseDiffFromFileMock = vi.mocked(parseDiffFromFile);
const gitBatchFileContentsMock = vi.mocked(gitBatchFileContents);

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

function createStructuredDiff(changedLines: number, path = 'src/example.ts'): FileDiff {
  return {
    path,
    oldPath: path,
    isBinary: false,
    hunks: [
      {
        header: '@@ -1 +1 @@',
        lines: Array.from({ length: changedLines }, (_, index) => ({
          origin: '+',
          content: `line ${String(index)}`,
          newLine: index + 1,
        })),
      },
    ],
  };
}

function createPierreDiffMetadata(additions: number, deletions: number): unknown {
  return {
    name: 'src/example.ts',
    lang: 'typescript',
    isPartial: false,
    cacheKey: `diff-${String(additions)}-${String(deletions)}`,
    hunks: [{ additionLines: additions, deletionLines: deletions }],
    additionLines: [],
    deletionLines: [],
    additionsContent: '',
    deletionsContent: '',
    unifiedLineCount: additions + deletions,
  };
}

describe('diff-prep-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    clearParsedDiffCache();
    cancelDiffPrep();
    useGitStore.setState({
      repoPath: '/repo',
      statusFingerprint: 'fingerprint-1',
      statusRevision: 1,
    });
  });

  afterEach(async () => {
    cancelDiffPrep();
    clearParsedDiffCache();
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
  });

  it('warms the parsed diff cache and resolves the inflight promise', async () => {
    parseDiffFromFileMock.mockReturnValue(createPierreDiffMetadata(1, 1));

    const batch = createDeferred<
      {
        file: string;
        scope: 'unstaged';
        content: { oldContent: string; newContent: string; isBinary: boolean };
        error: null;
      }[]
    >();
    gitBatchFileContentsMock.mockReturnValue(batch.promise);

    const file = { path: 'src/example.ts', scope: 'unstaged' as const, oldPath: null };
    const cacheKey = getParsedDiffCacheKey({
      repoPath: '/repo',
      scope: 'unstaged',
      path: file.path,
      oldPath: null,
      statusFingerprint: 'fingerprint-1',
    });

    const prepPromise = startDiffPrep('/repo', [file], 1, [], [createStructuredDiff(2)]);
    const inflight = getInflightPromise(cacheKey);

    expect(inflight).toBeDefined();
    expect(gitBatchFileContentsMock).toHaveBeenCalledTimes(1);

    batch.resolve([
      {
        file: file.path,
        scope: 'unstaged',
        content: {
          oldContent: 'old content\n',
          newContent: 'new content\n',
          isBinary: false,
        },
        error: null,
      },
    ]);

    await vi.runAllTimersAsync();
    await prepPromise;

    await expect(inflight).resolves.toEqual(
      expect.objectContaining({
        oldContent: 'old content\n',
        newContent: 'new content\n',
      })
    );
    expect(parseDiffFromFileMock).toHaveBeenCalledTimes(1);
    expect(getPreparedDiff('/repo', 'unstaged', file.path, null, 'fingerprint-1')).toEqual(
      expect.objectContaining({
        additions: 1,
        deletions: 1,
      })
    );
  });

  it('skips pathological files before issuing the batch request', async () => {
    await startDiffPrep(
      '/repo',
      [{ path: 'src/example.ts', scope: 'unstaged', oldPath: null }],
      1,
      [],
      [createStructuredDiff(10_000)]
    );

    expect(gitBatchFileContentsMock).not.toHaveBeenCalled();
    expect(
      getInflightPromise(
        getParsedDiffCacheKey({
          repoPath: '/repo',
          scope: 'unstaged',
          path: 'src/example.ts',
          oldPath: null,
          statusFingerprint: 'fingerprint-1',
        })
      )
    ).toBeUndefined();
  });

  it('queues a trailing rerun while a previous batch is still in flight', async () => {
    parseDiffFromFileMock.mockReturnValue(createPierreDiffMetadata(1, 1));

    const firstBatch = createDeferred<
      {
        file: string;
        scope: 'unstaged';
        content: { oldContent: string; newContent: string; isBinary: boolean };
        error: null;
      }[]
    >();
    const secondBatch = createDeferred<
      {
        file: string;
        scope: 'unstaged';
        content: { oldContent: string; newContent: string; isBinary: boolean };
        error: null;
      }[]
    >();

    gitBatchFileContentsMock
      .mockReturnValueOnce(firstBatch.promise)
      .mockReturnValueOnce(secondBatch.promise);

    const file = { path: 'src/example.ts', scope: 'unstaged' as const, oldPath: null };
    const firstKey = getParsedDiffCacheKey({
      repoPath: '/repo',
      scope: 'unstaged',
      path: file.path,
      oldPath: null,
      statusFingerprint: 'fingerprint-1',
    });

    const firstRun = startDiffPrep('/repo', [file], 1, [], [createStructuredDiff(2)]);
    const firstInflight = getInflightPromise(firstKey);
    expect(firstInflight).toBeDefined();

    useGitStore.setState({
      statusFingerprint: 'fingerprint-2',
      statusRevision: 2,
    });

    await startDiffPrep('/repo', [file], 2, [], [createStructuredDiff(2)]);
    await expect(firstInflight).resolves.toBeNull();
    expect(gitBatchFileContentsMock).toHaveBeenCalledTimes(1);

    firstBatch.resolve([
      {
        file: file.path,
        scope: 'unstaged',
        content: {
          oldContent: 'stale old\n',
          newContent: 'stale new\n',
          isBinary: false,
        },
        error: null,
      },
    ]);

    await firstRun;
    expect(gitBatchFileContentsMock).toHaveBeenCalledTimes(2);

    const secondKey = getParsedDiffCacheKey({
      repoPath: '/repo',
      scope: 'unstaged',
      path: file.path,
      oldPath: null,
      statusFingerprint: 'fingerprint-2',
    });
    const secondInflight = getInflightPromise(secondKey);
    expect(secondInflight).toBeDefined();

    secondBatch.resolve([
      {
        file: file.path,
        scope: 'unstaged',
        content: {
          oldContent: 'fresh old\n',
          newContent: 'fresh new\n',
          isBinary: false,
        },
        error: null,
      },
    ]);

    await vi.runAllTimersAsync();
    await expect(secondInflight).resolves.toEqual(
      expect.objectContaining({
        oldContent: 'fresh old\n',
        newContent: 'fresh new\n',
      })
    );

    expect(getPreparedDiff('/repo', 'unstaged', file.path, null, 'fingerprint-1')).toBeUndefined();
    expect(getPreparedDiff('/repo', 'unstaged', file.path, null, 'fingerprint-2')).toEqual(
      expect.objectContaining({
        additions: 1,
        deletions: 1,
      })
    );
  });
});
