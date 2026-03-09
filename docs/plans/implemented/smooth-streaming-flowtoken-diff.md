# Fix Choppy AI Response Streaming — Flowtoken Diff Replication

## Context

AI response streaming looks choppy — text appears "token by token, word by word, 1 by 1" instead of flowing smoothly. The user wants smooth streaming matching flowtoken's demo (`sep="diff"`, `0.6s`, `ease-in-out`).

**Root cause:** `rehypeFlowTokens` wraps ALL words in `<span class="flow-token">` on every Streamdown re-parse (mode="static" re-parses full markdown each render). When the markdown tree restructures mid-stream (new paragraph, code fence opens, inline formatting completes like `*italic*`), React creates **new DOM elements** for old words — CSS animation replays — old text visibly "pops in" again.

**Compounding factors:**

1. `ease-out` timing starts FAST (opacity jumps 0 to 0.6 in first 100ms) — each word "pops"
2. Dynamic duration (0.4-0.8s via `calculateFlowDuration`) is inconsistent

**Flowtoken's solution (studied from cloned repo at `/tmp/flowtoken-study/`):**
In `SplitText.tsx`, the `TokenizedText` component tracks accumulated text via `fullTextRef` (a ref). On each update, it computes the delta (`input.slice(fullTextRef.current.length)`) and only creates NEW animated spans for the delta. Old text keeps its existing spans with stable `source` keys — React never recreates their DOM, so animations never replay.

**Our replication strategy:** Assign an ordinal (`data-flow-ord`) to every word at parse time, counting ALL words in the document — including those inside SKIP_TAGS (code blocks, pre, etc.) — so ordinals remain stable when words move between visible and skipped contexts. A `useLayoutEffect` hook reads ordinals from the DOM and uses inline `style` overrides (not className changes) to suppress animation on old words before the browser paints. Ordinal state is persisted in a module-level Map (keyed by message+segment identity) so it survives component unmount/remount cycles during session switches.

### Ordinal stability scope

Ordinals are derived from the parsed HAST tree, not from a source-level token stream. This makes them stable for the vast majority of markdown restructures, but not universally.

**Supported restructure cases (ordinals are stable):**

1. Code-fence transitions — words enter/leave SKIP_TAGS, ordinal counter spans the gap
2. Inline emphasis, strong, link completion — visible words stay in the same order, just wrapped in new elements
3. Paragraph/block/list container remounts — visible-word ordering is unchanged
4. Heading level changes — same words, different wrapper

**Known limitation — late GFM reinterpretation:**
With `remarkGfm` enabled, certain syntax structures are not recognized until multiple lines arrive. Until then, syntax markers (like `|`, `[`, `]`, `x`) are exposed as visible text with their own ordinals. When the structure is recognized (table header + separator completes, task list checkbox syntax completes), those markers disappear and genuinely new visible words can inherit low ordinals that were previously consumed by the markers.

Example: `"| a"` initially parses as paragraph text with words `|` (ord 0) and `a` (ord 1). When the complete table `"| a |\n| - |\n| b |"` arrives, it parses as a `<table>` with visible words `a` (ord 0) and `b` (ord 1). Word `b` is genuinely new but inherits ordinal 1 (previously consumed by `a`). If `prevMaxOrd` was 2 from the previous render, `b` is misclassified as old.

**Why this is acceptable:** The failure mode is cosmetically benign — a new word appears **instantly** instead of fading in. This is the less-bad failure direction: words appearing instantly in structured content (tables, task lists) is barely perceptible, while the bug we're fixing (old words re-animating across the entire message) is highly visible. GFM late reinterpretation happens once per table/task-list during the specific transition render; subsequent streaming appends are classified correctly.

If full generality is required in a future iteration, ordinal generation would need to move to a source-level diff/tokenizer operating on the raw markdown text before remark parsing.

### Why NOT a stateful rehype plugin

The initial approach was to put mutable `prevWordCount` state inside a rehype plugin closure. This is incompatible with `Streamdown`'s architecture:

1. **Processor cache keyed by function name.** `Streamdown` static mode caches the unified processor via `Re.generateCacheKey()`, which hashes plugin function `.name` properties (verified in `node_modules/.bun/streamdown@2.1.0/dist/chunk-5FQGJX7Z.js`). All calls to `createStatefulFlowTokenPlugin()` return a function named `rehypeFlowTokensDiff` — same cache key — all MessageItem instances share one cached processor — mutable state leaks across messages, segments, and completed/history renders.

2. **Multi-segment messages.** `buildUnifiedSegments()` in `message-utils.ts` splits content into multiple `<Streamdown>` instances when tools/thinking blocks are interleaved. A shared mutable closure would leak word counts between segments.

3. **Render-time mutation is unsafe.** React StrictMode, interrupted renders, and aborted commits can call the parser transform without committing the result to the DOM. A high-water mark advanced during an aborted render would permanently misclassify words.

### Why NOT className changes in useLayoutEffect

A previous iteration proposed `classList.replace('flow-token', 'flow-token-stable')` in a `useLayoutEffect` hook. This creates a **React fiber desync**:

1. Streamdown produces HAST with `className: ['flow-token']` on all word spans.
2. React creates DOM elements with `class="flow-token"`.
3. Our hook mutates preserved DOM nodes to `class="flow-token-stable"`.
4. On next render, React compares new vDOM (`className: "flow-token"`) against its fiber tree (also `"flow-token"` — React's fiber tracks what IT set, not what the DOM currently has). Since they match, React skips the update — our `flow-token-stable` class persists on what should now be a `flow-token` node.
5. The hook queries only `.flow-token` nodes, misses the stuck `.flow-token-stable` nodes, and misclassifies new spans as old.

**Solution: keep className under React's control, use inline `style` overrides for visual state.** React does not set `style` on flow-token spans (Streamdown's HAST output has no `style` property), so there is zero conflict between React's reconciler and our DOM mutations.

### Why NOT position-based word counting

A previous iteration used `querySelectorAll('.flow-token').length` as a high-water mark. This breaks when words transition in and out of SKIP_TAGS contexts:

1. Render N: 50 prose words (ordinals 0-49) + partial code fence — 50 visible `.flow-token` spans. `prevCount = 50`.
2. Render N+1: code fence completes — 40 words (ordinals 10-49) move into `<pre>/<code>` (SKIP_TAGS) — only 10 visible spans remain.
3. Render N+2: 10 new prose words after code block — 20 visible spans. Hook sees `20 < prevCount (50)` — no spans classified as new — **no animation**.

**Solution: stable ordinals assigned at parse time.** The ordinal counter increments for every word in the document tree, including those inside SKIP_TAGS. Words inside SKIP_TAGS get counted but not wrapped. When prose resumes after a code block, its ordinals continue from where the counter left off (including the code block's words). The hook compares `data-flow-ord` against `prevMaxOrdinal`, not position indices.

---

## Changes

### Phase 1: Fix animation correctness (DOM re-animation)

#### 1. Add stable ordinals to `rehypeFlowTokens`

**File:** `apps/agent/src/lib/rehype-flow-tokens.ts`

Modify the existing plugin to:

- Track a global `wordIndex` counter that increments for ALL words, including inside SKIP_TAGS
- Pass an `insideSkip` flag down the tree instead of returning early for SKIP_TAGS
- Emit `data-flow-ord` on each `flow-token` span
- Still skip wrapping words inside SKIP_TAGS (they remain plain text)

```typescript
/** Rehype plugin that tokenizes text for per-word streaming animation.
 *  Each word gets a stable ordinal (data-flow-ord) that survives markdown
 *  restructures and code block transitions. Ordinals count ALL words in the
 *  document tree, including those inside SKIP_TAGS, so they remain stable
 *  when words move between visible and skipped contexts.
 *
 *  Ordinal stability scope: handles prose, emphasis, links, code fences,
 *  and list restructures. Late GFM reinterpretation (tables, task lists)
 *  can shift ordinals — see "Ordinal stability scope" in the plan. */
export function rehypeFlowTokens(): (tree: HastRoot) => void {
  return (tree: HastRoot): void => {
    let wordIndex = 0;

    function walk(node: HastRoot | HastElement, insideSkip: boolean): void {
      const enteringSkip = node.type === 'element' && SKIP_TAGS.has(node.tagName);
      const inSkip = insideSkip || enteringSkip;

      const source = node.children;
      const result: HastNode[] = [];

      for (const child of source) {
        if (isTextNode(child)) {
          const parts = child.value.split(WORD_BOUNDARY);

          for (const part of parts) {
            if (part.length === 0) continue;

            if (/^\s+$/.test(part)) {
              // Preserve whitespace as a plain text node (no span wrapper)
              result.push({ type: 'text', value: part });
            } else if (inSkip) {
              // Inside SKIP_TAG: count the word but don't wrap it
              result.push({ type: 'text', value: part });
              wordIndex++;
            } else {
              // Normal context: wrap in <span class="flow-token" data-flow-ord="N">
              result.push({
                type: 'element',
                tagName: 'span',
                properties: {
                  className: ['flow-token'],
                  'data-flow-ord': wordIndex,
                },
                children: [{ type: 'text', value: part }],
              });
              wordIndex++;
            }
          }
        } else if (isElementNode(child)) {
          walk(child, inSkip);
          result.push(child);
        } else {
          result.push(child);
        }
      }

      node.children = result;
    }

    walk(tree, false);
  };
}
```

**Key behavioral changes from the current implementation:**

- `SKIP_TAGS` children are now visited (previously returned early). This is needed to count words inside code blocks for stable ordinals.
- Each `flow-token` span gets `data-flow-ord` — a monotonically increasing integer.
- The counter is reset to 0 at the start of each `processSync()` call (fresh `wordIndex` per invocation of the inner function). This is correct — the same input always produces the same ordinals, so the plugin remains pure and Streamdown-cache-safe.

**Streamdown cache compatibility:** The function name stays `rehypeFlowTokens`. The `wordIndex` variable is local to each invocation of the transform function (not the factory). `Streamdown` caches the unified processor (which includes the factory's return value), and each `processSync()` call invokes that cached transform with a fresh `wordIndex = 0`. Same input always produces same ordinals — cache is valid.

#### 2. Add `useFlowTokenDiff` hook with persistent state

**New file:** `apps/agent/src/hooks/chat/use-flow-token-diff.ts`

This is a React-specific module, separate from the parser utility in `rehype-flow-tokens.ts`. Ordinal state is persisted in a module-level Map so it survives component unmount/remount cycles (e.g., session switches).

```typescript
import { useLayoutEffect } from 'react';

import type { RefObject } from 'react';

/**
 * Module-level ordinal state that survives component unmount/remount.
 *
 * Keyed by `persistenceKey` (typically `${messageId}:${segmentKey}`).
 * Entries are created when streaming starts and deleted when streaming ends.
 *
 * This is necessary because `chat-messages.tsx` renders only the active
 * session's messages — switching sessions unmounts all `FlowTokenSegment`
 * components. Without persistence, switching back would remount with
 * prevMaxOrd=0, re-animating the entire already-streamed message.
 */
const persistedOrdinals = new Map<string, number>();

/**
 * Post-render hook that classifies flow-token spans as new (animated) or old
 * (immediately visible). Runs in useLayoutEffect — after React commits DOM
 * mutations but before the browser paints — so old words never flash.
 *
 * Uses inline style overrides (not className changes) to avoid React fiber
 * desync. React manages `className: "flow-token"` and `data-flow-ord`;
 * this hook manages `style.animation` and `style.opacity`. The two never
 * conflict because Streamdown's HAST output has no `style` property.
 *
 * Uses stable ordinals (data-flow-ord) instead of position-based counting.
 * Ordinals survive most markdown restructures and code block transitions
 * because they count ALL words in the document tree, including SKIP_TAGS.
 * See "Ordinal stability scope" in the plan for known limitations.
 *
 * @param containerRef - Ref to the DOM element wrapping the Streamdown output
 * @param isStreaming - Whether this message segment is still streaming
 * @param persistenceKey - Stable identity for this segment (e.g., `${messageId}:${segmentKey}`)
 */
export function useFlowTokenDiff(
  containerRef: RefObject<HTMLDivElement | null>,
  isStreaming: boolean,
  persistenceKey: string
): void {
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    if (!isStreaming) {
      // Streaming ended — clean up inline style overrides so spans return to
      // pure CSS control. Delete persisted state for this segment.
      persistedOrdinals.delete(persistenceKey);
      const spans = container.querySelectorAll<HTMLSpanElement>('.flow-token');
      for (const span of spans) {
        span.style.removeProperty('animation');
        span.style.removeProperty('opacity');
      }
      return;
    }

    const spans = container.querySelectorAll<HTMLSpanElement>('.flow-token');
    const prevMaxOrd = persistedOrdinals.get(persistenceKey) ?? 0;
    let maxOrd = prevMaxOrd;

    for (const span of spans) {
      const ord = Number(span.dataset.flowOrd ?? 0);

      if (ord < prevMaxOrd) {
        // Old word — suppress CSS animation, show immediately.
        // Inline style overrides the CSS rule without touching className.
        span.style.animation = 'none';
        span.style.opacity = '1';
      }
      // New words (ord >= prevMaxOrd): leave untouched — CSS animation plays.

      // Track highest ordinal seen (+ 1 because next new word starts after this)
      if (ord >= maxOrd) {
        maxOrd = ord + 1;
      }
    }

    persistedOrdinals.set(persistenceKey, maxOrd);
  });
}
```

**Why module-level Map instead of `useRef`:**
`chat-messages.tsx` renders only the active session's messages, keyed by `msg.id` (`chat-messages.tsx:315`). Switching sessions unmounts all `MessageItem` and `FlowTokenSegment` components. Switching back remounts them with fresh React state. A `useRef` would reset to 0, causing the entire already-streamed message to re-animate.

The module-level `persistedOrdinals` Map survives unmount/remount cycles. When the user switches back to a streaming session, the hook reads the persisted `prevMaxOrd` and correctly classifies already-streamed words as old.

**Memory management:** Entries are deleted when `isStreaming` becomes `false` (streaming completes). For the edge case where a session is destroyed while still streaming, orphaned entries are just `string → number` pairs (~50 bytes each). Even 100 orphaned entries would be negligible. A periodic cleanup could be added later if needed.

**Why `useLayoutEffect` (not `useEffect`):** Must run before the browser paints. If we used `useEffect`, old words would flash their animation for one frame before being suppressed.

**Why `useLayoutEffect` without a dependency array:** We need to run on EVERY render during streaming. Each Streamdown re-parse produces new DOM nodes (even for old words when markdown restructures). The hook must reclassify all spans on every commit.

**Why `span.style.animation = 'none'` instead of canceling via WAAPI:** Setting the inline `animation` property to `none` removes the CSS animation rule's effect. This is simpler than `span.getAnimations().forEach(a => a.cancel())` and achieves the same result — the animation never plays, and the element's computed opacity falls through to the inline `style.opacity = '1'`.

**Why both `animation: 'none'` AND `opacity: '1'`:** The CSS animation uses `fill-mode: both`, which sets initial opacity to 0 (the `from` keyframe). Setting `animation: none` removes the fill-mode effect, so opacity reverts to the default (1). The explicit `opacity: '1'` is a safety net — it ensures visibility even if browser animation timing varies between `useLayoutEffect` and first composite.

**Reset semantics:**

- When `isStreaming` becomes `false`, persisted state is deleted and all inline styles are cleaned up.
- `MessageItem` is keyed by `msg.id` (`chat-messages.tsx:315`), so same-ID updates do NOT cause unmount/remount. The hook handles resets explicitly via the `isStreaming` check.
- For rewinds that reuse the same `msg.id`: `isStreaming` goes `false` (old response ends) then `true` (new response begins). The `false` transition cleans up persisted state and inline styles. On the first render of the new response, `persistedOrdinals.get(key)` returns `undefined` → `prevMaxOrd = 0` → all spans animate correctly.
- For session switches: components unmount (no cleanup effect fires during unmount since the hook has no cleanup return). On remount, `persistedOrdinals` still has the entry → `prevMaxOrd` is restored → already-streamed words are suppressed.

**Performance:** For a 1000-word message with 500 old words, the hook:

1. `querySelectorAll('.flow-token')` — native browser query, sub-millisecond
2. Map.get() — O(1) lookup
3. Loops through ~1000 spans, reads `dataset.flowOrd`, compares, sets style on ~500 — sub-millisecond
4. Map.set() — O(1) write
5. Total: well under 1ms per render, even at 60fps streaming rate

The `data-flow-ord` attribute adds ~20 bytes per span. For a 1000-word message, that's ~20KB additional DOM — negligible compared to the rest of the message markup.

#### 3. Extract `FlowTokenSegment` in MessageItem

**File:** `apps/agent/src/components/chat/messages/MessageItem.tsx`

Keep the existing module-level `REHYPE_PLUGINS` (with stateless `rehypeFlowTokens`) unchanged. The rehype plugin continues to wrap all words in `<span class="flow-token">` as before — now with `data-flow-ord` attributes. The new hook reclassifies old spans via inline styles before paint.

For each content segment rendered by the `segments.map()` loop, wrap the `<Streamdown>` in a `FlowTokenSegment` component with its own ref and hook:

```typescript
import { useFlowTokenDiff } from '@/hooks/chat/use-flow-token-diff';

// Stabilize the click handler for FlowTokenSegment memoization.
// Without useCallback, every MessageItem render creates a new function reference,
// defeating FlowTokenSegment's memo when only unrelated props (hover state) change.
const handleContentClick = useCallback(
  (e: React.MouseEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor?.href) {
      e.preventDefault();
      onOpenUrl(anchor.href);
    }
  },
  [onOpenUrl]
);

// Inside the segment rendering for type === 'content':
const FlowTokenSegment: FC<{
  readonly text: string;
  readonly isStreaming: boolean;
  readonly rehypePlugins: typeof REHYPE_PLUGINS;
  readonly onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  readonly persistenceKey: string;
}> = memo(function FlowTokenSegment({ text, isStreaming, rehypePlugins, onClick, persistenceKey }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFlowTokenDiff(containerRef, isStreaming, persistenceKey);

  return (
    <div
      ref={containerRef}
      className="chat-markdown prose prose-sm dark:prose-invert max-w-none select-text"
      onClick={onClick}
    >
      <Streamdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={rehypePlugins}
        plugins={STREAMDOWN_PLUGINS}
        components={STREAMDOWN_COMPONENTS}
        linkSafety={LINK_SAFETY_DISABLED}
        mode="static"
      >
        {text}
      </Streamdown>
    </div>
  );
});
```

Each `FlowTokenSegment` gets its own `containerRef` and `useFlowTokenDiff` hook — independent ordinal tracking per segment. No cross-segment leakage. The `persistenceKey` ties each segment to a stable identity that survives unmount/remount.

The `segments.map()` content branch changes from an inline `<div>` to:

```typescript
if (segment.type === 'content') {
  return (
    <FlowTokenSegment
      key={segment.key}
      text={segment.text}
      isStreaming={message.isStreaming === true}
      rehypePlugins={rehypePlugins}
      onClick={handleContentClick}
      persistenceKey={`${message.id}:${segment.key}`}
    />
  );
}
```

The `persistenceKey` is `${message.id}:${segment.key}` — unique per content segment within a message, and stable across remounts because both `message.id` (UUID) and `segment.key` (deterministic from `buildUnifiedSegments`) are stable identifiers.

Also remove:

- `calculateFlowDuration()` function (lines 84-93) — replaced by fixed CSS duration
- `flowDuration` const (lines 285-287)
- `style` prop with `--flow-duration` from `.message-item` div (lines 342-345)
- Keep `data-streaming` attribute — still used by CSS selector

#### 4. Update flow-token CSS

**File:** `apps/agent/src/globals.css` (~lines 1814-1836)

```css
/* ─── Flow Token: per-word streaming animation (FlowToken diff-style) ─── */
@keyframes flow-token-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Words animate ONLY inside actively-streaming messages.
   useFlowTokenDiff (useLayoutEffect) runs before paint and sets
   style.animation='none' + style.opacity='1' on old words via
   their data-flow-ord ordinals. New words keep this CSS animation.
   Replicates flowtoken's sep="diff" behavior.

   Fixed 0.6s ease-in-out matching flowtoken demo. ease-in-out's slow start
   prevents the visible "pop" that ease-out's fast initial ramp causes. With
   diff tracking preventing re-animation of old words, the slow start reads as
   smooth rather than sluggish — only genuinely NEW words fade in. */
.message-item[data-streaming='true'] .flow-token {
  animation: flow-token-in 0.6s ease-in-out both;
}
```

Changes:

- `var(--flow-duration, 0.6s)` replaced with fixed `0.6s` (matching flowtoken demo)
- `ease-out` replaced with `ease-in-out` — overrides Code Review Cycle 1 Issue #9 reasoning. With diff tracking preventing re-animation of old words, the slow `ease-in-out` start is no longer a responsiveness concern.
- Comment block rewritten to describe the new architecture
- No `.flow-token-stable` class — we use inline `style` overrides instead of class changes

Update `prefers-reduced-motion` override (~line 1985-1989):

```css
/* Flow token streaming animation */
.message-item[data-streaming='true'] .flow-token {
  animation: none;
  opacity: 1;
}
```

(Same as before — `animation: none` + `opacity: 1` is correct. The hook's inline style overrides are redundant when the CSS animation is already disabled, which is harmless.)

### Phase 2: Tune cadence (only if Phase 1 visual testing shows chunking)

#### 5. Evaluate batch cadence against current pipeline

**File:** `agent-bridge/src/agent/session/session-manager.ts` (line 963)

The production `TextEventBatcher` is already constructed with `16ms` (~1 frame at 60fps):

```typescript
this.textBatcher = new TextEventBatcher((event) => {
  // ...
}, 16);
```

The `50ms` default in `text-event-batcher.ts:57` is NOT used by the assistant streaming path. The plan's original proposal to change the default would have had no effect on production.

**Decision:** After implementing Phase 1, visually test whether the current `16ms` backend + RAF frontend pipeline produces smooth cascading fade-in. If chunking is still visible, the cadence can be tuned at the call site (line 963), not the default. If smooth, skip this change entirely.

If tuning IS needed:

- Change the `16` at `session-manager.ts:963`, not the default in `text-event-batcher.ts`
- Fix the comment at `session-manager.ts:951` to match the actual interval
- Evaluate interaction with the frontend RAF batcher in `chat-message-service.ts`
- Evaluate interaction with `drainSession()` chunking (80 chars at 16ms intervals)
- Update relevant test expectations only if the default changes

---

## Files Modified

| File                                                      | Change                                                                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/lib/rehype-flow-tokens.ts`                | Add `data-flow-ord` ordinals, visit SKIP_TAGS children for counting                                                                                                       |
| `apps/agent/src/hooks/chat/use-flow-token-diff.ts`        | **New file** — `useFlowTokenDiff` hook with module-level `persistedOrdinals` Map                                                                                          |
| `apps/agent/src/components/chat/messages/MessageItem.tsx` | Extract `FlowTokenSegment` with `persistenceKey` prop, stabilize `handleContentClick` with `useCallback`, remove `calculateFlowDuration`/`flowDuration`/`--flow-duration` |
| `apps/agent/src/globals.css`                              | Fixed `0.6s ease-in-out`, rewrite comment block, remove `--flow-duration` references                                                                                      |

## Files NOT Modified

| File                                                       | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/services/chat/chat-message-service.ts`     | RAF batcher works well — no change needed                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `apps/agent/src/components/chat/status/thinking-box.tsx`   | Has its own `tokenizeThinking()` (lines 20-31) which independently wraps words in `<span class="flow-token">` — same stateless approach. Thinking streaming has the same re-animation problem but it's simpler context (plain text, no markdown restructures) so the visual impact is minimal. Intentionally deferred to a follow-up — the same `useFlowTokenDiff` hook pattern can be applied if needed. Rollout notes should explicitly accept this inconsistency until a follow-up lands. |
| `apps/agent/src/components/chat/messages/message-utils.ts` | `buildUnifiedSegments()` creates multiple content segments — each gets its own `FlowTokenSegment` with independent ordinal tracking                                                                                                                                                                                                                                                                                                                                                          |
| `agent-bridge/src/common/batching/text-event-batcher.ts`   | Default `50ms` is not used by production path (`SessionManager` passes `16ms` explicitly). Cadence tuning deferred to Phase 2 and targets the call site, not the default.                                                                                                                                                                                                                                                                                                                    |
| `agent-bridge/src/agent/session/session-manager.ts`        | Already `16ms`. Only changed in Phase 2 if visual testing shows chunking.                                                                                                                                                                                                                                                                                                                                                                                                                    |

---

## Design Decisions

### Why ordinal-based classification

| Consideration                                        | Position-based (high-water mark)                                                                  | Ordinal-based (`data-flow-ord`)                                                                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code block transition                                | Broken — visible span count drops when words enter SKIP_TAGS, later prose is misclassified as old | Works — ordinals count ALL words (including SKIP_TAGS), so prose after a code block gets correctly higher ordinals                                                                                  |
| Markdown restructure (prose, emphasis, links, lists) | Broken — new DOM nodes for old words get new positions                                            | Works — visible-word ordering is unchanged, ordinals match                                                                                                                                          |
| GFM late reinterpretation (tables, task lists)       | Broken — same position-shift problem                                                              | Partially works — new words can inherit low ordinals from disappeared syntax markers. Failure mode is benign: new word appears instantly instead of animating. See "Ordinal stability scope" above. |
| Multi-parse stability                                | Count depends on DOM state, which varies between renders                                          | Ordinals depend only on input text, which is deterministic                                                                                                                                          |
| Overhead                                             | None (count-based)                                                                                | ~20 bytes per span for `data-flow-ord="N"` attribute                                                                                                                                                |

### Why inline `style` overrides instead of className changes

| Consideration      | className change (`classList.replace`)                                                         | Inline `style` override                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| React fiber desync | Broken — React compares vDOM against fiber, not actual DOM. Mutations invisible to reconciler. | Safe — React doesn't set `style` on flow-token spans, so no conflict. Each manages a different DOM property. |
| Cleanup            | Complex — must ensure React restores original class on next render                             | Simple — `removeProperty('animation')` and `removeProperty('opacity')` restore CSS control                   |
| Specificity        | Class change requires matching or higher specificity                                           | Inline styles always override CSS rules (highest specificity)                                                |
| Performance        | `classList.replace` — one property per element                                                 | `style.animation` + `style.opacity` — two properties per element. Negligible difference.                     |

### Why module-level state persistence instead of `useRef`

| Consideration                    | Component-local `useRef`                            | Module-level `Map`                                                                |
| -------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------- |
| Session switch (unmount/remount) | Lost — ref resets to 0, entire message re-animates  | Preserved — Map entry survives unmount, remount reads persisted value             |
| Rewind (same msg.id)             | Works — hook resets when `isStreaming` goes `false` | Works — entry deleted when `isStreaming` goes `false`, new streaming starts fresh |
| Memory                           | None beyond component lifecycle                     | ~50 bytes per active streaming segment. Cleaned up when streaming ends.           |
| Complexity                       | Simpler — one ref per hook                          | Slightly more complex — Map keyed by `messageId:segmentKey`                       |
| Testability                      | Easier to test in isolation                         | Module state requires reset between tests (or test against Map directly)          |

### Why a per-segment hook (not per-message)

`buildUnifiedSegments()` splits assistant content into multiple `<Streamdown>` instances when tools or thinking blocks are interleaved. Each `FlowTokenSegment` gets its own `useFlowTokenDiff` hook with an independent persistence key. This prevents:

- Word counts from one content segment leaking into the next
- Tool widget insertion from resetting or confusing the ordinal tracker
- The second content segment from treating all its words as "old" because the first segment already counted up to ordinal N

### Why Phase 2 is deferred

The current backend already batches at `16ms` (1 frame). The frontend RAF batcher further coalesces into 60fps renders. The perceived choppiness is primarily from DOM re-animation (Phase 1), not insufficient batching frequency. Changing cadence without first fixing the animation is measuring the wrong variable.

---

## Verification

### Phase 1 (animation correctness)

1. **Visual test:** `bunx tauri dev` — send a multi-paragraph prompt — text should stream with smooth cascading fade-in, no re-animation of old words

2. **Tree restructure test:** Ask for a response with mixed formatting (bold, italic, code spans, lists) — old words should NOT re-animate when formatting completes mid-stream

3. **Code block transition test:** Ask for a response that includes a code block in the middle of prose. Specifically verify:
   - Words before the code block remain stable (no re-animation)
   - The code block renders normally (no flow-token spans inside it)
   - Prose AFTER the code block animates correctly (new words fade in)
   - The ordinal gap (words counted but not wrapped inside the code block) does not cause misclassification

4. **Multi-segment test:** Send a prompt that triggers tool use mid-response (e.g., "read file X and explain it") — verify animation works correctly in BOTH the text segment before the tool widget AND the text segment after it. Each `FlowTokenSegment` should animate independently.

5. **Long response:** Request 1000+ word explanation — consistent smooth animation throughout. Open browser DevTools Performance tab and profile `useLayoutEffect` to ensure DOM reclassification stays under 1ms even for 500+ spans.

6. **Auto-scroll:** Verify stick-to-bottom tracks content during streaming

7. **Session switch (streaming continuity):** Start a streaming response, switch to another session, switch back before streaming finishes. Verify:
   - Already-streamed words do NOT re-animate (persisted ordinals restored from module-level Map)
   - New words arriving after switch-back animate correctly
   - No flash or glitch during either transition

8. **Old conversations:** Navigate to completed conversations — text renders normally (no animation — `data-streaming="false"` prevents CSS from firing). Verify no stale inline styles or Map entries from previous streaming sessions.

9. **Rewind same message ID:** Rewind a conversation and send a new message — verify the old response's inline styles are cleaned up (hook deletes persisted state when `isStreaming` goes `false`), and the new response's words all animate fresh.

10. **React StrictMode:** Verify no double-classification or animation glitch when StrictMode double-invokes effects. The hook is idempotent — running it twice with the same DOM produces the same result (same ordinal comparisons, same inline styles).

11. **Reduced motion:** Verify `prefers-reduced-motion` still disables animation. Words should appear instantly (CSS `animation: none; opacity: 1;`). The hook's inline style overrides are redundant in this case, which is harmless.

12. **Lint:** `bun run check` — no type errors, no lint warnings

13. **CJK content:** Test with Chinese/Japanese text — `/(\s+)/` split produces single tokens per phrase. Animation still applies but cascading overlap will be less visible. Note as known limitation.

14. **Paragraph-to-list transition:** Start a response that begins as paragraph prose, then the LLM restructures it into a list mid-stream. Old words that move from `<p>` to `<li>` should NOT re-animate (same ordinals, hook reclassifies new DOM elements via ordinal comparison before paint).

15. **GFM table transition:** Ask the LLM to generate a markdown table. During the render where the table syntax is first recognized (header + separator row completes), verify that the failure mode is benign — new table cell words may appear instantly without animation, but no old words re-animate. Subsequent rows should animate correctly.

### Phase 2 (cadence tuning — only if needed)

16. **Before/after recording:** Record screen at 120fps (ProMotion) with current `16ms` backend + RAF frontend. If chunking is visible, adjust `session-manager.ts:963` and re-record.

17. **Agent-bridge tests:** `cd agent-bridge && bun test text-event-batcher` — only update if the default parameter changes

---

## Edge Cases Addressed

### Word movement between visible and skipped contexts

When a code fence opens mid-stream, words move from visible prose into `<pre>/<code>` (SKIP_TAGS). Position-based counting would lose track of these words. Ordinal-based counting handles this because:

1. Before the code fence: words 0-9 are visible `.flow-token` spans
2. Code fence opens: words 10-49 are now inside SKIP_TAGS — counted by the rehype plugin (wordIndex increments) but not wrapped in spans
3. After the code fence: new prose words get ordinals 50+ — correctly identified as new (ord >= prevMaxOrd which was ~10)

### React preserves DOM nodes with stale inline styles

When React preserves a DOM node across renders (no markdown restructure for that specific element), our inline `style.animation = 'none'` persists. On the next render, the hook runs and re-applies the same inline style (the ordinal hasn't changed, it's still old) — idempotent, no issue.

### React creates new DOM nodes for old words (markdown restructure)

When React creates a fresh DOM element (e.g., a word moved from `<p>` to `<li>`), the new element has:

- `class="flow-token"` (from React/HAST)
- `data-flow-ord="5"` (from React/HAST)
- No inline `style` — CSS animation would normally start
- But `useLayoutEffect` fires before paint, reads ordinal 5, sees 5 < prevMaxOrd — sets `style.animation = 'none'; style.opacity = '1'` — word appears instantly, no flash

### Same msg.id reused after rewind

1. Old response: streaming ends — hook sets `isStreaming = false` — deletes Map entry and cleans up all inline styles
2. New response: streaming starts — `isStreaming = true` — React replaces DOM content — all fresh spans with new ordinals — Map has no entry for this key → `prevMaxOrd = 0` — all animate correctly

### Session switch during streaming

1. User switches away — `FlowTokenSegment` unmounts — `persistedOrdinals` Map entry preserved (no cleanup on unmount)
2. User switches back — `FlowTokenSegment` remounts — hook reads `persistedOrdinals.get(key)` → previous `prevMaxOrd` value — already-streamed words classified as old, new words animate
3. Streaming eventually completes — `isStreaming` goes `false` — Map entry deleted, inline styles cleaned up

### Session destroyed while streaming

If a session is destroyed while still streaming, the `FlowTokenSegment` unmounts without `isStreaming` going `false`, leaving an orphaned Map entry. This is a `string → number` pair (~50 bytes) — negligible. The orphan is harmless because the `persistenceKey` includes `messageId` (UUID), so it can never collide with a future segment. A periodic cleanup could be added if needed, but the leak is bounded by the number of destroyed-while-streaming sessions (rare, and each leaks only one entry per content segment).

### Multi-segment with tool interleaving

Content segments A (before tool) and B (after tool) each have their own `FlowTokenSegment` with independent hooks and unique `persistenceKey` values (`${messageId}:${segmentKeyA}` vs `${messageId}:${segmentKeyB}`). Segment A's ordinals are segment-local (starting from 0 within that Streamdown parse). Segment B's ordinals are also segment-local. No leakage.

### Completed conversations loaded from JSONL

When browsing old conversations: `message.isStreaming === false` — the `FlowTokenSegment` passes `isStreaming={false}` to the hook — hook deletes any existing Map entry and removes inline styles — no animation applied — words display at full opacity via CSS default.

### Late GFM reinterpretation (tables, task lists)

When `remark-gfm` recognizes a table or task list mid-stream, the HAST tree restructures dramatically. Syntax markers (like `|`) that were visible words with ordinals disappear, and genuinely new content words can inherit those low ordinals. The hook treats these new words as "old" (ordinal < prevMaxOrd), so they appear **instantly** without animation. This is the benign failure direction — strictly better than the status quo where ALL words re-animate on every restructure. The misclassification lasts for one render (the transition render); subsequent streaming appends are classified correctly because new words get ordinals above the current prevMaxOrd.

### CJK and low-whitespace scripts

The `/(\s+)/` word boundary regex produces whole phrases as single tokens for Chinese/Japanese text. Each phrase gets one ordinal. Animation still works (fade-in per phrase), but the cascading effect is less visible because there are fewer tokens. This is a known UX limitation, not a correctness bug.
