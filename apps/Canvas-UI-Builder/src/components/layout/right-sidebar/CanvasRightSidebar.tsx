/**
 * CanvasRightSidebar - Right properties/layers sidebar for Canvas UI Builder
 *
 * Shows inspector panels for the selected component:
 * - Props tab: Edit React component props (variant, size, disabled, etc.)
 * - Styles tab: Edit CSS properties (colors, spacing, typography, etc.)
 * - Code tab: View component source code (coming soon)
 */
import { useComponentPropsStore, useSelectedComponentProps } from '@canvas/stores';
import { Code, Palette, Settings2 } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';

import { PropertiesPanel, PropsEditor } from '../../inspector';
import { SidebarItem } from '../left-sidebar/components/SidebarItem';
import { SidebarToggleIcon } from '../left-sidebar/components/SidebarToggleIcon';
import { TabButton } from '../left-sidebar/components/TabButton';

import type { FC } from 'react';

import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, getCommandKey, HEIGHTS, SIDEBAR } from '@/lib/utils';
import { useUIStore } from '@/stores/ui/ui-store';

type RightSidebarTab = 'props' | 'styles' | 'code';

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

  // Get component props from store
  const componentProps = useSelectedComponentProps();
  const setProps = useComponentPropsStore((state) => state.setProps);

  // Use ref to hold latest props to avoid callback recreation
  const propsRef = useRef(componentProps);
  propsRef.current = componentProps;

  // Handle props change - memoized callback
  const handlePropsChange = useCallback(
    (newProps: Record<string, unknown>): void => {
      setProps(newProps);
    },
    [setProps]
  );

  const isCollapsed = width <= SIDEBAR.collapsed;
  const [activeTab, setActiveTab] = useState<RightSidebarTab>('props');

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
          label="Props"
          active={activeTab === 'props'}
          onClick={() => {
            setActiveTab('props');
          }}
        />
        <TabButton
          label="Styles"
          active={activeTab === 'styles'}
          onClick={() => {
            setActiveTab('styles');
          }}
        />
        <TabButton
          label="Code"
          active={activeTab === 'code'}
          onClick={() => {
            setActiveTab('code');
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
          icon={Settings2}
          label="Props"
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
        {activeTab === 'props' ? (
          /* Props Tab Content - React Props Editor */
          <div
            className={cn(
              'transition-opacity duration-150',
              isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
            )}
          >
            <PropsEditor
              componentName={selectedComponentName}
              props={componentProps}
              onChange={handlePropsChange}
            />
          </div>
        ) : activeTab === 'styles' ? (
          /* Styles Tab Content - CSS Editor */
          <div
            className={cn(
              'transition-opacity duration-150',
              isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
            )}
          >
            <PropertiesPanel selectedComponentName={selectedComponentName} />
          </div>
        ) : (
          /* Code Tab Content - Source Code Viewer */
          <div
            className={cn(
              'transition-opacity duration-150',
              isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
            )}
          >
            <CodePanel selectedComponentName={selectedComponentName} />
          </div>
        )}
      </div>
    </aside>
  );
};
