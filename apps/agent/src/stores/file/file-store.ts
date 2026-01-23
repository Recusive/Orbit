import { createLogger } from '@orbit/common/lib';
import { enableMapSet } from 'immer';
import { useMemo } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import type { FileNode } from '@/types/protocol';

const logger = createLogger('FileStore');

// Enable Immer support for Map and Set
enableMapSet();

/**
 * Creates a prototype-free dictionary safe for arbitrary string keys.
 *
 * File paths can legally include keys like `__proto__` or `constructor`
 * which would collide with Object.prototype. Using Object.create(null)
 * creates an object with no prototype chain, preventing these collisions.
 *
 * @example
 * const dict = createDict<FileChange>();
 * dict['__proto__'] = someFile;  // Safe - won't pollute Object.prototype
 * '__proto__' in dict;           // true - works correctly
 */
function createDict<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

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
  // File changes (refactored from array+Map to Record-based)
  /** Primary storage: file ID → FileChange object */
  filesById: Record<string, FileChange>;
  /** Index for O(1) path lookup: file path → file ID */
  pathToId: Record<string, string>;
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
    // File changes (refactored from array+Map to Record-based)
    filesById: createDict<FileChange>(),
    pathToId: createDict<string>(),
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
      // Step 1: Check for existing file BEFORE generating new ID
      // This ensures we return the correct ID (existing or new)
      const currentState = get();
      const existingId = currentState.pathToId[change.path];
      const existingFile = existingId ? currentState.filesById[existingId] : undefined;

      // Determine what ID to use/return
      let returnId: string;

      if (existingFile) {
        // File exists - we'll update it and return its existing ID
        returnId = existingFile.id;
      } else {
        // File doesn't exist (or stale index) - generate new ID
        const random = Math.random().toString(36);
        returnId = `file_${String(Date.now())}_${random.slice(2, 11)}`;
      }

      // Step 2: Single set() call for all mutations (transaction)
      set((state) => {
        // Re-lookup inside set() to work with Immer draft
        const draftExistingId = state.pathToId[change.path];
        const draftExistingFile = draftExistingId ? state.filesById[draftExistingId] : undefined;

        if (draftExistingFile) {
          // Update existing file - preserve id and status
          draftExistingFile.type = change.type;
          draftExistingFile.timestamp = Date.now();
          if (change.diff !== undefined) draftExistingFile.diff = change.diff;
          if (change.oldContent !== undefined) draftExistingFile.oldContent = change.oldContent;
          if (change.newContent !== undefined) draftExistingFile.newContent = change.newContent;
          if (change.language !== undefined) draftExistingFile.language = change.language;
          // Note: id and status are intentionally NOT updated (preserved)
          return;
        }

        // Handle stale index: pathToId points to missing file
        // (draftExistingFile is already known to be falsy at this point)
        if (draftExistingId) {
          logger.warn(`Repairing stale pathToId entry: ${change.path} -> ${draftExistingId}`);
          Reflect.deleteProperty(state.pathToId, change.path);
        }

        // Create new file
        const newFile: FileChange = {
          ...change,
          id: returnId,
          status: 'pending',
          timestamp: Date.now(),
        };

        // Add to primary storage and index
        state.filesById[returnId] = newFile;
        state.pathToId[change.path] = returnId;

        // Auto-select if this is the first file
        const fileCount = Object.keys(state.filesById).length;
        if (fileCount === 1) {
          state.selectedFile = change.path;
        }
      });

      return returnId;
    },

    updateFileChange: (id: string, updates: Partial<FileChange>) => {
      set((state) => {
        const file = state.filesById[id];
        if (!file) {
          logger.warn(`updateFileChange: file not found for id=${id}`);
          return;
        }

        // Handle path changes specially - must update pathToId index
        if (updates.path !== undefined && updates.path !== file.path) {
          const newPath = updates.path;
          const oldPath = file.path;

          // Check if a file already exists at the new path (prevent overwrite)
          const existingIdAtNewPath = state.pathToId[newPath];
          if (existingIdAtNewPath && existingIdAtNewPath !== id) {
            logger.warn(
              `updateFileChange: cannot rename ${oldPath} to ${newPath} - ` +
                `file already exists at destination (id=${existingIdAtNewPath})`
            );
            return;
          }

          // Update pathToId index: remove old path, add new path
          Reflect.deleteProperty(state.pathToId, oldPath);
          state.pathToId[newPath] = id;

          // Update selectedFile if it pointed to the old path
          if (state.selectedFile === oldPath) {
            state.selectedFile = newPath;
          }
        }

        // Apply all updates to the file object
        // Note: Destructure out 'id' to prevent overwriting the file's id
        const { id: _, ...safeUpdates } = updates;
        void _; // Explicitly mark as intentionally unused
        Object.assign(file, safeUpdates);
      });
    },

    selectFile: (path: string | null) => {
      set((state) => {
        state.selectedFile = path;
      });
    },

    acceptFile: (path: string) => {
      set((state) => {
        // O(1) lookup: path -> id -> file
        const id = state.pathToId[path];
        if (!id) return;

        const file = state.filesById[id];
        if (!file) return;

        file.status = 'accepted';
      });
    },

    rejectFile: (path: string) => {
      set((state) => {
        // O(1) lookup: path -> id -> file
        const id = state.pathToId[path];
        if (!id) return;

        const file = state.filesById[id];
        if (!file) return;

        file.status = 'rejected';
      });
    },

    acceptAllFiles: () => {
      set((state) => {
        // Iterate all files and accept pending ones
        for (const file of Object.values(state.filesById)) {
          if (file.status === 'pending') {
            file.status = 'accepted';
          }
        }
      });
    },

    rejectAllFiles: () => {
      set((state) => {
        // Iterate all files and reject pending ones
        for (const file of Object.values(state.filesById)) {
          if (file.status === 'pending') {
            file.status = 'rejected';
          }
        }
      });
    },

    removeFile: (path: string) => {
      set((state) => {
        // Look up file ID from path index
        const id = state.pathToId[path];
        if (!id) {
          // File not found at this path - nothing to remove
          return;
        }

        // Delete from both stores (must do both for consistency)
        Reflect.deleteProperty(state.filesById, id);
        Reflect.deleteProperty(state.pathToId, path);

        // Update selection if the removed file was selected
        if (state.selectedFile === path) {
          // Pick any remaining file (no sorting needed for fallback)
          const remaining = Object.values(state.filesById)[0];
          state.selectedFile = remaining?.path ?? null;
        }
      });
    },

    clearFiles: (status?: FileChangeStatus) => {
      set((state) => {
        if (status) {
          // Remove only files matching the specified status
          for (const file of Object.values(state.filesById)) {
            if (file.status === status) {
              Reflect.deleteProperty(state.filesById, file.id);
              Reflect.deleteProperty(state.pathToId, file.path);
            }
          }
        } else {
          // Clear ALL files - use createDict() for null-prototype consistency
          state.filesById = createDict<FileChange>();
          state.pathToId = createDict<string>();
        }

        // Update selection if the selected file was removed
        if (state.selectedFile && !state.pathToId[state.selectedFile]) {
          const remaining = Object.values(state.filesById)[0];
          state.selectedFile = remaining?.path ?? null;
        }
      });
    },

    setFilterStatus: (status: FileChangeStatus | 'all') => {
      set((state) => {
        state.filterStatus = status;
      });
    },

    // O(1) lookup by path (two-step: path -> id -> file)
    getFileByPath: (path: string): FileChange | undefined => {
      const state = get();
      const id = state.pathToId[path];
      if (id === undefined) return undefined;

      const file = state.filesById[id];

      // Dev-mode assertion to catch index corruption early
      if (import.meta.env.DEV && file === undefined) {
        logger.error(
          `Index corruption: pathToId has ${path}->${id} but filesById[${id}] is missing`
        );
      }

      return file;
    },

    // O(1) lookup by id (direct Record access)
    getFileById: (id: string): FileChange | undefined => {
      return get().filesById[id];
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
// Derived Selectors for File Changes
// ═══════════════════════════════════════════════════════════════

/**
 * React hook that returns all changed files sorted by timestamp (most recent first).
 *
 * Uses `useMemo` to prevent recomputation on every render. The memoization
 * key is `filesById`, so the sorted array is only recomputed when files change.
 *
 * **BREAKING CHANGE**: Previously, files were returned in insertion order.
 * Now they are sorted by timestamp descending (most recent first).
 *
 * @example
 * const changedFiles = useChangedFiles();
 * // Returns FileChange[] sorted by timestamp descending
 */
export function useChangedFiles(): FileChange[] {
  const filesById = useFileStore((state) => state.filesById);

  return useMemo(
    () => Object.values(filesById).sort((a, b) => b.timestamp - a.timestamp),
    [filesById]
  );
}

/**
 * Non-hook version for use outside React components (tests, callbacks, event handlers).
 *
 * **WARNING**: This function does NOT memoize. Each call creates a new sorted array.
 * If calling multiple times in the same execution context, cache the result:
 *
 * @example
 * // In an event handler or callback:
 * const files = getChangedFiles();
 * files.forEach(file => processFile(file));
 *
 * // DON'T do this (creates array twice):
 * if (getChangedFiles().length > 0) {
 *   getChangedFiles().forEach(...);  // Wasteful - computes twice
 * }
 *
 * **BREAKING CHANGE**: Previously, files were returned in insertion order.
 * Now they are sorted by timestamp descending (most recent first).
 */
export function getChangedFiles(): FileChange[] {
  const { filesById } = useFileStore.getState();
  return Object.values(filesById).sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Efficient hook for getting just the count of changed files.
 *
 * More efficient than `useChangedFiles().length` because it doesn't
 * compute or sort the full array—just counts the keys.
 *
 * @example
 * const count = useChangedFilesCount();
 * // Use for badges, empty state checks, etc.
 */
export function useChangedFilesCount(): number {
  const filesById = useFileStore((state) => state.filesById);
  return Object.keys(filesById).length;
}

// ═══════════════════════════════════════════════════════════════
// File Tree Selector Hooks
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
