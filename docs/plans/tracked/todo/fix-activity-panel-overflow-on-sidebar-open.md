# Fix: Activity panel pushed off-screen when sidebar opens

## Context

When the activity panel is open at a large width and the sidebar is collapsed, everything fits. But when the user opens the sidebar, it takes ~256px, reducing available space. The activity panel width is never re-clamped, so with the chat column's `minWidth: 400px` floor, the total exceeds the viewport — pushing the activity panel off the right edge of the window.

Root cause: `reviewPanelWidth` is only clamped at drag-time (`getActivityMax` in the `ResizeHandle`). No reactive mechanism re-clamps it when `leftSidebarWidth` changes.

## Changes

### 1. Add `setReviewPanelWidth` selector in App.tsx

**File:** `apps/agent/src/App.tsx` ~line 387 (after `reviewPanelWidth` selector)

Add one line:

```typescript
const setReviewPanelWidth = useUIStore((s) => s.setReviewPanelWidth);
```

### 2. Add reactive clamp effect in App.tsx

**File:** `apps/agent/src/App.tsx` — insert after `getActivityMax` (after line 827)

New `useEffect` that fires when `leftSidebarWidth` or `activityOpen` changes. Reuses the same math as `getActivityMax`:

```typescript
// Re-clamp activity panel width when available space shrinks (sidebar opens,
// window narrows, etc.). Prevents the activity panel from pushing the chat
// column below CHAT_PANEL.MIN_WIDTH and overflowing off the right edge.
useEffect(() => {
  if (!activityOpen) return;
  const row = cardsRowRef.current;
  if (!row) return;

  const { reviewPanelWidth: currentWidth } = useUIStore.getState();
  const maxWidth = row.clientWidth - CHAT_PANEL.MIN_WIDTH - CONTENT_CARD.gap;

  if (currentWidth > maxWidth) {
    setReviewPanelWidth(Math.max(PANEL_SIZES.review.min, maxWidth));
  }
}, [leftSidebarWidth, activityOpen, setReviewPanelWidth]);
```

**Why no infinite loop:** Dependencies are `leftSidebarWidth` and `activityOpen`. `reviewPanelWidth` is read via `getState()` (not a dependency). Calling `setReviewPanelWidth` changes `reviewPanelWidth` but not `leftSidebarWidth` or `activityOpen`.

### 3. Improve `handleResize` to clamp before collapsing (secondary)

**File:** `apps/agent/src/App.tsx` lines 531-553

Before collapsing the sidebar, try shrinking the activity panel first. Graceful degradation: shrink activity → only collapse sidebar if that's insufficient.

```typescript
if (window.innerWidth < requiredWidth) {
  // Try clamping activity panel before collapsing sidebar
  if (activityPanelOpen) {
    let maxActivity =
      window.innerWidth - leftSidebarWidth - CHAT_PANEL.MIN_WIDTH - CONTENT_CARD.gap;
    if (rightSidebarOpen) maxActivity -= SIDEBAR.iconColumnWidth;
    if (maxActivity >= PANEL_SIZES.review.min && reviewPanelWidth > maxActivity) {
      useUIStore.getState().setReviewPanelWidth(maxActivity);
      return;
    }
  }
  collapseLeftSidebar();
}
```

## Files modified

| File                     | Change                                                                       |
| ------------------------ | ---------------------------------------------------------------------------- |
| `apps/agent/src/App.tsx` | Add selector (~L387), add clamp effect (~L828), improve handleResize (~L544) |

## Verification

1. Run `bun run check` — typecheck + lint + tests pass
2. Run `bunx tauri dev` to launch the app
3. **Repro test:** Open activity panel → drag it wide → close sidebar → open sidebar → activity panel should shrink to fit (not slide off-screen)
4. **Edge cases:** Drag activity to exactly min (300px) → toggle sidebar → no clamp needed, panel stays at 300px. Drag sidebar wider via handle → activity re-clamps on each width change.
5. **Window resize:** Resize window smaller while both panels open → activity shrinks first, sidebar collapses only if needed.
