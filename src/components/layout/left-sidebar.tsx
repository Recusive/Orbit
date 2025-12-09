import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  MessageSquarePlus,
  FolderOpen,
  Compass,
  BookOpen,
  Globe,
  Settings,
  MessageCircle,
} from 'lucide-react';

import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useUIStore, useIsLeftSidebarCollapsed } from '@/stores/ui-store';

interface LeftSidebarProps {
  readonly width: number;
}

export const LeftSidebar: FC<LeftSidebarProps> = ({ width }) => {
  const { toggleLeftSidebar } = useUIStore();
  const isCollapsed = useIsLeftSidebarCollapsed();

  return (
    <aside
      className="h-full flex flex-col border-r border-border bg-sidebar transition-all duration-150"
      style={{ width }}
    >
      {/* Toggle */}
      <div className="p-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={toggleLeftSidebar}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Main nav */}
      <nav className="flex flex-col gap-1 px-2">
        <SidebarButton icon={Inbox} label="Inbox" collapsed={isCollapsed} />
        <SidebarButton
          icon={MessageSquarePlus}
          label="New Chat"
          collapsed={isCollapsed}
          primary
        />
      </nav>

      <Separator className="my-2" />

      {/* Workspaces */}
      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto px-2">
          <div className="text-xs font-medium text-muted-foreground mb-2 px-2">
            Workspaces
          </div>
          <SidebarButton icon={FolderOpen} label="Default" collapsed={false} />
          <SidebarButton icon={FolderOpen} label="Orbit CLI" collapsed={false} />
        </div>
      )}

      {isCollapsed ? <div className="flex-1" /> : null}

      <Separator className="my-2" />

      {/* Utilities */}
      <nav className="flex flex-col gap-1 px-2 pb-2">
        <SidebarButton icon={Compass} label="Playground" collapsed={isCollapsed} />
        <SidebarButton icon={BookOpen} label="Knowledge" collapsed={isCollapsed} />
        <SidebarButton icon={Globe} label="Browser" collapsed={isCollapsed} />
        <SidebarButton icon={Settings} label="Settings" collapsed={isCollapsed} />
        <SidebarButton icon={MessageCircle} label="Feedback" collapsed={isCollapsed} />
      </nav>
    </aside>
  );
};

interface SidebarButtonProps {
  readonly icon: FC<{ className?: string }>;
  readonly label: string;
  readonly collapsed: boolean;
  readonly primary?: boolean;
}

const SidebarButton: FC<SidebarButtonProps> = ({
  icon: Icon,
  label,
  collapsed,
  primary,
}) => {
  return (
    <Button
      variant={primary === true ? 'default' : 'ghost'}
      className={cn(
        'justify-start gap-2',
        collapsed ? 'w-8 h-8 p-0 justify-center' : 'w-full h-8'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Button>
  );
};
