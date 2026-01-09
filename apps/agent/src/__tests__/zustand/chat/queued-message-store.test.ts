/**
 * Tests for queued-message-store.ts
 *
 * Purpose: Temporary buffer for pending chat messages before sending to agent.
 * Allows queuing a message that will be sent when conditions are met.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QueuedMessage } from '@/stores/chat/queued-message-store';

import { useQueuedMessageStore } from '@/stores/chat/queued-message-store';

// Mock crypto.randomUUID using globalThis assignment (vi.stubGlobal not available in bun test)
const mockUUID = 'test-uuid-1234';
const mockRandomUUID = vi.fn(() => mockUUID);

// Create a proxy that preserves all crypto methods but overrides randomUUID
const cryptoProxy = new Proxy(globalThis.crypto, {
  get(target, prop) {
    if (prop === 'randomUUID') {
      return mockRandomUUID;
    }
    return Reflect.get(target, prop) as unknown;
  },
});

Object.defineProperty(globalThis, 'crypto', {
  value: cryptoProxy,
  writable: true,
});

describe('queued-message-store', () => {
  // Reset store state before each test
  beforeEach(() => {
    useQueuedMessageStore.setState({ queuedMessage: null });
    vi.clearAllMocks();
  });

  // ============================================================================
  // Initial State
  // ============================================================================

  describe('initial state', () => {
    it('should start with null queuedMessage', () => {
      const state = useQueuedMessageStore.getState();
      expect(state.queuedMessage).toBeNull();
    });
  });

  // ============================================================================
  // queueMessage
  // ============================================================================

  describe('queueMessage', () => {
    it('should create a queued message with generated id and timestamp', () => {
      const { queueMessage } = useQueuedMessageStore.getState();

      const beforeTime = Date.now();
      queueMessage({
        text: 'Hello, Claude!',
        sessionId: 'session-123',
      });
      const afterTime = Date.now();

      const { queuedMessage } = useQueuedMessageStore.getState();

      expect(queuedMessage).not.toBeNull();
      expect(queuedMessage?.id).toBe(mockUUID);
      expect(queuedMessage?.text).toBe('Hello, Claude!');
      expect(queuedMessage?.sessionId).toBe('session-123');
      expect(queuedMessage?.queuedAt).toBeGreaterThanOrEqual(beforeTime);
      expect(queuedMessage?.queuedAt).toBeLessThanOrEqual(afterTime);
    });

    it('should include optional contextFiles when provided', () => {
      const { queueMessage } = useQueuedMessageStore.getState();

      queueMessage({
        text: 'Review this file',
        sessionId: 'session-123',
        contextFiles: ['/path/to/file.ts', '/path/to/other.ts'],
      });

      const { queuedMessage } = useQueuedMessageStore.getState();
      expect(queuedMessage?.contextFiles).toEqual(['/path/to/file.ts', '/path/to/other.ts']);
    });

    it('should include optional images when provided', () => {
      const { queueMessage } = useQueuedMessageStore.getState();

      const mockImages = [
        {
          name: 'screenshot.png',
          mimeType: 'image/png',
          data: 'base64-encoded-data',
          previewUrl: 'data:image/png;base64,...',
        },
      ];

      queueMessage({
        text: 'Check this screenshot',
        sessionId: 'session-123',
        images: mockImages,
      });

      const { queuedMessage } = useQueuedMessageStore.getState();
      expect(queuedMessage?.images).toEqual(mockImages);
    });

    it('should include optional elements when provided', () => {
      const { queueMessage } = useQueuedMessageStore.getState();

      const mockElements = [
        {
          componentName: 'Button',
          filePath: '/src/components/Button.tsx',
          lineNumber: 42,
          props: { variant: 'primary' },
          componentStack: ['App', 'Layout', 'Button'],
          tagName: 'button',
          selector: '#button-1',
          outerHTML: '<button>Click me</button>',
          displayName: 'Button',
        },
      ];

      queueMessage({
        text: 'Fix this button',
        sessionId: 'session-123',
        elements: mockElements,
      });

      const { queuedMessage } = useQueuedMessageStore.getState();
      expect(queuedMessage?.elements).toEqual(mockElements);
    });

    it('should overwrite existing queued message', () => {
      const { queueMessage } = useQueuedMessageStore.getState();

      // Queue first message
      queueMessage({
        text: 'First message',
        sessionId: 'session-1',
      });

      // Queue second message (should replace)
      queueMessage({
        text: 'Second message',
        sessionId: 'session-2',
      });

      const { queuedMessage } = useQueuedMessageStore.getState();
      expect(queuedMessage?.text).toBe('Second message');
      expect(queuedMessage?.sessionId).toBe('session-2');
    });
  });

  // ============================================================================
  // clearQueue
  // ============================================================================

  describe('clearQueue', () => {
    it('should clear the queued message', () => {
      const { queueMessage, clearQueue } = useQueuedMessageStore.getState();

      // Setup
      queueMessage({
        text: 'Test message',
        sessionId: 'session-123',
      });
      expect(useQueuedMessageStore.getState().queuedMessage).not.toBeNull();

      // Act
      clearQueue();

      // Assert
      expect(useQueuedMessageStore.getState().queuedMessage).toBeNull();
    });

    it('should be idempotent (safe to call when already null)', () => {
      const { clearQueue } = useQueuedMessageStore.getState();

      // Should not throw
      expect(() => {
        clearQueue();
      }).not.toThrow();
      expect(useQueuedMessageStore.getState().queuedMessage).toBeNull();
    });
  });

  // ============================================================================
  // clearQueueForSession
  // ============================================================================

  describe('clearQueueForSession', () => {
    it('should clear queue if sessionId matches', () => {
      const { queueMessage, clearQueueForSession } = useQueuedMessageStore.getState();

      queueMessage({
        text: 'Test message',
        sessionId: 'session-123',
      });

      clearQueueForSession('session-123');

      expect(useQueuedMessageStore.getState().queuedMessage).toBeNull();
    });

    it('should NOT clear queue if sessionId does not match', () => {
      const { queueMessage, clearQueueForSession } = useQueuedMessageStore.getState();

      queueMessage({
        text: 'Test message',
        sessionId: 'session-123',
      });

      clearQueueForSession('different-session');

      expect(useQueuedMessageStore.getState().queuedMessage).not.toBeNull();
      expect(useQueuedMessageStore.getState().queuedMessage?.sessionId).toBe('session-123');
    });

    it('should be safe to call when queue is empty', () => {
      const { clearQueueForSession } = useQueuedMessageStore.getState();

      expect(() => {
        clearQueueForSession('any-session');
      }).not.toThrow();
    });
  });

  // ============================================================================
  // getQueuedMessage
  // ============================================================================

  describe('getQueuedMessage', () => {
    it('should return null when queue is empty', () => {
      const { getQueuedMessage } = useQueuedMessageStore.getState();
      expect(getQueuedMessage()).toBeNull();
    });

    it('should return the queued message when present', () => {
      const { queueMessage, getQueuedMessage } = useQueuedMessageStore.getState();

      queueMessage({
        text: 'Test message',
        sessionId: 'session-123',
      });

      const result = getQueuedMessage();
      expect(result).not.toBeNull();
      expect(result?.text).toBe('Test message');
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should handle empty text', () => {
      const { queueMessage } = useQueuedMessageStore.getState();

      queueMessage({
        text: '',
        sessionId: 'session-123',
      });

      expect(useQueuedMessageStore.getState().queuedMessage?.text).toBe('');
    });

    it('should handle empty sessionId', () => {
      const { queueMessage } = useQueuedMessageStore.getState();

      queueMessage({
        text: 'Test',
        sessionId: '',
      });

      expect(useQueuedMessageStore.getState().queuedMessage?.sessionId).toBe('');
    });

    it('should handle very long text', () => {
      const { queueMessage } = useQueuedMessageStore.getState();

      const longText = 'a'.repeat(100000);
      queueMessage({
        text: longText,
        sessionId: 'session-123',
      });

      expect(useQueuedMessageStore.getState().queuedMessage?.text).toBe(longText);
    });

    it('should handle empty arrays for optional fields', () => {
      const { queueMessage } = useQueuedMessageStore.getState();

      queueMessage({
        text: 'Test',
        sessionId: 'session-123',
        contextFiles: [],
        images: [],
        elements: [],
      });

      const { queuedMessage } = useQueuedMessageStore.getState();
      expect(queuedMessage?.contextFiles).toEqual([]);
      expect(queuedMessage?.images).toEqual([]);
      expect(queuedMessage?.elements).toEqual([]);
    });
  });

  // ============================================================================
  // Selector Hook (useQueuedMessage)
  // ============================================================================

  describe('useQueuedMessage selector', () => {
    it('should select queuedMessage from state', () => {
      // Note: Testing selector logic directly without React rendering
      const selector = (state: { queuedMessage: QueuedMessage | null }): QueuedMessage | null =>
        state.queuedMessage;

      // Empty state
      expect(selector({ queuedMessage: null })).toBeNull();

      // With message
      const mockMessage: QueuedMessage = {
        id: 'test-id',
        text: 'Test',
        sessionId: 'session-123',
        queuedAt: Date.now(),
      };
      expect(selector({ queuedMessage: mockMessage })).toEqual(mockMessage);
    });
  });
});
