# Mission 09: Memory Discipline

> Same memory after 8 hours as after 8 minutes.

---

## Why This Matters

A code editor runs for hours. Developers open it in the morning and close it at night. Every unbounded data structure, every leaked event listener, every accumulated string is a slow memory leak that eventually degrades performance or triggers an OOM. Today, Orbit has multiple unbounded structures that grow linearly with usage time, creates GC pressure through streaming string concatenation and inline style objects, and has no memory monitoring to detect leaks before they become user-visible.

The standard is simple: memory usage should plateau after the first few minutes and stay flat for the rest of the session, regardless of how many conversations, file opens, or tool executions happen.

---

## Current State

### Unbounded Data Structures

**checkpointOrder (checkpoint-store.ts:81):**

```typescript
// Grows with every file checkpoint, never trimmed
interface CheckpointStore {
  checkpointOrder: string[]; // Unbounded -- one entry per checkpoint forever
  checkpoints: Map<string, Checkpoint>; // Unbounded -- never evicted
}
```

A session with 200 file edits across 50 files creates 200+ checkpoint entries that persist in memory for the entire session.

**remappedOrbitIds (chat-store.ts:114):**

```typescript
// Maps temporary IDs to permanent IDs, never cleaned up
interface ChatStore {
  remappedOrbitIds: Map<string, string>; // Grows with every message, never evicted
}
```

Over a long session with many conversations, this map accumulates thousands of entries from old conversations that will never be referenced again.

### GC Pressure: String Concatenation

During streaming, each token triggers string concatenation:

```typescript
message.content += chunk.text; // Creates a new string, old one becomes garbage
```

At 50 tokens/second for a 4000-token response, this creates 4000 intermediate strings that immediately become garbage. The GC has to collect all of them, causing periodic GC pauses visible as micro-jank.

### GC Pressure: Inline Style Objects (LexicalChatEditor)

```typescript
// Creates a new object on every render
<div style={{ width: panelWidth, height: panelHeight }}>
```

If this component renders 50 times per second during streaming, it creates 50 identical-but-distinct style objects per second that the GC must collect.

### GC Pressure: Tool Event Objects

Each tool lifecycle event creates a new object for the event handler:

```typescript
// Every tool event creates a fresh object
const event = { toolId, type: 'output', data: outputChunk, timestamp: Date.now() };
processToolEvent(event); // Object becomes garbage after processing
```

### No Memory Monitoring

There is no mechanism to detect memory growth during development or in production. Leaks are only discovered when users report sluggishness after hours of use.

---

## What To Add

### Bound All Structures

```typescript
// lib/bounded-collections.ts

class BoundedMap<K, V> {
  private readonly map = new Map<K, V>();
  private readonly order: K[] = [];
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  set(key: K, value: V): void {
    if (!this.map.has(key)) {
      if (this.order.length >= this.capacity) {
        const oldest = this.order.shift()!;
        this.map.delete(oldest);
      }
      this.order.push(key);
    }
    this.map.set(key, value);
  }

  get(key: K): V | undefined {
    return this.map.get(key);
  }

  delete(key: K): boolean {
    const idx = this.order.indexOf(key);
    if (idx !== -1) this.order.splice(idx, 1);
    return this.map.delete(key);
  }

  get size(): number {
    return this.map.size;
  }
}
```

**Apply to checkpoint-store:**

```typescript
// Before: unbounded
checkpointOrder: string[] = [];
checkpoints: Map<string, Checkpoint> = new Map();

// After: bounded to 500
checkpoints: BoundedMap<string, Checkpoint> = new BoundedMap(500);
// checkpointOrder folded into BoundedMap's internal order tracking
```

**Apply to remappedOrbitIds:**

```typescript
// Before: unbounded
remappedOrbitIds: Map<string, string> = new Map();

// After: bounded to 2000 (enough for ~10 conversations worth of messages)
remappedOrbitIds: BoundedMap<string, string> = new BoundedMap(2000);
```

### Array Builder for Strings

```typescript
// lib/string-builder.ts

class StringBuilder {
  private readonly parts: string[] = [];
  private cache: string | null = null;

  append(str: string): void {
    this.parts.push(str);
    this.cache = null; // Invalidate
  }

  toString(): string {
    if (this.cache === null) {
      this.cache = this.parts.join('');
    }
    return this.cache;
  }

  get length(): number {
    return this.parts.reduce((sum, p) => sum + p.length, 0);
  }

  clear(): void {
    this.parts.length = 0;
    this.cache = null;
  }
}

// Usage in chat-store during streaming:
// Before: message.content += chunk.text (O(n) copy, GC pressure)
// After:  message.builder.append(chunk.text) (O(1) push, no GC)
// On read: message.builder.toString() (one join, cached)
```

### Hoist Inline Styles

```typescript
// Before: new object every render
<div style={{ width: panelWidth, height: panelHeight }}>

// After: memoized style object
const panelStyle = useMemo(
  () => ({ width: panelWidth, height: panelHeight }),
  [panelWidth, panelHeight]
);
<div style={panelStyle}>
```

For static styles that never change:

```typescript
// Before: new object every render
<div style={{ display: 'flex', gap: 8 }}>

// After: hoisted to module scope (zero allocations)
const FLEX_GAP_STYLE = { display: 'flex', gap: 8 } as const;
<div style={FLEX_GAP_STYLE}>
```

### WeakRef for Optional Caches

```typescript
// lib/weak-cache.ts

class WeakCache<K extends object, V> {
  private readonly cache = new Map<string, WeakRef<V & object>>();
  private readonly registry = new FinalizationRegistry<string>((key) => {
    this.cache.delete(key);
  });

  set(key: string, value: V & object): void {
    const ref = new WeakRef(value);
    this.cache.set(key, ref);
    this.registry.register(value, key);
  }

  get(key: string): V | undefined {
    const ref = this.cache.get(key);
    if (ref === undefined) return undefined;
    const value = ref.deref();
    if (value === undefined) {
      this.cache.delete(key); // Ref was collected
      return undefined;
    }
    return value;
  }
}

// Usage: cache parsed file trees, highlighted code blocks, etc.
// GC can reclaim them under memory pressure.
```

### Dev-Only Memory Monitor

```typescript
// lib/dev/memory-monitor.ts

class MemoryMonitor {
  private samples: Array<{ timestamp: number; usedJSHeapSize: number }> = [];
  private intervalId: number | null = null;
  private readonly maxSamples = 360; // 1 hour at 10s intervals

  start(intervalMs: number = 10_000): void {
    if (!('memory' in performance)) {
      console.warn('performance.memory not available (Chrome/Edge only)');
      return;
    }

    this.intervalId = window.setInterval(() => {
      const memory = (performance as PerformanceWithMemory).memory;
      this.samples.push({
        timestamp: Date.now(),
        usedJSHeapSize: memory.usedJSHeapSize,
      });

      // Trim old samples
      if (this.samples.length > this.maxSamples) {
        this.samples.shift();
      }

      // Alert on sustained growth
      this.checkForLeaks();
    }, intervalMs);
  }

  private checkForLeaks(): void {
    if (this.samples.length < 12) return; // Need 2 minutes of data

    const recent = this.samples.slice(-12);
    const oldest = recent[0].usedJSHeapSize;
    const newest = recent[recent.length - 1].usedJSHeapSize;
    const growth = newest - oldest;

    // Alert if memory grew >20MB in 2 minutes with no new conversations
    if (growth > 20 * 1024 * 1024) {
      console.warn('[MemoryMonitor] Sustained memory growth detected:', {
        growthMB: (growth / (1024 * 1024)).toFixed(1),
        currentMB: (newest / (1024 * 1024)).toFixed(1),
        periodSec: 120,
      });
    }
  }

  getReport(): MemoryReport {
    return {
      samples: [...this.samples],
      currentMB:
        this.samples.length > 0
          ? (this.samples[this.samples.length - 1].usedJSHeapSize / (1024 * 1024)).toFixed(1)
          : 'N/A',
      peakMB:
        this.samples.length > 0
          ? (Math.max(...this.samples.map((s) => s.usedJSHeapSize)) / (1024 * 1024)).toFixed(1)
          : 'N/A',
    };
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

// Expose to devtools
if (import.meta.env.DEV) {
  (window as Record<string, unknown>).__orbit_memory = new MemoryMonitor();
}
```

---

## What We Get

| Metric                                  | Before                                  | After                                       |
| --------------------------------------- | --------------------------------------- | ------------------------------------------- |
| Checkpoint memory after 200 edits       | ~200 entries, growing                   | Capped at 500, oldest evicted               |
| remappedOrbitIds after 10 conversations | Thousands of stale entries              | Capped at 2000, oldest evicted              |
| GC pressure during streaming            | 4000 intermediate strings per response  | O(1) array pushes, one join at end          |
| Inline style allocations per render     | One new object per render per component | Zero (hoisted) or one per change (memoized) |
| Memory leak detection                   | None (discovered by users after hours)  | Dev-only monitor with 20MB growth alert     |
| 8-hour session memory profile           | Grows linearly                          | Plateaus after first few minutes            |

---

## Estimated Complexity

**Medium (2-3 days)**

- Day 1: BoundedMap implementation + apply to checkpoint-store and chat-store
- Day 2: StringBuilder for streaming + hoist inline styles across components
- Day 3: WeakCache utility + dev-only memory monitor + validation

---

## Dependencies

- Mission #02 (Streaming Backpressure) introduces the string builder pattern. If #02 lands first, this mission reuses its StringBuilder.
- Mission #10 (Observability) pairs with the memory monitor -- memory metrics can feed into the perf dashboard.

---

## Risks

| Risk                                               | Mitigation                                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| BoundedMap evicts data still in use                | Capacity of 500 checkpoints and 2000 IDs is generous. Monitor actual usage patterns. If a user hits the cap, increase it. |
| FinalizationRegistry timing is non-deterministic   | WeakCache is for optional caches only. Cache miss = recompute, not error.                                                 |
| performance.memory is Chrome-only                  | Memory monitor is dev-only and Chrome-only. Acceptable for development tooling.                                           |
| Hoisting styles changes component behavior         | Only hoist truly static styles. Dynamic styles use useMemo, which preserves reactivity.                                   |
| StringBuilder adds API complexity to message reads | Encapsulate behind a getter: `message.content` calls `toString()` internally. Consumers don't see the builder.            |
