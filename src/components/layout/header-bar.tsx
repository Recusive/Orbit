import { Search } from 'lucide-react';
import { useState } from 'react';

import type { FC } from 'react';

import { cn } from '@/lib/utils';
import { useWorkspaceName } from '@/stores/ui-store';

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
        'relative flex items-center justify-center transition-colors h-7 px-3',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
      onClick={onClick}
    >
      {/* Tab background */}
      <div
        className={cn(
          'absolute inset-0 rounded-md transition-colors',
          active ? 'bg-sidebar-accent' : 'hover:bg-muted/50'
        )}
      />
      {/* Active indicator */}
      {active ? <div className="absolute bottom-0 inset-x-0 h-0.5 bg-primary" /> : null}
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
  const workspaceName = useWorkspaceName();

  const handleOpenSearch = (): void => {
    window.dispatchEvent(new CustomEvent('openCommandPalette'));
  };

  const searchText = workspaceName ? `Search ${workspaceName}` : 'Search files...';

  return (
    <header
      data-tauri-drag-region
      className={cn(
        'h-[35px] flex items-center justify-between pr-4 border-b border-border shrink-0',
        'bg-sidebar',
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

      {/* Right search button */}
      <div className="w-[200px] flex justify-end">
        <button
          data-tauri-drag-region={false}
          className="flex items-center h-6 rounded-md text-muted-foreground hover:text-foreground transition-colors overflow-hidden border border-border dark:border-border/50 bg-muted/50 hover:bg-muted"
          title="Search files (⌘P)"
          onClick={handleOpenSearch}
        >
          <div className="flex items-center justify-center shrink-0 w-6">
            <Search className="h-3 w-3 shrink-0" />
          </div>
          <span className="text-[10px] whitespace-nowrap overflow-hidden truncate max-w-[100px]">
            {searchText}
          </span>
          <div className="flex items-center gap-0.5 ml-auto mr-1.5">
            <kbd className="flex items-center justify-center h-4 min-w-[16px] px-0.5 text-[10px] font-mono bg-background/50 rounded">
              ⌘
            </kbd>
            <kbd className="flex items-center justify-center h-4 min-w-[16px] px-0.5 text-[9px] font-mono bg-background/50 rounded">
              P
            </kbd>
          </div>
        </button>
      </div>
    </header>
  );
};
