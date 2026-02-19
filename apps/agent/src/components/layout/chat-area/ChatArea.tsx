/**
 * ChatArea - Main chat interface orchestrator
 *
 * Manages the chat content and optional full-width terminal (bottom split).
 * ActivityPanel is no longer embedded here — it renders in its own
 * ActivityCard at the App.tsx level.
 *
 * NOTE: Chat container widths come from @/lib/utils/constants.
 * To change chat max-width or CSS variable names,
 * update CHAT_WIDTH and CHAT_WIDTH_VAR in constants.ts - DO NOT hardcode here.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ChatContent } from './ChatContent';
import { useLayoutStabilization } from './use-layout-stabilization';

import type { ChatMessage } from '@/components/chat/messages';
import type { TerminalPanelProps } from '@/components/terminal/terminal-panel';
import type { AllotmentHandle } from 'allotment';
import type { FC } from 'react';

import { useQueuedMessageHandler } from '@/components/chat';
import { ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ThinkingDots } from '@/components/ui/thinking-dots';
import { useChatMessages } from '@/hooks/chat/use-chat-messages';
import { TERMINAL_PANEL } from '@/lib/utils';
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
  useTerminalPosition,
  useIsLoadingConversation,
  useIsConversationTransitioning,
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
  const bottomPanelOpen = useBottomPanelOpen();
  const bottomPanelHeight = useBottomPanelHeight();
  const terminalPosition = useTerminalPosition();
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

  // Ref for terminal allotment - used to programmatically resize
  const terminalAllotmentRef = useRef<AllotmentHandle>(null);

  // Animate terminal open/close by temporarily adding CSS transition to allotment panes.
  // The .allotment-animate class enables height/top transitions for 300ms, then is removed
  // so manual drag resizing isn't affected.
  const [terminalAnimating, setTerminalAnimating] = useState(false);
  const prevBottomPanelOpen = useRef(bottomPanelOpen);

  useEffect(() => {
    if (prevBottomPanelOpen.current !== bottomPanelOpen) {
      setTerminalAnimating(true);
      const timer = setTimeout(() => {
        setTerminalAnimating(false);
      }, 300);
      prevBottomPanelOpen.current = bottomPanelOpen;
      return (): void => {
        clearTimeout(timer);
      };
    }
    return undefined;
  }, [bottomPanelOpen]);

  // Resize terminal when bottomPanelOpen changes.
  useEffect(() => {
    const allotment = terminalAllotmentRef.current;
    if (!allotment) return;

    if (bottomPanelOpen) {
      const rafId = requestAnimationFrame(() => {
        allotment.reset();
      });
      return (): void => {
        cancelAnimationFrame(rafId);
      };
    }
    allotment.reset();
    return undefined;
  }, [bottomPanelOpen]);

  // Track terminal size when user drags - save to shared store
  // PERF: Debounced to avoid triggering React re-renders on every drag frame.
  const sizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return (): void => {
      if (sizeDebounceRef.current !== null) {
        clearTimeout(sizeDebounceRef.current);
      }
    };
  }, []);

  const handleTerminalSizeChange = useCallback(
    (sizes: number[]): void => {
      const terminalSize = sizes[1];
      if (
        terminalSize !== undefined &&
        terminalSize > TERMINAL_PANEL.DRAG_THRESHOLD &&
        bottomPanelOpen
      ) {
        if (sizeDebounceRef.current !== null) {
          clearTimeout(sizeDebounceRef.current);
        }
        sizeDebounceRef.current = setTimeout(() => {
          sizeDebounceRef.current = null;
          useUIStore.getState().setBottomPanelHeight(terminalSize);
        }, 150);
      }
    },
    [bottomPanelOpen]
  );

  // Chat content section
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
  );

  // Show bottom terminal when position is 'both'
  const showBottomTerminal = terminalPosition === 'both';

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

      {/* Full-width terminal layout */}
      <div
        className="flex-1 flex flex-col"
        style={{ display: showBottomTerminal ? 'flex' : 'none' }}
      >
        <ResizablePanelGroup
          ref={terminalAllotmentRef}
          direction="vertical"
          className={terminalAnimating ? 'flex-1 allotment-animate' : 'flex-1'}
          onChange={handleTerminalSizeChange}
        >
          <ResizablePanel minSize={0}>
            <div className="h-full w-full flex flex-col min-w-0">{chatContent}</div>
          </ResizablePanel>

          {/* Terminal sizing uses TERMINAL_PANEL constants from @/lib/utils/constants */}
          <ResizablePanel
            preferredSize={bottomPanelOpen ? bottomPanelHeight : TERMINAL_PANEL.COLLAPSED_HEIGHT}
            minSize={TERMINAL_PANEL.MIN_HEIGHT}
          >
            {showBottomTerminal ? (
              <TerminalPanel variant="full-width" collapsed={!bottomPanelOpen} />
            ) : null}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* No-terminal layout — just chat content */}
      <div
        className="flex-1 h-full flex flex-col min-w-0"
        style={{ display: showBottomTerminal ? 'none' : 'flex' }}
      >
        {chatContent}
      </div>
    </div>
  );
};
