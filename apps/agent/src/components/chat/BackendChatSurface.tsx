import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ChatMessage } from '@/components/chat/messages';
import type { FC } from 'react';

import { ChatSkeleton } from '@/components/chat';
import { useQueuedMessageHandler } from '@/components/chat/queued-message';
import { ChatContent } from '@/components/layout/chat-area/ChatContent';
import { useLayoutStabilization } from '@/components/layout/chat-area/use-layout-stabilization';
import { useChatMessages } from '@/hooks/chat/use-chat-messages';
import {
  usePendingPermissions,
  useInputMode,
  useThinkingMode,
  useEffortLevel,
  useSessionUsage,
  useMaxTokens,
} from '@/stores/agent/tool-store';
import {
  useIsConversationTransitioning,
  useIsLoadingConversation,
  useUIStore,
} from '@/stores/ui/ui-store';

interface BackendChatSurfaceProps {
  readonly surface: 'agent' | 'editor';
}

const ClaudeAgentSurface: FC = () => {
  const isLoadingConversation = useIsLoadingConversation();
  const isTransitioning = useIsConversationTransitioning();
  const inputMode = useInputMode();
  const thinkingMode = useThinkingMode();
  const effortLevel = useEffortLevel();
  const allPendingPermissions = usePendingPermissions();
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
    handleEffortLevelChange,
    handleModelChange,
  } = useChatMessages();

  const { contentRef } = useLayoutStabilization({
    isTransitioning,
    messageCount: messages.length,
    setLoadingConversation: useUIStore.getState().setLoadingConversation,
    setConversationTransitioning: useUIStore.getState().setConversationTransitioning,
  });

  const addMessage = useCallback(
    (message: ChatMessage): void => {
      setMessages((prev) => [...prev, message]);
    },
    [setMessages]
  );

  const { queuedMessage: rawQueuedMessage, cancelQueue } = useQueuedMessageHandler({
    isAgentRunning,
    sessionId,
    postMessage,
    addMessage,
    setIsAgentRunning,
  });

  const queuedMessage = rawQueuedMessage?.sessionId === sessionId ? rawQueuedMessage : null;
  const pendingPermissions = useMemo(
    () => allPendingPermissions.filter((permission) => permission.sessionId === sessionId),
    [allPendingPermissions, sessionId]
  );

  const handleFeedback = useCallback((): void => {
    window.dispatchEvent(new CustomEvent('focusChatInput'));
  }, []);

  // Deferred skeleton: only show after 200ms of transitioning.
  // With VirtuosoMessageList, most chat switches complete in <100ms.
  // Showing the skeleton immediately caused a visible flash on fast transitions.
  const [showSkeleton, setShowSkeleton] = useState(false);
  useEffect(() => {
    if (!isTransitioning) {
      setShowSkeleton(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowSkeleton(true);
    }, 200);
    return (): void => {
      clearTimeout(timer);
    };
  }, [isTransitioning]);

  return (
    <div
      className="relative flex-1 flex flex-col min-w-0 overflow-hidden bg-chat-area"
      style={{ contain: 'layout style paint' }}
    >
      {showSkeleton ? (
        <div className="absolute inset-0 z-10 overflow-hidden pointer-events-none pt-4">
          <ChatSkeleton />
        </div>
      ) : null}
      <ChatContent
        contentRef={contentRef}
        isTransitioning={isTransitioning}
        isLoadingConversation={isLoadingConversation}
        messages={messages}
        isAgentRunning={isAgentRunning}
        sessionId={sessionId}
        queuedMessage={queuedMessage}
        pendingPermissions={pendingPermissions}
        inputMode={inputMode}
        thinkingMode={thinkingMode}
        effortLevel={effortLevel}
        sessionUsage={sessionUsage}
        maxTokens={maxTokens}
        onSend={handleSend}
        onStop={handleStop}
        onRewind={handleRewind}
        onOpenFile={handleOpenFile}
        onOpenUrl={handleOpenUrl}
        onCancelQueue={cancelQueue}
        onFeedback={handleFeedback}
        onModeChange={handleModeChange}
        onThinkingModeChange={handleThinkingModeChange}
        onEffortLevelChange={handleEffortLevelChange}
        onModelChange={handleModelChange}
        onPermissionApprove={handlePermissionApprove}
        onPermissionDeny={handlePermissionDeny}
      />
    </div>
  );
};

const ClaudeEditorSurface: FC = () => {
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

  const contentRef = useRef<HTMLDivElement>(null);

  const addMessage = useCallback(
    (message: ChatMessage): void => {
      setMessages((prev) => [...prev, message]);
    },
    [setMessages]
  );

  const { queuedMessage: rawQueuedMessage, cancelQueue } = useQueuedMessageHandler({
    isAgentRunning,
    sessionId,
    postMessage,
    addMessage,
    setIsAgentRunning,
  });

  const queuedMessage = rawQueuedMessage?.sessionId === sessionId ? rawQueuedMessage : null;
  const handleFeedback = useCallback((): void => {
    window.dispatchEvent(new CustomEvent('focusChatInput'));
  }, []);

  return (
    <div ref={contentRef} className="flex-1 flex flex-col min-h-0 overflow-hidden relative z-0">
      <ChatContent
        contentRef={contentRef}
        isTransitioning={false}
        isLoadingConversation={isLoadingConversation}
        messages={messages}
        isAgentRunning={isAgentRunning}
        sessionId={sessionId}
        queuedMessage={queuedMessage}
        pendingPermissions={pendingPermissions}
        inputMode={inputMode}
        thinkingMode={thinkingMode}
        effortLevel={effortLevel}
        sessionUsage={sessionUsage}
        maxTokens={maxTokens}
        onSend={handleSend}
        onStop={handleStop}
        onRewind={handleRewind}
        onOpenFile={handleOpenFile}
        onOpenUrl={handleOpenUrl}
        onCancelQueue={cancelQueue}
        onFeedback={handleFeedback}
        onModeChange={handleModeChange}
        onThinkingModeChange={handleThinkingModeChange}
        onEffortLevelChange={handleEffortLevelChange}
        onModelChange={handleModelChange}
        onPermissionApprove={handlePermissionApprove}
        onPermissionDeny={handlePermissionDeny}
      />
    </div>
  );
};

export const BackendChatSurface: FC<BackendChatSurfaceProps> = ({ surface }) => {
  if (surface === 'agent') {
    return <ClaudeAgentSurface />;
  }

  return <ClaudeEditorSurface />;
};
