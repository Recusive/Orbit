# Fix: Sequential Thinking-Before-Content Streaming

> **Status**: ✅ APPROVED (4 review rounds, 2026-03-16)
> **Audit 1** (deep audit): 0 critical — gate-all approach approved
> **Audit 2** (review board): 2 critical — gate-all regresses multi-phase interleaving contract
> **Audit 3** (review board): 2 critical — content-ceiling-only still advances all thinking in parallel; later blocks render before their boundary
> **Audit 4** (review board): APPROVE WITH CHANGES — 0 critical, 3 edge case notes incorporated below
> **Resolution**: Single ordered frontier that sequences BOTH thinking blocks AND content

## Context

When using the OpenCode backend with thinking-capable models (Claude Opus), thinking content and regular text content stream simultaneously in the Orbit Editor. The thinking box starts showing reasoning, but before it finishes, regular text also appears outside the box. They render at the same time.

**Expected behavior** (matching CLI): Each thinking phase streams to completion, then the content segment up to the next thinking boundary appears. Sequential per phase, never overlapping.

**Root cause**: The `useOcStreamingReveal` hook's tick function advances both `contentLength` and `thinkingLengths[]` counters on every animation frame without sequencing. The CLI works because each part is a separate SolidJS component with a `<Show when={text.trim()}>` guard — parts naturally sequence by data arrival order.

**Why this requires a single ordered frontier** (not just a content ceiling):

The codebase has a multi-phase interleaving contract across three files:

- `adaptParts()` records `contentOffset` on each thinking block (the position in the content string where that thinking phase sits)
- `buildUnifiedSegments()` uses those offsets to render `[thinking₁, content₁, thinking₂, content₂]` (tested in `build-unified-segments.test.ts`)
- `MessageItem` gates tool visibility on `displayedContent.length` — tools at offset N only show when displayed content reaches N

A content-only ceiling solves content ordering but still advances all thinking blocks in parallel. `buildUnifiedSegments` renders any non-empty offset-marked thinking block (`message-utils.ts:197-204`), and `ThinkingBox` always renders at minimum a header — so a later block that reveals early produces a premature "Thought" header before its content boundary is reached.

The fix must control a **single ordered frontier**: only one thinking block advances at a time, and later blocks stay at `""` until `displayedContent` reaches their `contentOffset`.

## Change: `use-oc-streaming-reveal.ts` (single file)

**File**: `apps/agent/src/hooks/chat/use-oc-streaming-reveal.ts`

### Part 1: New helper — `getRevealFrontier`

Add above the `useOcStreamingReveal` export:

```typescript
/**
 * Compute the single ordered reveal frontier for this message.
 *
 * Returns which thinking block (if any) is eligible to advance, and how far
 * content may advance. The invariant is: reveal exactly one frontier at a time.
 * Later thinking blocks stay at '' until displayedContent reaches their offset.
 *
 * Scan order matches adaptParts() emission order (first-to-last), so the
 * earliest pending block always wins.
 *
 * @returns activeThinkingIndex — the one block allowed to advance (-1 = none)
 * @returns contentCeiling — max position contentLength may reach
 */
function getRevealFrontier(
  message: ChatMessage,
  blocks: ThinkingBlock[],
  entry: RevealEntry
): { activeThinkingIndex: number; contentCeiling: number } {
  for (const [index, block] of blocks.entries()) {
    const offset = block.contentOffset;
    const blockOffset = offset ?? 0;
    const revealed = entry.thinkingLengths[index] ?? 0;
    const stillGrowing = message.isThinkingActive === true && index === blocks.length - 1;
    const pending = stillGrowing || revealed < block.content.length;

    if (!pending) {
      continue; // Fully revealed — move to next block
    }

    // Legacy/no-offset: gate all content, advance this block
    if (offset === undefined) {
      return { activeThinkingIndex: index, contentCeiling: 0 };
    }

    // Prior content segment hasn't reached this block's boundary yet.
    // Advance content toward the boundary; don't start this thinking block.
    if (entry.contentLength < blockOffset) {
      return { activeThinkingIndex: -1, contentCeiling: blockOffset };
    }

    // Content has reached the boundary — this block may advance.
    // Content stays capped at this offset while the block drains.
    return { activeThinkingIndex: index, contentCeiling: blockOffset };
  }

  // All blocks fully revealed (or no blocks) — content advances freely
  return { activeThinkingIndex: -1, contentCeiling: message.content.length };
}
```

### Part 2: Tick function replacement (lines 207-226)

**Current code (broken):**

```typescript
let advanced = false;

// Content advances unconditionally — BUG
if (entry.contentLength < message.content.length) {
  entry.contentLength = Math.min(
    findNextWordEnd(message.content, entry.contentLength),
    message.content.length
  );
  advanced = true;
}

// ALL thinking blocks advance in parallel — BUG
for (const [index, block] of blocks.entries()) {
  const currentLength = entry.thinkingLengths[index] ?? 0;
  if (currentLength < block.content.length) {
    entry.thinkingLengths[index] = Math.min(
      findNextWordEnd(block.content, currentLength),
      block.content.length
    );
    advanced = true;
  }
}
```

**Fixed code:**

```typescript
let advanced = false;

// Single ordered frontier: only one thing advances per tick.
// thinking₁ → content₁ → thinking₂ → content₂ → ...
const { activeThinkingIndex, contentCeiling } = getRevealFrontier(message, blocks, entry);

// Advance the one eligible thinking block (if any)
if (activeThinkingIndex !== -1) {
  const block = blocks[activeThinkingIndex];
  const currentLength = entry.thinkingLengths[activeThinkingIndex] ?? 0;
  if (block !== undefined && currentLength < block.content.length) {
    entry.thinkingLengths[activeThinkingIndex] = Math.min(
      findNextWordEnd(block.content, currentLength),
      block.content.length
    );
    advanced = true;
  }
}

// Advance content up to the frontier ceiling
if (entry.contentLength < contentCeiling) {
  entry.contentLength = Math.min(
    findNextWordEnd(message.content, entry.contentLength),
    contentCeiling
  );
  advanced = true;
}
```

### Part 3: Output mapping — filter unrevealed blocks (lines 267-304)

`buildUnifiedSegments` renders any non-empty thinking block, and `ThinkingBox` always shows at least a header. Blocks held at `""` by the frontier must not appear in the output.

**Current output mapping (lines 274-303):**

```typescript
const thinkingBlocks = getThinkingBlocks(message);
const rawRevealedBlocks = thinkingBlocks.map((block, index) => ({
  ...block,
  content: block.content.slice(0, entry.thinkingLengths[index] ?? block.content.length),
}));
const revealedBlocks = reuseThinkingBlocks(
  prevThinkingRef.current.get(message.id),
  rawRevealedBlocks
);
prevThinkingRef.current.set(message.id, revealedBlocks);
const revealedThinking =
  message.thinking !== undefined || revealedBlocks.length > 0
    ? revealedBlocks.map((block) => block.content).join('\n\n')
    : message.thinking;
// ... contentLength, displayedContent ...
const thinkingLag = revealedBlocks.some(
  (block, index) => block.content.length < (thinkingBlocks[index]?.content.length ?? 0)
);
```

**Fixed output mapping:**

```typescript
const thinkingBlocks = getThinkingBlocks(message);
const rawRevealedBlocks = thinkingBlocks.map((block, index) => ({
  ...block,
  content: block.content.slice(0, entry.thinkingLengths[index] ?? block.content.length),
}));

// Compute lag against ALL blocks (including unrevealed) before filtering
const thinkingLag = rawRevealedBlocks.some(
  (block, index) => block.content.length < (thinkingBlocks[index]?.content.length ?? 0)
);

// Filter unrevealed blocks from consumer output — prevents empty ThinkingBox
// headers appearing before the frontier reaches their content boundary.
// Index alignment with thinkingBlocks[] is NOT required by consumers:
// buildUnifiedSegments uses contentOffset from the block object, not array index.
const visibleRevealedBlocks = rawRevealedBlocks.filter((block) => block.content.length > 0);
const revealedBlocks = reuseThinkingBlocks(
  prevThinkingRef.current.get(message.id),
  visibleRevealedBlocks
);
prevThinkingRef.current.set(message.id, revealedBlocks);
const revealedThinking =
  message.thinking !== undefined || revealedBlocks.length > 0
    ? revealedBlocks.map((block) => block.content).join('\n\n')
    : message.thinking;
// ... rest unchanged (contentLength, displayedContent, contentLag, isStreaming) ...
```

### Why this works

- **Single ordered frontier**: Only one thinking block advances per tick. Later blocks stay at `""` until `displayedContent` reaches their `contentOffset`.
- **Phase-correct sequencing**: `thinking₁ → content₁ → thinking₂ → content₂` — exactly matches CLI behavior.
- **Unrevealed blocks hidden**: The output filters `content.length === 0` blocks so `buildUnifiedSegments` and `ThinkingBox` never see premature empty blocks. **UX trade-off**: a phase's "Thinking" header won't appear until the first word is revealed (one tick after the frontier reaches it). This is a sub-16ms delay — imperceptible. If UX ever requires an instant header, add the block with `content: ""` to the visible set when `activeThinkingIndex === index`.
- **`thinkingLag` computed before filter**: Uses all raw blocks to correctly detect that thinking is still pending (keeps `isStreaming: true` on the output).
- **Tool visibility preserved**: `MessageItem` filters tools by `displayedContent.length ≥ contentOffset` — since content advances to phase boundaries, tools between phases become visible at the right time.
- **`isThinkingActive` handles active streaming**: The last thinking block (still receiving data from backend) stays pending, keeping content capped at its offset.
- **No thinking blocks = no gate**: Frontier returns `contentCeiling = message.content.length`, content advances normally (no regression).
- **Legacy blocks without offsets**: Falls back to conservative gate-all (ceiling = 0) until that block drains.
- **Loaded messages unaffected**: `createEntry()` sets all lengths to full when not streaming.

### Walkthrough: multi-phase response

Parts: `[reasoning₁(offset=0, complete), text₁("Alpha "), reasoning₂(offset=6, active)]`

| Tick phase                                | frontier result             | thinking₁ | thinking₂     | contentCeiling | displayedContent           |
| ----------------------------------------- | --------------------------- | --------- | ------------- | -------------- | -------------------------- |
| Initial                                   | `{active: 0, ceiling: 0}`   | advancing | `""` (hidden) | 0              | `""`                       |
| thinking₁ drained                         | `{active: -1, ceiling: 6}`  | done      | `""` (hidden) | 6              | advancing → `"Alpha "`     |
| content reaches 6                         | `{active: 1, ceiling: 6}`   | done      | advancing     | 6              | `"Alpha "`                 |
| thinking₂ drained, isThinkingActive→false | `{active: -1, ceiling: 10}` | done      | done          | 10             | advancing → `"Alpha Beta"` |

### Walkthrough: single-phase response (common case)

Parts: `[reasoning₁(offset=0, active), text₁("Hello world")]`

| Tick phase                                | frontier result             | thinking₁ | contentCeiling | displayedContent            |
| ----------------------------------------- | --------------------------- | --------- | -------------- | --------------------------- |
| Initial                                   | `{active: 0, ceiling: 0}`   | advancing | 0              | `""`                        |
| thinking₁ drained, isThinkingActive→false | `{active: -1, ceiling: 11}` | done      | 11             | advancing → `"Hello world"` |

## Tests

**File**: `apps/agent/src/__tests__/unit/hooks/chat/use-oc-streaming-reveal.test.ts`

Add six test cases using existing `makeAssistantMessage` helper and `vi.useFakeTimers()` pattern:

1. **`holds content reveal while thinking block is active`**: Create message with thinking and content, `isThinkingActive: true`. Advance timers — verify thinking progresses but content stays at `''`. Then rerender with `isThinkingActive: false`, advance more — verify content starts.

2. **`does not block content when no thinking blocks exist`**: Create message with only content. Advance timers — verify content reveals normally (regression guard).

3. **`holds content while thinking drain is incomplete even when isThinkingActive is false`**: Create message with thinking and content, `isThinkingActive: false`. Advance timers partially — verify thinking progresses but content stays at `''`.

4. **`does not reveal later thinking block before its content boundary is reached`**: The key regression test. Create message with two thinking blocks at different offsets. While `displayedContent.length < offset₂`, assert `thinkingBlocks[1]` is either absent or has `content === ''`.

   ```typescript
   it('does not reveal later thinking block before its content boundary is reached', () => {
     const { result } = renderHook(() =>
       useOcStreamingReveal([
         makeAssistantMessage({
           content: 'Alpha Beta',
           thinkingBlocks: [
             { content: 'phase one', durationMs: 0, contentOffset: 0, ordinal: 0 },
             {
               content: 'phase two much longer than one',
               durationMs: 0,
               contentOffset: 6,
               ordinal: 2,
             },
           ],
           isThinkingActive: false,
         }),
       ])
     );

     // Advance enough for first block to drain and content to start,
     // but not enough for content to reach offset 6
     act(() => {
       vi.advanceTimersByTime(120);
     });

     const displayed = result.current[0]?.displayedContent ?? '';
     expect(displayed.length).toBeLessThan(6);

     // Later thinking block must not appear yet
     const blocks = result.current[0]?.thinkingBlocks ?? [];
     const block2 = blocks.find((b) => b.contentOffset === 6);
     expect(block2).toBeUndefined();
   });
   ```

5. **`reveals later thinking block after content reaches its boundary`**: Continuation of test 4. Advance timers further until `displayedContent` reaches offset 6, then verify the second thinking block starts appearing.

   ```typescript
   it('reveals later thinking block after content reaches its boundary', () => {
     const { result } = renderHook(() =>
       useOcStreamingReveal([
         makeAssistantMessage({
           content: 'Alpha Beta',
           thinkingBlocks: [
             { content: 'short', durationMs: 0, contentOffset: 0, ordinal: 0 },
             { content: 'phase two text', durationMs: 0, contentOffset: 6, ordinal: 2 },
           ],
           isThinkingActive: false,
         }),
       ])
     );

     // Advance enough for thinking₁ to drain and content to reach offset 6
     act(() => {
       vi.advanceTimersByTime(500);
     });

     const displayed = result.current[0]?.displayedContent ?? '';
     expect(displayed.length).toBeGreaterThanOrEqual(6);

     // Second thinking block should now be revealing
     const blocks = result.current[0]?.thinkingBlocks ?? [];
     const block2 = blocks.find((b) => b.contentOffset === 6);
     expect(block2).toBeDefined();
     expect(block2?.content.length).toBeGreaterThan(0);
   });
   ```

6. **`legacy blocks without contentOffset fall back to gate-all`**: Create message with thinking blocks that have no `contentOffset`. Verify content stays at `''` until all thinking drains.

### Additional coverage (existing tests — must still pass)

- `build-unified-segments.test.ts`: "interleaves text-only multi-phase thinking without tools"
- `use-oc-chat-adapter.test.ts`: offset and ordinal assignment
- `chat-actions-thinking-persistence.test.ts`: multi-phase thinkingBlocks with offsets survive persistence
- `use-oc-chat-streaming.test.ts`: reasoning and text deltas in same turn

## Verification

```bash
# Run the specific test file
bun run test -- apps/agent/src/__tests__/unit/hooks/chat/use-oc-streaming-reveal.test.ts

# Run multi-phase segment tests (must still pass)
bun run test -- apps/agent/src/__tests__/unit/components/chat/messages/build-unified-segments.test.ts

# Full quality check
bun run check

# Manual: bunx tauri dev → send message with thinking model:
# 1. Single-phase: thinking streams first, then content (primary fix)
# 2. Multi-phase: confirm text₁ appears after thinking₁, thinking₂ box
#    doesn't appear until content reaches its boundary
# 3. Multi-phase with tools: confirm tools between phases appear at the
#    right time (when displayedContent reaches their contentOffset)
```

## Edge Cases

| Case                                                                          | Behavior                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No thinking blocks                                                            | Frontier returns `{-1, content.length}` → no gate (regression-safe)                                                                                                                                                                                                                        |
| Legacy blocks (no `contentOffset`)                                            | `{activeThinkingIndex: index, contentCeiling: 0}` → gate-all until that block drains                                                                                                                                                                                                       |
| Mixed legacy + modern blocks                                                  | First pending block decides: if legacy, gate-all; if modern, offset-aware                                                                                                                                                                                                                  |
| Tool at same `contentOffset` as thinking block                                | Tool visible when `displayedContent` reaches offset. Content advances to offset after prior thinking drains.                                                                                                                                                                               |
| Reasoning + text deltas in same batch                                         | `adaptParts()` processes sequentially, offsets correct. Frontier catches up on next tick.                                                                                                                                                                                                  |
| Rewind/stop during partial drain                                              | Timer cleanup in `useEffect` cancels tick. Re-mount creates fresh entries at full length.                                                                                                                                                                                                  |
| Empty thinking block (`content: ""`)                                          | `revealed(0) < 0` is false → not pending → frontier skips it. Filtered from output, so visible blocks are always a contiguous leading prefix of the full array. `buildUnifiedSegments` positions by `contentOffset` from each block object, not array index, so the reduced array is safe. |
| `isThinkingActive` stuck true (backend bug)                                   | Last block stays pending → content capped at its offset. User can stop agent.                                                                                                                                                                                                              |
| Later block + tool share same boundary                                        | Both gated until prior phase drains. Tool becomes visible when content reaches offset.                                                                                                                                                                                                     |
| Backend already sent `[thinking₁, text₁, thinking₂]` before reveal catches up | Frontier starts at thinking₁. Later blocks stay hidden. Reveal progresses phase by phase.                                                                                                                                                                                                  |

## Audit Trail

**Audit 1 — deep audit (2026-03-16):** Approved gate-all approach. Flagged multi-phase as "recommended improvement."

**Audit 2 — review board (2026-03-16):** NEEDS REWORK. Critical: gate-all boolean regresses the `contentOffset`-based interleaving contract in `adaptParts()`, `buildUnifiedSegments()`, and `MessageItem` tool visibility filter.

**Audit 3 — review board (2026-03-16):** NEEDS REWORK. Critical: content-ceiling-only approach still advances all thinking blocks in parallel. `buildUnifiedSegments` renders any non-empty offset-marked block (`message-utils.ts:197-204`), and `ThinkingBox` always renders a header — so later blocks appear before their content boundary. Tests didn't catch this because they only asserted content position, not thinking-block visibility.

**Audit 4 — review board (2026-03-16):** APPROVE WITH CHANGES. 0 critical. Three edge case notes: (1) filtering delays "Thinking" header by one tick — acceptable, documented escape hatch; (2) empty blocks filtered from output need explicit safety argument — added to edge case table; (3) prose conflict between one-frontier-per-tick and same-tick handoff — corrected in design properties.

**Resolution:** Replaced per-tick-all-blocks + content-ceiling with single ordered frontier (`getRevealFrontier`). Only one thinking block advances per tick; later blocks stay at `""`. Output filters unrevealed blocks before passing to consumers. Tests expanded to 6 cases including the critical "later block stays hidden until boundary" assertion.

**Verified correct (carried from audits 1-3):**

- Line numbers 207-226 match actual source ✅
- `isThinkingActive` set by `adaptParts()` at `use-oc-chat-adapter.ts:244` ✅
- `createEntry()` sets full lengths for non-streaming messages ✅
- `needsReveal()` + `shouldContinue` keep timer alive while content/thinking is pending — no change needed ✅
- All 3 existing tests unaffected (no multi-phase fixtures) ✅
- Output `isThinkingActive` flag (line 301) stays `true` during thinking drain via `thinkingLag` — `thinkingLag` now computed before filter ✅
- `ThinkingBlock.contentOffset` is `number | undefined` (types.ts:11) ✅
- `buildUnifiedSegments` pushes thinking segment unconditionally at line 197-204 — output filter required ✅
- `ThinkingBox` always renders header even with empty content — confirms need for output filter ✅
- `buildUnifiedSegments` test validates `[thinking, content, thinking, content]` interleaving ✅
- `MessageItem` tool visibility depends on `displayedContent.length` at line 328 ✅
- Frontier `activeThinkingIndex` and `contentCeiling` are mutually exclusive in practice (verified by tracing all return paths) ✅

**Key design properties:**

1. The frontier scan matches `adaptParts()` emission order (first-to-last), so the earliest pending block always wins.
2. Frontier returns are mutually exclusive: when a thinking block is active, `contentCeiling` equals its offset and content is already at that offset (can't advance). When no block is active, content advances toward the next boundary.
3. **Phase handoff timing**: When a thinking block finishes draining, the frontier shifts on the NEXT tick (one `TICK_MS`=16ms later). The tick that finishes the block still uses the old frontier result computed at the top of that tick. The next tick recomputes the frontier, sees the block is done, and starts advancing content. This 16ms gap is imperceptible. (The earlier audit trail's "zero extra delay / same tick" claim was imprecise — it described the ceiling-only approach where the frontier was recomputed mid-tick. The ordered-frontier computes once at tick start.)
