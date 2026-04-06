# Mission 02: Streaming Backpressure

> Frame-aligned rendering for token streaming.

---

## Why This Matters

When Claude streams a response, every token fires a state update that triggers a React re-render, a Virtuoso re-measure, and a scroll adjustment. At 50+ tokens per second, this means 50+ renders per second -- each one doing O(n) string concatenation on the accumulated message, forcing layout recalculation, and incrementing `layoutVersion` to tell Virtuoso the content changed. The user sees this as choppy scrolling, dropped frames, and input lag while typing during an active stream.

Frame-aligned batching collects all tokens that arrive within a single animation frame (~8.3ms at 120Hz, ~16.6ms at 60Hz) and applies them as one atomic update. The result is one render per frame instead of 5-8 renders per frame.

---

## Current State

### Text Chunk Accumulation (chat-store.ts:534-559)

Text chunks are applied immediately via `set()` with string concatenation:

```typescript
// Current: O(n) concatenation on every single token
set((state) => {
  const message = state.messages[messageIndex];
  message.content += chunk.text; // O(n) string copy every time
});
```

For a 4000-token response, this means 4000 string copies of increasing length: O(1) + O(2) + ... + O(4000) = O(n^2) total work.

### Terminal Output (terminal-store.ts:335-362)

Terminal output is unbatched with O(n) array splice:

```typescript
// Current: splice on every output event
set((state) => {
  state.outputs.splice(state.outputs.length, 0, ...newLines);
});
```

Each splice copies the entire array tail. With rapid terminal output (e.g., npm install with 500+ lines), this creates visible stutter.

### Layout Version Increment

Every text chunk increments `layoutVersion++`, which Virtuoso watches to trigger re-measurement. At 50 tokens/second, this forces 50 re-measures per second when only 1-2 are needed (once per frame).

---

## What To Replace

### RAF Text Batcher

```typescript
// services/streaming/text-batcher.ts

class TextBatcher {
  private pending: string[] = [];
  private rafId: number | null = null;
  private readonly flush: (accumulated: string) => void;

  constructor(flush: (accumulated: string) => void) {
    this.flush = flush;
  }

  push(chunk: string): void {
    this.pending.push(chunk);
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => this.drain());
    }
  }

  private drain(): void {
    this.rafId = null;
    if (this.pending.length === 0) return;

    // Join all pending chunks in one pass (single allocation)
    const batch = this.pending.join('');
    this.pending = [];
    this.flush(batch);
  }

  dispose(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    // Flush remaining on dispose
    if (this.pending.length > 0) {
      const batch = this.pending.join('');
      this.pending = [];
      this.flush(batch);
    }
  }
}
```

### String Builder (Replace += with Array Push)

```typescript
// Replace O(n) concatenation with O(1) array push

// Before (chat-store.ts):
message.content += chunk.text; // O(n) copy

// After:
// Store content as string[] during streaming, join on read
interface StreamingMessage {
  readonly contentParts: string[]; // O(1) push during streaming
  readonly contentCache: string; // Joined on demand, cached
  readonly contentDirty: boolean; // Invalidated on push
}

function getContent(msg: StreamingMessage): string {
  if (!msg.contentDirty) return msg.contentCache;
  msg.contentCache = msg.contentParts.join(''); // One join when needed
  msg.contentDirty = false;
  return msg.contentCache;
}
```

### Terminal Ring Buffer

```typescript
// Replace unbounded array + splice with fixed-capacity ring buffer

class TerminalRingBuffer {
  private readonly buffer: string[];
  private head = 0;
  private size = 0;
  private readonly capacity: number;

  constructor(capacity: number = 10_000) {
    this.capacity = capacity;
    this.buffer = new Array<string>(capacity);
  }

  push(line: string): void {
    this.buffer[this.head] = line;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  pushBatch(lines: readonly string[]): void {
    for (const line of lines) this.push(line);
  }

  toArray(): string[] {
    if (this.size < this.capacity) {
      return this.buffer.slice(0, this.size);
    }
    return [...this.buffer.slice(this.head), ...this.buffer.slice(0, this.head)];
  }
}
```

### Layout Version Throttling

```typescript
// Before: layoutVersion++ on every chunk (50/sec)
// After: layoutVersion++ at most once per frame

class LayoutVersionThrottle {
  private dirty = false;
  private rafId: number | null = null;
  private readonly onBump: () => void;

  constructor(onBump: () => void) {
    this.onBump = onBump;
  }

  markDirty(): void {
    this.dirty = true;
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        if (this.dirty) {
          this.dirty = false;
          this.onBump();
        }
      });
    }
  }
}
```

---

## What We Get

| Metric                                 | Before                             | After                           |
| -------------------------------------- | ---------------------------------- | ------------------------------- |
| Renders per second during streaming    | 50+ (one per token)                | 1-2 (one per frame)             |
| String concatenation cost (4k tokens)  | O(n^2) total (~8M char copies)     | O(n) total (one join at end)    |
| Virtuoso re-measures per second        | 50+                                | 1-2 (frame-aligned)             |
| Terminal splice operations (500 lines) | 500 splices                        | 1 batch insert per frame        |
| FPS during active streaming            | 30-45 FPS (drops with code blocks) | 60-120 FPS sustained            |
| Input latency during streaming         | 50-100ms (queued behind renders)   | <16ms (frame budget maintained) |

---

## Estimated Complexity

**Medium (2-3 days)**

- Day 1: TextBatcher + string builder integration in chat-store
- Day 2: Terminal ring buffer + layout version throttle
- Day 3: Testing under load (stress test with rapid streaming), edge cases (stream abort mid-batch)

---

## Dependencies

- None blocking. Can start immediately.
- Pairs well with Mission #01 (Web Workers): worker results can feed into the RAF batcher.
- Mission #03 (Store Performance) benefits from batched updates reducing set() call frequency.

---

## Risks

| Risk                                            | Mitigation                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Perceived latency from batching delay           | RAF fires within 8-16ms -- imperceptible to users. First token still appears immediately.       |
| Edge case: stream ends between RAF frames       | TextBatcher.dispose() flushes remaining chunks synchronously on stream end                      |
| Ring buffer drops old terminal lines            | 10k capacity is generous. Add a "scroll to see more" indicator at the top.                      |
| String builder adds complexity to message reads | Cache the joined string; only re-join when dirty. Most reads happen after streaming ends.       |
| Layout version throttle delays scroll-to-bottom | Scroll-to-bottom can be decoupled from layoutVersion and driven by the batcher's flush callback |
