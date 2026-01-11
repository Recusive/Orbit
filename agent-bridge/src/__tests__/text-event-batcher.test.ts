/**
 * TextEventBatcher Integration Tests
 *
 * Tests the event batching system that reduces SDK event flooding.
 * These are real integration tests - no mocks, testing actual batching behavior.
 *
 * Run: cd agent-bridge && bun test text-event-batcher
 */
import { describe, it, expect, beforeEach, afterEach, jest } from 'bun:test';

import { TextEventBatcher } from '../common/batching/text-event-batcher.js';

import type { BatchedTextEvent } from '../common/batching/text-event-batcher.js';

describe('TextEventBatcher', () => {
  let emittedEvents: BatchedTextEvent[];
  let emitFn: (event: BatchedTextEvent) => void;

  beforeEach(() => {
    emittedEvents = [];
    emitFn = (event) => {
      emittedEvents.push(event);
    };
  });

  afterEach(() => {
    // Reset any timers
    jest.useRealTimers();
  });

  describe('basic batching', () => {
    it('should batch multiple chunks into single event on flush', () => {
      const batcher = new TextEventBatcher(emitFn, 100);

      // Simulate rapid SDK events
      batcher.add('session-1', 'msg-1', 'Hello');
      batcher.add('session-1', 'msg-1', ' ');
      batcher.add('session-1', 'msg-1', 'World');

      // Nothing emitted yet (still waiting for timer)
      expect(emittedEvents).toHaveLength(0);

      // Force flush
      batcher.flush();

      // Should have single batched event
      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]).toEqual({
        sessionId: 'session-1',
        messageId: 'msg-1',
        content: 'Hello World',
      });
    });

    it('should skip empty content to avoid unnecessary IPC events', () => {
      const batcher = new TextEventBatcher(emitFn, 100);

      batcher.add('session-1', 'msg-1', '');
      batcher.flush();

      // Empty content should NOT emit - reduces unnecessary IPC events and re-renders
      expect(emittedEvents).toHaveLength(0);
    });

    it('should skip empty content but keep non-empty in same batch', () => {
      const batcher = new TextEventBatcher(emitFn, 100);

      batcher.add('session-1', 'msg-1', ''); // Empty - skipped
      batcher.add('session-1', 'msg-1', 'Hello'); // Non-empty - kept
      batcher.add('session-1', 'msg-1', ''); // Empty - skipped
      batcher.add('session-1', 'msg-1', ' World'); // Non-empty - kept
      batcher.flush();

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]?.content).toBe('Hello World');
    });

    it('should accumulate content in order', () => {
      const batcher = new TextEventBatcher(emitFn, 100);

      // Simulate token-by-token streaming
      const tokens = ['The', ' quick', ' brown', ' fox'];
      for (const token of tokens) {
        batcher.add('session-1', 'msg-1', token);
      }

      batcher.flush();

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]?.content).toBe('The quick brown fox');
    });
  });

  describe('multi-session handling', () => {
    it('should keep different sessions separate', () => {
      const batcher = new TextEventBatcher(emitFn, 100);

      batcher.add('session-1', 'msg-1', 'First session');
      batcher.add('session-2', 'msg-2', 'Second session');

      batcher.flush();

      expect(emittedEvents).toHaveLength(2);
      expect(emittedEvents.find((e) => e.sessionId === 'session-1')?.content).toBe('First session');
      expect(emittedEvents.find((e) => e.sessionId === 'session-2')?.content).toBe(
        'Second session'
      );
    });

    it('should keep different messages in same session separate', () => {
      const batcher = new TextEventBatcher(emitFn, 100);

      batcher.add('session-1', 'msg-1', 'Message 1');
      batcher.add('session-1', 'msg-2', 'Message 2');

      batcher.flush();

      expect(emittedEvents).toHaveLength(2);
      expect(emittedEvents.find((e) => e.messageId === 'msg-1')?.content).toBe('Message 1');
      expect(emittedEvents.find((e) => e.messageId === 'msg-2')?.content).toBe('Message 2');
    });

    it('should allow flushing single session without affecting others', () => {
      const batcher = new TextEventBatcher(emitFn, 100);

      batcher.add('session-1', 'msg-1', 'Content 1');
      batcher.add('session-2', 'msg-2', 'Content 2');

      // Only flush session-1
      batcher.flushSession('session-1');

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]?.sessionId).toBe('session-1');

      // session-2 should still be buffered
      batcher.flush();
      expect(emittedEvents).toHaveLength(2);
      expect(emittedEvents[1]?.sessionId).toBe('session-2');
    });
  });

  describe('timer behavior', () => {
    it('should auto-flush after batch interval', () => {
      jest.useFakeTimers();

      const batcher = new TextEventBatcher(emitFn, 50);

      batcher.add('session-1', 'msg-1', 'Test');

      // Not yet emitted
      expect(emittedEvents).toHaveLength(0);

      // Advance timer past batch interval
      jest.advanceTimersByTime(60);

      // Should have auto-flushed
      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]?.content).toBe('Test');
    });

    it('should batch all events within the interval', () => {
      jest.useFakeTimers();

      const batcher = new TextEventBatcher(emitFn, 50);

      // First event starts the timer
      batcher.add('session-1', 'msg-1', 'First');

      // More events arrive within the interval
      jest.advanceTimersByTime(20);
      batcher.add('session-1', 'msg-1', ' Second');

      jest.advanceTimersByTime(20);
      batcher.add('session-1', 'msg-1', ' Third');

      // Still within 50ms, nothing emitted
      expect(emittedEvents).toHaveLength(0);

      // Advance past the batch interval
      jest.advanceTimersByTime(20);

      // All should be batched together
      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]?.content).toBe('First Second Third');
    });

    it('should not schedule multiple timers for consecutive adds', () => {
      jest.useFakeTimers();

      const batcher = new TextEventBatcher(emitFn, 50);

      // Rapid additions - should only create one timer
      for (let i = 0; i < 10; i++) {
        batcher.add('session-1', 'msg-1', `${String(i)} `);
      }

      // Nothing emitted yet
      expect(emittedEvents).toHaveLength(0);

      // Advance past single batch interval
      jest.advanceTimersByTime(60);

      // All should be in one batch
      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]?.content).toBe('0 1 2 3 4 5 6 7 8 9 ');
    });
  });

  describe('lifecycle', () => {
    it('should clear buffer on flush', () => {
      const batcher = new TextEventBatcher(emitFn, 100);

      batcher.add('session-1', 'msg-1', 'Test');
      batcher.flush();

      // Flush again should emit nothing
      batcher.flush();
      expect(emittedEvents).toHaveLength(1);
    });

    it('should flush remaining content on destroy', () => {
      const batcher = new TextEventBatcher(emitFn, 100);

      batcher.add('session-1', 'msg-1', 'Pending');

      // Destroy should flush
      batcher.destroy();

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]?.content).toBe('Pending');
    });

    it('should clear timer on manual flush', () => {
      jest.useFakeTimers();

      const batcher = new TextEventBatcher(emitFn, 50);

      batcher.add('session-1', 'msg-1', 'Test');

      // Manual flush before timer fires
      batcher.flush();
      expect(emittedEvents).toHaveLength(1);

      // Advancing timer should not cause another emit
      jest.advanceTimersByTime(60);
      expect(emittedEvents).toHaveLength(1);
    });

    it('should handle flushSession when buffer becomes empty', () => {
      jest.useFakeTimers();

      const batcher = new TextEventBatcher(emitFn, 50);

      batcher.add('session-1', 'msg-1', 'Only session');

      // Flush the only session
      batcher.flushSession('session-1');

      // Timer should be cleared since buffer is empty
      jest.advanceTimersByTime(60);

      // Should have only one emit from flushSession
      expect(emittedEvents).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('should handle Unicode content correctly', () => {
      const batcher = new TextEventBatcher(emitFn, 100);

      // Test with various Unicode characters (non-ASCII)
      batcher.add('session-1', 'msg-1', 'Hello ');
      batcher.add('session-1', 'msg-1', '\u4e2d\u6587'); // Chinese characters
      batcher.add('session-1', 'msg-1', ' World');

      batcher.flush();

      expect(emittedEvents[0]?.content).toBe('Hello \u4e2d\u6587 World');
    });

    it('should handle very long content', () => {
      const batcher = new TextEventBatcher(emitFn, 100);

      const longString = 'x'.repeat(10000);
      batcher.add('session-1', 'msg-1', longString);

      batcher.flush();

      expect(emittedEvents[0]?.content).toBe(longString);
    });

    it('should handle special characters in session/message IDs', () => {
      const batcher = new TextEventBatcher(emitFn, 100);

      // Session ID with colon (potential key collision issue)
      batcher.add('session:with:colons', 'msg-1', 'Content');
      batcher.flush();

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]?.sessionId).toBe('session:with:colons');
    });

    it('should NOT collide when session/message IDs contain colons', () => {
      // CRITICAL: This tests that we don't have key collisions
      // With colon delimiter: "a:b" + "c" = "a:b:c" and "a" + "b:c" = "a:b:c" (COLLISION!)
      // With null byte: "a:b\0c" and "a\0b:c" are distinct (CORRECT)
      const batcher = new TextEventBatcher(emitFn, 100);

      // These would collide with a simple colon delimiter
      batcher.add('a:b', 'c', 'First content');
      batcher.add('a', 'b:c', 'Second content');
      batcher.flush();

      // Should have TWO separate events (not merged due to collision)
      expect(emittedEvents).toHaveLength(2);

      const first = emittedEvents.find((e) => e.sessionId === 'a:b');
      const second = emittedEvents.find((e) => e.sessionId === 'a');

      expect(first?.content).toBe('First content');
      expect(first?.messageId).toBe('c');

      expect(second?.content).toBe('Second content');
      expect(second?.messageId).toBe('b:c');
    });

    it('should handle flushing non-existent session gracefully', () => {
      const batcher = new TextEventBatcher(emitFn, 100);

      batcher.add('session-1', 'msg-1', 'Test');

      // Flush session that doesn't exist
      batcher.flushSession('non-existent');

      // Original session should still be buffered
      batcher.flush();
      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]?.sessionId).toBe('session-1');
    });
  });

  describe('performance characteristics', () => {
    it('should reduce ~200 events to ~4 with 50ms batching', () => {
      // This test simulates realistic SDK behavior
      jest.useFakeTimers();

      const batcher = new TextEventBatcher(emitFn, 50);

      // Simulate 200 events over ~1 second (typical response)
      // Events come in bursts every ~5ms
      for (let i = 0; i < 200; i++) {
        batcher.add('session-1', 'msg-1', `token${String(i)} `);
        jest.advanceTimersByTime(5);
      }

      // Wait for final flush
      jest.advanceTimersByTime(60);

      // Should have batched into ~20 events (1000ms / 50ms = 20 batches)
      // Exact number depends on timing, but should be much less than 200
      expect(emittedEvents.length).toBeLessThan(30);
      expect(emittedEvents.length).toBeGreaterThan(0);

      // All content should be preserved
      const totalContent = emittedEvents.map((e) => e.content).join('');
      const expectedContent = Array.from({ length: 200 }, (_, i) => `token${String(i)} `).join('');
      expect(totalContent).toBe(expectedContent);
    });
  });

  describe('drainSession (gradual flush)', () => {
    it('should drain content in chunks over time', async () => {
      const batcher = new TextEventBatcher(emitFn, 100);

      // Add a moderate amount of content (200 chars = 2-3 chunks at 80 chars each)
      const content = 'Hello world this is a test message that spans multiple chunks. '.repeat(3);
      batcher.add('session-1', 'msg-1', content);

      // Drain with default chunk size (80 chars) and interval (16ms)
      await batcher.drainSession('session-1');

      // Should have emitted multiple chunks
      expect(emittedEvents.length).toBeGreaterThan(1);

      // All content should be preserved
      const totalContent = emittedEvents.map((e) => e.content).join('');
      expect(totalContent).toBe(content);
    });

    it('should respect word boundaries when chunking', async () => {
      const batcher = new TextEventBatcher(emitFn, 100);

      // Add content with clear word boundaries
      const content =
        'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12 word13 word14 word15';
      batcher.add('session-1', 'msg-1', content);

      await batcher.drainSession('session-1', 30); // Small chunk size to force multiple chunks

      // All chunks except possibly the last should end with a space (word boundary)
      for (let i = 0; i < emittedEvents.length - 1; i++) {
        const chunk = emittedEvents[i]?.content ?? '';
        expect(chunk.endsWith(' ')).toBe(true);
      }

      // All content should be preserved
      const totalContent = emittedEvents.map((e) => e.content).join('');
      expect(totalContent).toBe(content);
    });

    it('should handle empty buffer gracefully', async () => {
      const batcher = new TextEventBatcher(emitFn, 100);

      // Drain empty session - should not throw
      await batcher.drainSession('non-existent');

      expect(emittedEvents).toHaveLength(0);
    });

    it('should not affect other sessions', async () => {
      const batcher = new TextEventBatcher(emitFn, 100);

      batcher.add('session-1', 'msg-1', 'Session 1 content');
      batcher.add('session-2', 'msg-2', 'Session 2 content');

      // Only drain session-1
      await batcher.drainSession('session-1');

      // Only session-1 events emitted
      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]?.sessionId).toBe('session-1');

      // Session-2 should still be in buffer, flush to get it
      batcher.flush();
      expect(emittedEvents).toHaveLength(2);
      expect(emittedEvents[1]?.sessionId).toBe('session-2');
    });

    it('should emit short content in a single chunk', async () => {
      const batcher = new TextEventBatcher(emitFn, 100);

      // Content shorter than chunk size
      const content = 'Short message';
      batcher.add('session-1', 'msg-1', content);

      await batcher.drainSession('session-1');

      // Should emit in one chunk
      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]?.content).toBe(content);
    });

    it('should clear timer when buffer becomes empty', async () => {
      jest.useFakeTimers();

      const batcher = new TextEventBatcher(emitFn, 50);

      batcher.add('session-1', 'msg-1', 'Test content');

      // Use real timers for async drain (fake timers don't work well with async delays)
      jest.useRealTimers();

      await batcher.drainSession('session-1');

      // Timer should be cleared, so no duplicate emit when advancing time
      jest.useFakeTimers();
      jest.advanceTimersByTime(100);

      // Should only have the drain events, no timer-based flush
      expect(emittedEvents.filter((e) => e.content === 'Test content')).toHaveLength(1);

      jest.useRealTimers();
    });
  });
});
