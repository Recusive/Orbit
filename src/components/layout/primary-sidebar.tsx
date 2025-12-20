import {
  ChevronDown,
  FlaskConical,
  Inbox,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Search,
  Settings,
} from 'lucide-react';
import { useCallback, useState } from 'react';

import type {ConversationSummary} from '@/stores/ui-store';
import type { FC } from 'react';

import { FileExplorer } from '@/components/layout/file-explorer';
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { useTauri } from '@/hooks/use-tauri';
import { HEIGHTS, SIDEBAR, TRANSITIONS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useUIStore, useIsLeftSidebarCollapsed, useWorkspaceName, useConversations, useActiveConversationId  } from '@/stores/ui-store';

type SidebarTab = 'conversations' | 'explorer';

interface PrimarySidebarProps {
  readonly width: number;
}

// Transition string builders
const getCollapseTransition = (collapsed: boolean): string =>
  collapsed
    ? `opacity 0ms, width ${TRANSITIONS.sidebar}`
    : `width ${TRANSITIONS.sidebar}, opacity ${TRANSITIONS.opacity} ${String(TRANSITIONS.opacityDelay)}ms`;

export const PrimarySidebar: FC<PrimarySidebarProps> = ({ width }) => {
  const { toggleLeftSidebar } = useUIStore();
  const isCollapsed = useIsLeftSidebarCollapsed();
  const workspaceName = useWorkspaceName();
  const conversations = useConversations();
  const activeConversationId = useActiveConversationId();
  const { postMessage } = useTauri();
  const [workspaceExpanded, setWorkspaceExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<SidebarTab>('conversations');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<'agent' | 'feedback'>('agent');

  const handleStartConversation = useCallback((): void => {
    postMessage({
      type: 'conversation:create',
      uuid: crypto.randomUUID(),
      title: 'Untitled',
    });
  }, [postMessage]);

  const handleLoadConversation = useCallback((sessionId: string): void => {
    postMessage({
      type: 'conversation:load',
      uuid: crypto.randomUUID(),
      session_id: sessionId,
    });
  }, [postMessage]);

  const handleOpenQuickSearch = useCallback((): void => {
    window.dispatchEvent(new CustomEvent('openCommandPalette'));
  }, []);

  return (
    <aside
      className="h-full flex flex-col border-r border-border bg-sidebar transition-[width] duration-150 ease-in-out overflow-hidden"
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
            <button
              onClick={toggleLeftSidebar}
              className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              title="Expand sidebar"
            >
              <div className="relative h-4 w-4">
                <PanelLeft className="h-4 w-4" />
              </div>
            </button>
          </div>
        ) : (
          /* Expanded: text on left, button on right */
          <div className="flex items-center justify-between w-full px-3">
            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold whitespace-nowrap">Orbit Agent</span>
              <span className="bg-muted rounded px-1 py-0.5 text-[10px] text-muted-foreground whitespace-nowrap">
                Preview
              </span>
            </div>
            <button
              onClick={toggleLeftSidebar}
              className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              title="Collapse sidebar"
            >
              <div className="relative h-4 w-4">
                <PanelLeft className="h-4 w-4" />
                {/* Fill indicator when sidebar is expanded */}
                <div
                  className="absolute left-[2px] top-[2px] w-[4px] h-[12px] bg-current opacity-100"
                  style={{ borderRadius: '1px 0 0 1px' }}
                />
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Search Bar - hidden when collapsed */}
      <div
        className={cn(
          'shrink-0 mx-1.5 overflow-hidden transition-all duration-150 ease-in-out',
          isCollapsed ? 'py-0' : 'py-1'
        )}
        style={{ height: isCollapsed ? 0 : 40, opacity: isCollapsed ? 0 : 1 }}
      >
        <button
          onClick={handleOpenQuickSearch}
          className="flex items-center h-8 rounded-md text-muted-foreground hover:text-foreground transition-colors overflow-hidden border border-border dark:border-border/50 w-full bg-muted/50 hover:bg-muted"
          title="Search files (⌘P)"
        >
          {/* Fixed-width icon column - never moves */}
          <div
            className="flex items-center justify-center shrink-0"
            style={{ width: SIDEBAR.iconColumnWidth - SIDEBAR.itemPadding }}
          >
            <Search className="h-4 w-4 shrink-0" />
          </div>
          {/* Text that slides in */}
          <span className="text-xs whitespace-nowrap overflow-hidden w-auto opacity-100">
            Search files...
          </span>
          <div className="flex items-center gap-0.5 ml-auto mr-2">
            <kbd className="flex items-center justify-center h-5 min-w-[20px] px-1 text-sm font-mono bg-background/50 rounded">
              ⌘
            </kbd>
            <kbd className="flex items-center justify-center h-5 min-w-[20px] px-1 text-[11px] font-mono bg-background/50 rounded">
              P
            </kbd>
          </div>
        </button>
      </div>

      {/* Tab Navigation - hidden when collapsed */}
      <div
        className={cn(
          'flex items-center shrink-0 px-1.5 gap-0.5 overflow-hidden transition-all duration-150 ease-in-out',
          isCollapsed ? '' : 'border-b border-border'
        )}
        style={{ height: isCollapsed ? 0 : 40, opacity: isCollapsed ? 0 : 1 }}
      >
        <TabButton
          label="Sessions"
          active={activeTab === 'conversations'}
          onClick={() => { setActiveTab('conversations'); }}
        />
        <TabButton
          label="Explorer"
          active={activeTab === 'explorer'}
          onClick={() => { setActiveTab('explorer'); }}
        />
      </div>

      {/* Main Actions (only show for conversations tab) - slides up when collapsed */}
      {activeTab === 'conversations' ? (
        <div className={cn(
          'flex flex-col border-b border-border shrink-0 transition-all duration-150 ease-in-out',
          isCollapsed ? 'gap-0 pt-0 pb-1.5' : 'gap-1 py-1.5'
        )}>
          <SidebarItem icon={Inbox} label="Inbox" collapsed={isCollapsed} equalSpacing={isCollapsed} />
          <SidebarItem icon={Plus} label="Start conversation" collapsed={isCollapsed} equalSpacing={isCollapsed} onClick={handleStartConversation} />
        </div>
      ) : null}

      {/* Tab Content */}
      <div className={cn(
        'flex-1 overflow-x-hidden',
        isCollapsed ? 'overflow-y-hidden' : 'overflow-y-auto'
      )}>
        {activeTab === 'conversations' ? (
          /* Conversations Tab Content */
          <div className={cn(
            'py-1.5 transition-opacity duration-150',
            isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
          )}>
            <div className="flex items-center justify-between px-3 py-1">
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Workspaces</span>
              <button className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground shrink-0">
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <div className="flex flex-col gap-0.5 mt-1">
              {workspaceName ? (
                <WorkspaceItem
                  name={workspaceName}
                  active
                  collapsed={isCollapsed}
                  expanded={workspaceExpanded}
                  onToggle={() => { setWorkspaceExpanded(!workspaceExpanded); }}
                />
              ) : null}
              {/* Conversation list with timeline */}
              {workspaceExpanded && conversations.length > 0 ? <div className="relative ml-[19px]">
                  {/* Vertical timeline line */}
                  <div className="absolute left-0 top-0 bottom-2 w-px bg-border" />
                  {/* Conversations */}
                  <div className="flex flex-col gap-0.5">
                    {conversations.map((conv) => (
                      <ConversationItem
                        key={conv.sessionId}
                        conversation={conv}
                        active={conv.sessionId === activeConversationId}
                        collapsed={isCollapsed}
                        onClick={() => { handleLoadConversation(conv.sessionId); }}
                      />
                    ))}
                  </div>
                </div> : null}
            </div>
          </div>
        ) : (
          /* Explorer Tab Content */
          <div className={cn(
            'h-full transition-opacity duration-150',
            isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
          )}>
            <FileExplorer collapsed={isCollapsed} />
          </div>
        )}
      </div>

      <hr className={cn('border-border shrink-0', isCollapsed ? 'my-0' : 'my-2')} />

      {/* Utilities */}
      <div className={cn(
        'flex flex-col shrink-0',
        isCollapsed ? 'gap-0 py-0' : 'gap-1 py-1.5'
      )}>
        <SidebarItem icon={Settings} label="Settings" collapsed={isCollapsed} equalSpacing={isCollapsed} onClick={() => { setSettingsSection('agent'); setSettingsOpen(true); }} />
        <SidebarItem icon={FlaskConical} label="Feedback" collapsed={isCollapsed} equalSpacing={isCollapsed} onClick={() => { setSettingsSection('feedback'); setSettingsOpen(true); }} />
      </div>

      {/* Settings Dialog */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} defaultSection={settingsSection} />
    </aside>
  );
};

interface SidebarItemProps {
  readonly icon: FC<{ className?: string }>;
  readonly label: string;
  readonly collapsed: boolean;
  readonly active?: boolean;
  readonly small?: boolean;
  readonly equalSpacing?: boolean;
  readonly onClick?: () => void;
}

const SidebarItem: FC<SidebarItemProps> = ({
  icon: Icon,
  label,
  collapsed,
  active,
  small,
  equalSpacing,
  onClick,
}) => {
  // When collapsed with equalSpacing, render a small square button like the panel toggler
  if (equalSpacing) {
    return (
      <div
        className="flex items-center justify-center shrink-0"
        style={{ height: 32, width: SIDEBAR.iconColumnWidth }}
      >
        <button
          className={cn(
            'h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors',
            active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
          title={label}
          onClick={onClick}
        >
          <Icon className={cn('shrink-0', small ? 'h-3 w-3' : 'h-4 w-4')} />
        </button>
      </div>
    );
  }

  return (
    <button
      className={cn(
        'flex items-center h-8 rounded-md mx-1.5 transition-all overflow-hidden hover:bg-accent/50',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
      title={collapsed ? label : undefined}
      onClick={onClick}
    >
      {/* Fixed-width icon column - never moves */}
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: SIDEBAR.iconColumnWidth - SIDEBAR.itemPadding }}
      >
        <Icon className={cn('shrink-0', small ? 'h-3 w-3' : 'h-4 w-4')} />
      </div>
      {/* Text that slides in */}
      <span
        className={cn(
          'text-sm whitespace-nowrap overflow-hidden pr-2',
          collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
        )}
        style={{ transition: getCollapseTransition(collapsed) }}
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
  readonly expanded?: boolean;
  readonly onToggle?: () => void;
}

const WorkspaceItem: FC<WorkspaceItemProps> = ({ name, collapsed = false, expanded = true, onToggle }) => {
  return (
    <button
      className="flex items-center h-8 rounded-md mx-1.5 transition-colors overflow-hidden text-muted-foreground hover:text-foreground hover:bg-accent/50"
      onClick={onToggle}
    >
      {/* Fixed-width icon column */}
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: SIDEBAR.iconColumnWidth - SIDEBAR.itemPadding }}
      >
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', !expanded && '-rotate-90')} />
      </div>
      {/* Text that slides in */}
      <span
        className={cn(
          'text-sm whitespace-nowrap overflow-hidden pr-2',
          collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
        )}
        style={{ transition: getCollapseTransition(collapsed) }}
      >
        {name}
      </span>
    </button>
  );
};

interface ConversationItemProps {
  readonly conversation: ConversationSummary;
  readonly active?: boolean;
  readonly collapsed?: boolean;
  readonly onClick?: () => void;
}

const ConversationItem: FC<ConversationItemProps> = ({
  conversation,
  active = false,
  collapsed = false,
  onClick,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="relative group mx-1.5 ml-2"
      onMouseEnter={() => { setIsHovered(true); }}
      onMouseLeave={() => { setIsHovered(false); }}
    >
      <button
        className={cn(
          'flex items-center h-7 w-full rounded-md pl-[7px] pr-7 transition-colors overflow-hidden hover:bg-accent/50',
          active ? 'bg-accent/50 text-foreground' : 'text-muted-foreground hover:text-foreground'
        )}
        title={conversation.title}
        onClick={onClick}
      >
        {/* Text with gradient fade for overflow */}
        <span
          className={cn(
            'text-sm whitespace-nowrap overflow-hidden flex-1 text-left',
            collapsed ? 'w-0 opacity-0' : ''
          )}
          style={{
            transition: getCollapseTransition(collapsed),
            maskImage: 'linear-gradient(to right, black 85%, transparent 98%)',
            WebkitMaskImage: 'linear-gradient(to right, black 85%, transparent 98%)',
            maskSize: '100% 100%',
            WebkitMaskSize: '100% 100%',
          }}
        >
          {conversation.title}
        </span>
      </button>
      {/* More options button - appears on hover */}
      {!collapsed && (
        <button
          className={cn(
            'absolute right-0.5 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded transition-opacity hover:bg-accent',
            isHovered ? 'opacity-100' : 'opacity-0'
          )}
          onClick={(e) => {
            e.stopPropagation();
            // TODO: Show dropdown menu
          }}
          title="More options"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// Tab Button Component
// ═══════════════════════════════════════════════════════════════

interface TabButtonProps {
  readonly label: string;
  readonly active: boolean;
  readonly onClick: () => void;
}

const TabButton: FC<TabButtonProps> = ({ label, active, onClick }) => {
  return (
    <button
      className={cn(
        'relative flex items-center justify-center transition-colors h-7 px-3 flex-1',
        active
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      )}
      onClick={onClick}
      title={label}
    >
      {/* Tab background - Orbit style */}
      <div
        className={cn(
          'absolute inset-0 rounded-t-md transition-colors',
          active
            ? 'bg-sidebar-accent'
            : 'hover:bg-muted/50'
        )}
      />
      {/* Active indicator */}
      {active ? (
        <div className="absolute bottom-0 inset-x-0 h-0.5 bg-primary" />
      ) : null}
      <span className="relative text-xs font-medium truncate">{label}</span>
    </button>
  );
};
