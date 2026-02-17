/**
 * EditorChatPanel - AI chat assistant panel for Editor mode
 *
 * This is a simplified version of the ChatArea component, designed to be
 * a side panel in the VS Code-style editor layout. It includes:
 * - Chat header with title and model selector
 * - Chat messages list
 * - Chat input with @ mentions
 *
 * Unlike the full ChatArea, this doesn't include:
 * - ActivityPanel (file viewer, git changes)
 * - Terminal (that's in EditorCenter)
 */
import { useCallback, useRef } from 'react';

import type { ChatMessage } from '@/components/chat/messages';
import type { FC } from 'react';

import { ChatHeader, ChatMessages, ChatInput, useQueuedMessageHandler } from '@/components/chat';
import { useChatMessages } from '@/hooks/chat/use-chat-messages';
import { cn } from '@/lib/utils/utils';
import {
  usePendingPermissions,
  useInputMode,
  useThinkingMode,
  useEffortLevel,
  useSessionUsage,
  useMaxTokens,
} from '@/stores/agent/tool-store';
import { useIsLoadingConversation } from '@/stores/ui/ui-store';

export const EditorChatPanel: FC = () => {
  const isLoadingConversation = useIsLoadingConversation();
  const inputMode = useInputMode();
  const thinkingMode = useThinkingMode();
  const effortLevel = useEffortLevel();
  const pendingPermissions = usePendingPermissions();
  const sessionUsage = useSessionUsage();
  const maxTokens = useMaxTokens();
  const {
    messages,
    isAgentRunning,
    sessionId,
    postMessage,
    setMessages,
    setIsAgentRunning,
    handleSend,
    handleStop,
    handleRewind,
    handlePermissionApprove,
    handlePermissionDeny,
    handleOpenFile,
    handleOpenUrl,
    handleModeChange,
    handleThinkingModeChange,
    handleModelChange,
    handleEffortLevelChange,
  } = useChatMessages();

  // Track content ref for layout stabilization
  const contentRef = useRef<HTMLDivElement>(null);

  // Create addMessage function for queued message handler
  const addMessage = useCallback(
    (message: ChatMessage): void => {
      setMessages((prev) => [...prev, message]);
    },
    [setMessages]
  );

  // Use queued message handler for sending messages while agent is running
  const { queuedMessage: rawQueuedMessage, cancelQueue } = useQueuedMessageHandler({
    isAgentRunning,
    sessionId,
    postMessage,
    addMessage,
    setIsAgentRunning,
  });

  // Only show queued message if it belongs to current session
  const queuedMessage = rawQueuedMessage?.sessionId === sessionId ? rawQueuedMessage : null;

  // Handle feedback click - dispatches event to focus input
  const handleFeedback = useCallback((): void => {
    window.dispatchEvent(new CustomEvent('focusChatInput'));
  }, []);

  const isEmptyState = messages.length === 0 && !isLoadingConversation;

  // Shared input props
  const inputProps = {
    inputMode,
    thinkingMode,
    effortLevel,
    isAgentRunning,
    usage: sessionUsage,
    maxTokens,
    hasPermissionPending: pendingPermissions.length > 0,
    permissions: pendingPermissions,
    onPermissionApprove: handlePermissionApprove,
    onPermissionDeny: handlePermissionDeny,
    onSend: handleSend,
    onStop: handleStop,
    onModeChange: handleModeChange,
    onThinkingModeChange: handleThinkingModeChange,
    onEffortChange: handleEffortLevelChange,
    onModelChange: handleModelChange,
  } as const;

  return (
    <div className="h-full w-full flex flex-col bg-chat-area">
      {/* Chat Header */}
      <ChatHeader hideGitControls />

      {/* Chat Content */}
      <div ref={contentRef} className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {isEmptyState ? (
          /* Empty state: Input positioned above center */
          <div className="flex-1 flex flex-col justify-center px-4" style={{ paddingBottom: 100 }}>
            <div className="text-center text-muted-foreground mb-4">
              <p className="text-base font-medium">How can I help?</p>
              <p className="text-sm mt-1">Ask me about your code or request changes</p>
            </div>
            <ChatInput {...inputProps} />
          </div>
        ) : (
          /* Normal layout: Messages + Input at bottom */
          <div className="flex-1 flex flex-col min-h-0">
            <ChatMessages
              messages={messages}
              isAgentRunning={isAgentRunning}
              sessionId={sessionId}
              queuedMessage={queuedMessage}
              onRewind={handleRewind}
              onOpenFile={handleOpenFile}
              onOpenUrl={handleOpenUrl}
              onCancelQueue={cancelQueue}
              onFeedback={handleFeedback}
            />
            <div className={cn('shrink-0', pendingPermissions.length > 0 ? 'pt-0' : 'pt-2')}>
              <ChatInput {...inputProps} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
