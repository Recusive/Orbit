import { act, renderHook } from '@testing-library/react';

const { mockCompactSession, mockOpenFile, mockOpenUrl, mockToastWarning, mockUseOcChat } =
  vi.hoisted(() => ({
    mockCompactSession: vi.fn(() => Promise.resolve()),
    mockOpenFile: vi.fn(),
    mockOpenUrl: vi.fn(),
    mockToastWarning: vi.fn(),
    mockUseOcChat: vi.fn(),
  }));

vi.mock('sonner', () => ({
  toast: {
    warning: mockToastWarning,
  },
}));

vi.mock('@/hooks/chat/use-oc-chat', () => ({
  useOcChat: mockUseOcChat,
}));

vi.mock('@/hooks/agent/use-tauri', () => ({
  useTauri: () => ({ postMessage: vi.fn() }),
}));

vi.mock('@/services/opencode/oc-session-service', () => ({
  ocSessionService: {
    compactSession: mockCompactSession,
    abortSession: vi.fn(() => Promise.resolve()),
    revertSession: vi.fn(() => Promise.resolve({ id: 'oc-session' })),
  },
}));

vi.mock('@/hooks/chat/handlers/chat-actions', async () => {
  const actual = await vi.importActual('@/hooks/chat/handlers/chat-actions');
  return {
    ...actual,
    createChatOpenHandlers: () => ({
      handleOpenFile: mockOpenFile,
      handleOpenUrl: mockOpenUrl,
    }),
  };
});

import type { OcMessage, OcPart } from '@/types/opencode';

import { useOcChatAdapter, buildOcSessionUsage } from '@/hooks/chat/use-oc-chat-adapter';
import { useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';
import { useOcProviderStore } from '@/stores/opencode';

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

function resetProviderStore(): void {
  useOcProviderStore.getState().clear();
  useOcProviderStore.setState({
    providers: [
      {
        id: 'anthropic',
        name: 'Anthropic',
        env: [],
        models: {
          'claude-sonnet-4-5': {
            id: 'claude-sonnet-4-5',
            name: 'Claude Sonnet 4.5',
            supportsImageInput: true,
            variants: {
              high: {},
            },
          },
        },
      },
    ],
    selectedProviderId: 'anthropic',
    selectedModelId: 'claude-sonnet-4-5',
    selectedAgent: 'build',
    variantSelections: {
      'anthropic/claude-sonnet-4-5': 'high',
    },
  });
}

function createOcChatReturn(overrides: Partial<ReturnType<typeof mockUseOcChat>> = {}): {
  sessionId: string | null;
  activeSessionTitle: string | null;
  revertMessageId: string | null;
  messages: [];
  permissions: [];
  questions: [];
  status: { type: 'idle' };
  isAgentBusy: boolean;
  handleSend: ReturnType<typeof vi.fn>;
  handleStop: ReturnType<typeof vi.fn>;
  handlePermissionReply: ReturnType<typeof vi.fn>;
  handleQuestionReply: ReturnType<typeof vi.fn>;
  handleQuestionReject: ReturnType<typeof vi.fn>;
} {
  return {
    sessionId: 'oc-session',
    activeSessionTitle: 'OpenCode Session',
    revertMessageId: null,
    messages: [],
    permissions: [],
    questions: [],
    status: { type: 'idle' },
    isAgentBusy: false,
    handleSend: vi.fn(() => Promise.resolve()),
    handleStop: vi.fn(() => Promise.resolve()),
    handlePermissionReply: vi.fn(() => Promise.resolve()),
    handleQuestionReply: vi.fn(() => Promise.resolve()),
    handleQuestionReject: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

describe('useOcChatAdapter /compact interception', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useToolStore.getState().reset();
    resetChatStore();
    resetProviderStore();
    mockCompactSession.mockResolvedValue(undefined);
  });

  afterEach(() => {
    resetChatStore();
    useToolStore.getState().reset();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('intercepts /compact, calls compactSession, and does not call send()', () => {
    const handleSend = vi.fn(() => Promise.resolve());
    mockUseOcChat.mockReturnValue(createOcChatReturn({ handleSend }));

    const { result } = renderHook(() => useOcChatAdapter());

    act(() => {
      result.current.handleSend('/compact');
    });

    expect(mockCompactSession).toHaveBeenCalledWith('oc-session', 'anthropic', 'claude-sonnet-4-5');
    expect(handleSend).not.toHaveBeenCalled();
    expect(useChatStore.getState().activeCompactions['oc-session']).toMatchObject({
      backend: 'opencode',
      status: 'pending',
    });
  });

  it('treats /summarize as an alias for /compact', () => {
    mockUseOcChat.mockReturnValue(createOcChatReturn());

    const { result } = renderHook(() => useOcChatAdapter());

    act(() => {
      result.current.handleSend('/summarize');
    });

    expect(mockCompactSession).toHaveBeenCalledWith('oc-session', 'anthropic', 'claude-sonnet-4-5');
  });

  it('does nothing when /compact is used without an active session', () => {
    const handleSend = vi.fn(() => Promise.resolve());
    mockUseOcChat.mockReturnValue(createOcChatReturn({ sessionId: null, handleSend }));

    const { result } = renderHook(() => useOcChatAdapter());

    act(() => {
      result.current.handleSend('/compact');
    });

    expect(mockCompactSession).not.toHaveBeenCalled();
    expect(handleSend).not.toHaveBeenCalled();
  });

  it('shows a warning when no provider is selected', () => {
    useOcProviderStore.setState({ selectedProviderId: null });
    mockUseOcChat.mockReturnValue(createOcChatReturn());

    const { result } = renderHook(() => useOcChatAdapter());

    act(() => {
      result.current.handleSend('/compact');
    });

    expect(mockToastWarning).toHaveBeenCalledWith('Connect a provider to compact this session');
    expect(mockCompactSession).not.toHaveBeenCalled();
  });

  it('shows a warning when no model is selected', () => {
    useOcProviderStore.setState({ selectedModelId: null });
    mockUseOcChat.mockReturnValue(createOcChatReturn());

    const { result } = renderHook(() => useOcChatAdapter());

    act(() => {
      result.current.handleSend('/compact');
    });

    expect(mockToastWarning).toHaveBeenCalledWith('Connect a provider to compact this session');
    expect(mockCompactSession).not.toHaveBeenCalled();
  });

  it('blocks repeated /compact requests on the same session while pending', () => {
    useChatStore.getState().markCompacting('oc-session', {
      backend: 'opencode',
      messageId: 'existing-message',
      status: 'pending',
    });
    mockUseOcChat.mockReturnValue(createOcChatReturn());

    const { result } = renderHook(() => useOcChatAdapter());

    act(() => {
      result.current.handleSend('/compact');
    });

    expect(mockCompactSession).not.toHaveBeenCalled();
  });

  it('blocks same-session retries after the compaction times out', () => {
    useChatStore.getState().markCompacting('oc-session', {
      backend: 'opencode',
      messageId: 'existing-message',
      status: 'timed_out',
    });
    mockUseOcChat.mockReturnValue(createOcChatReturn());

    const { result } = renderHook(() => useOcChatAdapter());

    act(() => {
      result.current.handleSend('/compact');
    });

    expect(mockCompactSession).not.toHaveBeenCalled();
  });

  it('allows compacting session B while session A is already compacting', () => {
    useChatStore.getState().markCompacting('session-a', {
      backend: 'opencode',
      messageId: 'message-a',
      status: 'pending',
    });
    mockUseOcChat.mockReturnValue(createOcChatReturn({ sessionId: 'session-b' }));

    const { result } = renderHook(() => useOcChatAdapter());

    act(() => {
      result.current.handleSend('/compact');
    });

    expect(mockCompactSession).toHaveBeenCalledWith('session-b', 'anthropic', 'claude-sonnet-4-5');
    expect(useChatStore.getState().activeCompactions['session-a']).toBeDefined();
    expect(useChatStore.getState().activeCompactions['session-b']).toBeDefined();
  });

  it('settles the compaction entry immediately when compactSession fails', async () => {
    mockCompactSession.mockRejectedValueOnce(new Error('compact failed'));
    mockUseOcChat.mockReturnValue(createOcChatReturn());

    const { result } = renderHook(() => useOcChatAdapter());

    act(() => {
      result.current.handleSend('/compact');
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(useChatStore.getState().activeCompactions['oc-session']).toBeUndefined();
  });

  it('forwards non-compact text to send() with the selected provider, model, and variant', () => {
    const handleSend = vi.fn(() => Promise.resolve());
    mockUseOcChat.mockReturnValue(createOcChatReturn({ handleSend }));

    const { result } = renderHook(() => useOcChatAdapter());

    act(() => {
      result.current.handleSend('Ship it');
    });

    expect(handleSend).toHaveBeenCalledWith('Ship it', {
      agent: 'build',
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-5',
      variant: 'high',
    });
  });

  it('appends a synthetic /compact message for the active session compaction', () => {
    useChatStore.getState().markCompacting('oc-session', {
      backend: 'opencode',
      messageId: 'synthetic-message',
      status: 'pending',
    });
    mockUseOcChat.mockReturnValue(createOcChatReturn());

    const { result } = renderHook(() => useOcChatAdapter());

    expect(result.current.messages.at(-1)).toMatchObject({
      id: 'synthetic-message',
      role: 'user',
      displayedContent: '/compact',
    });
  });

  it('does not append a synthetic /compact message for other sessions', () => {
    useChatStore.getState().markCompacting('other-session', {
      backend: 'opencode',
      messageId: 'synthetic-message',
      status: 'pending',
    });
    mockUseOcChat.mockReturnValue(createOcChatReturn());

    const { result } = renderHook(() => useOcChatAdapter());

    expect(
      result.current.messages.find((message) => message.id === 'synthetic-message')
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildOcSessionUsage — last-assistant-snapshot token calculation
// ---------------------------------------------------------------------------

interface OcRenderedMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly message: OcMessage;
  readonly parts: OcPart[];
}

function createTokens(
  overrides: Partial<{
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cacheWrite: number;
  }> = {}
): { input: number; output: number; reasoning: number; cache: { read: number; write: number } } {
  return {
    input: overrides.input ?? 0,
    output: overrides.output ?? 0,
    reasoning: overrides.reasoning ?? 0,
    cache: {
      read: overrides.cacheRead ?? 0,
      write: overrides.cacheWrite ?? 0,
    },
  };
}

function createAssistantEntry(
  id: string,
  tokens: ReturnType<typeof createTokens>,
  cost: number
): OcRenderedMessage {
  return {
    id,
    role: 'assistant',
    message: {
      id,
      sessionID: 'session-1',
      role: 'assistant',
      time: { created: 1 },
      parentID: '',
      modelID: 'claude-sonnet-4-5',
      providerID: 'anthropic',
      mode: 'default',
      agent: 'build',
      path: { cwd: '/', root: '/' },
      cost,
      tokens,
    } as OcMessage,
    parts: [],
  };
}

function createUserEntry(id: string): OcRenderedMessage {
  return {
    id,
    role: 'user',
    message: {
      id,
      sessionID: 'session-1',
      role: 'user',
      time: { created: 1 },
    } as OcMessage,
    parts: [],
  };
}

describe('buildOcSessionUsage', () => {
  it("multiple assistant messages → returns last one's tokens", () => {
    const messages: OcRenderedMessage[] = [
      createUserEntry('u1'),
      createAssistantEntry('a1', createTokens({ input: 100, output: 50 }), 0.01),
      createUserEntry('u2'),
      createAssistantEntry('a2', createTokens({ input: 500, output: 200 }), 0.05),
    ];

    const usage = buildOcSessionUsage(messages);

    expect(usage.inputTokens).toBe(500);
    expect(usage.outputTokens).toBe(200);
  });

  it('last assistant has zero tokens, earlier one has tokens → returns earlier one', () => {
    const messages: OcRenderedMessage[] = [
      createUserEntry('u1'),
      createAssistantEntry('a1', createTokens({ input: 300, output: 100 }), 0.03),
      createUserEntry('u2'),
      createAssistantEntry('a2', createTokens(), 0),
    ];

    const usage = buildOcSessionUsage(messages);

    expect(usage.inputTokens).toBe(300);
    expect(usage.outputTokens).toBe(100);
  });

  it('assistant with only reasoning tokens is not skipped', () => {
    const messages: OcRenderedMessage[] = [
      createUserEntry('u1'),
      createAssistantEntry('a1', createTokens({ reasoning: 150 }), 0.02),
    ];

    const usage = buildOcSessionUsage(messages);

    // reasoning is not included in input/output but total > 0 so the entry is used
    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
    expect(usage.totalCostUsd).toBe(0.02);
  });

  it('no assistant messages → returns zeroes', () => {
    const messages: OcRenderedMessage[] = [createUserEntry('u1'), createUserEntry('u2')];

    const usage = buildOcSessionUsage(messages);

    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
    expect(usage.cacheReadInputTokens).toBe(0);
    expect(usage.cacheCreationInputTokens).toBe(0);
    expect(usage.totalCostUsd).toBe(0);
  });

  it('cost is still cumulative across all assistants (not snapshot)', () => {
    const messages: OcRenderedMessage[] = [
      createUserEntry('u1'),
      createAssistantEntry('a1', createTokens({ input: 100, output: 50 }), 0.01),
      createUserEntry('u2'),
      createAssistantEntry('a2', createTokens({ input: 500, output: 200 }), 0.05),
    ];

    const usage = buildOcSessionUsage(messages);

    expect(usage.totalCostUsd).toBeCloseTo(0.06, 10);
  });

  it('user messages are skipped', () => {
    const messages: OcRenderedMessage[] = [createUserEntry('u1')];

    const usage = buildOcSessionUsage(messages);

    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
    expect(usage.totalCostUsd).toBe(0);
  });
});
