import { ChevronDown, ChevronRight, Loader2, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

import type { FileNode, ExtensionMessage } from '@/types/protocol';
import type { FC } from 'react';

import { FileIcon, FolderIcon } from '@/components/files';
import { useVSCode } from '@/hooks/use-vscode';
import { cn } from '@/lib/utils';
import { useFileStore } from '@/stores/file-store';
import { useFileViewerStore } from '@/stores/file-viewer-store';

interface FileExplorerProps {
  readonly collapsed?: boolean;
}

export const FileExplorer: FC<FileExplorerProps> = ({ collapsed = false }) => {
  const { postMessage } = useVSCode();
  const {
    rootPath,
    treeNodes,
    setRootPath,
    setTreeChildren,
    handleFileChanged,
  } = useFileStore();

  // Track pending requests to avoid duplicates
  const pendingRequests = useRef(new Map<string, string>());

  // Request children for a path
  const requestChildren = useCallback((path?: string): void => {
    const requestPath = path ?? rootPath ?? '';

    // Don't request if already pending
    if (pendingRequests.current.has(requestPath)) {
      return;
    }

    const uuid = crypto.randomUUID();
    pendingRequests.current.set(requestPath, uuid);

    useFileStore.getState().setLoading(requestPath || '__root__', true);
    postMessage({
      type: 'file:tree:request',
      uuid,
      path: path,
    });
  }, [postMessage, rootPath]);

  // Handle incoming messages
  const handleMessage = useCallback((message: ExtensionMessage): void => {
    switch (message.type) {
      case 'file:tree:response': {
        // Clear pending request
        pendingRequests.current.delete(message.path);

        // Store the root path if this is the first response
        if (!rootPath) {
          setRootPath(message.path);
        }
        setTreeChildren(message.path, message.children);
        break;
      }
      case 'file:tree:error': {
        // Clear loading state on error
        const pathKey = Object.keys(treeNodes).length === 0 ? '__root__' : message.request_uuid;
        useFileStore.getState().setLoading(pathKey, false);
         
        console.error('[FileExplorer] Error fetching tree:', message.error);
        break;
      }
      case 'file:changed': {
        // Handle file system changes
        handleFileChanged(message.path, message.change_type);
        break;
      }
      case 'file:content': {
        // File content received - update the file viewer
        useFileViewerStore.getState().setFileContent(message.path, message.content);
        break;
      }
      // Ignore other message types - handled elsewhere
      case 'conversation:list':
      case 'system:init':
      case 'layout':
      case 'agent:chunk':
      case 'agent:complete':
      case 'agent:error':
      case 'error':
      case 'tool:start':
      case 'tool:end':
      case 'permission:request':
      case 'inputMode:changed':
      case 'panel:command':
      case 'terminal:output':
      case 'terminal:data':
      case 'terminal:created':
      case 'terminal:exited':
      case 'terminal:cwd':
      case 'terminal:command:start':
      case 'terminal:command:end':
      case 'terminal:capabilities':
      case 'file:written':
      case 'file:list:response':
      case 'conversation:created':
      case 'conversation:deleted':
      case 'conversation:loaded':
      case 'conversation:rewound':
      case 'agent:thinking':
      case 'thinking:changed':
      case 'model:changed':
        break;
    }
  }, [rootPath, setRootPath, setTreeChildren, handleFileChanged, treeNodes]);

  // Set up message listener
  useVSCode({ onMessage: handleMessage });

  // Request root children on mount
  useEffect(() => {
    if (Object.keys(treeNodes).length === 0) {
      requestChildren();
    }
  }, [requestChildren, treeNodes]);

  // Get root children
  const rootChildren = rootPath ? treeNodes[rootPath] ?? [] : [];
  const isRootLoading = useFileStore.getState().isLoading('__root__') || useFileStore.getState().isLoading(rootPath ?? '');

  const handleRefresh = useCallback((): void => {
    // Clear the tree and re-fetch
    useFileStore.setState({ treeNodes: {}, expandedFolders: new Set() });
    pendingRequests.current.clear();
    requestChildren();
  }, [requestChildren]);

  const handleOpenQuickSearch = useCallback((): void => {
    window.dispatchEvent(new CustomEvent('openCommandPalette'));
  }, []);

  if (collapsed) {
    return null;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground min-w-0">
          <span className="shrink-0">Explorer</span>
          {rootPath ? (
            <>
              <span className="shrink-0">/</span>
              <span className="truncate">{rootPath.split('/').pop()}</span>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent opacity-70 hover:opacity-100"
            onClick={handleOpenQuickSearch}
            title="Quick Open (Search Files)"
          >
            <Search className="h-3 w-3" />
          </button>
          <button
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent opacity-70 hover:opacity-100"
            onClick={handleRefresh}
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {isRootLoading && rootChildren.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : rootChildren.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <span className="text-sm">No files found</span>
          </div>
        ) : (
          <div className="py-1">
            {rootChildren.map((node) => (
              <FileTreeItem
                key={node.path}
                node={node}
                depth={0}
                requestChildren={requestChildren}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// File Tree Item Component
// ═══════════════════════════════════════════════════════════════

interface FileTreeItemProps {
  readonly node: FileNode;
  readonly depth: number;
  readonly requestChildren: (path?: string) => void;
}

const FileTreeItem: FC<FileTreeItemProps> = ({ node, depth, requestChildren }) => {
  const { postMessage } = useVSCode();
  const {
    treeNodes,
    expandedFolders,
    selectedTreePath,
    loadingPaths,
    toggleFolder,
    selectTreePath,
  } = useFileStore();
  const { openFile, setLoading } = useFileViewerStore();

  const isExpanded = expandedFolders.has(node.path);
  const isSelected = selectedTreePath === node.path;
  const isLoading = loadingPaths.has(node.path);
  const children = treeNodes[node.path] ?? [];
  const hasLoadedChildren = node.path in treeNodes;

  const handleClick = useCallback((): void => {
    if (node.isDirectory) {
      // Toggle expansion
      toggleFolder(node.path);

      // Request children if expanding and not yet loaded
      if (!isExpanded && !hasLoadedChildren) {
        requestChildren(node.path);
      }
    } else {
      // Select the file in explorer
      selectTreePath(node.path);

      // Open file in the review panel's file viewer
      openFile(node.path); // Opens tab with loading state
      setLoading(true, node.path);

      // Request file content
      postMessage({
        type: 'file:read',
        uuid: crypto.randomUUID(),
        path: node.path,
      });
    }
  }, [node, isExpanded, hasLoadedChildren, toggleFolder, selectTreePath, requestChildren, postMessage, openFile, setLoading]);

  const indentPx = depth * 12 + 8;

  return (
    <>
      <button
        className={cn(
          'flex items-center w-full h-6 text-sm hover:bg-accent/50 transition-colors',
          isSelected && 'bg-accent text-accent-foreground'
        )}
        style={{ paddingLeft: indentPx }}
        onClick={handleClick}
        title={node.path}
      >
        {/* Expand/collapse chevron for directories */}
        <span className="w-4 h-4 flex items-center justify-center shrink-0">
          {node.isDirectory ? (
            isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            ) : isExpanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )
          ) : null}
        </span>

        {/* Icon */}
        <span className="w-4 h-4 flex items-center justify-center shrink-0 mr-1">
          {node.isDirectory ? (
            <FolderIcon folderName={node.name} isOpen={isExpanded} className="h-4 w-4" />
          ) : (
            <FileIcon fileName={node.name} className="h-4 w-4" />
          )}
        </span>

        {/* Name */}
        <span className="truncate text-left">{node.name}</span>
      </button>

      {/* Children (if directory is expanded) */}
      {node.isDirectory && isExpanded && children.length > 0 ? (
        <div>
          {children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              requestChildren={requestChildren}
            />
          ))}
        </div>
      ) : null}
    </>
  );
};
