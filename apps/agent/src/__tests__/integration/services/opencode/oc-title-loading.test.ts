import { act, renderHook } from '@testing-library/react';

import type { OcGlobalEvent, OcMessage, OcPart, OcSession } from '@/types/opencode';

import { useOcChat } from '@/hooks/chat/use-oc-chat';
import { useConversationList } from '@/hooks/sidebar/use-conversation-list';
import { useConversationMeta } from '@/hooks/sidebar/use-conversation-meta';
import { ocUiBridge } from '@/services/conversations/oc-ui-bridge';
import { ocEventCoordinator } from '@/services/opencode/oc-event-coordinator';
import { ocSessionService } from '@/services/opencode/oc-session-service';
import { useBackendStore } from '@/stores/backend';
import { useOcMessageStore, useOcPermissionStore, useOcSessionStore } from '@/stores/opencode';
import { useUIStore } from '@/stores/ui/ui-store';

function resetStores(): void {
  useBackendStore.setState({
    activeBackend: 'claude',
    opencodePort: null,
    opencodeHealthy: false,
    switchingBackend: false,
  });
  useUIStore.setState(useUIStore.getInitialState(), true);
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

function createSession(overrides: Partial<OcSession> = {}): OcSession {
  return {
    id: 'session-1',
    slug: 'session-1',
    projectID: 'project-1',
    directory: '/workspace',
    title: 'New session - 2026-03-11T10:30:00.000Z',
    version: '1',
    time: { created: 1, updated: 1 },
    ...overrides,
  };
}

function createUserMessage(
  overrides: Partial<Extract<OcMessage, { role: 'user' }>> = {}
): OcMessage {
  return {
    id: 'message-1',
    sessionID: 'session-1',
    role: 'user',
    time: { created: 1 },
    agent: 'build',
    model: {
      providerID: 'anthropic',
      modelID: 'claude-sonnet-4-5',
    },
    ...overrides,
  };
}

function createTextPart(overrides: Partial<Extract<OcPart, { type: 'text' }>> = {}): OcPart {
  return {
    id: 'part-1',
    sessionID: 'session-1',
    messageID: 'message-1',
    type: 'text',
    text: 'hello',
    ...overrides,
  };
}

function createEvent(payload: unknown): OcGlobalEvent {
  return {
    directory: '/workspace',
    payload,
  } as OcGlobalEvent;
}

describe('OC title-loading lifecycle', () => {
  beforeEach(() => {
    resetStores();
    useUIStore.setState({ workspacePath: '/workspace' });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts title loading on the first real user message for a root session with a default title', async () => {
    useOcSessionStore.setState({
      sessions: {
        'session-1': createSession(),
      },
      activeSessionId: 'session-1',
      sessionStatuses: {},
      sessionErrors: {},
      pendingSendSessions: {},
    });
    vi.spyOn(ocSessionService, 'sendMessage').mockResolvedValue(undefined);

    const { result } = renderHook(() => useOcChat());

    await act(async () => {
      await result.current.handleSend('hello');
    });

    expect(useUIStore.getState().titleLoadingSessions.has('session-1')).toBe(true);
    expect(useOcSessionStore.getState().pendingSendSessions).toEqual({ 'session-1': true });
  });

  it('starts title loading when prior user history is synthetic-only', async () => {
    useOcSessionStore.setState({
      sessions: {
        'session-1': createSession(),
      },
      activeSessionId: 'session-1',
      sessionStatuses: {},
      sessionErrors: {},
      pendingSendSessions: {},
    });
    useOcMessageStore.setState({
      sessions: {
        'session-1': {
          messagesById: {
            'message-1': createUserMessage(),
          },
          messageOrder: ['message-1'],
          partsByMessage: {
            'message-1': [createTextPart({ text: 'synthetic', synthetic: true })],
          },
          partsById: {
            'part-1': createTextPart({ text: 'synthetic', synthetic: true }),
          },
          deltaBufferByPart: {},
        },
      },
    });
    vi.spyOn(ocSessionService, 'sendMessage').mockResolvedValue(undefined);

    const { result } = renderHook(() => useOcChat());

    await act(async () => {
      await result.current.handleSend('hello');
    });

    expect(useUIStore.getState().titleLoadingSessions.has('session-1')).toBe(true);
  });

  it('does not start title loading for child sessions', async () => {
    useOcSessionStore.setState({
      sessions: {
        'session-1': createSession({ parentID: 'parent-1' }),
      },
      activeSessionId: 'session-1',
      sessionStatuses: {},
      sessionErrors: {},
      pendingSendSessions: {},
    });
    vi.spyOn(ocSessionService, 'sendMessage').mockResolvedValue(undefined);

    const { result } = renderHook(() => useOcChat());

    await act(async () => {
      await result.current.handleSend('hello');
    });

    expect(useUIStore.getState().titleLoadingSessions.has('session-1')).toBe(false);
    expect(useOcSessionStore.getState().pendingSendSessions).toEqual({ 'session-1': true });
  });

  it('does not start title loading when the session already has a real title', async () => {
    useOcSessionStore.setState({
      sessions: {
        'session-1': createSession({ title: 'Refactor auth middleware' }),
      },
      activeSessionId: 'session-1',
      sessionStatuses: {},
      sessionErrors: {},
      pendingSendSessions: {},
    });
    vi.spyOn(ocSessionService, 'sendMessage').mockResolvedValue(undefined);

    const { result } = renderHook(() => useOcChat());

    await act(async () => {
      await result.current.handleSend('hello');
    });

    expect(useUIStore.getState().titleLoadingSessions.has('session-1')).toBe(false);
  });

  it('does not start title loading after a real user message already exists', async () => {
    useOcSessionStore.setState({
      sessions: {
        'session-1': createSession(),
      },
      activeSessionId: 'session-1',
      sessionStatuses: {},
      sessionErrors: {},
      pendingSendSessions: {},
    });
    useOcMessageStore.setState({
      sessions: {
        'session-1': {
          messagesById: {
            'message-1': createUserMessage(),
          },
          messageOrder: ['message-1'],
          partsByMessage: {
            'message-1': [createTextPart()],
          },
          partsById: {
            'part-1': createTextPart(),
          },
          deltaBufferByPart: {},
        },
      },
    });
    vi.spyOn(ocSessionService, 'sendMessage').mockResolvedValue(undefined);

    const { result } = renderHook(() => useOcChat());

    await act(async () => {
      await result.current.handleSend('hello');
    });

    expect(useUIStore.getState().titleLoadingSessions.has('session-1')).toBe(false);
  });

  it('clears title loading and pending-send when sendMessage fails', async () => {
    useOcSessionStore.setState({
      sessions: {
        'session-1': createSession(),
      },
      activeSessionId: 'session-1',
      sessionStatuses: {},
      sessionErrors: {},
      pendingSendSessions: {},
    });
    vi.spyOn(ocSessionService, 'sendMessage').mockRejectedValue(new Error('send failed'));

    const { result } = renderHook(() => useOcChat());

    await act(async () => {
      await expect(result.current.handleSend('hello')).rejects.toThrow('send failed');
    });

    expect(useUIStore.getState().titleLoadingSessions.has('session-1')).toBe(false);
    expect(useOcSessionStore.getState().pendingSendSessions).toEqual({});
  });

  it('clears title loading after the safety timeout', async () => {
    vi.useFakeTimers();
    useOcSessionStore.setState({
      sessions: {
        'session-1': createSession(),
      },
      activeSessionId: 'session-1',
      sessionStatuses: {},
      sessionErrors: {},
      pendingSendSessions: {},
    });
    vi.spyOn(ocSessionService, 'sendMessage').mockResolvedValue(undefined);

    const { result } = renderHook(() => useOcChat());

    await act(async () => {
      await result.current.handleSend('hello');
    });

    expect(useUIStore.getState().titleLoadingSessions.has('session-1')).toBe(true);

    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    expect(useUIStore.getState().titleLoadingSessions.has('session-1')).toBe(false);
  });

  it('clears title loading on session.updated with a real title', () => {
    useOcSessionStore.setState({
      sessions: {
        'session-1': createSession(),
      },
      activeSessionId: 'session-1',
      sessionStatuses: {},
      sessionErrors: {},
      pendingSendSessions: {},
    });
    useUIStore.getState().setTitleLoading('session-1', true);

    act(() => {
      ocEventCoordinator.handleGlobalEvent(
        createEvent({
          type: 'session.updated',
          properties: {
            info: createSession({
              title: 'Refactor auth middleware',
              time: { created: 1, updated: 2 },
            }),
          },
        })
      );
    });

    expect(useUIStore.getState().titleLoadingSessions.has('session-1')).toBe(false);
    expect(useOcSessionStore.getState().sessions['session-1']?.title).toBe(
      'Refactor auth middleware'
    );
  });

  it('marks pending send optimistically and clears it on message.updated', () => {
    useOcSessionStore.setState({
      sessions: {
        'session-1': createSession(),
      },
      activeSessionId: 'session-1',
      sessionStatuses: {},
      sessionErrors: {},
      pendingSendSessions: { 'session-1': true },
    });

    act(() => {
      ocEventCoordinator.handleGlobalEvent(
        createEvent({
          type: 'message.updated',
          properties: {
            info: createUserMessage({ id: 'message-2', time: { created: 2 } }),
          },
        })
      );
    });

    expect(useOcSessionStore.getState().pendingSendSessions).toEqual({});
    expect(useOcMessageStore.getState().sessions['session-1']?.messageOrder).toEqual(['message-2']);
  });

  it('clears title loading and pending send on session.error', () => {
    useOcSessionStore.setState({
      sessions: {
        'session-1': createSession(),
      },
      activeSessionId: 'session-1',
      sessionStatuses: {},
      sessionErrors: {},
      pendingSendSessions: { 'session-1': true },
    });
    useUIStore.getState().setTitleLoading('session-1', true);

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

    expect(useUIStore.getState().titleLoadingSessions.has('session-1')).toBe(false);
    expect(useOcSessionStore.getState().pendingSendSessions).toEqual({});
    expect(useOcSessionStore.getState().sessionErrors['session-1']).toBe('{"message":"boom"}');
  });

  it('clears title loading and pending send on session.deleted', () => {
    useOcSessionStore.setState({
      sessions: {
        'session-1': createSession(),
      },
      activeSessionId: 'session-1',
      sessionStatuses: {},
      sessionErrors: {},
      pendingSendSessions: { 'session-1': true },
    });
    useUIStore.getState().setTitleLoading('session-1', true);

    act(() => {
      ocEventCoordinator.handleGlobalEvent(
        createEvent({
          type: 'session.deleted',
          properties: {
            info: createSession(),
          },
        })
      );
    });

    expect(useOcSessionStore.getState().sessions['session-1']).toBeUndefined();
    expect(useUIStore.getState().titleLoadingSessions.has('session-1')).toBe(false);
    expect(useOcSessionStore.getState().pendingSendSessions).toEqual({});
  });

  it('maps default OC titles to Untitled and treats pending sends as non-empty in the sidebar list', () => {
    useBackendStore.setState({ activeBackend: 'opencode' });
    useOcSessionStore.setState({
      sessions: {
        'session-1': createSession(),
      },
      activeSessionId: 'session-1',
      sessionStatuses: {},
      sessionErrors: {},
      pendingSendSessions: { 'session-1': true },
    });

    const { result } = renderHook(() => useConversationList());

    expect(result.current).toEqual([
      expect.objectContaining({
        sessionId: 'session-1',
        title: 'Untitled',
        messageCount: 1,
      }),
    ]);
  });

  it('maps default OC titles to Untitled and exposes title loading in active conversation meta', () => {
    useBackendStore.setState({ activeBackend: 'opencode' });
    useOcSessionStore.setState({
      sessions: {
        'session-1': createSession(),
      },
      activeSessionId: 'session-1',
      sessionStatuses: {},
      sessionErrors: {},
      pendingSendSessions: {},
    });
    useUIStore.getState().setTitleLoading('session-1', true);

    const { result } = renderHook(() => useConversationMeta());

    expect(result.current).toEqual({
      activeSessionId: 'session-1',
      title: 'Untitled',
      isTitleLoading: true,
    });
  });

  it('normalizes default OC titles in ocUiBridge.getActiveMeta()', () => {
    useOcSessionStore.setState({
      sessions: {
        'session-1': createSession(),
      },
      activeSessionId: 'session-1',
      sessionStatuses: {},
      sessionErrors: {},
      pendingSendSessions: {},
    });
    useUIStore.getState().setTitleLoading('session-1', true);

    expect(ocUiBridge.getActiveMeta()).toEqual({
      id: 'session-1',
      title: 'Untitled',
      isTitleLoading: true,
    });
  });
});
