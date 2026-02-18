/**
 * PrimarySidebar - Main navigation sidebar with conversations and explorer
 *
 * NOTE: Layout dimensions come from @/lib/utils/constants.
 * To change header heights, sidebar widths, or transition durations,
 * update HEIGHTS, SIDEBAR, and TRANSITIONS in constants.ts - DO NOT hardcode here.
 */
import { IconCirclePlus } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconCirclePlus';
import { IconSearchlinesSparkle } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconSearchlinesSparkle';
import { Download, FlaskConical, FolderOpen, Search, Settings2 } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useShallow } from 'zustand/shallow';

import { ConversationList } from './components/ConversationList';
import { PowersSection } from './components/PowersSection';
import { SidebarItem } from './components/SidebarItem';
import { SidebarToggleIcon } from './components/SidebarToggleIcon';
import { TabButton } from './components/TabButton';
import { useSidebarActions } from './hooks/use-sidebar-actions';

import type { PrimarySidebarProps, SidebarTab } from './types';
import type { SettingsDialogProps } from '@/components/modals/settings';
import type { SkillsDialogProps } from '@/components/modals/skills';
import type { FC } from 'react';

import { FileExplorer } from '@/components/files';
import {
  ConversationDeleteDialog,
  CreateWorktreeDialog,
  DeleteWorktreeDialog,
} from '@/components/modals';
import { BeamAsciiPre } from '@/components/shared';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, getCommandKey, HEIGHTS, SIDEBAR } from '@/lib/utils';
import {
  useUIStore,
  useIsLeftSidebarCollapsed,
  useWorkspaceName,
  useWorkspacePath,
  useWorkspaceConversations,
  useActiveConversationId,
  useWorktrees,
  useActiveWorktreePath,
  useCreateWorktreeDialogOpen,
} from '@/stores/ui/ui-store';
import { useUpdateStore } from '@/stores/ui/update-store';

/** Evaluated once at module load — the OS preference is static for the session lifetime.
 * Guarded for non-DOM contexts (tests / SSR). (Code review: Codex cycle 1, issue #3) */
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Width transition CSS for the sidebar, gated on reduced-motion preference. */
const SIDEBAR_WIDTH_TRANSITION = PREFERS_REDUCED_MOTION
  ? 'none'
  : 'width 200ms cubic-bezier(0.165, 0.84, 0.44, 1)';

// Lazy load heavy components
const LazySettingsDialog = lazy(() =>
  import('@/components/modals/settings/SettingsDialog').then((m) => ({
    default: m.SettingsDialog,
  }))
);
const SettingsDialog: FC<SettingsDialogProps> = (props) => (
  <Suspense fallback={null}>
    <LazySettingsDialog {...props} />
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

export const PrimarySidebar: FC<PrimarySidebarProps> = ({ width }) => {
  // Use useShallow to prevent re-renders when unrelated store state changes
  const {
    toggleLeftSidebar,
    settingsDialogOpen,
    settingsDialogSection,
    setSettingsDialogOpen,
    openSettings,
    toggleWorktreeExpanded,
    editingConversationId,
    setEditingConversationId,
  } = useUIStore(
    useShallow((s) => ({
      toggleLeftSidebar: s.toggleLeftSidebar,
      settingsDialogOpen: s.settingsDialogOpen,
      settingsDialogSection: s.settingsDialogSection,
      setSettingsDialogOpen: s.setSettingsDialogOpen,
      openSettings: s.openSettings,
      toggleWorktreeExpanded: s.toggleWorktreeExpanded,
      editingConversationId: s.editingConversationId,
      setEditingConversationId: s.setEditingConversationId,
    }))
  );
  const isCollapsed = useIsLeftSidebarCollapsed();
  const workspaceName = useWorkspaceName();
  const workspacePath = useWorkspacePath();
  const conversations = useWorkspaceConversations();
  const activeConversationId = useActiveConversationId();
  const worktrees = useWorktrees();
  const activeWorktreePath = useActiveWorktreePath();
  const createWorktreeDialogOpen = useCreateWorktreeDialogOpen();

  const updateStatus = useUpdateStore((s) => s.status);
  const updateDismissed = useUpdateStore((s) => s.toastDismissed);

  const [activeTab, setActiveTab] = useState<SidebarTab>('conversations');
  const [skillsDialogOpen, setSkillsDialogOpen] = useState(false);

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

  return (
    <aside
      data-sidebar="primary"
      className="h-full flex flex-col bg-card overflow-hidden border-r border-gray-5"
      style={{
        width,
        transition: SIDEBAR_WIDTH_TRANSITION,
        contain: 'layout style',
      }}
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
                  aria-label="Expand sidebar"
                  className="relative h-7 w-7 flex items-center justify-center rounded-md hover:bg-gray-3 dark:hover:bg-gray-4 active:scale-95 transition-[background-color,transform] duration-100 text-sidebar-foreground hover:text-foreground before:absolute before:content-[''] before:inset-[-8px]"
                >
                  <SidebarToggleIcon expanded={false} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="flex items-center gap-2">
                <span>Expand sidebar</span>
                <KbdGroup>
                  <Kbd className="bg-white/15 text-inherit border-white/20">{getCommandKey()}</Kbd>
                  <Kbd className="bg-white/15 text-inherit border-white/20">/</Kbd>
                </KbdGroup>
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          /* Expanded: text on left, button on right */
          <div className="flex items-center justify-between w-full px-3">
            <div className="flex items-center gap-1.5">
              <BeamAsciiPre
                ariaLabel="Orbit Agent"
                className="text-[3.5px] leading-[1.1]"
                duration={1400}
                beamSize={20}
                text={` ██████╗ ██████╗ ██████╗ ██╗████████╗     █████╗  ██████╗ ███████╗███╗  ██╗████████╗
██╔═══██╗██╔══██╗██╔══██╗██║╚══██╔══╝    ██╔══██╗██╔════╝ ██╔════╝████╗ ██║╚══██╔══╝
██║   ██║██████╔╝██████╔╝██║   ██║       ███████║██║  ███╗█████╗  ██╔██╗██║   ██║
██║   ██║██╔══██╗██╔══██╗██║   ██║       ██╔══██║██║   ██║██╔══╝  ██║╚████║   ██║
╚██████╔╝██║  ██║██████╔╝██║   ██║       ██║  ██║╚██████╔╝███████╗██║ ╚███║   ██║
 ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚═╝   ╚═╝       ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚══╝   ╚═╝`}
              />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleLeftSidebar}
                  aria-label="Collapse sidebar"
                  className="relative h-7 w-7 flex items-center justify-center rounded-md hover:bg-gray-3 dark:hover:bg-gray-4 active:scale-95 transition-[background-color,transform] duration-100 text-sidebar-foreground hover:text-foreground before:absolute before:content-[''] before:inset-[-8px]"
                >
                  <SidebarToggleIcon expanded={true} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="flex items-center gap-2">
                <span>Collapse sidebar</span>
                <KbdGroup>
                  <Kbd className="bg-white/15 text-inherit border-white/20">{getCommandKey()}</Kbd>
                  <Kbd className="bg-white/15 text-inherit border-white/20">/</Kbd>
                </KbdGroup>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Search Bar - hidden when collapsed */}
      <div
        className={cn(
          'shrink-0 mx-1.5 overflow-hidden transition-opacity duration-150 ease-out',
          isCollapsed ? 'py-0' : ''
        )}
        style={{
          height: isCollapsed ? 0 : SIDEBAR.searchBarHeight,
          opacity: isCollapsed ? 0 : 1,
        }}
      >
        <button
          onClick={handleOpenQuickSearch}
          className="flex items-center h-8 rounded-lg text-sidebar-foreground hover:text-foreground overflow-hidden w-full bg-gray-4 hover:bg-gray-5 border border-gray-7 transition-[background-color] duration-100"
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
          <Kbd className="ml-auto mr-2 h-[18px] !text-[12px] px-1.5 bg-gray-5 text-inherit border-gray-6">
            <span className="text-[14px] leading-none">⌘</span> P
          </Kbd>
        </button>
      </div>

      {/* Tab Navigation - hidden when collapsed */}
      <div
        className={cn(
          'flex items-center shrink-0 px-1.5 gap-0.5 overflow-visible transition-opacity duration-150 ease-out',
          isCollapsed ? '' : 'border-b border-gray-5'
        )}
        style={{
          height: isCollapsed ? 0 : SIDEBAR.tabNavHeight,
          opacity: isCollapsed ? 0 : 1,
        }}
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
            'flex flex-col border-b border-gray-5 shrink-0',
            isCollapsed ? 'gap-0 pt-0 pb-1.5' : 'gap-1 py-1.5'
          )}
        >
          <SidebarItem
            icon={IconCirclePlus}
            label="New Session"
            collapsed={isCollapsed}
            equalSpacing={isCollapsed}
            large
            onClick={handleStartConversation}
          />
          <SidebarItem
            icon={FolderOpen}
            label="Projects"
            collapsed={isCollapsed}
            equalSpacing={isCollapsed}
          />
          <SidebarItem
            icon={IconSearchlinesSparkle}
            label="Vault"
            badge="Coming soon"
            collapsed={isCollapsed}
            equalSpacing={isCollapsed}
            onClick={() => {
              useUIStore.getState().toggleVault();
            }}
          />
          <PowersSection
            collapsed={isCollapsed}
            onSkillsClick={() => {
              setSkillsDialogOpen(true);
            }}
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
              'transition-opacity duration-150',
              isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
            )}
          >
            <ConversationList
              conversations={conversations}
              worktrees={worktrees}
              workspaceName={workspaceName}
              activeConversationId={activeConversationId}
              activeWorktreePath={activeWorktreePath}
              editingConversationId={editingConversationId}
              collapsed={isCollapsed}
              onLoadConversation={handleLoadConversation}
              onStartEditConversation={setEditingConversationId}
              onRenameConversation={(sessionId, newTitle) => {
                void handleRenameConversation(sessionId, newTitle);
              }}
              onCancelEditConversation={() => {
                setEditingConversationId(null);
              }}
              onDeleteConversation={handleOpenDeleteDialog}
              onDuplicateConversation={handleDuplicateConversation}
              onToggleWorktree={toggleWorktreeExpanded}
              onSelectWorktree={(path) => {
                useUIStore.getState().setActiveWorktree(path);
              }}
              onRemoveWorktree={handleOpenDeleteWorktreeDialog}
              onOpenCreateWorktree={handleOpenCreateWorktree}
            />
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

      <hr className="border-gray-5 border-t shrink-0 mt-2 mb-0" />

      {/* Utilities — pinned to bottom, spacing stays constant so buttons don't shift on collapse */}
      <div className="flex flex-col shrink-0 gap-1 py-1.5">
        {/* Update indicator — visible after user dismisses the update toast */}
        {(updateStatus === 'available' || updateStatus === 'ready') && updateDismissed ? (
          <SidebarItem
            icon={Download}
            label={updateStatus === 'ready' ? 'Restart to update' : 'Update available'}
            collapsed={isCollapsed}
            equalSpacing={isCollapsed}
            badge={updateStatus === 'ready' ? 'Restart' : 'Update'}
            badgeVariant="primary"
            className="border border-dashed border-gray-6"
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
        <SidebarItem
          icon={Settings2}
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

      {/* Create Worktree Dialog */}
      <CreateWorktreeDialog
        open={createWorktreeDialogOpen}
        onOpenChange={useUIStore.getState().setCreateWorktreeDialogOpen}
        onCreated={(worktree) => {
          // Auto-switch to the newly created worktree
          useUIStore.getState().setActiveWorktree(worktree.path);
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

      {/* Skills Dialog */}
      <SkillsDialog open={skillsDialogOpen} onOpenChange={setSkillsDialogOpen} />
    </aside>
  );
};
