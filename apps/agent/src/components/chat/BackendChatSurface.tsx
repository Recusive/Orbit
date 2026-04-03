import { useCallback, useMemo, useRef } from 'react';

import type { ChatMessage } from '@/components/chat/messages';
import type { FC } from 'react';

import { useQueuedMessageHandler } from '@/components/chat/queued-message';
import { ChatContent } from '@/components/layout/chat-area/ChatContent';
import { useChatMessages } from '@/hooks/chat/use-chat-messages';
import {
  usePendingPermissions,
  useInputMode,
  useThinkingMode,
  useEffortLevel,
} from '@/stores/agent/tool-store';
import { useIsLoadingConversation } from '@/stores/ui/ui-store';

interface BackendChatSurfaceProps {
  readonly surface: 'agent' | 'editor';
}

const ClaudeAgentSurface: FC = () => {
  const isLoadingConversation = useIsLoadingConversation();
  const inputMode = useInputMode();
  const thinkingMode = useThinkingMode();
  const effortLevel = useEffortLevel();
  const allPendingPermissions = usePendingPermissions();
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
  const pendingPermissions = useMemo(
    () => allPendingPermissions.filter((permission) => permission.sessionId === sessionId),
    [allPendingPermissions, sessionId]
  );

  const handleFeedback = useCallback((): void => {
    window.dispatchEvent(new CustomEvent('focusChatInput'));
  }, []);

  return (
    <div
      className="relative flex-1 flex flex-col min-w-0 overflow-hidden bg-chat-area"
      style={{ contain: 'layout style paint' }}
    >
      <ChatContent
        contentRef={contentRef}
        isLoadingConversation={isLoadingConversation}
        messages={messages}
        isAgentRunning={isAgentRunning}
        sessionId={sessionId}
        queuedMessage={queuedMessage}
        pendingPermissions={pendingPermissions}
        inputMode={inputMode}
        thinkingMode={thinkingMode}
        effortLevel={effortLevel}
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
        isLoadingConversation={isLoadingConversation}
        messages={messages}
        isAgentRunning={isAgentRunning}
        sessionId={sessionId}
        queuedMessage={queuedMessage}
        pendingPermissions={pendingPermissions}
        inputMode={inputMode}
        thinkingMode={thinkingMode}
        effortLevel={effortLevel}
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
