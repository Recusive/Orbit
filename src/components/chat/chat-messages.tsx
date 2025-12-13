import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { ChatMessage } from '@/components/chat/message-item';
import type { PermissionRequest, ToolExecution } from '@/stores/tool-store';
import type { FC } from 'react';

import { MessageItem } from '@/components/chat/message-item';
import { PermissionModal } from '@/components/chat/permission-modal';
import { INPUT_SIZES } from '@/lib/constants';

interface ChatMessagesProps {
  readonly messages: ChatMessage[];
  readonly pendingPermissions: PermissionRequest[];
  readonly isAgentRunning: boolean;
  readonly isMockMode: boolean;
  readonly getToolsForMessage: (messageId: string) => ToolExecution[];
  readonly onRewind: (messageId: string) => void;
  readonly onOpenFile: (path: string) => void;
  readonly onOpenUrl: (url: string) => void;
  readonly onPermissionApprove: (requestId: string, always?: boolean) => void;
  readonly onPermissionDeny: (requestId: string) => void;
}

export const ChatMessages: FC<ChatMessagesProps> = ({
  messages,
  pendingPermissions,
  isAgentRunning,
  isMockMode,
  getToolsForMessage,
  onRewind,
  onOpenFile,
  onOpenUrl,
  onPermissionApprove,
  onPermissionDeny,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Check if any message is still animating
  const isAnimating = messages.some(m => m.displayedContent.length < m.content.length);

  return (
    <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarGutter: 'stable both-edges' }}>
      <div className="max-w-3xl mx-auto flex flex-col gap-y-3">
        {messages.length === 0 ? (
          /* Empty state when no messages */
          <div className="flex-1 flex items-center justify-center" style={{ minHeight: INPUT_SIZES.emptyStateMinHeight }}>
            <div className="text-center text-muted-foreground">
              <p className="text-lg mb-1">Start a conversation</p>
              <p className="text-sm">Ask Orbit to help you code</p>
              {isMockMode ? <p className="text-xs mt-2 opacity-50">(Mock mode - no VS Code connection)</p> : null}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, index) => {
              const isLastAssistantMessage = msg.role === 'assistant' &&
                messages.slice(index + 1).every(m => m.role === 'user');

              return (
                <MessageItem
                  key={msg.id}
                  message={msg}
                  tools={getToolsForMessage(msg.id)}
                  isLastAssistantMessage={isLastAssistantMessage}
                  onRewind={onRewind}
                  onOpenFile={onOpenFile}
                  onOpenUrl={onOpenUrl}
                />
              );
            })}
          </>
        )}
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
        {/* Progress indicator - shows while agent is running OR text is still animating */}
        {(isAgentRunning || isAnimating) ? (
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
