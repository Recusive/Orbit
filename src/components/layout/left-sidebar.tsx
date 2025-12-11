import {
  BookOpen,
  ChevronDown,
  Globe,
  Inbox,
  Info,
  Lightbulb,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Settings,
} from 'lucide-react';
import { useCallback, useState } from 'react';

import type {ConversationSummary} from '@/stores/ui-store';
import type { FC } from 'react';

import { useVSCode } from '@/hooks/use-vscode';
import { HEIGHTS, SIDEBAR, TRANSITIONS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useUIStore, useIsLeftSidebarCollapsed, useWorkspaceName, useConversations, useActiveConversationId  } from '@/stores/ui-store';

interface LeftSidebarProps {
  readonly width: number;
}

// Transition string builders
const getCollapseTransition = (collapsed: boolean): string =>
  collapsed
    ? `opacity 0ms, width ${TRANSITIONS.sidebar}`
    : `width ${TRANSITIONS.sidebar}, opacity ${TRANSITIONS.opacity} ${String(TRANSITIONS.opacityDelay)}ms`;

export const LeftSidebar: FC<LeftSidebarProps> = ({ width }) => {
  const { toggleLeftSidebar } = useUIStore();
  const isCollapsed = useIsLeftSidebarCollapsed();
  const workspaceName = useWorkspaceName();
  const conversations = useConversations();
  const activeConversationId = useActiveConversationId();
  const { postMessage } = useVSCode();
  const [workspaceExpanded, setWorkspaceExpanded] = useState(true);

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

  return (
    <aside
      className="h-full flex flex-col border-r border-border bg-sidebar transition-[width] duration-150 ease-in-out overflow-hidden"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex shrink-0" style={{ height: HEIGHTS.headerBar }}>
        {/* Fixed icon column */}
        <div
          className="flex items-center justify-center shrink-0 h-full"
          style={{ width: SIDEBAR.iconColumnWidth }}
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
            'flex items-center gap-1 overflow-hidden h-full',
            isCollapsed ? 'w-0 opacity-0' : 'flex-1 opacity-100'
          )}
          style={{ transition: getCollapseTransition(isCollapsed) }}
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
        <SidebarItem icon={Plus} label="Start conversation" collapsed={isCollapsed} active onClick={handleStartConversation} />
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
  readonly onClick?: () => void;
}

const SidebarItem: FC<SidebarItemProps> = ({
  icon: Icon,
  label,
  collapsed,
  active,
  small,
  onClick,
}) => {
  return (
    <button
      className={cn(
        'flex items-center h-8 rounded-md mx-1.5 transition-colors overflow-hidden hover:bg-accent/50',
        active ? 'text-foreground' : 'text-foreground/70 hover:text-foreground'
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
      className="flex items-center h-8 rounded-md mx-1.5 transition-colors overflow-hidden text-foreground/70 hover:text-foreground hover:bg-accent/50"
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
          active ? 'bg-accent/50 text-foreground' : 'text-foreground/70 hover:text-foreground'
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
