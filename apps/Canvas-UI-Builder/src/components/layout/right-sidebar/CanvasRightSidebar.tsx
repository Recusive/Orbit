/**
 * CanvasRightSidebar - Right properties/layers sidebar for Canvas UI Builder
 *
 * Shows properties panel for selected elements and layers panel for canvas hierarchy.
 */
import { Box, Layers, Palette, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { useShallow } from 'zustand/shallow';

import { SidebarItem } from '../left-sidebar/components/SidebarItem';
import { SidebarToggleIcon } from '../left-sidebar/components/SidebarToggleIcon';
import { TabButton } from '../left-sidebar/components/TabButton';

import type { FC } from 'react';

import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, getCommandKey, HEIGHTS, SIDEBAR } from '@/lib/utils';
import { useUIStore } from '@/stores/ui/ui-store';

type RightSidebarTab = 'properties' | 'layers';

interface CanvasRightSidebarProps {
  readonly width: number;
}

export const CanvasRightSidebar: FC<CanvasRightSidebarProps> = ({ width }) => {
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
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted/60 active:scale-95 transition-[background-color,color,transform] duration-150 text-muted-foreground hover:text-foreground"
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
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted/60 active:scale-95 transition-[background-color,color,transform] duration-150 text-muted-foreground hover:text-foreground"
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
          /* Properties Tab Content */
          <div
            className={cn(
              'p-3 transition-opacity duration-150',
              isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
            )}
          >
            <div className="text-sm text-muted-foreground">
              <div className="flex items-center gap-2 mb-3">
                <Settings2 className="h-4 w-4" />
                <span className="font-medium text-foreground">Properties</span>
              </div>
              <p className="text-xs mb-3">Select an element to view its properties</p>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span>Width</span>
                  <span className="text-foreground/60">—</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Height</span>
                  <span className="text-foreground/60">—</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>X Position</span>
                  <span className="text-foreground/60">—</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Y Position</span>
                  <span className="text-foreground/60">—</span>
                </div>
              </div>
            </div>
          </div>
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
              <ul className="space-y-1 text-xs">
                <li className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer">
                  <Box className="h-3 w-3" />
                  <span>Frame 1</span>
                </li>
                <li className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer ml-3">
                  <Box className="h-3 w-3" />
                  <span>Button</span>
                </li>
                <li className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer ml-3">
                  <Box className="h-3 w-3" />
                  <span>Text</span>
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
