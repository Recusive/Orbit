import * as Sentry from '@sentry/react';

import type { ChatMessage, ImageAttachment } from '@/components/chat';
import type {
  EffortLevel,
  Model,
  ReactElementContext,
  ThinkingMode,
  WebviewMessage,
} from '@/types/protocol';

import { conversationAddMessage } from '@/lib/api';
import { useCheckpointStore } from '@/stores/agent/checkpoint-store';
import { useToolStore } from '@/stores/agent/tool-store';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';
import { useUIStore } from '@/stores/ui/ui-store';

interface Conversation {
  sessionId: string;
  title: string;
  updatedAt: number;
  messageCount: number;
  workspacePath?: string | undefined;
  worktreePath?: string | undefined;
}

interface ChatActionsDeps {
  sessionId: string;
  setSessionId: React.Dispatch<React.SetStateAction<string>>;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  isAgentRunning: boolean;
  setIsAgentRunning: React.Dispatch<React.SetStateAction<boolean>>;
  /** Gate rewind after Stop — true while SDK is still flushing JSONL. */
  isStopPendingRef: React.RefObject<boolean>;
  conversations: Conversation[];
  workspacePath: string | null;
  activeWorktreePath: string | null;
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
  setEffortLevel: (level: EffortLevel) => void;
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
  handleEffortLevelChange: (level: EffortLevel) => void;
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
    isStopPendingRef,
    conversations,
    workspacePath,
    activeWorktreePath,
    messagesCache,
    setPendingMessage,
    postMessage,
    updateConversationTitle,
    storeQueueMessage,
    setInputMode,
    setThinkingMode,
    setEffortLevel,
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

    // Wrap the entire send operation in a Sentry span for UI interaction tracing
    Sentry.startSpan(
      {
        op: 'ui.action',
        name: 'Send Message',
        attributes: {
          'message.has_files': contextFiles !== undefined && contextFiles.length > 0,
          'message.has_images': images !== undefined && images.length > 0,
          'message.has_elements': elements !== undefined && elements.length > 0,
          'message.length': text.length,
        },
      },
      () => {
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
            worktree_path: activeWorktreePath ?? undefined,
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
        postMessage({
          type: 'effort:set',
          uuid: crypto.randomUUID(),
          session_id: sessionId,
          effort: toolState.effortLevel,
        });

        // Get parentUuid for Claude Code-style rewind (linked list of messages)
        // Priority:
        // 1. Rewind fork point (if user just rewound, create a branch)
        // 2. Last message in current chain (normal flow)
        // 3. null (first message in conversation)
        //
        // The fork point creates a BRANCH in the conversation tree:
        //   msg1 -> msg2 -> msg3 -> msg4
        //                \-> msg5 (fork from msg2 via rewind)
        const checkpointStore = useCheckpointStore.getState();
        const forkPoint = checkpointStore.consumeRewindForkPoint(sessionId);
        const lastMessage = messages[messages.length - 1];
        const parentUuid = forkPoint ?? lastMessage?.id ?? null;

        const userMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: text,
          displayedContent: text,
          attachedFiles: contextFiles,
          attachedImages: images,
          parentUuid,
        };
        setMessages((prev) => [...prev, userMessage]);
        setIsAgentRunning(true);

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
                  ? images.map((img) => ({
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
    );
  };

  const handleStop = (): void => {
    if (!sessionId || !isAgentRunning) return;

    // Wrap the stop operation in a Sentry span for UI interaction tracing
    Sentry.startSpan(
      {
        op: 'ui.action',
        name: 'Stop Agent',
        attributes: {
          'session.id': sessionId,
        },
      },
      () => {
        // Send interrupt to stop the agent
        postMessage({
          type: 'agent:stop',
          uuid: crypto.randomUUID(),
          session_id: sessionId,
        });

        // Update local state immediately for responsive UI
        setIsAgentRunning(false);
        // Block rewind until SDK confirms stop (agent:complete/agent:error clears this).
        // Without this, rewind can read a partially-written JSONL → corruption.
        isStopPendingRef.current = true;

        // Clear any pending permission requests since agent is stopped
        clearPermissions();

        // Mark any streaming message as complete and interrupted, or create one if none exists
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
            const interruptedMsg = { ...lastMsg, isStreaming: false, isInterrupted: true };

            // Persist interrupted assistant message to backend (if it has content)
            if (interruptedMsg.content) {
              void conversationAddMessage(
                sessionId,
                {
                  id: interruptedMsg.id,
                  role: 'assistant',
                  content: interruptedMsg.content,
                  ...(interruptedMsg.thinking ? { thinking: interruptedMsg.thinking } : {}),
                  createdAt: Date.now(),
                  // Include parentUuid for Claude Code-style rewind chain
                  ...(interruptedMsg.parentUuid !== undefined
                    ? { parentUuid: interruptedMsg.parentUuid }
                    : {}),
                },
                workspacePath ?? undefined,
                activeWorktreePath ?? undefined
              );
            }

            return [...prev.slice(0, -1), interruptedMsg];
          }
          // If no assistant message exists yet, create an interrupted placeholder
          if (!lastMsg || lastMsg.role === 'user') {
            // Set parentUuid to the last message's ID to maintain the chain
            const parentUuid = lastMsg?.id ?? null;
            return [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: 'assistant' as const,
                content: '',
                displayedContent: '',
                isStreaming: false,
                isInterrupted: true,
                parentUuid,
              },
            ];
          }
          return prev;
        });
      }
    );
  };

  const handleRewind = (messageId: string): void => {
    // Block rewind while agent is running OR while SDK is flushing after Stop.
    // The stop-pending window is ~50-200ms between handleStop and agent:complete.
    if (!sessionId || isAgentRunning || isStopPendingRef.current) {
      return;
    }

    // Find the clicked message
    const clickedMessage = messages.find((m) => m.id === messageId);
    if (!clickedMessage) {
      return;
    }

    // Wrap the rewind operation in a Sentry span for UI interaction tracing
    Sentry.startSpan(
      {
        op: 'ui.action',
        name: 'Rewind Conversation',
        attributes: {
          'session.id': sessionId,
          'message.role': clickedMessage.role,
        },
      },
      () => {
        const messageIndex = messages.findIndex((m) => m.id === messageId);
        let userMessageId = messageId;
        if (clickedMessage.role === 'assistant') {
          for (let i = messageIndex - 1; i >= 0; i--) {
            const prevMessage = messages[i];
            if (prevMessage?.role === 'user') {
              userMessageId = prevMessage.id;
              break;
            }
          }
        }

        // Include truncated messages as fallback for subsequent rewinds.
        // After the first rewind, the JSONL on disk may be truncated/deleted by
        // forkSessionAt. The frontend messages already have SDK JSONL UUIDs from
        // the first rewind's conversation:rewound event, so they are reliable.
        const truncatedMessages = messages.slice(0, messageIndex + 1).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          parentUuid: m.parentUuid ?? null,
        }));

        postMessage({
          type: 'conversation:rewind',
          uuid: crypto.randomUUID(),
          session_id: sessionId,
          message_id: messageId,
          user_message_id: userMessageId,
          message_index: messageIndex,
          current_messages: truncatedMessages,
        });
      }
    );
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
    isStopPendingRef.current = true;

    // Mark any streaming message as complete and interrupted, or create one if none exists
    setMessages((prev) => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
        const interruptedMsg = { ...lastMsg, isStreaming: false, isInterrupted: true };

        // Persist interrupted assistant message to backend (if it has content)
        if (interruptedMsg.content) {
          void conversationAddMessage(
            sessionId,
            {
              id: interruptedMsg.id,
              role: 'assistant',
              content: interruptedMsg.content,
              ...(interruptedMsg.thinking ? { thinking: interruptedMsg.thinking } : {}),
              createdAt: Date.now(),
              // Include parentUuid for Claude Code-style rewind chain
              ...(interruptedMsg.parentUuid !== undefined
                ? { parentUuid: interruptedMsg.parentUuid }
                : {}),
            },
            workspacePath ?? undefined,
            activeWorktreePath ?? undefined
          );
        }

        return [...prev.slice(0, -1), interruptedMsg];
      }
      // If no assistant message exists yet, create an interrupted placeholder
      if (!lastMsg || lastMsg.role === 'user') {
        // Set parentUuid to the last message's ID to maintain the chain
        const parentUuid = lastMsg?.id ?? null;
        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: '',
            displayedContent: '',
            isStreaming: false,
            isInterrupted: true,
            parentUuid,
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

  const handleEffortLevelChange = (level: EffortLevel): void => {
    setEffortLevel(level);
    if (sessionId) {
      postMessage({
        type: 'effort:set',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        effort: level,
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
    handleEffortLevelChange,
    handleModelChange,
  };
}
