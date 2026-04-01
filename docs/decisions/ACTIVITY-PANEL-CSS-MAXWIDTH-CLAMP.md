# Decision: CSS max-width Clamp for Activity Panel Overflow

**Date:** 2026-04-01
**Status:** Implemented
**Branch:** `v0.0.9`

---

## Problem

When the activity panel is open at a large width and the sidebar opens, the sidebar takes ~256px, reducing the cards row width. The activity panel's stored width (`reviewPanelWidth`) is never re-clamped, so the total exceeds the viewport — pushing the activity panel off the right edge.

### Why the obvious fixes didn't work

**Attempt 1: ResizeObserver → state → clamp (useEffect)**

A `ResizeObserver` on the cards row tracked width changes and clamped `reviewPanelWidth` via Zustand. The observer fires during the sidebar's 200ms `margin-left` CSS transition, reporting intermediate animated widths. The clamp chases the animation frame-by-frame in 5 cascading steps (841 → 761 → 665 → 608 → 588 → 585). Between each step, the activity panel overflows for one frame, creating a visible "snap-back" stutter.

**Attempt 2: useLayoutEffect + getBoundingClientRect() (predictive clamp)**

Read the post-transition row width from `getBoundingClientRect()` in `useLayoutEffect` (before paint) and clamp in one shot. In WKWebView, `getBoundingClientRect()` returns the **pre-transition** width (1245 instead of 989) because the CSS transition hasn't started yet at `useLayoutEffect` time. The clamp sees no overflow and does nothing.

**Attempt 3: useLayoutEffect + state-derived prediction**

Track the previous sidebar effective space in a ref, compute the delta, and predict the post-transition width from `cardsRowWidth` state. The `cardsRowWidth` state was 0 (ResizeObserver hadn't initialized it yet — HMR artifact). Even when working, the width change was instant (no transition), causing a visual snap instead of a smooth slide.

**Attempt 4: useLayoutEffect + ref + width CSS transition**

Add `width` to the activity panel's CSS transition property so the clamp animates. The forced reflow from `getBoundingClientRect()` in `useLayoutEffect` disrupted WKWebView's CSS transition detection — the browser didn't recognize the width change as something to animate.

## What Changed

### One CSS property: `maxWidth` on the activity wrapper (`App.tsx`)

```typescript
const activityWrapperStyle = useMemo(
  (): CSSProperties => ({
    width: reviewPanelWidth,
    maxWidth: `calc(100% - ${String(CHAT_PANEL.MIN_WIDTH + CONTENT_CARD.gap)}px)`,
    marginRight: activityOpen ? 0 : -reviewPanelWidth,
    flexShrink: 0,
    transition: ACTIVITY_TRANSITION, // margin-right only
  }),
  [activityOpen, reviewPanelWidth]
);
```

`calc(100%)` resolves to the cards row content width. As the sidebar's `margin-left` transition shrinks the cards row frame-by-frame, the browser recomputes `max-width` on every frame. The activity panel's visual width is `min(reviewPanelWidth, maxWidth)` — enforced natively by the layout engine with zero JavaScript.

### Store preserves user intent

The JS clamp no longer writes to `setReviewPanelWidth` during normal operation. The store keeps the user's preferred width (e.g., 841). CSS `max-width` enforces the visual constraint (e.g., 585 when sidebar is open). When the sidebar closes, `max-width` grows back to 841+, and the panel automatically restores to its full stored width.

### JS fallback for impossible layouts only

The observer-based clamp remains as a fallback for extreme viewports where even the activity panel minimum (300px) + chat minimum (400px) can't fit. It triggers the `enforceImpossibleLayoutFallback` cascade: collapse left sidebar → close right sidebar → close review panel.

## Why Not JavaScript Clamping

| Approach                     | Problem                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------- |
| ResizeObserver + state       | Cascading 5-step clamp chases CSS transition, visible overflow between steps |
| useLayoutEffect + DOM read   | WKWebView returns pre-transition width; forced reflow disrupts transitions   |
| Predictive state calculation | Requires synchronized state updates; width change is instant (no animation)  |
| Width CSS transition + JS    | Forced reflow in useLayoutEffect kills transition detection in WKWebView     |

All JavaScript approaches fight the browser's layout engine. CSS `max-width` with `calc(100%)` works WITH it — the browser enforces the constraint on every frame of every transition, natively.

## Architecture

```
Cards Row (flex, row direction)
├── Content Column (flex: 1, minWidth: 400px)
│   └── Browser handles: shrinks to fill remaining space, floor at 400px
└── Activity Wrapper (width: stored, maxWidth: calc(100% - 404px), flexShrink: 0)
    └── Browser handles: caps at available space, restores when space returns
```

Both columns use CSS-level constraints. The browser's flex algorithm resolves conflicts every frame. No JavaScript intermediary.

## Design Principles Applied

| Principle                           | Source                | Application                                                                          |
| ----------------------------------- | --------------------- | ------------------------------------------------------------------------------------ |
| Declarative over imperative         | CSS best practices    | `max-width` expresses the constraint; the browser enforces it                        |
| Don't fight the platform            | WKWebView constraints | Forced reflows disrupt transitions; let CSS handle frame-by-frame layout             |
| Store user intent, enforce visually | State management      | Store keeps preferred width; CSS caps visual width; auto-restores when space returns |
| Same pattern as sibling             | Consistency           | Content column uses `minWidth`, activity uses `maxWidth` — symmetric CSS constraints |

## Files Modified

| File                     | Change                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/App.tsx` | Added `maxWidth: calc(100% - 404px)` to `activityWrapperStyle`; simplified observer clamp to impossible-layout-only fallback |
