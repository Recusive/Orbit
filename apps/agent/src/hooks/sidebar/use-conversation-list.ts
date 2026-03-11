import { useMemo } from 'react';

import type { ConversationSummary } from '@/types/backend';

import { useActiveBackend } from '@/stores/backend';
import { useOcSessionList } from '@/stores/opencode';
import { useWorkspaceConversations } from '@/stores/ui/ui-store';

export function useConversationList(): ConversationSummary[] {
  const activeBackend = useActiveBackend();
  const claudeConversations = useWorkspaceConversations();
  const ocSessions = useOcSessionList();

  return useMemo(() => {
    if (activeBackend === 'claude') {
      return claudeConversations.map((conversation) => ({
        sessionId: conversation.sessionId,
        title: conversation.title,
        createdAt: conversation.updatedAt,
        updatedAt: conversation.updatedAt,
        messageCount: conversation.messageCount,
        ...(conversation.workspacePath ? { workspacePath: conversation.workspacePath } : {}),
        ...(conversation.worktreePath ? { worktreePath: conversation.worktreePath } : {}),
      }));
    }

    return ocSessions.map((session) => ({
      sessionId: session.id,
      title: session.title,
      createdAt: session.time.created,
      updatedAt: session.time.updated,
      messageCount: 0,
      ...(session.directory ? { workspacePath: session.directory } : {}),
    }));
  }, [activeBackend, claudeConversations, ocSessions]);
}
