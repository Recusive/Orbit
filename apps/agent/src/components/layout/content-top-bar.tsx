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
import { createLogger } from '@orbit/common/lib';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  GitBranch,
  Loader2,
  PanelLeft,
  PanelRight,
  SquarePen,
  Terminal,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/shallow';

import type { FC } from 'react';

import { SFSymbol } from '@/components/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { gitBranches, gitCheckout, gitStatus } from '@/lib/api';
import { cn } from '@/lib/utils';
import { HEIGHTS } from '@/lib/utils/constants';
import { useGitStore, useBranchDiffStats, useGitBranch } from '@/stores/git/git-store';
import {
  useUIStore,
  useWorkspaceName,
  useHasWorkspace,
  useActiveConversationTitle,
  useReviewPanelOpen,
  useActivityTab,
} from '@/stores/ui/ui-store';

const logger = createLogger('ContentTopBar');

/**
 * Lightweight branch selector for the top bar.
 * Reads from GitStore directly, fetches branches on dropdown open.
 */
const HeaderBranchSelector: FC = () => {
  const branch = useGitBranch();
  const branches = useGitStore((s) => s.branches);
  const repoPath = useGitStore((s) => s.repoPath);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Fetch branches when component mounts if we have a repo but no branches yet
  useEffect(() => {
    if (repoPath && branches.length === 0) {
      void gitBranches(repoPath).then((branchList) => {
        useGitStore.getState().setBranches(branchList);
      });
    }
  }, [repoPath, branches.length]);

  const handleCheckout = useCallback(
    async (branchName: string): Promise<void> => {
      const repo = useGitStore.getState().repoPath;
      if (!repo || isCheckingOut) return;
      setIsCheckingOut(true);
      try {
        await gitCheckout(repo, branchName);
        const [newStatus, newBranches] = await Promise.all([gitStatus(repo), gitBranches(repo)]);
        const store = useGitStore.getState();
        store.setStatus(newStatus);
        store.setBranches(newBranches);
        toast.success(`Switched to ${branchName}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const displayMessage = message.replace(/^Git error:\s*/i, '');
        logger.warn('Checkout failed from header', { branch: branchName, error: message });
        toast.error('Checkout failed', { description: displayMessage });
      } finally {
        setIsCheckingOut(false);
      }
    },
    [isCheckingOut]
  );

  const handleOpenChange = useCallback(
    (open: boolean): void => {
      if (open && repoPath) {
        void gitBranches(repoPath).then((branchList) => {
          useGitStore.getState().setBranches(branchList);
        });
      }
    },
    [repoPath]
  );

  if (!branch) return null;

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        disabled={isCheckingOut || branches.length === 0}
        className="flex items-center gap-1.5 text-sm min-w-0 hover:bg-accent rounded-full px-2 py-1 active:scale-[0.98] transition-[background-color,transform] duration-150 disabled:opacity-40"
      >
        {isCheckingOut ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground/70" />
        ) : (
          <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground/70" />
        )}
        <span className="font-medium truncate max-w-[120px]">{branch}</span>
        {branches.length > 0 ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
        {branches.map((b) => (
          <DropdownMenuItem
            key={b.name}
            onClick={() => {
              if (b.name !== branch) {
                void handleCheckout(b.name);
              }
            }}
            className="flex items-center gap-2"
          >
            <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
            <span className="truncate">{b.name}</span>
            <span className="flex items-center gap-1.5 ml-auto shrink-0">
              {b.upstream ? (
                <span className="text-xs text-muted-foreground">
                  {'\u2192'} {b.upstream}
                </span>
              ) : null}
              {b.isCurrent ? <Check className="h-3.5 w-3.5 text-green-500" /> : null}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

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
  const activityTab = useActivityTab();

  const isDemo = new URLSearchParams(window.location.search).get('demo') === 'true';

  // Hide branch + diff when source control tab is visible in the activity panel
  const showGitControls = !(reviewPanelOpen && activityTab === 'source');

  const {
    toggleLeftSidebar,
    toggleReviewPanel,
    toggleRightSidebar,
    toggleBottomPanel,
    setTerminalPosition,
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
      rightSidebarOpen: s.rightSidebarOpen,
      bottomPanelOpen: s.bottomPanelOpen,
      terminalCollapsed: s.terminalCollapsed,
    }))
  );

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
        transparent ? 'bg-transparent' : 'bg-card',
        className
      )}
      style={{ height: HEIGHTS.headerBar }}
    >
      {/* Left section: [button] | project name | chat name */}
      <div className="flex items-center gap-1.5 pl-2 min-w-0">
        {/* In demo mode, render fake macOS traffic light dots */}
        {isDemo ? (
          <div className="flex items-center gap-[7px] mr-3">
            <div className="size-[11px] rounded-full bg-[#FF5F57]" />
            <div className="size-[11px] rounded-full bg-[#FEBC2E]" />
            <div className="size-[11px] rounded-full bg-[#28C840]" />
          </div>
        ) : null}

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
                'hover:bg-gray-3 dark:hover:bg-gray-4 active:scale-[0.98]',
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
            <div className="w-px h-3.5 bg-gray-6 shrink-0" />
            {/* Back / Forward arrows — matches sidebar style */}
            <button
              data-tauri-drag-region={false}
              aria-label="Go back"
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-gray-5 dark:hover:bg-gray-4 active:scale-95 transition-[background-color,transform] duration-100 text-sidebar-foreground hover:text-foreground"
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
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-gray-5 dark:hover:bg-gray-4 active:scale-95 transition-[background-color,transform] duration-100 text-sidebar-foreground hover:text-foreground"
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
              className={cn(
                'h-6 w-6 flex items-center justify-center rounded-md shrink-0',
                'hover:bg-gray-3 dark:hover:bg-gray-4 active:scale-[0.98]',
                'transition-[color,background-color,transform] duration-150',
                'text-sidebar-foreground hover:text-foreground'
              )}
            >
              <SFSymbol
                name="square.and.pencil"
                size={18}
                weight="medium"
                fallback={<SquarePen className="h-4 w-4" />}
              />
            </button>
          </div>
        ) : null}

        {/* Separator between icons and heading */}
        {!sidebarOpen && !isDemo ? <div className="w-px h-3.5 bg-gray-6 shrink-0" /> : null}

        {/* Project name */}
        {workspaceName ? (
          <span
            data-tauri-drag-region={false}
            className="text-base text-gray-11 cursor-pointer hover:text-foreground transition-colors shrink-0"
          >
            {workspaceName}
          </span>
        ) : null}

        {/* Separator + Chat name */}
        {conversationTitle ? (
          <>
            <div className="w-px h-3.5 bg-gray-6 shrink-0" />
            <span
              data-tauri-drag-region={false}
              className="text-base text-gray-12 cursor-pointer hover:text-foreground transition-colors truncate"
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
            {/* Branch selector — hidden when source control panel is open */}
            {showGitControls ? <HeaderBranchSelector /> : null}
            <DiffStatsButton />
          </div>

          {/* Divider between git controls and panel toggles */}
          <div className="w-px h-4 bg-gray-5 shrink-0 mr-0.5" />

          {/* Activity Panel Toggle */}
          <button
            data-tauri-drag-region={false}
            onClick={toggleReviewPanel}
            aria-label={reviewPanelOpen ? 'Hide Activity Panel' : 'Show Activity Panel'}
            className={cn(
              'h-6 w-6 flex items-center justify-center rounded-md',
              'hover:bg-gray-3 dark:hover:bg-gray-4 active:scale-[0.98]',
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
              'hover:bg-gray-3 dark:hover:bg-gray-4 active:scale-[0.98]',
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
              'hover:bg-gray-3 dark:hover:bg-gray-4 active:scale-[0.98]',
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
