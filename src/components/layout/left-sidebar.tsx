import {
  BookOpen,
  ChevronDown,
  Globe,
  Inbox,
  Info,
  Lightbulb,
  PanelLeft,
  Plus,
  Settings,
} from 'lucide-react';

import type { FC } from 'react';

import { cn } from '@/lib/utils';
import { useUIStore, useIsLeftSidebarCollapsed } from '@/stores/ui-store';

interface LeftSidebarProps {
  readonly width: number;
}

// Fixed width for icon column - matches collapsed sidebar width minus padding
const ICON_COLUMN_WIDTH = 40;

export const LeftSidebar: FC<LeftSidebarProps> = ({ width }) => {
  const { toggleLeftSidebar } = useUIStore();
  const isCollapsed = useIsLeftSidebarCollapsed();

  return (
    <aside
      className="h-full flex flex-col border-r border-border bg-sidebar transition-[width] duration-150 ease-in-out overflow-hidden"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex items-center h-[35px] shrink-0">
        {/* Fixed icon column */}
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: ICON_COLUMN_WIDTH }}
        >
          <button
            onClick={toggleLeftSidebar}
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors opacity-70 hover:opacity-100"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <div className="relative h-4 w-4">
              <PanelLeft className="h-4 w-4" />
              {/* Fill indicator when sidebar is expanded */}
              <div
                className={cn(
                  'absolute left-[2px] top-[2px] w-[4px] h-[12px] bg-current transition-opacity duration-150',
                  isCollapsed ? 'opacity-0' : 'opacity-100'
                )}
                style={{ borderRadius: '1px 0 0 1px' }}
              />
            </div>
          </button>
        </div>
        {/* Text that slides in */}
        <div
          className={cn(
            'flex items-center gap-1 overflow-hidden',
            isCollapsed ? 'w-0 opacity-0' : 'flex-1 opacity-100'
          )}
          style={{
            transition: isCollapsed
              ? 'opacity 0ms, width 150ms ease-in-out'
              : 'width 150ms ease-in-out, opacity 100ms ease-in-out 50ms'
          }}
        >
          <span className="text-sm font-semibold whitespace-nowrap">Agent Manager</span>
          <span className="bg-muted rounded px-1 py-0.5 text-[10px] text-muted-foreground whitespace-nowrap">
            Preview
          </span>
        </div>
      </div>

      {/* Main Actions */}
      <div className="flex flex-col gap-1 py-1.5 border-b border-border shrink-0">
        <SidebarItem icon={Inbox} label="Inbox" collapsed={isCollapsed} />
        <SidebarItem icon={Plus} label="Start conversation" collapsed={isCollapsed} active />
      </div>

      {/* Workspaces */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className={cn(
          'py-1.5 transition-opacity duration-150',
          isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
        )}>
          <div className="flex items-center justify-between px-3 py-1">
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Workspaces</span>
            <button className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent opacity-70 hover:opacity-100 shrink-0">
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <div className="flex flex-col gap-0.5 mt-1">
            <WorkspaceItem name="Docs" active collapsed={isCollapsed} />
          </div>
        </div>
      </div>

      <hr className="border-border my-2 shrink-0" />

      {/* Utilities */}
      <div className="flex flex-col gap-1 py-1.5 shrink-0">
        <SidebarItem icon={Info} label="Playground" collapsed={isCollapsed} small />
        <SidebarItem icon={BookOpen} label="Knowledge" collapsed={isCollapsed} />
        <SidebarItem icon={Globe} label="Browser" collapsed={isCollapsed} />
        <SidebarItem icon={Settings} label="Settings" collapsed={isCollapsed} />
        <SidebarItem icon={Lightbulb} label="Provide Feedback" collapsed={isCollapsed} />
      </div>
    </aside>
  );
};

interface SidebarItemProps {
  readonly icon: FC<{ className?: string }>;
  readonly label: string;
  readonly collapsed: boolean;
  readonly active?: boolean;
  readonly small?: boolean;
}

const SidebarItem: FC<SidebarItemProps> = ({
  icon: Icon,
  label,
  collapsed,
  active,
  small,
}) => {
  return (
    <button
      className={cn(
        'flex items-center h-8 rounded-md mx-1.5 transition-colors overflow-hidden',
        'text-foreground/70 hover:text-foreground hover:bg-accent/50'
      )}
      title={collapsed ? label : undefined}
    >
      {/* Fixed-width icon column - never moves */}
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: ICON_COLUMN_WIDTH - 12 }} // minus mx-1.5 (6px each side)
      >
        <Icon className={cn('shrink-0', small ? 'h-3 w-3' : 'h-4 w-4')} />
      </div>
      {/* Text that slides in */}
      <span
        className={cn(
          'text-sm whitespace-nowrap overflow-hidden pr-2',
          collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
        )}
        style={{
          transition: collapsed
            ? 'opacity 0ms, width 150ms ease-in-out'
            : 'width 150ms ease-in-out, opacity 100ms ease-in-out 50ms'
        }}
      >
        {label}
      </span>
    </button>
  );
};

interface WorkspaceItemProps {
  readonly name: string;
  readonly active?: boolean;
  readonly collapsed?: boolean;
}

const WorkspaceItem: FC<WorkspaceItemProps> = ({ name, collapsed }) => {
  return (
    <button
      className="flex items-center h-8 rounded-md mx-1.5 transition-colors overflow-hidden text-foreground/70 hover:text-foreground hover:bg-accent/50"
    >
      {/* Fixed-width icon column */}
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: ICON_COLUMN_WIDTH - 12 }}
      >
        <ChevronDown className="h-4 w-4 shrink-0" />
      </div>
      {/* Text that slides in */}
      <span
        className={cn(
          'text-sm whitespace-nowrap overflow-hidden pr-2',
          collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
        )}
        style={{
          transition: collapsed
            ? 'opacity 0ms, width 150ms ease-in-out'
            : 'width 150ms ease-in-out, opacity 100ms ease-in-out 50ms'
        }}
      >
        {name}
      </span>
    </button>
  );
};
