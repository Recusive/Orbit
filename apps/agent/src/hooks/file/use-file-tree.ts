import { useCallback, useEffect, useRef } from 'react';

import type { ExtensionMessage, FileNode } from '@/types/protocol';

import { useTauri } from '@/hooks/agent/use-tauri';
import { lspDidOpen } from '@/lib/api/backend';
import { useFileStore } from '@/stores/file/file-store';
import { useFileViewerStore, getLanguageFromPath } from '@/stores/file/file-viewer-store';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface UseFileTreeOptions {
  /** Whether to automatically request root children on mount (default: true) */
  autoLoad?: boolean;
  /** Debug mode for logging (default: false) */
  debug?: boolean;
}

export interface UseFileTreeResult {
  /** Root path of the file tree */
  rootPath: string | null;
  /** Children of the root path */
  rootChildren: readonly FileNode[];
  /** Whether the root is currently loading */
  isRootLoading: boolean;
  /** Error message if root failed to load */
  rootError: string | null;
  /** Refresh the entire tree (clears cache and re-fetches) */
  refresh: () => void;
  /** Toggle folder expansion (auto-fetches children if needed) */
  toggleFolder: (path: string) => void;
  /** Open a file in the file viewer */
  openFile: (path: string) => void;
  /** Retry loading a failed folder */
  retryFolder: (path: string) => void;
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

/** Request timeout in ms - if no response, mark as error */
const REQUEST_TIMEOUT_MS = 30000;

/** Stable empty array reference for selectors (prevents re-renders) */
const EMPTY_CHILDREN: readonly FileNode[] = [];

// ═══════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════

/**
 * Hook to manage file tree orchestration.
 *
 * This hook handles:
 * - Initial tree loading
 * - Message routing (tree responses, file changes, file content)
 * - Request timeout handling
 * - Cache invalidation from file watcher
 *
 * Individual tree items should use `useFileTreeItem` for their state
 * to avoid cascading re-renders.
 *
 * @example
 * ```tsx
 * function FileExplorer() {
 *   const { rootPath, rootChildren, isRootLoading, refresh } = useFileTree();
 *
 *   return (
 *     <div>
 *       {rootChildren.map((node) => (
 *         <FileTreeItem key={node.path} path={node.path} depth={0} />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useFileTree(options: UseFileTreeOptions = {}): UseFileTreeResult {
  const { autoLoad = true, debug = false } = options;

  // Track pending requests: path -> { uuid, timeoutId }
  const pendingRequests = useRef(
    new Map<string, { uuid: string; timeoutId: ReturnType<typeof setTimeout> }>()
  );

  // Track previous treeNodes for detecting cleared cache
  const prevTreeNodesRef = useRef<Set<string>>(new Set());

  // Guard to ensure autoLoad only runs once per mount
  const hasAutoLoaded = useRef(false);

  // Handle incoming messages - defined before useTauri so we can pass it in
  const handleMessage = useCallback(
    (message: ExtensionMessage): void => {
      switch (message.type) {
        case 'file:tree:response': {
          // Clear pending request and timeout
          const pending = pendingRequests.current.get(message.path);
          if (pending) {
            clearTimeout(pending.timeoutId);
            pendingRequests.current.delete(message.path);
          }

          if (debug) {
            console.warn(
              '[useFileTree] Received tree response for:',
              message.path,
              `(${String(message.children.length)} children)`
            );
          }

          const store = useFileStore.getState();

          // Store the root path if this is the first response
          if (!store.rootPath) {
            store.setRootPath(message.path);
          }
          store.setTreeChildren(message.path, message.children);
          break;
        }

        case 'file:tree:error': {
          // Find and clear the pending request by request_uuid
          for (const [path, pending] of pendingRequests.current.entries()) {
            if (pending.uuid === message.request_uuid) {
              clearTimeout(pending.timeoutId);
              pendingRequests.current.delete(path);
              const loadingKey = path || '__root__';
              useFileStore.getState().setLoading(loadingKey, false);
              useFileStore.getState().setError(loadingKey, message.error);
              break;
            }
          }

          console.error('[useFileTree] Error fetching tree:', message.error);
          break;
        }

        case 'file:changed': {
          if (debug) {
            console.warn('[useFileTree] File changed:', message.path, message.change_type);
          }
          // Handle file system changes (updates store, may clear cached children)
          useFileStore.getState().handleFileChanged(message.path, message.change_type);
          break;
        }

        case 'file:content': {
          // File content received - update the file viewer
          const viewerStore = useFileViewerStore.getState();
          const isAlreadyOpen = viewerStore.openTabs.some((tab) => tab.path === message.path);

          viewerStore.setFileContent(message.path, message.content);

          // Notify LSP only if this is a newly opened file
          if (!isAlreadyOpen) {
            const language = getLanguageFromPath(message.path);
            lspDidOpen(message.path, language, message.content).catch((err: unknown) => {
              if (debug) {
                console.warn('[useFileTree] Failed to notify LSP of file open:', err);
              }
            });
          }
          break;
        }

        // Ignore other message types - handled elsewhere
        case 'error':
        case 'conversation:list':
        case 'system:init':
        case 'layout':
        case 'agent:chunk':
        case 'agent:thinking':
        case 'agent:complete':
        case 'agent:error':
        case 'agent:plan_mode':
        case 'agent:accept_mode':
        case 'agent:checkpoint':
        case 'tool:start':
        case 'tool:end':
        case 'permission:request':
        case 'inputMode:changed':
        case 'thinking:changed':
        case 'model:changed':
        case 'panel:command':
        case 'panel:visible':
        case 'terminal:output':
        case 'terminal:data':
        case 'terminal:created':
        case 'terminal:exited':
        case 'terminal:cwd':
        case 'terminal:command:start':
        case 'terminal:command:end':
        case 'terminal:capabilities':
        case 'terminal:title':
        case 'terminal:foreground':
        case 'file:written':
        case 'file:list:response':
        case 'conversation:created':
        case 'conversation:deleted':
        case 'conversation:loading':
        case 'conversation:loaded':
        case 'conversation:rewound':
        case 'browser:open':
        case 'browser:close':
        case 'browser:created':
        case 'browser:navigated':
        case 'browser:element-selected':
        case 'browser:loading':
        case 'browser:error':
        case 'browser:destroyed':
        case 'subagents:list:response':
        case 'subagents:created':
        case 'subagents:updated':
        case 'subagents:deleted':
        case 'subagents:error':
        case 'subagents:generated':
        case 'commands:list:response':
        case 'commands:created':
        case 'commands:updated':
        case 'commands:deleted':
        case 'commands:error':
        case 'commands:generated':
          break;
      }
    },
    [debug]
  );

  // Single useTauri call - consolidates message handling and postMessage
  const { postMessage } = useTauri({ onMessage: handleMessage });

  // Get only what we need from store (minimizes re-renders)
  const rootPath = useFileStore((s) => s.rootPath);
  const rootChildren = useFileStore((s) =>
    s.rootPath ? (s.treeNodes[s.rootPath] ?? EMPTY_CHILDREN) : EMPTY_CHILDREN
  );
  const isRootLoading = useFileStore(
    (s) => s.loadingPaths.has('__root__') || s.loadingPaths.has(s.rootPath ?? '')
  );
  const rootError = useFileStore((s) => s.errorPaths.get(s.rootPath ?? '__root__') ?? null);

  // Request children for a path
  const requestChildren = useCallback(
    (path?: string): void => {
      const store = useFileStore.getState();
      const requestPath = path ?? store.rootPath ?? '';

      // Don't request if already pending
      if (pendingRequests.current.has(requestPath)) {
        if (debug) {
          console.warn('[useFileTree] Skipping duplicate request for:', requestPath);
        }
        return;
      }

      const uuid = crypto.randomUUID();
      const loadingKey = requestPath || '__root__';

      // Set timeout for request
      const timeoutId = setTimeout(() => {
        const pending = pendingRequests.current.get(requestPath);
        if (pending?.uuid === uuid) {
          pendingRequests.current.delete(requestPath);
          useFileStore.getState().setLoading(loadingKey, false);
          useFileStore.getState().setError(loadingKey, 'Request timed out');
          console.error('[useFileTree] Request timed out for:', requestPath);
        }
      }, REQUEST_TIMEOUT_MS);

      pendingRequests.current.set(requestPath, { uuid, timeoutId });

      // Clear any previous error and set loading
      useFileStore.getState().clearError(loadingKey);
      useFileStore.getState().setLoading(loadingKey, true);

      if (debug) {
        console.warn('[useFileTree] Requesting children for:', requestPath || '(root)');
      }

      postMessage({
        type: 'file:tree:request',
        uuid,
        path: path,
      });
    },
    [postMessage, debug]
  );

  // Request root children on mount (if autoLoad enabled)
  // Uses a ref guard to ensure this only runs once per mount
  // Deferred via queueMicrotask to avoid synchronous re-render during commit
  useEffect(() => {
    if (autoLoad && !hasAutoLoaded.current) {
      hasAutoLoaded.current = true;
      queueMicrotask(() => {
        const store = useFileStore.getState();
        if (Object.keys(store.treeNodes).length === 0) {
          requestChildren();
        }
      });
    }
  }, [autoLoad, requestChildren]);

  // Subscribe to treeNodes keys for detecting cleared folders
  // Use Array.from instead of spread to handle Immer proxies more reliably
  const treeNodeKeys = useFileStore((s) => Object.keys(s.treeNodes).join(','));
  const expandedFoldersList = useFileStore((s) => Array.from(s.expandedFolders).join(','));
  const currentRootPath = useFileStore((s) => s.rootPath);

  // Re-fetch expanded folders when their children are cleared (e.g., by file watcher)
  useEffect(() => {
    const currentPaths = new Set(treeNodeKeys.split(',').filter(Boolean));
    const expandedFolders = new Set(expandedFoldersList.split(',').filter(Boolean));

    // Check for expanded folders that were loaded but now aren't
    for (const folderPath of expandedFolders) {
      const wasLoaded = prevTreeNodesRef.current.has(folderPath);
      const isLoaded = currentPaths.has(folderPath);

      // If folder was loaded but now isn't (cache cleared), re-fetch
      if (wasLoaded && !isLoaded && !pendingRequests.current.has(folderPath)) {
        if (debug) {
          console.warn('[useFileTree] Re-fetching cleared folder:', folderPath);
        }
        requestChildren(folderPath);
      }
    }

    // Also check root path
    if (currentRootPath) {
      const wasRootLoaded = prevTreeNodesRef.current.has(currentRootPath);
      const isRootLoaded = currentPaths.has(currentRootPath);
      if (wasRootLoaded && !isRootLoaded && !pendingRequests.current.has(currentRootPath)) {
        if (debug) {
          console.warn('[useFileTree] Re-fetching cleared root:', currentRootPath);
        }
        requestChildren(currentRootPath);
      }
    }

    // Update ref for next comparison
    prevTreeNodesRef.current = currentPaths;
  }, [treeNodeKeys, expandedFoldersList, currentRootPath, debug, requestChildren]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    const requests = pendingRequests.current;
    return (): void => {
      for (const pending of requests.values()) {
        clearTimeout(pending.timeoutId);
      }
      requests.clear();
    };
  }, []);

  // Refresh: clear tree and re-fetch
  const refresh = useCallback((): void => {
    if (debug) {
      console.warn('[useFileTree] Refreshing tree');
    }

    // Clear all pending request timeouts
    for (const pending of pendingRequests.current.values()) {
      clearTimeout(pending.timeoutId);
    }
    pendingRequests.current.clear();

    // Clear the tree, expanded state, and errors
    useFileStore.setState({
      treeNodes: {},
      expandedFolders: new Set(),
      errorPaths: new Map(),
    });

    requestChildren();
  }, [requestChildren, debug]);

  // Toggle folder with auto-fetch
  const toggleFolder = useCallback(
    (path: string): void => {
      const store = useFileStore.getState();
      const wasExpanded = store.expandedFolders.has(path);

      store.toggleFolder(path);

      // If expanding and children not loaded, request them
      if (!wasExpanded && !(path in store.treeNodes)) {
        requestChildren(path);
      }
    },
    [requestChildren]
  );

  // Retry loading a failed folder
  const retryFolder = useCallback(
    (path: string): void => {
      if (debug) {
        console.warn('[useFileTree] Retrying folder:', path);
      }
      useFileStore.getState().clearError(path);
      requestChildren(path);
    },
    [requestChildren, debug]
  );

  // Open file in viewer
  const openFile = useCallback(
    (path: string): void => {
      if (debug) {
        console.warn('[useFileTree] Opening file:', path);
      }

      const viewerStore = useFileViewerStore.getState();

      // Open tab in viewer (shows loading state)
      viewerStore.openFile(path);
      viewerStore.setLoading(true, path);

      // Request file content
      postMessage({
        type: 'file:read',
        uuid: crypto.randomUUID(),
        path,
      });
    },
    [postMessage, debug]
  );

  return {
    rootPath,
    rootChildren,
    isRootLoading,
    rootError,
    refresh,
    toggleFolder,
    openFile,
    retryFolder,
  };
}

// ═══════════════════════════════════════════════════════════════
// Tree Item Hook - For Individual Items (Prevents Cascading Re-renders)
// ═══════════════════════════════════════════════════════════════

export interface UseFileTreeItemResult {
  /** The node data (null if not found) */
  node: FileNode | null;
  /** Whether this folder is expanded */
  isExpanded: boolean;
  /** Whether this path is currently loading */
  isLoading: boolean;
  /** Whether this path is selected */
  isSelected: boolean;
  /** Error message if this folder failed to load */
  error: string | null;
  /** Children of this folder (empty if not loaded or not a folder) */
  children: readonly FileNode[];
}

/**
 * Hook for individual tree items to subscribe to ONLY their own state.
 *
 * This prevents cascading re-renders - a parent expanding doesn't re-render
 * siblings or deeply nested children.
 *
 * @param path - The path of this tree item
 * @returns State for this specific tree item
 *
 * @example
 * ```tsx
 * const FileTreeItem = memo(({ path, depth }: Props) => {
 *   const { node, isExpanded, isLoading, isSelected, children } = useFileTreeItem(path);
 *
 *   if (!node) return null;
 *
 *   return (
 *     <div>
 *       <TreeRow node={node} isExpanded={isExpanded} isSelected={isSelected} />
 *       {isExpanded && children.map(child => (
 *         <FileTreeItem key={child.path} path={child.path} depth={depth + 1} />
 *       ))}
 *     </div>
 *   );
 * });
 * ```
 */
export function useFileTreeItem(path: string): UseFileTreeItemResult {
  // Each selector subscribes to a minimal slice of state
  // Zustand only triggers re-render if the selected value changes

  const node = useFileStore((s) => {
    // Find the node in its parent's children
    const parentPath = path.substring(0, path.lastIndexOf('/')) || s.rootPath;
    if (!parentPath) return null;
    const siblings = s.treeNodes[parentPath];
    return siblings?.find((n) => n.path === path) ?? null;
  });

  const isExpanded = useFileStore((s) => s.expandedFolders.has(path));
  const isLoading = useFileStore((s) => s.loadingPaths.has(path));
  const isSelected = useFileStore((s) => s.selectedTreePath === path);
  const error = useFileStore((s) => s.errorPaths.get(path) ?? null);
  const children = useFileStore((s) => s.treeNodes[path] ?? EMPTY_CHILDREN);

  return {
    node,
    isExpanded,
    isLoading,
    isSelected,
    error,
    children,
  };
}
