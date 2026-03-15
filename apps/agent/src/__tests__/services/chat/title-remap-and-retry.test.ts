import type { ExtensionMessage } from '@/types/protocol';

const {
  mockClearSessionTitleState,
  mockFlushPendingTitle,
  mockGenerateAITitle,
  mockGetPreferredTitle,
  mockRemapSessionTitleState,
  mockRetryPendingPersistence,
} = vi.hoisted(() => ({
  mockClearSessionTitleState: vi.fn<(sessionId: string) => void>(),
  mockFlushPendingTitle: vi.fn<(sessionId: string, remappedFromId?: string) => void>(),
  mockGenerateAITitle: vi.fn<(sessionId: string, userMessage: string) => void>(),
  mockGetPreferredTitle: vi.fn<(sessionId: string) => string | undefined>(),
  mockRemapSessionTitleState: vi.fn<(oldSessionId: string, newSessionId: string) => void>(),
  mockRetryPendingPersistence: vi.fn<(sessionId: string) => void>(),
}));

vi.mock('@/lib/api', () => ({
  conversationAddMessage: vi.fn(),
  conversationList: vi.fn().mockResolvedValue([]),
  conversationLoad: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/services/session', () => ({
  clearSessionTitleState: mockClearSessionTitleState,
  flushPendingTitle: mockFlushPendingTitle,
  generateAITitle: mockGenerateAITitle,
  getPreferredTitle: mockGetPreferredTitle,
  remapSessionTitleState: mockRemapSessionTitleState,
  retryPendingPersistence: mockRetryPendingPersistence,
}));

import { chatMessageService } from '@/services/chat/chat-message-service';
import { useCheckpointStore } from '@/stores/agent/checkpoint-store';
import { useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';
import { useUIStore } from '@/stores/ui/ui-store';

const TEST_UUID = '00000000-0000-4000-8000-000000000201';

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
    ...useUIStore.getInitialState(),
    workspacePath: '/workspace',
    activeWorktreePath: null,
    conversations: [],
    activeConversationId: null,
    activeConversationTitle: null,
  });
}

function makeSystemInit(
  frontendSessionId: string,
  sdkSessionId: string
): Extract<ExtensionMessage, { type: 'system:init' }> {
  return {
    type: 'system:init',
    uuid: TEST_UUID,
    session_id: frontendSessionId,
    sdk_session_id: sdkSessionId,
    cwd: '/workspace',
  };
}

function makeAgentComplete(
  sessionId: string
): Extract<ExtensionMessage, { type: 'agent:complete' }> {
  return {
    type: 'agent:complete',
    uuid: TEST_UUID,
    session_id: sessionId,
    message_id: 'assistant-1',
  };
}

function makeAgentError(sessionId: string): Extract<ExtensionMessage, { type: 'agent:error' }> {
  return {
    type: 'agent:error',
    uuid: TEST_UUID,
    session_id: sessionId,
    message_id: 'assistant-1',
    error: 'boom',
  };
}

function makeConversationLoaded(
  sessionId: string,
  title: string
): Extract<ExtensionMessage, { type: 'conversation:loaded' }> {
  return {
    type: 'conversation:loaded',
    uuid: TEST_UUID,
    session_id: sessionId,
    title,
    messages: [],
  };
}

function makeConversationDeleted(
  sessionId: string
): Extract<ExtensionMessage, { type: 'conversation:deleted' }> {
  return {
    type: 'conversation:deleted',
    uuid: TEST_UUID,
    session_id: sessionId,
  };
}

describe('ChatMessageService title integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    chatMessageService.destroyAll();
    resetStores();
    vi.clearAllMocks();
    mockGetPreferredTitle.mockReturnValue(undefined);
  });

  afterEach(() => {
    chatMessageService.destroyAll();
    resetStores();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('uses getPreferredTitle to avoid stale header titles on conversation reload', async () => {
    const sessionId = 'session-load';
    const chatStore = useChatStore.getState();
    chatStore.getOrCreateSession(sessionId);
    chatStore.setActiveSession(sessionId);
    useUIStore.getState().setActiveConversation(sessionId, 'Fallback Title');

    mockGetPreferredTitle.mockReturnValue('AI Title');

    chatMessageService.handleMessage(makeConversationLoaded(sessionId, 'Fallback Title'));
    vi.runOnlyPendingTimers();
    await Promise.resolve();

    expect(mockGetPreferredTitle).toHaveBeenCalledWith(sessionId);
    expect(useUIStore.getState().activeConversationTitle).toBe('AI Title');
  });

  it('retries title generation on agent:complete using only the first user message', () => {
    const sessionId = 'session-retry';
    const chatStore = useChatStore.getState();
    chatStore.getOrCreateSession(sessionId);
    chatStore.setActiveSession(sessionId);
    chatStore.addMessage(sessionId, {
      id: 'user-1',
      role: 'user',
      content: 'help me debug',
      displayedContent: 'help me debug',
      parentUuid: null,
    });
    chatStore.addMessage(sessionId, {
      id: 'assistant-1',
      role: 'assistant',
      content: 'The build is failing because a dependency is unresolved.',
      displayedContent: 'The build is failing because a dependency is unresolved.',
      parentUuid: 'user-1',
    });
    chatStore.setAgentRunning(sessionId, true);

    chatMessageService.handleMessage(makeAgentComplete(sessionId));

    expect(mockGenerateAITitle).toHaveBeenCalledWith(sessionId, 'help me debug');
    expect(mockRetryPendingPersistence).toHaveBeenCalledWith(sessionId);
  });

  it('retries deferred title persistence on agent:error', () => {
    chatMessageService.handleMessage(makeAgentError('session-error'));

    expect(mockRetryPendingPersistence).toHaveBeenCalledWith('session-error');
  });

  it('invokes remapSessionTitleState on system:init remap', () => {
    const frontendSessionId = 'frontend-temp-id';
    const sdkSessionId = 'sdk-real-id';

    const chatStore = useChatStore.getState();
    chatStore.getOrCreateSession(frontendSessionId);
    chatStore.setActiveSession(frontendSessionId);

    useUIStore.setState({
      ...useUIStore.getState(),
      conversations: [
        {
          sessionId: frontendSessionId,
          title: 'Untitled',
          updatedAt: Date.now(),
          messageCount: 0,
        },
      ],
      activeConversationId: frontendSessionId,
      activeConversationTitle: 'Untitled',
    });

    chatMessageService.handleMessage(makeSystemInit(frontendSessionId, sdkSessionId));

    expect(mockRemapSessionTitleState).toHaveBeenCalledWith(frontendSessionId, sdkSessionId);
    expect(mockFlushPendingTitle).toHaveBeenCalledWith(sdkSessionId, frontendSessionId);
  });

  it('clears title state when a conversation is deleted through the protocol path', () => {
    chatMessageService.handleMessage(makeConversationDeleted('session-delete'));

    expect(mockClearSessionTitleState).toHaveBeenCalledWith('session-delete');
  });
});
