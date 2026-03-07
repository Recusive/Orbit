import { renderHook, waitFor } from '@testing-library/react';

const {
  mockApplySessionTitle,
  mockConversationAddMessage,
  mockConversationLoad,
  mockGenerateAITitle,
  mockGenerateFallbackTitle,
  mockPostMessage,
} = vi.hoisted(() => ({
  mockApplySessionTitle: vi.fn<(sessionId: string, title: string) => void>(),
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

vi.mock('@/services/session', () => ({
  applySessionTitle: mockApplySessionTitle,
  generateAITitle: mockGenerateAITitle,
  generateFallbackTitle: mockGenerateFallbackTitle,
}));

import { useChatMessages } from '@/hooks/chat/use-chat-messages';
import { useMessageBufferStore } from '@/stores/agent/message-buffer-store';
import { useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';
import { useUIStore } from '@/stores/ui/ui-store';

function resetStores(): void {
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
    compactingMessageId: null,
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
    chatStore.setPendingMessage({ text: 'help me debug' });
    useChatStore.setState({ lastCreatedSessionId: 'new-session' });
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
  });
});
