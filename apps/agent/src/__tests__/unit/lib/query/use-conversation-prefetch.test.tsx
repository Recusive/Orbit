import { act, renderHook } from '@testing-library/react';

import { useConversationPrefetch } from '@/lib/query/use-conversation-prefetch';
import { useChatStore } from '@/stores/chat/chat-store';
import { useSessionSwitchStore } from '@/stores/chat/session-switch-store';

const loadConversationDetailFreshMock = vi.fn();
const preloadRenderCacheFromIdbMock = vi.fn();

vi.mock('@/lib/query/conversation-detail', () => ({
  loadConversationDetailFresh: (sessionId: string) => loadConversationDetailFreshMock(sessionId),
}));

vi.mock('@/stores/chat/render-cache-store', () => ({
  preloadRenderCacheFromIdb: (sessionId: string) => preloadRenderCacheFromIdbMock(sessionId),
}));

describe('useConversationPrefetch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    loadConversationDetailFreshMock.mockReset();
    preloadRenderCacheFromIdbMock.mockReset();
    useChatStore.setState({
      sessions: {
        'session-hover': {
          messages: [],
          isAgentRunning: false,
          isStopPending: false,
          scrollIntent: null,
          hydrationState: 'hydrated',
          layoutVersion: 0,
          layoutPendingCount: 0,
          layoutSettledVersion: 0,
          lastLayoutMutationAt: null,
          layoutLeakDeadlineAt: null,
          virtuosoSizeCache: null,
        },
      },
      activeSessionId: null,
    });
    useSessionSwitchStore.setState({
      status: 'idle',
      requestId: 0,
      pending: null,
      readyInstances: {},
      preMountSessionId: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    useSessionSwitchStore.getState().clearPreMount();
  });

  it('prefetches conversation detail and requests a hidden pre-mount after the hover delay', async () => {
    const { result } = renderHook(() => useConversationPrefetch());

    act(() => {
      result.current.prefetch('session-hover');
    });

    expect(loadConversationDetailFreshMock).toHaveBeenCalledWith('session-hover');
    expect(preloadRenderCacheFromIdbMock).toHaveBeenCalledWith('session-hover');
    expect(useSessionSwitchStore.getState().preMountSessionId).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(useSessionSwitchStore.getState().preMountSessionId).toBe('session-hover');
  });

  it('cancels a scheduled pre-mount before the delay elapses', async () => {
    const { result } = renderHook(() => useConversationPrefetch());

    act(() => {
      result.current.prefetch('session-hover');
      result.current.cancel('session-hover');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(useSessionSwitchStore.getState().preMountSessionId).toBeNull();
  });
});
