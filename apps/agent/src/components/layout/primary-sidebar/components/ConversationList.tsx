/**
 * ConversationList - Renders worktree groups with nested conversations
 */
import { Plus } from 'lucide-react';
import { useMemo } from 'react';

/** Indentation for conversation items nested under workspace (px) */
const CONVERSATION_INDENT_PX = 19;

import { ConversationItem } from './ConversationItem';
import { WorkspaceItem } from './WorkspaceItem';

import type { ConversationSummary, WorktreeUIState } from '@/stores/ui/ui-store';
import type { FC } from 'react';

import { WorktreeItem } from '@/components/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ConversationListProps {
  readonly conversations: ConversationSummary[];
  readonly worktrees: WorktreeUIState[];
  readonly workspaceName: string | null;
  readonly activeConversationId: string | null;
  readonly activeWorktreePath: string | null;
  readonly editingConversationId: string | null;
  readonly collapsed: boolean;
  readonly onLoadConversation: (sessionId: string) => void;
  readonly onStartEditConversation: (sessionId: string) => void;
  readonly onRenameConversation: (sessionId: string, newTitle: string) => void;
  readonly onCancelEditConversation: () => void;
  readonly onDeleteConversation: (conv: ConversationSummary) => void;
  readonly onDuplicateConversation: (sessionId: string) => void;
  readonly onToggleWorktree: (path: string) => void;
  readonly onRemoveWorktree: (path: string) => void;
  readonly onOpenCreateWorktree: () => void;
}

export const ConversationList: FC<ConversationListProps> = ({
  conversations,
  worktrees,
  workspaceName,
  activeConversationId,
  activeWorktreePath,
  editingConversationId,
  collapsed,
  onLoadConversation,
  onStartEditConversation,
  onRenameConversation,
  onCancelEditConversation,
  onDeleteConversation,
  onDuplicateConversation,
  onToggleWorktree,
  onRemoveWorktree,
  onOpenCreateWorktree,
}) => {
  // Build a Map of worktree path -> conversations for O(1) lookups
  // This avoids O(n*m) complexity from filtering conversations for each worktree
  const conversationsByWorktree = useMemo(() => {
    const map = new Map<string, ConversationSummary[]>();
    for (const conv of conversations) {
      const path = conv.workspacePath;
      if (path) {
        const existing = map.get(path);
        if (existing) {
          existing.push(conv);
        } else {
          map.set(path, [conv]);
        }
      }
    }
    return map;
  }, [conversations]);

  // Helper to get conversations for a specific worktree path (O(1) lookup)
  const getWorktreeConversations = (worktreePath: string): ConversationSummary[] => {
    return conversationsByWorktree.get(worktreePath) ?? [];
  };

  // Render conversation items for a given list
  const renderConversations = (convList: ConversationSummary[]): React.ReactNode => {
    if (convList.length === 0) return null;

    return (
      <div className="relative mt-1" style={{ marginLeft: CONVERSATION_INDENT_PX }}>
        {/* Vertical timeline line */}
        <div className="absolute left-0 top-0 bottom-2 w-px bg-border/60" />
        {/* Conversations */}
        <div className="flex flex-col gap-0.5">
          {convList.map((conv) => (
            <ConversationItem
              key={conv.sessionId}
              conversation={conv}
              active={conv.sessionId === activeConversationId}
              collapsed={collapsed}
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
    );
  };

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-sm font-medium text-muted-foreground/70 uppercase tracking-normal whitespace-nowrap">
          Workspaces
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="h-5 w-5 flex items-center justify-center rounded-md hover:bg-muted/60 active:scale-90 transition-[background-color,color,transform] duration-150 text-muted-foreground hover:text-foreground shrink-0"
              onClick={onOpenCreateWorktree}
            >
              <Plus className="h-3 w-3" />
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
                  active={wt.worktree.path === activeWorktreePath}
                  collapsed={collapsed}
                  onToggle={() => {
                    onToggleWorktree(wt.worktree.path);
                  }}
                  onRemove={() => {
                    onRemoveWorktree(wt.worktree.path);
                  }}
                />
                {/* Conversations for this worktree */}
                {wt.isExpanded
                  ? renderConversations(getWorktreeConversations(wt.worktree.path))
                  : null}
              </div>
            ))}
          </>
        ) : workspaceName ? (
          <>
            <WorkspaceItem
              name={workspaceName}
              active
              collapsed={collapsed}
              expanded={true}
              onToggle={() => {
                // No-op for single workspace
              }}
            />
            {/* Conversation list with timeline */}
            {renderConversations(conversations)}
          </>
        ) : null}
      </div>
    </div>
  );
};
