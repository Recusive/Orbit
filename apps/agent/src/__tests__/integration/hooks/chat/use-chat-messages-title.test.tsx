import { renderHook, waitFor } from '@testing-library/react';

const {
  mockAppendMessageToConversationCache,
  mockApplySessionTitle,
  mockCacheAttachedImagesForMessage,
  mockConversationAddMessage,
  mockConversationLoad,
  mockGenerateAITitle,
  mockGenerateFallbackTitle,
  mockPostMessage,
} = vi.hoisted(() => ({
  mockAppendMessageToConversationCache: vi.fn<(sessionId: string, message: unknown) => void>(),
  mockApplySessionTitle: vi.fn<(sessionId: string, title: string) => void>(),
  mockCacheAttachedImagesForMessage: vi.fn<(sessionId: string, messageId: string) => void>(),
  mockConversationAddMessage: vi.fn<
    [string, Record<string, unknown>, string | undefined, string | undefined],
    Promise<void>
  >(),
  mockConversationLoad: vi.fn<[string], Promise<null>>(),
  mockGenerateAITitle: vi.fn<(sessionId: string, userMessage: string) => void>(),
  mockGenerateFallbackTitle: vi.fn<[string], string>(),
  mockPostMessage: vi.fn<(message: Record<string, unknown>) => void>(),
}));

vi.mock('@/hooks/agent/use-tauri', () => ({
  useTauri: () => ({
    postMessage: mockPostMessage,
    isConnected: true,
    isMockMode: true,
  }),
}));

vi.mock('@/lib/api', () => ({
  conversationAddMessage: mockConversationAddMessage,
  conversationLoad: mockConversationLoad,
}));

vi.mock('@/lib/query', () => ({
  appendMessageToConversationCache: mockAppendMessageToConversationCache,
  markConversationDirty: vi.fn(),
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

import { useChatMessages } from '@/hooks/chat/use-chat-messages';
import { resetSessionSettingsSyncState } from '@/services/chat/session-settings-sync';
import { useMessageBufferStore } from '@/stores/agent/message-buffer-store';
import { useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';
import { useSessionSwitchStore } from '@/stores/chat/session-switch-store';
import { useUIStore } from '@/stores/ui/ui-store';

function resetStores(): void {
  resetSessionSettingsSyncState();
  useToolStore.getState().reset();
  useMessageBufferStore.setState({ pendingLoads: new Map() });
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
  useUIStore.setState({
    ...useUIStore.getInitialState(),
    workspacePath: '/workspace',
    activeWorktreePath: null,
    conversations: [],
    activeConversationId: null,
    activeConversationTitle: null,
  });
}

describe('new conversation title generation', () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
    mockConversationAddMessage.mockResolvedValue(undefined);
    mockConversationLoad.mockResolvedValue(null);
    mockGenerateFallbackTitle.mockImplementation((text: string) => `Fallback: ${text}`);

    const chatStore = useChatStore.getState();
    chatStore.getOrCreateSession('new-session');
    chatStore.setActiveSession('new-session');
    useSessionSwitchStore.setState({
      pendingCreate: {
        createRequestId: 'create-request',
        draftSessionId: 'new-session',
        effectiveSessionId: 'new-session',
        title: 'Untitled',
        payload: { text: 'help me debug' },
        status: 'awaiting-first-send',
      },
      createRegistry: {
        'create-request': {
          createRequestId: 'create-request',
          draftSessionId: 'new-session',
          effectiveSessionId: 'new-session',
          title: 'Untitled',
          payload: { text: 'help me debug' },
          status: 'awaiting-first-send',
        },
      },
      createSessionIndex: {
        'new-session': 'create-request',
      },
    });
  });

  afterEach(() => {
    resetStores();
    vi.clearAllMocks();
  });

  it('triggers AI title generation after conversation:created processes the pending message', async () => {
    renderHook(() => useChatMessages());

    await waitFor(() => {
      expect(mockApplySessionTitle).toHaveBeenCalledWith('new-session', 'Fallback: help me debug');
    });

    expect(mockGenerateAITitle).toHaveBeenCalledWith('new-session', 'help me debug');
    expect(mockAppendMessageToConversationCache).toHaveBeenCalledWith(
      'new-session',
      expect.objectContaining({
        role: 'user',
        content: 'help me debug',
      })
    );
  });

  it('uses the image conversation fallback when the pending message has no text', async () => {
    useSessionSwitchStore.setState({
      pendingCreate: {
        createRequestId: 'create-request',
        draftSessionId: 'new-session',
        effectiveSessionId: 'new-session',
        title: 'Untitled',
        payload: {
          text: '',
          images: [
            {
              name: 'diagram.png',
              mimeType: 'image/png',
              data: 'abc',
              previewUrl: 'data:image/png;base64,abc',
            },
          ],
        },
        status: 'awaiting-first-send',
      },
      createRegistry: {
        'create-request': {
          createRequestId: 'create-request',
          draftSessionId: 'new-session',
          effectiveSessionId: 'new-session',
          title: 'Untitled',
          payload: {
            text: '',
            images: [
              {
                name: 'diagram.png',
                mimeType: 'image/png',
                data: 'abc',
                previewUrl: 'data:image/png;base64,abc',
              },
            ],
          },
          status: 'awaiting-first-send',
        },
      },
      createSessionIndex: {
        'new-session': 'create-request',
      },
    });

    renderHook(() => useChatMessages());

    await waitFor(() => {
      expect(mockApplySessionTitle).toHaveBeenCalledWith(
        'new-session',
        'Fallback: Image conversation'
      );
    });

    expect(mockGenerateAITitle).toHaveBeenCalledWith('new-session', 'Image conversation');
    expect(mockCacheAttachedImagesForMessage).toHaveBeenCalled();
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message:send',
        content: '',
      })
    );
  });
});
