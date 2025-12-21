import { useCallback, useEffect, useRef } from 'react';

import type { ExtensionMessage, FileNode } from '@/types/protocol';

import { useTauri } from '@/hooks/use-tauri';
import { lspDidOpen } from '@/lib/backend';
import { useFileStore } from '@/stores/file-store';
import { useFileViewerStore, getLanguageFromPath } from '@/stores/file-viewer-store';

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
  rootChildren: FileNode[];
  /** Whether the root is currently loading */
  isRootLoading: boolean;
  /** Request children for a path (defaults to root if not specified) */
  requestChildren: (path?: string) => void;
  /** Refresh the entire tree (clears cache and re-fetches) */
  refresh: () => void;
  /** Toggle folder expansion */
  toggleFolder: (path: string) => void;
  /** Check if a folder is expanded */
  isExpanded: (path: string) => boolean;
  /** Check if a path is loading */
  isLoading: (path: string) => boolean;
  /** Get children for a specific path */
  getChildren: (path: string) => FileNode[];
  /** Open a file in the file viewer */
  openFile: (path: string) => void;
}

/**
 * Hook to manage file tree state and operations
 *
 * @param options - Configuration options
 * @returns File tree state and actions
 *
 * @example
 * ```tsx
 * function FileExplorer() {
 *   const {
 *     rootPath,
 *     rootChildren,
 *     isRootLoading,
 *     requestChildren,
 *     refresh,
 *     toggleFolder,
 *     isExpanded,
 *     openFile,
 *   } = useFileTree();
 *
 *   if (isRootLoading && rootChildren.length === 0) {
 *     return <Spinner />;
 *   }
 *
 *   return (
 *     <div>
 *       {rootChildren.map((node) => (
 *         <TreeNode
 *           key={node.path}
 *           node={node}
 *           onToggle={() => toggleFolder(node.path)}
 *           onOpen={() => openFile(node.path)}
 *         />
 *       ))}
 *       <button onClick={refresh}>Refresh</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useFileTree(options: UseFileTreeOptions = {}): UseFileTreeResult {
  const { autoLoad = true, debug = false } = options;

  const { postMessage } = useTauri();
  const {
    rootPath,
    treeNodes,
    expandedFolders,
    loadingPaths,
    setRootPath,
    setTreeChildren,
    toggleFolder: storeToggleFolder,
    handleFileChanged,
    setLoading,
    getChildren,
    isExpanded,
    isLoading,
  } = useFileStore();

  const { openFile: viewerOpenFile, setLoading: setViewerLoading } = useFileViewerStore();

  // Track pending requests to avoid duplicates
  const pendingRequests = useRef(new Map<string, string>());

  // Track previous treeNodes for detecting cleared cache
  const prevTreeNodesRef = useRef<Record<string, unknown>>({});

  // Request children for a path
  const requestChildren = useCallback(
    (path?: string): void => {
      const requestPath = path ?? rootPath ?? '';

      // Don't request if already pending
      if (pendingRequests.current.has(requestPath)) {
        if (debug) {
          console.warn('[useFileTree] Skipping duplicate request for:', requestPath);
        }
        return;
      }

      const uuid = crypto.randomUUID();
      pendingRequests.current.set(requestPath, uuid);

      // Set loading state
      const loadingKey = requestPath || '__root__';
      setLoading(loadingKey, true);

      if (debug) {
        console.warn('[useFileTree] Requesting children for:', requestPath || '(root)');
      }

      postMessage({
        type: 'file:tree:request',
        uuid,
        path: path,
      });
    },
    [postMessage, rootPath, setLoading, debug]
  );

  // Handle incoming messages
  const handleMessage = useCallback(
    (message: ExtensionMessage): void => {
      switch (message.type) {
        case 'file:tree:response': {
          // Clear pending request
          pendingRequests.current.delete(message.path);

          if (debug) {
            console.warn('[useFileTree] Received tree response for:', message.path);
          }

          // Store the root path if this is the first response
          if (!rootPath) {
            setRootPath(message.path);
          }
          setTreeChildren(message.path, message.children);
          break;
        }

        case 'file:tree:error': {
          // Find and clear the pending request by request_uuid
          for (const [path, uuid] of pendingRequests.current.entries()) {
            if (uuid === message.request_uuid) {
              pendingRequests.current.delete(path);
              setLoading(path || '__root__', false);
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
          handleFileChanged(message.path, message.change_type);
          break;
        }

        case 'file:content': {
          // File content received - update the file viewer
          const store = useFileViewerStore.getState();
          const isAlreadyOpen = store.openTabs.some((tab) => tab.path === message.path);

          store.setFileContent(message.path, message.content);

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
        case 'file:written':
        case 'file:list:response':
        case 'conversation:created':
        case 'conversation:deleted':
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
    [rootPath, setRootPath, setTreeChildren, handleFileChanged, setLoading, debug]
  );

  // Set up message listener
  useTauri({ onMessage: handleMessage });

  // Request root children on mount (if autoLoad enabled)
  useEffect(() => {
    if (autoLoad && Object.keys(treeNodes).length === 0) {
      requestChildren();
    }
  }, [autoLoad, requestChildren, treeNodes]);

  // Re-fetch expanded folders when their children are cleared (e.g., by file watcher)
  useEffect(() => {
    // Check for expanded folders that were loaded but now aren't
    for (const folderPath of expandedFolders) {
      const wasLoaded = folderPath in prevTreeNodesRef.current;
      const isLoaded = folderPath in treeNodes;

      // If folder was loaded but now isn't (cache cleared), re-fetch
      if (wasLoaded && !isLoaded && !pendingRequests.current.has(folderPath)) {
        if (debug) {
          console.warn('[useFileTree] Re-fetching cleared folder:', folderPath);
        }
        requestChildren(folderPath);
      }
    }

    // Also check root path
    if (rootPath) {
      const wasRootLoaded = rootPath in prevTreeNodesRef.current;
      const isRootLoaded = rootPath in treeNodes;
      if (wasRootLoaded && !isRootLoaded && !pendingRequests.current.has(rootPath)) {
        if (debug) {
          console.warn('[useFileTree] Re-fetching cleared root:', rootPath);
        }
        requestChildren(rootPath);
      }
    }

    // Update ref for next comparison
    prevTreeNodesRef.current = { ...treeNodes };
  }, [treeNodes, expandedFolders, rootPath, requestChildren, debug]);

  // Refresh: clear tree and re-fetch
  const refresh = useCallback((): void => {
    if (debug) {
      console.warn('[useFileTree] Refreshing tree');
    }
    // Clear the tree and expanded state
    useFileStore.setState({ treeNodes: {}, expandedFolders: new Set() });
    pendingRequests.current.clear();
    requestChildren();
  }, [requestChildren, debug]);

  // Toggle folder with auto-fetch
  const toggleFolder = useCallback(
    (path: string): void => {
      const wasExpanded = expandedFolders.has(path);
      storeToggleFolder(path);

      // If expanding and children not loaded, request them
      if (!wasExpanded && !(path in treeNodes)) {
        requestChildren(path);
      }
    },
    [expandedFolders, storeToggleFolder, treeNodes, requestChildren]
  );

  // Open file in viewer
  const openFile = useCallback(
    (path: string): void => {
      if (debug) {
        console.warn('[useFileTree] Opening file:', path);
      }

      // Open tab in viewer (shows loading state)
      viewerOpenFile(path);
      setViewerLoading(true, path);

      // Request file content
      postMessage({
        type: 'file:read',
        uuid: crypto.randomUUID(),
        path,
      });
    },
    [viewerOpenFile, setViewerLoading, postMessage, debug]
  );

  // Compute derived state
  const rootChildren = rootPath ? (treeNodes[rootPath] ?? []) : [];
  const isRootLoading = loadingPaths.has('__root__') || loadingPaths.has(rootPath ?? '');

  return {
    rootPath,
    rootChildren,
    isRootLoading,
    requestChildren,
    refresh,
    toggleFolder,
    isExpanded,
    isLoading,
    getChildren,
    openFile,
  };
}
