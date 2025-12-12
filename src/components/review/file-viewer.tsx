import { FileCode, Loader2 } from 'lucide-react';
import { useEffect } from 'react';

import { FileViewerContent } from './file-viewer-content';
import { FileViewerHeader } from './file-viewer-header';

import type { FC } from 'react';

import { useActiveFile, useFileViewerLoading, useFileViewerStore } from '@/stores/file-viewer-store';

export const FileViewer: FC = () => {
  const activeFile = useActiveFile();
  const { isLoading, path: loadingPath } = useFileViewerLoading();
  const toggleSearch = useFileViewerStore((state) => state.toggleSearch);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Cmd+F to search
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        toggleSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [toggleSearch]);

  return (
    <div className="flex flex-col h-full bg-background relative">
      <FileViewerHeader />

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <LoadingState path={loadingPath} />
        ) : activeFile ? (
          <FileViewerContent file={activeFile} />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
};

interface LoadingStateProps {
  readonly path: string | null;
}

const LoadingState: FC<LoadingStateProps> = ({ path }) => {
  const fileName = path?.split('/').pop() ?? 'file';

  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin mb-2" />
      <p className="text-sm">Loading {fileName}...</p>
    </div>
  );
};

const EmptyState: FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
      <FileCode className="h-12 w-12 mb-4 opacity-50" />
      <p className="text-sm">No file open</p>
      <p className="text-xs mt-1 opacity-70">Click a file in the chat to view it here</p>
    </div>
  );
};
