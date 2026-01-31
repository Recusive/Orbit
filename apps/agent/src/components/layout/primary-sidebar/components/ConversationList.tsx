/**
 * ConversationList - Renders worktree groups with nested conversations
 */
import { Plus } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { ConversationItem } from './ConversationItem';
import { WorkspaceItem } from './WorkspaceItem';

import type { WorktreeInfo } from '@/lib/api';
import type { ConversationSummary, WorktreeUIState } from '@/stores/ui/ui-store';
import type { FC } from 'react';

import { WorktreeItem } from '@/components/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Indentation for conversation items nested under workspace (px) */
const CONVERSATION_INDENT_PX = 19;

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
  collapsed,
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
  // Build a Map of worktree path -> conversations for O(1) lookups
  // This avoids O(n*m) complexity from filtering conversations for each worktree
  // Also pre-computes legacy conversation handling to avoid O(n) filter on each render
  const conversationsByWorktree = useMemo(() => {
    const map = new Map<string, ConversationSummary[]>();
    const legacyConversations: ConversationSummary[] = [];

    // Find main worktree path (once, not per-render)
    const mainWt = worktrees.find((wt) => wt.worktree.isMain);
    const mainPath = mainWt?.worktree.path ?? null;

    // Build set of all worktree paths for fast lookup
    const worktreePaths = new Set(worktrees.map((wt) => wt.worktree.path));

    for (const conv of conversations) {
      if (conv.worktreePath) {
        // Modern conversation with explicit worktreePath
        const existing = map.get(conv.worktreePath);
        if (existing) {
          existing.push(conv);
        } else {
          map.set(conv.worktreePath, [conv]);
        }
      } else if (conv.workspacePath) {
        // Legacy conversation (no worktreePath)
        // Check if workspacePath matches any worktree path
        if (worktreePaths.has(conv.workspacePath)) {
          // workspacePath matches a worktree - group under that worktree
          const existing = map.get(conv.workspacePath);
          if (existing) {
            existing.push(conv);
          } else {
            map.set(conv.workspacePath, [conv]);
          }
        } else {
          // workspacePath doesn't match any worktree - treat as legacy
          // These will be shown under the main worktree
          legacyConversations.push(conv);
        }
      } else {
        // Conversation with neither worktreePath nor workspacePath
        // This can happen with very old conversations - show under main worktree
        legacyConversations.push(conv);
      }
    }

    // Map all legacy conversations to main worktree
    // This ensures they're visible even when workspacePath differs from any worktree path
    if (mainPath && legacyConversations.length > 0) {
      const mainConversations = map.get(mainPath) ?? [];
      map.set(mainPath, [...mainConversations, ...legacyConversations]);
    }

    return map;
  }, [conversations, worktrees]);

  // Helper to get conversations for a specific worktree path (O(1) lookup)
  // All legacy conversation handling is pre-computed in useMemo above
  const getWorktreeConversations = useCallback(
    (worktreePath: string): ConversationSummary[] => {
      return conversationsByWorktree.get(worktreePath) ?? [];
    },
    [conversationsByWorktree]
  );

  // Render conversation items for a given list
  const renderConversations = (convList: ConversationSummary[]): React.ReactNode => {
    if (convList.length === 0) return null;

    return (
      <div className="relative mt-1" style={{ marginLeft: CONVERSATION_INDENT_PX }}>
        {/* Vertical timeline line */}
        <div className="absolute top-0 bottom-2 w-px bg-border/60" style={{ left: -2 }} />
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
        <span className="text-sm font-medium text-muted-foreground/70 uppercase tracking-tight whitespace-nowrap">
          Workspaces
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label="Create worktree"
              className="relative h-5 w-5 flex items-center justify-center rounded-md hover:bg-muted/60 active:scale-90 transition-[background-color,color,transform] duration-150 text-muted-foreground hover:text-foreground shrink-0 before:absolute before:content-[''] before:inset-[-10px]"
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
                  onSelect={() => {
                    onSelectWorktree(wt.worktree.path);
                  }}
                  onRemove={() => {
                    onRemoveWorktree(wt.worktree);
                  }}
                />
                {/* Conversations for this worktree — kept mounted, toggled via CSS to avoid remount cost.
                    NOTE: With display:none, React hooks/subscriptions in ConversationItem remain active.
                    For typical usage (<50 conversations), this is fine. For very large lists (200+),
                    consider unmounting collapsed worktrees or virtualizing the list.
                    (Code review: Opus cycle 1, issue #8) */}
                <div style={{ display: wt.isExpanded ? 'block' : 'none' }}>
                  {renderConversations(getWorktreeConversations(wt.worktree.path))}
                </div>
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
