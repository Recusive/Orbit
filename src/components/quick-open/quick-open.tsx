import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ExtensionMessage, FileListEntry } from '@/types/protocol';
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
import { useTauri } from '@/hooks/use-tauri';
import { useFileStore } from '@/stores/file-store';
import { useFileViewerStore } from '@/stores/file-viewer-store';


interface QuickOpenProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const QuickOpen: FC<QuickOpenProps> = ({ open, onOpenChange }) => {
  const rootPath = useFileStore((state) => state.rootPath);
  const openTabs = useFileViewerStore((state) => state.openTabs);
  const openFile = useFileViewerStore((state) => state.openFile);
  const setLoading = useFileViewerStore((state) => state.setLoading);

  const [search, setSearch] = useState('');
  const [files, setFiles] = useState<FileListEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Track request UUID to match response
  const requestUuidRef = useRef<string | null>(null);

  // Handle messages from extension
  const handleMessage = useCallback((message: ExtensionMessage): void => {
    if (
      message.type === 'file:list:response' &&
      message.request_uuid === requestUuidRef.current
    ) {
      setFiles(message.files);
      setIsLoading(false);
      requestUuidRef.current = null;
    }
  }, []);

  const { postMessage } = useTauri({ onMessage: handleMessage });

  // Request file list when dialog opens
  useEffect(() => {
    if (open && files.length === 0) {
      setIsLoading(true);
      const uuid = crypto.randomUUID();
      requestUuidRef.current = uuid;
      postMessage({
        type: 'file:list:request',
        uuid,
      });
    }
  }, [open, files.length, postMessage]);

  // Reset search when dialog closes
  useEffect(() => {
    if (!open) {
      setSearch('');
    }
  }, [open]);

  // Get recently opened file paths
  const recentPaths = useMemo(() => {
    return new Set(openTabs.map((tab) => tab.path));
  }, [openTabs]);

  // Filter and sort files based on search
  const filteredFiles = useMemo(() => {
    const searchLower = search.toLowerCase();

    // Filter by search query
    const matches = files.filter((file) => {
      if (search.length === 0) return true;
      // Match against filename or path
      return (
        file.name.toLowerCase().includes(searchLower) ||
        file.path.toLowerCase().includes(searchLower)
      );
    });

    // Sort: recent files first, then alphabetically by name
    return matches.sort((a, b) => {
      const aRecent = recentPaths.has(a.path);
      const bRecent = recentPaths.has(b.path);

      if (aRecent && !bRecent) return -1;
      if (!aRecent && bRecent) return 1;

      return a.name.localeCompare(b.name);
    });
  }, [files, search, recentPaths]);

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

  // Separate recent and other files
  const recentFiles = filteredFiles.filter((f) => recentPaths.has(f.path));
  const otherFiles = filteredFiles.filter((f) => !recentPaths.has(f.path));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search files..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>
          {isLoading
            ? 'Loading files...'
            : files.length === 0
              ? 'No files found in workspace.'
              : 'No matching files found.'}
        </CommandEmpty>

        {recentFiles.length > 0 ? (
          <CommandGroup heading="Recent">
            {recentFiles.slice(0, 5).map((file) => (
              <CommandItem
                key={file.path}
                value={file.path}
                onSelect={handleSelect}
                className="flex items-center gap-2"
              >
                <FileIcon fileName={file.name} className="h-4 w-4 shrink-0" />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="truncate">{file.name}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {getDisplayPath(file.path)}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {otherFiles.length > 0 ? (
          <CommandGroup heading={recentFiles.length > 0 ? 'Files' : undefined}>
            {otherFiles.slice(0, 50).map((file) => (
              <CommandItem
                key={file.path}
                value={file.path}
                onSelect={handleSelect}
                className="flex items-center gap-2"
              >
                <FileIcon fileName={file.name} className="h-4 w-4 shrink-0" />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="truncate">{file.name}</span>
                  <span className="text-xs text-muted-foreground truncate">
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
