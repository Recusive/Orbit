/**
 * Tests for parentUuid tracking in message creation
 *
 * These tests verify the parentUuid logic in chat-actions.ts:
 * 1. First message has parentUuid = null
 * 2. Subsequent messages get parentUuid of the previous message
 * 3. After rewind, next message uses fork point as parentUuid (consumed)
 *
 * Note: The actual createChatActions function has many dependencies.
 * These tests verify the LOGIC for parentUuid assignment which is:
 *   const forkPoint = checkpointStore.consumeRewindForkPoint(sessionId);
 *   const lastMessage = messages[messages.length - 1];
 *   const parentUuid = forkPoint ?? lastMessage?.id ?? null;
 */

import { useCheckpointStore } from '@/stores/agent/checkpoint-store';

describe('parentUuid tracking logic', () => {
  const sessionId = 'test-session';

  beforeEach(() => {
    useCheckpointStore.getState().clearAll();
  });

  describe('basic parentUuid assignment', () => {
    it('should assign null parentUuid for first message (empty messages array)', () => {
      const messages: { id: string }[] = [];

      // Simulate the logic from chat-actions.ts
      const forkPoint = useCheckpointStore.getState().consumeRewindForkPoint(sessionId);
      const lastMessage = messages[messages.length - 1];
      const parentUuid = forkPoint ?? lastMessage?.id ?? null;

      expect(parentUuid).toBeNull();
    });

    it('should assign last message id as parentUuid for subsequent messages', () => {
      const messages = [{ id: 'msg-1' }, { id: 'msg-2' }, { id: 'msg-3' }];

      // Simulate the logic from chat-actions.ts
      const forkPoint = useCheckpointStore.getState().consumeRewindForkPoint(sessionId);
      const lastMessage = messages[messages.length - 1];
      const parentUuid = forkPoint ?? lastMessage?.id ?? null;

      expect(parentUuid).toBe('msg-3');
    });
  });

  describe('fork point integration', () => {
    it('should use fork point as parentUuid when set (rewind scenario)', () => {
      const messages = [{ id: 'msg-1' }, { id: 'msg-2' }, { id: 'msg-3' }, { id: 'msg-4' }];

      // Simulate rewind: set fork point to msg-2 (user clicked rewind on msg-2)
      useCheckpointStore.getState().setRewindForkPoint(sessionId, 'msg-2');

      // Simulate the logic from chat-actions.ts
      const forkPoint = useCheckpointStore.getState().consumeRewindForkPoint(sessionId);
      const lastMessage = messages[messages.length - 1];
      const parentUuid = forkPoint ?? lastMessage?.id ?? null;

      // Fork point takes priority over last message
      expect(parentUuid).toBe('msg-2');
    });

    it('should consume fork point (one-time use)', () => {
      useCheckpointStore.getState().setRewindForkPoint(sessionId, 'fork-msg');

      // First consume
      const firstConsume = useCheckpointStore.getState().consumeRewindForkPoint(sessionId);
      expect(firstConsume).toBe('fork-msg');

      // Second consume should return null (fork point was consumed)
      const secondConsume = useCheckpointStore.getState().consumeRewindForkPoint(sessionId);
      expect(secondConsume).toBeNull();
    });

    it('should fall back to last message after fork point is consumed', () => {
      const messages = [{ id: 'msg-1' }, { id: 'msg-2' }];

      // Set and consume fork point
      useCheckpointStore.getState().setRewindForkPoint(sessionId, 'fork-point');
      useCheckpointStore.getState().consumeRewindForkPoint(sessionId);

      // Next message should use last message as parent (fork point consumed)
      const forkPoint = useCheckpointStore.getState().consumeRewindForkPoint(sessionId);
      const lastMessage = messages[messages.length - 1];
      const parentUuid = forkPoint ?? lastMessage?.id ?? null;

      expect(parentUuid).toBe('msg-2');
    });

    it('should handle rewind flow: set fork point, create branch message', () => {
      // Initial state: conversation with 4 messages
      // (Documenting full state for understanding, only rewound messages used below)
      // [user-1, assistant-1, user-2, assistant-2]

      // User clicks rewind on assistant-1 (the response they want to branch from)
      // In the actual code, conversation:rewound handler sets this
      useCheckpointStore.getState().setRewindForkPoint(sessionId, 'assistant-1');

      // Messages are now truncated (in real flow, conversation:rewound does this)
      const rewoundMessages = [
        { id: 'user-1', role: 'user' as const },
        { id: 'assistant-1', role: 'assistant' as const },
      ];

      // User sends a new message - this should branch from assistant-1
      const forkPoint = useCheckpointStore.getState().consumeRewindForkPoint(sessionId);
      const lastMessage = rewoundMessages[rewoundMessages.length - 1];
      const newMessageParentUuid = forkPoint ?? lastMessage?.id ?? null;

      // The new user message should have parentUuid = 'assistant-1'
      // This creates a fork:
      //   user-1 -> assistant-1 -> user-2 -> assistant-2 (old branch)
      //                        \-> user-3 (new branch from fork point)
      expect(newMessageParentUuid).toBe('assistant-1');

      // Fork point is now consumed - subsequent messages use normal flow
      expect(useCheckpointStore.getState().hasRewindForkPoint(sessionId)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple sessions independently', () => {
      const session1 = 'session-1';
      const session2 = 'session-2';

      useCheckpointStore.getState().setRewindForkPoint(session1, 'fork-1');
      useCheckpointStore.getState().setRewindForkPoint(session2, 'fork-2');

      // Each session has its own fork point
      expect(useCheckpointStore.getState().consumeRewindForkPoint(session1)).toBe('fork-1');
      expect(useCheckpointStore.getState().consumeRewindForkPoint(session2)).toBe('fork-2');
    });

    it('should handle consuming fork point for non-existent session', () => {
      const result = useCheckpointStore.getState().consumeRewindForkPoint('non-existent');
      expect(result).toBeNull();
    });

    it('should overwrite previous fork point if rewind clicked again', () => {
      useCheckpointStore.getState().setRewindForkPoint(sessionId, 'first-fork');
      useCheckpointStore.getState().setRewindForkPoint(sessionId, 'second-fork');

      const forkPoint = useCheckpointStore.getState().consumeRewindForkPoint(sessionId);
      expect(forkPoint).toBe('second-fork');
    });

    it('should clear fork point when session is cleared', () => {
      useCheckpointStore.getState().setRewindForkPoint(sessionId, 'some-fork');
      expect(useCheckpointStore.getState().hasRewindForkPoint(sessionId)).toBe(true);

      useCheckpointStore.getState().clearSessionCheckpoints(sessionId);
      expect(useCheckpointStore.getState().hasRewindForkPoint(sessionId)).toBe(false);
    });
  });

  describe('parentUuid chain validation', () => {
    /**
     * This test verifies the complete parentUuid chain scenario:
     *
     * Scenario:
     * 1. User sends message 1 (parentUuid: null)
     * 2. Assistant responds with message 2 (parentUuid: msg-1)
     * 3. User sends message 3 (parentUuid: msg-2)
     * 4. Assistant responds with message 4 (parentUuid: msg-3)
     * 5. User rewinds to message 2
     * 6. User sends message 5 (parentUuid: msg-2, creating a fork)
     * 7. Assistant responds with message 6 (parentUuid: msg-5)
     *
     * Final chain from head: [msg-1, msg-2, msg-5, msg-6]
     * Orphaned: [msg-3, msg-4]
     */
    it('should build correct chain with fork scenario', () => {
      // Simulate building messages with correct parentUuid
      const messages: { id: string; parentUuid: string | null }[] = [];

      // Helper to add message with parentUuid logic
      const addMessage = (id: string): void => {
        const forkPoint = useCheckpointStore.getState().consumeRewindForkPoint(sessionId);
        const lastMessage = messages[messages.length - 1];
        const parentUuid = forkPoint ?? lastMessage?.id ?? null;
        messages.push({ id, parentUuid });
      };

      // Normal conversation
      addMessage('msg-1'); // parentUuid: null (first message)
      addMessage('msg-2'); // parentUuid: msg-1
      addMessage('msg-3'); // parentUuid: msg-2
      addMessage('msg-4'); // parentUuid: msg-3

      expect(messages).toEqual([
        { id: 'msg-1', parentUuid: null },
        { id: 'msg-2', parentUuid: 'msg-1' },
        { id: 'msg-3', parentUuid: 'msg-2' },
        { id: 'msg-4', parentUuid: 'msg-3' },
      ]);

      // Rewind to msg-2 (in real flow, conversation:rewound would truncate messages)
      useCheckpointStore.getState().setRewindForkPoint(sessionId, 'msg-2');

      // Continue adding messages (these would be added after rewind truncation)
      addMessage('msg-5'); // parentUuid: msg-2 (fork point consumed)
      addMessage('msg-6'); // parentUuid: msg-5 (normal flow)

      // Last two messages should show the fork
      expect(messages[4]).toEqual({ id: 'msg-5', parentUuid: 'msg-2' }); // Fork!
      expect(messages[5]).toEqual({ id: 'msg-6', parentUuid: 'msg-5' });
    });
  });
});
