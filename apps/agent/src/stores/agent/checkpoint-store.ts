/**
 * Checkpoint Store
 *
 * Tracks file checkpoints for the Rewind feature.
 * Checkpoints arrive from the SDK's `replay-user-messages` option.
 *
 * KEY INSIGHT: Checkpoint IDs are USER MESSAGE UUIDs from replay-user-messages.
 * The SDK's resumeSessionAt: uuid includes messages UP TO AND INCLUDING that uuid,
 * but NOT subsequent messages (including the response to that message!).
 *
 * IMPORTANT: Checkpoints are stored against the USER message ID (the message the user
 * clicks to rewind), NOT the assistant message ID. This is tracked via onUserMessageSent().
 *
 * When rewinding to message N:
 * - resumeSessionAt: Use the NEXT checkpoint (N+1's UUID) to include N's response
 *   - If we used N's checkpoint, the fork would only include N, not its response
 *   - Using N+1's checkpoint includes: N, N's response, and N+1 (extra but unavoidable)
 * - rewindFiles: Use N's checkpoint (file state is correctly restored with N's UUID)
 *
 * SDK limitation: resumeSessionAt works at message boundaries, not "end of turn" boundaries.
 * There's no way to fork exactly between a response and the next user message.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

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
  // `reconciled` guards against stale cross-turn checkpoints (queued message race):
  // after the first successful reconcileUserMessageId, further attempts are rejected
  // until the next onUserMessageSent resets it.
  currentUserMessageId: {
    sessionId: string;
    messageId: string;
    reconciled: boolean;
  } | null;

  // Pending message waiting for its turn END checkpoint
  // When message completes, it waits for the next turn's checkpoint to mark its end
  // This stores the USER message ID (not assistant)
  // LEGACY: kept for backwards compatibility, prefer pendingMessagesQueue
  pendingMessageForTurnEnd: {
    sessionId: string;
    messageId: string;
  } | null;

  // Queue of messages waiting for their turn END checkpoint (FIFO)
  // Multiple messages can complete before a checkpoint arrives, so we need a queue
  // Map: sessionId -> [userMessageId1, userMessageId2, ...] (oldest first)
  pendingMessagesQueue: Record<string, string[]>;

  // Ordered list of all checkpoint IDs per session (for debugging/fallback)
  checkpointOrder: Record<string, string[]>;

  // Latest checkpoint for each session (fallback for last message's turn end)
  latestCheckpoints: Record<string, string>;

  // Rewind fork point (Claude Code-style branching)
  // When set, the next message should use this as parentUuid instead of the normal last message.
  // This creates a FORK in the conversation tree - two messages with the same parent.
  // Map: sessionId -> messageUuid (the message UUID to fork from)
  // Cleared after use (one-time fork).
  rewindForkPoints: Record<string, string>;

  // Pending conversation fork (deferred until new session ID is known)
  // SDK forks are LAZY - the new session ID isn't known until the first message is sent.
  // We track the fork request here and call conversationFork when system:init provides the real ID.
  // Map: originalSessionId -> rewindMessageId
  pendingConversationForks: Record<string, string>;

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

  // ============================================
  // Rewind Fork Point Actions (Claude Code-style)
  // ============================================

  /**
   * Set the rewind fork point for a session.
   * Called when conversation:rewound arrives - the last message in the rewound
   * messages becomes the fork point. The next user message will use this as
   * its parentUuid, creating a fork in the conversation tree.
   */
  setRewindForkPoint: (sessionId: string, messageUuid: string) => void;

  /**
   * Get and clear the rewind fork point for a session.
   * Returns the fork point UUID if set, then clears it (one-time use).
   * Called when sending a message to check if we should fork.
   */
  consumeRewindForkPoint: (sessionId: string) => string | null;

  /**
   * Check if a session has a pending rewind fork point without consuming it.
   */
  hasRewindForkPoint: (sessionId: string) => boolean;

  /**
   * Clear the rewind fork point for a session without consuming it.
   * Called when switching sessions or other scenarios where the fork should be abandoned.
   */
  clearRewindForkPoint: (sessionId: string) => void;

  // ============================================
  // Pending Conversation Fork Actions (Deferred Fork)
  // ============================================

  /**
   * Set a pending conversation fork for a session.
   * Called when rewind is requested but the new session ID isn't known yet (SDK fork is lazy).
   * The fork will be executed when system:init provides the actual new session ID.
   */
  setPendingConversationFork: (originalSessionId: string, rewindMessageId: string) => void;

  /**
   * Consume and clear a pending conversation fork for a session.
   * Returns the rewind message ID if there was a pending fork, null otherwise.
   * Called from the session remap handler when the new session ID is known.
   */
  consumePendingConversationFork: (originalSessionId: string) => string | null;

  /**
   * Check if a session has a pending conversation fork.
   */
  hasPendingConversationFork: (originalSessionId: string) => boolean;

  /**
   * Called when agent:checkpoint arrives with the SDK's user message UUID.
   * Replaces the frontend UUID stored in currentUserMessageId with the SDK UUID.
   * Returns the old frontend UUID so the caller can update React state.
   *
   * Must be called BEFORE onMessageComplete() to ensure checkpoint maps use SDK UUID.
   * Timing guarantee: agent:checkpoint fires when SDK receives user message (before
   * generating response). agent:complete fires when response is done. So checkpoint
   * always arrives first.
   */
  reconcileUserMessageId: (sessionId: string, sdkMessageId: string) => string | undefined;

  /**
   * Remap checkpoints from old session ID to new session ID.
   * Called during session ID remapping when the frontend temp ID is replaced with SDK ID.
   *
   * This updates:
   * - In-flight state (currentUserMessageId, pendingMessageForTurnEnd, currentTurnStartCheckpoint)
   * - Session-keyed records (turnStartCheckpoints, turnEndCheckpoints, etc.)
   */
  remapSession: (oldSessionId: string, newSessionId: string) => void;
}

export const useCheckpointStore = create<CheckpointState>()(
  immer((set, get) => ({
    turnStartCheckpoints: {},
    turnEndCheckpoints: {},
    currentTurnStartCheckpoint: null,
    currentUserMessageId: null,
    pendingMessageForTurnEnd: null,
    pendingMessagesQueue: {},
    checkpointOrder: {},
    latestCheckpoints: {},
    rewindForkPoints: {},
    pendingConversationForks: {},

    onUserMessageSent: (sessionId, userMessageId): void => {
      set((state) => {
        // Store the user message ID for this turn.
        // `reconciled: false` allows the first reconcileUserMessageId call to succeed.
        // After that, it's set to true — blocking stale checkpoints from overwriting.
        state.currentUserMessageId = { sessionId, messageId: userMessageId, reconciled: false };
      });
    },

    onCheckpointReceived: (sessionId, checkpointId): void => {
      set((draft) => {
        // Always track checkpoint in order and as latest
        draft.checkpointOrder[sessionId] ??= [];
        if (!draft.checkpointOrder[sessionId].includes(checkpointId)) {
          draft.checkpointOrder[sessionId].push(checkpointId);
        }
        draft.latestCheckpoints[sessionId] = checkpointId;

        // Check pending queue first (FIFO - drain all pending messages waiting for turnEnd)
        const pendingQueue = draft.pendingMessagesQueue[sessionId];
        if (pendingQueue && pendingQueue.length > 0) {
          // Pop the OLDEST message (first one added)
          const oldestPending = pendingQueue.shift();
          if (oldestPending) {
            draft.turnEndCheckpoints[sessionId] ??= {};
            draft.turnEndCheckpoints[sessionId][oldestPending] = checkpointId;
          }
          // Update legacy field: set to next pending message or null if queue empty
          const nextPending = pendingQueue[0];
          if (nextPending !== undefined) {
            draft.pendingMessageForTurnEnd = { sessionId, messageId: nextPending };
          } else {
            draft.pendingMessageForTurnEnd = null;
          }
          // This checkpoint is ALSO the START of the next turn
          draft.currentTurnStartCheckpoint = { sessionId, checkpointId };
        } else {
          // Legacy single-pending support (fallback)
          const pending = draft.pendingMessageForTurnEnd;

          if (pending?.sessionId === sessionId) {
            // There's a message waiting for its turn END checkpoint
            // This checkpoint marks the END of that message's turn
            draft.turnEndCheckpoints[sessionId] ??= {};
            draft.turnEndCheckpoints[sessionId][pending.messageId] = checkpointId;

            // Clear the pending message
            draft.pendingMessageForTurnEnd = null;

            // This checkpoint is ALSO the START of the current turn
            // Store it for when the current message completes
            draft.currentTurnStartCheckpoint = { sessionId, checkpointId };
          } else if (draft.currentTurnStartCheckpoint?.sessionId !== sessionId) {
            // No pending message and no current turn start for this session
            // This is the first checkpoint of the session (turn 1 start)
            draft.currentTurnStartCheckpoint = { sessionId, checkpointId };
          } else {
            // Intermediate checkpoint during tool execution — ignored for turn tracking
          }
        }
        // Otherwise: intermediate checkpoint during tool execution, ignore for turn tracking

        // Evict oldest sessions to prevent unbounded memory growth across all session-keyed records.
        // Object.keys preserves insertion order for non-integer string keys
        // (guaranteed by V8/JSC/SpiderMonkey; spec-guaranteed for all target engines).
        const sessionKeys = Object.keys(draft.checkpointOrder);
        if (sessionKeys.length > MAX_CHECKPOINT_SESSIONS) {
          const evictCount = sessionKeys.length - MAX_CHECKPOINT_SESSIONS;
          for (const key of sessionKeys.slice(0, evictCount)) {
            // Skip the current session being written to
            if (key === sessionId) continue;
            Reflect.deleteProperty(draft.turnStartCheckpoints, key);
            Reflect.deleteProperty(draft.turnEndCheckpoints, key);
            Reflect.deleteProperty(draft.checkpointOrder, key);
            Reflect.deleteProperty(draft.latestCheckpoints, key);
            Reflect.deleteProperty(draft.pendingMessagesQueue, key);
            Reflect.deleteProperty(draft.rewindForkPoints, key);
            Reflect.deleteProperty(draft.pendingConversationForks, key);
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
        } else {
          // No turnStart checkpoint available — this shouldn't happen but handle gracefully
        }

        // Add this USER message to the pending queue (FIFO)
        // Multiple messages can complete before the next checkpoint arrives
        state.pendingMessagesQueue[sessionId] ??= [];
        state.pendingMessagesQueue[sessionId].push(userMessageId);

        // Also update legacy field for backwards compatibility
        state.pendingMessageForTurnEnd = { sessionId, messageId: userMessageId };

        // Clear the current user message ID (after consuming it above)
        state.currentUserMessageId = null;
      });
    },

    getRewindCheckpoints: (sessionId, messageId): RewindCheckpoints | undefined => {
      const state = get();

      const order = state.checkpointOrder[sessionId] ?? [];
      const pending = state.pendingMessageForTurnEnd;

      // Get the turnEnd checkpoint for this message
      let turnEnd = state.turnEndCheckpoints[sessionId]?.[messageId];

      // If this is the pending message (last message), use latest checkpoint
      if (!turnEnd && pending?.sessionId === sessionId && pending.messageId === messageId) {
        turnEnd = state.latestCheckpoints[sessionId];
      }

      if (!turnEnd) {
        return undefined;
      }

      // Use the NEXT checkpoint to include the response in the fork.
      // resumeSessionAt: userMessageUuid includes UP TO that message but NOT its response.
      // The next checkpoint comes AFTER the current message's response.
      const currentIndex = order.indexOf(turnEnd);
      const hasNextCheckpoint = currentIndex >= 0 && currentIndex < order.length - 1;
      const nextCheckpoint = hasNextCheckpoint ? order[currentIndex + 1] : undefined;
      const resumeAt = nextCheckpoint ?? turnEnd;

      return {
        resumeSessionAt: resumeAt,
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
        state.rewindForkPoints = Object.fromEntries(
          Object.entries(state.rewindForkPoints).filter(([key]) => key !== sessionId)
        );
        state.pendingConversationForks = Object.fromEntries(
          Object.entries(state.pendingConversationForks).filter(([key]) => key !== sessionId)
        );
        state.pendingMessagesQueue = Object.fromEntries(
          Object.entries(state.pendingMessagesQueue).filter(([key]) => key !== sessionId)
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
        state.rewindForkPoints = {};
        state.pendingConversationForks = {};
        state.pendingMessagesQueue = {};
        state.pendingMessageForTurnEnd = null;
        state.currentTurnStartCheckpoint = null;
        state.currentUserMessageId = null;
      });
    },

    // ============================================
    // Rewind Fork Point Implementations
    // ============================================

    setRewindForkPoint: (sessionId, messageUuid): void => {
      set((state) => {
        state.rewindForkPoints[sessionId] = messageUuid;
      });
    },

    consumeRewindForkPoint: (sessionId): string | null => {
      const forkPoint = get().rewindForkPoints[sessionId];
      if (forkPoint) {
        set((draft) => {
          Reflect.deleteProperty(draft.rewindForkPoints, sessionId);
        });
        return forkPoint;
      }
      return null;
    },

    hasRewindForkPoint: (sessionId): boolean => {
      return sessionId in get().rewindForkPoints;
    },

    clearRewindForkPoint: (sessionId): void => {
      set((state) => {
        Reflect.deleteProperty(state.rewindForkPoints, sessionId);
      });
    },

    // ============================================
    // Pending Conversation Fork Implementations
    // ============================================

    setPendingConversationFork: (originalSessionId, rewindMessageId): void => {
      set((state) => {
        state.pendingConversationForks[originalSessionId] = rewindMessageId;
      });
    },

    consumePendingConversationFork: (originalSessionId): string | null => {
      const rewindMessageId = get().pendingConversationForks[originalSessionId];
      if (rewindMessageId) {
        set((draft) => {
          Reflect.deleteProperty(draft.pendingConversationForks, originalSessionId);
        });
        return rewindMessageId;
      }
      return null;
    },

    hasPendingConversationFork: (originalSessionId): boolean => {
      return originalSessionId in get().pendingConversationForks;
    },

    reconcileUserMessageId: (sessionId, sdkMessageId): string | undefined => {
      const current = get().currentUserMessageId;

      if (current?.sessionId !== sessionId) {
        return undefined;
      }

      // Guard: only allow ONE reconciliation per onUserMessageSent call.
      // After the first successful reconciliation, `reconciled` is set to true.
      // Stale checkpoints from a previous turn (queued message race) are rejected
      // because they arrive after reconciliation has already completed.
      if (current.reconciled) {
        return undefined;
      }

      const oldFrontendId = current.messageId;
      if (oldFrontendId === sdkMessageId) {
        return undefined;
      }

      // Replace the whole object (not nested mutation) to ensure immer tracks the change.
      // Mutating only .messageId was silently dropped by immer in some cases.
      set((state) => {
        if (state.currentUserMessageId?.sessionId === sessionId) {
          state.currentUserMessageId = { sessionId, messageId: sdkMessageId, reconciled: true };
        }
      });

      return oldFrontendId;
    },

    remapSession: (oldSessionId, newSessionId): void => {
      set((state) => {
        // Update in-flight state objects — replace whole objects (not nested mutation)
        // to ensure immer tracks the change correctly.
        if (state.currentUserMessageId?.sessionId === oldSessionId) {
          state.currentUserMessageId = {
            ...state.currentUserMessageId,
            sessionId: newSessionId,
          };
        }
        if (state.pendingMessageForTurnEnd?.sessionId === oldSessionId) {
          state.pendingMessageForTurnEnd = {
            ...state.pendingMessageForTurnEnd,
            sessionId: newSessionId,
          };
        }
        if (state.currentTurnStartCheckpoint?.sessionId === oldSessionId) {
          state.currentTurnStartCheckpoint = {
            ...state.currentTurnStartCheckpoint,
            sessionId: newSessionId,
          };
        }

        // Migrate session-keyed records (move data from old key to new key)
        if (state.turnStartCheckpoints[oldSessionId] !== undefined) {
          state.turnStartCheckpoints[newSessionId] = state.turnStartCheckpoints[oldSessionId];
          Reflect.deleteProperty(state.turnStartCheckpoints, oldSessionId);
        }
        if (state.turnEndCheckpoints[oldSessionId] !== undefined) {
          state.turnEndCheckpoints[newSessionId] = state.turnEndCheckpoints[oldSessionId];
          Reflect.deleteProperty(state.turnEndCheckpoints, oldSessionId);
        }
        if (state.checkpointOrder[oldSessionId] !== undefined) {
          state.checkpointOrder[newSessionId] = state.checkpointOrder[oldSessionId];
          Reflect.deleteProperty(state.checkpointOrder, oldSessionId);
        }
        if (state.latestCheckpoints[oldSessionId] !== undefined) {
          state.latestCheckpoints[newSessionId] = state.latestCheckpoints[oldSessionId];
          Reflect.deleteProperty(state.latestCheckpoints, oldSessionId);
        }
        if (state.pendingMessagesQueue[oldSessionId] !== undefined) {
          state.pendingMessagesQueue[newSessionId] = state.pendingMessagesQueue[oldSessionId];
          Reflect.deleteProperty(state.pendingMessagesQueue, oldSessionId);
        }
        if (state.rewindForkPoints[oldSessionId] !== undefined) {
          state.rewindForkPoints[newSessionId] = state.rewindForkPoints[oldSessionId];
          Reflect.deleteProperty(state.rewindForkPoints, oldSessionId);
        }
        if (state.pendingConversationForks[oldSessionId] !== undefined) {
          state.pendingConversationForks[newSessionId] =
            state.pendingConversationForks[oldSessionId];
          Reflect.deleteProperty(state.pendingConversationForks, oldSessionId);
        }
      });
    },
  }))
);
