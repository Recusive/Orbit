import {
  ChevronDown,
  FlaskConical,
  Inbox,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useState } from 'react';

import type { SettingsDialogProps } from '@/components/modals/settings/settings-dialog';
import type { ConversationSummary } from '@/stores/ui-store';
import type { FC } from 'react';

import { FileExplorer } from '@/components/files';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTauri } from '@/hooks/use-tauri';
import { HEIGHTS, SIDEBAR, TRANSITIONS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import {
  useUIStore,
  useIsLeftSidebarCollapsed,
  useWorkspaceName,
  useConversations,
  useActiveConversationId,
} from '@/stores/ui-store';

// Custom sidebar toggle icon - thicker middle line when expanded
const SidebarToggleIcon: FC<{ expanded: boolean }> = ({ expanded }) => (
  <svg
    aria-hidden="true"
    width="16"
    height="16"
    viewBox="1 1 22 22"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Outer frame */}
    <path
      d="M19 5V19H21V5H19ZM19 19H5V21H19V19ZM5 19V5H3V19H5ZM5 5H19V3H5V5ZM5 5V5V3C3.89543 3 3 3.89543 3 5H5ZM5 19H3C3 20.1046 3.89543 21 5 21V19ZM19 19V21C20.1046 21 21 20.1046 21 19H19ZM21 5C21 3.89543 20.1046 3 19 3V5H21Z"
      fill="currentColor"
    />
    {/* Middle vertical line - thicker when expanded, with gap from left edge */}
    <rect
      x={expanded ? 7 : 7}
      y="7"
      width={expanded ? 5 : 2}
      height="10"
      rx="1"
      fill="currentColor"
    />
  </svg>
);

// Lazy load heavy components
const LazySettingsDialog = lazy(() =>
  import('@/components/modals/settings/settings-dialog').then((m) => ({
    default: m.SettingsDialog,
  }))
);
const SettingsDialog: FC<SettingsDialogProps> = (props) => (
  <Suspense fallback={null}>
    <LazySettingsDialog {...props} />
  </Suspense>
);

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
  const {
    toggleLeftSidebar,
    settingsDialogOpen,
    settingsDialogSection,
    setSettingsDialogOpen,
    openSettings,
  } = useUIStore();
  const isCollapsed = useIsLeftSidebarCollapsed();
  const workspaceName = useWorkspaceName();
  const conversations = useConversations();
  const activeConversationId = useActiveConversationId();
  const { postMessage } = useTauri();
  const [workspaceExpanded, setWorkspaceExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<SidebarTab>('conversations');

  const handleStartConversation = useCallback((): void => {
    postMessage({
      type: 'conversation:create',
      uuid: crypto.randomUUID(),
      title: 'Untitled',
    });
  }, [postMessage]);

  const handleLoadConversation = useCallback(
    (sessionId: string): void => {
      // Emit loading state FIRST to prevent flash of welcome screen
      window.postMessage(
        {
          type: 'conversation:loading',
          uuid: crypto.randomUUID(),
          session_id: sessionId,
        },
        '*'
      );
      // Then request the conversation data
      postMessage({
        type: 'conversation:load',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
      });
    },
    [postMessage]
  );

  const handleOpenQuickSearch = useCallback((): void => {
    window.dispatchEvent(new CustomEvent('openCommandPalette'));
  }, []);

  return (
    <aside
      className="h-full flex flex-col border-r border-border/40 bg-card transition-[width] duration-150 ease-in-out overflow-hidden shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08),0_4px_12px_-4px_rgba(0,0,0,0.05)] dark:shadow-none"
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
                  onClick={toggleLeftSidebar}
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted/60 active:scale-95 transition-all duration-150 text-muted-foreground hover:text-foreground"
                >
                  <SidebarToggleIcon expanded={false} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="flex items-center gap-2">
                <span>Expand sidebar</span>
                <KbdGroup>
                  <Kbd className="bg-white/15 text-inherit border-white/20">⌘</Kbd>
                  <Kbd className="bg-white/15 text-inherit border-white/20">.</Kbd>
                </KbdGroup>
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          /* Expanded: text on left, button on right */
          <div className="flex items-center justify-between w-full px-3">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold whitespace-nowrap">Orbit Agent</span>
              <span className="bg-primary/8 text-primary/70 rounded-full px-1.5 py-0.5 text-[9px] font-medium tracking-wide whitespace-nowrap">
                Preview
              </span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleLeftSidebar}
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted/60 active:scale-95 transition-all duration-150 text-muted-foreground hover:text-foreground"
                >
                  <SidebarToggleIcon expanded={true} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="flex items-center gap-2">
                <span>Collapse sidebar</span>
                <KbdGroup>
                  <Kbd className="bg-white/15 text-inherit border-white/20">⌘</Kbd>
                  <Kbd className="bg-white/15 text-inherit border-white/20">.</Kbd>
                </KbdGroup>
              </TooltipContent>
            </Tooltip>
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
          className="flex items-center h-8 rounded-lg text-muted-foreground hover:text-foreground overflow-hidden border border-border/50 w-full bg-muted/40 hover:bg-muted/60 hover:border-border/60 transition-all duration-200"
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
            <kbd className="flex items-center justify-center h-5 min-w-[20px] px-1 text-sm font-mono bg-background/60 rounded-md shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              ⌘
            </kbd>
            <kbd className="flex items-center justify-center h-5 min-w-[20px] px-1 text-[11px] font-mono bg-background/60 rounded-md shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              P
            </kbd>
          </div>
        </button>
      </div>

      {/* Tab Navigation - hidden when collapsed */}
      <div
        className={cn(
          'flex items-center shrink-0 px-1.5 gap-0.5 overflow-hidden transition-all duration-150 ease-in-out',
          isCollapsed ? '' : 'border-b border-border/60'
        )}
        style={{ height: isCollapsed ? 0 : 40, opacity: isCollapsed ? 0 : 1 }}
      >
        <TabButton
          label="Sessions"
          active={activeTab === 'conversations'}
          onClick={() => {
            setActiveTab('conversations');
          }}
        />
        <TabButton
          label="Explorer"
          active={activeTab === 'explorer'}
          onClick={() => {
            setActiveTab('explorer');
          }}
        />
      </div>

      {/* Main Actions (only show for conversations tab) - slides up when collapsed */}
      {activeTab === 'conversations' ? (
        <div
          className={cn(
            'flex flex-col border-b border-border/50 shrink-0 transition-all duration-150 ease-in-out',
            isCollapsed ? 'gap-0 pt-0 pb-1.5' : 'gap-1 py-1.5'
          )}
        >
          <SidebarItem
            icon={Inbox}
            label="Inbox"
            collapsed={isCollapsed}
            equalSpacing={isCollapsed}
          />
          <SidebarItem
            icon={Plus}
            label="Start conversation"
            collapsed={isCollapsed}
            equalSpacing={isCollapsed}
            onClick={handleStartConversation}
          />
        </div>
      ) : null}

      {/* Tab Content */}
      <div
        className={cn(
          'flex-1 overflow-x-hidden',
          isCollapsed ? 'overflow-y-hidden' : 'overflow-y-auto'
        )}
      >
        {activeTab === 'conversations' ? (
          /* Conversations Tab Content */
          <div
            className={cn(
              'py-1.5 transition-opacity duration-150',
              isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
            )}
          >
            <div className="flex items-center justify-between px-3 py-1">
              <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-[0.04em] whitespace-nowrap">
                Workspaces
              </span>
              <button className="h-5 w-5 flex items-center justify-center rounded-md hover:bg-muted/60 active:scale-90 transition-all duration-150 text-muted-foreground hover:text-foreground shrink-0">
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
                  onToggle={() => {
                    setWorkspaceExpanded(!workspaceExpanded);
                  }}
                />
              ) : null}
              {/* Conversation list with timeline */}
              {workspaceExpanded && conversations.length > 0 ? (
                <div className="relative ml-[19px]">
                  {/* Vertical timeline line */}
                  <div className="absolute left-0 top-0 bottom-2 w-px bg-border/60" />
                  {/* Conversations */}
                  <div className="flex flex-col gap-0.5">
                    {conversations.map((conv) => (
                      <ConversationItem
                        key={conv.sessionId}
                        conversation={conv}
                        active={conv.sessionId === activeConversationId}
                        collapsed={isCollapsed}
                        onClick={() => {
                          handleLoadConversation(conv.sessionId);
                        }}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          /* Explorer Tab Content */
          <div
            className={cn(
              'h-full transition-opacity duration-150',
              isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
            )}
          >
            <FileExplorer collapsed={isCollapsed} />
          </div>
        )}
      </div>

      <hr className={cn('border-border/40 shrink-0', isCollapsed ? 'my-0' : 'my-2')} />

      {/* Utilities */}
      <div className={cn('flex flex-col shrink-0', isCollapsed ? 'gap-0 py-0' : 'gap-1 py-1.5')}>
        <SidebarItem
          icon={Settings}
          label="Settings"
          collapsed={isCollapsed}
          equalSpacing={isCollapsed}
          shortcut={['⌘', ',']}
          onClick={() => {
            openSettings('agent');
          }}
        />
        <SidebarItem
          icon={FlaskConical}
          label="Feedback"
          collapsed={isCollapsed}
          equalSpacing={isCollapsed}
          onClick={() => {
            openSettings('feedback');
          }}
        />
      </div>

      {/* Settings Dialog */}
      <SettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
        defaultSection={settingsDialogSection}
      />
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
  readonly shortcut?: string[];
  readonly onClick?: () => void;
}

const SidebarItem: FC<SidebarItemProps> = ({
  icon: Icon,
  label,
  collapsed,
  active,
  small,
  equalSpacing,
  shortcut,
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
            'h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted/60 active:scale-95 transition-all duration-150',
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
        'flex items-center h-8 rounded-lg mx-1.5 overflow-hidden hover:bg-muted/50 active:scale-[0.98] transition-all duration-200',
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
          'text-sm whitespace-nowrap overflow-hidden',
          collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
        )}
        style={{ transition: getCollapseTransition(collapsed) }}
      >
        {label}
      </span>
      {/* Keyboard shortcut */}
      {shortcut && !collapsed ? (
        <KbdGroup className="ml-auto mr-2">
          {shortcut.map((key, index) => (
            <Kbd key={index} className="border-0 bg-muted/70 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              {key}
            </Kbd>
          ))}
        </KbdGroup>
      ) : null}
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

const WorkspaceItem: FC<WorkspaceItemProps> = ({
  name,
  collapsed = false,
  expanded = true,
  onToggle,
}) => {
  return (
    <button
      className="flex items-center h-8 rounded-lg mx-1.5 overflow-hidden text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all duration-200"
      onClick={onToggle}
    >
      {/* Fixed-width icon column */}
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: SIDEBAR.iconColumnWidth - SIDEBAR.itemPadding }}
      >
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 transition-transform duration-200',
            !expanded && '-rotate-90'
          )}
        />
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
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
    >
      <button
        className={cn(
          'flex items-center h-7 w-full rounded-lg pl-[7px] pr-7 overflow-hidden hover:bg-muted/40 transition-all duration-200',
          active ? 'bg-muted/50 text-foreground' : 'text-muted-foreground hover:text-foreground'
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
            'absolute right-0.5 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-md transition-all duration-150 hover:bg-muted/60 active:scale-90',
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
        'relative flex items-center justify-center h-7 px-3 flex-1 transition-all duration-200',
        active ? 'text-foreground' : 'text-muted-foreground/80 hover:text-foreground'
      )}
      onClick={onClick}
      title={label}
    >
      {/* Tab background - Orbit style */}
      <div
        className={cn(
          'absolute inset-0 rounded-t-md transition-colors duration-200',
          active ? 'bg-muted/70' : 'hover:bg-muted/40'
        )}
      />
      {/* Active indicator */}
      {active ? <div className="absolute bottom-0 inset-x-0 h-0.5 bg-primary/90" /> : null}
      <span className="relative text-xs font-medium truncate">{label}</span>
    </button>
  );
};
