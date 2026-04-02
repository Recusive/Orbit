import { claudeUiBridge } from '@/services/conversations/claude-ui-bridge';
import { useMessageBufferStore } from '@/stores/agent/message-buffer-store';
import { useChatStore } from '@/stores/chat/chat-store';
import { useFileStore } from '@/stores/file/file-store';
import { useUIStore } from '@/stores/ui/ui-store';

const { mockLoad } = vi.hoisted(() => ({
  mockLoad: vi.fn<(sessionId: string) => Promise<void>>(),
}));

vi.mock('@/services/conversations/claude-conversation-repo', () => ({
  claudeConversationRepo: {
    load: mockLoad,
    restoreActiveSession: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    updateTitle: vi.fn(),
  },
}));

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
  useFileStore.setState(useFileStore.getInitialState(), true);
  useMessageBufferStore.setState(useMessageBufferStore.getInitialState(), true);
}

describe('claudeUiBridge.select', () => {
  beforeEach(() => {
    resetStores();
    mockLoad.mockReset();
    mockLoad.mockResolvedValue(undefined);
  });

  afterEach(() => {
    resetStores();
    mockLoad.mockReset();
  });

  it('uses the cached session path for hydrated sessions', async () => {
    const sessionId = 'cached-session';
    const chatStore = useChatStore.getState();
    chatStore.getOrCreateSession(sessionId);
    chatStore.markSessionHydrated(sessionId);

    useUIStore.setState({
      conversations: [
        {
          sessionId,
          title: 'Cached Title',
          updatedAt: 1,
          messageCount: 2,
        },
      ],
      activeConversationId: 'old-session',
      activeConversationTitle: 'Old Title',
      isLoadingConversation: true,
      isConversationTransitioning: true,
    });

    await claudeUiBridge.select(sessionId);

    expect(mockLoad).toHaveBeenCalledWith(sessionId);
    expect(useChatStore.getState().activeSessionId).toBe(sessionId);
    expect(useChatStore.getState().sessions[sessionId]?.scrollIntent).toBe('session-restore');
    expect(useUIStore.getState().activeConversationId).toBe(sessionId);
    expect(useUIStore.getState().activeConversationTitle).toBe('Cached Title');
    expect(useUIStore.getState().isLoadingConversation).toBe(false);
    expect(useUIStore.getState().isConversationTransitioning).toBe(false);
    expect(useFileStore.getState().currentSessionId).toBe(sessionId);
    expect(useMessageBufferStore.getState().hasLoadPending(sessionId)).toBe(true);
  });

  it('uses the uncached session path for unloaded sessions', async () => {
    const sessionId = 'unloaded-session';

    useUIStore.setState({
      conversations: [
        {
          sessionId,
          title: 'Fresh Title',
          updatedAt: 1,
          messageCount: 0,
        },
      ],
      activeConversationId: 'old-session',
      activeConversationTitle: 'Old Title',
      isLoadingConversation: false,
      isConversationTransitioning: false,
    });

    await claudeUiBridge.select(sessionId);

    expect(mockLoad).toHaveBeenCalledWith(sessionId);
    expect(useChatStore.getState().activeSessionId).toBe(sessionId);
    expect(useChatStore.getState().sessions[sessionId]?.hydrationState).toBe('unloaded');
    expect(useChatStore.getState().sessions[sessionId]?.scrollIntent).toBeNull();
    expect(useUIStore.getState().activeConversationId).toBe(sessionId);
    expect(useUIStore.getState().activeConversationTitle).toBe('Fresh Title');
    expect(useUIStore.getState().isLoadingConversation).toBe(true);
    expect(useUIStore.getState().isConversationTransitioning).toBe(true);
    expect(useFileStore.getState().currentSessionId).toBe(sessionId);
    expect(useMessageBufferStore.getState().hasLoadPending(sessionId)).toBe(true);
  });
});
