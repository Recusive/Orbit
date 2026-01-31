import { FileCode } from 'lucide-react';
import { useEffect } from 'react';

import { FileViewerContent } from './file-viewer-content';

import type { FC } from 'react';

import { ThinkingDots } from '@/components/ui/thinking-dots';
import {
  useActiveFile,
  useFileViewerLoading,
  useFileViewerStore,
} from '@/stores/file/file-viewer-store';

export const FileViewer: FC = () => {
  const activeFile = useActiveFile();
  const { isLoading, path: loadingPath } = useFileViewerLoading();
  const toggleSearch = useFileViewerStore((state) => state.toggleSearch);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Cmd+F to search - scoped by active file path for split view
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        if (activeFile?.path) {
          toggleSearch(activeFile.path);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [toggleSearch, activeFile?.path]);

  return (
    <div className="flex flex-col h-full bg-card relative">
      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <LoadingState path={loadingPath} />
        ) : activeFile ? (
          <FileViewerContent key={activeFile.path} file={activeFile} />
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
      <ThinkingDots size={32} className="mb-2" />
      <p className="text-sm">Loading {fileName}...</p>
    </div>
  );
};

const EmptyState: FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-card text-muted-foreground">
      <FileCode className="h-12 w-12 mb-4 opacity-50" />
      <p className="text-sm">No file open</p>
      <p className="text-xs mt-1 opacity-70">Click a file in the chat to view it here</p>
    </div>
  );
};
