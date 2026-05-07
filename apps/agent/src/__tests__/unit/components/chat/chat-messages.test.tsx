import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { ChatMessage } from '@/components/chat/messages/types';
import type { ToolExecution } from '@/stores/agent/tool-store';
import type { ChatMeasurementCache } from '@/stores/chat/chat-store';
import type { QueuedMessage } from '@/stores/chat/queued-message-store';
import type { RenderCachePersistenceAdapter } from '@/stores/chat/render-cache-store';
import type { ComponentProps, Key, ReactNode } from 'react';

interface MockVirtualItem {
  readonly key: Key;
  readonly index: number;
  readonly start: number;
  readonly size: number;
  readonly end: number;
  readonly lane: number;
}

interface MockVirtualizerOptions {
  readonly count: number;
  readonly estimateSize: (index: number) => number;
  readonly getItemKey: (index: number) => Key;
  readonly getScrollElement: () => Element | null;
  readonly initialMeasurementsCache?: readonly MockVirtualItem[] | undefined;
  readonly overscan: number;
}

interface MockVirtualizer {
  measurementsCache: readonly MockVirtualItem[];
  shouldAdjustScrollPositionOnItemSizeChange?: unknown;
  getTotalSize: () => number;
  getVirtualItems: () => MockVirtualItem[];
  measure: () => void;
  measureElement: (element: Element | null) => void;
  scrollToIndex: (
    index: number,
    options?: { readonly align?: string; readonly behavior?: ScrollBehavior }
  ) => void;
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

const {
  latestVirtualizerOptionsRef,
  messageItemPropsById,
  mockMeasureElement,
  mockTotalSize,
  mockUseVelocityScroll,
  mockUseVirtualizer,
  mockUseVirtualizerOptions,
  mockVirtualItemIndexes,
  mockVirtualizerMeasure,
  mockVirtualizerMeasureElement,
  mockVirtualizerMeasurements,
  queuedMessageBubbleProps,
  scrollToIndexMock,
  velocityScrollAttachMock,
} = vi.hoisted(() => {
  const latestVirtualizerOptionsRef = { current: null as MockVirtualizerOptions | null };
  const mockTotalSize = { current: 1200 };
  const mockVirtualItemIndexes = { current: null as readonly number[] | null };
  const mockVirtualizerMeasurements = { current: [] as readonly MockVirtualItem[] };
  const mockUseVirtualizerOptions = vi.fn();
  const mockVirtualizerMeasure = vi.fn();
  const mockVirtualizerMeasureElement = vi.fn();
  const scrollToIndexMock = vi.fn();

  const buildDefaultVirtualItems = (): MockVirtualItem[] => {
    const options = latestVirtualizerOptionsRef.current;
    if (options === null) {
      return [];
    }

    const indexes =
      mockVirtualItemIndexes.current ??
      Array.from({ length: options.count }, (_value, index) => index);

    return indexes
      .filter((index) => index >= 0 && index < options.count)
      .map((index) => ({
        key: options.getItemKey(index),
        index,
        start: index * 100,
        size: 100,
        end: (index + 1) * 100,
        lane: 0,
      }));
  };

  const mockVirtualizer: MockVirtualizer = {
    get measurementsCache() {
      return mockVirtualizerMeasurements.current;
    },
    getTotalSize: () => mockTotalSize.current,
    getVirtualItems: buildDefaultVirtualItems,
    measure: mockVirtualizerMeasure,
    measureElement: mockVirtualizerMeasureElement,
    scrollToIndex: scrollToIndexMock,
  };

  const mockUseVirtualizer = vi.fn((options: MockVirtualizerOptions): MockVirtualizer => {
    latestVirtualizerOptionsRef.current = options;
    mockUseVirtualizerOptions(options);
    return mockVirtualizer;
  });

  return {
    latestVirtualizerOptionsRef,
    messageItemPropsById: new Map<string, unknown>(),
    mockMeasureElement: vi.fn(() => 100),
    mockTotalSize,
    mockUseVelocityScroll: vi.fn(),
    mockUseVirtualizer,
    mockUseVirtualizerOptions,
    mockVirtualItemIndexes,
    mockVirtualizerMeasure,
    mockVirtualizerMeasureElement,
    mockVirtualizerMeasurements,
    queuedMessageBubbleProps: [] as unknown[],
    scrollToIndexMock,
    velocityScrollAttachMock: vi.fn(),
  };
});

vi.mock('@tanstack/react-virtual', () => ({
  measureElement: mockMeasureElement,
  useVirtualizer: mockUseVirtualizer,
}));

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
  setRenderCachePersistenceAdapterForTests,
} from '@/stores/chat/render-cache-store';

interface ScrollerMetrics {
  readonly clientHeight: number;
  readonly clientWidth: number;
  readonly scrollHeight: number;
  readonly scrollTop: number;
}

const scrollerMetrics: {
  clientHeight: number;
  clientWidth: number;
  scrollHeight: number;
  scrollTop: number;
  writes: number[];
} = {
  clientHeight: 800,
  clientWidth: 720,
  scrollHeight: 1200,
  scrollTop: 400,
  writes: [],
};

let originalClientHeightDescriptor: PropertyDescriptor | undefined;
let originalClientWidthDescriptor: PropertyDescriptor | undefined;
let originalScrollHeightDescriptor: PropertyDescriptor | undefined;
let originalScrollTopDescriptor: PropertyDescriptor | undefined;

function isChatScroller(element: Element): boolean {
  return element.getAttribute('data-testid') === 'chat-scroller';
}

function setScrollerMetrics(metrics: Partial<ScrollerMetrics>): void {
  scrollerMetrics.clientHeight = metrics.clientHeight ?? scrollerMetrics.clientHeight;
  scrollerMetrics.clientWidth = metrics.clientWidth ?? scrollerMetrics.clientWidth;
  scrollerMetrics.scrollHeight = metrics.scrollHeight ?? scrollerMetrics.scrollHeight;
  scrollerMetrics.scrollTop = metrics.scrollTop ?? scrollerMetrics.scrollTop;
}

function installScrollerMetrics(): void {
  originalClientHeightDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'clientHeight'
  );
  originalClientWidthDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'clientWidth'
  );
  originalScrollHeightDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollHeight'
  );
  originalScrollTopDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');

  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: function getClientHeight(this: HTMLElement): number {
      return isChatScroller(this) ? scrollerMetrics.clientHeight : 0;
    },
  });

  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: function getClientWidth(this: HTMLElement): number {
      return isChatScroller(this) ? scrollerMetrics.clientWidth : 0;
    },
  });

  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: function getScrollHeight(this: HTMLElement): number {
      return isChatScroller(this) ? scrollerMetrics.scrollHeight : 0;
    },
  });

  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get: function getScrollTop(this: HTMLElement): number {
      return isChatScroller(this) ? scrollerMetrics.scrollTop : 0;
    },
    set: function setScrollTop(this: HTMLElement, value: number): void {
      if (isChatScroller(this)) {
        scrollerMetrics.writes.push(value);
        scrollerMetrics.scrollTop = value;
      }
    },
  });
}

function restorePrototypeDescriptor(
  property: 'clientHeight' | 'clientWidth' | 'scrollHeight' | 'scrollTop',
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor === undefined) {
    Reflect.deleteProperty(HTMLElement.prototype, property);
    return;
  }

  Object.defineProperty(HTMLElement.prototype, property, descriptor);
}

function restoreScrollerMetrics(): void {
  restorePrototypeDescriptor('clientHeight', originalClientHeightDescriptor);
  restorePrototypeDescriptor('clientWidth', originalClientWidthDescriptor);
  restorePrototypeDescriptor('scrollHeight', originalScrollHeightDescriptor);
  restorePrototypeDescriptor('scrollTop', originalScrollTopDescriptor);
}

function installScrollToMock(): void {
  vi.spyOn(Element.prototype, 'scrollTo').mockImplementation(function scrollTo(
    this: Element,
    options?: ScrollToOptions | number,
    y?: number
  ): void {
    const top = typeof options === 'number' ? y : options?.top;
    if (top !== undefined && isChatScroller(this)) {
      this.scrollTop = top;
    }
  });
}

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

function buildMeasurementCacheForMessages(
  messages: readonly ChatMessage[],
  size = 120
): ChatMeasurementCache {
  return {
    measurements: messages.map((message, index) => ({
      key: `session-a:${message.id}`,
      index,
      start: index * size,
      size,
      end: (index + 1) * size,
      lane: 0,
      measured: true,
    })),
    messageCount: messages.length,
    lastMessageId: messages.at(-1)?.id ?? null,
    layoutVersion: 0,
    viewportWidth: null,
  };
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

function getLatestVirtualizerOptions(): MockVirtualizerOptions {
  const options = latestVirtualizerOptionsRef.current;
  if (options === null) {
    throw new Error('useVirtualizer was not called');
  }

  return options;
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

function expectOverscan(overscan: number): Promise<void> {
  return waitFor(() => {
    expect(getLatestVirtualizerOptions().overscan).toBe(overscan);
  });
}

describe('ChatMessages', () => {
  beforeEach(() => {
    installScrollerMetrics();
    installScrollToMock();
    setScrollerMetrics({
      clientHeight: 800,
      clientWidth: 720,
      scrollHeight: 1200,
      scrollTop: 400,
    });
    scrollerMetrics.writes.length = 0;

    useToolStore.getState().reset();
    useChatStore.setState(useChatStore.getInitialState(), true);
    setRenderCachePersistenceAdapterForTests(null);
    resetRenderCacheStoreForTests();
    removeRenderCache('session-a');
    clearToolWidgetState();

    latestVirtualizerOptionsRef.current = null;
    messageItemPropsById.clear();
    mockMeasureElement.mockClear();
    mockTotalSize.current = 1200;
    mockUseVelocityScroll.mockClear();
    mockUseVirtualizer.mockClear();
    mockUseVirtualizerOptions.mockClear();
    mockVirtualItemIndexes.current = null;
    mockVirtualizerMeasure.mockClear();
    mockVirtualizerMeasureElement.mockClear();
    mockVirtualizerMeasurements.current = [];
    queuedMessageBubbleProps.length = 0;
    scrollToIndexMock.mockClear();
    velocityScrollAttachMock.mockClear();
  });

  afterEach(() => {
    removeRenderCache('session-a');
    setRenderCachePersistenceAdapterForTests(null);
    resetRenderCacheStoreForTests();
    restoreScrollerMetrics();
    vi.restoreAllMocks();
  });

  it('binds to a single session and uses session-prefixed item keys', async () => {
    const messages = [buildMessage({ id: 'user-a', role: 'user', content: 'hi' })];

    renderChatMessages({
      messages,
      sessionId: 'session-a',
    });

    await waitFor(() => {
      const userAProps = messageItemPropsById.get('user-a') as MockMessageItemProps | undefined;
      expect(userAProps?.animate).toBe(true);
    });

    expect(getLatestVirtualizerOptions().getItemKey(0)).toBe('session-a:user-a');
    expect(screen.getByTestId('message-item-user-a')).toHaveAttribute(
      'data-session-id',
      'session-a'
    );
  });

  it('renders TanStack virtual rows above the always-mounted tail', async () => {
    const messages = Array.from({ length: 12 }, (_value, index) =>
      buildMessage({ id: `assistant-${String(index)}`, role: 'assistant' })
    );

    renderChatMessages({ messages, sessionId: 'session-a' });

    await expectOverscan(20);

    expect(getLatestVirtualizerOptions().count).toBe(4);
    expect(screen.getByTestId('chat-list-inner')).toHaveStyle({ height: '1200px' });
    expect(screen.getByTestId('message-item-assistant-0')).toBeInTheDocument();
    expect(screen.getByTestId('message-item-assistant-11')).toBeInTheDocument();
  });

  it('keeps hidden verification on entry overscan while priming', async () => {
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

    expect(getLatestVirtualizerOptions().overscan).toBe(0);
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

    await expectOverscan(5);
    expect(getLatestVelocityScrollOptions().enabled).toBe(false);
  });

  it('keeps verification on entry overscan after explicit user scroll', async () => {
    const messages = [buildMessage({ id: 'assistant-1', role: 'assistant' })];

    renderChatMessages({
      messages,
      sessionId: 'session-a',
      isVisible: true,
      shouldPrime: true,
    });

    await expectOverscan(5);

    act(() => {
      getLatestVelocityScrollOptions().onUserScrollStart?.();
    });

    expect(getLatestVirtualizerOptions().overscan).toBe(5);
  });

  it('marks hidden verification ready when the rendered tail is stable at bottom', async () => {
    vi.useFakeTimers();

    try {
      const messages = [
        buildMessage({ id: 'assistant-1', role: 'assistant' }),
        buildMessage({ id: 'assistant-2', role: 'assistant' }),
        buildMessage({ id: 'assistant-3', role: 'assistant' }),
      ];
      const onVerificationResult = vi.fn();

      setScrollerMetrics({ clientHeight: 800, scrollHeight: 1200, scrollTop: 400 });

      renderChatMessages({
        messages,
        sessionId: 'session-a',
        isVisible: false,
        verificationPhase: 'hidden',
        verificationKey: 'hidden-ready',
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
    } finally {
      vi.useRealTimers();
    }
  });

  it('commits visible verification without bottom re-alignment after user scroll intent', () => {
    const messages = Array.from({ length: 15 }, (_value, index) =>
      buildMessage({ id: `assistant-${String(index)}`, role: 'assistant' })
    );
    const onVerificationResult = vi.fn();

    setScrollerMetrics({ clientHeight: 629, scrollHeight: 56253, scrollTop: 55624 });

    renderChatMessages({
      messages,
      sessionId: 'session-a',
      isVisible: true,
      verificationPhase: 'visible',
      verificationKey: 'visible-user-scroll-escape',
      onVerificationResult,
    });

    scrollerMetrics.writes.length = 0;
    setScrollerMetrics({ scrollTop: 43153 });
    const scroller = screen.getByTestId('chat-scroller');

    fireEvent.wheel(scroller, { deltaY: -120 });
    fireEvent.scroll(scroller);

    expect(onVerificationResult).toHaveBeenCalledWith({
      phase: 'visible',
      result: 'visible-ready',
      tailProofVersion: 1,
    });
    expect(scrollerMetrics.writes).toEqual([]);
  });

  it('handles history-load with a direct top scroll and clears the consumed intent', async () => {
    const messages = [
      buildMessage({ id: 'assistant-1', role: 'assistant' }),
      buildMessage({ id: 'assistant-2', role: 'assistant' }),
    ];

    useChatStore.setState({
      sessions: {
        'session-a': {
          messages,
          isAgentRunning: false,
          isStopPending: false,
          scrollIntent: 'history-load',
          hydrationState: 'hydrated',
          layoutVersion: 0,
          measurementCache: null,
        },
      },
    });

    setScrollerMetrics({ scrollTop: 400 });

    renderChatMessages({
      messages,
      sessionId: 'session-a',
    });

    expect(scrollerMetrics.scrollTop).toBe(0);
    await waitFor(() => {
      expect(useChatStore.getState().sessions['session-a']?.scrollIntent).toBeNull();
    });
  });

  it('handles session-restore with an imperative bottom scroll and clears the intent', async () => {
    const messages = [
      buildMessage({ id: 'assistant-1', role: 'assistant' }),
      buildMessage({ id: 'assistant-2', role: 'assistant' }),
    ];

    useChatStore.setState({
      sessions: {
        'session-a': {
          messages,
          isAgentRunning: false,
          isStopPending: false,
          scrollIntent: 'session-restore',
          hydrationState: 'hydrated',
          layoutVersion: 0,
          measurementCache: null,
        },
      },
    });

    setScrollerMetrics({ clientHeight: 800, scrollHeight: 1200, scrollTop: 0 });

    renderChatMessages({
      messages,
      sessionId: 'session-a',
    });

    await waitFor(() => {
      expect(scrollerMetrics.scrollTop).toBe(1200);
    });
    await waitFor(() => {
      expect(useChatStore.getState().sessions['session-a']?.scrollIntent).toBeNull();
    });
  });

  it('restores cached measurement sizes into TanStack estimates', () => {
    const messages = Array.from({ length: 10 }, (_value, index) =>
      buildMessage({ id: `assistant-${String(index)}`, role: 'assistant' })
    );

    const chatStore = useChatStore.getState();
    chatStore.getOrCreateSession('session-a');
    chatStore.setMessages('session-a', messages);
    chatStore.setMeasurementCache('session-a', {
      ...buildMeasurementCacheForMessages(messages, 64),
      layoutVersion: useChatStore.getState().sessions['session-a']?.layoutVersion ?? 0,
    });

    renderChatMessages({
      messages,
      sessionId: 'session-a',
    });

    expect(mockVirtualizerMeasure).toHaveBeenCalled();
    expect(getLatestVirtualizerOptions().estimateSize(0)).toBe(64);
  });

  it('uses estimated message sizes when no real cache is available', () => {
    const messages = Array.from({ length: 10 }, (_value, index) =>
      buildMessage({
        id: `assistant-${String(index)}`,
        role: index === 0 ? 'user' : 'assistant',
        content:
          index === 0
            ? 'short prompt'
            : 'A longer assistant reply that should produce a larger estimated height.',
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
          measurementCache: null,
        },
      },
    });

    renderChatMessages({
      messages,
      sessionId: 'session-a',
    });

    expect(mockVirtualizerMeasure).toHaveBeenCalled();
    expect(getLatestVirtualizerOptions().estimateSize(0)).toBeGreaterThan(0);
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
          kind: 'tanstack-v2',
          accessedAt: Date.now(),
          cache: {
            measurements: buildMeasurementCacheForMessages(messages, 96).measurements,
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
          measurementCache: null,
        },
      },
    });

    renderChatMessages({
      messages,
      sessionId: 'session-a',
    });

    await waitFor(() => {
      expect(useChatStore.getState().sessions['session-a']?.measurementCache).toEqual(
        expect.objectContaining({
          measurements: expect.arrayContaining([expect.objectContaining({ index: 0, size: 96 })]),
        })
      );
    });
  });

  it('renders queued and loading content outside the virtualized list', () => {
    renderChatMessages({
      messages: [buildMessage({ id: 'assistant-1', role: 'assistant' })],
      isAgentRunning: true,
      queuedMessage: buildQueuedMessage({ text: 'Queued follow-up' }),
    });

    expect(screen.getByTestId('queued-message-bubble')).toHaveTextContent('Queued follow-up');
    expect(screen.getByTestId('shimmer-text')).toHaveTextContent('Thinking');
    expect(queuedMessageBubbleProps).not.toHaveLength(0);
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

    fireEvent.click(screen.getByTestId('message-item-user-1'));

    await waitFor(() => {
      const props = messageItemPropsById.get('user-1') as MockMessageItemProps | undefined;
      expect(props?.animate).toBe(false);
    });
  });

  it('wires item props and session-scoped tool lookup into MessageItem', () => {
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

    const firstProps = messageItemPropsById.get('assistant-1') as MockMessageItemProps | undefined;
    if (firstProps === undefined) {
      throw new Error('Expected first assistant props');
    }

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

    const secondProps = messageItemPropsById.get('assistant-1') as MockMessageItemProps | undefined;
    if (secondProps === undefined) {
      throw new Error('Expected second assistant props');
    }

    expect(secondProps.onRewind).toBe(firstProps.onRewind);
    expect(secondProps.onOpenFile).toBe(firstProps.onOpenFile);
    expect(secondProps.onOpenUrl).toBe(firstProps.onOpenUrl);
    expect(secondProps.onFeedback).toBe(firstProps.onFeedback);
  });
});
