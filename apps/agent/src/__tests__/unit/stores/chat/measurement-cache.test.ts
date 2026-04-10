import type { ChatMeasurementCache } from '@/stores/chat/chat-store';

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

function buildMeasurementCache(messageCount: number): ChatMeasurementCache {
  return {
    measurements: Array.from({ length: messageCount }, (_value, index) => ({
      key: `width:720:session-a:message-${String(index + 1)}`,
      index,
      start: index * 120,
      size: 120,
      end: (index + 1) * 120,
      lane: 0,
    })),
    messageCount,
    lastMessageId: messageCount > 0 ? `message-${String(messageCount)}` : null,
    layoutVersion: messageCount,
    viewportWidth: 720,
  };
}

describe('ChatStore measurement cache', () => {
  beforeEach(() => {
    resetChatStore();
  });

  afterEach(() => {
    resetChatStore();
  });

  it('stores measurement caches on a session', () => {
    const store = useChatStore.getState();
    store.getOrCreateSession('session-a');

    const cache = buildMeasurementCache(2);
    store.setMeasurementCache('session-a', cache);

    expect(useChatStore.getState().sessions['session-a']?.measurementCache).toEqual(cache);
  });

  it('keeps measurement caches attached when a session id is remapped', () => {
    const store = useChatStore.getState();
    store.getOrCreateSession('session-old');
    const cache = buildMeasurementCache(1);
    store.setMeasurementCache('session-old', cache);

    store.remapSession('session-old', 'session-new');

    expect(useChatStore.getState().sessions['session-new']?.measurementCache).toEqual(cache);
  });

  it('clears measurement caches when the session is evicted from memory', () => {
    const store = useChatStore.getState();
    store.getOrCreateSession('session-1');
    store.setMeasurementCache('session-1', buildMeasurementCache(1));

    for (let index = 2; index <= 21; index += 1) {
      store.getOrCreateSession(`session-${String(index)}`);
    }

    expect(useChatStore.getState().sessions['session-1']?.measurementCache).toBeNull();
  });
});
