/**
 * CanvasLeftSidebar - Left navigation sidebar for Canvas UI Builder
 *
 * Shows the available shadcn components for preview.
 * Loads components dynamically from the local registry (~/.orbit/canvas/registry.json).
 */
import { useComponentRegistry } from '@canvas/hooks/use-component-registry';
import { FlaskConical, FolderOpen, Layers, Loader2, Plus, Search, Settings } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { useShallow } from 'zustand/shallow';

import {
  CollapsibleGroup,
  SidebarItem,
  SidebarMenuItem,
  SidebarToggleIcon,
  TabButton,
} from './components';

import type { CanvasLeftSidebarProps, CanvasSidebarTab } from './types';
import type { SettingsDialogProps } from '@/components/modals/settings';
import type { FC } from 'react';

import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, getCommandKey, HEIGHTS, SIDEBAR } from '@/lib/utils';
import { useIsLeftSidebarCollapsed, useUIStore } from '@/stores/ui/ui-store';

// ============================================
// Utilities
// ============================================

/**
 * Converts a kebab-case component name to a human-readable label.
 * Example: "dropdown-menu" → "Dropdown Menu"
 */
function formatComponentLabel(name: string): string {
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Lazy load heavy components
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

// ============================================
// Component
// ============================================

export const CanvasLeftSidebar: FC<CanvasLeftSidebarProps> = ({ width, onComponentSelect }) => {
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
  const isCollapsed = useIsLeftSidebarCollapsed();

  // Fetch component registry from ~/.orbit/canvas/registry.json
  const { uiComponents, customComponents, loading: registryLoading } = useComponentRegistry();

  // Local state for selected component and active tab
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CanvasSidebarTab>('components');

  // Memoize formatted component list to avoid recalculating on every render
  const formattedUIComponents = useMemo(
    () =>
      uiComponents.map((c) => ({
        name: c.name,
        label: formatComponentLabel(c.name),
      })),
    [uiComponents]
  );

  const formattedCustomComponents = useMemo(
    () =>
      customComponents.map((c) => ({
        name: c.name,
        label: formatComponentLabel(c.name),
      })),
    [customComponents]
  );

  const handleComponentSelect = (name: string): void => {
    setSelectedComponent(name);
    onComponentSelect?.(name);
  };

  return (
    <aside
      data-sidebar="canvas-left"
      className="h-full flex flex-col bg-card transition-[width] duration-150 ease-in-out overflow-hidden shadow-lg dark:shadow-none"
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
                  aria-label="Expand sidebar"
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted/60 active:scale-95 transition-[background-color,color,transform] duration-150 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <SidebarToggleIcon expanded={false} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="flex items-center gap-2">
                <span>Expand sidebar</span>
                <KbdGroup>
                  <Kbd className="bg-white/15 text-inherit border-white/20">{getCommandKey()}</Kbd>
                  <Kbd className="bg-white/15 text-inherit border-white/20">/</Kbd>
                </KbdGroup>
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          /* Expanded: text on left, button on right */
          <div className="flex items-center justify-between w-full px-3">
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-semibold whitespace-nowrap">Canvas</span>
              <span
                className="bg-primary/8 text-primary/70 rounded-full px-1.5 py-0.5 font-medium tracking-wide whitespace-nowrap"
                style={{ fontSize: SIDEBAR.previewBadgeFontSize }}
              >
                Preview
              </span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleLeftSidebar}
                  aria-label="Collapse sidebar"
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted/60 active:scale-95 transition-[background-color,color,transform] duration-150 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <SidebarToggleIcon expanded={true} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="flex items-center gap-2">
                <span>Collapse sidebar</span>
                <KbdGroup>
                  <Kbd className="bg-white/15 text-inherit border-white/20">{getCommandKey()}</Kbd>
                  <Kbd className="bg-white/15 text-inherit border-white/20">/</Kbd>
                </KbdGroup>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Search Bar - hidden when collapsed */}
      <div
        className={cn(
          'shrink-0 mx-1.5 overflow-hidden transition-[height,opacity] duration-150 ease-in-out',
          isCollapsed ? 'py-0' : 'py-1'
        )}
        style={{
          height: isCollapsed ? 0 : SIDEBAR.searchBarHeight,
          opacity: isCollapsed ? 0 : 1,
        }}
      >
        <button
          className="flex items-center h-8 rounded-lg text-muted-foreground hover:text-foreground overflow-hidden border border-border/50 w-full bg-muted/40 hover:bg-muted/60 hover:border-border/60 transition-[background-color,border-color,color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Search components"
          role="searchbox"
          aria-readonly="true"
        >
          {/* Fixed-width icon column - never moves */}
          <div
            className="flex items-center justify-center shrink-0"
            style={{ width: SIDEBAR.iconColumnWidth - SIDEBAR.itemPadding }}
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          </div>
          {/* Text that slides in */}
          <span className="text-xs whitespace-nowrap overflow-hidden w-auto opacity-100">
            Search…
          </span>
          <KbdGroup className="ml-auto mr-2">
            <Kbd className="bg-foreground/10 text-inherit border-foreground/15">⌘</Kbd>
            <Kbd className="bg-foreground/10 text-inherit border-foreground/15">K</Kbd>
          </KbdGroup>
        </button>
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
          label="Components"
          active={activeTab === 'components'}
          onClick={() => {
            setActiveTab('components');
          }}
        />
        <TabButton
          label="Files"
          active={activeTab === 'files'}
          onClick={() => {
            setActiveTab('files');
          }}
        />
      </div>

      {/* Main Actions - slides up when collapsed */}
      <div
        className={cn(
          'flex flex-col border-b border-divider shrink-0 transition-[gap,padding] duration-150 ease-in-out',
          isCollapsed ? 'gap-0 pt-0 pb-1.5' : 'gap-1 py-1.5'
        )}
      >
        <SidebarItem
          icon={Layers}
          label="Components"
          collapsed={isCollapsed}
          equalSpacing={isCollapsed}
        />
        <SidebarItem
          icon={Plus}
          label="New Component"
          collapsed={isCollapsed}
          equalSpacing={isCollapsed}
        />
      </div>

      {/* Tab Content */}
      <div
        className={cn(
          'flex-1 overflow-x-hidden',
          isCollapsed ? 'overflow-y-hidden' : 'overflow-y-auto'
        )}
      >
        {activeTab === 'components' ? (
          /* Components Tab Content - Collapsible Tree */
          <div
            className={cn(
              'flex flex-col gap-1 py-2 transition-opacity duration-150',
              isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
            )}
          >
            {registryLoading ? (
              /* Loading state */
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2
                  className="h-5 w-5 animate-spin motion-reduce:animate-none mr-2"
                  aria-hidden="true"
                />
                <span className="text-sm" aria-live="polite">
                  Loading components…
                </span>
              </div>
            ) : (
              <>
                {/* UI Components Group */}
                <CollapsibleGroup label="UI Components" defaultOpen={true}>
                  {formattedUIComponents.map((component, index) => (
                    <SidebarMenuItem
                      key={component.name}
                      label={component.label}
                      active={selectedComponent === component.name}
                      isLast={index === formattedUIComponents.length - 1}
                      onClick={() => {
                        handleComponentSelect(component.name);
                      }}
                    />
                  ))}
                </CollapsibleGroup>

                {/* Custom Components Group (only show if there are custom components) */}
                {formattedCustomComponents.length > 0 && (
                  <CollapsibleGroup label="Custom Components" defaultOpen={true}>
                    {formattedCustomComponents.map((component, index) => (
                      <SidebarMenuItem
                        key={component.name}
                        label={component.label}
                        active={selectedComponent === component.name}
                        isLast={index === formattedCustomComponents.length - 1}
                        onClick={() => {
                          handleComponentSelect(component.name);
                        }}
                      />
                    ))}
                  </CollapsibleGroup>
                )}
              </>
            )}
          </div>
        ) : (
          /* Files Tab Content */
          <div
            className={cn(
              'h-full p-3 transition-opacity duration-150',
              isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
            )}
          >
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <FolderOpen className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No project open</p>
            </div>
          </div>
        )}
      </div>

      <hr className={cn('border-divider shrink-0', isCollapsed ? 'my-0' : 'my-2')} />

      {/* Utilities */}
      <div className={cn('flex flex-col shrink-0', isCollapsed ? 'gap-0 py-0' : 'gap-1 py-1.5')}>
        <SidebarItem
          icon={Settings}
          label="Settings"
          collapsed={isCollapsed}
          equalSpacing={isCollapsed}
          shortcut={['⌘', ',']}
          onClick={() => {
            openSettings('agent');
          }}
        />
        <SidebarItem
          icon={FlaskConical}
          label="Feedback"
          collapsed={isCollapsed}
          equalSpacing={isCollapsed}
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
