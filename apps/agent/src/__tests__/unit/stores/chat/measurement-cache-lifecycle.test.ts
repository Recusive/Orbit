import type { ChatMessage } from '@/components/chat/messages/types';
import type { ChatMeasurementCache } from '@/stores/chat/chat-store';

import { useChatStore } from '@/stores/chat/chat-store';
import { getRenderCache, removeRenderCache } from '@/stores/chat/render-cache-store';

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
  removeRenderCache('session-1');
  removeRenderCache('session-old');
  removeRenderCache('session-new');
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

function buildMeasurementCache(messageCount: number): ChatMeasurementCache {
  return {
    measurements: Array.from({ length: messageCount }, (_value, index) => ({
      key: `width:720:session-1:message-${String(index + 1)}`,
      index,
      start: index * 120,
      size: 120,
      end: (index + 1) * 120,
      lane: 0,
    })),
    messageCount,
    lastMessageId: messageCount > 0 ? `message-${String(messageCount)}` : null,
    layoutVersion: messageCount,
    viewportWidth: null,
  };
}

describe('ChatStore measurement cache lifecycle', () => {
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

  it('remaps the measurement cache along with the session', () => {
    const store = useChatStore.getState();
    store.getOrCreateSession('session-old');
    store.setMeasurementCache('session-old', buildMeasurementCache(1));

    store.remapSession('session-old', 'session-new');

    expect(useChatStore.getState().sessions['session-new']?.measurementCache).toEqual(
      buildMeasurementCache(1)
    );
    expect(useChatStore.getState().sessions['session-old']).toBeUndefined();
  });

  it('clears the measurement cache when the session is evicted from memory', () => {
    const store = useChatStore.getState();
    store.getOrCreateSession('session-1');
    store.setMessages('session-1', [buildMessage({ id: 'message-1' })]);
    store.setMeasurementCache('session-1', {
      ...buildMeasurementCache(1),
      layoutVersion: useChatStore.getState().sessions['session-1']?.layoutVersion ?? 0,
    });

    for (let index = 2; index <= 21; index += 1) {
      store.getOrCreateSession(`session-${String(index)}`);
    }

    expect(useChatStore.getState().sessions['session-1']?.messages).toEqual([]);
    expect(useChatStore.getState().sessions['session-1']?.measurementCache).toBeNull();
    expect(getRenderCache('session-1')).toEqual({
      measurements: [
        {
          key: 'width:720:session-1:message-1',
          index: 0,
          start: 0,
          size: 120,
          end: 120,
          lane: 0,
        },
      ],
      messageCount: 1,
      lastMessageId: 'message-1',
      layoutVersion: 1,
      viewportWidth: null,
    });
  });

  it('removes the persistent render cache when the session is destroyed', () => {
    const store = useChatStore.getState();
    store.getOrCreateSession('session-1');
    store.setMeasurementCache('session-1', buildMeasurementCache(1));

    store.destroySession('session-1');

    expect(getRenderCache('session-1')).toBeNull();
  });
});
