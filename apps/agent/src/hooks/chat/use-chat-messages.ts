import { useEffect, useMemo, useRef, useState } from 'react';

import { createChatActions } from './handlers/chat-actions';
import { createMessageHandler } from './handlers/message-handler';
import { useMessageState } from './state/message-state';
import { useSessionState } from './state/session-state';

import type { ChatMessage, ImageAttachment } from '@/components/chat';
import type { Model, ReactElementContext, ThinkingMode } from '@/types/protocol';

import { useTauri } from '@/hooks/agent/use-tauri';
import { conversationAddMessage, conversationLoad } from '@/lib/api';
import { useToolStore } from '@/stores/agent/tool-store';
import { useQueuedMessageStore } from '@/stores/chat/queued-message-store';
import { useUIStore } from '@/stores/ui/ui-store';

// ============================================
// Store Action Accessors (No Subscriptions)
// ============================================
// These functions get actions via getState() to avoid subscribing to store changes.
// Actions are stable references - we don't need to re-render when store state changes.

/** Get UIStore actions without subscribing to state changes */
const getUIActions = (): Pick<
  ReturnType<typeof useUIStore.getState>,
  | 'setWorkspace'
  | 'setActiveConversation'
  | 'setConversationTransitioning'
  | 'setConversations'
  | 'addConversation'
  | 'updateConversationTitle'
> => {
  const state = useUIStore.getState();
  return {
    setWorkspace: state.setWorkspace,
    setActiveConversation: state.setActiveConversation,
    setConversationTransitioning: state.setConversationTransitioning,
    setConversations: state.setConversations,
    addConversation: state.addConversation,
    updateConversationTitle: state.updateConversationTitle,
  };
};

/** Get ToolStore actions without subscribing to state changes */
const getToolActions = (): Pick<
  ReturnType<typeof useToolStore.getState>,
  | 'setInputMode'
  | 'setThinkingMode'
  | 'setModel'
  | 'startTool'
  | 'completeTool'
  | 'addPermissionRequest'
  | 'removePermissionRequest'
  | 'clearPermissions'
  | 'addUsage'
  | 'switchSession'
  | 'restoreSessionUsage'
  | 'restoreToolsForMessage'
  | 'clearSessionTools'
> => {
  const state = useToolStore.getState();
  return {
    setInputMode: state.setInputMode,
    setThinkingMode: state.setThinkingMode,
    setModel: state.setModel,
    startTool: state.startTool,
    completeTool: state.completeTool,
    addPermissionRequest: state.addPermissionRequest,
    removePermissionRequest: state.removePermissionRequest,
    clearPermissions: state.clearPermissions,
    addUsage: state.addUsage,
    switchSession: state.switchSession,
    restoreSessionUsage: state.restoreSessionUsage,
    restoreToolsForMessage: state.restoreToolsForMessage,
    clearSessionTools: state.clearSessionTools,
  };
};

/** Get QueuedMessageStore actions without subscribing to state changes */
const getQueueActions = (): Pick<
  ReturnType<typeof useQueuedMessageStore.getState>,
  'queueMessage'
> => {
  const state = useQueuedMessageStore.getState();
  return { queueMessage: state.queueMessage };
};

interface UseChatMessagesOptions {
  onSessionCreated?: (sessionId: string, title: string) => void;
}

interface UseChatMessagesReturn {
  messages: ChatMessage[];
  isAgentRunning: boolean;
  sessionId: string;
  isMockMode: boolean;
  postMessage: ReturnType<typeof useTauri>['postMessage'];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setIsAgentRunning: React.Dispatch<React.SetStateAction<boolean>>;
  handleSend: (
    text: string,
    contextFiles?: string[],
    images?: ImageAttachment[],
    elements?: ReactElementContext[]
  ) => void;
  handleStop: () => void;
  handleRewind: (messageId: string) => void;
  handlePermissionApprove: (requestId: string, always?: boolean) => void;
  handlePermissionDeny: (requestId: string) => void;
  handleOpenFile: (path: string) => void;
  handleOpenUrl: (url: string) => void;
  handleModeChange: (mode: 'default' | 'plan' | 'accept') => void;
  handleThinkingModeChange: (mode: ThinkingMode) => void;
  handleModelChange: (model: Model) => void;
}

export function useChatMessages(options: UseChatMessagesOptions = {}): UseChatMessagesReturn {
  const { onSessionCreated } = options;

  // Session state
  const { sessionId, setSessionId, sessionIdRef, pendingMessage, setPendingMessage } =
    useSessionState();

  // Message state (depends on sessionId for caching)
  const { messages, setMessages, messagesCache, messagesRef } = useMessageState(sessionId);

  const [isAgentRunning, setIsAgentRunning] = useState(false);

  // Track thinking start times by message ID to calculate duration
  const thinkingStartTimes = useRef<Map<string, number>>(new Map());

  // ============================================
  // Isolated Reactive Selectors (Minimal Subscriptions)
  // ============================================
  // Only subscribe to the specific values we need to react to.
  // Actions are accessed via getState() in callbacks to avoid subscription overhead.

  // UIStore reactive values - only these 3 values cause re-renders when changed
  const conversations = useUIStore((state) => state.conversations);
  const workspacePath = useUIStore((state) => state.workspacePath);
  const activeWorktreePath = useUIStore((state) => state.activeWorktreePath);

  // Restore usage from backend on initial mount (when sessionId comes from localStorage)
  // This ensures token counts persist across window reloads
  const hasRestoredUsage = useRef(false);
  const initialSessionId = useRef(sessionId); // Capture initial sessionId
  useEffect(() => {
    const sid = initialSessionId.current;
    if (!sid || hasRestoredUsage.current) return;

    // Only run once on mount with initial sessionId
    hasRestoredUsage.current = true;

    // Load conversation from backend to get persisted usage data
    void (async (): Promise<void> => {
      try {
        const conversation = await conversationLoad(sid);
        if (!conversation?.messages) return;

        // Calculate cumulative usage from all persisted messages
        const processedMessageIds: string[] = [];
        const cumulativeUsage = conversation.messages.reduce(
          (acc, m) => {
            if (m.usage) {
              processedMessageIds.push(m.id);
              return {
                inputTokens: acc.inputTokens + m.usage.inputTokens,
                outputTokens: acc.outputTokens + m.usage.outputTokens,
                cacheReadInputTokens:
                  acc.cacheReadInputTokens + (m.usage.cacheReadInputTokens ?? 0),
                cacheCreationInputTokens:
                  acc.cacheCreationInputTokens + (m.usage.cacheCreationInputTokens ?? 0),
                totalCostUsd: acc.totalCostUsd + (m.usage.totalCostUsd ?? 0),
              };
            }
            return acc;
          },
          {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            totalCostUsd: 0,
          }
        );

        // Use getState() to avoid stale closures
        const {
          restoreSessionUsage: restore,
          switchSession: sw,
          restoreToolsForMessage: restoreTools,
        } = useToolStore.getState();

        // Restore usage if we found any
        if (processedMessageIds.length > 0) {
          restore(sid, cumulativeUsage, processedMessageIds);
          // Also update current session if it matches
          const toolState = useToolStore.getState();
          if (toolState.currentSessionId === sid) {
            // Re-trigger switch to apply the restored usage
            sw(sid);
          }
        }

        // Restore tool executions from persisted messages (for tool widget display on reload)
        // This runs regardless of usage data since tools might exist without usage
        for (const m of conversation.messages) {
          if (m.toolUses !== undefined && m.toolUses.length > 0) {
            restoreTools(m.id, m.toolUses);
          }
        }
      } catch {
        // Ignore errors - conversation may not exist yet
      }
    })();
  }, []); // Empty deps - only run on mount, uses refs for values

  // Handle messages from extension - memoized to prevent unnecessary recreations
  // Returns { handleMessage, cleanup } - cleanup cancels pending RAF batchers
  //
  // PERF: Actions are passed via getState() accessors to avoid re-creating handler
  // when unrelated store state changes. Only workspacePath is reactive here.
  const messageHandler = useMemo(() => {
    const uiActions = getUIActions();
    const toolActions = getToolActions();

    return createMessageHandler({
      setWorkspace: uiActions.setWorkspace,
      workspacePath,
      setActiveConversation: uiActions.setActiveConversation,
      setConversationTransitioning: uiActions.setConversationTransitioning,
      setConversations: uiActions.setConversations,
      addConversation: uiActions.addConversation,
      setInputMode: toolActions.setInputMode,
      setModel: toolActions.setModel,
      startTool: toolActions.startTool,
      completeTool: toolActions.completeTool,
      addPermissionRequest: toolActions.addPermissionRequest,
      addUsage: toolActions.addUsage,
      switchSession: toolActions.switchSession,
      restoreSessionUsage: toolActions.restoreSessionUsage,
      restoreToolsForMessage: toolActions.restoreToolsForMessage,
      clearSessionTools: toolActions.clearSessionTools,
      onSessionCreated,
      setSessionId,
      setMessages,
      setIsAgentRunning,
      sessionIdRef,
      messagesRef,
      messagesCache,
      thinkingStartTimes,
    });
  }, [
    // Only reactive dependencies - actions come from getState() inside useMemo
    workspacePath,
    onSessionCreated,
    setSessionId,
    setMessages,
    setIsAgentRunning,
    sessionIdRef,
    messagesRef,
    messagesCache,
    thinkingStartTimes,
  ]);

  // Cleanup RAF batchers when handler changes OR on unmount
  // This prevents memory leaks from old batchers' pending RAF callbacks firing into stale closures
  // When messageHandler changes (due to dependency changes), the OLD batchers must be cancelled
  useEffect(() => {
    // Store current cleanup function for this effect instance
    const cleanup = messageHandler.cleanup;

    return (): void => {
      // Cancel pending RAF callbacks from THIS handler before switching to new one
      cleanup();
    };
  }, [messageHandler]); // Run cleanup when handler changes, not just on unmount

  const { postMessage, isMockMode } = useTauri({ onMessage: messageHandler.handleMessage });

  // Request conversation list when session is ready or workspace changes
  useEffect(() => {
    if (sessionId || workspacePath) {
      postMessage({
        type: 'conversation:list',
        uuid: crypto.randomUUID(),
        workspace_path: workspacePath ?? undefined,
      });
    }
  }, [sessionId, workspacePath, postMessage]);

  // Load messages from backend when switching to a session with empty local cache
  // This handles the case where:
  // - User sends messages in Canvas ChatArea (separate component instance)
  // - User switches back to Agent tab
  // - Agent ChatArea has the correct sessionId (from localStorage) but empty message cache
  // - Messages need to be loaded from backend to display
  const loadedSessionsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // Skip if no sessionId, or if we already have messages, or if already loaded this session
    if (!sessionId || messages.length > 0 || loadedSessionsRef.current.has(sessionId)) {
      return;
    }

    // Mark as loading to prevent duplicate requests
    loadedSessionsRef.current.add(sessionId);

    // Load from backend - conversation:loaded handler will populate messages
    postMessage({
      type: 'conversation:load',
      uuid: crypto.randomUUID(),
      session_id: sessionId,
    });
  }, [sessionId, messages.length, postMessage]);

  // Request file list for @ mentions
  useEffect(() => {
    postMessage({
      type: 'file:list:request',
      uuid: crypto.randomUUID(),
    });
  }, [postMessage]);

  // Send pending message when session becomes available
  useEffect(() => {
    if (sessionId && pendingMessage) {
      const { text, contextFiles, images, elements } = pendingMessage;
      setPendingMessage(null);

      // Send current thinking mode and model to backend BEFORE the message
      // This ensures the session is created with the correct settings
      const toolState = useToolStore.getState();
      postMessage({
        type: 'thinking:set',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        mode: toolState.thinkingMode,
      });
      postMessage({
        type: 'model:set',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        model: toolState.model,
      });

      // Get action via getState() to avoid subscription
      useUIStore.getState().updateConversationTitle(sessionId, text);
      postMessage({
        type: 'conversation:updateTitle',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        title: text,
      });

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        displayedContent: text,
        attachedFiles: contextFiles,
        attachedImages: images,
      };
      setMessages((prev: ChatMessage[]) => [...prev, userMessage]);
      setIsAgentRunning(true);

      // Persist user message to backend
      void conversationAddMessage(sessionId, {
        id: userMessage.id,
        role: 'user',
        content: text,
        createdAt: Date.now(),
      });

      // Build context object with files, images, and/or elements
      const hasFiles = contextFiles && contextFiles.length > 0;
      const hasImages = images && images.length > 0;
      const hasElements = elements && elements.length > 0;
      const context =
        hasFiles || hasImages || hasElements
          ? {
              files: hasFiles ? contextFiles : undefined,
              images: hasImages
                ? images.map((img: ImageAttachment) => ({
                    name: img.name,
                    mimeType: img.mimeType,
                    data: img.data,
                  }))
                : undefined,
              elements: hasElements ? elements : undefined,
            }
          : undefined;

      // IMPORTANT: Use userMessage.id so checkpoints are associated correctly with the rewind target
      postMessage({
        type: 'message:send',
        uuid: userMessage.id,
        session_id: sessionId,
        content: text,
        context,
      });
    }
  }, [sessionId, pendingMessage, postMessage, setMessages, setPendingMessage, setIsAgentRunning]);

  // Create chat actions - memoized to prevent unnecessary recreations
  // PERF: Actions are accessed via getState() inside the factory to avoid
  // re-creating chatActions when unrelated store state changes.
  const chatActions = useMemo(() => {
    const uiActions = getUIActions();
    const toolActions = getToolActions();
    const queueActions = getQueueActions();

    return createChatActions({
      sessionId,
      setSessionId,
      messages,
      setMessages,
      isAgentRunning,
      setIsAgentRunning,
      conversations,
      // Use active worktree path for worktree-based session isolation
      // Falls back to workspace path if no worktree is active
      workspacePath: activeWorktreePath ?? workspacePath,
      messagesCache,
      setPendingMessage,
      postMessage,
      updateConversationTitle: uiActions.updateConversationTitle,
      storeQueueMessage: queueActions.queueMessage,
      setInputMode: toolActions.setInputMode,
      setThinkingMode: toolActions.setThinkingMode,
      setModel: toolActions.setModel,
      clearPermissions: toolActions.clearPermissions,
      removePermissionRequest: toolActions.removePermissionRequest,
    });
  }, [
    // Only reactive dependencies - actions come from getState() inside useMemo
    sessionId,
    messages,
    isAgentRunning,
    conversations,
    workspacePath,
    activeWorktreePath,
    messagesCache,
    postMessage,
    setSessionId,
    setMessages,
    setIsAgentRunning,
    setPendingMessage,
  ]);

  // Destructure actions for stable references
  const {
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
  } = chatActions;

  return {
    messages,
    isAgentRunning,
    sessionId,
    isMockMode,
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
  };
}
