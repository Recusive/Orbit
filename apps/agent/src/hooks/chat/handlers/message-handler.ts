import type { ChatMessage } from '@/components/chat';
import type { ExtensionMessage, Model } from '@/types/protocol';

import { conversationAddMessage } from '@/lib/api/backend';
import { computeSimpleDiff, getLanguageFromPath } from '@/lib/utils/diff-utils';
import { useToolStore } from '@/stores/agent/tool-store';
import { useFileStore } from '@/stores/file/file-store';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';

interface Conversation {
  sessionId: string;
  title: string;
  updatedAt: number;
  messageCount: number;
  workspacePath?: string | undefined;
}

interface MessageHandlerDeps {
  setWorkspace: (path: string) => void;
  workspacePath: string | null;
  setActiveConversation: (sessionId: string | null, title: string | null) => void;
  setConversationTransitioning: (transitioning: boolean) => void;
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  setInputMode: (mode: 'default' | 'plan' | 'accept') => void;
  setModel: (model: Model) => void;
  startTool: (
    toolId: string,
    messageId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    contentOffset: number
  ) => void;
  completeTool: (toolId: string, toolOutput: unknown, success: boolean) => void;
  addPermissionRequest: (request: {
    requestId: string;
    sessionId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    createdAt: number;
  }) => void;
  addUsage: (
    messageId: string,
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    },
    totalCostUsd?: number
  ) => void;
  switchSession: (sessionId: string) => void;
  restoreSessionUsage: (
    sessionId: string,
    usage: {
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens: number;
      cacheCreationInputTokens: number;
      totalCostUsd: number;
    },
    processedMessageIds: string[]
  ) => void;
  restoreToolsForMessage: (
    messageId: string,
    toolUses: {
      id: string;
      name: string;
      input: Record<string, unknown>;
      output?: string;
      success: boolean;
    }[]
  ) => void;
  onSessionCreated?: ((sessionId: string, title: string) => void) | undefined;
  setSessionId: React.Dispatch<React.SetStateAction<string>>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setIsAgentRunning: React.Dispatch<React.SetStateAction<boolean>>;
  sessionIdRef: React.RefObject<string>;
  messagesRef: React.RefObject<ChatMessage[]>;
  messagesCache: React.RefObject<Map<string, ChatMessage[]>>;
  thinkingStartTimes: React.RefObject<Map<string, number>>;
}

export function createMessageHandler(
  deps: MessageHandlerDeps
): (message: ExtensionMessage) => void {
  const {
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
  } = deps;

  return (message: ExtensionMessage): void => {
    switch (message.type) {
      case 'system:init':
        // Only set sessionId if we don't already have an active session with messages
        // This prevents browser panel opening from resetting the session
        if (!sessionIdRef.current || messagesRef.current.length === 0) {
          setSessionId(message.session_id);
        }
        // Only set workspace if we don't already have one
        // This prevents file tree operations from overwriting the root workspace
        if (message.cwd && !workspacePath) {
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
          const usageForStore = {
            input_tokens: message.usage.input_tokens,
            output_tokens: message.usage.output_tokens,
            ...(message.usage.cache_read_input_tokens !== undefined
              ? { cache_read_input_tokens: message.usage.cache_read_input_tokens }
              : {}),
            ...(message.usage.cache_creation_input_tokens !== undefined
              ? { cache_creation_input_tokens: message.usage.cache_creation_input_tokens }
              : {}),
          };
          addUsage(message.message_id, usageForStore, message.total_cost_usd);
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
          ...(message.workspace_path ? { workspacePath: message.workspace_path } : {}),
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
              ...(c.workspace_path ? { workspacePath: c.workspace_path } : {}),
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
            restoreToolsForMessage(
              m.id,
              m.toolUses.map((t) => ({
                id: t.id,
                name: t.name,
                input: t.input,
                success: t.success,
                ...(t.output !== undefined ? { output: t.output } : {}),
              }))
            );
          }
        }

        // NOTE: Do NOT call setLoadingConversation(false) here!
        // The useLayoutEffect in chat-area.tsx will handle revealing content
        // after the layout has stabilized. This prevents the flash caused by
        // content becoming visible before React has finished rendering.
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
            restoreToolsForMessage(
              m.id,
              m.toolUses.map((t) => ({
                id: t.id,
                name: t.name,
                input: t.input,
                success: t.success,
                ...(t.output !== undefined ? { output: t.output } : {}),
              }))
            );
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
        startTool(toolId, message.message_id, message.tool_name, message.tool_input, contentOffset);

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
  };
}
