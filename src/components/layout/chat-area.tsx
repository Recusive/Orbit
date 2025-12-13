import { useEffect, useState } from 'react';

import type { FileEntry } from '@/types/context';
import type { ExtensionMessage } from '@/types/protocol';
import type { FC } from 'react';

import { ActivityPanel } from '@/components/activity/activity-panel';
import { ChatHeader } from '@/components/chat/chat-header';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatMessages } from '@/components/chat/chat-messages';
import { WelcomeGreeting } from '@/components/chat/welcome-greeting';
import { ResizeHandle } from '@/components/layout/resize-handle';
import { TerminalPanel } from '@/components/terminal/terminal-panel';
import { useChatMessages } from '@/hooks/use-chat-messages';
import { useVSCode } from '@/hooks/use-vscode';
import { useToolStore, usePendingPermissions, useInputMode } from '@/stores/tool-store';
import { useUIStore, useTerminalPosition } from '@/stores/ui-store';

export const ChatArea: FC = () => {
  const { reviewPanelOpen, bottomPanelOpen, reviewPanelWidth } = useUIStore();
  const terminalPosition = useTerminalPosition();
  const inputMode = useInputMode();
  const pendingPermissions = usePendingPermissions();
  const { getToolsForMessage } = useToolStore();
  const [fileList, setFileList] = useState<FileEntry[]>([]);

  const {
    messages,
    isAgentRunning,
    postMessage,
    handleSend,
    handleRewind,
    handlePermissionApprove,
    handlePermissionDeny,
    handleOpenFile,
    handleOpenUrl,
    handleModeChange,
  } = useChatMessages();

  // Handle file list response for @ mentions
  const handleFileListMessage = (message: ExtensionMessage): void => {
    if (message.type === 'file:list:response') {
      setFileList(message.files.map((f) => ({
        path: f.path,
        name: f.name,
        isDirectory: f.isDirectory ?? false,
      })));
    }
  };

  // Subscribe to file list messages
  useVSCode({ onMessage: handleFileListMessage });

  // Request file list for @ mentions on mount
  useEffect(() => {
    postMessage({
      type: 'file:list:request',
      uuid: crypto.randomUUID(),
    });
  }, [postMessage]);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background">
      {/* Shared Header */}
      <ChatHeader />

      {/* Content Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Top area: Chat + Activity side by side */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Chat Area */}
          <div className="flex-1 flex flex-col min-w-0">
            {messages.length === 0 ? (
              /* Empty state: Welcome greeting + Input positioned above center */
              <div className="flex-1 flex flex-col justify-center" style={{ paddingBottom: '40%' }}>
                <WelcomeGreeting />
                <ChatInput
                  inputMode={inputMode}
                  isAgentRunning={isAgentRunning}
                  fileList={fileList}
                  onSend={handleSend}
                  onModeChange={handleModeChange}
                />
              </div>
            ) : (
              /* Normal layout: Messages + Input at bottom */
              <>
                <ChatMessages
                  messages={messages}
                  pendingPermissions={pendingPermissions}
                  isAgentRunning={isAgentRunning}
                  getToolsForMessage={getToolsForMessage}
                  onRewind={handleRewind}
                  onOpenFile={handleOpenFile}
                  onOpenUrl={handleOpenUrl}
                  onPermissionApprove={handlePermissionApprove}
                  onPermissionDeny={handlePermissionDeny}
                />
                <ChatInput
                  inputMode={inputMode}
                  isAgentRunning={isAgentRunning}
                  fileList={fileList}
                  onSend={handleSend}
                  onModeChange={handleModeChange}
                />
              </>
            )}
          </div>

          {/* Activity Panel (split view) */}
          {reviewPanelOpen ? (
            <>
              <ResizeHandle direction="vertical" target="review" />
              <ActivityPanel width={reviewPanelWidth} />
            </>
          ) : null}
        </div>

        {/* Terminal Panel - show at bottom when position is 'both' */}
        {terminalPosition === 'both' ? (
          <TerminalPanel variant="full-width" collapsed={!bottomPanelOpen} />
        ) : null}
      </div>
    </div>
  );
};
