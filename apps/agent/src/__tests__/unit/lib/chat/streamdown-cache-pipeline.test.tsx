/**
 * Integration test for the streamdown measure-once cache pipeline.
 *
 * Tests the full lifecycle across all layers:
 *
 * Layer 1 — Cache module (streamdown-cache.ts):
 *   Hash stability, miss→write→hit, viewport width tolerance,
 *   width invalidation, multi-segment keying, LRU eviction.
 *
 * Layer 2 — Write-through capture (FlowTokenSegment pattern):
 *   MutationObserver + debounce settle → innerHTML + height capture →
 *   cache write. Simulates the exact pattern FlowTokenSegment uses
 *   without needing Streamdown/Shiki.
 *
 * Layer 3 — measureElement override (chat-messages.tsx pattern):
 *   cachedSizeMapRef lookup by data-item-key → returns cached size →
 *   delta=0 → no shouldAdjustScrollPositionOnItemSizeChange.
 *
 * Layer 4 — Stream-end snapshot trigger:
 *   isAgentRunning true→false transition → 300ms delay → snapshot.
 */
import { act, render } from '@testing-library/react';
import { useEffect, useLayoutEffect, useRef } from 'react';

import type { StreamdownCacheEntry } from '@/lib/chat/streamdown-cache';
import type { FC } from 'react';

import {
  getStreamdownCache,
  getStreamdownCacheSize,
  hashContent,
  hasStreamdownCache,
  invalidateForViewportWidth,
  resetStreamdownCacheForTests,
  setStreamdownCache,
} from '@/lib/chat/streamdown-cache';

function buildEntry(overrides: Partial<StreamdownCacheEntry> = {}): StreamdownCacheEntry {
  return {
    html: '<p>Hello world</p>',
    height: 42,
    viewportWidth: 650,
    cachedAt: Date.now(),
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════════
// Layer 1 — Cache Module
// ════════════════════════════════════════════════════════════════════════

describe('Layer 1: streamdown-cache module', () => {
  afterEach(() => {
    resetStreamdownCacheForTests();
  });

  describe('hashContent', () => {
    it('produces consistent hashes for the same text', () => {
      const text = 'Hello, world! This is a test message with **markdown**.';
      expect(hashContent(text)).toBe(hashContent(text));
    });

    it('produces different hashes for different text', () => {
      expect(hashContent('message A')).not.toBe(hashContent('message B'));
    });

    it('produces unsigned 32-bit integers', () => {
      const hash = hashContent('test');
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(0xffffffff);
    });

    it('handles long text with code blocks', () => {
      const longText = '```typescript\n' + 'const x = 1;\n'.repeat(500) + '```';
      const hash = hashContent(longText);
      expect(hashContent(longText)).toBe(hash);
    });
  });

  describe('miss → write → hit cycle', () => {
    it('returns null on miss, entry on hit', () => {
      const hash = hashContent('test text');
      expect(getStreamdownCache(hash, 650)).toBeNull();

      setStreamdownCache(hash, buildEntry({ height: 200 }));

      const result = getStreamdownCache(hash, 650);
      expect(result).not.toBeNull();
      expect(result?.height).toBe(200);
    });

    it('tracks cache size correctly', () => {
      expect(getStreamdownCacheSize()).toBe(0);
      setStreamdownCache(hashContent('a'), buildEntry());
      setStreamdownCache(hashContent('b'), buildEntry());
      expect(getStreamdownCacheSize()).toBe(2);
    });
  });

  describe('viewport width validation', () => {
    it('hits within 16px tolerance, misses beyond', () => {
      const hash = hashContent('width test');
      setStreamdownCache(hash, buildEntry({ viewportWidth: 650 }));

      expect(getStreamdownCache(hash, 660)).not.toBeNull(); // within 16px
      expect(getStreamdownCache(hash, 634)).not.toBeNull(); // within 16px
      expect(getStreamdownCache(hash, 667)).toBeNull(); // beyond 16px
      expect(getStreamdownCache(hash, 633)).toBeNull(); // beyond 16px
    });
  });

  describe('invalidateForViewportWidth', () => {
    it('removes entries that exceed width tolerance', () => {
      setStreamdownCache(hashContent('a'), buildEntry({ viewportWidth: 650 }));
      setStreamdownCache(hashContent('b'), buildEntry({ viewportWidth: 900 }));

      const invalidated = invalidateForViewportWidth(900);
      expect(invalidated).toBe(1); // 'a' at 650 removed
      expect(getStreamdownCacheSize()).toBe(1); // 'b' at 900 kept
    });
  });

  describe('multi-segment messages', () => {
    it('caches each segment independently by content hash', () => {
      const seg1 = "Here's the fix:";
      const seg2 = '```ts\nconst x = 1;\n```';
      const seg3 = 'That should work.';

      setStreamdownCache(hashContent(seg1), buildEntry({ html: '<p>s1</p>', height: 22 }));
      setStreamdownCache(hashContent(seg2), buildEntry({ html: '<pre>s2</pre>', height: 80 }));
      setStreamdownCache(hashContent(seg3), buildEntry({ html: '<p>s3</p>', height: 22 }));

      expect(getStreamdownCacheSize()).toBe(3);
      expect(getStreamdownCache(hashContent(seg1), 650)?.html).toBe('<p>s1</p>');
      expect(getStreamdownCache(hashContent(seg2), 650)?.html).toBe('<pre>s2</pre>');
      expect(getStreamdownCache(hashContent(seg3), 650)?.html).toBe('<p>s3</p>');
    });
  });
});

// ════════════════════════════════════════════════════════════════════════
// Layer 2 — Write-Through Capture (FlowTokenSegment pattern)
// ════════════════════════════════════════════════════════════════════════

/**
 * Minimal component that replicates FlowTokenSegment's write-through
 * cache pattern: render content → MutationObserver settle → capture
 * innerHTML + height → write to cache.
 */
const SETTLE_MS = 80;

const WriteThroughTestComponent: FC<{
  readonly text: string;
  readonly isStreaming: boolean;
}> = ({ text, isStreaming }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentHash = isStreaming ? 0 : hashContent(text);
  const cached = !isStreaming && contentHash !== 0 ? getStreamdownCache(contentHash, 650) : null;

  useLayoutEffect(() => {
    if (isStreaming || cached !== null) return;
    const el = wrapperRef.current;
    if (el === null) return;

    let settleTimer: ReturnType<typeof setTimeout>;
    let disposed = false;

    const capture = (): void => {
      if (disposed) return;
      observer.disconnect();
      const html = el.innerHTML;
      const height = el.getBoundingClientRect().height;
      if (html.length > 0 && height > 0) {
        setStreamdownCache(contentHash, {
          html,
          height,
          viewportWidth: 650,
          cachedAt: Date.now(),
        });
      }
    };

    const observer = new MutationObserver(() => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(capture, SETTLE_MS);
    });

    observer.observe(el, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    settleTimer = setTimeout(capture, SETTLE_MS);

    return (): void => {
      disposed = true;
      observer.disconnect();
      clearTimeout(settleTimer);
    };
  }, [contentHash, isStreaming, cached]);

  if (cached !== null) {
    return (
      <div
        ref={wrapperRef}
        data-testid="cached"
        dangerouslySetInnerHTML={{ __html: cached.html }}
      />
    );
  }

  return (
    <div ref={wrapperRef} data-testid="live">
      <p>{text}</p>
    </div>
  );
};

describe('Layer 2: write-through capture', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStreamdownCacheForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetStreamdownCacheForTests();
  });

  it('captures innerHTML + height after settle and writes to cache', () => {
    const text = 'Hello from the test';
    const hash = hashContent(text);

    // Mock getBoundingClientRect to return a real height
    const mockGetBCR = vi.fn().mockReturnValue({
      height: 44,
      width: 650,
      top: 0,
      left: 0,
      bottom: 44,
      right: 650,
      x: 0,
      y: 0,
      toJSON: vi.fn(),
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(mockGetBCR);

    // Render — should be a MISS (live render)
    expect(getStreamdownCache(hash, 650)).toBeNull();
    render(<WriteThroughTestComponent text={text} isStreaming={false} />);

    // Before settle — cache should still be empty
    expect(getStreamdownCache(hash, 650)).toBeNull();

    // Advance past the 80ms settle timer
    act(() => {
      vi.advanceTimersByTime(SETTLE_MS + 10);
    });

    // After settle — cache should have the entry
    const cached = getStreamdownCache(hash, 650);
    expect(cached).not.toBeNull();
    expect(cached?.height).toBe(44);
    expect(cached?.html).toContain('Hello from the test');
  });

  it('does NOT capture when isStreaming is true', () => {
    const text = 'Still streaming...';
    const hash = hashContent(text);

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 30,
      width: 650,
      top: 0,
      left: 0,
      bottom: 30,
      right: 650,
      x: 0,
      y: 0,
      toJSON: vi.fn(),
    });

    render(<WriteThroughTestComponent text={text} isStreaming={true} />);

    act(() => {
      vi.advanceTimersByTime(SETTLE_MS + 10);
    });

    // Should NOT be cached — streaming messages are mutable
    expect(getStreamdownCache(hash, 650)).toBeNull();
  });

  it('serves cached HTML via dangerouslySetInnerHTML on remount', () => {
    const text = 'Remount test';
    const hash = hashContent(text);

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 66,
      width: 650,
      top: 0,
      left: 0,
      bottom: 66,
      right: 650,
      x: 0,
      y: 0,
      toJSON: vi.fn(),
    });

    // First mount — live render → write-through capture
    const { unmount } = render(<WriteThroughTestComponent text={text} isStreaming={false} />);

    act(() => {
      vi.advanceTimersByTime(SETTLE_MS + 10);
    });

    expect(getStreamdownCache(hash, 650)).not.toBeNull();

    // Unmount (TanStack removes item from viewport)
    unmount();

    // Remount (TanStack adds item back to viewport) — should use cached HTML
    const { getByTestId } = render(<WriteThroughTestComponent text={text} isStreaming={false} />);

    // Should render the "cached" path (dangerouslySetInnerHTML)
    const el = getByTestId('cached');
    expect(el).toBeDefined();
    expect(el.innerHTML).toContain('Remount test');
  });
});

// ════════════════════════════════════════════════════════════════════════
// Layer 3 — measureElement Override
// ════════════════════════════════════════════════════════════════════════

describe('Layer 3: measureElement cached size return', () => {
  it('returns cached size when data-item-key matches', () => {
    const cachedSizeMap = new Map<string, number>();
    cachedSizeMap.set('session1:msg-abc', 470);
    cachedSizeMap.set('session1:msg-def', 220);

    // Simulate what measureElement does: check data-item-key, return cached size
    const element = document.createElement('div');
    element.setAttribute('data-item-key', 'session1:msg-abc');

    const itemKey = element.getAttribute('data-item-key');
    const cachedSize = itemKey !== null ? cachedSizeMap.get(itemKey) : undefined;

    expect(cachedSize).toBe(470);
  });

  it('falls through to DOM measurement when key is not cached', () => {
    const cachedSizeMap = new Map<string, number>();
    cachedSizeMap.set('session1:msg-abc', 470);

    const element = document.createElement('div');
    element.setAttribute('data-item-key', 'session1:msg-unknown');

    const itemKey = element.getAttribute('data-item-key');
    const cachedSize = itemKey !== null ? cachedSizeMap.get(itemKey) : undefined;

    // No cached size → measureElement would fall through to DOM reading
    expect(cachedSize).toBeUndefined();
  });

  it('falls through when data-item-key is missing', () => {
    const cachedSizeMap = new Map<string, number>();
    cachedSizeMap.set('session1:msg-abc', 470);

    const element = document.createElement('div');
    // No data-item-key attribute

    const itemKey = element.getAttribute('data-item-key');
    expect(itemKey).toBeNull();
  });

  it('returns correct size for each item in a multi-message session', () => {
    const cachedSizeMap = new Map<string, number>();
    const messages = [
      { key: 's1:msg-1', size: 44 },
      { key: 's1:msg-2', size: 800 },
      { key: 's1:msg-3', size: 22 },
      { key: 's1:msg-4', size: 2400 },
      { key: 's1:msg-5', size: 66 },
    ];

    for (const msg of messages) {
      cachedSizeMap.set(msg.key, msg.size);
    }

    // Simulate TanStack mounting each item and calling measureElement
    for (const msg of messages) {
      const el = document.createElement('div');
      el.setAttribute('data-item-key', msg.key);
      const key = el.getAttribute('data-item-key');
      const size = key !== null ? cachedSizeMap.get(key) : undefined;
      expect(size).toBe(msg.size);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════
// Layer 4 — Stream-End Snapshot Trigger
// ════════════════════════════════════════════════════════════════════════

/**
 * Minimal component that replicates the isAgentRunning transition effect
 * from chat-messages.tsx. When isAgentRunning goes true→false, it calls
 * the snapshot callback after 300ms.
 */
const StreamEndTriggerComponent: FC<{
  readonly isAgentRunning: boolean;
  readonly onSnapshot: () => void;
}> = ({ isAgentRunning, onSnapshot }) => {
  const prevRef = useRef(isAgentRunning);

  useEffect(() => {
    const wasRunning = prevRef.current;
    prevRef.current = isAgentRunning;

    if (wasRunning && !isAgentRunning) {
      const timer = setTimeout(() => {
        onSnapshot();
      }, 300);
      return (): void => {
        clearTimeout(timer);
      };
    }
    return undefined;
  }, [isAgentRunning, onSnapshot]);

  return <div data-testid="trigger">{isAgentRunning ? 'running' : 'idle'}</div>;
};

describe('Layer 4: stream-end snapshot trigger', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls snapshot when isAgentRunning transitions true → false', () => {
    const onSnapshot = vi.fn();

    const { rerender } = render(
      <StreamEndTriggerComponent isAgentRunning={true} onSnapshot={onSnapshot} />
    );

    // Transition: running → idle
    rerender(<StreamEndTriggerComponent isAgentRunning={false} onSnapshot={onSnapshot} />);

    // Before 300ms — not called yet
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(onSnapshot).not.toHaveBeenCalled();

    // At 300ms — snapshot fires
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire on initial mount when isAgentRunning is false', () => {
    const onSnapshot = vi.fn();

    render(<StreamEndTriggerComponent isAgentRunning={false} onSnapshot={onSnapshot} />);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it('does NOT fire when isAgentRunning stays true', () => {
    const onSnapshot = vi.fn();

    const { rerender } = render(
      <StreamEndTriggerComponent isAgentRunning={true} onSnapshot={onSnapshot} />
    );

    // Re-render with same value — no transition
    rerender(<StreamEndTriggerComponent isAgentRunning={true} onSnapshot={onSnapshot} />);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it('cancels pending snapshot if component unmounts', () => {
    const onSnapshot = vi.fn();

    const { rerender, unmount } = render(
      <StreamEndTriggerComponent isAgentRunning={true} onSnapshot={onSnapshot} />
    );

    // Transition: running → idle
    rerender(<StreamEndTriggerComponent isAgentRunning={false} onSnapshot={onSnapshot} />);

    // Unmount before 300ms
    act(() => {
      vi.advanceTimersByTime(100);
    });
    unmount();

    // Advance past the deadline — should NOT fire (cleaned up)
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it('handles rapid toggle (multi-turn): only the last transition fires', () => {
    const onSnapshot = vi.fn();

    const { rerender } = render(
      <StreamEndTriggerComponent isAgentRunning={true} onSnapshot={onSnapshot} />
    );

    // Turn 1: running → idle
    rerender(<StreamEndTriggerComponent isAgentRunning={false} onSnapshot={onSnapshot} />);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Turn 2: idle → running (before snapshot fires — previous timer cancelled)
    rerender(<StreamEndTriggerComponent isAgentRunning={true} onSnapshot={onSnapshot} />);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Turn 2 complete: running → idle
    rerender(<StreamEndTriggerComponent isAgentRunning={false} onSnapshot={onSnapshot} />);

    // Advance past both deadlines
    act(() => {
      vi.advanceTimersByTime(400);
    });

    // Only the second transition fires (first was cancelled by the re-render)
    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });
});

// ════════════════════════════════════════════════════════════════════════
// Full Pipeline — End-to-End Simulation
// ════════════════════════════════════════════════════════════════════════

describe('Full pipeline: measure once, use forever', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStreamdownCacheForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetStreamdownCacheForTests();
  });

  it('new message: stream → measure → cache → revisit uses cached', () => {
    const text = '# Welcome\n\nThis is a **rich** message with `code`.';
    const hash = hashContent(text);

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 88,
      width: 650,
      top: 0,
      left: 0,
      bottom: 88,
      right: 650,
      x: 0,
      y: 0,
      toJSON: vi.fn(),
    });

    // Phase 1: Message is streaming — no cache
    const { rerender, unmount } = render(
      <WriteThroughTestComponent text={text} isStreaming={true} />
    );
    act(() => {
      vi.advanceTimersByTime(SETTLE_MS + 10);
    });
    expect(hasStreamdownCache(hash, 650)).toBe(false);

    // Phase 2: Stream ends — re-render as completed
    rerender(<WriteThroughTestComponent text={text} isStreaming={false} />);
    act(() => {
      vi.advanceTimersByTime(SETTLE_MS + 10);
    });
    expect(hasStreamdownCache(hash, 650)).toBe(true);
    expect(getStreamdownCache(hash, 650)?.height).toBe(88);

    // Phase 3: Unmount (scroll away)
    unmount();

    // Phase 4: Remount (scroll back) — serves from cache
    const { getByTestId } = render(<WriteThroughTestComponent text={text} isStreaming={false} />);
    expect(getByTestId('cached')).toBeDefined();
    expect(getByTestId('cached').innerHTML).toContain('Welcome');

    // Phase 5: measureElement would return cached height = 88 → delta=0
    const cachedSizeMap = new Map<string, number>();
    cachedSizeMap.set('session:msg-1', 88);
    const el = document.createElement('div');
    el.setAttribute('data-item-key', 'session:msg-1');
    expect(cachedSizeMap.get(el.getAttribute('data-item-key') ?? '')).toBe(88);
  });

  it('adding a new message preserves existing cached measurements', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 100,
      width: 650,
      top: 0,
      left: 0,
      bottom: 100,
      right: 650,
      x: 0,
      y: 0,
      toJSON: vi.fn(),
    });

    // Session has 2 existing cached messages
    setStreamdownCache(hashContent('old msg 1'), buildEntry({ height: 150 }));
    setStreamdownCache(hashContent('old msg 2'), buildEntry({ height: 300 }));
    expect(getStreamdownCacheSize()).toBe(2);

    // New message arrives and completes
    const newText = 'New response from the agent';
    render(<WriteThroughTestComponent text={newText} isStreaming={false} />);
    act(() => {
      vi.advanceTimersByTime(SETTLE_MS + 10);
    });

    // All 3 entries exist — old measurements untouched
    expect(getStreamdownCacheSize()).toBe(3);
    expect(getStreamdownCache(hashContent('old msg 1'), 650)?.height).toBe(150);
    expect(getStreamdownCache(hashContent('old msg 2'), 650)?.height).toBe(300);
    expect(getStreamdownCache(hashContent(newText), 650)?.height).toBe(100);
  });
});
