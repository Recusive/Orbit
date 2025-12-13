import {
  FileCode,
  GitBranch,
  GitCompareArrows,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { FC } from 'react';

import { FileViewer } from '@/components/activity/file-viewer';
import { FilesChangedList } from '@/components/activity/files-changed-list';
import { SourceControlTab } from '@/components/activity/source-control-tab';
import { TerminalPanel } from '@/components/terminal/terminal-panel';
import { ButtonGroup } from '@/components/ui/button-group';
import { cn } from '@/lib/utils';
import { useFileViewerStore, useHasOpenFiles } from '@/stores/file-viewer-store';
import { useUIStore, useTerminalPosition } from '@/stores/ui-store';

interface ActivityPanelProps {
  readonly width: number;
}

type TabValue = 'file' | 'files' | 'source';

interface TabButtonProps {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly icon: FC<{ className?: string }>;
  readonly label: string;
  readonly compact?: boolean;
}

const TabButton: FC<TabButtonProps> = ({ active, onClick, icon: Icon, label, compact = false }) => {
  return (
    <button
      onClick={active ? undefined : onClick}
      disabled={active}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 text-xs font-medium transition-colors rounded select-none shrink-0',
        active
          ? 'bg-accent text-foreground cursor-default'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      )}
      title={label}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className={cn('truncate', compact ? 'hidden @[435px]:inline' : 'hidden @[350px]:inline')}>{label}</span>
    </button>
  );
};

export const ActivityPanel: FC<ActivityPanelProps> = ({ width }) => {
  const hasOpenFiles = useHasOpenFiles();
  const closeAllTabs = useFileViewerStore((state) => state.closeAllTabs);
  const toggleSearch = useFileViewerStore((state) => state.toggleSearch);
  const [activeTab, setActiveTab] = useState<TabValue>('files');
  const { bottomPanelOpen } = useUIStore();
  const terminalPosition = useTerminalPosition();
  const prevHasOpenFiles = useRef(hasOpenFiles);

  // Auto-switch to File tab only when files are first opened (not continuously)
  useEffect(() => {
    if (hasOpenFiles && !prevHasOpenFiles.current) {
      setActiveTab('file');
    }
    prevHasOpenFiles.current = hasOpenFiles;
  }, [hasOpenFiles]);

  const handleCloseFileViewer = (): void => {
    closeAllTabs();
    setActiveTab('files');
  };

  return (
    <div
      className="@container h-full flex flex-col bg-background shrink-0"
      style={{ width }}
    >
      {/* Tabs (directly at top - no separate header) */}
      <div className="flex items-center gap-2 px-4 pt-4 overflow-hidden">
        <div className="flex gap-1 min-w-0">
          {hasOpenFiles ? (
            <TabButton
              active={activeTab === 'file'}
              onClick={() => { setActiveTab('file'); }}
              icon={FileCode}
              label="File"
              compact
            />
          ) : null}
          <TabButton
            active={activeTab === 'files'}
            onClick={() => { setActiveTab('files'); }}
            icon={GitCompareArrows}
            label="Changed"
            compact={hasOpenFiles}
          />
          <TabButton
            active={activeTab === 'source'}
            onClick={() => { setActiveTab('source'); }}
            icon={GitBranch}
            label="Source"
            compact={hasOpenFiles}
          />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search bar - always visible */}
        <ButtonGroup className="h-7 shrink-0">
          <input
            type="text"
            placeholder="Search..."
            className="h-7 w-28 min-w-0 rounded-md rounded-r-none border border-r-0 border-border bg-muted/50 px-2 text-xs outline-none placeholder:text-muted-foreground focus:border-border focus:bg-muted"
          />
          <button
            onClick={toggleSearch}
            className={cn(
              'h-7 w-7 flex items-center justify-center border border-border bg-muted/50 hover:bg-accent transition-colors',
              hasOpenFiles ? 'border-l-0 border-r-0' : 'rounded-md rounded-l-none border-l-0'
            )}
            title="Search"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          {hasOpenFiles ? (
            <button
              onClick={handleCloseFileViewer}
              className="h-7 w-7 flex items-center justify-center rounded-md rounded-l-none border border-l-0 border-border bg-muted/50 hover:bg-accent transition-colors"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </ButtonGroup>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'file' && hasOpenFiles ? (
          <FileViewer />
        ) : activeTab === 'files' ? (
          <div className="h-full overflow-y-auto">
            <FilesChangedList />
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            <SourceControlTab />
          </div>
        )}
      </div>

      {/* Terminal Panel (bottom of activity panel) - only show when position is 'activity' */}
      {bottomPanelOpen && terminalPosition === 'activity' ? (
        <TerminalPanel variant="embedded" />
      ) : null}
    </div>
  );
};
