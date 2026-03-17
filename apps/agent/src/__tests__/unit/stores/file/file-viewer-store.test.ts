/**
 * Tests for file-viewer-store.ts
 *
 * Purpose: Manages open file tabs, content editing, cursor positions,
 * navigation history, search state, and goto functionality.
 * Uses immer middleware for immutable state updates.
 */

import type { FileDiff, DiffLine } from '@/stores/file/file-store';
import type { ViewedFileDiff } from '@/stores/file/file-viewer-store';

import { getLanguageFromPath, useFileViewerStore } from '@/stores/file/file-viewer-store';

// Helper to reset the store to initial state
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

// Helper to create mock diff data
function createMockDiffData(oldContent: string, newContent: string): ViewedFileDiff {
  const deleteLine: DiffLine = { type: 'delete', content: 'old line', oldLineNumber: 1 };
  const addLine: DiffLine = { type: 'add', content: 'new line', newLineNumber: 1 };
  const diff: FileDiff = {
    additions: 1,
    deletions: 1,
    hunks: [
      {
        oldStart: 1,
        oldLines: 1,
        newStart: 1,
        newLines: 1,
        lines: [deleteLine, addLine],
      },
    ],
  };
  return { oldContent, newContent, diff };
}

function createMockImageData(overrides?: {
  assetUrl?: string;
  mimeType?: string;
  fileSize?: number;
  svgSourceView?: boolean;
}): {
  assetUrl: string;
  mimeType: string;
  fileSize: number;
  svgSourceView?: boolean;
} {
  return {
    assetUrl: 'http://asset.localhost/assets/photo.png',
    mimeType: 'image/png',
    fileSize: 2048,
    ...overrides,
  };
}

describe('file-viewer-store', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  // ============================================================================
  // Initial State
  // ============================================================================

  describe('initial state', () => {
    it('should start with empty openTabs', () => {
      expect(useFileViewerStore.getState().openTabs).toEqual([]);
    });

    it('should start with null activeTabPath', () => {
      expect(useFileViewerStore.getState().activeTabPath).toBeNull();
    });

    it('should start with empty markdownPreview map', () => {
      expect(useFileViewerStore.getState().markdownPreview).toEqual({});
    });

    it('should start with empty cursorPositions', () => {
      expect(useFileViewerStore.getState().cursorPositions).toEqual({});
    });

    it('should start with empty history', () => {
      expect(useFileViewerStore.getState().history).toEqual([]);
      expect(useFileViewerStore.getState().historyIndex).toBe(-1);
    });

    it('should start with isLoading false', () => {
      expect(useFileViewerStore.getState().isLoading).toBe(false);
      expect(useFileViewerStore.getState().loadingPath).toBeNull();
    });

    it('should start with search closed and empty query', () => {
      expect(useFileViewerStore.getState().searchOpen).toBe(false);
      expect(useFileViewerStore.getState().searchQuery).toBe('');
    });

    it('should start with null pendingGoto', () => {
      expect(useFileViewerStore.getState().pendingGoto).toBeNull();
    });

    it('should start with wordWrap disabled', () => {
      expect(useFileViewerStore.getState().wordWrap).toBe(false);
    });
  });

  // ============================================================================
  // getLanguageFromPath Utility
  // ============================================================================

  describe('getLanguageFromPath', () => {
    it('should return typescript for .ts files', () => {
      expect(getLanguageFromPath('/src/file.ts')).toBe('typescript');
    });

    it('should return typescriptreact for .tsx files', () => {
      expect(getLanguageFromPath('/src/component.tsx')).toBe('typescriptreact');
    });

    it('should return javascript for .js files', () => {
      expect(getLanguageFromPath('/src/file.js')).toBe('javascript');
    });

    it('should return javascriptreact for .jsx files', () => {
      expect(getLanguageFromPath('/src/component.jsx')).toBe('javascriptreact');
    });

    it('should return python for .py files', () => {
      expect(getLanguageFromPath('/scripts/script.py')).toBe('python');
    });

    it('should return rust for .rs files', () => {
      expect(getLanguageFromPath('/src-tauri/main.rs')).toBe('rust');
    });

    it('should return go for .go files', () => {
      expect(getLanguageFromPath('/cmd/main.go')).toBe('go');
    });

    it('should return json for .json files', () => {
      expect(getLanguageFromPath('/package.json')).toBe('json');
    });

    it('should return yaml for .yaml and .yml files', () => {
      expect(getLanguageFromPath('/config.yaml')).toBe('yaml');
      expect(getLanguageFromPath('/config.yml')).toBe('yaml');
    });

    it('should return markdown for .md files', () => {
      expect(getLanguageFromPath('/README.md')).toBe('markdown');
    });

    it('should return css for .css files', () => {
      expect(getLanguageFromPath('/styles/main.css')).toBe('css');
    });

    it('should return scss for .scss files', () => {
      expect(getLanguageFromPath('/styles/main.scss')).toBe('scss');
    });

    it('should return bash for .sh files', () => {
      expect(getLanguageFromPath('/scripts/build.sh')).toBe('bash');
    });

    it('should return dockerfile for Dockerfile', () => {
      expect(getLanguageFromPath('/Dockerfile')).toBe('dockerfile');
    });

    it('should return makefile for Makefile', () => {
      expect(getLanguageFromPath('/Makefile')).toBe('makefile');
    });

    it('should return dotenv for .env files', () => {
      expect(getLanguageFromPath('/.env')).toBe('dotenv');
      expect(getLanguageFromPath('/.env.local')).toBe('dotenv');
      expect(getLanguageFromPath('/.env.production')).toBe('dotenv');
    });

    it('should return plaintext for unknown extensions', () => {
      expect(getLanguageFromPath('/file.unknown')).toBe('plaintext');
      expect(getLanguageFromPath('/file')).toBe('plaintext');
    });

    it('should handle case-insensitive extensions', () => {
      expect(getLanguageFromPath('/FILE.TS')).toBe('typescript');
      expect(getLanguageFromPath('/file.JSON')).toBe('json');
    });
  });

  // ============================================================================
  // openFile
  // ============================================================================

  describe('openFile', () => {
    it('should open a new file tab', () => {
      const { openFile } = useFileViewerStore.getState();

      openFile('/src/file.ts', 'const x = 1;');

      const state = useFileViewerStore.getState();
      expect(state.openTabs).toHaveLength(1);
      expect(state.openTabs[0]).toMatchObject({
        path: '/src/file.ts',
        content: 'const x = 1;',
        originalContent: 'const x = 1;',
        language: 'typescript',
        fileType: 'text',
        viewMode: 'file',
        isModified: false,
      });
      expect(state.openTabs[0]?.instanceId).toBeGreaterThan(0);
      expect(state.activeTabPath).toBe('/src/file.ts');
    });

    it('should switch to existing tab if already open', () => {
      const { openFile } = useFileViewerStore.getState();

      openFile('/src/file.ts', 'original content');
      openFile('/src/other.ts', 'other content');
      openFile('/src/file.ts'); // Switch back

      const state = useFileViewerStore.getState();
      expect(state.openTabs).toHaveLength(2);
      expect(state.activeTabPath).toBe('/src/file.ts');
    });

    it('should reset viewMode to file when reopening existing tab', () => {
      const { openFile, openFileWithDiff } = useFileViewerStore.getState();

      openFile('/src/file.ts', 'content');
      const diffData = createMockDiffData('old', 'new');
      openFileWithDiff('/src/file.ts', diffData);

      // Verify it's in diff mode
      expect(useFileViewerStore.getState().openTabs[0]?.viewMode).toBe('diff');

      // Reopen as regular file
      openFile('/src/file.ts');

      // Should be back to file mode
      expect(useFileViewerStore.getState().openTabs[0]?.viewMode).toBe('file');
    });

    it('should add to navigation history', () => {
      const { openFile } = useFileViewerStore.getState();

      openFile('/src/file1.ts');
      openFile('/src/file2.ts');
      openFile('/src/file3.ts');

      const state = useFileViewerStore.getState();
      expect(state.history).toEqual(['/src/file1.ts', '/src/file2.ts', '/src/file3.ts']);
      expect(state.historyIndex).toBe(2);
    });

    it('should not add duplicate consecutive history entries', () => {
      const { openFile } = useFileViewerStore.getState();

      openFile('/src/file.ts');
      openFile('/src/file.ts'); // Same file again

      const state = useFileViewerStore.getState();
      expect(state.history).toEqual(['/src/file.ts']);
      expect(state.historyIndex).toBe(0);
    });

    it('should open file with empty content if not provided', () => {
      const { openFile } = useFileViewerStore.getState();

      openFile('/src/file.ts');

      expect(useFileViewerStore.getState().openTabs[0]?.content).toBe('');
    });

    it('should assign a new instanceId when the same path is reopened', () => {
      const { closeTab, openFile } = useFileViewerStore.getState();

      openFile('/src/file.ts');
      const firstInstanceId = useFileViewerStore.getState().openTabs[0]?.instanceId;

      closeTab('/src/file.ts');
      openFile('/src/file.ts');
      const secondInstanceId = useFileViewerStore.getState().openTabs[0]?.instanceId;

      expect(firstInstanceId).toBeDefined();
      expect(secondInstanceId).toBeDefined();
      expect(secondInstanceId).not.toBe(firstInstanceId);
    });
  });

  // ============================================================================
  // openFileWithDiff
  // ============================================================================

  describe('openFileWithDiff', () => {
    it('should open file in diff mode', () => {
      const { openFileWithDiff } = useFileViewerStore.getState();
      const diffData = createMockDiffData('old content', 'new content');

      openFileWithDiff('/src/file.ts', diffData);

      const state = useFileViewerStore.getState();
      expect(state.openTabs).toHaveLength(1);
      expect(state.openTabs[0]).toMatchObject({
        path: '/src/file.ts',
        content: 'new content',
        viewMode: 'diff',
        diffData,
      });
      expect(state.activeTabPath).toBe('/src/file.ts');
    });

    it('should update existing tab with diff data', () => {
      const { openFile, openFileWithDiff } = useFileViewerStore.getState();

      openFile('/src/file.ts', 'content');
      const diffData = createMockDiffData('old', 'new');
      openFileWithDiff('/src/file.ts', diffData);

      const state = useFileViewerStore.getState();
      expect(state.openTabs).toHaveLength(1);
      expect(state.openTabs[0]?.viewMode).toBe('diff');
      expect(state.openTabs[0]?.diffData).toBe(diffData);
    });

    it('should use provided language or detect from path', () => {
      const { openFileWithDiff } = useFileViewerStore.getState();
      const diffData = createMockDiffData('old', 'new');

      // With explicit language
      openFileWithDiff('/src/file.unknown', diffData, 'typescript');
      expect(useFileViewerStore.getState().openTabs[0]?.language).toBe('typescript');

      // Reset and test auto-detection
      resetStore();
      openFileWithDiff('/src/file.py', diffData);
      expect(useFileViewerStore.getState().openTabs[0]?.language).toBe('python');
    });

    it('should add to navigation history', () => {
      const { openFileWithDiff } = useFileViewerStore.getState();
      const diffData = createMockDiffData('old', 'new');

      openFileWithDiff('/src/file.ts', diffData);

      expect(useFileViewerStore.getState().history).toEqual(['/src/file.ts']);
    });
  });

  // ============================================================================
  // closeTab
  // ============================================================================

  describe('closeTab', () => {
    it('should close a tab', () => {
      const { openFile, closeTab } = useFileViewerStore.getState();

      openFile('/src/file1.ts');
      openFile('/src/file2.ts');
      closeTab('/src/file1.ts');

      const state = useFileViewerStore.getState();
      expect(state.openTabs).toHaveLength(1);
      expect(state.openTabs[0]?.path).toBe('/src/file2.ts');
    });

    it('should switch to previous tab when closing active tab', () => {
      const { openFile, closeTab } = useFileViewerStore.getState();

      openFile('/src/file1.ts');
      openFile('/src/file2.ts');
      openFile('/src/file3.ts'); // Active

      closeTab('/src/file3.ts');

      expect(useFileViewerStore.getState().activeTabPath).toBe('/src/file2.ts');
    });

    it('should switch to first tab when closing first active tab', () => {
      const { openFile, closeTab, setActiveTab } = useFileViewerStore.getState();

      openFile('/src/file1.ts');
      openFile('/src/file2.ts');
      setActiveTab('/src/file1.ts');

      closeTab('/src/file1.ts');

      expect(useFileViewerStore.getState().activeTabPath).toBe('/src/file2.ts');
    });

    it('should set activeTabPath to null when closing last tab', () => {
      const { openFile, closeTab } = useFileViewerStore.getState();

      openFile('/src/file.ts');
      closeTab('/src/file.ts');

      expect(useFileViewerStore.getState().activeTabPath).toBeNull();
      expect(useFileViewerStore.getState().openTabs).toEqual([]);
    });

    it('should do nothing when closing non-existent tab', () => {
      const { openFile, closeTab } = useFileViewerStore.getState();

      openFile('/src/file.ts');
      closeTab('/src/nonexistent.ts');

      expect(useFileViewerStore.getState().openTabs).toHaveLength(1);
    });

    it('should not affect activeTabPath when closing non-active tab', () => {
      const { openFile, closeTab } = useFileViewerStore.getState();

      openFile('/src/file1.ts');
      openFile('/src/file2.ts'); // Active

      closeTab('/src/file1.ts');

      expect(useFileViewerStore.getState().activeTabPath).toBe('/src/file2.ts');
    });

    it('should clean up markdownPreview state for closed tab', () => {
      const { openFile, closeTab, toggleMarkdownPreview } = useFileViewerStore.getState();

      openFile('/src/README.md', '# docs');
      toggleMarkdownPreview('/src/README.md');
      expect(useFileViewerStore.getState().markdownPreview['/src/README.md']).toBe(true);

      closeTab('/src/README.md');

      expect(useFileViewerStore.getState().markdownPreview['/src/README.md']).toBeUndefined();
    });
  });

  // ============================================================================
  // setActiveTab
  // ============================================================================

  describe('setActiveTab', () => {
    it('should set active tab', () => {
      const { openFile, setActiveTab } = useFileViewerStore.getState();

      openFile('/src/file1.ts');
      openFile('/src/file2.ts');
      setActiveTab('/src/file1.ts');

      expect(useFileViewerStore.getState().activeTabPath).toBe('/src/file1.ts');
    });

    it('should add to navigation history', () => {
      const { openFile, setActiveTab } = useFileViewerStore.getState();

      openFile('/src/file1.ts');
      openFile('/src/file2.ts');
      setActiveTab('/src/file1.ts');

      const state = useFileViewerStore.getState();
      expect(state.history).toEqual(['/src/file1.ts', '/src/file2.ts', '/src/file1.ts']);
    });

    it('should not set active tab for non-existent path', () => {
      const { openFile, setActiveTab } = useFileViewerStore.getState();

      openFile('/src/file.ts');
      setActiveTab('/src/nonexistent.ts');

      expect(useFileViewerStore.getState().activeTabPath).toBe('/src/file.ts');
    });
  });

  // ============================================================================
  // closeAllTabs
  // ============================================================================

  describe('closeAllTabs', () => {
    it('should close all tabs and clear history', () => {
      const { openFile, closeAllTabs, toggleMarkdownPreview } = useFileViewerStore.getState();

      openFile('/src/file1.ts');
      openFile('/src/file2.ts');
      openFile('/src/file3.ts');
      toggleMarkdownPreview('/src/file2.ts');

      closeAllTabs();

      const state = useFileViewerStore.getState();
      expect(state.openTabs).toEqual([]);
      expect(state.activeTabPath).toBeNull();
      expect(state.markdownPreview).toEqual({});
      expect(state.history).toEqual([]);
      expect(state.historyIndex).toBe(-1);
    });
  });

  // ============================================================================
  // Markdown Preview
  // ============================================================================

  describe('markdown preview', () => {
    it('should toggle markdown preview for a path', () => {
      const { toggleMarkdownPreview } = useFileViewerStore.getState();

      toggleMarkdownPreview('/src/README.md');
      expect(useFileViewerStore.getState().markdownPreview['/src/README.md']).toBe(true);

      toggleMarkdownPreview('/src/README.md');
      expect(useFileViewerStore.getState().markdownPreview['/src/README.md']).toBe(false);
    });

    it('should not clear search state when toggling preview', () => {
      const { toggleSearch, setSearchQuery, toggleMarkdownPreview } = useFileViewerStore.getState();

      toggleSearch('/src/README.md');
      setSearchQuery('heading');

      toggleMarkdownPreview('/src/README.md');

      const state = useFileViewerStore.getState();
      expect(state.searchOpen).toBe(true);
      expect(state.searchQuery).toBe('heading');
      expect(state.searchTrigger?.path).toBe('/src/README.md');
    });

    it('should default to false for unopened files', () => {
      const state = useFileViewerStore.getState();
      expect(state.markdownPreview['/src/never-opened.md'] ?? false).toBe(false);
    });
  });

  // ============================================================================
  // setFileContent
  // ============================================================================

  describe('setFileContent', () => {
    it('should update content of existing tab', () => {
      const { openFile, setFileContent } = useFileViewerStore.getState();

      openFile('/src/file.ts', 'initial content');
      setFileContent('/src/file.ts', 'updated content');

      const tab = useFileViewerStore.getState().openTabs[0];
      expect(tab?.content).toBe('updated content');
      expect(tab?.originalContent).toBe('updated content');
      expect(tab?.isModified).toBe(false);
    });

    it('should create new tab if path does not exist', () => {
      const { setFileContent } = useFileViewerStore.getState();

      setFileContent('/src/file.ts', 'content');

      const state = useFileViewerStore.getState();
      expect(state.openTabs).toHaveLength(1);
      expect(state.activeTabPath).toBe('/src/file.ts');
    });

    it('should update language if provided', () => {
      const { openFile, setFileContent } = useFileViewerStore.getState();

      openFile('/src/file.unknown');
      setFileContent('/src/file.unknown', 'content', 'python');

      expect(useFileViewerStore.getState().openTabs[0]?.language).toBe('python');
    });

    it('should clear loading state', () => {
      const { setLoading, setFileContent } = useFileViewerStore.getState();

      setLoading(true, '/src/file.ts');
      setFileContent('/src/file.ts', 'content');

      const state = useFileViewerStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.loadingPath).toBeNull();
    });
  });

  // ============================================================================
  // setImageFile / updateImageData
  // ============================================================================

  describe('image tabs', () => {
    it('should update an existing tab with image metadata', () => {
      const { openFile, setImageFile } = useFileViewerStore.getState();

      openFile('/assets/photo.png');
      const tab = useFileViewerStore.getState().openTabs[0];
      expect(tab).toBeDefined();

      setImageFile('/assets/photo.png', tab?.instanceId ?? 0, createMockImageData());

      const updatedTab = useFileViewerStore.getState().openTabs[0];
      expect(updatedTab?.fileType).toBe('image');
      expect(updatedTab?.imageData).toEqual(createMockImageData());
    });

    it('should drop a stale image result when instanceId does not match', () => {
      const { openFile, setImageFile, setLoading } = useFileViewerStore.getState();

      openFile('/assets/photo.png');
      setLoading(true, '/assets/photo.png');

      setImageFile('/assets/photo.png', 999_999, createMockImageData());

      const state = useFileViewerStore.getState();
      expect(state.openTabs[0]?.fileType).toBe('text');
      expect(state.openTabs[0]?.imageData).toBeUndefined();
      expect(state.isLoading).toBe(false);
      expect(state.loadingPath).toBeNull();
    });

    it('should update image data in place', () => {
      const { openFile, setImageFile, updateImageData } = useFileViewerStore.getState();

      openFile('/assets/diagram.svg');
      const tab = useFileViewerStore.getState().openTabs[0];
      expect(tab).toBeDefined();

      setImageFile(
        '/assets/diagram.svg',
        tab?.instanceId ?? 0,
        createMockImageData({
          assetUrl: 'http://asset.localhost/assets/diagram.svg',
          mimeType: 'image/svg+xml',
          svgSourceView: false,
        })
      );

      updateImageData('/assets/diagram.svg', { svgSourceView: true });

      expect(useFileViewerStore.getState().openTabs[0]?.imageData?.svgSourceView).toBe(true);
    });
  });

  // ============================================================================
  // updateContent
  // ============================================================================

  describe('updateContent', () => {
    it('should update content and mark as modified', () => {
      const { openFile, updateContent } = useFileViewerStore.getState();

      openFile('/src/file.ts', 'original content');
      updateContent('/src/file.ts', 'modified content');

      const tab = useFileViewerStore.getState().openTabs[0];
      expect(tab?.content).toBe('modified content');
      expect(tab?.originalContent).toBe('original content'); // Unchanged
      expect(tab?.isModified).toBe(true);
    });

    it('should not mark as modified if content unchanged', () => {
      const { openFile, updateContent } = useFileViewerStore.getState();

      openFile('/src/file.ts', 'original content');
      updateContent('/src/file.ts', 'original content');

      expect(useFileViewerStore.getState().openTabs[0]?.isModified).toBe(false);
    });

    it('should mark as not modified when content returns to original', () => {
      const { openFile, updateContent } = useFileViewerStore.getState();

      openFile('/src/file.ts', 'original content');
      updateContent('/src/file.ts', 'modified content');
      updateContent('/src/file.ts', 'original content');

      expect(useFileViewerStore.getState().openTabs[0]?.isModified).toBe(false);
    });

    it('should do nothing for non-existent tab', () => {
      const { updateContent } = useFileViewerStore.getState();

      updateContent('/src/nonexistent.ts', 'content');

      expect(useFileViewerStore.getState().openTabs).toEqual([]);
    });
  });

  // ============================================================================
  // markSaved
  // ============================================================================

  describe('markSaved', () => {
    it('should mark file as not modified and update originalContent', () => {
      const { openFile, updateContent, markSaved } = useFileViewerStore.getState();

      openFile('/src/file.ts', 'original');
      updateContent('/src/file.ts', 'modified');

      expect(useFileViewerStore.getState().openTabs[0]?.isModified).toBe(true);

      markSaved('/src/file.ts');

      const tab = useFileViewerStore.getState().openTabs[0];
      expect(tab?.isModified).toBe(false);
      expect(tab?.originalContent).toBe('modified');
      expect(tab?.content).toBe('modified');
    });

    it('should do nothing for non-existent tab', () => {
      const { markSaved } = useFileViewerStore.getState();

      markSaved('/src/nonexistent.ts');

      expect(useFileViewerStore.getState().openTabs).toEqual([]);
    });
  });

  // ============================================================================
  // gotoPosition
  // ============================================================================

  describe('gotoPosition', () => {
    it('should open file and set pendingGoto', () => {
      const { gotoPosition } = useFileViewerStore.getState();

      gotoPosition('/src/file.ts', 10, 5, 'content');

      const state = useFileViewerStore.getState();
      expect(state.activeTabPath).toBe('/src/file.ts');
      expect(state.pendingGoto).toMatchObject({ line: 10, column: 5 });
      expect(state.pendingGoto?.id).toBeGreaterThan(0);
    });

    it('should generate unique IDs for each goto call', async () => {
      const { gotoPosition } = useFileViewerStore.getState();

      gotoPosition('/src/file.ts', 10, 5);
      const firstId = useFileViewerStore.getState().pendingGoto?.id;

      // Wait a millisecond to ensure different Date.now()
      await new Promise((resolve) => setTimeout(resolve, 1));

      gotoPosition('/src/file.ts', 10, 5);
      const secondId = useFileViewerStore.getState().pendingGoto?.id;

      expect(firstId).not.toBe(secondId);
    });

    it('should clear markdown preview for target path when navigating to position', () => {
      const { openFile, toggleMarkdownPreview, gotoPosition } = useFileViewerStore.getState();

      openFile('/src/README.md', '# hello');
      toggleMarkdownPreview('/src/README.md');
      expect(useFileViewerStore.getState().markdownPreview['/src/README.md']).toBe(true);

      gotoPosition('/src/README.md', 5, 2);

      expect(useFileViewerStore.getState().markdownPreview['/src/README.md']).toBeUndefined();
    });

    it('should not create markdown preview entry for non-markdown files', () => {
      const { gotoPosition } = useFileViewerStore.getState();

      gotoPosition('/src/file.ts', 2, 1, 'const x = 1;');

      expect(useFileViewerStore.getState().markdownPreview['/src/file.ts']).toBeUndefined();
    });
  });

  // ============================================================================
  // clearPendingGoto
  // ============================================================================

  describe('clearPendingGoto', () => {
    it('should clear pendingGoto', () => {
      const { gotoPosition, clearPendingGoto } = useFileViewerStore.getState();

      gotoPosition('/src/file.ts', 10, 5);
      clearPendingGoto();

      expect(useFileViewerStore.getState().pendingGoto).toBeNull();
    });
  });

  // ============================================================================
  // setCursorPosition
  // ============================================================================

  describe('setCursorPosition', () => {
    it('should set cursor position for a specific file', () => {
      const { setCursorPosition } = useFileViewerStore.getState();

      setCursorPosition('/src/file.ts', 42, 15);

      expect(useFileViewerStore.getState().cursorPositions['/src/file.ts']).toEqual({
        line: 42,
        column: 15,
      });
    });

    it('should track cursor positions independently per file (for split view)', () => {
      const { setCursorPosition } = useFileViewerStore.getState();

      setCursorPosition('/src/file1.ts', 10, 5);
      setCursorPosition('/src/file2.ts', 20, 10);

      const positions = useFileViewerStore.getState().cursorPositions;
      expect(positions['/src/file1.ts']).toEqual({ line: 10, column: 5 });
      expect(positions['/src/file2.ts']).toEqual({ line: 20, column: 10 });
    });
  });

  // ============================================================================
  // setLoading
  // ============================================================================

  describe('setLoading', () => {
    it('should set loading state with path', () => {
      const { setLoading } = useFileViewerStore.getState();

      setLoading(true, '/src/file.ts');

      const state = useFileViewerStore.getState();
      expect(state.isLoading).toBe(true);
      expect(state.loadingPath).toBe('/src/file.ts');
    });

    it('should clear loading state', () => {
      const { setLoading } = useFileViewerStore.getState();

      setLoading(true, '/src/file.ts');
      setLoading(false);

      const state = useFileViewerStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.loadingPath).toBeNull();
    });
  });

  // ============================================================================
  // Search
  // ============================================================================

  describe('search', () => {
    describe('toggleSearch', () => {
      it('should open search with file path trigger', () => {
        const { toggleSearch } = useFileViewerStore.getState();

        toggleSearch('/src/file.ts');

        const state = useFileViewerStore.getState();
        expect(state.searchOpen).toBe(true);
        expect(state.searchTrigger).toMatchObject({ path: '/src/file.ts' });
        expect(state.searchTrigger?.id).toBeGreaterThan(0);
      });

      it('should close search when toggling same file', () => {
        const { toggleSearch } = useFileViewerStore.getState();

        toggleSearch('/src/file.ts');
        expect(useFileViewerStore.getState().searchOpen).toBe(true);

        toggleSearch('/src/file.ts');
        expect(useFileViewerStore.getState().searchOpen).toBe(false);
        expect(useFileViewerStore.getState().searchTrigger).toBeNull();
      });

      it('should switch search to new file path (for split view)', () => {
        const { toggleSearch } = useFileViewerStore.getState();

        toggleSearch('/src/file1.ts');
        const firstTrigger = useFileViewerStore.getState().searchTrigger;

        toggleSearch('/src/file2.ts'); // Different file

        const state = useFileViewerStore.getState();
        expect(state.searchOpen).toBe(true);
        expect(state.searchTrigger?.path).toBe('/src/file2.ts');
        expect(state.searchTrigger?.id).not.toBe(firstTrigger?.id);
      });

      it('should clear query when closing search', () => {
        const { toggleSearch, setSearchQuery } = useFileViewerStore.getState();

        toggleSearch('/src/file.ts'); // Open
        setSearchQuery('test query');
        toggleSearch('/src/file.ts'); // Close

        expect(useFileViewerStore.getState().searchQuery).toBe('');
      });
    });

    describe('setSearchQuery', () => {
      it('should set search query', () => {
        const { setSearchQuery } = useFileViewerStore.getState();

        setSearchQuery('const x');

        expect(useFileViewerStore.getState().searchQuery).toBe('const x');
      });
    });

    describe('closeSearch', () => {
      it('should close search and clear query and trigger', () => {
        const { toggleSearch, setSearchQuery, closeSearch } = useFileViewerStore.getState();

        toggleSearch('/src/file.ts');
        setSearchQuery('test');
        closeSearch();

        const state = useFileViewerStore.getState();
        expect(state.searchOpen).toBe(false);
        expect(state.searchQuery).toBe('');
        expect(state.searchTrigger).toBeNull();
      });
    });
  });

  // ============================================================================
  // toggleWordWrap
  // ============================================================================

  describe('toggleWordWrap', () => {
    it('should toggle word wrap setting', () => {
      const { toggleWordWrap } = useFileViewerStore.getState();

      expect(useFileViewerStore.getState().wordWrap).toBe(false);

      toggleWordWrap();
      expect(useFileViewerStore.getState().wordWrap).toBe(true);

      toggleWordWrap();
      expect(useFileViewerStore.getState().wordWrap).toBe(false);
    });
  });

  // ============================================================================
  // Navigation History
  // ============================================================================

  describe('navigation history', () => {
    it('should truncate forward history when navigating from middle', () => {
      const { openFile } = useFileViewerStore.getState();

      // Build up history: file1 -> file2 -> file3
      openFile('/src/file1.ts');
      openFile('/src/file2.ts');
      openFile('/src/file3.ts');

      expect(useFileViewerStore.getState().history).toEqual([
        '/src/file1.ts',
        '/src/file2.ts',
        '/src/file3.ts',
      ]);

      // Manually adjust history index to simulate "going back"
      useFileViewerStore.setState((state) => ({ ...state, historyIndex: 1 }));

      // Now open a new file - should truncate forward history
      openFile('/src/file4.ts');

      const state = useFileViewerStore.getState();
      expect(state.history).toEqual(['/src/file1.ts', '/src/file2.ts', '/src/file4.ts']);
      expect(state.historyIndex).toBe(2);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should handle files with no extension', () => {
      const { openFile } = useFileViewerStore.getState();

      openFile('/Makefile', 'all: build');

      expect(useFileViewerStore.getState().openTabs[0]?.language).toBe('makefile');
    });

    it('should handle deeply nested paths', () => {
      const { openFile } = useFileViewerStore.getState();

      openFile('/src/components/features/auth/hooks/useAuth.ts', 'code');

      expect(useFileViewerStore.getState().openTabs[0]?.path).toBe(
        '/src/components/features/auth/hooks/useAuth.ts'
      );
    });

    it('should handle opening many tabs', () => {
      const { openFile } = useFileViewerStore.getState();

      for (let i = 0; i < 50; i++) {
        openFile(`/src/file${String(i)}.ts`, `content ${String(i)}`);
      }

      expect(useFileViewerStore.getState().openTabs).toHaveLength(50);
      expect(useFileViewerStore.getState().activeTabPath).toBe('/src/file49.ts');
    });

    it('should preserve scroll position on existing tab', () => {
      const { openFile } = useFileViewerStore.getState();

      openFile('/src/file.ts', 'content');

      // Set scroll position
      useFileViewerStore.setState((state) => {
        const tab = state.openTabs.find((t) => t.path === '/src/file.ts');
        if (tab) tab.scrollPosition = 500;
        return state;
      });

      // Open another file and come back
      openFile('/src/other.ts', 'other');
      openFile('/src/file.ts');

      expect(
        useFileViewerStore.getState().openTabs.find((t) => t.path === '/src/file.ts')
          ?.scrollPosition
      ).toBe(500);
    });
  });
});
