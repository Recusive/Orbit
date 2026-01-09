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

  const {
    setWorkspace,
    setActiveConversation,
    setConversationTransitioning,
    setConversations,
    addConversation,
    updateConversationTitle,
    conversations,
    workspacePath,
  } = useUIStore();
  const {
    setInputMode,
    setThinkingMode,
    setModel,
    startTool,
    completeTool,
    addPermissionRequest,
    removePermissionRequest,
    clearPermissions,
    addUsage,
    switchSession,
    restoreSessionUsage,
    restoreToolsForMessage,
  } = useToolStore();
  const { queueMessage: storeQueueMessage } = useQueuedMessageStore();

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
  const handleMessage = useMemo(
    () =>
      createMessageHandler({
        setWorkspace,
        workspacePath,
        setActiveConversation,
        setConversationTransitioning,
        setConversations,
        addConversation,
        setInputMode,
        setModel,
        startTool,
        completeTool,
        addPermissionRequest,
        addUsage,
        switchSession,
        restoreSessionUsage,
        restoreToolsForMessage,
        onSessionCreated,
        setSessionId,
        setMessages,
        setIsAgentRunning,
        sessionIdRef,
        messagesRef,
        messagesCache,
        thinkingStartTimes,
      }),
    [
      setWorkspace,
      workspacePath,
      setActiveConversation,
      setConversationTransitioning,
      setConversations,
      addConversation,
      setInputMode,
      setModel,
      startTool,
      completeTool,
      addPermissionRequest,
      addUsage,
      switchSession,
      restoreSessionUsage,
      restoreToolsForMessage,
      onSessionCreated,
      setSessionId,
      setMessages,
      setIsAgentRunning,
      sessionIdRef,
      messagesRef,
      messagesCache,
      thinkingStartTimes,
    ]
  );

  const { postMessage, isMockMode } = useTauri({ onMessage: handleMessage });

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

      updateConversationTitle(sessionId, text);
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
  }, [
    sessionId,
    pendingMessage,
    postMessage,
    updateConversationTitle,
    setMessages,
    setPendingMessage,
    setIsAgentRunning,
  ]);

  // Create chat actions - memoized to prevent unnecessary recreations
  const chatActions = useMemo(
    () =>
      createChatActions({
        sessionId,
        setSessionId,
        messages,
        setMessages,
        isAgentRunning,
        setIsAgentRunning,
        conversations,
        workspacePath,
        messagesCache,
        setPendingMessage,
        postMessage,
        updateConversationTitle,
        storeQueueMessage,
        setInputMode,
        setThinkingMode,
        setModel,
        clearPermissions,
        removePermissionRequest,
      }),
    [
      sessionId,
      messages,
      isAgentRunning,
      conversations,
      workspacePath,
      messagesCache,
      postMessage,
      updateConversationTitle,
      storeQueueMessage,
      setInputMode,
      setThinkingMode,
      setModel,
      clearPermissions,
      removePermissionRequest,
      setSessionId,
      setMessages,
      setIsAgentRunning,
      setPendingMessage,
    ]
  );

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
