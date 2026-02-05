import { useCallback, useEffect, useMemo, useState } from 'react';

import type { FC, ReactNode } from 'react';

import { FileIcon } from '@/components/files/file-icon';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useTauri } from '@/hooks/agent/use-tauri';
import { useMentionSearch } from '@/hooks/ui/use-mention-search';
import { useFileStore } from '@/stores/file/file-store';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';
import { useUIStore } from '@/stores/ui/ui-store';

// ============================================
// Helpers
// ============================================

/**
 * Highlight matched characters in a filename.
 *
 * Uses matchIndices from Nucleo to wrap matched characters in <mark> tags.
 * Handles unicode correctly by iterating over characters, not bytes.
 */
function highlightMatches(name: string, indices: number[]): ReactNode {
  if (indices.length === 0) {
    return name;
  }

  const matchSet = new Set(indices);
  const chars = Array.from(name);

  return chars.map((char, idx) => {
    if (matchSet.has(idx)) {
      return (
        <mark key={idx} className="bg-primary/25 text-foreground rounded-[2px] px-px -mx-px">
          {char}
        </mark>
      );
    }
    return char;
  });
}

// ============================================
// Component
// ============================================

interface QuickOpenProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const QuickOpen: FC<QuickOpenProps> = ({ open, onOpenChange }) => {
  const rootPath = useFileStore((state) => state.rootPath);
  const openTabs = useFileViewerStore((state) => state.openTabs);
  const openFile = useFileViewerStore((state) => state.openFile);
  const setLoading = useFileViewerStore((state) => state.setLoading);
  const openFileTab = useUIStore((state) => state.openFileTab);

  // Local query state (useMentionSearch doesn't manage query state)
  const [query, setQuery] = useState('');

  // Fuzzy file search via Nucleo matcher
  const { results, isLoading, isIndexing } = useMentionSearch({
    query,
    enabled: open,
    maxResults: 100,
  });

  // Reset query when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  // Set of open tab paths (used to de-duplicate suggestions from recent files)
  const recentPaths = useMemo(() => {
    return new Set(openTabs.map((tab) => tab.path));
  }, [openTabs]);

  // Recent files from open tabs (shown when no search query)
  const recentFiles = useMemo(() => {
    return openTabs.map((tab) => ({
      name: tab.path.split('/').pop() ?? tab.path,
      path: tab.path,
    }));
  }, [openTabs]);

  const { postMessage } = useTauri();

  // Get parent directory path (relative to workspace root)
  // Returns null if the file is at the workspace root (no parent directory to show)
  const getParentPath = useCallback(
    (path: string, filename: string): string | null => {
      let relativePath = path;
      if (rootPath && path.startsWith(rootPath)) {
        relativePath = path.slice(rootPath.length + 1); // +1 for the trailing slash
      }

      // If the relative path equals the filename, file is at workspace root
      if (relativePath === filename) {
        return null;
      }

      // Return the full relative path (includes filename for context)
      return relativePath;
    },
    [rootPath]
  );

  // Handle file selection
  const handleSelect = useCallback(
    (filePath: string): void => {
      // Fuzzy search returns relative paths — resolve to absolute for file operations
      // Recent files from openTabs already have absolute paths (start with /)
      const absolutePath =
        rootPath && !filePath.startsWith('/') ? `${rootPath}/${filePath}` : filePath;

      // Open file in viewer and switch activity panel to file tab
      openFile(absolutePath);
      setLoading(true, absolutePath);
      openFileTab();

      // Request file content from extension
      postMessage({
        type: 'file:read',
        uuid: crypto.randomUUID(),
        path: absolutePath,
      });

      // Close the dialog
      onOpenChange(false);
    },
    [rootPath, openFile, setLoading, openFileTab, postMessage, onOpenChange]
  );

  // Determine what to show
  const hasQuery = query.trim().length > 0;
  const showRecent = !hasQuery && recentFiles.length > 0;

  // When query is present: show results ranked by Nucleo fuzzy relevance (no boost)
  // When no query: show suggestions from file index (excluding files already in Recent)
  const displayResults = hasQuery ? results : results.filter((r) => !recentPaths.has(r.path));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput placeholder="Search files..." value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>
          {isIndexing
            ? 'Indexing files...'
            : hasQuery && isLoading
              ? 'Searching...'
              : hasQuery
                ? 'No matching files found.'
                : null}
        </CommandEmpty>

        {/* Show recent files when no query */}
        {showRecent ? (
          <CommandGroup heading="Recent">
            {recentFiles.slice(0, 10).map((file) => {
              const parentPath = getParentPath(file.path, file.name);
              return (
                <CommandItem
                  key={file.path}
                  value={file.path}
                  onSelect={handleSelect}
                  className="flex items-center gap-3"
                >
                  <FileIcon
                    fileName={file.name}
                    className="h-4 w-4 shrink-0 opacity-70 group-data-[selected=true]:opacity-100"
                  />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="truncate text-base font-medium">{file.name}</span>
                    {parentPath !== null ? (
                      <span className="text-sm text-muted-foreground/50 group-data-[selected=true]:text-muted-foreground/70 truncate">
                        {parentPath}
                      </span>
                    ) : null}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ) : null}

        {/* Show search results (or suggestions when no query) */}
        {displayResults.length > 0 ? (
          <CommandGroup heading={hasQuery ? 'Files' : 'Suggestions'}>
            {displayResults.slice(0, 50).map((file) => {
              const parentPath = getParentPath(file.path, file.name);
              return (
                <CommandItem
                  key={file.path}
                  value={file.path}
                  onSelect={handleSelect}
                  className="flex items-center gap-3"
                >
                  <FileIcon
                    fileName={file.name}
                    className="h-4 w-4 shrink-0 opacity-70 group-data-[selected=true]:opacity-100"
                  />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="truncate text-base font-medium">
                      {highlightMatches(file.name, file.matchIndices)}
                    </span>
                    {parentPath !== null ? (
                      <span className="text-sm text-muted-foreground/50 group-data-[selected=true]:text-muted-foreground/70 truncate">
                        {highlightMatches(parentPath, file.pathMatchIndices)}
                      </span>
                    ) : null}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
};
