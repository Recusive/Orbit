# Plan: Turn Anchor Top Scroll Behavior

## Context

When a user sends a message and the assistant starts streaming, the user's message quickly scrolls off the top of the viewport as `useStickToBottom` chases the growing response. This is disorienting — the user loses sight of what they asked.

The **turn anchor top** pattern (used by Claude.com, ChatGPT, assistant-ui) solves this by dynamically setting `minHeight` on the last assistant message so the user message stays pinned near the top of the viewport. As the response grows and its natural height exceeds `minHeight`, the property becomes inert and normal auto-scroll takes over.

This is a **layout concern**, not a scroll concern. It composes cleanly with the existing `useStickToBottom` (scroll) + `useSmoothScroll` (wheel damping) system.

## Files to Create

### 1. `apps/agent/src/hooks/ui/use-turn-anchor-top.ts` — New hook

Core logic. Tracks viewport height and user message height, applies `minHeight` to the last assistant message via direct DOM manipulation.

**API:**

```ts
interface UseTurnAnchorTopOptions {
  /** scrollRef from useStickToBottom — internal to ChatMessages */
  scrollRef: React.RefObject<HTMLElement | null>;
  /** Whether the anchor behavior is active (isAgentRunning) */
  enabled: boolean;
  /** isAtBottom from useStickToBottom — gates recalculation */
  isAtBottom: boolean;
  /** Current session ID — resets anchor on change */
  sessionId: string | undefined;
  /** Last user message ID — triggers element re-query */
  lastUserMsgId: string | null;
  /** Last assistant message ID — triggers element re-query */
  lastAssistantMsgId: string | null;
}

function useTurnAnchorTop(options: UseTurnAnchorTopOptions): void;
```

**Algorithm:**

1. Cache element references in refs, re-queried only when message IDs change (not on every observer callback)
2. When `enabled` becomes `true`:
   - Read `scrollRef.current.clientHeight` for viewport height
   - Attach ResizeObserver on last user message element → track `userMsgHeight`
   - Attach window `resize` listener → re-read `scrollRef.current.clientHeight`
3. On each observation, schedule `recalculate()` via `requestAnimationFrame` (RAF coalescing):
   ```
   viewportH  = scrollRef.current.clientHeight
   effectiveUserH = userH > USER_MESSAGE_MAX_HEIGHT ? TURN_ANCHOR.userMessageHeightCap : userH
   slack = max(0, viewportH - TURN_ANCHOR.insetHeight - effectiveUserH)
   assistantEl.style.minHeight = `${slack}px`
   ```
4. Gate recalculation on `isAtBottom` — if `false`, freeze current minHeight (user is reading history)
5. When `enabled` becomes `false`, animate out using the **cached** assistant element ref (see Exit Animation below)
6. When `sessionId` changes, increment generation counter, cancel any pending exit animation, and clear minHeight immediately (no animation)

**Element discovery:** Uses `data-turn-anchor` attributes (set in chat-messages.tsx). The assistant attribute is set on the last assistant message **always** (not gated on `isAgentRunning`) so the element remains discoverable for exit animation after the agent stops. Elements are cached in refs and only re-queried when message IDs change.

```ts
// Cache element refs, re-query only when IDs change
const userElRef = useRef<HTMLElement | null>(null);
const assistantElRef = useRef<HTMLElement | null>(null);

useEffect(() => {
  if (!scrollRef.current || !lastUserMsgId) {
    userElRef.current = null;
    return;
  }
  userElRef.current = scrollRef.current.querySelector('[data-turn-anchor="user"]');
  // Attach ResizeObserver to new element...
}, [lastUserMsgId, scrollRef]);

useEffect(() => {
  if (!scrollRef.current || !lastAssistantMsgId) {
    assistantElRef.current = null;
    return;
  }
  assistantElRef.current = scrollRef.current.querySelector('[data-turn-anchor="assistant"]');
}, [lastAssistantMsgId, scrollRef]);
```

**Empty element guard:** If the target assistant element has `offsetHeight === 0` (empty `MessageItem` returned null), skip applying `minHeight`.

**RAF coalescing:** All ResizeObserver callbacks and the window `resize` listener schedule recalculation through a single `requestAnimationFrame` gate, matching the `use-container-width` / terminal panel patterns in the codebase. This coalesces rapid-fire callbacks (sidebar resize, TodoBar expand, permission modal) into one computation per frame.

```ts
const rafIdRef = useRef<number | null>(null);

function scheduleRecalc(): void {
  if (rafIdRef.current !== null) return; // already scheduled
  rafIdRef.current = requestAnimationFrame(() => {
    rafIdRef.current = null;
    recalculate();
  });
}
```

**isAtBottom gating:** The `recalculate()` function checks `isAtBottom` before applying minHeight updates. When the user scrolls away (`isAtBottom === false`), the current minHeight value is frozen — no layout shifts while the user is reading. When they scroll back to bottom, `isAtBottom` becomes `true` and `scheduleRecalc` is called via a `useLayoutEffect` dependency, resuming updates.

```ts
// In recalculate():
if (!isAtBottomRef.current) return; // freeze — user is reading history

// Keep isAtBottom in a ref for access from ResizeObserver callbacks
const isAtBottomRef = useRef(isAtBottom);
useEffect(() => {
  isAtBottomRef.current = isAtBottom;
}, [isAtBottom]);

// Resume recalculation when user scrolls back to bottom
useLayoutEffect(() => {
  if (enabled && isAtBottom) {
    scheduleRecalc();
  }
}, [enabled, isAtBottom, lastUserMsgId, lastAssistantMsgId]);
```

**Performance:**

- Direct DOM mutation for minHeight — no React state, no re-renders from ResizeObserver callbacks
- Observers only active while `enabled === true`
- Element refs cached — no `querySelector` on every frame
- RAF coalescing — at most one `recalculate()` per animation frame
- Viewport height read via `clientHeight` on demand + window `resize` listener (not a ResizeObserver on the scroll container, which would fire on every content change during streaming)

**useStickToBottom interaction:** Setting `minHeight` causes a content height change, which triggers `useStickToBottom`'s ResizeObserver on `contentRef`. The spring-based `resize: 'smooth'` mode should absorb this gracefully since the library is designed for content growth during streaming. RAF coalescing ensures `minHeight` writes are batched per frame, preventing synchronous feedback loops with the library's observer.

**Exit animation — cached element approach:**

The assistant `data-turn-anchor` attribute is always present on the last assistant message (not gated on `isAgentRunning`). However, the hook also caches the assistant element in `assistantElRef` so the exit animation is deterministic even if React reconciliation removes or changes the element between the `enabled` transition and the animation.

```ts
const generationRef = useRef(0);
const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

function clearExitTimer(): void {
  if (exitTimerRef.current !== null) {
    clearTimeout(exitTimerRef.current);
    exitTimerRef.current = null;
  }
}

// On session change, increment generation + cancel any pending exit
useEffect(() => {
  generationRef.current += 1;
  clearExitTimer();
}, [sessionId]);

function animateOut(): void {
  const el = assistantElRef.current;
  if (!el) return;

  // Respect reduced motion preference
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.style.minHeight = '';
    el.style.transition = '';
    return;
  }

  const gen = generationRef.current;
  el.style.transition = `min-height ${TURN_ANCHOR.exitAnimationMs}ms ${TURN_ANCHOR.exitEasing}`;

  // Force a reflow so the transition starts from the current minHeight
  void el.offsetHeight;
  el.style.minHeight = '0px';

  // Fallback cleanup via setTimeout (transitionend can be unreliable)
  exitTimerRef.current = setTimeout(() => {
    exitTimerRef.current = null;
    if (generationRef.current !== gen) return;
    el.style.minHeight = '';
    el.style.transition = '';
  }, TURN_ANCHOR.exitAnimationMs + 50); // small buffer
}
```

Note: Uses `setTimeout` fallback instead of `transitionend` listener for reliability. The `transitionend` event can fail to fire if the element is removed from the DOM, if the transition is interrupted, or if `minHeight` was already `0px` (no transition occurs). The `setTimeout` with a small buffer is more deterministic.

**Re-enable while exit animation is pending:** If `isAgentRunning` toggles back to `true` before the exit animation timeout clears, the hook cancels the pending exit timer via `clearExitTimer()` and immediately resumes `recalculate()` — no stale cleanup runs.

## Files to Modify

### 2. `apps/agent/src/hooks/ui/index.ts` — Export new hook

Add `export { useTurnAnchorTop } from './use-turn-anchor-top';`

### 3. `apps/agent/src/lib/utils/constants.ts` — Add TURN_ANCHOR constants

```ts
export const TURN_ANCHOR = {
  /** Max user message height used in minHeight calculation.
   *  When user message is taller than USER_MESSAGE_MAX_HEIGHT (200px in MessageItem),
   *  cap to this value to avoid near-zero slack. Represents ~4 lines of text. */
  userMessageHeightCap: 96,
  /** Inset height — matches the mt-44 bottom spacer (11rem = 176px) which
   *  accounts for the absolutely-positioned floating input overlay. */
  insetHeight: 176,
  /** Duration of the minHeight exit animation in ms.
   *  Reuses ANIMATION_DURATION.slow (300ms) from the shared timing vocabulary. */
  exitAnimationMs: 300,
  /** Easing curve for the exit animation.
   *  Matches CONTENT_CARD.transition easing for consistency. */
  exitEasing: 'cubic-bezier(0.165, 0.84, 0.44, 1)',
} as const;
```

Note: `exitAnimationMs` aligns with `ANIMATION_DURATION.slow` and `exitEasing` matches the `CONTENT_CARD.transition` curve — both already in constants.ts. Kept as named values in `TURN_ANCHOR` for co-location rather than cross-referencing, but the values are intentionally consistent.

### 4. `apps/agent/src/components/chat/chat-messages.tsx` — Main integration

**a) Add `data-turn-anchor` attributes to message wrapper divs.**

The assistant attribute is set **always** on the last assistant message (not gated on `isAgentRunning`) so it remains discoverable for exit animation:

```tsx
<div
  key={msg.id}
  className="mb-3"
  {...(msg.id === lastUserMessageId
    ? { 'data-turn-anchor': 'user' }
    : {})}
  {...(msg.id === lastAssistantMessageId
    ? { 'data-turn-anchor': 'assistant' }
    : {})}
>
```

**b) Compute `lastUserMessageId`** — skip `/compact` divider messages:

```ts
const lastUserMessageId = useMemo(() => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role === 'user' && msg.displayedContent.trim() !== '/compact') {
      return msg.id;
    }
  }
  return null;
}, [messages]);
```

**c) Destructure `isAtBottom` from `useStickToBottom`:**

```ts
const { scrollRef, contentRef, scrollToBottom, stopScroll, isAtBottom } = useStickToBottom({
  resize: 'smooth',
  initial: 'smooth',
});
```

**d) Call `useTurnAnchorTop` inside `ChatMessages`** (where `scrollRef` and `isAtBottom` are available):

```ts
useTurnAnchorTop({
  scrollRef,
  enabled: isAgentRunning,
  isAtBottom,
  sessionId,
  lastUserMsgId: lastUserMessageId,
  lastAssistantMsgId: lastAssistantMessageId,
});
```

No `insetHeight` prop threading needed — the hook uses the `TURN_ANCHOR.insetHeight` constant (176px), which matches the existing `mt-44` bottom spacer that accounts for the floating input overlay.

### 5. Bottom spacer — Keep `mt-44` as-is

The spacer protects the last message from being hidden behind the floating input. The minHeight slack is an independent concern that pushes the user message to the viewport top. They don't conflict.

### 6. No changes to `ChatContent.tsx` or `types.ts`

The inset height is a constant. No prop threading, no ResizeObserver in the parent.

## Tests to Create

### 7. `apps/agent/src/__tests__/hooks/ui/use-turn-anchor-top.test.ts` — Automated tests

Hook-level unit tests with mocked `ResizeObserver` and `requestAnimationFrame`. Tests cover the lifecycle contracts that are most fragile:

```ts
describe('useTurnAnchorTop', () => {
  // --- Anchor activation ---
  it('applies minHeight to assistant element when enabled with messages', () => {
    // Render with enabled=true, verify assistantEl.style.minHeight is set
  });

  it('does not apply minHeight when no assistant message exists', () => {
    // Render with only a user message, verify no minHeight set
  });

  it('skips anchor when assistant element has offsetHeight=0 (empty MessageItem)', () => {
    // Mock element with offsetHeight=0, verify minHeight not applied
  });

  // --- isAtBottom gating ---
  it('freezes minHeight while isAtBottom=false', () => {
    // Start with isAtBottom=true, apply minHeight
    // Set isAtBottom=false, trigger ResizeObserver
    // Assert minHeight unchanged
  });

  it('resumes recalculation when isAtBottom returns to true', () => {
    // Freeze, then set isAtBottom=true
    // Assert minHeight recalculated with new viewport dimensions
  });

  // --- Exit animation ---
  it('animates minHeight to 0 when enabled transitions false', () => {
    // Start enabled=true with minHeight applied
    // Set enabled=false
    // Assert transition style set, minHeight=0px
    // Advance timer past exitAnimationMs
    // Assert inline styles cleared
  });

  it('clears styles immediately when prefers-reduced-motion is active', () => {
    // Mock matchMedia to return reduce
    // Set enabled=false
    // Assert no transition, styles cleared immediately
  });

  it('cancels exit animation on session switch', () => {
    // Start exit animation (enabled=false)
    // Change sessionId before timer fires
    // Assert stale timer does not re-apply styles
  });

  it('cancels exit animation when re-enabled before timer fires', () => {
    // Start exit animation (enabled=false)
    // Set enabled=true before timer fires
    // Assert recalculate resumes, no stale cleanup
  });

  // --- Session switch ---
  it('clears minHeight immediately on session switch (no animation)', () => {
    // Apply minHeight, change sessionId
    // Assert minHeight cleared without transition
  });

  // --- /compact filtering ---
  it('skips /compact messages when finding last user message', () => {
    // Messages: [user "hello", user "/compact", assistant "..."]
    // Assert anchor targets "hello" message, not "/compact"
  });
});
```

Test infrastructure: Use `vi.stubGlobal('ResizeObserver', MockResizeObserver)` and `vi.spyOn(window, 'requestAnimationFrame')` per existing test patterns in the codebase.

## Edge Cases

| Scenario                                           | Behavior                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty thread                                       | No anchor elements exist. Hook is inert.                                                                                                                                                                                                                                                        |
| User message only (no response yet)                | No assistant element. Hook waits.                                                                                                                                                                                                                                                               |
| First assistant chunk arrives                      | `data-turn-anchor="assistant"` appears via `lastAssistantMsgId` change. Hook re-queries element and applies minHeight.                                                                                                                                                                          |
| Session switch                                     | Generation counter increments, exit timer cancelled, minHeight cleared immediately, observers detached.                                                                                                                                                                                         |
| Window resize                                      | Window `resize` listener fires → scheduleRecalc.                                                                                                                                                                                                                                                |
| User scrolls up during streaming                   | `isAtBottom` becomes false → recalculate is gated, minHeight frozen at current value.                                                                                                                                                                                                           |
| User scrolls back to bottom                        | `isAtBottom` becomes true → `useLayoutEffect` fires `scheduleRecalc`, minHeight updates resume.                                                                                                                                                                                                 |
| Tall user message (>200px)                         | Capped to 96px in calculation. Matches `USER_MESSAGE_MAX_HEIGHT` collapse threshold.                                                                                                                                                                                                            |
| Agent stops                                        | Exit animation runs on cached `assistantElRef.current`. minHeight animates to 0 over 300ms (skipped if `prefers-reduced-motion`), then inline styles removed.                                                                                                                                   |
| Agent stops + immediate session switch             | Generation counter invalidates the stale exit timer. Session switch clears immediately.                                                                                                                                                                                                         |
| Agent re-enabled during exit animation             | `clearExitTimer()` cancels pending cleanup. `recalculate()` resumes immediately.                                                                                                                                                                                                                |
| Multi-turn assistant (consecutive messages)        | Only the truly last assistant message gets `data-turn-anchor="assistant"`. When target switches mid-stream (tool-use turn creates new assistant message), the hook re-queries via `lastAssistantMsgId` change. Previous element's minHeight should be cleared in the re-query effect's cleanup. |
| `/compact` divider message                         | Filtered out of `lastUserMessageId` — hook uses the previous real user message instead.                                                                                                                                                                                                         |
| Empty assistant message (MessageItem returns null) | Wrapper div still has `data-turn-anchor="assistant"` but `offsetHeight === 0`. Hook skips applying minHeight.                                                                                                                                                                                   |
| Queued message bubble                              | Anchor targets the real last user message from `messages` array, not the visual queued bubble. Correct — queued message hasn't been sent yet.                                                                                                                                                   |
| `overflowAnchor: 'none'` on scroll container       | Browser won't compensate for minHeight layout shifts. `useStickToBottom` handles scroll compensation when at bottom. If user is mid-scroll, minHeight is frozen (isAtBottom gate).                                                                                                              |
| TodoBar expands/collapses mid-stream               | Inset height is a constant (176px), not dynamically measured. The mt-44 spacer already accounts for worst-case input overlay height. Minor visual inaccuracy is acceptable — the alternative (dynamic measurement + prop threading) adds complexity for marginal benefit.                       |
| Permission modal changes input height              | Same as TodoBar — constant inset absorbs the variation.                                                                                                                                                                                                                                         |

## Verification

1. `bun run typecheck` — ensure no type errors
2. `bun run lint` — ensure hook follows ESLint rules (explicit return types, no `any`)
3. `bun run test` — run automated tests for the hook
4. `bun run dev` (port 5176) — visual testing:
   - Send a message → user message should anchor near viewport top
   - Streaming response grows below it
   - Once response exceeds viewport, auto-scroll follows bottom
   - Scroll up → auto-scroll disengages, minHeight freezes
   - Scroll back down → auto-scroll re-engages, minHeight resumes
   - Session switch → clean reset, no stale animation artifacts
   - Window resize → recalculates
   - Send `/compact` → divider should not be used as anchor
   - Send a very long message → height capped, reasonable slack
   - Test with `prefers-reduced-motion: reduce` → no exit animation
   - Stop agent mid-stream → smooth minHeight transition to 0
5. `bunx tauri dev` — test in actual Tauri/WKWebView environment:
   - Verify no visible bounce from `useStickToBottom` spring reacting to minHeight changes
   - If bounce occurs, RAF coalescing should already prevent it; otherwise tighten the batch window
