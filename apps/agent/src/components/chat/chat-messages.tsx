/**
 * ChatMessages - Virtualized chat list with message-aware scroll behavior.
 *
 * Architecture:
 * - Each instance is bound to ONE session for its lifetime (mounted by
 *   SessionInstance with `key={sessionId}`). No session-switch logic here.
 * - A TanStack-backed compatibility layer owns virtualization and scroll behavior
 * - The list-level scroll modifiers handle all auto-scroll (streaming, new
 *   messages, etc.)
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
import { measureElement, useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { MessageItem } from './messages';
import { QueuedMessageBubble } from './queued-message';
import { ToolWidgetLayoutFrozenContext, ToolWidgetSessionContext } from './tools/shared';

import type { ChatMessage } from './messages';
import type { SessionSwitchTraceGeometry } from '@/services/conversations/session-switch-trace';
import type { ToolExecution } from '@/stores/agent/tool-store';
import type { ChatMeasurementCache } from '@/stores/chat/chat-store';
import type { QueuedMessage } from '@/stores/chat/queued-message-store';
import type { VirtualItem } from '@tanstack/react-virtual';
import type { FC, Key, ReactNode } from 'react';

const logger = createLogger('ChatMessages');

import { ShimmerText } from '@/components/ui/shimmer-text';
import { useVelocityScroll } from '@/hooks/ui/use-velocity-scroll';
import { estimateMessageHeight, isNearBottom, scrollToBottom } from '@/lib/chat/chat-scroll-utils';
import { findChatListSurface } from '@/lib/chat/chat-selectors';
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
  getActiveLayoutMutationSources,
  useChatStore,
  useSessionLastLayoutMutationAt,
  useSessionLayoutPendingCount,
  useSessionLayoutSettledVersion,
} from '@/stores/chat/chat-store';
import {
  buildMeasurementSizeMap,
  getRenderCache,
  getRenderCacheAsync,
  isExactMeasurementCache,
} from '@/stores/chat/render-cache-store';
import { useSessionSwitchRequestId } from '@/stores/chat/session-switch-store';

/** Constant empty array — prevents a new [] allocation per no-tool message
 *  on every item re-render (e.g., container resize). */
const EMPTY_TOOLS: ToolExecution[] = [];
const ALWAYS_UNVIRTUALIZED_TAIL_ROWS = 8;
const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 64;
// TanStack Virtual overscan is ITEM COUNT, not pixels.
// Entry: small buffer for hidden/visible verification passes.
// Steady: generous buffer for smooth scrolling without blanks.
const OVERSCAN_PARKED = 0;
const OVERSCAN_ENTRY = 5;
const OVERSCAN_STEADY = 20;
const HIDDEN_READY_STABLE_MS = 48;
const VISIBLE_READY_QUIET_MS = 200;
const READY_TIMEOUT_MS = 1500;
const READY_TIMEOUT_LARGE_SESSION_MS = 3000;
const LARGE_SESSION_THRESHOLD = 50;
const BOTTOM_TOLERANCE_PX = 4;
const POSITIONING_RECHECK_MS = 32;
const DEFAULT_ROW_HEIGHT = 96;

type OverscanPhase = 'parked' | 'entry' | 'steady';
type RestorePhase = 'idle' | 'positioning' | 'stabilizing' | 'done';

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
    restorePath: 'exact' | 'warm' | 'cold';
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
    restorePath: state.restorePath,
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

/**
 * Relaxed snapshot comparison for visible-phase preseed matching.
 *
 * After hidden→visible promotion, the overscan changes from entry (5 items) to
 * steady (20 items). The virtualized list recalculates its render range, changing
 * renderedRowCount even though the CONTENT is identical. The strict comparator
 * (isSameReadinessSurfaceSnapshot) fails because it compares renderedRowCount.
 *
 * This comparator checks only content-geometry fields:
 * - scrollHeight: total content height (proves content didn't change)
 * - bottomTop: scrollHeight - clientHeight (viewport-independent content metric)
 * - layoutSettledVersion: confirms no layout mutations between snapshots
 *
 * Ignores:
 * - renderedRowCount: expected to differ across overscan transitions
 * - scrollTop: may differ after alignScrollerToBottom during promotion
 */
function isVisiblePreseedGeometryMatch(
  left: ReadinessSurfaceSnapshot | null,
  right: ReadinessSurfaceSnapshot
): boolean {
  if (!left) {
    return false;
  }

  return (
    left.scrollHeight === right.scrollHeight &&
    left.bottomTop === right.bottomTop &&
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

function buildEstimatedMessageSizes(messages: readonly ChatMessage[]): number[] {
  return messages.map((message) => estimateMessageHeight(message));
}

function buildEstimatedSizesFromMeasurementCache(
  rowCount: number,
  cacheEntry: ChatMeasurementCache
): number[] {
  const sizeMap = buildMeasurementSizeMap(cacheEntry);

  return Array.from({ length: rowCount }, (_value, index) => {
    const measurement = cacheEntry.measurements[index];
    const measurementKey = measurement?.key;
    const sizeFromKey = measurementKey ? sizeMap.get(measurementKey) : undefined;
    const resolvedSize = sizeFromKey ?? measurement?.size;
    return resolvedSize !== undefined && Number.isFinite(resolvedSize) && resolvedSize > 0
      ? resolvedSize
      : DEFAULT_ROW_HEIGHT;
  });
}

interface MessageRow {
  readonly id: string;
  readonly kind: 'message';
  readonly message: ChatMessage;
}

export type ChatRenderRow = MessageRow;

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

/** Stable style for the message-list scroller. */
const LIST_STYLE = { scrollbarGutter: 'stable both-edges' as const };

const TAIL_SENTINEL_ROW_ID = '__tail_sentinel__';

function renderMessageItem(
  row: ChatRenderRow,
  index: number,
  context: MessageListContext
): ReactNode {
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
}

// ── Traced wrapper for non-virtualized tail rows ─────────────────────
// Measures the React render cost of the always-rendered bottom messages.
interface TailRowsTracedProps {
  readonly rows: readonly ChatRenderRow[];
  readonly baseIndex: number;
  readonly context: MessageListContext;
  readonly sessionKey: string;
  readonly verificationPhase: string | null;
}

function TailRowsTracedInner({
  rows,
  baseIndex,
  context,
  sessionKey,
  verificationPhase,
}: TailRowsTracedProps): ReactNode {
  const tailStart = performance.now();
  const result = (
    <>
      {rows.map((row, i) => (
        <div key={row.id}>{renderMessageItem(row, baseIndex + i, context)}</div>
      ))}
    </>
  );
  const tailDuration = performance.now() - tailStart;
  if (tailDuration > 2) {
    const sid = sessionKey.slice(-6);
    markSwitchTimeline(
      'tail-rows-render',
      `[${sid}] ${String(rows.length)} rows ${String(Math.round(tailDuration * 10) / 10)}ms phase=${String(verificationPhase)}`
    );
  }
  return result;
}

const TailRowsTraced = TailRowsTracedInner;

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

  // ── Render timing (frame budget tracing) ───────────────────────────
  const renderStartMark = performance.now();
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const estimatedSizesRef = useRef<number[]>([]);
  const initialMeasurementsCacheRef = useRef<VirtualItem[]>([]);
  const prevMessageCount = useRef(0);
  const readinessStartedRef = useRef(false);
  const [animatingMessageIds, setAnimatingMessageIds] = useState<Set<string>>(() => new Set());
  const [isReadyForSteady, setIsReadyForSteady] = useState(false);
  const [hasUserScrolled, setHasUserScrolled] = useState(false);

  // ── Scroll tracking (moved from shim) ──────────────────────────────
  const shouldAutoScrollRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  const pendingUserScrollUpIntentRef = useRef(false);
  const isPointerScrollActiveRef = useRef(false);
  const lastTouchClientYRef = useRef<number | null>(null);
  const pendingStickToBottomFrameRef = useRef<number | null>(null);
  const isAtBottomRef = useRef(true);

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
    const scroller = scrollContainerRef.current;
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
    (effectiveVerificationPhase !== null && messages.length > 0
      ? `${effectiveVerificationPhase}:legacy`
      : null);
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

    return rows;
  }, [messages]);

  // ── Overscan strategy ──────────────────────────────────────────────────
  // Defined early because useVirtualizer needs the overscan value.
  // TanStack overscan = number of ITEMS (not pixels) rendered beyond viewport.
  // parked: not verifying, not visible → no buffer
  // entry (5 items): any verification pass (hidden or visible)
  // steady (20 items): committed visible session
  const targetOverscanPhase: OverscanPhase = !isVerifying
    ? isVisible
      ? 'steady'
      : 'parked'
    : 'entry';

  // Cap overscan at entry for large sessions to prevent TanStack's internal
  // render loop from hitting React's maximum update depth limit.
  const overscanPhase: OverscanPhase =
    targetOverscanPhase === 'steady' && messages.length > LARGE_SESSION_THRESHOLD
      ? 'entry'
      : targetOverscanPhase;
  const overscan =
    overscanPhase === 'parked'
      ? OVERSCAN_PARKED
      : overscanPhase === 'entry'
        ? OVERSCAN_ENTRY
        : OVERSCAN_STEADY;
  const previousOverscanPhaseRef = useRef<OverscanPhase | null>(null);

  // ── Virtualizer setup ──────────────────────────────────────────────────
  // Last N rows are always rendered outside the virtualizer so streaming
  // content never fights TanStack's recalculation loop. During streaming,
  // expand to cover the entire active turn.
  const virtualizedRowCount = useMemo(() => {
    const baseTail = Math.max(0, renderRows.length - ALWAYS_UNVIRTUALIZED_TAIL_ROWS);
    if (!isAgentRunning) return baseTail;
    for (let i = renderRows.length - 1; i >= 0; i -= 1) {
      if (renderRows[i]?.message.role === 'user') {
        return Math.min(i, baseTail);
      }
    }
    return baseTail;
  }, [renderRows, isAgentRunning]);

  const nonVirtualizedRows = useMemo(
    () => renderRows.slice(virtualizedRowCount),
    [renderRows, virtualizedRowCount]
  );

  const getItemKey = useCallback(
    (index: number): Key => {
      const row = renderRows[index];
      return row ? `${sessionKey}:${row.id}` : index;
    },
    [renderRows, sessionKey]
  );

  const rowVirtualizer = useVirtualizer({
    count: virtualizedRowCount,
    getScrollElement: () => scrollContainerRef.current,
    getItemKey,
    initialMeasurementsCache: initialMeasurementsCacheRef.current,
    estimateSize: (index: number): number => {
      const estimated = estimatedSizesRef.current[index];
      if (estimated !== undefined && Number.isFinite(estimated) && estimated > 0) {
        return estimated;
      }
      const row = renderRows[index];
      return row ? estimateMessageHeight(row.message) : DEFAULT_ROW_HEIGHT;
    },
    overscan,
    measureElement,
    useAnimationFrameWithResizeObserver: false,
    useFlushSync: false,
  });

  useEffect(() => {
    rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) => {
      if (instance.isScrolling) {
        return false;
      }
      const viewportHeight = instance.scrollRect?.height ?? 0;
      const scrollOffset = instance.scrollOffset ?? 0;
      const itemIntersectsViewport =
        item.end > scrollOffset && item.start < scrollOffset + viewportHeight;
      if (itemIntersectsViewport) {
        return false;
      }
      const remainingDistance = instance.getTotalSize() - (scrollOffset + viewportHeight);
      return remainingDistance > AUTO_SCROLL_BOTTOM_THRESHOLD_PX;
    };
    return (): void => {
      rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = undefined;
    };
  }, [rowVirtualizer]);

  // ── Scroll tracking ────────────────────────────────────────────────────
  const onScrollCallbackRef = useRef<((location: { isAtBottom: boolean }) => void) | null>(null);

  const updateBottomTracking = useCallback((scroller: HTMLDivElement): void => {
    const currentScrollTop = scroller.scrollTop;
    const nearBottom = isNearBottom(scroller, AUTO_SCROLL_BOTTOM_THRESHOLD_PX);

    const scrollDelta = Math.abs(currentScrollTop - lastScrollTopRef.current);
    const isProgrammaticJump = scrollDelta > scroller.clientHeight;

    if (isProgrammaticJump) {
      lastScrollTopRef.current = currentScrollTop;
      onScrollCallbackRef.current?.({ isAtBottom: nearBottom });
      return;
    }

    isAtBottomRef.current = nearBottom;

    if (!shouldAutoScrollRef.current && nearBottom) {
      shouldAutoScrollRef.current = true;
      pendingUserScrollUpIntentRef.current = false;
    } else if (shouldAutoScrollRef.current && pendingUserScrollUpIntentRef.current) {
      const scrolledUp = currentScrollTop < lastScrollTopRef.current - 1;
      if (scrolledUp && !nearBottom) {
        shouldAutoScrollRef.current = false;
      }
      pendingUserScrollUpIntentRef.current = false;
    } else if (shouldAutoScrollRef.current && isPointerScrollActiveRef.current) {
      const scrolledUp = currentScrollTop < lastScrollTopRef.current - 1;
      if (scrolledUp && !nearBottom) {
        shouldAutoScrollRef.current = false;
      }
    } else if (shouldAutoScrollRef.current && !nearBottom) {
      const scrolledUp = currentScrollTop < lastScrollTopRef.current - 1;
      if (scrolledUp) {
        shouldAutoScrollRef.current = false;
      }
    }

    lastScrollTopRef.current = currentScrollTop;
    onScrollCallbackRef.current?.({ isAtBottom: nearBottom });
  }, []);

  const scheduleStickToBottom = useCallback((behavior: ScrollBehavior = 'auto'): void => {
    isAtBottomRef.current = true;
    if (pendingStickToBottomFrameRef.current !== null) {
      cancelAnimationFrame(pendingStickToBottomFrameRef.current);
    }
    pendingStickToBottomFrameRef.current = requestAnimationFrame(() => {
      pendingStickToBottomFrameRef.current = null;
      const scroller = scrollContainerRef.current;
      if (scroller === null) {
        return;
      }
      scrollToBottom(scroller, behavior);
    });
  }, []);

  useEffect(() => {
    return (): void => {
      if (pendingStickToBottomFrameRef.current !== null) {
        cancelAnimationFrame(pendingStickToBottomFrameRef.current);
      }
    };
  }, []);

  // Auto-scroll when content grows while at bottom
  useEffect(() => {
    const content = contentRef.current;
    if (content === null || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (!shouldAutoScrollRef.current) {
        return;
      }
      scheduleStickToBottom('auto');
    });

    observer.observe(content, { box: 'border-box' });
    return (): void => {
      observer.disconnect();
    };
  }, [renderRows.length, scheduleStickToBottom]);

  // ── Helper functions ───────────────────────────────────────────────────

  const getCurrentlyRenderedRows = useCallback((): ChatRenderRow[] => {
    const virtualItems = rowVirtualizer.getVirtualItems();
    const virtualRows = virtualItems
      .map((item) => renderRows[item.index])
      .filter((row): row is ChatRenderRow => row !== undefined);
    return [...virtualRows, ...nonVirtualizedRows];
  }, [rowVirtualizer, renderRows, nonVirtualizedRows]);

  const scrollToLocation = useCallback(
    (location: {
      index: number | 'LAST';
      align?: 'start' | 'center' | 'end';
      behavior?: ScrollBehavior;
    }): void => {
      const scroller = scrollContainerRef.current;
      if (!scroller || renderRows.length === 0) {
        return;
      }

      const lastIndex = renderRows.length - 1;
      const index = location.index === 'LAST' ? lastIndex : location.index;

      if (index < 0) {
        scroller.scrollTop = 0;
        return;
      }

      if (index >= lastIndex && location.align === 'end') {
        shouldAutoScrollRef.current = true;
        pendingUserScrollUpIntentRef.current = false;
        scheduleStickToBottom(location.behavior ?? 'auto');
        return;
      }

      rowVirtualizer.scrollToIndex(index, {
        align: location.align ?? 'auto',
        behavior: location.behavior,
      } as { align: 'start' | 'center' | 'end' | 'auto'; behavior?: 'auto' | 'smooth' });
    },
    [rowVirtualizer, renderRows, scheduleStickToBottom]
  );

  const buildCurrentMeasurementCache = useCallback(
    (input: {
      messageCount: number;
      lastMessageId: string | null;
      layoutVersion: number;
      viewportWidth: number | null;
    }): ChatMeasurementCache => {
      const measured = rowVirtualizer.measurementsCache;
      const measurements: ChatMeasurementCache['measurements'] = [];
      let runningStart = 0;

      for (let index = 0; index < renderRows.length; index += 1) {
        const existing = index < measured.length ? measured[index] : undefined;
        if (existing !== undefined && existing.size > 0) {
          measurements.push({
            key: String(existing.key),
            index: existing.index,
            start: runningStart,
            size: existing.size,
            end: runningStart + existing.size,
            lane: existing.lane,
            measured: true,
          });
          runningStart += existing.size;
        } else {
          const estimated = estimatedSizesRef.current[index];
          const size =
            estimated !== undefined && Number.isFinite(estimated) && estimated > 0
              ? estimated
              : DEFAULT_ROW_HEIGHT;
          measurements.push({
            key: String(getItemKey(index)),
            index,
            start: runningStart,
            size,
            end: runningStart + size,
            lane: 0,
            measured: false,
          });
          runningStart += size;
        }
      }

      return {
        measurements,
        messageCount: input.messageCount,
        lastMessageId: input.lastMessageId,
        layoutVersion: input.layoutVersion,
        viewportWidth: input.viewportWidth,
      };
    },
    [getItemKey, renderRows.length, rowVirtualizer]
  );

  const applyMeasurementCacheToEstimates = useCallback(
    (cache: ChatMeasurementCache): void => {
      const sizes = new Array<number>(renderRows.length).fill(DEFAULT_ROW_HEIGHT);
      for (const measurement of cache.measurements) {
        if (measurement.index < sizes.length) {
          sizes[measurement.index] = measurement.size;
        }
      }
      estimatedSizesRef.current = sizes;
      rowVirtualizer.measure();
      if (shouldAutoScrollRef.current) {
        scheduleStickToBottom('auto');
      }
    },
    [renderRows.length, rowVirtualizer, scheduleStickToBottom]
  );

  const updateEstimatedSizes = useCallback(
    (sizes: readonly number[]): void => {
      estimatedSizesRef.current = [...sizes];
      rowVirtualizer.measure();
      if (shouldAutoScrollRef.current) {
        scheduleStickToBottom('auto');
      }
    },
    [rowVirtualizer, scheduleStickToBottom]
  );

  useEffect(() => {
    const scroller = scrollContainerRef.current ?? null;
    if (scroller === null || effectiveVerificationPhase !== 'visible') {
      userScrollIntentDuringVisibleVerificationRef.current = false;
      return;
    }

    const handleWheel = (): void => {
      userScrollIntentDuringVisibleVerificationRef.current = true;
    };
    const handleTouchMove = (): void => {
      userScrollIntentDuringVisibleVerificationRef.current = true;
    };

    scroller.addEventListener('wheel', handleWheel, { passive: true });
    scroller.addEventListener('touchmove', handleTouchMove, { passive: true });

    return (): void => {
      scroller.removeEventListener('wheel', handleWheel);
      scroller.removeEventListener('touchmove', handleTouchMove);
      userScrollIntentDuringVisibleVerificationRef.current = false;
    };
  }, [effectiveVerificationPhase, sessionId]);

  const getCurrentViewportWidth = useCallback((): number | null => {
    const scrollerWidth = scrollContainerRef.current?.clientWidth ?? 0;
    if (scrollerWidth > 0) {
      return scrollerWidth;
    }

    const containerWidth = traceRootRef.current?.clientWidth ?? 0;
    return containerWidth > 0 ? containerWidth : null;
  }, []);

  const snapshotMeasurementCache = useCallback((): void => {
    if (!sessionId) return;

    const store = useChatStore.getState();
    const session = store.sessions[sessionId];
    if (!session) return;

    const sid = sessionId.slice(-6);
    const cache = buildCurrentMeasurementCache({
      messageCount: session.messages.length,
      lastMessageId: session.messages.at(-1)?.id ?? null,
      layoutVersion: session.layoutVersion,
      viewportWidth: getCurrentViewportWidth(),
    });
    logger.info(`[${sid}] snapshotMeasurementCache`, {
      messageCount: cache.messageCount,
      measurements: cache.measurements.length,
      layoutVersion: cache.layoutVersion,
      viewportWidth: cache.viewportWidth,
      restorePhase: restorePhaseRef.current,
    });
    store.setMeasurementCache(sessionId, cache);
  }, [buildCurrentMeasurementCache, getCurrentViewportWidth, sessionId]);

  const snapshotStableMeasurementCache = useCallback((): void => {
    if (restorePhaseRef.current !== 'done') {
      return;
    }

    snapshotMeasurementCache();
  }, [snapshotMeasurementCache]);

  useLayoutEffect(() => {
    restoredSizeCacheRef.current = false;
    restorePathRef.current = 'cold';
    initialMeasurementsCacheRef.current = [];
    if (!sessionId) return;

    const store = useChatStore.getState();
    const session = store.sessions[sessionId];
    let cache = session?.measurementCache ?? null;
    cache ??= getRenderCache(sessionId);
    const viewportWidth = getCurrentViewportWidth();
    const sid = sessionId.slice(-6);

    logger.info(`[${sid}] cache restore START`, {
      hasMemoryCache: session?.measurementCache !== null,
      hasIdbCache: cache !== null,
      cacheMeasurements: cache?.measurements.length ?? 0,
      cacheMessageCount: cache?.messageCount ?? 0,
      renderRowCount: renderRows.length,
      viewportWidth,
      sessionMessages: session?.messages.length ?? 0,
    });

    if (
      cache &&
      session &&
      isExactMeasurementCache(session, cache, renderRows.length, viewportWidth)
    ) {
      logger.info(`[${sid}] cache restore → EXACT path`, {
        measurements: cache.measurements.length,
        layoutVersion: cache.layoutVersion,
      });
      // Seed TanStack's initialMeasurementsCache so that when measure()
      // clears the internal cache, the next getMeasurements() call loads
      // pre-computed positions instead of calling estimateSize() per item.
      initialMeasurementsCacheRef.current = cache.measurements
        .slice(0, renderRows.length)
        .map((m) => ({
          key: m.key,
          index: m.index,
          start: m.start,
          size: m.size,
          end: m.end,
          lane: m.lane,
        }));
      applyMeasurementCacheToEstimates(cache);
      restoredSizeCacheRef.current = true;
      restorePathRef.current = 'exact';
      return;
    }

    if (cache) {
      logger.info(`[${sid}] cache restore → WARM path`, {
        measurements: cache.measurements.length,
        renderRowCount: renderRows.length,
        reason: 'exact validation failed',
      });
      updateEstimatedSizes(buildEstimatedSizesFromMeasurementCache(renderRows.length, cache));
      restorePathRef.current = 'warm';
      return;
    }

    if (session && session.messages.length > 0) {
      logger.info(`[${sid}] cache restore → COLD path (content-based estimates)`, {
        messageCount: session.messages.length,
      });
      const estimatedSizes = buildEstimatedMessageSizes(session.messages);
      if (estimatedSizes.length > 0) {
        updateEstimatedSizes(estimatedSizes);
      }
    } else {
      logger.info(`[${sid}] cache restore → COLD path (no cache, no messages)`);
    }
  }, [
    applyMeasurementCacheToEstimates,
    getCurrentViewportWidth,
    renderRows.length,
    sessionId,
    updateEstimatedSizes,
  ]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    let cancelled = false;

    void getRenderCacheAsync(sessionId).then((cache) => {
      if (cancelled || !cache) {
        return;
      }

      const store = useChatStore.getState();
      if (store.sessions[sessionId]?.measurementCache === null) {
        store.setMeasurementCache(sessionId, cache);
      }
    });

    return () => {
      cancelled = true;
    };
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

  // ── Scroll intent handler ────────────────────────────────────────────
  // Replaces the DataWithScrollModifier dispatch from the shim.
  // Each intent is handled imperatively via direct scroll calls.
  useLayoutEffect(() => {
    if (scrollIntent === null || renderRows.length === 0) return;
    const scroller = scrollContainerRef.current;
    if (!scroller) return;

    const sid = sessionKey.slice(-6);
    logger.info(`[${sid}] scrollIntent: ${scrollIntent}`, {
      messageCount: messages.length,
      renderRowCount: renderRows.length,
    });

    switch (scrollIntent) {
      case 'history-load':
        scroller.scrollTo({ top: 0 });
        break;
      case 'compact-reload':
        if (shouldAutoScrollRef.current) {
          scheduleStickToBottom('auto');
        }
        break;
      case 'pending-verify':
      case 'session-restore':
      case 'session-refresh':
        // No scroll action — handled by verification state machine
        break;
      case 'rewind':
        if (shouldAutoScrollRef.current) {
          scheduleStickToBottom('auto');
        }
        break;
    }
  }, [scrollIntent, renderRows.length, messages.length, sessionKey, scheduleStickToBottom]);

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

  useEffect(() => {
    if (previousOverscanPhaseRef.current === overscanPhase) {
      return;
    }

    const prev = previousOverscanPhaseRef.current;
    previousOverscanPhaseRef.current = overscanPhase;
    logger.info(`[${sessionKey.slice(-6)}] overscan: ${String(prev)} → ${overscanPhase}`, {
      overscanItems: overscan,
      isVerifying,
      isVisible,
      messageCount: messages.length,
    });
    markSwitchTimeline(
      'overscan-change',
      `${prev ?? 'null'} -> ${overscanPhase} (${String(overscan)}px) vPhase=${String(effectiveVerificationPhase)} ready=${String(isReadyForSteady)} scroll=${String(hasUserScrolled)}`
    );
  }, [
    effectiveVerificationPhase,
    hasUserScrolled,
    isReadyForSteady,
    isVerifying,
    isVisible,
    messages.length,
    overscan,
    overscanPhase,
    sessionKey,
  ]);

  // ── Event-driven readiness ──────────────────────────────────────────
  const onVerificationResultRef = useRef(onVerificationResult);
  onVerificationResultRef.current = onVerificationResult;
  const hasResolvedVerificationRef = useRef(false);
  const needsRestoreRef = useRef(false);
  const hasEverHadMessagesRef = useRef(false);
  const hasAttemptedTailProbeRef = useRef(false);
  const hiddenCandidateSnapshotRef = useRef<ReadinessSurfaceSnapshot | null>(null);
  const hiddenReadySnapshotRef = useRef<ReadinessSurfaceSnapshot | null>(null);
  const tailProbePlaceholderScrollHeightRef = useRef<number | null>(null);
  const tailProbePlaceholderSnapshotRef = useRef<ReadinessSurfaceSnapshot | null>(null);
  const tailProbeRealSurfaceSnapshotRef = useRef<ReadinessSurfaceSnapshot | null>(null);
  const tailProbeStartedAtRef = useRef<number | null>(null);
  const userScrollIntentDuringVisibleVerificationRef = useRef(false);
  const visibleCandidateSnapshotRef = useRef<ReadinessSurfaceSnapshot | null>(null);
  const visiblePreseedPendingRef = useRef(false);
  const restorePhaseRef = useRef<RestorePhase>('idle');
  const lastMessageIdRef = useRef<string | null>(messages.at(-1)?.id ?? null);
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
  const latestRenderedRowCountRef = useRef(0);
  const restorePathRef = useRef<'exact' | 'warm' | 'cold'>('cold');
  const traceRootRef = useRef<HTMLDivElement>(null);
  lastMessageIdRef.current = messages.at(-1)?.id ?? null;

  const cancelReadinessWork = useCallback((): void => {
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
    const scroller = scrollContainerRef.current;
    const listElement = scroller ? findChatListSurface(scroller) : null;
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
    const scroller = scrollContainerRef.current;
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

      const listElement = findChatListSurface(metrics.scroller);
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
    const sid = sessionKey.slice(-6);
    if (restoredSizeCacheRef.current) {
      const precheck = getScrollerMetrics();
      if (
        precheck &&
        precheck.scrollHeight > precheck.clientHeight &&
        precheck.scrollTop >= precheck.bottomTop - BOTTOM_TOLERANCE_PX
      ) {
        logger.debug(`[${sid}] alignScrollerToBottom → already at bottom (cache shortcut)`);
        return precheck;
      }
    }

    logger.debug(`[${sid}] alignScrollerToBottom → scrollToLocation(LAST, end)`, {
      rowCount: renderRows.length,
      sizeCacheRestored: restoredSizeCacheRef.current,
    });
    scrollToLocation({
      index: renderRows.length > 0 ? renderRows.length - 1 : 'LAST',
      align: 'end',
    });
    const metrics = getScrollerMetrics();
    if (!metrics) return null;

    const prevTop = metrics.scroller.scrollTop;
    metrics.scroller.scrollTop = metrics.bottomTop;
    const afterMetrics = getScrollerMetrics();
    if (afterMetrics && prevTop !== afterMetrics.scrollTop) {
      markSwitchTimeline(
        'align-bottom',
        `${String(Math.round(prevTop))} → ${String(Math.round(afterMetrics.scrollTop))} scrollH=${String(afterMetrics.scrollHeight)}`
      );
    }
    return afterMetrics;
  }, [getScrollerMetrics, renderRows.length, scrollToLocation, sessionKey]);

  const forceTailProbeRender = useCallback((): boolean => {
    if (renderRows.length === 0) {
      return false;
    }

    // With unvirtualized tail rows, the tail is always rendered.
    // Just scroll to bottom instead of data.replace.
    hasAttemptedTailProbeRef.current = true;
    tailProbePlaceholderScrollHeightRef.current = null;
    tailProbePlaceholderSnapshotRef.current = null;
    tailProbeRealSurfaceSnapshotRef.current = null;
    hiddenCandidateSnapshotRef.current = null;
    tailProbeStartedAtRef.current = Date.now();
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
        restorePath: restorePathRef.current,
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
      tailProofVersion: number,
      options?: {
        readonly alignBottomOnReady?: boolean;
      }
    ): void => {
      if (hasResolvedVerificationRef.current && result !== 'aborted') {
        logger.debug(`[${sessionKey.slice(-6)}] emitVerification SKIPPED (already resolved)`, {
          phase,
          result,
        });
        return;
      }

      logger.info(`[${sessionKey.slice(-6)}] VERIFICATION RESULT: ${result}`, {
        phase,
        tailProofVersion,
        alignBottomOnReady: options?.alignBottomOnReady ?? true,
        restorePath: restorePathRef.current,
        sizeCacheRestored: restoredSizeCacheRef.current,
      });

      hasResolvedVerificationRef.current = true;
      readinessStartedRef.current = false;
      cancelReadinessWork();

      if (result === 'hidden-ready' || result === 'visible-ready') {
        restorePhaseRef.current = 'done';
        if (options?.alignBottomOnReady !== false) {
          alignScrollerToBottom();
        }
        setIsReadyForSteady(true);
        snapshotStableMeasurementCache();
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
    [
      alignScrollerToBottom,
      cancelReadinessWork,
      onReady,
      sessionKey,
      snapshotStableMeasurementCache,
    ]
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
    (phase: Extract<RestorePhase, 'stabilizing'>, stableMs: number, onStable: () => void): void => {
      if (readinessStableTimerRef.current !== null) {
        window.clearTimeout(readinessStableTimerRef.current);
        readinessStableTimerRef.current = null;
      }
      readinessResizeObserverRef.current?.disconnect();
      readinessResizeObserverRef.current = null;

      const scroller = scrollContainerRef.current;
      const listElement = scroller ? findChatListSurface(scroller) : null;
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

      let resizeCount = 0;
      const observer = new ResizeObserver(() => {
        if (restorePhaseRef.current !== phase) {
          return;
        }
        resizeCount += 1;
        markSwitchTimeline(
          'resize-observer-reset',
          `phase=${phase} count=${String(resizeCount)} stableMs=${String(stableMs)}`
        );
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
      readinessTimeoutRef.current = window.setTimeout(
        () => {
          markSwitchTimeline(
            'timeout',
            [
              `phase=${restorePhaseRef.current}`,
              `vPhase=${String(effectiveVerificationPhase)}`,
              `tailProbe=${String(hasAttemptedTailProbeRef.current)}`,
              `sizeCache=${String(restoredSizeCacheRef.current)}`,
              `visPreseed=${String(visiblePreseedPendingRef.current)}`,
              `started=${String(readinessStartedRef.current)}`,
            ].join(' ')
          );
          if (effectiveVerificationPhase) {
            emitVerificationResult(
              effectiveVerificationPhase,
              'timeout',
              tailProofVersionRef.current
            );
          }
        },
        messages.length > LARGE_SESSION_THRESHOLD
          ? READY_TIMEOUT_LARGE_SESSION_MS
          : READY_TIMEOUT_MS
      );
    },
    [effectiveVerificationPhase, emitVerificationResult, messages.length]
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

      const rendered = getCurrentlyRenderedRows();
      progressPositioningRef.current(rendered);
    }, POSITIONING_RECHECK_MS);
  }, [getCurrentlyRenderedRows]);

  const isHiddenPlaceholderShortSurface = useCallback(
    (metrics: RenderSurfaceMetrics): boolean =>
      metrics.scrollHeight <= metrics.clientHeight + BOTTOM_TOLERANCE_PX &&
      metrics.renderedRowCount < renderRows.length,
    [renderRows.length]
  );

  // With direct useVirtualizer (no purge), heights are always preserved.
  // The 48ms hidden stabilization window validates final geometry independently.
  const hasObservedPostProbeSurface = useCallback((): boolean => true, []);

  const scheduleHiddenVerificationCheck = useCallback((): void => {
    // Fast path for warm instances with restored size caches.
    // Restored cache → the list has accurate heights (no estimates).
    // layoutPendingCount === 0 → no pending mutations.
    // Geometry checks → tail sentinel rendered, at bottom, not placeholder.
    // These conditions guarantee layout stability — skip the 48ms
    // ResizeObserver quiet window entirely and signal ready immediately.
    //
    // The rAF two-snapshot comparison was removed because alignScrollerToBottom()
    // (called at verification start) triggers an internal re-render that
    // settles across frames, causing the two snapshots to always differ for warm
    // instances even though the layout is genuinely stable.
    if (
      restoredSizeCacheRef.current &&
      layoutPendingCount === 0 &&
      restorePhaseRef.current === 'stabilizing' &&
      effectiveVerificationPhase === 'hidden'
    ) {
      const immediateRendered = getCurrentlyRenderedRows();
      const immediateMetrics = getRenderSurfaceMetrics(immediateRendered);
      // Accept either sentinel in DOM or sentinel in the rendered range.
      // Cold-cached sessions enter stabilizing with the sentinel in the render
      // range but not yet painted (~1 frame lag). Requiring DOM presence forces
      // them into the 48ms ResizeObserver window unnecessarily.
      const sentinelConfirmed =
        immediateMetrics?.tailSentinelRendered === true ||
        immediateRendered.some((r) => r.id === lastMessageIdRef.current);
      if (
        sentinelConfirmed &&
        immediateMetrics !== null &&
        immediateMetrics.isAtBottom &&
        !isHiddenPlaceholderShortSurface(immediateMetrics) &&
        hasObservedPostProbeSurface()
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

      const latestRendered = getCurrentlyRenderedRows();
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
        // Check if the sentinel is in the render data but not yet in the DOM.
        // The DOM query lags by 1-2 frames. Same guard exists in progressPositioning.
        // Without this, a stale DOM query triggers a destructive purged probe that
        // throws away all cached heights — costing 300ms+ for re-measurement.
        const sentinelInRenderRange = latestRendered.some(
          (row) => row.id === lastMessageIdRef.current
        );
        markSwitchTimeline(
          'hidden-backtrack:tail-sentinel-lost',
          `rows=${String(latestRendered.length)} inRange=${String(sentinelInRenderRange)}`
        );
        restorePhaseRef.current = 'positioning';
        hiddenCandidateSnapshotRef.current = null;
        if (!hasAttemptedTailProbeRef.current && !sentinelInRenderRange) {
          forceTailProbeRender();
          queuePositioningRecheck();
          return;
        }
        alignScrollerToBottom();
        progressPositioningRef.current(latestRendered);
        return;
      }

      if (isHiddenPlaceholderShortSurface(latestMetrics)) {
        markSwitchTimeline(
          'hidden-backtrack:placeholder-short',
          `rows=${String(latestRendered.length)} scrollH=${String(latestMetrics.scrollHeight)} clientH=${String(latestMetrics.clientHeight)}`
        );
        hiddenCandidateSnapshotRef.current = null;
        restorePhaseRef.current = 'positioning';
        progressPositioningRef.current(latestRendered);
        return;
      }

      if (!hasObservedPostProbeSurface()) {
        markSwitchTimeline('hidden-backtrack:no-post-probe-surface');
        hiddenCandidateSnapshotRef.current = null;
        restorePhaseRef.current = 'positioning';
        progressPositioningRef.current(latestRendered);
        return;
      }

      if (!latestMetrics.isAtBottom) {
        markSwitchTimeline(
          'hidden-realign:not-at-bottom',
          `scrollTop=${String(latestMetrics.scrollTop)} scrollH=${String(latestMetrics.scrollHeight)} clientH=${String(latestMetrics.clientHeight)}`
        );
        // Re-align in place instead of backtracking to positioning phase.
        // Each ResizeObserver batch shifts scrollHeight; re-aligning and restarting
        // the stability window converges in 2-3 cycles without restarting the pipeline.
        hiddenCandidateSnapshotRef.current = null;
        alignScrollerToBottom();
        scheduleHiddenVerificationCheckRef.current();
        return;
      }

      if (layoutPendingCount > 0) {
        markSwitchTimeline(
          'hidden-backtrack:layout-pending',
          `count=${String(layoutPendingCount)} sources=[${sessionId ? getActiveLayoutMutationSources(sessionId).join(',') : ''}]`
        );
        hiddenCandidateSnapshotRef.current = null;
        scheduleHiddenVerificationCheckRef.current();
        return;
      }

      const currentSnapshot = buildReadinessSurfaceSnapshot(latestMetrics, layoutSettledVersion);
      if (!isSameReadinessSurfaceSnapshot(hiddenCandidateSnapshotRef.current, currentSnapshot)) {
        markSwitchTimeline('hidden-backtrack:snapshot-changed');
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
    getCurrentlyRenderedRows,
    getRenderSurfaceMetrics,
    hasObservedPostProbeSurface,
    isHiddenPlaceholderShortSurface,
    layoutPendingCount,
    layoutSettledVersion,
    queuePositioningRecheck,
    refreshReadinessTimeout,
    sessionId,
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
      restorePhaseRef.current === 'stabilizing' &&
      effectiveVerificationPhase === 'visible'
    ) {
      const immediateRendered = getCurrentlyRenderedRows();
      const immediateMetrics = getRenderSurfaceMetrics(immediateRendered);
      if (immediateMetrics?.tailSentinelRendered === true && immediateMetrics.isAtBottom) {
        const immediateSnapshot = buildReadinessSurfaceSnapshot(
          immediateMetrics,
          layoutSettledVersion
        );
        if (isVisiblePreseedGeometryMatch(visibleCandidateSnapshotRef.current, immediateSnapshot)) {
          markSwitchTimeline('visible-preseed', 'snapshot-match-instant');
          visiblePreseedPendingRef.current = false;
          signalReady('stabilized');
          return;
        }
        markSwitchTimeline(
          'visible-preseed-mismatch',
          `hScrollH=${String(visibleCandidateSnapshotRef.current?.scrollHeight)} vScrollH=${String(immediateSnapshot.scrollHeight)} hBottom=${String(visibleCandidateSnapshotRef.current?.bottomTop)} vBottom=${String(immediateSnapshot.bottomTop)} hLSV=${String(visibleCandidateSnapshotRef.current?.layoutSettledVersion)} vLSV=${String(immediateSnapshot.layoutSettledVersion)}`
        );
      } else if (
        immediateMetrics?.tailSentinelRendered === true &&
        !immediateMetrics.isAtBottom &&
        layoutPendingCount === 0
      ) {
        // Sentinel rendered but not at bottom: cached heights applied
        // after hidden-ready captured the snapshot, growing scrollHeight.
        // The hidden phase already proved content stability — scroll to bottom
        // and verify in one frame instead of the 200ms quiet window.
        markSwitchTimeline(
          'visible-preseed-scroll-fix',
          `scrollH=${String(immediateMetrics.scrollHeight)} clientH=${String(immediateMetrics.clientHeight)} scrollTop=${String(immediateMetrics.scrollTop)}`
        );
        alignScrollerToBottom();
        requestAnimationFrame(() => {
          if (restorePhaseRef.current !== 'stabilizing') {
            return;
          }
          const retryRendered = getCurrentlyRenderedRows();
          const retryMetrics = getRenderSurfaceMetrics(retryRendered);
          const freshPending = sessionId
            ? (useChatStore.getState().sessions[sessionId]?.layoutPendingCount ?? 0)
            : 0;
          if (
            retryMetrics?.tailSentinelRendered === true &&
            retryMetrics.isAtBottom &&
            freshPending === 0
          ) {
            markSwitchTimeline('visible-preseed', 'scroll-fix-ready');
            visiblePreseedPendingRef.current = false;
            signalReady('stabilized');
            return;
          }
          // Still not stable — fall to slow path
          markSwitchTimeline(
            'visible-preseed-scroll-fix-miss',
            `sentinel=${String(retryMetrics?.tailSentinelRendered)} bottom=${String(retryMetrics?.isAtBottom)} pending=${String(freshPending)}`
          );
          scheduleVisibleVerificationCheckRef.current();
        });
        return;
      } else {
        markSwitchTimeline(
          'visible-preseed-gate-fail',
          `sentinel=${String(immediateMetrics?.tailSentinelRendered)} bottom=${String(immediateMetrics?.isAtBottom)} rows=${String(immediateRendered.length)} scrollH=${String(immediateMetrics?.scrollHeight ?? 0)} clientH=${String(immediateMetrics?.clientHeight ?? 0)}`
        );
      }
    }

    // Slow path: wait for 200ms of resize stability before checking
    startTemporaryResizeStabilityWindow('stabilizing', VISIBLE_READY_QUIET_MS, () => {
      if (restorePhaseRef.current !== 'stabilizing' || effectiveVerificationPhase !== 'visible') {
        return;
      }

      const latestRendered = getCurrentlyRenderedRows();
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
        markSwitchTimeline(
          'visible-snapshot-changed',
          `prevScrollH=${String(visibleCandidateSnapshotRef.current?.scrollHeight)} curScrollH=${String(currentSnapshot.scrollHeight)} prevTop=${String(visibleCandidateSnapshotRef.current?.scrollTop)} curTop=${String(currentSnapshot.scrollTop)} prevBottom=${String(visibleCandidateSnapshotRef.current?.bottomTop)} curBottom=${String(currentSnapshot.bottomTop)} prevRows=${String(visibleCandidateSnapshotRef.current?.renderedRowCount)} curRows=${String(currentSnapshot.renderedRowCount)} prevLSV=${String(visibleCandidateSnapshotRef.current?.layoutSettledVersion)} curLSV=${String(currentSnapshot.layoutSettledVersion)}`
        );
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
    getCurrentlyRenderedRows,
    getRenderSurfaceMetrics,
    layoutPendingCount,
    layoutSettledVersion,
    refreshReadinessTimeout,
    sessionId,
    signalReady,
    startTemporaryResizeStabilityWindow,
  ]);
  scheduleVisibleVerificationCheckRef.current = scheduleVisibleVerificationCheck;

  const handleVisibleVerificationScroll = useCallback(
    (location: { readonly isAtBottom: boolean }): void => {
      logger.debug(`[${sessionKey.slice(-6)}] onScroll (verification)`, {
        isAtBottom: location.isAtBottom,
        verificationPhase: effectiveVerificationPhase,
        hasResolved: hasResolvedVerificationRef.current,
        userScrollIntent: userScrollIntentDuringVisibleVerificationRef.current,
      });
      if (
        effectiveVerificationPhase !== 'visible' ||
        hasResolvedVerificationRef.current ||
        !userScrollIntentDuringVisibleVerificationRef.current ||
        location.isAtBottom
      ) {
        return;
      }

      logger.info(
        `[${sessionKey.slice(-6)}] USER SCROLLED during visible verification → early commit`
      );
      markSwitchTimeline('visible-user-scroll', 'commit-without-bottom-align');
      userScrollIntentDuringVisibleVerificationRef.current = false;
      tailProofVersionRef.current += 1;
      emitVerificationResult('visible', 'visible-ready', tailProofVersionRef.current, {
        alignBottomOnReady: false,
      });
    },
    [effectiveVerificationPhase, emitVerificationResult, sessionKey]
  );

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
        markSwitchTimeline('no-metrics:stabilization-gate', `rows=${String(rendered.length)}`);
        if (restorePhaseRef.current === 'positioning') {
          alignScrollerToBottom();
        }
        return false;
      }

      if (!metrics.tailSentinelRendered) {
        // The DOM query for [data-tail-sentinel] can lag behind the render data
        // internal render state by 1+ frames. For short sessions, this causes
        // the positioning phase to loop for 1500ms then timeout.
        // Trust the render data: if the sentinel row is in the rendered
        // range, it WILL appear in the DOM within 1 frame. The stabilizing
        // phase's 48ms window catches any remaining layout drift.
        const sentinelInRenderRange = rendered.some((r) => r.id === lastMessageIdRef.current);
        if (!sentinelInRenderRange) {
          markSwitchTimeline(
            'positioning:no-sentinel',
            `rows=${String(rendered.length)} scrollH=${String(metrics.scrollHeight)} clientH=${String(metrics.clientHeight)} scrollTop=${String(metrics.scrollTop)} cache=${String(restoredSizeCacheRef.current)} bottom=${String(metrics.isAtBottom)}`
          );
          if (restorePhaseRef.current === 'positioning') {
            alignScrollerToBottom();
          }
          return false;
        }
        // Sentinel is in the render range but not yet in the DOM.
        // Fall through to subsequent checks — trace this path so the
        // positioning gap is observable in session switch timelines.
        markSwitchTimeline(
          'positioning:sentinel-in-range-not-dom',
          `rows=${String(rendered.length)} scrollH=${String(metrics.scrollHeight)} clientH=${String(metrics.clientHeight)} bottom=${String(metrics.isAtBottom)}`
        );
      }

      if (effectiveVerificationPhase === 'hidden') {
        if (isHiddenPlaceholderShortSurface(metrics)) {
          markSwitchTimeline(
            'positioning:placeholder-short',
            `rows=${String(rendered.length)} scrollH=${String(metrics.scrollHeight)} clientH=${String(metrics.clientHeight)}`
          );
          return false;
        }

        if (!hasObservedPostProbeSurface()) {
          markSwitchTimeline('positioning:no-post-probe');
          return false;
        }
      }

      if (!metrics.isAtBottom) {
        markSwitchTimeline(
          'positioning:not-at-bottom',
          `rows=${String(rendered.length)} scrollTop=${String(metrics.scrollTop)} scrollH=${String(metrics.scrollHeight)} clientH=${String(metrics.clientHeight)}`
        );
        if (restorePhaseRef.current === 'positioning') {
          alignScrollerToBottom();
        }
        return false;
      }

      if (layoutPendingCount > 0) {
        markSwitchTimeline(
          'positioning:layout-pending',
          `count=${String(layoutPendingCount)} sources=[${sessionId ? getActiveLayoutMutationSources(sessionId).join(',') : ''}]`
        );
        return false;
      }

      restorePhaseRef.current = 'stabilizing';
      // Pre-seed the hidden candidate snapshot at stabilization entry so the
      // first 48ms stability window can confirm it immediately. Without this,
      // the first window always captures (candidate is null) and reschedules,
      // costing an extra ~48ms on every cold switch.
      if (effectiveVerificationPhase === 'hidden') {
        hiddenCandidateSnapshotRef.current = buildReadinessSurfaceSnapshot(
          metrics,
          layoutSettledVersion
        );
      }
      markSwitchTimeline(
        'stabilizing',
        `rows=${String(metrics.renderedRowCount)} tail=${String(metrics.tailSentinelRendered)} pending=${String(layoutPendingCount)}`
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
      layoutSettledVersion,
      scheduleHiddenVerificationCheck,
      scheduleVisibleVerificationCheck,
      sessionId,
    ]
  );

  const progressPositioning = useCallback(
    (rendered: ChatRenderRow[]): void => {
      markSwitchTimeline(
        'positioning:poll',
        `phase=${restorePhaseRef.current} rows=${String(rendered.length)}`
      );
      if (restorePhaseRef.current !== 'positioning') {
        return;
      }

      const metrics = getRenderSurfaceMetrics(rendered);
      if (!metrics) {
        markSwitchTimeline('positioning:no-metrics', `rows=${String(rendered.length)}`);
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

      if (effectiveVerificationPhase === 'hidden' && !hasAttemptedTailProbeRef.current) {
        // Only probe if the sentinel is genuinely missing from the render
        // range. If it's already rendered (just not in the DOM yet), probing is
        // counterproductive: it sets hasAttemptedTailProbeRef which gates
        // hasObservedPostProbeSurface, and for short lists the surface snapshot
        // never changes → positioning stalls until timeout.
        const sentinelAlreadyInRange = rendered.some((r) => r.id === lastMessageIdRef.current);
        if (!sentinelAlreadyInRange && forceTailProbeRender()) {
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
    ]
  );
  progressPositioningRef.current = progressPositioning;

  // Track rendered data changes for verification positioning.
  // Fires when the virtualizer's render range changes.
  const virtualItems = rowVirtualizer.getVirtualItems();
  const virtualItemCount = virtualItems.length;

  useLayoutEffect(() => {
    const count = virtualItemCount + nonVirtualizedRows.length;
    latestRenderedRowCountRef.current = count;
    if (restorePhaseRef.current !== 'positioning') {
      return;
    }
    progressPositioningRef.current(getCurrentlyRenderedRows());
  }, [virtualItemCount, nonVirtualizedRows.length, getCurrentlyRenderedRows]);

  useLayoutEffect(() => {
    const traceRoot = traceRootRef.current;
    if (!traceRoot) {
      return;
    }

    traceRoot.dataset['switchTraceRoot'] = 'true';
    traceRoot.dataset['renderedRowCount'] = String(latestRenderedRowCountRef.current);
    traceRoot.dataset['tailSentinelRendered'] = String(
      traceRoot.querySelector<HTMLElement>('[data-tail-sentinel="true"]') !== null
    );
    traceRoot.dataset['overscanPhase'] = overscanPhase;
    traceRoot.dataset['sizeCacheRestored'] = String(restoredSizeCacheRef.current);
    traceRoot.dataset['restorePath'] = restorePathRef.current;
  }, [overscanPhase]);

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

    markSwitchTimeline(
      'verification-key-change',
      [
        `prev-key=${String(previousVerificationKeyRef.current)}`,
        `next-key=${effectiveVerificationKey}`,
        `prev-phase=${String(previousVerificationPhaseRef.current)}`,
        `next-phase=${effectiveVerificationPhase}`,
        `msgs=${String(messages.length)}`,
      ].join(' ')
    );

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

    // Lightweight hidden→visible promotion: the hidden phase already proved
    // layout stability, so preserve the render state and let the
    // preseed match fire immediately instead of restarting from positioning.
    // Skipping setRestoreVersion / setIsReadyForSteady avoids the React
    // re-render cycle that collapses the list to 2 rows.
    if (
      previousVerificationPhaseRef.current === 'hidden' &&
      effectiveVerificationPhase === 'visible'
    ) {
      previousVerificationKeyRef.current = effectiveVerificationKey;
      previousVerificationPhaseRef.current = effectiveVerificationPhase;
      hasResolvedVerificationRef.current = false;
      tailProofVersionRef.current = 0;

      const preseededVisibleSnapshot = hiddenReadySnapshotRef.current;
      hiddenCandidateSnapshotRef.current = null;
      if (preseededVisibleSnapshot !== null) {
        visibleCandidateSnapshotRef.current = preseededVisibleSnapshot;
        visiblePreseedPendingRef.current = true;
      } else {
        clearVisibleVerificationCandidate();
      }
      hiddenReadySnapshotRef.current = null;

      restorePhaseRef.current = 'stabilizing';
      markSwitchTimeline('visible-start', `${String(messages.length)} msgs`);
      scheduleVisibleVerificationCheckRef.current();
      return;
    }

    previousVerificationKeyRef.current = effectiveVerificationKey;
    previousVerificationPhaseRef.current = effectiveVerificationPhase;
    hasResolvedVerificationRef.current = false;
    needsRestoreRef.current = true;
    userScrollIntentDuringVisibleVerificationRef.current = false;
    hasEverHadMessagesRef.current = messages.length > 0;
    hasAttemptedTailProbeRef.current = false;
    restorePathRef.current = 'cold';
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
    // fire. Only re-set the flag — don't reapply measurements (the list
    // retains its internal sizes across display mode transitions).
    if (sessionId) {
      const reCacheSession = useChatStore.getState().sessions[sessionId];
      if (reCacheSession) {
        let reCache = reCacheSession.measurementCache ?? null;
        reCache ??= getRenderCache(sessionId);
        if (
          reCache !== null &&
          isExactMeasurementCache(
            reCacheSession,
            reCache,
            renderRows.length,
            getCurrentViewportWidth()
          )
        ) {
          restoredSizeCacheRef.current = true;
        }
      }
    }

    cancelReadinessWork();
    setIsReadyForSteady(false);
    setRestoreVersion((v) => v + 1);
  }, [
    cancelReadinessWork,
    emitVerificationResult,
    getCurrentViewportWidth,
    isVerifying,
    messages.length,
    renderRows.length,
    clearVisibleVerificationCandidate,
    effectiveVerificationKey,
    effectiveVerificationPhase,
    sessionId,
  ]);

  useLayoutEffect(() => {
    if (!isVerifying || !needsRestoreRef.current || hasResolvedVerificationRef.current) return;
    if (!ensureListSurfaceReady()) {
      logger.debug(`[${sessionKey.slice(-6)}] verification start BLOCKED — list surface not ready`);
      return;
    }

    needsRestoreRef.current = false;

    logger.info(`[${sessionKey.slice(-6)}] VERIFICATION START`, {
      phase: effectiveVerificationPhase,
      messageCount: messages.length,
      restorePath: restorePathRef.current,
      sizeCacheRestored: restoredSizeCacheRef.current,
      isVisible,
    });

    restorePhaseRef.current = 'positioning';
    alignScrollerToBottom();
    readinessStartedRef.current = false;
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
    progressPositioning(getCurrentlyRenderedRows());
  }, [
    alignScrollerToBottom,
    cancelReadinessWork,
    getCurrentlyRenderedRows,
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

    scrollToLocation({ index: 'LAST', align: 'end' });
  }, [messages.length, scrollIntent, scrollToLocation]);

  // Clear consumed scroll intent (safe — poll is ref-driven, not affected)
  useEffect(() => {
    if (scrollIntent !== null && sessionId !== undefined) {
      useChatStore.getState().clearScrollIntent(sessionId);
    }
  }, [scrollIntent, sessionId]);

  const previousIsVerifyingRef = useRef(isVerifying);
  useEffect(() => {
    if (previousIsVerifyingRef.current && !isVerifying) {
      snapshotStableMeasurementCache();
    }
    previousIsVerifyingRef.current = isVerifying;
  }, [isVerifying, snapshotStableMeasurementCache]);

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
      snapshotStableMeasurementCache();
    };
  }, [cancelReadinessWork, clearVisibleVerificationCandidate, snapshotStableMeasurementCache]);

  // New user message: animate and force scroll to bottom.
  // The library's scroll modifiers handle streaming and subsequent messages.
  useEffect(() => {
    const prevCount = prevMessageCount.current;
    prevMessageCount.current = messages.length;

    if (messages.length === prevCount + 1) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === 'user') {
        logger.info(
          `[${sessionKey.slice(-6)}] new user message → animate + smooth scroll to bottom`,
          {
            messageId: lastMessage.id.slice(-6),
            prevCount,
            newCount: messages.length,
          }
        );
        setAnimatingMessageIds((prev) => new Set(prev).add(lastMessage.id));
        scrollToLocation({ index: 'LAST', align: 'end', behavior: 'smooth' });
      } else if (lastMessage) {
        logger.debug(`[${sessionKey.slice(-6)}] new ${lastMessage.role} message appended`, {
          messageId: lastMessage.id.slice(-6),
          prevCount,
          newCount: messages.length,
        });
      }
    } else if (messages.length !== prevCount) {
      logger.debug(
        `[${sessionKey.slice(-6)}] message count changed: ${String(prevCount)} → ${String(messages.length)}`
      );
    }
  }, [messages, scrollToLocation, sessionKey]);

  // Wire the verification scroll callback
  onScrollCallbackRef.current = handleVisibleVerificationScroll;

  // ── Render timing: measure React render cost ───────────────────────
  // This runs synchronously at the end of render, before commit.
  // The useLayoutEffect below fires after commit, giving us total cost.
  const renderJsxStart = performance.now();
  const renderDuration = renderJsxStart - renderStartMark;
  // Log renders that exceed half a frame budget (>4ms)
  if (renderDuration > 4 && sessionId) {
    const sid = sessionId.slice(-6);
    markSwitchTimeline(
      'react-render',
      `[${sid}] #${String(renderCountRef.current)} ${String(Math.round(renderDuration * 10) / 10)}ms phase=${String(effectiveVerificationPhase)} rows=${String(renderRows.length)} virt=${String(virtualizedRowCount)} overscan=${String(overscan)}`
    );
  }

  return (
    <ToolWidgetSessionContext.Provider value={sessionKey}>
      <ToolWidgetLayoutFrozenContext.Provider value={isVerifying}>
        <div ref={traceRootRef} className="flex-1 flex flex-col min-h-0">
          <div
            ref={scrollContainerRef}
            data-testid="chat-scroller"
            className="flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain"
            style={LIST_STYLE}
            onScroll={() => {
              const scroller = scrollContainerRef.current;
              if (scroller) {
                updateBottomTracking(scroller);
              }
            }}
            onWheel={(event) => {
              if (event.deltaY < 0) {
                pendingUserScrollUpIntentRef.current = true;
              }
            }}
            onPointerDown={() => {
              isPointerScrollActiveRef.current = true;
            }}
            onPointerUp={() => {
              isPointerScrollActiveRef.current = false;
            }}
            onPointerCancel={() => {
              isPointerScrollActiveRef.current = false;
            }}
            onTouchStart={(event) => {
              const touch = event.touches[0];
              if (touch) {
                lastTouchClientYRef.current = touch.clientY;
              }
            }}
            onTouchMove={(event) => {
              const touch = event.touches[0];
              if (!touch) return;
              const prev = lastTouchClientYRef.current;
              if (prev !== null && touch.clientY > prev + 1) {
                pendingUserScrollUpIntentRef.current = true;
              }
              lastTouchClientYRef.current = touch.clientY;
            }}
            onTouchEnd={() => {
              lastTouchClientYRef.current = null;
            }}
          >
            {/* Virtualized region — the chat-list-inner element MUST always
                exist in the DOM. findChatListSurface(), velocity scroll,
                verification, and session-switch all query for it. When
                virtualizedRowCount === 0 (≤8 messages), it renders as an
                empty marker div so those systems still find a surface. */}
            <div
              ref={contentRef}
              data-testid="chat-list-inner"
              style={
                virtualizedRowCount > 0
                  ? {
                      position: 'relative',
                      height: rowVirtualizer.getTotalSize(),
                      width: '100%',
                    }
                  : undefined
              }
            >
              {virtualizedRowCount > 0 &&
                virtualItems.map((item) => {
                  const row = renderRows[item.index];
                  if (!row) return null;
                  return (
                    <div
                      key={String(item.key)}
                      data-index={item.index}
                      ref={rowVirtualizer.measureElement}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${String(item.start)}px)`,
                      }}
                    >
                      {renderMessageItem(row, item.index, messageListContext)}
                    </div>
                  );
                })}
            </div>

            {/* Non-virtualized tail rows (always rendered) */}
            <TailRowsTraced
              rows={nonVirtualizedRows}
              baseIndex={virtualizedRowCount}
              context={messageListContext}
              sessionKey={sessionKey}
              verificationPhase={effectiveVerificationPhase}
            />

            {/* Thinking shimmer */}
            {isAgentRunning ? (
              <div className="mx-auto px-4 pb-4 w-full" style={CHAT_MAX_WIDTH_STYLE}>
                <div className="flex items-center gap-2 px-[9px] py-2">
                  <ShimmerText className="font-sans text-base text-foreground">
                    Thinking
                  </ShimmerText>
                </div>
              </div>
            ) : null}

            {/* Tail sentinel */}
            <div
              data-tail-sentinel-id={tailSentinelDomId}
              data-tail-sentinel="true"
              className="h-px w-full shrink-0"
              aria-hidden="true"
            />
          </div>

          {/* Queued message outside scroller */}
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
