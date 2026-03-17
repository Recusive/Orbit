import type { ocUiBridge as ocUiBridgeType } from '@/services/conversations/oc-ui-bridge';
import type { useOcSessionStore as useOcSessionStoreType } from '@/stores/opencode/oc-session-store';
import type { useUIStore as useUIStoreType } from '@/stores/ui/ui-store';
import type { OcSession } from '@/types/opencode';

const { mockValidateSession, mockLoadMessages, mockRestoreActiveSession, mockToastError } =
  vi.hoisted(() => ({
    mockValidateSession: vi.fn(),
    mockLoadMessages: vi.fn(),
    mockRestoreActiveSession: vi.fn(),
    mockToastError: vi.fn(),
  }));

let mockStorage: Record<string, string> = {};

const localStorageMock: Storage = {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    Reflect.deleteProperty(mockStorage, key);
  }),
  clear: vi.fn(() => {
    mockStorage = {};
  }),
  key: vi.fn(() => null),
  get length(): number {
    return Object.keys(mockStorage).length;
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
  },
}));

vi.mock('@/services/opencode', async () => {
  const actual = await vi.importActual('@/services/opencode');
  return {
    ...actual,
    ocSessionService: {
      ...actual.ocSessionService,
      validateSession: mockValidateSession,
      loadMessages: mockLoadMessages,
    },
  };
});

vi.mock('@/services/conversations/oc-conversation-repo', () => ({
  ocConversationRepo: {
    load: mockLoadMessages,
    restoreActiveSession: mockRestoreActiveSession,
    getActiveSessionKey: () => 'orbit-oc-sessionId',
    list: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    updateTitle: vi.fn(),
  },
}));

interface LoadedModules {
  ocUiBridge: typeof ocUiBridgeType;
  useOcSessionStore: typeof useOcSessionStoreType;
  useUIStore: typeof useUIStoreType;
}

function createSession(sessionId = 'session-1'): OcSession {
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

async function loadModules(): Promise<LoadedModules> {
  const { useOcSessionStore } = await import('@/stores/opencode/oc-session-store');
  const { useUIStore } = await import('@/stores/ui/ui-store');
  const { ocUiBridge } = await import('@/services/conversations/oc-ui-bridge');

  useOcSessionStore.setState({
    sessions: {},
    activeSessionId: null,
    sessionStatuses: {},
    sessionErrors: {},
    pendingSendSessions: {},
  });
  useUIStore.setState(useUIStore.getInitialState(), true);

  return {
    ocUiBridge,
    useOcSessionStore,
    useUIStore,
  };
}

describe('oc-ui-bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    mockValidateSession.mockReset();
    mockLoadMessages.mockReset();
    mockRestoreActiveSession.mockReset();
    mockToastError.mockReset();
    mockStorage = {};
  });

  it('restoreSelection skips validation when the restored session is already in the listed set', async () => {
    const { ocUiBridge, useOcSessionStore } = await loadModules();

    useOcSessionStore.setState((state) => ({
      ...state,
      activeSessionId: 'session-1',
      sessions: {
        'session-1': createSession(),
      },
    }));

    mockRestoreActiveSession.mockReturnValue('session-1');
    mockLoadMessages.mockResolvedValue([]);

    await ocUiBridge.restoreSelection({
      listedSessionIds: new Set<string>(['session-1']),
    });

    expect(mockValidateSession).not.toHaveBeenCalled();
    expect(mockLoadMessages).toHaveBeenCalledWith('session-1');
    expect(useOcSessionStore.getState().activeSessionId).toBe('session-1');
  });

  it('restoreSelection validates and re-adds a restored session that was pruned from the listed set', async () => {
    const { ocUiBridge, useOcSessionStore } = await loadModules();

    mockRestoreActiveSession.mockReturnValue('session-31');
    mockValidateSession.mockResolvedValue(createSession('session-31'));
    mockLoadMessages.mockResolvedValue([]);

    await ocUiBridge.restoreSelection({
      listedSessionIds: new Set<string>(['session-1']),
    });

    expect(mockValidateSession).toHaveBeenCalledWith('session-31');
    expect(mockLoadMessages).toHaveBeenCalledWith('session-31');
    expect(useOcSessionStore.getState().sessions['session-31']).toEqual(
      createSession('session-31')
    );
  });

  it('restoreSelection clears persisted selection when the restored session is confirmed deleted', async () => {
    const { ocUiBridge, useOcSessionStore } = await loadModules();

    mockStorage['orbit-oc-sessionId'] = JSON.stringify({
      state: {
        activeSessionId: 'deleted-session',
      },
    });
    mockRestoreActiveSession.mockReturnValue('deleted-session');
    mockValidateSession.mockResolvedValue(null);

    await ocUiBridge.restoreSelection({
      listedSessionIds: new Set<string>(),
    });

    expect(mockValidateSession).toHaveBeenCalledWith('deleted-session');
    expect(mockLoadMessages).not.toHaveBeenCalled();
    expect(useOcSessionStore.getState().activeSessionId).toBeNull();
    expect(localStorage.getItem('orbit-oc-sessionId')).toBeNull();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('restoreSelection clears the active session and shows a toast after a transient load failure', async () => {
    const { ocUiBridge, useOcSessionStore, useUIStore } = await loadModules();

    useOcSessionStore.setState((state) => ({
      ...state,
      sessions: {
        'session-1': createSession(),
      },
    }));

    mockRestoreActiveSession.mockReturnValue('session-1');
    mockLoadMessages.mockRejectedValue(new Error('temporary failure'));
    mockValidateSession.mockResolvedValue(createSession());

    await expect(
      ocUiBridge.restoreSelection({
        listedSessionIds: new Set<string>(['session-1']),
      })
    ).resolves.toBeUndefined();

    expect(mockValidateSession).toHaveBeenCalledWith('session-1');
    expect(useOcSessionStore.getState().activeSessionId).toBeNull();
    expect(useUIStore.getState().isLoadingConversation).toBe(false);
    expect(useUIStore.getState().isConversationTransitioning).toBe(false);
    expect(mockToastError).toHaveBeenCalledWith('Could not restore your last session');
  });

  it('getActiveMeta normalizes default OC titles and reflects loading state', async () => {
    const { ocUiBridge, useOcSessionStore, useUIStore } = await loadModules();

    useOcSessionStore.setState((state) => ({
      ...state,
      activeSessionId: 'session-1',
      sessions: {
        'session-1': {
          id: 'session-1',
          slug: 'session-1',
          projectID: 'project-1',
          directory: '/workspace',
          title: 'New session - 2026-03-11T10:30:00.000Z',
          version: '1',
          time: { created: 1, updated: 1 },
        },
      },
    }));
    useUIStore.getState().setTitleLoading('session-1', true);

    expect(ocUiBridge.getActiveMeta()).toEqual({
      id: 'session-1',
      title: 'Untitled',
      isTitleLoading: true,
    });
  });
});
