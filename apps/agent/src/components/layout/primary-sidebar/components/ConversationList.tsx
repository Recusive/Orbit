/**
 * ConversationList - Renders worktree navigation and active-worktree conversations
 */
import { Plus } from 'lucide-react';

import { ConversationItem } from './ConversationItem';
import { WorkspaceItem } from './WorkspaceItem';

import type { WorktreeInfo } from '@/lib/api';
import type { ConversationSummary, WorktreeUIState } from '@/stores/ui/ui-store';
import type { FC, ReactNode } from 'react';

import { WorktreeItem } from '@/components/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Indentation for conversation items nested under workspace (px) */
const CONVERSATION_INDENT_PX = 19;

/** Evaluated once — reduced-motion preference is static for session lifetime */
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Asymmetric enter/exit transitions for the collapsible conversation list.
 * Enter: ease-out (fast arrival, gentle settle) — 200ms
 * Exit:  ease-in  (gentle start, fast disappearance) — 150ms
 */
const GRID_ENTER = 'grid-template-rows 200ms cubic-bezier(0.16, 1, 0.3, 1)';
const GRID_EXIT = 'grid-template-rows 150ms cubic-bezier(0.4, 0, 1, 1)';
const OPACITY_ENTER = 'opacity 150ms cubic-bezier(0.16, 1, 0.3, 1)';
const OPACITY_EXIT = 'opacity 100ms cubic-bezier(0.4, 0, 1, 1)';

interface ConversationListProps {
  readonly conversations: ConversationSummary[];
  readonly worktrees: WorktreeUIState[];
  readonly workspaceName: string | null;
  readonly activeConversationId: string | null;
  readonly activeWorktreePath: string | null;
  readonly editingConversationId: string | null;
  readonly onLoadConversation: (sessionId: string) => void;
  readonly onStartEditConversation: (sessionId: string) => void;
  readonly onRenameConversation: (sessionId: string, newTitle: string) => void;
  readonly onCancelEditConversation: () => void;
  readonly onDeleteConversation: (conv: ConversationSummary) => void;
  readonly onDuplicateConversation: (sessionId: string) => void;
  readonly onToggleWorktree: (path: string) => void;
  /** Called when user clicks on a worktree to switch to it as active workspace */
  readonly onSelectWorktree: (path: string) => void;
  readonly onRemoveWorktree: (worktree: WorktreeInfo) => void;
  readonly onOpenCreateWorktree: () => void;
}

export const ConversationList: FC<ConversationListProps> = ({
  conversations,
  worktrees,
  workspaceName,
  activeConversationId,
  activeWorktreePath,
  editingConversationId,
  onLoadConversation,
  onStartEditConversation,
  onRenameConversation,
  onCancelEditConversation,
  onDeleteConversation,
  onDuplicateConversation,
  onToggleWorktree,
  onSelectWorktree,
  onRemoveWorktree,
  onOpenCreateWorktree,
}) => {
  const mainWorktreePath = worktrees.find((wt) => wt.worktree.isMain)?.worktree.path ?? null;
  const effectiveActiveWorktreePath = activeWorktreePath ?? mainWorktreePath;

  // Render conversation items for a given list, with animated expand/collapse
  const renderConversations = (convList: ConversationSummary[], expanded: boolean): ReactNode => {
    if (convList.length === 0) return null;

    return (
      <div
        className="grid"
        style={{
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition: PREFERS_REDUCED_MOTION ? undefined : expanded ? GRID_ENTER : GRID_EXIT,
        }}
      >
        <div
          className="overflow-hidden"
          style={{
            opacity: expanded ? 1 : 0,
            transition: PREFERS_REDUCED_MOTION
              ? undefined
              : expanded
                ? OPACITY_ENTER
                : OPACITY_EXIT,
          }}
        >
          <div className="relative mt-1" style={{ marginLeft: CONVERSATION_INDENT_PX }}>
            {/* Vertical timeline line */}
            <div
              className="absolute top-0 bottom-2 w-[2px] rounded-full bg-border/60"
              style={{
                left: -2,
                maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
              }}
            />
            {/* Conversations */}
            <div className="flex flex-col gap-0.5">
              {convList.map((conv) => (
                <ConversationItem
                  key={conv.sessionId}
                  conversation={conv}
                  active={conv.sessionId === activeConversationId}
                  isEditing={editingConversationId === conv.sessionId}
                  onClick={() => {
                    onLoadConversation(conv.sessionId);
                  }}
                  onDoubleClick={() => {
                    onStartEditConversation(conv.sessionId);
                  }}
                  onRename={(newTitle) => {
                    onRenameConversation(conv.sessionId, newTitle);
                  }}
                  onCancelEdit={onCancelEditConversation}
                  onDelete={() => {
                    onDeleteConversation(conv);
                  }}
                  onDuplicate={() => {
                    onDuplicateConversation(conv.sessionId);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-sm font-medium text-muted-foreground/70 uppercase tracking-tight whitespace-nowrap">
          Workspaces
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label="Create worktree"
              className="relative h-5 w-5 flex items-center justify-center rounded-md hover:bg-lg-sidebar-hover active:scale-90 transition-transform duration-75 text-muted-foreground hover:text-foreground shrink-0 before:absolute before:content-[''] before:inset-[-10px]"
              onClick={onOpenCreateWorktree}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <span>Create worktree</span>
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex flex-col gap-0.5 mt-1">
        {/* Display worktrees if available, otherwise show single workspace */}
        {worktrees.length > 0 ? (
          <>
            {worktrees.map((wt) => (
              <div key={wt.worktree.path}>
                <WorktreeItem
                  worktreeState={wt}
                  active={wt.worktree.path === effectiveActiveWorktreePath}
                  onToggle={() => {
                    onToggleWorktree(wt.worktree.path);
                  }}
                  onSelect={() => {
                    onSelectWorktree(wt.worktree.path);
                  }}
                  onRemove={() => {
                    onRemoveWorktree(wt.worktree);
                  }}
                />
                {wt.worktree.path === effectiveActiveWorktreePath
                  ? renderConversations(conversations, wt.isExpanded)
                  : null}
              </div>
            ))}
          </>
        ) : workspaceName ? (
          <>
            <WorkspaceItem
              name={workspaceName}
              active
              expanded={true}
              onToggle={() => {
                // No-op for single workspace
              }}
            />
            {/* Conversation list with timeline — single workspace is always expanded */}
            {renderConversations(conversations, true)}
          </>
        ) : null}
      </div>
    </div>
  );
};
