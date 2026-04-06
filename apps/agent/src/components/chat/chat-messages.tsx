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
import { VirtuosoMessageList, VirtuosoMessageListLicense } from '@virtuoso.dev/message-list';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { MessageItem } from './messages';
import { QueuedMessageBubble } from './queued-message';
import { ToolWidgetLayoutFrozenContext, ToolWidgetSessionContext } from './tools/shared';

import type { ChatMessage } from './messages';
import type { SessionSwitchTraceGeometry } from '@/services/conversations/session-switch-trace';
import type { ToolExecution } from '@/stores/agent/tool-store';
import type { VirtuosoSizeCache } from '@/stores/chat/chat-store';
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
  getShownSessionTraceRequest,
  markSwitchTimeline,
  recordSessionSwitchTrace,
} from '@/services/conversations/session-switch-trace';
import {
  deduplicateAndSortTools,
  useSessionActiveTools,
  useSessionCompletedTools,
} from '@/stores/agent/tool-store';
import {
  useChatStore,
  useSessionLastLayoutMutationAt,
  useSessionLayoutPendingCount,
  useSessionLayoutSettledVersion,
} from '@/stores/chat/chat-store';
import { getRenderCache, getRenderCacheAsync } from '@/stores/chat/render-cache-store';
import { useSessionSwitchRequestId } from '@/stores/chat/session-switch-store';

/** Constant empty array — prevents a new [] allocation per no-tool message
 *  on every Virtuoso item re-render (e.g., container resize). */
const EMPTY_TOOLS: ToolExecution[] = [];
const OVERSCAN_PARKED = 0;
const OVERSCAN_ENTRY = 800;
const OVERSCAN_STEADY = 8000;
const PREMEASURE_STEP_PX = OVERSCAN_STEADY * 2;
const PREMEASURE_STABLE_MS = 32;
const PREMEASURE_TIMEOUT_MS = 120;
const HIDDEN_READY_STABLE_MS = 48;
const VISIBLE_READY_QUIET_MS = 200;
const READY_TIMEOUT_MS = 1500;
const BOTTOM_TOLERANCE_PX = 4;
const POSITIONING_RECHECK_MS = 32;
const VIEWPORT_WIDTH_TOLERANCE_PX = 16;
const ESTIMATED_CHARS_PER_LINE = 72;
const ESTIMATED_USER_BASE_HEIGHT = 48;
const ESTIMATED_USER_LINE_HEIGHT = 24;
const ESTIMATED_ASSISTANT_BASE_HEIGHT = 68;
const ESTIMATED_ASSISTANT_LINE_HEIGHT = 22;
const ESTIMATED_THINKING_HEIGHT = 96;
const ESTIMATED_IMAGE_GRID_HEIGHT = 144;
const ESTIMATED_EXTRA_IMAGE_ROW_HEIGHT = 24;
const ESTIMATED_COMPLEX_MARKDOWN_BONUS = 48;
const MAX_ESTIMATED_MESSAGE_HEIGHT = 640;

type OverscanPhase = 'parked' | 'entry' | 'steady';
type RestorePhase = 'idle' | 'positioning' | 'premeasuring' | 'stabilizing' | 'done';

interface ScrollerMetrics {
  readonly bottomTop: number;
  readonly clientHeight: number;
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly scroller: HTMLDivElement;
}

interface RenderSurfaceMetrics extends ScrollerMetrics {
  readonly isAtBottom: boolean;
  readonly renderedRowCount: number;
  readonly tailSentinelRendered: boolean;
}

interface ReadinessSurfaceSnapshot {
  readonly bottomTop: number;
  readonly layoutSettledVersion: number;
  readonly renderedRowCount: number;
  readonly scrollHeight: number;
  readonly scrollTop: number;
}

function getSessionSwitchGeometrySnapshotFromMetrics(
  metrics: ScrollerMetrics | null,
  state: {
    renderedRowCount: number;
    tailSentinelRendered: boolean;
    layoutPendingCount: number;
    lastLayoutMutationAt: number | null;
    overscanPhase: string;
    sizeCacheRestored: boolean;
    purgeItemSizesUsed: boolean;
  }
): SessionSwitchTraceGeometry {
  return {
    scrollTop: metrics?.scrollTop ?? null,
    clientHeight: metrics?.clientHeight ?? null,
    scrollHeight: metrics?.scrollHeight ?? null,
    bottomTop: metrics?.bottomTop ?? null,
    renderedRowCount: state.renderedRowCount,
    tailSentinelRendered: state.tailSentinelRendered,
    layoutPendingCount: state.layoutPendingCount,
    lastLayoutMutationAt: state.lastLayoutMutationAt,
    overscanPhase: state.overscanPhase,
    sizeCacheRestored: state.sizeCacheRestored,
    purgeItemSizesUsed: state.purgeItemSizesUsed,
  };
}

function buildReadinessSurfaceSnapshot(
  metrics: RenderSurfaceMetrics,
  layoutSettledVersion: number
): ReadinessSurfaceSnapshot {
  return {
    scrollHeight: metrics.scrollHeight,
    scrollTop: metrics.scrollTop,
    bottomTop: metrics.bottomTop,
    renderedRowCount: metrics.renderedRowCount,
    layoutSettledVersion,
  };
}

function isSameReadinessSurfaceSnapshot(
  left: ReadinessSurfaceSnapshot | null,
  right: ReadinessSurfaceSnapshot
): boolean {
  if (!left) {
    return false;
  }

  return (
    left.scrollHeight === right.scrollHeight &&
    left.scrollTop === right.scrollTop &&
    left.bottomTop === right.bottomTop &&
    left.renderedRowCount === right.renderedRowCount &&
    left.layoutSettledVersion === right.layoutSettledVersion
  );
}

function buildReadinessProgressSignature(input: {
  readonly phase: RestorePhase;
  readonly verificationPhase: 'hidden' | 'visible' | null;
  readonly metrics: RenderSurfaceMetrics | null;
  readonly layoutPendingCount: number;
  readonly layoutSettledVersion: number;
  readonly renderedCount: number;
}): string {
  const metricsPart =
    input.metrics === null
      ? 'missing'
      : [
          String(input.metrics.scrollHeight),
          String(input.metrics.scrollTop),
          String(input.metrics.bottomTop),
          String(input.metrics.renderedRowCount),
          String(input.metrics.tailSentinelRendered),
          String(input.metrics.isAtBottom),
        ].join(':');

  return [
    input.phase,
    input.verificationPhase ?? 'idle',
    metricsPart,
    String(input.layoutPendingCount),
    String(input.layoutSettledVersion),
    String(input.renderedCount),
  ].join('|');
}

function estimateWrappedLines(text: string, charsPerLine: number): number {
  const lines = text.split('\n');
  let wrappedLines = 0;

  for (const line of lines) {
    wrappedLines += Math.max(1, Math.ceil(line.length / charsPerLine));
  }

  return Math.max(1, wrappedLines);
}

function estimateMessageHeight(message: ChatMessage): number {
  const content = message.displayedContent.length > 0 ? message.displayedContent : message.content;
  const baseHeight =
    message.role === 'user' ? ESTIMATED_USER_BASE_HEIGHT : ESTIMATED_ASSISTANT_BASE_HEIGHT;
  const lineHeight =
    message.role === 'user' ? ESTIMATED_USER_LINE_HEIGHT : ESTIMATED_ASSISTANT_LINE_HEIGHT;

  let estimatedHeight =
    baseHeight + estimateWrappedLines(content, ESTIMATED_CHARS_PER_LINE) * lineHeight;

  if (
    message.role === 'assistant' &&
    (content.includes('```') || content.includes('|') || content.includes('!['))
  ) {
    estimatedHeight += ESTIMATED_COMPLEX_MARKDOWN_BONUS;
  }

  if ((message.thinkingBlocks?.length ?? 0) > 0 || message.thinking) {
    estimatedHeight += ESTIMATED_THINKING_HEIGHT;
  }

  if ((message.attachedImages?.length ?? 0) > 0) {
    estimatedHeight += ESTIMATED_IMAGE_GRID_HEIGHT;
    estimatedHeight +=
      Math.max(0, (message.attachedImages?.length ?? 1) - 1) * ESTIMATED_EXTRA_IMAGE_ROW_HEIGHT;
  }

  return Math.min(MAX_ESTIMATED_MESSAGE_HEIGHT, estimatedHeight);
}

function buildEstimatedSizeRanges(messages: ChatMessage[]): { k: number; v: number }[] {
  const ranges: { k: number; v: number }[] = [];
  let previousHeight: number | null = null;

  messages.forEach((message, index) => {
    const nextHeight = estimateMessageHeight(message);
    if (previousHeight === nextHeight) {
      return;
    }

    ranges.push({ k: index, v: nextHeight });
    previousHeight = nextHeight;
  });

  return ranges;
}

function isViewportWidthCompatible(
  cacheEntry: VirtuosoSizeCache,
  viewportWidth: number | null
): boolean {
  if (
    cacheEntry.viewportWidth === undefined ||
    cacheEntry.viewportWidth === null ||
    viewportWidth === null
  ) {
    return true;
  }

  return Math.abs(cacheEntry.viewportWidth - viewportWidth) <= VIEWPORT_WIDTH_TOLERANCE_PX;
}

function isUsableRenderCache(
  session: {
    layoutVersion: number;
    messages: ChatMessage[];
  },
  cacheEntry: VirtuosoSizeCache,
  viewportWidth: number | null
): boolean {
  if (cacheEntry.layoutVersion !== session.layoutVersion) {
    return false;
  }
  if (cacheEntry.messageCount !== session.messages.length) {
    return false;
  }
  if (cacheEntry.lastMessageId !== (session.messages.at(-1)?.id ?? null)) {
    return false;
  }

  return isViewportWidthCompatible(cacheEntry, viewportWidth);
}

interface MessageRow {
  readonly id: string;
  readonly kind: 'message';
  readonly message: ChatMessage;
}

interface TailSentinelRow {
  readonly id: string;
  readonly kind: 'tail-sentinel';
}

export type ChatRenderRow = MessageRow | TailSentinelRow;

interface ChatMessagesProps {
  readonly messages: ChatMessage[];
  readonly isAgentRunning: boolean;
  readonly sessionId?: string;
  readonly isVisible?: boolean;
  readonly enableVelocityScroll?: boolean;
  readonly skipInitialVelocityPrime?: boolean;
  readonly shouldPrime?: boolean;
  readonly readinessKey?: string | null;
  readonly verificationPhase?: 'hidden' | 'visible' | null;
  readonly verificationKey?: string | null;
  readonly queuedMessage: QueuedMessage | null;
  readonly onRewind: (messageId: string) => void;
  readonly onOpenFile: (path: string) => void;
  readonly onOpenUrl: (url: string) => void;
  readonly onCancelQueue: () => void;
  readonly onFeedback: () => void;
  readonly onReady?: () => void;
  readonly onVerificationResult?: (result: ChatMessagesVerificationResult) => void;
}

export interface ChatMessagesVerificationResult {
  readonly phase: 'hidden' | 'visible';
  readonly result: 'hidden-ready' | 'visible-ready' | 'timeout' | 'aborted';
  readonly tailProofVersion: number;
}

interface MessageListContext {
  readonly toolsByMessageId: Map<string, ToolExecution[]>;
  readonly lastAssistantMessageId: string | null;
  readonly lastInAssistantGroupIds: Set<string>;
  readonly messageCount: number;
  readonly tailSentinelDomId: string;
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

const TAIL_SENTINEL_ROW_ID = '__tail_sentinel__';

const MessageItemContent: VirtuosoItemContent<ChatRenderRow, MessageListContext> = ({
  data,
  index,
  context,
}) => {
  const row = data as ChatRenderRow | undefined;
  if (!row) {
    return null;
  }

  if (row.kind === 'tail-sentinel') {
    return (
      <div
        data-tail-sentinel-id={context.tailSentinelDomId}
        data-tail-sentinel="true"
        className="h-px w-full shrink-0"
        aria-hidden="true"
      />
    );
  }

  const message = row.message;
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
  enableVelocityScroll = true,
  skipInitialVelocityPrime = false,
  shouldPrime = false,
  readinessKey = null,
  verificationPhase = null,
  verificationKey = null,
  queuedMessage,
  onRewind,
  onOpenFile,
  onOpenUrl,
  onCancelQueue,
  onFeedback,
  onReady,
  onVerificationResult,
}) => {
  const verificationPhaseState = verificationPhase ?? (shouldPrime ? ('hidden' as const) : null);
  const shownTraceRequestId = sessionId ? getShownSessionTraceRequest(sessionId) : null;
  const listRef = useRef<VirtuosoMessageListMethods<ChatRenderRow, MessageListContext>>(null);
  const prevMessageCount = useRef(0);
  const lastPlacedMessagesRef = useRef<ChatRenderRow[] | null>(null);
  const readinessStartedRef = useRef(false);
  const [animatingMessageIds, setAnimatingMessageIds] = useState<Set<string>>(() => new Set());
  const [isReadyForSteady, setIsReadyForSteady] = useState(false);
  const [isPremeasuring, setIsPremeasuring] = useState(false);
  const [hasUserScrolled, setHasUserScrolled] = useState(false);

  // Velocity-based wheel damping for WKWebView — caps scroll speed so the
  // viewport buffer keeps items pre-rendered ahead of the scroll.
  const velocityScrollRef = useVelocityScroll({
    enabled: isVisible && enableVelocityScroll && verificationPhaseState === null,
    onUserScrollStart: () => {
      setHasUserScrolled(true);
    },
    skipInitialPrime: skipInitialVelocityPrime,
    traceRequestId: shownTraceRequestId,
    traceSessionId: sessionId ?? null,
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
  const currentTraceRequestId = useSessionSwitchRequestId();
  const activeTools = useSessionActiveTools(sessionKey);
  const completedTools = useSessionCompletedTools(sessionKey);
  const layoutPendingCount = useSessionLayoutPendingCount(sessionKey);
  const layoutSettledVersion = useSessionLayoutSettledVersion(sessionKey);
  const lastLayoutMutationAt = useSessionLastLayoutMutationAt(sessionKey);

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
  const restoredSizeCacheRef = useRef(false);
  const effectiveVerificationPhase = verificationPhaseState;
  const effectiveVerificationKey =
    verificationKey ??
    readinessKey ??
    (effectiveVerificationPhase !== null ? `${effectiveVerificationPhase}:legacy` : null);
  const previousVerificationKeyRef = useRef<string | null>(effectiveVerificationKey);
  const previousVerificationPhaseRef = useRef<'hidden' | 'visible' | null>(
    effectiveVerificationPhase
  );
  const isVerifying = effectiveVerificationPhase !== null && effectiveVerificationKey !== null;
  const tailSentinelDomId = `${sessionKey || 'session'}:${effectiveVerificationKey ?? 'steady'}:${TAIL_SENTINEL_ROW_ID}`;
  const renderRows = useMemo<ChatRenderRow[]>(() => {
    const rows = messages.map<ChatRenderRow>((message) => ({
      id: message.id,
      kind: 'message',
      message,
    }));

    if (messages.length > 0 || isVerifying) {
      rows.push({
        id: TAIL_SENTINEL_ROW_ID,
        kind: 'tail-sentinel',
      });
    }

    return rows;
  }, [isVerifying, messages]);

  const getCurrentViewportWidth = useCallback((): number | null => {
    const scrollerWidth = listRef.current?.scrollerElement()?.clientWidth ?? 0;
    if (scrollerWidth > 0) {
      return scrollerWidth;
    }

    const containerWidth = traceRootRef.current?.clientWidth ?? 0;
    return containerWidth > 0 ? containerWidth : null;
  }, []);

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
      viewportWidth: getCurrentViewportWidth(),
    });
  }, [getCurrentViewportWidth, sessionId]);

  const snapshotStableSizeCache = useCallback((): void => {
    if (restorePhaseRef.current !== 'done') {
      return;
    }

    snapshotSizeCache();
  }, [snapshotSizeCache]);

  useLayoutEffect(() => {
    restoredSizeCacheRef.current = false;
    if (!sessionId) return;

    const store = useChatStore.getState();
    const session = store.sessions[sessionId];
    let cache = session?.virtuosoSizeCache ?? null;
    cache ??= getRenderCache(sessionId);
    const viewportWidth = getCurrentViewportWidth();
    if (cache && session && isUsableRenderCache(session, cache, viewportWidth)) {
      listRef.current?.setSizeRanges([...cache.ranges]);
      restoredSizeCacheRef.current = true;
      return;
    }

    if (session && session.messages.length > 0) {
      const estimatedRanges = buildEstimatedSizeRanges(session.messages);
      if (estimatedRanges.length > 0) {
        listRef.current?.setSizeRanges(estimatedRanges);
      }
    }
  }, [getCurrentViewportWidth, sessionId]);

  useEffect(() => {
    if (!sessionId || restoredSizeCacheRef.current) {
      return;
    }

    let cancelled = false;

    void getRenderCacheAsync(sessionId).then((cache) => {
      if (cancelled || restoredSizeCacheRef.current || !cache) {
        return;
      }

      const session = useChatStore.getState().sessions[sessionId];
      if (!session || !isUsableRenderCache(session, cache, getCurrentViewportWidth())) {
        return;
      }

      listRef.current?.setSizeRanges([...cache.ranges]);
      restoredSizeCacheRef.current = true;
    });

    return () => {
      cancelled = true;
    };
  }, [getCurrentViewportWidth, sessionId]);

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
  const messageListData = useMemo((): DataWithScrollModifier<ChatRenderRow> => {
    // Empty data guard — the library's binary search crashes when scroll
    // modifiers (item-location, items-change, auto-scroll-to-bottom) target
    // items in an empty array: "Failed binary finding record, searched for 0".
    // This happens during session transitions when messages briefly becomes [].
    if (renderRows.length === 0) {
      return { data: renderRows };
    }

    // Explicit intent from service layer (setMessages callers)
    if (scrollIntent !== null) {
      switch (scrollIntent) {
        case 'history-load':
          return {
            data: renderRows,
            scrollModifier: {
              type: 'item-location',
              location: { index: 0, align: 'start' },
            },
          };
        case 'compact-reload':
          return {
            data: renderRows,
            scrollModifier: { type: 'items-change', behavior: 'auto' },
          };
        case 'pending-verify':
          return {
            data: renderRows,
          };
        case 'session-restore':
          // Multi-instance keep-alive: scroll-to-bottom is handled by an
          // imperative scrollToItem() call in the effect below, NOT through
          // the data prop's scrollModifier. The data-prop approach fails
          // because clearing the intent triggers a second render that passes
          // plain data, which can cancel the pending scroll.
          return {
            data: renderRows,
          };
        case 'session-refresh':
          // Session refresh: backend re-sent the same data. Preserve scroll position.
          return {
            data: renderRows,
          };
        case 'rewind':
          return {
            data: renderRows,
            scrollModifier: 'remove-from-end',
          };
      }
    }

    if (isVerifying) {
      return { data: renderRows };
    }

    // A just-applied session placement intent clears on the next effect-driven
    // render. Keep that render on the plain data path so we don't immediately
    // fall through to the heuristic items-change modifier.
    if (lastPlacedMessagesRef.current === renderRows) {
      return { data: renderRows };
    }

    // Heuristic fallback for streaming and message appends.
    const prevLength = prevMessageCount.current;

    if (messages.length === prevLength) {
      // Streaming: existing items changed content (same count).
      // The library auto-scrolls if previously at bottom.
      return {
        data: renderRows,
        scrollModifier: { type: 'items-change', behavior: 'smooth' },
      };
    }

    // Append: new message(s) arrived.
    return {
      data: renderRows,
      scrollModifier: {
        type: 'auto-scroll-to-bottom',
        autoScroll: ({ atBottom }: { atBottom: boolean }): ScrollBehavior | false =>
          atBottom ? 'smooth' : false,
      },
    };
  }, [isVerifying, messages, renderRows, scrollIntent]);

  const messageListContext = useMemo(
    (): MessageListContext => ({
      toolsByMessageId,
      lastAssistantMessageId,
      lastInAssistantGroupIds,
      messageCount: messages.length,
      tailSentinelDomId,
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
      tailSentinelDomId,
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
    !isVerifying && !isVisible
      ? 'parked'
      : effectiveVerificationPhase === 'hidden'
        ? 'entry'
        : isPremeasuring || isReadyForSteady || hasUserScrolled
          ? 'steady'
          : isVerifying
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
    if (import.meta.env.DEV) {
      performance.mark('overscan-phase-change');
    }
  }, [hasUserScrolled, isReadyForSteady, isVerifying, isVisible, overscan, overscanPhase]);

  // Stable key function — avoids creating a new closure on each render.
  // Virtuoso compares the function reference; a new ref can force item re-renders.
  const computeItemKey = useCallback(
    ({ data }: { data: ChatRenderRow }): string => `${sessionKey}:${data.id}`,
    [sessionKey]
  );

  // ── Event-driven readiness ──────────────────────────────────────────
  const onVerificationResultRef = useRef(onVerificationResult);
  onVerificationResultRef.current = onVerificationResult;
  const hasResolvedVerificationRef = useRef(false);
  const needsRestoreRef = useRef(false);
  const hasEverHadMessagesRef = useRef(false);
  const hasAttemptedPremeasureRef = useRef(false);
  const hasAttemptedTailProbeRef = useRef(false);
  const hiddenCandidateSnapshotRef = useRef<ReadinessSurfaceSnapshot | null>(null);
  const hiddenReadySnapshotRef = useRef<ReadinessSurfaceSnapshot | null>(null);
  const tailProbePlaceholderScrollHeightRef = useRef<number | null>(null);
  const tailProbePlaceholderSnapshotRef = useRef<ReadinessSurfaceSnapshot | null>(null);
  const tailProbeRealSurfaceSnapshotRef = useRef<ReadinessSurfaceSnapshot | null>(null);
  const tailProbeStartedAtRef = useRef<number | null>(null);
  const visibleCandidateSnapshotRef = useRef<ReadinessSurfaceSnapshot | null>(null);
  const visiblePreseedPendingRef = useRef(false);
  const restorePhaseRef = useRef<RestorePhase>('idle');
  const lastMessageIdRef = useRef<string | null>(messages.at(-1)?.id ?? null);
  const premeasureTimeoutRef = useRef<number | null>(null);
  const readinessTimeoutRef = useRef<number | null>(null);
  const readinessProgressSignatureRef = useRef<string | null>(null);
  const readinessStableTimerRef = useRef<number | null>(null);
  const readinessResizeObserverRef = useRef<ResizeObserver | null>(null);
  const readinessStartMarkRef = useRef<string | null>(null);
  const surfaceWaitObserverRef = useRef<MutationObserver | null>(null);
  const surfaceWaitRafRef = useRef<number | null>(null);
  const positioningRecheckTimerRef = useRef<number | null>(null);
  const lastSurfaceResizeAtRef = useRef<number | null>(null);
  const tailProofVersionRef = useRef(0);
  const [surfaceReadyVersion, setSurfaceReadyVersion] = useState(0);
  const [restoreVersion, setRestoreVersion] = useState(0);
  const [latestRenderedRowCount, setLatestRenderedRowCount] = useState(0);
  const purgeItemSizesUsedRef = useRef(false);
  const traceRootRef = useRef<HTMLDivElement>(null);
  lastMessageIdRef.current = messages.at(-1)?.id ?? null;

  const cancelReadinessWork = useCallback((): void => {
    if (premeasureTimeoutRef.current !== null) {
      window.clearTimeout(premeasureTimeoutRef.current);
      premeasureTimeoutRef.current = null;
    }
    if (readinessTimeoutRef.current !== null) {
      window.clearTimeout(readinessTimeoutRef.current);
      readinessTimeoutRef.current = null;
    }
    readinessProgressSignatureRef.current = null;
    if (readinessStableTimerRef.current !== null) {
      window.clearTimeout(readinessStableTimerRef.current);
      readinessStableTimerRef.current = null;
    }
    readinessResizeObserverRef.current?.disconnect();
    readinessResizeObserverRef.current = null;
    surfaceWaitObserverRef.current?.disconnect();
    surfaceWaitObserverRef.current = null;
    if (surfaceWaitRafRef.current !== null) {
      cancelAnimationFrame(surfaceWaitRafRef.current);
      surfaceWaitRafRef.current = null;
    }
    if (positioningRecheckTimerRef.current !== null) {
      window.clearTimeout(positioningRecheckTimerRef.current);
      positioningRecheckTimerRef.current = null;
    }
  }, []);

  const clearVisibleVerificationCandidate = useCallback((): void => {
    visibleCandidateSnapshotRef.current = null;
    hiddenReadySnapshotRef.current = null;
    visiblePreseedPendingRef.current = false;
  }, []);

  const ensureListSurfaceReady = useCallback((): boolean => {
    const handle = listRef.current;
    const scroller = handle?.scrollerElement();
    const listElement = scroller?.querySelector<HTMLElement>('[data-testid="virtuoso-list"]');
    if (scroller && listElement) {
      surfaceWaitObserverRef.current?.disconnect();
      surfaceWaitObserverRef.current = null;
      if (surfaceWaitRafRef.current !== null) {
        cancelAnimationFrame(surfaceWaitRafRef.current);
        surfaceWaitRafRef.current = null;
      }
      lastSurfaceResizeAtRef.current = Date.now();
      return true;
    }

    if (surfaceWaitObserverRef.current === null && scroller) {
      surfaceWaitObserverRef.current = new MutationObserver(() => {
        if (!ensureListSurfaceReady()) {
          return;
        }
        setSurfaceReadyVersion((value) => value + 1);
      });
      surfaceWaitObserverRef.current.observe(scroller, {
        childList: true,
        subtree: true,
      });
    }

    surfaceWaitRafRef.current ??= requestAnimationFrame(() => {
      surfaceWaitRafRef.current = null;
      if (!ensureListSurfaceReady()) {
        return;
      }
      setSurfaceReadyVersion((value) => value + 1);
    });

    return false;
  }, []);

  const getScrollerMetrics = useCallback((): ScrollerMetrics | null => {
    const scroller = listRef.current?.scrollerElement();
    if (!scroller) return null;

    return {
      scroller,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      scrollTop: scroller.scrollTop,
      bottomTop: Math.max(0, scroller.scrollHeight - scroller.clientHeight),
    };
  }, []);

  const getRenderSurfaceMetrics = useCallback(
    (rendered: ChatRenderRow[]): RenderSurfaceMetrics | null => {
      const metrics = getScrollerMetrics();
      if (!metrics) return null;

      const listElement = metrics.scroller.querySelector<HTMLElement>(
        '[data-testid="virtuoso-list"]'
      );
      if (!listElement) {
        return null;
      }

      const renderedRowCount = rendered.length;
      const isAtBottom =
        metrics.bottomTop <= BOTTOM_TOLERANCE_PX ||
        metrics.scrollTop >= metrics.bottomTop - BOTTOM_TOLERANCE_PX;
      const tailSentinelRendered =
        metrics.scroller.querySelector<HTMLElement>('[data-tail-sentinel="true"]') !== null;

      return {
        ...metrics,
        isAtBottom,
        renderedRowCount,
        tailSentinelRendered,
      };
    },
    [getScrollerMetrics]
  );

  const alignScrollerToBottom = useCallback((): ScrollerMetrics | null => {
    const handle = listRef.current;
    if (!handle) return null;

    handle.scrollToItem({
      index: renderRows.length > 0 ? renderRows.length - 1 : 'LAST',
      align: 'end',
    });
    const metrics = getScrollerMetrics();
    if (!metrics) return null;

    metrics.scroller.scrollTop = metrics.bottomTop;
    return getScrollerMetrics();
  }, [getScrollerMetrics, renderRows.length]);

  const forceTailProbeRender = useCallback((): boolean => {
    const handle = listRef.current;
    if (!handle || renderRows.length === 0) {
      return false;
    }

    hasAttemptedTailProbeRef.current = true;
    tailProbePlaceholderScrollHeightRef.current = null;
    tailProbePlaceholderSnapshotRef.current = null;
    tailProbeRealSurfaceSnapshotRef.current = null;
    hiddenCandidateSnapshotRef.current = null;
    tailProbeStartedAtRef.current = Date.now();
    purgeItemSizesUsedRef.current = true;
    handle.data.replace(renderRows, {
      initialLocation: {
        index: renderRows.length - 1,
        align: 'end',
      },
      purgeItemSizes: true,
    });
    alignScrollerToBottom();
    recordSessionSwitchTrace({
      event: 'tail_probe_start',
      requestId: currentTraceRequestId,
      sessionId: sessionId ?? null,
      verificationPhase: effectiveVerificationPhase,
      verificationKey: effectiveVerificationKey,
      geometry: getSessionSwitchGeometrySnapshotFromMetrics(getScrollerMetrics(), {
        renderedRowCount: renderRows.length,
        tailSentinelRendered: false,
        layoutPendingCount,
        lastLayoutMutationAt,
        overscanPhase,
        sizeCacheRestored: restoredSizeCacheRef.current,
        purgeItemSizesUsed: true,
      }),
    });
    return true;
  }, [
    alignScrollerToBottom,
    effectiveVerificationKey,
    effectiveVerificationPhase,
    getScrollerMetrics,
    lastLayoutMutationAt,
    layoutPendingCount,
    overscanPhase,
    currentTraceRequestId,
    renderRows,
    sessionId,
  ]);

  const emitVerificationResult = useCallback(
    (
      phase: 'hidden' | 'visible',
      result: 'hidden-ready' | 'visible-ready' | 'timeout' | 'aborted',
      tailProofVersion: number
    ): void => {
      if (hasResolvedVerificationRef.current && result !== 'aborted') {
        return;
      }

      hasResolvedVerificationRef.current = true;
      readinessStartedRef.current = false;
      cancelReadinessWork();
      setIsPremeasuring(false);

      if (result === 'hidden-ready' || result === 'visible-ready') {
        restorePhaseRef.current = 'done';
        alignScrollerToBottom();
        setIsReadyForSteady(true);
        snapshotStableSizeCache();
      }

      onVerificationResultRef.current?.({
        phase,
        result,
        tailProofVersion,
      });
      if ((result === 'hidden-ready' || result === 'visible-ready') && onReady) {
        onReady();
      }
    },
    [alignScrollerToBottom, cancelReadinessWork, onReady, snapshotStableSizeCache]
  );

  const signalReady = useCallback(
    (reason: 'stabilized', detail?: string): void => {
      void reason;
      if (!effectiveVerificationPhase) {
        return;
      }

      if (effectiveVerificationPhase === 'hidden') {
        hiddenReadySnapshotRef.current = hiddenCandidateSnapshotRef.current;
      }

      markSwitchTimeline(
        effectiveVerificationPhase === 'hidden' ? 'hidden-ready' : 'visible-ready',
        `${detail ?? 'stable'} · ${String(messages.length)} msgs`
      );
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

      tailProofVersionRef.current += 1;
      emitVerificationResult(
        effectiveVerificationPhase,
        effectiveVerificationPhase === 'hidden' ? 'hidden-ready' : 'visible-ready',
        tailProofVersionRef.current
      );
    },
    [emitVerificationResult, messages.length, sessionKey, effectiveVerificationPhase]
  );

  const startTemporaryResizeStabilityWindow = useCallback(
    (
      phase: Extract<RestorePhase, 'premeasuring' | 'stabilizing'>,
      stableMs: number,
      onStable: () => void
    ): void => {
      if (readinessStableTimerRef.current !== null) {
        window.clearTimeout(readinessStableTimerRef.current);
        readinessStableTimerRef.current = null;
      }
      readinessResizeObserverRef.current?.disconnect();
      readinessResizeObserverRef.current = null;

      const listElement = listRef.current
        ?.scrollerElement()
        ?.querySelector<HTMLElement>('[data-testid="virtuoso-list"]');
      if (!listElement) {
        return;
      }

      const scheduleStabilityCheck = (): void => {
        if (readinessStableTimerRef.current !== null) {
          window.clearTimeout(readinessStableTimerRef.current);
        }
        readinessStableTimerRef.current = window.setTimeout(() => {
          if (restorePhaseRef.current !== phase) {
            return;
          }
          onStable();
        }, stableMs);
      };

      lastSurfaceResizeAtRef.current = Date.now();
      scheduleStabilityCheck();

      const observer = new ResizeObserver(() => {
        if (restorePhaseRef.current !== phase) {
          return;
        }
        lastSurfaceResizeAtRef.current = Date.now();
        scheduleStabilityCheck();
      });

      observer.observe(listElement);
      readinessResizeObserverRef.current = observer;
    },
    []
  );

  const progressPositioningRef = useRef<(rendered: ChatRenderRow[]) => void>(() => undefined);
  const scheduleHiddenVerificationCheckRef = useRef<() => void>(() => undefined);
  const scheduleVisibleVerificationCheckRef = useRef<() => void>(() => undefined);
  const refreshReadinessTimeout = useCallback(
    (progressSignature: string): void => {
      if (readinessProgressSignatureRef.current === progressSignature) {
        return;
      }

      readinessProgressSignatureRef.current = progressSignature;
      readinessStartedRef.current = true;
      if (readinessTimeoutRef.current !== null) {
        window.clearTimeout(readinessTimeoutRef.current);
      }
      readinessTimeoutRef.current = window.setTimeout(() => {
        markSwitchTimeline('timeout', `phase=${restorePhaseRef.current}`);
        if (effectiveVerificationPhase) {
          emitVerificationResult(
            effectiveVerificationPhase,
            'timeout',
            tailProofVersionRef.current
          );
        }
      }, READY_TIMEOUT_MS);
    },
    [effectiveVerificationPhase, emitVerificationResult]
  );
  const queuePositioningRecheck = useCallback((): void => {
    if (positioningRecheckTimerRef.current !== null) {
      return;
    }

    positioningRecheckTimerRef.current = window.setTimeout(() => {
      positioningRecheckTimerRef.current = null;
      if (restorePhaseRef.current !== 'positioning' || hasResolvedVerificationRef.current) {
        return;
      }

      const rendered = listRef.current?.data.getCurrentlyRendered() ?? [];
      progressPositioningRef.current(rendered);
    }, POSITIONING_RECHECK_MS);
  }, []);

  const isHiddenPlaceholderShortSurface = useCallback(
    (metrics: RenderSurfaceMetrics): boolean =>
      metrics.scrollHeight <= metrics.clientHeight + BOTTOM_TOLERANCE_PX &&
      metrics.renderedRowCount < renderRows.length,
    [renderRows.length]
  );

  const captureTailProbePlaceholder = useCallback(
    (metrics: RenderSurfaceMetrics): void => {
      if (tailProbePlaceholderSnapshotRef.current !== null) {
        return;
      }

      tailProbePlaceholderScrollHeightRef.current = metrics.scrollHeight;
      tailProbePlaceholderSnapshotRef.current = buildReadinessSurfaceSnapshot(
        metrics,
        layoutSettledVersion
      );
      recordSessionSwitchTrace({
        event: 'tail_probe_placeholder_captured',
        requestId: currentTraceRequestId,
        sessionId: sessionId ?? null,
        verificationPhase: effectiveVerificationPhase,
        verificationKey: effectiveVerificationKey,
        geometry: getSessionSwitchGeometrySnapshotFromMetrics(metrics, {
          renderedRowCount: metrics.renderedRowCount,
          tailSentinelRendered: metrics.tailSentinelRendered,
          layoutPendingCount,
          lastLayoutMutationAt,
          overscanPhase,
          sizeCacheRestored: restoredSizeCacheRef.current,
          purgeItemSizesUsed: purgeItemSizesUsedRef.current,
        }),
      });
    },
    [
      currentTraceRequestId,
      effectiveVerificationKey,
      effectiveVerificationPhase,
      lastLayoutMutationAt,
      layoutPendingCount,
      layoutSettledVersion,
      overscanPhase,
      sessionId,
    ]
  );

  const hasObservedPostProbeSurface = useCallback(
    (metrics: RenderSurfaceMetrics): boolean => {
      if (!hasAttemptedTailProbeRef.current) {
        return true;
      }

      const placeholderSnapshot = tailProbePlaceholderSnapshotRef.current;
      if (placeholderSnapshot === null) {
        captureTailProbePlaceholder(metrics);
        return false;
      }

      const currentSnapshot = buildReadinessSurfaceSnapshot(metrics, layoutSettledVersion);
      if (isSameReadinessSurfaceSnapshot(placeholderSnapshot, currentSnapshot)) {
        return false;
      }

      if (
        !isSameReadinessSurfaceSnapshot(tailProbeRealSurfaceSnapshotRef.current, currentSnapshot)
      ) {
        tailProbeRealSurfaceSnapshotRef.current = currentSnapshot;
        recordSessionSwitchTrace({
          event: 'tail_probe_first_real_height',
          requestId: currentTraceRequestId,
          sessionId: sessionId ?? null,
          verificationPhase: effectiveVerificationPhase,
          verificationKey: effectiveVerificationKey,
          geometry: getSessionSwitchGeometrySnapshotFromMetrics(metrics, {
            renderedRowCount: metrics.renderedRowCount,
            tailSentinelRendered: metrics.tailSentinelRendered,
            layoutPendingCount,
            lastLayoutMutationAt,
            overscanPhase,
            sizeCacheRestored: restoredSizeCacheRef.current,
            purgeItemSizesUsed: purgeItemSizesUsedRef.current,
          }),
          data: {
            placeholderScrollHeight: tailProbePlaceholderScrollHeightRef.current,
          },
        });
      }

      return true;
    },
    [
      captureTailProbePlaceholder,
      currentTraceRequestId,
      effectiveVerificationKey,
      effectiveVerificationPhase,
      lastLayoutMutationAt,
      layoutPendingCount,
      layoutSettledVersion,
      overscanPhase,
      sessionId,
    ]
  );

  const scheduleHiddenVerificationCheck = useCallback((): void => {
    // Fast path for warm instances with restored size caches.
    // Restored cache → Virtuoso has accurate heights (no estimates).
    // layoutPendingCount === 0 → no pending mutations.
    // Geometry checks → tail sentinel rendered, at bottom, not placeholder.
    // These conditions guarantee layout stability — skip the 48ms
    // ResizeObserver quiet window entirely and signal ready immediately.
    //
    // The rAF two-snapshot comparison was removed because alignScrollerToBottom()
    // (called at verification start) triggers a Virtuoso internal re-render that
    // settles across frames, causing the two snapshots to always differ for warm
    // instances even though the layout is genuinely stable.
    if (
      restoredSizeCacheRef.current &&
      layoutPendingCount === 0 &&
      restorePhaseRef.current === 'stabilizing' &&
      effectiveVerificationPhase === 'hidden'
    ) {
      const handle = listRef.current;
      const immediateRendered = handle?.data.getCurrentlyRendered() ?? [];
      const immediateMetrics = getRenderSurfaceMetrics(immediateRendered);
      if (
        immediateMetrics?.tailSentinelRendered === true &&
        immediateMetrics.isAtBottom &&
        !isHiddenPlaceholderShortSurface(immediateMetrics) &&
        hasObservedPostProbeSurface(immediateMetrics)
      ) {
        hiddenCandidateSnapshotRef.current = buildReadinessSurfaceSnapshot(
          immediateMetrics,
          layoutSettledVersion
        );
        signalReady('stabilized', 'cache-match-instant');
        return;
      }
    }

    startTemporaryResizeStabilityWindow('stabilizing', HIDDEN_READY_STABLE_MS, () => {
      if (restorePhaseRef.current !== 'stabilizing' || effectiveVerificationPhase !== 'hidden') {
        return;
      }

      const handle = listRef.current;
      const latestRendered = handle?.data.getCurrentlyRendered() ?? [];
      const latestMetrics = getRenderSurfaceMetrics(latestRendered);
      refreshReadinessTimeout(
        buildReadinessProgressSignature({
          phase: 'stabilizing',
          verificationPhase: effectiveVerificationPhase,
          metrics: latestMetrics,
          layoutPendingCount,
          layoutSettledVersion,
          renderedCount: latestRendered.length,
        })
      );

      if (!latestMetrics?.tailSentinelRendered) {
        restorePhaseRef.current = 'positioning';
        hiddenCandidateSnapshotRef.current = null;
        if (!hasAttemptedTailProbeRef.current) {
          forceTailProbeRender();
          return;
        }
        alignScrollerToBottom();
        progressPositioningRef.current(latestRendered);
        return;
      }

      if (isHiddenPlaceholderShortSurface(latestMetrics)) {
        hiddenCandidateSnapshotRef.current = null;
        restorePhaseRef.current = 'positioning';
        progressPositioningRef.current(latestRendered);
        return;
      }

      if (!hasObservedPostProbeSurface(latestMetrics)) {
        hiddenCandidateSnapshotRef.current = null;
        restorePhaseRef.current = 'positioning';
        progressPositioningRef.current(latestRendered);
        return;
      }

      if (!latestMetrics.isAtBottom) {
        restorePhaseRef.current = 'positioning';
        hiddenCandidateSnapshotRef.current = null;
        alignScrollerToBottom();
        progressPositioningRef.current(latestRendered);
        return;
      }

      if (layoutPendingCount > 0) {
        hiddenCandidateSnapshotRef.current = null;
        scheduleHiddenVerificationCheckRef.current();
        return;
      }

      const currentSnapshot = buildReadinessSurfaceSnapshot(latestMetrics, layoutSettledVersion);
      if (!isSameReadinessSurfaceSnapshot(hiddenCandidateSnapshotRef.current, currentSnapshot)) {
        hiddenCandidateSnapshotRef.current = currentSnapshot;
        scheduleHiddenVerificationCheckRef.current();
        return;
      }

      signalReady('stabilized');
    });
  }, [
    alignScrollerToBottom,
    effectiveVerificationPhase,
    forceTailProbeRender,
    getRenderSurfaceMetrics,
    hasObservedPostProbeSurface,
    isHiddenPlaceholderShortSurface,
    layoutPendingCount,
    layoutSettledVersion,
    refreshReadinessTimeout,
    signalReady,
    startTemporaryResizeStabilityWindow,
  ]);
  scheduleHiddenVerificationCheckRef.current = scheduleHiddenVerificationCheck;

  const scheduleVisibleVerificationCheck = useCallback((): void => {
    // Fast path: if we have a preseed snapshot from hidden-ready, check it
    // immediately before entering the 200ms quiet window. When the geometry
    // matches and layout is settled, the surface is already stable — commit
    // without waiting.
    if (
      visiblePreseedPendingRef.current &&
      layoutPendingCount === 0 &&
      restorePhaseRef.current === 'stabilizing' &&
      effectiveVerificationPhase === 'visible'
    ) {
      const handle = listRef.current;
      const immediateRendered = handle?.data.getCurrentlyRendered() ?? [];
      const immediateMetrics = getRenderSurfaceMetrics(immediateRendered);
      if (immediateMetrics?.tailSentinelRendered === true && immediateMetrics.isAtBottom) {
        const immediateSnapshot = buildReadinessSurfaceSnapshot(
          immediateMetrics,
          layoutSettledVersion
        );
        if (
          isSameReadinessSurfaceSnapshot(visibleCandidateSnapshotRef.current, immediateSnapshot)
        ) {
          markSwitchTimeline('visible-preseed', 'snapshot-match-instant');
          visiblePreseedPendingRef.current = false;
          signalReady('stabilized');
          return;
        }
      }
    }

    // Slow path: wait for 200ms of resize stability before checking
    startTemporaryResizeStabilityWindow('stabilizing', VISIBLE_READY_QUIET_MS, () => {
      if (restorePhaseRef.current !== 'stabilizing' || effectiveVerificationPhase !== 'visible') {
        return;
      }

      const handle = listRef.current;
      const latestRendered = handle?.data.getCurrentlyRendered() ?? [];
      const latestMetrics = getRenderSurfaceMetrics(latestRendered);
      refreshReadinessTimeout(
        buildReadinessProgressSignature({
          phase: 'stabilizing',
          verificationPhase: effectiveVerificationPhase,
          metrics: latestMetrics,
          layoutPendingCount,
          layoutSettledVersion,
          renderedCount: latestRendered.length,
        })
      );

      if (!latestMetrics?.tailSentinelRendered) {
        restorePhaseRef.current = 'positioning';
        clearVisibleVerificationCandidate();
        alignScrollerToBottom();
        progressPositioningRef.current(latestRendered);
        return;
      }

      if (!latestMetrics.isAtBottom) {
        restorePhaseRef.current = 'positioning';
        clearVisibleVerificationCandidate();
        alignScrollerToBottom();
        scheduleVisibleVerificationCheckRef.current();
        progressPositioningRef.current(latestRendered);
        return;
      }

      if (layoutPendingCount > 0) {
        clearVisibleVerificationCandidate();
        scheduleVisibleVerificationCheckRef.current();
        return;
      }

      const currentSnapshot = buildReadinessSurfaceSnapshot(latestMetrics, layoutSettledVersion);
      if (!isSameReadinessSurfaceSnapshot(visibleCandidateSnapshotRef.current, currentSnapshot)) {
        visibleCandidateSnapshotRef.current = currentSnapshot;
        hiddenReadySnapshotRef.current = null;
        visiblePreseedPendingRef.current = false;
        scheduleVisibleVerificationCheckRef.current();
        return;
      }

      if (visiblePreseedPendingRef.current) {
        markSwitchTimeline('visible-preseed', 'snapshot-match');
        visiblePreseedPendingRef.current = false;
      }

      signalReady('stabilized');
    });
  }, [
    alignScrollerToBottom,
    clearVisibleVerificationCandidate,
    effectiveVerificationPhase,
    getRenderSurfaceMetrics,
    layoutPendingCount,
    layoutSettledVersion,
    refreshReadinessTimeout,
    signalReady,
    startTemporaryResizeStabilityWindow,
  ]);
  scheduleVisibleVerificationCheckRef.current = scheduleVisibleVerificationCheck;

  useEffect(() => {
    if (restorePhaseRef.current === 'stabilizing' && !hasResolvedVerificationRef.current) {
      if (effectiveVerificationPhase === 'hidden') {
        scheduleHiddenVerificationCheckRef.current();
      } else if (effectiveVerificationPhase === 'visible') {
        scheduleVisibleVerificationCheckRef.current();
      }
    }
  }, [effectiveVerificationPhase, layoutPendingCount, layoutSettledVersion, lastLayoutMutationAt]);

  const beginStabilizationIfTargetRendered = useCallback(
    (rendered: ChatRenderRow[]): boolean => {
      const metrics = getRenderSurfaceMetrics(rendered);
      if (!metrics) {
        if (restorePhaseRef.current === 'positioning') {
          alignScrollerToBottom();
        }
        return false;
      }

      if (!metrics.tailSentinelRendered) {
        if (restorePhaseRef.current === 'positioning') {
          alignScrollerToBottom();
        }
        return false;
      }

      if (effectiveVerificationPhase === 'hidden') {
        if (isHiddenPlaceholderShortSurface(metrics)) {
          return false;
        }

        if (!hasObservedPostProbeSurface(metrics)) {
          return false;
        }
      }

      if (!metrics.isAtBottom) {
        if (restorePhaseRef.current === 'positioning') {
          alignScrollerToBottom();
        }
        return false;
      }

      if (layoutPendingCount > 0) {
        return false;
      }

      restorePhaseRef.current = 'stabilizing';
      markSwitchTimeline(
        'stabilizing',
        `rows=${String(metrics.renderedRowCount)} tail=${String(metrics.tailSentinelRendered)}`
      );
      if (effectiveVerificationPhase === 'visible') {
        scheduleVisibleVerificationCheck();
      } else {
        scheduleHiddenVerificationCheck();
      }
      return true;
    },
    [
      alignScrollerToBottom,
      effectiveVerificationPhase,
      getRenderSurfaceMetrics,
      hasObservedPostProbeSurface,
      isHiddenPlaceholderShortSurface,
      layoutPendingCount,
      scheduleHiddenVerificationCheck,
      scheduleVisibleVerificationCheck,
    ]
  );

  const finishPremeasure = useCallback((): void => {
    if (premeasureTimeoutRef.current !== null) {
      window.clearTimeout(premeasureTimeoutRef.current);
      premeasureTimeoutRef.current = null;
    }

    restorePhaseRef.current = 'positioning';
    hasAttemptedPremeasureRef.current = true;
    const handle = listRef.current;
    if (!handle) {
      needsRestoreRef.current = true;
      restorePhaseRef.current = 'idle';
      ensureListSurfaceReady();
      return;
    }

    alignScrollerToBottom();
    const rendered = handle.data.getCurrentlyRendered();
    if (beginStabilizationIfTargetRendered(rendered)) {
      return;
    }

    if (!hasAttemptedTailProbeRef.current && forceTailProbeRender()) {
      return;
    }

    progressPositioningRef.current(rendered);
  }, [
    alignScrollerToBottom,
    beginStabilizationIfTargetRendered,
    ensureListSurfaceReady,
    forceTailProbeRender,
  ]);

  const continuePremeasure = useCallback((): void => {
    const metrics = getScrollerMetrics();
    if (!metrics) {
      finishPremeasure();
      return;
    }

    const currentTop = metrics.scroller.scrollTop;
    if (currentTop <= 0) {
      finishPremeasure();
      return;
    }

    const nextTop = Math.max(0, currentTop - PREMEASURE_STEP_PX);
    if (nextTop === currentTop) {
      finishPremeasure();
      return;
    }

    metrics.scroller.scrollTop = nextTop;
    startTemporaryResizeStabilityWindow('premeasuring', PREMEASURE_STABLE_MS, continuePremeasure);
    premeasureTimeoutRef.current = window.setTimeout(() => {
      if (restorePhaseRef.current !== 'premeasuring') {
        return;
      }

      continuePremeasure();
    }, PREMEASURE_TIMEOUT_MS);
  }, [finishPremeasure, getScrollerMetrics, startTemporaryResizeStabilityWindow]);

  const startPremeasureIfNeeded = useCallback((): boolean => {
    if (hasAttemptedPremeasureRef.current) {
      return false;
    }

    if (hasAttemptedTailProbeRef.current) {
      return false;
    }

    if (isVisible || restoredSizeCacheRef.current) {
      return false;
    }

    const metrics = getScrollerMetrics();
    if (!metrics) {
      return false;
    }

    if (metrics.bottomTop <= metrics.clientHeight) {
      return false;
    }

    const warmupTop = Math.max(0, metrics.bottomTop - PREMEASURE_STEP_PX);
    if (warmupTop >= metrics.bottomTop) {
      return false;
    }

    if (warmupTop === 0) {
      hasAttemptedPremeasureRef.current = true;
      return false;
    }

    restorePhaseRef.current = 'premeasuring';
    setIsPremeasuring(true);
    metrics.scroller.scrollTop = warmupTop;

    startTemporaryResizeStabilityWindow('premeasuring', PREMEASURE_STABLE_MS, continuePremeasure);
    premeasureTimeoutRef.current = window.setTimeout(() => {
      if (restorePhaseRef.current !== 'premeasuring') {
        return;
      }

      continuePremeasure();
    }, PREMEASURE_TIMEOUT_MS);

    return true;
  }, [continuePremeasure, getScrollerMetrics, isVisible, startTemporaryResizeStabilityWindow]);

  const progressPositioning = useCallback(
    (rendered: ChatRenderRow[]): void => {
      if (restorePhaseRef.current !== 'positioning') {
        return;
      }

      const metrics = getRenderSurfaceMetrics(rendered);
      if (!metrics) {
        alignScrollerToBottom();
        queuePositioningRecheck();
        return;
      }

      refreshReadinessTimeout(
        buildReadinessProgressSignature({
          phase: 'positioning',
          verificationPhase: effectiveVerificationPhase,
          metrics,
          layoutPendingCount,
          layoutSettledVersion,
          renderedCount: rendered.length,
        })
      );

      if (beginStabilizationIfTargetRendered(rendered)) {
        return;
      }

      if (startPremeasureIfNeeded()) {
        return;
      }

      if (effectiveVerificationPhase === 'hidden' && !hasAttemptedTailProbeRef.current) {
        if (forceTailProbeRender()) {
          queuePositioningRecheck();
          return;
        }
      }

      alignScrollerToBottom();
      queuePositioningRecheck();
    },
    [
      alignScrollerToBottom,
      beginStabilizationIfTargetRendered,
      effectiveVerificationPhase,
      forceTailProbeRender,
      getRenderSurfaceMetrics,
      queuePositioningRecheck,
      layoutPendingCount,
      layoutSettledVersion,
      refreshReadinessTimeout,
      startPremeasureIfNeeded,
    ]
  );
  progressPositioningRef.current = progressPositioning;

  const handleRenderedDataChange = useCallback(
    (rendered: ChatRenderRow[]): void => {
      setLatestRenderedRowCount(rendered.length);
      if (import.meta.env.DEV && overscanPhase === 'entry') {
        performance.mark('rendered-item-count');
      }
      if (restorePhaseRef.current !== 'positioning') {
        return;
      }

      progressPositioning(rendered);
    },
    [overscanPhase, progressPositioning]
  );

  useLayoutEffect(() => {
    const traceRoot = traceRootRef.current;
    if (!traceRoot) {
      return;
    }

    traceRoot.dataset['switchTraceRoot'] = 'true';
    traceRoot.dataset['renderedRowCount'] = String(latestRenderedRowCount);
    traceRoot.dataset['tailSentinelRendered'] = String(
      traceRoot.querySelector<HTMLElement>('[data-tail-sentinel="true"]') !== null
    );
    traceRoot.dataset['overscanPhase'] = overscanPhase;
    traceRoot.dataset['sizeCacheRestored'] = String(restoredSizeCacheRef.current);
    traceRoot.dataset['purgeItemSizesUsed'] = String(purgeItemSizesUsedRef.current);
  }, [latestRenderedRowCount, overscanPhase]);

  // Capture the restore intent into a ref before the clear effect runs.
  // Also trigger for re-mounted hydrated instances (no session-restore intent,
  // but messages appear on first render via useSessionMessages).
  if (
    scrollIntent === 'session-restore' &&
    messages.length > 0 &&
    !hasResolvedVerificationRef.current
  ) {
    needsRestoreRef.current = true;
  }
  if (
    !hasEverHadMessagesRef.current &&
    messages.length > 0 &&
    !hasResolvedVerificationRef.current
  ) {
    hasEverHadMessagesRef.current = true;
    needsRestoreRef.current = true;
  }

  useEffect(() => {
    if (!isVerifying && restorePhaseRef.current !== 'done') {
      if (
        previousVerificationKeyRef.current !== null &&
        previousVerificationPhaseRef.current !== null &&
        !hasResolvedVerificationRef.current
      ) {
        emitVerificationResult(
          previousVerificationPhaseRef.current,
          'aborted',
          tailProofVersionRef.current
        );
      }
      needsRestoreRef.current = false;
      readinessStartedRef.current = false;
      tailProofVersionRef.current = 0;
      hasAttemptedTailProbeRef.current = false;
      hiddenCandidateSnapshotRef.current = null;
      tailProbePlaceholderScrollHeightRef.current = null;
      tailProbePlaceholderSnapshotRef.current = null;
      tailProbeRealSurfaceSnapshotRef.current = null;
      tailProbeStartedAtRef.current = null;
      clearVisibleVerificationCandidate();
      setIsPremeasuring(false);
      cancelReadinessWork();
      restorePhaseRef.current = 'idle';
    }
  }, [cancelReadinessWork, clearVisibleVerificationCandidate, emitVerificationResult, isVerifying]);

  useEffect(() => {
    if (!isVerifying) {
      previousVerificationKeyRef.current = effectiveVerificationKey;
      previousVerificationPhaseRef.current = effectiveVerificationPhase;
      return;
    }

    if (
      previousVerificationKeyRef.current === effectiveVerificationKey &&
      previousVerificationPhaseRef.current === effectiveVerificationPhase
    ) {
      return;
    }

    if (
      previousVerificationKeyRef.current !== null &&
      previousVerificationPhaseRef.current !== null &&
      !hasResolvedVerificationRef.current
    ) {
      emitVerificationResult(
        previousVerificationPhaseRef.current,
        'aborted',
        tailProofVersionRef.current
      );
    }

    previousVerificationKeyRef.current = effectiveVerificationKey;
    previousVerificationPhaseRef.current = effectiveVerificationPhase;
    hasResolvedVerificationRef.current = false;
    needsRestoreRef.current = true;
    hasEverHadMessagesRef.current = messages.length > 0;
    hasAttemptedPremeasureRef.current = false;
    hasAttemptedTailProbeRef.current = false;
    const preseededVisibleSnapshot =
      effectiveVerificationPhase === 'visible' ? hiddenReadySnapshotRef.current : null;
    hiddenCandidateSnapshotRef.current = null;
    tailProbePlaceholderScrollHeightRef.current = null;
    tailProbePlaceholderSnapshotRef.current = null;
    tailProbeRealSurfaceSnapshotRef.current = null;
    tailProbeStartedAtRef.current = null;
    if (preseededVisibleSnapshot !== null) {
      visibleCandidateSnapshotRef.current = preseededVisibleSnapshot;
      visiblePreseedPendingRef.current = true;
    } else {
      clearVisibleVerificationCandidate();
    }
    hiddenReadySnapshotRef.current = null;
    readinessStartedRef.current = false;
    tailProofVersionRef.current = 0;
    restorePhaseRef.current = 'idle';
    restoredSizeCacheRef.current = false;

    // For keep-alive instances, the cache restore useLayoutEffect (line 621)
    // won't re-run because sessionId hasn't changed. Re-check the memory
    // cache synchronously so the instant hidden verification fast path can
    // fire. Only re-set the flag — don't call setSizeRanges (Virtuoso
    // retains its internal sizes across display mode transitions).
    if (sessionId) {
      const reCacheSession = useChatStore.getState().sessions[sessionId];
      if (reCacheSession) {
        let reCache = reCacheSession.virtuosoSizeCache ?? null;
        reCache ??= getRenderCache(sessionId);
        if (
          reCache !== null &&
          isUsableRenderCache(reCacheSession, reCache, getCurrentViewportWidth())
        ) {
          restoredSizeCacheRef.current = true;
        }
      }
    }

    cancelReadinessWork();
    setIsPremeasuring(false);
    setIsReadyForSteady(false);
    setRestoreVersion((v) => v + 1);
  }, [
    cancelReadinessWork,
    emitVerificationResult,
    getCurrentViewportWidth,
    isVerifying,
    messages.length,
    clearVisibleVerificationCandidate,
    effectiveVerificationKey,
    effectiveVerificationPhase,
    sessionId,
  ]);

  useLayoutEffect(() => {
    if (!isVerifying || !needsRestoreRef.current || hasResolvedVerificationRef.current) return;
    if (!ensureListSurfaceReady()) {
      return;
    }

    needsRestoreRef.current = false;

    const handle = listRef.current;
    if (!handle) {
      needsRestoreRef.current = true;
      restorePhaseRef.current = 'idle';
      return;
    }

    restorePhaseRef.current = 'positioning';
    alignScrollerToBottom();
    readinessStartedRef.current = false;
    setIsPremeasuring(false);
    if (import.meta.env.DEV) {
      const startMarkName = sessionKey !== '' ? `readiness-start:${sessionKey}` : 'readiness-start';
      readinessStartMarkRef.current = startMarkName;
      performance.mark(startMarkName);
    }

    markSwitchTimeline(
      isVisible ? 'visible-start' : 'hidden-start',
      `${String(messages.length)} msgs`
    );

    cancelReadinessWork();
    progressPositioning(handle.data.getCurrentlyRendered());
  }, [
    alignScrollerToBottom,
    cancelReadinessWork,
    isVisible,
    messages.length,
    sessionKey,
    progressPositioning,
    scrollIntent,
    isVerifying,
    signalReady,
    ensureListSurfaceReady,
    effectiveVerificationPhase,
    surfaceReadyVersion,
    restoreVersion,
  ]);

  useLayoutEffect(() => {
    if (scrollIntent !== 'session-restore' || messages.length === 0) {
      return;
    }

    listRef.current?.scrollToItem({ index: 'LAST', align: 'end' });
  }, [messages.length, scrollIntent]);

  // Clear consumed scroll intent (safe — poll is ref-driven, not affected)
  useEffect(() => {
    if (scrollIntent !== null && sessionId !== undefined) {
      useChatStore.getState().clearScrollIntent(sessionId);
    }
  }, [scrollIntent, sessionId]);

  const previousIsVerifyingRef = useRef(isVerifying);
  useEffect(() => {
    if (previousIsVerifyingRef.current && !isVerifying) {
      snapshotStableSizeCache();
    }
    previousIsVerifyingRef.current = isVerifying;
  }, [isVerifying, snapshotStableSizeCache]);

  useEffect(() => {
    return (): void => {
      if (
        previousVerificationKeyRef.current !== null &&
        previousVerificationPhaseRef.current !== null &&
        !hasResolvedVerificationRef.current
      ) {
        onVerificationResultRef.current?.({
          phase: previousVerificationPhaseRef.current,
          result: 'aborted',
          tailProofVersion: tailProofVersionRef.current,
        });
      }
      clearVisibleVerificationCandidate();
      cancelReadinessWork();
      snapshotStableSizeCache();
    };
  }, [cancelReadinessWork, clearVisibleVerificationCandidate, snapshotStableSizeCache]);

  useLayoutEffect(() => {
    if (
      scrollIntent === 'pending-verify' ||
      scrollIntent === 'session-restore' ||
      scrollIntent === 'session-refresh'
    ) {
      lastPlacedMessagesRef.current = renderRows;
      return;
    }

    if (lastPlacedMessagesRef.current !== renderRows) {
      lastPlacedMessagesRef.current = null;
    }
  }, [messages.length, renderRows, scrollIntent]);

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
      <ToolWidgetLayoutFrozenContext.Provider value={isVerifying}>
        <div ref={traceRootRef} className="flex-1 flex flex-col min-h-0">
          <VirtuosoMessageListLicense licenseKey="a014c4870c11acfee45b6a7935dd7d97TzoyMjI7RToxODA2NjE2MDMxOTAz">
            <VirtuosoMessageList<ChatRenderRow, MessageListContext>
              ref={listRef}
              initialData={renderRows}
              data={messageListData}
              context={messageListContext}
              itemIdentity={(row) => row.id}
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
      </ToolWidgetLayoutFrozenContext.Provider>
    </ToolWidgetSessionContext.Provider>
  );
};
