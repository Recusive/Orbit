/**
 * End-to-End Integration Test: Full Rewind Flow
 *
 * This test validates the COMPLETE rewind flow using parentUuid-based branching.
 * It simulates a realistic conversation with rewind and verifies:
 *
 * 1. parentUuid chain is correctly built during normal conversation
 * 2. Fork point is set correctly when rewind is triggered
 * 3. New messages after rewind have the correct parentUuid (creating a fork)
 * 4. getActiveChain returns only the active branch, excluding orphaned messages
 *
 * Test Scenario:
 * ```
 * msg1 (user) → resp1 (assistant) → msg2 (user) → resp2 (assistant)
 *                                 ↘
 *                                   msg3 (user, after rewind) → resp3 (assistant)
 * ```
 *
 * Active chain after rewind: [msg1, resp1, msg3, resp3]
 * Orphaned: [msg2, resp2]
 *
 * @see CLAUDE.md - Rewind feature documentation
 * @see checkpoint-store.ts - Fork point management
 * @see message-utils.ts - getActiveChain implementation
 */

import { getActiveChain } from '@/components/chat/messages/message-utils';
import { useCheckpointStore } from '@/stores/agent/checkpoint-store';

// =============================================================================
// Types
// =============================================================================

interface TestMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  parentUuid: string | null;
  createdAt: number;
}

// =============================================================================
// Test Setup
// =============================================================================

const SESSION_ID = 'integration-test-session';

/**
 * Simulates the parentUuid assignment logic from chat-actions.ts
 *
 * The actual logic in the codebase:
 * ```typescript
 * const forkPoint = checkpointStore.consumeRewindForkPoint(sessionId);
 * const lastMessage = messages[messages.length - 1];
 * const parentUuid = forkPoint ?? lastMessage?.id ?? null;
 * ```
 */
function computeParentUuid(sessionId: string, messages: readonly TestMessage[]): string | null {
  const forkPoint = useCheckpointStore.getState().consumeRewindForkPoint(sessionId);
  const lastMessage = messages[messages.length - 1];
  return forkPoint ?? lastMessage?.id ?? null;
}

/**
 * Creates a message with correct parentUuid based on current state.
 * Simulates what happens when a message is sent in the actual app.
 */
function createMessage(
  sessionId: string,
  id: string,
  role: 'user' | 'assistant',
  content: string,
  messages: readonly TestMessage[],
  timestamp: number
): TestMessage {
  const parentUuid = computeParentUuid(sessionId, messages);
  return {
    id,
    role,
    content,
    parentUuid,
    createdAt: timestamp,
  };
}

// =============================================================================
// Test Lifecycle
// =============================================================================

beforeEach(() => {
  useCheckpointStore.getState().clearAll();
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Full Rewind Flow Integration', () => {
  describe('complete rewind scenario', () => {
    /**
     * This is the key integration test that validates the entire flow:
     *
     * 1. Send message 1 → verify parentUuid = null
     * 2. Receive response → verify chain: [msg1, response1]
     * 3. Send message 2 → verify parentUuid = response1.id
     * 4. Receive response → verify chain: [msg1, resp1, msg2, resp2]
     * 5. Trigger rewind to after message 1 (fork point = response1.id)
     * 6. Send message 3 → verify parentUuid = response1.id (same as msg2 had!)
     * 7. Verify msg2 and msg3 have SAME parentUuid (this proves fork worked)
     * 8. Verify getActiveChain returns [msg1, resp1, msg3, resp3] (msg2, resp2 orphaned)
     */
    it('should create proper fork when rewinding and continue conversation', () => {
      const messages: TestMessage[] = [];
      let timestamp = 1000;

      // === STEP 1: Send first user message ===
      const msg1 = createMessage(
        SESSION_ID,
        'user-msg-1',
        'user',
        'Hello, Claude!',
        messages,
        timestamp++
      );
      messages.push(msg1);

      // First message has null parentUuid
      expect(msg1.parentUuid).toBeNull();

      // === STEP 2: Receive assistant response ===
      const resp1 = createMessage(
        SESSION_ID,
        'assistant-resp-1',
        'assistant',
        'Hello! How can I help?',
        messages,
        timestamp++
      );
      messages.push(resp1);

      // Response points to user message
      expect(resp1.parentUuid).toBe('user-msg-1');

      // Active chain at this point: [msg1, resp1]
      const chain1 = getActiveChain(messages);
      expect(chain1.map((m) => m.id)).toEqual(['user-msg-1', 'assistant-resp-1']);

      // === STEP 3: Send second user message ===
      const msg2 = createMessage(
        SESSION_ID,
        'user-msg-2',
        'user',
        'Write some code',
        messages,
        timestamp++
      );
      messages.push(msg2);

      // Second message points to previous response
      expect(msg2.parentUuid).toBe('assistant-resp-1');

      // === STEP 4: Receive second response ===
      const resp2 = createMessage(
        SESSION_ID,
        'assistant-resp-2',
        'assistant',
        'Here is some code: ...',
        messages,
        timestamp++
      );
      messages.push(resp2);

      expect(resp2.parentUuid).toBe('user-msg-2');

      // Active chain: [msg1, resp1, msg2, resp2]
      const chain2 = getActiveChain(messages);
      expect(chain2.map((m) => m.id)).toEqual([
        'user-msg-1',
        'assistant-resp-1',
        'user-msg-2',
        'assistant-resp-2',
      ]);

      // === STEP 5: Trigger rewind to after response 1 ===
      // User clicks rewind on resp1. The fork point is set to resp1's ID.
      // This means the NEXT message should branch from resp1.
      useCheckpointStore.getState().setRewindForkPoint(SESSION_ID, 'assistant-resp-1');

      // Verify fork point is set
      expect(useCheckpointStore.getState().hasRewindForkPoint(SESSION_ID)).toBe(true);

      // In the real app, the UI would filter messages to show only [msg1, resp1].
      // The old messages (msg2, resp2) remain in storage but are orphaned.

      // === STEP 6: Send new message after rewind ===
      // This is the KEY moment - msg3 should have the same parentUuid as msg2 did!
      const msg3 = createMessage(
        SESSION_ID,
        'user-msg-3',
        'user',
        'Actually, explain the concept instead',
        messages,
        timestamp++
      );
      messages.push(msg3);

      // === STEP 7: Verify the fork ===
      // msg3 and msg2 should have the SAME parentUuid - this proves the fork works!
      expect(msg3.parentUuid).toBe('assistant-resp-1');
      expect(msg3.parentUuid).toBe(msg2.parentUuid); // KEY ASSERTION

      // Fork point should be consumed (one-time use)
      expect(useCheckpointStore.getState().hasRewindForkPoint(SESSION_ID)).toBe(false);

      // === STEP 8: Continue conversation on new branch ===
      const resp3 = createMessage(
        SESSION_ID,
        'assistant-resp-3',
        'assistant',
        'Let me explain the concept...',
        messages,
        timestamp++
      );
      messages.push(resp3);

      expect(resp3.parentUuid).toBe('user-msg-3');

      // === STEP 9: Verify active chain excludes orphaned messages ===
      // All 6 messages are in storage, but active chain should only show 4
      expect(messages).toHaveLength(6);

      const activeChain = getActiveChain(messages);

      // Active chain: [msg1, resp1, msg3, resp3]
      // Orphaned: [msg2, resp2]
      expect(activeChain.map((m) => m.id)).toEqual([
        'user-msg-1',
        'assistant-resp-1',
        'user-msg-3',
        'assistant-resp-3',
      ]);

      // Verify orphaned messages are NOT in active chain
      const activeIds = new Set(activeChain.map((m) => m.id));
      expect(activeIds.has('user-msg-2')).toBe(false);
      expect(activeIds.has('assistant-resp-2')).toBe(false);
    });
  });

  describe('parentUuid chain construction', () => {
    it('should build linear chain without forks', () => {
      const messages: TestMessage[] = [];
      let timestamp = 1000;

      // Build a 4-message conversation
      for (let i = 0; i < 4; i++) {
        const role = i % 2 === 0 ? 'user' : 'assistant';
        const msg = createMessage(
          SESSION_ID,
          `msg-${String(i + 1)}`,
          role,
          `Message ${String(i + 1)}`,
          messages,
          timestamp++
        );
        messages.push(msg);
      }

      // Verify chain
      expect(messages[0]?.parentUuid).toBeNull();
      expect(messages[1]?.parentUuid).toBe('msg-1');
      expect(messages[2]?.parentUuid).toBe('msg-2');
      expect(messages[3]?.parentUuid).toBe('msg-3');

      // getActiveChain should return all messages in order
      const chain = getActiveChain(messages);
      expect(chain.map((m) => m.id)).toEqual(['msg-1', 'msg-2', 'msg-3', 'msg-4']);
    });
  });

  describe('multiple rewinds (nested forks)', () => {
    it('should handle multiple rewinds correctly', () => {
      const messages: TestMessage[] = [];
      let timestamp = 1000;

      // Initial conversation: msg1 -> resp1 -> msg2 -> resp2
      const msg1 = createMessage(SESSION_ID, 'msg-1', 'user', 'First', messages, timestamp++);
      messages.push(msg1);

      const resp1 = createMessage(
        SESSION_ID,
        'resp-1',
        'assistant',
        'Reply 1',
        messages,
        timestamp++
      );
      messages.push(resp1);

      const msg2 = createMessage(SESSION_ID, 'msg-2', 'user', 'Second', messages, timestamp++);
      messages.push(msg2);

      const resp2 = createMessage(
        SESSION_ID,
        'resp-2',
        'assistant',
        'Reply 2',
        messages,
        timestamp++
      );
      messages.push(resp2);

      // First rewind to resp1 -> create msg3 branch
      useCheckpointStore.getState().setRewindForkPoint(SESSION_ID, 'resp-1');
      const msg3 = createMessage(
        SESSION_ID,
        'msg-3',
        'user',
        'Third (branch 1)',
        messages,
        timestamp++
      );
      messages.push(msg3);

      const resp3 = createMessage(
        SESSION_ID,
        'resp-3',
        'assistant',
        'Reply 3',
        messages,
        timestamp++
      );
      messages.push(resp3);

      // Current chain: [msg1, resp1, msg3, resp3]
      expect(getActiveChain(messages).map((m) => m.id)).toEqual([
        'msg-1',
        'resp-1',
        'msg-3',
        'resp-3',
      ]);

      // Second rewind AGAIN to resp1 -> create msg4 branch
      useCheckpointStore.getState().setRewindForkPoint(SESSION_ID, 'resp-1');
      const msg4 = createMessage(
        SESSION_ID,
        'msg-4',
        'user',
        'Fourth (branch 2)',
        messages,
        timestamp++
      );
      messages.push(msg4);

      const resp4 = createMessage(
        SESSION_ID,
        'resp-4',
        'assistant',
        'Reply 4',
        messages,
        timestamp++
      );
      messages.push(resp4);

      // Three branches exist:
      // Branch 1 (oldest): msg1 -> resp1 -> msg2 -> resp2
      // Branch 2: msg1 -> resp1 -> msg3 -> resp3
      // Branch 3 (latest): msg1 -> resp1 -> msg4 -> resp4

      // Active chain should be the LATEST branch
      const activeChain = getActiveChain(messages);
      expect(activeChain.map((m) => m.id)).toEqual(['msg-1', 'resp-1', 'msg-4', 'resp-4']);

      // Verify all three branches share the same parent at the fork point
      expect(msg2.parentUuid).toBe('resp-1');
      expect(msg3.parentUuid).toBe('resp-1');
      expect(msg4.parentUuid).toBe('resp-1');
    });
  });

  describe('fork point consumption', () => {
    it('should consume fork point on first message only', () => {
      const messages: TestMessage[] = [];
      let timestamp = 1000;

      // Setup: msg1 -> resp1
      messages.push(createMessage(SESSION_ID, 'msg-1', 'user', 'First', messages, timestamp++));
      messages.push(
        createMessage(SESSION_ID, 'resp-1', 'assistant', 'Reply', messages, timestamp++)
      );

      // Set fork point
      useCheckpointStore.getState().setRewindForkPoint(SESSION_ID, 'resp-1');

      // First message consumes the fork point
      const msg2 = createMessage(SESSION_ID, 'msg-2', 'user', 'Branch', messages, timestamp++);
      messages.push(msg2);
      expect(msg2.parentUuid).toBe('resp-1'); // From fork point

      // Second message uses normal flow (last message)
      const resp2 = createMessage(
        SESSION_ID,
        'resp-2',
        'assistant',
        'Reply 2',
        messages,
        timestamp++
      );
      messages.push(resp2);
      expect(resp2.parentUuid).toBe('msg-2'); // Normal, not from fork point
    });

    it('should fall back to last message when no fork point exists', () => {
      const messages: TestMessage[] = [];
      let timestamp = 1000;

      messages.push(createMessage(SESSION_ID, 'msg-1', 'user', 'First', messages, timestamp++));
      messages.push(
        createMessage(SESSION_ID, 'resp-1', 'assistant', 'Reply', messages, timestamp++)
      );

      // No fork point set - should use last message
      const msg2 = createMessage(SESSION_ID, 'msg-2', 'user', 'Second', messages, timestamp++);
      messages.push(msg2);

      expect(msg2.parentUuid).toBe('resp-1');
    });

    it('should return null for first message in empty conversation', () => {
      const messages: TestMessage[] = [];

      const msg1 = createMessage(SESSION_ID, 'msg-1', 'user', 'First', messages, 1000);

      expect(msg1.parentUuid).toBeNull();
    });
  });

  describe('getActiveChain edge cases', () => {
    it('should handle deeply nested fork correctly', () => {
      const messages: TestMessage[] = [];
      let timestamp = 1000;

      // Build: msg1 -> resp1 -> msg2 -> resp2 -> msg3 -> resp3
      for (let i = 1; i <= 6; i++) {
        const role = i % 2 === 1 ? 'user' : 'assistant';
        const prefix = role === 'user' ? 'msg' : 'resp';
        const num = Math.ceil(i / 2);
        messages.push(
          createMessage(
            SESSION_ID,
            `${prefix}-${String(num)}`,
            role,
            `Content ${String(i)}`,
            messages,
            timestamp++
          )
        );
      }

      // Rewind to resp2 (middle of the chain)
      useCheckpointStore.getState().setRewindForkPoint(SESSION_ID, 'resp-2');

      // Create new branch: msg4 -> resp4
      messages.push(
        createMessage(SESSION_ID, 'msg-4', 'user', 'Branch msg', messages, timestamp++)
      );
      messages.push(
        createMessage(SESSION_ID, 'resp-4', 'assistant', 'Branch resp', messages, timestamp++)
      );

      // Active chain should be: msg1 -> resp1 -> msg2 -> resp2 -> msg4 -> resp4
      const chain = getActiveChain(messages);
      expect(chain.map((m) => m.id)).toEqual([
        'msg-1',
        'resp-1',
        'msg-2',
        'resp-2',
        'msg-4',
        'resp-4',
      ]);

      // Orphaned: msg3, resp3
      const chainIds = new Set(chain.map((m) => m.id));
      expect(chainIds.has('msg-3')).toBe(false);
      expect(chainIds.has('resp-3')).toBe(false);
    });

    it('should handle empty messages array', () => {
      const chain = getActiveChain([]);
      expect(chain).toEqual([]);
    });

    it('should handle single message', () => {
      const messages: TestMessage[] = [
        { id: 'only-msg', role: 'user', content: 'Only', parentUuid: null, createdAt: 1000 },
      ];
      const chain = getActiveChain(messages);
      expect(chain.map((m) => m.id)).toEqual(['only-msg']);
    });
  });

  describe('session isolation', () => {
    it('should not share fork points between sessions', () => {
      const session1 = 'session-1';
      const session2 = 'session-2';

      // Set fork point for session 1 only
      useCheckpointStore.getState().setRewindForkPoint(session1, 'fork-msg-1');

      // Session 2 should not have a fork point
      expect(useCheckpointStore.getState().hasRewindForkPoint(session1)).toBe(true);
      expect(useCheckpointStore.getState().hasRewindForkPoint(session2)).toBe(false);

      // Consuming session 1 fork point should not affect session 2
      const consumed = useCheckpointStore.getState().consumeRewindForkPoint(session1);
      expect(consumed).toBe('fork-msg-1');

      // Session 2 still has no fork point
      const session2Fork = useCheckpointStore.getState().consumeRewindForkPoint(session2);
      expect(session2Fork).toBeNull();
    });
  });
});
