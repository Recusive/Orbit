import { createLogger } from '@orbit/common/lib';
import { Ellipsis, Search, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

import type { ViewedFile } from '@/stores/file/file-viewer-store';
import type { FC } from 'react';

import { FileIcon, FileViewer } from '@/components/files';
import { SourceControlTab } from '@/components/git';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { useTauri } from '@/hooks/agent/use-tauri';
import { lspDidClose } from '@/lib/api';
import { ACTIVITY_PANEL, cn } from '@/lib/utils';
import { useBrowserIsActive } from '@/stores/browser/browser-store';
import {
  useFileViewerStore,
  useHasOpenFiles,
  useOpenTabs,
  useWordWrap,
} from '@/stores/file/file-viewer-store';
import { useUIStore, useActivityTab, useReviewPanelOpen } from '@/stores/ui/ui-store';
import { generateUUID } from '@/types/protocol';

const logger = createLogger('ActivityPanel');

// Lazy load heavy components
const LazyBrowserPanel = lazy(() =>
  import('@/components/browser/browser-panel').then((m) => ({ default: m.BrowserPanel }))
);
const BrowserPanel: FC = () => (
  <Suspense fallback={null}>
    <LazyBrowserPanel />
  </Suspense>
);

interface ActivityPanelProps {
  /**
   * Whether this ActivityPanel instance manages browser visibility.
   * Only ONE instance should have this set to true to prevent duplicate
   * browser:show / browser:hide commands from competing effects.
   * Defaults to true for backwards compatibility.
   */
  readonly canManageBrowser?: boolean;
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
      data-tauri-drag-region={false}
      onClick={onSelect}
      role="tab"
      aria-selected={isActive}
      aria-label={fileName}
      tabIndex={isActive ? 0 : -1}
      className={cn(
        'group relative flex items-center h-full px-3 text-base cursor-pointer select-none shrink-0',
        'border-r border-lg-separator',
        isActive
          ? 'bg-editor-bg text-foreground'
          : 'bg-lg-control dark:bg-background text-muted-foreground hover:text-foreground'
      )}
      style={{ maxWidth: 180 }}
    >
      {/* Bottom border - hide for active tab (connects to content) */}
      <div
        className={cn(
          'absolute bottom-0 inset-x-0 h-px z-10',
          isActive ? 'bg-editor-bg' : 'bg-border/50'
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
            <div className="w-2 h-2 rounded-full bg-muted-foreground" />
          </div>
        ) : null}
        {/* Close button - show on hover, or always when active */}
        <button
          onClick={handleCloseClick}
          className={cn(
            'w-4 h-4 flex items-center justify-center rounded transition-[background-color,opacity] hover:bg-accent',
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
  readonly onToggleSearch: (path: string) => void;
  readonly wordWrap: boolean;
  readonly onToggleWordWrap: () => void;
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
  wordWrap,
  onToggleWordWrap,
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
      if ((e.target as HTMLElement).dataset['thumb']) return;

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
      data-tauri-drag-region
      className="flex shrink-0 bg-lg-control dark:bg-background relative"
      style={{ height: ACTIVITY_PANEL.TABS_HEADER_HEIGHT }}
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
    >
      {/* Bottom border line - spans full width, tabs' bottom borders overlay this */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-border/50" />

      {/* Scrollable tabs container */}
      <div data-tauri-drag-region className="relative flex-1 min-w-0">
        <div
          data-tauri-drag-region
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
                isDragging
                  ? 'bg-muted-foreground'
                  : 'bg-muted-foreground/50 hover:bg-muted-foreground'
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
      <div
        data-tauri-drag-region={false}
        className="flex items-center h-full px-2 gap-0.5 shrink-0 border-l border-divider bg-lg-control dark:bg-background"
      >
        <button
          onClick={() => {
            if (activeTabPath) onToggleSearch(activeTabPath);
          }}
          className="h-6 w-6 flex items-center justify-center rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
          title="Search (⌘F)"
        >
          <Search className="h-4 w-4" />
        </button>
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="h-6 w-6 flex items-center justify-center rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
              title="More Actions..."
            >
              <Ellipsis className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48 p-2 border-lg-border">
            <div className="flex items-center justify-between">
              <label htmlFor="word-wrap-toggle" className="text-sm cursor-pointer">
                Line Wrap
              </label>
              <Switch id="word-wrap-toggle" checked={wordWrap} onCheckedChange={onToggleWordWrap} />
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};

export const ActivityPanel: FC<ActivityPanelProps> = ({ canManageBrowser = true }) => {
  const hasOpenFiles = useHasOpenFiles();
  const openTabs = useOpenTabs();
  const activeTabPath = useFileViewerStore((state) => state.activeTabPath);
  const setActiveFileTab = useFileViewerStore((state) => state.setActiveTab);
  const closeTab = useFileViewerStore((state) => state.closeTab);
  const toggleSearch = useFileViewerStore((state) => state.toggleSearch);
  const wordWrap = useWordWrap();
  const toggleWordWrap = useFileViewerStore((state) => state.toggleWordWrap);
  const activeTab = useActivityTab();
  const reviewPanelOpen = useReviewPanelOpen();
  const setActiveTab = useUIStore((state) => state.setActivityTab);
  const prevHasOpenFiles = useRef(hasOpenFiles);
  const isBrowserActive = useBrowserIsActive();
  const { postMessage } = useTauri({});

  // Auto-switch to File tab only when files are first opened
  useEffect(() => {
    if (hasOpenFiles && !prevHasOpenFiles.current) {
      setActiveTab('file');
    }
    prevHasOpenFiles.current = hasOpenFiles;
  }, [hasOpenFiles, setActiveTab]);

  // Browser visibility effect — sends show/hide based on current state.
  // Only the instance with canManageBrowser=true runs this, preventing duplicate
  // show/hide commands from competing ActivityPanel instances (CSS display toggle).
  // IMPORTANT: No cleanup here! Cleanup in a multi-dep effect fires on EVERY dep
  // change (not just unmount), which causes hide→show flashes that blank the webview.
  const isBrowserActiveRef = useRef(isBrowserActive);
  isBrowserActiveRef.current = isBrowserActive;

  useEffect(() => {
    if (!canManageBrowser || !isBrowserActive) return;

    const shouldShow = reviewPanelOpen && activeTab === 'browser';

    postMessage({
      type: shouldShow ? 'browser:show' : 'browser:hide',
      uuid: generateUUID(),
    });
  }, [canManageBrowser, activeTab, isBrowserActive, postMessage, reviewPanelOpen]);

  // Separate unmount cleanup — only fires when component is truly destroyed
  // (panel collapsed or layout switch), not on every dependency change.
  useEffect(() => {
    if (!canManageBrowser) return;

    return (): void => {
      if (isBrowserActiveRef.current) {
        postMessage({
          type: 'browser:hide',
          uuid: generateUUID(),
        });
      }
    };
  }, [canManageBrowser, postMessage]);

  // Handle closing a single tab with LSP notification
  // Only call lspDidClose for diff tabs - CodeMirrorEditor handles LSP lifecycle
  // for normal file tabs on unmount to avoid duplicate close calls
  const handleCloseTab = useCallback(
    (path: string): void => {
      const tab = openTabs.find((t) => t.path === path);
      if (tab?.viewMode === 'diff') {
        // Diff view doesn't mount CodeMirrorEditor, so close LSP here
        lspDidClose(path).catch((err: unknown) => {
          logger.warn('Failed to notify LSP of file close', { path, error: err });
        });
      }
      closeTab(path);
    },
    [closeTab, openTabs]
  );

  // Content section - extracted for use in allotment
  const contentSection = (
    <>
      {/* Header - Only show VS Code style tabs when files are open */}
      {activeTab === 'file' && hasOpenFiles ? (
        <TabsHeader
          openTabs={openTabs}
          activeTabPath={activeTabPath}
          onSelectTab={setActiveFileTab}
          onCloseTab={handleCloseTab}
          onToggleSearch={toggleSearch}
          wordWrap={wordWrap}
          onToggleWordWrap={toggleWordWrap}
        />
      ) : null}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'file' ? (
          <FileViewer />
        ) : activeTab === 'browser' ? (
          <BrowserPanel />
        ) : (
          <div className="h-full overflow-y-auto">
            <SourceControlTab />
          </div>
        )}
      </div>
    </>
  );

  return (
    <div
      className="@container h-full w-full flex flex-col"
      style={{ minWidth: ACTIVITY_PANEL.MIN_WIDTH }}
    >
      {contentSection}
    </div>
  );
};
