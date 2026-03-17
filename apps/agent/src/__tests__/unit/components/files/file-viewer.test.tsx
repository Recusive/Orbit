import { act, render } from '@testing-library/react';

import type { ViewedFile } from '@/stores/file/file-viewer-store';

import { FileViewer } from '@/components/files/file-viewer';
import { MAX_PREVIEW_LINES } from '@/hooks/file/use-is-preview-rendered';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';

let nextInstanceId = 0;

vi.mock('@/components/files/file-viewer-content', () => ({
  FileViewerContent: () => <div data-testid="mock-file-viewer-content">Content</div>,
}));

const originalToggleSearch = useFileViewerStore.getState().toggleSearch;

function resetStore(): void {
  useFileViewerStore.setState({
    openTabs: [],
    activeTabPath: null,
    markdownPreview: {},
    cursorPositions: {},
    history: [],
    historyIndex: -1,
    isLoading: true,
    loadingPath: null,
    searchOpen: false,
    searchTrigger: null,
    searchQuery: '',
    pendingGoto: null,
    wordWrap: false,
    toggleSearch: originalToggleSearch,
  });
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

function mountWithFile(
  file: ViewedFile,
  toggleSearchMock: ReturnType<typeof vi.fn>,
  preview = false
): void {
  useFileViewerStore.setState({
    openTabs: [file],
    activeTabPath: file.path,
    markdownPreview: preview ? { [file.path]: true } : {},
    isLoading: true,
    loadingPath: file.path,
    toggleSearch: toggleSearchMock,
  });

  render(<FileViewer />);
}

function pressCmdF(): void {
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'f',
      metaKey: true,
    })
  );
}

describe('FileViewer Cmd+F behavior', () => {
  beforeEach(() => {
    nextInstanceId = 0;
    resetStore();
    vi.clearAllMocks();
  });

  it('does not trigger search when markdown preview is rendered', () => {
    const toggleSearchMock = vi.fn();
    const file = createFile();
    mountWithFile(file, toggleSearchMock, true);

    act(() => {
      pressCmdF();
    });

    expect(toggleSearchMock).not.toHaveBeenCalled();
  });

  it('triggers search when preview is not rendered', () => {
    const toggleSearchMock = vi.fn();
    const file = createFile();
    mountWithFile(file, toggleSearchMock, false);

    act(() => {
      pressCmdF();
    });

    expect(toggleSearchMock).toHaveBeenCalledWith(file.path);
  });

  it('triggers search when preview toggle is on but threshold blocks rendering', () => {
    const toggleSearchMock = vi.fn();
    const largeContent = `# Header\n${'line\n'.repeat(MAX_PREVIEW_LINES + 1)}`;
    const file = createFile({
      content: largeContent,
      originalContent: largeContent,
    });
    mountWithFile(file, toggleSearchMock, true);

    act(() => {
      pressCmdF();
    });

    expect(toggleSearchMock).toHaveBeenCalledWith(file.path);
  });

  it('triggers search for non-markdown files regardless of preview toggle state', () => {
    const toggleSearchMock = vi.fn();
    const file = createFile({
      path: '/src/app.ts',
      language: 'typescript',
      content: 'export const x = 1;',
      originalContent: 'export const x = 1;',
    });
    mountWithFile(file, toggleSearchMock, true);

    act(() => {
      pressCmdF();
    });

    expect(toggleSearchMock).toHaveBeenCalledWith(file.path);
  });

  it('does not trigger search for image preview tabs', () => {
    const toggleSearchMock = vi.fn();
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
    mountWithFile(file, toggleSearchMock, false);

    act(() => {
      pressCmdF();
    });

    expect(toggleSearchMock).not.toHaveBeenCalled();
  });

  it('re-enables search for image tabs in source view mode', () => {
    const toggleSearchMock = vi.fn();
    const file = createFile({
      path: '/assets/diagram.svg',
      language: 'xml',
      content: '<svg />',
      originalContent: '<svg />',
      fileType: 'image',
      imageData: {
        assetUrl: 'http://asset.localhost/assets/diagram.svg',
        mimeType: 'image/svg+xml',
        fileSize: 1024,
        svgSourceView: true,
      },
    });
    mountWithFile(file, toggleSearchMock, false);

    act(() => {
      pressCmdF();
    });

    expect(toggleSearchMock).toHaveBeenCalledWith(file.path);
  });
});
