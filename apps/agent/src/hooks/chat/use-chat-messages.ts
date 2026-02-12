import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { createChatActions } from './handlers/chat-actions';
import { createMessageHandler } from './handlers/message-handler';
import { useMessageState } from './state/message-state';
import { useSessionState } from './state/session-state';

import type { ChatMessage, ImageAttachment } from '@/components/chat';
import type { EffortLevel, Model, ReactElementContext, ThinkingMode } from '@/types/protocol';

import { useTauri } from '@/hooks/agent/use-tauri';
import { conversationAddMessage, conversationLoad } from '@/lib/api';
import { useMessageBufferStore } from '@/stores/agent/message-buffer-store';
import { isAdaptiveThinkingModel, useToolStore } from '@/stores/agent/tool-store';
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
  | 'updateConversationTitle'
> => {
  const state = useUIStore.getState();
  return {
    setWorkspace: state.setWorkspace,
    setActiveConversation: state.setActiveConversation,
    setConversationTransitioning: state.setConversationTransitioning,
    setConversations: state.setConversations,
    updateConversationTitle: state.updateConversationTitle,
  };
};

/** Get ToolStore actions without subscribing to state changes */
const getToolActions = (): Pick<
  ReturnType<typeof useToolStore.getState>,
  | 'setInputMode'
  | 'setThinkingMode'
  | 'setEffortLevel'
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
    setEffortLevel: state.setEffortLevel,
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
  handleEffortLevelChange: (level: EffortLevel) => void;
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

  // Gate rewind after Stop: `agent:stop` sets isAgentRunning=false BEFORE the SDK
  // finishes flushing its JSONL writes. If the user clicks Rewind in that window,
  // `conversationLoad` / `agentForkSessionAt` read a partially-written JSONL, causing:
  //   - Empty user message bubbles
  //   - "[Request interrupted by user]" appearing as wrong role
  //   - API 400 errors ("text content blocks must be non-empty")
  // This ref is set true by handleStop and cleared by agent:complete/agent:error.
  // handleRewind checks it to prevent rewind during the flush window.
  const isStopPendingRef = useRef(false);

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
      activeWorktreePath,
      setActiveConversation: uiActions.setActiveConversation,
      setConversationTransitioning: uiActions.setConversationTransitioning,
      setConversations: uiActions.setConversations,
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
      isStopPendingRef,
      sessionIdRef,
      messagesRef,
      messagesCache,
      thinkingStartTimes,
    });
  }, [
    // Only reactive dependencies - actions come from getState() inside useMemo
    workspacePath,
    activeWorktreePath,
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

  // ─────────────────────────────────────────────────────────────
  // Buffer Hydration for Auto-Start Agents
  // ─────────────────────────────────────────────────────────────
  // When ChatArea mounts, hydrate any buffered messages that arrived while unmounted.
  // This solves the auto-start agent problem where Claude starts streaming before
  // the user expands the agent view.
  //
  // IMPORTANT: We use useLayoutEffect instead of useEffect to minimize the race window.
  // useLayoutEffect runs synchronously after DOM mutations but before paint, so we
  // mark the session as consuming as early as possible. This prevents messages from
  // being incorrectly buffered during the brief window between mount and effect execution.
  useLayoutEffect(() => {
    if (!sessionId) return;

    const bufferStore = useMessageBufferStore.getState();

    // Mark session as consuming and get any buffered messages
    // This is atomic - once this returns, new messages will be dispatched directly
    const bufferedMessages = bufferStore.startConsuming(sessionId);

    if (bufferedMessages.length > 0) {
      // Process each buffered message through the handler synchronously
      // This ensures all buffered messages are processed before any new messages
      // can arrive (JavaScript is single-threaded, no new events during this loop)
      for (const { message } of bufferedMessages) {
        messageHandler.handleMessage(message);
      }

      // CRITICAL: Force-flush the RAF batchers synchronously.
      // agent:chunk messages queue to RAF batcher, which normally fires on next animation frame.
      // Without this flush, the conversation:load effect would send the request BEFORE
      // RAF fires, causing conversation:loaded to see an empty cache. The flush ensures
      // all streaming content is in React state before conversation:load is sent.
      messageHandler.flush();
    }

    // Cleanup: stop consuming when unmounting so future messages get buffered
    return (): void => {
      bufferStore.stopConsuming(sessionId);
    };
  }, [sessionId, messageHandler]);

  // Cross-instance user message sync (Agent ↔ Editor).
  // Both views mount their own useChatMessages with separate useState. When a user message
  // is sent from one view, only that view's state is updated. The other view receives
  // backend events (agent:chunk, tool:start, etc.) but never the user message, so it
  // renders the assistant response without the preceding user bubble.
  // This listener picks up user messages broadcast by the sending instance.
  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<{ sessionId: string; message: ChatMessage }>).detail;
      if (detail.sessionId !== sessionId) return;
      setMessages((prev) => {
        // Dedupe: the instance that sent the message already has it
        if (prev.some((m) => m.id === detail.message.id)) return prev;
        return [...prev, detail.message];
      });
    };
    window.addEventListener('orbit:user-message', handler);
    return (): void => {
      window.removeEventListener('orbit:user-message', handler);
    };
  }, [sessionId, setMessages]);

  // Request conversation list when session is ready or workspace/worktree changes
  useEffect(() => {
    if (sessionId || workspacePath) {
      postMessage({
        type: 'conversation:list',
        uuid: crypto.randomUUID(),
        workspace_path: workspacePath ?? undefined,
        worktree_path: activeWorktreePath ?? undefined,
      });
    }
  }, [sessionId, workspacePath, activeWorktreePath, postMessage]);

  // Load messages from backend when switching to a session with empty local cache
  // This handles the case where:
  // - User sends messages in Canvas ChatArea (separate component instance)
  // - User switches back to Agent tab
  // - Agent ChatArea has the correct sessionId (from localStorage) but empty message cache
  // - Messages need to be loaded from backend to display
  const loadedSessionsRef = useRef<Set<string>>(new Set());

  // Track previous message count to detect when messages are cleared
  // This allows reloading if messages were explicitly cleared after being loaded
  const prevMessagesLengthRef = useRef<number>(messages.length);
  useEffect(() => {
    // If messages went from non-empty to empty while sessionId stayed the same,
    // clear the loaded flag so we can reload from backend if needed
    // This fixes a race condition where messages could be cleared but never reloaded
    if (prevMessagesLengthRef.current > 0 && messages.length === 0 && sessionId) {
      loadedSessionsRef.current.delete(sessionId);
    }
    prevMessagesLengthRef.current = messages.length;
  }, [sessionId, messages.length]);

  useEffect(() => {
    // Skip if no sessionId, or if already loaded this session
    // NOTE: We don't skip based on messages.length because buffer hydration may have
    // added streaming response messages WITHOUT the user message. We still need to
    // load from backend to get the full conversation history (including user messages).
    if (!sessionId || loadedSessionsRef.current.has(sessionId)) {
      return;
    }

    // Check if another component (e.g., useAgentConversation) already has a pending load
    // This prevents duplicate conversation:load requests that cause message duplicates.
    // NOTE: conversation:loaded handler deliberately does NOT clear the pending flag —
    // it must survive until this useEffect fires (after React commits the new sessionId
    // from startTransition). We clear it here after observing it.
    const bufferStore = useMessageBufferStore.getState();
    if (bufferStore.hasLoadPending(sessionId)) {
      // Another component is handling the load - mark as loaded locally and clear flag
      loadedSessionsRef.current.add(sessionId);
      bufferStore.clearLoadPending(sessionId);
      return;
    }

    // Mark as loading to prevent duplicate requests (both local ref and global store)
    loadedSessionsRef.current.add(sessionId);
    bufferStore.markLoadPending(sessionId);

    // Load from backend - conversation:loaded handler will populate messages
    // This will merge with any buffered messages that were hydrated earlier
    postMessage({
      type: 'conversation:load',
      uuid: crypto.randomUUID(),
      session_id: sessionId,
    });
  }, [sessionId, postMessage]);

  // Send pending message when session becomes available
  useEffect(() => {
    if (sessionId && pendingMessage) {
      const { text, contextFiles, images, elements } = pendingMessage;
      setPendingMessage(null);

      // Send current thinking mode and model to backend BEFORE the message.
      // Skip thinking:set for adaptive thinking models (Opus 4.6) — effort controls thinking.
      const toolState = useToolStore.getState();
      if (!isAdaptiveThinkingModel(toolState.model)) {
        postMessage({
          type: 'thinking:set',
          uuid: crypto.randomUUID(),
          session_id: sessionId,
          mode: toolState.thinkingMode,
        });
      }
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

      // Get the last message's ID to establish parentUuid chain (Claude Code-style rewind)
      // For new conversations (after conversation:created), this will be null
      // For existing conversations with pending messages, this links to the previous message
      const lastMessage = messagesRef.current[messagesRef.current.length - 1];
      const parentUuid = lastMessage?.id ?? null;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        displayedContent: text,
        attachedFiles: contextFiles,
        attachedImages: images,
        parentUuid,
      };
      setMessages((prev: ChatMessage[]) => [...prev, userMessage]);
      setIsAgentRunning(true);

      // Broadcast user message so other mounted instances (e.g., Editor ↔ Agent) stay in sync.
      // Both views mount their own useChatMessages with separate useState, so a user message
      // sent from one view is invisible to the other without this cross-instance sync.
      window.dispatchEvent(
        new CustomEvent('orbit:user-message', {
          detail: { sessionId, message: userMessage },
        })
      );

      // Persist user message to backend with workspace/worktree context
      // This ensures auto-created conversations go to the correct location, not _global
      void conversationAddMessage(
        sessionId,
        {
          id: userMessage.id,
          role: 'user',
          content: text,
          createdAt: Date.now(),
          parentUuid,
        },
        workspacePath ?? undefined,
        activeWorktreePath ?? undefined
      );

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
      // Include parent_uuid for Claude Code-style rewind (linked list of messages)
      postMessage({
        type: 'message:send',
        uuid: userMessage.id,
        session_id: sessionId,
        content: text,
        parent_uuid: parentUuid,
        context,
      });
    }
  }, [
    sessionId,
    pendingMessage,
    postMessage,
    setMessages,
    setPendingMessage,
    setIsAgentRunning,
    workspacePath,
    activeWorktreePath,
    messagesRef,
  ]);

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
      isStopPendingRef,
      conversations,
      // Keep workspace path and worktree path separate for proper grouping
      workspacePath,
      activeWorktreePath,
      messagesCache,
      setPendingMessage,
      postMessage,
      updateConversationTitle: uiActions.updateConversationTitle,
      storeQueueMessage: queueActions.queueMessage,
      setInputMode: toolActions.setInputMode,
      setThinkingMode: toolActions.setThinkingMode,
      setEffortLevel: toolActions.setEffortLevel,
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
    handleEffortLevelChange,
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
    handleEffortLevelChange,
    handleModelChange,
  };
}
