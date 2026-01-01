import { useVirtualizer } from '@tanstack/react-virtual';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

import { MessageItem } from './messages';
import { QueuedMessageBubble } from './queued-message';

import type { ChatMessage } from './messages';
import type { QueuedMessage } from '@/stores/queued-message-store';
import type { PermissionRequest, ToolExecution } from '@/stores/tool-store';
import type { FC } from 'react';

import { PermissionModal } from '@/components/modals';
import { CONTENT_WIDTH } from '@/lib/constants';

interface ChatMessagesProps {
  readonly messages: ChatMessage[];
  readonly pendingPermissions: PermissionRequest[];
  readonly isAgentRunning: boolean;
  readonly isTransitioning: boolean;
  readonly sessionId?: string;
  readonly queuedMessage: QueuedMessage | null;
  readonly getToolsForMessage: (messageId: string) => ToolExecution[];
  readonly onRewind: (messageId: string) => void;
  readonly onOpenFile: (path: string) => void;
  readonly onOpenUrl: (url: string) => void;
  readonly onPermissionApprove: (requestId: string, always?: boolean) => void;
  readonly onPermissionDeny: (requestId: string) => void;
  readonly onCancelQueue: () => void;
  readonly onFeedback: () => void;
}

export const ChatMessages: FC<ChatMessagesProps> = ({
  messages,
  pendingPermissions,
  isAgentRunning,
  isTransitioning,
  sessionId,
  queuedMessage,
  getToolsForMessage,
  onRewind,
  onOpenFile,
  onOpenUrl,
  onPermissionApprove,
  onPermissionDeny,
  onCancelQueue,
  onFeedback,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const prevSessionIdRef = useRef(sessionId);

  // Reset scroll position when switching conversations
  useEffect(() => {
    if (sessionId !== prevSessionIdRef.current) {
      prevSessionIdRef.current = sessionId;
      if (parentRef.current) {
        parentRef.current.scrollTop = 0;
      }
      shouldAutoScroll.current = true;
    }
  }, [sessionId]);

  // Check if any message is still animating
  const isAnimating = messages.some((m) => m.displayedContent.length < m.content.length);

  // Track last message content length for auto-scroll dependency
  const lastMessageContentLength = messages[messages.length - 1]?.displayedContent.length ?? 0;

  // Stable callbacks to prevent virtualizer recreation
  const estimateSize = useCallback(() => 200, []); // Estimate HIGH for streaming messages
  const getItemKey = useCallback((index: number) => messages[index]?.id ?? index, [messages]);

  // Virtualizer for message list
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 5,
    // Use message IDs for stable keys (not indexes)
    getItemKey,
    // Smoother resize measurements via requestAnimationFrame
    useAnimationFrameWithResizeObserver: true,
  });

  // Prevent scroll jumping when scrolling backward with dynamic sizes
  // This is a property on the instance, not an initialization option
  // See: packages/virtual-core/src/index.ts lines 373-379, 900-912
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) => {
    // Don't adjust scroll position when actively scrolling backward (up)
    // This prevents content jumping when viewing older messages while new ones stream
    if (instance.scrollDirection === 'backward') {
      return false;
    }
    // Otherwise use default behavior: adjust if item is above current scroll position
    return item.start < (instance.scrollOffset ?? 0);
  };

  // Auto-scroll to bottom when messages change or during streaming
  useEffect(() => {
    if (!shouldAutoScroll.current || !parentRef.current) return;

    const element = parentRef.current;
    const { scrollHeight, clientHeight, scrollTop } = element;
    const isNearBottom = scrollHeight - clientHeight - scrollTop < 150;

    if (isNearBottom || messages.length === 1) {
      // Note: Don't use behavior: 'smooth' with dynamic sizes (per TanStack docs)
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    }
  }, [messages.length, lastMessageContentLength, virtualizer]);

  // Track if user is manually scrolling (disable auto-scroll if scrolled up)
  useEffect(() => {
    const element = parentRef.current;
    if (!element) return;

    const handleScroll = (): void => {
      const { scrollHeight, clientHeight, scrollTop } = element;
      const isAtBottom = scrollHeight - clientHeight - scrollTop < 100;
      shouldAutoScroll.current = isAtBottom;
    };

    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      element.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto overflow-x-hidden p-4"
      style={{
        scrollbarGutter: 'stable both-edges',
        // Instant opacity change to mask content swap (no transition = no flash)
        opacity: isTransitioning ? 0 : 1,
        // CSS containment to isolate layout recalculations
        contain: 'content',
      }}
    >
      <div className="mx-auto" style={{ maxWidth: CONTENT_WIDTH.inputBox }}>
        {/* Virtualized message container */}
        <div
          style={{
            height: `${String(virtualizer.getTotalSize())}px`,
            width: '100%',
            position: 'relative',
            // Prevent content from affecting parent layout during recalc
            contain: 'strict',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const msg = messages[virtualItem.index];
            if (!msg) return null;

            const isLastAssistantMessage =
              msg.role === 'assistant' &&
              messages.slice(virtualItem.index + 1).every((m) => m.role === 'user');

            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                className="virtual-item pb-3"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${String(virtualItem.start)}px)`,
                  // GPU acceleration for smoother transitions
                  willChange: 'transform',
                  // Isolate each item's layout
                  contain: 'layout style',
                }}
              >
                <MessageItem
                  message={msg}
                  tools={getToolsForMessage(msg.id)}
                  isLastAssistantMessage={isLastAssistantMessage}
                  onRewind={onRewind}
                  onOpenFile={onOpenFile}
                  onOpenUrl={onOpenUrl}
                  onFeedback={onFeedback}
                />
              </div>
            );
          })}
        </div>

        {/* Non-virtualized footer items (always at bottom) */}
        <div className="flex flex-col gap-y-3">
          {/* Permission modals */}
          {pendingPermissions.map((request) => (
            <PermissionModal
              key={request.requestId}
              request={request}
              onApprove={onPermissionApprove}
              onDeny={onPermissionDeny}
              onOpenFile={onOpenFile}
            />
          ))}
          {/* Queued message bubble - shows when user typed while agent was running */}
          {queuedMessage !== null ? (
            <QueuedMessageBubble message={queuedMessage} onCancel={onCancelQueue} />
          ) : null}
          {/* Progress indicator - shows while agent is running OR text is still animating */}
          {isAgentRunning || isAnimating ? (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Generating...</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
