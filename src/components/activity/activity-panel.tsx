import {
  FileCode,
  GitBranch,
  GitCompareArrows,
  Globe,
  Search,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

import type { FileChange } from '@/stores/file-store';
import type { FC } from 'react';

import { FileViewer } from '@/components/activity/file-viewer';
import { FilesChangedList } from '@/components/activity/files-changed-list';
import { SourceControlTab } from '@/components/activity/source-control-tab';
import { BrowserPanel } from '@/components/browser';
import { TerminalPanel } from '@/components/terminal/terminal-panel';
import { ButtonGroup } from '@/components/ui/button-group';
import { useTauri } from '@/hooks/use-tauri';
import { cn } from '@/lib/utils';
import { useBrowserIsActive } from '@/stores/browser-store';
import { useFileViewerStore, useHasOpenFiles } from '@/stores/file-viewer-store';
import { useUIStore, useTerminalPosition, useActivityTab } from '@/stores/ui-store';
import { generateUUID } from '@/types/protocol';


interface ActivityPanelProps {
  readonly width: number;
}

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
        'relative flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors select-none shrink-0',
        active
          ? 'text-foreground cursor-default'
          : 'text-muted-foreground hover:text-foreground'
      )}
      title={label}
    >
      {/* Tab background - Orbit style */}
      <div
        className={cn(
          'absolute inset-0 rounded-t-md transition-colors',
          active
            ? 'bg-sidebar-accent'
            : 'hover:bg-muted/50'
        )}
      />
      {/* Active indicator - bottom border accent */}
      {active ? (
        <div className="absolute bottom-0 inset-x-0 h-0.5 bg-primary" />
      ) : null}
      <Icon className="relative h-3.5 w-3.5 shrink-0" />
      <span className={cn('relative truncate', compact ? 'hidden @[435px]:inline' : 'hidden @[440px]:inline')}>{label}</span>
    </button>
  );
};

export const ActivityPanel: FC<ActivityPanelProps> = ({ width }) => {
  const hasOpenFiles = useHasOpenFiles();
  const closeAllTabs = useFileViewerStore((state) => state.closeAllTabs);
  const toggleSearch = useFileViewerStore((state) => state.toggleSearch);
  const openFileWithDiff = useFileViewerStore((state) => state.openFileWithDiff);
  const activeTab = useActivityTab();
  const setActiveTab = useUIStore((state) => state.setActivityTab);
  const { bottomPanelOpen } = useUIStore();
  const terminalPosition = useTerminalPosition();
  const prevHasOpenFiles = useRef(hasOpenFiles);
  const isBrowserActive = useBrowserIsActive();
  const { postMessage } = useTauri({});
  const prevActiveTab = useRef(activeTab);

  // Auto-switch to File tab only when files are first opened (not continuously)
  useEffect(() => {
    if (hasOpenFiles && !prevHasOpenFiles.current) {
      setActiveTab('file');
    }
    prevHasOpenFiles.current = hasOpenFiles;
  }, [hasOpenFiles, setActiveTab]);

  // Track if this is the first render (for mount logic)
  const isFirstRender = useRef(true);
  // Track previous browser active state to detect when browser is created
  const prevBrowserActive = useRef(isBrowserActive);

  // Send browser visibility messages when tab changes or panel mounts/unmounts
  // This is handled here (in ActivityPanel) rather than in BrowserPanel because
  // BrowserPanel unmounts when switching away, and cleanup effects are unreliable
  useEffect(() => {
    const isBrowserTab = activeTab === 'browser';
    const browserJustBecameActive = isBrowserActive && !prevBrowserActive.current;

    // Update browser active tracking
    prevBrowserActive.current = isBrowserActive;

    // Only send messages if browser has been created
    if (!isBrowserActive) {
      // Don't update prevActiveTab or isFirstRender when browser isn't active
      // This ensures we send browser:show when it becomes active
      return;
    }

    // Browser just became active - show it if on browser tab
    if (browserJustBecameActive) {
      if (isBrowserTab) {
        postMessage({
          type: 'browser:show',
          uuid: generateUUID(),
        });
      }
      prevActiveTab.current = activeTab;
      isFirstRender.current = false;
      return;
    }

    // On first render (panel just mounted/re-opened), show browser if on browser tab
    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (isBrowserTab) {
        postMessage({
          type: 'browser:show',
          uuid: generateUUID(),
        });
      }
      prevActiveTab.current = activeTab;
      return;
    }

    const wasBrowserTab = prevActiveTab.current === 'browser';

    if (wasBrowserTab && !isBrowserTab) {
      // Switching AWAY from Browser tab - hide the BrowserView
      postMessage({
        type: 'browser:hide',
        uuid: generateUUID(),
      });
    } else if (!wasBrowserTab && isBrowserTab) {
      // Switching TO Browser tab - show the BrowserView
      postMessage({
        type: 'browser:show',
        uuid: generateUUID(),
      });
    }

    prevActiveTab.current = activeTab;
  }, [activeTab, isBrowserActive, postMessage]);

  // Hide browser when ActivityPanel unmounts (panel collapsed)
  // Use a ref to track current state for cleanup
  const isBrowserActiveRef = useRef(isBrowserActive);
  isBrowserActiveRef.current = isBrowserActive;

  useEffect(() => {
    return () => {
      // Cleanup: hide browser when panel collapses
      if (isBrowserActiveRef.current) {
        postMessage({
          type: 'browser:hide',
          uuid: generateUUID(),
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- postMessage is stable, we want cleanup to run only on unmount
  }, []);

  const handleCloseFileViewer = (): void => {
    closeAllTabs();
    setActiveTab('files');
  };

  // Open file from Changes tab with diff view
  const handleOpenChangedFile = useCallback((file: FileChange): void => {
    if (file.diff && file.oldContent !== undefined && file.newContent !== undefined) {
      openFileWithDiff(file.path, {
        oldContent: file.oldContent,
        newContent: file.newContent,
        diff: file.diff,
      }, file.language);
    }
    setActiveTab('file');
  }, [openFileWithDiff, setActiveTab]);

  return (
    <div
      className="@container h-full flex flex-col bg-background shrink-0"
      style={{ width }}
    >
      {/* Tabs (directly at top - no separate header) */}
      <div className="flex items-center gap-2 px-4 pt-2 overflow-hidden">
        <div className="flex gap-1 min-w-0">
          <TabButton
            active={activeTab === 'file'}
            onClick={() => { setActiveTab('file'); }}
            icon={FileCode}
            label="File"
            compact
          />
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
          <TabButton
            active={activeTab === 'browser'}
            onClick={() => { setActiveTab('browser'); }}
            icon={Globe}
            label="Browser"
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
            className="h-7 w-28 min-w-0 rounded-md rounded-r-none border border-border bg-muted/50 px-2 text-xs outline-none placeholder:text-muted-foreground focus:bg-muted focus:ring-1 focus:ring-inset focus:ring-ring"
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
        {activeTab === 'file' ? (
          <FileViewer />
        ) : activeTab === 'files' ? (
          <div className="h-full overflow-y-auto">
            <FilesChangedList onOpenFile={handleOpenChangedFile} />
          </div>
        ) : activeTab === 'browser' ? (
          <BrowserPanel width={width} />
        ) : (
          <div className="h-full overflow-y-auto">
            <SourceControlTab />
          </div>
        )}
      </div>

      {/* Terminal Panel (bottom of activity panel) - show when position is 'activity' */}
      {terminalPosition === 'activity' ? (
        <TerminalPanel variant="embedded" collapsed={!bottomPanelOpen} />
      ) : null}
    </div>
  );
};
