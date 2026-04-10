const {
  mockAppendMessageToConversationCache,
  mockConversationAddMessage,
  mockGenerateFallbackTitle,
} = vi.hoisted(() => ({
  mockAppendMessageToConversationCache: vi.fn<(sessionId: string, message: unknown) => void>(),
  mockConversationAddMessage: vi.fn<
    [string, Record<string, unknown>, string | undefined, string | undefined],
    Promise<void>
  >(),
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

vi.mock('@/lib/query', () => ({
  appendMessageToConversationCache: mockAppendMessageToConversationCache,
  markConversationDirty: vi.fn(),
}));

vi.mock('@/services/session', () => ({
  applySessionTitle: vi.fn(),
  generateAITitle: vi.fn(),
  generateFallbackTitle: mockGenerateFallbackTitle,
}));

vi.mock('@/services/chat/image-attachment-cache', () => ({
  buildOptimisticAttachedImages: (images?: unknown[]) => images ?? [],
  cacheAttachedImagesForMessage: vi.fn(),
}));

import { createChatActions } from '@/hooks/chat/handlers/chat-actions';
import { resetSessionSettingsSyncState } from '@/services/chat/session-settings-sync';
import { useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';
import { useQueuedMessageStore } from '@/stores/chat/queued-message-store';
import { useUIStore } from '@/stores/ui/ui-store';

function resetStores(): void {
  resetSessionSettingsSyncState();
  useToolStore.getState().reset();
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

function seedConversation(sessionId: string): void {
  const chatStore = useChatStore.getState();
  chatStore.getOrCreateSession(sessionId);
  chatStore.setActiveSession(sessionId);
  chatStore.addMessage(sessionId, {
    id: 'user-seed',
    role: 'user',
    content: 'seed',
    displayedContent: 'seed',
    parentUuid: null,
  });
}

interface MessageTypeCallRecorder {
  mock: {
    calls: [{ type: string }][];
  };
}

function collectMessageTypes(postMessage: MessageTypeCallRecorder): string[] {
  return postMessage.mock.calls.map(([message]) => message.type);
}

describe('chat-actions session settings sync', () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
    mockConversationAddMessage.mockResolvedValue(undefined);
    mockGenerateFallbackTitle.mockImplementation((text: string) => text);
  });

  afterEach(() => {
    resetStores();
    vi.clearAllMocks();
  });

  it('does not resend model or thinking settings before every message', () => {
    const sessionId = 'session-settings-repeat';
    seedConversation(sessionId);

    const toolStore = useToolStore.getState();
    toolStore.setModel('haiku');
    toolStore.setThinkingMode('hard');
    toolStore.setEffortLevel('high');

    const postMessage = vi.fn();
    const actions = createChatActions({ postMessage });

    actions.handleSend('first follow-up');

    expect(collectMessageTypes(postMessage)).toEqual(
      expect.arrayContaining(['thinking:set', 'model:set', 'message:send'])
    );
    expect(collectMessageTypes(postMessage)).not.toContain('effort:set');

    useChatStore.getState().setAgentRunning(sessionId, false);
    postMessage.mockClear();

    actions.handleSend('second follow-up');

    expect(collectMessageTypes(postMessage)).toEqual(['message:send']);
  });

  it('re-syncs the active settings when the model family changes, then skips the next send burst', () => {
    const sessionId = 'session-settings-model-switch';
    seedConversation(sessionId);

    const toolStore = useToolStore.getState();
    toolStore.setModel('haiku');
    toolStore.setThinkingMode('ultra');
    toolStore.setEffortLevel('max');

    const postMessage = vi.fn();
    const actions = createChatActions({ postMessage });

    actions.handleSend('sync baseline');
    useChatStore.getState().setAgentRunning(sessionId, false);
    postMessage.mockClear();

    actions.handleModelChange('claude-sonnet-4-6');

    expect(collectMessageTypes(postMessage)).toEqual(['model:set', 'effort:set']);

    postMessage.mockClear();
    actions.handleSend('after adaptive switch');

    expect(collectMessageTypes(postMessage)).toEqual(['message:send']);

    useChatStore.getState().setAgentRunning(sessionId, false);
    postMessage.mockClear();

    actions.handleModelChange('haiku');

    expect(collectMessageTypes(postMessage)).toEqual(['thinking:set', 'model:set']);
  });
});
