import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { ChatMessage } from '@/components/chat/messages/types';
import type { ToolExecution } from '@/stores/agent/tool-store';
import type { QueuedMessage } from '@/stores/chat/queued-message-store';
import type { ComponentProps, ReactNode } from 'react';

const {
  messageItemPropsById,
  mockVirtuosoMessageListProps,
  queuedMessageBubbleProps,
  replaceDataMock,
  scrollerScrollToMock,
  scrollToItemMock,
} = vi.hoisted(() => ({
  messageItemPropsById: new Map<string, unknown>(),
  mockVirtuosoMessageListProps: vi.fn(),
  queuedMessageBubbleProps: [] as unknown[],
  replaceDataMock: vi.fn(),
  scrollerScrollToMock: vi.fn(),
  scrollToItemMock: vi.fn(),
}));

interface MockMessageListContext {
  readonly toolsByMessageId: Map<string, ToolExecution[]>;
  readonly lastAssistantMessageId: string | null;
  readonly lastInAssistantGroupIds: Set<string>;
  readonly messageCount: number;
  readonly isAgentRunning: boolean;
  readonly animatingMessageIds: Set<string>;
  readonly onRewind: (messageId: string) => void;
  readonly onOpenFile: (path: string) => void;
  readonly onOpenUrl: (url: string) => void;
  readonly onFeedback: () => void;
  readonly onAnimationComplete: (messageId: string) => void;
}

interface MockMessageItemProps {
  readonly message: ChatMessage;
  readonly tools: ToolExecution[];
  readonly isLastAssistantMessage: boolean;
  readonly isLastInAssistantGroup: boolean;
  readonly isLastMessage: boolean;
  readonly isAgentRunning: boolean;
  readonly animate?: boolean | undefined;
  readonly onAnimationComplete?: ((messageId: string) => void) | undefined;
  readonly onRewind: (messageId: string) => void;
  readonly onOpenFile: (path: string) => void;
  readonly onOpenUrl: (url: string) => void;
  readonly onFeedback: () => void;
}

interface MockQueuedMessageBubbleProps {
  readonly message: QueuedMessage;
  readonly onCancel: () => void;
}

interface MockVirtuosoMessageListMethods<TData> {
  readonly data: {
    readonly replace: (
      data: TData[],
      options?: {
        readonly initialLocation?: { readonly index: number | 'LAST'; readonly align?: string };
        readonly purgeItemSizes?: boolean;
      }
    ) => void;
  };
  readonly scrollToItem: (location: {
    readonly index: number | 'LAST';
    readonly align?: string;
    readonly behavior?: string;
  }) => void;
  readonly scrollerElement: () => {
    readonly scrollHeight: number;
    readonly scrollTo: (options: ScrollToOptions) => void;
  };
  readonly getScrollLocation: () => {
    readonly bottomOffset: number;
    readonly visibleListHeight: number;
  };
}

interface MockVirtuosoMessageListProps<TData, TContext> {
  readonly className?: string | undefined;
  readonly computeItemKey?:
    | ((params: {
        readonly data: TData;
        readonly index: number;
        readonly context: TContext;
      }) => React.Key)
    | undefined;
  readonly context?: TContext | undefined;
  readonly initialData?: readonly TData[] | undefined;
  readonly initialLocation?:
    | {
        readonly index: number | 'LAST';
        readonly align?: string;
      }
    | null
    | undefined;
  readonly data?:
    | {
        readonly data: readonly TData[] | null | undefined;
        readonly scrollModifier?: unknown;
      }
    | null
    | undefined;
  readonly Footer?: ((props: { readonly context: TContext }) => ReactNode) | undefined;
  readonly Header?: ((props: { readonly context: TContext }) => ReactNode) | undefined;
  readonly onScroll?: ((location: { readonly isAtBottom: boolean }) => void) | undefined;
  readonly StickyFooter?: ((props: { readonly context: TContext }) => ReactNode) | undefined;
  readonly ItemContent?:
    | ((props: {
        readonly data: TData;
        readonly index: number;
        readonly prevData: TData | null;
        readonly nextData: TData | null;
        readonly context: TContext;
      }) => ReactNode)
    | undefined;
  readonly shortSizeAlign?: string | undefined;
  readonly style?: React.CSSProperties | undefined;
}

vi.mock('@virtuoso.dev/message-list', async () => {
  const React = await import('react');

  return {
    VirtuosoMessageListLicense: ({ children }: { readonly children: ReactNode }) => <>{children}</>,
    VirtuosoMessageList: React.forwardRef(function MockVirtuosoMessageList<TData, TContext>(
      props: MockVirtuosoMessageListProps<TData, TContext>,
      ref: React.ForwardedRef<MockVirtuosoMessageListMethods<TData>>
    ) {
      React.useImperativeHandle(ref, () => ({
        data: {
          replace: replaceDataMock,
        },
        scrollToItem: scrollToItemMock,
        scrollerElement: () => ({
          scrollHeight: 1200,
          scrollTop: 0,
          clientHeight: 800,
          scrollTo: scrollerScrollToMock,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
        getScrollLocation: () => ({
          bottomOffset: 0,
          visibleListHeight: 800,
        }),
      }));

      mockVirtuosoMessageListProps(props);

      const data = props.data?.data ?? [];

      return (
        <div data-testid="chat-virtuoso-message-list">
          {props.Header ? (
            <div data-testid="message-list-header-slot">
              <props.Header context={props.context as TContext} />
            </div>
          ) : null}
          {data.map((item, index) => (
            <div
              key={
                props.computeItemKey?.({
                  data: item,
                  index,
                  context: props.context as TContext,
                }) ?? index
              }
              data-testid={`chat-row-${String(index)}`}
            >
              {props.ItemContent?.({
                data: item,
                index,
                prevData: data[index - 1] ?? null,
                nextData: data[index + 1] ?? null,
                context: props.context as TContext,
              })}
            </div>
          ))}
          {props.Footer ? (
            <div data-testid="message-list-footer-slot">
              <props.Footer context={props.context as TContext} />
            </div>
          ) : null}
          {props.StickyFooter ? (
            <div data-testid="message-list-sticky-footer-slot">
              <props.StickyFooter context={props.context as TContext} />
            </div>
          ) : null}
        </div>
      );
    }),
  };
});

vi.mock('@/components/chat/messages', async () => {
  const React = await import('react');
  const { ToolWidgetSessionContext } = await import('@/components/chat/tools/shared');

  return {
    MessageItem: (props: MockMessageItemProps) => {
      const sessionId = React.useContext(ToolWidgetSessionContext);
      messageItemPropsById.set(props.message.id, props);

      return (
        <button
          type="button"
          data-testid={`message-item-${props.message.id}`}
          data-session-id={sessionId}
          data-animate={props.animate === true ? 'true' : 'false'}
          onClick={() => {
            props.onAnimationComplete?.(props.message.id);
          }}
        >
          {props.message.id}
        </button>
      );
    },
  };
});

vi.mock('@/components/chat/queued-message', () => ({
  QueuedMessageBubble: (props: MockQueuedMessageBubbleProps) => {
    queuedMessageBubbleProps.push(props);
    return <div data-testid="queued-message-bubble">{props.message.text}</div>;
  },
}));

vi.mock('@/components/ui/shimmer-text', () => ({
  ShimmerText: ({
    children,
    className,
  }: {
    readonly children: ReactNode;
    readonly className?: string | undefined;
  }) => (
    <span className={className} data-testid="shimmer-text">
      {children}
    </span>
  ),
}));

import { ChatMessages } from '@/components/chat/chat-messages';
import { clearToolWidgetState } from '@/components/chat/tools/shared';
import { useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';

function buildMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: overrides.id ?? 'message-1',
    role: overrides.role ?? 'assistant',
    content: overrides.content ?? 'message content',
    displayedContent: overrides.displayedContent ?? overrides.content ?? 'message content',
    ...overrides,
  };
}

function buildTool(overrides: Partial<ToolExecution> = {}): ToolExecution {
  const tool: ToolExecution = {
    id: overrides.id ?? 'tool-1',
    messageId: overrides.messageId ?? 'message-1',
    toolName: overrides.toolName ?? 'bash',
    toolInput: overrides.toolInput ?? { command: 'pwd' },
    toolOutput: overrides.toolOutput,
    status: overrides.status ?? 'success',
    startedAt: overrides.startedAt ?? 1,
    success: overrides.success ?? true,
  };

  if (overrides.completedAt !== undefined) {
    tool.completedAt = overrides.completedAt;
  }
  if (overrides.contentOffset !== undefined) {
    tool.contentOffset = overrides.contentOffset;
  }
  if (overrides.ordinal !== undefined) {
    tool.ordinal = overrides.ordinal;
  }
  if (overrides.sessionId !== undefined) {
    tool.sessionId = overrides.sessionId;
  }

  return tool;
}

function buildQueuedMessage(overrides: Partial<QueuedMessage> = {}): QueuedMessage {
  return {
    id: overrides.id ?? 'queued-1',
    text: overrides.text ?? 'Queued message',
    queuedAt: overrides.queuedAt ?? 1,
    sessionId: overrides.sessionId ?? 'session-a',
    contextFiles: overrides.contextFiles,
    images: overrides.images,
    elements: overrides.elements,
    skills: overrides.skills,
  };
}

function getMessageAt(messages: readonly ChatMessage[], index: number): ChatMessage {
  const message = messages[index];
  if (message === undefined) {
    throw new Error(`Expected message at index ${String(index)}`);
  }
  return message;
}

function getVirtuosoMessageListPropsAtCall(
  callIndex: number
): MockVirtuosoMessageListProps<ChatMessage, MockMessageListContext> {
  const props = mockVirtuosoMessageListProps.mock.calls[callIndex]?.[0] as
    | MockVirtuosoMessageListProps<ChatMessage, MockMessageListContext>
    | undefined;

  if (props === undefined) {
    throw new Error(`VirtuosoMessageList was not rendered for call ${String(callIndex)}`);
  }

  return props;
}

function getLatestVirtuosoMessageListProps(): MockVirtuosoMessageListProps<
  ChatMessage,
  MockMessageListContext
> {
  return getVirtuosoMessageListPropsAtCall(mockVirtuosoMessageListProps.mock.calls.length - 1);
}

function getVirtuosoContext(
  props: MockVirtuosoMessageListProps<ChatMessage, MockMessageListContext>
): MockMessageListContext {
  const context = props.context;
  if (context === undefined) {
    throw new Error('Expected VirtuosoMessageList context');
  }
  return context;
}

function renderChatMessages(
  overrides: Partial<ComponentProps<typeof ChatMessages>> = {}
): ReturnType<typeof render> {
  return render(
    <ChatMessages
      messages={[]}
      isAgentRunning={false}
      sessionId="session-a"
      queuedMessage={null}
      onRewind={vi.fn()}
      onOpenFile={vi.fn()}
      onOpenUrl={vi.fn()}
      onCancelQueue={vi.fn()}
      onFeedback={vi.fn()}
      {...overrides}
    />
  );
}

describe('ChatMessages', () => {
  beforeEach(() => {
    useToolStore.getState().reset();
    useChatStore.setState(useChatStore.getInitialState(), true);
    clearToolWidgetState();
    messageItemPropsById.clear();
    queuedMessageBubbleProps.length = 0;
    mockVirtuosoMessageListProps.mockClear();
    replaceDataMock.mockClear();
    scrollerScrollToMock.mockClear();
  });

  it('resets rows, remeasures the list, and resets session context when switching sessions', async () => {
    const sessionAMessages = [buildMessage({ id: 'user-a', role: 'user', content: 'hi' })];
    const sessionBMessages = [
      buildMessage({ id: 'assistant-b', role: 'assistant', content: 'reply' }),
      buildMessage({ id: 'user-b', role: 'user', content: 'next' }),
    ];

    const { rerender } = renderChatMessages({
      messages: sessionAMessages,
      sessionId: 'session-a',
    });

    await waitFor(() => {
      const userAProps = messageItemPropsById.get('user-a') as MockMessageItemProps | undefined;
      expect(userAProps?.animate).toBe(true);
    });

    const initialProps = getLatestVirtuosoMessageListProps();
    const initialContext = getVirtuosoContext(initialProps);
    const sessionAFirstMessage = getMessageAt(sessionAMessages, 0);

    expect(
      initialProps.computeItemKey?.({
        data: sessionAFirstMessage,
        index: 0,
        context: initialContext,
      })
    ).toBe('session-a:0');
    expect(screen.getByTestId('message-item-user-a')).toHaveAttribute(
      'data-session-id',
      'session-a'
    );

    rerender(
      <ChatMessages
        messages={sessionBMessages}
        isAgentRunning={false}
        sessionId="session-b"
        queuedMessage={null}
        onRewind={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenUrl={vi.fn()}
        onCancelQueue={vi.fn()}
        onFeedback={vi.fn()}
      />
    );

    const updatedProps = await waitFor(() => getLatestVirtuosoMessageListProps());
    const updatedContext = getVirtuosoContext(updatedProps);
    const sessionBFirstMessage = getMessageAt(sessionBMessages, 0);

    expect(
      updatedProps.computeItemKey?.({
        data: sessionBFirstMessage,
        index: 0,
        context: updatedContext,
      })
    ).toBe('session-b:0');
    expect(screen.getByTestId('message-item-assistant-b')).toHaveAttribute(
      'data-session-id',
      'session-b'
    );

    const assistantBProps = messageItemPropsById.get('assistant-b') as
      | MockMessageItemProps
      | undefined;
    expect(assistantBProps?.animate).toBe(false);
  });

  it('clears animation state after onAnimationComplete fires', async () => {
    renderChatMessages({
      messages: [buildMessage({ id: 'user-1', role: 'user', content: 'hello' })],
      sessionId: 'session-a',
    });

    await waitFor(() => {
      const props = messageItemPropsById.get('user-1') as MockMessageItemProps | undefined;
      expect(props?.animate).toBe(true);
    });

    expect(scrollToItemMock).toHaveBeenCalledWith({
      index: 'LAST',
      align: 'end',
      behavior: 'smooth',
    });

    fireEvent.click(screen.getByTestId('message-item-user-1'));

    await waitFor(() => {
      const props = messageItemPropsById.get('user-1') as MockMessageItemProps | undefined;
      expect(props?.animate).toBe(false);
    });
  });

  it('renders header, footer, queued, and loading content', () => {
    renderChatMessages({
      messages: [buildMessage({ id: 'assistant-1', role: 'assistant' })],
      isAgentRunning: true,
      queuedMessage: buildQueuedMessage({ text: 'Queued follow-up' }),
    });

    expect(screen.getByTestId('queued-message-bubble')).toHaveTextContent('Queued follow-up');
    expect(screen.getByTestId('shimmer-text')).toHaveTextContent('Thinking');
    expect(queuedMessageBubbleProps).not.toHaveLength(0);
  });

  it('passes the expected history-load scroll modifier and clears the consumed intent', async () => {
    const messages = [
      buildMessage({ id: 'assistant-1', role: 'assistant' }),
      buildMessage({ id: 'assistant-2', role: 'assistant' }),
    ];

    useChatStore.setState({
      sessions: {
        'session-a': {
          messages: [],
          isAgentRunning: false,
          isStopPending: false,
          scrollIntent: 'history-load',
          hydrationState: 'hydrated',
        },
      },
    });

    renderChatMessages({
      messages,
      sessionId: 'session-a',
    });

    const firstRenderProps = getVirtuosoMessageListPropsAtCall(0);
    const firstMessage = getMessageAt(messages, 0);
    const context = getVirtuosoContext(firstRenderProps);

    expect(firstRenderProps.data).toEqual({
      data: messages,
      scrollModifier: {
        type: 'item-location',
        location: { index: 0, align: 'start' },
      },
    });
    expect(firstRenderProps.shortSizeAlign).toBe('top');
    expect(firstRenderProps.className).toContain('flex-1');
    expect(firstRenderProps.style).toMatchObject({
      scrollbarGutter: 'stable both-edges',
    });
    expect(firstRenderProps.initialData).toEqual(messages);
    expect(firstRenderProps.initialLocation).toBeUndefined();
    expect(
      firstRenderProps.computeItemKey?.({
        data: firstMessage,
        index: 0,
        context,
      })
    ).toBe('session-a:0');

    await waitFor(() => {
      expect(useChatStore.getState().sessions['session-a']?.scrollIntent).toBeNull();
    });
  });

  it.each(['session-restore', 'session-refresh'] as const)(
    'uses the plain data path for %s and clears the consumed intent without falling back to heuristics',
    async (scrollIntent: 'session-restore' | 'session-refresh') => {
      const messages = [
        buildMessage({ id: 'assistant-1', role: 'assistant' }),
        buildMessage({ id: 'assistant-2', role: 'assistant' }),
      ];

      useChatStore.setState({
        sessions: {
          'session-a': {
            messages: [],
            isAgentRunning: false,
            isStopPending: false,
            scrollIntent,
            hydrationState: 'hydrated',
          },
        },
      });

      renderChatMessages({
        messages,
        sessionId: 'session-a',
      });

      const firstRenderProps = getVirtuosoMessageListPropsAtCall(0);

      expect(firstRenderProps.data).toEqual({
        data: messages,
      });
      expect(firstRenderProps.initialData).toEqual(messages);
      expect(firstRenderProps.initialLocation).toEqual(
        scrollIntent === 'session-restore'
          ? { index: messages.length - 1, align: 'end' }
          : undefined
      );

      await waitFor(() => {
        expect(useChatStore.getState().sessions['session-a']?.scrollIntent).toBeNull();
      });

      const settledProps = getLatestVirtuosoMessageListProps();
      expect(settledProps.data).toEqual({
        data: messages,
      });
    }
  );

  it('wires item content props and tool lookup into MessageItem correctly', () => {
    const messages = [
      buildMessage({ id: 'assistant-1', role: 'assistant' }),
      buildMessage({ id: 'assistant-2', role: 'assistant' }),
      buildMessage({ id: 'user-3', role: 'user', content: 'final user message' }),
    ];

    const tool = buildTool({
      id: 'tool-1',
      messageId: 'assistant-2',
      toolOutput: 'done',
    });

    useToolStore.setState({
      activeTools: {},
      completedTools: [tool],
    });

    renderChatMessages({
      messages,
      sessionId: 'session-a',
    });

    const firstAssistantProps = messageItemPropsById.get('assistant-1') as
      | MockMessageItemProps
      | undefined;
    const secondAssistantProps = messageItemPropsById.get('assistant-2') as
      | MockMessageItemProps
      | undefined;
    const userProps = messageItemPropsById.get('user-3') as MockMessageItemProps | undefined;

    expect(firstAssistantProps?.isLastAssistantMessage).toBe(false);
    expect(firstAssistantProps?.isLastInAssistantGroup).toBe(false);

    expect(secondAssistantProps?.tools).toEqual([tool]);
    expect(secondAssistantProps?.isLastAssistantMessage).toBe(true);
    expect(secondAssistantProps?.isLastInAssistantGroup).toBe(true);
    expect(secondAssistantProps?.isLastMessage).toBe(false);
    expect(secondAssistantProps?.animate).toBe(false);
    expect(secondAssistantProps?.onAnimationComplete).toBeTypeOf('function');

    expect(userProps?.isLastMessage).toBe(true);
  });

  it('keeps action callback wrappers stable across re-renders', () => {
    const onRewind = vi.fn();
    const onOpenFile = vi.fn();
    const onOpenUrl = vi.fn();
    const onFeedback = vi.fn();
    const initialMessages = [buildMessage({ id: 'assistant-1', role: 'assistant' })];
    const nextMessages = [
      ...initialMessages,
      buildMessage({ id: 'assistant-2', role: 'assistant', content: 'follow-up' }),
    ];

    const { rerender } = renderChatMessages({
      messages: initialMessages,
      sessionId: 'session-a',
      onRewind,
      onOpenFile,
      onOpenUrl,
      onFeedback,
    });

    const firstContext = getVirtuosoContext(getLatestVirtuosoMessageListProps());

    rerender(
      <ChatMessages
        messages={nextMessages}
        isAgentRunning={false}
        sessionId="session-a"
        queuedMessage={null}
        onRewind={onRewind}
        onOpenFile={onOpenFile}
        onOpenUrl={onOpenUrl}
        onCancelQueue={vi.fn()}
        onFeedback={onFeedback}
      />
    );

    const secondContext = getVirtuosoContext(getLatestVirtuosoMessageListProps());

    expect(secondContext.onRewind).toBe(firstContext.onRewind);
    expect(secondContext.onOpenFile).toBe(firstContext.onOpenFile);
    expect(secondContext.onOpenUrl).toBe(firstContext.onOpenUrl);
    expect(secondContext.onFeedback).toBe(firstContext.onFeedback);
  });
});
