import { IconSidebar } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconSidebar';
import { Globe, Moon, PanelRight, SquareTerminal, Sun } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { FC } from 'react';

import { HeaderButton } from '@/components/shared/header-button';
import { HEIGHTS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import {
  useUIStore,
  useWorkspaceName,
  useActiveConversationTitle,
  useTerminalPosition,
} from '@/stores/ui-store';

type Theme = 'light' | 'dark';

const getInitialTheme = (): Theme => {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
};

export const ChatHeader: FC = () => {
  const {
    toggleReviewPanel,
    toggleBottomPanel,
    toggleRightSidebar,
    openBrowserTab,
    reviewPanelOpen,
    bottomPanelOpen,
  } = useUIStore();
  const terminalPosition = useTerminalPosition();
  const workspaceName = useWorkspaceName();
  const activeConversationTitle = useActiveConversationTitle();
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

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

  return (
    <header
      className="flex items-center justify-between px-4 border-b border-border shrink-0"
      style={{ height: HEIGHTS.headerBar }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center text-sm min-w-0 flex-1 max-w-[280px]">
        <span className="opacity-70 cursor-pointer hover:opacity-100 transition-opacity shrink-0">
          {workspaceName ?? 'No workspace'}
        </span>
        {activeConversationTitle ? (
          <>
            <span className="mx-2 opacity-30 shrink-0">/</span>
            <span
              className="opacity-70 whitespace-nowrap overflow-hidden flex-1 min-w-0"
              title={activeConversationTitle}
              style={{
                maskImage: 'linear-gradient(to right, black 78%, transparent 95%)',
                WebkitMaskImage: 'linear-gradient(to right, black 78%, transparent 95%)',
                maskSize: '100% 100%',
                WebkitMaskSize: '100% 100%',
              }}
            >
              {activeConversationTitle}
            </span>
          </>
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="h-7 w-7 flex items-center justify-center rounded opacity-70 hover:opacity-100 hover:bg-accent transition-colors"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <HeaderButton icon={Globe} title="Browser" onClick={openBrowserTab} />
        <HeaderButton icon={SquareTerminal} title="Terminal" onClick={handleTerminalToggle} />

        {/* Review Changes Button */}
        <button
          onClick={toggleReviewPanel}
          className={cn(
            'h-7 w-7 flex items-center justify-center rounded transition-colors',
            reviewPanelOpen
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          )}
          title="Activity"
        >
          <div className="rotate-180">
            <IconSidebar size={16} />
          </div>
        </button>

        <HeaderButton icon={PanelRight} title="Right Panel" onClick={toggleRightSidebar} />
      </div>
    </header>
  );
};
