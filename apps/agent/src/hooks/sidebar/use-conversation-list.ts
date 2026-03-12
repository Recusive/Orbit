import { useMemo } from 'react';
import { useShallow } from 'zustand/shallow';

import type { ConversationSummary } from '@/types/backend';

import { isDefaultOcTitle } from '@/services/opencode/oc-title-utils';
import { useActiveBackend } from '@/stores/backend';
import { useOcMessageStore, useOcSessionList, useOcSessionStore } from '@/stores/opencode';
import { useWorkspaceConversations } from '@/stores/ui/ui-store';

export function useConversationList(): ConversationSummary[] {
  const activeBackend = useActiveBackend();
  const claudeConversations = useWorkspaceConversations();
  const ocSessions = useOcSessionList();
  const ocMessageCounts = useOcMessageStore(
    useShallow((state) => {
      const counts: Record<string, number> = {};
      for (const [sessionId, session] of Object.entries(state.sessions)) {
        counts[sessionId] = session.messageOrder.length;
      }
      return counts;
    })
  );
  const pendingSendSessions = useOcSessionStore(useShallow((state) => state.pendingSendSessions));

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
      title: isDefaultOcTitle(session.title) ? 'Untitled' : session.title,
      createdAt: session.time.created,
      updatedAt: session.time.updated,
      messageCount:
        pendingSendSessions[session.id] === true
          ? Math.max(ocMessageCounts[session.id] ?? 0, 1)
          : (ocMessageCounts[session.id] ?? 0),
      ...(session.directory ? { workspacePath: session.directory } : {}),
    }));
  }, [activeBackend, claudeConversations, ocMessageCounts, ocSessions, pendingSendSessions]);
}
