import type { ocUiBridge as ocUiBridgeType } from '@/services/conversations/oc-ui-bridge';
import type { useOcSessionStore as useOcSessionStoreType } from '@/stores/opencode/oc-session-store';
import type { useUIStore as useUIStoreType } from '@/stores/ui/ui-store';

const { mockValidateSession, mockLoadMessages, mockRestoreActiveSession } = vi.hoisted(() => ({
  mockValidateSession: vi.fn(),
  mockLoadMessages: vi.fn(),
  mockRestoreActiveSession: vi.fn(),
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

async function loadModules(): Promise<LoadedModules> {
  const { useOcSessionStore } = await import('@/stores/opencode/oc-session-store');
  const { useUIStore } = await import('@/stores/ui/ui-store');
  const { ocUiBridge } = await import('@/services/conversations/oc-ui-bridge');

  useOcSessionStore.setState({
    sessions: {},
    activeSessionId: null,
    sessionStatuses: {},
    sessionErrors: {},
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
  });

  it('restoreSelection force-loads messages even if the restored session is already selected', async () => {
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
          title: 'Session 1',
          version: '1',
          time: { created: 1, updated: 1 },
        },
      },
    }));

    mockRestoreActiveSession.mockReturnValue('session-1');
    mockValidateSession.mockResolvedValue({
      id: 'session-1',
      slug: 'session-1',
      projectID: 'project-1',
      directory: '/workspace',
      title: 'Session 1',
      version: '1',
      time: { created: 1, updated: 1 },
    });
    mockLoadMessages.mockResolvedValue([]);

    await ocUiBridge.restoreSelection();

    expect(mockValidateSession).toHaveBeenCalledWith('session-1');
    expect(mockLoadMessages).toHaveBeenCalledWith('session-1');
    expect(useUIStore.getState().isLoadingConversation).toBe(false);
    expect(useUIStore.getState().isConversationTransitioning).toBe(false);
  });
});
