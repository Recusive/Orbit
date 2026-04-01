/**
 * ChatMessages - Virtualized chat list with message-aware scroll behavior.
 *
 * Architecture:
 * - `@virtuoso.dev/message-list` owns virtualization AND scroll behavior
 * - The library's built-in `auto-scroll-to-bottom` and `items-change` scroll
 *   modifiers handle all auto-scroll (streaming, new messages, etc.)
 * - Shimmer and queued message are rendered OUTSIDE the list as flex siblings
 *   so the library's Footer is empty and its `isAtBottom` detection (4px
 *   threshold) works correctly
 * - Explicit `scrollIntent` from the store handles history load / rewind /
 *   compact reload
 *
 * WARNING: Do NOT add `contain: paint`, `content-visibility: auto`, or
 * `user-select: none` to .message-item — breaks WKWebView text selection.
 */
import { VirtuosoMessageList, VirtuosoMessageListLicense } from '@virtuoso.dev/message-list';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';

import { MessageItem } from './messages';
import { QueuedMessageBubble } from './queued-message';
import { ToolWidgetSessionContext } from './tools/shared';

import type { ChatMessage } from './messages';
import type { ToolExecution } from '@/stores/agent/tool-store';
import type { QueuedMessage } from '@/stores/chat/queued-message-store';
import type {
  DataWithScrollModifier,
  ItemContent as VirtuosoItemContent,
  VirtuosoMessageListMethods,
} from '@virtuoso.dev/message-list';
import type { FC } from 'react';

import { ShimmerText } from '@/components/ui/shimmer-text';
import { useVelocityScroll } from '@/hooks/ui/use-velocity-scroll';
import { CHAT_WIDTH, CHAT_WIDTH_VAR } from '@/lib/utils';
import { deduplicateAndSortTools, useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';

/** Constant empty array — prevents a new [] allocation per no-tool message
 *  on every Virtuoso item re-render (e.g., container resize). */
const EMPTY_TOOLS: ToolExecution[] = [];

interface ChatMessagesProps {
  readonly messages: ChatMessage[];
  readonly isAgentRunning: boolean;
  readonly sessionId?: string;
  readonly queuedMessage: QueuedMessage | null;
  readonly onRewind: (messageId: string) => void;
  readonly onOpenFile: (path: string) => void;
  readonly onOpenUrl: (url: string) => void;
  readonly onCancelQueue: () => void;
  readonly onFeedback: () => void;
}

interface MessageListContext {
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

const CHAT_MAX_WIDTH_STYLE = {
  maxWidth: `var(${CHAT_WIDTH_VAR.primary}, ${String(CHAT_WIDTH.primary)}px)`,
};

/** Item wrapper style — max-width + CSS layout containment.
 *  `contain: layout style` creates an independent formatting context per message,
 *  so the browser can skip re-validating sibling layout when container width changes
 *  (panel resize). Does NOT include `paint` — that breaks WKWebView text selection. */
const ITEM_WRAPPER_STYLE = {
  maxWidth: `var(${CHAT_WIDTH_VAR.primary}, ${String(CHAT_WIDTH.primary)}px)`,
  contain: 'layout style' as const,
};

/** Stable style for the VirtuosoMessageList scroller. */
const LIST_STYLE = { scrollbarGutter: 'stable both-edges' as const };

const MessageItemContent: VirtuosoItemContent<ChatMessage, MessageListContext> = ({
  data: message,
  index,
  context,
}) => {
  const tools = context.toolsByMessageId.get(message.id) ?? EMPTY_TOOLS;

  return (
    <div
      className={`mx-auto px-4 mb-3${index === 0 ? ' pt-4' : ''}${index === context.messageCount - 1 ? ' pb-8' : ''}`}
      style={ITEM_WRAPPER_STYLE}
    >
      <MessageItem
        message={message}
        tools={tools}
        isLastAssistantMessage={message.id === context.lastAssistantMessageId}
        isLastInAssistantGroup={context.lastInAssistantGroupIds.has(message.id)}
        isLastMessage={index === context.messageCount - 1}
        isAgentRunning={context.isAgentRunning}
        animate={context.animatingMessageIds.has(message.id)}
        onRewind={context.onRewind}
        onOpenFile={context.onOpenFile}
        onOpenUrl={context.onOpenUrl}
        onFeedback={context.onFeedback}
        onAnimationComplete={context.onAnimationComplete}
      />
    </div>
  );
};

// NOTE: No Header component. Adding a Header causes the library's
// shortSizeAlign="top" padding to overshoot (it doesn't subtract
// Header height), creating a scrollbar on short conversations.
// Top padding is applied via pt-4 on the first MessageItemContent instead.

export const ChatMessages: FC<ChatMessagesProps> = ({
  messages,
  isAgentRunning,
  sessionId,
  queuedMessage,
  onRewind,
  onOpenFile,
  onOpenUrl,
  onCancelQueue,
  onFeedback,
}) => {
  const listRef = useRef<VirtuosoMessageListMethods<ChatMessage, MessageListContext>>(null);
  const prevSessionIdRef = useRef(sessionId);
  const prevMessageCount = useRef(0);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [animatingMessageIds, setAnimatingMessageIds] = useState<Set<string>>(() => new Set());

  // Velocity-based wheel damping for WKWebView — caps scroll speed so the
  // viewport buffer keeps items pre-rendered ahead of the scroll.
  const velocityScrollRef = useVelocityScroll();
  useEffect(() => {
    const scroller = listRef.current?.scrollerElement();
    if (!scroller) return;

    velocityScrollRef(scroller);
    return (): void => {
      velocityScrollRef(null);
    };
  }, [velocityScrollRef, sessionId]);

  const handleAnimationComplete = useCallback((messageId: string): void => {
    setAnimatingMessageIds((prev) => {
      if (!prev.has(messageId)) {
        return prev;
      }

      const next = new Set(prev);
      next.delete(messageId);
      return next;
    });
  }, []);

  const { activeTools, completedTools } = useToolStore(
    useShallow((state) => ({
      activeTools: state.activeTools,
      completedTools: state.completedTools,
    }))
  );

  const toolsByMessageId = useMemo(() => {
    const activeByMsg = new Map<string, ToolExecution[]>();
    const completedByMsg = new Map<string, ToolExecution[]>();

    for (const tool of Object.values(activeTools)) {
      const list = activeByMsg.get(tool.messageId);
      if (list) {
        list.push(tool);
      } else {
        activeByMsg.set(tool.messageId, [tool]);
      }
    }

    for (const tool of completedTools) {
      const list = completedByMsg.get(tool.messageId);
      if (list) {
        list.push(tool);
      } else {
        completedByMsg.set(tool.messageId, [tool]);
      }
    }

    const allMessageIds = new Set([...activeByMsg.keys(), ...completedByMsg.keys()]);
    const result = new Map<string, ToolExecution[]>();
    for (const messageId of allMessageIds) {
      result.set(
        messageId,
        deduplicateAndSortTools(
          activeByMsg.get(messageId) ?? [],
          completedByMsg.get(messageId) ?? []
        )
      );
    }

    return result;
  }, [activeTools, completedTools]);

  const lastAssistantMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'assistant') {
        return messages[i]?.id ?? null;
      }
    }
    return null;
  }, [messages]);

  const lastInAssistantGroupIds = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      if (message?.role !== 'assistant') {
        continue;
      }
      if (messages[i + 1]?.role !== 'assistant') {
        ids.add(message.id);
      }
    }
    return ids;
  }, [messages]);

  const scrollIntent = useChatStore(
    (state) => state.sessions[sessionId ?? '']?.scrollIntent ?? null
  );

  const onRewindRef = useRef(onRewind);
  onRewindRef.current = onRewind;
  const onOpenFileRef = useRef(onOpenFile);
  onOpenFileRef.current = onOpenFile;
  const onOpenUrlRef = useRef(onOpenUrl);
  onOpenUrlRef.current = onOpenUrl;
  const onFeedbackRef = useRef(onFeedback);
  onFeedbackRef.current = onFeedback;

  const stableOnRewind = useCallback((messageId: string): void => {
    onRewindRef.current(messageId);
  }, []);

  const stableOnOpenFile = useCallback((path: string): void => {
    onOpenFileRef.current(path);
  }, []);

  const stableOnOpenUrl = useCallback((url: string): void => {
    onOpenUrlRef.current(url);
  }, []);

  const stableOnFeedback = useCallback((): void => {
    onFeedbackRef.current();
  }, []);

  // ── Scroll modifiers ─────────────────────────────────────────────────
  // The library handles all auto-scroll internally via these modifiers.
  // With no Footer content, isAtBottom (4px threshold) works correctly.
  const messageListData = useMemo((): DataWithScrollModifier<ChatMessage> => {
    // Empty data guard — the library's binary search crashes when scroll
    // modifiers (item-location, items-change, auto-scroll-to-bottom) target
    // items in an empty array: "Failed binary finding record, searched for 0".
    // This happens during session transitions when messages briefly becomes [].
    if (messages.length === 0) {
      return { data: messages };
    }

    // Explicit intent from service layer (setMessages callers)
    if (scrollIntent !== null) {
      switch (scrollIntent) {
        case 'history-load':
          return {
            data: messages,
            scrollModifier: {
              type: 'item-location',
              location: { index: 0, align: 'start' },
            },
          };
        case 'compact-reload':
          return {
            data: messages,
            scrollModifier: { type: 'items-change', behavior: 'auto' },
          };
        case 'rewind':
          return {
            data: messages,
            scrollModifier: 'remove-from-end',
          };
      }
    }

    // Heuristic fallback for streaming and message appends.
    const prevLength = prevMessageCount.current;

    if (messages.length === prevLength) {
      // Streaming: existing items changed content (same count).
      // The library auto-scrolls if previously at bottom.
      return {
        data: messages,
        scrollModifier: { type: 'items-change', behavior: 'smooth' },
      };
    }

    // Append: new message(s) arrived.
    return {
      data: messages,
      scrollModifier: {
        type: 'auto-scroll-to-bottom',
        autoScroll: ({ atBottom }: { atBottom: boolean }): ScrollBehavior | false =>
          atBottom ? 'smooth' : false,
      },
    };
  }, [messages, scrollIntent]);

  const messageListContext = useMemo(
    (): MessageListContext => ({
      toolsByMessageId,
      lastAssistantMessageId,
      lastInAssistantGroupIds,
      messageCount: messages.length,
      isAgentRunning,
      animatingMessageIds,
      onRewind: stableOnRewind,
      onOpenFile: stableOnOpenFile,
      onOpenUrl: stableOnOpenUrl,
      onFeedback: stableOnFeedback,
      onAnimationComplete: handleAnimationComplete,
    }),
    [
      toolsByMessageId,
      lastAssistantMessageId,
      lastInAssistantGroupIds,
      messages.length,
      isAgentRunning,
      animatingMessageIds,
      stableOnRewind,
      stableOnOpenFile,
      stableOnOpenUrl,
      stableOnFeedback,
      handleAnimationComplete,
    ]
  );

  const sessionKey = sessionId ?? '';

  // Stable key function — avoids creating a new closure on each render.
  // Virtuoso compares the function reference; a new ref can force item re-renders.
  const computeItemKey = useCallback(
    ({ index }: { index: number }): string => `${sessionKey}:${String(index)}`,
    [sessionKey]
  );

  // Clear consumed scroll intent
  useEffect(() => {
    if (scrollIntent !== null && sessionId !== undefined) {
      useChatStore.getState().clearScrollIntent(sessionId);
    }
  }, [scrollIntent, sessionId]);

  // Session switch: reset local state only. The data prop's item-location
  // modifier (from history-load scrollIntent) handles the data replacement
  // and scroll. A second data.replace() here would conflict — two replacements
  // through different library signal paths interleave with ResizeObserver
  // measurements, causing scrollbar jitter.
  useEffect(() => {
    if (prevSessionIdRef.current === sessionId) {
      return;
    }

    setAnimatingMessageIds(new Set());
    // Set to current message count (not 0) so the heuristic fallback
    // doesn't misread the cached data as "new appends" on the next render.
    prevMessageCount.current = messagesRef.current.length;
    prevSessionIdRef.current = sessionId;
  }, [sessionId]);

  // New user message: animate and force scroll to bottom.
  // The library's auto-scroll-to-bottom modifier handles subsequent messages.
  useEffect(() => {
    const prevCount = prevMessageCount.current;
    prevMessageCount.current = messages.length;

    if (messages.length === prevCount + 1) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === 'user') {
        setAnimatingMessageIds((prev) => new Set(prev).add(lastMessage.id));
        listRef.current?.scrollToItem({ index: 'LAST', align: 'end', behavior: 'smooth' });
      }
    }
  }, [messages]);

  return (
    <ToolWidgetSessionContext.Provider value={sessionKey}>
      <div className="flex-1 flex flex-col min-h-0">
        <VirtuosoMessageListLicense licenseKey="a014c4870c11acfee45b6a7935dd7d97TzoyMjI7RToxODA2NjE2MDMxOTAz">
          <VirtuosoMessageList<ChatMessage, MessageListContext>
            ref={listRef}
            data={messageListData}
            context={messageListContext}
            computeItemKey={computeItemKey}
            ItemContent={MessageItemContent}
            increaseViewportBy={10000}
            shortSizeAlign="top"
            className="flex-1 overflow-x-hidden overscroll-y-contain"
            style={LIST_STYLE}
          />
        </VirtuosoMessageListLicense>

        {/* Shimmer + queued message are OUTSIDE the list so the library's
            isAtBottom detection (4px threshold) isn't broken by Footer content. */}
        {isAgentRunning ? (
          <div className="shrink-0 mx-auto px-4 pb-8 w-full" style={CHAT_MAX_WIDTH_STYLE}>
            <div className="flex items-center gap-2 px-[9px] py-2">
              <ShimmerText className="font-sans text-base text-foreground">Thinking</ShimmerText>
            </div>
          </div>
        ) : null}
        {queuedMessage !== null ? (
          <div className="shrink-0 mx-auto px-4 pb-2 w-full" style={CHAT_MAX_WIDTH_STYLE}>
            <QueuedMessageBubble message={queuedMessage} onCancel={onCancelQueue} />
          </div>
        ) : null}
      </div>
    </ToolWidgetSessionContext.Provider>
  );
};
