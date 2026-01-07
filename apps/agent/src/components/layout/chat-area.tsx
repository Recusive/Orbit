import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { ChatMessage } from '@/components/chat/messages';
import type { TerminalPanelProps } from '@/components/terminal/terminal-panel';
import type { FileEntry } from '@/types/agent/context';
import type { ExtensionMessage } from '@/types/protocol';
import type { AllotmentHandle } from 'allotment';
import type { FC } from 'react';

import { ChatHeader, ChatInput, ChatMessages, useQueuedMessageHandler } from '@/components/chat';
import { PermissionModal } from '@/components/modals';
import { ActivityPanel } from '@/components/panels';
import { ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useTauri } from '@/hooks/agent/use-tauri';
import { useChatMessages } from '@/hooks/chat/use-chat-messages';
import { CHAT_WIDTH, CHAT_WIDTH_VAR } from '@/lib/utils/constants';
import {
  useGetToolsForMessage,
  usePendingPermissions,
  useInputMode,
  useThinkingMode,
  useSessionUsage,
  useMaxTokens,
} from '@/stores/agent/tool-store';
import {
  useUIStore,
  useTerminalPosition,
  useIsLoadingConversation,
  useIsConversationTransitioning,
} from '@/stores/ui/ui-store';

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
  const {
    reviewPanelOpen,
    bottomPanelOpen,
    bottomPanelHeight,
    setBottomPanelHeight,
    setConversationTransitioning,
    setLoadingConversation,
  } = useUIStore();
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

  // Ref for terminal allotment - used to programmatically resize
  const terminalAllotmentRef = useRef<AllotmentHandle>(null);

  // Resize terminal when bottomPanelOpen changes
  useEffect(() => {
    const allotment = terminalAllotmentRef.current;
    if (!allotment) return;

    // Reset to preferred sizes - allotment will respect minSize
    allotment.reset();
  }, [bottomPanelOpen]);

  // Track terminal size when user drags - save to shared store
  const handleTerminalSizeChange = useCallback(
    (sizes: number[]): void => {
      const terminalSize = sizes[1];
      if (terminalSize !== undefined && terminalSize > 50 && bottomPanelOpen) {
        // Only save if it's a meaningful size (not collapsed)
        setBottomPanelHeight(terminalSize);
      }
    },
    [bottomPanelOpen, setBottomPanelHeight]
  );

  // Ref for content container - used for unified stabilization
  const contentRef = useRef<HTMLDivElement>(null);

  // Unified stabilization for both empty and message states
  // This ensures the entire content area (welcome OR messages) is hidden until layout is stable
  // IMPORTANT: We control BOTH isLoadingConversation and isConversationTransitioning here
  // to prevent the flash caused by state updates happening at different times.
  useLayoutEffect(() => {
    if (!isTransitioning) return undefined;

    const container = contentRef.current;
    if (!container) {
      // No container - immediately reveal (edge case, shouldn't happen)
      setLoadingConversation(false);
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
          // Reveal content atomically - both states change together
          // This prevents the flash where one state changes before the other
          setLoadingConversation(false);
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
  }, [isTransitioning, messages.length, setConversationTransitioning, setLoadingConversation]);

  // Chat content section - extracted for reuse
  const chatContent = (
    <div
      ref={contentRef}
      className={`flex-1 flex flex-col min-h-0${isTransitioning ? ' no-transitions' : ''}`}
      style={isTransitioning ? { visibility: 'hidden' } : undefined}
    >
      {/* Show welcome only when no messages and not loading */}
      {messages.length === 0 && !isLoadingConversation ? (
        /* Empty state: Input positioned above center */
        <div className="flex-1 flex flex-col justify-center" style={{ paddingBottom: '40%' }}>
          {/* Permission bar - connected to input below */}
          {pendingPermissions.length > 0 ? (
            <div className="px-4 shrink-0">
              <div
                className="mx-auto"
                style={{
                  maxWidth: `var(${CHAT_WIDTH_VAR.primary}, ${String(CHAT_WIDTH.primary)}px)`,
                }}
              >
                {pendingPermissions.map((request) => (
                  <PermissionModal
                    key={request.requestId}
                    request={request}
                    onApprove={handlePermissionApprove}
                    onDeny={handlePermissionDeny}
                  />
                ))}
              </div>
            </div>
          ) : null}
          <ChatInput
            inputMode={inputMode}
            thinkingMode={thinkingMode}
            isAgentRunning={isAgentRunning}
            fileList={fileList}
            usage={sessionUsage}
            maxTokens={maxTokens}
            hasPermissionPending={pendingPermissions.length > 0}
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
            isAgentRunning={isAgentRunning}
            sessionId={sessionId}
            queuedMessage={queuedMessage}
            getToolsForMessage={getToolsForMessage}
            onRewind={handleRewind}
            onOpenFile={handleOpenFile}
            onOpenUrl={handleOpenUrl}
            onCancelQueue={cancelQueue}
            onFeedback={handleFeedback}
          />
          {/* Permission bar - connected to input below */}
          {pendingPermissions.length > 0 ? (
            <div className="px-4 shrink-0">
              <div
                className="mx-auto"
                style={{
                  maxWidth: `var(${CHAT_WIDTH_VAR.primary}, ${String(CHAT_WIDTH.primary)}px)`,
                }}
              >
                {pendingPermissions.map((request) => (
                  <PermissionModal
                    key={request.requestId}
                    request={request}
                    onApprove={handlePermissionApprove}
                    onDeny={handlePermissionDeny}
                  />
                ))}
              </div>
            </div>
          ) : null}
          <ChatInput
            inputMode={inputMode}
            thinkingMode={thinkingMode}
            isAgentRunning={isAgentRunning}
            fileList={fileList}
            usage={sessionUsage}
            maxTokens={maxTokens}
            hasPermissionPending={pendingPermissions.length > 0}
            onSend={handleSend}
            onStop={handleStop}
            onModeChange={handleModeChange}
            onThinkingModeChange={handleThinkingModeChange}
            onModelChange={handleModelChange}
          />
        </div>
      )}
    </div>
  );

  // Helper to create main content layout with configurable ActivityPanel terminal rendering
  // We need two versions because ActivityPanel appears in both layout divs (CSS display toggle),
  // but only ONE should render the terminal to avoid duplicate xterm instances
  const createMainContent = (canActivityRenderTerminal: boolean): JSX.Element => (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      {/* Chat Section (Header + Content) */}
      <ResizablePanel preferredSize={reviewPanelOpen ? '65%' : '100%'} minSize={300}>
        <div className="flex flex-col h-full min-w-0">
          {/* Chat Header - only for chat */}
          <ChatHeader />
          {/* Chat Content */}
          {chatContent}
        </div>
      </ResizablePanel>

      {/* Activity Panel (split view) - uses visible prop to show/hide */}
      <ResizablePanel preferredSize="35%" minSize={250} maxSize={800} visible={reviewPanelOpen}>
        <ActivityPanel canRenderTerminal={canActivityRenderTerminal} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );

  // Show bottom terminal when position is 'both'
  const showBottomTerminal = terminalPosition === 'both';

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-chat-area">
      {/* Full-width terminal layout */}
      <div
        className="flex-1 flex flex-col"
        style={{ display: showBottomTerminal ? 'flex' : 'none' }}
      >
        <ResizablePanelGroup
          ref={terminalAllotmentRef}
          direction="vertical"
          className="flex-1"
          onChange={handleTerminalSizeChange}
        >
          <ResizablePanel minSize={0}>
            {/* In full-width mode, terminal is below - ActivityPanel should NOT render terminal */}
            <div className="h-full w-full">{createMainContent(false)}</div>
          </ResizablePanel>

          {/* NOTE: If changing minSize/preferredSize, also update activity-panel.tsx terminal panel */}
          <ResizablePanel preferredSize={bottomPanelOpen ? bottomPanelHeight : 35} minSize={35}>
            {/* Only render TerminalPanel when this layout is active - xterm can only attach to one container */}
            {showBottomTerminal ? (
              <TerminalPanel variant="full-width" collapsed={!bottomPanelOpen} />
            ) : null}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Activity-only layout */}
      <div className="flex-1 h-full" style={{ display: showBottomTerminal ? 'none' : 'flex' }}>
        {/* In activity mode, terminal is embedded in ActivityPanel */}
        {createMainContent(true)}
      </div>
    </div>
  );
};
