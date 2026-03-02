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
import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';

import type { FC } from 'react';

import { SquareAndPencil } from '@/components/icons';
import { SFSymbol } from '@/components/shared';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useVaultContextManager } from '@/features/vault/hooks';
import { useVaultEditorStore } from '@/features/vault/stores';
import { useTauri } from '@/hooks/agent/use-tauri';
import { cn } from '@/lib/utils';
import { CONTENT_CARD, HEIGHTS } from '@/lib/utils/constants';
import { useBranchDiffStats } from '@/stores/git/git-store';
import {
  useUIStore,
  useWorkspaceName,
  useHasWorkspace,
  useActiveConversationTitle,
  useReviewPanelOpen,
  useVaultOpen,
} from '@/stores/ui/ui-store';

/** Evaluated once — reduced-motion preference is static for session lifetime */
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Max width for the navigation controls container.
 * Buttons: sidebar(24) + sep(1) + back(28) + fwd(28) + newSession(24) + gaps(16) + trailing sep(8) = ~129px.
 * Rounded up for breathing room.
 */
const CONTROLS_MAX_WIDTH = 148;

/** Transition synced with sidebar slide — same easing and duration as CONTENT_CARD.transition */
const CONTROLS_TRANSITION: string | undefined = PREFERS_REDUCED_MOTION
  ? undefined
  : `max-width ${CONTENT_CARD.transition}, opacity ${CONTENT_CARD.transition}`;

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
            'flex items-center h-6 rounded-md overflow-hidden',
            'text-[11px] font-medium tabular-nums',
            'transition-[background-color,color] duration-150'
          )}
        >
          {/* Green gutter bar + additions */}
          <span className="flex items-center h-full bg-success/20 pr-2">
            <span className="w-[3px] self-stretch bg-success shrink-0" />
            <span className="pl-1.5 text-success">+{additions}</span>
          </span>
          {/* Red gutter bar + deletions */}
          <span className="flex items-center h-full bg-destructive/20 pr-2">
            <span className="w-[3px] self-stretch bg-destructive shrink-0" />
            <span className="pl-1.5 text-destructive">
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

/**
 * Vault Save + Send to Agent buttons — replaces DiffStatsButton when vault is open.
 * Liquid glass styling sized for the header (26px height, pill shape).
 */
const VaultActions: FC = () => {
  const workspacePath = useUIStore((s) => s.workspacePath);
  const activeDoc = useVaultEditorStore((s) => s.activeDoc);
  const activeDocEncoding = useVaultEditorStore((s) => s.activeDocEncoding);
  const isDocModified = useVaultEditorStore((s) => s.isDocModified);
  const saveState = useVaultEditorStore((s) => s.saveState);
  const { sendActiveDocToAgent } = useVaultContextManager();

  const isUtf8Doc = activeDoc !== null && activeDocEncoding === 'utf8';
  const canSave = Boolean(
    activeDoc && !activeDoc.isDir && activeDoc.source === 'vault' && isUtf8Doc && isDocModified
  );
  const canSend = Boolean(activeDoc && !activeDoc.isDir && isUtf8Doc);

  const handleSave = useCallback((): void => {
    if (!workspacePath) return;
    void useVaultEditorStore.getState().saveDocument(workspacePath);
  }, [workspacePath]);

  const handleReload = useCallback((): void => {
    if (!workspacePath) return;
    void useVaultEditorStore.getState().reloadDocument(workspacePath);
  }, [workspacePath]);

  const handleOverwrite = useCallback((): void => {
    if (!workspacePath) return;
    void useVaultEditorStore.getState().saveDocument(workspacePath, true);
  }, [workspacePath]);

  const handleSendToAgent = useCallback((): void => {
    void sendActiveDocToAgent();
  }, [sendActiveDocToAgent]);

  // Inline status label next to buttons
  const statusLabel =
    saveState === 'saving'
      ? 'Saving...'
      : saveState === 'saved'
        ? 'Saved'
        : saveState === 'conflicted'
          ? 'Conflict'
          : saveState === 'error'
            ? 'Error'
            : null;

  const btnBase =
    '!h-[22px] !rounded-[9px] px-2.5 py-0 text-[11px] leading-none min-w-0 font-medium cursor-pointer transition-transform duration-75 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none';

  return (
    <div className="flex items-center gap-1.5" data-tauri-drag-region={false}>
      {statusLabel !== null ? (
        <span
          className={cn(
            'text-[11px] font-medium',
            saveState === 'conflicted' || saveState === 'error'
              ? 'text-destructive'
              : 'text-muted-foreground'
          )}
        >
          {statusLabel}
        </span>
      ) : null}
      {saveState === 'conflicted' ? (
        <>
          <button
            type="button"
            onClick={handleReload}
            className={cn(btnBase, 'bg-muted hover:bg-muted/80 text-foreground')}
          >
            Reload
          </button>
          <button
            type="button"
            onClick={handleOverwrite}
            className={cn(
              btnBase,
              'bg-destructive text-destructive-foreground hover:bg-destructive/90'
            )}
          >
            Overwrite
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className={cn(
            btnBase,
            saveState === 'error'
              ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
              : 'bg-muted hover:bg-muted/80 text-foreground'
          )}
        >
          Save
        </button>
      )}
      <button
        type="button"
        onClick={handleSendToAgent}
        disabled={!canSend}
        className="liquid-glass-btn liquid-glass-btn-primary !h-[22px] !rounded-[9px] !px-2.5 !py-0 !text-[11px] !leading-none !min-w-0 cursor-pointer transition-transform duration-75 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none"
      >
        Send to Agent
      </button>
    </div>
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
  const vaultOpen = useVaultOpen();

  const isDemo = new URLSearchParams(window.location.search).get('demo') === 'true';

  /* ── Overflow-fade detection ─────────────────────────────────── */
  const leftSectionRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  const checkOverflow = useCallback((): void => {
    const el = leftSectionRef.current;
    if (el) {
      setIsOverflowing(el.scrollWidth > el.clientWidth);
    }
  }, []);

  // Re-check on container resize (window resize, panel drag)
  useEffect(() => {
    const el = leftSectionRef.current;
    if (!el) return;
    checkOverflow();
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    return (): void => {
      ro.disconnect();
    };
  }, [checkOverflow]);

  // Re-check when content or sidebar state changes
  useEffect(() => {
    checkOverflow();
    // Re-check after sidebar controls animation settles (200ms transition)
    const timer = setTimeout(checkOverflow, 250);
    return (): void => {
      clearTimeout(timer);
    };
  }, [sidebarOpen, workspaceName, conversationTitle, checkOverflow]);

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
    if (activeConv?.title === 'Untitled' && activeConv.messageCount === 0) {
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

  // Listen for newSession keyboard shortcut event
  useEffect(() => {
    window.addEventListener('newSession', handleNewSession);
    return (): void => {
      window.removeEventListener('newSession', handleNewSession);
    };
  }, [handleNewSession]);

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
      {/* Left section: [button] | project name | chat name
          Gradient overlay fades text when it overflows toward the right controls */}
      <div
        ref={leftSectionRef}
        className="relative flex items-center gap-1.5 pl-2 min-w-0 overflow-hidden"
      >
        {/* Fade overlay — shown only when text overflows toward the right controls */}
        {isOverflowing ? (
          <div
            className="absolute right-0 top-0 bottom-0 pointer-events-none z-10"
            style={{
              width: 48,
              background: 'linear-gradient(to right, transparent, var(--chat-area))',
            }}
            aria-hidden="true"
          />
        ) : null}
        {/* Navigation + sidebar controls — always rendered, animated in/out with sidebar */}
        {!isDemo ? (
          <div
            className="shrink-0 overflow-hidden"
            aria-hidden={sidebarOpen}
            style={{
              maxWidth: sidebarOpen ? 0 : CONTROLS_MAX_WIDTH,
              opacity: sidebarOpen ? 0 : 1,
              pointerEvents: sidebarOpen ? 'none' : 'auto',
              transition: CONTROLS_TRANSITION,
            }}
          >
            <div className="flex items-center gap-1 shrink-0">
              {/* Sidebar toggle */}
              <button
                data-tauri-drag-region={false}
                onClick={toggleLeftSidebar}
                aria-label="Show sidebar"
                tabIndex={sidebarOpen ? -1 : 0}
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
              {/* Navigation buttons — hidden on the welcome page (no workspace) */}
              {hasWorkspace ? (
                <>
                  <div className="w-px h-3.5 bg-lg-separator shrink-0" />
                  {/* Back / Forward arrows — matches sidebar style */}
                  <button
                    data-tauri-drag-region={false}
                    aria-label="Go back"
                    tabIndex={sidebarOpen ? -1 : 0}
                    className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-lg-control-hover active:scale-95 transition-transform duration-75 text-sidebar-foreground hover:text-foreground"
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
                    tabIndex={sidebarOpen ? -1 : 0}
                    className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-lg-control-hover active:scale-95 transition-transform duration-75 text-sidebar-foreground hover:text-foreground"
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
                    tabIndex={sidebarOpen ? -1 : 0}
                    className={cn(
                      'h-6 w-6 flex items-center justify-center rounded-md shrink-0',
                      'hover:bg-lg-control-hover active:scale-[0.98]',
                      'transition-[color,background-color,transform] duration-150',
                      'text-sidebar-foreground hover:text-foreground'
                    )}
                  >
                    <SquareAndPencil size={18} />
                  </button>
                  {/* Trailing separator between controls and heading */}
                  <div className="w-px h-3.5 bg-lg-separator shrink-0 ml-0.5" />
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Project name — fades via parent mask when header is narrow */}
        {workspaceName ? (
          <span
            data-tauri-drag-region={false}
            className="text-base text-lg-text-secondary cursor-pointer hover:text-foreground transition-colors whitespace-nowrap"
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
              className="text-base text-foreground cursor-pointer hover:text-foreground transition-colors whitespace-nowrap"
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
        <div className="flex items-center pr-1 shrink-0" style={{ gap: '0.3rem' }}>
          {/* Vault actions (when open) or Git diff stats */}
          <div className="flex items-center gap-2 mr-1" data-tauri-drag-region={false}>
            {vaultOpen ? <VaultActions /> : <DiffStatsButton />}
          </div>

          {/* Divider between controls and panel toggles */}
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
