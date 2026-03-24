import { parseDiffFromFile } from '@pierre/diffs';
import { FileDiff as PierreFileDiff } from '@pierre/diffs/react';
import { preloadFileDiff } from '@pierre/diffs/ssr';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FileItem } from '@/components/git/source-control/types';
import type { FileDiff } from '@/lib/api';

import { DiffFileCard } from '@/components/git/source-control/components/DiffFileCard';
import { gitFileDiffContent, gitFileDiffStats } from '@/lib/api/git';
import { diffScheduler } from '@/lib/utils';
import { clearParsedDiffCache } from '@/lib/utils/pierre-diff-cache';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';
import { useGitStore } from '@/stores/git/git-store';

vi.mock('@pierre/diffs', async (importOriginal: () => Promise<Record<string, unknown>>) => {
  const actual = await importOriginal();
  return {
    ...actual,
    parseDiffFromFile: vi.fn(),
  };
});

vi.mock('@pierre/diffs/ssr', () => ({
  preloadFileDiff: vi.fn(),
}));

vi.mock('@pierre/diffs/react', async () => {
  const React = await import('react');
  return {
    FileDiff: vi.fn(() => <div data-testid="pierre-file-diff">diff</div>),
    VirtualizerContext: React.createContext(undefined),
  };
});

vi.mock('@/components/chat/tools/shared', () => ({
  DiffStat: ({
    additions,
    deletions,
  }: {
    readonly additions: number;
    readonly deletions: number;
  }) => <div data-testid="diff-stat">{`${additions.toString()}/${deletions.toString()}`}</div>,
  useIsDarkMode: () => false,
}));

vi.mock('@/components/files', () => ({
  FileIcon: () => <div data-testid="file-icon">icon</div>,
}));

vi.mock('@/lib/api/git', () => ({
  gitFileDiffContent: vi.fn(),
  gitFileDiffStats: vi.fn(),
}));

const parseDiffFromFileMock = vi.mocked(parseDiffFromFile);
const preloadFileDiffMock = vi.mocked(preloadFileDiff);
const gitFileDiffContentMock = vi.mocked(gitFileDiffContent);
const gitFileDiffStatsMock = vi.mocked(gitFileDiffStats);
const pierreFileDiffRenderMock = vi.mocked(PierreFileDiff);

function createFileItem(path = 'src/example.ts'): FileItem {
  return {
    path,
    displayStatus: 'modified',
    backendStatus: 'modified',
    oldPath: null,
  };
}

function createStructuredDiff(additions: number, deletions: number): FileDiff {
  return {
    path: 'src/example.ts',
    oldPath: 'src/example.ts',
    isBinary: false,
    hunks: [
      {
        header: '@@ -1 +1 @@',
        lines: [
          ...Array.from({ length: deletions }, (_, index) => ({
            origin: '-',
            content: `old ${index.toString()}`,
            oldLine: index + 1,
          })),
          ...Array.from({ length: additions }, (_, index) => ({
            origin: '+',
            content: `new ${index.toString()}`,
            newLine: index + 1,
          })),
        ],
      },
    ],
  };
}

function createPierreDiffMetadata(additions: number, deletions: number): unknown {
  return {
    name: 'src/example.ts',
    lang: 'typescript',
    isPartial: false,
    cacheKey: `diff-${additions.toString()}-${deletions.toString()}`,
    hunks: [{ additionLines: additions, deletionLines: deletions }],
    additionLines: [],
    deletionLines: [],
    additionsContent: '',
    deletionsContent: '',
  };
}

function renderCard(diff: FileDiff | undefined): void {
  render(
    <DiffFileCard
      file={createFileItem()}
      diff={diff}
      deferredDiffMode={false}
      isStaged={false}
      isLoading={false}
      onAction={() => Promise.resolve(undefined)}
      onDiscard={vi.fn()}
      schedulePrefetch={() => () => undefined}
    />
  );
}

describe('DiffFileCard', () => {
  const originalOpenFileWithDiff = useFileViewerStore.getState().openFileWithDiff;

  beforeEach(() => {
    vi.clearAllMocks();
    clearParsedDiffCache();
    diffScheduler.cancelAll();
    useGitStore.setState({
      repoPath: '/repo',
      statusFingerprint: 'fingerprint-1',
      statusRevision: 1,
    });
    useFileViewerStore.setState({
      openFileWithDiff: originalOpenFileWithDiff,
    });
    gitFileDiffContentMock.mockResolvedValue({
      oldContent: 'old content',
      newContent: 'new content',
      isBinary: false,
    });
    gitFileDiffStatsMock.mockResolvedValue({
      additions: 0,
      deletions: 0,
      isBinary: false,
    });
  });

  it('keeps small diffs on the prerendered non-virtualized path', async () => {
    const user = userEvent.setup();
    const metadata = createPierreDiffMetadata(30, 10);
    parseDiffFromFileMock.mockReturnValue(metadata);
    preloadFileDiffMock.mockResolvedValue({
      fileDiff: metadata,
      prerenderedHTML: '<div>prerendered</div>',
    });

    renderCard(createStructuredDiff(30, 10));

    await user.click(screen.getByLabelText('Expand diff for example.ts'));

    await waitFor(() => {
      expect(screen.getByTestId('pierre-file-diff')).toBeInTheDocument();
    });

    expect(preloadFileDiffMock).toHaveBeenCalledTimes(1);
    const props = pierreFileDiffRenderMock.mock.lastCall?.[0] as Record<string, unknown>;
    expect(props['prerenderedHTML']).toBe('<div>prerendered</div>');
    expect(props['metrics']).toBeUndefined();
  });

  it('uses the virtualized inline path for large diffs and skips SSR preload', async () => {
    const user = userEvent.setup();
    const metadata = createPierreDiffMetadata(420, 20);
    parseDiffFromFileMock.mockReturnValue(metadata);

    renderCard(createStructuredDiff(420, 20));

    await user.click(screen.getByLabelText('Expand diff for example.ts'));

    await waitFor(() => {
      expect(screen.getByTestId('pierre-file-diff')).toBeInTheDocument();
    });

    expect(preloadFileDiffMock).not.toHaveBeenCalled();
    const props = pierreFileDiffRenderMock.mock.lastCall?.[0] as Record<string, unknown>;
    expect(props['metrics']).toBeDefined();
    expect('prerenderedHTML' in props).toBe(false);
  });

  it('routes pathological diffs to the dedicated diff tab flow', async () => {
    const user = userEvent.setup();
    const openFileWithDiff = vi.fn();
    const metadata = createPierreDiffMetadata(10_500, 250);
    parseDiffFromFileMock.mockReturnValue(metadata);
    useFileViewerStore.setState({
      openFileWithDiff,
    });

    renderCard(createStructuredDiff(10_500, 250));

    await user.click(screen.getByLabelText('Expand diff for example.ts'));

    expect(
      screen.getByText(/Large diff \(10,750 lines changed\) — open in diff tab/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /open in diff tab/i }));

    await waitFor(() => {
      expect(openFileWithDiff).toHaveBeenCalledWith(
        'src/example.ts',
        expect.objectContaining({
          repoPath: '/repo',
          filePath: 'src/example.ts',
          statusFingerprint: 'fingerprint-1',
        })
      );
    });
  });

  it('reuses the parsed diff cache across collapse and reopen on the same revision', async () => {
    const user = userEvent.setup();
    const metadata = createPierreDiffMetadata(500, 20);
    parseDiffFromFileMock.mockReturnValue(metadata);

    renderCard(createStructuredDiff(500, 20));

    await user.click(screen.getByLabelText('Expand diff for example.ts'));
    await waitFor(() => {
      expect(screen.getByTestId('pierre-file-diff')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Collapse diff for example.ts'));
    await user.click(screen.getByLabelText('Expand diff for example.ts'));

    await waitFor(() => {
      expect(gitFileDiffContentMock).toHaveBeenCalledTimes(1);
    });

    expect(gitFileDiffContentMock).toHaveBeenCalledTimes(1);
    expect(parseDiffFromFileMock).toHaveBeenCalledTimes(1);
  });
});
