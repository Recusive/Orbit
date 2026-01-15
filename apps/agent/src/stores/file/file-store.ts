import { createLogger } from '@orbit/common/lib';
import { enableMapSet } from 'immer';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import type { FileNode } from '@/types/protocol';

const logger = createLogger('FileStore');

// Enable Immer support for Map and Set
enableMapSet();

export type FileChangeType = 'created' | 'modified' | 'deleted';
export type FileChangeStatus = 'pending' | 'accepted' | 'rejected';

export interface FileDiff {
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'add' | 'delete' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface FileChange {
  id: string;
  path: string;
  type: FileChangeType;
  status: FileChangeStatus;
  timestamp: number;
  diff?: FileDiff;
  oldContent?: string;
  newContent?: string;
  language?: string;
}

export interface FileState {
  // File changes (existing)
  changedFiles: FileChange[];
  /** Index for O(1) lookup by path - kept in sync with changedFiles */
  changedFilesByPath: Map<string, FileChange>;
  /** Index for O(1) lookup by id - kept in sync with changedFiles */
  changedFilesById: Map<string, FileChange>;
  selectedFile: string | null;
  filterStatus: FileChangeStatus | 'all';

  // File tree explorer (new)
  rootPath: string | null;
  /** Map of path → children nodes */
  treeNodes: Record<string, FileNode[]>;
  /** Set of expanded folder paths */
  expandedFolders: Set<string>;
  /** Currently selected path in explorer */
  selectedTreePath: string | null;
  /** Paths currently being loaded */
  loadingPaths: Set<string>;
  /** Paths that failed to load (path → error message) */
  errorPaths: Map<string, string>;

  // File change actions (existing)
  addFileChange: (change: Omit<FileChange, 'id' | 'status' | 'timestamp'>) => string;
  updateFileChange: (id: string, updates: Partial<FileChange>) => void;
  selectFile: (path: string | null) => void;
  acceptFile: (path: string) => void;
  rejectFile: (path: string) => void;
  acceptAllFiles: () => void;
  rejectAllFiles: () => void;
  removeFile: (path: string) => void;
  clearFiles: (status?: FileChangeStatus) => void;
  setFilterStatus: (status: FileChangeStatus | 'all') => void;
  /** O(1) lookup by path */
  getFileByPath: (path: string) => FileChange | undefined;
  /** O(1) lookup by id */
  getFileById: (id: string) => FileChange | undefined;

  // File tree actions (new)
  setRootPath: (path: string) => void;
  setTreeChildren: (path: string, children: FileNode[]) => void;
  toggleFolder: (path: string) => void;
  expandFolder: (path: string) => void;
  collapseFolder: (path: string) => void;
  selectTreePath: (path: string | null) => void;
  setLoading: (path: string, loading: boolean) => void;
  setError: (path: string, error: string) => void;
  clearError: (path: string) => void;
  handleFileChanged: (path: string, changeType: FileChangeType) => void;
  getChildren: (path: string) => FileNode[];
  isExpanded: (path: string) => boolean;
  isLoading: (path: string) => boolean;
}

export const useFileStore = create<FileState>()(
  immer((set, get) => ({
    // File changes (existing)
    changedFiles: [],
    changedFilesByPath: new Map<string, FileChange>(),
    changedFilesById: new Map<string, FileChange>(),
    selectedFile: null,
    filterStatus: 'all',

    // File tree explorer (new)
    rootPath: null,
    treeNodes: {},
    expandedFolders: new Set<string>(),
    selectedTreePath: null,
    loadingPaths: new Set<string>(),
    errorPaths: new Map<string, string>(),

    addFileChange: (change: Omit<FileChange, 'id' | 'status' | 'timestamp'>) => {
      const random = Math.random().toString(36);
      const id = `file_${String(Date.now())}_${random.slice(2, 11)}`;

      set((state) => {
        // O(1) lookup using Map index
        const existingFile = state.changedFilesByPath.get(change.path);

        if (existingFile) {
          // Update existing file
          Object.assign(existingFile, {
            ...change,
            timestamp: Date.now(),
          });
          // Map reference stays valid since we mutate in place
          return;
        }

        // Add new file
        const newChange: FileChange = {
          ...change,
          id,
          status: 'pending',
          timestamp: Date.now(),
        };

        state.changedFiles.push(newChange);
        // Update indices
        state.changedFilesByPath.set(change.path, newChange);
        state.changedFilesById.set(id, newChange);

        // Auto-select if it's the first file
        if (state.changedFiles.length === 1) {
          state.selectedFile = change.path;
        }
      });

      return id;
    },

    updateFileChange: (id: string, updates: Partial<FileChange>) => {
      set((state) => {
        // O(1) lookup using Map index
        const file = state.changedFilesById.get(id);
        if (file) {
          Object.assign(file, updates);
          // Map references stay valid since we mutate in place
        }
      });
    },

    selectFile: (path: string | null) => {
      set((state) => {
        state.selectedFile = path;
      });
    },

    acceptFile: (path: string) => {
      set((state) => {
        // O(1) lookup using Map index
        const file = state.changedFilesByPath.get(path);
        if (file) {
          file.status = 'accepted';
        }
      });
    },

    rejectFile: (path: string) => {
      set((state) => {
        // O(1) lookup using Map index
        const file = state.changedFilesByPath.get(path);
        if (file) {
          file.status = 'rejected';
        }
      });
    },

    acceptAllFiles: () => {
      set((state) => {
        state.changedFiles.forEach((file) => {
          if (file.status === 'pending') {
            file.status = 'accepted';
          }
        });
      });
    },

    rejectAllFiles: () => {
      set((state) => {
        state.changedFiles.forEach((file) => {
          if (file.status === 'pending') {
            file.status = 'rejected';
          }
        });
      });
    },

    removeFile: (path: string) => {
      set((state) => {
        // Get file before removing to update indices
        const file = state.changedFilesByPath.get(path);
        if (file) {
          state.changedFilesByPath.delete(path);
          state.changedFilesById.delete(file.id);
        }
        state.changedFiles = state.changedFiles.filter((f) => f.path !== path);

        // Update selection if the removed file was selected
        if (state.selectedFile === path) {
          state.selectedFile = state.changedFiles[0]?.path ?? null;
        }
      });
    },

    clearFiles: (status?: FileChangeStatus) => {
      set((state) => {
        if (status) {
          // Remove matching files from indices
          for (const file of state.changedFiles) {
            if (file.status === status) {
              state.changedFilesByPath.delete(file.path);
              state.changedFilesById.delete(file.id);
            }
          }
          state.changedFiles = state.changedFiles.filter((f) => f.status !== status);
        } else {
          state.changedFiles = [];
          state.changedFilesByPath.clear();
          state.changedFilesById.clear();
        }

        // Update selection if it was cleared - O(1) lookup using Map
        if (state.selectedFile && !state.changedFilesByPath.has(state.selectedFile)) {
          state.selectedFile = state.changedFiles[0]?.path ?? null;
        }
      });
    },

    setFilterStatus: (status: FileChangeStatus | 'all') => {
      set((state) => {
        state.filterStatus = status;
      });
    },

    // O(1) lookup by path
    getFileByPath: (path: string): FileChange | undefined => {
      return get().changedFilesByPath.get(path);
    },

    // O(1) lookup by id
    getFileById: (id: string): FileChange | undefined => {
      return get().changedFilesById.get(id);
    },

    // ═══════════════════════════════════════════════════════════════
    // File Tree Actions
    // ═══════════════════════════════════════════════════════════════

    setRootPath: (path: string) => {
      const currentRoot = get().rootPath;

      // Only update if path actually changed
      if (currentRoot === path) {
        return;
      }

      logger.info(`Root path changed: ${currentRoot ?? '(none)'} → ${path}`);

      set((state) => {
        state.rootPath = path;
        // Clear cached tree data when root changes (prevents stale data from old workspace)
        state.treeNodes = {};
        state.expandedFolders = new Set();
        state.loadingPaths = new Set();
        state.errorPaths = new Map();
        state.selectedTreePath = null;
      });
    },

    setTreeChildren: (path: string, children: FileNode[]) => {
      set((state) => {
        state.treeNodes[path] = children;
        state.loadingPaths.delete(path);
      });
    },

    toggleFolder: (path: string) => {
      set((state) => {
        if (state.expandedFolders.has(path)) {
          state.expandedFolders.delete(path);
        } else {
          state.expandedFolders.add(path);
        }
      });
    },

    expandFolder: (path: string) => {
      set((state) => {
        state.expandedFolders.add(path);
      });
    },

    collapseFolder: (path: string) => {
      set((state) => {
        state.expandedFolders.delete(path);
      });
    },

    selectTreePath: (path: string | null) => {
      set((state) => {
        state.selectedTreePath = path;
      });
    },

    setLoading: (path: string, loading: boolean) => {
      set((state) => {
        if (loading) {
          state.loadingPaths.add(path);
        } else {
          state.loadingPaths.delete(path);
        }
      });
    },

    setError: (path: string, error: string) => {
      logger.error(`File error at ${path}`, undefined, { error });
      set((state) => {
        state.errorPaths.set(path, error);
      });
    },

    clearError: (path: string) => {
      set((state) => {
        state.errorPaths.delete(path);
      });
    },

    handleFileChanged: (path: string, changeType: FileChangeType) => {
      logger.debug(`File changed: ${changeType}`, { path });
      set((state) => {
        // Find the parent directory of the changed file
        const lastSlashIndex = path.lastIndexOf('/');
        const parentPath = lastSlashIndex > 0 ? path.substring(0, lastSlashIndex) : state.rootPath;

        if (changeType === 'deleted') {
          // Remove the file/folder from its parent's children
          if (parentPath) {
            const children = state.treeNodes[parentPath];
            if (children) {
              state.treeNodes[parentPath] = children.filter((c) => c.path !== path);
            }
          }

          // Recursively clean up: remove all cached children under this path
          // (handles deleted directories with expanded subfolders)
          const pathsToDelete: string[] = [];
          for (const cachedPath of Object.keys(state.treeNodes)) {
            if (cachedPath === path || cachedPath.startsWith(`${path}/`)) {
              pathsToDelete.push(cachedPath);
            }
          }
          for (const p of pathsToDelete) {
            Reflect.deleteProperty(state.treeNodes, p);
          }

          // Also clean up expandedFolders for this path and all subpaths
          const foldersToCollapse: string[] = [];
          for (const folder of state.expandedFolders) {
            if (folder === path || folder.startsWith(`${path}/`)) {
              foldersToCollapse.push(folder);
            }
          }
          for (const f of foldersToCollapse) {
            state.expandedFolders.delete(f);
          }
        } else if (changeType === 'created') {
          // For created, clear parent's cache to trigger re-fetch
          // Only if parent is already loaded (otherwise nothing to refresh)
          if (parentPath && state.treeNodes[parentPath]) {
            Reflect.deleteProperty(state.treeNodes, parentPath);
          }
        }
        // For 'modified', we don't need to refresh the tree structure
        // (only file content changed, which is handled by file viewer)
      });
    },

    getChildren: (path: string): FileNode[] => {
      return get().treeNodes[path] ?? [];
    },

    isExpanded: (path: string): boolean => {
      return get().expandedFolders.has(path);
    },

    isLoading: (path: string): boolean => {
      return get().loadingPaths.has(path);
    },
  }))
);

// ═══════════════════════════════════════════════════════════════
// Selector Hooks
// ═══════════════════════════════════════════════════════════════

export interface FlattenedFile {
  name: string;
  path: string;
}

/**
 * Flatten the file tree into a searchable list of files (not directories)
 */
export function flattenFileTree(
  treeNodes: Record<string, FileNode[]>,
  rootPath: string | null
): FlattenedFile[] {
  const files: FlattenedFile[] = [];

  // Recursively collect all files from loaded tree nodes
  const collectFiles = (nodes: FileNode[]): void => {
    for (const node of nodes) {
      if (!node.isDirectory) {
        files.push({ name: node.name, path: node.path });
      }
      // If this directory has children loaded, recurse
      const children = treeNodes[node.path];
      if (children) {
        collectFiles(children);
      }
    }
  };

  // Start from root
  if (rootPath) {
    const rootChildren = treeNodes[rootPath];
    if (rootChildren) {
      collectFiles(rootChildren);
    }
  }

  return files;
}
