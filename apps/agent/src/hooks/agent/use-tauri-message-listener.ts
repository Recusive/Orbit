import { formatZodError } from '@snowflake/shared-schemas';

// Import types to ensure global Window declarations are applied
import type { ExtensionMessage } from './types/tauri-types';
import './types/tauri-types';

import { useCheckpointStore } from '@/stores/agent/checkpoint-store';
import { ExtensionMessageSchema } from '@/types/protocol';

// ═══════════════════════════════════════════════════════════════
// Window Message Listener Singleton
// ═══════════════════════════════════════════════════════════════

// Initialize global handler registry if not present
window.__SNOWFLAKE_MESSAGE_HANDLERS__ ??= new Set<(message: ExtensionMessage) => void>();

// Clean up window listener on HMR
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (window.__SNOWFLAKE_REMOVE_WINDOW_LISTENER__) {
      window.__SNOWFLAKE_REMOVE_WINDOW_LISTENER__();
      window.__SNOWFLAKE_REMOVE_WINDOW_LISTENER__ = null;
      window.__SNOWFLAKE_WINDOW_LISTENER_INITIALIZED__ = false;
      console.warn('[Snowflake] Window message listener cleaned up for HMR');
    }
  });
}

// Registry of message handlers - each useTauri hook registers its handler here
// Safe because we initialize it above with ??=
export const messageHandlers: Set<(message: ExtensionMessage) => void> =
  window.__SNOWFLAKE_MESSAGE_HANDLERS__;

// Singleton window message listener
export function initWindowMessageListener(): void {
  if (window.__SNOWFLAKE_WINDOW_LISTENER_INITIALIZED__) return;
  window.__SNOWFLAKE_WINDOW_LISTENER_INITIALIZED__ = true;

  // Single global UUID deduplication set
  const processedUuids = new Set<string>();

  const handleWindowMessage = (event: MessageEvent<unknown>): void => {
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
          console.error(
            '[Snowflake] Conversation message validation failed:',
            event.data.type,
            formatZodError(result.error)
          );
        } else if (event.data.type.startsWith('agent:')) {
          console.warn(
            '[Snowflake] Invalid agent message dropped:',
            event.data.type,
            formatZodError(result.error)
          );
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

    // Handle checkpoint events for file rewind functionality
    // Uses "delayed association" - each message gets the checkpoint from the NEXT user message
    // This ensures rewinding to a message restores files to the state AFTER that message completed
    if (result.data.type === 'agent:checkpoint') {
      const { session_id, checkpoint_id } = result.data;
      console.warn('[Snowflake] 🔖 Received checkpoint event:', { session_id, checkpoint_id });
      // This will associate the checkpoint with any pending message from the previous turn
      useCheckpointStore.getState().onCheckpointReceived(session_id, checkpoint_id);
    }

    // When agent completes, mark this message as waiting for its checkpoint
    // The next checkpoint that arrives (from the next user message) will be associated with it
    if (result.data.type === 'agent:complete') {
      const { session_id, message_id } = result.data;
      console.warn('[Snowflake] 📝 Message complete, waiting for next checkpoint:', {
        session_id,
        message_id,
      });
      // Associate checkpoints with the USER message (tracked via onUserMessageSent)
      // We pass only sessionId; the store uses the stored user message ID
      useCheckpointStore.getState().onMessageComplete(session_id);
    }

    // Dispatch to all registered handlers
    for (const handler of messageHandlers) {
      handler(result.data);
    }
  };

  window.addEventListener('message', handleWindowMessage);

  // Store removal function for HMR cleanup
  window.__SNOWFLAKE_REMOVE_WINDOW_LISTENER__ = (): void => {
    window.removeEventListener('message', handleWindowMessage);
  };

  console.warn('[Snowflake] Singleton window message listener initialized');
}
