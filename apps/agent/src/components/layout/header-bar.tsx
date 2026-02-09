import { IconSquareGridCircle } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconSquareGridCircle';
import { Search, Terminal } from 'lucide-react';
import { useShallow } from 'zustand/shallow';

import type { FC } from 'react';

import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, getCommandKey } from '@/lib/utils';
import { HEIGHTS } from '@/lib/utils/constants';
import { useUIStore, useWorkspaceName, useActiveTab, useHasWorkspace } from '@/stores/ui/ui-store';

// Re-export for backwards compatibility
export type { HeaderTab } from '@/stores/ui/ui-store';

export interface HeaderBarProps {
  className?: string;
  /** When true, renders with a transparent background (used on welcome page) */
  transparent?: boolean;
}

interface TabButtonProps {
  readonly label: string;
  readonly active: boolean;
  readonly onClick: () => void;
}

const TabButton: FC<TabButtonProps> = ({ label, active, onClick }) => {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      data-tauri-drag-region={false}
      className={cn(
        'relative flex items-center justify-center h-7 px-3 transition-[background-color] duration-100',
        active ? 'text-foreground' : 'text-gray-10 hover:text-gray-12'
      )}
      onClick={onClick}
    >
      {/* Tab background */}
      <div
        className={cn(
          'absolute inset-0 rounded-md transition-[background-color] duration-100',
          active ? 'bg-gray-4' : 'hover:bg-gray-4'
        )}
      />
      {/* Active indicator - offset to sit on header's bottom border */}
      {active ? (
        <div className="absolute inset-x-0 h-0.5 bg-primary" style={{ bottom: '-3.5px' }} />
      ) : null}
      <span className="relative text-base font-medium">{label}</span>
    </button>
  );
};

/**
 * HeaderBar at the top of the app with navigation tabs.
 * Matches the sidebar background color.
 */
export const HeaderBar: FC<HeaderBarProps> = ({ className, transparent = false }) => {
  const activeTab = useActiveTab();
  const workspaceName = useWorkspaceName();
  const hasWorkspace = useHasWorkspace();

  // Use useShallow to prevent re-renders when unrelated store state changes
  const {
    setActiveTab,
    toggleReviewPanel,
    toggleRightSidebar,
    toggleBottomPanel,
    setTerminalPosition,
    reviewPanelOpen,
    rightSidebarOpen,
    bottomPanelOpen,
  } = useUIStore(
    useShallow((s) => ({
      setActiveTab: s.setActiveTab,
      toggleReviewPanel: s.toggleReviewPanel,
      toggleRightSidebar: s.toggleRightSidebar,
      toggleBottomPanel: s.toggleBottomPanel,
      setTerminalPosition: s.setTerminalPosition,
      reviewPanelOpen: s.reviewPanelOpen,
      rightSidebarOpen: s.rightSidebarOpen,
      bottomPanelOpen: s.bottomPanelOpen,
    }))
  );

  const handleOpenSearch = (): void => {
    window.dispatchEvent(new CustomEvent('openCommandPalette'));
  };

  // Smart terminal toggle: position depends on whether activity panel is open
  const handleToggleTerminal = (): void => {
    if (!bottomPanelOpen) {
      // Opening terminal — choose position based on activity panel state
      if (reviewPanelOpen) {
        setTerminalPosition('activity');
      } else {
        setTerminalPosition('both');
      }
    }
    toggleBottomPanel();
  };

  const searchText = workspaceName ?? 'Search...';

  return (
    <header
      data-tauri-drag-region
      className={cn(
        'flex items-center justify-between border-b shrink-0',
        transparent ? 'bg-transparent border-gray-8/35' : 'bg-card shadow-lg border-gray-5',
        // Left padding for macOS traffic light buttons (matches Cursor: x:11 + ~69px for 3 buttons)
        'pl-[80px]',
        className
      )}
      style={{ height: HEIGHTS.headerBar }}
    >
      {/* Navigation arrows */}
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-tauri-drag-region={false}
              aria-label="Go back"
              className={cn(
                'h-6 w-6 flex items-center justify-center rounded-md',
                'text-sidebar-foreground hover:text-foreground',
                'hover:bg-gray-3 dark:hover:bg-gray-4 active:scale-[0.95]',
                'transition-[color,background-color,transform] duration-150'
              )}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                <path
                  d="M10 6L4 12L10 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M5 12H20"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </TooltipTrigger>
          <TooltipContent>Go back</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-tauri-drag-region={false}
              aria-label="Go forward"
              className={cn(
                'h-6 w-6 flex items-center justify-center rounded-md',
                'text-sidebar-foreground hover:text-foreground',
                'hover:bg-gray-3 dark:hover:bg-gray-4 active:scale-[0.95]',
                'transition-[color,background-color,transform] duration-150'
              )}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                <path
                  d="M14 6L20 12L14 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M19 12H4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </TooltipTrigger>
          <TooltipContent>Go forward</TooltipContent>
        </Tooltip>
      </div>

      {/* Center tabs - only show when workspace is open */}
      {hasWorkspace ? (
        <div className="flex items-center gap-0.5" role="tablist" aria-orientation="horizontal">
          <TabButton
            label="Agent"
            active={activeTab === 'agent'}
            onClick={(): void => {
              setActiveTab('agent');
            }}
          />
          <TabButton
            label="Editor"
            active={activeTab === 'editor'}
            onClick={(): void => {
              setActiveTab('editor');
            }}
          />
          <TabButton
            label="Canvas"
            active={activeTab === 'canvas'}
            onClick={(): void => {
              setActiveTab('canvas');
            }}
          />
        </div>
      ) : (
        <div />
      )}

      {/* Right section: Search + Action buttons */}
      {workspaceName ? (
        <div className="flex items-center gap-0.5 pr-0.5">
          {/* Search button */}
          <button
            data-tauri-drag-region={false}
            className={cn(
              'flex items-center gap-2 h-7 px-2.5 rounded-md',
              'text-sidebar-foreground hover:text-foreground',
              'hover:bg-gray-3 dark:hover:bg-gray-4 active:scale-[0.98]',
              'transition-[color,background-color,transform] duration-150'
            )}
            title="Search files (⌘K)"
            onClick={handleOpenSearch}
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="text-sm truncate max-w-[120px]">{searchText}</span>
            <Kbd className="h-[18px] !text-[12px] px-1.5 bg-gray-5 text-inherit border-gray-6">
              <span className="text-[14px] leading-none">⌘</span> K
            </Kbd>
          </button>

          {/* Divider */}
          <div className="w-px h-4 bg-gray-5 shrink-0" />

          {/* Panel toggles */}
          <div className="flex items-center gap-0.5 px-1">
            {/* Activity Panel Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  data-tauri-drag-region={false}
                  onClick={toggleReviewPanel}
                  aria-label={reviewPanelOpen ? 'Hide Activity Panel' : 'Show Activity Panel'}
                  className={cn(
                    'h-6 w-6 flex items-center justify-center rounded-md',
                    'hover:bg-gray-3 dark:hover:bg-gray-4 active:scale-[0.98]',
                    'transition-[color,background-color,transform] duration-150',
                    reviewPanelOpen
                      ? 'text-foreground'
                      : 'text-sidebar-foreground hover:text-foreground'
                  )}
                >
                  <div className="rotate-180">
                    <svg
                      aria-hidden="true"
                      width="16"
                      height="16"
                      viewBox="1 1 22 22"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M19 5V19H21V5H19ZM19 19H5V21H19V19ZM5 19V5H3V19H5ZM5 5H19V3H5V5ZM5 5V5V3C3.89543 3 3 3.89543 3 5H5ZM5 19H3C3 20.1046 3.89543 21 5 21V19ZM19 19V21C20.1046 21 21 20.1046 21 19H19ZM21 5C21 3.89543 20.1046 3 19 3V5H21Z"
                        fill="currentColor"
                      />
                      <rect
                        x="7"
                        y="7"
                        width={reviewPanelOpen ? 5 : 2}
                        height="10"
                        rx="1"
                        fill="currentColor"
                      />
                    </svg>
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent className="flex items-center gap-2">
                <span>{reviewPanelOpen ? 'Hide Activity Panel' : 'Show Activity Panel'}</span>
                <Kbd className="bg-white/15 border-white/20">{getCommandKey()}B</Kbd>
              </TooltipContent>
            </Tooltip>

            {/* Terminal Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  data-tauri-drag-region={false}
                  onClick={handleToggleTerminal}
                  aria-label={bottomPanelOpen ? 'Hide Terminal' : 'Show Terminal'}
                  className={cn(
                    'h-6 w-6 flex items-center justify-center rounded-md',
                    'hover:bg-gray-3 dark:hover:bg-gray-4 active:scale-[0.98]',
                    'transition-[color,background-color,transform] duration-150',
                    bottomPanelOpen
                      ? 'text-foreground'
                      : 'text-sidebar-foreground hover:text-foreground'
                  )}
                >
                  <Terminal className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="flex items-center gap-2">
                <span>{bottomPanelOpen ? 'Hide Terminal' : 'Show Terminal'}</span>
                <Kbd className="bg-white/15 border-white/20">^J</Kbd>
              </TooltipContent>
            </Tooltip>

            {/* Actions Bar Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  data-tauri-drag-region={false}
                  onClick={toggleRightSidebar}
                  aria-label={rightSidebarOpen ? 'Hide Actions Bar' : 'Show Actions Bar'}
                  className={cn(
                    'h-6 w-6 flex items-center justify-center rounded-md',
                    'hover:bg-gray-3 dark:hover:bg-gray-4 active:scale-[0.98]',
                    'transition-[color,background-color,transform] duration-150',
                    rightSidebarOpen
                      ? 'text-foreground'
                      : 'text-sidebar-foreground hover:text-foreground'
                  )}
                >
                  <IconSquareGridCircle className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {rightSidebarOpen ? 'Hide Actions Bar' : 'Show Actions Bar'}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      ) : (
        <div className="w-[122px]" />
      )}
    </header>
  );
};
