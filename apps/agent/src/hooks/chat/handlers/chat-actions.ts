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
import { isAdaptiveThinkingModel, useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';
import { useQueuedMessageStore } from '@/stores/chat/queued-message-store';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';
import { useUIStore } from '@/stores/ui/ui-store';

/**
 * Minimal deps for chat actions — only things that can't come from a Zustand store.
 * Everything else is read from stores at invocation time (not captured as stale closures).
 */
interface ChatActionsDeps {
  postMessage: (message: WebviewMessage) => void;
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
  handlePermissionApprove: (
    requestId: string,
    always?: boolean,
    answers?: Record<string, string>
  ) => void;
  handlePermissionDeny: (requestId: string) => void;
  handleOpenFile: (path: string) => void;
  handleOpenUrl: (url: string) => void;
  handleModeChange: (mode: 'default' | 'plan' | 'accept') => void;
  handleThinkingModeChange: (mode: ThinkingMode) => void;
  handleEffortLevelChange: (level: EffortLevel) => void;
  handleModelChange: (model: Model) => void;
}

export function createChatActions(deps: ChatActionsDeps): ChatActionsReturn {
  const { postMessage } = deps;

  const handleSend = (
    text: string,
    contextFiles?: string[],
    images?: ImageAttachment[],
    elements?: ReactElementContext[]
  ): void => {
    if (!text) return;

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
        // Read current state at invocation time — no stale closures
        const chatStore = useChatStore.getState();
        const sessionId = chatStore.activeSessionId ?? '';
        const session = sessionId ? chatStore.sessions[sessionId] : undefined;
        const messages = session?.messages ?? [];
        const isAgentRunning = session?.isAgentRunning ?? false;

        // If agent is running, queue the message for later
        if (isAgentRunning) {
          useQueuedMessageStore.getState().queueMessage({
            text,
            sessionId,
            ...(contextFiles ? { contextFiles } : {}),
            ...(images ? { images } : {}),
            ...(elements ? { elements } : {}),
          });
          return;
        }

        const uiState = useUIStore.getState();
        const { workspacePath, activeWorktreePath, conversations } = uiState;

        // Check if conversation already exists — use ChatStore session as primary authority.
        // The UIStore sidebar list can be stale: conversation:list replaces it with
        // disk-scanned JSONLs, which may not include optimistic conversations created
        // by handleConversationCreated but not yet persisted by the SDK.
        const conversationExists =
          sessionId !== '' &&
          (session !== undefined || conversations.some((c) => c.sessionId === sessionId));

        // If no sessionId OR first message in a non-existent conversation,
        // we need to create a conversation first via the backend
        if (!sessionId || (messages.length === 0 && !conversationExists)) {
          // Store pending message — will be sent after conversation:created
          chatStore.setPendingMessage({ text, contextFiles, images, elements });
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
          useUIStore.getState().updateConversationTitle(sessionId, text);
          postMessage({
            type: 'conversation:updateTitle',
            uuid: crypto.randomUUID(),
            session_id: sessionId,
            title: text,
          });
        }

        // Always send current thinking mode and model BEFORE message:send
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
        postMessage({
          type: 'effort:set',
          uuid: crypto.randomUUID(),
          session_id: sessionId,
          effort: toolState.effortLevel,
        });

        // Get parentUuid for Claude Code-style rewind (linked list of messages)
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

        // Write to ChatStore (not React setState)
        useChatStore.getState().addMessage(sessionId, userMessage);
        useChatStore.getState().setAgentRunning(sessionId, true);

        // Persist user message to backend
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
    const chatStore = useChatStore.getState();
    const sessionId = chatStore.activeSessionId ?? '';
    const session = sessionId ? chatStore.sessions[sessionId] : undefined;
    if (!sessionId || !(session?.isAgentRunning ?? false)) return;

    Sentry.startSpan(
      {
        op: 'ui.action',
        name: 'Stop Agent',
        attributes: { 'session.id': sessionId },
      },
      () => {
        postMessage({
          type: 'agent:stop',
          uuid: crypto.randomUUID(),
          session_id: sessionId,
        });

        // Update store immediately for responsive UI
        useChatStore.getState().setAgentRunning(sessionId, false);
        // Block rewind until SDK confirms stop (agent:complete/agent:error clears this)
        useChatStore.getState().setStopPending(sessionId, true);

        // Clear any pending permission requests
        useToolStore.getState().clearPermissions();

        const { workspacePath, activeWorktreePath } = useUIStore.getState();

        // Mark any streaming message as interrupted
        const currentSession = useChatStore.getState().sessions[sessionId];
        const messages = currentSession?.messages ?? [];
        const lastMsg = messages[messages.length - 1];

        if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
          const interruptedMsg: ChatMessage = {
            ...lastMsg,
            isStreaming: false,
            isInterrupted: true,
          };

          // Persist interrupted assistant message
          if (interruptedMsg.content) {
            void conversationAddMessage(
              sessionId,
              {
                id: interruptedMsg.id,
                role: 'assistant',
                content: interruptedMsg.content,
                ...(interruptedMsg.thinking ? { thinking: interruptedMsg.thinking } : {}),
                createdAt: Date.now(),
                ...(interruptedMsg.parentUuid !== undefined
                  ? { parentUuid: interruptedMsg.parentUuid }
                  : {}),
              },
              workspacePath ?? undefined,
              activeWorktreePath ?? undefined
            );
          }

          useChatStore.getState().updateMessage(sessionId, lastMsg.id, () => interruptedMsg);
        } else if (!lastMsg || lastMsg.role === 'user') {
          // Create an interrupted placeholder
          const parentUuid = lastMsg?.id ?? null;
          useChatStore.getState().addMessage(sessionId, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '',
            displayedContent: '',
            isStreaming: false,
            isInterrupted: true,
            parentUuid,
          });
        }
      }
    );
  };

  const handleRewind = (messageId: string): void => {
    const chatStore = useChatStore.getState();
    const sessionId = chatStore.activeSessionId ?? '';
    const session = sessionId ? chatStore.sessions[sessionId] : undefined;
    const messages = session?.messages ?? [];
    const isAgentRunning = session?.isAgentRunning ?? false;
    const isStopPending = session?.isStopPending ?? false;

    // Block rewind while agent is running OR while SDK is flushing after Stop
    if (!sessionId || isAgentRunning || isStopPending) {
      return;
    }

    const clickedMessage = messages.find((m) => m.id === messageId);
    if (!clickedMessage) {
      return;
    }

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

  const handlePermissionApprove = (
    requestId: string,
    always?: boolean,
    answers?: Record<string, string>
  ): void => {
    const sessionId = useChatStore.getState().activeSessionId ?? '';
    if (!sessionId) return;

    if (answers !== undefined) {
      useToolStore.getState().mergeToolInputAnswers('askuserquestion', answers);
    }

    postMessage({
      type: 'permission:response',
      uuid: crypto.randomUUID(),
      session_id: sessionId,
      request_id: requestId,
      decision: 'approve',
      always,
      answers,
    });
    useToolStore.getState().removePermissionRequest(requestId);
  };

  const handlePermissionDeny = (requestId: string): void => {
    const sessionId = useChatStore.getState().activeSessionId ?? '';
    if (!sessionId) return;

    // Check if this is an AskUserQuestion rejection
    const deniedRequest = useToolStore
      .getState()
      .pendingPermissions.find((p) => p.requestId === requestId);
    const isQuestionRejection = deniedRequest?.toolName.toLowerCase() === 'askuserquestion';
    const interruptReason = isQuestionRejection ? 'User rejected to answer' : undefined;

    postMessage({
      type: 'permission:response',
      uuid: crypto.randomUUID(),
      session_id: sessionId,
      request_id: requestId,
      decision: 'deny',
    });

    // Clear ALL pending permissions since we're stopping the agent
    useToolStore.getState().clearPermissions();

    // Stop the agent — user expects declining permission to stop
    postMessage({
      type: 'agent:stop',
      uuid: crypto.randomUUID(),
      session_id: sessionId,
    });

    // Update store immediately
    useChatStore.getState().setAgentRunning(sessionId, false);
    useChatStore.getState().setStopPending(sessionId, true);

    const { workspacePath, activeWorktreePath } = useUIStore.getState();

    // Mark any streaming message as interrupted
    const currentSession = useChatStore.getState().sessions[sessionId];
    const messages = currentSession?.messages ?? [];
    const lastMsg = messages[messages.length - 1];

    if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
      const interruptedMsg: ChatMessage = {
        ...lastMsg,
        isStreaming: false,
        isInterrupted: true,
        interruptReason,
      };

      if (interruptedMsg.content) {
        void conversationAddMessage(
          sessionId,
          {
            id: interruptedMsg.id,
            role: 'assistant',
            content: interruptedMsg.content,
            ...(interruptedMsg.thinking ? { thinking: interruptedMsg.thinking } : {}),
            createdAt: Date.now(),
            ...(interruptedMsg.parentUuid !== undefined
              ? { parentUuid: interruptedMsg.parentUuid }
              : {}),
          },
          workspacePath ?? undefined,
          activeWorktreePath ?? undefined
        );
      }

      useChatStore.getState().updateMessage(sessionId, lastMsg.id, () => interruptedMsg);
    } else if (!lastMsg || lastMsg.role === 'user') {
      const parentUuid = lastMsg?.id ?? null;
      useChatStore.getState().addMessage(sessionId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        displayedContent: '',
        isStreaming: false,
        isInterrupted: true,
        interruptReason,
        parentUuid,
      });
    }
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
    useToolStore.getState().setInputMode(mode);
    const sessionId = useChatStore.getState().activeSessionId ?? '';
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
    useToolStore.getState().setThinkingMode(mode);
    const sessionId = useChatStore.getState().activeSessionId ?? '';
    if (sessionId && !isAdaptiveThinkingModel(useToolStore.getState().model)) {
      postMessage({
        type: 'thinking:set',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        mode,
      });
    }
  };

  const handleEffortLevelChange = (level: EffortLevel): void => {
    useToolStore.getState().setEffortLevel(level);
    const sessionId = useChatStore.getState().activeSessionId ?? '';
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
    useToolStore.getState().setModel(model);
    const sessionId = useChatStore.getState().activeSessionId ?? '';
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
