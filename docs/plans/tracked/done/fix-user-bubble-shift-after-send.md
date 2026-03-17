# Fix: User bubble shifts up slightly after sending

## Context

When the user sends a message, the bubble appears with a slide-up animation (`animate-message-in`). Later — when the thinking stream ends and text streaming begins, or when a tool widget appears — the user bubble replays its slide-up animation. The bubble briefly fades out and slides up again, as if "it left and came back."

## Root Cause

The CSS animation on the user bubble **replays** when WebKit performs a style recalculation triggered by sibling content changes (assistant message structure changes during thinking→text transition, tool widget rendering, etc.). The `.animate-message-in` class stays applied indefinitely, so the animation can restart at any style recalc.

## Fix (three parts)

### Part 1: Remove animation cleanup timeout

**File**: `apps/agent/src/components/chat/chat-messages.tsx`

Deleted the `animationTimeouts` ref, the 300ms timeout that removed animation classes, and the unmount cleanup effect (34 lines removed). The timeout was unnecessary — `onAnimationEnd` (Part 3) now handles cleanup.

### Part 2: Keep fill-mode as `both`

**File**: `apps/agent/src/globals.css`

Reverted `fill-mode` back to `both` (was changed to `backwards` as a failed fix attempt). With `onAnimationEnd` killing the animation immediately after first play, fill-mode no longer matters after completion. `both` ensures the `from` state is applied before animation starts (no opacity flash).

### Part 3: Kill animation after first play via `onAnimationEnd`

**File**: `apps/agent/src/components/chat/messages/MessageItem.tsx`

Added `onAnimationEnd` handler to the UserMessageBubble div that sets `animation: none` via inline style. This permanently prevents the CSS animation from replaying, regardless of any subsequent style recalculations triggered by sibling content changes.

```tsx
onAnimationEnd={(e) => {
  (e.currentTarget as HTMLElement).style.animation = 'none';
}}
```

The inline style overrides the class-based animation rule. After the first play completes:

- `animation: none` prevents any future replay
- The element returns to its natural CSS state (opacity: 1, transform: none)
- No GPU-composited layer persists (transform: none vs translateY(0))

## Verification

1. `bunx tauri dev` → send a message:
   - Bubble slides up with animation on first send ✓
   - No animation replay when thinking ends and text streaming begins ✓
   - No animation replay when tool widgets appear ✓
2. Send multiple messages — each animates once only
3. Switch sessions — animation state clears (no stale animations)
4. `bun run check` — no type/lint errors
