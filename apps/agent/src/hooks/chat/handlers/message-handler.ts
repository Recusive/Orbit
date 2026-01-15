import { createLogger } from '@orbit/common/lib';

import type { ChatMessage } from '@/components/chat';
import type { ExtensionMessage, Model } from '@/types/protocol';

import { recordBrowserActivityFromAI } from '@/hooks/agent/handlers/browser-handlers';
import { conversationAddMessage, conversationList } from '@/lib/api';
import { toConversationSummaries } from '@/lib/mappers';
import { computeSimpleDiff, getLanguageFromPath } from '@/lib/utils/diff-utils';
import { rafBatch } from '@/lib/utils/event-batcher';
import { useToolStore } from '@/stores/agent/tool-store';
import { useFileStore } from '@/stores/file/file-store';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';

const logger = createLogger('MessageHandler');

// ============================================
// Event Batching Constants
// ============================================

/**
 * When cancelling a RAF batcher, flush=true processes pending items before clearing.
 * Use FLUSH_PENDING when you want to ensure all data is rendered (e.g., on agent:complete).
 * Use false (default) when unmounting and state may already be invalid.
 */
const FLUSH_PENDING = true;

// ============================================
// Event Batching Types
// ============================================

/** Text chunk event for RAF batching - accumulates rapid streaming chunks */
interface TextChunkEvent {
  messageId: string;
  content: string;
}

interface ToolStartEvent {
  type: 'start';
  toolId: string;
  messageId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  contentOffset: number;
}

interface ToolEndEvent {
  type: 'end';
  toolId: string;
  toolOutput: unknown;
  success: boolean;
}

type ToolEvent = ToolStartEvent | ToolEndEvent;

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
  clearSessionTools: (sessionId: string) => void;
  onSessionCreated?: ((sessionId: string, title: string) => void) | undefined;
  setSessionId: React.Dispatch<React.SetStateAction<string>>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setIsAgentRunning: React.Dispatch<React.SetStateAction<boolean>>;
  sessionIdRef: React.RefObject<string>;
  messagesRef: React.RefObject<ChatMessage[]>;
  messagesCache: React.RefObject<Map<string, ChatMessage[]>>;
  thinkingStartTimes: React.RefObject<Map<string, number>>;
}

/** Return type for createMessageHandler - handler function plus cleanup */
export interface MessageHandlerResult {
  /** Handle incoming extension messages */
  handleMessage: (message: ExtensionMessage) => void;
  /** Cleanup function - cancels pending RAF batchers. Call on unmount. */
  cleanup: () => void;
}

export function createMessageHandler(deps: MessageHandlerDeps): MessageHandlerResult {
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
    clearSessionTools,
    onSessionCreated,
    setSessionId,
    setMessages,
    setIsAgentRunning,
    sessionIdRef,
    messagesRef,
    messagesCache,
    thinkingStartTimes,
  } = deps;

  // ============================================
  // RAF-Batched Text Chunk Processor
  // ============================================
  // Batches rapid text chunks (140+ during streaming) into single state updates.
  // Reduces 58ms jank from per-chunk React state updates.
  const batchedChunkHandler = rafBatch<TextChunkEvent>((events) => {
    if (events.length === 0) return;

    // Accumulate all chunks by message ID (in case multiple messages are streaming)
    const chunksByMessage = new Map<string, string>();
    for (const event of events) {
      const existing = chunksByMessage.get(event.messageId) ?? '';
      chunksByMessage.set(event.messageId, existing + event.content);
    }

    // Apply all accumulated content in a single setMessages call
    setMessages((prev) => {
      let result = prev;
      for (const [messageId, accumulatedContent] of chunksByMessage) {
        const lastIdx = result.length - 1;

        // Sanity check: ensure valid array index before accessing
        if (lastIdx < 0) {
          // Empty array - create new message below
          result = [
            ...result,
            {
              id: messageId,
              role: 'assistant' as const,
              content: accumulatedContent,
              displayedContent: accumulatedContent,
              isStreaming: true,
            },
          ];
          continue;
        }

        const lastMsg = result[lastIdx];

        // STRICT MESSAGE MATCHING:
        // Only append to a message if the ID matches exactly. This prevents race conditions
        // where events for message B could be appended to message A if A is still streaming.
        //
        // The backend batching (50ms intervals) provides stable message IDs from the SDK.
        // If a chunk arrives before its message exists, we create a new message with that ID.
        // This is correct behavior - the ID comes from the SDK and identifies the turn.
        //
        // Previous fallback `|| lastMsg.isStreaming` was REMOVED because it caused:
        // - Message A completes, B's first chunk arrives before B's message object created
        // - B's chunk appended to A because A was last assistant message still marked streaming
        // - Result: Data corruption where B's content merged into A
        if (lastMsg?.role === 'assistant' && lastMsg.id === messageId) {
          // Fast path: append to last assistant message with matching ID (common case)
          const newContent = lastMsg.content + accumulatedContent;
          result = [
            ...result.slice(0, lastIdx),
            { ...lastMsg, content: newContent, displayedContent: newContent },
          ];
        } else {
          // Fallback: O(n) scan for out-of-order messages. This is acceptable because:
          // 1. It's rare - normal flow uses fast path above (last message matches)
          // 2. Message arrays are typically <100 items
          // 3. Adding a Map index would complicate state management for minimal gain
          // Include role check in findIndex for proper type narrowing
          const existingIdx = result.findIndex((m) => m.id === messageId && m.role === 'assistant');
          if (existingIdx !== -1) {
            // Append to existing assistant message found earlier in array
            // Safe access: findIndex returned valid index, and we checked role in predicate
            const existingMsg = result[existingIdx];
            if (!existingMsg) continue; // Defensive: should never happen given findIndex check
            const newContent = existingMsg.content + accumulatedContent;
            result = [
              ...result.slice(0, existingIdx),
              { ...existingMsg, content: newContent, displayedContent: newContent },
              ...result.slice(existingIdx + 1),
            ];
          } else {
            // Create new streaming message (first chunk of a new response)
            result = [
              ...result,
              {
                id: messageId,
                role: 'assistant' as const,
                content: accumulatedContent,
                displayedContent: accumulatedContent,
                isStreaming: true,
              },
            ];
          }
        }
      }
      return result;
    });
  });

  // ============================================
  // RAF-Batched Tool Event Processor
  // ============================================
  // Batches tool:start and tool:end events to reduce React re-renders.
  // Multiple tool events in the same JS tick are processed together in one RAF callback.
  const batchedToolHandler = rafBatch<ToolEvent>((events) => {
    // Process all tool events in a single batch
    for (const event of events) {
      if (event.type === 'start') {
        startTool(
          event.toolId,
          event.messageId,
          event.toolName,
          event.toolInput,
          event.contentOffset
        );
      } else {
        // For tool:end, we need to handle file changes too
        // Get tool data BEFORE completing (still in activeTools)
        const toolState = useToolStore.getState();
        const tool = toolState.activeTools[event.toolId];

        // Track file changes for Edit/Write tools
        if (tool && event.success) {
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
        completeTool(event.toolId, event.toolOutput, event.success);
      }
    }
  });

  const handleMessage = (message: ExtensionMessage): void => {
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
          // Load conversations for this workspace (Claude Code-style folder isolation)
          void conversationList(message.cwd).then((conversations) => {
            setConversations(toConversationSummaries(conversations));
          });
        }
        break;

      case 'agent:chunk': {
        // Queue chunk to be processed in next RAF (reduces 58ms jank from rapid chunks)
        // Multiple chunks arriving in the same frame are batched into a single state update
        if (!message.message_id) {
          // CRITICAL: This shouldn't happen in normal flow - backend batching provides stable IDs.
          // If it does, we skip the chunk to prevent data corruption.
          // Using a fallback ID risks merging chunks from different turns into one message.
          logger.error(
            `CRITICAL: Chunk received without message_id - content will be lost. ` +
              `Session: ${message.session_id}, Length: ${String(message.content.length)}, ` +
              `Preview: "${message.content.slice(0, 50)}...". Check agent-bridge batching.`
          );
          // Show user-visible error so they know something went wrong
          setMessages((prev) => {
            const errorMsg = '[Some content may be missing due to a streaming error]';
            const lastMsg = prev[prev.length - 1];
            // Only add error indicator once per streaming session
            if (lastMsg?.role === 'assistant' && !lastMsg.content.includes(errorMsg)) {
              return [
                ...prev.slice(0, -1),
                { ...lastMsg, content: lastMsg.content + `\n\n${errorMsg}` },
              ];
            }
            return prev;
          });
          break;
        }
        batchedChunkHandler({ messageId: message.message_id, content: message.content });
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
        // Flush any pending text chunks BEFORE marking message as complete
        // This ensures all streamed content is rendered before the message is finalized.
        // Without this, the last chunk batch could appear AFTER isStreaming is set to false.
        batchedChunkHandler.cancel(FLUSH_PENDING);

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
        // Flush any pending text chunks before handling error
        // This ensures partial content is preserved before appending error message
        batchedChunkHandler.cancel(FLUSH_PENDING);

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
        const toolName = message.tool_name;

        // Record browser activity when AI uses Playwright MCP tools
        // This resets the idle timer to prevent auto-close during AI automation
        if (toolName.toLowerCase().includes('browser')) {
          recordBrowserActivityFromAI();
        }

        // Use backend-provided content_offset for accurate tool positioning.
        // The backend tracks accumulated text length and provides this when emitting tool events.
        // Only fall back to computed offset if backend didn't provide one (legacy compatibility).
        //
        // Fast path: check last message first (most common case during streaming)
        // This avoids O(n) scan through all messages when the target is almost always at the end.
        const messages = messagesRef.current;
        const lastMsg = messages.at(-1);
        const currentMsg =
          lastMsg?.id === message.message_id
            ? lastMsg
            : messages.find((m) => m.id === message.message_id);
        const contentOffset = message.content_offset ?? currentMsg?.content.length ?? 0;

        // Queue tool start to be processed in next RAF (reduces re-renders)
        batchedToolHandler({
          type: 'start',
          toolId,
          messageId: message.message_id,
          toolName,
          toolInput: message.tool_input,
          contentOffset,
        });

        // Only update messages if we need to create a new assistant message
        // This stays synchronous because we need the message for streaming
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
        // Queue tool end to be processed in next RAF (reduces re-renders)
        // File change tracking is handled in the batched processor
        batchedToolHandler({
          type: 'end',
          toolId: message.tool_id,
          toolOutput: message.tool_output,
          success: message.success,
        });
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
        break;
      case 'conversation:deleted': {
        // Clean up tool data for deleted conversation
        clearSessionTools(message.session_id);
        break;
      }
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
      case 'browser:detected':
      case 'browser:navigated':
      case 'browser:element-selected':
      case 'browser:loading':
      case 'browser:error':
      case 'browser:cleared':
      case 'browser:created':
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

  // Cleanup function cancels any pending RAF callbacks to prevent
  // firing into dead state after component unmount
  const cleanup = (): void => {
    batchedChunkHandler.cancel();
    batchedToolHandler.cancel();
  };

  return { handleMessage, cleanup };
}
