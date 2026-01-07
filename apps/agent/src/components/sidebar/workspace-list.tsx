import { ConversationItem } from './conversation-item';
import { WorkspaceItem } from './workspace-item';

import type { FC } from 'react';

import { cn } from '@/lib/utils/utils';
import { useChatStore } from '@/stores/chat/chat-store';

export interface Workspace {
  id: string;
  name: string;
  conversationIds: string[];
}

export interface WorkspaceListProps {
  workspaces: Workspace[];
  className?: string;
}

export const WorkspaceList: FC<WorkspaceListProps> = ({ workspaces, className }) => {
  const conversations = useChatStore((state) => state.conversations);

  // Create a map of conversation IDs to conversation objects for quick lookup
  const conversationMap = new Map(conversations.map((conv) => [conv.id, conv]));

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {workspaces.map((workspace) => {
        // Filter conversations that belong to this workspace
        const workspaceConversations = workspace.conversationIds
          .map((id) => conversationMap.get(id))
          .filter((conv): conv is NonNullable<typeof conv> => conv !== undefined);

        return (
          <WorkspaceItem
            key={workspace.id}
            id={workspace.id}
            name={workspace.name}
            defaultExpanded={workspaceConversations.length > 0}
          >
            {workspaceConversations.length > 0 ? (
              workspaceConversations.map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  id={conversation.id}
                  title={conversation.title}
                  timestamp={conversation.updatedAt}
                />
              ))
            ) : (
              <div className="px-3 py-2 text-xs text-muted-foreground">No conversations</div>
            )}
          </WorkspaceItem>
        );
      })}
    </div>
  );
};
