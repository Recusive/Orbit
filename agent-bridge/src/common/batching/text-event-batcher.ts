/**
 * Text Event Batcher - Reduces event flooding from Claude Agent SDK
 *
 * The SDK emits ~200 text events per response (one per token/word).
 * This batcher accumulates them at 50ms intervals before forwarding to frontend.
 *
 * Result: ~200 events → ~4-8 batched events per response
 *
 * ⚠️  TESTED: This class is covered by integration tests.
 *     If you modify this, run: cd agent-bridge && bun test text-event-batcher
 *     Test file: src/__tests__/text-event-batcher.test.ts
 */

import { createLogger } from '../logging/logger.js';

const logger = createLogger('TextEventBatcher');

export interface BatchedTextEvent {
  sessionId: string;
  messageId: string;
  content: string;
}

export type TextEventEmitter = (event: BatchedTextEvent) => void;

/**
 * Key delimiter for Map entries.
 * Using null byte prevents key collisions when session/message IDs contain common chars.
 * e.g., session "a:b" + message "c" vs session "a" + message "b:c"
 * would both produce "a:b:c" with colon, but "a:b\0c" vs "a\0b:c" are distinct.
 */
const KEY_DELIMITER = '\0';

/**
 * Batches rapid text events from Claude SDK into fewer, larger chunks
 */
export class TextEventBatcher {
  private buffer = new Map<string, BatchedTextEvent>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly BATCH_INTERVAL: number;
  private emitFn: TextEventEmitter;

  /**
   * Tracks the total accumulated text length per session+message.
   * This includes both buffered (not yet emitted) and already emitted text.
   * Used to provide accurate content offsets for tool events.
   *
   * Key: sessionId + KEY_DELIMITER + messageId
   * Value: Total character count of all text added for this session+message
   */
  private accumulatedLengths = new Map<string, number>();

  /**
   * @param emitFn - Function to call when flushing batched events
   * @param batchIntervalMs - Interval between flushes (default: 50ms)
   */
  constructor(emitFn: TextEventEmitter, batchIntervalMs = 50) {
    this.emitFn = emitFn;
    this.BATCH_INTERVAL = batchIntervalMs;
  }

  /**
   * Add a text chunk to the batch
   * Will be flushed after BATCH_INTERVAL ms or when flush() is called
   */
  add(sessionId: string, messageId: string, content: string): void {
    // Skip empty content to avoid unnecessary IPC events and re-renders
    if (content === '') return;

    const key = `${sessionId}${KEY_DELIMITER}${messageId}`;
    const existing = this.buffer.get(key);

    if (existing) {
      // Accumulate content for same session+message
      // NOTE: Intentional direct mutation of Map entry for performance.
      // This is safe because the object is internal to this class and
      // only emitted (and then deleted) on flush. Avoids object recreation.
      existing.content += content;
    } else {
      // New entry
      this.buffer.set(key, { sessionId, messageId, content });
    }

    // Track total accumulated length (for contentOffset calculation)
    const currentLength = this.accumulatedLengths.get(key) ?? 0;
    this.accumulatedLengths.set(key, currentLength + content.length);

    // Schedule flush if not already scheduled (nullish coalescing assignment)
    this.timer ??= setTimeout(() => {
      this.flush();
    }, this.BATCH_INTERVAL);
  }

  /**
   * Get the total accumulated text length for a session+message.
   * This is used by tool events to record their position in the stream.
   *
   * @returns The total character count of all text added so far
   */
  getAccumulatedLength(sessionId: string, messageId: string): number {
    const key = `${sessionId}${KEY_DELIMITER}${messageId}`;
    return this.accumulatedLengths.get(key) ?? 0;
  }

  /**
   * Clear accumulated length tracking for a specific message (e.g., on turn complete).
   * Called when a turn ends to reset for the next message.
   */
  clearAccumulatedLength(sessionId: string, messageId: string): void {
    const key = `${sessionId}${KEY_DELIMITER}${messageId}`;
    this.accumulatedLengths.delete(key);
  }

  /**
   * Clear ALL accumulated length entries for a session (e.g., on session delete).
   * Prevents memory leaks when sessions are deleted without knowing all message IDs.
   */
  clearSessionAccumulatedLengths(sessionId: string): void {
    const prefix = `${sessionId}${KEY_DELIMITER}`;
    for (const key of this.accumulatedLengths.keys()) {
      if (key.startsWith(prefix)) {
        this.accumulatedLengths.delete(key);
      }
    }
  }

  /**
   * Immediately emit all buffered content
   * Called automatically after BATCH_INTERVAL or manually on turn complete
   */
  flush(): void {
    // Clear timer first to prevent race conditions
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Snapshot events and clear buffer BEFORE emitting
    // This prevents data loss if emitFn throws - buffer is already clear,
    // and we continue emitting remaining events
    const events = Array.from(this.buffer.values());
    this.buffer.clear();

    // Emit all buffered events with error handling
    for (const event of events) {
      try {
        this.emitFn(event);
      } catch (error) {
        // Log but continue with other events to prevent data loss
        logger.error({ sessionId: event.sessionId, error }, 'Failed to emit batched text event');
      }
    }
  }

  /**
   * Flush for a specific session (e.g., on turn complete or session delete)
   */
  flushSession(sessionId: string): void {
    // Collect keys to delete BEFORE iterating to avoid mutation during iteration
    const keysToFlush: string[] = [];
    const eventsToEmit: BatchedTextEvent[] = [];

    for (const [key, event] of this.buffer.entries()) {
      if (event.sessionId === sessionId) {
        keysToFlush.push(key);
        eventsToEmit.push(event);
      }
    }

    // Delete collected keys
    for (const key of keysToFlush) {
      this.buffer.delete(key);
    }

    // Emit collected events with error handling
    for (const event of eventsToEmit) {
      try {
        this.emitFn(event);
      } catch (error) {
        logger.error({ sessionId: event.sessionId, error }, 'Failed to emit batched text event');
      }
    }

    // If buffer is now empty, clear the timer
    if (this.buffer.size === 0 && this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Gradually drain buffered content for a session with smooth streaming.
   * Instead of dumping all content at once (flushSession), this emits content
   * in smaller chunks over time to create a smooth streaming effect.
   *
   * Used on turn complete to avoid the "2-3 words then dump rest" pattern
   * that occurs when the model generates tokens faster than batch intervals.
   *
   * @param sessionId - Session to drain
   * @param chunkSize - Characters per chunk (default: 80, roughly 12-15 words)
   * @param intervalMs - Delay between chunks (default: 16ms = 1 frame @ 60fps)
   * @returns Promise that resolves when all buffered content is drained
   */
  async drainSession(sessionId: string, chunkSize = 80, intervalMs = 16): Promise<void> {
    // Collect all entries for this session
    const keysToProcess: string[] = [];
    const entriesToProcess: { key: string; event: BatchedTextEvent }[] = [];

    for (const [key, event] of this.buffer.entries()) {
      if (event.sessionId === sessionId) {
        keysToProcess.push(key);
        // Clone the event content since we'll be modifying it
        entriesToProcess.push({ key, event: { ...event } });
      }
    }

    // Remove entries from buffer immediately to prevent double-processing
    for (const key of keysToProcess) {
      this.buffer.delete(key);
    }

    // If buffer is now empty, clear the timer
    if (this.buffer.size === 0 && this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Nothing to drain
    if (entriesToProcess.length === 0) {
      return;
    }

    // Helper to emit a chunk
    const emitChunk = (event: BatchedTextEvent, content: string): void => {
      try {
        this.emitFn({ ...event, content });
      } catch (error) {
        logger.error({ sessionId: event.sessionId, error }, 'Failed to emit drained text chunk');
      }
    };

    // Helper to delay between chunks
    const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

    // Process each entry's content in chunks
    for (const { event } of entriesToProcess) {
      let remaining = event.content;

      while (remaining.length > 0) {
        // Take up to chunkSize characters, but try to break at word boundary
        let chunk: string;
        if (remaining.length <= chunkSize) {
          // Last chunk - take everything
          chunk = remaining;
          remaining = '';
        } else {
          // Find a good break point (space, newline) near chunkSize
          let breakPoint = chunkSize;
          // Look back up to 20 chars for a word boundary
          for (let i = chunkSize; i > chunkSize - 20 && i > 0; i--) {
            const char = remaining[i];
            if (char === ' ' || char === '\n' || char === '\t') {
              breakPoint = i + 1; // Include the space in this chunk
              break;
            }
          }
          chunk = remaining.slice(0, breakPoint);
          remaining = remaining.slice(breakPoint);
        }

        // Emit this chunk
        emitChunk(event, chunk);

        // Wait before next chunk (if there's more)
        if (remaining.length > 0) {
          await delay(intervalMs);
        }
      }
    }
  }

  /**
   * Clean up - flush remaining content and clear timer
   */
  destroy(): void {
    this.flush();
  }
}
