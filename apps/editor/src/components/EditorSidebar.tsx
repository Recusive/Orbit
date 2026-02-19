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
import { FlaskConical, Settings2 } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useShallow } from 'zustand/shallow';

import type { SettingsDialogProps } from '@/components/modals/settings';
import type { FC } from 'react';

import { FileExplorer } from '@/components/files';
import { SourceControlTab } from '@/components/git';
import { SidebarItem, SidebarToggleIcon, TabButton } from '@/components/layout/primary-sidebar';
import { BeamAsciiPre } from '@/components/shared';
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

interface EditorSidebarProps {
  readonly width: number;
}

export const EditorSidebar: FC<EditorSidebarProps> = ({ width }) => {
  // Use useShallow to prevent re-renders when unrelated store state changes
  const {
    toggleLeftSidebar,
    settingsDialogOpen,
    settingsDialogSection,
    setSettingsDialogOpen,
    openSettings,
  } = useUIStore(
    useShallow((s) => ({
      toggleLeftSidebar: s.toggleLeftSidebar,
      settingsDialogOpen: s.settingsDialogOpen,
      settingsDialogSection: s.settingsDialogSection,
      setSettingsDialogOpen: s.setSettingsDialogOpen,
      openSettings: s.openSettings,
    }))
  );
  // Detect isCollapsed state from width (same pattern as PrimarySidebar)
  const isCollapsed = useIsLeftSidebarCollapsed();

  const [activeTab, setActiveTab] = useState<EditorSidebarTab>('explorer');

  // Suppress width transition on initial mount to prevent ghost flash
  // when parent switches from display:none → display:block.
  // The browser treats the computed width going from "nothing" to the
  // target as a change, firing the CSS transition (sidebar slides open).
  // A single RAF suffices here (unlike EditorLayout's 2-frame delay)
  // because only the sidebar's width needs to resolve — no nested layout
  // passes are involved. (Code review: Opus cycle 1, issue #7)
  const [mountReady, setMountReady] = useState(false);
  useEffect(() => {
    // Enable transitions after first paint
    requestAnimationFrame(() => {
      setMountReady(true);
    });
  }, []);

  return (
    <aside
      data-sidebar="editor-primary"
      className={cn(
        'h-full flex flex-col bg-card overflow-hidden shadow-lg dark:shadow-none border-r border-divider',
        mountReady && 'transition-[width] duration-150 ease-in-out'
      )}
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
              <BeamAsciiPre
                ariaLabel="Orbit Editor"
                className="text-[3.5px] leading-[1.1]"
                duration={1400}
                beamSize={20}
                text={` ██████╗ ██████╗ ██████╗ ██╗████████╗    ███████╗██████╗ ██╗████████╗ ██████╗ ██████╗
██╔═══██╗██╔══██╗██╔══██╗██║╚══██╔══╝    ██╔════╝██╔══██╗██║╚══██╔══╝██╔═══██╗██╔══██╗
██║   ██║██████╔╝██████╔╝██║   ██║       █████╗  ██║  ██║██║   ██║   ██║   ██║██████╔╝
██║   ██║██╔══██╗██╔══██╗██║   ██║       ██╔══╝  ██║  ██║██║   ██║   ██║   ██║██╔══██╗
╚██████╔╝██║  ██║██████╔╝██║   ██║       ███████╗██████╔╝██║   ██║   ╚██████╔╝██║  ██║
 ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚═╝   ╚═╝       ╚══════╝╚═════╝ ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝`}
              />
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
          'flex items-center shrink-0 px-1.5 gap-0.5 overflow-visible transition-opacity duration-150 ease-out',
          isCollapsed ? '' : 'border-b border-gray-5'
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
            <FileExplorer />
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            <SourceControlTab />
          </div>
        )}
      </div>

      <hr
        className={cn(
          'border-gray-5 border-t shrink-0',
          isCollapsed ? 'mt-0 mb-0 opacity-0' : 'mt-2 mb-0 opacity-100'
        )}
      />

      {/* Utilities */}
      <div className="flex flex-col shrink-0 gap-1 py-1.5">
        <SidebarItem
          icon={Settings2}
          label="Settings"
          shortcut={['⌘', ',']}
          onClick={() => {
            openSettings('agent');
          }}
        />
        <SidebarItem
          icon={FlaskConical}
          label="Feedback"
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
