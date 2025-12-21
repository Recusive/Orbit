import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertCircle, ChevronDown, ChevronRight, Loader2, RefreshCw, Search } from 'lucide-react';
import { memo, useCallback, useMemo, useRef } from 'react';

import type { FileNode } from '@/types/protocol';
import type { FC } from 'react';

import { FileIcon, FolderIcon } from '@/components/files';
import { useFileTree } from '@/hooks/use-file-tree';
import { cn } from '@/lib/utils';
import { useFileStore } from '@/stores/file-store';

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

  // Get tree state for flattening - these selectors are stable (Immer)
  const treeNodes = useFileStore((s) => s.treeNodes);
  const expandedFolders = useFileStore((s) => s.expandedFolders);
  // Get action directly from store (not via selector to avoid new reference each render)
  const selectTreePath = useFileStore.getState().selectTreePath;

  // Flatten tree for virtualization
  // Recalculates when tree structure or expansion state changes
  const flatItems = useMemo(
    () => flattenTree(rootChildren, treeNodes, expandedFolders),
    [rootChildren, treeNodes, expandedFolders]
  );

  // Virtualizer setup
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    // Maintain scroll position when items change
    getItemKey: (index) => flatItems[index]?.path ?? index,
  });

  const handleOpenQuickSearch = useCallback((): void => {
    window.dispatchEvent(new CustomEvent('openCommandPalette'));
  }, []);

  if (collapsed) {
    return null;
  }

  const virtualItems = virtualizer.getVirtualItems();

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
            onClick={refresh}
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
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
        ) : isRootLoading && rootChildren.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : rootChildren.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <span className="text-sm">No files found</span>
          </div>
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualItems.map((virtualRow) => {
              const item = flatItems[virtualRow.index];
              if (!item) return null;
              return (
                <FileTreeRow
                  key={item.path}
                  path={item.path}
                  depth={item.depth}
                  node={item.node}
                  top={virtualRow.start}
                  height={virtualRow.size}
                  onToggle={toggleFolder}
                  onOpen={openFile}
                  onSelect={selectTreePath}
                  onRetry={retryFolder}
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

    const handleClick = useCallback((): void => {
      if (node.isDirectory) {
        onToggle(path);
      } else {
        onSelect(path);
        onOpen(path);
      }
    }, [node.isDirectory, path, onToggle, onSelect, onOpen]);

    const handleRetry = useCallback(
      (e: React.MouseEvent): void => {
        e.stopPropagation();
        onRetry(path);
      },
      [path, onRetry]
    );

    const indentPx = depth * 12 + 8;

    return (
      <button
        className={cn(
          'flex items-center w-full text-sm hover:bg-accent/50 transition-colors',
          isSelected && 'bg-accent text-accent-foreground'
        )}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height,
          transform: `translateY(${String(top)}px)`,
          paddingLeft: indentPx,
        }}
        onClick={handleClick}
        title={path}
      >
        {/* Expand/collapse chevron for directories */}
        <span className="w-4 h-4 flex items-center justify-center shrink-0">
          {node.isDirectory ? (
            isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            ) : error ? (
              <AlertCircle className="h-3 w-3 text-destructive" />
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
        <span className="truncate text-left flex-1">{node.name}</span>

        {/* Error retry button */}
        {error ? (
          <span
            className="text-xs text-destructive hover:underline px-1"
            onClick={handleRetry}
            role="button"
            tabIndex={0}
          >
            retry
          </span>
        ) : null}
      </button>
    );
  },
  // Custom comparison - re-render if position, identity, or node name changes
  (prevProps, nextProps) =>
    prevProps.path === nextProps.path &&
    prevProps.depth === nextProps.depth &&
    prevProps.node.name === nextProps.node.name &&
    prevProps.top === nextProps.top &&
    prevProps.height === nextProps.height
);

FileTreeRow.displayName = 'FileTreeRow';
