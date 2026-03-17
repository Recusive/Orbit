import { createLogger } from '@orbit/common/lib';
import { toast } from 'sonner';

import { ocConversationRepo } from './oc-conversation-repo';

import type {
  ConversationListContext,
  ConversationUiBridge,
  RestoreSelectionInput,
} from '@/types/backend';

import { ocSessionService } from '@/services/opencode';
import { isDefaultOcTitle } from '@/services/opencode/oc-title-utils';
import { useOcMessageStore, useOcSessionStore } from '@/stores/opencode';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('OcUiBridge');

function clearPersistedOcSelection(): void {
  useOcSessionStore.getState().setActiveSessionId(null);
  try {
    localStorage.removeItem(ocConversationRepo.getActiveSessionKey());
  } catch {
    // ignore storage failures
  }
}

export const ocUiBridge: ConversationUiBridge = {
  getActiveSessionId(): string | null {
    return useOcSessionStore.getState().activeSessionId;
  },

  async select(sessionId): Promise<void> {
    logger.info('Selecting session', { sessionId });
    await loadSelection(sessionId, false);
  },

  async restoreSelection(input?: RestoreSelectionInput): Promise<void> {
    const sessionId = ocConversationRepo.restoreActiveSession();
    if (!sessionId) {
      logger.info('No session to restore');
      return;
    }

    logger.info('Restoring session selection', { sessionId });
    try {
      if (input?.listedSessionIds && !input.listedSessionIds.has(sessionId)) {
        const session = await ocSessionService.validateSession(sessionId);
        if (!session) {
          logger.warn('Restored session not in list and not on server, clearing', { sessionId });
          clearPersistedOcSelection();
          return;
        }

        useOcSessionStore.getState().addSession(session);
      }

      await loadSelection(sessionId, true);
    } catch (error) {
      useUIStore.getState().setLoadingConversation(false);
      useUIStore.getState().setConversationTransitioning(false);

      const validation = await ocSessionService
        .validateSession(sessionId)
        .catch(() => 'unknown' as const);
      if (validation === null) {
        logger.warn('Restored session confirmed deleted, clearing', { sessionId });
        clearPersistedOcSelection();
        return;
      }

      useOcSessionStore.getState().setActiveSessionId(null);
      logger.error('Restore selection failed', error, { sessionId });
      logger.warn('Restore failed (transient), cleared selection', { sessionId });
      toast.error('Could not restore your last session');
    }
  },

  getActiveMeta() {
    const state = useOcSessionStore.getState();
    const activeSession = state.activeSessionId
      ? (state.sessions[state.activeSessionId] ?? null)
      : null;
    const rawTitle = activeSession?.title ?? null;
    const title = rawTitle !== null && isDefaultOcTitle(rawTitle) ? 'Untitled' : rawTitle;
    return {
      id: activeSession?.id ?? null,
      title,
      isTitleLoading:
        activeSession?.id !== undefined
          ? useUIStore.getState().titleLoadingSessions.has(activeSession.id)
          : false,
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
    logger.info('Creating session via UI bridge');
    const created = await ocConversationRepo.create(input);
    useOcSessionStore.getState().setActiveSessionId(created.sessionId);
    useOcMessageStore.getState().clearSession(created.sessionId);
    logger.info('Session created via UI bridge', { sessionId: created.sessionId });
  },

  async rename(sessionId, title): Promise<void> {
    logger.info('Renaming session', { sessionId });
    await ocConversationRepo.updateTitle(sessionId, title);
  },

  async remove(sessionId): Promise<void> {
    logger.info('Removing session', { sessionId });
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

  await ocConversationRepo.load(sessionId);
  // Flags cleared by useLayoutStabilization in OcAgentSurface (same as Claude backend)
}
