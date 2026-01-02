import { Moon, Search, SquareTerminal, Sun } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { FC } from 'react';

import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useUIStore, useWorkspaceName, useTerminalPosition } from '@/stores/ui-store';

type Theme = 'light' | 'dark';

const getInitialTheme = (): Theme => {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
};

export type HeaderTab = 'agent' | 'editor' | 'canvas';

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
        'relative flex items-center justify-center h-7 px-3 transition-all duration-200',
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
      {/* Active indicator */}
      {active ? <div className="absolute bottom-0 inset-x-0 h-0.5 bg-primary/80" /> : null}
      <span className="relative text-xs font-medium">{label}</span>
    </button>
  );
};

/**
 * HeaderBar at the top of the app with navigation tabs.
 * Matches the sidebar background color.
 */
export const HeaderBar: FC<HeaderBarProps> = ({ className }) => {
  const [activeTab, setActiveTab] = useState<HeaderTab>('agent');
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const workspaceName = useWorkspaceName();
  const {
    toggleReviewPanel,
    toggleBottomPanel,
    toggleRightSidebar,
    reviewPanelOpen,
    bottomPanelOpen,
    rightSidebarOpen,
  } = useUIStore();
  const terminalPosition = useTerminalPosition();

  // Theme toggle effect
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback((): void => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  const handleTerminalToggle = useCallback((): void => {
    // If terminal is in activity panel and activity panel is closed, open it too
    if (terminalPosition === 'activity' && !reviewPanelOpen && !bottomPanelOpen) {
      toggleReviewPanel();
    }
    toggleBottomPanel();
  }, [terminalPosition, reviewPanelOpen, bottomPanelOpen, toggleReviewPanel, toggleBottomPanel]);

  const handleOpenSearch = (): void => {
    window.dispatchEvent(new CustomEvent('openCommandPalette'));
  };

  const searchText = workspaceName ?? 'Search...';

  return (
    <header
      data-tauri-drag-region
      className={cn(
        'h-[35px] flex items-center justify-between pr-4 border-y border-border/60 shrink-0',
        'bg-card shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08),0_4px_12px_-4px_rgba(0,0,0,0.05)]',
        // Left padding for macOS traffic light buttons (about 78px)
        'pl-[78px]',
        className
      )}
    >
      {/* Left spacer for balance (reduced since we have traffic light padding) */}
      <div className="w-[122px]" />

      {/* Center tabs */}
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

      {/* Right section: Search + Action buttons - only show when workspace is open */}
      {workspaceName ? (
        <div className="flex items-center gap-2">
          {/* Search button - VS Code style command palette */}
          <button
            data-tauri-drag-region={false}
            className="flex items-center gap-2 h-6 px-2 rounded-md text-foreground hover:text-foreground overflow-hidden bg-muted hover:bg-muted/80 transition-all duration-200"
            title="Search files (⌘P)"
            onClick={handleOpenSearch}
          >
            <Search className="h-3 w-3 shrink-0 opacity-50" />
            <span className="text-[11px] whitespace-nowrap overflow-hidden truncate max-w-[120px] opacity-60">
              {searchText}
            </span>
            <KbdGroup>
              <Kbd className="border-0 bg-background/60 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">⌘</Kbd>
              <Kbd className="border-0 bg-background/60 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">P</Kbd>
            </KbdGroup>
          </button>

          <div className="flex items-center gap-1">
            {/* Theme Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  data-tauri-drag-region={false}
                  onClick={toggleTheme}
                  className="h-7 w-7 flex items-center justify-center rounded-md opacity-60 hover:opacity-100 hover:bg-muted/60 active:scale-95 transition-all duration-150"
                >
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</TooltipContent>
            </Tooltip>

            {/* Terminal Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  data-tauri-drag-region={false}
                  onClick={handleTerminalToggle}
                  className={cn(
                    'h-7 w-7 flex items-center justify-center rounded-md active:scale-95 transition-all duration-150',
                    bottomPanelOpen
                      ? 'bg-muted/70 text-foreground'
                      : 'text-muted-foreground/80 hover:text-foreground hover:bg-muted/60'
                  )}
                >
                  <SquareTerminal className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Terminal</TooltipContent>
            </Tooltip>

            {/* Activity Panel Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  data-tauri-drag-region={false}
                  onClick={toggleReviewPanel}
                  className={cn(
                    'h-7 w-7 flex items-center justify-center rounded-md active:scale-95 transition-all duration-150',
                    reviewPanelOpen
                      ? 'bg-muted/70 text-foreground'
                      : 'text-muted-foreground/80 hover:text-foreground hover:bg-muted/60'
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
              <TooltipContent>
                {reviewPanelOpen ? 'Hide Activity Panel' : 'Show Activity Panel'}
              </TooltipContent>
            </Tooltip>

            {/* Actions Bar Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  data-tauri-drag-region={false}
                  onClick={toggleRightSidebar}
                  className={cn(
                    'h-7 w-7 flex items-center justify-center rounded-md active:scale-95 transition-all duration-150',
                    rightSidebarOpen
                      ? 'bg-muted/70 text-foreground'
                      : 'text-muted-foreground/80 hover:text-foreground hover:bg-muted/60'
                  )}
                >
                  <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M12 5H4C3.44772 5 3 5.44772 3 6V18C3 18.5523 3.44772 19 4 19H12M16 5H20C20.5523 5 21 5.44772 21 6V18C21 18.5523 20.5523 19 20 19H16M16 5V2.5M16 5V19M16 19V21.5M8 9.5L10.5 12L8 14.5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
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
