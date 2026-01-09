import type { ChatMessage, ImageAttachment } from '@/components/chat';
import type { Model, ReactElementContext, ThinkingMode, WebviewMessage } from '@/types/protocol';

import { conversationAddMessage } from '@/lib/api/backend';
import { useToolStore } from '@/stores/agent/tool-store';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';
import { useUIStore } from '@/stores/ui/ui-store';

interface Conversation {
  sessionId: string;
  title: string;
  updatedAt: number;
  messageCount: number;
  workspacePath?: string | undefined;
}

interface ChatActionsDeps {
  sessionId: string;
  setSessionId: React.Dispatch<React.SetStateAction<string>>;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  isAgentRunning: boolean;
  setIsAgentRunning: React.Dispatch<React.SetStateAction<boolean>>;
  conversations: Conversation[];
  workspacePath: string | null;
  messagesCache: React.RefObject<Map<string, ChatMessage[]>>;
  setPendingMessage: React.Dispatch<
    React.SetStateAction<{
      text: string;
      contextFiles?: string[] | undefined;
      images?: ImageAttachment[] | undefined;
      elements?: ReactElementContext[] | undefined;
    } | null>
  >;
  postMessage: (message: WebviewMessage) => void;
  updateConversationTitle: (sessionId: string, title: string) => void;
  storeQueueMessage: (message: {
    text: string;
    contextFiles?: string[];
    images?: ImageAttachment[];
    elements?: ReactElementContext[];
    sessionId: string;
  }) => void;
  setInputMode: (mode: 'default' | 'plan' | 'accept') => void;
  setThinkingMode: (mode: ThinkingMode) => void;
  setModel: (model: Model) => void;
  clearPermissions: () => void;
  removePermissionRequest: (requestId: string) => void;
}

interface ChatActionsReturn {
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

export function createChatActions(deps: ChatActionsDeps): ChatActionsReturn {
  const {
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
  } = deps;

  const handleSend = (
    text: string,
    contextFiles?: string[],
    images?: ImageAttachment[],
    elements?: ReactElementContext[]
  ): void => {
    if (!text) return;

    // If agent is running, queue the message for later
    if (isAgentRunning) {
      storeQueueMessage({
        text,
        sessionId,
        ...(contextFiles ? { contextFiles } : {}),
        ...(images ? { images } : {}),
        ...(elements ? { elements } : {}),
      });
      return;
    }

    // Check if conversation already exists in sidebar
    const conversationExists =
      sessionId !== '' && conversations.some((c) => c.sessionId === sessionId);

    // Check if we have cached messages for the current session (even if local state is empty)
    const hasCachedMessages =
      sessionId !== '' &&
      messagesCache.current.has(sessionId) &&
      (messagesCache.current.get(sessionId)?.length ?? 0) > 0;

    // If no sessionId OR (first message AND conversation doesn't exist AND no cached messages),
    // we need to create a conversation first via the backend
    if (!sessionId || (messages.length === 0 && !conversationExists && !hasCachedMessages)) {
      // Store text, context files, images, and elements for pending message
      setPendingMessage({ text, contextFiles, images, elements });
      // Clear sessionId so the conversation:created handler will set the new one
      if (sessionId) {
        setSessionId('');
      }
      postMessage({
        type: 'conversation:create',
        uuid: crypto.randomUUID(),
        title: text,
        workspace_path: workspacePath ?? undefined,
      });
      return;
    }

    // If first message but conversation exists (created via "New conversation" button),
    // update the title from "Untitled" to the message text
    if (messages.length === 0 && conversationExists) {
      updateConversationTitle(sessionId, text);
      postMessage({
        type: 'conversation:updateTitle',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        title: text,
      });
    }

    // Always send current thinking mode and model BEFORE message:send
    // This ensures the session uses the correct settings
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

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      displayedContent: text,
      attachedFiles: contextFiles,
      attachedImages: images,
    };
    setMessages((prev) => [...prev, userMessage]);
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
              ? images.map((img) => ({ name: img.name, mimeType: img.mimeType, data: img.data }))
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
  };

  const handleStop = (): void => {
    if (!sessionId || !isAgentRunning) return;

    // Send interrupt to stop the agent
    postMessage({
      type: 'agent:stop',
      uuid: crypto.randomUUID(),
      session_id: sessionId,
    });

    // Update local state immediately for responsive UI
    setIsAgentRunning(false);

    // Clear any pending permission requests since agent is stopped
    clearPermissions();

    // Mark any streaming message as complete and interrupted, or create one if none exists
    setMessages((prev) => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
        const interruptedMsg = { ...lastMsg, isStreaming: false, isInterrupted: true };

        // Persist interrupted assistant message to backend (if it has content)
        if (interruptedMsg.content) {
          void conversationAddMessage(sessionId, {
            id: interruptedMsg.id,
            role: 'assistant',
            content: interruptedMsg.content,
            ...(interruptedMsg.thinking ? { thinking: interruptedMsg.thinking } : {}),
            createdAt: Date.now(),
          });
        }

        return [...prev.slice(0, -1), interruptedMsg];
      }
      // If no assistant message exists yet, create an interrupted placeholder
      if (!lastMsg || lastMsg.role === 'user') {
        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: '',
            displayedContent: '',
            isStreaming: false,
            isInterrupted: true,
          },
        ];
      }
      return prev;
    });
  };

  const handleRewind = (messageId: string): void => {
    if (!sessionId || isAgentRunning) return;

    // Find the clicked message
    const clickedMessage = messages.find((m) => m.id === messageId);
    if (!clickedMessage) return;

    // We need TWO message IDs:
    // 1. message_id: The clicked message (for UI fork - includes up to this message)
    // 2. user_message_id: The user message (for checkpoint lookup - checkpoints stored by user msg)
    //
    // If clicked on assistant message: message_id = assistant, user_message_id = preceding user
    // If clicked on user message: message_id = user_message_id = same
    let userMessageId = messageId;
    if (clickedMessage.role === 'assistant') {
      const messageIndex = messages.findIndex((m) => m.id === messageId);
      // Look backwards for the preceding user message
      for (let i = messageIndex - 1; i >= 0; i--) {
        const prevMessage = messages[i];
        if (prevMessage?.role === 'user') {
          userMessageId = prevMessage.id;
          break;
        }
      }
    }

    postMessage({
      type: 'conversation:rewind',
      uuid: crypto.randomUUID(),
      session_id: sessionId,
      message_id: messageId, // Original clicked message (for UI fork)
      user_message_id: userMessageId, // User message (for checkpoint lookup)
    });
  };

  const handlePermissionApprove = (requestId: string, always?: boolean): void => {
    if (!sessionId) return;

    postMessage({
      type: 'permission:response',
      uuid: crypto.randomUUID(),
      session_id: sessionId,
      request_id: requestId,
      decision: 'approve',
      always,
    });
    removePermissionRequest(requestId);
  };

  const handlePermissionDeny = (requestId: string): void => {
    if (!sessionId) return;

    // Send denial response to the SDK
    postMessage({
      type: 'permission:response',
      uuid: crypto.randomUUID(),
      session_id: sessionId,
      request_id: requestId,
      decision: 'deny',
    });

    // Clear ALL pending permissions since we're stopping the agent
    clearPermissions();

    // Also interrupt the agent - SDK continues after denial by default,
    // but user expects declining permission to stop the agent
    postMessage({
      type: 'agent:stop',
      uuid: crypto.randomUUID(),
      session_id: sessionId,
    });

    // Update local state immediately
    setIsAgentRunning(false);

    // Mark any streaming message as complete and interrupted, or create one if none exists
    setMessages((prev) => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
        const interruptedMsg = { ...lastMsg, isStreaming: false, isInterrupted: true };

        // Persist interrupted assistant message to backend (if it has content)
        if (interruptedMsg.content) {
          void conversationAddMessage(sessionId, {
            id: interruptedMsg.id,
            role: 'assistant',
            content: interruptedMsg.content,
            ...(interruptedMsg.thinking ? { thinking: interruptedMsg.thinking } : {}),
            createdAt: Date.now(),
          });
        }

        return [...prev.slice(0, -1), interruptedMsg];
      }
      // If no assistant message exists yet, create an interrupted placeholder
      if (!lastMsg || lastMsg.role === 'user') {
        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: '',
            displayedContent: '',
            isStreaming: false,
            isInterrupted: true,
          },
        ];
      }
      return prev;
    });
  };

  const handleOpenFile = (path: string): void => {
    const fileViewerStore = useFileViewerStore.getState();
    fileViewerStore.openFile(path);

    const uiState = useUIStore.getState();
    if (!uiState.reviewPanelOpen) {
      uiState.toggleReviewPanel();
    }

    postMessage({
      type: 'file:read',
      uuid: crypto.randomUUID(),
      path,
    });
  };

  const handleOpenUrl = (url: string): void => {
    postMessage({
      type: 'url:open',
      uuid: crypto.randomUUID(),
      url,
    });
  };

  const handleModeChange = (mode: 'default' | 'plan' | 'accept'): void => {
    setInputMode(mode);
    if (sessionId) {
      postMessage({
        type: 'inputMode:set',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        mode,
      });
    }
  };

  const handleThinkingModeChange = (mode: ThinkingMode): void => {
    setThinkingMode(mode);
    if (sessionId) {
      postMessage({
        type: 'thinking:set',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        mode,
      });
    }
  };

  const handleModelChange = (model: Model): void => {
    setModel(model);
    if (sessionId) {
      postMessage({
        type: 'model:set',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        model,
      });
    }
  };

  return {
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
