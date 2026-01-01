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
import { CHAT_WIDTH, CHAT_WIDTH_VAR } from '@/lib/constants';

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
  const estimateSize = useCallback(() => 150, []); // Closer to typical message height
  const getItemKey = useCallback((index: number) => messages[index]?.id ?? index, [messages]);

  // Virtualizer for message list
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    // Higher overscan for smoother fast scrolling (renders more items off-screen)
    overscan: 10,
    // Use message IDs for stable keys (not indexes)
    getItemKey,
    // Smoother resize measurements via requestAnimationFrame
    useAnimationFrameWithResizeObserver: true,
    // NOTE: Do NOT use `gap` option - it doesn't work with dynamic heights (GitHub #793)
  });

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

  // Force virtualizer to re-measure on window resize
  // This fixes layout issues when text wrapping changes at different widths
  useEffect(() => {
    const handleResize = (): void => {
      virtualizer.measure();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [virtualizer]);

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto overflow-x-hidden p-4"
      style={{
        scrollbarGutter: 'stable both-edges',
        // Fast opacity transition to mask content swap during conversation switch
        opacity: isTransitioning ? 0 : 1,
        transition: 'opacity 50ms ease-out',
      }}
    >
      <div
        className="mx-auto"
        style={{ maxWidth: `var(${CHAT_WIDTH_VAR.primary}, ${String(CHAT_WIDTH.primary)}px)` }}
      >
        {/* Virtualized message container */}
        <div
          style={{
            height: `${String(virtualizer.getTotalSize())}px`,
            width: '100%',
            position: 'relative',
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
                className="virtual-item"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${String(virtualItem.start)}px)`,
                  paddingBottom: 12, // Explicit 12px gap - included in getBoundingClientRect measurement
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
