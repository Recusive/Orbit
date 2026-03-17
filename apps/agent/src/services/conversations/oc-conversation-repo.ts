import type { ConversationRepository, ConversationSummary } from '@/types/backend';

import { ocSessionService } from '@/services/opencode';

function readStorage(key: string): string | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as { state?: { activeSessionId?: string | null } };
      return parsed.state?.activeSessionId ?? null;
    } catch {
      return raw;
    }
  } catch {
    return null;
  }
}

function toConversationSummary(
  session: Awaited<ReturnType<typeof ocSessionService.createSession>>
): ConversationSummary {
  return {
    sessionId: session.id,
    title: session.title,
    createdAt: session.time.created,
    updatedAt: session.time.updated,
    messageCount: 0,
    workspacePath: session.directory,
  };
}

export const ocConversationRepo: ConversationRepository = {
  async list(): Promise<ConversationSummary[]> {
    const sessions = await ocSessionService.listSessions();
    return sessions.map(toConversationSummary);
  },

  async load(sessionId): Promise<void> {
    await ocSessionService.loadMessages(sessionId);
  },

  async create(input): Promise<ConversationSummary> {
    const session = await ocSessionService.createSession(input);
    return toConversationSummary(session);
  },

  async remove(sessionId): Promise<void> {
    await ocSessionService.deleteSession(sessionId);
  },

  async updateTitle(sessionId, title): Promise<void> {
    await ocSessionService.updateSessionTitle(sessionId, title);
  },

  getActiveSessionKey(): string {
    return 'orbit-oc-sessionId';
  },

  restoreActiveSession(): string | null {
    return readStorage(this.getActiveSessionKey());
  },
};
