const {
  mockApplyManualSessionTitle,
  mockGetConversationGeneration,
  mockGetFreshConversationDetail,
  mockGetQueryState,
  mockGetWorkspaceEpoch,
  mockLoad,
  mockLoadConversationDetailFresh,
  mockMarkConversationTitleDirty,
  mockRepoRemove,
  mockRepoUpdateTitle,
  mockRemoveConversationCache,
} = vi.hoisted(() => ({
  mockApplyManualSessionTitle: vi.fn<(sessionId: string, title: string) => Promise<void>>(),
  mockGetConversationGeneration: vi.fn<(sessionId: string) => number>(),
  mockGetFreshConversationDetail: vi.fn<(sessionId: string) => unknown>(),
  mockGetQueryState: vi.fn<(queryKey: readonly unknown[]) => unknown>(),
  mockGetWorkspaceEpoch: vi.fn<[], number>(),
  mockLoad: vi.fn<(sessionId: string) => Promise<void>>(),
  mockLoadConversationDetailFresh: vi.fn<(sessionId: string) => Promise<unknown>>(),
  mockMarkConversationTitleDirty: vi.fn<(sessionId: string) => void>(),
  mockRepoRemove: vi.fn<(sessionId: string) => Promise<void>>(),
  mockRepoUpdateTitle: vi.fn<(sessionId: string, title: string) => Promise<void>>(),
  mockRemoveConversationCache: vi.fn<(sessionId: string) => Promise<void>>(),
}));

vi.mock('@/services/conversations/claude-conversation-repo', () => ({
  claudeConversationRepo: {
    load: mockLoad,
    restoreActiveSession: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    remove: mockRepoRemove,
    updateTitle: mockRepoUpdateTitle,
  },
}));

vi.mock('@/services/session', () => ({
  applyManualSessionTitle: mockApplyManualSessionTitle,
}));

vi.mock('@/lib/query/conversation-detail', () => ({
  getFreshConversationDetail: mockGetFreshConversationDetail,
  loadConversationDetailFresh: mockLoadConversationDetailFresh,
}));

vi.mock('@/lib/query/conversation-detail-cache', () => ({
  getConversationGeneration: mockGetConversationGeneration,
  getWorkspaceEpoch: mockGetWorkspaceEpoch,
  markConversationTitleDirty: mockMarkConversationTitleDirty,
  removeConversationCache: mockRemoveConversationCache,
}));

vi.mock('@/lib/query/query-client', () => ({
  queryClient: {
    getQueryState: mockGetQueryState,
  },
}));

vi.mock('@/lib/query/query-keys', () => ({
  queryKeys: {
    conversations: {
      detail: (sessionId: string) => ['conversations', 'detail', sessionId] as const,
    },
  },
}));

import { claudeUiBridge } from '@/services/conversations/claude-ui-bridge';
import { useMessageBufferStore } from '@/stores/agent/message-buffer-store';
import { useChatStore } from '@/stores/chat/chat-store';
import {
  buildSessionReadinessSignature,
  buildSessionSettledSignature,
  useSessionSwitchStore,
} from '@/stores/chat/session-switch-store';
import { useFileStore } from '@/stores/file/file-store';
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
  useSessionSwitchStore.setState(useSessionSwitchStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  useFileStore.setState(useFileStore.getInitialState(), true);
  useMessageBufferStore.setState(useMessageBufferStore.getInitialState(), true);
  document.body.innerHTML = '';
}

function mountReadySessionInstance(sessionId: string): void {
  const instance = document.createElement('div');
  instance.setAttribute('data-session-instance', sessionId);
  instance.setAttribute('data-instance-generation', '1');
  instance.setAttribute('data-instance-visible', 'true');
  instance.setAttribute('data-tail-proof-version', '1');

  const scroller = document.createElement('div');
  scroller.setAttribute('data-testid', 'virtuoso-scroller');
  Object.defineProperty(scroller, 'scrollHeight', {
    configurable: true,
    value: 1200,
  });
  Object.defineProperty(scroller, 'clientHeight', {
    configurable: true,
    value: 800,
  });
  Object.defineProperty(scroller, 'scrollTop', {
    configurable: true,
    writable: true,
    value: 400,
  });

  instance.appendChild(scroller);
  document.body.appendChild(instance);
}

describe('claudeUiBridge.select', () => {
  beforeEach(() => {
    resetStores();
    mockApplyManualSessionTitle.mockReset();
    mockApplyManualSessionTitle.mockResolvedValue(undefined);
    mockGetConversationGeneration.mockReset();
    mockGetConversationGeneration.mockReturnValue(0);
    mockGetFreshConversationDetail.mockReset();
    mockGetFreshConversationDetail.mockReturnValue(null);
    mockGetQueryState.mockReset();
    mockGetQueryState.mockReturnValue(undefined);
    mockGetWorkspaceEpoch.mockReset();
    mockGetWorkspaceEpoch.mockReturnValue(0);
    mockLoad.mockReset();
    mockLoad.mockResolvedValue(undefined);
    mockLoadConversationDetailFresh.mockReset();
    mockMarkConversationTitleDirty.mockReset();
    mockRepoRemove.mockReset();
    mockRepoRemove.mockResolvedValue(undefined);
    mockRepoUpdateTitle.mockReset();
    mockRepoUpdateTitle.mockResolvedValue(undefined);
    mockRemoveConversationCache.mockReset();
    mockRemoveConversationCache.mockResolvedValue(undefined);
  });

  afterEach(() => {
    resetStores();
    mockApplyManualSessionTitle.mockReset();
    mockGetConversationGeneration.mockReset();
    mockGetFreshConversationDetail.mockReset();
    mockGetQueryState.mockReset();
    mockGetWorkspaceEpoch.mockReset();
    mockLoad.mockReset();
    mockLoadConversationDetailFresh.mockReset();
    mockMarkConversationTitleDirty.mockReset();
    mockRepoRemove.mockReset();
    mockRepoUpdateTitle.mockReset();
    mockRemoveConversationCache.mockReset();
  });

  it('uses the cached session path for hydrated sessions', async () => {
    const sessionId = 'cached-session';
    const chatStore = useChatStore.getState();
    chatStore.getOrCreateSession(sessionId);
    chatStore.setMessages(
      sessionId,
      [{ id: 'message-1', role: 'assistant', content: 'ready', displayedContent: 'ready' }],
      null
    );
    chatStore.markSessionHydrated(sessionId);
    useSessionSwitchStore.getState().setReadyInstance(sessionId, {
      phase: 'visible',
      requestId: 0,
      signature: buildSessionReadinessSignature(useChatStore.getState().sessions[sessionId]) ?? '',
      settledSignature:
        buildSessionSettledSignature(useChatStore.getState().sessions[sessionId]) ?? '',
      tailProofVersion: 1,
      instanceGeneration: 1,
    });
    mountReadySessionInstance(sessionId);

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

    expect(mockLoad).not.toHaveBeenCalled();
    expect(useChatStore.getState().activeSessionId).toBe(sessionId);
    expect(useUIStore.getState().activeConversationId).toBe(sessionId);
    expect(useUIStore.getState().activeConversationTitle).toBe('Cached Title');
    expect(useUIStore.getState().isLoadingConversation).toBe(false);
    expect(useUIStore.getState().isConversationTransitioning).toBe(false);
    expect(useFileStore.getState().currentSessionId).toBe(sessionId);
    expect(useSessionSwitchStore.getState().pending).toBeNull();
  });

  it('rejects instant reveal when the settled proof no longer matches the live session', async () => {
    const sessionId = 'stale-ready-session';
    const chatStore = useChatStore.getState();
    chatStore.getOrCreateSession(sessionId);
    chatStore.setMessages(
      sessionId,
      [{ id: 'message-1', role: 'assistant', content: 'ready', displayedContent: 'ready' }],
      null
    );
    chatStore.markSessionHydrated(sessionId);

    const staleSignature = buildSessionReadinessSignature(
      useChatStore.getState().sessions[sessionId]
    );
    const staleSettledSignature = buildSessionSettledSignature(
      useChatStore.getState().sessions[sessionId]
    );
    chatStore.markLayoutSettled(sessionId);

    useSessionSwitchStore.getState().setReadyInstance(sessionId, {
      phase: 'visible',
      requestId: 0,
      signature: staleSignature ?? '',
      settledSignature: staleSettledSignature ?? '',
      tailProofVersion: 1,
      instanceGeneration: 1,
    });
    mountReadySessionInstance(sessionId);

    useUIStore.setState({
      conversations: [
        {
          sessionId,
          title: 'Cached Title',
          updatedAt: 1,
          messageCount: 1,
        },
      ],
      activeConversationId: 'old-session',
      activeConversationTitle: 'Old Title',
      isLoadingConversation: false,
      isConversationTransitioning: false,
    });

    await claudeUiBridge.select(sessionId);

    expect(useChatStore.getState().activeSessionId).toBeNull();
    expect(useUIStore.getState().activeConversationId).toBe('old-session');
    expect(useSessionSwitchStore.getState().pending?.sessionId).toBe(sessionId);
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

    expect(mockLoad).not.toHaveBeenCalled();
    expect(useChatStore.getState().activeSessionId).toBeNull();
    expect(useUIStore.getState().activeConversationId).toBe('old-session');
    expect(useUIStore.getState().activeConversationTitle).toBe('Old Title');
    expect(useUIStore.getState().isLoadingConversation).toBe(true);
    expect(useUIStore.getState().isConversationTransitioning).toBe(true);
    expect(useSessionSwitchStore.getState().pending?.sessionId).toBe(sessionId);
    expect(useSessionSwitchStore.getState().pending?.loadStrategy).toBe('slow');
  });

  it('coalesces repeated selects for the same pending target instead of restarting the switch', async () => {
    const sessionId = 'pending-session';

    useSessionSwitchStore.setState({
      requestId: 7,
      status: 'hidden-priming',
      pending: {
        sessionId,
        title: 'Pending Title',
        sourceSessionId: 'shown-session',
        loadStrategy: 'query',
        conversationGeneration: 0,
        workspaceEpoch: 0,
      },
    });
    useUIStore.setState({
      activeConversationId: 'shown-session',
      activeConversationTitle: 'Shown Title',
      isLoadingConversation: true,
      isConversationTransitioning: true,
    });

    await claudeUiBridge.select(sessionId);

    expect(mockLoad).not.toHaveBeenCalled();
    expect(mockLoadConversationDetailFresh).not.toHaveBeenCalled();
    expect(useSessionSwitchStore.getState().requestId).toBe(7);
    expect(useSessionSwitchStore.getState().pending?.sessionId).toBe(sessionId);
    expect(useUIStore.getState().isLoadingConversation).toBe(true);
    expect(useUIStore.getState().isConversationTransitioning).toBe(true);
  });

  it('cancels a pending switch when selecting the currently shown session', async () => {
    useSessionSwitchStore.setState({
      requestId: 9,
      status: 'hidden-priming',
      pending: {
        sessionId: 'pending-session',
        title: 'Pending Title',
        sourceSessionId: 'shown-session',
        loadStrategy: 'query',
        conversationGeneration: 0,
        workspaceEpoch: 0,
      },
    });
    useUIStore.setState({
      activeConversationId: 'shown-session',
      activeConversationTitle: 'Shown Title',
      isLoadingConversation: true,
      isConversationTransitioning: true,
    });

    await claudeUiBridge.select('shown-session');

    expect(useSessionSwitchStore.getState().pending).toBeNull();
    expect(useUIStore.getState().isLoadingConversation).toBe(false);
    expect(useUIStore.getState().isConversationTransitioning).toBe(false);
  });

  it('hydrates directly from a fresh cached conversation', async () => {
    const sessionId = 'fresh-cache-session';
    mockGetFreshConversationDetail.mockReturnValue({
      kind: 'data',
      conversation: {
        sessionId,
        title: 'Cached Detail',
        createdAt: 1,
        updatedAt: 1,
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'hello',
            createdAt: 1,
            parentUuid: null,
          },
          {
            id: 'assistant-1',
            role: 'assistant',
            content: 'world',
            createdAt: 2,
            parentUuid: 'user-1',
          },
        ],
      },
    });

    useUIStore.setState({
      conversations: [
        {
          sessionId,
          title: 'Sidebar Title',
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

    expect(mockLoad).not.toHaveBeenCalled();
    expect(useChatStore.getState().sessions[sessionId]?.messages).toHaveLength(2);
    expect(useChatStore.getState().sessions[sessionId]?.hydrationState).toBe('hydrated');
    expect(useUIStore.getState().activeConversationTitle).toBe('Old Title');
    expect(useUIStore.getState().isLoadingConversation).toBe(true);
    expect(useUIStore.getState().isConversationTransitioning).toBe(true);
    expect(useSessionSwitchStore.getState().pending?.sessionId).toBe(sessionId);
  });

  it('hydrates direct empty state from a fresh cached empty conversation', async () => {
    const sessionId = 'empty-cache-session';
    mockGetFreshConversationDetail.mockReturnValue({
      kind: 'empty',
      conversation: {
        sessionId,
        title: 'Empty Session',
        createdAt: 1,
        updatedAt: 1,
        messages: [],
      },
    });

    useUIStore.setState({
      conversations: [
        {
          sessionId,
          title: 'Empty Sidebar Title',
          updatedAt: 1,
          messageCount: 0,
        },
      ],
      activeConversationId: 'old-session',
      activeConversationTitle: 'Old Title',
    });

    await claudeUiBridge.select(sessionId);

    expect(mockLoad).not.toHaveBeenCalled();
    expect(useChatStore.getState().sessions[sessionId]?.messages).toEqual([]);
    expect(useChatStore.getState().sessions[sessionId]?.hydrationState).toBe('hydrated');
    expect(useUIStore.getState().isLoadingConversation).toBe(true);
    expect(useUIStore.getState().isConversationTransitioning).toBe(true);
    expect(useSessionSwitchStore.getState().pending?.sessionId).toBe(sessionId);
  });

  it('joins an in-flight prefetch instead of triggering the slow path load', async () => {
    const sessionId = 'join-session';
    mockGetQueryState.mockReturnValue({ fetchStatus: 'fetching' });
    mockLoadConversationDetailFresh.mockResolvedValue({
      kind: 'data',
      conversation: {
        sessionId,
        title: 'Joined Detail',
        createdAt: 1,
        updatedAt: 1,
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'hello',
            createdAt: 1,
            parentUuid: null,
          },
        ],
      },
    });

    useUIStore.setState({
      conversations: [
        {
          sessionId,
          title: 'Joined Sidebar Title',
          updatedAt: 1,
          messageCount: 1,
        },
      ],
      activeConversationId: 'old-session',
      activeConversationTitle: 'Old Title',
    });

    await claudeUiBridge.select(sessionId);

    expect(mockLoadConversationDetailFresh).toHaveBeenCalledWith(sessionId);
    expect(mockLoad).not.toHaveBeenCalled();
    expect(useChatStore.getState().sessions[sessionId]?.messages).toHaveLength(1);
    expect(useUIStore.getState().isLoadingConversation).toBe(true);
    expect(useMessageBufferStore.getState().hasLoadPending(sessionId)).toBe(false);
    expect(useSessionSwitchStore.getState().pending?.sessionId).toBe(sessionId);
    expect(useSessionSwitchStore.getState().pending?.loadStrategy).toBe('query');
  });

  it('aborts an in-flight join when conversation generation changes during await', async () => {
    const sessionId = 'stale-generation-session';
    mockGetQueryState.mockReturnValue({ fetchStatus: 'fetching' });
    mockGetConversationGeneration.mockReturnValueOnce(0).mockReturnValueOnce(1);
    mockLoadConversationDetailFresh.mockResolvedValue({
      kind: 'data',
      conversation: {
        sessionId,
        title: 'Joined Detail',
        createdAt: 1,
        updatedAt: 1,
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'hello',
            createdAt: 1,
            parentUuid: null,
          },
        ],
      },
    });

    useUIStore.setState({
      conversations: [
        {
          sessionId,
          title: 'Joined Sidebar Title',
          updatedAt: 1,
          messageCount: 1,
        },
      ],
      activeConversationId: 'old-session',
      activeConversationTitle: 'Old Title',
    });

    await claudeUiBridge.select(sessionId);

    expect(mockLoad).not.toHaveBeenCalled();
    expect(useUIStore.getState().isLoadingConversation).toBe(false);
    expect(useUIStore.getState().isConversationTransitioning).toBe(false);
    expect(useMessageBufferStore.getState().hasLoadPending(sessionId)).toBe(false);
    expect(useSessionSwitchStore.getState().pending).toBeNull();
    expect(useChatStore.getState().sessions[sessionId]).toBeUndefined();
  });

  it('aborts an in-flight join when workspace epoch changes during await', async () => {
    const sessionId = 'stale-epoch-session';
    mockGetQueryState.mockReturnValue({ fetchStatus: 'fetching' });
    mockGetWorkspaceEpoch.mockReturnValueOnce(0).mockReturnValueOnce(1);
    mockLoadConversationDetailFresh.mockResolvedValue({
      kind: 'data',
      conversation: {
        sessionId,
        title: 'Joined Detail',
        createdAt: 1,
        updatedAt: 1,
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'hello',
            createdAt: 1,
            parentUuid: null,
          },
        ],
      },
    });

    useUIStore.setState({
      conversations: [
        {
          sessionId,
          title: 'Joined Sidebar Title',
          updatedAt: 1,
          messageCount: 1,
        },
      ],
      activeConversationId: 'old-session',
      activeConversationTitle: 'Old Title',
    });

    await claudeUiBridge.select(sessionId);

    expect(mockLoad).not.toHaveBeenCalled();
    expect(useUIStore.getState().isLoadingConversation).toBe(false);
    expect(useUIStore.getState().isConversationTransitioning).toBe(false);
    expect(useMessageBufferStore.getState().hasLoadPending(sessionId)).toBe(false);
    expect(useSessionSwitchStore.getState().pending).toBeNull();
    expect(useChatStore.getState().sessions[sessionId]).toBeUndefined();
  });

  it('removes query cache before deleting a conversation', async () => {
    const sessionId = 'delete-session';

    await claudeUiBridge.remove(sessionId);

    expect(mockRemoveConversationCache).toHaveBeenCalledWith(sessionId);
    expect(mockRepoRemove).toHaveBeenCalledWith(sessionId);
  });

  it('marks the title cache dirty after a successful rename', async () => {
    const sessionId = 'rename-session';

    await claudeUiBridge.rename(sessionId, 'Renamed Title');

    expect(mockRepoUpdateTitle).toHaveBeenCalledWith(sessionId, 'Renamed Title');
    expect(mockMarkConversationTitleDirty).toHaveBeenCalledWith(sessionId);
    expect(mockRepoUpdateTitle.mock.invocationCallOrder[0]).toBeLessThan(
      mockMarkConversationTitleDirty.mock.invocationCallOrder[0]
    );
  });
});
