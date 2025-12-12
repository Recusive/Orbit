import { X } from 'lucide-react';

import type { ViewedFile } from '@/stores/file-viewer-store';
import type { FC } from 'react';

import { cn } from '@/lib/utils';
import { useFileViewerStore } from '@/stores/file-viewer-store';

export const FileViewerHeader: FC = () => {
  const openTabs = useFileViewerStore((state) => state.openTabs);
  const activeTabPath = useFileViewerStore((state) => state.activeTabPath);
  const setActiveTab = useFileViewerStore((state) => state.setActiveTab);
  const closeTab = useFileViewerStore((state) => state.closeTab);

  // Only show tabs row if there are open tabs
  if (openTabs.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center overflow-x-auto scrollbar-thin border-b border-border shrink-0 px-1 py-1">
      {openTabs.map((tab) => (
        <FileTab
          key={tab.path}
          file={tab}
          isActive={tab.path === activeTabPath}
          onSelect={() => { setActiveTab(tab.path); }}
          onClose={() => { closeTab(tab.path); }}
        />
      ))}
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
        'group flex items-center gap-1.5 px-2 py-1 text-xs cursor-pointer rounded-t transition-colors max-w-[160px]',
        isActive
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      )}
    >
      <FileIcon language={file.language} />
      <span className="truncate">{fileName}</span>
      <button
        onClick={handleCloseClick}
        className={cn(
          'h-4 w-4 flex items-center justify-center rounded transition-opacity',
          isActive ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-70 hover:opacity-100'
        )}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
};

interface FileIconProps {
  readonly language: string;
}

const FileIcon: FC<FileIconProps> = ({ language }) => {
  // Simple colored dot for now - can be enhanced with actual file icons
  const getColor = (): string => {
    switch (language) {
      case 'typescript':
      case 'tsx':
        return 'bg-blue-500';
      case 'javascript':
      case 'jsx':
        return 'bg-yellow-500';
      case 'css':
      case 'scss':
      case 'less':
        return 'bg-purple-500';
      case 'html':
        return 'bg-orange-500';
      case 'json':
        return 'bg-green-500';
      case 'markdown':
        return 'bg-gray-500';
      case 'python':
        return 'bg-blue-400';
      case 'rust':
        return 'bg-orange-600';
      case 'go':
        return 'bg-cyan-500';
      default:
        return 'bg-gray-400';
    }
  };

  return <div className={cn('h-2 w-2 rounded-full shrink-0', getColor())} />;
};
