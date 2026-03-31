import { useMemo } from 'react';

import type { ConversationSummary } from '@/services/conversations';

import { useWorkspaceConversations } from '@/stores/ui/ui-store';

export function useConversationList(): ConversationSummary[] {
  const claudeConversations = useWorkspaceConversations();

  return useMemo(
    () =>
      claudeConversations.map((conversation) => ({
        sessionId: conversation.sessionId,
        title: conversation.title,
        createdAt: conversation.updatedAt,
        updatedAt: conversation.updatedAt,
        messageCount: conversation.messageCount,
        ...(conversation.workspacePath ? { workspacePath: conversation.workspacePath } : {}),
        ...(conversation.worktreePath ? { worktreePath: conversation.worktreePath } : {}),
      })),
    [claudeConversations]
  );
}
