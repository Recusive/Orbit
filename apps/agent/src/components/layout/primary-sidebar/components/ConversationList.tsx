/**
 * ConversationList - Renders conversation items with animated expand/collapse.
 *
 * The "Workspaces" heading and worktree/workspace rows are rendered by
 * PrimarySidebar as a shrink-0 section above the scroll container.
 * This component only handles the conversation items themselves.
 */
import { ConversationItem } from './ConversationItem';

import type { ConversationSummary } from '@/stores/ui/ui-store';
import type { FC, ReactNode } from 'react';

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
  readonly expanded: boolean;
  readonly activeConversationId: string | null;
  readonly editingConversationId: string | null;
  readonly onLoadConversation: (sessionId: string) => void;
  readonly onStartEditConversation: (sessionId: string) => void;
  readonly onRenameConversation: (sessionId: string, newTitle: string) => void;
  readonly onCancelEditConversation: () => void;
  readonly onDeleteConversation: (conv: ConversationSummary) => void;
  readonly onDuplicateConversation: (sessionId: string) => void;
}

export const ConversationList: FC<ConversationListProps> = ({
  conversations,
  expanded,
  activeConversationId,
  editingConversationId,
  onLoadConversation,
  onStartEditConversation,
  onRenameConversation,
  onCancelEditConversation,
  onDeleteConversation,
  onDuplicateConversation,
}) => {
  // Render conversation items with animated expand/collapse
  const renderConversations = (convList: ConversationSummary[], isExpanded: boolean): ReactNode => {
    if (convList.length === 0) return null;

    return (
      <div
        className="grid"
        style={{
          gridTemplateRows: isExpanded ? '1fr' : '0fr',
          transition: PREFERS_REDUCED_MOTION ? undefined : isExpanded ? GRID_ENTER : GRID_EXIT,
        }}
      >
        <div
          className="overflow-hidden"
          style={{
            opacity: isExpanded ? 1 : 0,
            transition: PREFERS_REDUCED_MOTION
              ? undefined
              : isExpanded
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

  return renderConversations(conversations, expanded);
};
