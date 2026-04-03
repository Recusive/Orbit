/**
 * ChatMessages - Virtualized chat list with message-aware scroll behavior.
 *
 * Architecture:
 * - Each instance is bound to ONE session for its lifetime (mounted by
 *   SessionInstance with `key={sessionId}`). No session-switch logic here.
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
import { createLogger } from '@orbit/common/lib';
import { VirtuosoMessageList, VirtuosoMessageListLicense } from '@virtuoso.dev/message-list';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

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
import {
  deduplicateAndSortTools,
  useSessionActiveTools,
  useSessionCompletedTools,
} from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';

const logger = createLogger('ChatMessages');

/** Constant empty array — prevents a new [] allocation per no-tool message
 *  on every Virtuoso item re-render (e.g., container resize). */
const EMPTY_TOOLS: ToolExecution[] = [];
const OVERSCAN_PARKED = 0;
const OVERSCAN_ENTRY = 800;
const OVERSCAN_STEADY = 8000;
const READY_STABLE_MS = 48;
const READY_TIMEOUT_MS = 1500;

type OverscanPhase = 'parked' | 'entry' | 'steady';
type RestorePhase = 'idle' | 'positioning' | 'stabilizing' | 'done';

interface ChatMessagesProps {
  readonly messages: ChatMessage[];
  readonly isAgentRunning: boolean;
  readonly sessionId?: string;
  readonly isVisible?: boolean;
  readonly shouldPrime?: boolean;
  readonly queuedMessage: QueuedMessage | null;
  readonly onRewind: (messageId: string) => void;
  readonly onOpenFile: (path: string) => void;
  readonly onOpenUrl: (url: string) => void;
  readonly onCancelQueue: () => void;
  readonly onFeedback: () => void;
  /** Called once when Virtuoso has rendered items and scroll is positioned.
   *  SessionInstance waits for this before revealing the instance. */
  readonly onReady?: () => void;
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
  data,
  index,
  context,
}) => {
  // Virtuoso can call this with a stale index during key-driven remounts,
  // delivering undefined before the new data array is committed. The library's
  // type says `data: ChatMessage` but the runtime disagrees during transitions.
  const message = data as ChatMessage | undefined;
  if (!message) {
    return null;
  }

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
  isVisible = true,
  shouldPrime = true,
  queuedMessage,
  onRewind,
  onOpenFile,
  onOpenUrl,
  onCancelQueue,
  onFeedback,
  onReady,
}) => {
  const listRef = useRef<VirtuosoMessageListMethods<ChatMessage, MessageListContext>>(null);
  const prevMessageCount = useRef(0);
  const lastPlacedMessagesRef = useRef<ChatMessage[] | null>(null);
  const [animatingMessageIds, setAnimatingMessageIds] = useState<Set<string>>(() => new Set());
  const [isReadyForSteady, setIsReadyForSteady] = useState(false);
  const [hasUserScrolled, setHasUserScrolled] = useState(false);

  // Velocity-based wheel damping for WKWebView — caps scroll speed so the
  // viewport buffer keeps items pre-rendered ahead of the scroll.
  const velocityScrollRef = useVelocityScroll({
    enabled: isVisible,
    onUserScrollStart: () => {
      setHasUserScrolled(true);
    },
  });
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

  // Per-session tool selectors — each keep-alive instance reads its OWN
  // session's tools from the cache, not the global active arrays. This
  // prevents all mounted instances from re-rendering on switchSession().
  const sessionKey = sessionId ?? '';
  const activeTools = useSessionActiveTools(sessionKey);
  const completedTools = useSessionCompletedTools(sessionKey);

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

  const sid = (sessionId ?? '').slice(-6);

  const scrollIntent = useChatStore(
    (state) => state.sessions[sessionId ?? '']?.scrollIntent ?? null
  );

  const snapshotSizeCache = useCallback((): void => {
    if (!sessionId) return;

    const handle = listRef.current;
    if (!handle) return;

    const store = useChatStore.getState();
    const session = store.sessions[sessionId];
    if (!session) return;

    store.setVirtuosoSizeCache(sessionId, {
      ranges: handle.getSizeRanges(),
      messageCount: session.messages.length,
      lastMessageId: session.messages.at(-1)?.id ?? null,
      layoutVersion: session.layoutVersion,
    });
  }, [sessionId]);

  useLayoutEffect(() => {
    if (!sessionId) return;

    const store = useChatStore.getState();
    const session = store.sessions[sessionId];
    const cache = session?.virtuosoSizeCache ?? null;
    if (!cache || !session) return;
    if (cache.layoutVersion !== session.layoutVersion) return;
    if (cache.messageCount !== session.messages.length) return;
    if (cache.lastMessageId !== (session.messages.at(-1)?.id ?? null)) return;

    listRef.current?.setSizeRanges([...cache.ranges]);
  }, [sessionId]);

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
      logger.debug(`[${sid}] scrollModifier: empty data`);
      return { data: messages };
    }

    // Explicit intent from service layer (setMessages callers)
    if (scrollIntent !== null) {
      switch (scrollIntent) {
        case 'history-load':
          logger.debug(`[${sid}] scrollModifier: history-load → item-location(0,start)`, {
            msgCount: messages.length,
          });
          return {
            data: messages,
            scrollModifier: {
              type: 'item-location',
              location: { index: 0, align: 'start' },
            },
          };
        case 'compact-reload':
          logger.debug(`[${sid}] scrollModifier: compact-reload → items-change(auto)`);
          return {
            data: messages,
            scrollModifier: { type: 'items-change', behavior: 'auto' },
          };
        case 'session-restore':
          // Multi-instance keep-alive: scroll-to-bottom is handled by an
          // imperative scrollToItem() call in the effect below, NOT through
          // the data prop's scrollModifier. The data-prop approach fails
          // because clearing the intent triggers a second render that passes
          // plain data, which can cancel the pending scroll.
          logger.debug(
            `[${sid}] scrollModifier: session-restore → plain data (imperative scroll)`,
            {
              msgCount: messages.length,
              prevCount: prevMessageCount.current,
            }
          );
          return {
            data: messages,
          };
        case 'session-refresh':
          // Session refresh: backend re-sent the same data. Preserve scroll position.
          logger.debug(`[${sid}] scrollModifier: session-refresh → plain data (no modifier)`, {
            msgCount: messages.length,
            prevCount: prevMessageCount.current,
          });
          return {
            data: messages,
          };
        case 'rewind':
          logger.debug(`[${sid}] scrollModifier: rewind → remove-from-end`);
          return {
            data: messages,
            scrollModifier: 'remove-from-end',
          };
      }
    }

    // A just-applied session placement intent clears on the next effect-driven
    // render. Keep that render on the plain data path so we don't immediately
    // fall through to the heuristic items-change modifier.
    if (lastPlacedMessagesRef.current === messages) {
      return { data: messages };
    }

    // Heuristic fallback for streaming and message appends.
    const prevLength = prevMessageCount.current;

    if (messages.length === prevLength) {
      // Streaming: existing items changed content (same count).
      // The library auto-scrolls if previously at bottom.
      logger.debug(`[${sid}] scrollModifier: heuristic items-change(smooth)`, {
        count: messages.length,
      });
      return {
        data: messages,
        scrollModifier: { type: 'items-change', behavior: 'smooth' },
      };
    }

    // Append: new message(s) arrived.
    logger.debug(`[${sid}] scrollModifier: heuristic auto-scroll-to-bottom`, {
      prevLength,
      newLength: messages.length,
    });
    return {
      data: messages,
      scrollModifier: {
        type: 'auto-scroll-to-bottom',
        autoScroll: ({ atBottom }: { atBottom: boolean }): ScrollBehavior | false =>
          atBottom ? 'smooth' : false,
      },
    };
  }, [messages, scrollIntent, sid]);

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

  const overscanPhase: OverscanPhase =
    !shouldPrime && !isVisible
      ? 'parked'
      : isReadyForSteady || hasUserScrolled
        ? 'steady'
        : shouldPrime
          ? 'entry'
          : 'steady';
  const overscan =
    overscanPhase === 'parked'
      ? OVERSCAN_PARKED
      : overscanPhase === 'entry'
        ? OVERSCAN_ENTRY
        : OVERSCAN_STEADY;
  const previousOverscanPhaseRef = useRef<OverscanPhase | null>(null);

  useEffect(() => {
    if (previousOverscanPhaseRef.current === overscanPhase) {
      return;
    }

    previousOverscanPhaseRef.current = overscanPhase;
    logger.debug(`[${sid}] Overscan phase`, {
      overscanPhase,
      overscan,
      isReadyForSteady,
      hasUserScrolled,
      shouldPrime,
      isVisible,
    });
    if (import.meta.env.DEV) {
      performance.mark('overscan-phase-change');
    }
  }, [hasUserScrolled, isReadyForSteady, isVisible, overscan, overscanPhase, shouldPrime, sid]);

  // Stable key function — avoids creating a new closure on each render.
  // Virtuoso compares the function reference; a new ref can force item re-renders.
  const computeItemKey = useCallback(
    ({ data }: { data: ChatMessage }): string => `${sessionKey}:${data.id}`,
    [sessionKey]
  );

  // ── Event-driven readiness ──────────────────────────────────────────
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const hasSignaledReadyRef = useRef(false);
  const needsRestoreRef = useRef(false);
  const hasEverHadMessagesRef = useRef(false);
  const restorePhaseRef = useRef<RestorePhase>('idle');
  const lastMessageIdRef = useRef<string | null>(messages.at(-1)?.id ?? null);
  const readinessTimeoutRef = useRef<number | null>(null);
  const readinessStableTimerRef = useRef<number | null>(null);
  const readinessResizeObserverRef = useRef<ResizeObserver | null>(null);
  const readinessStartMarkRef = useRef<string | null>(null);
  lastMessageIdRef.current = messages.at(-1)?.id ?? null;

  const cancelReadinessWork = useCallback((): void => {
    if (readinessTimeoutRef.current !== null) {
      window.clearTimeout(readinessTimeoutRef.current);
      readinessTimeoutRef.current = null;
    }
    if (readinessStableTimerRef.current !== null) {
      window.clearTimeout(readinessStableTimerRef.current);
      readinessStableTimerRef.current = null;
    }
    readinessResizeObserverRef.current?.disconnect();
    readinessResizeObserverRef.current = null;
  }, []);

  const alignScrollerToBottom = useCallback((): void => {
    const handle = listRef.current;
    if (!handle) return;

    handle.scrollToItem({ index: 'LAST', align: 'end' });
    const scroller = handle.scrollerElement();
    if (!scroller) return;

    scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  }, []);

  const signalReady = useCallback(
    (reason: 'timeout' | 'stabilized' | 'no-handle'): void => {
      if (hasSignaledReadyRef.current) {
        return;
      }

      hasSignaledReadyRef.current = true;
      restorePhaseRef.current = 'done';
      cancelReadinessWork();
      alignScrollerToBottom();
      setIsReadyForSteady(true);
      snapshotSizeCache();

      logger.debug(`[${sid}] Ready`, {
        reason,
        msgCount: messages.length,
      });
      if (import.meta.env.DEV) {
        const readyMarkName = sessionKey !== '' ? `session-ready:${sessionKey}` : 'session-ready';
        performance.mark('session-ready');
        performance.mark(readyMarkName);
        if (readinessStartMarkRef.current !== null) {
          performance.measure(
            sessionKey !== '' ? `readiness-duration:${sessionKey}` : 'readiness-duration',
            readinessStartMarkRef.current,
            readyMarkName
          );
        }
      }

      onReadyRef.current?.();
    },
    [
      alignScrollerToBottom,
      cancelReadinessWork,
      messages.length,
      sessionKey,
      sid,
      snapshotSizeCache,
    ]
  );

  const startTemporaryResizeStabilityWindow = useCallback((): void => {
    if (readinessStableTimerRef.current !== null) {
      window.clearTimeout(readinessStableTimerRef.current);
      readinessStableTimerRef.current = null;
    }
    readinessResizeObserverRef.current?.disconnect();
    readinessResizeObserverRef.current = null;

    const scheduleStabilityCheck = (): void => {
      if (readinessStableTimerRef.current !== null) {
        window.clearTimeout(readinessStableTimerRef.current);
      }
      readinessStableTimerRef.current = window.setTimeout(() => {
        listRef.current?.scrollToItem({ index: 'LAST', align: 'end' });
        signalReady('stabilized');
      }, READY_STABLE_MS);
    };

    scheduleStabilityCheck();

    const listElement = listRef.current
      ?.scrollerElement()
      ?.querySelector<HTMLElement>('[data-testid="virtuoso-list"]');
    if (!listElement) {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (restorePhaseRef.current !== 'stabilizing') {
        return;
      }
      scheduleStabilityCheck();
    });

    observer.observe(listElement);
    readinessResizeObserverRef.current = observer;
  }, [signalReady]);

  const beginStabilizationIfTargetRendered = useCallback(
    (rendered: ChatMessage[]): boolean => {
      const targetId = lastMessageIdRef.current;
      const scroller = listRef.current?.scrollerElement();
      const isBottomAligned =
        scroller !== null &&
        scroller !== undefined &&
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
      const hasTargetVisible = targetId !== null && rendered.some((item) => item.id === targetId);

      if (!isBottomAligned && !hasTargetVisible) {
        return false;
      }

      restorePhaseRef.current = 'stabilizing';
      logger.debug(`[${sid}] Entering stabilization`, {
        targetId,
        isBottomAligned,
        scrollTop: scroller?.scrollTop ?? null,
        scrollHeight: scroller?.scrollHeight ?? null,
        clientHeight: scroller?.clientHeight ?? null,
        renderedCount: rendered.length,
      });
      startTemporaryResizeStabilityWindow();
      return true;
    },
    [sid, startTemporaryResizeStabilityWindow]
  );

  const handleRenderedDataChange = useCallback(
    (rendered: ChatMessage[]): void => {
      if (import.meta.env.DEV && overscanPhase === 'entry') {
        performance.mark('rendered-item-count');
      }
      if (overscanPhase === 'entry') {
        logger.debug(`[${sid}] Rendered item count`, {
          count: rendered.length,
        });
      }

      if (restorePhaseRef.current !== 'positioning') {
        return;
      }

      beginStabilizationIfTargetRendered(rendered);
    },
    [beginStabilizationIfTargetRendered, overscanPhase, sid]
  );

  // Capture the restore intent into a ref before the clear effect runs.
  // Also trigger for re-mounted hydrated instances (no session-restore intent,
  // but messages appear on first render via useSessionMessages).
  if (scrollIntent === 'session-restore' && messages.length > 0 && !hasSignaledReadyRef.current) {
    needsRestoreRef.current = true;
  }
  if (!hasEverHadMessagesRef.current && messages.length > 0 && !hasSignaledReadyRef.current) {
    hasEverHadMessagesRef.current = true;
    needsRestoreRef.current = true;
  }

  useEffect(() => {
    if (!shouldPrime && restorePhaseRef.current !== 'done') {
      needsRestoreRef.current = messages.length > 0 && !hasSignaledReadyRef.current;
      cancelReadinessWork();
      restorePhaseRef.current = 'idle';
    }
  }, [cancelReadinessWork, messages.length, shouldPrime]);

  useLayoutEffect(() => {
    if (!shouldPrime || !needsRestoreRef.current || hasSignaledReadyRef.current) return;

    needsRestoreRef.current = false;

    const handle = listRef.current;
    if (!handle) {
      signalReady('no-handle');
      return;
    }

    restorePhaseRef.current = 'positioning';
    alignScrollerToBottom();
    if (import.meta.env.DEV) {
      const startMarkName = sessionKey !== '' ? `readiness-start:${sessionKey}` : 'readiness-start';
      readinessStartMarkRef.current = startMarkName;
      performance.mark(startMarkName);
    }

    logger.debug(`[${sid}] Starting readiness`, {
      lastMessageId: lastMessageIdRef.current,
      msgCount: messages.length,
    });

    cancelReadinessWork();
    readinessTimeoutRef.current = window.setTimeout(() => {
      alignScrollerToBottom();
      logger.debug(`[${sid}] Readiness timeout`, {
        phase: restorePhaseRef.current,
      });
      signalReady('timeout');
    }, READY_TIMEOUT_MS);
    beginStabilizationIfTargetRendered(handle.data.getCurrentlyRendered());
  }, [
    alignScrollerToBottom,
    beginStabilizationIfTargetRendered,
    cancelReadinessWork,
    messages.length,
    sessionKey,
    shouldPrime,
    sid,
    signalReady,
  ]);

  // Clear consumed scroll intent (safe — poll is ref-driven, not affected)
  useEffect(() => {
    if (scrollIntent !== null && sessionId !== undefined) {
      logger.debug(`[${sid}] Clearing scrollIntent: ${scrollIntent}`);
      useChatStore.getState().clearScrollIntent(sessionId);
    }
  }, [scrollIntent, sessionId, sid]);

  const previousShouldPrimeRef = useRef(shouldPrime);
  useEffect(() => {
    if (previousShouldPrimeRef.current && !shouldPrime) {
      snapshotSizeCache();
    }
    previousShouldPrimeRef.current = shouldPrime;
  }, [shouldPrime, snapshotSizeCache]);

  useEffect(() => {
    return (): void => {
      cancelReadinessWork();
      snapshotSizeCache();
    };
  }, [cancelReadinessWork, snapshotSizeCache]);

  useLayoutEffect(() => {
    if (scrollIntent === 'session-restore' || scrollIntent === 'session-refresh') {
      logger.debug(`[${sid}] Pinning lastPlacedMessages (${scrollIntent})`, {
        msgCount: messages.length,
      });
      lastPlacedMessagesRef.current = messages;
      return;
    }

    if (lastPlacedMessagesRef.current !== messages) {
      lastPlacedMessagesRef.current = null;
    }
  }, [messages, scrollIntent, sid]);

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
            initialData={messages}
            data={messageListData}
            context={messageListContext}
            itemIdentity={(message) => message.id}
            computeItemKey={computeItemKey}
            ItemContent={MessageItemContent}
            onRenderedDataChange={handleRenderedDataChange}
            increaseViewportBy={overscan}
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
