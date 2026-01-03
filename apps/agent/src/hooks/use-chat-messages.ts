import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChatMessage, ImageAttachment } from '@/components/chat';
import type { ExtensionMessage, Model, ReactElementContext, ThinkingMode } from '@/types/protocol';

import { useTauri } from '@/hooks/use-tauri';
import { conversationAddMessage, conversationLoad } from '@/lib/backend';
import { computeSimpleDiff, getLanguageFromPath } from '@/lib/diff-utils';
import { useFileStore } from '@/stores/file-store';
import { useFileViewerStore } from '@/stores/file-viewer-store';
import { useQueuedMessageStore } from '@/stores/queued-message-store';
import { useToolStore } from '@/stores/tool-store';
import { useUIStore } from '@/stores/ui-store';
import { StoredChatMessageArraySchema } from '@/types/protocol';

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

  // Restore state from localStorage on mount (survives webview reloads)
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('orbit-messages');
      if (saved === null) {
        return [];
      }
      const json: unknown = JSON.parse(saved);
      const result = StoredChatMessageArraySchema.safeParse(json);
      if (!result.success) {
        return [];
      }
      return result.data;
    } catch {
      return [];
    }
  });
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [sessionId, setSessionId] = useState<string>(() => {
    try {
      return localStorage.getItem('orbit-sessionId') ?? '';
    } catch {
      return '';
    }
  });
  const [pendingMessage, setPendingMessage] = useState<{
    text: string;
    contextFiles?: string[] | undefined;
    images?: ImageAttachment[] | undefined;
    elements?: ReactElementContext[] | undefined;
  } | null>(null);

  // Track thinking start times by message ID to calculate duration
  const thinkingStartTimes = useRef<Map<string, number>>(new Map());

  // Cache messages by sessionId to preserve state when switching conversations
  const messagesCache = useRef<Map<string, ChatMessage[]>>(new Map());

  // Refs to track current state (for use in callbacks without deps issues)
  const sessionIdRef = useRef<string>(sessionId);
  sessionIdRef.current = sessionId;
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  const {
    setWorkspace,
    setActiveConversation,
    setLoadingConversation,
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

  // Save messages to cache whenever they change (for conversation switching)
  useEffect(() => {
    if (sessionId && messages.length > 0) {
      messagesCache.current.set(sessionId, messages);
    }
  }, [sessionId, messages]);

  // Persist messages to localStorage (survives webview reloads)
  useEffect(() => {
    try {
      localStorage.setItem('orbit-messages', JSON.stringify(messages));
    } catch {
      // Ignore storage errors
    }
  }, [messages]);

  // Persist sessionId to localStorage (survives webview reloads)
  useEffect(() => {
    try {
      localStorage.setItem('orbit-sessionId', sessionId);
    } catch {
      // Ignore storage errors
    }
  }, [sessionId]);

  // Sync tool store's currentSessionId when React sessionId changes
  // This is critical for usage tracking - without this, usage accumulated before the first
  // switchSession call (e.g., from localStorage restore or system:init) won't be cached
  // when switching conversations, causing token counts to reset to 0.
  useEffect(() => {
    if (sessionId) {
      const toolState = useToolStore.getState();
      if (toolState.currentSessionId !== sessionId) {
        switchSession(sessionId);
      }
    }
  }, [sessionId, switchSession]);

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

  // Track if we have pending animations - only run interval when needed
  const hasAnimatingMessage = messages.some((m) => m.displayedContent.length < m.content.length);

  // Streaming animation - use interval to reveal content progressively
  // Only runs when there's actually content to animate
  useEffect(() => {
    if (!hasAnimatingMessage) return;

    const intervalId = window.setInterval(() => {
      setMessages((prev) => {
        const pendingIdx = prev.findIndex((m) => m.displayedContent.length < m.content.length);
        if (pendingIdx === -1) return prev;

        const msg = prev[pendingIdx];
        if (!msg) return prev;
        const nextLength = Math.min(msg.displayedContent.length + 3, msg.content.length);
        const newMsg: ChatMessage = { ...msg, displayedContent: msg.content.slice(0, nextLength) };
        const updated = [...prev];
        updated[pendingIdx] = newMsg;
        return updated;
      });
    }, 16);

    return () => {
      clearInterval(intervalId);
    };
  }, [hasAnimatingMessage]);

  // Handle messages from extension
  const handleMessage = useCallback(
    (message: ExtensionMessage): void => {
      switch (message.type) {
        case 'system:init':
          // Only set sessionId if we don't already have an active session with messages
          // This prevents browser panel opening from resetting the session
          if (!sessionIdRef.current || messagesRef.current.length === 0) {
            setSessionId(message.session_id);
          }
          if (message.cwd) {
            setWorkspace(message.cwd);
          }
          break;

        case 'agent:chunk': {
          setMessages((prev) => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
              const newContent = lastMsg.content + message.content;
              return [...prev.slice(0, -1), { ...lastMsg, content: newContent }];
            }
            return [
              ...prev,
              {
                id: message.message_id,
                role: 'assistant',
                content: message.content,
                displayedContent: '',
                isStreaming: true,
              },
            ];
          });
          break;
        }

        case 'agent:thinking': {
          // Record thinking start time on first chunk
          if (!thinkingStartTimes.current.has(message.message_id)) {
            thinkingStartTimes.current.set(message.message_id, Date.now());
          }

          // Calculate current duration
          const startTime = thinkingStartTimes.current.get(message.message_id) ?? Date.now();
          const currentDuration = Date.now() - startTime;

          // Update the current streaming message with thinking content (append, not replace)
          setMessages((prev) => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg?.role === 'assistant') {
              // Append thinking content like we do for regular content
              const newThinking = (lastMsg.thinking ?? '') + message.thinking;
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMsg,
                  thinking: newThinking,
                  thinkingDurationMs: currentDuration,
                },
              ];
            }
            // If no assistant message exists yet, create one with just thinking
            return [
              ...prev,
              {
                id: message.message_id,
                role: 'assistant',
                content: '',
                displayedContent: '',
                isStreaming: true,
                thinking: message.thinking,
                thinkingDurationMs: currentDuration,
              },
            ];
          });
          break;
        }

        case 'agent:complete': {
          // Calculate final thinking duration if we were tracking it
          const thinkingStart = thinkingStartTimes.current.get(message.message_id);
          const finalThinkingDuration =
            thinkingStart !== undefined ? Date.now() - thinkingStart : undefined;

          // Clean up the tracking
          thinkingStartTimes.current.delete(message.message_id);

          setMessages((prev) => {
            const lastMsg = prev[prev.length - 1];
            // Only update if still streaming (not already interrupted)
            if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
              const completedMsg = {
                ...lastMsg,
                isStreaming: false,
                // Update final thinking duration if we have one
                ...(finalThinkingDuration !== undefined && lastMsg.thinking
                  ? { thinkingDurationMs: finalThinkingDuration }
                  : {}),
              };

              // Persist assistant message to backend (including usage for token tracking)
              // Build usage object conditionally to satisfy exactOptionalPropertyTypes
              const usageDto = message.usage
                ? {
                    inputTokens: message.usage.input_tokens,
                    outputTokens: message.usage.output_tokens,
                    ...(message.usage.cache_read_input_tokens !== undefined
                      ? { cacheReadInputTokens: message.usage.cache_read_input_tokens }
                      : {}),
                    ...(message.usage.cache_creation_input_tokens !== undefined
                      ? { cacheCreationInputTokens: message.usage.cache_creation_input_tokens }
                      : {}),
                    ...(message.total_cost_usd !== undefined
                      ? { totalCostUsd: message.total_cost_usd }
                      : {}),
                  }
                : undefined;

              // Get completed tools for this message to persist alongside the message
              const toolState = useToolStore.getState();
              const messageTools = toolState.getToolsForMessage(completedMsg.id);
              const toolUsesDto =
                messageTools.length > 0
                  ? messageTools.map((tool) => ({
                      id: tool.id,
                      name: tool.toolName,
                      input: tool.toolInput,
                      // Convert output to string if it's not already
                      ...(tool.toolOutput !== undefined
                        ? {
                            output:
                              typeof tool.toolOutput === 'string'
                                ? tool.toolOutput
                                : JSON.stringify(tool.toolOutput),
                          }
                        : {}),
                      success: tool.success ?? true,
                    }))
                  : undefined;

              void conversationAddMessage(message.session_id, {
                id: completedMsg.id,
                role: 'assistant',
                content: completedMsg.content,
                ...(completedMsg.thinking ? { thinking: completedMsg.thinking } : {}),
                createdAt: Date.now(),
                ...(usageDto ? { usage: usageDto } : {}),
                ...(toolUsesDto ? { toolUses: toolUsesDto } : {}),
              });

              return [...prev.slice(0, -1), completedMsg];
            }
            // If message was already marked as interrupted, don't change it
            return prev;
          });
          // Track usage data from SDK (deduplicates by message_id)
          if (message.usage) {
            addUsage(message.message_id, message.usage, message.total_cost_usd);
          }
          setIsAgentRunning(false);
          break;
        }

        case 'agent:error': {
          setIsAgentRunning(false);
          const errorContent = `Error: ${message.error}`;
          setMessages((prev) => {
            const lastMsg = prev[prev.length - 1];
            // If there's an existing assistant message (possibly interrupted), append error to it
            if (lastMsg?.role === 'assistant') {
              const newContent = lastMsg.content
                ? `${lastMsg.content}\n\n${errorContent}`
                : errorContent;
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMsg,
                  content: newContent,
                  displayedContent: newContent,
                  isStreaming: false,
                },
              ];
            }
            // Otherwise create new error message
            return [
              ...prev,
              {
                id: message.message_id,
                role: 'assistant' as const,
                content: errorContent,
                displayedContent: errorContent,
              },
            ];
          });
          break;
        }

        case 'conversation:created': {
          // Save current messages to cache BEFORE switching sessions
          // This preserves messages when switching away from an existing conversation
          const oldSessionId = sessionIdRef.current;
          const oldMessages = messagesRef.current;
          if (oldSessionId && oldMessages.length > 0) {
            messagesCache.current.set(oldSessionId, oldMessages);
          }

          setSessionId(message.session_id);
          setActiveConversation(message.session_id, message.title);
          addConversation({
            sessionId: message.session_id,
            title: message.title,
            updatedAt: Date.now(),
            messageCount: 0,
            workspacePath: message.workspace_path,
          });
          setMessages([]);
          switchSession(message.session_id); // Switch to new session (resets usage for new conversation)
          onSessionCreated?.(message.session_id, message.title);
          break;
        }

        case 'conversation:list':
          // Only update if backend returns conversations (has persistence)
          // Don't overwrite local conversations with empty list from backend
          if (message.conversations.length > 0) {
            setConversations(
              message.conversations.map((c) => ({
                sessionId: c.session_id,
                title: c.title,
                updatedAt: c.updated_at,
                messageCount: c.message_count,
                workspacePath: c.workspace_path,
              }))
            );
          }
          break;

        case 'conversation:loading': {
          // Mark as transitioning (content will render invisibly)
          setConversationTransitioning(true);
          // Cache current messages BEFORE switching (loading state is set by sidebar synchronously)
          const currentSessionId = sessionIdRef.current;
          const currentMessages = messagesRef.current;
          if (currentSessionId && currentMessages.length > 0) {
            messagesCache.current.set(currentSessionId, currentMessages);
          }
          break;
        }

        case 'conversation:loaded': {
          // Prepare new messages (filter out system messages as they're not displayed)
          const cachedMessages = messagesCache.current.get(message.session_id);
          const backendMessages = message.messages
            .filter(
              (m): m is typeof m & { role: 'user' | 'assistant' } =>
                m.role === 'user' || m.role === 'assistant'
            )
            .map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              displayedContent: m.content,
            }));

          // Determine which messages to use (prefer cache if it has more messages)
          let newMessages: typeof backendMessages;
          if (cachedMessages && cachedMessages.length > 0 && backendMessages.length === 0) {
            newMessages = cachedMessages;
          } else if (cachedMessages && cachedMessages.length > backendMessages.length) {
            newMessages = cachedMessages;
          } else {
            newMessages = backendMessages;
          }

          // Calculate cumulative usage from persisted messages (for token tracking persistence)
          const processedMessageIds: string[] = [];
          const cumulativeUsage = message.messages.reduce(
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

          // Restore usage from persisted data BEFORE switching session
          // This ensures the session cache is pre-populated with correct usage
          if (processedMessageIds.length > 0) {
            restoreSessionUsage(message.session_id, cumulativeUsage, processedMessageIds);
          }

          // Set all state atomically - React 18 batches these updates
          setMessages(newMessages);
          setSessionId(message.session_id);
          setActiveConversation(message.session_id, message.title);
          switchSession(message.session_id);

          // Restore tool executions from persisted messages (for tool widget display)
          for (const m of message.messages) {
            if (m.toolUses.length > 0) {
              restoreToolsForMessage(m.id, m.toolUses);
            }
          }

          // Reveal content after all state is updated
          setLoadingConversation(false);
          break;
        }

        case 'conversation:rewound': {
          // Prepare new messages - no filter needed as schema already ensures role is 'user' | 'assistant'
          const rewoundMessages = message.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            displayedContent: m.content,
          }));

          // Switch to new session FIRST (clears old tool state)
          switchSession(message.new_session_id);

          // Set all state atomically - React 18 batches these updates
          setMessages(rewoundMessages);
          setSessionId(message.new_session_id);
          setActiveConversation(message.new_session_id, `Rewind`);

          // Restore tool executions from persisted messages (for tool widget display)
          for (const m of message.messages) {
            if (m.toolUses && m.toolUses.length > 0) {
              restoreToolsForMessage(m.id, m.toolUses);
            }
          }
          break;
        }

        case 'inputMode:changed':
          setInputMode(message.mode);
          break;

        case 'model:changed':
          setModel(message.model);
          break;

        case 'tool:start': {
          const toolId = message.tool_id;
          // Get content offset from current messages (outside of setState to avoid render-time updates)
          const currentMsg = messagesRef.current.find((m) => m.id === message.message_id);
          const contentOffset = currentMsg?.content.length ?? 0;

          // Start tool tracking BEFORE updating messages (avoids setState during render)
          startTool(
            toolId,
            message.message_id,
            message.tool_name,
            message.tool_input,
            contentOffset
          );

          // Only update messages if we need to create a new assistant message
          if (!currentMsg) {
            setMessages((prev) => [
              ...prev,
              {
                id: message.message_id,
                role: 'assistant' as const,
                content: '',
                displayedContent: '',
                isStreaming: true,
              },
            ]);
          }
          break;
        }

        case 'tool:end': {
          const toolId = message.tool_id;

          // Get tool data BEFORE completing (still in activeTools)
          const toolState = useToolStore.getState();
          const tool = toolState.activeTools[toolId];

          // Track file changes for Edit/Write tools
          if (tool && message.success) {
            const toolName = tool.toolName.toLowerCase();
            const { addFileChange } = useFileStore.getState();

            if (toolName === 'edit') {
              const filePath = tool.toolInput['file_path'] as string;
              const rawOld = tool.toolInput['old_string'];
              const rawNew = tool.toolInput['new_string'];
              const oldString = typeof rawOld === 'string' ? rawOld : '';
              const newString = typeof rawNew === 'string' ? rawNew : '';
              addFileChange({
                path: filePath,
                type: 'modified',
                oldContent: oldString,
                newContent: newString,
                diff: computeSimpleDiff(oldString, newString),
                language: getLanguageFromPath(filePath),
              });
            }
            if (toolName === 'write') {
              const filePath = tool.toolInput['file_path'] as string;
              const rawContent = tool.toolInput['content'];
              const content = typeof rawContent === 'string' ? rawContent : '';
              addFileChange({
                path: filePath,
                type: 'created',
                oldContent: '',
                newContent: content,
                diff: computeSimpleDiff('', content),
                language: getLanguageFromPath(filePath),
              });
            }
          }

          // Complete the tool (moves to completedTools)
          completeTool(toolId, message.tool_output, message.success);
          break;
        }

        case 'permission:request':
          addPermissionRequest({
            requestId: message.request_id,
            sessionId: message.session_id,
            toolName: message.tool_name,
            toolInput: message.tool_input,
            createdAt: Date.now(),
          });
          break;

        case 'file:content': {
          // Use shared language detection (supports mjs, cjs, mts, cts, etc.)
          const language = getLanguageFromPath(message.path);
          const fileViewerStore = useFileViewerStore.getState();
          fileViewerStore.setFileContent(message.path, message.content, language);
          break;
        }

        // Handle other message types (no-op for this hook)
        case 'layout':
        case 'error':
        case 'terminal:output':
        case 'terminal:data':
        case 'terminal:created':
        case 'terminal:exited':
        case 'terminal:cwd':
        case 'terminal:command:start':
        case 'terminal:command:end':
        case 'terminal:capabilities':
        case 'terminal:title':
        case 'terminal:foreground':
        case 'file:changed':
        case 'file:written':
        case 'conversation:deleted':
        case 'agent:plan_mode':
        case 'agent:accept_mode':
        case 'panel:command':
        case 'panel:visible':
        case 'file:tree:response':
        case 'file:tree:error':
        case 'file:list:response':
        case 'thinking:changed':
        case 'browser:open':
        case 'browser:close':
        case 'browser:created':
        case 'browser:navigated':
        case 'browser:element-selected':
        case 'browser:loading':
        case 'browser:error':
        case 'browser:destroyed':
        case 'subagents:list:response':
        case 'subagents:created':
        case 'subagents:updated':
        case 'subagents:deleted':
        case 'subagents:error':
        case 'subagents:generated':
        case 'commands:list:response':
        case 'commands:created':
        case 'commands:updated':
        case 'commands:deleted':
        case 'commands:error':
        case 'commands:generated':
        case 'agent:checkpoint':
          break;
      }
    },
    [
      setWorkspace,
      setActiveConversation,
      setLoadingConversation,
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

      postMessage({
        type: 'message:send',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        content: text,
        context,
      });
    }
  }, [sessionId, pendingMessage, postMessage, updateConversationTitle]);

  const handleSend = useCallback(
    (
      text: string,
      contextFiles?: string[],
      images?: ImageAttachment[],
      elements?: ReactElementContext[]
    ): void => {
      if (!text) return;

      // If agent is running, queue the message for later
      if (isAgentRunning) {
        storeQueueMessage({ text, contextFiles, images, elements, sessionId });
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

      postMessage({
        type: 'message:send',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        content: text,
        context,
      });
    },
    [
      sessionId,
      isAgentRunning,
      messages.length,
      conversations,
      workspacePath,
      postMessage,
      updateConversationTitle,
      storeQueueMessage,
    ]
  );

  const handleStop = useCallback((): void => {
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
  }, [sessionId, isAgentRunning, postMessage, clearPermissions]);

  const handleRewind = useCallback(
    (messageId: string): void => {
      if (!sessionId || isAgentRunning) return;

      postMessage({
        type: 'conversation:rewind',
        uuid: crypto.randomUUID(),
        session_id: sessionId,
        message_id: messageId,
      });
    },
    [sessionId, isAgentRunning, postMessage]
  );

  const handlePermissionApprove = useCallback(
    (requestId: string, always?: boolean): void => {
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
    },
    [sessionId, postMessage, removePermissionRequest]
  );

  const handlePermissionDeny = useCallback(
    (requestId: string): void => {
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
    },
    [sessionId, postMessage, clearPermissions]
  );

  const handleOpenFile = useCallback(
    (path: string): void => {
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
    },
    [postMessage]
  );

  const handleOpenUrl = useCallback(
    (url: string): void => {
      postMessage({
        type: 'url:open',
        uuid: crypto.randomUUID(),
        url,
      });
    },
    [postMessage]
  );

  const handleModeChange = useCallback(
    (mode: 'default' | 'plan' | 'accept'): void => {
      setInputMode(mode);
      if (sessionId) {
        postMessage({
          type: 'inputMode:set',
          uuid: crypto.randomUUID(),
          session_id: sessionId,
          mode,
        });
      }
    },
    [sessionId, setInputMode, postMessage]
  );

  const handleThinkingModeChange = useCallback(
    (mode: ThinkingMode): void => {
      setThinkingMode(mode);
      if (sessionId) {
        postMessage({
          type: 'thinking:set',
          uuid: crypto.randomUUID(),
          session_id: sessionId,
          mode,
        });
      }
    },
    [sessionId, setThinkingMode, postMessage]
  );

  const handleModelChange = useCallback(
    (model: Model): void => {
      setModel(model);
      if (sessionId) {
        postMessage({
          type: 'model:set',
          uuid: crypto.randomUUID(),
          session_id: sessionId,
          model,
        });
      }
    },
    [sessionId, setModel, postMessage]
  );

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
