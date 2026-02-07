import { IconSquareGridCircle } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconSquareGridCircle';
import { Search, Terminal } from 'lucide-react';
import { useShallow } from 'zustand/shallow';

import type { FC } from 'react';

import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, getCommandKey } from '@/lib/utils';
import { HEIGHTS } from '@/lib/utils/constants';
import { useUIStore, useWorkspaceName, useActiveTab, useHasWorkspace } from '@/stores/ui/ui-store';

// Re-export for backwards compatibility
export type { HeaderTab } from '@/stores/ui/ui-store';

export interface HeaderBarProps {
  className?: string;
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
        'relative flex items-center justify-center h-7 px-3 transition-colors duration-200',
        active ? 'text-foreground' : 'text-muted-foreground/80 hover:text-foreground'
      )}
      onClick={onClick}
    >
      {/* Tab background */}
      <div
        className={cn(
          'absolute inset-0 rounded-md transition-colors duration-200',
          active ? 'bg-muted/70' : 'hover:bg-muted/40'
        )}
      />
      {/* Active indicator - offset to sit on header's bottom border */}
      {active ? (
        <div className="absolute inset-x-0 h-0.5 bg-primary/80" style={{ bottom: '-3.5px' }} />
      ) : null}
      <span className="relative text-base font-medium">{label}</span>
    </button>
  );
};

/**
 * HeaderBar at the top of the app with navigation tabs.
 * Matches the sidebar background color.
 */
export const HeaderBar: FC<HeaderBarProps> = ({ className }) => {
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
        'flex items-center justify-between border-b border-border/50 shrink-0',
        'bg-card shadow-lg',
        // Left padding for macOS traffic light buttons (matches Cursor: x:11 + ~69px for 3 buttons)
        'pl-[80px]',
        className
      )}
      style={{ height: HEIGHTS.headerBar }}
    >
      {/* Left spacer for balance (reduced since we have traffic light padding) */}
      <div className="w-[122px]" />

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
        <div className="flex items-center gap-1 h-full pr-0.5">
          {/* Search button - pill style */}
          <button
            data-tauri-drag-region={false}
            className={cn(
              'flex items-center gap-2 h-[30px] px-2.5 rounded-lg',
              'text-muted-foreground hover:text-foreground',
              'bg-muted/40 dark:bg-background',
              'hover:bg-muted/60 active:scale-[0.98]',
              'transition-all duration-150'
            )}
            title="Search files (⌘K)"
            onClick={handleOpenSearch}
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="text-sm truncate max-w-[120px]">{searchText}</span>
            <KbdGroup className="gap-0.5">
              <Kbd className="h-[18px] text-[10px] px-1 bg-foreground/8 border-foreground/10">
                ⌘
              </Kbd>
              <Kbd className="h-[18px] text-[10px] px-1 bg-foreground/8 border-foreground/10">
                K
              </Kbd>
            </KbdGroup>
          </button>

          {/* Panel toggles */}
          <div className="flex items-center gap-0.5 rounded-lg border border-border/50 px-1 py-0.5">
            {/* Activity Panel Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  data-tauri-drag-region={false}
                  onClick={toggleReviewPanel}
                  className={cn(
                    'h-6 w-6 flex items-center justify-center rounded-md',
                    'hover:bg-muted/40 active:scale-[0.98]',
                    'transition-all duration-150',
                    reviewPanelOpen
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
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
                    'hover:bg-muted/40 active:scale-[0.98]',
                    'transition-all duration-150',
                    bottomPanelOpen
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
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
                  className={cn(
                    'h-6 w-6 flex items-center justify-center rounded-md',
                    'hover:bg-muted/40 active:scale-[0.98]',
                    'transition-all duration-150',
                    rightSidebarOpen
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
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
