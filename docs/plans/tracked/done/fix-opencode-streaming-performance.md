# Fix OpenCode Streaming Performance (120 FPS → 4 FPS)

## Context

When the OpenCode backend streams responses, the Orbit app drops from **120 FPS to ~4 FPS**. The lag builds progressively as the response grows — longer responses with code blocks are worse. After streaming ends, the app slowly recovers. The Claude/agent-bridge backend does **not** exhibit this issue because it uses `rafBatch` to coalesce chunks before updating state.

**Root causes (ranked by impact):**

1. **No delta batching** — Each per-character SSE delta calls Zustand `set()` with Immer immediately (~200-400/sec), triggering full React render cascades
2. **Full Streamdown re-parse on every word reveal** — Every 33ms tick re-parses the entire markdown AST via remark-gfm + rehypeInsightBlocks + rehypeFlowTokens (~30 full re-parses/sec)
3. ~~Complete messages array reconstruction every render~~ — **Mitigated by existing layers:** `arePropsEqual` in `MessageItem` compares by value (not reference), and `segments`/`visibleTools`/`effectiveThinkingBlocks` useMemo hooks depend on field values (`animatedContent`, `animatedContent.length`, etc.), not message object references. New objects from the upstream adapter don't cause MessageItem re-renders.

---

## Phase 1: Session-Scoped RAF-Batch OpenCode Deltas

**Impact: ~4 FPS → 30-60 FPS** (biggest single win — ship as separate PR)

### Files to modify:

- `apps/agent/src/services/opencode/oc-event-coordinator.ts` — batching layer + lifecycle hooks
- `apps/agent/src/stores/opencode/oc-message-store.ts` — new `appendDeltaBatch()` action
- `apps/agent/src/hooks/opencode/use-opencode-lifecycle.ts` — wire teardown cleanup

### What

Wrap `message.part.delta` handling with session-scoped `rafBatch` instances. Instead of calling `appendDelta()` on every character, accumulate deltas per-session and flush once per animation frame in a single Immer transaction.

### Why session-scoped (not module-global)

A module-global batcher conflicts with the per-session lifecycle discipline in `chat-message-service.ts` and creates a zombie session bug: `cleanupOpenCodeState()` (`use-opencode-lifecycle.ts:28-44`) calls `clearAll()` on the message store, but a pending RAF flush would call `appendDelta()` → `getOrCreateSession()` (`oc-message-store.ts:51-69`) → recreates cleared session state. Session-scoped batchers with explicit cleanup prevent this.

### Changes

**1. Session-scoped batcher map in `oc-event-coordinator.ts`:**

```ts
interface DeltaItem {
  sessionID: string;
  messageID: string;
  partID: string;
  field: string;
  delta: string;
}

const deltaBatchers = new Map<string, RafBatchHandler<DeltaItem>>();

function getDeltaBatcher(sessionId: string): RafBatchHandler<DeltaItem> {
  const existing = deltaBatchers.get(sessionId);
  if (existing) return existing;

  const created = rafBatch<DeltaItem>((items: DeltaItem[]): void => {
    useOcMessageStore.getState().appendDeltaBatch(items);
  });
  deltaBatchers.set(sessionId, created);
  return created;
}

/** Flush and destroy a single session's batcher. Used on session.idle/deleted/error. */
function cancelSessionDeltas(sessionId: string, flush = false): void {
  deltaBatchers.get(sessionId)?.cancel(flush);
  deltaBatchers.delete(sessionId);
}

/** Cancel all batchers without flushing — used during full OpenCode teardown.
 *  MUST be called BEFORE clearAll() to prevent zombie session recreation. */
export function cancelAllDeltaBatchers(): void {
  for (const batcher of deltaBatchers.values()) {
    batcher.cancel(false); // Discard, don't flush into about-to-be-cleared stores
  }
  deltaBatchers.clear();
}
```

**2. Replace `message.part.delta` case (lines 139-150):**

```ts
case 'message.part.delta':
  getDeltaBatcher(payload.properties.sessionID)({
    sessionID: payload.properties.sessionID,
    messageID: payload.properties.messageID,
    partID: payload.properties.partID,
    field: payload.properties.field,
    delta: payload.properties.delta,
  });
  break;
```

**3. Flush before `message.part.updated` (lines 123-137):**
`upsertPart` replaces the part with authoritative full text. Unflushed deltas for this session would append duplicate text after replacement.

```ts
case 'message.part.updated':
  cancelSessionDeltas(payload.properties.part.sessionID, true);  // Flush THIS session's deltas first
  useOcMessageStore.getState().upsertPart(payload.properties.part);
  // ...existing flushDeltaBuffer call...
  break;
```

**4. Flush (not discard) on `message.removed` and `message.part.removed` (lines 113-121, 151-160):**

Use `batcher.cancel(true)` to flush pending deltas for ALL messages in the session, then let the remove operation clean up the specific entity. This preserves other messages' queued deltas (they get applied to the store) while the removed entity's deltas are harmlessly applied then immediately cleaned up by `removeMessage`/`removePart`.

Do NOT use `cancelSessionDeltas` (which destroys the batcher) — the session may still be streaming other messages.

```ts
case 'message.removed':
  // Flush pending deltas (preserves other messages' work), then remove
  deltaBatchers.get(payload.properties.sessionID)?.cancel(true);
  useOcMessageStore.getState().removeMessage(payload.properties.sessionID, payload.properties.messageID);
  break;

case 'message.part.removed':
  // Flush pending deltas (preserves other parts' work), then remove
  deltaBatchers.get(payload.properties.sessionID)?.cancel(true);
  useOcMessageStore.getState().removePart(payload.properties.sessionID, payload.properties.partID);
  break;
```

**5. Flush and destroy on session lifecycle events** — add `cancelSessionDeltas(sessionId, true)` before existing handler logic for:

- `session.idle` (line 84) — streaming ended normally
- `session.deleted` (line 63) — session destroyed
- `session.error` (line 93) — streaming terminated by error

**6. New `appendDeltaBatch()` store action in `oc-message-store.ts`:**

Apply all deltas in one Immer transaction instead of N separate `set()` calls:

```ts
appendDeltaBatch: (items: DeltaItem[]): void => {
  set((state) => {
    // Group by sessionID + partID + field and concatenate
    const grouped = new Map<string, { sessionID: string; messageID: string; partID: string; field: string; accumulated: string }>();
    for (const item of items) {
      const key = `${item.sessionID}\0${item.partID}\0${item.field}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.accumulated += item.delta;
      } else {
        grouped.set(key, { ...item, accumulated: item.delta });
      }
    }

    for (const entry of grouped.values()) {
      const session = getOrCreateSession(state.sessions, entry.sessionID);
      const part = session.partsById[entry.partID];
      if (!part) {
        session.deltaBufferByPart[entry.partID] = [
          ...(session.deltaBufferByPart[entry.partID] ?? []),
          { field: entry.field, delta: entry.accumulated },
        ];
        continue;
      }
      const currentField =
        ((part as unknown as Record<string, unknown>)[entry.field] as string | undefined) ?? '';
      const updatedPart = { ...part, [entry.field]: currentField + entry.accumulated } as OcPart;
      session.partsById[entry.partID] = updatedPart;
      session.partsByMessage[entry.messageID] = (session.partsByMessage[entry.messageID] ?? []).map(
        (candidate) => (candidate.id === entry.partID ? updatedPart : candidate)
      );
    }
  });
},
```

**7. Wire `cancelAllDeltaBatchers()` into lifecycle teardown in `use-opencode-lifecycle.ts`:**

Add call at the top of `cleanupOpenCodeState()` (line 28), BEFORE `clearAll()`:

```ts
function cleanupOpenCodeState(): void {
  cancelAllDeltaBatchers(); // Discard pending RAF work BEFORE clearing stores
  ocSseManager.disconnect();
  destroyClient();
  // ...existing cleanup...
}
```

### Reused utility

- `rafBatch` from `apps/agent/src/lib/utils/event-batcher.ts` (lines 106-140) — already battle-tested by the Claude backend

---

## Phase 2: Throttle Reveal Re-render Frequency + ThinkingBlock Stabilization

**Impact: 30-60 FPS → 60-90 FPS** (ship as separate PR after Phase 1 is verified)

### File: `apps/agent/src/hooks/chat/use-oc-streaming-reveal.ts`

### 2A: Time-based gating of `setVersion()` during streaming

Currently the tick function (line 153-217) calls `setVersion()` on every tick that advances at least one word (~30x/sec). Each `setVersion` triggers React re-render → Streamdown re-parses entire growing markdown.

**Change:** Use time-based gating — only call `setVersion()` at most every ~80ms during active streaming. During drain (no messages streaming), flush immediately so drain speed is unaffected. `lastFlushRef` starts at 0 so `Date.now() - 0 >= 80` is always true → first token renders immediately with no delay.

```ts
const lastFlushRef = useRef(0);
```

In the tick function, replace the `setVersion` call (around line 210-212):

```ts
if (didChange) {
  const now = Date.now();
  const isAnyStreaming = messagesRef.current.some((m) => m.isStreaming === true);
  // During streaming: batch ~2-3 word advances into 1 React render (~80ms intervals)
  // During drain: flush immediately (isAnyStreaming is false → no gating)
  if (!isAnyStreaming || now - lastFlushRef.current >= 80) {
    setVersion((current) => current + 1);
    lastFlushRef.current = now;
  }
}
```

**Fallback:** If the time-based approach proves fragile, changing `STREAMING_CADENCE_MS` from `33` to `100` achieves the same render reduction with a one-line constant change.

### 2B: Structural reuse for ThinkingBlock arrays

`revealedBlocks` is rebuilt via `.map() + .slice()` on every render (line 243-247). Reference equality never stabilizes for reasoning turns. Without this fix, reasoning-heavy OpenCode responses miss the `arePropsEqual` optimization in `MessageItem` (which compares `thinkingBlocks` by reference).

```ts
function reuseThinkingBlocks(
  previous: ThinkingBlock[] | undefined,
  next: ThinkingBlock[]
): ThinkingBlock[] {
  if (previous === undefined || previous.length !== next.length) {
    return next;
  }
  let changed = false;
  const reused = next.map((block, index) => {
    const prev = previous[index];
    if (prev && prev.content === block.content && prev.durationMs === block.durationMs) {
      return prev; // Same reference
    }
    changed = true;
    return block;
  });
  return changed ? reused : previous;
}
```

Store previous thinking blocks per message ID for comparison:

```ts
const prevThinkingRef = useRef(new Map<string, ThinkingBlock[]>());
```

In the return statement (line 243-247), wrap the existing logic:

```ts
const rawRevealedBlocks = thinkingBlocks.map((block, index) => ({
  ...block,
  content: block.content.slice(0, entry.thinkingLengths[index] ?? block.content.length),
}));
const revealedBlocks = reuseThinkingBlocks(
  prevThinkingRef.current.get(message.id),
  rawRevealedBlocks
);
// After the map: update cache
prevThinkingRef.current.set(message.id, revealedBlocks);
```

Evict stale entries in the existing `useEffect([messages])` at line 87-151:

```ts
const validIds = new Set(messages.map((m) => m.id));
for (const key of prevThinkingRef.current.keys()) {
  if (!validIds.has(key)) prevThinkingRef.current.delete(key);
}
```

### Why Phase 2B (render-state caching) was dropped

The previous revision proposed caching full `ChatMessage` objects or render-derived state to prevent downstream re-renders. This doesn't work because the upstream adapter chain (`useOcChat` → `useOcChatAdapter`) recreates message objects on every session update — the `prevInput === message` reference check always fails.

However, **this is not a performance problem.** Downstream `MessageItem` uses:

- `arePropsEqual` (`message-utils.ts:303-359`) — compares all `ChatMessage` fields by **value**, not reference
- `segments` useMemo — depends on `animatedContent` (string value), not message reference
- `visibleTools` useMemo — depends on `animatedContent.length`, not message reference
- `effectiveThinkingBlocks` useMemo — depends on `message.thinkingBlocks` (reference), fixed by 2B above

The existing memoization layers already prevent non-streaming `MessageItem` re-renders even when the reveal hook creates new objects. No additional caching is needed.

---

## ~~Phase 3: Skip rehypeInsightBlocks During Streaming~~ REMOVED

**Dropped.** The existing code (MessageItem.tsx lines 64-69) documents a DOM restructuring flash observed firsthand. ~0.3ms savings per tick isn't worth the visual risk.

---

## Files Modified (Summary)

| File                                                       | Phase | Change                                                        |
| ---------------------------------------------------------- | ----- | ------------------------------------------------------------- |
| `apps/agent/src/services/opencode/oc-event-coordinator.ts` | 1     | Session-scoped RAF delta batchers with lifecycle hooks        |
| `apps/agent/src/stores/opencode/oc-message-store.ts`       | 1     | New `appendDeltaBatch()` single-transaction store action      |
| `apps/agent/src/hooks/opencode/use-opencode-lifecycle.ts`  | 1     | Wire `cancelAllDeltaBatchers()` into `cleanupOpenCodeState()` |
| `apps/agent/src/hooks/chat/use-oc-streaming-reveal.ts`     | 2     | Time-gated setVersion + ThinkingBlock structural reuse        |

## Reused Utilities

- `rafBatch` from `apps/agent/src/lib/utils/event-batcher.ts` — already used by Claude backend
- `arePropsEqual` from `apps/agent/src/components/chat/messages/message-utils.ts` — existing exhaustive field comparison handles new object references from upstream

---

## Test Plan

### Existing tests (must pass)

```bash
bun run check
bun run test -- apps/agent/src/__tests__/unit/hooks/chat/use-oc-streaming-reveal.test.ts
bun run test -- apps/agent/src/__tests__/unit/stores/opencode/oc-message-store.test.ts
bun run test -- apps/agent/src/__tests__/unit/hooks/chat/use-oc-chat-streaming.test.ts
bun run test -- apps/agent/src/__tests__/unit/services/opencode/oc-event-coordinator-compact.test.ts
bun run test -- apps/agent/src/__tests__/integration/services/opencode/oc-title-loading.test.ts
bun run test -- apps/agent/src/__tests__/integration/services/opencode/oc-compact-flow.test.ts
```

### New tests to add

**Phase 1 — Delta batching:**

- Batched delta ordering: deltas D1, D2, D3 for same part arrive across RAF frames → applied in order
- Per-session isolation: two sessions streaming concurrently → batchers are independent, `cancelSessionDeltas` on one doesn't affect the other
- `message.part.updated` flush ordering: flush pending deltas THEN `upsertPart` → no duplicate text
- `message.removed` flush-then-remove: pending deltas for other messages in same session are preserved (flushed to store), removed message's deltas harmlessly applied then cleaned up
- `message.part.removed` flush-then-remove: same pattern — other parts' deltas preserved
- Backend teardown during streaming: `cancelAllDeltaBatchers()` prevents zombie session recreation via `getOrCreateSession()`
- `appendDeltaBatch` single-transaction: N deltas → 1 Zustand `set()` call (mock/spy verification)

**Phase 2 — Reveal throttle + ThinkingBlock reuse:**

- Time-gated renders: during streaming, `setVersion` fires at most every ~80ms
- First-flush-immediate: `lastFlushRef` starting at 0 → first token renders without delay
- Drain mode: `setVersion` fires on every tick when `isAnyStreaming` is false
- ThinkingBlock reuse: reasoning turns with unchanged block content → same array reference
- ThinkingBlock change: when revealed content advances → new block objects
- Stale cache eviction: after rewind/session switch, old IDs are purged from `prevThinkingRef` Map

### Manual verification

1. Switch to OpenCode backend, send a message triggering a long response (~1000+ words with code blocks)
2. During streaming: FPS > 60, smooth scrolling, word-group reveal animation, no glitches at stream end
3. After streaming: insight blocks correct, tool widgets positioned, flow tokens animated
4. Edge cases:
   - Stop agent mid-stream → no orphaned deltas
   - Switch backend during streaming → no zombie sessions (verify via DevTools: no `getOrCreateSession` calls after `clearAll`)
   - Switch sessions during streaming → no cross-contamination
   - Very short responses → first token appears immediately (no 80ms delay)
   - Remove message during streaming (revert) → other messages' deltas preserved
   - Rewind during streaming → ThinkingBlock cache evicted, no stale refs
   - Reasoning-heavy response → ThinkingBlock refs stabilize (verify via React DevTools Profiler)
