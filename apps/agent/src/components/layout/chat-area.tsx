import { useCallback, useEffect, useState } from 'react';

import type { ChatMessage } from '@/components/chat/message-item';
import type { FileEntry } from '@/types/context';
import type { ExtensionMessage } from '@/types/protocol';
import type { FC } from 'react';

import { ActivityPanel } from '@/components/activity/activity-panel';
import { ChatHeader } from '@/components/chat/chat-header';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatMessages } from '@/components/chat/chat-messages';
import { useQueuedMessageHandler } from '@/components/chat/queued-message';
import { WelcomeGreeting } from '@/components/chat/welcome-greeting';
import { ResizeHandle } from '@/components/layout/resize-handle';
import { TerminalPanel } from '@/components/terminal/terminal-panel';
import { useChatMessages } from '@/hooks/use-chat-messages';
import { useTauri } from '@/hooks/use-tauri';
import {
  useToolStore,
  usePendingPermissions,
  useInputMode,
  useThinkingMode,
  useSessionUsage,
  useMaxTokens,
} from '@/stores/tool-store';
import { useUIStore, useTerminalPosition } from '@/stores/ui-store';

export const ChatArea: FC = () => {
  const { reviewPanelOpen, bottomPanelOpen, reviewPanelWidth } = useUIStore();
  const terminalPosition = useTerminalPosition();
  const inputMode = useInputMode();
  const thinkingMode = useThinkingMode();
  const pendingPermissions = usePendingPermissions();
  const sessionUsage = useSessionUsage();
  const maxTokens = useMaxTokens();
  const { getToolsForMessage } = useToolStore();
  const [fileList, setFileList] = useState<FileEntry[]>([]);

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
  } = useChatMessages();

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

  // Handle file list response for @ mentions
  const handleFileListMessage = (message: ExtensionMessage): void => {
    if (message.type === 'file:list:response') {
      setFileList(
        message.files.map((f) => ({
          path: f.path,
          name: f.name,
          isDirectory: f.isDirectory ?? false,
        }))
      );
    }
  };

  // Subscribe to file list messages
  useTauri({ onMessage: handleFileListMessage });

  // Request file list for @ mentions on mount
  useEffect(() => {
    postMessage({
      type: 'file:list:request',
      uuid: crypto.randomUUID(),
    });
  }, [postMessage]);

  // Handle feedback click - dispatches event to focus input
  const handleFeedback = useCallback((): void => {
    window.dispatchEvent(new CustomEvent('focusChatInput'));
  }, []);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
      {/* Main horizontal area: Chat + Activity */}
      <div className="flex-1 flex min-h-0">
        {/* Chat Section (Header + Content) */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat Header - only for chat */}
          <ChatHeader />

          {/* Chat Content */}
          <div className="flex-1 flex flex-col min-h-0">
            {messages.length === 0 ? (
              /* Empty state: Welcome greeting + Input positioned above center */
              <div className="flex-1 flex flex-col justify-center" style={{ paddingBottom: '40%' }}>
                <WelcomeGreeting />
                <ChatInput
                  inputMode={inputMode}
                  thinkingMode={thinkingMode}
                  isAgentRunning={isAgentRunning}
                  fileList={fileList}
                  usage={sessionUsage}
                  maxTokens={maxTokens}
                  onSend={handleSend}
                  onStop={handleStop}
                  onModeChange={handleModeChange}
                  onThinkingModeChange={handleThinkingModeChange}
                  onModelChange={handleModelChange}
                />
              </div>
            ) : (
              /* Normal layout: Messages + Input at bottom */
              <>
                <ChatMessages
                  messages={messages}
                  pendingPermissions={pendingPermissions}
                  isAgentRunning={isAgentRunning}
                  queuedMessage={queuedMessage}
                  getToolsForMessage={getToolsForMessage}
                  onRewind={handleRewind}
                  onOpenFile={handleOpenFile}
                  onOpenUrl={handleOpenUrl}
                  onPermissionApprove={handlePermissionApprove}
                  onPermissionDeny={handlePermissionDeny}
                  onCancelQueue={cancelQueue}
                  onFeedback={handleFeedback}
                />
                <ChatInput
                  inputMode={inputMode}
                  thinkingMode={thinkingMode}
                  isAgentRunning={isAgentRunning}
                  fileList={fileList}
                  usage={sessionUsage}
                  maxTokens={maxTokens}
                  onSend={handleSend}
                  onStop={handleStop}
                  onModeChange={handleModeChange}
                  onThinkingModeChange={handleThinkingModeChange}
                  onModelChange={handleModelChange}
                />
              </>
            )}
          </div>
        </div>

        {/* Activity Panel (split view) - at same level as chat section */}
        {reviewPanelOpen ? (
          <>
            <ResizeHandle direction="vertical" target="review" />
            <ActivityPanel width={reviewPanelWidth} />
          </>
        ) : null}
      </div>

      {/* Terminal Panel - show at bottom spanning FULL width when position is 'both' */}
      {terminalPosition === 'both' ? (
        <TerminalPanel variant="full-width" collapsed={!bottomPanelOpen} />
      ) : null}
    </div>
  );
};
