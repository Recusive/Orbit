/**
 * Checkpoint Store
 *
 * Tracks file checkpoints for the Rewind feature.
 * Each message (user turn) has TWO checkpoints:
 *
 * 1. Turn Start Checkpoint: The user message UUID from the SDK stream
 *    - Created when user sends a message
 *    - Used for `resumeSessionAt` - SDK forks at this user message
 *
 * 2. Turn End Checkpoint: The checkpoint from the NEXT user message
 *    - Created AFTER Claude responded and tools completed
 *    - Used for `rewindFiles()` to restore files to post-turn state
 *
 * IMPORTANT: Checkpoints are stored against the USER message ID (the message the user
 * clicks to rewind), NOT the assistant message ID. This is tracked via onUserMessageSent().
 *
 * When rewinding to message N:
 * - resumeSessionAt: turnStartCheckpoint[N] → User message UUID for SDK to fork at
 * - rewindFiles: turnEndCheckpoint[N] → Files are restored to state after N's tools completed
 */

import { createLogger } from '@orbit/common/lib';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

const logger = createLogger('CheckpointStore');

/** Maximum sessions to track checkpoints for — prevents unbounded memory growth */
const MAX_CHECKPOINT_SESSIONS = 10;

export interface RewindCheckpoints {
  /** Checkpoint for resumeSessionAt - Claude sees up to this message */
  resumeSessionAt: string;
  /** Checkpoint for rewindFiles - file state after this message's tools */
  rewindFiles: string;
}

export interface CheckpointState {
  // Turn START checkpoints: the first checkpoint that arrived for each message's turn
  // Used for resumeSessionAt (Claude sees up to and including this message)
  // Map: sessionId -> { userMessageId -> checkpointId }
  turnStartCheckpoints: Record<string, Record<string, string>>;

  // Turn END checkpoints: checkpoint from NEXT turn (state AFTER this turn completed)
  // Used for rewindFiles (restore files to post-turn state)
  // Map: sessionId -> { userMessageId -> checkpointId }
  turnEndCheckpoints: Record<string, Record<string, string>>;

  // Current turn's first checkpoint (waiting to be associated when message completes)
  // When a checkpoint arrives and there's a pending message, it's the START of a new turn
  currentTurnStartCheckpoint: {
    sessionId: string;
    checkpointId: string;
  } | null;

  // Current user message ID for this turn (set when user sends a message)
  // Used to associate checkpoints with the USER message, not the assistant message
  currentUserMessageId: {
    sessionId: string;
    messageId: string;
  } | null;

  // Pending message waiting for its turn END checkpoint
  // When message completes, it waits for the next turn's checkpoint to mark its end
  // This stores the USER message ID (not assistant)
  pendingMessageForTurnEnd: {
    sessionId: string;
    messageId: string;
  } | null;

  // Ordered list of all checkpoint IDs per session (for debugging/fallback)
  checkpointOrder: Record<string, string[]>;

  // Latest checkpoint for each session (fallback for last message's turn end)
  latestCheckpoints: Record<string, string>;

  // Actions

  /**
   * Called when user sends a message.
   * Stores the USER message ID so checkpoints are associated with it (not the assistant message).
   */
  onUserMessageSent: (sessionId: string, userMessageId: string) => void;

  /**
   * Called when a new checkpoint arrives from the SDK.
   *
   * Flow:
   * 1. If there's a pending message waiting for turn END:
   *    - Associate this checkpoint as turn END for that message
   *    - Also mark this checkpoint as turn START for the current turn
   * 2. If no pending message but no current turn start:
   *    - This is the first checkpoint (session start), mark as turn START
   */
  onCheckpointReceived: (sessionId: string, checkpointId: string) => void;

  /**
   * Called when agent:complete fires.
   *
   * Flow:
   * 1. Associate any pending turn START checkpoint with the USER message (not assistant)
   * 2. Mark the USER message as waiting for its turn END checkpoint
   */
  onMessageComplete: (sessionId: string) => void;

  /**
   * Get both checkpoints needed for rewinding to a specific message.
   *
   * @returns resumeSessionAt (for Claude's context) and rewindFiles (for file state)
   */
  getRewindCheckpoints: (sessionId: string, messageId: string) => RewindCheckpoints | undefined;

  /**
   * Get just the turn start checkpoint for a message (for resumeSessionAt).
   */
  getTurnStartCheckpoint: (sessionId: string, messageId: string) => string | undefined;

  /**
   * Get just the turn end checkpoint for a message (for rewindFiles).
   */
  getTurnEndCheckpoint: (sessionId: string, messageId: string) => string | undefined;

  /**
   * Directly add checkpoints for a message (for restoring from persistence).
   */
  addCheckpoints: (
    sessionId: string,
    messageId: string,
    turnStart: string,
    turnEnd?: string
  ) => void;

  /**
   * Get all checkpoints for a session (for debugging).
   */
  getSessionCheckpoints: (sessionId: string) =>
    | {
        turnStarts: Record<string, string>;
        turnEnds: Record<string, string>;
        order: string[];
      }
    | undefined;

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
    turnStartCheckpoints: {},
    turnEndCheckpoints: {},
    currentTurnStartCheckpoint: null,
    currentUserMessageId: null,
    pendingMessageForTurnEnd: null,
    checkpointOrder: {},
    latestCheckpoints: {},

    onUserMessageSent: (sessionId, userMessageId): void => {
      logger.debug(`User message sent`, { sessionId, userMessageId });
      set((state) => {
        // Store the user message ID for this turn
        // This will be used when agent:complete fires to associate checkpoints
        state.currentUserMessageId = { sessionId, messageId: userMessageId };
      });
    },

    onCheckpointReceived: (sessionId, checkpointId): void => {
      logger.debug(`Checkpoint received`, { sessionId, checkpointId });
      set((state) => {
        // Always track checkpoint in order and as latest
        state.checkpointOrder[sessionId] ??= [];
        if (!state.checkpointOrder[sessionId].includes(checkpointId)) {
          state.checkpointOrder[sessionId].push(checkpointId);
        }
        state.latestCheckpoints[sessionId] = checkpointId;

        const pending = state.pendingMessageForTurnEnd;

        if (pending?.sessionId === sessionId) {
          // There's a message waiting for its turn END checkpoint
          // This checkpoint marks the END of that message's turn
          state.turnEndCheckpoints[sessionId] ??= {};
          state.turnEndCheckpoints[sessionId][pending.messageId] = checkpointId;

          // Clear the pending message
          state.pendingMessageForTurnEnd = null;

          // This checkpoint is ALSO the START of the current turn
          // Store it for when the current message completes
          state.currentTurnStartCheckpoint = { sessionId, checkpointId };
        } else if (state.currentTurnStartCheckpoint?.sessionId !== sessionId) {
          // No pending message and no current turn start for this session
          // This is the first checkpoint of the session (turn 1 start)
          state.currentTurnStartCheckpoint = { sessionId, checkpointId };
        }
        // Otherwise: intermediate checkpoint during tool execution, ignore for turn tracking

        // Evict oldest sessions to prevent unbounded memory growth across all 4 records.
        const sessionKeys = Object.keys(state.checkpointOrder);
        if (sessionKeys.length > MAX_CHECKPOINT_SESSIONS) {
          const evictCount = sessionKeys.length - MAX_CHECKPOINT_SESSIONS;
          for (const key of sessionKeys.slice(0, evictCount)) {
            // Skip the current session being written to
            if (key === sessionId) continue;
            Reflect.deleteProperty(state.turnStartCheckpoints, key);
            Reflect.deleteProperty(state.turnEndCheckpoints, key);
            Reflect.deleteProperty(state.checkpointOrder, key);
            Reflect.deleteProperty(state.latestCheckpoints, key);
          }
        }
      });
    },

    onMessageComplete: (sessionId): void => {
      set((state) => {
        // Get the USER message ID for this turn (set when user sent the message)
        const userMsg = state.currentUserMessageId;
        if (userMsg?.sessionId !== sessionId) {
          // No user message tracked - this shouldn't happen but handle gracefully
          return;
        }

        const userMessageId = userMsg.messageId;

        // Associate the current turn start checkpoint with this USER message
        const turnStart = state.currentTurnStartCheckpoint;
        if (turnStart?.sessionId === sessionId) {
          state.turnStartCheckpoints[sessionId] ??= {};
          state.turnStartCheckpoints[sessionId][userMessageId] = turnStart.checkpointId;
          state.currentTurnStartCheckpoint = null;
        }

        // Mark this USER message as waiting for its turn END checkpoint
        // The next turn's checkpoint will mark the end of this turn
        state.pendingMessageForTurnEnd = { sessionId, messageId: userMessageId };

        // Clear the current user message ID
        state.currentUserMessageId = null;
      });
    },

    getRewindCheckpoints: (sessionId, messageId): RewindCheckpoints | undefined => {
      const state = get();
      const turnStart = state.turnStartCheckpoints[sessionId]?.[messageId];

      if (!turnStart) {
        return undefined;
      }

      // For turn end, use the stored value or fall back to latest
      let turnEnd = state.turnEndCheckpoints[sessionId]?.[messageId];

      // If this is the pending message (last message), use latest checkpoint
      const pending = state.pendingMessageForTurnEnd;
      if (!turnEnd && pending?.sessionId === sessionId && pending.messageId === messageId) {
        turnEnd = state.latestCheckpoints[sessionId];
      }

      // If still no turn end, fall back to turn start (might not restore files correctly but won't crash)
      turnEnd ??= turnStart;

      // resumeSessionAt: Use turnStart (the user message UUID)
      // The SDK forks at that user message, including its complete response
      //
      // rewindFiles: Use turnEnd (checkpoint from NEXT user message)
      // This restores files to the state AFTER this turn's tools completed
      return {
        resumeSessionAt: turnStart,
        rewindFiles: turnEnd,
      };
    },

    getTurnStartCheckpoint: (sessionId, messageId): string | undefined => {
      return get().turnStartCheckpoints[sessionId]?.[messageId];
    },

    getTurnEndCheckpoint: (sessionId, messageId): string | undefined => {
      const state = get();
      const turnEnd = state.turnEndCheckpoints[sessionId]?.[messageId];
      if (turnEnd) {
        return turnEnd;
      }

      // If this is the pending message (last message), use latest checkpoint
      const pending = state.pendingMessageForTurnEnd;
      if (pending?.sessionId === sessionId && pending.messageId === messageId) {
        return state.latestCheckpoints[sessionId];
      }

      return undefined;
    },

    addCheckpoints: (sessionId, messageId, turnStart, turnEnd): void => {
      set((state) => {
        state.turnStartCheckpoints[sessionId] ??= {};
        state.turnStartCheckpoints[sessionId][messageId] = turnStart;

        if (turnEnd) {
          state.turnEndCheckpoints[sessionId] ??= {};
          state.turnEndCheckpoints[sessionId][messageId] = turnEnd;
        }

        // Add to order if not present
        state.checkpointOrder[sessionId] ??= [];
        if (!state.checkpointOrder[sessionId].includes(turnStart)) {
          state.checkpointOrder[sessionId].push(turnStart);
        }
        if (turnEnd && !state.checkpointOrder[sessionId].includes(turnEnd)) {
          state.checkpointOrder[sessionId].push(turnEnd);
        }
      });
    },

    getSessionCheckpoints: (
      sessionId
    ):
      | {
          turnStarts: Record<string, string>;
          turnEnds: Record<string, string>;
          order: string[];
        }
      | undefined => {
      const state = get();
      const turnStarts = state.turnStartCheckpoints[sessionId];
      if (!turnStarts) {
        return undefined;
      }
      return {
        turnStarts,
        turnEnds: state.turnEndCheckpoints[sessionId] ?? {},
        order: state.checkpointOrder[sessionId] ?? [],
      };
    },

    clearSessionCheckpoints: (sessionId): void => {
      set((state) => {
        state.turnStartCheckpoints = Object.fromEntries(
          Object.entries(state.turnStartCheckpoints).filter(([key]) => key !== sessionId)
        );
        state.turnEndCheckpoints = Object.fromEntries(
          Object.entries(state.turnEndCheckpoints).filter(([key]) => key !== sessionId)
        );
        state.checkpointOrder = Object.fromEntries(
          Object.entries(state.checkpointOrder).filter(([key]) => key !== sessionId)
        );
        state.latestCheckpoints = Object.fromEntries(
          Object.entries(state.latestCheckpoints).filter(([key]) => key !== sessionId)
        );
        if (state.pendingMessageForTurnEnd?.sessionId === sessionId) {
          state.pendingMessageForTurnEnd = null;
        }
        if (state.currentTurnStartCheckpoint?.sessionId === sessionId) {
          state.currentTurnStartCheckpoint = null;
        }
        if (state.currentUserMessageId?.sessionId === sessionId) {
          state.currentUserMessageId = null;
        }
      });
    },

    clearAll: (): void => {
      set((state) => {
        state.turnStartCheckpoints = {};
        state.turnEndCheckpoints = {};
        state.checkpointOrder = {};
        state.latestCheckpoints = {};
        state.pendingMessageForTurnEnd = null;
        state.currentTurnStartCheckpoint = null;
        state.currentUserMessageId = null;
      });
    },
  }))
);
