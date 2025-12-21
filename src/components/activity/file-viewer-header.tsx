import { ArrowLeft, ArrowRight, FileCode, GitCompareArrows, X } from 'lucide-react';

import type { ViewedFile } from '@/stores/file-viewer-store';
import type { FC } from 'react';

import { FileIcon } from '@/components/files/file-icon';
import { lspDidClose } from '@/lib/backend';
import { cn } from '@/lib/utils';
import { useActiveFile, useFileViewerStore } from '@/stores/file-viewer-store';

export const FileViewerHeader: FC = () => {
  const openTabs = useFileViewerStore((state) => state.openTabs);
  const activeTabPath = useFileViewerStore((state) => state.activeTabPath);
  const setActiveTab = useFileViewerStore((state) => state.setActiveTab);
  const closeTab = useFileViewerStore((state) => state.closeTab);
  const goBack = useFileViewerStore((state) => state.goBack);
  const goForward = useFileViewerStore((state) => state.goForward);
  const toggleViewMode = useFileViewerStore((state) => state.toggleViewMode);
  const activeFile = useActiveFile();

  // Only show tabs row if there are open tabs
  if (openTabs.length === 0) {
    return null;
  }

  const handleToggleViewMode = (): void => {
    if (activeFile) {
      toggleViewMode(activeFile.path);
    }
  };

  const handleCloseTab = (path: string): void => {
    closeTab(path);

    // Notify LSP that document was closed
    lspDidClose(path).catch((err: unknown) => {
      console.warn('[FileViewerHeader] Failed to notify LSP of file close:', err);
    });
  };

  return (
    <div className="flex items-center border-b border-border shrink-0 px-1 pt-1">
      {/* Navigation buttons - only show when there are multiple tabs */}
      {openTabs.length > 1 ? (
        <div className="flex items-center gap-0.5 shrink-0 mr-1">
          <button
            onClick={goBack}
            className="h-6 w-6 flex items-center justify-center rounded transition-colors hover:bg-accent opacity-70 hover:opacity-100"
            title="Previous tab"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={goForward}
            className="h-6 w-6 flex items-center justify-center rounded transition-colors hover:bg-accent opacity-70 hover:opacity-100"
            title="Next tab"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {/* File tabs */}
      <div className="flex items-center overflow-x-auto scrollbar-thin flex-1 min-w-0">
        {openTabs.map((tab) => (
          <FileTab
            key={tab.path}
            file={tab}
            isActive={tab.path === activeTabPath}
            onSelect={() => {
              setActiveTab(tab.path);
            }}
            onClose={() => {
              handleCloseTab(tab.path);
            }}
          />
        ))}
      </div>

      {/* View mode toggle - show when active file has diff data */}
      {activeFile?.diffData ? (
        <button
          onClick={handleToggleViewMode}
          className={cn(
            'h-6 w-6 flex items-center justify-center rounded transition-colors shrink-0 ml-1',
            'hover:bg-accent opacity-70 hover:opacity-100'
          )}
          title={activeFile.viewMode === 'diff' ? 'Show file content' : 'Show diff view'}
        >
          {activeFile.viewMode === 'diff' ? (
            <FileCode className="h-3.5 w-3.5" />
          ) : (
            <GitCompareArrows className="h-3.5 w-3.5" />
          )}
        </button>
      ) : null}
    </div>
  );
};

interface FileTabProps {
  readonly file: ViewedFile;
  readonly isActive: boolean;
  readonly onSelect: () => void;
  readonly onClose: () => void;
}

const FileTab: FC<FileTabProps> = ({ file, isActive, onSelect, onClose }) => {
  const fileName = file.path.split('/').pop() ?? file.path;

  const handleCloseClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    onClose();
  };

  return (
    <div
      onClick={onSelect}
      className={cn(
        'relative group flex items-center gap-1.5 px-2 py-1 text-xs cursor-pointer rounded-t transition-colors max-w-[160px]',
        isActive
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      )}
    >
      {/* Active indicator - brand coral bottom border */}
      {isActive ? <div className="absolute bottom-0 inset-x-0 h-0.5 bg-brand-coral" /> : null}
      <FileIcon fileName={fileName} className="h-4 w-4" />
      <span className="truncate">{fileName}</span>
      {/* Modified indicator - show dot when file has unsaved changes */}
      {file.isModified ? (
        <span className="h-2 w-2 rounded-full bg-brand-coral shrink-0" title="Unsaved changes" />
      ) : (
        <button
          onClick={handleCloseClick}
          className={cn(
            'h-4 w-4 flex items-center justify-center rounded transition-opacity shrink-0',
            isActive
              ? 'opacity-70 hover:opacity-100'
              : 'opacity-0 group-hover:opacity-70 hover:opacity-100'
          )}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
};
