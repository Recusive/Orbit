import { createLogger } from '@orbit/common/lib';
import { startTransition } from 'react';

import type { ChatMessage } from '@/components/chat';
import type { ExtensionMessage, Model } from '@/types/protocol';

import { recordBrowserActivityFromAI } from '@/hooks/agent/handlers/browser-handlers';
import { conversationAddMessage, conversationList } from '@/lib/api';
import { wasMessagePersisted } from '@/lib/conversation-persistence';
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

/** Thinking chunk event for RAF batching - accumulates rapid thinking chunks */
interface ThinkingChunkEvent {
  messageId: string;
  thinking: string;
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
  worktreePath?: string | undefined;
}

interface MessageHandlerDeps {
  setWorkspace: (path: string) => void;
  workspacePath: string | null;
  activeWorktreePath: string | null;
  setActiveConversation: (sessionId: string | null, title: string | null) => void;
  setConversationTransitioning: (transitioning: boolean) => void;
  setConversations: (conversations: Conversation[]) => void;
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
  /**
   * Force-flush all pending RAF batchers synchronously.
   * Call this after buffer hydration to ensure messages are in state before
   * conversation:load is sent. The batchers remain usable after flushing.
   */
  flush: () => void;
}

export function createMessageHandler(deps: MessageHandlerDeps): MessageHandlerResult {
  const {
    setWorkspace,
    workspacePath,
    activeWorktreePath,
    setActiveConversation,
    setConversationTransitioning,
    setConversations,
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
  // Pending Chunk Length Tracking (Instance-Scoped)
  // ============================================
  // Track pending chunk lengths per message ID.
  // Used to calculate accurate contentOffset for tool placement.
  //
  // Problem: RAF batching causes a lag between when chunks are received and rendered.
  // When tool:start arrives, `currentMsg.content.length` may not include pending chunks.
  //
  // Solution: Track received-but-not-yet-rendered chunk lengths, add to displayed length.
  //
  // NOTE: This Map is scoped to this handler instance to prevent shared state corruption
  // across component remounts or hot reloads (see code review issue #1).
  const pendingChunkLengths = new Map<string, number>();

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

    // Apply all accumulated content in a single setMessages call.
    // After applying, clear pending lengths for these messages.
    //
    // PERF: Uses shallow-copy + index mutation instead of spread + slice.
    // The previous pattern created 3 intermediate arrays per message update:
    //   [...result.slice(0, idx), { ...msg }, ...result.slice(idx + 1)]
    // The new pattern creates 1 array copy (.slice()) + 1 object spread,
    // cutting GC pressure on this hot path (~140+ calls per streaming turn).
    setMessages((prev) => {
      // Shallow copy once — all mutations target this single copy
      const result = prev.slice();
      let mutated = false;

      for (const [messageId, accumulatedContent] of chunksByMessage) {
        // Clear pending length for this message - content is now rendered
        pendingChunkLengths.set(messageId, 0);
        const lastIdx = result.length - 1;

        // Sanity check: ensure valid array index before accessing
        if (lastIdx < 0) {
          // Empty array - create new message
          result.push({
            id: messageId,
            role: 'assistant' as const,
            content: accumulatedContent,
            displayedContent: accumulatedContent,
            isStreaming: true,
          });
          mutated = true;
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
          // Mutate the shallow copy in-place (1 object allocation, 0 array allocations)
          const newContent = lastMsg.content + accumulatedContent;
          result[lastIdx] = { ...lastMsg, content: newContent, displayedContent: newContent };
          mutated = true;
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
            result[existingIdx] = {
              ...existingMsg,
              content: newContent,
              displayedContent: newContent,
            };
            mutated = true;
          } else {
            // Create new streaming message (first chunk of a new response)
            result.push({
              id: messageId,
              role: 'assistant' as const,
              content: accumulatedContent,
              displayedContent: accumulatedContent,
              isStreaming: true,
            });
            mutated = true;
          }
        }
      }
      // Return same reference if nothing changed (React skips re-render)
      return mutated ? result : prev;
    });
  });

  // ============================================
  // RAF-Batched Thinking Chunk Processor
  // ============================================
  // Batches rapid thinking chunks into single state updates, same strategy as text chunks.
  // Extended thinking can emit many chunks per second during deep reasoning.
  const batchedThinkingHandler = rafBatch<ThinkingChunkEvent>((events) => {
    if (events.length === 0) return;

    // Accumulate all thinking content by message ID
    const thinkingByMessage = new Map<string, string>();
    for (const event of events) {
      const existing = thinkingByMessage.get(event.messageId) ?? '';
      thinkingByMessage.set(event.messageId, existing + event.thinking);
    }

    setMessages((prev) => {
      const result = prev.slice();
      let mutated = false;

      for (const [messageId, accumulatedThinking] of thinkingByMessage) {
        const lastIdx = result.length - 1;
        const lastMsg = lastIdx >= 0 ? result[lastIdx] : undefined;

        // Calculate current thinking duration
        const startTime = thinkingStartTimes.current.get(messageId) ?? Date.now();
        const currentDuration = Date.now() - startTime;

        if (lastMsg?.role === 'assistant' && lastMsg.id === messageId) {
          // Verify message ID matches to prevent thinking content misattribution
          // if multiple assistant messages exist. (Code review: Opus cycle 2, issue #8)
          const newThinking = (lastMsg.thinking ?? '') + accumulatedThinking;
          result[lastIdx] = {
            ...lastMsg,
            thinking: newThinking,
            thinkingDurationMs: currentDuration,
          };
          mutated = true;
        } else {
          // No assistant message exists yet — create one with just thinking
          result.push({
            id: messageId,
            role: 'assistant' as const,
            content: '',
            displayedContent: '',
            isStreaming: true,
            thinking: accumulatedThinking,
            thinkingDurationMs: currentDuration,
          });
          mutated = true;
        }
      }

      return mutated ? result : prev;
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
          // PERF: shallow-copy + index mutation instead of spread + slice
          setMessages((prev) => {
            const errorMsg = '[Some content may be missing due to a streaming error]';
            const lastIdx = prev.length - 1;
            const lastMsg = lastIdx >= 0 ? prev[lastIdx] : undefined;
            // Only add error indicator once per streaming session
            if (lastMsg?.role === 'assistant' && !lastMsg.content.includes(errorMsg)) {
              const copy = prev.slice();
              copy[lastIdx] = { ...lastMsg, content: lastMsg.content + `\n\n${errorMsg}` };
              return copy;
            }
            return prev;
          });
          break;
        }
        // Track pending chunk length for accurate tool placement
        // This is read by tool:start to calculate contentOffset that includes unrendered content
        const pending = pendingChunkLengths.get(message.message_id) ?? 0;
        pendingChunkLengths.set(message.message_id, pending + message.content.length);

        batchedChunkHandler({ messageId: message.message_id, content: message.content });
        break;
      }

      case 'agent:thinking': {
        // Record thinking start time on first chunk
        if (!thinkingStartTimes.current.has(message.message_id)) {
          thinkingStartTimes.current.set(message.message_id, Date.now());
        }

        // Queue thinking chunk to be processed in next RAF (same strategy as text chunks)
        batchedThinkingHandler({ messageId: message.message_id, thinking: message.thinking });
        break;
      }

      case 'agent:complete': {
        // Flush all pending batchers BEFORE marking message as complete.
        // This ensures all streamed content (text, thinking, tools) is rendered
        // before the message is finalized. Without this, the last batch could
        // appear AFTER isStreaming is set to false.
        batchedChunkHandler.cancel(FLUSH_PENDING);
        batchedThinkingHandler.cancel(FLUSH_PENDING);
        batchedToolHandler.cancel(FLUSH_PENDING);

        // Clean up pending chunk tracking for this message
        pendingChunkLengths.delete(message.message_id);

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

            // Get completed tools for this message to persist alongside the message.
            // NOTE: getState() returns the latest committed state (external call, not
            // the closured get()). getToolsForMessage() uses the internal get(), which
            // CAN be stale under persist(immer(...)). However, this runs during
            // agent:complete handling — AFTER completeTool() has committed — so the
            // immer middleware has already flushed and get() is current here.
            // (Code review: Codex cycle 1, issue #3)
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

            if (!wasMessagePersisted(message.session_id, completedMsg.id)) {
              // Include workspace/worktree context to ensure auto-created conversations
              // go to the correct location, not _global
              void conversationAddMessage(
                message.session_id,
                {
                  id: completedMsg.id,
                  role: 'assistant',
                  content: completedMsg.content,
                  ...(completedMsg.thinking ? { thinking: completedMsg.thinking } : {}),
                  createdAt: Date.now(),
                  ...(usageDto ? { usage: usageDto } : {}),
                  ...(toolUsesDto ? { toolUses: toolUsesDto } : {}),
                },
                workspacePath ?? undefined,
                activeWorktreePath ?? undefined
              );
            }

            const copy = prev.slice();
            copy[copy.length - 1] = completedMsg;
            return copy;
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

        // Refresh conversation list from disk after agent completes.
        // The SDK writes JSONL files during the turn — by the time agent:complete fires,
        // the file exists on disk. This is how new sessions appear in the sidebar
        // (Orbit is a pure reader — it never pre-adds sessions to the list).
        if (workspacePath) {
          void conversationList(workspacePath).then((conversations) => {
            setConversations(toConversationSummaries(conversations));
          });
        }
        break;
      }

      case 'agent:error': {
        // Flush all pending batchers before handling error
        // This ensures partial content is preserved before appending error message
        batchedChunkHandler.cancel(FLUSH_PENDING);
        batchedThinkingHandler.cancel(FLUSH_PENDING);

        // Clean up pending chunk tracking for this message
        pendingChunkLengths.delete(message.message_id);

        setIsAgentRunning(false);

        // Detect auth-related errors and provide a user-friendly message
        // instead of dumping the raw SDK error into the chat
        const rawError = message.error;
        const isAuthError =
          /no credentials found|oauth.*token|auth(?:entication|orization)?\s+(?:failed|error)|unauthorized/i.test(
            rawError
          );
        const errorContent = isAuthError
          ? 'Error: Authentication failed. Please run `claude login` in your terminal to re-authenticate.'
          : `Error: ${rawError}`;
        // PERF: shallow-copy + index mutation instead of spread + slice
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          const lastMsg = lastIdx >= 0 ? prev[lastIdx] : undefined;
          // If there's an existing assistant message (possibly interrupted), append error to it
          if (lastMsg?.role === 'assistant') {
            const newContent = lastMsg.content
              ? `${lastMsg.content}\n\n${errorContent}`
              : errorContent;
            const copy = prev.slice();
            copy[lastIdx] = {
              ...lastMsg,
              content: newContent,
              displayedContent: newContent,
              isStreaming: false,
            };
            return copy;
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

        // CRITICAL: Clear messages FIRST before session transition
        // This prevents race conditions where ChatArea remounts with key={newSessionId}
        // and reads stale messages before the setMessages([]) async state update completes.
        // The in-memory cache in useMessageState will be empty for this new session,
        // ensuring the component starts fresh.
        setMessages([]);

        // Switch file store to new session (saves old files to cache, starts fresh)
        useFileStore.getState().switchSession(message.session_id);

        // Now update session state (triggers ChatArea remount via key prop)
        // NOTE: We do NOT call addConversation() here. Orbit is a pure reader —
        // the sidebar populates only from SDK-written JSONL files on disk.
        // The new session will appear in the sidebar after agent:complete
        // triggers a disk refresh via conversationList().
        setSessionId(message.session_id);
        setActiveConversation(message.session_id, message.title);
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
              ...(c.worktree_path ? { worktreePath: c.worktree_path } : {}),
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
        // DO NOT clear pendingLoads here — the flag must survive until the
        // use-chat-messages.ts useEffect fires (after React commits the new
        // sessionId inside startTransition below). Clearing here causes a race:
        //   1. clearLoadPending(id) ← runs immediately
        //   2. startTransition → setSessionId(id) ← React defers
        //   3. useEffect sees new sessionId, checks hasLoadPending → false
        //   4. Sends DUPLICATE conversation:load 💥
        // The flag is cleared by use-chat-messages.ts when it sees the pending
        // load, and the 30s timeout in message-buffer-store provides safety cleanup.
        //
        // TIMING CONTRACT (happens-before chain):
        //   setTimeout(0) → startTransition(setMessages+setSessionId) → React commit
        //   → useEffect sees new sessionId → clearLoadPending(id)
        //
        // The buffer drains happen-after startTransition commits, so
        // clearLoadPending in the useEffect fires before any new streaming
        // messages are processed. New messages arriving between setTimeout(0)
        // and useEffect firing are buffered safely because pendingLoads is
        // still set. (Code review: Opus cycle 1, issue #4)

        // Switch file store to new session (saves old files to cache, restores from cache if exists)
        useFileStore.getState().switchSession(message.session_id);

        // Check cache first for messages, then fall back to messagesRef for current session.
        // This handles the race condition where buffer hydration called flush() → setMessages(),
        // but the cache sync useEffect hasn't run yet (cache is populated async via useEffect).
        // By checking messagesRef for the current session, we capture the freshly-hydrated messages.
        let cachedMessages = messagesCache.current.get(message.session_id);
        if (
          (!cachedMessages || cachedMessages.length === 0) &&
          sessionIdRef.current === message.session_id &&
          messagesRef.current.length > 0
        ) {
          cachedMessages = messagesRef.current;
        }

        // Break out of the postMessage event handler with setTimeout(0) before
        // processing data. The IPC message event runs synchronously — without this
        // yield, all data processing + React rendering blocks the main thread in a
        // single 1,097ms task (V3 profiling). setTimeout(0) lets the browser:
        //   1. Finish the message event (~0ms of work left)
        //   2. Run any pending paint/layout
        //   3. Process our data + transition in a separate task
        setTimeout(() => {
          startTransition(() => {
            // Prepare new messages (filter out system messages as they're not displayed)
            const backendMessages = message.messages
              .filter(
                (m): m is typeof m & { role: 'user' | 'assistant' } =>
                  m.role === 'user' || m.role === 'assistant'
              )
              .map((m) => {
                const base = {
                  id: m.id,
                  role: m.role,
                  content: m.content,
                  displayedContent: m.content,
                };
                if (m.isInterrupted === true) {
                  return { ...base, isInterrupted: true as const };
                }
                return base;
              });

            // Merge backend and cache messages:
            // - User messages ONLY come from backend (auto-start saves them immediately)
            // - Assistant messages prefer cache (may have live streaming content)
            // This handles the case where buffer hydration added streaming response
            // but the user message wasn't in the buffer (it's in backend storage)
            let newMessages: typeof backendMessages;
            if (!cachedMessages || cachedMessages.length === 0) {
              // No cache - use backend directly
              newMessages = backendMessages;
            } else if (backendMessages.length === 0) {
              // No backend - use cache directly
              newMessages = cachedMessages;
            } else {
              // Both exist - merge: user messages from backend, assistant from cache if exists
              const cachedById = new Map(cachedMessages.map((m) => [m.id, m]));
              const backendById = new Map(backendMessages.map((m) => [m.id, m]));

              // Start with all backend messages (this gives us user messages)
              const merged = new Map(backendById);

              // For each cached message, prefer cache version (has latest streaming content)
              for (const [id, msg] of cachedById) {
                merged.set(id, msg);
              }

              // Also add any cached messages that aren't in backend (new streaming messages)
              // These might have different IDs if streaming started after backend load

              // Convert to array, preserving order: backend messages first, then any new cached ones
              const backendOrder = backendMessages.map((m) => m.id);
              const cachedOrder = cachedMessages.map((m) => m.id);

              // Build ordered result: backend order for backend messages, then append new cached messages
              const orderedIds = [...new Set([...backendOrder, ...cachedOrder])];
              newMessages = orderedIds
                .map((id) => merged.get(id))
                .filter((m): m is NonNullable<typeof m> => m !== undefined);
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

            // Restore usage from persisted data within the transition
            // This ensures the session cache is pre-populated with correct usage
            if (processedMessageIds.length > 0) {
              restoreSessionUsage(message.session_id, cumulativeUsage, processedMessageIds);
            }

            setMessages(newMessages);
            setSessionId(message.session_id);
            setActiveConversation(message.session_id, message.title);
            switchSession(message.session_id);

            // Restore tool executions from persisted messages (for tool widget display).
            // NOTE: This for-loop runs synchronously — React cannot interrupt between
            // individual restoreToolsForMessage calls. startTransition only yields
            // between React renders, not between synchronous Zustand set() calls.
            // (Code review: Opus cycle 3, issue #1)
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
                    ...(t.contentOffset !== undefined ? { contentOffset: t.contentOffset } : {}),
                  }))
                );
              }
            }
          });
        }, 0);

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

        // Switch file store to new session (rewind creates a new fork, so start fresh)
        useFileStore.getState().switchSession(message.new_session_id);

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

        // Calculate accurate contentOffset for tool widget placement.
        //
        // Challenge: RAF batching causes a lag between when chunks are received and rendered.
        // When tool:start arrives, `currentMsg.content.length` may not include pending chunks
        // that have been received but not yet processed by the RAF callback.
        //
        // Solution: Track pending chunk lengths in pendingChunkLengths map. The tool position
        // should be at: displayedLength + pendingLength. This accounts for both rendered AND
        // received-but-not-yet-rendered content.
        //
        // NOTE: We do NOT flush batchedChunkHandler here because the flush calls setMessages()
        // which queues a React state update. Since messagesRef.current isn't updated until the
        // next React commit, the !currentMsg check below would create a DUPLICATE message.
        //
        // Fast path: check last message first (most common case during streaming)
        // This avoids O(n) scan through all messages when the target is almost always at the end.
        const messages = messagesRef.current;
        const lastMsg = messages.at(-1);
        const currentMsg =
          lastMsg?.id === message.message_id
            ? lastMsg
            : messages.find((m) => m.id === message.message_id);

        const displayedLength = currentMsg?.content.length ?? 0;
        const pendingLength = pendingChunkLengths.get(message.message_id) ?? 0;
        const maxKnownLength = displayedLength + pendingLength;

        // Use frontend-calculated length, clamped by backend's offset if available
        // The min() handles edge cases where backend has flushed but chunks haven't arrived yet
        const contentOffset =
          message.content_offset !== undefined
            ? Math.min(message.content_offset, maxKnownLength)
            : maxKnownLength;

        // Call startTool synchronously for immediate tool widget rendering.
        // Tool events are infrequent (1-5 per turn vs 100+ text chunks), so
        // RAF batching provides negligible performance benefit but delays the
        // Zustand store update that triggers the tool widget to appear.
        startTool(toolId, message.message_id, toolName, message.tool_input, contentOffset);

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
        // Flush pending text chunks so the assistant message is in React state
        // BEFORE the permission modal appears. This ensures the tool widget
        // (already added synchronously by the tool:start handler above) has
        // a message row to render in.
        batchedChunkHandler.cancel(FLUSH_PENDING);

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
        // Clean up cached data for deleted conversation to prevent memory leaks
        clearSessionTools(message.session_id);
        useFileStore.getState().clearSessionFiles(message.session_id);
        break;
      }
      case 'agent:plan_mode':
      case 'agent:accept_mode':
      case 'panel:command':
      case 'panel:visible':
      case 'file:tree:response':
      case 'file:tree:error':
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
      case 'browser:tool_request':
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
    batchedThinkingHandler.cancel();
    batchedToolHandler.cancel();
    // Clear pending chunk tracking to prevent memory leaks (code review issue #3)
    pendingChunkLengths.clear();
  };

  // Force-flush pending RAF batchers synchronously.
  // Used after buffer hydration to ensure messages are in React state
  // before conversation:load effect runs. The batchers remain usable.
  const flush = (): void => {
    batchedChunkHandler.cancel(FLUSH_PENDING);
    batchedThinkingHandler.cancel(FLUSH_PENDING);
    batchedToolHandler.cancel(FLUSH_PENDING);
  };

  return { handleMessage, cleanup, flush };
}
