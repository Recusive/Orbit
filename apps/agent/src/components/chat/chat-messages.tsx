import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { MessageItem } from './messages';
import { QueuedMessageBubble } from './queued-message';

import type { ChatMessage } from './messages';
import type { QueuedMessage } from '@/stores/queued-message-store';
import type { PermissionRequest, ToolExecution } from '@/stores/tool-store';
import type { FC } from 'react';

import { PermissionModal } from '@/components/modals';

interface ChatMessagesProps {
  readonly messages: ChatMessage[];
  readonly pendingPermissions: PermissionRequest[];
  readonly isAgentRunning: boolean;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Check if any message is still animating
  const isAnimating = messages.some((m) => m.displayedContent.length < m.content.length);

  return (
    <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarGutter: 'stable both-edges' }}>
      <div className="max-w-3xl mx-auto flex flex-col gap-y-3">
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
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};
