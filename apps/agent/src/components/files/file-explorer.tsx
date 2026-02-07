/**
 * FileExplorer - Virtualized file tree browser
 *
 * NOTE: Git status styling comes from @/lib/utils/constants.
 * To change git status colors or labels, update GIT_STATUS_STYLES in constants.ts.
 */
import { createLogger } from '@orbit/common/lib';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertCircle, ChevronRight, FolderOpen, Loader2, RefreshCw, Search } from 'lucide-react';
import { memo, useCallback, useMemo, useRef } from 'react';

import type { FileStatus } from '@/lib/api';
import type { FileNode } from '@/types/protocol';
import type { FC } from 'react';

import { FileIcon, FolderIcon } from '@/components/files';
import { useFileTree } from '@/hooks/file/use-file-tree';
import { conversationList, initializeWorkspace, openFileDialog } from '@/lib/api';
import { toConversationSummaries } from '@/lib/mappers';
import { cn, GIT_STATUS_STYLES } from '@/lib/utils';
import { useFileStore } from '@/stores/file/file-store';
import { selectFileStatus, useGitStore } from '@/stores/git/git-store';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('FileExplorer');

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** Flattened tree item for virtualization */
interface FlatTreeItem {
  /** Full path to the file/folder */
  path: string;
  /** Depth in tree (0 = root level) */
  depth: number;
  /** The node data */
  node: FileNode;
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

/** Height of each row in pixels */
const ROW_HEIGHT = 24;

/** Overscan - render extra rows above/below viewport for smooth scrolling */
const OVERSCAN = 10;

// ═══════════════════════════════════════════════════════════════
// Git Status Indicator
// ═══════════════════════════════════════════════════════════════

interface GitStatusBadgeProps {
  status: FileStatus;
}

const GitStatusBadge: FC<GitStatusBadgeProps> = ({ status }) => {
  const style = GIT_STATUS_STYLES[status];
  return (
    <span
      className={cn('text-xs font-bold shrink-0 w-4 text-center', style.color)}
      title={style.title}
    >
      {style.label}
    </span>
  );
};

// ═══════════════════════════════════════════════════════════════
// Tree Flattening (Iterative to avoid stack overflow on deep trees)
// ═══════════════════════════════════════════════════════════════

/**
 * Flatten the tree into a list for virtualization.
 * Uses iterative approach to handle deeply nested structures.
 * Only includes visible items (expanded folders show their children).
 */
function flattenTree(
  rootChildren: readonly FileNode[],
  treeNodes: Record<string, FileNode[]>,
  expandedFolders: Set<string>
): FlatTreeItem[] {
  const result: FlatTreeItem[] = [];

  // Stack holds: [nodes to process, current depth, index in nodes]
  interface StackFrame {
    nodes: readonly FileNode[];
    depth: number;
    index: number;
  }

  const stack: StackFrame[] = [{ nodes: rootChildren, depth: 0, index: 0 }];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (!frame) break; // Type guard (shouldn't happen but satisfies TS)

    if (frame.index >= frame.nodes.length) {
      // Done with this level, pop stack
      stack.pop();
      continue;
    }

    const node = frame.nodes[frame.index];
    if (!node) {
      frame.index++;
      continue;
    }
    frame.index++;

    result.push({ path: node.path, depth: frame.depth, node });

    // If expanded directory with children, push children onto stack
    if (node.isDirectory && expandedFolders.has(node.path)) {
      const children = treeNodes[node.path];
      if (children && children.length > 0) {
        stack.push({ nodes: children, depth: frame.depth + 1, index: 0 });
      }
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// File Explorer Component
// ═══════════════════════════════════════════════════════════════

interface FileExplorerProps {
  readonly collapsed?: boolean;
}

export const FileExplorer: FC<FileExplorerProps> = ({ collapsed = false }) => {
  const {
    rootPath,
    rootChildren,
    isRootLoading,
    rootError,
    refresh,
    toggleFolder,
    openFile,
    retryFolder,
  } = useFileTree();

  // Use stable selectors to trigger re-render when tree structure changes
  const treeNodesVersion = useFileStore((s) => Object.keys(s.treeNodes).join(','));
  const expandedFoldersVersion = useFileStore((s) => Array.from(s.expandedFolders).join(','));
  const selectTreePath = useFileStore((s) => s.selectTreePath);

  // Stable ref for scroll container - must be defined before useVirtualizer
  const parentRef = useRef<HTMLDivElement>(null);

  // Memoize flat items with stable dependencies
  const flatItems = useMemo(() => {
    void treeNodesVersion;
    void expandedFoldersVersion;
    const state = useFileStore.getState();
    return flattenTree(rootChildren, state.treeNodes, state.expandedFolders);
  }, [rootChildren, treeNodesVersion, expandedFoldersVersion]);

  // CRITICAL: Memoize callbacks passed to useVirtualizer to prevent infinite loops
  const getScrollElement = useCallback(() => parentRef.current, []);
  const estimateSize = useCallback(() => ROW_HEIGHT, []);
  const getItemKey = useCallback((index: number) => flatItems[index]?.path ?? index, [flatItems]);

  // Initialize virtualizer with stable callbacks
  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement,
    estimateSize,
    overscan: OVERSCAN,
    getItemKey,
  });

  // Memoize row interaction callbacks
  const handleToggle = useCallback(
    (path: string): void => {
      toggleFolder(path);
    },
    [toggleFolder]
  );

  const handleOpen = useCallback(
    (path: string): void => {
      openFile(path);
    },
    [openFile]
  );

  const handleSelect = useCallback(
    (path: string | null): void => {
      selectTreePath(path);
    },
    [selectTreePath]
  );

  const handleRetry = useCallback(
    (path: string): void => {
      retryFolder(path);
    },
    [retryFolder]
  );

  const handleOpenQuickSearch = useCallback((): void => {
    window.dispatchEvent(new CustomEvent('openCommandPalette'));
  }, []);

  const setRootPath = useFileStore((s) => s.setRootPath);

  const handleOpenFolder = useCallback(async (): Promise<void> => {
    try {
      const selected = await openFileDialog({
        title: 'Open Folder',
        directory: true,
        multiple: false,
      });

      if (selected !== null && typeof selected === 'string') {
        // Persist the workspace path and build file index for fuzzy search
        await initializeWorkspace(selected);
        // Update UI store with workspace name (for header display)
        useUIStore.getState().setWorkspace(selected);
        // Update the file store to load the new folder
        setRootPath(selected);
        // Refresh the file tree
        refresh();

        // Load conversations for this workspace (Claude Code-style folder isolation)
        const conversations = await conversationList(selected);
        useUIStore.getState().setConversations(toConversationSummaries(conversations));
      }
    } catch (err) {
      logger.error('Failed to open folder', err instanceof Error ? err : new Error(String(err)));
    }
  }, [setRootPath, refresh]);

  if (collapsed) {
    return null;
  }

  // Get virtual items once per render
  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-1 text-base font-medium text-muted-foreground min-w-0">
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
            aria-label="Quick open (search files)"
            title="Quick Open (Search Files)"
          >
            <Search className="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent opacity-70 hover:opacity-100"
            onClick={handleOpenFolder}
            aria-label="Open folder"
            title="Open Folder"
          >
            <FolderOpen className="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent opacity-70 hover:opacity-100"
            onClick={refresh}
            aria-label="Refresh file tree"
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Tree content */}
      <div ref={parentRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* Root error state */}
        {rootError ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <AlertCircle className="h-5 w-5 text-destructive mb-2" />
            <span className="text-sm text-muted-foreground mb-2">{rootError}</span>
            <button
              className="text-xs text-primary hover:underline"
              onClick={(): void => {
                retryFolder(rootPath ?? '__root__');
              }}
            >
              Retry
            </button>
          </div>
        ) : isRootLoading && flatItems.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : flatItems.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <span className="text-sm">No files found</span>
          </div>
        ) : (
          <div
            style={{
              height: rowVirtualizer.getTotalSize(),
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualItems.map((virtualItem) => {
              const item = flatItems[virtualItem.index];
              if (!item) return null;

              return (
                <FileTreeRow
                  key={item.path}
                  path={item.path}
                  depth={item.depth}
                  node={item.node}
                  top={virtualItem.start}
                  height={virtualItem.size}
                  onToggle={handleToggle}
                  onOpen={handleOpen}
                  onSelect={handleSelect}
                  onRetry={handleRetry}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// File Tree Row Component (Virtualized, Memoized)
// ═══════════════════════════════════════════════════════════════

interface FileTreeRowProps {
  readonly path: string;
  readonly depth: number;
  readonly node: FileNode;
  readonly top: number;
  readonly height: number;
  readonly onToggle: (path: string) => void;
  readonly onOpen: (path: string) => void;
  readonly onSelect: (path: string | null) => void;
  readonly onRetry: (path: string) => void;
}

/**
 * Single virtualized row in the file tree.
 *
 * Uses Zustand selectors for minimal re-renders:
 * - Only re-renders when THIS row's state changes
 * - Not affected by other rows expanding/selecting
 */
const FileTreeRow: FC<FileTreeRowProps> = memo(
  ({ path, depth, node, top, height, onToggle, onOpen, onSelect, onRetry }) => {
    // Subscribe to only this row's state
    const isExpanded = useFileStore((s) => s.expandedFolders.has(path));
    const isLoading = useFileStore((s) => s.loadingPaths.has(path));
    const isSelected = useFileStore((s) => s.selectedTreePath === path);
    const error = useFileStore((s) => s.errorPaths.get(path) ?? null);

    // Git status for this file (uses full path for matching)
    const gitStatus = useGitStore(selectFileStatus(path));

    const handleClick = useCallback((): void => {
      if (node.isDirectory) {
        onToggle(path);
      } else {
        onSelect(path);
        onOpen(path);
      }
    }, [node.isDirectory, path, onToggle, onSelect, onOpen]);

    const handleRetry = useCallback(
      (e: React.MouseEvent | React.KeyboardEvent): void => {
        e.stopPropagation();
        onRetry(path);
      },
      [path, onRetry]
    );

    const indentPx = depth * 12 + 8;

    // Check if file is gitignored (files only, not directories)
    const isGitIgnored = node.isGitIgnored === true;

    return (
      <button
        className={cn(
          'file-tree-item flex items-center w-full text-sm hover:bg-muted/50 dark:hover:bg-accent/50 transition-colors',
          isSelected && 'bg-muted/70 dark:bg-accent text-foreground dark:text-accent-foreground'
        )}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height,
          transform: `translateY(${String(top)}px)`,
          paddingLeft: indentPx,
          // Reduce opacity for gitignored files to visually indicate they're not tracked
          opacity: isGitIgnored ? 0.5 : 1,
        }}
        onClick={handleClick}
        title={isGitIgnored ? `${path} (gitignored)` : path}
      >
        {/* Indent guide lines - one vertical line per ancestor depth level */}
        {depth > 0 &&
          Array.from({ length: depth }, (_, i) => (
            <span
              key={i}
              className="absolute top-0 bottom-0 w-px bg-muted-foreground/15 pointer-events-none"
              style={{ left: i * 12 + 16 }}
              aria-hidden="true"
            />
          ))}

        {/* Expand/collapse chevron for directories */}
        <span className="w-4 h-4 flex items-center justify-center shrink-0">
          {node.isDirectory ? (
            error ? (
              <AlertCircle className="h-3 w-3 text-destructive" />
            ) : isLoading && !isExpanded ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            ) : (
              <ChevronRight
                className={cn(
                  'h-3 w-3 text-muted-foreground transition-transform duration-150',
                  isExpanded && 'rotate-90'
                )}
                aria-hidden="true"
              />
            )
          ) : null}
        </span>

        {/* Icon */}
        <span className="w-4 h-4 flex items-center justify-center shrink-0 mr-1">
          {node.isDirectory ? (
            <FolderIcon
              folderName={node.name}
              isOpen={isExpanded}
              isSymlink={node.isSymlink ?? false}
              className="h-4 w-4"
            />
          ) : (
            <FileIcon
              fileName={node.name}
              isSymlink={node.isSymlink ?? false}
              className="h-4 w-4"
            />
          )}
        </span>

        {/* Name */}
        <span
          className={cn(
            'truncate text-left flex-1',
            // Dim untracked files slightly
            gitStatus === 'untracked' && 'text-muted-foreground'
          )}
        >
          {node.name}
        </span>

        {/* Git status badge */}
        {gitStatus && !node.isDirectory ? <GitStatusBadge status={gitStatus} /> : null}

        {/* Error retry button */}
        {error ? (
          <span
            className="text-xs text-destructive hover:underline px-1"
            onClick={handleRetry}
            onKeyDown={(e): void => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleRetry(e);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={`Retry loading ${node.name}`}
          >
            retry
          </span>
        ) : null}
      </button>
    );
  },
  // Custom comparison - re-render if position, identity, node name, or gitignore status changes
  (prevProps, nextProps) =>
    prevProps.path === nextProps.path &&
    prevProps.depth === nextProps.depth &&
    prevProps.node.name === nextProps.node.name &&
    prevProps.node.isGitIgnored === nextProps.node.isGitIgnored &&
    prevProps.top === nextProps.top &&
    prevProps.height === nextProps.height
);

FileTreeRow.displayName = 'FileTreeRow';
