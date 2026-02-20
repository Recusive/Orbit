/**
 * Tests for file-store.ts
 *
 * Purpose: Manages file changes tracking and file tree explorer state.
 * Uses immer with enableMapSet() for Map/Set support.
 */

import type { FileChange, FileChangeType } from '@/stores/file/file-store';
import type { FileNode } from '@/types/protocol';

import { flattenFileTree, useFileStore } from '@/stores/file/file-store';

/** Local test helper — reads all changed files sorted by timestamp descending */
function getChangedFiles(): FileChange[] {
  const { filesById } = useFileStore.getState();
  return Object.values(filesById).sort((a, b) => b.timestamp - a.timestamp);
}

// Mock Date.now for consistent IDs
let mockTime = 1704067200000;
vi.spyOn(Date, 'now').mockImplementation(() => mockTime);
vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

// Helper to create a file change
function createFileChange(
  path: string,
  type: FileChangeType = 'modified',
  overrides: Partial<FileChange> = {}
): Omit<FileChange, 'id' | 'status' | 'timestamp'> {
  return {
    path,
    type,
    ...overrides,
  };
}

// Helper to create a file node matching FileNodeSchema
function createFileNode(name: string, path: string, isDirectory = false): FileNode {
  return {
    name,
    path,
    isDirectory,
    isFile: !isDirectory,
    isSymlink: false,
  };
}

/** Reset the store to initial state */
function resetStore(): void {
  // Use callback-style setState to work with Immer properly
  // This allows us to mutate the draft state, including clearing Maps/Sets
  useFileStore.setState((state) => {
    // Clear file change records (use {} in tests - paths are controlled)
    state.filesById = {};
    state.pathToId = {};
    state.selectedFile = null;
    // Clear file tree state
    state.rootPath = null;
    state.treeNodes = {};
    state.expandedFolders.clear();
    state.selectedTreePath = null;
    state.loadingPaths.clear();
    state.errorPaths.clear();
  });
}

describe('file-store', () => {
  beforeEach(() => {
    resetStore();
    mockTime = 1704067200000;
    vi.clearAllMocks();
  });

  // ============================================================================
  // Initial State
  // ============================================================================

  describe('initial state', () => {
    it('should start with empty changed files', () => {
      expect(getChangedFiles()).toEqual([]);
    });

    it('should start with null selected file', () => {
      expect(useFileStore.getState().selectedFile).toBeNull();
    });

    it('should start with null root path', () => {
      expect(useFileStore.getState().rootPath).toBeNull();
    });

    it('should start with empty tree nodes', () => {
      expect(useFileStore.getState().treeNodes).toEqual({});
    });

    it('should start with empty expanded folders', () => {
      expect(useFileStore.getState().expandedFolders.size).toBe(0);
    });
  });

  // ============================================================================
  // File Changes: addFileChange
  // ============================================================================

  describe('addFileChange', () => {
    it('should add a new file change with generated id and timestamp', () => {
      const { addFileChange } = useFileStore.getState();

      const id = addFileChange(createFileChange('/src/file.ts', 'modified'));

      expect(id).toMatch(/^file_\d+_[a-z0-9]+$/);

      const change = getChangedFiles()[0];
      expect(change).toBeDefined();
      if (change) {
        expect(change.path).toBe('/src/file.ts');
        expect(change.type).toBe('modified');
        expect(change.status).toBe('pending');
        expect(change.timestamp).toBe(mockTime);
      }
    });

    it('should auto-select first file added', () => {
      const { addFileChange } = useFileStore.getState();

      addFileChange(createFileChange('/src/file.ts'));

      expect(useFileStore.getState().selectedFile).toBe('/src/file.ts');
    });

    it('should NOT auto-select if other files exist', () => {
      const { addFileChange } = useFileStore.getState();

      addFileChange(createFileChange('/src/first.ts'));
      mockTime += 1; // Ensure unique ID for second file
      addFileChange(createFileChange('/src/second.ts'));

      expect(useFileStore.getState().selectedFile).toBe('/src/first.ts');
    });

    it('should update existing file instead of creating duplicate', () => {
      const { addFileChange } = useFileStore.getState();

      addFileChange(createFileChange('/src/file.ts', 'created'));
      mockTime += 1000;
      addFileChange(createFileChange('/src/file.ts', 'modified'));

      expect(getChangedFiles()).toHaveLength(1);
      expect(getChangedFiles()[0]?.type).toBe('modified');
      expect(getChangedFiles()[0]?.timestamp).toBe(mockTime);
    });
  });

  // ============================================================================
  // File Changes: updateFileChange
  // ============================================================================

  describe('updateFileChange', () => {
    it('should update file change by id', () => {
      const { addFileChange, updateFileChange } = useFileStore.getState();

      const id = addFileChange(createFileChange('/src/file.ts'));
      updateFileChange(id, { type: 'deleted' });

      expect(getChangedFiles()[0]?.type).toBe('deleted');
    });

    it('should be safe for non-existent id', () => {
      const { updateFileChange } = useFileStore.getState();

      expect(() => {
        updateFileChange('non-existent', { type: 'deleted' });
      }).not.toThrow();
    });
  });

  // ============================================================================
  // File Changes: Accept/Reject
  // ============================================================================

  describe('acceptFile/rejectFile', () => {
    it('should accept file by path', () => {
      const { addFileChange, acceptFile } = useFileStore.getState();

      addFileChange(createFileChange('/src/file.ts'));
      acceptFile('/src/file.ts');

      expect(getChangedFiles()[0]?.status).toBe('accepted');
    });

    it('should reject file by path', () => {
      const { addFileChange, rejectFile } = useFileStore.getState();

      addFileChange(createFileChange('/src/file.ts'));
      rejectFile('/src/file.ts');

      expect(getChangedFiles()[0]?.status).toBe('rejected');
    });
  });

  describe('acceptAllFiles/rejectAllFiles', () => {
    it('should accept all pending files', () => {
      const { addFileChange, acceptAllFiles } = useFileStore.getState();

      addFileChange(createFileChange('/src/a.ts'));
      mockTime += 1;
      addFileChange(createFileChange('/src/b.ts'));
      mockTime += 1;
      addFileChange(createFileChange('/src/c.ts'));

      acceptAllFiles();

      const statuses = getChangedFiles().map((f) => f.status);
      expect(statuses).toEqual(['accepted', 'accepted', 'accepted']);
    });

    it('should only accept pending files (not already accepted/rejected)', () => {
      const { addFileChange, acceptFile, rejectFile, acceptAllFiles } = useFileStore.getState();

      addFileChange(createFileChange('/src/a.ts'));
      mockTime += 1;
      addFileChange(createFileChange('/src/b.ts'));
      mockTime += 1;
      addFileChange(createFileChange('/src/c.ts'));

      acceptFile('/src/a.ts');
      rejectFile('/src/b.ts');

      acceptAllFiles();

      const files = getChangedFiles();
      expect(files.find((f) => f.path === '/src/a.ts')?.status).toBe('accepted');
      expect(files.find((f) => f.path === '/src/b.ts')?.status).toBe('rejected'); // Unchanged
      expect(files.find((f) => f.path === '/src/c.ts')?.status).toBe('accepted');
    });

    it('should reject all pending files', () => {
      const { addFileChange, rejectAllFiles } = useFileStore.getState();

      addFileChange(createFileChange('/src/a.ts'));
      mockTime += 1;
      addFileChange(createFileChange('/src/b.ts'));

      rejectAllFiles();

      const statuses = getChangedFiles().map((f) => f.status);
      expect(statuses).toEqual(['rejected', 'rejected']);
    });
  });

  // ============================================================================
  // File Changes: removeFile/clearFiles
  // ============================================================================

  describe('removeFile', () => {
    it('should remove file by path', () => {
      const { addFileChange, removeFile } = useFileStore.getState();

      addFileChange(createFileChange('/src/file.ts'));
      removeFile('/src/file.ts');

      expect(getChangedFiles()).toHaveLength(0);
    });

    it('should update selection to next file', () => {
      const { addFileChange, removeFile } = useFileStore.getState();

      addFileChange(createFileChange('/src/a.ts'));
      mockTime += 1;
      addFileChange(createFileChange('/src/b.ts'));

      removeFile('/src/a.ts');

      expect(useFileStore.getState().selectedFile).toBe('/src/b.ts');
    });

    it('should clear selection if no files remain', () => {
      const { addFileChange, removeFile } = useFileStore.getState();

      addFileChange(createFileChange('/src/file.ts'));
      removeFile('/src/file.ts');

      expect(useFileStore.getState().selectedFile).toBeNull();
    });
  });

  describe('clearFiles', () => {
    it('should clear all files when no status specified', () => {
      const { addFileChange, clearFiles } = useFileStore.getState();

      addFileChange(createFileChange('/src/a.ts'));
      mockTime += 1;
      addFileChange(createFileChange('/src/b.ts'));

      clearFiles();

      expect(getChangedFiles()).toHaveLength(0);
    });

    it('should clear only files with specific status', () => {
      const { addFileChange, acceptFile, clearFiles } = useFileStore.getState();

      addFileChange(createFileChange('/src/a.ts'));
      mockTime += 1;
      addFileChange(createFileChange('/src/b.ts'));

      acceptFile('/src/a.ts');

      clearFiles('accepted');

      expect(getChangedFiles()).toHaveLength(1);
      expect(getChangedFiles()[0]?.path).toBe('/src/b.ts');
    });
  });

  // ============================================================================
  // File Changes: selectFile
  // ============================================================================

  describe('selectFile', () => {
    it('should select file by path', () => {
      const { selectFile } = useFileStore.getState();

      selectFile('/src/file.ts');

      expect(useFileStore.getState().selectedFile).toBe('/src/file.ts');
    });

    it('should allow null selection', () => {
      const { selectFile } = useFileStore.getState();

      selectFile('/src/file.ts');
      selectFile(null);

      expect(useFileStore.getState().selectedFile).toBeNull();
    });
  });

  // ============================================================================
  // File Tree: setRootPath
  // ============================================================================

  describe('setRootPath', () => {
    it('should set root path', () => {
      const { setRootPath } = useFileStore.getState();

      setRootPath('/workspace');

      expect(useFileStore.getState().rootPath).toBe('/workspace');
    });

    it('should clear tree data when root changes', () => {
      const { setRootPath, setTreeChildren, expandFolder } = useFileStore.getState();

      setRootPath('/workspace1');
      setTreeChildren('/workspace1', [createFileNode('file.ts', '/workspace1/file.ts')]);
      expandFolder('/workspace1');

      // Change root
      setRootPath('/workspace2');

      expect(useFileStore.getState().treeNodes).toEqual({});
      expect(useFileStore.getState().expandedFolders.size).toBe(0);
    });

    it('should not clear data if path unchanged', () => {
      const { setRootPath, setTreeChildren } = useFileStore.getState();

      setRootPath('/workspace');
      setTreeChildren('/workspace', [createFileNode('file.ts', '/workspace/file.ts')]);

      // Same path
      setRootPath('/workspace');

      expect(Object.keys(useFileStore.getState().treeNodes)).toHaveLength(1);
    });
  });

  // ============================================================================
  // File Tree: Tree Node Management
  // ============================================================================

  describe('setTreeChildren', () => {
    it('should set children for a path', () => {
      const { setTreeChildren } = useFileStore.getState();

      const children = [createFileNode('a.ts', '/src/a.ts'), createFileNode('b.ts', '/src/b.ts')];

      setTreeChildren('/src', children);

      expect(useFileStore.getState().treeNodes['/src']).toEqual(children);
    });

    it('should clear loading state for path', () => {
      const { setLoading, setTreeChildren } = useFileStore.getState();

      setLoading('/src', true);
      setTreeChildren('/src', []);

      expect(useFileStore.getState().loadingPaths.has('/src')).toBe(false);
    });
  });

  describe('toggleFolder/expandFolder/collapseFolder', () => {
    it('toggleFolder should toggle expansion state', () => {
      const { toggleFolder } = useFileStore.getState();

      toggleFolder('/src');
      expect(useFileStore.getState().expandedFolders.has('/src')).toBe(true);

      toggleFolder('/src');
      expect(useFileStore.getState().expandedFolders.has('/src')).toBe(false);
    });

    it('expandFolder should add to expanded set', () => {
      const { expandFolder } = useFileStore.getState();

      expandFolder('/src');
      expandFolder('/src/components');

      expect(useFileStore.getState().expandedFolders.has('/src')).toBe(true);
      expect(useFileStore.getState().expandedFolders.has('/src/components')).toBe(true);
    });

    it('collapseFolder should remove from expanded set', () => {
      const { expandFolder, collapseFolder } = useFileStore.getState();

      expandFolder('/src');
      collapseFolder('/src');

      expect(useFileStore.getState().expandedFolders.has('/src')).toBe(false);
    });
  });

  // ============================================================================
  // File Tree: Loading/Error States
  // ============================================================================

  describe('setLoading', () => {
    it('should track loading paths', () => {
      const { setLoading, isLoading } = useFileStore.getState();

      setLoading('/src', true);
      expect(isLoading('/src')).toBe(true);

      setLoading('/src', false);
      expect(isLoading('/src')).toBe(false);
    });
  });

  describe('setError/clearError', () => {
    it('should track error paths', () => {
      const { setError, clearError } = useFileStore.getState();

      setError('/src', 'Permission denied');
      expect(useFileStore.getState().errorPaths.get('/src')).toBe('Permission denied');

      clearError('/src');
      expect(useFileStore.getState().errorPaths.has('/src')).toBe(false);
    });
  });

  // ============================================================================
  // File Tree: handleFileChanged
  // ============================================================================

  describe('handleFileChanged', () => {
    it('should remove deleted file from parent children', () => {
      const { setRootPath, setTreeChildren, handleFileChanged } = useFileStore.getState();

      setRootPath('/workspace');
      setTreeChildren('/workspace/src', [
        createFileNode('a.ts', '/workspace/src/a.ts'),
        createFileNode('b.ts', '/workspace/src/b.ts'),
      ]);

      handleFileChanged('/workspace/src/a.ts', 'deleted');

      const children = useFileStore.getState().treeNodes['/workspace/src'];
      expect(children).toHaveLength(1);
      expect(children?.[0]?.path).toBe('/workspace/src/b.ts');
    });

    it('should recursively clean up deleted directory', () => {
      const { setRootPath, setTreeChildren, expandFolder, handleFileChanged } =
        useFileStore.getState();

      setRootPath('/workspace');
      setTreeChildren('/workspace/src', [
        createFileNode('components', '/workspace/src/components', true),
      ]);
      setTreeChildren('/workspace/src/components', [
        createFileNode('Button.tsx', '/workspace/src/components/Button.tsx'),
      ]);
      expandFolder('/workspace/src/components');

      handleFileChanged('/workspace/src/components', 'deleted');

      // Both the directory and its children should be cleaned up
      expect(useFileStore.getState().treeNodes['/workspace/src/components']).toBeUndefined();
      expect(useFileStore.getState().expandedFolders.has('/workspace/src/components')).toBe(false);
    });

    it('should invalidate parent cache for created file', () => {
      const { setRootPath, setTreeChildren, handleFileChanged } = useFileStore.getState();

      setRootPath('/workspace');
      setTreeChildren('/workspace/src', [createFileNode('a.ts', '/workspace/src/a.ts')]);

      handleFileChanged('/workspace/src/b.ts', 'created');

      // Parent cache should be cleared to trigger re-fetch
      expect(useFileStore.getState().treeNodes['/workspace/src']).toBeUndefined();
    });
  });

  // ============================================================================
  // File Tree: Getters
  // ============================================================================

  describe('getChildren/isExpanded/isLoading', () => {
    it('getChildren should return empty array for unknown path', () => {
      const { getChildren } = useFileStore.getState();
      expect(getChildren('/unknown')).toEqual([]);
    });

    it('getChildren should return cached children', () => {
      const { setTreeChildren, getChildren } = useFileStore.getState();

      const children = [createFileNode('file.ts', '/src/file.ts')];
      setTreeChildren('/src', children);

      expect(getChildren('/src')).toEqual(children);
    });

    it('isExpanded should return correct state', () => {
      const { expandFolder, isExpanded } = useFileStore.getState();

      expect(isExpanded('/src')).toBe(false);
      expandFolder('/src');
      expect(isExpanded('/src')).toBe(true);
    });
  });

  // ============================================================================
  // flattenFileTree utility
  // ============================================================================

  describe('flattenFileTree', () => {
    it('should return empty array for null root', () => {
      const result = flattenFileTree({}, null);
      expect(result).toEqual([]);
    });

    it('should return empty array for unloaded root', () => {
      const result = flattenFileTree({}, '/workspace');
      expect(result).toEqual([]);
    });

    it('should flatten file tree into searchable list', () => {
      const treeNodes: Record<string, FileNode[]> = {
        '/workspace': [
          createFileNode('src', '/workspace/src', true),
          createFileNode('README.md', '/workspace/README.md'),
        ],
        '/workspace/src': [
          createFileNode('index.ts', '/workspace/src/index.ts'),
          createFileNode('utils', '/workspace/src/utils', true),
        ],
        '/workspace/src/utils': [createFileNode('helpers.ts', '/workspace/src/utils/helpers.ts')],
      };

      const result = flattenFileTree(treeNodes, '/workspace');

      // Should only include files, not directories
      // Order follows depth-first traversal: directories are recursed before moving to next sibling
      expect(result).toEqual([
        { name: 'index.ts', path: '/workspace/src/index.ts' },
        { name: 'helpers.ts', path: '/workspace/src/utils/helpers.ts' },
        { name: 'README.md', path: '/workspace/README.md' },
      ]);
    });
  });

  // ============================================================================
  // O(1) Lookups (Record-based storage)
  // ============================================================================

  describe('O(1) lookups', () => {
    describe('getFileByPath', () => {
      it('should return file when found', () => {
        const { addFileChange, getFileByPath } = useFileStore.getState();

        addFileChange(createFileChange('/src/app.ts', 'modified'));

        const file = getFileByPath('/src/app.ts');
        expect(file).toBeDefined();
        expect(file?.path).toBe('/src/app.ts');
        expect(file?.type).toBe('modified');
      });

      it('should return undefined when not found', () => {
        const { getFileByPath } = useFileStore.getState();

        const file = getFileByPath('/nonexistent/path.ts');
        expect(file).toBeUndefined();
      });

      it('should return correct file among multiple', () => {
        const { addFileChange, getFileByPath } = useFileStore.getState();

        addFileChange(createFileChange('/src/a.ts', 'created'));
        mockTime += 1;
        addFileChange(createFileChange('/src/b.ts', 'modified'));
        mockTime += 1;
        addFileChange(createFileChange('/src/c.ts', 'deleted'));

        const file = getFileByPath('/src/b.ts');
        expect(file?.path).toBe('/src/b.ts');
        expect(file?.type).toBe('modified');
      });
    });

    describe('getFileById', () => {
      it('should return file when found', () => {
        const { addFileChange, getFileById } = useFileStore.getState();

        const id = addFileChange(createFileChange('/src/app.ts', 'modified'));

        const file = getFileById(id);
        expect(file).toBeDefined();
        expect(file?.id).toBe(id);
        expect(file?.path).toBe('/src/app.ts');
      });

      it('should return undefined when not found', () => {
        const { getFileById } = useFileStore.getState();

        const file = getFileById('nonexistent_id');
        expect(file).toBeUndefined();
      });

      it('should return correct file among multiple', () => {
        const { addFileChange, getFileById } = useFileStore.getState();

        addFileChange(createFileChange('/src/a.ts'));
        mockTime += 1;
        const targetId = addFileChange(createFileChange('/src/b.ts', 'modified'));
        mockTime += 1;
        addFileChange(createFileChange('/src/c.ts'));

        const file = getFileById(targetId);
        expect(file?.id).toBe(targetId);
        expect(file?.path).toBe('/src/b.ts');
        expect(file?.type).toBe('modified');
      });
    });
  });

  // ============================================================================
  // Mutation Propagation (Record -> Derived Array)
  // ============================================================================

  describe('mutation propagation', () => {
    it('should propagate status change to both lookup and derived array', () => {
      const { addFileChange, acceptFile, getFileByPath } = useFileStore.getState();

      addFileChange(createFileChange('/src/app.ts'));

      // Mutate via acceptFile
      acceptFile('/src/app.ts');

      // Verify via O(1) lookup
      const fileByPath = getFileByPath('/src/app.ts');
      expect(fileByPath?.status).toBe('accepted');

      // Verify via derived array
      const files = getChangedFiles();
      const fileInArray = files.find((f) => f.path === '/src/app.ts');
      expect(fileInArray?.status).toBe('accepted');
    });

    it('should propagate reject status to both lookup and derived array', () => {
      const { addFileChange, rejectFile, getFileByPath } = useFileStore.getState();

      addFileChange(createFileChange('/src/app.ts'));

      rejectFile('/src/app.ts');

      // Verify via O(1) lookup
      expect(getFileByPath('/src/app.ts')?.status).toBe('rejected');

      // Verify via derived array
      const files = getChangedFiles();
      expect(files.find((f) => f.path === '/src/app.ts')?.status).toBe('rejected');
    });

    it('should propagate bulk accept to all files', () => {
      const { addFileChange, acceptAllFiles, getFileByPath } = useFileStore.getState();

      addFileChange(createFileChange('/src/a.ts'));
      mockTime += 1;
      addFileChange(createFileChange('/src/b.ts'));
      mockTime += 1;
      addFileChange(createFileChange('/src/c.ts'));

      acceptAllFiles();

      // Verify via lookups
      expect(getFileByPath('/src/a.ts')?.status).toBe('accepted');
      expect(getFileByPath('/src/b.ts')?.status).toBe('accepted');
      expect(getFileByPath('/src/c.ts')?.status).toBe('accepted');

      // Verify via derived array
      const files = getChangedFiles();
      expect(files.every((f) => f.status === 'accepted')).toBe(true);
    });

    it('should propagate updateFileChange to both lookup and derived array', () => {
      const { addFileChange, updateFileChange, getFileById } = useFileStore.getState();

      const id = addFileChange(createFileChange('/src/app.ts', 'created'));

      updateFileChange(id, { type: 'modified', newContent: 'updated content' });

      // Verify via O(1) lookup
      const file = getFileById(id);
      expect(file?.type).toBe('modified');
      expect(file?.newContent).toBe('updated content');

      // Verify via derived array
      const files = getChangedFiles();
      const fileInArray = files.find((f) => f.id === id);
      expect(fileInArray?.type).toBe('modified');
      expect(fileInArray?.newContent).toBe('updated content');
    });
  });

  // ============================================================================
  // addFileChange ID Handling
  // ============================================================================

  describe('addFileChange ID handling', () => {
    it('should return existing ID when updating same path', () => {
      const { addFileChange } = useFileStore.getState();

      const firstId = addFileChange(createFileChange('/src/app.ts', 'created'));
      mockTime += 1000;
      const secondId = addFileChange(createFileChange('/src/app.ts', 'modified'));

      // Should return the SAME id, not a new one
      expect(secondId).toBe(firstId);
    });

    it('should preserve status when updating existing file', () => {
      const { addFileChange, acceptFile, getFileByPath } = useFileStore.getState();

      addFileChange(createFileChange('/src/app.ts', 'created'));
      acceptFile('/src/app.ts');

      // Verify status is 'accepted'
      expect(getFileByPath('/src/app.ts')?.status).toBe('accepted');

      // Update the file (simulates another write to same path)
      mockTime += 1000;
      addFileChange(createFileChange('/src/app.ts', 'modified'));

      // Status should still be 'accepted' (preserved)
      const file = getFileByPath('/src/app.ts');
      expect(file?.status).toBe('accepted');
      expect(file?.type).toBe('modified'); // But type is updated
    });

    it('should generate unique IDs for different paths', () => {
      const { addFileChange } = useFileStore.getState();

      const id1 = addFileChange(createFileChange('/src/a.ts'));
      mockTime += 1; // Ensure unique timestamp
      const id2 = addFileChange(createFileChange('/src/b.ts'));
      mockTime += 1;
      const id3 = addFileChange(createFileChange('/src/c.ts'));

      // All IDs should be different
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('should update timestamp when updating existing file', () => {
      const { addFileChange, getFileByPath } = useFileStore.getState();

      addFileChange(createFileChange('/src/app.ts'));
      const originalTime = mockTime;

      mockTime += 5000; // 5 seconds later
      addFileChange(createFileChange('/src/app.ts', 'modified'));

      const file = getFileByPath('/src/app.ts');
      expect(file?.timestamp).toBe(originalTime + 5000);
    });
  });

  // ============================================================================
  // updateFileChange Path Change (pathToId Maintenance)
  // ============================================================================

  describe('updateFileChange path change', () => {
    it('should update pathToId index when path changes', () => {
      const { addFileChange, updateFileChange, getFileByPath, getFileById } =
        useFileStore.getState();

      const id = addFileChange(createFileChange('/src/old.ts'));

      // Rename the file
      updateFileChange(id, { path: '/src/new.ts' });

      // Old path should no longer find the file
      expect(getFileByPath('/src/old.ts')).toBeUndefined();

      // New path should find the file with same ID
      const file = getFileByPath('/src/new.ts');
      expect(file).toBeDefined();
      expect(file?.id).toBe(id);

      // ID lookup should still work
      expect(getFileById(id)?.path).toBe('/src/new.ts');
    });

    it('should update selectedFile when renamed file was selected', () => {
      const { addFileChange, updateFileChange, selectFile } = useFileStore.getState();

      const id = addFileChange(createFileChange('/src/old.ts'));
      selectFile('/src/old.ts');

      expect(useFileStore.getState().selectedFile).toBe('/src/old.ts');

      // Rename the file
      updateFileChange(id, { path: '/src/new.ts' });

      // selectedFile should be updated to new path
      expect(useFileStore.getState().selectedFile).toBe('/src/new.ts');
    });

    it('should not update selectedFile when non-selected file is renamed', () => {
      const { addFileChange, updateFileChange, selectFile } = useFileStore.getState();

      addFileChange(createFileChange('/src/selected.ts'));
      mockTime += 1;
      const id2 = addFileChange(createFileChange('/src/other.ts'));

      selectFile('/src/selected.ts');

      // Rename the non-selected file
      updateFileChange(id2, { path: '/src/renamed.ts' });

      // selectedFile should remain unchanged
      expect(useFileStore.getState().selectedFile).toBe('/src/selected.ts');
    });

    it('should block rename if target path already exists', () => {
      const { addFileChange, updateFileChange, getFileByPath } = useFileStore.getState();

      const idA = addFileChange(createFileChange('/src/a.ts', 'created'));
      mockTime += 1;
      addFileChange(createFileChange('/src/b.ts', 'modified'));

      // Try to rename /src/a.ts to /src/b.ts (which exists)
      updateFileChange(idA, { path: '/src/b.ts' });

      // /src/a.ts should still exist at original path
      const fileA = getFileByPath('/src/a.ts');
      expect(fileA).toBeDefined();
      expect(fileA?.id).toBe(idA);
      expect(fileA?.type).toBe('created'); // Unchanged

      // /src/b.ts should still be the original file at that path
      const fileB = getFileByPath('/src/b.ts');
      expect(fileB?.type).toBe('modified');
    });
  });

  // ============================================================================
  // Stale Index Repair
  // ============================================================================

  describe('stale index repair', () => {
    it('should repair stale pathToId entry when adding file', () => {
      const { addFileChange, getFileByPath, getFileById } = useFileStore.getState();

      // Manually corrupt the pathToId index (simulates bug or crash)
      useFileStore.setState((state) => {
        state.pathToId['/src/stale.ts'] = 'nonexistent_id_12345';
      });

      // Verify corruption exists
      expect(useFileStore.getState().pathToId['/src/stale.ts']).toBe('nonexistent_id_12345');

      // Add a file at the same path - should repair the index
      const newId = addFileChange(createFileChange('/src/stale.ts', 'created'));

      // File should be accessible via path lookup
      const file = getFileByPath('/src/stale.ts');
      expect(file).toBeDefined();
      expect(file?.id).toBe(newId);
      expect(file?.type).toBe('created');

      // File should be accessible via ID lookup
      expect(getFileById(newId)).toBeDefined();

      // pathToId should now point to the new ID, not the stale one
      expect(useFileStore.getState().pathToId['/src/stale.ts']).toBe(newId);
    });
  });

  // ============================================================================
  // Derived Array Ordering (Timestamp Descending)
  // ============================================================================

  describe('derived array ordering', () => {
    it('should return files sorted by timestamp descending (newest first)', () => {
      const { addFileChange } = useFileStore.getState();

      // Add files with increasing timestamps
      addFileChange(createFileChange('/src/oldest.ts'));
      mockTime += 1000;
      addFileChange(createFileChange('/src/middle.ts'));
      mockTime += 1000;
      addFileChange(createFileChange('/src/newest.ts'));

      const files = getChangedFiles();

      // Should be ordered: newest, middle, oldest
      expect(files).toHaveLength(3);
      expect(files[0]?.path).toBe('/src/newest.ts');
      expect(files[1]?.path).toBe('/src/middle.ts');
      expect(files[2]?.path).toBe('/src/oldest.ts');
    });

    it('should maintain order after updates', () => {
      const { addFileChange } = useFileStore.getState();

      addFileChange(createFileChange('/src/first.ts'));
      mockTime += 1000;
      addFileChange(createFileChange('/src/second.ts'));
      mockTime += 1000;

      // Update the first file (changes its timestamp to newest)
      addFileChange(createFileChange('/src/first.ts', 'modified'));

      const files = getChangedFiles();

      // first.ts should now be first because it was updated most recently
      expect(files[0]?.path).toBe('/src/first.ts');
      expect(files[1]?.path).toBe('/src/second.ts');
    });

    it('should handle files with same timestamp consistently', () => {
      const { addFileChange } = useFileStore.getState();

      // Add multiple files with same timestamp (edge case)
      addFileChange(createFileChange('/src/a.ts'));
      // Don't increment mockTime - same timestamp
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // Different random for unique ID
      addFileChange(createFileChange('/src/b.ts'));
      vi.spyOn(Math, 'random').mockReturnValue(0.7);
      addFileChange(createFileChange('/src/c.ts'));

      const files = getChangedFiles();

      // All files should be present (order may vary with same timestamp)
      expect(files).toHaveLength(3);
      expect(files.map((f) => f.path).sort()).toEqual(['/src/a.ts', '/src/b.ts', '/src/c.ts']);

      // Reset mock for other tests
      vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
    });
  });
});
