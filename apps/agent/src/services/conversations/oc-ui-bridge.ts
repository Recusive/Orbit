import { ocConversationRepo } from './oc-conversation-repo';

import type { ConversationListContext, ConversationUiBridge } from '@/types/backend';

import { ocSessionService } from '@/services/opencode';
import { useOcMessageStore, useOcSessionStore } from '@/stores/opencode';
import { useUIStore } from '@/stores/ui/ui-store';

export const ocUiBridge: ConversationUiBridge = {
  getActiveSessionId(): string | null {
    return useOcSessionStore.getState().activeSessionId;
  },

  async select(sessionId): Promise<void> {
    await loadSelection(sessionId, false);
  },

  async restoreSelection(): Promise<void> {
    const sessionId = ocConversationRepo.restoreActiveSession();
    if (!sessionId) {
      return;
    }

    try {
      const session = await ocSessionService.validateSession(sessionId);
      if (!session) {
        useOcSessionStore.getState().setActiveSessionId(null);
        try {
          localStorage.removeItem(ocConversationRepo.getActiveSessionKey());
        } catch {
          // ignore storage failures
        }
        return;
      }

      await loadSelection(sessionId, true);
    } catch {
      useOcSessionStore.getState().setActiveSessionId(null);
    }
  },

  getActiveMeta() {
    const state = useOcSessionStore.getState();
    const activeSession = state.activeSessionId
      ? (state.sessions[state.activeSessionId] ?? null)
      : null;
    return {
      id: activeSession?.id ?? null,
      title: activeSession?.title ?? null,
      isTitleLoading: false,
    };
  },

  list() {
    return Object.values(useOcSessionStore.getState().sessions)
      .sort((left, right) => right.time.updated - left.time.updated)
      .map((session) => ({
        sessionId: session.id,
        title: session.title,
        createdAt: session.time.created,
        updatedAt: session.time.updated,
        messageCount: 0,
        ...(session.directory ? { workspacePath: session.directory } : {}),
      }));
  },

  async create(input): Promise<void> {
    const created = await ocConversationRepo.create(input);
    useOcSessionStore.getState().setActiveSessionId(created.sessionId);
    useOcMessageStore.getState().clearSession(created.sessionId);
  },

  async rename(sessionId, title): Promise<void> {
    await ocConversationRepo.updateTitle(sessionId, title);
  },

  async remove(sessionId): Promise<void> {
    await ocConversationRepo.remove(sessionId);
    useOcMessageStore.getState().clearSession(sessionId);
  },

  async hydrateWorkspace(_context: ConversationListContext): Promise<void> {
    try {
      await ocConversationRepo.list(_context);
    } catch {
      // The lifecycle hook will populate OpenCode sessions once the sidecar is ready.
    }
  },
};

async function loadSelection(sessionId: string, forceLoad: boolean): Promise<void> {
  if (!forceLoad && sessionId === useOcSessionStore.getState().activeSessionId) {
    return;
  }

  useUIStore.getState().setLoadingConversation(true);
  useUIStore.getState().setConversationTransitioning(true);
  useOcSessionStore.getState().setActiveSessionId(sessionId);

  try {
    await ocConversationRepo.load(sessionId);
  } finally {
    useUIStore.getState().setLoadingConversation(false);
    useUIStore.getState().setConversationTransitioning(false);
  }
}
