# Plan: Spring Spacer for Chat Messages

## Context

When a chat starts or a new message is sent, the message bubble appears at the top of the viewport — but the current spacer is a static `mt-44` class that doesn't respond to content changes. The goal is a dynamic "spring" spacer below all chat content that:

1. **Starts fully extended** — fills the remaining viewport below the last message, so that message sits at the top of the visible area
2. **Compresses as content streams in** — AI response text pushes the spacer down in real time
3. **Rests at a minimum** once content fills or exceeds the viewport — preserving the gap above the floating input
4. **Resets on next message** — when the user sends a new message, the spring extends again

## Architecture

Extract the spacer into a dedicated `SpringSpacer` component rather than inline logic. This isolates the observer lifecycle, cleanup, and rAF coalescing — matching existing patterns like `use-layout-stabilization.ts`.

## Files to Create/Modify

| File                                                                  | Action                                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/agent/src/components/chat/SpringSpacer.tsx`                     | **Create** — dedicated spacer component                                |
| `apps/agent/src/components/chat/chat-messages.tsx`                    | **Modify** — remove static spacer, wire `SpringSpacer` via merged refs |
| `apps/agent/src/lib/utils/constants.ts`                               | **Modify** — add `CHAT_SPACING.springSpacerRestingMin` constant        |
| `apps/agent/src/lib/utils/index.ts`                                   | **Modify** — add `CHAT_SPACING` to barrel exports                      |
| `apps/agent/src/__tests__/unit/components/chat/SpringSpacer.test.tsx` | **Create** — unit tests                                                |

## Implementation

### Step 1: Add constant — `constants.ts`

Add to the layout dimensions section:

```ts
export const CHAT_SPACING = {
  /** Minimum spring spacer height under messages (px) */
  springSpacerRestingMin: 112,
} as const;
```

Export from `index.ts` barrel.

### Step 2: Create `SpringSpacer.tsx`

A self-contained component that owns:

- A `spacerRef` div (the DOM element whose height changes)
- A `useLayoutEffect` keyed on `sessionId` (resets on conversation switch)
- A single `ResizeObserver` watching three elements: scroll container, content wrapper, and `.chat-input-frost` overlay
- rAF-coalesced writes (one frame max) with epsilon threshold to skip no-op updates
- Proper cleanup: dispose flag, `cancelAnimationFrame`, observer disconnect, height reset to 0

**Algorithm:**

```
overlayHeight = measure .chat-input-frost offsetHeight
restingMin    = max(configuredMin, overlayHeight)
contentOnly   = contentEl.scrollHeight - currentSpacerHeight
spacerHeight  = max(restingMin, viewportHeight - contentOnly)
```

Key detail: `restingMin` dynamically measures the floating input overlay height instead of hardcoding 112px. This handles the expanding todo bar and variable input height.

**Props interface:**

```ts
interface SpringSpacerProps {
  readonly scrollRef: RefObject<HTMLElement | null>;
  readonly contentRef: RefObject<HTMLElement | null>;
  readonly sessionId?: string;
  readonly minimumRestingHeight: number;
}
```

### Step 3: Wire into `chat-messages.tsx`

1. Remove the existing static spacer (`mt-44` div)
2. Remove existing spacer-related refs (`spacerRef`, `spacerHeightRef`) and the `useEffect` if present
3. Add stable `RefObject` refs (`scrollElementRef`, `contentElementRef`) alongside the existing callback refs
4. Merge into existing callback refs so both `use-stick-to-bottom` and `SpringSpacer` share the same DOM nodes
5. Render `<SpringSpacer>` at the bottom of the content wrapper

```tsx
<SpringSpacer
  scrollRef={scrollElementRef}
  contentRef={contentElementRef}
  sessionId={sessionId}
  minimumRestingHeight={CHAT_SPACING.springSpacerRestingMin}
/>
```

### Step 4: Add unit tests

Test three cases:

1. **Expands to fill viewport** — content < viewport → spacer = viewport - content
2. **Clamps at minimum** — content > viewport → spacer = restingMin
3. **Cleans up on unmount** — observer disconnected, rAF cancelled, height reset to 0

Uses a `ControlledResizeObserver` mock for deterministic triggering.

## Verification

1. `bun run check` — typecheck + lint + tests pass
2. `bun test apps/agent/src/__tests__/unit/components/chat/SpringSpacer.test.tsx` — unit tests pass
3. `bun run dev` — manual validation:
   - New chat → first message at top of viewport, spacer fills below
   - AI streams → spacer compresses in real-time
   - Long response → spacer rests at minimum (above floating input)
   - Send another message → spacer resets, new message at top
   - Switch conversations → spacer resets correctly
   - Resize window → spacer adjusts
