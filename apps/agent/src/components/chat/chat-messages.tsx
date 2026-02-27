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

import { HyperText } from '@/components/ui/hyper-text';
import { ThinkingDots } from '@/components/ui/thinking-dots';
import { useSmoothScroll } from '@/hooks/ui';
import { CHAT_WIDTH, CHAT_WIDTH_VAR } from '@/lib/utils';
import { deduplicateAndSortTools, useRunningTool, useToolStore } from '@/stores/agent/tool-store';

// Rotating loading messages - fun tech-themed phrases (fallback when no tool is running)
const LOADING_MESSAGES = [
  'Thinking',
  'Generating',
  'Computing',
  'Brewing code',
  'Crunching bits',
  'Parsing thoughts',
  'Compiling ideas',
  'Downloading wisdom',
  'Summoning bytes',
  'Consulting the cloud',
  'Reticulating splines',
  'Feeding the hamsters',
  'Warming up GPUs',
  'Juggling tensors',
  'Wrangling tokens',
] as const;

/** Max characters for file name in loading status (prevents UI overflow) */
const MAX_FILENAME_LENGTH = 20;

/**
 * Truncate a file name if it exceeds max length.
 * Preserves extension when possible (e.g., "very-long-na...tsx")
 */
function truncateFileName(fileName: string): string {
  if (fileName.length <= MAX_FILENAME_LENGTH) {
    return fileName;
  }

  // Try to preserve extension
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot > 0 && fileName.length - lastDot <= 5) {
    // Has extension of 5 chars or less (e.g., .tsx, .json)
    const ext = fileName.slice(lastDot);
    const nameWithoutExt = fileName.slice(0, lastDot);
    const maxNameLength = MAX_FILENAME_LENGTH - ext.length - 3; // 3 for "..."
    if (maxNameLength > 3) {
      return `${nameWithoutExt.slice(0, maxNameLength)}...${ext}`;
    }
  }

  // No extension or too long - just truncate
  return `${fileName.slice(0, MAX_FILENAME_LENGTH - 3)}...`;
}

/**
 * Extract and truncate file name from a path.
 * Handles both Unix (/) and Windows (\) path separators.
 * Returns 'file' if path is empty or invalid.
 * (Code review: Codex cycle 2 #4)
 */
function getFileName(filePath: string): string {
  // Split on both forward and back slashes to handle Unix and Windows paths
  const parts = filePath.split(/[/\\]/);
  const raw = parts.pop();
  const fileName = raw !== undefined && raw.length > 0 ? raw : 'file';
  return truncateFileName(fileName);
}

/**
 * Maps tool names to user-friendly status messages.
 * Shows contextual info based on what the agent is actually doing.
 */
function getToolStatusMessage(toolName: string, toolInput: Record<string, unknown>): string {
  const filePath = toolInput['file_path'];

  switch (toolName.toLowerCase()) {
    case 'bash':
      return 'Running command';
    case 'read':
      if (typeof filePath === 'string') {
        return `Reading ${getFileName(filePath)}`;
      }
      return 'Reading file';
    case 'write':
      if (typeof filePath === 'string') {
        return `Writing ${getFileName(filePath)}`;
      }
      return 'Writing file';
    case 'edit':
      if (typeof filePath === 'string') {
        return `Editing ${getFileName(filePath)}`;
      }
      return 'Editing file';
    case 'glob':
      return 'Searching files';
    case 'grep':
      return 'Searching code';
    case 'task':
      return 'Running subagent';
    case 'todowrite':
      return 'Updating tasks';
    case 'webfetch':
      return 'Fetching URL';
    case 'websearch':
      return 'Searching web';
    case 'lsp':
      return 'Analyzing code';
    case 'notebookedit':
      return 'Editing notebook';
    default:
      // Capitalize first letter of tool name
      return `Running ${toolName}`;
  }
}

function useRotatingMessage(isActive: boolean, intervalMs = 2500): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, intervalMs);

    return () => {
      clearInterval(interval);
    };
  }, [isActive, intervalMs]);

  return LOADING_MESSAGES[index] ?? 'Thinking';
}

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
  // Track ALL known message IDs to detect truly new messages (code review: Codex #1)
  // This prevents historical messages from animating during conversation:loaded
  const knownMessageIds = useRef<Set<string>>(new Set());

  // CONSOLIDATED: Handle session changes in one place (code review: Codex cycle 2 #1)
  // This ensures scroll reset and animation clearing happen atomically
  useEffect(() => {
    // Capture previous value BEFORE any mutation
    const prevSessionId = prevSessionIdRef.current;

    // Skip initial mount (no actual session change)
    if (prevSessionId === sessionId) return;

    // Session changed - clear animation state
    setAnimatingMessageIds(new Set());
    knownMessageIds.current.clear();

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

  // Detect newly added user messages and mark them for animation
  // CRITICAL: We track by message ID, not array length. This prevents:
  // - Historical messages animating on conversation:loaded (bulk load)
  // - Messages animating on session switch (different conversation with more messages)
  useEffect(() => {
    // Find messages that are truly new (not in knownMessageIds)
    const newUserMessages: string[] = [];
    for (const msg of messages) {
      if (!knownMessageIds.current.has(msg.id)) {
        // Track this ID as known
        knownMessageIds.current.add(msg.id);
        // Only animate user messages (not assistant responses)
        if (msg.role === 'user') {
          newUserMessages.push(msg.id);
        }
      }
    }

    // Only animate if EXACTLY ONE new user message was added
    // This filters out bulk loads (conversation:loaded adds many messages at once)
    if (newUserMessages.length === 1 && newUserMessages[0] !== undefined) {
      const newId = newUserMessages[0];
      setAnimatingMessageIds((prev) => new Set(prev).add(newId));
      // Scroll to bottom when user sends a new message
      void scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  // Loading state - shown while agent is running
  // Note: Animation interval was removed for performance. Streaming effect is now
  // achieved through backend batching (50ms) + Streamdown's incremental markdown rendering.
  const isLoading = isAgentRunning;

  // Get currently running tool from store for contextual status
  // (Uses dedicated selector for better encapsulation - code review cycle 2, issue #1)
  const runningTool = useRunningTool();

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

  // Rotating loading message for a bit of personality (fallback)
  const rotatingMessage = useRotatingMessage(isLoading);

  // Show tool-specific message when a tool is running, otherwise rotate
  const loadingMessage = runningTool
    ? getToolStatusMessage(runningTool.toolName, runningTool.toolInput)
    : rotatingMessage;

  // Track active animation cleanup timeouts per message ID (code review: Opus #3)
  // Using individual timeouts prevents rapid messages from clearing each other's animations
  const animationTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Clear animation IDs after animation completes (250ms duration + small buffer)
  // Each message gets its own timeout for reliable cleanup during rapid sends
  useEffect(() => {
    // Get current animating IDs that don't have a timeout yet
    for (const messageId of animatingMessageIds) {
      if (!animationTimeouts.current.has(messageId)) {
        const timeoutId = setTimeout(() => {
          setAnimatingMessageIds((prev) => {
            const next = new Set(prev);
            next.delete(messageId);
            return next;
          });
          animationTimeouts.current.delete(messageId);
        }, 300); // 250ms animation + 50ms buffer
        animationTimeouts.current.set(messageId, timeoutId);
      }
    }
  }, [animatingMessageIds]);

  // Cleanup all timeouts on unmount
  useEffect(() => {
    // Capture ref value for cleanup (React hooks/exhaustive-deps rule)
    const timeouts = animationTimeouts.current;
    return () => {
      for (const timeoutId of timeouts.values()) {
        clearTimeout(timeoutId);
      }
      timeouts.clear();
    };
  }, []);

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
        {messages.map((msg) => {
          const isLastAssistant = msg.id === lastAssistantMessageId;
          const isLastInGroup = lastInAssistantGroupIds.has(msg.id);
          const isLastMsg = msg.id === messages[messages.length - 1]?.id;
          const shouldAnimate = animatingMessageIds.has(msg.id);
          const tools = toolsByMessageId.get(msg.id) ?? [];

          return (
            <div key={msg.id} className="mb-3">
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
          <div className="flex items-center gap-2 px-3 py-2">
            <ThinkingDots size={13} speed={1.2} />
            <HyperText
              key={loadingMessage}
              className="font-mono text-sm text-muted-foreground"
              duration={1200}
              loop
              loopPause={800}
            >
              {loadingMessage}
            </HyperText>
          </div>
        ) : null}

        {/* Bottom spacer — uses margin so never included in text selection */}
        <div className="mt-44" aria-hidden="true" />
      </div>
    </div>
  );
};
