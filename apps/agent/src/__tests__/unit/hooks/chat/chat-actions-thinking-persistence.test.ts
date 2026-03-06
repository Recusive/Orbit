import type { ChatMessage } from '@/components/chat';

const { mockConversationAddMessage, mockConversationList, mockConversationLoad } = vi.hoisted(
  () => ({
    mockConversationAddMessage: vi.fn<
      [string, Record<string, unknown>, string | undefined, string | undefined],
      Promise<void>
    >(),
    mockConversationList: vi.fn<[], Promise<unknown[]>>(),
    mockConversationLoad: vi.fn<[], Promise<null>>(),
  })
);

vi.mock('@sentry/react', () => ({
  startSpan: (_options: unknown, callback: () => void) => {
    callback();
  },
}));

vi.mock('@/lib/api', () => ({
  conversationAddMessage: mockConversationAddMessage,
  conversationList: mockConversationList,
  conversationLoad: mockConversationLoad,
}));

import { createChatActions } from '@/hooks/chat/handlers/chat-actions';
import { chatMessageService } from '@/services/chat/chat-message-service';
import { useCheckpointStore } from '@/stores/agent/checkpoint-store';
import { useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';
import { useUIStore } from '@/stores/ui/ui-store';

interface ChatMessageServiceInternals {
  thinkingStartTimes: Map<string, number>;
}

function getInternals(): ChatMessageServiceInternals {
  return chatMessageService as unknown as ChatMessageServiceInternals;
}

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
    compactingMessageId: null,
    lruOrder: [],
  });
  useUIStore.setState({
    workspacePath: '/workspace',
    activeWorktreePath: '/workspace/worktree',
    conversations: [],
    activeConversationId: null,
    activeConversationTitle: null,
    isLoadingConversation: false,
    isConversationTransitioning: false,
  });
}

function initStreamingAssistantMessage(
  sessionId: string,
  overrides: Partial<ChatMessage> = {}
): ChatMessage {
  const message: ChatMessage = {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Done',
    displayedContent: 'Done',
    thinking: 'phase 1',
    thinkingBlocks: [
      {
        content: 'phase 1',
        durationMs: 0,
        ordinal: 0,
      },
    ],
    isStreaming: true,
    isThinkingActive: true,
    parentUuid: 'user-1',
    ...overrides,
  };

  const chatStore = useChatStore.getState();
  chatStore.getOrCreateSession(sessionId);
  chatStore.setActiveSession(sessionId);
  chatStore.addMessage(sessionId, {
    id: 'user-1',
    role: 'user',
    content: 'hello',
    displayedContent: 'hello',
    parentUuid: null,
  });
  chatStore.addMessage(sessionId, message);
  chatStore.setAgentRunning(sessionId, true);
  return message;
}

describe('chat-actions thinking persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T12:00:00.000Z'));
    chatMessageService.destroyAll();
    resetStores();
    mockConversationAddMessage.mockResolvedValue(undefined);
    mockConversationList.mockResolvedValue([]);
    mockConversationLoad.mockResolvedValue(null);
  });

  afterEach(() => {
    chatMessageService.destroyAll();
    resetStores();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('finalizes active thinking blocks before persisting an interrupted stop', () => {
    const sessionId = 'session-stop-thinking';
    initStreamingAssistantMessage(sessionId);
    getInternals().thinkingStartTimes.set('assistant-1', Date.now() - 1500);

    const postMessage = vi.fn();
    const actions = createChatActions({ postMessage });

    actions.handleStop();

    expect(mockConversationAddMessage).toHaveBeenCalledWith(
      sessionId,
      expect.objectContaining({
        id: 'assistant-1',
        role: 'assistant',
        content: 'Done',
        thinking: 'phase 1',
        thinkingPhases: [
          {
            content: 'phase 1',
            contentOffset: 4,
            ordinal: 0,
            durationMs: 1500,
          },
        ],
        parentUuid: 'user-1',
      }),
      '/workspace',
      '/workspace/worktree'
    );

    const interruptedMessage = useChatStore.getState().sessions[sessionId]?.messages.at(-1);
    expect(interruptedMessage).toMatchObject({
      id: 'assistant-1',
      isInterrupted: true,
      isStreaming: false,
      isThinkingActive: false,
    });
    expect(interruptedMessage?.thinkingBlocks?.[0]).toMatchObject({
      contentOffset: 4,
      durationMs: 1500,
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent:stop',
        session_id: sessionId,
      })
    );
  });

  it('finalizes active thinking blocks before persisting a permission rejection', () => {
    const sessionId = 'session-deny-thinking';
    initStreamingAssistantMessage(sessionId, {
      thinking: 'question phase',
      thinkingBlocks: [
        {
          content: 'question phase',
          durationMs: 0,
          ordinal: 0,
        },
      ],
    });
    getInternals().thinkingStartTimes.set('assistant-1', Date.now() - 900);
    useToolStore.getState().addPermissionRequest({
      requestId: 'perm-1',
      sessionId,
      toolName: 'AskUserQuestion',
      toolInput: { prompt: 'Need clarification' },
      createdAt: Date.now(),
    });

    const postMessage = vi.fn();
    const actions = createChatActions({ postMessage });

    actions.handlePermissionDeny('perm-1');

    expect(mockConversationAddMessage).toHaveBeenCalledWith(
      sessionId,
      expect.objectContaining({
        id: 'assistant-1',
        role: 'assistant',
        content: 'Done',
        thinking: 'question phase',
        thinkingPhases: [
          {
            content: 'question phase',
            contentOffset: 4,
            ordinal: 0,
            durationMs: 900,
          },
        ],
        parentUuid: 'user-1',
      }),
      '/workspace',
      '/workspace/worktree'
    );

    const interruptedMessage = useChatStore.getState().sessions[sessionId]?.messages.at(-1);
    expect(interruptedMessage).toMatchObject({
      id: 'assistant-1',
      isInterrupted: true,
      isStreaming: false,
      isThinkingActive: false,
      interruptReason: 'User rejected to answer',
    });
    expect(interruptedMessage?.thinkingBlocks?.[0]).toMatchObject({
      contentOffset: 4,
      durationMs: 900,
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'permission:response',
        request_id: 'perm-1',
        decision: 'deny',
      })
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent:stop',
        session_id: sessionId,
      })
    );
  });

  it('includes durationMs when building rewind current_messages payloads', () => {
    const sessionId = 'session-rewind-thinking';
    const assistantMessage = initStreamingAssistantMessage(sessionId, {
      isStreaming: false,
      isThinkingActive: false,
      thinking: 'phase 1\n\nphase 2',
      thinkingBlocks: [
        {
          content: 'phase 1',
          durationMs: 300,
          contentOffset: 0,
          ordinal: 0,
        },
        {
          content: 'phase 2',
          durationMs: 900,
          contentOffset: 4,
          ordinal: 2,
        },
      ],
    });
    useChatStore.getState().setAgentRunning(sessionId, false);

    const postMessage = vi.fn();
    const actions = createChatActions({ postMessage });

    actions.handleRewind(assistantMessage.id);

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'conversation:rewind',
        session_id: sessionId,
        current_messages: [
          expect.objectContaining({
            id: 'user-1',
            content: 'hello',
          }),
          expect.objectContaining({
            id: 'assistant-1',
            thinking: 'phase 1\n\nphase 2',
            thinkingPhases: [
              {
                content: 'phase 1',
                contentOffset: 0,
                ordinal: 0,
                durationMs: 300,
              },
              {
                content: 'phase 2',
                contentOffset: 4,
                ordinal: 2,
                durationMs: 900,
              },
            ],
          }),
        ],
      })
    );
  });
});
