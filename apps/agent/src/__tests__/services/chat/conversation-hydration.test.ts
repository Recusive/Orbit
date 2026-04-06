import type { ExtensionMessage } from '@/types/protocol';

import { chatMessageService } from '@/services/chat/chat-message-service';
import { useCheckpointStore } from '@/stores/agent/checkpoint-store';
import { useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';
import { useSessionSwitchStore } from '@/stores/chat/session-switch-store';
import { useUIStore } from '@/stores/ui/ui-store';

const TEST_UUID = '00000000-0000-4000-8000-000000000301';

function resetStores(): void {
  useToolStore.getState().reset();
  useCheckpointStore.getState().clearAll();
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
  useUIStore.setState({
    workspacePath: null,
    activeWorktreePath: null,
    conversations: [],
    activeConversationId: null,
    activeConversationTitle: null,
    isLoadingConversation: false,
    isConversationTransitioning: false,
  });
}

function makePersistedMessage(
  overrides: Partial<
    Extract<ExtensionMessage, { type: 'conversation:loaded' }>['messages'][number]
  > = {}
): Extract<ExtensionMessage, { type: 'conversation:loaded' }>['messages'][number] {
  return {
    id: overrides.id ?? 'message-1',
    role: overrides.role ?? 'assistant',
    content: overrides.content ?? 'hello',
    createdAt: overrides.createdAt ?? 1,
    thinking: overrides.thinking,
    thinkingDurationMs: overrides.thinkingDurationMs,
    thinkingPhases: overrides.thinkingPhases ?? [],
    isInterrupted: overrides.isInterrupted,
    turnDurationMs: overrides.turnDurationMs,
    toolUses: overrides.toolUses ?? [],
    attachedImages: overrides.attachedImages ?? [],
    usage: overrides.usage,
    parentUuid: overrides.parentUuid ?? null,
  };
}

function makeConversationLoaded(
  sessionId: string,
  messages: Extract<ExtensionMessage, { type: 'conversation:loaded' }>['messages']
): Extract<ExtensionMessage, { type: 'conversation:loaded' }> {
  return {
    type: 'conversation:loaded',
    uuid: TEST_UUID,
    session_id: sessionId,
    title: 'Loaded Title',
    messages,
  };
}

describe('ChatMessageService conversation hydration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    chatMessageService.destroyAll();
    resetStores();
  });

  afterEach(() => {
    chatMessageService.destroyAll();
    resetStores();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('uses session-refresh for hydrated sessions and keeps them hydrated after load', async () => {
    const sessionId = 'hydrated-session';
    const cachedMessages = [
      {
        id: 'cached-user',
        role: 'user' as const,
        content: 'cached message',
        displayedContent: 'cached message',
        parentUuid: null,
      },
    ];

    const chatStore = useChatStore.getState();
    chatStore.getOrCreateSession(sessionId);
    chatStore.setMessages(sessionId, cachedMessages);
    chatStore.markSessionHydrated(sessionId);
    chatStore.setActiveSession(sessionId);

    chatMessageService.handleMessage(makeConversationLoaded(sessionId, []));
    await vi.runAllTimersAsync();

    const session = useChatStore.getState().sessions[sessionId];
    expect(session?.scrollIntent).toBe('session-refresh');
    expect(session?.hydrationState).toBe('hydrated');
    expect(session?.messages).toEqual(cachedMessages);
  });

  it('uses session-restore for unhydrated sessions and marks them hydrated after merge', async () => {
    const sessionId = 'unhydrated-session';
    const chatStore = useChatStore.getState();
    chatStore.getOrCreateSession(sessionId);
    chatStore.setActiveSession(sessionId);

    chatMessageService.handleMessage(
      makeConversationLoaded(sessionId, [
        makePersistedMessage({
          id: 'user-1',
          role: 'user',
          content: 'hello',
        }),
        makePersistedMessage({
          id: 'assistant-1',
          role: 'assistant',
          content: 'hi there',
          createdAt: 2,
          parentUuid: 'user-1',
        }),
      ])
    );
    await vi.runAllTimersAsync();

    const session = useChatStore.getState().sessions[sessionId];
    // Initial load scrolls to bottom (session-restore) not top (history-load)
    expect(session?.scrollIntent).toBe('session-restore');
    expect(session?.hydrationState).toBe('hydrated');
    expect(session?.messages).toHaveLength(2);
  });

  it('does not tear down transition flags for stale streaming loads', async () => {
    const staleSessionId = 'session-a';
    const activeSessionId = 'session-b';
    const chatStore = useChatStore.getState();

    chatStore.getOrCreateSession(staleSessionId);
    chatStore.setMessages(staleSessionId, [
      {
        id: 'live-user',
        role: 'user',
        content: 'live',
        displayedContent: 'live',
        parentUuid: null,
      },
    ]);
    chatStore.setAgentRunning(staleSessionId, true);
    chatStore.setActiveSession(activeSessionId);

    useUIStore.setState({
      isLoadingConversation: true,
      isConversationTransitioning: true,
      activeConversationId: activeSessionId,
      activeConversationTitle: 'Session B',
    });

    chatMessageService.handleMessage(makeConversationLoaded(staleSessionId, []));
    await vi.runAllTimersAsync();

    expect(useUIStore.getState().isLoadingConversation).toBe(true);
    expect(useUIStore.getState().isConversationTransitioning).toBe(true);
    expect(useChatStore.getState().sessions[staleSessionId]?.hydrationState).toBe('hydrated');
  });

  it('does not mutate transition flags for active streaming loads', async () => {
    const sessionId = 'active-streaming-session';
    const chatStore = useChatStore.getState();

    chatStore.getOrCreateSession(sessionId);
    chatStore.setMessages(sessionId, [
      {
        id: 'live-user',
        role: 'user',
        content: 'live',
        displayedContent: 'live',
        parentUuid: null,
      },
    ]);
    chatStore.setAgentRunning(sessionId, true);
    chatStore.setActiveSession(sessionId);

    useUIStore.setState({
      isLoadingConversation: true,
      isConversationTransitioning: true,
      activeConversationId: sessionId,
      activeConversationTitle: 'Session A',
    });

    chatMessageService.handleMessage(makeConversationLoaded(sessionId, []));
    await vi.runAllTimersAsync();

    expect(useUIStore.getState().isLoadingConversation).toBe(true);
    expect(useUIStore.getState().isConversationTransitioning).toBe(true);
    expect(useChatStore.getState().sessions[sessionId]?.hydrationState).toBe('hydrated');
  });

  it('hydrates pending targets without activating shown-session ownership', async () => {
    const shownSessionId = 'shown-session';
    const pendingSessionId = 'pending-session';
    const chatStore = useChatStore.getState();

    chatStore.getOrCreateSession(shownSessionId);
    chatStore.setMessages(shownSessionId, [
      {
        id: 'shown-user',
        role: 'user',
        content: 'shown',
        displayedContent: 'shown',
        parentUuid: null,
      },
    ]);
    chatStore.markSessionHydrated(shownSessionId);
    chatStore.setActiveSession(shownSessionId);

    useUIStore.setState({
      activeConversationId: shownSessionId,
      activeConversationTitle: 'Shown Title',
      isLoadingConversation: true,
      isConversationTransitioning: true,
    });
    useSessionSwitchStore.setState({
      pending: {
        sessionId: pendingSessionId,
        title: 'Pending Title',
        sourceSessionId: shownSessionId,
        loadStrategy: 'slow',
      },
      requestId: 7,
      status: 'hidden-priming',
    });

    chatMessageService.handleMessage(
      makeConversationLoaded(pendingSessionId, [
        makePersistedMessage({
          id: 'pending-user',
          role: 'user',
          content: 'hello pending',
        }),
      ])
    );
    await vi.runAllTimersAsync();

    expect(useChatStore.getState().activeSessionId).toBe(shownSessionId);
    expect(useUIStore.getState().activeConversationId).toBe(shownSessionId);
    expect(useUIStore.getState().activeConversationTitle).toBe('Shown Title');
    expect(useChatStore.getState().sessions[pendingSessionId]?.hydrationState).toBe('hydrated');
    expect(useChatStore.getState().sessions[pendingSessionId]?.scrollIntent).toBe('pending-verify');
  });
});
