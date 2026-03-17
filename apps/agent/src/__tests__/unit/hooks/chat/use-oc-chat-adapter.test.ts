import { renderHook, waitFor } from '@testing-library/react';

import type { ImageAttachment } from '@/components/chat/input/types';
import type { ToolExecution } from '@/stores/agent/tool-store';
import type { QuestionRequest } from '@orbit.build/sdk/v2/client';

const { mockUseOcChat, mockOpenFile, mockOpenUrl, mockAbortSession, mockRevertSession } =
  vi.hoisted(() => ({
    mockUseOcChat: vi.fn(),
    mockOpenFile: vi.fn(),
    mockOpenUrl: vi.fn(),
    mockAbortSession: vi.fn(() => Promise.resolve()),
    mockRevertSession: vi.fn(() => Promise.resolve({ id: 'oc-session' })),
  }));

vi.mock('@/hooks/chat/use-oc-chat', () => ({
  useOcChat: mockUseOcChat,
}));

vi.mock('@/hooks/agent/use-tauri', () => ({
  useTauri: () => ({ postMessage: vi.fn() }),
}));

vi.mock('@/services/opencode/oc-session-service', () => ({
  ocSessionService: {
    abortSession: mockAbortSession,
    revertSession: mockRevertSession,
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

import {
  adaptParts,
  adaptPermission,
  buildOcSessionUsage,
  filterOcMessages,
  findOcRewindTarget,
  syncOcTools,
  useOcChatAdapter,
} from '@/hooks/chat/use-oc-chat-adapter';
import { useToolStore } from '@/stores/agent/tool-store';
import { useOcProviderStore } from '@/stores/opencode';

function makeQuestion(overrides: Partial<QuestionRequest> = {}): QuestionRequest {
  return {
    id: 'question-1',
    sessionID: 'oc-session',
    questions: [
      {
        header: 'Need input',
        question: 'Choose one',
        options: [{ label: 'Yes', description: 'Proceed' }],
      },
    ],
    ...overrides,
  };
}

function makeTool(overrides: Partial<ToolExecution> = {}): ToolExecution {
  return {
    id: 'tool-1',
    messageId: 'msg-1',
    toolName: 'bash',
    toolInput: { command: 'pwd' },
    status: 'running',
    startedAt: 1,
    sessionId: 'oc-session',
    ...overrides,
  };
}

describe('useOcChatAdapter helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useToolStore.getState().reset();
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
                max: {},
              },
            },
          },
        },
      ],
      selectedProviderId: 'anthropic',
      selectedModelId: 'claude-sonnet-4-5',
      variantSelections: { 'anthropic/claude-sonnet-4-5': 'high' },
      selectedAgent: 'plan',
    });
  });

  it('adapts mixed parts with stable offsets, ordinals, and subtask tools', () => {
    const adapted = adaptParts(
      [
        { id: 'p1', sessionID: 'oc-session', messageID: 'msg-1', type: 'text', text: 'Hello ' },
        {
          id: 'p2',
          sessionID: 'oc-session',
          messageID: 'msg-1',
          type: 'reasoning',
          text: 'thinking',
          time: { start: 10, end: 20 },
        },
        {
          id: 'p3',
          sessionID: 'oc-session',
          messageID: 'msg-1',
          type: 'tool',
          callID: 'call-1',
          tool: 'bash',
          state: {
            status: 'running',
            input: { command: 'pwd' },
            title: 'pwd',
            time: { start: 30 },
          },
        },
        { id: 'p4', sessionID: 'oc-session', messageID: 'msg-1', type: 'text', text: 'world' },
        {
          id: 'p5',
          sessionID: 'oc-session',
          messageID: 'msg-1',
          type: 'subtask',
          prompt: 'Inspect files',
          description: 'Inspect files',
          agent: 'explore',
          model: { providerID: 'anthropic', modelID: 'claude-sonnet-4-5' },
        },
      ],
      'msg-1',
      'oc-session'
    );

    expect(adapted.content).toBe('Hello world');
    expect(adapted.thinkingBlocks[0]).toMatchObject({
      content: 'thinking',
      durationMs: 10,
      contentOffset: 6,
      ordinal: 1,
    });
    expect(adapted.tools[0]).toMatchObject({
      id: 'p3',
      toolName: 'bash',
      contentOffset: 6,
      ordinal: 2,
      sessionId: 'oc-session',
    });
    expect(adapted.tools[1]).toMatchObject({
      id: 'p5',
      toolName: 'task',
      toolInput: expect.objectContaining({
        description: 'Inspect files',
        prompt: 'Inspect files',
        subagent_type: 'explore',
        model: 'anthropic/claude-sonnet-4-5',
      }),
      status: 'success',
      ordinal: 4,
    });
  });

  it('maps OpenCode image file parts into attached images without inline text', () => {
    const adapted = adaptParts(
      [
        {
          id: 'file-1',
          sessionID: 'oc-session',
          messageID: 'msg-1',
          type: 'file',
          filename: 'diagram.png',
          mime: 'image/png',
          url: 'data:image/png;base64,abc123',
        },
      ] as Parameters<typeof adaptParts>[0],
      'msg-1',
      'oc-session'
    );

    expect(adapted.content).toBe('');
    expect(adapted.images).toEqual([
      {
        name: 'diagram.png',
        mimeType: 'image/png',
        previewUrl: 'data:image/png;base64,abc123',
      },
    ]);
  });

  it('preserves permission patterns and always-allow support', () => {
    expect(
      adaptPermission({
        id: 'perm-1',
        sessionID: 'oc-session',
        permission: 'write',
        patterns: ['src/**'],
        metadata: { file_path: 'src/app.ts' },
        always: ['src/**'],
        tool: { messageID: 'msg-1', callID: 'call-1' },
      })
    ).toMatchObject({
      requestId: 'perm-1',
      sessionId: 'oc-session',
      toolName: 'write',
      patterns: ['src/**'],
      supportsAlwaysAllow: true,
    });
  });

  it('accumulates assistant token usage from OpenCode messages', () => {
    const usage = buildOcSessionUsage([
      {
        id: 'user-1',
        role: 'user',
        message: { role: 'user' },
        parts: [],
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        message: {
          role: 'assistant',
          cost: 0.25,
          tokens: {
            input: 10,
            output: 20,
            reasoning: 0,
            cache: { read: 2, write: 1 },
          },
        },
        parts: [],
      },
    ] as unknown as Parameters<typeof buildOcSessionUsage>[0]);

    expect(usage).toMatchObject({
      inputTokens: 10,
      outputTokens: 20,
      cacheReadInputTokens: 2,
      cacheCreationInputTokens: 1,
      totalCostUsd: 0.25,
    });
  });

  it('filters reverted OpenCode messages using the session revert point', () => {
    expect(
      filterOcMessages(
        [
          { id: 'msg-1', role: 'user', message: { role: 'user' }, parts: [] },
          { id: 'msg-2', role: 'assistant', message: { role: 'assistant' }, parts: [] },
          { id: 'msg-3', role: 'user', message: { role: 'user' }, parts: [] },
        ] as unknown as Parameters<typeof filterOcMessages>[0],
        'msg-3'
      ).map((entry) => entry.id)
    ).toEqual(['msg-1', 'msg-2']);
  });

  it('finds the user prompt that should be reverted for an assistant turn', () => {
    expect(
      findOcRewindTarget(
        [
          {
            id: 'user-1',
            role: 'user',
            message: { role: 'user' },
            parts: [
              {
                id: 'text-1',
                sessionID: 'oc-session',
                messageID: 'user-1',
                type: 'text',
                text: 'Ship it',
              },
            ],
          },
          {
            id: 'assistant-1',
            role: 'assistant',
            message: { role: 'assistant', parentID: 'user-1' },
            parts: [],
          },
        ] as unknown as Parameters<typeof findOcRewindTarget>[0],
        'assistant-1'
      )
    ).toMatchObject({ messageId: 'user-1', text: 'Ship it' });
  });

  it('diffs tool sync so repeated renders do not replay start events', () => {
    const startTool = vi.fn();
    const completeTool = vi.fn();
    const updateToolInput = vi.fn();
    const running = makeTool();
    const success = makeTool({ status: 'success', success: true, toolOutput: 'done' });

    let synced = syncOcTools(
      [
        {
          chat: { id: 'msg-1', role: 'assistant', content: '', displayedContent: '' },
          hasCompaction: false,
          tools: [running],
        },
      ],
      new Map(),
      { startTool, completeTool, updateToolInput }
    );

    expect(startTool).toHaveBeenCalledTimes(1);
    expect(completeTool).not.toHaveBeenCalled();
    expect(updateToolInput).not.toHaveBeenCalled();

    synced = syncOcTools(
      [
        {
          chat: { id: 'msg-1', role: 'assistant', content: '', displayedContent: '' },
          hasCompaction: false,
          tools: [running],
        },
      ],
      synced,
      { startTool, completeTool, updateToolInput }
    );

    expect(startTool).toHaveBeenCalledTimes(1);
    expect(updateToolInput).toHaveBeenCalledWith('tool-1', running.toolInput);

    syncOcTools(
      [
        {
          chat: { id: 'msg-1', role: 'assistant', content: '', displayedContent: '' },
          hasCompaction: false,
          tools: [success],
        },
      ],
      synced,
      { startTool, completeTool, updateToolInput }
    );

    expect(completeTool).toHaveBeenCalledTimes(1);
    expect(updateToolInput).toHaveBeenCalledTimes(2);
  });

  it('starts and completes fast-finished tools in one pass', () => {
    const startTool = vi.fn();
    const completeTool = vi.fn();
    const updateToolInput = vi.fn();

    syncOcTools(
      [
        {
          chat: { id: 'msg-1', role: 'assistant', content: '', displayedContent: '' },
          hasCompaction: false,
          tools: [makeTool({ status: 'success', success: true, toolOutput: 'done' })],
        },
      ],
      new Map(),
      { startTool, completeTool, updateToolInput }
    );

    expect(startTool).toHaveBeenCalledTimes(1);
    expect(completeTool).toHaveBeenCalledTimes(1);
    expect(updateToolInput).not.toHaveBeenCalled();
  });

  it('updates tool input when a tracked tool stays running', () => {
    const startTool = vi.fn();
    const completeTool = vi.fn();
    const updateToolInput = vi.fn();

    const synced = syncOcTools(
      [
        {
          chat: { id: 'msg-1', role: 'assistant', content: '', displayedContent: '' },
          hasCompaction: false,
          tools: [makeTool({ toolInput: {} })],
        },
      ],
      new Map(),
      { startTool, completeTool, updateToolInput }
    );

    expect(startTool).toHaveBeenCalledTimes(1);
    expect(updateToolInput).not.toHaveBeenCalled();

    const todosInput = {
      todos: [{ id: '1', content: 'Test', status: 'pending' }],
    };

    syncOcTools(
      [
        {
          chat: { id: 'msg-1', role: 'assistant', content: '', displayedContent: '' },
          hasCompaction: false,
          tools: [makeTool({ toolInput: todosInput })],
        },
      ],
      synced,
      { startTool, completeTool, updateToolInput }
    );

    expect(startTool).toHaveBeenCalledTimes(1);
    expect(updateToolInput).toHaveBeenCalledWith('tool-1', todosInput);
    expect(completeTool).not.toHaveBeenCalled();
  });

  it('preserves updated input through completion', () => {
    const startTool = vi.fn();
    const completeTool = vi.fn();
    const updateToolInput = vi.fn();

    let synced = syncOcTools(
      [
        {
          chat: { id: 'msg-1', role: 'assistant', content: '', displayedContent: '' },
          hasCompaction: false,
          tools: [makeTool({ toolInput: {} })],
        },
      ],
      new Map(),
      { startTool, completeTool, updateToolInput }
    );

    const todosInput = {
      todos: [{ id: '1', content: 'Done', status: 'completed' }],
    };

    synced = syncOcTools(
      [
        {
          chat: { id: 'msg-1', role: 'assistant', content: '', displayedContent: '' },
          hasCompaction: false,
          tools: [makeTool({ toolInput: todosInput })],
        },
      ],
      synced,
      { startTool, completeTool, updateToolInput }
    );

    syncOcTools(
      [
        {
          chat: { id: 'msg-1', role: 'assistant', content: '', displayedContent: '' },
          hasCompaction: false,
          tools: [
            makeTool({ status: 'success', success: true, toolOutput: 'ok', toolInput: todosInput }),
          ],
        },
      ],
      synced,
      { startTool, completeTool, updateToolInput }
    );

    expect(updateToolInput).toHaveBeenCalledTimes(2);
    expect(completeTool).toHaveBeenCalledTimes(1);
  });

  it('does not call updateToolInput when a completed tool is first seen', () => {
    const startTool = vi.fn();
    const completeTool = vi.fn();
    const updateToolInput = vi.fn();

    syncOcTools(
      [
        {
          chat: { id: 'msg-1', role: 'assistant', content: '', displayedContent: '' },
          hasCompaction: false,
          tools: [
            makeTool({
              status: 'success',
              success: true,
              toolOutput: 'ok',
              toolInput: { todos: [] },
            }),
          ],
        },
      ],
      new Map(),
      { startTool, completeTool, updateToolInput }
    );

    expect(startTool).toHaveBeenCalledTimes(1);
    expect(completeTool).toHaveBeenCalledTimes(1);
    expect(updateToolInput).not.toHaveBeenCalled();
  });
});

describe('useOcChatAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useToolStore.getState().reset();
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
                max: {},
              },
            },
          },
        },
      ],
      selectedProviderId: 'anthropic',
      selectedModelId: 'claude-sonnet-4-5',
      variantSelections: { 'anthropic/claude-sonnet-4-5': 'high' },
      selectedAgent: 'build',
    });
  });

  it('maps assistant errors, questions, permissions, and session switching', async () => {
    mockUseOcChat.mockReturnValue({
      sessionId: 'oc-session',
      activeSessionTitle: 'OpenCode Session',
      revertMessageId: null,
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          message: {
            id: 'assistant-1',
            sessionID: 'oc-session',
            role: 'assistant',
            parentID: 'user-1',
            providerID: 'anthropic',
            modelID: 'claude-sonnet-4-5',
            mode: 'build',
            agent: 'build',
            path: { cwd: '/repo', root: '/repo' },
            cost: 0.1,
            tokens: {
              input: 11,
              output: 7,
              reasoning: 0,
              cache: { read: 1, write: 0 },
            },
            time: { created: 1, completed: 4 },
            error: {
              name: 'ProviderAuthError',
              data: { providerID: 'anthropic', message: 'Auth failed' },
            },
          },
          parts: [
            {
              id: 'text-1',
              sessionID: 'oc-session',
              messageID: 'assistant-1',
              type: 'text',
              text: 'Nope',
            },
          ],
        },
      ],
      permissions: [
        {
          id: 'perm-1',
          sessionID: 'oc-session',
          permission: 'write',
          patterns: ['src/**'],
          metadata: { file_path: 'src/app.ts' },
          always: ['src/**'],
          tool: { messageID: 'assistant-1', callID: 'call-1' },
        },
      ],
      questions: [makeQuestion()],
      status: { type: 'busy' },
      isAgentBusy: true,
      handleSend: vi.fn(() => Promise.resolve()),
      handleStop: vi.fn(() => Promise.resolve()),
      handlePermissionReply: vi.fn(() => Promise.resolve()),
      handleQuestionReply: vi.fn(() => Promise.resolve()),
      handleQuestionReject: vi.fn(() => Promise.resolve()),
    });

    const { result } = renderHook(() => useOcChatAdapter());

    await waitFor(() => {
      expect(useToolStore.getState().currentSessionId).toBe('oc-session');
    });

    expect(result.current.messages[0]).toMatchObject({
      content: 'Nope',
      interruptReason: 'Auth failed',
      isInterrupted: true,
      parentUuid: 'user-1',
    });
    expect(result.current.pendingPermissions[0]).toMatchObject({
      requestId: 'perm-1',
      patterns: ['src/**'],
      supportsAlwaysAllow: true,
    });
    expect(result.current.questions).toHaveLength(1);
    expect(result.current.sessionUsage).toMatchObject({
      inputTokens: 11,
      outputTokens: 7,
    });
    expect(result.current.isAgentRunning).toBe(true);
  });

  it('forwards the selected model variant when sending', async () => {
    const handleSend = vi.fn(() => Promise.resolve());

    mockUseOcChat.mockReturnValue({
      sessionId: 'oc-session',
      activeSessionTitle: 'OpenCode Session',
      revertMessageId: null,
      messages: [],
      permissions: [],
      questions: [],
      status: { type: 'idle' },
      isAgentBusy: false,
      handleSend,
      handleStop: vi.fn(() => Promise.resolve()),
      handlePermissionReply: vi.fn(() => Promise.resolve()),
      handleQuestionReply: vi.fn(() => Promise.resolve()),
      handleQuestionReject: vi.fn(() => Promise.resolve()),
    });

    const { result } = renderHook(() => useOcChatAdapter());

    result.current.handleSend('Hello');

    await waitFor(() => {
      expect(handleSend).toHaveBeenCalledWith('Hello', {
        agent: 'build',
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-5',
        variant: 'high',
      });
    });
  });

  it('forwards images to send() when provided', async () => {
    const handleSend = vi.fn(() => Promise.resolve());
    const images: ImageAttachment[] = [
      {
        name: 'test.png',
        mimeType: 'image/png',
        data: 'abc',
        previewUrl: '',
      },
    ];

    mockUseOcChat.mockReturnValue({
      sessionId: 'oc-session',
      activeSessionTitle: 'OpenCode Session',
      revertMessageId: null,
      messages: [],
      permissions: [],
      questions: [],
      status: { type: 'idle' },
      isAgentBusy: false,
      handleSend,
      handleStop: vi.fn(() => Promise.resolve()),
      handlePermissionReply: vi.fn(() => Promise.resolve()),
      handleQuestionReply: vi.fn(() => Promise.resolve()),
      handleQuestionReject: vi.fn(() => Promise.resolve()),
    });

    const { result } = renderHook(() => useOcChatAdapter());

    result.current.handleSend('describe this', undefined, images);

    await waitFor(() => {
      expect(handleSend).toHaveBeenCalledWith('describe this', {
        agent: 'build',
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-5',
        variant: 'high',
        images,
      });
    });
  });

  it('strips images before send() when the selected model does not support image input', async () => {
    const handleSend = vi.fn(() => Promise.resolve());
    const images: ImageAttachment[] = [
      {
        name: 'test.png',
        mimeType: 'image/png',
        data: 'abc',
        previewUrl: '',
      },
    ];

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
              supportsImageInput: false,
              variants: {
                high: {},
                max: {},
              },
            },
          },
        },
      ],
    });

    mockUseOcChat.mockReturnValue({
      sessionId: 'oc-session',
      activeSessionTitle: 'OpenCode Session',
      revertMessageId: null,
      messages: [],
      permissions: [],
      questions: [],
      status: { type: 'idle' },
      isAgentBusy: false,
      handleSend,
      handleStop: vi.fn(() => Promise.resolve()),
      handlePermissionReply: vi.fn(() => Promise.resolve()),
      handleQuestionReply: vi.fn(() => Promise.resolve()),
      handleQuestionReject: vi.fn(() => Promise.resolve()),
    });

    const { result } = renderHook(() => useOcChatAdapter());

    result.current.handleSend('describe this', undefined, images);

    await waitFor(() => {
      expect(handleSend).toHaveBeenCalledWith('describe this', {
        agent: 'build',
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-5',
        variant: 'high',
      });
    });
  });

  it('reverts the clicked assistant turn using the parent user message and prefills input', async () => {
    const dispatchEvent = vi.spyOn(window, 'dispatchEvent');

    mockUseOcChat.mockReturnValue({
      sessionId: 'oc-session',
      activeSessionTitle: 'OpenCode Session',
      revertMessageId: null,
      messages: [
        {
          id: 'user-1',
          role: 'user',
          message: { role: 'user' },
          parts: [
            {
              id: 'text-user-1',
              sessionID: 'oc-session',
              messageID: 'user-1',
              type: 'text',
              text: 'Restore this prompt',
            },
          ],
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          message: {
            id: 'assistant-1',
            sessionID: 'oc-session',
            role: 'assistant',
            parentID: 'user-1',
            providerID: 'anthropic',
            modelID: 'claude-sonnet-4-5',
            mode: 'build',
            agent: 'build',
            path: { cwd: '/repo', root: '/repo' },
            cost: 0,
            tokens: {
              input: 1,
              output: 1,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
            time: { created: 1, completed: 2 },
          },
          parts: [],
        },
      ],
      permissions: [],
      questions: [],
      status: { type: 'idle' },
      isAgentBusy: false,
      handleSend: vi.fn(() => Promise.resolve()),
      handleStop: vi.fn(() => Promise.resolve()),
      handlePermissionReply: vi.fn(() => Promise.resolve()),
      handleQuestionReply: vi.fn(() => Promise.resolve()),
      handleQuestionReject: vi.fn(() => Promise.resolve()),
    });

    const { result } = renderHook(() => useOcChatAdapter());

    result.current.handleRewind('assistant-1');

    await waitFor(() => {
      expect(mockRevertSession).toHaveBeenCalledWith('oc-session', 'user-1');
    });
    expect(mockAbortSession).not.toHaveBeenCalled();
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'prefillChatInput',
        detail: { text: 'Restore this prompt' },
      })
    );

    dispatchEvent.mockRestore();
  });

  it('aborts before revert when the OpenCode session is still busy', async () => {
    mockUseOcChat.mockReturnValue({
      sessionId: 'oc-session',
      activeSessionTitle: 'OpenCode Session',
      revertMessageId: null,
      messages: [
        {
          id: 'user-1',
          role: 'user',
          message: { role: 'user' },
          parts: [
            {
              id: 'text-user-1',
              sessionID: 'oc-session',
              messageID: 'user-1',
              type: 'text',
              text: 'Busy revert',
            },
          ],
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          message: {
            id: 'assistant-1',
            sessionID: 'oc-session',
            role: 'assistant',
            parentID: 'user-1',
            providerID: 'anthropic',
            modelID: 'claude-sonnet-4-5',
            mode: 'build',
            agent: 'build',
            path: { cwd: '/repo', root: '/repo' },
            cost: 0,
            tokens: {
              input: 1,
              output: 1,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
            time: { created: 1, completed: 2 },
          },
          parts: [],
        },
      ],
      permissions: [],
      questions: [],
      status: { type: 'busy' },
      isAgentBusy: true,
      handleSend: vi.fn(() => Promise.resolve()),
      handleStop: vi.fn(() => Promise.resolve()),
      handlePermissionReply: vi.fn(() => Promise.resolve()),
      handleQuestionReply: vi.fn(() => Promise.resolve()),
      handleQuestionReject: vi.fn(() => Promise.resolve()),
    });

    const { result } = renderHook(() => useOcChatAdapter());

    result.current.handleRewind('assistant-1');

    await waitFor(() => {
      expect(mockAbortSession).toHaveBeenCalledWith('oc-session');
      expect(mockRevertSession).toHaveBeenCalledWith('oc-session', 'user-1');
    });
  });
});
