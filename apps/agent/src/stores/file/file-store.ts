import { createLogger } from '@orbit/common/lib';
import { enableMapSet } from 'immer';
import { useMemo } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import type { FileNode } from '@/types/protocol';

import { getParentPath } from '@/lib/utils/path-utils';

const logger = createLogger('FileStore');

/** Maximum cached sessions to prevent unbounded memory growth */
const MAX_CACHED_SESSIONS = 10;

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

/**
 * Creates a shallow copy of a dictionary while preserving the null-prototype guarantee.
 *
 * Using object spread `{ ...dict }` creates a regular object with Object.prototype,
 * which would reintroduce the prototype pollution vulnerability. This function
 * ensures copies remain safe for arbitrary string keys.
 *
 * @example
 * const copy = cloneDict(original);  // Safe copy with no prototype
 * copy['__proto__'] = value;         // Still safe
 */
function cloneDict<T>(source: Record<string, T>): Record<string, T> {
  return Object.assign(createDict<T>(), source);
}

const WINDOWS_DRIVE_ROOT_RE = /^[A-Za-z]:\/$/;

function normalizePathForMatch(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  if (normalized !== '/' && !WINDOWS_DRIVE_ROOT_RE.test(normalized)) {
    return normalized.replace(/\/+$/, '');
  }
  return normalized;
}

function normalizePathCaseFold(path: string): string {
  return normalizePathForMatch(path).toLowerCase();
}

function pathsEqual(pathA: string, pathB: string): boolean {
  if (pathA === pathB) return true;
  return normalizePathCaseFold(pathA) === normalizePathCaseFold(pathB);
}

function isDescendantPath(path: string, parentPath: string): boolean {
  const normalizedPath = normalizePathCaseFold(path);
  const normalizedParent = normalizePathCaseFold(parentPath);
  if (normalizedPath === normalizedParent) return false;

  const descendantPrefix =
    normalizedParent === '/' || WINDOWS_DRIVE_ROOT_RE.test(normalizedParent)
      ? normalizedParent
      : `${normalizedParent}/`;

  return normalizedPath.startsWith(descendantPrefix);
}

function resolveCanonicalCachedPath(path: string, cachedPaths: readonly string[]): string {
  const exactPath = cachedPaths.find((cachedPath) => cachedPath === path);
  if (exactPath !== undefined) return exactPath;

  const normalizedTarget = normalizePathCaseFold(path);
  const canonicalPath = cachedPaths.find(
    (cachedPath) => normalizePathCaseFold(cachedPath) === normalizedTarget
  );
  return canonicalPath ?? path;
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

/**
 * Cached file change data per session.
 * Used to preserve file changes when switching between conversations.
 */
interface CachedFileData {
  filesById: Record<string, FileChange>;
  pathToId: Record<string, string>;
  selectedFile: string | null;
}

export interface FileState {
  // Session tracking for per-conversation file changes
  /** Current conversation session ID */
  currentSessionId: string | null;
  /** Cache of file changes per session */
  sessionCache: Record<string, CachedFileData>;

  // File changes (refactored from array+Map to Record-based)
  /** Primary storage: file ID → FileChange object */
  filesById: Record<string, FileChange>;
  /** Index for O(1) path lookup: file path → file ID */
  pathToId: Record<string, string>;
  selectedFile: string | null;

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
  /** O(1) lookup by path */
  getFileByPath: (path: string) => FileChange | undefined;
  /** O(1) lookup by id */
  getFileById: (id: string) => FileChange | undefined;
  /**
   * Switch to a different session (conversation).
   * Saves current file changes to cache, restores new session from cache.
   */
  switchSession: (newSessionId: string) => void;
  /**
   * Clear cached file data for a deleted session.
   * Called when a conversation is deleted to prevent memory leaks.
   */
  clearSessionFiles: (sessionId: string) => void;

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
    // Session tracking
    currentSessionId: null,
    sessionCache: {},

    // File changes (refactored from array+Map to Record-based)
    filesById: createDict<FileChange>(),
    pathToId: createDict<string>(),
    selectedFile: null,

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
        // Omit 'id' from updates to prevent overwriting the file's internal id
        const safeUpdates = Object.fromEntries(
          Object.entries(updates).filter(([key]) => key !== 'id')
        );
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

    switchSession: (newSessionId: string) => {
      logger.debug(`Switching file session to: ${newSessionId}`);
      set((state) => {
        // Skip if already on this session (avoids unnecessary cache operations)
        if (state.currentSessionId === newSessionId) {
          return;
        }

        // Detect initial load (first time setting currentSessionId)
        // This handles the edge case where buffered tool events add file changes
        // before the first switchSession call (e.g., auto-start agent flow)
        const isInitialLoad = state.currentSessionId === null;
        const hasExistingFiles = Object.keys(state.filesById).length > 0;

        // Save current session's file changes to cache (if we have a current session with files)
        if (state.currentSessionId !== null) {
          if (hasExistingFiles) {
            // Use cloneDict to preserve null-prototype guarantee for safe arbitrary key handling
            state.sessionCache[state.currentSessionId] = {
              filesById: cloneDict(state.filesById),
              pathToId: cloneDict(state.pathToId),
              selectedFile: state.selectedFile,
            };

            // Evict oldest sessions to prevent unbounded memory growth.
            // Object.keys preserves insertion order for non-integer string keys.
            const cacheKeys = Object.keys(state.sessionCache);
            if (cacheKeys.length > MAX_CACHED_SESSIONS) {
              const evictCount = cacheKeys.length - MAX_CACHED_SESSIONS;
              for (const key of cacheKeys.slice(0, evictCount)) {
                Reflect.deleteProperty(state.sessionCache, key);
              }
            }
          } else {
            // No files - remove from cache if it exists (clean up empty sessions).
            // Empty sessions don't need cached state since they have nothing to restore.
            // Note: selectedFile is intentionally not preserved for empty sessions.
            Reflect.deleteProperty(state.sessionCache, state.currentSessionId);
          }
        }

        // Update current session ID
        state.currentSessionId = newSessionId;

        // Check if we have cached data for the new session
        const cached = state.sessionCache[newSessionId];
        if (cached) {
          // Restore cached session data (cloneDict preserves null-prototype guarantee)
          state.filesById = cloneDict(cached.filesById);
          state.pathToId = cloneDict(cached.pathToId);
          state.selectedFile = cached.selectedFile;
          logger.debug(`Restored ${String(Object.keys(cached.filesById).length)} files from cache`);
        } else if (isInitialLoad && hasExistingFiles) {
          // Initial load with existing files (from buffered tool events before session was set)
          // Adopt these files as belonging to the new session - don't clear them
          logger.debug(
            `Initial load: adopting ${String(Object.keys(state.filesById).length)} existing files`
          );
        } else {
          // No cached data and no existing files to adopt - start fresh
          state.filesById = createDict<FileChange>();
          state.pathToId = createDict<string>();
          state.selectedFile = null;
          logger.debug('No cached files, starting fresh');
        }
      });
    },

    clearSessionFiles: (sessionId: string) => {
      logger.debug(`Clearing file cache for deleted session: ${sessionId}`);
      set((state) => {
        Reflect.deleteProperty(state.sessionCache, sessionId);
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
        // Resolve parent path against cached tree keys to handle path case variants.
        const cachedPaths = Object.keys(state.treeNodes);
        const parentPathFromEvent = getParentPath(path) ?? state.rootPath;
        const parentPath =
          parentPathFromEvent !== null
            ? resolveCanonicalCachedPath(parentPathFromEvent, cachedPaths)
            : null;

        if (changeType === 'deleted') {
          // Remove the file/folder from its parent's children
          if (parentPath) {
            const children = state.treeNodes[parentPath];
            if (children) {
              const exactMatchChildren = children.filter((child) => child.path !== path);
              if (exactMatchChildren.length !== children.length) {
                state.treeNodes[parentPath] = exactMatchChildren;
              } else {
                state.treeNodes[parentPath] = children.filter(
                  (child) => !pathsEqual(child.path, path)
                );
              }
            }
          }

          // Recursively clean up: remove all cached children under this path
          // (handles deleted directories with expanded subfolders)
          const pathsToDelete: string[] = [];
          for (const cachedPath of cachedPaths) {
            if (pathsEqual(cachedPath, path) || isDescendantPath(cachedPath, path)) {
              pathsToDelete.push(cachedPath);
            }
          }
          for (const p of pathsToDelete) {
            Reflect.deleteProperty(state.treeNodes, p);
          }

          // Also clean up expandedFolders for this path and all subpaths
          const foldersToCollapse: string[] = [];
          for (const folder of state.expandedFolders) {
            if (pathsEqual(folder, path) || isDescendantPath(folder, path)) {
              foldersToCollapse.push(folder);
            }
          }
          for (const f of foldersToCollapse) {
            state.expandedFolders.delete(f);
          }
        } else if (changeType === 'created') {
          // Created events are refreshed asynchronously in use-file-tree.ts
          // via scheduleDirectoryRefresh() + listDirectory().
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
 * Session diff stats - total additions and deletions across all changed files.
 *
 * Used for the GitHub-style +/- indicator in the chat header.
 */
export interface SessionDiffStats {
  additions: number;
  deletions: number;
  fileCount: number;
}

/**
 * Hook to get aggregated diff stats for the current session.
 *
 * @example
 * const { additions, deletions, fileCount } = useSessionDiffStats();
 * // Display: +{additions} -{deletions}
 */
export function useSessionDiffStats(): SessionDiffStats {
  const filesById = useFileStore((state) => state.filesById);

  return useMemo(() => {
    let additions = 0;
    let deletions = 0;
    let fileCount = 0;

    for (const file of Object.values(filesById)) {
      if (file.diff) {
        additions += file.diff.additions;
        deletions += file.diff.deletions;
      }
      fileCount++;
    }

    return { additions, deletions, fileCount };
  }, [filesById]);
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
