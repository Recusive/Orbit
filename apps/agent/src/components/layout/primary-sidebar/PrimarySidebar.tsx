/**
 * PrimarySidebar - Main navigation sidebar with conversations and explorer
 *
 * NOTE: Layout dimensions come from @/lib/utils/constants.
 * To change header heights, sidebar widths, or transition durations,
 * update HEIGHTS, SIDEBAR, and TRANSITIONS in constants.ts - DO NOT hardcode here.
 */
import { IconCirclePlus } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconCirclePlus';
import { IconSearchlinesSparkle } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconSearchlinesSparkle';
import { createLogger } from '@orbit/common/lib';
import { Facehash } from 'facehash';
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Gift,
  FlaskConical,
  FolderOpen,
  GitBranch,
  Plus,
  Search,
  Settings2,
  Terminal,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';

import { ConversationList } from './components/ConversationList';
import { PowersSection } from './components/PowersSection';
import { SettingsNavList } from './components/SettingsNavList';
import { SidebarItem } from './components/SidebarItem';
import { SidebarToggleIcon } from './components/SidebarToggleIcon';
import { VaultNoteList } from './components/VaultNoteList';
import { TriStateSwitch } from './components/tri-state-switch';
import { useSidebarActions } from './hooks/use-sidebar-actions';

import type { EditorSidebarTab, SidebarTab } from './types';
import type { ProjectsDialogProps } from '@/components/modals/projects';
import type { SkillsDialogProps } from '@/components/modals/skills';
import type { UnifiedDoc } from '@/features/vault/types';
import type { FC } from 'react';

import { FileExplorer } from '@/components/files';
import { SourceControlTab } from '@/components/git';
import {
  ConversationDeleteDialog,
  CreateWorktreeDialog,
  DeleteWorktreeDialog,
} from '@/components/modals';
import { CloneRepositoryDialog } from '@/components/modals/git';
import { SSHConnectionDialog } from '@/components/modals/ssh';
import { SFSymbol } from '@/components/shared';
import { Kbd } from '@/components/ui/kbd';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { VaultCreateDialog } from '@/features/vault/components/VaultCreateDialog';
import { VaultDeleteDialog } from '@/features/vault/components/VaultDeleteDialog';
import { useVaultInitialization } from '@/features/vault/hooks';
import { useVaultStore } from '@/features/vault/stores';
import { useConversationList } from '@/hooks/sidebar/use-conversation-list';
import { useSmoothScroll } from '@/hooks/ui';
import { useRecentProjects } from '@/hooks/ui/use-recent-projects';
import { addRecentProject, initializeWorkspace, openFileDialog } from '@/lib/api';
import { cn, HEIGHTS, SIDEBAR } from '@/lib/utils';
import { getConversationUiBridge } from '@/services/conversations';
import { useActiveBackend } from '@/stores/backend';
import { useChatStore } from '@/stores/chat/chat-store';
import { useFileStore } from '@/stores/file/file-store';
import { useOcActiveSessionId } from '@/stores/opencode';
import {
  useUIStore,
  useSettingsOpen,
  useVaultOpen,
  useWorkspaceName,
  useWorkspacePath,
  useActiveConversationId,
  useWorktrees,
  useActiveWorktreePath,
  useCreateWorktreeDialogOpen,
} from '@/stores/ui/ui-store';
import { useUpdateStore } from '@/stores/ui/update-store';

// Lazy load heavy components
const LazyProjectsDialog = lazy(() =>
  import('@/components/modals/projects/ProjectsDialog').then((m) => ({
    default: m.ProjectsDialog,
  }))
);
const ProjectsDialog: FC<ProjectsDialogProps> = (props) => (
  <Suspense fallback={null}>
    <LazyProjectsDialog {...props} />
  </Suspense>
);

const LazySkillsDialog = lazy(() =>
  import('@/components/modals/skills/SkillsDialog').then((m) => ({
    default: m.SkillsDialog,
  }))
);
const SkillsDialog: FC<SkillsDialogProps> = (props) => (
  <Suspense fallback={null}>
    <LazySkillsDialog {...props} />
  </Suspense>
);

const logger = createLogger('PrimarySidebar');

export const PrimarySidebar: FC = () => {
  const smoothScrollRef = useSmoothScroll(0.08);
  const activeBackend = useActiveBackend();

  // Track whether the scrollable area can scroll further down.
  // The bottom fade mask is only applied when there's more content below,
  // so the last item is fully visible when scrolled to the bottom.
  //
  // Key insight: the outer container may NOT be the one that scrolls —
  // inner components (FileExplorer, ConversationList) have their own
  // overflow-y-auto containers. `scroll` events don't bubble, but they
  // DO propagate during the capture phase, so we listen with `capture: true`
  // to catch scroll events from any descendant.
  const [canScrollDown, setCanScrollDown] = useState(false);
  const fadeCleanupRef = useRef<(() => void) | null>(null);

  const scrollContainerRef = useCallback(
    (node: HTMLElement | null): void => {
      if (fadeCleanupRef.current) {
        fadeCleanupRef.current();
        fadeCleanupRef.current = null;
      }

      smoothScrollRef(node);

      if (!node) return;

      let rafId = 0;

      /** Check the actual scrolling element (may be node itself or a descendant). */
      const checkElement = (el: HTMLElement): void => {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          const threshold = 4;
          const hasOverflow = el.scrollHeight > el.clientHeight + threshold;
          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
          setCanScrollDown(hasOverflow && !atBottom);
        });
      };

      /** Find the first scrollable descendant (or the node itself). */
      const findScrollable = (): HTMLElement => {
        const children = node.querySelectorAll<HTMLElement>('*');
        for (const child of children) {
          if (
            child.scrollHeight > child.clientHeight + 4 &&
            (child.style.overflowY === 'auto' ||
              child.style.overflowY === 'scroll' ||
              child.classList.contains('overflow-y-auto'))
          ) {
            return child;
          }
        }
        return node;
      };

      // Capture-phase scroll listener — catches events from inner scroll containers
      const onScroll = (e: Event): void => {
        if (e.target instanceof HTMLElement) {
          checkElement(e.target);
        }
      };

      // Initial check + re-check on content changes
      const runInitialCheck = (): void => {
        checkElement(findScrollable());
      };

      runInitialCheck();
      node.addEventListener('scroll', onScroll, { passive: true, capture: true });

      const ro = new ResizeObserver(runInitialCheck);
      ro.observe(node);

      // Catch child additions/removals (e.g. folder expansion, tab switch)
      const mo = new MutationObserver(runInitialCheck);
      mo.observe(node, { childList: true, subtree: true });

      fadeCleanupRef.current = (): void => {
        cancelAnimationFrame(rafId);
        node.removeEventListener('scroll', onScroll, { capture: true });
        ro.disconnect();
        mo.disconnect();
      };
    },
    [smoothScrollRef]
  );

  // Use useShallow to prevent re-renders when unrelated store state changes
  const {
    toggleLeftSidebar,
    setSettingsOpen,
    openSettings,
    toggleWorktreeExpanded,
    editingConversationId,
    setEditingConversationId,
  } = useUIStore(
    useShallow((s) => ({
      toggleLeftSidebar: s.toggleLeftSidebar,
      setSettingsOpen: s.setSettingsOpen,
      openSettings: s.openSettings,
      toggleWorktreeExpanded: s.toggleWorktreeExpanded,
      editingConversationId: s.editingConversationId,
      setEditingConversationId: s.setEditingConversationId,
    }))
  );
  const workspaceName = useWorkspaceName();
  const workspacePath = useWorkspacePath();
  const conversations = useConversationList();
  const claudeActiveConversationId = useActiveConversationId();
  const ocActiveConversationId = useOcActiveSessionId();
  const activeConversationId =
    activeBackend === 'claude' ? claudeActiveConversationId : ocActiveConversationId;
  const worktrees = useWorktrees();
  const activeWorktreePath = useActiveWorktreePath();
  const createWorktreeDialogOpen = useCreateWorktreeDialogOpen();

  // Vault mode
  const vaultOpen = useVaultOpen();
  const settingsOpen = useSettingsOpen();
  useVaultInitialization();
  const currentPath = useVaultStore((s) => s.currentPath);
  const createVaultFile = useVaultStore((s) => s.createVaultFile);
  const createVaultDirectory = useVaultStore((s) => s.createVaultDirectory);
  const deleteVaultEntry = useVaultStore((s) => s.deleteVaultEntry);

  const updateStatus = useUpdateStore((s) => s.status);
  const updateDismissed = useUpdateStore((s) => s.toastDismissed);

  const globalActiveTab = useUIStore((s) => s.activeTab);
  const isEditorMode = globalActiveTab === 'editor';

  const [activeTab, setActiveTab] = useState<SidebarTab>('conversations');
  const [editorTab, setEditorTab] = useState<EditorSidebarTab>('explorer');
  const [projectsDialogOpen, setProjectsDialogOpen] = useState(false);

  // Listen for openProjects keyboard shortcut event
  useEffect(() => {
    const handleOpenProjects = (): void => {
      setProjectsDialogOpen(true);
    };
    window.addEventListener('openProjects', handleOpenProjects);
    return (): void => {
      window.removeEventListener('openProjects', handleOpenProjects);
    };
  }, []);
  const [skillsDialogOpen, setSkillsDialogOpen] = useState(false);

  // Vault dialog state
  const [vaultCreateDialogOpen, setVaultCreateDialogOpen] = useState(false);
  const [vaultDeleteDialogOpen, setVaultDeleteDialogOpen] = useState(false);
  const [vaultDocToDelete, setVaultDocToDelete] = useState<UnifiedDoc | null>(null);

  const {
    deleteDialogOpen,
    setDeleteDialogOpen,
    conversationToDelete,
    worktreeDeleteDialogOpen,
    setWorktreeDeleteDialogOpen,
    worktreeToDelete,
    handleStartConversation,
    handleLoadConversation,
    handleOpenQuickSearch,
    handleOpenCreateWorktree,
    handleOpenDeleteWorktreeDialog,
    handleRemoveWorktree,
    handleRenameConversation,
    handleDeleteConversation,
    handleOpenDeleteDialog,
    handleDuplicateConversation,
  } = useSidebarActions({
    conversations,
    activeConversationId,
    workspacePath,
    activeWorktreePath,
  });

  // Welcome mode — no workspace open
  const isWelcome = !workspacePath;
  const setRootPath = useFileStore((s) => s.setRootPath);
  const { projects } = useRecentProjects();
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [sshDialogOpen, setSshDialogOpen] = useState(false);

  const openProject = useCallback(
    async (path: string): Promise<void> => {
      try {
        await initializeWorkspace(path);
        await addRecentProject(path);
        useUIStore.getState().initializeWorkspace(path);
        setRootPath(path);
        await getConversationUiBridge(activeBackend).hydrateWorkspace({
          workspacePath: path,
          worktreePath: null,
        });
      } catch (err) {
        logger.error('Failed to open project', err);
      }
    },
    [activeBackend, setRootPath]
  );

  const handleOpenProject = useCallback(async (): Promise<void> => {
    try {
      const selected = await openFileDialog({
        title: 'Open Project',
        directory: true,
        multiple: false,
      });
      if (selected !== null && typeof selected === 'string') {
        await openProject(selected);
      }
    } catch (err) {
      logger.error('Failed to open project', err);
    }
  }, [openProject]);

  const handleRecentProjectClick = useCallback(
    (path: string) => {
      return (): void => {
        openProject(path).catch((err: unknown) => {
          logger.error('Failed to open recent project', err);
        });
      };
    },
    [openProject]
  );

  return (
    <aside
      data-sidebar="primary"
      className="h-full flex flex-col overflow-hidden select-none cursor-default"
      style={{ contain: 'layout style' }}
    >
      {/* Header — collapse button next to macOS traffic lights (x:11 + ~54px for 3 buttons) */}
      <div
        className="flex items-center shrink-0 w-full pl-[82px] pr-3"
        style={{ height: HEIGHTS.headerBar, marginTop: 5, marginBottom: 5 }}
      >
        <button
          onClick={toggleLeftSidebar}
          aria-label="Collapse sidebar"
          className="relative h-7 w-7 flex items-center justify-center rounded-[9px] hover:bg-lg-sidebar-hover active:scale-95 transition-transform duration-75 text-sidebar-foreground hover:text-foreground before:absolute before:content-[''] before:inset-[-8px]"
        >
          <SFSymbol
            name="sidebar.left"
            size={18}
            weight="medium"
            fallback={<SidebarToggleIcon expanded={true} />}
          />
        </button>
        {/* Back / Forward navigation
            TODO: Wire up full navigation history stack (session switches, tab changes, etc.).
            Currently only the vault→sessions transition is handled. */}
        <div className="flex items-center gap-0.5 ml-auto">
          <button
            aria-label="Go back"
            className="h-7 w-7 flex items-center justify-center rounded-[9px] hover:bg-lg-sidebar-hover active:scale-95 transition-transform duration-75 text-sidebar-foreground hover:text-foreground"
            onClick={() => {
              if (settingsOpen) {
                setSettingsOpen(false);
              } else if (vaultOpen) {
                useUIStore.getState().setVaultOpen(false);
              }
            }}
          >
            <SFSymbol
              name="arrow.left"
              size={13}
              weight="semibold"
              fallback={<ArrowLeft className="h-3.5 w-3.5" />}
            />
          </button>
          <button
            aria-label="Go forward"
            className="h-7 w-7 flex items-center justify-center rounded-[9px] hover:bg-lg-sidebar-hover active:scale-95 transition-transform duration-75 text-sidebar-foreground hover:text-foreground"
          >
            <SFSymbol
              name="arrow.right"
              size={13}
              weight="semibold"
              fallback={<ArrowRight className="h-3.5 w-3.5" />}
            />
          </button>
        </div>
      </div>

      {/* Search Bar (workspace mode only) */}
      {!isWelcome ? (
        <div
          className="shrink-0 mx-1.5 overflow-hidden"
          style={{ height: SIDEBAR.searchBarHeight, marginBottom: 5 }}
        >
          <button
            onClick={handleOpenQuickSearch}
            className="flex items-center gap-1.5 h-8 rounded-[9px] text-sidebar-foreground hover:text-foreground overflow-hidden w-full bg-lg-control hover:bg-lg-control-hover transition-[background-color] duration-100"
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
            <span className="text-base whitespace-nowrap overflow-hidden text-ellipsis w-auto opacity-100">
              {workspaceName}
            </span>
            <Kbd className="ml-auto mr-2 h-[18px] text-[12px]! px-1.5 bg-lg-control text-inherit border-lg-separator">
              <span className="text-[14px] leading-none">⌘</span> P
            </Kbd>
          </button>
        </div>
      ) : null}

      {/* Tab heading + toggle (workspace mode only, hidden in vault mode) */}
      {!isWelcome && !vaultOpen && !settingsOpen ? (
        isEditorMode ? (
          /* Editor mode: Explorer / Source Control / Sessions toggle */
          <div className="flex items-center justify-between px-3 py-1 shrink-0">
            <span className="text-sm font-medium text-muted-foreground/70 uppercase tracking-tight whitespace-nowrap">
              {editorTab === 'explorer'
                ? 'Explorer'
                : editorTab === 'source'
                  ? 'Source Control'
                  : 'Sessions'}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <TriStateSwitch
                    value={editorTab === 'explorer' ? 0 : editorTab === 'source' ? 1 : 2}
                    onChange={(v) => {
                      setEditorTab(v === 0 ? 'explorer' : v === 1 ? 'source' : 'sessions');
                    }}
                    aria-label="Toggle Explorer / Source Control / Sessions"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                {editorTab === 'explorer'
                  ? 'Switch to Source Control'
                  : editorTab === 'source'
                    ? 'Switch to Sessions'
                    : 'Switch to Explorer'}
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          /* Agent mode: Sessions / Explorer toggle switch */
          <div className="flex items-center justify-between px-3 py-1 shrink-0">
            <span className="text-sm font-medium text-muted-foreground/70 uppercase tracking-tight whitespace-nowrap">
              {activeTab === 'conversations' ? 'Sessions' : 'Explorer'}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Switch
                    checked={activeTab === 'explorer'}
                    onCheckedChange={(checked) => {
                      setActiveTab(checked ? 'explorer' : 'conversations');
                    }}
                    aria-label="Toggle Sessions / Explorer"
                    className="h-4 w-8 rounded-[6px]! [&>span]:h-3! [&>span]:w-3! [&>span]:rounded-[4px]! [&>span]:data-[state=checked]:translate-x-4!"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                {activeTab === 'conversations' ? 'Switch to Explorer' : 'Switch to Sessions'}
              </TooltipContent>
            </Tooltip>
          </div>
        )
      ) : settingsOpen ? null : vaultOpen ? (
        /* Vault mode: "Notes" heading */
        <div className="flex items-center px-3 py-1 shrink-0">
          <span className="text-sm font-medium text-muted-foreground/70 uppercase tracking-tight whitespace-nowrap">
            Notes
          </span>
        </div>
      ) : null}

      {/* Main Actions — hidden in editor mode (sidebar shows explorer/git tabs instead) */}
      {isWelcome ? (
        <div className="flex flex-col shrink-0 gap-1 py-1.5">
          <SidebarItem
            icon={FolderOpen}
            label="Open Project"
            large
            onClick={() => void handleOpenProject()}
          />
          <SidebarItem
            icon={GitBranch}
            label="Clone Repository"
            onClick={() => {
              setCloneDialogOpen(true);
            }}
          />
          <SidebarItem
            icon={Terminal}
            label="SSH"
            onClick={() => {
              setSshDialogOpen(true);
            }}
          />
        </div>
      ) : vaultOpen ? (
        /* Vault mode actions */
        <div className="flex flex-col shrink-0 gap-1 py-1.5">
          <SidebarItem
            icon={Plus}
            label="New Note"
            large
            onClick={() => {
              setVaultCreateDialogOpen(true);
            }}
          />
        </div>
      ) : settingsOpen ? null : (!isEditorMode && activeTab === 'conversations') ||
        (isEditorMode && editorTab === 'sessions') ? (
        <div className="flex flex-col shrink-0 gap-1 py-1.5 animate-title-in">
          <SidebarItem
            icon={() => (
              <SFSymbol
                name="square.and.pencil"
                size={18}
                weight="medium"
                fallback={<IconCirclePlus className="h-4 w-4" />}
              />
            )}
            label="New Session"
            large
            shortcut={['⌘', 'N']}
            onClick={handleStartConversation}
          />
          <SidebarItem
            icon={FolderOpen}
            label="Projects"
            shortcut={['⌘', 'T']}
            onClick={() => {
              setProjectsDialogOpen(true);
            }}
          />
          <SidebarItem
            icon={IconSearchlinesSparkle}
            label="Vault"
            onClick={() => {
              const { workspacePath } = useUIStore.getState();
              if (!workspacePath) return;
              useUIStore.getState().toggleVault();
            }}
          />
          <PowersSection
            onSkillsClick={() => {
              setSkillsDialogOpen(true);
            }}
          />
        </div>
      ) : null}

      {/* Tab Content — mask fades bottom edge when more content is below */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain"
        style={{
          maskImage: 'linear-gradient(to bottom, black calc(100% - 32px), transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 32px), transparent)',
          maskSize: '100% calc(100% + 32px)',
          WebkitMaskSize: '100% calc(100% + 32px)',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: canScrollDown ? '0 -32px' : '0 0',
          WebkitMaskPosition: canScrollDown ? '0 -32px' : '0 0',
          transition: 'mask-position 200ms ease-out, -webkit-mask-position 200ms ease-out',
        }}
      >
        {settingsOpen ? (
          <SettingsNavList />
        ) : vaultOpen ? (
          <VaultNoteList
            onRequestCreate={() => {
              setVaultCreateDialogOpen(true);
            }}
            onRequestDelete={(doc) => {
              setVaultDocToDelete(doc);
              setVaultDeleteDialogOpen(true);
            }}
          />
        ) : isWelcome ? (
          <>
            {/* Recent Projects heading */}
            <div className="flex items-center px-3 py-1 shrink-0">
              <span className="text-sm font-medium text-muted-foreground/70 uppercase tracking-tight">
                Recent
              </span>
            </div>
            {/* Recent project rows */}
            <div className="flex flex-col gap-0.5 px-1.5">
              {projects.map((project) => (
                <button
                  key={project.path}
                  type="button"
                  onClick={handleRecentProjectClick(project.path)}
                  onMouseEnter={(e) => {
                    const face = e.currentTarget.querySelector('[data-facehash-face]');
                    if (face instanceof HTMLElement) {
                      face.dataset['savedTransform'] = face.style.transform;
                      face.style.transform = 'rotateX(0deg) rotateY(0deg) translateZ(12px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    const face = e.currentTarget.querySelector('[data-facehash-face]');
                    if (face instanceof HTMLElement && face.dataset['savedTransform']) {
                      face.style.transform = face.dataset['savedTransform'];
                    }
                  }}
                  className={cn(
                    'group flex items-center gap-2.5 px-2 py-2 rounded-[9px]',
                    'hover:bg-lg-sidebar-hover',
                    'text-left outline-none'
                  )}
                >
                  <Facehash
                    name={project.name}
                    size={24}
                    variant="solid"
                    colorClasses={['bg-avatar-project']}
                    className="rounded-md shrink-0 text-white dark:text-black"
                    style={{ pointerEvents: 'none' }}
                  />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium text-foreground truncate">
                      {project.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {project.parentPath}
                    </span>
                  </div>
                  <ChevronRight
                    className={cn(
                      'h-3 w-3 text-transparent shrink-0',
                      'group-hover:text-muted-foreground'
                    )}
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          </>
        ) : isEditorMode ? (
          /* Editor mode: Explorer, Source Control, or Sessions */
          editorTab === 'explorer' ? (
            <FileExplorer />
          ) : editorTab === 'source' ? (
            <SourceControlTab />
          ) : (
            <ConversationList
              conversations={conversations}
              worktrees={worktrees}
              workspaceName={workspaceName}
              activeConversationId={activeConversationId}
              activeWorktreePath={activeWorktreePath}
              editingConversationId={editingConversationId}
              onLoadConversation={handleLoadConversation}
              onStartEditConversation={setEditingConversationId}
              onRenameConversation={(sessionId, newTitle) => {
                handleRenameConversation(sessionId, newTitle);
              }}
              onCancelEditConversation={() => {
                setEditingConversationId(null);
              }}
              onDeleteConversation={handleOpenDeleteDialog}
              onDuplicateConversation={handleDuplicateConversation}
              onToggleWorktree={toggleWorktreeExpanded}
              onSelectWorktree={(path) => {
                useUIStore.getState().switchToWorktree(path);
                useChatStore.getState().clearActiveSession();
              }}
              onRemoveWorktree={handleOpenDeleteWorktreeDialog}
              onOpenCreateWorktree={handleOpenCreateWorktree}
            />
          )
        ) : activeTab === 'conversations' ? (
          <ConversationList
            conversations={conversations}
            worktrees={worktrees}
            workspaceName={workspaceName}
            activeConversationId={activeConversationId}
            activeWorktreePath={activeWorktreePath}
            editingConversationId={editingConversationId}
            onLoadConversation={handleLoadConversation}
            onStartEditConversation={setEditingConversationId}
            onRenameConversation={(sessionId, newTitle) => {
              handleRenameConversation(sessionId, newTitle);
            }}
            onCancelEditConversation={() => {
              setEditingConversationId(null);
            }}
            onDeleteConversation={handleOpenDeleteDialog}
            onDuplicateConversation={handleDuplicateConversation}
            onToggleWorktree={toggleWorktreeExpanded}
            onSelectWorktree={(path) => {
              useUIStore.getState().switchToWorktree(path);
              useChatStore.getState().clearActiveSession();
            }}
            onRemoveWorktree={handleOpenDeleteWorktreeDialog}
            onOpenCreateWorktree={handleOpenCreateWorktree}
          />
        ) : (
          <FileExplorer />
        )}
      </div>

      {/* Utilities — pinned to bottom */}
      <div
        key={
          settingsOpen
            ? 'settings'
            : vaultOpen
              ? 'vault'
              : isEditorMode
                ? `editor-${editorTab}`
                : activeTab
        }
        className="flex flex-col shrink-0 gap-1 py-1.5 animate-title-in"
      >
        {/* Update indicator — visible after user dismisses the update toast */}
        {(updateStatus === 'available' || updateStatus === 'ready') && updateDismissed ? (
          <SidebarItem
            icon={Gift}
            label={updateStatus === 'ready' ? 'Restart to update' : 'Update available'}
            badge={updateStatus === 'ready' ? 'Restart' : 'Update'}
            badgeVariant="primary"
            onClick={() => {
              const store = useUpdateStore.getState();
              if (store.status === 'ready') {
                void store.relaunch();
              } else {
                void store.downloadAndInstall();
              }
            }}
          />
        ) : null}
        {isWelcome ? null : settingsOpen ? (
          <button
            className="flex items-center gap-1.5 h-8 rounded-[9px] mx-1.5 px-2 hover:bg-lg-sidebar-hover active:scale-[0.98] transition-transform duration-75 text-sidebar-foreground hover:text-foreground overflow-hidden"
            onClick={() => {
              openSettings('feedback');
            }}
          >
            <SFSymbol
              name="exclamationmark.bubble"
              size={18}
              weight="medium"
              fallback={<FlaskConical className="h-4 w-4" />}
            />
            <span className="text-base whitespace-nowrap">Feedback</span>
          </button>
        ) : (
          <div className="flex items-center h-8 mx-1.5 gap-1.5 overflow-hidden">
            <button
              className="flex items-center justify-center gap-1.5 flex-1 min-w-0 h-full rounded-[9px] px-2 hover:bg-lg-sidebar-hover active:scale-[0.98] transition-transform duration-75 text-sidebar-foreground hover:text-foreground overflow-hidden"
              onClick={() => {
                openSettings('agent');
              }}
            >
              <SFSymbol
                name="gear"
                size={18}
                weight="medium"
                fallback={<Settings2 className="h-4 w-4" />}
              />
              <span className="text-base whitespace-nowrap">Settings</span>
            </button>
            <div className="w-px h-3.5 bg-lg-separator shrink-0" />
            <button
              className="flex items-center justify-center gap-1.5 flex-1 min-w-0 h-full rounded-[9px] px-2 hover:bg-lg-sidebar-hover active:scale-[0.98] transition-transform duration-75 text-sidebar-foreground hover:text-foreground overflow-hidden"
              onClick={() => {
                openSettings('feedback');
              }}
            >
              <SFSymbol
                name="exclamationmark.bubble"
                size={18}
                weight="medium"
                fallback={<FlaskConical className="h-4 w-4" />}
              />
              <span className="text-base whitespace-nowrap">Feedback</span>
            </button>
          </div>
        )}
      </div>

      {/* Create Worktree Dialog */}
      <CreateWorktreeDialog
        open={createWorktreeDialogOpen}
        onOpenChange={useUIStore.getState().setCreateWorktreeDialogOpen}
        onCreated={(worktree) => {
          // Auto-switch to the newly created worktree
          useUIStore.getState().switchToWorktree(worktree.path);
          useChatStore.getState().clearActiveSession();
        }}
      />

      {/* Delete Conversation Dialog */}
      <ConversationDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        conversationTitle={conversationToDelete?.title ?? ''}
        onConfirm={() => {
          if (conversationToDelete) {
            void handleDeleteConversation(conversationToDelete.sessionId);
          }
        }}
      />

      {/* Delete Worktree Dialog */}
      <DeleteWorktreeDialog
        open={worktreeDeleteDialogOpen}
        onOpenChange={setWorktreeDeleteDialogOpen}
        worktree={worktreeToDelete}
        onConfirm={(deleteBranch) => {
          void handleRemoveWorktree(deleteBranch);
        }}
      />

      {/* Projects Dialog */}
      <ProjectsDialog open={projectsDialogOpen} onOpenChange={setProjectsDialogOpen} />

      {/* Skills Dialog */}
      <SkillsDialog open={skillsDialogOpen} onOpenChange={setSkillsDialogOpen} />

      {/* Clone Repository Dialog (welcome mode) */}
      <CloneRepositoryDialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen} />

      {/* SSH Connection Dialog (welcome mode) */}
      <SSHConnectionDialog open={sshDialogOpen} onOpenChange={setSshDialogOpen} />

      {/* Vault Create Dialog */}
      <VaultCreateDialog
        open={vaultCreateDialogOpen}
        currentPath={currentPath}
        onClose={() => {
          setVaultCreateDialogOpen(false);
        }}
        onCreateFile={async (relativePath, initialContent) => {
          if (!workspacePath) return;
          await createVaultFile(workspacePath, relativePath, initialContent);
        }}
        onCreateFolder={async (relativePath) => {
          if (!workspacePath) return;
          await createVaultDirectory(workspacePath, relativePath);
        }}
      />

      {/* Vault Delete Dialog */}
      <VaultDeleteDialog
        open={vaultDeleteDialogOpen}
        doc={vaultDocToDelete}
        onClose={() => {
          setVaultDeleteDialogOpen(false);
          setVaultDocToDelete(null);
        }}
        onConfirmDelete={async (relativePath) => {
          if (!workspacePath) return;
          await deleteVaultEntry(workspacePath, relativePath);
        }}
      />
    </aside>
  );
};
