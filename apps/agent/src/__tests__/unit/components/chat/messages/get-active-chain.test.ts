/**
 * Tests for getActiveChain function
 *
 * Claude Code-style conversation branching uses parentUuid to form a linked list.
 * When there are forks (rewinds), multiple messages can have the same parent.
 * getActiveChain extracts only the active branch by walking from the latest message backwards.
 */

import { getActiveChain } from '@/components/chat/messages/message-utils';

// Test message type with required fields for chain extraction
interface TestMessage {
  id: string;
  parentUuid?: string | null | undefined;
  createdAt?: number | undefined;
  content?: string; // Optional, just to make test data more readable
}

describe('getActiveChain', () => {
  describe('empty conversations', () => {
    it('should return empty array for empty input', () => {
      const result = getActiveChain([]);
      expect(result).toEqual([]);
    });
  });

  describe('single message', () => {
    it('should return single message as-is', () => {
      const messages: TestMessage[] = [{ id: 'msg1', parentUuid: null, createdAt: 1000 }];
      const result = getActiveChain(messages);
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('msg1');
    });

    it('should handle single message without parentUuid (legacy)', () => {
      const messages: TestMessage[] = [{ id: 'msg1', createdAt: 1000 }];
      const result = getActiveChain(messages);
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('msg1');
    });
  });

  describe('legacy conversations (no parentUuid)', () => {
    it('should return all messages sorted by createdAt for legacy conversations', () => {
      const messages: TestMessage[] = [
        { id: 'msg3', createdAt: 3000 },
        { id: 'msg1', createdAt: 1000 },
        { id: 'msg2', createdAt: 2000 },
      ];
      const result = getActiveChain(messages);
      expect(result.map((m) => m.id)).toEqual(['msg1', 'msg2', 'msg3']);
    });

    it('should handle messages with undefined createdAt in legacy mode', () => {
      const messages: TestMessage[] = [{ id: 'msg1' }, { id: 'msg2' }, { id: 'msg3' }];
      const result = getActiveChain(messages);
      // With no createdAt, all default to 0, order is stable based on reduce initial
      expect(result).toHaveLength(3);
    });
  });

  describe('linear conversations (no forks)', () => {
    it('should return all messages in order for linear conversation', () => {
      const messages: TestMessage[] = [
        { id: 'msg1', parentUuid: null, createdAt: 1000 },
        { id: 'msg2', parentUuid: 'msg1', createdAt: 2000 },
        { id: 'msg3', parentUuid: 'msg2', createdAt: 3000 },
        { id: 'msg4', parentUuid: 'msg3', createdAt: 4000 },
      ];
      const result = getActiveChain(messages);
      expect(result.map((m) => m.id)).toEqual(['msg1', 'msg2', 'msg3', 'msg4']);
    });

    it('should handle messages in random order', () => {
      const messages: TestMessage[] = [
        { id: 'msg3', parentUuid: 'msg2', createdAt: 3000 },
        { id: 'msg1', parentUuid: null, createdAt: 1000 },
        { id: 'msg4', parentUuid: 'msg3', createdAt: 4000 },
        { id: 'msg2', parentUuid: 'msg1', createdAt: 2000 },
      ];
      const result = getActiveChain(messages);
      expect(result.map((m) => m.id)).toEqual(['msg1', 'msg2', 'msg3', 'msg4']);
    });
  });

  describe('forked conversations (with rewinds)', () => {
    /**
     * Test scenario:
     * msg1 (user) -> msg2 (assistant) -> msg3 (user) -> msg4 (assistant)  [OLD BRANCH]
     *                                 -> msg5 (user, after rewind to msg2) -> msg6 (assistant)  [ACTIVE]
     *
     * Timeline: msg1 -> msg2 -> msg3 -> msg4 -> [REWIND] -> msg5 -> msg6
     *
     * Active chain should be: [msg1, msg2, msg5, msg6]
     * Orphaned messages: [msg3, msg4]
     */
    it('should follow active branch after rewind', () => {
      const messages: TestMessage[] = [
        { id: 'msg1', parentUuid: null, createdAt: 1000, content: 'user1' },
        { id: 'msg2', parentUuid: 'msg1', createdAt: 2000, content: 'assistant1' },
        { id: 'msg3', parentUuid: 'msg2', createdAt: 3000, content: 'user2-old' },
        { id: 'msg4', parentUuid: 'msg3', createdAt: 4000, content: 'assistant2-old' },
        { id: 'msg5', parentUuid: 'msg2', createdAt: 5000, content: 'user2-new' }, // Fork point!
        { id: 'msg6', parentUuid: 'msg5', createdAt: 6000, content: 'assistant2-new' },
      ];

      const result = getActiveChain(messages);
      expect(result.map((m) => m.id)).toEqual(['msg1', 'msg2', 'msg5', 'msg6']);
    });

    /**
     * Multiple forks at same point:
     * msg1 -> msg2 -> msg3  [branch A]
     *              -> msg4  [branch B]
     *              -> msg5  [branch C - active, latest]
     */
    it('should select latest branch when multiple forks exist', () => {
      const messages: TestMessage[] = [
        { id: 'msg1', parentUuid: null, createdAt: 1000 },
        { id: 'msg2', parentUuid: 'msg1', createdAt: 2000 },
        { id: 'msg3', parentUuid: 'msg2', createdAt: 3000 },
        { id: 'msg4', parentUuid: 'msg2', createdAt: 4000 },
        { id: 'msg5', parentUuid: 'msg2', createdAt: 5000 }, // Latest fork
      ];

      const result = getActiveChain(messages);
      expect(result.map((m) => m.id)).toEqual(['msg1', 'msg2', 'msg5']);
    });

    /**
     * Nested forks:
     * msg1 -> msg2 -> msg3 -> msg4 [old branch]
     *              -> msg5 -> msg6 -> msg7 [intermediate]
     *                             -> msg8 [active - latest]
     */
    it('should handle nested forks correctly', () => {
      const messages: TestMessage[] = [
        { id: 'msg1', parentUuid: null, createdAt: 1000 },
        { id: 'msg2', parentUuid: 'msg1', createdAt: 2000 },
        { id: 'msg3', parentUuid: 'msg2', createdAt: 3000 }, // Old branch
        { id: 'msg4', parentUuid: 'msg3', createdAt: 4000 }, // Old branch
        { id: 'msg5', parentUuid: 'msg2', createdAt: 5000 }, // First fork
        { id: 'msg6', parentUuid: 'msg5', createdAt: 6000 },
        { id: 'msg7', parentUuid: 'msg6', createdAt: 7000 }, // Intermediate branch
        { id: 'msg8', parentUuid: 'msg6', createdAt: 8000 }, // Second fork (latest)
      ];

      const result = getActiveChain(messages);
      expect(result.map((m) => m.id)).toEqual(['msg1', 'msg2', 'msg5', 'msg6', 'msg8']);
    });
  });

  describe('edge cases', () => {
    it('should handle broken chain (missing parent)', () => {
      const messages: TestMessage[] = [
        { id: 'msg1', parentUuid: null, createdAt: 1000 },
        { id: 'msg3', parentUuid: 'msg2-missing', createdAt: 3000 }, // Parent doesn't exist
      ];

      const result = getActiveChain(messages);
      // Should stop at msg3 since parent is missing
      expect(result.map((m) => m.id)).toEqual(['msg3']);
    });

    it('should handle cycle in chain (corrupt data)', () => {
      const messages: TestMessage[] = [
        { id: 'msg1', parentUuid: 'msg2', createdAt: 1000 }, // Cycle!
        { id: 'msg2', parentUuid: 'msg1', createdAt: 2000 }, // Cycle!
      ];

      const result = getActiveChain(messages);
      // Should detect cycle and stop
      expect(result.length).toBeLessThanOrEqual(2);
    });

    it('should preserve message properties', () => {
      interface ExtendedMessage extends TestMessage {
        role: string;
        extraField: number;
      }

      const messages: ExtendedMessage[] = [
        { id: 'msg1', parentUuid: null, createdAt: 1000, role: 'user', extraField: 42 },
        { id: 'msg2', parentUuid: 'msg1', createdAt: 2000, role: 'assistant', extraField: 100 },
      ];

      const result = getActiveChain(messages);
      expect(result[0]?.role).toBe('user');
      expect(result[0]?.extraField).toBe(42);
      expect(result[1]?.role).toBe('assistant');
      expect(result[1]?.extraField).toBe(100);
    });
  });

  describe('mixed parentUuid states', () => {
    it('should treat conversation as having chains if ANY message has parentUuid', () => {
      const messages: TestMessage[] = [
        { id: 'msg1', parentUuid: null, createdAt: 1000 },
        { id: 'msg2', createdAt: 2000 }, // No parentUuid (undefined)
        { id: 'msg3', parentUuid: 'msg1', createdAt: 3000 },
      ];

      const result = getActiveChain(messages);
      // msg3 is latest and has parentUuid='msg1', so chain is [msg1, msg3]
      expect(result.map((m) => m.id)).toEqual(['msg1', 'msg3']);
    });
  });
});
