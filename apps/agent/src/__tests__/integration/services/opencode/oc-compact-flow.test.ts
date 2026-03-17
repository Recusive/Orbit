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

function createEvent(payload: unknown): OcGlobalEvent {
  return {
    directory: '/workspace',
    payload,
  } as OcGlobalEvent;
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

function markPendingCompaction(
  sessionId: string,
  messageId: string,
  backend: 'opencode' | 'claude' = 'opencode'
): void {
  useChatStore.getState().markCompacting(sessionId, {
    backend,
    messageId,
    status: 'pending',
  });
}

describe('OpenCode /compact coordinated flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStores();
    vi.restoreAllMocks();
    vi.spyOn(ocSessionService, 'loadMessages').mockResolvedValue([]);
  });

  afterEach(() => {
    resetStores();
    vi.restoreAllMocks();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('removes the pending entry when session.compacted arrives', async () => {
    markPendingCompaction('session-1', 'message-1');

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

    // Flush the .then() microtask so settleCompaction fires after loadMessages
    await act(async () => {
      await Promise.resolve();
    });

    expect(useChatStore.getState().activeCompactions['session-1']).toBeUndefined();
  });

  it('removes a timed_out entry when a late session.compacted arrives', async () => {
    markPendingCompaction('session-1', 'message-1');

    window.setTimeout(() => {
      useChatStore.getState().markCompactionTimedOut('session-1', 'message-1');
    }, 30_000);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(useChatStore.getState().activeCompactions['session-1']).toEqual({
      backend: 'opencode',
      messageId: 'message-1',
      status: 'timed_out',
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

    // Flush the .then() microtask so settleCompaction fires after loadMessages
    await act(async () => {
      await Promise.resolve();
    });

    expect(useChatStore.getState().activeCompactions['session-1']).toBeUndefined();
  });

  it('removes the entry when session.error arrives', () => {
    markPendingCompaction('session-1', 'message-1');

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

  it('removes the entry when session.deleted arrives', () => {
    markPendingCompaction('session-1', 'message-1');
    useOcSessionStore.setState({
      sessions: {
        'session-1': createSession('session-1'),
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
  });

  it('settles only the matching session when multiple sessions are compacting', async () => {
    markPendingCompaction('session-a', 'message-a');
    markPendingCompaction('session-b', 'message-b');

    act(() => {
      ocEventCoordinator.handleGlobalEvent(
        createEvent({
          type: 'session.compacted',
          properties: {
            sessionID: 'session-a',
          },
        })
      );
    });

    // Flush the .then() microtask so settleCompaction fires after loadMessages
    await act(async () => {
      await Promise.resolve();
    });

    expect(useChatStore.getState().activeCompactions).toEqual({
      'session-b': {
        backend: 'opencode',
        messageId: 'message-b',
        status: 'pending',
      },
    });
  });

  it('does not affect a Claude compaction on a different session', async () => {
    markPendingCompaction('claude-session', 'claude-message', 'claude');
    markPendingCompaction('oc-session', 'oc-message');

    act(() => {
      ocEventCoordinator.handleGlobalEvent(
        createEvent({
          type: 'session.compacted',
          properties: {
            sessionID: 'oc-session',
          },
        })
      );
    });

    // Flush the .then() microtask so settleCompaction fires after loadMessages
    await act(async () => {
      await Promise.resolve();
    });

    expect(useChatStore.getState().activeCompactions).toEqual({
      'claude-session': {
        backend: 'claude',
        messageId: 'claude-message',
        status: 'pending',
      },
    });
  });
});
