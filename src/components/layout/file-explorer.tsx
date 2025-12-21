import { AlertCircle, ChevronDown, ChevronRight, Loader2, RefreshCw, Search } from 'lucide-react';
import { memo, useCallback } from 'react';

import type { FC } from 'react';

import { FileIcon, FolderIcon } from '@/components/files';
import { useFileTree, useFileTreeItem } from '@/hooks/use-file-tree';
import { cn } from '@/lib/utils';
import { useFileStore } from '@/stores/file-store';

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

  const selectTreePath = useFileStore((s) => s.selectTreePath);

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
            onClick={refresh}
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
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
          <div className="py-1">
            {rootChildren.map((node) => (
              <FileTreeItem
                key={node.path}
                path={node.path}
                depth={0}
                onToggle={toggleFolder}
                onOpen={openFile}
                onSelect={selectTreePath}
                onRetry={retryFolder}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// File Tree Item Component (Memoized for Performance)
// ═══════════════════════════════════════════════════════════════

interface FileTreeItemProps {
  readonly path: string;
  readonly depth: number;
  readonly onToggle: (path: string) => void;
  readonly onOpen: (path: string) => void;
  readonly onSelect: (path: string | null) => void;
  readonly onRetry: (path: string) => void;
}

/**
 * Memoized tree item that subscribes to ONLY its own state.
 *
 * This prevents cascading re-renders:
 * - Parent expanding doesn't re-render siblings
 * - Sibling selection doesn't re-render other siblings
 * - Each item only re-renders when ITS state changes
 */
const FileTreeItem: FC<FileTreeItemProps> = memo(
  ({ path, depth, onToggle, onOpen, onSelect, onRetry }) => {
    // Subscribe to only this item's state (prevents cascading re-renders)
    const { node, isExpanded, isLoading, isSelected, error, children } = useFileTreeItem(path);

    const handleClick = useCallback((): void => {
      if (!node) return;

      if (node.isDirectory) {
        // Toggle expansion (hook auto-fetches children if needed)
        onToggle(path);
      } else {
        // Select the file in explorer
        onSelect(path);
        // Open file in the viewer (hook handles content fetch + LSP)
        onOpen(path);
      }
    }, [node, path, onToggle, onSelect, onOpen]);

    const handleRetry = useCallback(
      (e: React.MouseEvent): void => {
        e.stopPropagation();
        onRetry(path);
      },
      [path, onRetry]
    );

    // Node not found (shouldn't happen, but be defensive)
    if (!node) {
      return null;
    }

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
              <FolderIcon folderName={node.name} isOpen={isExpanded} className="h-4 w-4" />
            ) : (
              <FileIcon fileName={node.name} className="h-4 w-4" />
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

        {/* Children (if directory is expanded and loaded) */}
        {node.isDirectory && isExpanded && !error && children.length > 0 ? (
          <div>
            {children.map((child) => (
              <FileTreeItem
                key={child.path}
                path={child.path}
                depth={depth + 1}
                onToggle={onToggle}
                onOpen={onOpen}
                onSelect={onSelect}
                onRetry={onRetry}
              />
            ))}
          </div>
        ) : null}
      </>
    );
  },
  // Custom comparison - only re-render if path or depth changes
  // State changes are handled by the hook's selectors
  (prevProps, nextProps) => prevProps.path === nextProps.path && prevProps.depth === nextProps.depth
);

FileTreeItem.displayName = 'FileTreeItem';
