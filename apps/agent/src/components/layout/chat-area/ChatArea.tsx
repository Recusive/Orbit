/**
 * ChatArea - Main chat interface orchestrator
 *
 * Renders the chat content area. Terminal is no longer embedded here —
 * it renders as its own independent TerminalCard at the App.tsx level
 * in all three positions (chat, activity, both).
 *
 * NOTE: Chat container widths come from @/lib/utils/constants.
 * To change chat max-width or CSS variable names,
 * update CHAT_WIDTH and CHAT_WIDTH_VAR in constants.ts - DO NOT hardcode here.
 */
import { useCallback, useEffect, useMemo } from 'react';

import { ChatContent } from './ChatContent';
import { useLayoutStabilization } from './use-layout-stabilization';

import type { ChatMessage } from '@/components/chat/messages';
import type { InputMode } from '@/types/protocol';
import type { FC } from 'react';

import { useQueuedMessageHandler } from '@/components/chat';
import { ThinkingDots } from '@/components/ui/thinking-dots';
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
  useUIStore,
  useIsLoadingConversation,
  useIsConversationTransitioning,
} from '@/stores/ui/ui-store';

export const ChatArea: FC = () => {
  // ============================================
  // Isolated Selectors (Minimal Subscriptions)
  // ============================================
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

  // Layout stabilization hook
  // PERF: Get actions via getState() to avoid subscription overhead
  const { contentRef } = useLayoutStabilization({
    isTransitioning,
    messageCount: messages.length,
    setLoadingConversation: useUIStore.getState().setLoadingConversation,
    setConversationTransitioning: useUIStore.getState().setConversationTransitioning,
  });

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

  // Only show permission requests for the active session — prevents permission
  // modals from leaking across sessions when the user switches conversations.
  const pendingPermissions = useMemo(
    () => allPendingPermissions.filter((p) => p.sessionId === sessionId),
    [allPendingPermissions, sessionId]
  );

  // Handle feedback click - dispatches event to focus input
  const handleFeedback = useCallback((): void => {
    window.dispatchEvent(new CustomEvent('focusChatInput'));
  }, []);

  // Listen for cycleInputMode keyboard shortcut (Shift+Tab)
  useEffect(() => {
    const handleCycleInputMode = (): void => {
      const nextMode: InputMode =
        inputMode === 'default' ? 'plan' : inputMode === 'plan' ? 'accept' : 'default';
      handleModeChange(nextMode);
    };
    window.addEventListener('cycleInputMode', handleCycleInputMode);
    return (): void => {
      window.removeEventListener('cycleInputMode', handleCycleInputMode);
    };
  }, [inputMode, handleModeChange]);

  return (
    <div
      className="relative flex-1 flex flex-col min-w-0 overflow-hidden bg-chat-area"
      style={{ contain: 'layout style paint' }}
    >
      {/* Conversation transition loader - centered dots while content swaps */}
      {isTransitioning ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <ThinkingDots size={18} speed={1.2} />
        </div>
      ) : null}

      {/* Chat content — no terminal split, terminal is a separate card at App.tsx level */}
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
