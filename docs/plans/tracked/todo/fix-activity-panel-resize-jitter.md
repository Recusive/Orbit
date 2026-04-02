# Fix: Activity Panel Right-Edge Jitter During Leftward Resize

## Context

When dragging the resize handle to the **left** (expanding the activity/browser panel), the panel's right edge rapidly oscillates — a gap flickers between the panel edge and the window corner. Dragging right (shrinking) is perfectly smooth.

**Root cause:** The activity panel drag handler sets `style.width` directly at 60fps but the element retains `transition: margin-right 200ms ...` from its React-managed inline style. In WKWebView (WebKit), having any transition property on an element causes the rendering engine to handle reflows differently during rapid direct DOM mutations, producing sub-frame layout inconsistencies that manifest as right-edge oscillation.

The terminal drag handler already solved this exact problem using the `.drag-active { transition: none !important }` CSS class. The activity drag handler is simply missing this pattern.

## Fix — Single File, 3 Edits

**File:** `apps/agent/src/App.tsx`

All infrastructure already exists:

- `.drag-active` CSS class → `globals.css:1675`
- `onDragEnd` prop on ResizeHandle → `resize-handle.tsx:45` (invoked on mouseup at line 113)
- Terminal drag pattern to follow → `App.tsx:769-796`

### Edit 1: Add `.drag-active` to `handleActivityDrag` (line 830)

```typescript
// Before
const handleActivityDrag = useCallback((width: number): void => {
  const el = activityWrapperRef.current;
  if (el) {
    el.style.width = `${String(width)}px`;
  }
}, []);

// After
// Adds .drag-active CSS class to disable transitions during drag (instant response).
// The class uses !important to override React-managed inline transition — avoids the
// reconciliation bug where React skips re-applying unchanged transition values.
const handleActivityDrag = useCallback((width: number): void => {
  const el = activityWrapperRef.current;
  if (el) {
    el.classList.add('drag-active');
    el.style.width = `${String(width)}px`;
  }
}, []);
```

### Edit 2: Add `handleActivityDragEnd` (insert after `handleActivityDrag`)

```typescript
// Remove .drag-active class after drag ends, restoring CSS transitions for
// slide-in/slide-out animations. React's inline transition style takes effect again.
const handleActivityDragEnd = useCallback((): void => {
  const el = activityWrapperRef.current;
  if (el) {
    el.classList.remove('drag-active');
  }
}, []);
```

### Edit 3: Pass `onDragEnd` to the activity ResizeHandle (line 1114)

```tsx
<ResizeHandle
  direction="vertical"
  target="review"
  borderless
  size={CONTENT_CARD.gap}
  onDrag={handleActivityDrag}
  getMax={getActivityMax}
  onDragEnd={handleActivityDragEnd} // ← add this
/>
```

## Why This Works

- `.drag-active` applies `transition: none !important`, disabling WebKit's transition infrastructure during drag
- `classList.add` is idempotent — safe to call on every frame (no-op if already present)
- On mouseup, `onDragEnd` removes the class, restoring the `margin-right` transition for open/close slide animations
- The store commit (`setReviewPanelWidth`) happens on mouseup (resize-handle.tsx:112), after which React reconciles the inline style with the committed value

## Test: Drag Lifecycle Interaction Test

**File:** `apps/agent/src/__tests__/integration/activity-panel-drag-lifecycle.test.tsx` (new)

The existing `app-activity-panel-layout.test.tsx` mocks `ResizeHandle` entirely (lines 105-107), so it cannot cover the drag class lifecycle. Add a focused interaction test using the real `ResizeHandle`:

```tsx
it('adds drag-active during drag and removes on mouseup', () => {
  render(<App />);

  const handle = screen.getByRole('separator', { name: /resize review panel/i });
  const wrapper = /* activityWrapperRef element — query by data attribute or test id */;

  // Drag left (expand activity)
  fireEvent.mouseDown(handle, { clientX: 900 });
  fireEvent.mouseMove(document, { clientX: 820 });

  expect(wrapper).toHaveClass('drag-active');
  expect(wrapper.style.width).toBe('480px'); // 400 start + 80 delta

  fireEvent.mouseUp(document);

  expect(wrapper).not.toHaveClass('drag-active');
  // Store committed on mouseup
  expect(useUIStore.getState().reviewPanelWidth).toBe(480);
});
```

> **Note:** The existing test suite has a Bun build failure (`@pierre/diffs/dist/worker/worker-portable.js?worker&inline` missing default export). This is a pre-existing issue unrelated to this fix. The new test file should be structured to avoid importing Pierre worker paths. If the build issue blocks test execution, verify the drag lifecycle manually and file a separate issue for the Pierre worker import.

## Not Changed (and why)

- **BrowserPanel bounds reporting** (`browser-panel.tsx:245-306`) — Already uses rAF coalescing and dirty-check. The `.drag-active` fix eliminates the reflow inconsistency that causes the oscillation. Bounds reporting is verified during manual QA (browser tab variant below), not changed.
- **`use-layout-stabilization.ts`** — Observes the chat content container, not the activity panel. No contribution to this bug.
- **`globals.css`** — `.drag-active` class already exists at line 1675.
- **`resize-handle.tsx`** — `onDragEnd` prop already exists and fires on mouseup.

## Verification

### Automated

1. `bun run check` — typecheck + lint + tests pass
2. Run the new drag lifecycle test (if Pierre worker issue is resolved)

### Manual QA — `bunx tauri dev`

**Core fix:**

1. Open a **non-browser activity tab** (e.g., source control) → drag handle leftward at various speeds → right edge must track smoothly, zero gap oscillation
2. Open the **browser tab** → repeat the same drag pattern → right edge must be equally smooth
3. Drag **rightward** (shrinking) in both tab variants → should work as before (regression)
4. After drag, confirm browser interaction still works and bounds are correct (click links, scroll)
5. Toggle the panel open/closed → the slide animation (margin-right transition) must still be smooth

**Edge cases:** 6. **Window blur mid-drag:** Start dragging, then Cmd+Tab to another app before releasing. Return and verify: (a) no stuck `drag-active` class on the wrapper, (b) panel transition still works. _If `mouseup` is missed, the class may persist until next drag — acceptable degradation, not a regression._ 7. **Panel close mid-drag:** Start dragging, then press the keyboard shortcut to close the activity panel. Verify no crash or stuck state. 8. **Reduced-motion mode:** Enable `prefers-reduced-motion: reduce` in System Preferences → verify drag works identically (`.drag-active` is a no-op since `ACTIVITY_TRANSITION` is already `undefined`; confirm no animation is accidentally reintroduced).
