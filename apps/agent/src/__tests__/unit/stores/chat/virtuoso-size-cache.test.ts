import type { ChatMessage } from '@/components/chat/messages/types';

import { useChatStore } from '@/stores/chat/chat-store';

function resetChatStore(): void {
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
}

function buildMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: overrides.id ?? 'message-1',
    role: overrides.role ?? 'assistant',
    content: overrides.content ?? 'message content',
    displayedContent: overrides.displayedContent ?? overrides.content ?? 'message content',
    attachedImages: overrides.attachedImages,
    thinking: overrides.thinking,
    ...overrides,
  };
}

describe('ChatStore virtuoso size cache', () => {
  beforeEach(() => {
    resetChatStore();
  });

  afterEach(() => {
    resetChatStore();
  });

  it('bumps layoutVersion for height-affecting mutations', () => {
    const store = useChatStore.getState();
    store.getOrCreateSession('session-1');
    expect(useChatStore.getState().sessions['session-1']?.layoutVersion).toBe(0);

    store.setMessages('session-1', [
      buildMessage({
        id: 'message-1',
        attachedImages: [
          {
            name: 'diagram.png',
            mimeType: 'image/png',
            previewUrl: 'preview://diagram',
          },
        ],
      }),
    ]);
    expect(useChatStore.getState().sessions['session-1']?.layoutVersion).toBe(1);

    store.appendToLastMessage('session-1', 'message-1', ' more');
    expect(useChatStore.getState().sessions['session-1']?.layoutVersion).toBe(2);

    store.appendThinking('session-1', 'message-1', 'thought');
    expect(useChatStore.getState().sessions['session-1']?.layoutVersion).toBe(3);

    store.updateMessage('session-1', 'message-1', (message) => ({
      ...message,
      content: 'updated',
      displayedContent: 'updated',
    }));
    expect(useChatStore.getState().sessions['session-1']?.layoutVersion).toBe(4);

    store.patchImagePreviewUrl('session-1', 'message-1', 'preview://diagram', 'asset://diagram');
    expect(useChatStore.getState().sessions['session-1']?.layoutVersion).toBe(5);

    store.removeImageFromMessage('session-1', 'message-1', 'asset://diagram');
    expect(useChatStore.getState().sessions['session-1']?.layoutVersion).toBe(6);

    store.reconcileMessageId('session-1', 'message-1', 'message-1-reconciled');
    expect(useChatStore.getState().sessions['session-1']?.layoutVersion).toBe(7);
  });

  it('remaps the size cache along with the session', () => {
    const store = useChatStore.getState();
    store.getOrCreateSession('session-old');
    store.setVirtuosoSizeCache('session-old', {
      ranges: [{ k: 0, v: 120 }],
      messageCount: 1,
      lastMessageId: 'message-1',
      layoutVersion: 0,
    });

    store.remapSession('session-old', 'session-new');

    expect(useChatStore.getState().sessions['session-new']?.virtuosoSizeCache).toEqual({
      ranges: [{ k: 0, v: 120 }],
      messageCount: 1,
      lastMessageId: 'message-1',
      layoutVersion: 0,
    });
    expect(useChatStore.getState().sessions['session-old']).toBeUndefined();
  });

  it('clears the size cache when the session is evicted from memory', () => {
    const store = useChatStore.getState();
    store.getOrCreateSession('session-1');
    store.setMessages('session-1', [buildMessage({ id: 'message-1' })]);
    store.setVirtuosoSizeCache('session-1', {
      ranges: [{ k: 0, v: 120 }],
      messageCount: 1,
      lastMessageId: 'message-1',
      layoutVersion: useChatStore.getState().sessions['session-1']?.layoutVersion ?? 0,
    });

    for (let index = 2; index <= 21; index += 1) {
      store.getOrCreateSession(`session-${String(index)}`);
    }

    expect(useChatStore.getState().sessions['session-1']?.messages).toEqual([]);
    expect(useChatStore.getState().sessions['session-1']?.virtuosoSizeCache).toBeNull();
  });
});
