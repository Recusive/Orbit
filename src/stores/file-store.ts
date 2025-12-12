import { enableMapSet } from 'immer';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import type { FileNode } from '@/types/protocol';

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

  // File tree actions (new)
  setRootPath: (path: string) => void;
  setTreeChildren: (path: string, children: FileNode[]) => void;
  toggleFolder: (path: string) => void;
  expandFolder: (path: string) => void;
  collapseFolder: (path: string) => void;
  selectTreePath: (path: string | null) => void;
  setLoading: (path: string, loading: boolean) => void;
  handleFileChanged: (path: string, changeType: FileChangeType) => void;
  getChildren: (path: string) => FileNode[];
  isExpanded: (path: string) => boolean;
  isLoading: (path: string) => boolean;
}

export const useFileStore = create<FileState>()(
  immer((set, get) => ({
    // File changes (existing)
    changedFiles: [],
    selectedFile: null,
    filterStatus: 'all',

    // File tree explorer (new)
    rootPath: null,
    treeNodes: {},
    expandedFolders: new Set<string>(),
    selectedTreePath: null,
    loadingPaths: new Set<string>(),

    addFileChange: (change: Omit<FileChange, 'id' | 'status' | 'timestamp'>) => {
      const random = Math.random().toString(36);
      const id = `file_${String(Date.now())}_${random.slice(2, 11)}`;

      set((state) => {
        // Check if file already exists, update it instead
        const existingFile = state.changedFiles.find(f => f.path === change.path);

        if (existingFile) {
          // Update existing file
          Object.assign(existingFile, {
            ...change,
            timestamp: Date.now(),
          });
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

        // Auto-select if it's the first file
        if (state.changedFiles.length === 1) {
          state.selectedFile = change.path;
        }
      });

      return id;
    },

    updateFileChange: (id: string, updates: Partial<FileChange>) =>
      { set((state) => {
        const file = state.changedFiles.find(f => f.id === id);
        if (file) {
          Object.assign(file, updates);
        }
      }); },

    selectFile: (path: string | null) =>
      { set((state) => {
        state.selectedFile = path;
      }); },

    acceptFile: (path: string) =>
      { set((state) => {
        const file = state.changedFiles.find(f => f.path === path);
        if (file) {
          file.status = 'accepted';
        }
      }); },

    rejectFile: (path: string) =>
      { set((state) => {
        const file = state.changedFiles.find(f => f.path === path);
        if (file) {
          file.status = 'rejected';
        }
      }); },

    acceptAllFiles: () =>
      { set((state) => {
        state.changedFiles.forEach(file => {
          if (file.status === 'pending') {
            file.status = 'accepted';
          }
        });
      }); },

    rejectAllFiles: () =>
      { set((state) => {
        state.changedFiles.forEach(file => {
          if (file.status === 'pending') {
            file.status = 'rejected';
          }
        });
      }); },

    removeFile: (path: string) =>
      { set((state) => {
        state.changedFiles = state.changedFiles.filter(f => f.path !== path);

        // Update selection if the removed file was selected
        if (state.selectedFile === path) {
          state.selectedFile = state.changedFiles[0]?.path ?? null;
        }
      }); },

    clearFiles: (status?: FileChangeStatus) =>
      { set((state) => {
        if (status) {
          state.changedFiles = state.changedFiles.filter(f => f.status !== status);
        } else {
          state.changedFiles = [];
        }

        // Update selection if it was cleared
        if (state.selectedFile && !state.changedFiles.find(f => f.path === state.selectedFile)) {
          state.selectedFile = state.changedFiles[0]?.path ?? null;
        }
      }); },

    setFilterStatus: (status: FileChangeStatus | 'all') =>
      { set((state) => {
        state.filterStatus = status;
      }); },

    // ═══════════════════════════════════════════════════════════════
    // File Tree Actions
    // ═══════════════════════════════════════════════════════════════

    setRootPath: (path: string) =>
      { set((state) => {
        state.rootPath = path;
      }); },

    setTreeChildren: (path: string, children: FileNode[]) =>
      { set((state) => {
        state.treeNodes[path] = children;
        state.loadingPaths.delete(path);
      }); },

    toggleFolder: (path: string) =>
      { set((state) => {
        if (state.expandedFolders.has(path)) {
          state.expandedFolders.delete(path);
        } else {
          state.expandedFolders.add(path);
        }
      }); },

    expandFolder: (path: string) =>
      { set((state) => {
        state.expandedFolders.add(path);
      }); },

    collapseFolder: (path: string) =>
      { set((state) => {
        state.expandedFolders.delete(path);
      }); },

    selectTreePath: (path: string | null) =>
      { set((state) => {
        state.selectedTreePath = path;
      }); },

    setLoading: (path: string, loading: boolean) =>
      { set((state) => {
        if (loading) {
          state.loadingPaths.add(path);
        } else {
          state.loadingPaths.delete(path);
        }
      }); },

    handleFileChanged: (path: string, changeType: FileChangeType) =>
      { set((state) => {
        // Find the parent directory of the changed file
        const parentPath = path.substring(0, path.lastIndexOf('/')) || state.rootPath;

        if (parentPath && changeType === 'deleted') {
          // Remove the file from its parent's children
          const children = state.treeNodes[parentPath];
          if (children) {
            state.treeNodes[parentPath] = children.filter(c => c.path !== path);
          }
          // Also remove any children if it was a directory
          // Use Reflect.deleteProperty to avoid ESLint no-dynamic-delete error
          Reflect.deleteProperty(state.treeNodes, path);
          state.expandedFolders.delete(path);
        } else if (parentPath && (changeType === 'created' || changeType === 'modified')) {
          // For created/modified, we should re-fetch the parent directory
          // The component will handle this by checking if the parent is already loaded
          // and triggering a refresh request
          // Here we just mark that the parent needs refresh by clearing its cache
          if (changeType === 'created' && state.treeNodes[parentPath]) {
            // Parent is loaded, it needs refresh - clear it to trigger reload
            Reflect.deleteProperty(state.treeNodes, parentPath);
          }
        }
      }); },

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
