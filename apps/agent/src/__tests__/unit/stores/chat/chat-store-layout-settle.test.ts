import { clearAllChatLayoutMutationRuntimeState, useChatStore } from '@/stores/chat/chat-store';

function resetStore(): void {
  clearAllChatLayoutMutationRuntimeState();
  useChatStore.setState(useChatStore.getInitialState(), true);
}

describe('ChatStore layout settle tracking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStore();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    resetStore();
  });

  it('force-closes leaked layout mutations via the watchdog timeout', async () => {
    const store = useChatStore.getState();
    store.getOrCreateSession('session-a');

    const beforeSettledVersion =
      useChatStore.getState().sessions['session-a']?.layoutSettledVersion ?? 0;

    store.layoutMutationStart('session-a', 'bash-output-shiki', 25);

    expect(useChatStore.getState().sessions['session-a']?.layoutPendingCount).toBe(1);

    await vi.advanceTimersByTimeAsync(30);

    expect(useChatStore.getState().sessions['session-a']?.layoutPendingCount).toBe(0);
    expect(useChatStore.getState().sessions['session-a']?.layoutSettledVersion).toBe(
      beforeSettledVersion + 1
    );
    expect(useChatStore.getState().sessions['session-a']?.layoutLeakDeadlineAt).toBeNull();
  });

  it('tracks concurrent mutations independently and settles only after the last token closes', () => {
    const store = useChatStore.getState();
    store.getOrCreateSession('session-a');

    const beforeSettledVersion =
      useChatStore.getState().sessions['session-a']?.layoutSettledVersion ?? 0;

    const firstToken = store.layoutMutationStart('session-a', 'message-image', 100);
    const secondToken = store.layoutMutationStart('session-a', 'message-image', 100);

    expect(firstToken).not.toBe(secondToken);
    expect(useChatStore.getState().sessions['session-a']?.layoutPendingCount).toBe(2);

    store.layoutMutationEnd('session-a', firstToken);

    expect(useChatStore.getState().sessions['session-a']?.layoutPendingCount).toBe(1);
    expect(useChatStore.getState().sessions['session-a']?.layoutSettledVersion).toBe(
      beforeSettledVersion
    );

    store.layoutMutationEnd('session-a', secondToken);

    expect(useChatStore.getState().sessions['session-a']?.layoutPendingCount).toBe(0);
    expect(useChatStore.getState().sessions['session-a']?.layoutSettledVersion).toBe(
      beforeSettledVersion + 1
    );
  });
});
