import { act } from '@testing-library/react';

import type { OcGlobalEvent, OcSession } from '@/types/opencode';

import { ocEventCoordinator } from '@/services/opencode/oc-event-coordinator';
import { ocSessionService } from '@/services/opencode/oc-session-service';
import { useChatStore } from '@/stores/chat/chat-store';
import { useOcMessageStore, useOcPermissionStore, useOcSessionStore } from '@/stores/opencode';
import { useUIStore } from '@/stores/ui/ui-store';

function resetStores(): void {
  useChatStore.setState({
    sessions: {},
    activeSessionId: null,
    lastCreatedSessionId: null,
    pendingMessage: null,
    remappedOrbitIds: {},
    rewindEpoch: 0,
    conversationLoadEpoch: 0,
    loadedSessions: {},
    activeCompactions: {},
    lruOrder: [],
  });
  useUIStore.setState(useUIStore.getInitialState(), true);
  useUIStore.setState({ workspacePath: '/workspace' });
  useOcMessageStore.setState({ sessions: {} });
  useOcPermissionStore.setState({ permissions: {}, questions: {} });
  useOcSessionStore.setState({
    sessions: {},
    activeSessionId: null,
    sessionStatuses: {},
    sessionErrors: {},
    pendingSendSessions: {},
  });
}

function createSession(sessionId: string): OcSession {
  return {
    id: sessionId,
    slug: sessionId,
    projectID: 'project-1',
    directory: '/workspace',
    title: `Session ${sessionId}`,
    version: '1',
    time: { created: 1, updated: 1 },
  };
}

function createEvent(payload: unknown): OcGlobalEvent {
  return {
    directory: '/workspace',
    payload,
  } as OcGlobalEvent;
}

describe('ocEventCoordinator compaction settlement', () => {
  beforeEach(() => {
    resetStores();
    vi.restoreAllMocks();
    vi.spyOn(ocSessionService, 'loadMessages').mockResolvedValue([]);
  });

  afterEach(() => {
    resetStores();
    vi.restoreAllMocks();
  });

  it('settles a compaction after reloading messages on session.compacted', async () => {
    useChatStore.getState().markCompacting('session-1', {
      backend: 'opencode',
      messageId: 'message-1',
      status: 'pending',
    });

    const loadMessagesSpy = vi
      .spyOn(ocSessionService, 'loadMessages')
      .mockImplementation((sessionId: string) => {
        // During loadMessages, compaction should still be active (settle happens after)
        expect(useChatStore.getState().activeCompactions[sessionId]).toBeDefined();
        return Promise.resolve([]);
      });

    act(() => {
      ocEventCoordinator.handleGlobalEvent(
        createEvent({
          type: 'session.compacted',
          properties: {
            sessionID: 'session-1',
          },
        })
      );
    });

    // Flush the .then() microtask so settleCompaction fires
    await act(async () => {
      await Promise.resolve();
    });

    expect(useChatStore.getState().activeCompactions['session-1']).toBeUndefined();
    expect(loadMessagesSpy).toHaveBeenCalledWith('session-1');
  });

  it('settles the matching session on session.deleted', () => {
    useChatStore.getState().markCompacting('session-1', {
      backend: 'opencode',
      messageId: 'message-1',
      status: 'pending',
    });
    useChatStore.getState().markCompacting('session-2', {
      backend: 'opencode',
      messageId: 'message-2',
      status: 'pending',
    });
    useOcSessionStore.setState({
      sessions: {
        'session-1': createSession('session-1'),
        'session-2': createSession('session-2'),
      },
      activeSessionId: 'session-1',
      sessionStatuses: {},
      sessionErrors: {},
      pendingSendSessions: {},
    });

    act(() => {
      ocEventCoordinator.handleGlobalEvent(
        createEvent({
          type: 'session.deleted',
          properties: {
            info: createSession('session-1'),
          },
        })
      );
    });

    expect(useChatStore.getState().activeCompactions['session-1']).toBeUndefined();
    expect(useChatStore.getState().activeCompactions['session-2']).toBeDefined();
  });

  it('settles the matching session on session.error', () => {
    useChatStore.getState().markCompacting('session-1', {
      backend: 'opencode',
      messageId: 'message-1',
      status: 'pending',
    });

    act(() => {
      ocEventCoordinator.handleGlobalEvent(
        createEvent({
          type: 'session.error',
          properties: {
            sessionID: 'session-1',
            error: {
              data: { message: 'boom' },
            },
          },
        })
      );
    });

    expect(useChatStore.getState().activeCompactions['session-1']).toBeUndefined();
  });

  it('does not affect other sessions when one compaction settles', async () => {
    useChatStore.getState().markCompacting('session-1', {
      backend: 'opencode',
      messageId: 'message-1',
      status: 'pending',
    });
    useChatStore.getState().markCompacting('session-2', {
      backend: 'opencode',
      messageId: 'message-2',
      status: 'pending',
    });

    act(() => {
      ocEventCoordinator.handleGlobalEvent(
        createEvent({
          type: 'session.compacted',
          properties: {
            sessionID: 'session-1',
          },
        })
      );
    });

    // Flush the .then() microtask so settleCompaction fires
    await act(async () => {
      await Promise.resolve();
    });

    expect(useChatStore.getState().activeCompactions['session-1']).toBeUndefined();
    expect(useChatStore.getState().activeCompactions['session-2']).toEqual({
      backend: 'opencode',
      messageId: 'message-2',
      status: 'pending',
    });
  });
});
