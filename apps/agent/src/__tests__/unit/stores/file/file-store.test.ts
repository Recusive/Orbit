/**
 * Tests for file-store.ts
 *
 * Purpose: Manages file changes tracking and file tree explorer state.
 * Uses immer with enableMapSet() for Map/Set support.
 */

import type { FileChange, FileChangeStatus, FileChangeType } from '@/stores/file/file-store';
import type { FileNode } from '@/types/protocol';

import { flattenFileTree, useFileStore } from '@/stores/file/file-store';

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
  // Use setState to reset all state fields
  useFileStore.setState({
    changedFiles: [],
    selectedFile: null,
    filterStatus: 'all',
    rootPath: null,
    treeNodes: {},
    expandedFolders: new Set<string>(),
    selectedTreePath: null,
    loadingPaths: new Set<string>(),
    errorPaths: new Map<string, string>(),
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
      expect(useFileStore.getState().changedFiles).toEqual([]);
    });

    it('should start with null selected file', () => {
      expect(useFileStore.getState().selectedFile).toBeNull();
    });

    it('should start with "all" filter status', () => {
      expect(useFileStore.getState().filterStatus).toBe('all');
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

      const change = useFileStore.getState().changedFiles[0];
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
      addFileChange(createFileChange('/src/second.ts'));

      expect(useFileStore.getState().selectedFile).toBe('/src/first.ts');
    });

    it('should update existing file instead of creating duplicate', () => {
      const { addFileChange } = useFileStore.getState();

      addFileChange(createFileChange('/src/file.ts', 'created'));
      mockTime += 1000;
      addFileChange(createFileChange('/src/file.ts', 'modified'));

      expect(useFileStore.getState().changedFiles).toHaveLength(1);
      expect(useFileStore.getState().changedFiles[0]?.type).toBe('modified');
      expect(useFileStore.getState().changedFiles[0]?.timestamp).toBe(mockTime);
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

      expect(useFileStore.getState().changedFiles[0]?.type).toBe('deleted');
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

      expect(useFileStore.getState().changedFiles[0]?.status).toBe('accepted');
    });

    it('should reject file by path', () => {
      const { addFileChange, rejectFile } = useFileStore.getState();

      addFileChange(createFileChange('/src/file.ts'));
      rejectFile('/src/file.ts');

      expect(useFileStore.getState().changedFiles[0]?.status).toBe('rejected');
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

      const statuses = useFileStore.getState().changedFiles.map((f) => f.status);
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

      const files = useFileStore.getState().changedFiles;
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

      const statuses = useFileStore.getState().changedFiles.map((f) => f.status);
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

      expect(useFileStore.getState().changedFiles).toHaveLength(0);
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

      expect(useFileStore.getState().changedFiles).toHaveLength(0);
    });

    it('should clear only files with specific status', () => {
      const { addFileChange, acceptFile, clearFiles } = useFileStore.getState();

      addFileChange(createFileChange('/src/a.ts'));
      mockTime += 1;
      addFileChange(createFileChange('/src/b.ts'));

      acceptFile('/src/a.ts');

      clearFiles('accepted');

      expect(useFileStore.getState().changedFiles).toHaveLength(1);
      expect(useFileStore.getState().changedFiles[0]?.path).toBe('/src/b.ts');
    });
  });

  // ============================================================================
  // File Changes: selectFile/setFilterStatus
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

  describe('setFilterStatus', () => {
    it('should set filter status', () => {
      const { setFilterStatus } = useFileStore.getState();

      const statuses: (FileChangeStatus | 'all')[] = ['all', 'pending', 'accepted', 'rejected'];

      statuses.forEach((status) => {
        setFilterStatus(status);
        expect(useFileStore.getState().filterStatus).toBe(status);
      });
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
});
