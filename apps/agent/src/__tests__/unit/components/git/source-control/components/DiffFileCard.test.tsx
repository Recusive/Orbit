import { parseDiffFromFile } from '@pierre/diffs';
import { FileDiff as PierreFileDiff } from '@pierre/diffs/react';
import { preloadFileDiff } from '@pierre/diffs/ssr';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FileItem } from '@/components/git/source-control/types';
import type { FileDiff } from '@/lib/api';
import type { ComponentProps } from 'react';

import { DiffFileCard } from '@/components/git/source-control/components/DiffFileCard';
import { gitFileDiffContent, gitFileDiffStats } from '@/lib/api/git';
import { diffScheduler } from '@/lib/utils';
import { clearParsedDiffCache } from '@/lib/utils/pierre-diff-cache';
import { PierreCapabilitiesContext } from '@/providers/pierre-provider';
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

function createPierreDiffMetadata(
  additions: number,
  deletions: number,
  unifiedLineCount = additions + deletions
): unknown {
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
    unifiedLineCount,
  };
}

function renderCard(
  diff: FileDiff | undefined,
  overrides: Partial<ComponentProps<typeof DiffFileCard>> = {},
  workerPoolAvailable = false
): ReturnType<typeof render> {
  return render(
    <PierreCapabilitiesContext.Provider value={{ workerPoolAvailable }}>
      <DiffFileCard
        file={createFileItem()}
        diff={diff}
        deferredDiffMode={false}
        isStaged={false}
        isLoading={false}
        virtualizerReady={true}
        onAction={() => Promise.resolve(undefined)}
        onDiscard={vi.fn()}
        schedulePrefetch={() => () => undefined}
        onVirtualizerNeeded={vi.fn()}
        onVirtualizerReleased={vi.fn()}
        {...overrides}
      />
    </PierreCapabilitiesContext.Provider>
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

  it('skips SSR preload for small diffs when the worker pool is available', async () => {
    const user = userEvent.setup();
    const metadata = createPierreDiffMetadata(30, 10);
    parseDiffFromFileMock.mockReturnValue(metadata);

    renderCard(createStructuredDiff(30, 10), {}, true);

    await user.click(screen.getByLabelText('Expand diff for example.ts'));

    await waitFor(() => {
      expect(screen.getByTestId('pierre-file-diff')).toBeInTheDocument();
    });

    expect(preloadFileDiffMock).not.toHaveBeenCalled();
    const props = pierreFileDiffRenderMock.mock.lastCall?.[0] as Record<string, unknown>;
    expect('prerenderedHTML' in props).toBe(false);
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

  it('gates large diff rendering until the virtualizer is ready', async () => {
    const user = userEvent.setup();
    const onVirtualizerNeeded = vi.fn();
    const onVirtualizerReleased = vi.fn();
    const onAction = (): Promise<void> => Promise.resolve(undefined);
    const onDiscard = vi.fn();
    const metadata = createPierreDiffMetadata(420, 20);
    parseDiffFromFileMock.mockReturnValue(metadata);

    const view = renderCard(createStructuredDiff(420, 20), {
      virtualizerReady: false,
      onAction,
      onDiscard,
      onVirtualizerNeeded,
      onVirtualizerReleased,
    });

    await user.click(screen.getByLabelText('Expand diff for example.ts'));

    await waitFor(() => {
      expect(screen.getByText('Preparing diff…')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('pierre-file-diff')).not.toBeInTheDocument();
    expect(onVirtualizerNeeded).toHaveBeenCalledTimes(1);

    view.rerender(
      <PierreCapabilitiesContext.Provider value={{ workerPoolAvailable: false }}>
        <DiffFileCard
          file={createFileItem()}
          diff={createStructuredDiff(420, 20)}
          deferredDiffMode={false}
          isStaged={false}
          isLoading={false}
          virtualizerReady={true}
          onAction={onAction}
          onDiscard={onDiscard}
          schedulePrefetch={() => () => undefined}
          onVirtualizerNeeded={onVirtualizerNeeded}
          onVirtualizerReleased={onVirtualizerReleased}
        />
      </PierreCapabilitiesContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('pierre-file-diff')).toBeInTheDocument();
    });

    const props = pierreFileDiffRenderMock.mock.lastCall?.[0] as Record<string, unknown>;
    expect(props['metrics']).toBeDefined();
  });

  it('signals virtualizer demand on expand and releases it on collapse', async () => {
    const user = userEvent.setup();
    const onVirtualizerNeeded = vi.fn();
    const onVirtualizerReleased = vi.fn();
    const metadata = createPierreDiffMetadata(420, 20);
    parseDiffFromFileMock.mockReturnValue(metadata);

    renderCard(createStructuredDiff(420, 20), {
      onVirtualizerNeeded,
      onVirtualizerReleased,
    });

    await user.click(screen.getByLabelText('Expand diff for example.ts'));
    await waitFor(() => {
      expect(onVirtualizerNeeded).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByLabelText('Collapse diff for example.ts'));
    await waitFor(() => {
      expect(onVirtualizerReleased).toHaveBeenCalledTimes(1);
    });
  });

  it('releases virtualizer demand when the card unmounts', async () => {
    const user = userEvent.setup();
    const onVirtualizerNeeded = vi.fn();
    const onVirtualizerReleased = vi.fn();
    const metadata = createPierreDiffMetadata(420, 20);
    parseDiffFromFileMock.mockReturnValue(metadata);

    const view = renderCard(createStructuredDiff(420, 20), {
      onVirtualizerNeeded,
      onVirtualizerReleased,
    });

    await user.click(screen.getByLabelText('Expand diff for example.ts'));
    await waitFor(() => {
      expect(onVirtualizerNeeded).toHaveBeenCalledTimes(1);
    });

    view.unmount();

    expect(onVirtualizerReleased).toHaveBeenCalledTimes(1);
  });

  it('mounts a prefetched large diff on the virtualized path when ready', async () => {
    const user = userEvent.setup();
    const metadata = createPierreDiffMetadata(420, 20);
    parseDiffFromFileMock.mockReturnValue(metadata);

    renderCard(createStructuredDiff(420, 20), {
      schedulePrefetch: (start) => {
        void start();
        return () => undefined;
      },
    });

    await user.hover(screen.getByLabelText('Expand diff for example.ts'));
    await waitFor(() => {
      expect(gitFileDiffContentMock).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByLabelText('Expand diff for example.ts'));

    await waitFor(() => {
      expect(screen.getByTestId('pierre-file-diff')).toBeInTheDocument();
    });

    expect(gitFileDiffContentMock).toHaveBeenCalledTimes(1);
    const props = pierreFileDiffRenderMock.mock.lastCall?.[0] as Record<string, unknown>;
    expect(props['metrics']).toBeDefined();
  });

  it('routes pathological diffs to the dedicated diff tab flow', async () => {
    const user = userEvent.setup();
    const openFileWithDiff = vi.fn();
    const metadata = createPierreDiffMetadata(10_500, 250, 10_750);
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
