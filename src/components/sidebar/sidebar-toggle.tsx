import { PanelLeftClose, PanelLeft } from 'lucide-react';

import type { FC } from 'react';

import { useUiStore } from '@/stores/ui-store';

export interface SidebarToggleProps {
  className?: string;
}

export const SidebarToggle: FC<SidebarToggleProps> = ({ className }) => {
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  return (
    <button
      onClick={toggleSidebar}
      className={`h-9 w-9 flex items-center justify-center rounded-lg hover:bg-accent transition-colors ${className ?? ''}`}
      title={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
      aria-label={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
    >
      {isSidebarCollapsed ? (
        <PanelLeft className="h-4 w-4" />
      ) : (
        <PanelLeftClose className="h-4 w-4" />
      )}
    </button>
  );
};
