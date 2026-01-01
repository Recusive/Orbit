import {
  ArrowLeft,
  ArrowRight,
  FileCode,
  GitBranch,
  GitCompareArrows,
  Globe,
  Search,
  X,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';

import type { BrowserPanelProps } from '@/components/browser/browser-panel';
import type { TerminalPanelProps } from '@/components/terminal/terminal-panel';
import type { FileChange } from '@/stores/file-store';
import type { ViewedFile } from '@/stores/file-viewer-store';
import type { FC } from 'react';

import { FileIcon, FileViewer } from '@/components/files';
import { FilesChangedList, SourceControlTab } from '@/components/git';
import { ButtonGroup } from '@/components/ui/button-group';
import { useTauri } from '@/hooks/use-tauri';
import { lspDidClose, lspDidOpen } from '@/lib/backend';
import { cn } from '@/lib/utils';
import { useBrowserIsActive } from '@/stores/browser-store';
import {
  useFileViewerStore,
  useHasOpenFiles,
  useOpenTabs,
  getLanguageFromPath,
} from '@/stores/file-viewer-store';
import { useUIStore, useTerminalPosition, useActivityTab } from '@/stores/ui-store';
import { generateUUID } from '@/types/protocol';

// Lazy load heavy components
const LazyBrowserPanel = lazy(() =>
  import('@/components/browser/browser-panel').then((m) => ({ default: m.BrowserPanel }))
);
const BrowserPanel: FC<BrowserPanelProps> = (props) => (
  <Suspense fallback={null}>
    <LazyBrowserPanel {...props} />
  </Suspense>
);

const LazyTerminalPanel = lazy(() =>
  import('@/components/terminal/terminal-panel').then((m) => ({ default: m.TerminalPanel }))
);
const TerminalPanel: FC<TerminalPanelProps> = (props) => (
  <Suspense fallback={null}>
    <LazyTerminalPanel {...props} />
  </Suspense>
);

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
        active ? 'text-foreground cursor-default' : 'text-muted-foreground hover:text-foreground'
      )}
      title={label}
    >
      {/* Tab background - Orbit style */}
      <div
        className={cn(
          'absolute inset-0 rounded-t-md transition-colors',
          active ? 'bg-sidebar-accent' : 'hover:bg-muted/50'
        )}
      />
      {/* Active indicator - bottom border accent */}
      {active ? <div className="absolute bottom-0 inset-x-0 h-0.5 bg-primary" /> : null}
      <Icon className="relative h-3.5 w-3.5 shrink-0" />
      <span
        className={cn(
          'relative truncate',
          compact ? 'hidden @[500px]:inline' : 'hidden @[440px]:inline'
        )}
      >
        {label}
      </span>
    </button>
  );
};

interface InlineFileTabProps {
  readonly file: ViewedFile;
  readonly isActive: boolean;
  readonly onSelect: () => void;
  readonly onClose: () => void;
}

const InlineFileTab: FC<InlineFileTabProps> = ({ file, isActive, onSelect, onClose }) => {
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
      {isActive ? <div className="absolute bottom-0 inset-x-0 h-0.5 bg-primary" /> : null}
      <FileIcon fileName={fileName} className="h-4 w-4" />
      <span className="truncate">{fileName}</span>
      <button
        onClick={handleCloseClick}
        className={cn(
          'h-4 w-4 flex items-center justify-center rounded transition-opacity',
          isActive
            ? 'opacity-70 hover:opacity-100'
            : 'opacity-0 group-hover:opacity-70 hover:opacity-100'
        )}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
};

export const ActivityPanel: FC<ActivityPanelProps> = ({ width }) => {
  const hasOpenFiles = useHasOpenFiles();
  const openTabs = useOpenTabs();
  const activeTabPath = useFileViewerStore((state) => state.activeTabPath);
  const setActiveFileTab = useFileViewerStore((state) => state.setActiveTab);
  const closeTab = useFileViewerStore((state) => state.closeTab);
  const toggleSearch = useFileViewerStore((state) => state.toggleSearch);
  const openFileWithDiff = useFileViewerStore((state) => state.openFileWithDiff);
  const goBack = useFileViewerStore((state) => state.goBack);
  const goForward = useFileViewerStore((state) => state.goForward);
  const activeTab = useActivityTab();
  const setActiveTab = useUIStore((state) => state.setActivityTab);
  const { bottomPanelOpen } = useUIStore();
  const terminalPosition = useTerminalPosition();
  const prevHasOpenFiles = useRef(hasOpenFiles);
  const isBrowserActive = useBrowserIsActive();
  const { postMessage } = useTauri({});
  const prevActiveTab = useRef(activeTab);

  // Auto-switch to File tab only when files are first opened
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

  // Handle closing a single tab with LSP notification
  const handleCloseTab = useCallback(
    (path: string): void => {
      // Notify LSP that document was closed
      lspDidClose(path).catch((err: unknown) => {
        console.warn('[ActivityPanel] Failed to notify LSP of file close:', err);
      });
      closeTab(path);
    },
    [closeTab]
  );

  // Open file from Changes tab with diff view
  const handleOpenChangedFile = useCallback(
    (file: FileChange): void => {
      if (file.diff && file.oldContent !== undefined && file.newContent !== undefined) {
        // Check if file is already open to avoid duplicate LSP notifications
        const isAlreadyOpen = openTabs.some((tab) => tab.path === file.path);

        openFileWithDiff(
          file.path,
          {
            oldContent: file.oldContent,
            newContent: file.newContent,
            diff: file.diff,
          },
          file.language
        );

        // Notify LSP if this is a newly opened file
        if (!isAlreadyOpen) {
          const language = file.language ?? getLanguageFromPath(file.path);
          lspDidOpen(file.path, language, file.newContent).catch((err: unknown) => {
            console.warn('[ActivityPanel] Failed to notify LSP of file open:', err);
          });
        }
      }
      setActiveTab('file');
    },
    [openFileWithDiff, setActiveTab, openTabs]
  );

  return (
    <div className="@container h-full flex flex-col bg-chat-area shrink-0" style={{ width }}>
      {/* Header - different view when on File tab vs other tabs */}
      <div
        className="flex items-center gap-2 px-4 overflow-hidden border-b border-border shrink-0"
        style={{ height: 35 }}
      >
        {activeTab === 'file' && hasOpenFiles ? (
          <>
            {/* File view header: "File:" label + navigation + inline file tabs + exit */}
            <div className="flex items-center gap-1.5 shrink-0">
              <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">File:</span>
            </div>

            {/* Navigation buttons - only show when there are multiple tabs */}
            {openTabs.length > 1 ? (
              <div className="flex items-center gap-0.5 shrink-0">
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

            {/* Inline file tabs */}
            <div className="flex items-center overflow-x-auto scrollbar-hide flex-1 min-w-0">
              {openTabs.map((tab) => (
                <InlineFileTab
                  key={tab.path}
                  file={tab}
                  isActive={tab.path === activeTabPath}
                  onSelect={() => {
                    setActiveFileTab(tab.path);
                  }}
                  onClose={() => {
                    handleCloseTab(tab.path);
                  }}
                />
              ))}
            </div>

            {/* Back to normal tabs button */}
            <button
              onClick={() => {
                setActiveTab('files');
              }}
              className="h-7 px-2 flex items-center justify-center gap-1 rounded-md border border-border bg-muted/50 hover:bg-accent transition-colors shrink-0 text-xs text-muted-foreground hover:text-foreground"
              title="Back to tabs"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden @[500px]:inline">Back</span>
            </button>
          </>
        ) : (
          <>
            {/* Normal tabs view */}
            <div className="flex gap-1 min-w-0">
              {hasOpenFiles ? (
                <TabButton
                  active={false}
                  onClick={() => {
                    setActiveTab('file');
                  }}
                  icon={FileCode}
                  label="File"
                  compact
                />
              ) : null}
              <TabButton
                active={activeTab === 'files'}
                onClick={() => {
                  setActiveTab('files');
                }}
                icon={GitCompareArrows}
                label="Changed"
                compact={hasOpenFiles}
              />
              <TabButton
                active={activeTab === 'source'}
                onClick={() => {
                  setActiveTab('source');
                }}
                icon={GitBranch}
                label="Source"
                compact={hasOpenFiles}
              />
              <TabButton
                active={activeTab === 'browser'}
                onClick={() => {
                  setActiveTab('browser');
                }}
                icon={Globe}
                label="Browser"
                compact={hasOpenFiles}
              />
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Search bar */}
            <ButtonGroup className="h-7 shrink-0">
              <input
                type="text"
                placeholder="Search..."
                className="h-7 w-28 min-w-0 rounded-md rounded-r-none border border-border bg-muted/50 px-2 text-xs outline-none placeholder:text-muted-foreground focus:bg-muted focus:ring-1 focus:ring-inset focus:ring-ring"
              />
              <button
                onClick={toggleSearch}
                className="h-7 w-7 flex items-center justify-center rounded-md rounded-l-none border border-l-0 border-border bg-muted/50 hover:bg-accent transition-colors"
                title="Search"
              >
                <Search className="h-3.5 w-3.5" />
              </button>
            </ButtonGroup>
          </>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'file' && hasOpenFiles ? (
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
