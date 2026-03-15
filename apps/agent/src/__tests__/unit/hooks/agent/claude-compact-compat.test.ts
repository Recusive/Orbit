import { act } from '@testing-library/react';

import type { ExtensionMessage, WebviewMessage } from '@/types/protocol';

const {
  mockAgentSendMessage,
  mockClearSessionTitleState,
  mockConversationAddMessage,
  mockConversationList,
  mockConversationLoad,
  mockEnsureSession,
  mockFlushPendingTitle,
  mockGenerateAITitle,
  mockGetPreferredTitle,
  mockRemapSessionTitleState,
  mockRetryPendingPersistence,
} = vi.hoisted(() => ({
  mockAgentSendMessage: vi.fn(() => Promise.resolve()),
  mockClearSessionTitleState: vi.fn(),
  mockConversationAddMessage: vi.fn(() => Promise.resolve()),
  mockConversationList: vi.fn(() => Promise.resolve([])),
  mockConversationLoad: vi.fn(() => Promise.resolve(null)),
  mockEnsureSession: vi.fn(() => Promise.resolve()),
  mockFlushPendingTitle: vi.fn(),
  mockGenerateAITitle: vi.fn(),
  mockGetPreferredTitle: vi.fn(),
  mockRemapSessionTitleState: vi.fn(),
  mockRetryPendingPersistence: vi.fn(),
}));

vi.mock('@/hooks/agent/use-tauri-session', () => ({
  ensureSession: mockEnsureSession,
}));

vi.mock('@/lib/api', () => ({
  agentInterrupt: vi.fn(),
  agentRespondPermission: vi.fn(),
  agentSendMessage: mockAgentSendMessage,
  agentSetAcceptMode: vi.fn(),
  agentSetEffortLevel: vi.fn(),
  agentSetModel: vi.fn(),
  agentSetPlanMode: vi.fn(),
  agentSetThinkingMode: vi.fn(),
  conversationAddMessage: mockConversationAddMessage,
  conversationList: mockConversationList,
  conversationLoad: mockConversationLoad,
}));

vi.mock('@/services/session', () => ({
  clearSessionTitleState: mockClearSessionTitleState,
  flushPendingTitle: mockFlushPendingTitle,
  generateAITitle: mockGenerateAITitle,
  getPreferredTitle: mockGetPreferredTitle,
  remapSessionTitleState: mockRemapSessionTitleState,
  retryPendingPersistence: mockRetryPendingPersistence,
}));

import { handleMessageSend } from '@/hooks/agent/handlers/agent-sdk-handlers';
import { chatMessageService } from '@/services/chat/chat-message-service';
import { useCheckpointStore } from '@/stores/agent/checkpoint-store';
import { useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';
import { useUIStore } from '@/stores/ui/ui-store';

const TEST_UUID = '00000000-0000-4000-8000-00000000c001';

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
    workspacePath: '/workspace',
    activeWorktreePath: null,
    conversations: [],
    activeConversationId: null,
    activeConversationTitle: null,
    isLoadingConversation: false,
    isConversationTransitioning: false,
  });
}

function makeSendMessage(content: string): Extract<WebviewMessage, { type: 'message:send' }> {
  return {
    type: 'message:send',
    uuid: TEST_UUID,
    session_id: 'claude-session',
    content,
    parent_uuid: null,
  };
}

function makeCompactComplete(
  sessionId: string
): Extract<ExtensionMessage, { type: 'agent:compact_complete' }> {
  return {
    type: 'agent:compact_complete',
    session_id: sessionId,
  };
}

describe('Claude /compact backward compatibility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    chatMessageService.destroyAll();
    resetStores();
  });

  afterEach(async () => {
    chatMessageService.destroyAll();
    resetStores();
    await vi.runAllTimersAsync();
    vi.useRealTimers();
  });

  it('marks Claude /compact messages with a claude backend compaction entry', async () => {
    await handleMessageSend(makeSendMessage('/compact'));

    expect(useChatStore.getState().activeCompactions['claude-session']).toEqual({
      backend: 'claude',
      messageId: TEST_UUID,
      status: 'pending',
    });
  });

  it('settles Claude compactions on agent:compact_complete', async () => {
    useChatStore.getState().markCompacting('claude-session', {
      backend: 'claude',
      messageId: 'user-message',
      status: 'pending',
    });

    act(() => {
      chatMessageService.handleMessage(makeCompactComplete('claude-session'));
    });
    await vi.advanceTimersByTimeAsync(500);

    expect(useChatStore.getState().activeCompactions['claude-session']).toBeUndefined();
  });

  it('does not settle OpenCode compactions on agent:compact_complete', async () => {
    useChatStore.getState().markCompacting('oc-session', {
      backend: 'opencode',
      messageId: 'user-message',
      status: 'pending',
    });

    act(() => {
      chatMessageService.handleMessage(makeCompactComplete('oc-session'));
    });
    await vi.advanceTimersByTimeAsync(500);

    expect(useChatStore.getState().activeCompactions['oc-session']).toEqual({
      backend: 'opencode',
      messageId: 'user-message',
      status: 'pending',
    });
  });
});
