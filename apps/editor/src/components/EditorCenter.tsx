/**
 * EditorCenter - Main code editor area with file tabs and terminal
 *
 * Layout:
 * ┌─────────────────────────────────────┐
 * │  [Tab1] [Tab2] [Tab3]    [Actions]  │  <- File tabs
 * ├─────────────────────────────────────┤
 * │                                     │
 * │         CodeMirror Editor           │  <- Main editor
 * │                                     │
 * ├─────────────────────────────────────┤
 * │         Terminal (optional)         │  <- Bottom panel
 * └─────────────────────────────────────┘
 */
import { Columns2, Ellipsis, Search, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { TerminalPanelProps } from '@/components/terminal/terminal-panel';
import type { ViewedFile } from '@/stores/file/file-viewer-store';
import type { AllotmentHandle } from 'allotment';
import type { FC } from 'react';

import { FileIcon, FileViewer, FileViewerContent } from '@/components/files';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Switch } from '@/components/ui/switch';
import { lspDidClose } from '@/lib/api';
import { TERMINAL_PANEL, ACTIVITY_PANEL } from '@/lib/utils/constants';
import { cn } from '@/lib/utils/utils';
import {
  useFileViewerStore,
  useHasOpenFiles,
  useOpenTabs,
  useWordWrap,
} from '@/stores/file/file-viewer-store';
import { useUIStore, useBottomPanelOpen, useBottomPanelHeight } from '@/stores/ui/ui-store';

// Lazy load terminal
const LazyTerminalPanel = lazy(() =>
  import('@/components/terminal/terminal-panel').then((m) => ({ default: m.TerminalPanel }))
);
const TerminalPanel: FC<TerminalPanelProps> = (props) => (
  <Suspense fallback={null}>
    <LazyTerminalPanel {...props} />
  </Suspense>
);

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
        'group relative flex items-center h-full px-3 text-base cursor-pointer select-none shrink-0',
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
          'absolute bottom-0 inset-x-0 h-px z-10',
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
  readonly wordWrap: boolean;
  readonly onToggleWordWrap: () => void;
  readonly isSplit?: boolean | undefined;
  readonly onToggleSplit?: (() => void) | undefined;
}

/**
 * VS Code-style tabs header with custom scrollbar overlay
 */
const TabsHeader: FC<TabsHeaderProps> = ({
  openTabs,
  activeTabPath,
  onSelectTab,
  onCloseTab,
  onToggleSearch,
  wordWrap,
  onToggleWordWrap,
  isSplit,
  onToggleSplit,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ scrollLeft: 0, scrollWidth: 0, clientWidth: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const dragStartRef = useRef({ mouseX: 0, scrollLeft: 0 });

  // Update scroll state
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
        el.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
        updateScrollState();
      }
    },
    [updateScrollState]
  );

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

  const handleScrollbarMouseDown = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      scrollLeft: scrollContainerRef.current?.scrollLeft ?? 0,
    };
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent): void => {
      const el = scrollContainerRef.current;
      if (!el) return;

      const deltaX = e.clientX - dragStartRef.current.mouseX;
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

  const handleTrackClick = useCallback(
    (e: React.MouseEvent): void => {
      const el = scrollContainerRef.current;
      const track = scrollbarRef.current;
      if (!el || !track) return;

      if ((e.target as HTMLElement).dataset['thumb']) return;

      const rect = track.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickRatio = clickX / rect.width;
      el.scrollLeft = clickRatio * (el.scrollWidth - el.clientWidth);
      updateScrollState();
    },
    [updateScrollState]
  );

  const showScrollbar = isHovered || isDragging;

  return (
    <div
      className="flex shrink-0 bg-sidebar relative"
      style={{ height: ACTIVITY_PANEL.TABS_HEADER_HEIGHT }}
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
    >
      {/* Bottom border line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-border/50" />

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

        {/* Custom scrollbar overlay */}
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

      {/* Editor actions */}
      <div className="flex items-center h-full px-2 gap-0.5 shrink-0 border-l border-divider bg-sidebar">
        <button
          onClick={onToggleSearch}
          className="h-6 w-6 flex items-center justify-center rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-muted"
          title="Search (⌘F)"
        >
          <Search className="h-4 w-4" />
        </button>
        {onToggleSplit ? (
          <button
            onClick={onToggleSplit}
            className={cn(
              'h-6 w-6 flex items-center justify-center rounded transition-colors hover:bg-muted',
              isSplit ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
            title="Split Editor (⌘\\)"
          >
            <Columns2 className="h-4 w-4" />
          </button>
        ) : null}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="h-6 w-6 flex items-center justify-center rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-muted"
              title="More Actions..."
            >
              <Ellipsis className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48 p-2 border-border/50">
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

/**
 * Empty state when no files are open
 */
const EmptyState: FC = () => (
  <div className="h-full w-full flex items-center justify-center bg-chat-area">
    <div className="text-center text-muted-foreground">
      <p className="text-lg font-medium">No file open</p>
      <p className="text-sm mt-1">Open a file from the Explorer to start editing</p>
    </div>
  </div>
);

/**
 * File viewer for a specific path (used in split view)
 */
interface SplitFileViewerProps {
  readonly file: ViewedFile | null;
}

const SplitFileViewer: FC<SplitFileViewerProps> = ({ file }) => {
  if (!file) {
    return <EmptyState />;
  }

  // Use key to ensure React creates a new instance when file changes
  return <FileViewerContent key={`split-${file.path}`} file={file} />;
};

export const EditorCenter: FC = () => {
  const hasOpenFiles = useHasOpenFiles();
  const openTabs = useOpenTabs();
  const activeTabPath = useFileViewerStore((state) => state.activeTabPath);
  const setActiveFileTab = useFileViewerStore((state) => state.setActiveTab);
  const closeTab = useFileViewerStore((state) => state.closeTab);
  const toggleSearch = useFileViewerStore((state) => state.toggleSearch);
  const wordWrap = useWordWrap();
  const toggleWordWrap = useFileViewerStore((state) => state.toggleWordWrap);

  const bottomPanelOpen = useBottomPanelOpen();
  const bottomPanelHeight = useBottomPanelHeight();
  const setBottomPanelHeight = useUIStore((state) => state.setBottomPanelHeight);

  // Split editor state - right pane has its OWN independent tabs
  const [isSplit, setIsSplit] = useState(false);
  const [rightPaneTabs, setRightPaneTabs] = useState<string[]>([]); // Paths open in right pane
  const [rightPaneActiveTab, setRightPaneActiveTab] = useState<string | null>(null);

  // Auto-close split when no files are open
  useEffect(() => {
    if (!hasOpenFiles && isSplit) {
      setIsSplit(false);
      setRightPaneTabs([]);
      setRightPaneActiveTab(null);
    }
  }, [hasOpenFiles, isSplit]);

  // Get files for right pane - only files that are in rightPaneTabs
  const rightPaneFiles = useMemo(() => {
    return openTabs.filter((t) => rightPaneTabs.includes(t.path));
  }, [openTabs, rightPaneTabs]);

  // Get the active file for the right pane
  const rightPaneActiveFile = useMemo(() => {
    return rightPaneFiles.find((f) => f.path === rightPaneActiveTab) ?? null;
  }, [rightPaneFiles, rightPaneActiveTab]);

  // Clean up right pane tabs when files are closed globally
  useEffect(() => {
    if (!isSplit) return;
    const openPaths = new Set(openTabs.map((t) => t.path));
    const validRightTabs = rightPaneTabs.filter((p) => openPaths.has(p));

    if (validRightTabs.length !== rightPaneTabs.length) {
      setRightPaneTabs(validRightTabs);
      // Update active tab if it was removed
      if (rightPaneActiveTab && !openPaths.has(rightPaneActiveTab)) {
        setRightPaneActiveTab(validRightTabs[0] ?? null);
      }
    }

    // Close split if no right pane tabs remain
    if (validRightTabs.length === 0) {
      setIsSplit(false);
      setRightPaneActiveTab(null);
    }
  }, [isSplit, openTabs, rightPaneTabs, rightPaneActiveTab]);

  const toggleSplit = useCallback((): void => {
    if (isSplit) {
      // Close split
      setIsSplit(false);
      setRightPaneTabs([]);
      setRightPaneActiveTab(null);
    } else if (hasOpenFiles && activeTabPath) {
      // Open split - right pane starts with current file
      setIsSplit(true);
      setRightPaneTabs([activeTabPath]);
      setRightPaneActiveTab(activeTabPath);
    }
  }, [isSplit, activeTabPath, hasOpenFiles]);

  // Handle selecting a tab in the right pane
  const handleRightPaneSelectTab = useCallback((path: string): void => {
    // Add to right pane tabs if not already there
    setRightPaneTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setRightPaneActiveTab(path);
  }, []);

  // Handle closing a tab in the right pane (independent from left pane)
  const handleRightPaneCloseTab = useCallback(
    (path: string): void => {
      setRightPaneTabs((prev) => prev.filter((p) => p !== path));
      if (rightPaneActiveTab === path) {
        // Switch to another tab in the right pane
        const remaining = rightPaneTabs.filter((p) => p !== path);
        if (remaining.length > 0) {
          setRightPaneActiveTab(remaining[0] ?? null);
        } else {
          // No tabs left - close split
          setIsSplit(false);
          setRightPaneActiveTab(null);
        }
      }
    },
    [rightPaneTabs, rightPaneActiveTab]
  );

  const terminalAllotmentRef = useRef<AllotmentHandle>(null);

  // Resize terminal when bottomPanelOpen changes
  useEffect(() => {
    const allotment = terminalAllotmentRef.current;
    if (!allotment) return;
    allotment.reset();
  }, [bottomPanelOpen]);

  // Track terminal size when user drags
  const handleTerminalSizeChange = useCallback(
    (sizes: number[]): void => {
      const terminalSize = sizes[1];
      if (
        terminalSize !== undefined &&
        terminalSize > TERMINAL_PANEL.DRAG_THRESHOLD &&
        bottomPanelOpen
      ) {
        setBottomPanelHeight(terminalSize);
      }
    },
    [bottomPanelOpen, setBottomPanelHeight]
  );

  // Handle closing a tab with LSP notification
  const handleCloseTab = useCallback(
    (path: string): void => {
      lspDidClose(path).catch((err: unknown) => {
        console.warn('[EditorCenter] Failed to notify LSP of file close:', err);
      });
      closeTab(path);
    },
    [closeTab]
  );

  // Render tabs header - each pane can have different tabs
  const renderTabsHeader = (
    tabs: ViewedFile[],
    activePath: string | null,
    onSelectTab: (path: string) => void,
    onCloseTab: (path: string) => void,
    showSplitButton: boolean
  ): React.ReactNode =>
    tabs.length > 0 ? (
      <TabsHeader
        openTabs={tabs}
        activeTabPath={activePath}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        onToggleSearch={toggleSearch}
        wordWrap={wordWrap}
        onToggleWordWrap={toggleWordWrap}
        isSplit={isSplit}
        onToggleSplit={showSplitButton ? toggleSplit : undefined}
      />
    ) : null;

  // Content section - either single or split view
  const contentSection = isSplit ? (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      {/* Left pane - uses global store tabs */}
      <ResizablePanel minSize={200} preferredSize="50%">
        <div className="h-full flex flex-col">
          {renderTabsHeader(openTabs, activeTabPath, setActiveFileTab, handleCloseTab, true)}
          <div className="flex-1 overflow-hidden">
            {hasOpenFiles ? <FileViewer /> : <EmptyState />}
          </div>
        </div>
      </ResizablePanel>

      {/* Right pane - has its own independent tabs */}
      <ResizablePanel minSize={200} preferredSize="50%">
        <div className="h-full border-l border-border/50 flex flex-col">
          {renderTabsHeader(
            rightPaneFiles,
            rightPaneActiveTab,
            handleRightPaneSelectTab,
            handleRightPaneCloseTab,
            false
          )}
          <div className="flex-1 overflow-hidden">
            {rightPaneActiveFile ? <SplitFileViewer file={rightPaneActiveFile} /> : <EmptyState />}
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : (
    <div className="h-full flex flex-col">
      {renderTabsHeader(openTabs, activeTabPath, setActiveFileTab, handleCloseTab, true)}
      <div className="flex-1 overflow-hidden">{hasOpenFiles ? <FileViewer /> : <EmptyState />}</div>
    </div>
  );

  return (
    <div className="@container h-full w-full flex flex-col bg-chat-area">
      <ResizablePanelGroup
        ref={terminalAllotmentRef}
        direction="vertical"
        className="flex-1"
        onChange={handleTerminalSizeChange}
      >
        {/* Editor content */}
        <ResizablePanel minSize={0}>{contentSection}</ResizablePanel>

        {/* Terminal */}
        <ResizablePanel
          preferredSize={bottomPanelOpen ? bottomPanelHeight : TERMINAL_PANEL.COLLAPSED_HEIGHT}
          minSize={TERMINAL_PANEL.MIN_HEIGHT}
        >
          <TerminalPanel variant="full-width" collapsed={!bottomPanelOpen} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};
