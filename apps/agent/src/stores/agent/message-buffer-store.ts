/**
 * Message Buffer Store
 *
 * Buffers streaming messages (agent:chunk, tool:start, etc.) for sessions
 * that don't have an active consumer (ChatArea mounted).
 *
 * This solves the auto-start agent problem:
 * 1. useAutoStartAgent sends a message → Claude starts streaming
 * 2. User hasn't expanded the agent view yet → ChatArea isn't mounted
 * 3. Streaming chunks arrive via window.postMessage() but nobody captures them
 * 4. This store buffers those messages until ChatArea mounts
 * 5. When ChatArea mounts, it hydrates from this buffer
 *
 * IMPORTANT: Only buffer agent-related streaming messages. Other messages
 * (conversation:list, file:content, etc.) should flow through normally.
 */

import { createLogger } from '@orbit/common/lib';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import type { ExtensionMessage } from '@/types/protocol';

const logger = createLogger('MessageBufferStore');

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

/** Maximum messages per session to prevent memory bloat */
const MAX_BUFFER_SIZE = 1000;

/** Maximum age for buffered messages (5 minutes) */
const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000;

/** Maximum time to wait for a conversation:load response before clearing pending flag (30s) */
const MAX_LOAD_PENDING_AGE_MS = 30 * 1000;

/** Message types that should be buffered when no consumer is active */
const BUFFERABLE_MESSAGE_TYPES = new Set([
  'agent:chunk',
  'agent:thinking',
  'agent:complete',
  'agent:error',
  'tool:start',
  'tool:end',
]);

/**
 * STRICT MODE HANDLING - WHY WE DON'T CLEAR DELIVERED UUIDS
 *
 * In React Strict Mode, components mount → unmount → remount to detect side effects.
 * Zustand state PERSISTS across this double-mount (it's outside React).
 *
 * Old behavior (buggy):
 *   Mount 1: process messages, mark as delivered
 *   Unmount: detect < 100ms, CLEAR deliveredUuids
 *   Mount 2: process SAME messages again → DUPLICATES!
 *
 * Correct behavior:
 *   Mount 1: process messages, mark as delivered
 *   Unmount: keep deliveredUuids (state should persist)
 *   Mount 2: return empty (messages already delivered)
 *
 * This matches React's expectation that effects are idempotent and state persists.
 */

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface BufferedMessage {
  message: ExtensionMessage;
  receivedAt: number;
  uuid: string;
}

export interface SessionBuffer {
  messages: BufferedMessage[];
  /** True when ChatArea is mounted for this session (consuming messages) */
  isConsuming: boolean;
  /** UUIDs of messages that have been delivered to a consumer */
  deliveredUuids: Set<string>;
  /** Timestamp when consuming started - used to detect React Strict Mode remounts */
  consumingStartedAt: number | null;
}

export interface MessageBufferState {
  buffers: Record<string, SessionBuffer>;

  /**
   * Sessions with in-flight conversation:load requests, with timestamps.
   * Used to prevent duplicate requests when multiple components try to load the same session.
   * (e.g., useAgentConversation and useChatMessages both trying to load on mount)
   *
   * Map<sessionId, timestamp> allows timeout-based cleanup if load never completes.
   */
  pendingLoads: Map<string, number>;

  // ─────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────

  /**
   * Check if a message should be buffered (no active consumer for this session).
   * Returns true if the session has no active consumer AND the message type is bufferable.
   */
  shouldBuffer: (sessionId: string, messageType: string) => boolean;

  /**
   * Buffer a message for later hydration.
   * Respects MAX_BUFFER_SIZE - drops oldest messages when limit exceeded.
   */
  bufferMessage: (sessionId: string, message: ExtensionMessage, uuid: string) => void;

  /**
   * Mark session as consuming and return undelivered buffered messages (oldest first).
   * Messages stay in buffer but are marked as delivered via deliveredUuids.
   * This handles React Strict Mode double-mounting: second mount returns empty
   * because messages were already delivered to first mount (state is preserved).
   * Filters out expired messages (older than MAX_MESSAGE_AGE_MS).
   */
  startConsuming: (sessionId: string) => BufferedMessage[];

  /**
   * Mark session as no longer consuming (ChatArea unmounted).
   * Future messages will be buffered again until next startConsuming().
   */
  stopConsuming: (sessionId: string) => void;

  /**
   * Clear buffer for a session (e.g., on agent:complete or conversation delete).
   */
  clearBuffer: (sessionId: string) => void;

  /**
   * Clear buffered messages for a specific message ID (used after persistence).
   */
  clearMessage: (sessionId: string, messageId: string) => void;

  /**
   * Check if a session has an active consumer.
   */
  hasConsumer: (sessionId: string) => boolean;

  /**
   * Get buffer stats for debugging.
   */
  getBufferStats: (sessionId: string) => { messageCount: number; isConsuming: boolean } | undefined;

  /**
   * Mark a session as having a pending conversation:load request.
   * Returns true if marked (no existing pending), false if already pending.
   * Use this to prevent duplicate load requests from multiple components.
   */
  markLoadPending: (sessionId: string) => boolean;

  /**
   * Clear the pending load flag for a session (called when conversation:loaded is received).
   */
  clearLoadPending: (sessionId: string) => void;

  /**
   * Check if a session has a pending load request.
   */
  hasLoadPending: (sessionId: string) => boolean;
}

// ═══════════════════════════════════════════════════════════════
// Store
// ═══════════════════════════════════════════════════════════════

export const useMessageBufferStore = create<MessageBufferState>()(
  immer((set, get) => ({
    buffers: {},
    pendingLoads: new Map<string, number>(),

    shouldBuffer: (sessionId, messageType): boolean => {
      // Only buffer specific message types
      if (!BUFFERABLE_MESSAGE_TYPES.has(messageType)) {
        return false;
      }

      const buffer = get().buffers[sessionId];
      // Buffer if no buffer exists yet (no consumer ever registered)
      // OR if buffer exists but isn't currently consuming
      return !buffer?.isConsuming;
    },

    bufferMessage: (sessionId, message, uuid): void => {
      const now = Date.now();

      set((state) => {
        // Initialize buffer if needed
        state.buffers[sessionId] ??= {
          messages: [],
          isConsuming: false,
          deliveredUuids: new Set(),
          consumingStartedAt: null,
        };
        const buffer = state.buffers[sessionId];

        // Don't buffer if currently consuming (shouldn't happen, but defensive)
        if (buffer.isConsuming) {
          logger.warn('Attempted to buffer while consuming', { sessionId });
          return;
        }

        // Add new message
        buffer.messages.push({
          message,
          receivedAt: now,
          uuid,
        });

        // Enforce size limit - drop oldest messages
        if (buffer.messages.length > MAX_BUFFER_SIZE) {
          const excessCount = buffer.messages.length - MAX_BUFFER_SIZE;
          buffer.messages.splice(0, excessCount);
          logger.warn('Buffer size exceeded, dropped oldest messages', {
            sessionId,
            dropped: excessCount,
          });
        }
      });

      logger.debug('Buffered message', {
        sessionId,
        type: message.type,
        uuid,
        bufferSize: get().buffers[sessionId]?.messages.length ?? 0,
      });
    },

    startConsuming: (sessionId): BufferedMessage[] => {
      const now = Date.now();
      const minAge = now - MAX_MESSAGE_AGE_MS;

      const state = get();
      const buffer = state.buffers[sessionId];

      if (!buffer) {
        // No buffer exists - create one marked as consuming
        set((s) => {
          s.buffers[sessionId] = {
            messages: [],
            isConsuming: true,
            deliveredUuids: new Set(),
            consumingStartedAt: Date.now(),
          };
        });
        logger.debug('Started consuming (no existing buffer)', { sessionId });
        return [];
      }

      // Filter out expired messages AND already-delivered messages
      // This handles React Strict Mode where startConsuming is called twice
      const validMessages = buffer.messages.filter(
        (m) => m.receivedAt >= minAge && !buffer.deliveredUuids.has(m.uuid)
      );
      const expiredCount =
        buffer.messages.length - validMessages.length - buffer.deliveredUuids.size;

      if (expiredCount > 0) {
        logger.debug('Filtered expired messages', { sessionId, expired: expiredCount });
      }

      // Mark as consuming and track delivered UUIDs
      // DON'T clear messages - they stay in buffer for potential remounts
      const consumeTime = Date.now();
      set((s) => {
        const buf = s.buffers[sessionId];
        if (buf) {
          buf.isConsuming = true;
          buf.consumingStartedAt = consumeTime;
          // Mark these messages as delivered
          for (const msg of validMessages) {
            buf.deliveredUuids.add(msg.uuid);
          }
        }
      });

      logger.info('Started consuming, hydrating buffered messages', {
        sessionId,
        messageCount: validMessages.length,
        alreadyDelivered: buffer.deliveredUuids.size,
      });

      return validMessages;
    },

    stopConsuming: (sessionId): void => {
      set((state) => {
        const buffer = state.buffers[sessionId];
        if (buffer) {
          const consumingDuration =
            buffer.consumingStartedAt !== null ? Date.now() - buffer.consumingStartedAt : Infinity;

          buffer.isConsuming = false;
          buffer.consumingStartedAt = null;

          // IMPORTANT: We do NOT clear deliveredUuids here, even for quick unmounts.
          // In React Strict Mode, state persists between mount/unmount/remount cycles.
          // Clearing would cause messages to be re-delivered on the second mount,
          // leading to duplicate messages in the UI.
          // See comment at top of file for full explanation.
          logger.debug('Stopped consuming', { sessionId, consumingDuration });
        }
      });
    },

    clearBuffer: (sessionId): void => {
      set((state) => {
        const buffer = state.buffers[sessionId];
        if (buffer) {
          const count = buffer.messages.length;
          buffer.messages = [];
          buffer.deliveredUuids.clear();
          if (count > 0) {
            logger.debug('Cleared buffer', { sessionId, cleared: count });
          }
        }
      });
    },

    clearMessage: (sessionId, messageId): void => {
      set((state) => {
        const buffer = state.buffers[sessionId];
        if (!buffer || buffer.messages.length === 0) {
          return;
        }

        const removedUuids = new Set<string>();
        buffer.messages = buffer.messages.filter((entry) => {
          const msg = entry.message as ExtensionMessage & { message_id?: string };
          if (msg.message_id === messageId) {
            removedUuids.add(entry.uuid);
            return false;
          }
          return true;
        });

        if (removedUuids.size > 0) {
          for (const uuid of removedUuids) {
            buffer.deliveredUuids.delete(uuid);
          }
        }
      });
    },

    hasConsumer: (sessionId): boolean => {
      return get().buffers[sessionId]?.isConsuming ?? false;
    },

    getBufferStats: (sessionId): { messageCount: number; isConsuming: boolean } | undefined => {
      const buffer = get().buffers[sessionId];
      if (!buffer) return undefined;
      return {
        messageCount: buffer.messages.length,
        isConsuming: buffer.isConsuming,
      };
    },

    markLoadPending: (sessionId): boolean => {
      const state = get();
      const existingTimestamp = state.pendingLoads.get(sessionId);

      // Check if already pending AND not expired
      if (existingTimestamp !== undefined) {
        const age = Date.now() - existingTimestamp;
        if (age < MAX_LOAD_PENDING_AGE_MS) {
          logger.debug('Load already pending, skipping', { sessionId, age });
          return false;
        }
        // Expired - will be replaced below
        logger.warn('Clearing expired pending load', { sessionId, age });
      }

      set((s) => {
        s.pendingLoads.set(sessionId, Date.now());
      });
      logger.debug('Marked load pending', { sessionId });
      return true;
    },

    clearLoadPending: (sessionId): void => {
      set((state) => {
        state.pendingLoads.delete(sessionId);
      });
      logger.debug('Cleared load pending', { sessionId });
    },

    hasLoadPending: (sessionId): boolean => {
      const timestamp = get().pendingLoads.get(sessionId);
      if (timestamp === undefined) {
        return false;
      }

      // Check if pending load has expired (timed out)
      const age = Date.now() - timestamp;
      if (age >= MAX_LOAD_PENDING_AGE_MS) {
        // Auto-clear expired pending loads to prevent permanent blocking
        logger.warn('Auto-clearing expired pending load', { sessionId, age });
        // Note: We clear in the next tick to avoid mutating state during get()
        // This is safe because the caller will get 'false' and retry, which will succeed
        setTimeout(() => {
          useMessageBufferStore.getState().clearLoadPending(sessionId);
        }, 0);
        return false;
      }

      return true;
    },
  }))
);
