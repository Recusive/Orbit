import { FileDiff } from '@pierre/diffs/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ViewedFileDiff } from '@/stores/file/file-viewer-store';
import type { ReactNode } from 'react';

import { FileDiffViewer } from '@/components/git/file-diff-viewer';
import { gitFileDiffContent } from '@/lib/api/git';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';
import { useGitStore } from '@/stores/git/git-store';

vi.mock('@pierre/diffs/react', () => ({
  FileDiff: vi.fn(() => <div data-testid="pierre-file-diff">diff</div>),
  Virtualizer: vi.fn(({ children }: { readonly children: ReactNode }) => (
    <div data-testid="pierre-virtualizer">{children}</div>
  )),
}));

vi.mock('@/components/chat/tools/shared', () => ({
  useIsDarkMode: () => false,
}));

vi.mock('@/hooks/ui', () => ({
  useSmoothScroll: () => vi.fn(),
}));

vi.mock('@/lib/api/git', () => ({
  gitFileDiffContent: vi.fn(),
}));

const fileDiffRenderMock = vi.mocked(FileDiff);
const gitFileDiffContentMock = vi.mocked(gitFileDiffContent);

function createDiffData(totalLines = 6): ViewedFileDiff {
  const oldContent = Array.from(
    { length: totalLines },
    (_, index) => `old line ${index.toString()}`
  ).join('\n');
  const newContent = Array.from(
    { length: totalLines },
    (_, index) => `new line ${index.toString()}`
  ).join('\n');

  return {
    oldContent,
    newContent,
    repoPath: '/repo',
    scope: 'unstaged',
    filePath: '/src/file.ts',
    oldPath: null,
    statusFingerprint: 'fingerprint-1',
  };
}

describe('FileDiffViewer', () => {
  const originalOpenFileWithDiff = useFileViewerStore.getState().openFileWithDiff;

  beforeEach(() => {
    vi.clearAllMocks();
    useGitStore.setState({
      repoPath: '/repo',
      statusFingerprint: 'fingerprint-1',
    });
    useFileViewerStore.setState({
      openFileWithDiff: originalOpenFileWithDiff,
    });
  });

  it('virtualizes large diff tabs', () => {
    render(<FileDiffViewer diffData={createDiffData(450)} filePath="/src/file.ts" />);

    expect(screen.getByTestId('pierre-virtualizer')).toBeInTheDocument();
    expect(fileDiffRenderMock).toHaveBeenCalled();
  });

  it('shows an outdated banner and reloads on demand', async () => {
    const user = userEvent.setup();
    const openFileWithDiff = vi.fn();
    useGitStore.setState({
      repoPath: '/repo',
      statusFingerprint: 'fingerprint-2',
    });
    useFileViewerStore.setState({
      openFileWithDiff,
    });
    gitFileDiffContentMock.mockResolvedValue({
      oldContent: 'updated old',
      newContent: 'updated new',
      isBinary: false,
    });

    render(<FileDiffViewer diffData={createDiffData(20)} filePath="/src/file.ts" />);

    expect(screen.getByText('Diff may be outdated.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /reload/i }));

    await waitFor(() => {
      expect(gitFileDiffContentMock).toHaveBeenCalledWith(
        '/repo',
        '/src/file.ts',
        'unstaged',
        undefined
      );
    });

    expect(openFileWithDiff).toHaveBeenCalledWith(
      '/src/file.ts',
      expect.objectContaining({
        oldContent: 'updated old',
        newContent: 'updated new',
        statusFingerprint: 'fingerprint-2',
      }),
      undefined
    );
  });
});
