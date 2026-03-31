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

function createCompaction(
  overrides: Partial<ReturnType<typeof getBaseCompaction>> = {}
): ReturnType<typeof getBaseCompaction> {
  return {
    ...getBaseCompaction(),
    ...overrides,
  };
}

function getBaseCompaction(): {
  backend: 'claude';
  messageId: string;
  status: 'pending' | 'timed_out';
} {
  return {
    backend: 'claude',
    messageId: 'message-1',
    status: 'pending',
  };
}

describe('ChatStore per-session compaction state', () => {
  beforeEach(() => {
    resetChatStore();
  });

  afterEach(() => {
    resetChatStore();
  });

  it('adds a pending compaction entry for a session', () => {
    useChatStore.getState().markCompacting('session-1', createCompaction());

    expect(useChatStore.getState().activeCompactions).toEqual({
      'session-1': createCompaction(),
    });
  });

  it('tracks compactions independently across sessions', () => {
    useChatStore
      .getState()
      .markCompacting('session-1', createCompaction({ messageId: 'message-1' }));
    useChatStore
      .getState()
      .markCompacting('session-2', createCompaction({ messageId: 'message-2' }));

    expect(Object.keys(useChatStore.getState().activeCompactions)).toEqual([
      'session-1',
      'session-2',
    ]);
  });

  it('transitions a matching pending compaction to timed_out', () => {
    useChatStore
      .getState()
      .markCompacting('session-1', createCompaction({ messageId: 'message-1' }));

    useChatStore.getState().markCompactionTimedOut('session-1', 'message-1');

    expect(useChatStore.getState().activeCompactions['session-1']).toEqual(
      createCompaction({ messageId: 'message-1', status: 'timed_out' })
    );
  });

  it('ignores stale timeout attempts when the message id does not match', () => {
    useChatStore
      .getState()
      .markCompacting('session-1', createCompaction({ messageId: 'message-1' }));

    useChatStore.getState().markCompactionTimedOut('session-1', 'message-2');

    expect(useChatStore.getState().activeCompactions['session-1']).toEqual(
      createCompaction({ messageId: 'message-1' })
    );
  });

  it('ignores timeout attempts for sessions without a compaction entry', () => {
    useChatStore.getState().markCompactionTimedOut('missing-session', 'message-1');

    expect(useChatStore.getState().activeCompactions).toEqual({});
  });

  it('ignores timeout attempts after the entry is already timed_out', () => {
    useChatStore
      .getState()
      .markCompacting(
        'session-1',
        createCompaction({ messageId: 'message-1', status: 'timed_out' })
      );

    useChatStore.getState().markCompactionTimedOut('session-1', 'message-1');

    expect(useChatStore.getState().activeCompactions['session-1']).toEqual(
      createCompaction({ messageId: 'message-1', status: 'timed_out' })
    );
  });

  it('removes a pending compaction entry when settled', () => {
    useChatStore.getState().markCompacting('session-1', createCompaction());

    useChatStore.getState().settleCompaction('session-1');

    expect(useChatStore.getState().activeCompactions['session-1']).toBeUndefined();
  });

  it('removes a timed_out compaction entry when settled', () => {
    useChatStore.getState().markCompacting('session-1', createCompaction({ status: 'timed_out' }));

    useChatStore.getState().settleCompaction('session-1');

    expect(useChatStore.getState().activeCompactions['session-1']).toBeUndefined();
  });

  it('does not affect other sessions when settling one compaction', () => {
    useChatStore
      .getState()
      .markCompacting('session-1', createCompaction({ messageId: 'message-1' }));
    useChatStore
      .getState()
      .markCompacting('session-2', createCompaction({ messageId: 'message-2' }));

    useChatStore.getState().settleCompaction('session-1');

    expect(useChatStore.getState().activeCompactions).toEqual({
      'session-2': createCompaction({ messageId: 'message-2' }),
    });
  });

  it('clears compactions for the claude backend', () => {
    useChatStore
      .getState()
      .markCompacting('session-2', createCompaction({ backend: 'claude', messageId: 'message-2' }));
    useChatStore
      .getState()
      .markCompacting('session-3', createCompaction({ backend: 'claude', messageId: 'message-3' }));

    useChatStore.getState().clearCompactionsByBackend('claude');

    expect(useChatStore.getState().activeCompactions).toEqual({});
  });

  it('keeps a newer compaction intact when an older timeout fires later', () => {
    useChatStore
      .getState()
      .markCompacting('session-1', createCompaction({ messageId: 'message-a' }));
    useChatStore.getState().settleCompaction('session-1');
    useChatStore
      .getState()
      .markCompacting('session-1', createCompaction({ messageId: 'message-b' }));

    useChatStore.getState().markCompactionTimedOut('session-1', 'message-a');

    expect(useChatStore.getState().activeCompactions['session-1']).toEqual(
      createCompaction({ messageId: 'message-b' })
    );
  });

  it('migrates compaction state when the session id is remapped', () => {
    useChatStore.getState().markCompacting('session-old', createCompaction());

    useChatStore.getState().remapSession('session-old', 'session-new');

    expect(useChatStore.getState().activeCompactions).toEqual({
      'session-new': createCompaction(),
    });
  });
});
