import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { ChatMessage } from '@/components/chat/messages';
import type { TerminalPanelProps } from '@/components/terminal/terminal-panel';
import type { FileEntry } from '@/types/context';
import type { ExtensionMessage } from '@/types/protocol';
import type { FC } from 'react';

import { ChatHeader, ChatInput, ChatMessages, useQueuedMessageHandler } from '@/components/chat';
import { ResizeHandle } from '@/components/layout/resize-handle';
import { ActivityPanel } from '@/components/panels';
import { useChatMessages } from '@/hooks/use-chat-messages';
import { useTauri } from '@/hooks/use-tauri';
import {
  useGetToolsForMessage,
  usePendingPermissions,
  useInputMode,
  useThinkingMode,
  useSessionUsage,
  useMaxTokens,
} from '@/stores/tool-store';
import {
  useUIStore,
  useTerminalPosition,
  useIsLoadingConversation,
  useIsConversationTransitioning,
} from '@/stores/ui-store';

// Lazy load heavy components
const LazyTerminalPanel = lazy(() =>
  import('@/components/terminal/terminal-panel').then((m) => ({ default: m.TerminalPanel }))
);
const TerminalPanel: FC<TerminalPanelProps> = (props) => (
  <Suspense fallback={null}>
    <LazyTerminalPanel {...props} />
  </Suspense>
);

export const ChatArea: FC = () => {
  const { reviewPanelOpen, bottomPanelOpen, reviewPanelWidth, setConversationTransitioning } =
    useUIStore();
  const terminalPosition = useTerminalPosition();
  const isLoadingConversation = useIsLoadingConversation();
  const isTransitioning = useIsConversationTransitioning();
  const inputMode = useInputMode();
  const thinkingMode = useThinkingMode();
  const pendingPermissions = usePendingPermissions();
  const sessionUsage = useSessionUsage();
  const maxTokens = useMaxTokens();
  const getToolsForMessage = useGetToolsForMessage();
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

  // Ref for content container - used for unified stabilization
  const contentRef = useRef<HTMLDivElement>(null);

  // Unified stabilization for both empty and message states
  // This ensures the entire content area (welcome OR messages) is hidden until layout is stable
  useLayoutEffect(() => {
    if (!isTransitioning) return undefined;

    const container = contentRef.current;
    if (!container) {
      setConversationTransitioning(false);
      return undefined;
    }

    let lastHeight = 0;
    let stableCount = 0;
    let frameId: number;

    const checkStable = (): void => {
      const currentHeight = container.scrollHeight;
      if (currentHeight === lastHeight) {
        stableCount++;
        // Wait for 3 consecutive frames with same height to ensure layout is complete
        if (stableCount >= 3) {
          setConversationTransitioning(false);
          return;
        }
      } else {
        stableCount = 0;
        lastHeight = currentHeight;
      }
      frameId = requestAnimationFrame(checkStable);
    };

    frameId = requestAnimationFrame(checkStable);

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [isTransitioning, messages.length, setConversationTransitioning]);

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-chat-area">
      {/* Main horizontal area: Chat + Activity */}
      <div className="flex-1 flex min-h-0">
        {/* Chat Section (Header + Content) */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat Header - only for chat */}
          <ChatHeader />

          {/* Chat Content - unified container with parent-level visibility control */}
          <div
            ref={contentRef}
            className={`flex-1 flex flex-col min-h-0${isTransitioning ? ' no-transitions' : ''}`}
            style={isTransitioning ? { visibility: 'hidden' } : undefined}
          >
            {/* Show welcome only when no messages and not loading */}
            {messages.length === 0 && !isLoadingConversation ? (
              /* Empty state: Input positioned above center */
              <div className="flex-1 flex flex-col justify-center" style={{ paddingBottom: '40%' }}>
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
              <div className="flex-1 flex flex-col min-h-0">
                <ChatMessages
                  messages={messages}
                  pendingPermissions={pendingPermissions}
                  isAgentRunning={isAgentRunning}
                  sessionId={sessionId}
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
              </div>
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
