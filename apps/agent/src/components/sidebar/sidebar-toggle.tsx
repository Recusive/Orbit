import { PanelLeftClose, PanelLeft } from 'lucide-react';

import type { FC } from 'react';

import { useUIStore, useIsLeftSidebarCollapsed } from '@/stores/ui-store';

export interface SidebarToggleProps {
  className?: string;
}

export const SidebarToggle: FC<SidebarToggleProps> = ({ className }) => {
  const isCollapsed = useIsLeftSidebarCollapsed();
  const toggleSidebar = useUIStore((state) => state.toggleLeftSidebar);

  return (
    <button
      onClick={toggleSidebar}
      className={`h-9 w-9 flex items-center justify-center rounded-lg hover:bg-accent transition-colors ${className ?? ''}`}
      title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
      aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
    >
      {isCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
    </button>
  );
};
