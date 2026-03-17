const {
  mockApplySessionTitle,
  mockCacheAttachedImagesForMessage,
  mockConversationAddMessage,
  mockGenerateAITitle,
  mockGenerateFallbackTitle,
} = vi.hoisted(() => ({
  mockApplySessionTitle: vi.fn<(sessionId: string, title: string) => void>(),
  mockCacheAttachedImagesForMessage: vi.fn<(sessionId: string, messageId: string) => void>(),
  mockConversationAddMessage: vi.fn<
    [string, Record<string, unknown>, string | undefined, string | undefined],
    Promise<void>
  >(),
  mockGenerateAITitle: vi.fn<(sessionId: string, userMessage: string) => void>(),
  mockGenerateFallbackTitle: vi.fn<[string], string>(),
}));

vi.mock('@sentry/react', () => ({
  startSpan: (_options: unknown, callback: () => void) => {
    callback();
  },
}));

vi.mock('@/lib/api', () => ({
  conversationAddMessage: mockConversationAddMessage,
}));

vi.mock('@/services/session', () => ({
  applySessionTitle: mockApplySessionTitle,
  generateAITitle: mockGenerateAITitle,
  generateFallbackTitle: mockGenerateFallbackTitle,
}));

vi.mock('@/services/chat/image-attachment-cache', () => ({
  buildOptimisticAttachedImages: (images?: unknown[]) => images,
  cacheAttachedImagesForMessage: mockCacheAttachedImagesForMessage,
}));

import { useVaultStore } from '@/features/vault/stores';
import { createChatActions } from '@/hooks/chat/handlers/chat-actions';
import { useCheckpointStore } from '@/stores/agent/checkpoint-store';
import { useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';
import { useQueuedMessageStore } from '@/stores/chat/queued-message-store';
import { useUIStore } from '@/stores/ui/ui-store';

function resetStores(): void {
  useVaultStore.getState().clearWorkspaceState();
  useToolStore.getState().reset();
  useCheckpointStore.getState().clearAll();
  useQueuedMessageStore.setState({ queuedMessage: null });
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

function seedConversation(
  sessionId: string,
  messages: { id: string; role: 'user' | 'assistant'; content: string }[]
): void {
  const chatStore = useChatStore.getState();
  chatStore.getOrCreateSession(sessionId);
  chatStore.setActiveSession(sessionId);

  for (const message of messages) {
    chatStore.addMessage(sessionId, {
      id: message.id,
      role: message.role,
      content: message.content,
      displayedContent: message.content,
      parentUuid: null,
    });
  }
}

describe('send-time title generation', () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
    mockConversationAddMessage.mockResolvedValue(undefined);
    mockGenerateFallbackTitle.mockImplementation((text: string) => `Fallback: ${text}`);
  });

  afterEach(() => {
    resetStores();
    vi.clearAllMocks();
  });

  it('triggers AI title generation on the first message in an existing conversation', () => {
    const sessionId = 'existing-session';
    seedConversation(sessionId, []);
    useUIStore.setState({
      ...useUIStore.getState(),
      conversations: [
        {
          sessionId,
          title: 'Untitled',
          updatedAt: Date.now(),
          messageCount: 0,
        },
      ],
      activeConversationId: sessionId,
      activeConversationTitle: 'Untitled',
    });

    const postMessage = vi.fn();
    const actions = createChatActions({ postMessage });

    actions.handleSend('help me debug');

    expect(mockApplySessionTitle).toHaveBeenCalledWith(sessionId, 'Fallback: help me debug');
    expect(mockGenerateAITitle).toHaveBeenCalledWith(sessionId, 'help me debug');
  });

  it('does not trigger AI title generation on the second message', () => {
    const sessionId = 'existing-session';
    seedConversation(sessionId, [{ id: 'user-1', role: 'user', content: 'first message' }]);
    useUIStore.setState({
      ...useUIStore.getState(),
      conversations: [
        {
          sessionId,
          title: 'Existing Title',
          updatedAt: Date.now(),
          messageCount: 1,
        },
      ],
      activeConversationId: sessionId,
      activeConversationTitle: 'Existing Title',
    });

    const postMessage = vi.fn();
    const actions = createChatActions({ postMessage });

    actions.handleSend('follow-up question');

    expect(mockApplySessionTitle).not.toHaveBeenCalled();
    expect(mockGenerateAITitle).not.toHaveBeenCalled();
  });

  it('uses the image conversation fallback when the first message has only images', () => {
    const sessionId = 'existing-session';
    seedConversation(sessionId, []);
    useUIStore.setState({
      ...useUIStore.getState(),
      conversations: [
        {
          sessionId,
          title: 'Untitled',
          updatedAt: Date.now(),
          messageCount: 0,
        },
      ],
      activeConversationId: sessionId,
      activeConversationTitle: 'Untitled',
    });

    const postMessage = vi.fn();
    const actions = createChatActions({ postMessage });

    actions.handleSend('', undefined, [
      {
        name: 'diagram.png',
        mimeType: 'image/png',
        data: 'abc',
        previewUrl: 'data:image/png;base64,abc',
      },
    ]);

    expect(mockApplySessionTitle).toHaveBeenCalledWith(sessionId, 'Fallback: Image conversation');
    expect(mockGenerateAITitle).toHaveBeenCalledWith(sessionId, 'Image conversation');
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message:send',
        content: '',
        context: expect.objectContaining({
          images: [
            {
              name: 'diagram.png',
              mimeType: 'image/png',
              data: 'abc',
            },
          ],
        }),
      })
    );
    expect(mockCacheAttachedImagesForMessage).toHaveBeenCalled();
  });
});
