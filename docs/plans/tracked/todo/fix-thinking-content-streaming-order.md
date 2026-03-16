# Fix: Sequential Thinking-Before-Content Streaming

## Context

When using the OpenCode backend with thinking-capable models (Claude Opus), thinking content and regular text content stream simultaneously in the Orbit Editor. The thinking box starts showing reasoning, but before it finishes, regular text also appears outside the box. They render at the same time.

**Expected behavior** (matching CLI): Thinking streams to completion first, then content appears. Sequential, never overlapping.

**Root cause**: The `useOcStreamingReveal` hook's tick function advances both `contentLength` and `thinkingLengths[]` counters on every animation frame without sequencing. The CLI works because each part is a separate SolidJS component with a `<Show when={text.trim()}>` guard — parts naturally sequence by data arrival order.

## Change: `use-oc-streaming-reveal.ts` (single file)

**File**: `apps/agent/src/hooks/chat/use-oc-streaming-reveal.ts`
**Lines**: 207-226 (tick function)

### Current code (broken)

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

// Thinking advances in parallel — BUG
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

### Fixed code

```typescript
let advanced = false;

// 1. Advance thinking blocks first
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

// 2. Only advance content after ALL thinking blocks are fully revealed.
// Gate on two conditions:
//   a) Backend still streaming reasoning (isThinkingActive)
//   b) Reveal animation still draining thinking text
const thinkingPending =
  message.isThinkingActive === true ||
  blocks.some((block, index) => (entry.thinkingLengths[index] ?? 0) < block.content.length);

if (!thinkingPending && entry.contentLength < message.content.length) {
  entry.contentLength = Math.min(
    findNextWordEnd(message.content, entry.contentLength),
    message.content.length
  );
  advanced = true;
}
```

### Why this works

- **Thinking advances first**: Loop runs before content gate check
- **`isThinkingActive` blocks content during reasoning streaming**: Set by `adaptParts()` when last reasoning block has no `time.end`
- **Thinking drain blocks content even after backend finishes**: `blocks.some(...)` catches reveal-animation-still-catching-up
- **No thinking blocks = no gate**: `blocks.some()` returns `false`, content advances normally (no regression)
- **Loaded messages unaffected**: `createEntry()` sets all lengths to full when not streaming

## Tests

**File**: `apps/agent/src/__tests__/unit/hooks/chat/use-oc-streaming-reveal.test.ts`

Add two test cases using existing `makeAssistantMessage` helper and `vi.useFakeTimers()` pattern:

1. **`holds content reveal until thinking blocks finish`**: Create message with both thinking and content, `isThinkingActive: true`. Advance timers — verify thinking progresses but content stays at `''`. Then set `isThinkingActive: false`, advance more — verify content starts revealing.

2. **`does not block content when no thinking blocks exist`**: Create message with only content. Advance timers — verify content reveals normally (regression guard).

## Verification

```bash
# Run the specific test file
bun run test -- apps/agent/src/__tests__/unit/hooks/chat/use-oc-streaming-reveal.test.ts

# Full quality check
bun run check

# Manual: bunx tauri dev → send message with thinking model → verify thinking streams first, then content
```
