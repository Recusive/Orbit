import { IconSquareGridCircle } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconSquareGridCircle';
import { PanelRight, Search, Terminal } from 'lucide-react';
import { useShallow } from 'zustand/shallow';

import type { FC } from 'react';

import { SFSymbol } from '@/components/shared';
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
        active ? 'text-foreground' : 'text-lg-text-secondary hover:text-foreground'
      )}
      onClick={onClick}
    >
      {/* Tab background */}
      <div
        className={cn(
          'absolute inset-0 rounded-md transition-[background-color] duration-100',
          active ? 'bg-lg-control' : 'hover:bg-lg-control'
        )}
      />
      {/* Active indicator - offset to sit on header's bottom border */}
      {active ? (
        <div className="absolute inset-x-0 h-0.5 bg-foreground" style={{ bottom: '-3.5px' }} />
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

  // Demo mode: bypass workspace/auth gates when embedded in marketing site iframe
  const isDemo = new URLSearchParams(window.location.search).get('demo') === 'true';

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
    terminalCollapsed,
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
      terminalCollapsed: s.terminalCollapsed,
    }))
  );

  const handleOpenSearch = (): void => {
    window.dispatchEvent(new CustomEvent('openCommandPalette'));
  };

  // Smart terminal toggle: position depends on whether activity panel is open
  const handleToggleTerminal = (): void => {
    // Always pick a visible position — if the activity panel is closed,
    // the 'activity' slot is off-screen so force 'chat'.
    if (!reviewPanelOpen) {
      setTerminalPosition('chat');
    } else if (!bottomPanelOpen) {
      setTerminalPosition('activity');
    }
    toggleBottomPanel();
  };

  const searchText = workspaceName ?? (isDemo ? 'my-project' : 'Search...');

  return (
    <header
      data-tauri-drag-region
      className={cn(
        'flex items-center justify-between border-b shrink-0',
        transparent
          ? 'bg-transparent border-lg-separator/35'
          : 'bg-chat-area shadow-lg border-lg-separator',
        // Left padding for macOS traffic light buttons (matches Cursor: x:11 + ~69px for 3 buttons)
        'pl-[80px]',
        className
      )}
      style={{ height: HEIGHTS.headerBar }}
    >
      {/* Navigation arrows — hidden until handlers are implemented
       * (Code review: Opus cycle 3, issue #18) */}
      <div className="flex items-center gap-0.5">
        {/* In demo mode, render fake macOS traffic light dots (native Tauri controls don't exist in iframe) */}
        {isDemo ? (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-[7px]">
            <div className="size-[11px] rounded-full bg-[#FF5F57]" />
            <div className="size-[11px] rounded-full bg-[#FEBC2E]" />
            <div className="size-[11px] rounded-full bg-[#28C840]" />
          </div>
        ) : null}
      </div>

      {/* Center tabs - only show when workspace is open (or in demo mode) */}
      {hasWorkspace || isDemo ? (
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
      {workspaceName || isDemo ? (
        <div className="flex items-center gap-0.5 pr-0.5">
          {/* Search button */}
          <button
            data-tauri-drag-region={false}
            className={cn(
              'flex items-center gap-2 h-7 px-2.5 rounded-md',
              'text-sidebar-foreground hover:text-foreground',
              'hover:bg-lg-control-hover active:scale-[0.98]',
              'transition-[color,background-color,transform] duration-150'
            )}
            title="Search files (⌘K)"
            onClick={handleOpenSearch}
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="text-sm truncate max-w-[120px]">{searchText}</span>
            <Kbd className="h-[18px] !text-[12px] px-1.5 bg-lg-control text-inherit border-lg-separator">
              <span className="text-[14px] leading-none">⌘</span> K
            </Kbd>
          </button>

          {/* Divider */}
          <div className="w-px h-4 bg-lg-separator shrink-0" />

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
                    'hover:bg-lg-control-hover active:scale-[0.98]',
                    'transition-[color,background-color,transform] duration-150',
                    reviewPanelOpen
                      ? 'text-foreground'
                      : 'text-sidebar-foreground hover:text-foreground'
                  )}
                >
                  <SFSymbol
                    name="sidebar.squares.right"
                    size={18}
                    weight="medium"
                    fallback={<PanelRight className="h-4 w-4" />}
                  />
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
                    'hover:bg-lg-control-hover active:scale-[0.98]',
                    'transition-[color,background-color,transform] duration-150',
                    bottomPanelOpen && !terminalCollapsed
                      ? 'text-foreground'
                      : 'text-sidebar-foreground hover:text-foreground'
                  )}
                >
                  <SFSymbol
                    name="apple.terminal"
                    size={18}
                    weight="medium"
                    fallback={<Terminal className="h-4 w-4" />}
                  />
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
                    'hover:bg-lg-control-hover active:scale-[0.98]',
                    'transition-[color,background-color,transform] duration-150',
                    rightSidebarOpen
                      ? 'text-foreground'
                      : 'text-sidebar-foreground hover:text-foreground'
                  )}
                >
                  <SFSymbol
                    name="switch.2"
                    size={18}
                    weight="medium"
                    fallback={<IconSquareGridCircle className="h-4 w-4" />}
                  />
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
