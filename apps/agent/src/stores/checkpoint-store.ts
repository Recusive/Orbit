/**
 * Checkpoint Store
 *
 * Tracks file checkpoints for the Rewind feature.
 * Each checkpoint is a UUID from a user message that can be used to
 * restore files to their state at that point via the SDK's rewindFiles().
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface CheckpointState {
  // Map: sessionId -> { messageId -> checkpointId }
  // Each message can have an associated checkpoint
  // NOTE: The checkpoint represents the state AFTER this message's turn completed
  checkpoints: Record<string, Record<string, string>>;

  // Pending message waiting for its checkpoint (delayed association)
  // When agent:complete fires, we store the message ID here
  // When the NEXT checkpoint arrives, we associate it with this message
  pendingMessageForCheckpoint: {
    sessionId: string;
    messageId: string;
  } | null;

  // Latest checkpoint for each session (for the last message that has no "next" checkpoint)
  latestCheckpoints: Record<string, string>;

  // Actions
  /**
   * Called when a new checkpoint arrives from the SDK.
   * If there's a pending message waiting for a checkpoint, associate this checkpoint with it.
   * This implements "delayed association" - each message gets the checkpoint from the NEXT user message.
   */
  onCheckpointReceived: (sessionId: string, checkpointId: string) => void;

  /**
   * Called when agent:complete fires. Marks this message as waiting for its checkpoint.
   * The next checkpoint that arrives will be associated with this message.
   */
  onMessageComplete: (sessionId: string, messageId: string) => void;

  /**
   * Directly add a checkpoint for a message.
   * Useful for restoring checkpoints from persistent storage.
   */
  addCheckpoint: (sessionId: string, messageId: string, checkpointId: string) => void;

  /**
   * Get the checkpoint for a specific message.
   */
  getCheckpoint: (sessionId: string, messageId: string) => string | undefined;

  /**
   * Get the first checkpoint for a session (earliest message).
   * Useful for rewinding to the very beginning.
   */
  getFirstCheckpoint: (sessionId: string) => string | undefined;

  /**
   * Get all checkpoints for a session.
   */
  getSessionCheckpoints: (sessionId: string) => Record<string, string> | undefined;

  /**
   * Clear all checkpoints for a session.
   */
  clearSessionCheckpoints: (sessionId: string) => void;

  /**
   * Clear all checkpoints.
   */
  clearAll: () => void;
}

export const useCheckpointStore = create<CheckpointState>()(
  immer((set, get) => ({
    checkpoints: {},
    pendingMessageForCheckpoint: null,
    latestCheckpoints: {},

    onCheckpointReceived: (sessionId, checkpointId): void => {
      set((state) => {
        // Always track the latest checkpoint for this session
        // (used for the last message that has no "next" checkpoint)
        state.latestCheckpoints[sessionId] = checkpointId;

        // If there's a message waiting for a checkpoint, associate this checkpoint with it
        // This implements "delayed association" - each message gets the checkpoint from
        // the NEXT user message, which represents the state AFTER that message's turn completed
        const pending = state.pendingMessageForCheckpoint;
        if (pending?.sessionId === sessionId) {
          // Initialize session checkpoints if needed
          state.checkpoints[sessionId] ??= {};
          // Associate this checkpoint with the waiting message
          state.checkpoints[sessionId][pending.messageId] = checkpointId;
          // Clear the pending message
          state.pendingMessageForCheckpoint = null;
        }
      });
    },

    onMessageComplete: (sessionId, messageId): void => {
      set((state) => {
        // Mark this message as waiting for its checkpoint
        // The next checkpoint that arrives will be associated with this message
        state.pendingMessageForCheckpoint = { sessionId, messageId };
      });
    },

    addCheckpoint: (sessionId, messageId, checkpointId): void => {
      set((state) => {
        state.checkpoints[sessionId] ??= {};
        state.checkpoints[sessionId][messageId] = checkpointId;
      });
    },

    getCheckpoint: (sessionId, messageId): string | undefined => {
      const checkpoint = get().checkpoints[sessionId]?.[messageId];
      if (checkpoint) {
        return checkpoint;
      }
      // If no specific checkpoint for this message, and it's the pending message,
      // use the latest checkpoint (for the last message in the conversation)
      const pending = get().pendingMessageForCheckpoint;
      if (pending?.sessionId === sessionId && pending.messageId === messageId) {
        return get().latestCheckpoints[sessionId];
      }
      return undefined;
    },

    getFirstCheckpoint: (sessionId): string | undefined => {
      const sessionCheckpoints = get().checkpoints[sessionId];
      if (!sessionCheckpoints) {
        return undefined;
      }
      // Get the first checkpoint (by insertion order - Object.values preserves insertion order)
      const checkpointIds = Object.values(sessionCheckpoints);
      return checkpointIds[0];
    },

    getSessionCheckpoints: (sessionId): Record<string, string> | undefined => {
      return get().checkpoints[sessionId];
    },

    clearSessionCheckpoints: (sessionId): void => {
      set((state) => {
        // Remove sessionId from checkpoints by creating new object without it
        state.checkpoints = Object.fromEntries(
          Object.entries(state.checkpoints).filter(([key]) => key !== sessionId)
        );
        state.latestCheckpoints = Object.fromEntries(
          Object.entries(state.latestCheckpoints).filter(([key]) => key !== sessionId)
        );
        if (state.pendingMessageForCheckpoint?.sessionId === sessionId) {
          state.pendingMessageForCheckpoint = null;
        }
      });
    },

    clearAll: (): void => {
      set((state) => {
        state.checkpoints = {};
        state.pendingMessageForCheckpoint = null;
        state.latestCheckpoints = {};
      });
    },
  }))
);
