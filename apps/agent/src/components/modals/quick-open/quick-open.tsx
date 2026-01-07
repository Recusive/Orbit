import { useCallback, useEffect, useMemo } from 'react';

import type { FC } from 'react';

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
import { useSearch } from '@/hooks/ui/use-search';
import { useFileStore } from '@/stores/file/file-store';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';

interface QuickOpenProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const QuickOpen: FC<QuickOpenProps> = ({ open, onOpenChange }) => {
  const rootPath = useFileStore((state) => state.rootPath);
  const openTabs = useFileViewerStore((state) => state.openTabs);
  const openFile = useFileViewerStore((state) => state.openFile);
  const setLoading = useFileViewerStore((state) => state.setLoading);

  // Use search hook for file searching
  const { query, setQuery, results, isLoading, clear } = useSearch({
    rootPath,
    maxResults: 100,
    enabled: open, // Only search when dialog is open
  });

  // Reset search when dialog closes
  useEffect(() => {
    if (!open) {
      clear();
    }
  }, [open, clear]);

  // Get recently opened file paths
  const recentPaths = useMemo(() => {
    return new Set(openTabs.map((tab) => tab.path));
  }, [openTabs]);

  // Convert search results to display format and sort (recent first)
  const searchResults = useMemo(() => {
    return [...results].sort((a, b) => {
      const aRecent = recentPaths.has(a.path);
      const bRecent = recentPaths.has(b.path);

      if (aRecent && !bRecent) return -1;
      if (!aRecent && bRecent) return 1;

      return a.name.localeCompare(b.name);
    });
  }, [results, recentPaths]);

  // Recent files from open tabs (shown when no search query)
  const recentFiles = useMemo(() => {
    return openTabs.map((tab) => ({
      name: tab.path.split('/').pop() ?? tab.path,
      path: tab.path,
    }));
  }, [openTabs]);

  const { postMessage } = useTauri();

  // Get display path (relative to workspace root)
  const getDisplayPath = useCallback(
    (path: string): string => {
      if (rootPath && path.startsWith(rootPath)) {
        return path.slice(rootPath.length + 1); // +1 for the trailing slash
      }
      return path;
    },
    [rootPath]
  );

  // Handle file selection
  const handleSelect = useCallback(
    (path: string): void => {
      // Open file in viewer
      openFile(path);
      setLoading(true, path);

      // Request file content from extension
      postMessage({
        type: 'file:read',
        uuid: crypto.randomUUID(),
        path,
      });

      // Close the dialog
      onOpenChange(false);
    },
    [openFile, setLoading, postMessage, onOpenChange]
  );

  // Determine what to show: search results or recent files
  const hasQuery = query.trim().length > 0;
  const displayResults = hasQuery ? searchResults : [];
  const showRecent = !hasQuery && recentFiles.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search files..." value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>
          {isLoading
            ? 'Searching...'
            : hasQuery
              ? 'No matching files found.'
              : 'Type to search files...'}
        </CommandEmpty>

        {/* Show recent files when no query */}
        {showRecent ? (
          <CommandGroup heading="Recent">
            {recentFiles.slice(0, 10).map((file) => (
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
                  <span className="text-sm text-muted-foreground/50 group-data-[selected=true]:text-muted-foreground/70 truncate">
                    {getDisplayPath(file.path)}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {/* Show search results when query is present */}
        {displayResults.length > 0 ? (
          <CommandGroup heading="Files">
            {displayResults.slice(0, 50).map((file) => (
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
                  <span className="text-sm text-muted-foreground/50 group-data-[selected=true]:text-muted-foreground/70 truncate">
                    {getDisplayPath(file.path)}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
};
