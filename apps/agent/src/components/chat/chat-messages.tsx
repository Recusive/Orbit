/**
 * ChatMessages - Message list with auto-scroll behavior
 *
 * NOTE: Chat container widths come from @/lib/utils/constants.
 * To change chat max-width, update CHAT_WIDTH and CHAT_WIDTH_VAR in constants.ts.
 */
import { useEffect, useRef, useState } from 'react';

import { MessageItem } from './messages';
import { QueuedMessageBubble } from './queued-message';

import type { ChatMessage } from './messages';
import type { ToolExecution } from '@/stores/agent/tool-store';
import type { QueuedMessage } from '@/stores/chat/queued-message-store';
import type { FC } from 'react';

import { TextShimmer } from '@/components/ui/text-shimmer';
import { ThinkingDots } from '@/components/ui/thinking-dots';
import { CHAT_WIDTH, CHAT_WIDTH_VAR } from '@/lib/utils';

// Rotating loading messages - fun tech-themed phrases
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
  readonly getToolsForMessage: (messageId: string) => ToolExecution[];
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
  getToolsForMessage,
  onRewind,
  onOpenFile,
  onOpenUrl,
  onCancelQueue,
  onFeedback,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const prevSessionIdRef = useRef(sessionId);
  const hasResetScrollRef = useRef(false);

  // Track message IDs that should animate (newly sent user messages)
  // We use a Set to track IDs that need animation, cleared after first render
  const animatingMessageIds = useRef<Set<string>>(new Set());
  const prevMessageCountRef = useRef(messages.length);

  // Detect newly added user messages and mark them for animation
  // Only animates messages added since last render (not on initial load)
  if (messages.length > prevMessageCountRef.current) {
    // Check new messages (messages added since last render)
    for (let i = prevMessageCountRef.current; i < messages.length; i++) {
      const msg = messages[i];
      // Only animate user messages (not assistant responses)
      if (msg?.role === 'user') {
        animatingMessageIds.current.add(msg.id);
      }
    }
  }
  prevMessageCountRef.current = messages.length;

  // Clear animation state on session change (switching conversations)
  if (sessionId !== prevSessionIdRef.current) {
    animatingMessageIds.current.clear();
  }

  // Loading state - shown while agent is running
  // Note: Animation interval was removed for performance. Streaming effect is now
  // achieved through backend batching (50ms) + Streamdown's incremental markdown rendering.
  const isLoading = isAgentRunning;

  // Rotating loading message for a bit of personality
  const loadingMessage = useRotatingMessage(isLoading);

  // Track last message content length for scroll dependency
  const lastMessageContentLength = messages[messages.length - 1]?.displayedContent.length ?? 0;

  // Auto-scroll to bottom when new content arrives during streaming
  useEffect(() => {
    if (!shouldAutoScroll.current || !containerRef.current) return;
    const el = containerRef.current;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, lastMessageContentLength]);

  // Clear animation IDs after animation completes (250ms duration + small buffer)
  // This ensures each message only animates once when first added
  useEffect(() => {
    if (animatingMessageIds.current.size === 0) return;

    const timeoutId = setTimeout(() => {
      animatingMessageIds.current.clear();
    }, 300); // 250ms animation + 50ms buffer

    return () => {
      clearTimeout(timeoutId);
    };
  }, [messages.length]);

  // Track manual scrolling - disable auto-scroll if user scrolls up
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = (): void => {
      const { scrollHeight, clientHeight, scrollTop } = el;
      const isNearBottom = scrollHeight - clientHeight - scrollTop < 100;
      shouldAutoScroll.current = isNearBottom;
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Detect session change and reset scroll position
  const sessionChanged = prevSessionIdRef.current !== sessionId;
  if (sessionChanged) {
    prevSessionIdRef.current = sessionId;
    hasResetScrollRef.current = false;
  }

  // Reset scroll to top on session change
  useEffect(() => {
    if (sessionChanged && containerRef.current && !hasResetScrollRef.current) {
      shouldAutoScroll.current = true;
      containerRef.current.scrollTop = 0;
      hasResetScrollRef.current = true;
    }
  }, [sessionChanged]);

  // ResizeObserver to keep user at bottom when layout changes
  // Simplified approach: ANY resize + auto-scroll enabled = scroll to bottom
  // This handles all cases: tool expand/collapse, permission modals, message actions appearing, etc.
  useEffect(() => {
    const content = contentRef.current;
    const container = containerRef.current;
    if (!content || !container) return;

    let scrollTimeoutId: ReturnType<typeof setTimeout> | null = null;

    // Debounced smooth scroll - waits for resize events to settle before scrolling
    // This prevents jarring jumps during Framer Motion animations
    const scheduleScroll = (): void => {
      // Skip if auto-scroll is disabled (user scrolled up)
      if (!shouldAutoScroll.current) return;

      // Clear any pending scroll
      if (scrollTimeoutId !== null) {
        clearTimeout(scrollTimeoutId);
      }

      // Wait for animations to settle, then perform a single smooth scroll
      scrollTimeoutId = setTimeout(() => {
        // Double-check auto-scroll is still enabled
        if (shouldAutoScroll.current) {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth',
          });
        }
        scrollTimeoutId = null;
      }, 50); // Short debounce - smooth scroll handles the animation
    };

    // Watch content for ANY size changes (expand, collapse, actions appearing, etc.)
    const contentObserver = new ResizeObserver(() => {
      scheduleScroll();
    });

    // Watch container for size changes (PermissionBar appearing/disappearing)
    const containerObserver = new ResizeObserver(() => {
      scheduleScroll();
    });

    contentObserver.observe(content);
    containerObserver.observe(container);

    return () => {
      if (scrollTimeoutId !== null) {
        clearTimeout(scrollTimeoutId);
      }
      contentObserver.disconnect();
      containerObserver.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto overflow-x-hidden p-4"
      style={{ scrollbarGutter: 'stable both-edges' }}
    >
      <div
        ref={contentRef}
        className="mx-auto flex flex-col gap-3"
        style={{ maxWidth: `var(${CHAT_WIDTH_VAR.primary}, ${String(CHAT_WIDTH.primary)}px)` }}
      >
        {/* All messages rendered directly - no virtualization needed for chat */}
        {messages.map((msg, index) => {
          const isLastAssistantMessage =
            msg.role === 'assistant' && messages.slice(index + 1).every((m) => m.role === 'user');

          // Check if this message should animate (newly sent user message)
          const shouldAnimate = animatingMessageIds.current.has(msg.id);

          return (
            <MessageItem
              key={msg.id}
              message={msg}
              tools={getToolsForMessage(msg.id)}
              isLastAssistantMessage={isLastAssistantMessage}
              animate={shouldAnimate}
              onRewind={onRewind}
              onOpenFile={onOpenFile}
              onOpenUrl={onOpenUrl}
              onFeedback={onFeedback}
            />
          );
        })}

        {/* Queued message bubble - shows when user typed while agent was running */}
        {queuedMessage !== null ? (
          <QueuedMessageBubble message={queuedMessage} onCancel={onCancelQueue} />
        ) : null}

        {/* Progress indicator - shows while agent is running OR text is still animating */}
        {isLoading ? (
          <div className="flex items-center gap-2 px-3 py-2">
            <ThinkingDots size={20} duration={1.2} />
            <TextShimmer className="font-mono text-base" duration={1.2}>
              {loadingMessage}
            </TextShimmer>
          </div>
        ) : null}
      </div>
    </div>
  );
};
