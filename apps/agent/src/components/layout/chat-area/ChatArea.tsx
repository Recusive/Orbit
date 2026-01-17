/**
 * ChatArea - Main chat interface orchestrator
 *
 * Manages layout modes:
 * - Full-width terminal (bottom) + ActivityPanel without terminal
 * - ActivityPanel with embedded terminal
 *
 * NOTE: Chat container widths come from @/lib/utils/constants.
 * To change chat max-width or CSS variable names,
 * update CHAT_WIDTH and CHAT_WIDTH_VAR in constants.ts - DO NOT hardcode here.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { ChatContent } from './ChatContent';
import { useLayoutStabilization } from './use-layout-stabilization';

import type { ChatMessage } from '@/components/chat/messages';
import type { TerminalPanelProps } from '@/components/terminal/terminal-panel';
import type { FileEntry } from '@/types/agent/context';
import type { ExtensionMessage } from '@/types/protocol';
import type { AllotmentHandle } from 'allotment';
import type { FC } from 'react';

import { ChatHeader, useQueuedMessageHandler } from '@/components/chat';
import { ActivityPanel } from '@/components/panels';
import { ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useTauri } from '@/hooks/agent/use-tauri';
import { useChatMessages } from '@/hooks/chat/use-chat-messages';
import { TERMINAL_PANEL, ACTIVITY_PANEL, CHAT_PANEL } from '@/lib/utils';
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
  useReviewPanelOpen,
  useBottomPanelOpen,
  useBottomPanelHeight,
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
  // ============================================
  // Isolated Selectors (Minimal Subscriptions)
  // ============================================
  // Each selector creates an independent subscription. Changes to one value
  // don't trigger re-renders for components subscribed to other values.
  const reviewPanelOpen = useReviewPanelOpen();
  const bottomPanelOpen = useBottomPanelOpen();
  const bottomPanelHeight = useBottomPanelHeight();
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
  // PERF: Use getState() inside callback to avoid subscription to action
  const handleTerminalSizeChange = useCallback(
    (sizes: number[]): void => {
      const terminalSize = sizes[1];
      if (
        terminalSize !== undefined &&
        terminalSize > TERMINAL_PANEL.DRAG_THRESHOLD &&
        bottomPanelOpen
      ) {
        // Only save if it's a meaningful size (not collapsed)
        useUIStore.getState().setBottomPanelHeight(terminalSize);
      }
    },
    [bottomPanelOpen]
  );

  // Chat content section - shared between layout modes
  const chatContent = (
    <ChatContent
      contentRef={contentRef}
      isTransitioning={isTransitioning}
      isLoadingConversation={isLoadingConversation}
      messages={messages}
      isAgentRunning={isAgentRunning}
      sessionId={sessionId}
      queuedMessage={queuedMessage}
      pendingPermissions={pendingPermissions}
      fileList={fileList}
      inputMode={inputMode}
      thinkingMode={thinkingMode}
      sessionUsage={sessionUsage}
      maxTokens={maxTokens}
      getToolsForMessage={getToolsForMessage}
      onSend={handleSend}
      onStop={handleStop}
      onRewind={handleRewind}
      onOpenFile={handleOpenFile}
      onOpenUrl={handleOpenUrl}
      onCancelQueue={cancelQueue}
      onFeedback={handleFeedback}
      onModeChange={handleModeChange}
      onThinkingModeChange={handleThinkingModeChange}
      onModelChange={handleModelChange}
      onPermissionApprove={handlePermissionApprove}
      onPermissionDeny={handlePermissionDeny}
    />
  );

  // Helper to create main content layout with configurable ActivityPanel terminal rendering
  // We need two versions because ActivityPanel appears in both layout divs (CSS display toggle),
  // but only ONE should render the terminal to avoid duplicate xterm instances
  const createMainContent = (canActivityRenderTerminal: boolean): JSX.Element => (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      {/* Chat Section (Header + Content) */}
      <ResizablePanel
        preferredSize={reviewPanelOpen ? CHAT_PANEL.WITH_ACTIVITY_WIDTH : '100%'}
        minSize={CHAT_PANEL.MIN_WIDTH}
      >
        <div className="flex flex-col h-full min-w-0">
          <ChatHeader />
          {chatContent}
        </div>
      </ResizablePanel>

      {/* Activity Panel (split view) - uses visible prop to show/hide */}
      <ResizablePanel
        preferredSize={ACTIVITY_PANEL.PREFERRED_WIDTH}
        minSize={ACTIVITY_PANEL.MIN_WIDTH}
        maxSize={ACTIVITY_PANEL.MAX_WIDTH}
        visible={reviewPanelOpen}
      >
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

          {/* Terminal sizing uses TERMINAL_PANEL constants from @/lib/utils/constants */}
          <ResizablePanel
            preferredSize={bottomPanelOpen ? bottomPanelHeight : TERMINAL_PANEL.COLLAPSED_HEIGHT}
            minSize={TERMINAL_PANEL.MIN_HEIGHT}
          >
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
