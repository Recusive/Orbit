/**
 * ContentTopBar — header bar inside the floating content card
 *
 * Refactored from header-bar.tsx for the Dia-style layout.
 * Key differences from old HeaderBar:
 * - No pl-[80px] traffic light padding (traffic lights are on the base layer)
 * - Sidebar toggle button appears on the left when sidebar is closed
 * - Renders inside ContentCard (not at the window root)
 */
import { IconSquareGridCircle } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconSquareGridCircle';
import { ArrowLeft, ArrowRight, PanelLeft, PanelRight, Terminal } from 'lucide-react';
import { useCallback } from 'react';
import { useShallow } from 'zustand/shallow';

import type { FC } from 'react';

import { SquareAndPencil } from '@/components/icons';
import { conversationBelongsToWorktree } from '@/components/layout/primary-sidebar/hooks/use-sidebar-actions';
import { SFSymbol } from '@/components/shared';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTauri } from '@/hooks/agent/use-tauri';
import { cn } from '@/lib/utils';
import { HEIGHTS } from '@/lib/utils/constants';
import { useBranchDiffStats } from '@/stores/git/git-store';
import {
  useUIStore,
  useWorkspaceName,
  useHasWorkspace,
  useActiveConversationTitle,
  useReviewPanelOpen,
} from '@/stores/ui/ui-store';

/**
 * GitHub-style diff stats indicator showing additions/deletions
 */
const DiffStatsButton: FC = () => {
  const branchStats = useBranchDiffStats();
  const additions = branchStats?.additions ?? 0;
  const deletions = branchStats?.deletions ?? 0;
  const fileCount = branchStats?.filesChanged ?? 0;
  const setActivityTab = useUIStore((state) => state.setActivityTab);

  const tooltipText =
    fileCount === 0
      ? 'No changes on this branch'
      : `${String(fileCount)} file${fileCount !== 1 ? 's' : ''} changed on branch`;

  const handleClick = (): void => {
    setActivityTab('source');
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          data-tauri-drag-region={false}
          onClick={handleClick}
          className={cn(
            'flex items-center h-6 rounded-full overflow-hidden',
            'text-[11px] font-medium tabular-nums',
            'transition-[background-color,color] duration-150'
          )}
        >
          <span className="flex items-center gap-0.5 px-2 h-full text-success bg-success/20">
            <span>+{additions}</span>
          </span>
          <span className="flex items-center gap-0.5 px-2 h-full text-destructive bg-destructive/20">
            <span>
              {'\u2212'}
              {deletions}
            </span>
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltipText}</TooltipContent>
    </Tooltip>
  );
};

export interface ContentTopBarProps {
  /** Whether the sidebar is currently open */
  readonly sidebarOpen: boolean;
  /** When true, renders with a transparent background (used on welcome page) */
  readonly transparent?: boolean;
  readonly className?: string;
}

export const ContentTopBar: FC<ContentTopBarProps> = ({
  sidebarOpen,
  className,
  transparent = false,
}) => {
  const workspaceName = useWorkspaceName();
  const hasWorkspace = useHasWorkspace();
  const conversationTitle = useActiveConversationTitle();
  const reviewPanelOpen = useReviewPanelOpen();

  const isDemo = new URLSearchParams(window.location.search).get('demo') === 'true';

  const { postMessage } = useTauri();

  const {
    toggleLeftSidebar,
    toggleReviewPanel,
    toggleRightSidebar,
    toggleBottomPanel,
    setTerminalPosition,
    setVaultOpen,
    conversations,
    activeConversationId,
    workspacePath,
    activeWorktreePath,
    rightSidebarOpen,
    bottomPanelOpen,
    terminalCollapsed,
  } = useUIStore(
    useShallow((s) => ({
      toggleLeftSidebar: s.toggleLeftSidebar,
      toggleReviewPanel: s.toggleReviewPanel,
      toggleRightSidebar: s.toggleRightSidebar,
      toggleBottomPanel: s.toggleBottomPanel,
      setTerminalPosition: s.setTerminalPosition,
      setVaultOpen: s.setVaultOpen,
      conversations: s.conversations,
      activeConversationId: s.activeConversationId,
      workspacePath: s.workspacePath,
      activeWorktreePath: s.activeWorktreePath,
      rightSidebarOpen: s.rightSidebarOpen,
      bottomPanelOpen: s.bottomPanelOpen,
      terminalCollapsed: s.terminalCollapsed,
    }))
  );

  const handleNewSession = useCallback((): void => {
    setVaultOpen(false);
    const activeConv = conversations.find((c) => c.sessionId === activeConversationId);
    if (
      activeConv?.title === 'Untitled' &&
      conversationBelongsToWorktree(activeConv, activeWorktreePath)
    ) {
      return;
    }
    postMessage({
      type: 'conversation:create',
      uuid: crypto.randomUUID(),
      title: 'Untitled',
      workspace_path: workspacePath ?? undefined,
      worktree_path: activeWorktreePath ?? undefined,
    });
  }, [
    conversations,
    activeConversationId,
    workspacePath,
    activeWorktreePath,
    postMessage,
    setVaultOpen,
  ]);

  const handleToggleTerminal = (): void => {
    // Always pick a visible position — if the activity panel is closed,
    // the 'activity' slot is off-screen so force 'chat'.
    if (!reviewPanelOpen) {
      setTerminalPosition('chat');
    } else if (!bottomPanelOpen) {
      setTerminalPosition('activity');
    }
    toggleBottomPanel();
  };

  return (
    <header
      data-tauri-drag-region
      className={cn(
        'flex items-center justify-between shrink-0',
        transparent ? 'bg-transparent' : 'bg-chat-area',
        className
      )}
      style={{ height: HEIGHTS.headerBar }}
    >
      {/* Left section: [button] | project name | chat name */}
      <div className="flex items-center gap-1.5 pl-2 min-w-0">
        {/* Navigation + sidebar controls — only visible when sidebar is closed */}
        {!sidebarOpen && !isDemo ? (
          <div className="flex items-center gap-1 shrink-0">
            {/* Sidebar toggle */}
            <button
              data-tauri-drag-region={false}
              onClick={toggleLeftSidebar}
              aria-label="Show sidebar"
              className={cn(
                'h-6 w-6 flex items-center justify-center rounded-md shrink-0',
                'hover:bg-lg-control-hover active:scale-[0.98]',
                'transition-[color,background-color,transform] duration-150',
                'text-sidebar-foreground hover:text-foreground'
              )}
            >
              <SFSymbol
                name="sidebar.left"
                size={18}
                weight="medium"
                fallback={<PanelLeft className="h-4 w-4" />}
              />
            </button>
            <div className="w-px h-3.5 bg-lg-separator shrink-0" />
            {/* Back / Forward arrows — matches sidebar style */}
            <button
              data-tauri-drag-region={false}
              aria-label="Go back"
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-lg-control-hover active:scale-95 transition-[background-color,transform] duration-100 text-sidebar-foreground hover:text-foreground"
            >
              <SFSymbol
                name="arrow.left"
                size={13}
                weight="semibold"
                fallback={<ArrowLeft className="h-3.5 w-3.5" />}
              />
            </button>
            <button
              data-tauri-drag-region={false}
              aria-label="Go forward"
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-lg-control-hover active:scale-95 transition-[background-color,transform] duration-100 text-sidebar-foreground hover:text-foreground"
            >
              <SFSymbol
                name="arrow.right"
                size={13}
                weight="semibold"
                fallback={<ArrowRight className="h-3.5 w-3.5" />}
              />
            </button>
            {/* New session */}
            <button
              data-tauri-drag-region={false}
              aria-label="New session"
              onClick={handleNewSession}
              className={cn(
                'h-6 w-6 flex items-center justify-center rounded-md shrink-0',
                'hover:bg-lg-control-hover active:scale-[0.98]',
                'transition-[color,background-color,transform] duration-150',
                'text-sidebar-foreground hover:text-foreground'
              )}
            >
              <SquareAndPencil size={18} />
            </button>
          </div>
        ) : null}

        {/* Separator between icons and heading */}
        {!sidebarOpen && !isDemo ? <div className="w-px h-3.5 bg-lg-separator shrink-0" /> : null}

        {/* Project name */}
        {workspaceName ? (
          <span
            data-tauri-drag-region={false}
            className="text-base text-lg-text-secondary cursor-pointer hover:text-foreground transition-colors shrink-0"
          >
            {workspaceName}
          </span>
        ) : null}

        {/* Separator + Chat name */}
        {conversationTitle ? (
          <>
            <div className="w-px h-3.5 bg-lg-separator shrink-0" />
            <span
              data-tauri-drag-region={false}
              className="text-base text-foreground cursor-pointer hover:text-foreground transition-colors truncate"
            >
              {conversationTitle}
            </span>
          </>
        ) : null}
      </div>

      {/* Center spacer — keeps left and right sections pushed apart */}
      <div className="flex-1" />

      {/* Right section: Git controls + Panel toggles */}
      {hasWorkspace || isDemo ? (
        <div className="flex items-center pr-1" style={{ gap: '0.3rem' }}>
          {/* Git controls */}
          <div className="flex items-center gap-2 mr-1" data-tauri-drag-region={false}>
            <DiffStatsButton />
          </div>

          {/* Divider between git controls and panel toggles */}
          <div className="w-px h-4 bg-lg-separator shrink-0 mr-0.5" />

          {/* Activity Panel Toggle */}
          <button
            data-tauri-drag-region={false}
            onClick={toggleReviewPanel}
            aria-label={reviewPanelOpen ? 'Hide Activity Panel' : 'Show Activity Panel'}
            className={cn(
              'h-6 w-6 flex items-center justify-center rounded-md',
              'hover:bg-lg-control-hover active:scale-[0.98]',
              'transition-[color,background-color,transform] duration-150',
              reviewPanelOpen ? 'text-foreground' : 'text-sidebar-foreground hover:text-foreground'
            )}
          >
            <SFSymbol
              name="sidebar.squares.right"
              size={18}
              weight="medium"
              fallback={<PanelRight className="h-4 w-4" />}
            />
          </button>

          {/* Terminal Toggle */}
          <button
            data-tauri-drag-region={false}
            onClick={handleToggleTerminal}
            aria-label={bottomPanelOpen ? 'Hide Terminal' : 'Show Terminal'}
            className={cn(
              'h-6 w-6 flex items-center justify-center rounded-md',
              'hover:bg-lg-control-hover active:scale-[0.98]',
              'transition-[color,background-color,transform] duration-150',
              bottomPanelOpen && !terminalCollapsed
                ? 'text-foreground'
                : 'text-sidebar-foreground hover:text-foreground'
            )}
          >
            <SFSymbol
              name="apple.terminal"
              size={18}
              weight="medium"
              fallback={<Terminal className="h-4 w-4" />}
            />
          </button>

          {/* Actions Bar Toggle */}
          <button
            data-tauri-drag-region={false}
            onClick={toggleRightSidebar}
            aria-label={rightSidebarOpen ? 'Hide Actions Bar' : 'Show Actions Bar'}
            className={cn(
              'h-6 w-6 flex items-center justify-center rounded-md',
              'hover:bg-lg-control-hover active:scale-[0.98]',
              'transition-[color,background-color,transform] duration-150',
              rightSidebarOpen ? 'text-foreground' : 'text-sidebar-foreground hover:text-foreground'
            )}
          >
            <SFSymbol
              name="switch.2"
              size={18}
              weight="medium"
              fallback={<IconSquareGridCircle className="h-4 w-4" />}
            />
          </button>
        </div>
      ) : (
        <div className="w-[122px]" />
      )}
    </header>
  );
};
