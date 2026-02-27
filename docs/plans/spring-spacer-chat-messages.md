# Plan: Spring Spacer for Chat Messages

## Context

When a chat starts or a new message is sent, the message bubble appears at the top of the viewport — but as it stands the spacer logic is broken. The goal is a "spring" spacer below all chat content that:

1. **Starts fully extended** — fills the remaining viewport below the last message, so that message sits at the top of the visible area
2. **Compresses as content streams in** — AI response text pushes the spacer down in real time
3. **Rests at a minimum** once content fills or exceeds the viewport — preserving the current gap above the floating input
4. **Resets on next message** — when the user sends a new message, the spring extends again

## File to Modify

- `apps/agent/src/components/chat/chat-messages.tsx` — lines 225–261 (replace the existing spring spacer `useEffect`) and line 535 (the spacer `<div>`)

## Implementation

### Replace the existing spacer effect (lines 225–261) with a clean version:

```
SPRING_RESTING_MIN = 112px  (padding above floating input — move to constants.ts)
```

**Algorithm** (unchanged in concept, rewritten for correctness):

```
spacerHeight = max(SPRING_RESTING_MIN, viewportHeight - contentHeightWithoutSpacer)
```

Where:

- `viewportHeight` = `scrollEl.clientHeight` (the visible scroll area)
- `contentHeightWithoutSpacer` = `contentEl.scrollHeight - currentSpacerHeight`

**Observation mechanism:**

- One `ResizeObserver` on the scroll container (catches viewport resize)
- One `ResizeObserver` on the content wrapper (catches streaming, new messages, tool expand/collapse)
- Both call the same `updateSpacer()` function
- Direct DOM write (`spacerEl.style.height`) — no React state, no re-renders during streaming

**Session switch reset:**

- In the existing session-change `useEffect` (line 274), reset `spacerHeightRef.current = 0` so the spacer recalculates fresh for the new conversation

### Add constant to `apps/agent/src/lib/utils/constants.ts`

```ts
/** Minimum spring spacer height — padding above the floating chat input */
SPRING_SPACER_RESTING_MIN: 112,
```

Add this to a `CHAT` or `SCROLL` section in constants, and import it in `chat-messages.tsx` to replace the inline magic number.

### Spacer DOM element (line 535)

Keep the existing `<div ref={spacerRef} aria-hidden="true" />` — no change needed. The effect sets its height via direct DOM manipulation.

## Why the current code is conceptually right but may misbehave

The current logic is:

```ts
const contentOnly = totalHeight - spacerHeightRef.current;
const newHeight = Math.max(RESTING_MIN, viewportHeight - contentOnly);
```

This is a correct formula. The likely issue is **initialization / reset timing** — on session switch or first mount, `spacerHeightRef.current` may be stale (still holding the previous session's value), causing `contentOnly` to be wrong on the first calculation. The fix is explicitly resetting `spacerHeightRef.current = 0` on session change and on effect cleanup, and running an initial measurement synchronously via `useLayoutEffect` instead of `useEffect`.

## Changes Summary

| File                                               | Change                                                                                                                           |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/components/chat/chat-messages.tsx` | Replace spacer effect with clean version, reset spacerHeightRef on session switch, use `useLayoutEffect` for initial measurement |
| `apps/agent/src/lib/utils/constants.ts`            | Add `SPRING_SPACER_RESTING_MIN: 112` constant                                                                                    |

## Verification

1. `bun run dev` — open browser at localhost:5176
2. Start a new chat → first message should appear at top of viewport, spacer fills below
3. AI streams response → content grows, spacer compresses in real-time
4. Long response → once content exceeds viewport, spacer rests at ~112px
5. Send another message → spacer resets, new message at top
6. Switch conversations → spacer resets correctly for the new conversation
7. Resize window → spacer adjusts to new viewport height
8. `bun run check` — typecheck + lint + tests pass
