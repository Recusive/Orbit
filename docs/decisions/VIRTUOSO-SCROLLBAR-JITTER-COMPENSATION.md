# Decision: Three-Tier scrollTop Compensation for VirtuosoMessageList Scrollbar Jitter

**Date:** 2026-04-02
**Status:** Implemented
**Branch:** `v0.0.9`

---

## Problem

When scrolling fast through a conversation with 50+ messages and tool widgets (Bash, Read, Write, Edit — heights ranging 100-600px), the scrollbar visibly stutters: scrolling down, the thumb jumps backward briefly, then continues forward. This "jitter" is distracting and feels broken.

The jitter only occurs on the first full scroll through a conversation (when items are measured for the first time). Subsequent scrolls are smooth because item heights are cached.

---

## Root Cause Analysis

### The scrollbar ratio equation

```
scrollbar thumb position = scrollTop / (scrollHeight - clientHeight)
```

When `scrollHeight` changes but `scrollTop` stays the same, the thumb moves.

### VirtuosoMessageList has two compensation gaps

Reading the minified library source (`node_modules/@virtuoso.dev/message-list/dist/index.js`), two systems exist to handle height changes — both have blind spots for our use case:

**Gap 1 — `jump` mechanism (line 458-479):** Detects `scrollHeight` changes and compensates `scrollTop`. But only fires when at the **bottom** of the list (`scrollHeight - (scrollTop + viewportHeight) < 1`). During mid-list scrolling, `jump` is always 0.

**Gap 2 — Deviation system (line 837-838):** Uses `translateY` for immediate visual anchoring when items resize, then replaces it with a real `scrollTop` jump after a 100ms debounce. But the deviation calculation (`M = totalHeight - prevTotalHeight`) only runs when `scrollDirection === "up"` (`Lt === qt`). During downward scrolling, `M = 0` — zero compensation.

**Additionally:** The library sets `overflowAnchor: "none"` on three elements (items, list container, wrappers), explicitly disabling browser-native CSS scroll anchoring.

### The pipeline during downward scroll

```
1. User scrolls → velocity hook sets scrollTop via rAF
2. Scroll event → library updates visible range
3. New items enter overscan zone → rendered in DOM
4. ResizeObserver fires → item measured (e.g., 300px actual vs 100px estimate)
5. Library publishes new sizes → React re-renders list container
6. scrollHeight increases by delta → scrollbar ratio shifts backward
7. No compensation from either system → visible jitter
```

### Why rAF-only compensation fails

The browser frame pipeline: `rAF callbacks → style → layout → ResizeObserver → paint`

An rAF-based fix reads `scrollHeight` at step 1, but the change happens at step 4. Compensation fires **one frame late** — the browser already painted the jittered scrollbar.

### Why ResizeObserver-only compensation catches 80% but not 100%

A `ResizeObserver` on the list container fires after layout (step 4), in the same frame. But React 18 batches state updates from non-React contexts (like the library's ResizeObserver callback). The batched re-render that updates the list container's DOM sometimes processes within the same frame (80%) and sometimes defers to the next frame (20%).

---

## What Changed

### File: `apps/agent/src/hooks/ui/use-velocity-scroll.ts`

Three-tier observer system that compensates `scrollTop` at the earliest possible moment:

**Tier 1 — MutationObserver (style attribute):**
Fires as a microtask immediately after React updates the list container's `height`/`marginTop`/`paddingBottom` style. Reading `scrollHeight` inside forces synchronous layout, giving the correct value. This is the earliest possible signal — before the browser's rendering pipeline reaches paint.

```typescript
listStyleObserver = new MutationObserver(onScrollHeightChange);
listStyleObserver.observe(listEl, {
  attributes: true,
  attributeFilter: ['style'],
});
```

**Tier 2 — ResizeObserver (border-box):**
Fires after layout, catches any size changes that didn't go through React's style attribute updates (e.g., browser-computed layout changes).

```typescript
listResizeObserver = new ResizeObserver(onScrollHeightChange);
listResizeObserver.observe(listEl, { box: 'border-box' });
```

**Tier 3 — rAF tick fallback:**
The velocity loop's `tick()` also checks `scrollHeight`. Fires 1 frame late, but covers the period before the list container exists in the DOM (empty conversation, initial mount).

All three share a single `lastScrollHeight` variable. The first observer to detect a change compensates and updates the variable; subsequent observers see no delta and skip.

### Compensation formula

```
compensation = scrollTop × (delta / scrollRange)
```

Where `scrollRange = scrollHeight - clientHeight`. This maintains the exact scrollbar ratio:

```
newScrollTop / newScrollRange = oldScrollTop / oldScrollRange
```

The content shifts forward slightly (same direction as scroll), which is imperceptible during active scrolling — far less noticeable than a backward scrollbar jump.

### Graceful initialization

The list container (`[data-testid="virtuoso-list"]`) may not exist when the hook first attaches (empty conversation). A `MutationObserver` on the scroller's `childList` waits for it to appear, then sets up the tier-1 and tier-2 observers.

---

## Why Not [Alternative]

### CSS `overflow-anchor: auto`

The library explicitly sets `overflowAnchor: "none"` on items (absolute positioning) and the list container. Overriding with `!important` would conflict with the library's positioning model — items are `position: absolute` with calculated `top` offsets, not in normal document flow. Browser scroll anchoring can't determine "above" vs "below" for absolutely positioned elements.

### Custom scrollbar (hide native, render overlay)

Would hide the jitter by using a custom scrollbar with smoothed position transitions. But adds significant complexity, breaks native scrollbar behavior (trackpad acceleration, system preferences), and doesn't fix the underlying ratio mismatch — it just hides it.

### `increaseViewportBy` > 10000

Setting to 20000+ pre-renders so many items that most are measured before entering the viewport. But doubles DOM node count, which degrades performance on base MacBook hardware.

### Patching the library source

Could modify the `jump` mechanism and deviation system to fire during mid-list downward scroll. But the library is minified, licensed commercial code — patching is fragile, blocks updates, and isn't maintainable.

---

## Architecture

```
                          ┌─ Tier 1: MutationObserver (style attr)
                          │  fires: microtask after DOM mutation
                          │  timing: earliest possible
                          │
scrollHeight changes ─────┼─ Tier 2: ResizeObserver (border-box)
during active scroll      │  fires: after layout, before paint
                          │  timing: same frame (usually)
                          │
                          └─ Tier 3: rAF tick fallback
                             fires: next frame start
                             timing: 1 frame late

All three → compensateScrollHeight() → scrollTop += compensation
         → shared lastScrollHeight prevents double compensation
```

---

## Design Principles Applied

| Principle                          | Source                     | Application                                                                               |
| ---------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| Fix at the right abstraction layer | Systematic debugging       | Compensate in the scroll hook that owns scrollTop, not in the library or React components |
| Same-frame compensation            | Browser rendering pipeline | MutationObserver fires before paint; ResizeObserver fires after layout but before paint   |
| Defense in depth                   | Multiple observer tiers    | Three independent detection mechanisms with shared dedup variable                         |
| Minimal blast radius               | Single file change         | Only `use-velocity-scroll.ts` modified — no library patches, no component changes         |

---

## Files Modified

| File                                             | Change                                            |
| ------------------------------------------------ | ------------------------------------------------- |
| `apps/agent/src/hooks/ui/use-velocity-scroll.ts` | Added three-tier scrollHeight compensation system |
