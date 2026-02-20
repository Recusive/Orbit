/**
 * PrimarySidebar - Main navigation sidebar with conversations and explorer
 *
 * NOTE: Layout dimensions come from @/lib/utils/constants.
 * To change header heights, sidebar widths, or transition durations,
 * update HEIGHTS, SIDEBAR, and TRANSITIONS in constants.ts - DO NOT hardcode here.
 */
import { IconCirclePlus } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconCirclePlus';
import { IconSearchlinesSparkle } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconSearchlinesSparkle';
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FlaskConical,
  FolderOpen,
  Search,
  Settings2,
} from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useShallow } from 'zustand/shallow';

import { ConversationList } from './components/ConversationList';
import { PowersSection } from './components/PowersSection';
import { SidebarItem } from './components/SidebarItem';
import { SidebarToggleIcon } from './components/SidebarToggleIcon';
import { useSidebarActions } from './hooks/use-sidebar-actions';

import type { SidebarTab } from './types';
import type { SettingsDialogProps } from '@/components/modals/settings';
import type { SkillsDialogProps } from '@/components/modals/skills';
import type { FC } from 'react';

import { FileExplorer } from '@/components/files';
import {
  ConversationDeleteDialog,
  CreateWorktreeDialog,
  DeleteWorktreeDialog,
} from '@/components/modals';
import { SFSymbol } from '@/components/shared';
import { Kbd } from '@/components/ui/kbd';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HEIGHTS, SIDEBAR } from '@/lib/utils';
import {
  useUIStore,
  useWorkspaceName,
  useWorkspacePath,
  useWorkspaceConversations,
  useActiveConversationId,
  useWorktrees,
  useActiveWorktreePath,
  useCreateWorktreeDialogOpen,
} from '@/stores/ui/ui-store';
import { useUpdateStore } from '@/stores/ui/update-store';

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

export const PrimarySidebar: FC = () => {
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
      className="h-full flex flex-col overflow-hidden"
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
          className="relative h-7 w-7 flex items-center justify-center rounded-md hover:bg-gray-3 dark:hover:bg-gray-4 active:scale-95 transition-[background-color,transform] duration-100 text-sidebar-foreground hover:text-foreground before:absolute before:content-[''] before:inset-[-8px]"
        >
          <SFSymbol
            name="sidebar.left"
            size={18}
            weight="medium"
            fallback={<SidebarToggleIcon expanded={true} />}
          />
        </button>
        {/* Back / Forward navigation */}
        <div className="flex items-center gap-0.5 ml-auto">
          <button
            aria-label="Go back"
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-gray-3 dark:hover:bg-gray-4 active:scale-95 transition-[background-color,transform] duration-100 text-sidebar-foreground hover:text-foreground"
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
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-gray-3 dark:hover:bg-gray-4 active:scale-95 transition-[background-color,transform] duration-100 text-sidebar-foreground hover:text-foreground"
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

      {/* Search Bar */}
      <div
        className="shrink-0 mx-1.5 overflow-hidden"
        style={{ height: SIDEBAR.searchBarHeight, marginBottom: 5 }}
      >
        <button
          onClick={handleOpenQuickSearch}
          className="flex items-center h-8 rounded-[8px] text-sidebar-foreground hover:text-foreground overflow-hidden w-full bg-gray-6 hover:bg-gray-7 dark:bg-gray-4 dark:hover:bg-gray-5 transition-[background-color] duration-100"
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

      {/* Tab heading + toggle */}
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
                className="h-3.5 w-7 !rounded-md data-[state=checked]:bg-primary data-[state=unchecked]:bg-gray-6 [&>span]:!h-2.5 [&>span]:!w-2.5 [&>span]:!rounded-sm [&>span]:data-[state=checked]:!translate-x-3.5"
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">
            {activeTab === 'conversations' ? 'Switch to Explorer' : 'Switch to Sessions'}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Main Actions (only show for conversations tab) */}
      {activeTab === 'conversations' ? (
        <div className="flex flex-col shrink-0 gap-1 py-1.5">
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
            onClick={handleStartConversation}
          />
          <SidebarItem icon={FolderOpen} label="Projects" />
          <SidebarItem
            icon={IconSearchlinesSparkle}
            label="Vault"
            badge="Coming soon"
            onClick={() => {
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

      {/* Tab Content */}
      <div className="flex-1 overflow-x-hidden overflow-y-auto">
        {activeTab === 'conversations' ? (
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
        ) : (
          <FileExplorer />
        )}
      </div>

      <hr className="border-gray-6 dark:border-gray-3 border-t shrink-0 mt-2 mb-0" />

      {/* Utilities — pinned to bottom */}
      <div className="flex flex-col shrink-0 gap-1 py-1.5">
        {/* Update indicator — visible after user dismisses the update toast */}
        {(updateStatus === 'available' || updateStatus === 'ready') && updateDismissed ? (
          <SidebarItem
            icon={Download}
            label={updateStatus === 'ready' ? 'Restart to update' : 'Update available'}
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
          icon={() => (
            <SFSymbol
              name="gear"
              size={18}
              weight="medium"
              fallback={<Settings2 className="h-4 w-4" />}
            />
          )}
          label="Settings"
          shortcut={['⌘', ',']}
          onClick={() => {
            openSettings('agent');
          }}
        />
        <SidebarItem
          icon={() => (
            <SFSymbol
              name="exclamationmark.bubble"
              size={18}
              weight="medium"
              fallback={<FlaskConical className="h-4 w-4" />}
            />
          )}
          label="Feedback"
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
