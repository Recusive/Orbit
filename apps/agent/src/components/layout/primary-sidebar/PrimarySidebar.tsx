/**
 * PrimarySidebar - Main navigation sidebar with conversations and explorer
 *
 * NOTE: Layout dimensions come from @/lib/utils/constants.
 * To change header heights, sidebar widths, or transition durations,
 * update HEIGHTS, SIDEBAR, and TRANSITIONS in constants.ts - DO NOT hardcode here.
 */
import { FlaskConical, Inbox, Plus, Search, Settings } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useShallow } from 'zustand/shallow';

import { ConversationList } from './components/ConversationList';
import { SidebarItem } from './components/SidebarItem';
import { SidebarToggleIcon } from './components/SidebarToggleIcon';
import { TabButton } from './components/TabButton';
import { useSidebarActions } from './hooks/use-sidebar-actions';

import type { PrimarySidebarProps, SidebarTab } from './types';
import type { SettingsDialogProps } from '@/components/modals/settings';
import type { FC } from 'react';

import { FileExplorer } from '@/components/files';
import { ConversationDeleteDialog, CreateWorktreeDialog } from '@/components/modals';
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

  const [activeTab, setActiveTab] = useState<SidebarTab>('conversations');

  const {
    deleteDialogOpen,
    setDeleteDialogOpen,
    conversationToDelete,
    handleStartConversation,
    handleLoadConversation,
    handleOpenQuickSearch,
    handleOpenCreateWorktree,
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
      className="h-full flex flex-col bg-card transition-[width] duration-150 ease-in-out overflow-hidden shadow-lg dark:shadow-none"
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
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted/60 active:scale-95 transition-[background-color,color,transform] duration-150 text-muted-foreground hover:text-foreground"
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
              <span className="text-lg font-semibold whitespace-nowrap">Orbit Agent</span>
              <span
                className="bg-primary/8 text-primary/70 rounded-full px-1.5 py-0.5 font-medium tracking-wide whitespace-nowrap"
                style={{ fontSize: SIDEBAR.previewBadgeFontSize }}
              >
                Preview
              </span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleLeftSidebar}
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted/60 active:scale-95 transition-[background-color,color,transform] duration-150 text-muted-foreground hover:text-foreground"
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
          'shrink-0 mx-1.5 overflow-hidden transition-[height,opacity] duration-150 ease-in-out',
          isCollapsed ? 'py-0' : 'py-1'
        )}
        style={{
          height: isCollapsed ? 0 : SIDEBAR.searchBarHeight,
          opacity: isCollapsed ? 0 : 1,
        }}
      >
        <button
          onClick={handleOpenQuickSearch}
          className="flex items-center h-8 rounded-lg text-muted-foreground hover:text-foreground overflow-hidden border border-border/50 w-full bg-muted/40 hover:bg-muted/60 hover:border-border/60 transition-[background-color,border-color,color] duration-200"
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
          <KbdGroup className="ml-auto mr-2">
            <Kbd className="bg-foreground/10 text-inherit border-foreground/15">⌘</Kbd>
            <Kbd className="bg-foreground/10 text-inherit border-foreground/15">P</Kbd>
          </KbdGroup>
        </button>
      </div>

      {/* Tab Navigation - hidden when collapsed */}
      <div
        className={cn(
          'flex items-center shrink-0 px-1.5 gap-0.5 overflow-hidden transition-[height,opacity] duration-150 ease-in-out',
          isCollapsed ? '' : 'border-b border-divider'
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
            'flex flex-col border-b border-divider shrink-0 transition-[gap,padding] duration-150 ease-in-out',
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
              onRemoveWorktree={(path) => {
                void handleRemoveWorktree(path);
              }}
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

      <hr className={cn('border-divider shrink-0', isCollapsed ? 'my-0' : 'my-2')} />

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

      {/* Create Worktree Dialog */}
      <CreateWorktreeDialog
        open={createWorktreeDialogOpen}
        onOpenChange={useUIStore.getState().setCreateWorktreeDialogOpen}
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
    </aside>
  );
};
