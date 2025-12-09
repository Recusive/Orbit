import React from 'react';

import { useUiStore } from '../../stores/ui-store';

interface LeftSidebarProps {
  width: number;
}

// Placeholder components - these would be imported from their respective modules
const SidebarToggle: React.FC<{ onClick: () => void; isCollapsed: boolean }> = ({
  onClick,
  isCollapsed,
}) => (
  <button
    onClick={onClick}
    className="w-full h-10 flex items-center justify-center hover:bg-accent transition-colors"
    aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
  >
    <svg
      className={`w-5 h-5 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 12h16M4 18h16"
      />
    </svg>
  </button>
);

const InboxButton: React.FC = () => (
  <button
    className="w-full h-10 flex items-center justify-center hover:bg-accent transition-colors"
    aria-label="Inbox"
    title="Inbox"
  >
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
      />
    </svg>
  </button>
);

const NewConversationButton: React.FC = () => (
  <button
    className="w-full h-10 flex items-center justify-center hover:bg-accent transition-colors"
    aria-label="New Conversation"
    title="New Conversation"
  >
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4v16m8-8H4"
      />
    </svg>
  </button>
);

const WorkspaceList: React.FC = () => (
  <div className="flex-1 overflow-y-auto px-2 py-2">
    <div className="text-xs font-semibold text-muted-foreground mb-2 px-2">
      Workspaces
    </div>
    <div className="space-y-1">
      <div className="px-2 py-1.5 text-sm hover:bg-accent rounded cursor-pointer">
        Project 1
      </div>
      <div className="px-2 py-1.5 text-sm hover:bg-accent rounded cursor-pointer">
        Project 2
      </div>
      <div className="px-2 py-1.5 text-sm hover:bg-accent rounded cursor-pointer">
        Project 3
      </div>
    </div>
  </div>
);

const PlaygroundSection: React.FC = () => (
  <div className="px-2 py-2 border-t border-border">
    <div className="text-xs font-semibold text-muted-foreground mb-2 px-2">
      Playground
    </div>
    <div className="space-y-1">
      <div className="px-2 py-1.5 text-sm hover:bg-accent rounded cursor-pointer">
        Scratch Pad
      </div>
    </div>
  </div>
);

const SidebarUtilities: React.FC = () => (
  <div className="px-2 py-2 border-t border-border space-y-1">
    <button
      className="w-full px-2 py-1.5 text-sm hover:bg-accent rounded flex items-center gap-2"
      title="Help & Documentation"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span>Help</span>
    </button>
    <button
      className="w-full px-2 py-1.5 text-sm hover:bg-accent rounded flex items-center gap-2"
      title="Account Settings"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
      <span>Account</span>
    </button>
  </div>
);

export const LeftSidebar: React.FC<LeftSidebarProps> = ({ width }) => {
  const { isSidebarCollapsed, toggleSidebar } = useUiStore();

  return (
    <aside
      className="h-full bg-background border-r border-border flex flex-col min-w-0"
      style={{ width: `${String(width)}px` }}
    >
      {/* Top section - always visible */}
      <div className="flex flex-col">
        <SidebarToggle onClick={toggleSidebar} isCollapsed={isSidebarCollapsed} />
        <InboxButton />
        <NewConversationButton />
      </div>

      {/* Expanded content */}
      {!isSidebarCollapsed && (
        <>
          <WorkspaceList />
          <PlaygroundSection />
          <SidebarUtilities />
        </>
      )}
    </aside>
  );
};
