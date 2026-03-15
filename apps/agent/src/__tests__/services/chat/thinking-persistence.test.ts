import type { ExtensionMessage } from '@/types/protocol';

import { chatMessageService } from '@/services/chat/chat-message-service';
import { useCheckpointStore } from '@/stores/agent/checkpoint-store';
import { useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';
import { useUIStore } from '@/stores/ui/ui-store';

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

function makeConversationLoadedMessage(
  sessionId: string,
  assistantThinkingPhases: {
    content: string;
    contentOffset?: number;
    ordinal?: number;
    durationMs?: number;
  }[],
  thinkingDurationMs: number
): Extract<ExtensionMessage, { type: 'conversation:loaded' }> {
  return {
    type: 'conversation:loaded',
    uuid: '00000000-0000-4000-8000-000000000101',
    session_id: sessionId,
    title: 'Test Conversation',
    messages: [
      {
        id: 'user-1',
        role: 'user',
        content: 'hello',
        thinking: undefined,
        thinkingDurationMs: undefined,
        thinkingPhases: [],
        isInterrupted: undefined,
        turnDurationMs: undefined,
        createdAt: 1,
        toolUses: [],
        usage: undefined,
        parentUuid: null,
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Hi there',
        createdAt: 2,
        thinking: 'phase 1\n\nphase 2',
        thinkingDurationMs,
        thinkingPhases: assistantThinkingPhases,
        isInterrupted: undefined,
        turnDurationMs: undefined,
        toolUses: [],
        usage: undefined,
        parentUuid: 'user-1',
      },
    ],
  };
}

describe('ChatMessageService thinking persistence', () => {
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

  it('hydrates per-phase durationMs from persisted thinking phases', async () => {
    const sessionId = 'session-thinking-duration-hydration';

    chatMessageService.handleMessage(
      makeConversationLoadedMessage(
        sessionId,
        [
          { content: 'phase 1', contentOffset: 0, ordinal: 0, durationMs: 300 },
          { content: 'phase 2', contentOffset: 2, ordinal: 2, durationMs: 900 },
        ],
        5000
      )
    );

    await vi.runAllTimersAsync();

    const assistantMessage = useChatStore
      .getState()
      .sessions[sessionId]?.messages.find((message) => message.id === 'assistant-1');

    expect(assistantMessage?.thinkingBlocks).toEqual([
      {
        content: 'phase 1',
        durationMs: 300,
        contentOffset: 0,
        ordinal: 0,
      },
      {
        content: 'phase 2',
        durationMs: 900,
        contentOffset: 2,
        ordinal: 2,
      },
    ]);
  });

  it('falls back to the legacy last-block duration when per-phase durationMs is missing', async () => {
    const sessionId = 'session-thinking-duration-fallback';

    chatMessageService.handleMessage(
      makeConversationLoadedMessage(
        sessionId,
        [
          { content: 'phase 1', contentOffset: 0, ordinal: 0 },
          { content: 'phase 2', contentOffset: 2, ordinal: 2 },
        ],
        4200
      )
    );

    await vi.runAllTimersAsync();

    const assistantMessage = useChatStore
      .getState()
      .sessions[sessionId]?.messages.find((message) => message.id === 'assistant-1');

    expect(assistantMessage?.thinkingBlocks).toEqual([
      {
        content: 'phase 1',
        durationMs: 0,
        contentOffset: 0,
        ordinal: 0,
      },
      {
        content: 'phase 2',
        durationMs: 4200,
        contentOffset: 2,
        ordinal: 2,
      },
    ]);
  });
});
