/**
 * EditorChatPanel - AI chat assistant panel for Editor mode
 *
 * Self-contained chat unit: ContentTopBar + gradient + chat content.
 * In editor mode the chat moves from ContentCard to ActivityCard,
 * and this component carries the full chat UI (header included) with it.
 */
import { useCallback, useRef } from 'react';

import type { ChatMessage } from '@/components/chat/messages';
import type { FC } from 'react';

import { ChatMessages, ChatInput, TodoBar, useQueuedMessageHandler } from '@/components/chat';
import { ContentTopBar } from '@/components/layout/content-top-bar';
import { useChatMessages } from '@/hooks/chat/use-chat-messages';
import { SIDEBAR } from '@/lib/utils/constants';
import {
  usePendingPermissions,
  useInputMode,
  useThinkingMode,
  useEffortLevel,
  useSessionUsage,
  useMaxTokens,
} from '@/stores/agent/tool-store';
import { useLeftSidebarWidth, useIsLoadingConversation } from '@/stores/ui/ui-store';

export const EditorChatPanel: FC = () => {
  const isLoadingConversation = useIsLoadingConversation();
  const inputMode = useInputMode();
  const thinkingMode = useThinkingMode();
  const effortLevel = useEffortLevel();
  const pendingPermissions = usePendingPermissions();
  const sessionUsage = useSessionUsage();
  const maxTokens = useMaxTokens();
  const leftSidebarWidth = useLeftSidebarWidth();
  const sidebarOpen = leftSidebarWidth > SIDEBAR.collapsed;
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
    <div className="h-full w-full flex flex-col">
      {/* Header — same ContentTopBar from the agent page, relocated with the chat */}
      <ContentTopBar sidebarOpen={sidebarOpen} transparent={false} className="relative z-10" />

      {/* Chat content — relative container with gradient fade below header */}
      <div ref={contentRef} className="flex-1 flex flex-col min-h-0 overflow-hidden relative z-0">
        <div
          className="absolute inset-x-0 top-0 h-8 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, var(--card), transparent)' }}
          aria-hidden="true"
        />

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
            <TodoBar />
            <ChatInput {...inputProps} />
          </div>
        )}
      </div>
    </div>
  );
};
