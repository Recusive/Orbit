/**
 * EditorSidebar - Simplified sidebar for Editor mode
 *
 * Features:
 * - File Explorer (primary)
 * - Git Source Control
 * - Settings access
 *
 * Unlike Agent's PrimarySidebar, this doesn't include:
 * - Sessions/Conversations list
 * - Inbox
 * - Start conversation button
 */
import { FlaskConical, Settings } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';

import type { SettingsDialogProps } from '@/components/modals/settings';
import type { FC } from 'react';

import { FileExplorer } from '@/components/files';
import { SourceControlTab } from '@/components/git';
import { SidebarToggleIcon, TabButton } from '@/components/layout/primary-sidebar';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HEIGHTS, SIDEBAR } from '@/lib/utils/constants';
import { cn } from '@/lib/utils/utils';
import { useUIStore, useIsLeftSidebarCollapsed } from '@/stores/ui/ui-store';

// Lazy load Settings dialog
const LazySettingsDialog = lazy(() =>
  import('@/components/modals/settings/SettingsDialog').then((m) => ({
    default: m.SettingsDialog,
  }))
);
const SettingsDialog: FC<SettingsDialogProps> = (props) => (
  <Suspense fallback={null}>
    <LazySettingsDialog {...props} />
  </Suspense>
);

type EditorSidebarTab = 'explorer' | 'source';

interface EditorSidebarItemProps {
  readonly icon: typeof Settings;
  readonly label: string;
  readonly isCollapsed: boolean;
  readonly shortcut?: readonly string[];
  readonly onClick?: () => void;
}

const EditorSidebarItem: FC<EditorSidebarItemProps> = ({
  icon: Icon,
  label,
  isCollapsed,
  shortcut,
  onClick,
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        onClick={onClick}
        className={cn(
          'flex items-center w-full rounded-md transition-all duration-150',
          'text-muted-foreground hover:text-foreground hover:bg-muted/60',
          isCollapsed ? 'h-9 w-9 justify-center mx-auto' : 'h-8 px-2 gap-2'
        )}
      >
        <Icon className={cn('shrink-0', isCollapsed ? 'h-5 w-5' : 'h-4 w-4')} />
        {!isCollapsed && (
          <>
            <span className="text-sm truncate flex-1 text-left">{label}</span>
            {shortcut ? (
              <KbdGroup className="ml-auto">
                {shortcut.map((key, idx) => (
                  <Kbd key={`${key}-${String(idx)}`} className="text-xs">
                    {key}
                  </Kbd>
                ))}
              </KbdGroup>
            ) : null}
          </>
        )}
      </button>
    </TooltipTrigger>
    {isCollapsed ? <TooltipContent side="right">{label}</TooltipContent> : null}
  </Tooltip>
);

interface EditorSidebarProps {
  readonly width: number;
}

export const EditorSidebar: FC<EditorSidebarProps> = ({ width }) => {
  const {
    toggleLeftSidebar,
    settingsDialogOpen,
    settingsDialogSection,
    setSettingsDialogOpen,
    openSettings,
  } = useUIStore();
  // Detect isCollapsed state from width (same pattern as PrimarySidebar)
  const isCollapsed = useIsLeftSidebarCollapsed();

  const [activeTab, setActiveTab] = useState<EditorSidebarTab>('explorer');

  return (
    <aside
      data-sidebar="primary"
      className="h-full flex flex-col bg-card transition-[width] duration-150 ease-in-out overflow-hidden shadow-lg dark:shadow-none border-r border-divider"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex shrink-0" style={{ height: HEIGHTS.headerBar }}>
        {isCollapsed ? (
          /* Collapsed: just the icon centered */
          <div
            className="flex items-center justify-center shrink-0 h-full"
            style={{ width: SIDEBAR.iconColumnWidth }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleLeftSidebar}
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted/60 active:scale-95 transition-all duration-150 text-muted-foreground hover:text-foreground"
                >
                  <SidebarToggleIcon expanded={false} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="flex items-center gap-2">
                <span>Expand sidebar</span>
                <KbdGroup>
                  <Kbd className="bg-white/15 text-inherit border-white/20">⌘</Kbd>
                  <Kbd className="bg-white/15 text-inherit border-white/20">.</Kbd>
                </KbdGroup>
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          /* Expanded: text on left, button on right */
          <div className="flex items-center justify-between w-full px-3">
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-semibold whitespace-nowrap">Orbit Editor</span>
              <span className="bg-primary/8 text-primary/70 rounded-full px-1.5 py-0.5 text-[9px] font-medium tracking-wide whitespace-nowrap">
                Preview
              </span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleLeftSidebar}
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted/60 active:scale-95 transition-all duration-150 text-muted-foreground hover:text-foreground"
                >
                  <SidebarToggleIcon expanded={true} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="flex items-center gap-2">
                <span>Collapse sidebar</span>
                <KbdGroup>
                  <Kbd className="bg-white/15 text-inherit border-white/20">⌘</Kbd>
                  <Kbd className="bg-white/15 text-inherit border-white/20">.</Kbd>
                </KbdGroup>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Tab Navigation - hidden when collapsed */}
      <div
        className={cn(
          'flex items-center shrink-0 px-1.5 gap-0.5 overflow-hidden transition-[height,opacity] duration-150 ease-in-out',
          isCollapsed ? '' : 'border-b border-divider'
        )}
        style={{
          height: isCollapsed ? 0 : SIDEBAR.tabNavHeight,
          opacity: isCollapsed ? 0 : 1,
        }}
      >
        <TabButton
          label="Explorer"
          active={activeTab === 'explorer'}
          onClick={() => {
            setActiveTab('explorer');
          }}
        />
        <TabButton
          label="Source Control"
          active={activeTab === 'source'}
          onClick={() => {
            setActiveTab('source');
          }}
        />
      </div>

      {/* Tab Content */}
      <div
        className={cn(
          'flex-1 overflow-hidden transition-all duration-150 ease-in-out',
          isCollapsed ? 'opacity-0' : 'opacity-100'
        )}
        style={{
          visibility: isCollapsed ? 'hidden' : 'visible',
          transitionProperty: 'opacity, visibility',
        }}
      >
        {activeTab === 'explorer' ? (
          <div className="h-full overflow-y-auto">
            <FileExplorer collapsed={isCollapsed} />
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            <SourceControlTab />
          </div>
        )}
      </div>

      <hr
        className={cn(
          'border-divider shrink-0 transition-all duration-150 ease-in-out',
          isCollapsed ? 'my-0 opacity-0' : 'my-2 opacity-100'
        )}
      />

      {/* Utilities */}
      <div
        className={cn(
          'flex flex-col shrink-0 transition-all duration-150 ease-in-out',
          isCollapsed ? 'gap-0 py-1 items-center' : 'gap-1 py-1.5 px-1.5'
        )}
        style={isCollapsed ? { width: SIDEBAR.iconColumnWidth } : undefined}
      >
        <EditorSidebarItem
          icon={Settings}
          label="Settings"
          isCollapsed={isCollapsed}
          shortcut={['⌘', ',']}
          onClick={() => {
            openSettings('agent');
          }}
        />
        <EditorSidebarItem
          icon={FlaskConical}
          label="Feedback"
          isCollapsed={isCollapsed}
          onClick={() => {
            openSettings('feedback');
          }}
        />
      </div>

      {/* Settings Dialog */}
      <SettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
        defaultSection={settingsDialogSection}
      />
    </aside>
  );
};
