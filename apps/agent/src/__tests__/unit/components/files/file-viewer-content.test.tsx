import { act, render, screen, waitFor } from '@testing-library/react';

import type { ViewedFile, ViewedFileDiff } from '@/stores/file/file-viewer-store';

import { FileViewerContent } from '@/components/files/file-viewer-content';
import { MAX_PREVIEW_LINES } from '@/hooks/file/use-is-preview-rendered';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';

let nextInstanceId = 0;

vi.mock('@/components/editor', () => ({
  EditorBreadcrumbs: () => <div data-testid="mock-breadcrumbs" />,
  EditorSkeleton: () => <div data-testid="mock-editor-skeleton" />,
  extractMarkdownOutline: () => [],
}));

vi.mock('@/components/editor/CodeMirrorEditor', () => ({
  CodeMirrorEditor: () => <div data-testid="mock-editor">Editor</div>,
}));

vi.mock('@/components/files/markdown-preview', () => ({
  MarkdownPreview: () => <div data-testid="mock-markdown-preview">Preview</div>,
}));

vi.mock('@/components/files/image-preview', () => ({
  ImagePreview: ({ onViewSource }: { readonly onViewSource: () => Promise<void> }) => (
    <button
      data-testid="mock-image-preview"
      onClick={() => {
        void onViewSource();
      }}
      type="button"
    >
      Image Preview
    </button>
  ),
}));

vi.mock('@/components/git', () => ({
  FileDiffViewer: () => <div data-testid="mock-diff-viewer">Diff</div>,
}));

vi.mock('@/lib/api', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

function resetStore(): void {
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
}

function createDiffData(): ViewedFileDiff {
  return {
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
  };
}

function createFile(overrides: Partial<ViewedFile> = {}): ViewedFile {
  return {
    instanceId: ++nextInstanceId,
    path: '/docs/README.md',
    content: '# Title\n\ncontent',
    originalContent: '# Title\n\ncontent',
    language: 'markdown',
    fileType: 'text',
    viewMode: 'file',
    isModified: false,
    isExternal: false,
    ...overrides,
  };
}

describe('FileViewerContent', () => {
  beforeEach(() => {
    nextInstanceId = 0;
    resetStore();
    vi.clearAllMocks();
  });

  it('renders markdown preview when markdown is toggled on and under threshold', async () => {
    const file = createFile();
    useFileViewerStore.setState({
      markdownPreview: { [file.path]: true },
    });

    render(<FileViewerContent file={file} />);

    expect(await screen.findByTestId('mock-markdown-preview')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-editor')).not.toBeInTheDocument();
  });

  it('renders diff viewer in diff mode even when preview is toggled on', () => {
    const file = createFile({
      viewMode: 'diff',
      diffData: createDiffData(),
    });
    useFileViewerStore.setState({
      markdownPreview: { [file.path]: true },
    });

    render(<FileViewerContent file={file} />);

    expect(screen.getByTestId('mock-diff-viewer')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-markdown-preview')).not.toBeInTheDocument();
  });

  it('renders source editor for non-markdown files even when toggled on', async () => {
    const file = createFile({
      path: '/src/index.ts',
      language: 'typescript',
      content: 'export const x = 1;',
      originalContent: 'export const x = 1;',
    });
    useFileViewerStore.setState({
      markdownPreview: { [file.path]: true },
    });

    render(<FileViewerContent file={file} />);

    expect(await screen.findByTestId('mock-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-markdown-preview')).not.toBeInTheDocument();
  });

  it('renders source editor when markdown file exceeds preview threshold', async () => {
    const largeContent = `# Header\n${'line\n'.repeat(MAX_PREVIEW_LINES + 1)}`;
    const file = createFile({
      content: largeContent,
      originalContent: largeContent,
    });
    useFileViewerStore.setState({
      markdownPreview: { [file.path]: true },
    });

    render(<FileViewerContent file={file} />);

    expect(await screen.findByTestId('mock-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-markdown-preview')).not.toBeInTheDocument();
  });

  it('clears search state when preview becomes rendered', async () => {
    const file = createFile();
    useFileViewerStore.setState({
      searchOpen: true,
      searchQuery: 'Title',
      searchTrigger: { path: file.path, id: 1 },
    });

    render(<FileViewerContent file={file} />);
    expect(await screen.findByTestId('mock-editor')).toBeInTheDocument();

    act(() => {
      useFileViewerStore.getState().toggleMarkdownPreview(file.path);
    });

    await waitFor(() => {
      expect(screen.getByTestId('mock-markdown-preview')).toBeInTheDocument();
    });

    const state = useFileViewerStore.getState();
    expect(state.searchOpen).toBe(false);
    expect(state.searchQuery).toBe('');
    expect(state.searchTrigger).toBeNull();
  });

  it('does not clear search when preview is toggled on but threshold blocks rendering', async () => {
    const largeContent = `# Header\n${'line\n'.repeat(MAX_PREVIEW_LINES + 1)}`;
    const file = createFile({
      content: largeContent,
      originalContent: largeContent,
    });
    useFileViewerStore.setState({
      searchOpen: true,
      searchQuery: 'Header',
      searchTrigger: { path: file.path, id: 2 },
    });

    render(<FileViewerContent file={file} />);
    expect(await screen.findByTestId('mock-editor')).toBeInTheDocument();

    act(() => {
      useFileViewerStore.getState().toggleMarkdownPreview(file.path);
    });

    await waitFor(() => {
      expect(screen.getByTestId('mock-editor')).toBeInTheDocument();
    });

    const state = useFileViewerStore.getState();
    expect(state.searchOpen).toBe(true);
    expect(state.searchQuery).toBe('Header');
    expect(state.searchTrigger?.path).toBe(file.path);
  });

  it('renders image preview for image files', async () => {
    const file = createFile({
      path: '/assets/photo.png',
      language: 'plaintext',
      content: '',
      originalContent: '',
      fileType: 'image',
      imageData: {
        assetUrl: 'http://asset.localhost/assets/photo.png',
        mimeType: 'image/png',
        fileSize: 1024,
      },
    });

    render(<FileViewerContent file={file} />);

    expect(await screen.findByTestId('mock-image-preview')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-editor')).not.toBeInTheDocument();
  });

  it('renders editor for image files in source view mode', async () => {
    const file = createFile({
      path: '/assets/diagram.svg',
      language: 'xml',
      content: '<svg />',
      originalContent: '<svg />',
      fileType: 'image',
      imageData: {
        assetUrl: 'http://asset.localhost/assets/diagram.svg',
        mimeType: 'image/svg+xml',
        fileSize: 2048,
        svgSourceView: true,
      },
    });

    render(<FileViewerContent file={file} />);

    expect(await screen.findByTestId('mock-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-image-preview')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View as image' })).toBeInTheDocument();
  });
});
