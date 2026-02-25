# Decision: Chat Panel Minimum Width & Header Overflow Fade

**Date:** 2026-02-24
**Status:** Implemented
**Branch:** `fix/0.0.5`

---

## Problem

Four related layout issues on the content card:

1. **Chat area could be dragged to zero width** — dragging the activity panel resize handle to the left could shrink the chat content area to the point where the entire UI collapsed horizontally
2. **Minimum width varied by window size** — on large monitors, `PANEL_SIZES.review.max = 800` capped the activity panel, leaving more chat space. On small windows, the chat could shrink much further. The minimum floor should be constant
3. **Sidebar + activity + actions bar overflow on small windows** — shrinking the window could not accommodate all open panels, causing layout breakage
4. **Header project name overlapped the diff stats pill** — long workspace names pushed into the right-side controls with no graceful degradation

## Root Cause Analysis

### Why the minimum width varied

The `ResizeHandle` component computes the maximum drag width as:

```typescript
// resize-handle.tsx:82
const effectiveMax = getMax ? Math.min(constraints.max, getMax()) : constraints.max;
```

`constraints.max` came from `PANEL_SIZES.review.max = 800`. On a big monitor where the cards row is 1400px wide, `getActivityMax()` returns ~1000px, but `Math.min(800, 1000) = 800` — the static cap wins. The chat gets `1400 - 800 = 600px` minimum.

On a small window (900px), `getActivityMax()` returns ~500px, and `Math.min(800, 500) = 500` — the dynamic cap wins. The chat gets `900 - 500 = 400px` minimum.

This inconsistency meant the chat panel's floor depended on window size.

### Why the header text overflowed

The left section of the header (`project name | conversation title`) and the right section (`diff stats pill | panel toggle buttons`) are both in a `justify-between` flex container. The left section had no overflow strategy — long workspace names rendered with `whitespace-nowrap` and pushed past the right controls.

## What Changed

### 1. Dynamic Activity Panel Maximum (App.tsx)

**File:** `apps/agent/src/App.tsx`

Added `getActivityMax` callback and wired it to the activity panel's `ResizeHandle`:

```typescript
const cardsRowRef = useRef<HTMLDivElement>(null);

const getActivityMax = useCallback((): number => {
  const row = cardsRowRef.current;
  if (!row) return PANEL_SIZES.review.default;
  return row.clientWidth - CHAT_PANEL.MIN_WIDTH - CONTENT_CARD.gap;
}, []);
```

Applied CSS `min-width` on the content column:

```tsx
<div
  className="flex-1 flex flex-col min-h-0"
  style={{ minWidth: CHAT_PANEL.MIN_WIDTH }}
>
```

### 2. Removed Static Activity Cap (constants.ts)

**File:** `apps/agent/src/lib/utils/constants.ts`

```typescript
// Before: static cap was the binding constraint on large monitors
review: { default: 400, min: 300, max: 800 }

// After: getActivityMax in App.tsx is the sole constraint
review: { default: 400, min: 300, max: 9999 }
```

With `max: 9999`, the `Math.min(9999, getActivityMax())` always yields `getActivityMax()`, making the chat floor exactly `CHAT_PANEL.MIN_WIDTH` (400px) regardless of window size.

### 3. Sidebar Auto-Collapse (App.tsx)

**File:** `apps/agent/src/App.tsx`

Added a `resize` event listener that calculates total required width and collapses the sidebar if it exceeds the window:

```typescript
useEffect(() => {
  const handleResize = (): void => {
    const { leftSidebarWidth, reviewPanelOpen, reviewPanelWidth, rightSidebarOpen } =
      useUIStore.getState();
    if (leftSidebarWidth <= SIDEBAR.collapsed) return;
    let requiredWidth = leftSidebarWidth + CHAT_PANEL.MIN_WIDTH;
    if (reviewPanelOpen) requiredWidth += reviewPanelWidth + CONTENT_CARD.gap;
    if (rightSidebarOpen) requiredWidth += SIDEBAR.iconColumnWidth;
    if (window.innerWidth < requiredWidth) {
      collapseLeftSidebar();
    }
  };
  window.addEventListener('resize', handleResize);
  return (): void => {
    window.removeEventListener('resize', handleResize);
  };
}, [collapseLeftSidebar]);
```

Uses `useUIStore.getState()` for synchronous reads — no React re-renders on every resize event.

### 4. Input Controls Breakpoint (constants.ts)

**File:** `apps/agent/src/lib/utils/constants.ts`

```typescript
// Before: hid effort button too eagerly (designed for 3+ extra buttons)
export const INPUT_CONTROLS = { collapseBreakpoint: 400 } as const;

// After: only 1 extra button now, lower threshold
export const INPUT_CONTROLS = { collapseBreakpoint: 340 } as const;
```

### 5. Header Overflow Fade (content-top-bar.tsx)

**File:** `apps/agent/src/components/layout/content-top-bar.tsx`

Added a gradient overlay that appears only when text overflows. Three-layer detection:

```typescript
// ResizeObserver — catches container resizes (window resize, panel drag)
useEffect(() => {
  const el = leftSectionRef.current;
  if (!el) return;
  checkOverflow();
  const ro = new ResizeObserver(checkOverflow);
  ro.observe(el);
  return (): void => {
    ro.disconnect();
  };
}, [checkOverflow]);

// Re-check when content or sidebar state changes
useEffect(() => {
  checkOverflow();
  const timer = setTimeout(checkOverflow, 250); // post-animation settle
  return (): void => {
    clearTimeout(timer);
  };
}, [sidebarOpen, workspaceName, conversationTitle, checkOverflow]);
```

The check itself: `el.scrollWidth > el.clientWidth` on the `overflow-hidden` container.

The overlay uses a 48px gradient from transparent to `var(--chat-area)`:

```tsx
{
  isOverflowing ? (
    <div
      className="absolute right-0 top-0 bottom-0 pointer-events-none z-10"
      style={{
        width: 48,
        background: 'linear-gradient(to right, transparent, var(--chat-area))',
      }}
      aria-hidden="true"
    />
  ) : null;
}
```

## Why Not CSS `mask-image`

CSS `mask-image` with a gradient is the typical web approach for text fading. However, WKWebView (the rendering engine in Tauri on macOS) has unreliable support for `mask-image` gradients — the mask didn't render, producing a hard clip instead of a fade. The gradient overlay div approach works reliably across all Tauri platforms.

## Why Not Always-On Overlay

An always-rendered gradient overlay (no conditional logic) was attempted first. Problem: when text doesn't reach the overlay area, the gradient is still visible as a 48px fade zone at the end of the left section — visually incorrect when there's plenty of room. The `scrollWidth > clientWidth` check correctly distinguishes overflow vs. non-overflow states.

## Why Three Detection Layers

`ResizeObserver` alone misses two cases:

1. **Sidebar controls animation** — the controls container transitions `max-width` from 0→148px when the sidebar closes. This changes `scrollWidth` without changing the observed element's `clientWidth`, so ResizeObserver doesn't fire.
2. **Text content changes** — switching workspaces or conversations changes `scrollWidth` without resizing the container.

The explicit re-checks on `sidebarOpen`, `workspaceName`, and `conversationTitle` cover these cases. The 250ms delayed re-check catches the post-animation state after sidebar controls finish their transition.

## Architecture

```
Window Resize / Panel Drag
     │
     ▼
ResizeObserver on leftSectionRef
     │
     ├── scrollWidth > clientWidth → isOverflowing = true  → show gradient
     └── scrollWidth ≤ clientWidth → isOverflowing = false → hide gradient

Sidebar Toggle / Content Change
     │
     ▼
useEffect dependency change
     │
     ├── Immediate check (captures pre-animation state)
     └── 250ms delayed check (captures post-animation state)

Activity Panel Drag
     │
     ▼
getActivityMax() called once at drag start
     │
     └── returns: cardsRowWidth - CHAT_PANEL.MIN_WIDTH - CONTENT_CARD.gap
          │
          └── effectiveMax = Math.min(9999, getActivityMax()) = getActivityMax()
               │
               └── Chat panel floor is always exactly CHAT_PANEL.MIN_WIDTH (400px)

Window Too Narrow
     │
     ▼
resize event listener
     │
     ├── requiredWidth = sidebar + chatMin + activity + actionsBar
     └── window.innerWidth < requiredWidth → collapseLeftSidebar()
```

## Design Principles Applied

| Principle                      | Source                | Application                                                    |
| ------------------------------ | --------------------- | -------------------------------------------------------------- |
| No layout shift                | Emil — Core #1        | Gradient overlay is absolute-positioned, doesn't affect layout |
| Speed over delight             | Emil — Core #5        | No animation on overlay show/hide — instant toggle             |
| Only animate transform/opacity | Emil — Golden Rule    | Overlay uses opacity-like gradient, not width/height animation |
| Constant minimum across sizes  | UX consistency        | 400px floor regardless of window or monitor size               |
| Graceful degradation           | Web design guidelines | Auto-collapse sidebar before panels break                      |

## Files Modified

| File                                                   | Change                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `apps/agent/src/App.tsx`                               | `getActivityMax`, `cardsRowRef`, min-width style, auto-collapse  |
| `apps/agent/src/lib/utils/constants.ts`                | `review.max` → 9999, `collapseBreakpoint` → 340                  |
| `apps/agent/src/components/layout/content-top-bar.tsx` | Overflow fade with ResizeObserver + conditional gradient overlay |
