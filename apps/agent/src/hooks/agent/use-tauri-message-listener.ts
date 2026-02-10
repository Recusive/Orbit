import { createLogger } from '@orbit/common/lib';
import { formatZodError } from '@orbit/shared-schemas';

// Import types to ensure global Window declarations are applied
import type { ExtensionMessage } from './types/tauri-types';
import './types/tauri-types';

import { conversationAddMessage } from '@/lib/api';
import { markMessagePersisted } from '@/lib/conversation-persistence';
import { createCheckpointBatcher } from '@/lib/utils/event-batcher';
import { useCheckpointStore } from '@/stores/agent/checkpoint-store';
import { useMessageBufferStore } from '@/stores/agent/message-buffer-store';
import { useUIStore } from '@/stores/ui/ui-store';
import { ExtensionMessageSchema } from '@/types/protocol';

// ═══════════════════════════════════════════════════════════════
// Window Message Listener Singleton
// ═══════════════════════════════════════════════════════════════

const logger = createLogger('TauriMessageListener');

type AgentCompleteMessage = Extract<ExtensionMessage, { type: 'agent:complete' }>;

function serializeToolOutput(output: unknown): string | undefined {
  if (output === undefined) return undefined;
  if (typeof output === 'string') return output;
  try {
    return JSON.stringify(output);
  } catch {
    // Fallback for objects that can't be stringified (e.g., circular refs)
    return '[unstringifiable output]';
  }
}

async function persistBufferedAssistantMessage(
  sessionId: string,
  message: AgentCompleteMessage
): Promise<boolean> {
  const bufferStore = useMessageBufferStore.getState();
  const buffer = bufferStore.buffers[sessionId];
  if (!buffer) return false;

  const entries = buffer.messages
    .filter(
      (entry): entry is typeof entry & { message: ExtensionMessage & { message_id: string } } =>
        'message_id' in entry.message && entry.message.message_id === message.message_id
    )
    .sort((a, b) => a.receivedAt - b.receivedAt);

  if (entries.length === 0) return false;

  let content = '';
  let thinking = '';
  const toolMap = new Map<
    string,
    {
      id: string;
      name: string;
      input: Record<string, unknown>;
      output?: string;
      success?: boolean;
    }
  >();

  for (const entry of entries) {
    const buffered = entry.message;
    // Only extract specific types - ignore other message types intentionally
    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
    switch (buffered.type) {
      case 'agent:chunk':
        content += buffered.content;
        break;
      case 'agent:thinking':
        thinking += buffered.thinking;
        break;
      case 'tool:start': {
        const existing = toolMap.get(buffered.tool_id);
        if (existing) {
          existing.name = buffered.tool_name;
          existing.input = buffered.tool_input;
        } else {
          toolMap.set(buffered.tool_id, {
            id: buffered.tool_id,
            name: buffered.tool_name,
            input: buffered.tool_input,
            success: true,
          });
        }
        break;
      }
      case 'tool:end': {
        const output = serializeToolOutput(buffered.tool_output);
        const existing = toolMap.get(buffered.tool_id);
        if (existing) {
          if (output !== undefined) {
            existing.output = output;
          }
          existing.success = buffered.success;
        } else {
          toolMap.set(buffered.tool_id, {
            id: buffered.tool_id,
            name: buffered.tool_name,
            input: {},
            ...(output !== undefined ? { output } : {}),
            success: buffered.success,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  const toolUses =
    toolMap.size > 0
      ? Array.from(toolMap.values()).map((tool) => ({
          id: tool.id,
          name: tool.name,
          input: tool.input,
          success: tool.success ?? true,
          ...(tool.output !== undefined ? { output: tool.output } : {}),
        }))
      : undefined;

  const hasContent = content.length > 0;
  const hasThinking = thinking.length > 0;
  const hasTools = toolUses !== undefined;

  if (!hasContent && !hasThinking && !hasTools) return false;

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
        ...(message.total_cost_usd !== undefined ? { totalCostUsd: message.total_cost_usd } : {}),
      }
    : undefined;

  try {
    // Get workspace/worktree context to ensure auto-created conversations
    // go to the correct location, not _global
    const { workspacePath, activeWorktreePath } = useUIStore.getState();

    await conversationAddMessage(
      sessionId,
      {
        id: message.message_id,
        role: 'assistant',
        content,
        createdAt: Date.now(),
        ...(hasThinking ? { thinking } : {}),
        ...(usageDto ? { usage: usageDto } : {}),
        ...(toolUses ? { toolUses } : {}),
      },
      workspacePath ?? undefined,
      activeWorktreePath ?? undefined
    );
    markMessagePersisted(sessionId, message.message_id);
    return true;
  } catch (error) {
    logger.error('Failed to persist buffered assistant message', {
      sessionId,
      messageId: message.message_id,
      error,
    });
    return false;
  }
}

// Initialize global handler registry if not present
window.__ORBIT_MESSAGE_HANDLERS__ ??= new Set<(message: ExtensionMessage) => void>();

// Clean up window listener on HMR
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (window.__ORBIT_REMOVE_WINDOW_LISTENER__) {
      window.__ORBIT_REMOVE_WINDOW_LISTENER__();
      window.__ORBIT_REMOVE_WINDOW_LISTENER__ = null;
      window.__ORBIT_WINDOW_LISTENER_INITIALIZED__ = false;
      logger.debug('Window message listener cleaned up for HMR');
    }
  });
}

// Registry of message handlers - each useTauri hook registers its handler here
// Safe because we initialize it above with ??=
export const messageHandlers: Set<(message: ExtensionMessage) => void> =
  window.__ORBIT_MESSAGE_HANDLERS__;

// Singleton window message listener
export function initWindowMessageListener(): void {
  if (window.__ORBIT_WINDOW_LISTENER_INITIALIZED__) return;
  window.__ORBIT_WINDOW_LISTENER_INITIALIZED__ = true;

  // Single global UUID deduplication set
  const processedUuids = new Set<string>();

  // Batched checkpoint processor - debounces rapid checkpoint events (100ms window)
  // This reduces ~30 checkpoint state updates per agent run to ~2-3
  const batchedCheckpoint = createCheckpointBatcher(
    (sessionId, checkpointId) => {
      useCheckpointStore.getState().onCheckpointReceived(sessionId, checkpointId);
    },
    100 // 100ms debounce - coalesce rapid intermediate checkpoints
  );

  const handleWindowMessage = (event: MessageEvent<unknown>): void => {
    const sameWindow = event.source === window;
    const sameOrigin = event.origin === window.location.origin || event.origin === 'null';
    if (!sameWindow || !sameOrigin) return;

    const result = ExtensionMessageSchema.safeParse(event.data);

    if (!result.success) {
      // Log validation failures to help debug schema mismatches
      if (
        typeof event.data === 'object' &&
        event.data !== null &&
        'type' in event.data &&
        typeof event.data.type === 'string'
      ) {
        // Log validation failures for debugging
        if (event.data.type.startsWith('conversation:')) {
          logger.error('Conversation message validation failed', {
            type: event.data.type,
            error: formatZodError(result.error),
          });
        } else if (event.data.type.startsWith('agent:')) {
          logger.warn('Invalid agent message dropped', {
            type: event.data.type,
            error: formatZodError(result.error),
          });
        }
      }
      return; // Invalid message, ignore
    }

    // Deduplicate messages by UUID (globally, once)
    const uuid = 'uuid' in result.data ? result.data.uuid : undefined;
    if (uuid) {
      if (processedUuids.has(uuid)) {
        return; // Already processed this message
      }
      processedUuids.add(uuid);
      // Limit set size to prevent memory leak
      if (processedUuids.size > 1000) {
        const iterator = processedUuids.values();
        for (let i = 0; i < 500; i++) {
          const value = iterator.next().value;
          if (value) processedUuids.delete(value);
        }
      }
    }

    const sessionId = 'session_id' in result.data ? result.data.session_id : null;
    const bufferStore = sessionId ? useMessageBufferStore.getState() : null;
    const shouldBuffer =
      sessionId !== null && uuid !== undefined && bufferStore
        ? bufferStore.shouldBuffer(sessionId, result.data.type)
        : false;

    // Handle checkpoint events for file rewind functionality
    // Uses "delayed association" - each message gets the checkpoint from the NEXT user message
    // This ensures rewinding to a message restores files to the state AFTER that message completed
    // NOTE: Checkpoints are batched/debounced to reduce state updates during rapid tool execution
    if (result.data.type === 'agent:checkpoint') {
      const { session_id, checkpoint_id } = result.data;
      // Use batched processor to debounce rapid checkpoint events
      batchedCheckpoint(session_id, checkpoint_id);
    }

    // When agent completes, mark this message as waiting for its checkpoint
    // The next checkpoint that arrives (from the next user message) will be associated with it
    if (result.data.type === 'agent:complete') {
      // Capture the narrowed type before async closure (TypeScript loses narrowing in closures)
      const completeMessage = result.data;
      const { session_id, message_id } = completeMessage;
      // Associate checkpoints with the USER message (tracked via onUserMessageSent)
      // We pass only sessionId; the store uses the stored user message ID
      useCheckpointStore.getState().onMessageComplete(session_id);

      if (shouldBuffer && sessionId) {
        void (async (): Promise<void> => {
          const persisted = await persistBufferedAssistantMessage(sessionId, completeMessage);
          if (persisted) {
            useMessageBufferStore.getState().clearMessage(sessionId, message_id);
          }
        })();
      } else if (sessionId) {
        // Clear message buffer on completion when a consumer is active
        useMessageBufferStore.getState().clearBuffer(session_id);
      }
    }

    // ─────────────────────────────────────────────────────────────
    // Message Buffering for Auto-Start Agents
    // ─────────────────────────────────────────────────────────────
    // When an agent auto-starts (e.g., review agent in Canvas), ChatArea may not
    // be mounted yet. Buffer streaming messages until ChatArea mounts and consumes.
    if (sessionId && uuid && bufferStore && shouldBuffer) {
      // No consumer - buffer the message for later hydration
      bufferStore.bufferMessage(sessionId, result.data, uuid);

      // Skip dispatch to handlers - they'll get this message on hydration
      return;
    }

    // Dispatch to all registered handlers
    for (const handler of messageHandlers) {
      handler(result.data);
    }
  };

  window.addEventListener('message', handleWindowMessage);

  // Store removal function for HMR cleanup
  window.__ORBIT_REMOVE_WINDOW_LISTENER__ = (): void => {
    window.removeEventListener('message', handleWindowMessage);
  };

  logger.info('Singleton window message listener initialized');
}
