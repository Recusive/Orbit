import { createLogger } from '@orbit/common/lib';
import { startTransition } from 'react';

import type { ChatMessage } from '@/components/chat';
import type { ExtensionMessage, Model } from '@/types/protocol';

import { getActiveChain } from '@/components/chat/messages/message-utils';
import { recordBrowserActivityFromAI } from '@/hooks/agent/handlers/browser-handlers';
import { remapCreatedSession } from '@/hooks/agent/use-tauri-session';
import { conversationAddMessage, conversationList } from '@/lib/api';
import { wasMessagePersisted } from '@/lib/conversation-persistence';
import { toConversationSummaries } from '@/lib/mappers';
import { computeSimpleDiff, getLanguageFromPath } from '@/lib/utils/diff-utils';
import { rafBatch } from '@/lib/utils/event-batcher';
import { useCheckpointStore } from '@/stores/agent/checkpoint-store';
import { useMessageBufferStore } from '@/stores/agent/message-buffer-store';
import { useToolStore } from '@/stores/agent/tool-store';
import { useFileStore } from '@/stores/file/file-store';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';
import { useUIStore } from '@/stores/ui/ui-store';

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
    processedMessageIds?: string[]
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
  /** Set to true by handleStop, cleared by agent:complete/agent:error.
   *  Prevents rewind from firing while SDK is still flushing JSONL writes. */
  isStopPendingRef: React.RefObject<boolean>;
  sessionIdRef: React.RefObject<string>;
  messagesRef: React.RefObject<ChatMessage[]>;
  messagesCache: React.RefObject<Map<string, ChatMessage[]>>;
  thinkingStartTimes: React.RefObject<Map<string, number>>;
  /** Tracks whether non-thinking content arrived since the last thinking chunk per message ID. */
  hasContentSinceLastThinking: React.RefObject<Map<string, boolean>>;
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
  // Track Orbit session IDs that were remapped to SDK session IDs.
  // Used to ignore stale conversation:loaded responses for the old Orbit ID.
  const remappedOrbitIds = new Set<string>();

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
    isStopPendingRef,
    sessionIdRef,
    messagesRef,
    messagesCache,
    thinkingStartTimes,
    hasContentSinceLastThinking,
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
          // Empty array - create new message with null parentUuid (first message)
          result.push({
            id: messageId,
            role: 'assistant' as const,
            content: accumulatedContent,
            displayedContent: accumulatedContent,
            isStreaming: true,
            parentUuid: null,
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

          // Finalize current thinking block duration and mark thinking phase complete
          let updatedBlocks = lastMsg.thinkingBlocks;
          if (
            lastMsg.isThinkingActive === true &&
            updatedBlocks !== undefined &&
            updatedBlocks.length > 0
          ) {
            updatedBlocks = [...updatedBlocks];
            const lastBlock = updatedBlocks[updatedBlocks.length - 1];
            if (lastBlock !== undefined) {
              const startTime = thinkingStartTimes.current.get(messageId) ?? Date.now();
              updatedBlocks[updatedBlocks.length - 1] = {
                ...lastBlock,
                durationMs: Date.now() - startTime,
              };
            }
          }
          hasContentSinceLastThinking.current.set(messageId, true);

          result[lastIdx] = {
            ...lastMsg,
            content: newContent,
            displayedContent: newContent,
            isThinkingActive: false,
            ...(updatedBlocks !== undefined ? { thinkingBlocks: updatedBlocks } : {}),
          };
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
            // Set parentUuid to the last message's ID to maintain the chain
            const parentUuid = result[result.length - 1]?.id ?? null;
            result.push({
              id: messageId,
              role: 'assistant' as const,
              content: accumulatedContent,
              displayedContent: accumulatedContent,
              isStreaming: true,
              parentUuid,
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
  // Multi-block: when non-thinking content (text/tools) arrives between thinking phases,
  // a new ThinkingBlock is created so each phase renders as a separate ThinkingBox.
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

        if (lastMsg?.role === 'assistant' && lastMsg.id === messageId) {
          // Verify message ID matches to prevent thinking content misattribution
          // if multiple assistant messages exist. (Code review: Opus cycle 2, issue #8)

          // Determine if we need a new thinking block (non-thinking content arrived since last thinking)
          const needsNewBlock = hasContentSinceLastThinking.current.get(messageId) === true;
          const blocks = [...(lastMsg.thinkingBlocks ?? [])];

          if (blocks.length === 0 || needsNewBlock) {
            // Start a new thinking block — either first block or content arrived since last thinking
            thinkingStartTimes.current.set(messageId, Date.now());
            blocks.push({ content: accumulatedThinking, durationMs: 0 });
            hasContentSinceLastThinking.current.set(messageId, false);
          } else {
            // Append to the current (last) thinking block
            const lastBlock = blocks[blocks.length - 1];
            if (lastBlock !== undefined) {
              const startTime = thinkingStartTimes.current.get(messageId) ?? Date.now();
              const currentDuration = Date.now() - startTime;
              blocks[blocks.length - 1] = {
                content: lastBlock.content + accumulatedThinking,
                durationMs: currentDuration,
              };
            }
          }

          // Also maintain flat thinking string for persistence compatibility
          const newThinking = (lastMsg.thinking ?? '') + accumulatedThinking;

          result[lastIdx] = {
            ...lastMsg,
            thinking: newThinking,
            thinkingBlocks: blocks,
            isThinkingActive: true,
          };
          mutated = true;
        } else {
          // No assistant message exists yet — create one with just thinking
          // Set parentUuid to the last message's ID to maintain the chain
          const parentUuid = result[result.length - 1]?.id ?? null;
          thinkingStartTimes.current.set(messageId, Date.now());
          hasContentSinceLastThinking.current.set(messageId, false);
          result.push({
            id: messageId,
            role: 'assistant' as const,
            content: '',
            displayedContent: '',
            isStreaming: true,
            thinking: accumulatedThinking,
            thinkingBlocks: [{ content: accumulatedThinking, durationMs: 0 }],
            isThinkingActive: true,
            parentUuid,
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
      case 'system:init': {
        // Remap to SDK session ID so our session matches the JSONL filename on disk.
        // The SDK writes `{sdk_session_id}.jsonl` — if we keep using Orbit's UUID,
        // the sidebar (populated from disk) won't match our active session.
        const sdkSessionId = message.sdk_session_id;
        const currentSessionId = sessionIdRef.current;

        if (sdkSessionId && currentSessionId && sdkSessionId !== currentSessionId) {
          // Mark the old temp ID so stale conversation:loaded responses are ignored
          remappedOrbitIds.add(currentSessionId);
          // Migrate messages cache from temp key to SDK ID
          const cached = messagesCache.current.get(currentSessionId);
          if (cached) {
            messagesCache.current.set(sdkSessionId, cached);
            messagesCache.current.delete(currentSessionId);
          }
          // Update createdSessions so ensureSession() recognises the new ID
          remapCreatedSession(currentSessionId, sdkSessionId);
          // Migrate tool store session cache (usage, tools) from old → new ID
          // so token counts survive when the user navigates back to this conversation.
          useToolStore.getState().remapSession(currentSessionId, sdkSessionId);
          // Migrate checkpoint store session data (turnStart/turnEnd checkpoints, pending messages)
          // so rewind correctly associates checkpoints with the new SDK session ID.
          useCheckpointStore.getState().remapSession(currentSessionId, sdkSessionId);

          // Check if this is a forked session from a rewind operation.
          // The SDK fork is lazy - we only know the actual new session ID now.
          // Copy messages from the original session to the new forked session.
          // Check if this is a post-rewind session remap.
          // Consume the pending fork flag to prevent stale state, but do NOT
          // call conversationFork/conversationDelete from here. The agent-bridge's
          // forkSessionAt already handles JSONL lifecycle:
          //   1. Truncates the original JSONL
          //   2. Copies it to an intermediate session ID (for SDK to resume from)
          //   3. Deletes the original JSONL immediately after copy
          //   4. Deletes the intermediate JSONL when system:init fires
          //
          // Previously, calling conversationFork here caused a RACE CONDITION:
          // the Rust conversationFork wrote to {sdkSessionId}.jsonl at the same
          // time the SDK was writing to that same file, corrupting it. This led to:
          //   - Empty user message bubbles after relaunch
          //   - API error 400 ("cache_control cannot be set for empty text blocks")
          //   - Missing tool widgets after relaunch
          const rewindMessageId = useCheckpointStore
            .getState()
            .consumePendingConversationFork(currentSessionId);
          if (rewindMessageId) {
            logger.debug('Post-rewind session remap (agent-bridge handles JSONL cleanup)', {
              originalSessionId: currentSessionId,
              newSessionId: sdkSessionId,
              rewindMessageId,
            });
          }

          // Mark the new SDK session ID as "load pending" so the useEffect in
          // use-chat-messages.ts skips the redundant conversation:load.
          // Without this, changing sessionId triggers a load for the new ID,
          // but the JSONL is brand new and may not contain the post-rewind
          // user message yet — the backend-backbone merge would drop live messages.
          useMessageBufferStore.getState().markLoadPending(sdkSessionId);

          // Switch to the SDK session ID
          setSessionId(sdkSessionId);
          setActiveConversation(sdkSessionId, null);
          switchSession(sdkSessionId);
          // Remove stale temp entry from sidebar (if it appeared before remap)
          useUIStore.getState().removeConversation(currentSessionId);
        } else if (!sessionIdRef.current || messagesRef.current.length === 0) {
          // No active session yet — adopt whatever session_id we received
          setSessionId(message.session_id);
        }

        // Only set workspace if we don't already have one
        // This prevents file tree operations from overwriting the root workspace
        if (message.cwd && !workspacePath) {
          setWorkspace(message.cwd);
          // Load conversations for this workspace (Claude Code-style folder isolation)
          void conversationList(message.cwd)
            .then((conversations) => {
              setConversations(toConversationSummaries(conversations));
            })
            .catch((err: unknown) => {
              logger.error('Failed to load conversation list', err);
            });
        }
        break;
      }

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

        // Clean up the tracking refs
        thinkingStartTimes.current.delete(message.message_id);
        hasContentSinceLastThinking.current.delete(message.message_id);

        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          // Only update if still streaming (not already interrupted)
          if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
            // Finalize the last thinking block's duration if the agent was still thinking at completion
            let finalBlocks = lastMsg.thinkingBlocks;
            if (
              finalBlocks !== undefined &&
              finalBlocks.length > 0 &&
              finalThinkingDuration !== undefined &&
              lastMsg.isThinkingActive === true
            ) {
              finalBlocks = [...finalBlocks];
              const lastBlock = finalBlocks[finalBlocks.length - 1];
              if (lastBlock !== undefined) {
                finalBlocks[finalBlocks.length - 1] = {
                  ...lastBlock,
                  durationMs: finalThinkingDuration,
                };
              }
            }

            const completedMsg = {
              ...lastMsg,
              isStreaming: false,
              isThinkingActive: false,
              // Update final thinking duration if we have one
              ...(finalThinkingDuration !== undefined && lastMsg.thinking
                ? { thinkingDurationMs: finalThinkingDuration }
                : {}),
              ...(finalBlocks !== undefined ? { thinkingBlocks: finalBlocks } : {}),
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
                  // Include parentUuid for Claude Code-style rewind chain
                  ...(completedMsg.parentUuid !== undefined
                    ? { parentUuid: completedMsg.parentUuid }
                    : {}),
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
        // Clear the stop-pending gate — SDK has finished flushing JSONL, rewind is now safe.
        isStopPendingRef.current = false;

        // Refresh conversation list from disk after agent completes.
        // The SDK writes JSONL files during the turn — by the time agent:complete fires,
        // the file exists on disk. This is how new sessions appear in the sidebar
        // (Orbit is a pure reader — it never pre-adds sessions to the list).
        if (workspacePath) {
          void conversationList(workspacePath)
            .then((conversations) => {
              const summaries = toConversationSummaries(conversations);
              setConversations(summaries);
            })
            .catch((err: unknown) => {
              logger.error('Failed to refresh conversation list', err);
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
        isStopPendingRef.current = false;

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
          // Set parentUuid to the last message's ID to maintain the chain
          const parentUuid = prev[prev.length - 1]?.id ?? null;
          return [
            ...prev,
            {
              id: message.message_id,
              role: 'assistant' as const,
              content: errorContent,
              displayedContent: errorContent,
              parentUuid,
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
        // Skip stale responses for Orbit session IDs that were remapped to SDK IDs.
        // Without this guard, a late-arriving conversation:load response for the
        // old Orbit ID (which has no JSONL file) would clear messages and revert
        // the sessionId back to the Orbit ID — undoing the system:init remap.
        if (remappedOrbitIds.has(message.session_id)) {
          break;
        }

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

        // Cache current session's messages BEFORE switching.
        // The sidebar's handleLoadConversation sends conversation:load directly
        // (without conversation:loading), so the conversation:loading handler
        // that normally caches messages never fires. Without this fallback,
        // switching back to a session whose JSONL was deleted by forkSessionAt
        // would show an empty chat — the backend returns no messages (file gone)
        // and the cache would be empty too. By caching here, the messages survive
        // sidebar round-trips even when the JSONL no longer exists on disk.
        {
          const currentSid = sessionIdRef.current;
          const currentMsgs = messagesRef.current;
          if (currentSid && currentMsgs.length > 0 && currentSid !== message.session_id) {
            messagesCache.current.set(currentSid, currentMsgs);
          }
        }

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
            // Then extract the active chain using parentUuid links (Claude Code-style rewind)
            const allBackendMessages = message.messages
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
                  // Preserve parentUuid from persisted messages (Claude Code-style rewind)
                  ...(m.parentUuid !== undefined ? { parentUuid: m.parentUuid } : {}),
                  // Restore thinking content from persisted messages
                  // Convert flat thinking string to single-element thinkingBlocks for rendering
                  ...(m.thinking
                    ? {
                        thinking: m.thinking,
                        thinkingBlocks: [
                          { content: m.thinking, durationMs: m.thinkingDurationMs ?? 0 },
                        ],
                      }
                    : {}),
                  ...(m.thinkingDurationMs !== undefined
                    ? { thinkingDurationMs: m.thinkingDurationMs }
                    : {}),
                  // Include createdAt for chain extraction (needed to find the head)
                  createdAt: m.createdAt,
                };
                if (m.isInterrupted === true) {
                  return { ...base, isInterrupted: true as const };
                }
                return base;
              });

            // Extract only the active branch using parentUuid chain (Claude Code-style).
            // When there are forks (rewinds), multiple messages can share a parent.
            // We walk from the latest message backwards to get the active branch.
            const backendMessages = getActiveChain(allBackendMessages);

            // Merge backend and cache messages:
            // - User messages ONLY come from backend (auto-start saves them immediately)
            // - Assistant messages prefer cache (may have live streaming content)
            // This handles the case where buffer hydration added streaming response
            // but the user message wasn't in the buffer (it's in backend storage)
            let newMessages: ChatMessage[];
            if (!cachedMessages || cachedMessages.length === 0) {
              // No cache - use backend directly
              newMessages = backendMessages;
            } else if (backendMessages.length === 0) {
              // No backend - use cache directly (e.g., JSONL deleted by forkSessionAt)
              newMessages = cachedMessages;
            } else {
              // Both exist - merge using backend as backbone + live trailing messages.
              //
              // Strategy:
              // 1. Use backend messages as the canonical source (SDK-assigned UUIDs).
              // 2. Append "live trailing" messages from the cache that represent genuinely
              //    new messages not yet persisted to JSONL (e.g., post-rewind user message
              //    + streaming response that the SDK hasn't written to disk yet).
              //
              // IMPORTANT: User message UUIDs do NOT match between frontend and SDK.
              // The frontend generates its own UUID (crypto.randomUUID()), but the SDK
              // writes a different UUID (checkpoint ID) to JSONL. We therefore use
              // user message COUNT (not IDs) to detect live trailing messages.
              // If the cache has more user messages than the backend, the extra ones
              // are genuinely new and not yet persisted.
              const backendUserCount = backendMessages.filter((m) => m.role === 'user').length;
              const cachedUserMessages = cachedMessages.filter((m) => m.role === 'user');
              const cachedUserCount = cachedUserMessages.length;

              if (cachedUserCount <= backendUserCount) {
                // Backend has all messages — use backend exclusively.
                // No live trailing needed; cache would only create duplicates
                // because frontend UUIDs differ from SDK JSONL UUIDs.
                newMessages = backendMessages;
              } else {
                // Cache has more user messages than backend — the extra ones are live
                // (not yet persisted). Find the Nth+1 user message in the cache
                // (where N = backendUserCount) and take everything from that point.
                let usersSeen = 0;
                let liveStartIdx = -1;
                for (let i = 0; i < cachedMessages.length; i++) {
                  const cm = cachedMessages[i];
                  if (cm?.role === 'user') {
                    usersSeen++;
                    if (usersSeen > backendUserCount) {
                      liveStartIdx = i;
                      break;
                    }
                  }
                }

                const liveTrailingMessages =
                  liveStartIdx >= 0 ? cachedMessages.slice(liveStartIdx) : [];
                newMessages = [...backendMessages, ...liveTrailingMessages];
              }
            }

            // Build set of message IDs in the active chain for filtering usage/tools.
            // Only messages in the active branch should contribute to usage counts
            // and have their tools restored (orphaned branches are ignored).
            const activeChainIds = new Set(backendMessages.map((m) => m.id));

            // Restore authoritative session usage from the backend.
            // Prefer session_usage (from .usage.json sidecar, written by agent-bridge
            // on SDK result event) over per-message JSONL usage which has inaccurate
            // output_tokens (written at stream-start, never updated by the SDK).
            if (message.session_usage) {
              restoreSessionUsage(message.session_id, {
                inputTokens: message.session_usage.inputTokens,
                outputTokens: message.session_usage.outputTokens,
                cacheReadInputTokens: message.session_usage.cacheReadInputTokens ?? 0,
                cacheCreationInputTokens: message.session_usage.cacheCreationInputTokens ?? 0,
                totalCostUsd: message.session_usage.totalCostUsd ?? 0,
              });
            } else if (message.messages.length > 0) {
              // Fallback: sum per-message usage from JSONL (inaccurate but better than nothing).
              // Deduplicate by message ID: the SDK reports identical usage for all messages
              // in the same turn (text + tool_use share one ID).
              // Only count messages in the active chain (not orphaned branches).
              const seenIds = new Set<string>();
              const processedMessageIds: string[] = [];
              const cumulativeUsage = message.messages
                .filter((m) => activeChainIds.has(m.id))
                .reduce(
                  (acc, m) => {
                    if (m.usage && !seenIds.has(m.id)) {
                      seenIds.add(m.id);
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

              if (processedMessageIds.length > 0) {
                restoreSessionUsage(message.session_id, cumulativeUsage, processedMessageIds);
              }
            }

            // Pre-populate messagesCache BEFORE setSessionId.
            // When React commits setSessionId, the useEffect in message-state.ts
            // (line 30-48) detects sessionId changed and reads from messagesCache.
            // Without this, it finds OLD cached messages (agent-bridge turn IDs)
            // and overwrites our newMessages (JSONL IDs). The overwrite creates
            // a permanent mismatch: messages use cached IDs but tools have JSONL
            // IDs from restoreToolsForMessage → toolsByMessageId lookup fails.
            // By writing newMessages to the cache here, the useEffect reads the
            // correct data and setMessages is effectively a no-op (same reference).
            messagesCache.current.set(message.session_id, newMessages);

            setMessages(newMessages);
            setSessionId(message.session_id);
            setActiveConversation(message.session_id, message.title);

            switchSession(message.session_id);

            // Restore tool executions from persisted messages (for tool widget display).
            // Only restore tools for messages in the active chain (orphaned branches excluded).
            // NOTE: This for-loop runs synchronously — React cannot interrupt between
            // individual restoreToolsForMessage calls. startTransition only yields
            // between React renders, not between synchronous Zustand set() calls.
            // (Code review: Opus cycle 3, issue #1)
            for (const m of message.messages) {
              if (activeChainIds.has(m.id) && m.toolUses.length > 0) {
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
        // Prepare new messages
        const rewoundMessages: ChatMessage[] = message.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          displayedContent: m.content,
          ...(m.parentUuid !== undefined ? { parentUuid: m.parentUuid } : {}),
          ...(m.thinking
            ? {
                thinking: m.thinking,
                thinkingBlocks: [{ content: m.thinking, durationMs: m.thinkingDurationMs ?? 0 }],
              }
            : {}),
          ...(m.thinkingDurationMs !== undefined
            ? { thinkingDurationMs: m.thinkingDurationMs }
            : {}),
        }));

        const isSameSession = message.new_session_id === message.session_id;

        if (!isSameSession) {
          switchSession(message.new_session_id);
          useFileStore.getState().switchSession(message.new_session_id);
          setSessionId(message.new_session_id);
          setActiveConversation(message.new_session_id, `Rewind`);
        }

        setMessages(rewoundMessages);

        // NOTE: We intentionally do NOT clear checkpoints here.
        // Old checkpoints keyed by frontend UUIDs won't match SDK UUIDs
        // after rewind (harmless miss — getRewindCheckpoints returns undefined).
        // New checkpoints generated post-rewind use current SDK UUIDs and
        // work correctly for future rewinds of post-rewind messages.
        const targetSessionId = isSameSession ? message.session_id : message.new_session_id;

        // Set rewind fork point
        if (rewoundMessages.length > 0) {
          const lastRewoundMessage = rewoundMessages[rewoundMessages.length - 1];
          if (lastRewoundMessage) {
            useCheckpointStore
              .getState()
              .setRewindForkPoint(targetSessionId, lastRewoundMessage.id);
          }
        }

        // Restore tool executions
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
                ...(t.contentOffset !== undefined ? { contentOffset: t.contentOffset } : {}),
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

        // Mark that non-thinking content arrived — next thinking chunk starts a new block
        hasContentSinceLastThinking.current.set(message.message_id, true);

        // Finalize current thinking block and mark thinking phase complete
        if (currentMsg?.isThinkingActive === true) {
          setMessages((prev) => {
            const idx = prev.length - 1;
            const msg = idx >= 0 ? prev[idx] : undefined;
            if (msg?.id !== message.message_id || msg.role !== 'assistant') return prev;
            let updatedBlocks = msg.thinkingBlocks;
            if (updatedBlocks !== undefined && updatedBlocks.length > 0) {
              updatedBlocks = [...updatedBlocks];
              const lastBlock = updatedBlocks[updatedBlocks.length - 1];
              if (lastBlock !== undefined) {
                const startTime = thinkingStartTimes.current.get(message.message_id) ?? Date.now();
                updatedBlocks[updatedBlocks.length - 1] = {
                  ...lastBlock,
                  durationMs: Date.now() - startTime,
                };
              }
            }
            const copy = prev.slice();
            copy[idx] = {
              ...msg,
              isThinkingActive: false,
              ...(updatedBlocks !== undefined ? { thinkingBlocks: updatedBlocks } : {}),
            };
            return copy;
          });
        }

        // Only update messages if we need to create a new assistant message
        // This stays synchronous because we need the message for streaming
        if (!currentMsg) {
          setMessages((prev) => {
            // Set parentUuid to the last message's ID to maintain the chain
            const parentUuid = prev[prev.length - 1]?.id ?? null;
            return [
              ...prev,
              {
                id: message.message_id,
                role: 'assistant' as const,
                content: '',
                displayedContent: '',
                isStreaming: true,
                parentUuid,
              },
            ];
          });
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
        break;

      case 'agent:checkpoint': {
        const { session_id: checkpointSessionId, checkpoint_id } = message;

        // Reconcile: replace the frontend UUID in checkpoint store with the SDK UUID.
        // This ensures checkpoint maps (turnStart/turnEnd) get keyed by SDK UUID
        // when onMessageComplete fires later (agent:complete always arrives after checkpoint).
        const checkpointState = useCheckpointStore.getState();
        logger.debug('agent:checkpoint received', {
          checkpointSessionId: checkpointSessionId.slice(0, 8),
          checkpointId: checkpoint_id.slice(0, 8),
          currentUserMessageId: checkpointState.currentUserMessageId
            ? {
                sessionId: checkpointState.currentUserMessageId.sessionId.slice(0, 8),
                messageId: checkpointState.currentUserMessageId.messageId.slice(0, 8),
              }
            : null,
        });

        const oldFrontendId = checkpointState.reconcileUserMessageId(
          checkpointSessionId,
          checkpoint_id
        );

        if (oldFrontendId) {
          // Update the user message's ID in React state from frontend UUID → SDK UUID.
          // After this, the message ID matches the JSONL on disk — enabling direct
          // lookup in rewind, conversation:loaded merge, and checkpoint resolution.
          logger.debug('Reconciling user message ID', {
            oldFrontendId: oldFrontendId.slice(0, 8),
            newSdkId: checkpoint_id.slice(0, 8),
          });
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === oldFrontendId && m.role === 'user');
            if (idx === -1) return prev;

            const target = prev[idx];
            if (!target) return prev;

            const updated = prev.slice();
            updated[idx] = { ...target, id: checkpoint_id };
            return updated;
          });
        } else {
          logger.debug('Checkpoint reconciliation skipped (no frontend ID to remap)', {
            checkpointSessionId: checkpointSessionId.slice(0, 8),
            checkpointId: checkpoint_id.slice(0, 8),
          });
        }
        break;
      }
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
