import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const prevSessionIdRef = useRef(sessionId);
  const hasResetScrollRef = useRef(false);

  // Check if any message is still animating
  const isAnimating = messages.some((m) => m.displayedContent.length < m.content.length);

  // Track last message content length for auto-scroll dependency
  const lastMessageContentLength = messages[messages.length - 1]?.displayedContent.length ?? 0;

  // Auto-scroll to bottom during streaming
  useEffect(() => {
    if (!shouldAutoScroll.current || !containerRef.current) return;
    const el = containerRef.current;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, lastMessageContentLength]);

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

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto overflow-x-hidden p-4"
      style={{ scrollbarGutter: 'stable both-edges' }}
    >
      <div
        className="mx-auto flex flex-col gap-3"
        style={{ maxWidth: `var(${CHAT_WIDTH_VAR.primary}, ${String(CHAT_WIDTH.primary)}px)` }}
      >
        {/* All messages rendered directly - no virtualization needed for chat */}
        {messages.map((msg, index) => {
          const isLastAssistantMessage =
            msg.role === 'assistant' && messages.slice(index + 1).every((m) => m.role === 'user');

          return (
            <MessageItem
              key={msg.id}
              message={msg}
              tools={getToolsForMessage(msg.id)}
              isLastAssistantMessage={isLastAssistantMessage}
              onRewind={onRewind}
              onOpenFile={onOpenFile}
              onOpenUrl={onOpenUrl}
              onFeedback={onFeedback}
            />
          );
        })}

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
  );
};
