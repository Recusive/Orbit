import { act, renderHook, waitFor } from '@testing-library/react';

const { mockConversationAddMessage, mockConversationLoad, mockPostMessage, mockRestoreSelection } =
  vi.hoisted(() => ({
    mockConversationAddMessage: vi.fn<
      [string, Record<string, unknown>, string | undefined, string | undefined],
      Promise<void>
    >(),
    mockConversationLoad: vi.fn<[string], Promise<null>>(),
    mockPostMessage: vi.fn<(message: Record<string, unknown>) => void>(),
    mockRestoreSelection: vi.fn<
      [],
      Promise<{
        status: 'started' | 'missing' | 'skipped';
        sessionId: string | null;
        requestId?: number;
      }>
    >(),
  }));

vi.mock('@/hooks/agent/use-tauri', () => ({
  useTauri: () => ({
    postMessage: mockPostMessage,
    isConnected: true,
    isMockMode: true,
  }),
}));

vi.mock('@/lib/api', () => ({
  conversationAddMessage: mockConversationAddMessage,
  conversationLoad: mockConversationLoad,
}));

vi.mock('@/lib/query', () => ({
  appendMessageToConversationCache: vi.fn(),
  markConversationDirty: vi.fn(),
}));

vi.mock('@/services/chat/image-attachment-cache', () => ({
  buildOptimisticAttachedImages: (images?: unknown[]) => images,
  cacheAttachedImagesForMessage: vi.fn(),
}));

vi.mock('@/services/conversations', () => ({
  getConversationUiBridge: () => ({
    restoreSelection: mockRestoreSelection,
  }),
}));

import { useChatMessages } from '@/hooks/chat/use-chat-messages';
import { useMessageBufferStore } from '@/stores/agent/message-buffer-store';
import { useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';
import { useSessionSwitchStore } from '@/stores/chat/session-switch-store';
import { useUIStore } from '@/stores/ui/ui-store';

function resetStores(): void {
  useToolStore.getState().reset();
  useMessageBufferStore.setState({ pendingLoads: new Map() });
  useChatStore.setState(useChatStore.getInitialState(), true);
  useSessionSwitchStore.setState(useSessionSwitchStore.getInitialState(), true);
  useUIStore.setState({
    ...useUIStore.getInitialState(),
    workspacePath: '/workspace',
    activeWorktreePath: null,
    activeConversationId: 'session-a',
    activeConversationTitle: 'Shown Session',
  });
}

describe('useChatMessages prime session loading', () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
    mockConversationAddMessage.mockResolvedValue(undefined);
    mockConversationLoad.mockResolvedValue(null);
    mockRestoreSelection.mockResolvedValue({ status: 'missing', sessionId: null });

    const chatStore = useChatStore.getState();
    chatStore.getOrCreateSession('session-a');
    chatStore.setActiveSession('session-a');
    chatStore.markSessionLoaded('session-a');
  });

  afterEach(() => {
    resetStores();
    vi.clearAllMocks();
  });

  it('loads the primed pending session instead of the shown session on the slow path', async () => {
    useSessionSwitchStore.setState({
      pending: {
        sessionId: 'session-b',
        title: 'Pending Session',
        sourceSessionId: 'session-a',
        loadStrategy: 'slow',
        conversationGeneration: 0,
        workspaceEpoch: 0,
      },
      requestId: 1,
      status: 'hidden-priming',
    });

    renderHook(() => useChatMessages());

    await waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'conversation:load',
          session_id: 'session-b',
        })
      );
    });
  });

  it('does not dispatch a slow load while the pending session is on the query path', async () => {
    useSessionSwitchStore.setState({
      pending: {
        sessionId: 'session-b',
        title: 'Pending Session',
        sourceSessionId: 'session-a',
        loadStrategy: 'query',
        conversationGeneration: 0,
        workspaceEpoch: 0,
      },
      requestId: 1,
      status: 'hidden-priming',
    });

    renderHook(() => useChatMessages());

    await waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'conversation:list',
        })
      );
    });

    expect(mockPostMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'conversation:load',
        session_id: 'session-b',
      })
    );
  });

  it('retries initial restore after a started restore attempt is cleared', async () => {
    resetStores();
    useUIStore.setState({
      ...useUIStore.getInitialState(),
      workspacePath: '/workspace',
      activeWorktreePath: null,
      activeConversationId: null,
      activeConversationTitle: null,
      conversations: [],
    });
    mockRestoreSelection.mockResolvedValue({
      status: 'started',
      sessionId: 'restored-session',
      requestId: 11,
    });

    renderHook(() => useChatMessages());

    await waitFor(() => {
      expect(mockRestoreSelection.mock.calls.length).toBeGreaterThan(0);
    });
    const initialCallCount = mockRestoreSelection.mock.calls.length;

    act(() => {
      useSessionSwitchStore.setState({
        pending: {
          sessionId: 'restored-session',
          title: 'Restored',
          sourceSessionId: null,
          loadStrategy: 'query',
          conversationGeneration: 0,
          workspaceEpoch: 0,
        },
        requestId: 11,
        status: 'hidden-priming',
      });
    });

    act(() => {
      useSessionSwitchStore.setState({
        pending: null,
        status: 'idle',
      });
      useSessionSwitchStore.getState().resetInitialRestorePending(11);
    });

    await waitFor(() => {
      expect(mockRestoreSelection.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });
});
