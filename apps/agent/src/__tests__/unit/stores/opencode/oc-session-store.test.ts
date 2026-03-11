import { ocConversationRepo } from '@/services/conversations/oc-conversation-repo';
import { useOcSessionStore } from '@/stores/opencode';

let mockStore: Record<string, string> = {};

const localStorageMock: Storage = {
  getItem: vi.fn((key: string) => mockStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStore[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    Reflect.deleteProperty(mockStore, key);
  }),
  clear: vi.fn(() => {
    mockStore = {};
  }),
  key: vi.fn(() => null),
  get length(): number {
    return Object.keys(mockStore).length;
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

function createSession(index: number): {
  id: string;
  slug: string;
  projectID: string;
  directory: string;
  title: string;
  version: string;
  time: { created: number; updated: number };
} {
  return {
    id: `session-${String(index)}`,
    slug: `session-${String(index)}`,
    projectID: 'project-1',
    directory: '/workspace',
    title: `Session ${String(index)}`,
    version: '1',
    time: {
      created: index,
      updated: index,
    },
  };
}

function resetStore(): void {
  useOcSessionStore.setState({
    sessions: {},
    activeSessionId: null,
    sessionStatuses: {},
    sessionErrors: {},
  });
  mockStore = {};
  vi.clearAllMocks();
}

describe('oc-session-store', () => {
  beforeEach(() => {
    resetStore();
  });

  it('prunes active session, statuses, and errors when session list is trimmed', () => {
    const store = useOcSessionStore.getState();
    store.setActiveSessionId('session-0');
    store.setSessionStatus('session-0', { type: 'busy' });
    store.setSessionError('session-0', 'stale');

    store.setSessions(Array.from({ length: 31 }, (_, index) => createSession(index)));

    const state = useOcSessionStore.getState();
    expect(Object.keys(state.sessions)).toHaveLength(30);
    expect(state.sessions['session-0']).toBeUndefined();
    expect(state.activeSessionId).toBeNull();
    expect(state.sessionStatuses['session-0']).toBeUndefined();
    expect(state.sessionErrors['session-0']).toBeUndefined();
  });

  it('restores the persisted active session from the bridge key payload', () => {
    localStorage.setItem(
      'orbit-oc-sessionId',
      JSON.stringify({
        state: {
          activeSessionId: 'session-42',
        },
      })
    );

    expect(ocConversationRepo.restoreActiveSession()).toBe('session-42');
  });
});
