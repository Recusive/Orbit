/**
 * CanvasRightSidebar - Right properties/layers sidebar for Canvas UI Builder
 *
 * Shows properties panel for selected elements and layers panel for canvas hierarchy.
 * The Properties tab contains the CSS property editor for live preview editing.
 */
import { Box, Code, Layers, Palette } from 'lucide-react';
import { useState } from 'react';
import { useShallow } from 'zustand/shallow';

import { PropertiesPanel } from '../../inspector';
import { SidebarItem } from '../left-sidebar/components/SidebarItem';
import { SidebarToggleIcon } from '../left-sidebar/components/SidebarToggleIcon';
import { TabButton } from '../left-sidebar/components/TabButton';

import type { FC } from 'react';

import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, getCommandKey, HEIGHTS, SIDEBAR } from '@/lib/utils';
import { useUIStore } from '@/stores/ui/ui-store';

type RightSidebarTab = 'properties' | 'code' | 'layers';

// ============================================
// CodePanel - Source Code Viewer
// ============================================

interface CodePanelProps {
  readonly selectedComponentName: string | null;
}

const CodePanel: FC<CodePanelProps> = ({ selectedComponentName }) => {
  if (!selectedComponentName) {
    return (
      <div className="p-3">
        <div className="text-sm text-muted-foreground text-center py-8">
          <Code className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs">Select a component to view its source code</p>
        </div>
      </div>
    );
  }

  // Format component name for display
  const displayName = selectedComponentName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-3">
        <Code className="h-4 w-4" />
        <span className="text-sm font-medium text-foreground">{selectedComponentName}.tsx</span>
      </div>
      <div className="bg-muted/50 rounded-lg border border-border overflow-hidden">
        <div className="p-4 text-center text-muted-foreground">
          <p className="text-xs mb-2">Source code viewing coming soon</p>
          <p className="text-xs opacity-70">Preview the {displayName} component in the canvas</p>
        </div>
      </div>
    </div>
  );
};

interface CanvasRightSidebarProps {
  readonly width: number;
  readonly selectedComponentName: string | null;
}

export const CanvasRightSidebar: FC<CanvasRightSidebarProps> = ({
  width,
  selectedComponentName,
}) => {
  const { toggleCanvasRightSidebar } = useUIStore(
    useShallow((s) => ({
      toggleCanvasRightSidebar: s.toggleCanvasRightSidebar,
    }))
  );

  const isCollapsed = width <= SIDEBAR.collapsed;
  const [activeTab, setActiveTab] = useState<RightSidebarTab>('properties');

  return (
    <aside
      data-sidebar="canvas-right"
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
                  onClick={toggleCanvasRightSidebar}
                  aria-label="Expand sidebar"
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted/60 active:scale-95 transition-[background-color,color,transform] duration-150 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <SidebarToggleIcon expanded={false} direction="right" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="flex items-center gap-2">
                <span>Expand sidebar</span>
                <KbdGroup>
                  <Kbd className="bg-white/15 text-inherit border-white/20">{getCommandKey()}</Kbd>
                  <Kbd className="bg-white/15 text-inherit border-white/20">\</Kbd>
                </KbdGroup>
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          /* Expanded: text on left, button on right */
          <div className="flex items-center justify-between w-full px-3">
            <span className="text-lg font-semibold whitespace-nowrap">Inspector</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleCanvasRightSidebar}
                  aria-label="Collapse sidebar"
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted/60 active:scale-95 transition-[background-color,color,transform] duration-150 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <SidebarToggleIcon expanded={true} direction="right" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="flex items-center gap-2">
                <span>Collapse sidebar</span>
                <KbdGroup>
                  <Kbd className="bg-white/15 text-inherit border-white/20">{getCommandKey()}</Kbd>
                  <Kbd className="bg-white/15 text-inherit border-white/20">\</Kbd>
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
          label="Properties"
          active={activeTab === 'properties'}
          onClick={() => {
            setActiveTab('properties');
          }}
        />
        <TabButton
          label="Code"
          active={activeTab === 'code'}
          onClick={() => {
            setActiveTab('code');
          }}
        />
        <TabButton
          label="Layers"
          active={activeTab === 'layers'}
          onClick={() => {
            setActiveTab('layers');
          }}
        />
      </div>

      {/* Quick Actions - slides up when collapsed */}
      <div
        className={cn(
          'flex flex-col border-b border-divider shrink-0 transition-[gap,padding] duration-150 ease-in-out',
          isCollapsed ? 'gap-0 pt-0 pb-1.5' : 'gap-1 py-1.5'
        )}
      >
        <SidebarItem
          icon={Box}
          label="Element"
          collapsed={isCollapsed}
          equalSpacing={isCollapsed}
        />
        <SidebarItem
          icon={Palette}
          label="Styles"
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
        {activeTab === 'properties' ? (
          /* Properties Tab Content - CSS Editor */
          <div
            className={cn(
              'transition-opacity duration-150',
              isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
            )}
          >
            <PropertiesPanel selectedComponentName={selectedComponentName} />
          </div>
        ) : activeTab === 'code' ? (
          /* Code Tab Content - Source Code Viewer */
          <CodePanel selectedComponentName={selectedComponentName} />
        ) : (
          /* Layers Tab Content */
          <div
            className={cn(
              'p-3 transition-opacity duration-150',
              isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
            )}
          >
            <div className="text-sm text-muted-foreground">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="h-4 w-4" />
                <span className="font-medium text-foreground">Layers</span>
              </div>
              <p className="text-xs mb-3">Canvas layer hierarchy</p>
              <ul className="space-y-1 text-xs" role="tree">
                <li role="treeitem">
                  <button
                    type="button"
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer w-full text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  >
                    <Box className="h-3 w-3" aria-hidden="true" />
                    <span>Frame 1</span>
                  </button>
                </li>
                <li role="treeitem">
                  <button
                    type="button"
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer ml-3 w-full text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  >
                    <Box className="h-3 w-3" aria-hidden="true" />
                    <span>Button</span>
                  </button>
                </li>
                <li role="treeitem">
                  <button
                    type="button"
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer ml-3 w-full text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  >
                    <Box className="h-3 w-3" aria-hidden="true" />
                    <span>Text</span>
                  </button>
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
