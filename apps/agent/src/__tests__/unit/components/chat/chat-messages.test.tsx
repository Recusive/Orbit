import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { ChatRenderRow } from '@/components/chat/chat-messages';
import type { ChatMessage } from '@/components/chat/messages/types';
import type { ToolExecution } from '@/stores/agent/tool-store';
import type { QueuedMessage } from '@/stores/chat/queued-message-store';
import type { RenderCachePersistenceAdapter } from '@/stores/chat/render-cache-store';
import type { ComponentProps, ReactNode } from 'react';

const {
  mockGetCurrentlyRendered,
  getSizeRangesMock,
  messageItemPropsById,
  mockListSurfaceAvailable,
  mockTailSentinelAvailable,
  mockResizeObserverDisconnect,
  mockResizeObserverObserve,
  mockScrollerElement,
  mockVirtuosoListElement,
  mockUseVelocityScroll,
  mockVirtuosoMessageListProps,
  queuedMessageBubbleProps,
  replaceDataMock,
  setSizeRangesMock,
  scrollerScrollToMock,
  scrollToItemMock,
  velocityScrollAttachMock,
} = vi.hoisted(() => {
  const scrollerScrollToMock = vi.fn();

  return {
    mockGetCurrentlyRendered: vi.fn(),
    getSizeRangesMock: vi.fn(() => [{ k: 0, v: 120 }]),
    messageItemPropsById: new Map<string, unknown>(),
    mockListSurfaceAvailable: { current: true },
    mockTailSentinelAvailable: { current: true },
    mockResizeObserverDisconnect: vi.fn(),
    mockResizeObserverObserve: vi.fn(),
    mockScrollerElement: {
      scrollHeight: 1200,
      scrollTop: 0,
      clientHeight: 800,
      scrollTo: scrollerScrollToMock,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      querySelector: vi.fn(),
    },
    mockVirtuosoListElement: {},
    mockUseVelocityScroll: vi.fn(),
    mockVirtuosoMessageListProps: vi.fn(),
    queuedMessageBubbleProps: [] as unknown[],
    replaceDataMock: vi.fn(),
    setSizeRangesMock: vi.fn(),
    scrollerScrollToMock,
    scrollToItemMock: vi.fn(),
    velocityScrollAttachMock: vi.fn(),
  };
});

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
    readonly getCurrentlyRendered: () => TData[];
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
  readonly getSizeRanges: () => { k: number; v: number }[];
  readonly setSizeRanges: (ranges: { k: number; v: number }[]) => void;
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
  readonly increaseViewportBy?: number | undefined;
  readonly itemIdentity?: ((item: TData) => unknown) | undefined;
  readonly onRenderedDataChange?: ((range: TData[]) => void) | undefined;
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
          getCurrentlyRendered: () => {
            const fallback = (props.data?.data ?? props.initialData ?? []) as TData[];
            return (mockGetCurrentlyRendered(fallback) as TData[] | undefined) ?? fallback;
          },
        },
        scrollToItem: scrollToItemMock,
        scrollerElement: () => mockScrollerElement,
        getScrollLocation: () => ({
          bottomOffset: 0,
          visibleListHeight: 800,
        }),
        getSizeRanges: getSizeRangesMock,
        setSizeRanges: setSizeRangesMock,
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

vi.mock('@/hooks/ui/use-velocity-scroll', () => ({
  useVelocityScroll: (options?: unknown) => {
    mockUseVelocityScroll(options);
    return velocityScrollAttachMock;
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
import {
  removeRenderCache,
  resetRenderCacheStoreForTests,
  saveRenderCache,
  setRenderCachePersistenceAdapterForTests,
} from '@/stores/chat/render-cache-store';

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

function createPersistenceAdapter(
  initialEntries: Record<string, unknown>
): RenderCachePersistenceAdapter {
  const entries = new Map<string, unknown>(Object.entries(initialEntries));

  return {
    load: (sessionId) => Promise.resolve(entries.get(sessionId) ?? null),
    loadAll: () => Promise.resolve([...entries.values()]),
    save: (sessionId, entry) => {
      entries.set(sessionId, structuredClone(entry));
      return Promise.resolve();
    },
    remove: (sessionId) => {
      entries.delete(sessionId);
      return Promise.resolve();
    },
  };
}

function buildRenderRows(
  messages: readonly ChatMessage[]
): (
  | { readonly id: string; readonly kind: 'message'; readonly message: ChatMessage }
  | { readonly id: '__tail_sentinel__'; readonly kind: 'tail-sentinel' }
)[] {
  return [
    ...messages.map((message) => ({
      id: message.id,
      kind: 'message' as const,
      message,
    })),
    {
      id: '__tail_sentinel__' as const,
      kind: 'tail-sentinel' as const,
    },
  ];
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

function getRenderRowAt(rows: readonly ChatRenderRow[], index: number): ChatRenderRow {
  const row = rows[index];
  if (row === undefined) {
    throw new Error(`Expected render row at index ${String(index)}`);
  }

  return row;
}

function getVirtuosoMessageListPropsAtCall(
  callIndex: number
): MockVirtuosoMessageListProps<ChatRenderRow, MockMessageListContext> {
  const props = mockVirtuosoMessageListProps.mock.calls[callIndex]?.[0] as
    | MockVirtuosoMessageListProps<ChatRenderRow, MockMessageListContext>
    | undefined;

  if (props === undefined) {
    throw new Error(`VirtuosoMessageList was not rendered for call ${String(callIndex)}`);
  }

  return props;
}

function getLatestVirtuosoMessageListProps(): MockVirtuosoMessageListProps<
  ChatRenderRow,
  MockMessageListContext
> {
  return getVirtuosoMessageListPropsAtCall(mockVirtuosoMessageListProps.mock.calls.length - 1);
}

function getVirtuosoContext(
  props: MockVirtuosoMessageListProps<ChatRenderRow, MockMessageListContext>
): MockMessageListContext {
  const context = props.context;
  if (context === undefined) {
    throw new Error('Expected VirtuosoMessageList context');
  }
  return context;
}

function getLatestVelocityScrollOptions(): {
  readonly enabled?: boolean;
  readonly onUserScrollStart?: (() => void) | undefined;
} {
  const options = mockUseVelocityScroll.mock.calls.at(-1)?.[0] as
    | {
        readonly enabled?: boolean;
        readonly onUserScrollStart?: (() => void) | undefined;
      }
    | undefined;

  if (options === undefined) {
    throw new Error('useVelocityScroll was not called');
  }

  return options;
}

function trackScrollTopWrites(): {
  readonly restore: () => void;
  readonly writes: number[];
} {
  const writes: number[] = [];
  let currentScrollTop = mockScrollerElement.scrollTop;

  Object.defineProperty(mockScrollerElement, 'scrollTop', {
    configurable: true,
    get: () => currentScrollTop,
    set: (value: number) => {
      writes.push(value);
      currentScrollTop = value;
    },
  });

  return {
    writes,
    restore: () => {
      Object.defineProperty(mockScrollerElement, 'scrollTop', {
        configurable: true,
        writable: true,
        value: currentScrollTop,
      });
    },
  };
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
    setRenderCachePersistenceAdapterForTests(null);
    resetRenderCacheStoreForTests();
    removeRenderCache('session-a');
    clearToolWidgetState();
    messageItemPropsById.clear();
    mockGetCurrentlyRendered.mockReset();
    queuedMessageBubbleProps.length = 0;
    getSizeRangesMock.mockClear();
    mockResizeObserverDisconnect.mockClear();
    mockResizeObserverObserve.mockClear();
    mockListSurfaceAvailable.current = true;
    mockTailSentinelAvailable.current = true;
    mockScrollerElement.addEventListener.mockClear();
    mockScrollerElement.querySelector.mockImplementation((selector: string) => {
      if (selector === '[data-testid="virtuoso-list"]') {
        return mockListSurfaceAvailable.current === true ? mockVirtuosoListElement : null;
      }
      if (selector.includes('[data-tail-sentinel')) {
        return mockTailSentinelAvailable.current === true ? mockVirtuosoListElement : null;
      }
      return null;
    });
    mockScrollerElement.removeEventListener.mockClear();
    mockScrollerElement.clientHeight = 800;
    mockScrollerElement.scrollHeight = 1200;
    mockScrollerElement.scrollTop = 0;
    mockUseVelocityScroll.mockClear();
    mockVirtuosoMessageListProps.mockClear();
    replaceDataMock.mockClear();
    setSizeRangesMock.mockClear();
    scrollerScrollToMock.mockClear();
    scrollToItemMock.mockClear();
    velocityScrollAttachMock.mockClear();
    vi.spyOn(globalThis.ResizeObserver.prototype, 'observe').mockImplementation(
      mockResizeObserverObserve
    );
    vi.spyOn(globalThis.ResizeObserver.prototype, 'disconnect').mockImplementation(
      mockResizeObserverDisconnect
    );
  });

  afterEach(() => {
    removeRenderCache('session-a');
    setRenderCachePersistenceAdapterForTests(null);
    resetRenderCacheStoreForTests();
    vi.restoreAllMocks();
  });

  it('binds to a single session and uses session-prefixed item keys', async () => {
    // With multi-instance keep-alive, each ChatMessages is bound to ONE session.
    // Verify session context and item key prefixing work correctly.
    const messages = [buildMessage({ id: 'user-a', role: 'user', content: 'hi' })];

    renderChatMessages({
      messages,
      sessionId: 'session-a',
    });

    await waitFor(() => {
      const userAProps = messageItemPropsById.get('user-a') as MockMessageItemProps | undefined;
      expect(userAProps?.animate).toBe(true);
    });

    const props = getLatestVirtuosoMessageListProps();
    const context = getVirtuosoContext(props);
    const firstMessage = getRenderRowAt(buildRenderRows(messages), 0);

    expect(
      props.computeItemKey?.({
        data: firstMessage,
        index: 0,
        context,
      })
    ).toBe('session-a:user-a');
    expect(props.itemIdentity?.(firstMessage)).toBe('user-a');
    expect(screen.getByTestId('message-item-user-a')).toHaveAttribute(
      'data-session-id',
      'session-a'
    );
  });

  it('keeps hidden verification on entry overscan while priming', async () => {
    vi.useFakeTimers();

    try {
      const messages = [
        buildMessage({ id: 'assistant-1', role: 'assistant' }),
        buildMessage({ id: 'assistant-2', role: 'assistant' }),
      ];
      const onReady = vi.fn();
      const { rerender } = renderChatMessages({
        messages,
        sessionId: 'session-a',
        isVisible: false,
        shouldPrime: false,
        onReady,
      });

      expect(getLatestVirtuosoMessageListProps().increaseViewportBy).toBe(0);
      expect(getLatestVelocityScrollOptions().enabled).toBe(false);

      rerender(
        <ChatMessages
          messages={messages}
          isAgentRunning={false}
          sessionId="session-a"
          isVisible={false}
          shouldPrime={true}
          queuedMessage={null}
          onRewind={vi.fn()}
          onOpenFile={vi.fn()}
          onOpenUrl={vi.fn()}
          onCancelQueue={vi.fn()}
          onFeedback={vi.fn()}
          onReady={onReady}
        />
      );

      expect(getLatestVirtuosoMessageListProps().increaseViewportBy).toBe(800);
      expect(getLatestVirtuosoMessageListProps().increaseViewportBy).toBe(800);

      await act(async () => {
        getLatestVirtuosoMessageListProps().onRenderedDataChange?.(buildRenderRows(messages));
        await vi.advanceTimersByTimeAsync(48);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the tail positioned while verifying a long first-visit session', async () => {
    vi.useFakeTimers();

    const messages = Array.from({ length: 10 }, (_, index) =>
      buildMessage({ id: `assistant-${String(index)}`, role: 'assistant' })
    );
    const scrollTracker = trackScrollTopWrites();

    try {
      mockScrollerElement.scrollHeight = 4000;
      mockScrollerElement.clientHeight = 800;
      mockGetCurrentlyRendered.mockImplementation((fallback: ChatMessage[]) => fallback.slice(-1));
      useChatStore.setState({
        sessions: {
          'session-a': {
            messages: [],
            isAgentRunning: false,
            isStopPending: false,
            scrollIntent: 'session-restore',
            hydrationState: 'hydrated',
            layoutVersion: 0,
            virtuosoSizeCache: null,
          },
        },
      });

      const onReady = vi.fn();
      renderChatMessages({
        messages,
        sessionId: 'session-a',
        isVisible: false,
        shouldPrime: true,
        onReady,
      });

      expect(scrollTracker.writes).toContain(3200);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(120);
      });

      expect(scrollTracker.writes.at(-1)).toBe(3200);
      expect(onReady).toHaveBeenCalledTimes(1);
    } finally {
      scrollTracker.restore();
      vi.useRealTimers();
    }
  });

  it('skips premeasure for short sessions and stabilizes directly from bottom positioning', async () => {
    vi.useFakeTimers();

    const messages = [
      buildMessage({ id: 'assistant-1', role: 'assistant' }),
      buildMessage({ id: 'assistant-2', role: 'assistant' }),
    ];
    const scrollTracker = trackScrollTopWrites();

    try {
      mockScrollerElement.scrollHeight = 1200;
      mockScrollerElement.clientHeight = 800;
      mockGetCurrentlyRendered.mockImplementation((fallback: ChatMessage[]) => fallback.slice(-1));
      useChatStore.setState({
        sessions: {
          'session-a': {
            messages: [],
            isAgentRunning: false,
            isStopPending: false,
            scrollIntent: 'session-restore',
            hydrationState: 'hydrated',
            layoutVersion: 0,
            virtuosoSizeCache: null,
          },
        },
      });

      const onReady = vi.fn();
      renderChatMessages({
        messages,
        sessionId: 'session-a',
        isVisible: false,
        shouldPrime: true,
        onReady,
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(120);
      });

      expect(new Set(scrollTracker.writes)).toEqual(new Set([400]));
      expect(onReady).toHaveBeenCalledTimes(1);
    } finally {
      scrollTracker.restore();
      vi.useRealTimers();
    }
  });

  it('re-aligns visible verification when the measured bottom grows during stabilization', async () => {
    vi.useFakeTimers();

    const messages = [
      buildMessage({ id: 'assistant-1', role: 'assistant' }),
      buildMessage({ id: 'assistant-2', role: 'assistant' }),
      buildMessage({ id: 'assistant-3', role: 'assistant' }),
    ];
    const scrollTracker = trackScrollTopWrites();

    try {
      mockScrollerElement.clientHeight = 800;
      mockScrollerElement.scrollHeight = 2000;
      mockGetCurrentlyRendered.mockImplementation((fallback: ChatMessage[]) => fallback);
      const onVerificationResult = vi.fn();

      renderChatMessages({
        messages,
        sessionId: 'session-a',
        isVisible: true,
        verificationPhase: 'visible',
        verificationKey: 'visible-verification',
        onVerificationResult,
      });

      mockScrollerElement.scrollHeight = 2600;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60);
      });

      expect(onVerificationResult).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(220);
      });

      expect(onVerificationResult).not.toHaveBeenCalled();
      expect(scrollTracker.writes).toContain(1800);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(220);
      });

      expect(onVerificationResult).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(220);
      });

      expect(onVerificationResult).toHaveBeenCalledWith({
        phase: 'visible',
        result: 'visible-ready',
        tailProofVersion: 1,
      });
    } finally {
      scrollTracker.restore();
      vi.useRealTimers();
    }
  });

  it('pre-seeds visible verification from the hidden-ready snapshot when the surface still matches', async () => {
    vi.useFakeTimers();

    const messages = [
      buildMessage({ id: 'assistant-1', role: 'assistant' }),
      buildMessage({ id: 'assistant-2', role: 'assistant' }),
      buildMessage({ id: 'assistant-3', role: 'assistant' }),
    ];

    try {
      mockScrollerElement.clientHeight = 800;
      mockScrollerElement.scrollHeight = 1200;
      mockScrollerElement.scrollTop = 400;
      mockGetCurrentlyRendered.mockImplementation((fallback: ChatRenderRow[]) => fallback);

      const onVerificationResult = vi.fn();
      const view = renderChatMessages({
        messages,
        sessionId: 'session-a',
        isVisible: false,
        verificationPhase: 'hidden',
        verificationKey: 'phase-shared-verification',
        onVerificationResult,
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(120);
      });

      expect(onVerificationResult).toHaveBeenCalledWith({
        phase: 'hidden',
        result: 'hidden-ready',
        tailProofVersion: 1,
      });

      onVerificationResult.mockClear();

      act(() => {
        view.rerender(
          <ChatMessages
            messages={messages}
            isAgentRunning={false}
            sessionId="session-a"
            isVisible={true}
            verificationPhase="visible"
            verificationKey="phase-shared-verification"
            queuedMessage={null}
            onRewind={vi.fn()}
            onOpenFile={vi.fn()}
            onOpenUrl={vi.fn()}
            onCancelQueue={vi.fn()}
            onFeedback={vi.fn()}
            onVerificationResult={onVerificationResult}
          />
        );
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(180);
      });

      expect(onVerificationResult).toHaveBeenCalledTimes(1);
      expect(onVerificationResult).toHaveBeenCalledWith({
        phase: 'visible',
        result: 'visible-ready',
        tailProofVersion: 1,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks hidden verification ready after one animation frame when a restored cache stays stable', async () => {
    vi.useFakeTimers();

    const messages = [
      buildMessage({ id: 'assistant-1', role: 'assistant' }),
      buildMessage({ id: 'assistant-2', role: 'assistant' }),
      buildMessage({ id: 'assistant-3', role: 'assistant' }),
    ];

    try {
      mockScrollerElement.clientHeight = 800;
      mockScrollerElement.scrollHeight = 1200;
      mockScrollerElement.scrollTop = 400;
      mockGetCurrentlyRendered.mockImplementation((fallback: ChatRenderRow[]) => fallback);

      const chatStore = useChatStore.getState();
      chatStore.getOrCreateSession('session-a');
      chatStore.setMessages('session-a', messages, 'session-restore');
      chatStore.setVirtuosoSizeCache('session-a', {
        ranges: [{ k: 0, v: 120 }],
        messageCount: messages.length,
        lastMessageId: 'assistant-3',
        layoutVersion: useChatStore.getState().sessions['session-a']?.layoutVersion ?? 0,
      });

      const onVerificationResult = vi.fn();
      renderChatMessages({
        messages,
        sessionId: 'session-a',
        isVisible: false,
        verificationPhase: 'hidden',
        verificationKey: 'hidden-cache-match-instant',
        onVerificationResult,
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(20);
      });

      expect(onVerificationResult).toHaveBeenCalledWith({
        phase: 'hidden',
        result: 'hidden-ready',
        tailProofVersion: 1,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to a second visible pass when the hidden-ready snapshot no longer matches', async () => {
    vi.useFakeTimers();

    const messages = [
      buildMessage({ id: 'assistant-1', role: 'assistant' }),
      buildMessage({ id: 'assistant-2', role: 'assistant' }),
      buildMessage({ id: 'assistant-3', role: 'assistant' }),
    ];

    try {
      mockScrollerElement.clientHeight = 800;
      mockScrollerElement.scrollHeight = 1200;
      mockScrollerElement.scrollTop = 400;
      mockGetCurrentlyRendered.mockImplementation((fallback: ChatRenderRow[]) => fallback);

      const onVerificationResult = vi.fn();
      const view = renderChatMessages({
        messages,
        sessionId: 'session-a',
        isVisible: false,
        verificationPhase: 'hidden',
        verificationKey: 'phase-fallback-verification',
        onVerificationResult,
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(120);
      });

      expect(onVerificationResult).toHaveBeenCalledWith({
        phase: 'hidden',
        result: 'hidden-ready',
        tailProofVersion: 1,
      });

      onVerificationResult.mockClear();
      mockScrollerElement.scrollHeight = 1600;
      mockScrollerElement.scrollTop = 800;

      act(() => {
        view.rerender(
          <ChatMessages
            messages={messages}
            isAgentRunning={false}
            sessionId="session-a"
            isVisible={true}
            verificationPhase="visible"
            verificationKey="phase-fallback-verification"
            queuedMessage={null}
            onRewind={vi.fn()}
            onOpenFile={vi.fn()}
            onOpenUrl={vi.fn()}
            onCancelQueue={vi.fn()}
            onFeedback={vi.fn()}
            onVerificationResult={onVerificationResult}
          />
        );
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(220);
      });

      expect(onVerificationResult).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(220);
      });

      expect(onVerificationResult).toHaveBeenCalledTimes(1);
      expect(onVerificationResult).toHaveBeenCalledWith({
        phase: 'visible',
        result: 'visible-ready',
        tailProofVersion: 1,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not promote hidden verification until the tail proof is actually rendered', async () => {
    vi.useFakeTimers();

    const messages = Array.from({ length: 13 }, (_, index) =>
      buildMessage({ id: `assistant-${String(index)}`, role: 'assistant' })
    );
    let renderedCallCount = 0;

    try {
      mockScrollerElement.clientHeight = 647;
      mockScrollerElement.scrollHeight = 9751;
      mockTailSentinelAvailable.current = false;
      mockGetCurrentlyRendered.mockImplementation((fallback: ChatMessage[]) => {
        renderedCallCount += 1;
        return renderedCallCount <= 2 ? fallback.slice(0, 5) : fallback;
      });

      const onVerificationResult = vi.fn();
      renderChatMessages({
        messages,
        sessionId: 'session-a',
        isVisible: false,
        verificationPhase: 'hidden',
        verificationKey: 'hidden-verification',
        onVerificationResult,
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60);
      });

      expect(onVerificationResult).not.toHaveBeenCalled();

      mockTailSentinelAvailable.current = true;
      mockScrollerElement.scrollTop =
        mockScrollerElement.scrollHeight - mockScrollerElement.clientHeight;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(120);
      });

      expect(onVerificationResult).not.toHaveBeenCalledWith(
        expect.objectContaining({
          result: 'aborted',
        })
      );
      expect(onVerificationResult).not.toHaveBeenCalledWith(
        expect.objectContaining({
          result: 'timeout',
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not promote hidden verification until the tail is bottom-aligned', async () => {
    vi.useFakeTimers();

    const messages = [
      buildMessage({ id: 'assistant-1', role: 'assistant' }),
      buildMessage({ id: 'assistant-2', role: 'assistant' }),
      buildMessage({ id: 'assistant-3', role: 'assistant' }),
    ];

    try {
      mockScrollerElement.clientHeight = 400;
      mockScrollerElement.scrollHeight = 500;
      mockScrollerElement.scrollTop = 100;
      mockGetCurrentlyRendered.mockImplementation((fallback: ChatRenderRow[]) => fallback);

      const onVerificationResult = vi.fn();
      renderChatMessages({
        messages,
        sessionId: 'session-a',
        isVisible: false,
        verificationPhase: 'hidden',
        verificationKey: 'hidden-bottom-guard',
        onVerificationResult,
      });

      mockScrollerElement.scrollHeight = 700;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60);
      });

      expect(onVerificationResult).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(120);
      });

      expect(onVerificationResult).toHaveBeenCalledWith({
        phase: 'hidden',
        result: 'hidden-ready',
        tailProofVersion: 1,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('promotes hidden verification after a probed real surface becomes bottom-aligned', async () => {
    vi.useFakeTimers();

    const messages = Array.from({ length: 6 }, (_, index) =>
      buildMessage({ id: `assistant-${String(index)}`, role: 'assistant' })
    );

    try {
      mockScrollerElement.clientHeight = 647;
      mockScrollerElement.scrollHeight = 647;
      mockScrollerElement.scrollTop = 0;
      mockTailSentinelAvailable.current = false;
      mockGetCurrentlyRendered.mockImplementation((fallback: ChatRenderRow[]) => fallback);

      const onVerificationResult = vi.fn();
      renderChatMessages({
        messages,
        sessionId: 'session-a',
        isVisible: false,
        verificationPhase: 'hidden',
        verificationKey: 'hidden-tail-probe-bottom-align',
        onVerificationResult,
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(120);
      });

      mockTailSentinelAvailable.current = true;
      mockScrollerElement.scrollHeight = 2933;
      mockScrollerElement.scrollTop = 0;

      await act(async () => {
        getLatestVirtuosoMessageListProps().onRenderedDataChange?.(buildRenderRows(messages));
        await vi.advanceTimersByTimeAsync(60);
      });

      expect(onVerificationResult).not.toHaveBeenCalledWith(
        expect.objectContaining({
          result: 'hidden-ready',
        })
      );

      mockScrollerElement.scrollTop = 2286;

      await act(async () => {
        getLatestVirtuosoMessageListProps().onRenderedDataChange?.(buildRenderRows(messages));
        await vi.advanceTimersByTimeAsync(120);
      });

      expect(onVerificationResult).toHaveBeenCalledWith({
        phase: 'hidden',
        result: 'hidden-ready',
        tailProofVersion: 1,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not abort while waiting for the list surface on startup restore', async () => {
    vi.useFakeTimers();

    const messages = [
      buildMessage({ id: 'assistant-1', role: 'assistant' }),
      buildMessage({ id: 'assistant-2', role: 'assistant' }),
    ];

    try {
      mockListSurfaceAvailable.current = false;
      mockScrollerElement.clientHeight = 324;
      mockScrollerElement.scrollHeight = 514;
      mockScrollerElement.scrollTop = 190;
      mockGetCurrentlyRendered.mockImplementation((fallback: ChatRenderRow[]) => fallback);

      const onVerificationResult = vi.fn();
      const view = renderChatMessages({
        messages,
        sessionId: 'session-a',
        isVisible: false,
        verificationPhase: 'hidden',
        verificationKey: 'startup-surface-wait',
        onVerificationResult,
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1600);
      });

      expect(onVerificationResult).not.toHaveBeenCalled();

      mockListSurfaceAvailable.current = true;

      act(() => {
        view.rerender(
          <ChatMessages
            messages={messages}
            isAgentRunning={false}
            sessionId="session-a"
            isVisible={false}
            verificationPhase="hidden"
            verificationKey="startup-surface-wait-ready"
            queuedMessage={null}
            onRewind={vi.fn()}
            onOpenFile={vi.fn()}
            onOpenUrl={vi.fn()}
            onCancelQueue={vi.fn()}
            onFeedback={vi.fn()}
            onVerificationResult={onVerificationResult}
          />
        );
      });

      onVerificationResult.mockClear();

      await act(async () => {
        getLatestVirtuosoMessageListProps().onRenderedDataChange?.(buildRenderRows(messages));
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(onVerificationResult).not.toHaveBeenCalledWith(
        expect.objectContaining({
          result: 'aborted',
        })
      );
      expect(onVerificationResult).not.toHaveBeenCalledWith(
        expect.objectContaining({
          result: 'timeout',
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('forces a purged tail probe render when hidden verification remains starved after premeasure', async () => {
    vi.useFakeTimers();

    const messages = Array.from({ length: 20 }, (_, index) =>
      buildMessage({ id: `assistant-${String(index)}`, role: 'assistant' })
    );

    try {
      mockScrollerElement.clientHeight = 647;
      mockScrollerElement.scrollHeight = 6757;
      mockScrollerElement.scrollTop = 6110;
      mockTailSentinelAvailable.current = false;
      mockGetCurrentlyRendered.mockImplementation((fallback: ChatRenderRow[]) =>
        fallback.slice(0, 5)
      );

      renderChatMessages({
        messages,
        sessionId: 'session-a',
        isVisible: false,
        verificationPhase: 'hidden',
        verificationKey: 'hidden-tail-probe',
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(120);
      });

      expect(replaceDataMock).toHaveBeenCalledWith(
        buildRenderRows(messages),
        expect.objectContaining({
          purgeItemSizes: true,
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not start premeasure again after a tail probe has already been attempted', async () => {
    vi.useFakeTimers();

    const messages = Array.from({ length: 50 }, (_, index) =>
      buildMessage({ id: `assistant-${String(index)}`, role: 'assistant' })
    );
    const scrollTracker = trackScrollTopWrites();

    try {
      mockScrollerElement.clientHeight = 647;
      mockScrollerElement.scrollHeight = 647;
      mockScrollerElement.scrollTop = 0;
      mockTailSentinelAvailable.current = false;
      mockGetCurrentlyRendered.mockImplementation((fallback: ChatRenderRow[]) =>
        fallback.slice(0, 5)
      );

      renderChatMessages({
        messages,
        sessionId: 'session-a',
        isVisible: false,
        verificationPhase: 'hidden',
        verificationKey: 'hidden-tail-probe-no-second-premeasure',
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(120);
      });

      expect(replaceDataMock).toHaveBeenCalled();

      mockTailSentinelAvailable.current = true;
      mockScrollerElement.scrollHeight = 26389;
      mockScrollerElement.scrollTop = 0;

      await act(async () => {
        getLatestVirtuosoMessageListProps().onRenderedDataChange?.(buildRenderRows(messages));
        await vi.advanceTimersByTimeAsync(60);
      });

      expect(scrollTracker.writes).toContain(25742);
      expect(scrollTracker.writes).not.toContain(9742);
    } finally {
      scrollTracker.restore();
      vi.useRealTimers();
    }
  });

  it('does not accept a tail-probe placeholder as hidden-ready before a post-probe resize', async () => {
    vi.useFakeTimers();

    const messages = Array.from({ length: 20 }, (_, index) =>
      buildMessage({ id: `assistant-${String(index)}`, role: 'assistant' })
    );

    try {
      mockScrollerElement.clientHeight = 647;
      mockScrollerElement.scrollHeight = 6757;
      mockScrollerElement.scrollTop = 6110;
      mockTailSentinelAvailable.current = false;
      mockGetCurrentlyRendered.mockImplementation((fallback: ChatRenderRow[]) =>
        fallback.slice(0, 5)
      );

      const onVerificationResult = vi.fn();
      renderChatMessages({
        messages,
        sessionId: 'session-a',
        isVisible: false,
        verificationPhase: 'hidden',
        verificationKey: 'hidden-tail-probe-placeholder',
        onVerificationResult,
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(180);
      });

      expect(replaceDataMock).toHaveBeenCalled();
      expect(onVerificationResult).not.toHaveBeenCalledWith(
        expect.objectContaining({
          result: 'hidden-ready',
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('accepts a small post-probe surface change once the hidden tail surface settles', async () => {
    vi.useFakeTimers();

    const messages = [
      buildMessage({ id: 'assistant-1', role: 'assistant' }),
      buildMessage({ id: 'assistant-2', role: 'assistant' }),
    ];

    try {
      mockScrollerElement.clientHeight = 647;
      mockScrollerElement.scrollHeight = 647;
      mockScrollerElement.scrollTop = 0;
      mockTailSentinelAvailable.current = false;
      mockGetCurrentlyRendered.mockImplementation((fallback: ChatRenderRow[]) => fallback);

      const onVerificationResult = vi.fn();
      renderChatMessages({
        messages,
        sessionId: 'session-a',
        isVisible: false,
        verificationPhase: 'hidden',
        verificationKey: 'hidden-tail-probe-small-delta',
        onVerificationResult,
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(120);
      });

      expect(replaceDataMock).toHaveBeenCalled();

      mockTailSentinelAvailable.current = true;
      mockScrollerElement.scrollHeight = 1286;
      mockScrollerElement.scrollTop = 639;

      await act(async () => {
        getLatestVirtuosoMessageListProps().onRenderedDataChange?.(buildRenderRows(messages));
        await vi.advanceTimersByTimeAsync(60);
      });

      expect(onVerificationResult).not.toHaveBeenCalledWith(
        expect.objectContaining({
          result: 'hidden-ready',
        })
      );

      mockScrollerElement.scrollHeight = 1287;
      mockScrollerElement.scrollTop = 640;

      await act(async () => {
        getLatestVirtuosoMessageListProps().onRenderedDataChange?.(buildRenderRows(messages));
        await vi.advanceTimersByTimeAsync(120);
      });

      expect(onVerificationResult).toHaveBeenCalledWith({
        phase: 'hidden',
        result: 'hidden-ready',
        tailProofVersion: 1,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips premeasure when a valid size cache was restored', async () => {
    vi.useFakeTimers();

    const messages = Array.from({ length: 10 }, (_, index) =>
      buildMessage({ id: `assistant-${String(index)}`, role: 'assistant' })
    );
    const scrollTracker = trackScrollTopWrites();

    try {
      mockScrollerElement.scrollHeight = 4000;
      mockScrollerElement.clientHeight = 800;
      mockGetCurrentlyRendered.mockImplementation((fallback: ChatMessage[]) => fallback.slice(-1));
      const chatStore = useChatStore.getState();
      chatStore.getOrCreateSession('session-a');
      chatStore.setMessages('session-a', messages, 'session-restore');
      chatStore.setVirtuosoSizeCache('session-a', {
        ranges: [{ k: 0, v: 120 }],
        messageCount: messages.length,
        lastMessageId: messages.at(-1)?.id ?? null,
        layoutVersion: useChatStore.getState().sessions['session-a']?.layoutVersion ?? 0,
      });

      const onReady = vi.fn();
      renderChatMessages({
        messages,
        sessionId: 'session-a',
        isVisible: false,
        shouldPrime: true,
        onReady,
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(120);
      });

      expect(setSizeRangesMock).toHaveBeenCalledWith([{ k: 0, v: 120 }]);
      expect(scrollTracker.writes).not.toContain(800);
      expect(new Set(scrollTracker.writes)).toEqual(new Set([3200]));
      expect(onReady).toHaveBeenCalledTimes(1);
    } finally {
      scrollTracker.restore();
      vi.useRealTimers();
    }
  });

  it('cancels premeasure work when the session stops priming before ready', async () => {
    vi.useFakeTimers();

    const messages = Array.from({ length: 10 }, (_, index) =>
      buildMessage({ id: `assistant-${String(index)}`, role: 'assistant' })
    );

    try {
      mockScrollerElement.scrollHeight = 4000;
      mockScrollerElement.clientHeight = 800;
      mockGetCurrentlyRendered.mockImplementation((fallback: ChatMessage[]) => fallback.slice(-1));
      useChatStore.setState({
        sessions: {
          'session-a': {
            messages: [],
            isAgentRunning: false,
            isStopPending: false,
            scrollIntent: 'session-restore',
            hydrationState: 'hydrated',
            layoutVersion: 0,
            virtuosoSizeCache: null,
          },
        },
      });

      const onReady = vi.fn();
      const { rerender } = renderChatMessages({
        messages,
        sessionId: 'session-a',
        isVisible: false,
        shouldPrime: true,
        onReady,
      });

      expect(mockResizeObserverObserve).toHaveBeenCalled();

      rerender(
        <ChatMessages
          messages={messages}
          isAgentRunning={false}
          sessionId="session-a"
          isVisible={false}
          shouldPrime={false}
          queuedMessage={null}
          onRewind={vi.fn()}
          onOpenFile={vi.fn()}
          onOpenUrl={vi.fn()}
          onCancelQueue={vi.fn()}
          onFeedback={vi.fn()}
          onReady={onReady}
        />
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      expect(onReady).not.toHaveBeenCalled();
      expect(mockResizeObserverDisconnect).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps hidden verification on entry overscan before and after explicit user scroll', () => {
    const messages = [buildMessage({ id: 'assistant-1', role: 'assistant' })];

    renderChatMessages({
      messages,
      sessionId: 'session-a',
      isVisible: true,
      shouldPrime: true,
    });

    expect(getLatestVirtuosoMessageListProps().increaseViewportBy).toBe(800);

    act(() => {
      getLatestVelocityScrollOptions().onUserScrollStart?.();
    });

    expect(getLatestVirtuosoMessageListProps().increaseViewportBy).toBe(800);
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
          layoutVersion: 0,
          virtuosoSizeCache: null,
        },
      },
    });

    renderChatMessages({
      messages,
      sessionId: 'session-a',
      shouldPrime: true,
    });

    const firstRenderProps = getVirtuosoMessageListPropsAtCall(0);
    const renderRows = buildRenderRows(messages);
    const firstMessage = getRenderRowAt(renderRows, 0);
    const context = getVirtuosoContext(firstRenderProps);

    expect(firstRenderProps.data).toEqual({
      data: renderRows,
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
    expect(firstRenderProps.initialData).toEqual(renderRows);
    expect(firstRenderProps.initialLocation).toBeUndefined();
    expect(
      firstRenderProps.computeItemKey?.({
        data: firstMessage,
        index: 0,
        context,
      })
    ).toBe('session-a:assistant-1');

    await waitFor(() => {
      expect(useChatStore.getState().sessions['session-a']?.scrollIntent).toBeNull();
    });
  });

  it('session-restore scrolls to bottom imperatively and clears the consumed intent', async () => {
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
          scrollIntent: 'session-restore',
          hydrationState: 'hydrated',
          layoutVersion: 0,
          virtuosoSizeCache: null,
        },
      },
    });

    renderChatMessages({
      messages,
      sessionId: 'session-a',
    });

    const firstRenderProps = getVirtuosoMessageListPropsAtCall(0);
    const renderRows = buildRenderRows(messages);

    // session-restore uses plain data — scroll handled by imperative scrollToItem()
    expect(firstRenderProps.data).toEqual({ data: renderRows });

    // scrollToItem called imperatively for session-restore
    await waitFor(() => {
      expect(scrollToItemMock).toHaveBeenCalledWith({ index: 'LAST', align: 'end' });
    });

    await waitFor(() => {
      expect(useChatStore.getState().sessions['session-a']?.scrollIntent).toBeNull();
    });
  });

  it('session-refresh uses plain data path and clears the consumed intent', async () => {
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
          scrollIntent: 'session-refresh',
          hydrationState: 'hydrated',
          layoutVersion: 0,
          virtuosoSizeCache: null,
        },
      },
    });

    renderChatMessages({
      messages,
      sessionId: 'session-a',
    });

    const firstRenderProps = getVirtuosoMessageListPropsAtCall(0);
    const renderRows = buildRenderRows(messages);

    expect(firstRenderProps.data).toEqual({
      data: renderRows,
    });

    await waitFor(() => {
      expect(useChatStore.getState().sessions['session-a']?.scrollIntent).toBeNull();
    });

    const settledProps = getLatestVirtuosoMessageListProps();
    expect(settledProps.data).toEqual({
      data: renderRows,
    });
  });

  it('restores cached size ranges when the cache matches the mounted session', () => {
    const messages = [
      buildMessage({ id: 'assistant-1', role: 'assistant' }),
      buildMessage({ id: 'assistant-2', role: 'assistant' }),
    ];

    const chatStore = useChatStore.getState();
    chatStore.getOrCreateSession('session-a');
    chatStore.setMessages('session-a', messages);
    chatStore.setVirtuosoSizeCache('session-a', {
      ranges: [{ k: 0, v: 64 }],
      messageCount: messages.length,
      lastMessageId: 'assistant-2',
      layoutVersion: useChatStore.getState().sessions['session-a']?.layoutVersion ?? 0,
    });

    renderChatMessages({
      messages,
      sessionId: 'session-a',
    });

    expect(setSizeRangesMock).toHaveBeenCalledWith([{ k: 0, v: 64 }]);
  });

  it('restores persistent size ranges when the Zustand cache was evicted', () => {
    const messages = [
      buildMessage({ id: 'assistant-1', role: 'assistant' }),
      buildMessage({ id: 'assistant-2', role: 'assistant' }),
    ];

    saveRenderCache('session-a', {
      ranges: [{ k: 0, v: 96 }],
      messageCount: messages.length,
      lastMessageId: 'assistant-2',
      layoutVersion: 0,
    });

    useChatStore.setState({
      sessions: {
        'session-a': {
          messages,
          isAgentRunning: false,
          isStopPending: false,
          scrollIntent: null,
          hydrationState: 'hydrated',
          layoutVersion: 0,
          virtuosoSizeCache: null,
        },
      },
    });

    renderChatMessages({
      messages,
      sessionId: 'session-a',
    });

    expect(setSizeRangesMock).toHaveBeenCalledWith([{ k: 0, v: 96 }]);
  });

  it('applies estimated size ranges when no real cache is available', () => {
    const messages = [
      buildMessage({ id: 'user-1', role: 'user', content: 'short prompt' }),
      buildMessage({
        id: 'assistant-2',
        role: 'assistant',
        content:
          'A longer assistant reply that should produce a larger estimated height than the user prompt.',
      }),
    ];

    useChatStore.setState({
      sessions: {
        'session-a': {
          messages,
          isAgentRunning: false,
          isStopPending: false,
          scrollIntent: null,
          hydrationState: 'hydrated',
          layoutVersion: 0,
          virtuosoSizeCache: null,
        },
      },
    });

    renderChatMessages({
      messages,
      sessionId: 'session-a',
    });

    expect(setSizeRangesMock).toHaveBeenCalled();
    const estimatedRanges = setSizeRangesMock.mock.calls[0]?.[0] as
      | { k: number; v: number }[]
      | undefined;
    expect(estimatedRanges?.[0]?.k).toBe(0);
    expect(estimatedRanges?.[0]?.v).toBeGreaterThan(0);
  });

  it('restores persistent size ranges asynchronously when startup warmup misses the first pass', async () => {
    const messages = [
      buildMessage({ id: 'assistant-1', role: 'assistant' }),
      buildMessage({ id: 'assistant-2', role: 'assistant' }),
    ];

    setRenderCachePersistenceAdapterForTests(
      createPersistenceAdapter({
        'session-a': {
          sessionId: 'session-a',
          schemaVersion: 1,
          accessedAt: Date.now(),
          cache: {
            ranges: [{ k: 0, v: 96 }],
            messageCount: messages.length,
            lastMessageId: 'assistant-2',
            layoutVersion: 0,
            viewportWidth: null,
          },
        },
      })
    );

    useChatStore.setState({
      sessions: {
        'session-a': {
          messages,
          isAgentRunning: false,
          isStopPending: false,
          scrollIntent: null,
          hydrationState: 'hydrated',
          layoutVersion: 0,
          virtuosoSizeCache: null,
        },
      },
    });

    renderChatMessages({
      messages,
      sessionId: 'session-a',
    });

    await waitFor(() => {
      expect(setSizeRangesMock).toHaveBeenCalledWith([{ k: 0, v: 96 }]);
    });
  });

  it('does not snapshot size ranges when the session stops priming before ready', () => {
    const messages = [buildMessage({ id: 'assistant-1', role: 'assistant' })];
    const chatStore = useChatStore.getState();
    chatStore.getOrCreateSession('session-a');
    chatStore.setMessages('session-a', messages);

    const { rerender } = renderChatMessages({
      messages,
      sessionId: 'session-a',
      shouldPrime: true,
    });

    rerender(
      <ChatMessages
        messages={messages}
        isAgentRunning={false}
        sessionId="session-a"
        shouldPrime={false}
        queuedMessage={null}
        onRewind={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenUrl={vi.fn()}
        onCancelQueue={vi.fn()}
        onFeedback={vi.fn()}
      />
    );

    expect(useChatStore.getState().sessions['session-a']?.virtuosoSizeCache).toBeNull();
  });

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
      currentSessionId: 'session-a',
      activeSessionId: 'session-a',
      activeTools: {},
      completedTools: [tool],
      sessions: {
        'session-a': {
          activeTools: {},
          completedTools: [tool],
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            totalCostUsd: 0,
          },
          processedIds: [],
          contextWindow: null,
          sessionModel: null,
          sessionTools: null,
          sessionMcpServers: null,
          metadataState: null,
          toolRevision: 0,
        },
      },
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
