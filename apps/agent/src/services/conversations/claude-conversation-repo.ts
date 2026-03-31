import type { ConversationRepository, ConversationSummary } from './types';

import {
  handleConversationCreate,
  handleConversationLoad,
} from '@/hooks/agent/handlers/conversation-handlers';
import { conversationDelete, conversationList, conversationUpdateTitle } from '@/lib/api';
import { toConversationSummaries } from '@/lib/mappers/conversations';
import { useUIStore } from '@/stores/ui/ui-store';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const claudeConversationRepo: ConversationRepository = {
  async list(context): Promise<ConversationSummary[]> {
    const conversations = await conversationList(
      context.workspacePath ?? undefined,
      context.worktreePath ?? undefined
    );
    return toConversationSummaries(conversations).map((conversation) => ({
      ...conversation,
      createdAt: conversation.updatedAt,
    }));
  },

  async load(sessionId): Promise<void> {
    await handleConversationLoad({
      type: 'conversation:load',
      uuid: crypto.randomUUID(),
      session_id: sessionId,
    });
  },

  create(input): Promise<ConversationSummary> {
    const state = useUIStore.getState();
    const title = input?.title ?? 'Untitled';
    const sessionId = handleConversationCreate({
      type: 'conversation:create',
      uuid: crypto.randomUUID(),
      title,
      workspace_path: state.workspacePath ?? undefined,
      worktree_path: state.activeWorktreePath ?? undefined,
    });

    return Promise.resolve({
      sessionId,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 0,
      ...(state.workspacePath ? { workspacePath: state.workspacePath } : {}),
      ...(state.activeWorktreePath ? { worktreePath: state.activeWorktreePath } : {}),
    });
  },

  async remove(sessionId): Promise<void> {
    const workspacePath = useUIStore.getState().workspacePath ?? undefined;
    await conversationDelete(sessionId, workspacePath);
  },

  async updateTitle(sessionId, title): Promise<void> {
    const workspacePath = useUIStore.getState().workspacePath ?? undefined;
    await conversationUpdateTitle(sessionId, title, workspacePath);
  },

  getActiveSessionKey(): string {
    return 'orbit-sessionId';
  },

  restoreActiveSession(): string | null {
    return readStorage(this.getActiveSessionKey());
  },
};
