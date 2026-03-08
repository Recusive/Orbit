/**
 * ChatMessages - Message list with auto-scroll behavior
 *
 * Renders all messages in normal document flow for proper native text
 * selection. No virtualization — React handles reconciliation directly.
 *
 * IMPORTANT: Do NOT add `contain: paint`, `content-visibility: auto`, or
 * `user-select: none` to .message-item — all three break native text
 * selection in WKWebView by causing block-level selection highlights.
 *
 * Integration with use-stick-to-bottom:
 * - scrollRef: shared scroll container for stick-to-bottom
 * - contentRef: on the wrapper div whose natural height drives the
 *   ResizeObserver that triggers auto-scroll.
 *
 * NOTE: Chat container widths come from @/lib/utils/constants.
 * To change chat max-width, update CHAT_WIDTH and CHAT_WIDTH_VAR in constants.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// PINNED: use-stick-to-bottom@1.1.2 — the session-switch scroll reset workaround
// (stopScroll() call below) depends on this library's internal ResizeObserver
// timing. Upgrading may break the workaround silently. Test thoroughly before
// bumping. (Code review: Opus cycle 1, issue #8)
import { useStickToBottom } from 'use-stick-to-bottom';
import { useShallow } from 'zustand/shallow';

import { MessageItem } from './messages';
import { QueuedMessageBubble } from './queued-message';

import type { ChatMessage } from './messages';
import type { ToolExecution } from '@/stores/agent/tool-store';
import type { QueuedMessage } from '@/stores/chat/queued-message-store';
import type { FC } from 'react';

import { ShimmerText } from '@/components/ui/shimmer-text';
import { useSmoothScroll } from '@/hooks/ui';
import { CHAT_WIDTH, CHAT_WIDTH_VAR } from '@/lib/utils';
import { deduplicateAndSortTools, useToolStore } from '@/stores/agent/tool-store';

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
  // use-stick-to-bottom handles all scroll behavior:
  // - Sticks to bottom during streaming (ResizeObserver-based)
  // - Detects user scroll-up to cancel stickiness
  // - Velocity-based spring animation for smooth content growth
  // - Scroll anchoring when content above viewport resizes
  const { scrollRef, contentRef, scrollToBottom, stopScroll } = useStickToBottom({
    // Smooth spring animation when content resizes (tool expand/collapse)
    resize: 'smooth',
    // Smooth initial scroll on mount
    initial: 'smooth',
  });

  // Lerp-based scroll damping — caps visual scroll speed for controlled feel.
  // The passive scroll listener inside the hook keeps state in sync when
  // useStickToBottom adjusts scrollTop (streaming, tool expand, etc.).
  // onScrollAway calls stopScroll() so useStickToBottom releases immediately
  // when the user scrolls up — without this, it fights the lerp animation.
  const smoothScrollCallbackRef = useSmoothScroll({
    damping: 0.08,
    onScrollAway: stopScroll,
  });

  // Merge useStickToBottom's RefObject with useSmoothScroll's callback ref.
  // Both need the same DOM node: one for scroll anchoring, one for wheel lerp.
  const mergedScrollRef = useCallback(
    (node: HTMLElement | null): void => {
      (scrollRef as React.RefObject<HTMLElement | null>).current = node;
      smoothScrollCallbackRef(node);
    },
    [scrollRef, smoothScrollCallbackRef]
  );

  const prevSessionIdRef = useRef(sessionId);

  // Track message IDs that should animate (newly sent user messages)
  // Using STATE (not ref) ensures animation class is applied on same render (code review: Codex cycle 2 #2)
  const [animatingMessageIds, setAnimatingMessageIds] = useState<Set<string>>(() => new Set());
  // Track previous message count to distinguish real appends from ID reconciliation.
  // reconcileMessageId changes msg.id (frontend UUID → SDK UUID) without adding messages.
  // Without this guard, the changed ID is treated as "new" → animation replays.
  const prevMessageCount = useRef(0);

  // CONSOLIDATED: Handle session changes in one place (code review: Codex cycle 2 #1)
  // This ensures scroll reset and animation clearing happen atomically
  useEffect(() => {
    // Capture previous value BEFORE any mutation
    const prevSessionId = prevSessionIdRef.current;

    // Skip initial mount (no actual session change)
    if (prevSessionId === sessionId) return;

    // Session changed - clear animation state
    setAnimatingMessageIds(new Set());
    prevMessageCount.current = 0;

    // Reset scroll position to top for new conversation
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = 0;
      // Explicitly tell the library we're no longer at bottom.
      // Without this, a ResizeObserver callback racing the scroll event's
      // setTimeout(..., 1) can cause the resizeDifference guard to swallow
      // the scroll event — leaving isAtBottom=true at scrollTop=0.
      // NOTE: This workaround depends on use-stick-to-bottom's internal timing.
      // If the library updates its ResizeObserver scheduling, this may need
      // revisiting. (Code review: Opus cycle 1, issue #12)
      stopScroll();
    }

    // Update ref AFTER all mutations
    prevSessionIdRef.current = sessionId;
  }, [sessionId, scrollRef, stopScroll]);

  // Detect newly added user messages and mark them for animation.
  // Uses message count to distinguish real appends from ID reconciliation:
  // - Count increased by 1 + last message is user → animate (user just sent a message)
  // - Count unchanged → ID reconciliation or message update → skip animation
  // - Count increased by 2+ → bulk load (conversation:loaded) → skip animation
  useEffect(() => {
    const prevCount = prevMessageCount.current;
    prevMessageCount.current = messages.length;

    // Animate only when exactly one message was appended and it's a user message
    if (messages.length === prevCount + 1) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'user') {
        setAnimatingMessageIds((prev) => new Set(prev).add(lastMsg.id));
        void scrollToBottom();
      }
    }
  }, [messages, scrollToBottom]);

  // Loading state - shown while agent is running.
  // Streaming cadence now comes from granular bridge chunks plus flow-token diffing.
  const isLoading = isAgentRunning;

  // Subscribe to activeTools and completedTools via a single combined selector
  // with useShallow. This bypasses the store's internal get() which can return
  // stale state in the persist(immer(...)) middleware stack — causing tool widgets
  // to not appear until completion. The useShallow wrapper uses shallow equality
  // comparison, preventing re-renders from unrelated store mutations (e.g., persist
  // rehydration) and coalescing the two subscriptions into one.
  // (Code review: verified-cycle-1-opus, issue #1)
  const { activeTools, completedTools } = useToolStore(
    useShallow((state) => ({
      activeTools: state.activeTools,
      completedTools: state.completedTools,
    }))
  );

  // Memoize tools-per-message: build a Map<messageId, ToolExecution[]> once per
  // activeTools/completedTools change, then O(1) lookup per message render.
  // Without this, deduplicateAndSortTools() runs O(messages x tools) per cycle.
  // (Code review: Opus cycle 1, issue #1; useShallow applied in verified-cycle-1-opus #1)
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

    // Merge all message IDs and deduplicate+sort per message
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

  // Precompute isLastAssistantMessage for each message in O(n) instead of O(n²).
  // Walk backwards: the last assistant message is the one with no assistant messages after it.
  const lastAssistantMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'assistant') {
        return messages[i]?.id ?? null;
      }
    }
    return null;
  }, [messages]);

  // Compute the set of assistant messages that are LAST in a consecutive group.
  // In multi-turn responses the SDK creates separate ChatMessage objects per turn,
  // producing consecutive assistant messages. Only the final one in each run should
  // render the action bar (copy/like/rewind). Older turns — separated by a user
  // message — each keep their own action bar since they're separate groups.
  const lastInAssistantGroupIds = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg?.role !== 'assistant') continue;
      // Last in group if next message is not assistant (user/undefined/end)
      if (messages[i + 1]?.role !== 'assistant') {
        ids.add(msg.id);
      }
    }
    return ids;
  }, [messages]);

  return (
    <div
      ref={mergedScrollRef}
      className="flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain"
      style={{
        scrollbarGutter: 'stable both-edges',
        contain: 'layout style',
        // Disable native scroll anchoring — use-stick-to-bottom is the sole
        // scroll controller. With overflow-anchor: auto (default), the browser
        // adjusts scrollTop on content changes, conflicting with the library's
        // spring animation and causing a visible "down then back" shift.
        overflowAnchor: 'none',
      }}
    >
      <div
        ref={contentRef}
        className="mx-auto pt-4 px-4"
        style={{ maxWidth: `var(${CHAT_WIDTH_VAR.primary}, ${String(CHAT_WIDTH.primary)}px)` }}
      >
        {messages.map((msg, index) => {
          const isLastAssistant = msg.id === lastAssistantMessageId;
          const isLastInGroup = lastInAssistantGroupIds.has(msg.id);
          const isLastMsg = index === messages.length - 1;
          const shouldAnimate = animatingMessageIds.has(msg.id);
          const tools = toolsByMessageId.get(msg.id) ?? [];

          return (
            // Index key: messages are append-only within a session. reconcileMessageId
            // changes msg.id mid-session (frontend UUID → SDK UUID); using msg.id as key
            // would cause React to unmount/remount the component, replaying the entrance
            // animation. Index keys are stable across ID reconciliation. Session switches
            // replace the entire array, correctly remounting all components.
            <div key={index} className="mb-3">
              <MessageItem
                message={msg}
                tools={tools}
                isLastAssistantMessage={isLastAssistant}
                isLastInAssistantGroup={isLastInGroup}
                isLastMessage={isLastMsg}
                isAgentRunning={isAgentRunning}
                animate={shouldAnimate}
                onRewind={onRewind}
                onOpenFile={onOpenFile}
                onOpenUrl={onOpenUrl}
                onFeedback={onFeedback}
              />
            </div>
          );
        })}

        {/* Queued message bubble - shows when user typed while agent was running */}
        {queuedMessage !== null ? (
          <QueuedMessageBubble message={queuedMessage} onCancel={onCancelQueue} />
        ) : null}

        {/* Progress indicator - shows while agent is running */}
        {isLoading ? (
          <div className="flex items-center gap-2 px-[9px] py-2">
            <ShimmerText className="font-sans text-base text-foreground">Thinking</ShimmerText>
          </div>
        ) : null}

        {/* Bottom spacer — uses margin so never included in text selection */}
        <div className="mt-44" aria-hidden="true" />
      </div>
    </div>
  );
};
