/**
 * Tests for checkpoint-store.ts
 *
 * Purpose: Tracks file checkpoints for the Rewind feature.
 * Each message has TWO checkpoints:
 * 1. Turn Start: User message UUID for SDK fork point
 * 2. Turn End: State after tools completed (for file restoration)
 */

import { useCheckpointStore } from '@/stores/agent/checkpoint-store';

describe('checkpoint-store', () => {
  const sessionId = 'session-123';

  beforeEach(() => {
    const { clearAll } = useCheckpointStore.getState();
    clearAll();
  });

  // ============================================================================
  // Initial State
  // ============================================================================

  describe('initial state', () => {
    it('should start with empty checkpoint maps', () => {
      const state = useCheckpointStore.getState();
      expect(state.turnStartCheckpoints).toEqual({});
      expect(state.turnEndCheckpoints).toEqual({});
      expect(state.checkpointOrder).toEqual({});
      expect(state.latestCheckpoints).toEqual({});
      expect(state.rewindForkPoints).toEqual({});
    });

    it('should start with null pending states', () => {
      const state = useCheckpointStore.getState();
      expect(state.currentTurnStartCheckpoint).toBeNull();
      expect(state.currentUserMessageId).toBeNull();
      expect(state.pendingMessageForTurnEnd).toBeNull();
    });
  });

  // ============================================================================
  // Full Flow: Single Turn
  // ============================================================================

  describe('single turn flow', () => {
    it('should track checkpoints through a complete turn', () => {
      const { onUserMessageSent, onCheckpointReceived, onMessageComplete, getRewindCheckpoints } =
        useCheckpointStore.getState();

      const userMsgId = 'user-msg-1';
      const checkpoint1 = 'checkpoint-1';

      // 1. Checkpoint arrives (turn start)
      onCheckpointReceived(sessionId, checkpoint1);

      // 2. User sends message
      onUserMessageSent(sessionId, userMsgId);

      // 3. Agent completes (associates checkpoint with user message)
      onMessageComplete(sessionId);

      // Verify turn start checkpoint is set
      expect(useCheckpointStore.getState().turnStartCheckpoints[sessionId]?.[userMsgId]).toBe(
        checkpoint1
      );

      // 4. Get rewind checkpoints (before next turn arrives)
      const checkpoints = getRewindCheckpoints(sessionId, userMsgId);

      // Should have resumeSessionAt (turn start) and use latest for rewindFiles
      expect(checkpoints?.resumeSessionAt).toBe(checkpoint1);
      // Since no next turn, rewindFiles falls back to turnStart or latest
      expect(checkpoints?.rewindFiles).toBe(checkpoint1);
    });
  });

  // ============================================================================
  // Full Flow: Multiple Turns
  // ============================================================================

  describe('multi-turn flow', () => {
    it('should track checkpoints across multiple turns', () => {
      const {
        onUserMessageSent,
        onCheckpointReceived,
        onMessageComplete,
        getRewindCheckpoints,
        getTurnStartCheckpoint,
        getTurnEndCheckpoint,
      } = useCheckpointStore.getState();

      // === Turn 1 ===
      const checkpoint1 = 'cp-1';
      onCheckpointReceived(sessionId, checkpoint1);
      onUserMessageSent(sessionId, 'user-1');
      onMessageComplete(sessionId);

      // === Turn 2 ===
      const checkpoint2 = 'cp-2';
      onCheckpointReceived(sessionId, checkpoint2); // This marks end of turn 1
      onUserMessageSent(sessionId, 'user-2');
      onMessageComplete(sessionId);

      // === Turn 3 ===
      const checkpoint3 = 'cp-3';
      onCheckpointReceived(sessionId, checkpoint3); // This marks end of turn 2
      onUserMessageSent(sessionId, 'user-3');
      onMessageComplete(sessionId);

      // Verify Turn 1 checkpoints
      expect(getTurnStartCheckpoint(sessionId, 'user-1')).toBe(checkpoint1);
      expect(getTurnEndCheckpoint(sessionId, 'user-1')).toBe(checkpoint2);

      // Verify Turn 2 checkpoints
      expect(getTurnStartCheckpoint(sessionId, 'user-2')).toBe(checkpoint2);
      expect(getTurnEndCheckpoint(sessionId, 'user-2')).toBe(checkpoint3);

      // Verify Turn 3 checkpoints (last turn)
      expect(getTurnStartCheckpoint(sessionId, 'user-3')).toBe(checkpoint3);
      // Turn 3 end not set yet (waiting for next turn)
      // But getTurnEndCheckpoint uses latestCheckpoints as fallback
      expect(getTurnEndCheckpoint(sessionId, 'user-3')).toBe(checkpoint3);

      // Verify rewind checkpoints for turn 1
      // Implementation now uses NEXT checkpoint for resumeSessionAt (see checkpoint-store.ts):
      // - resumeSessionAt: cp-3 (next checkpoint) to include the RESPONSE to user-1
      //   The SDK's resumeSessionAt includes messages UP TO the checkpoint, not AFTER
      //   Using cp-2 would only include user-1, not its response
      // - rewindFiles: cp-2 (turnEnd) for file state after user-1's turn completed
      const turn1Checkpoints = getRewindCheckpoints(sessionId, 'user-1');
      expect(turn1Checkpoints?.resumeSessionAt).toBe(checkpoint3); // NEXT checkpoint
      expect(turn1Checkpoints?.rewindFiles).toBe(checkpoint2); // turnEnd for file state
    });
  });

  // ============================================================================
  // onUserMessageSent
  // ============================================================================

  describe('onUserMessageSent', () => {
    it('should store user message ID for the session', () => {
      const { onUserMessageSent } = useCheckpointStore.getState();

      onUserMessageSent(sessionId, 'user-msg-1');

      const state = useCheckpointStore.getState();
      expect(state.currentUserMessageId).toEqual({
        sessionId,
        messageId: 'user-msg-1',
      });
    });

    it('should overwrite previous user message ID', () => {
      const { onUserMessageSent } = useCheckpointStore.getState();

      onUserMessageSent(sessionId, 'user-msg-1');
      onUserMessageSent(sessionId, 'user-msg-2');

      const state = useCheckpointStore.getState();
      expect(state.currentUserMessageId?.messageId).toBe('user-msg-2');
    });
  });

  // ============================================================================
  // onCheckpointReceived
  // ============================================================================

  describe('onCheckpointReceived', () => {
    it('should track checkpoint in order', () => {
      const { onCheckpointReceived } = useCheckpointStore.getState();

      onCheckpointReceived(sessionId, 'cp-1');
      onCheckpointReceived(sessionId, 'cp-2');

      const state = useCheckpointStore.getState();
      expect(state.checkpointOrder[sessionId]).toEqual(['cp-1', 'cp-2']);
    });

    it('should track latest checkpoint', () => {
      const { onCheckpointReceived } = useCheckpointStore.getState();

      onCheckpointReceived(sessionId, 'cp-1');
      expect(useCheckpointStore.getState().latestCheckpoints[sessionId]).toBe('cp-1');

      onCheckpointReceived(sessionId, 'cp-2');
      expect(useCheckpointStore.getState().latestCheckpoints[sessionId]).toBe('cp-2');
    });

    it('should set turn end for pending message', () => {
      const { onUserMessageSent, onCheckpointReceived, onMessageComplete } =
        useCheckpointStore.getState();

      // Turn 1
      onCheckpointReceived(sessionId, 'cp-1');
      onUserMessageSent(sessionId, 'user-1');
      onMessageComplete(sessionId);

      // Now user-1 is pending for turn end
      expect(useCheckpointStore.getState().pendingMessageForTurnEnd).toEqual({
        sessionId,
        messageId: 'user-1',
      });

      // Next checkpoint marks end of turn 1
      onCheckpointReceived(sessionId, 'cp-2');

      // user-1 should now have turn end set
      expect(useCheckpointStore.getState().turnEndCheckpoints[sessionId]?.['user-1']).toBe('cp-2');

      // Pending should be cleared
      expect(useCheckpointStore.getState().pendingMessageForTurnEnd).toBeNull();
    });

    it('should set current turn start when first checkpoint arrives', () => {
      const { onCheckpointReceived } = useCheckpointStore.getState();

      onCheckpointReceived(sessionId, 'cp-1');

      expect(useCheckpointStore.getState().currentTurnStartCheckpoint).toEqual({
        sessionId,
        checkpointId: 'cp-1',
      });
    });

    it('should not add duplicate checkpoints to order', () => {
      const { onCheckpointReceived } = useCheckpointStore.getState();

      onCheckpointReceived(sessionId, 'cp-1');
      onCheckpointReceived(sessionId, 'cp-1'); // Duplicate

      expect(useCheckpointStore.getState().checkpointOrder[sessionId]).toEqual(['cp-1']);
    });
  });

  // ============================================================================
  // onMessageComplete
  // ============================================================================

  describe('onMessageComplete', () => {
    it('should associate turn start checkpoint with user message', () => {
      const { onUserMessageSent, onCheckpointReceived, onMessageComplete } =
        useCheckpointStore.getState();

      onCheckpointReceived(sessionId, 'cp-1');
      onUserMessageSent(sessionId, 'user-1');
      onMessageComplete(sessionId);

      expect(useCheckpointStore.getState().turnStartCheckpoints[sessionId]?.['user-1']).toBe(
        'cp-1'
      );
    });

    it('should clear current turn start checkpoint', () => {
      const { onUserMessageSent, onCheckpointReceived, onMessageComplete } =
        useCheckpointStore.getState();

      onCheckpointReceived(sessionId, 'cp-1');
      onUserMessageSent(sessionId, 'user-1');
      onMessageComplete(sessionId);

      expect(useCheckpointStore.getState().currentTurnStartCheckpoint).toBeNull();
    });

    it('should set pending message for turn end', () => {
      const { onUserMessageSent, onCheckpointReceived, onMessageComplete } =
        useCheckpointStore.getState();

      onCheckpointReceived(sessionId, 'cp-1');
      onUserMessageSent(sessionId, 'user-1');
      onMessageComplete(sessionId);

      expect(useCheckpointStore.getState().pendingMessageForTurnEnd).toEqual({
        sessionId,
        messageId: 'user-1',
      });
    });

    it('should clear current user message ID', () => {
      const { onUserMessageSent, onCheckpointReceived, onMessageComplete } =
        useCheckpointStore.getState();

      onCheckpointReceived(sessionId, 'cp-1');
      onUserMessageSent(sessionId, 'user-1');
      onMessageComplete(sessionId);

      expect(useCheckpointStore.getState().currentUserMessageId).toBeNull();
    });

    it('should handle missing user message gracefully', () => {
      const { onCheckpointReceived, onMessageComplete } = useCheckpointStore.getState();

      onCheckpointReceived(sessionId, 'cp-1');
      // No user message sent

      // Should not throw
      expect(() => {
        onMessageComplete(sessionId);
      }).not.toThrow();

      // Should not set any checkpoints
      expect(useCheckpointStore.getState().turnStartCheckpoints).toEqual({});
    });

    it('should handle wrong session gracefully', () => {
      const { onUserMessageSent, onCheckpointReceived, onMessageComplete } =
        useCheckpointStore.getState();

      onCheckpointReceived(sessionId, 'cp-1');
      onUserMessageSent(sessionId, 'user-1');

      // Complete with different session
      onMessageComplete('different-session');

      // Should not associate checkpoints
      expect(useCheckpointStore.getState().turnStartCheckpoints).toEqual({});
    });
  });

  // ============================================================================
  // getRewindCheckpoints
  // ============================================================================

  describe('getRewindCheckpoints', () => {
    it('should return undefined for non-existent message', () => {
      const { getRewindCheckpoints } = useCheckpointStore.getState();

      const result = getRewindCheckpoints(sessionId, 'non-existent');
      expect(result).toBeUndefined();
    });

    it('should return both checkpoint types', () => {
      const { onUserMessageSent, onCheckpointReceived, onMessageComplete, getRewindCheckpoints } =
        useCheckpointStore.getState();

      // Turn 1
      onCheckpointReceived(sessionId, 'cp-1');
      onUserMessageSent(sessionId, 'user-1');
      onMessageComplete(sessionId);

      // Turn 2 (sets turn 1 end)
      onCheckpointReceived(sessionId, 'cp-2');
      onUserMessageSent(sessionId, 'user-2');
      onMessageComplete(sessionId);

      const checkpoints = getRewindCheckpoints(sessionId, 'user-1');
      // Implementation uses turnEnd for BOTH resumeSessionAt and rewindFiles:
      // - First message has no turnStart (no checkpoint precedes it)
      // - Using turnStart would only include user message, causing concatenation issues
      expect(checkpoints).toEqual({
        resumeSessionAt: 'cp-2',
        rewindFiles: 'cp-2',
      });
    });

    it('should use latest checkpoint as fallback for pending message', () => {
      const { onUserMessageSent, onCheckpointReceived, onMessageComplete, getRewindCheckpoints } =
        useCheckpointStore.getState();

      onCheckpointReceived(sessionId, 'cp-1');
      onUserMessageSent(sessionId, 'user-1');
      onMessageComplete(sessionId);

      // user-1 is pending, no turn end yet
      const checkpoints = getRewindCheckpoints(sessionId, 'user-1');

      // Should use cp-1 as fallback for rewindFiles
      expect(checkpoints?.rewindFiles).toBe('cp-1');
    });
  });

  // ============================================================================
  // addCheckpoints (for persistence restoration)
  // ============================================================================

  describe('addCheckpoints', () => {
    it('should directly add checkpoints for a message', () => {
      const { addCheckpoints, getTurnStartCheckpoint, getTurnEndCheckpoint } =
        useCheckpointStore.getState();

      addCheckpoints(sessionId, 'user-1', 'cp-start', 'cp-end');

      expect(getTurnStartCheckpoint(sessionId, 'user-1')).toBe('cp-start');
      expect(getTurnEndCheckpoint(sessionId, 'user-1')).toBe('cp-end');
    });

    it('should add checkpoints to order', () => {
      const { addCheckpoints } = useCheckpointStore.getState();

      addCheckpoints(sessionId, 'user-1', 'cp-start', 'cp-end');

      expect(useCheckpointStore.getState().checkpointOrder[sessionId]).toContain('cp-start');
      expect(useCheckpointStore.getState().checkpointOrder[sessionId]).toContain('cp-end');
    });

    it('should handle missing turn end', () => {
      const { addCheckpoints, getTurnEndCheckpoint } = useCheckpointStore.getState();

      addCheckpoints(sessionId, 'user-1', 'cp-start');

      expect(getTurnEndCheckpoint(sessionId, 'user-1')).toBeUndefined();
    });
  });

  // ============================================================================
  // getSessionCheckpoints (debugging)
  // ============================================================================

  describe('getSessionCheckpoints', () => {
    it('should return undefined for non-existent session', () => {
      const { getSessionCheckpoints } = useCheckpointStore.getState();
      expect(getSessionCheckpoints('non-existent')).toBeUndefined();
    });

    it('should return all session data', () => {
      const { onUserMessageSent, onCheckpointReceived, onMessageComplete, getSessionCheckpoints } =
        useCheckpointStore.getState();

      onCheckpointReceived(sessionId, 'cp-1');
      onUserMessageSent(sessionId, 'user-1');
      onMessageComplete(sessionId);

      const sessionData = getSessionCheckpoints(sessionId);

      expect(sessionData?.turnStarts).toEqual({ 'user-1': 'cp-1' });
      expect(sessionData?.order).toContain('cp-1');
    });
  });

  // ============================================================================
  // clearSessionCheckpoints
  // ============================================================================

  describe('clearSessionCheckpoints', () => {
    it('should clear checkpoints for specific session', () => {
      const {
        onUserMessageSent,
        onCheckpointReceived,
        onMessageComplete,
        clearSessionCheckpoints,
      } = useCheckpointStore.getState();

      // Session 1
      onCheckpointReceived(sessionId, 'cp-1');
      onUserMessageSent(sessionId, 'user-1');
      onMessageComplete(sessionId);

      // Session 2
      onCheckpointReceived('session-2', 'cp-2');
      onUserMessageSent('session-2', 'user-2');
      onMessageComplete('session-2');

      // Clear session 1
      clearSessionCheckpoints(sessionId);

      // Session 1 should be cleared
      expect(useCheckpointStore.getState().turnStartCheckpoints[sessionId]).toBeUndefined();

      // Session 2 should remain
      expect(useCheckpointStore.getState().turnStartCheckpoints['session-2']?.['user-2']).toBe(
        'cp-2'
      );
    });

    it('should clear pending states for the session', () => {
      const {
        onUserMessageSent,
        onCheckpointReceived,
        onMessageComplete,
        clearSessionCheckpoints,
      } = useCheckpointStore.getState();

      onCheckpointReceived(sessionId, 'cp-1');
      onUserMessageSent(sessionId, 'user-1');
      onMessageComplete(sessionId);

      clearSessionCheckpoints(sessionId);

      expect(useCheckpointStore.getState().pendingMessageForTurnEnd).toBeNull();
    });
  });

  // ============================================================================
  // clearAll
  // ============================================================================

  describe('clearAll', () => {
    it('should clear all state', () => {
      const {
        onUserMessageSent,
        onCheckpointReceived,
        onMessageComplete,
        setRewindForkPoint,
        clearAll,
      } = useCheckpointStore.getState();

      onCheckpointReceived(sessionId, 'cp-1');
      onUserMessageSent(sessionId, 'user-1');
      onMessageComplete(sessionId);
      setRewindForkPoint(sessionId, 'fork-point-1');

      clearAll();

      const state = useCheckpointStore.getState();
      expect(state.turnStartCheckpoints).toEqual({});
      expect(state.turnEndCheckpoints).toEqual({});
      expect(state.checkpointOrder).toEqual({});
      expect(state.latestCheckpoints).toEqual({});
      expect(state.rewindForkPoints).toEqual({});
      expect(state.pendingMessageForTurnEnd).toBeNull();
      expect(state.currentTurnStartCheckpoint).toBeNull();
      expect(state.currentUserMessageId).toBeNull();
    });
  });

  // ============================================================================
  // Rewind Fork Points (Claude Code-style branching)
  // ============================================================================

  describe('rewind fork points', () => {
    it('should set a fork point for a session', () => {
      const { setRewindForkPoint, hasRewindForkPoint } = useCheckpointStore.getState();

      expect(hasRewindForkPoint(sessionId)).toBe(false);

      setRewindForkPoint(sessionId, 'msg-uuid-1');

      expect(hasRewindForkPoint(sessionId)).toBe(true);
      expect(useCheckpointStore.getState().rewindForkPoints[sessionId]).toBe('msg-uuid-1');
    });

    it('should consume and clear fork point (one-time use)', () => {
      const { setRewindForkPoint, consumeRewindForkPoint, hasRewindForkPoint } =
        useCheckpointStore.getState();

      setRewindForkPoint(sessionId, 'msg-uuid-1');
      expect(hasRewindForkPoint(sessionId)).toBe(true);

      const forkPoint = consumeRewindForkPoint(sessionId);
      expect(forkPoint).toBe('msg-uuid-1');
      expect(hasRewindForkPoint(sessionId)).toBe(false);

      // Second consume should return null
      const secondConsume = consumeRewindForkPoint(sessionId);
      expect(secondConsume).toBeNull();
    });

    it('should return null when consuming non-existent fork point', () => {
      const { consumeRewindForkPoint } = useCheckpointStore.getState();

      const result = consumeRewindForkPoint('non-existent-session');
      expect(result).toBeNull();
    });

    it('should clear fork point without consuming', () => {
      const { setRewindForkPoint, clearRewindForkPoint, hasRewindForkPoint } =
        useCheckpointStore.getState();

      setRewindForkPoint(sessionId, 'msg-uuid-1');
      expect(hasRewindForkPoint(sessionId)).toBe(true);

      clearRewindForkPoint(sessionId);
      expect(hasRewindForkPoint(sessionId)).toBe(false);
    });

    it('should handle multiple sessions independently', () => {
      const { setRewindForkPoint, consumeRewindForkPoint, hasRewindForkPoint } =
        useCheckpointStore.getState();

      setRewindForkPoint('session-1', 'msg-1');
      setRewindForkPoint('session-2', 'msg-2');

      expect(hasRewindForkPoint('session-1')).toBe(true);
      expect(hasRewindForkPoint('session-2')).toBe(true);

      const fork1 = consumeRewindForkPoint('session-1');
      expect(fork1).toBe('msg-1');
      expect(hasRewindForkPoint('session-1')).toBe(false);
      expect(hasRewindForkPoint('session-2')).toBe(true);
    });

    it('should be cleared by clearSessionCheckpoints', () => {
      const { setRewindForkPoint, clearSessionCheckpoints, hasRewindForkPoint } =
        useCheckpointStore.getState();

      setRewindForkPoint(sessionId, 'msg-uuid-1');
      expect(hasRewindForkPoint(sessionId)).toBe(true);

      clearSessionCheckpoints(sessionId);
      expect(hasRewindForkPoint(sessionId)).toBe(false);
    });

    it('should overwrite previous fork point for same session', () => {
      const { setRewindForkPoint, consumeRewindForkPoint } = useCheckpointStore.getState();

      setRewindForkPoint(sessionId, 'msg-1');
      setRewindForkPoint(sessionId, 'msg-2');

      const forkPoint = consumeRewindForkPoint(sessionId);
      expect(forkPoint).toBe('msg-2');
    });
  });
});
