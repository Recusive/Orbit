import { Ellipsis, Search, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

import type { BrowserPanelProps } from '@/components/browser/browser-panel';
import type { TerminalPanelProps } from '@/components/terminal/terminal-panel';
import type { FileChange } from '@/stores/file/file-store';
import type { ViewedFile } from '@/stores/file/file-viewer-store';
import type { FC } from 'react';

import { FileIcon, FileViewer } from '@/components/files';
import { FilesChangedList, SourceControlTab } from '@/components/git';
import { useTauri } from '@/hooks/agent/use-tauri';
import { lspDidClose, lspDidOpen } from '@/lib/api/backend';
import { cn } from '@/lib/utils/utils';
import { useBrowserIsActive } from '@/stores/browser/browser-store';
import {
  useFileViewerStore,
  useHasOpenFiles,
  useOpenTabs,
  getLanguageFromPath,
} from '@/stores/file/file-viewer-store';
import { useUIStore, useTerminalPosition, useActivityTab } from '@/stores/ui/ui-store';
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

interface EditorTabProps {
  readonly file: ViewedFile;
  readonly isActive: boolean;
  readonly onSelect: () => void;
  readonly onClose: () => void;
}

/**
 * VS Code-style editor tab with border styling and close button
 */
const EditorTab: FC<EditorTabProps> = ({ file, isActive, onSelect, onClose }) => {
  const fileName = file.path.split('/').pop() ?? file.path;
  const isModified = file.isModified;

  const handleCloseClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    onClose();
  };

  return (
    <div
      onClick={onSelect}
      role="tab"
      aria-selected={isActive}
      aria-label={fileName}
      tabIndex={isActive ? 0 : -1}
      className={cn(
        'group relative flex items-center h-full px-3 text-[13px] cursor-pointer select-none shrink-0',
        'border-r border-border/50',
        isActive
          ? 'bg-chat-area text-foreground'
          : 'bg-sidebar text-muted-foreground hover:text-foreground'
      )}
      style={{ maxWidth: 180 }}
    >
      {/* Top border accent for active tab */}
      <div
        className={cn(
          'absolute top-0 inset-x-0 h-px transition-colors',
          isActive ? 'bg-primary' : 'bg-transparent'
        )}
      />

      {/* Bottom border - hide for active tab (connects to content) */}
      <div
        className={cn(
          'absolute bottom-0 inset-x-0 h-px',
          isActive ? 'bg-chat-area' : 'bg-border/50'
        )}
      />

      {/* File icon */}
      <FileIcon fileName={fileName} className="h-4 w-4 shrink-0" />

      {/* File name */}
      <span className={cn('ml-2 truncate', isModified && 'italic')}>{fileName}</span>

      {/* Modified indicator or close button */}
      <div className="ml-2 w-4 h-4 flex items-center justify-center shrink-0 relative">
        {/* Modified dot - show when modified, inactive, and not hovering */}
        {isModified && !isActive ? (
          <div className="absolute inset-0 flex items-center justify-center group-hover:hidden">
            <div className="w-2 h-2 rounded-full bg-foreground/50" />
          </div>
        ) : null}
        {/* Close button - show on hover, or always when active */}
        <button
          onClick={handleCloseClick}
          className={cn(
            'w-4 h-4 flex items-center justify-center rounded transition-all hover:bg-muted',
            isActive ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-70'
          )}
          aria-label={`Close ${fileName}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

interface TabsHeaderProps {
  readonly openTabs: ViewedFile[];
  readonly activeTabPath: string | null;
  readonly onSelectTab: (path: string) => void;
  readonly onCloseTab: (path: string) => void;
  readonly onToggleSearch: () => void;
}

/**
 * VS Code-style tabs header with custom scrollbar overlay
 * Uses overflow:hidden + wheel events + custom scrollbar element
 */
const TabsHeader: FC<TabsHeaderProps> = ({
  openTabs,
  activeTabPath,
  onSelectTab,
  onCloseTab,
  onToggleSearch,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ scrollLeft: 0, scrollWidth: 0, clientWidth: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const dragStartRef = useRef({ mouseX: 0, scrollLeft: 0 });

  // Update scroll state when tabs change or on scroll
  const updateScrollState = useCallback((): void => {
    const el = scrollContainerRef.current;
    if (el) {
      setScrollState({
        scrollLeft: el.scrollLeft,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      });
    }
  }, []);

  // Handle wheel scroll
  const handleWheel = useCallback(
    (e: React.WheelEvent): void => {
      const el = scrollContainerRef.current;
      if (el) {
        // Scroll horizontally with wheel (both deltaX and deltaY)
        el.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
        updateScrollState();
      }
    },
    [updateScrollState]
  );

  // Update scroll state when tabs change
  useEffect(() => {
    updateScrollState();
  }, [openTabs, updateScrollState]);

  // Calculate scrollbar dimensions
  const canScroll = scrollState.scrollWidth > scrollState.clientWidth;
  const scrollbarWidth = canScroll
    ? Math.max(30, (scrollState.clientWidth / scrollState.scrollWidth) * scrollState.clientWidth)
    : 0;
  const scrollbarLeft = canScroll
    ? (scrollState.scrollLeft / (scrollState.scrollWidth - scrollState.clientWidth)) *
      (scrollState.clientWidth - scrollbarWidth)
    : 0;

  // Handle scrollbar drag
  const handleScrollbarMouseDown = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      scrollLeft: scrollContainerRef.current?.scrollLeft ?? 0,
    };
  }, []);

  // Handle mouse move during drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent): void => {
      const el = scrollContainerRef.current;
      if (!el) return;

      const deltaX = e.clientX - dragStartRef.current.mouseX;
      // Convert scrollbar movement to scroll position
      const scrollRatio = (el.scrollWidth - el.clientWidth) / (el.clientWidth - scrollbarWidth);
      el.scrollLeft = dragStartRef.current.scrollLeft + deltaX * scrollRatio;
      updateScrollState();
    };

    const handleMouseUp = (): void => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, scrollbarWidth, updateScrollState]);

  // Handle click on scrollbar track to jump
  const handleTrackClick = useCallback(
    (e: React.MouseEvent): void => {
      const el = scrollContainerRef.current;
      const track = scrollbarRef.current;
      if (!el || !track) return;

      // Don't handle if clicking on thumb
      if ((e.target as HTMLElement).dataset.thumb) return;

      const rect = track.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickRatio = clickX / rect.width;
      el.scrollLeft = clickRatio * (el.scrollWidth - el.clientWidth);
      updateScrollState();
    },
    [updateScrollState]
  );

  // Show scrollbar when hovered or dragging
  const showScrollbar = isHovered || isDragging;

  return (
    <div
      className="flex shrink-0 bg-sidebar"
      style={{ height: 35 }}
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
    >
      {/* Scrollable tabs container */}
      <div className="relative flex-1 min-w-0">
        <div
          ref={scrollContainerRef}
          className="flex items-center h-full overflow-x-auto scrollbar-hide"
          onWheel={handleWheel}
          onScroll={updateScrollState}
          role="tablist"
          aria-label="Open files"
        >
          {openTabs.map((tab) => (
            <EditorTab
              key={tab.path}
              file={tab}
              isActive={tab.path === activeTabPath}
              onSelect={() => {
                onSelectTab(tab.path);
              }}
              onClose={() => {
                onCloseTab(tab.path);
              }}
            />
          ))}
        </div>

        {/* Custom scrollbar overlay - VS Code style, hidden until hover */}
        {canScroll ? (
          <div
            ref={scrollbarRef}
            className={cn(
              'absolute left-0 bottom-0 h-[6px] cursor-pointer transition-opacity duration-150',
              showScrollbar ? 'opacity-100' : 'opacity-0'
            )}
            style={{ width: scrollState.clientWidth }}
            onClick={handleTrackClick}
          >
            <div
              data-thumb="true"
              onMouseDown={handleScrollbarMouseDown}
              className={cn(
                'absolute top-[3px] h-[3px] rounded-full cursor-grab transition-colors',
                isDragging ? 'bg-foreground/60' : 'bg-foreground/30 hover:bg-foreground/50'
              )}
              style={{
                width: scrollbarWidth,
                left: scrollbarLeft,
              }}
            />
          </div>
        ) : null}
      </div>

      {/* Editor actions - VS Code style */}
      <div className="flex items-center h-full px-2 gap-0.5 shrink-0 border-l border-border/50 bg-sidebar">
        <button
          onClick={onToggleSearch}
          className="h-6 w-6 flex items-center justify-center rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-muted"
          title="Search (⌘F)"
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            // TODO: Show more actions menu
          }}
          className="h-6 w-6 flex items-center justify-center rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-muted"
          title="More Actions..."
        >
          <Ellipsis className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export const ActivityPanel: FC<ActivityPanelProps> = ({ width }) => {
  const hasOpenFiles = useHasOpenFiles();
  const openTabs = useOpenTabs();
  const activeTabPath = useFileViewerStore((state) => state.activeTabPath);
  const setActiveFileTab = useFileViewerStore((state) => state.setActiveTab);
  const closeTab = useFileViewerStore((state) => state.closeTab);
  const openFileWithDiff = useFileViewerStore((state) => state.openFileWithDiff);
  const toggleSearch = useFileViewerStore((state) => state.toggleSearch);
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
      {/* Header - Only show VS Code style tabs when files are open */}
      {activeTab === 'file' && hasOpenFiles ? (
        <TabsHeader
          openTabs={openTabs}
          activeTabPath={activeTabPath}
          onSelectTab={setActiveFileTab}
          onCloseTab={handleCloseTab}
          onToggleSearch={toggleSearch}
        />
      ) : null}

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
