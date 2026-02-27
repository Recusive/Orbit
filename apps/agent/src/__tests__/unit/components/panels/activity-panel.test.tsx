import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ViewedFile } from '@/stores/file/file-viewer-store';

import { ActivityPanel } from '@/components/panels/activity-panel';
import { MAX_PREVIEW_LINES } from '@/hooks/file/use-is-preview-rendered';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';
import { useUIStore } from '@/stores/ui/ui-store';

vi.mock('@/components/files', () => ({
  FileIcon: () => <span data-testid="mock-file-icon" />,
  FileViewer: () => <div data-testid="mock-file-viewer">Viewer</div>,
}));

vi.mock('@/components/git', () => ({
  SourceControlTab: () => <div data-testid="mock-source-control">Source</div>,
}));

vi.mock('@/components/layout/status-bar', () => ({
  StatusBar: () => <div data-testid="mock-status-bar">Status</div>,
}));

vi.mock('@/hooks/ui', () => ({
  useSmoothScroll: () => ({ current: null }),
}));

vi.mock('@/lib/api', () => ({
  lspDidClose: vi.fn().mockResolvedValue(undefined),
}));

function resetStores(): void {
  useFileViewerStore.setState({
    openTabs: [],
    activeTabPath: null,
    markdownPreview: {},
    cursorPositions: {},
    history: [],
    historyIndex: -1,
    isLoading: false,
    loadingPath: null,
    searchOpen: false,
    searchTrigger: null,
    searchQuery: '',
    pendingGoto: null,
    wordWrap: false,
  });

  useUIStore.setState({
    activityTab: 'file',
    reviewPanelOpen: false,
  });
}

function createFile(overrides: Partial<ViewedFile> = {}): ViewedFile {
  return {
    path: '/docs/README.md',
    content: '# Title\n\ncontent',
    originalContent: '# Title\n\ncontent',
    language: 'markdown',
    viewMode: 'file',
    isModified: false,
    isExternal: false,
    ...overrides,
  };
}

function setActiveFile(file: ViewedFile, preview = false): void {
  useFileViewerStore.setState({
    openTabs: [file],
    activeTabPath: file.path,
    markdownPreview: preview ? { [file.path]: true } : {},
  });
}

describe('ActivityPanel markdown preview controls', () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
  });

  it('shows preview toggle only for markdown files in non-diff mode', () => {
    const markdownFile = createFile();
    setActiveFile(markdownFile);
    const { rerender } = render(<ActivityPanel />);

    expect(screen.getByRole('button', { name: 'Show preview' })).toBeInTheDocument();

    const nonMarkdownFile = createFile({
      path: '/src/app.ts',
      language: 'typescript',
      content: 'export const x = 1;',
      originalContent: 'export const x = 1;',
    });
    act(() => {
      setActiveFile(nonMarkdownFile);
    });
    rerender(<ActivityPanel />);
    expect(screen.queryByRole('button', { name: 'Show preview' })).not.toBeInTheDocument();

    const diffMarkdownFile = createFile({
      viewMode: 'diff',
      diffData: {
        oldContent: 'old',
        newContent: 'new',
        diff: {
          additions: 1,
          deletions: 1,
          hunks: [
            {
              oldStart: 1,
              oldLines: 1,
              newStart: 1,
              newLines: 1,
              lines: [
                { type: 'delete', content: 'old', oldLineNumber: 1 },
                { type: 'add', content: 'new', newLineNumber: 1 },
              ],
            },
          ],
        },
      },
    });
    act(() => {
      setActiveFile(diffMarkdownFile);
    });
    rerender(<ActivityPanel />);
    expect(screen.queryByRole('button', { name: 'Show preview' })).not.toBeInTheDocument();
  });

  it('swaps toggle label between show preview and show source', async () => {
    const user = userEvent.setup();
    const file = createFile();
    setActiveFile(file);

    render(<ActivityPanel />);

    const toggleButton = screen.getByRole('button', { name: 'Show preview' });
    await user.click(toggleButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Show source' })).toBeInTheDocument();
    });
  });

  it('disables search button when preview is rendered', () => {
    const file = createFile();
    setActiveFile(file, true);

    render(<ActivityPanel />);

    const searchButton = screen.getByRole('button', { name: 'Search in file' });
    expect(searchButton).toBeDisabled();
    expect(searchButton).toHaveAttribute('title', 'Search unavailable in preview');
  });

  it('keeps search button enabled when preview toggle is on but threshold blocks rendering', () => {
    const largeContent = `# Header\n${'line\n'.repeat(MAX_PREVIEW_LINES + 1)}`;
    const file = createFile({
      content: largeContent,
      originalContent: largeContent,
    });
    setActiveFile(file, true);

    render(<ActivityPanel />);

    const searchButton = screen.getByRole('button', { name: 'Search in file' });
    expect(searchButton).not.toBeDisabled();
    expect(searchButton).toHaveAttribute('title', 'Search (⌘F)');
  });

  it('shows threshold-blocked preview label and allows toggling back off', async () => {
    const user = userEvent.setup();
    const largeContent = `# Header\n${'line\n'.repeat(MAX_PREVIEW_LINES + 1)}`;
    const file = createFile({
      content: largeContent,
      originalContent: largeContent,
    });
    setActiveFile(file, true);

    render(<ActivityPanel />);

    const blockedButton = screen.getByRole('button', {
      name: 'Preview unavailable - file too large',
    });
    await user.click(blockedButton);

    expect(useFileViewerStore.getState().markdownPreview[file.path]).toBe(false);
    expect(screen.getByRole('button', { name: 'Show preview' })).toBeInTheDocument();
  });
});
