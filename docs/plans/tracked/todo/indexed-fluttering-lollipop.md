# Fix: Browser Panel Resize Flickering

## Context

When the embedded browser (native Tauri WKWebView) is active and the user drags the activity panel resize handle, the right side flickers and "fights" — the native webview and its DOM container are visibly out of sync, creating a terrible UX.

**Root cause**: Two systems compete during drag resize:

1. The DOM layout updates instantly via direct `el.style.width` manipulation at 60fps
2. The native webview repositioning goes through a multi-frame async pipeline:
   `ResizeObserver → requestAnimationFrame → getBoundingClientRect → postMessage → Tauri IPC → OS window server`

This pipeline has 2-4 frames of inherent latency, so the native webview constantly "chases" the DOM, creating visible fighting. Additionally, the activity wrapper doesn't suppress CSS transitions during drag (unlike the terminal, which uses `.drag-active`).

---

## Changes

### 1. Add `.drag-active` transition suppression to activity wrapper

**File:** `apps/agent/src/App.tsx`

Follow the existing terminal pattern:

- In `handleActivityDrag`, add `el.classList.add('drag-active')` before setting width
- Create `handleActivityDragEnd` callback that removes `.drag-active` class
- Pass `onDragEnd={handleActivityDragEnd}` to the activity ResizeHandle

The `.drag-active { transition: none !important; }` class already exists in `globals.css` (line 1649). This prevents any inherited/cascading transitions from animating during drag.

### 2. Eliminate rAF delay in browser bounds pipeline

**File:** `apps/agent/src/components/browser/browser-panel.tsx`

In the ResizeObserver `updateBounds` callback (lines 255-287), remove the `requestAnimationFrame` wrapper and execute bounds reading synchronously. ResizeObserver already fires after layout is complete, so the rAF is redundant — it only adds 1 frame (~16ms) of lag. Direct execution means bounds are sent to Tauri in the same frame as the DOM resize.

Change from:

```typescript
const updateBounds = (): void => {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    // read bounds and send
  });
};
```

To:

```typescript
const updateBounds = (): void => {
  if (!viewportRef.current) return;
  const rect = viewportRef.current.getBoundingClientRect();
  // ... compute bounds, compare, and send immediately
};
```

This eliminates the rAF variable and the associated cleanup.

**Registration:** All observer and event listener registrations must use the zero-arg `scheduleBounds` wrapper (defined in Change 3), NOT `updateBounds` directly. `ResizeObserver` passes an entries array and `addEventListener` passes an `Event` — both are truthy and would bypass the throttle via the `force` parameter:

```typescript
// Initial bounds report
const initTimeout = setTimeout(scheduleBounds, 50);

// ResizeObserver — use scheduleBounds, NOT updateBounds
const resizeObserver = new ResizeObserver(scheduleBounds);
resizeObserver.observe(viewportRef.current);

// Window events — use scheduleBounds, NOT updateBounds
window.addEventListener('resize', scheduleBounds);
window.addEventListener('scroll', scheduleBounds, true);
```

### 3. Leading+trailing throttle for Tauri IPC bounds updates

**File:** `apps/agent/src/components/browser/browser-panel.tsx`

Replace the current unthrottled `updateBounds` with a leading+trailing scheduler so bounds messages are sent at most once per ~16ms (one frame at 60fps). This reduces IPC pressure on Tauri and the macOS window server while **guaranteeing the final position is always delivered**.

> **Note (120Hz):** This codebase has ProMotion 120fps support (`docs/architecture/PROMOTION-120FPS.md`). At 120Hz, frames are 8.3ms apart. A 16ms throttle means the native webview updates at ~60fps while the DOM may run at 120fps — an acceptable trade-off since the macOS window server can't reposition native webviews faster than ~60fps anyway.

**Why leading+trailing, not drop-only:** `ResizeHandle` stops emitting after mouseup (`resize-handle.tsx:105-113`). With a drop-only throttle, if the last `ResizeObserver` callback lands inside the 16ms window, the final bounds are silently dropped — the native webview stays at stale bounds until some unrelated resize/scroll/hover event. A trailing timer guarantees that the most recent pending bounds are always flushed after the throttle window expires.

**Sash hover must bypass throttle:** The existing `handleSashEnter`/`handleSashLeave` callbacks call `updateBounds()` to push/pull the native webview for sash visual feedback. These calls must send immediately — use the `force` parameter.

```typescript
let lastBounds = { x: 0, y: 0, width: 0, height: 0 };
let lastUpdateTime = 0;
let trailingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingForced = false;
const BOUNDS_THROTTLE_MS = 16;

/** Read current viewport bounds, return null if viewport is unmounted */
const readBounds = (): typeof lastBounds | null => {
  if (!viewportRef.current) return null;
  const rect = viewportRef.current.getBoundingClientRect();
  const totalLeftInset = WEBVIEW_LEFT_INSET + sashExtraInset;
  return {
    x: Math.round(rect.x) + totalLeftInset,
    y: Math.round(rect.y),
    width: Math.round(rect.width) - totalLeftInset,
    height: Math.round(rect.height),
  };
};

/** Send bounds if changed (or forced) */
const sendBounds = (force = false): void => {
  const bounds = readBounds();
  if (!bounds) return;

  if (
    !force &&
    bounds.x === lastBounds.x &&
    bounds.y === lastBounds.y &&
    bounds.width === lastBounds.width &&
    bounds.height === lastBounds.height
  ) {
    return;
  }

  lastBounds = bounds;
  lastUpdateTime = performance.now();
  postMessage({ type: 'browser:bounds', uuid: generateUUID(), bounds });
};

/** Throttled entry point — leading send + trailing timer.
 *  IMPORTANT: Do NOT pass this function directly to ResizeObserver, addEventListener,
 *  or any API that passes arguments to its callback. Those APIs would pass an entries
 *  array or Event object as the first arg, which is truthy, causing every call to
 *  bypass the throttle via force=true. Always use the zero-arg `scheduleBounds` wrapper
 *  for observer/event registration. */
const updateBounds = (force = false): void => {
  const now = performance.now();
  const remaining = BOUNDS_THROTTLE_MS - (now - lastUpdateTime);

  // Leading edge: send immediately if throttle window has passed or forced
  if (force || remaining <= 0) {
    if (trailingTimer !== null) {
      clearTimeout(trailingTimer);
      trailingTimer = null;
    }
    pendingForced = false;
    sendBounds(force);
    return;
  }

  // Trailing edge: schedule one trailing send for the latest pending bounds
  pendingForced ||= force;
  if (trailingTimer === null) {
    trailingTimer = setTimeout(() => {
      trailingTimer = null;
      const shouldForce = pendingForced;
      pendingForced = false;
      sendBounds(shouldForce);
    }, remaining);
  }
};

/** Zero-arg wrapper — safe to pass to ResizeObserver, addEventListener, etc.
 *  These APIs pass arguments (ResizeObserverEntry[], Event) to their callbacks;
 *  this wrapper discards them so updateBounds always receives force=false. */
const scheduleBounds = (): void => {
  updateBounds();
};

// Sash handlers — bypass throttle with force=true
const handleSashEnter = (): void => {
  sashExtraInset = SASH_HOVER_INSET;
  updateBounds(true);
};
const handleSashLeave = (): void => {
  sashExtraInset = 0;
  updateBounds(true);
};
```

**Cleanup:** Cancel the trailing timer and flush final bounds if viewport is still mounted:

```typescript
return (): void => {
  if (trailingTimer !== null) {
    clearTimeout(trailingTimer);
    trailingTimer = null;
  }
  // Flush final bounds if viewport is still mounted
  if (viewportRef.current) {
    sendBounds(true);
  }
  clearTimeout(initTimeout);
  resizeObserver.disconnect();
  window.removeEventListener('resize', scheduleBounds);
  window.removeEventListener('scroll', scheduleBounds, true);
  sashCleanups.forEach((fn) => {
    fn();
  });
};
```

### 4. Cancel stale post-create repaint kick once live bounds arrive

**File:** `apps/agent/src/hooks/agent/handlers/browser-handlers.ts`

The existing `WKWEBVIEW_REPAINT_DELAY_MS` (200ms) timer in `handleBrowserCreate` (line 86-100) replays the original create-time bounds 200ms after browser creation to force a WKWebView repaint. If the user resizes the activity panel within that 200ms window, the stale repaint kick overwrites the fresher live bounds — reintroducing the same "fighting" this plan is fixing.

**Fix:** Store the repaint timer ID in a module-level variable with a shared `clearPendingRepaintTimer()` helper. Call it in **three** paths — create (to cancel any leftover timer from a previous session), bounds (to cancel once live bounds arrive), and close (to prevent a stale timer from firing into a new session after rapid close/reopen):

```typescript
// Module-level — persists across function calls
let pendingRepaintTimer: ReturnType<typeof setTimeout> | null = null;

/** Cancel any pending WKWebView repaint kick.
 *  Called from: handleBrowserCreate (clear leftover), handleBrowserBounds (live bounds arrived),
 *  handleBrowserClear (browser closing — prevent stale timer firing into next session). */
function clearPendingRepaintTimer(): void {
  if (pendingRepaintTimer !== null) {
    clearTimeout(pendingRepaintTimer);
    pendingRepaintTimer = null;
  }
}

export async function handleBrowserCreate(
  message: Extract<WebviewMessage, { type: 'browser:create' }>
): Promise<void> {
  // Cancel any leftover repaint timer from a previous browser session
  clearPendingRepaintTimer();

  // ... existing creation logic ...

  // Delayed resize to force WKWebView repaint
  pendingRepaintTimer = setTimeout(() => {
    pendingRepaintTimer = null;
    // Guard: check browser is still active with same label
    const currentState = useBrowserLifecycleStore.getState();
    if (currentState.state !== 'active') return;
    if (useBrowserStore.getState().viewId !== currentLabel) return;

    browserSetBounds(x, y, width - 1, height - 1)
      .then(() => browserSetBounds(x, y, width, height))
      .catch(() => {
        // Ignore errors — this is just to trigger repaint
      });
  }, WKWEBVIEW_REPAINT_DELAY_MS);

  // ... rest of handler ...
}

export async function handleBrowserBounds(
  message: Extract<WebviewMessage, { type: 'browser:bounds' }>
): Promise<void> {
  // Cancel stale repaint kick — live bounds are now flowing
  clearPendingRepaintTimer();

  // ... existing bounds handling ...
}

export async function handleBrowserClear(
  message: Extract<WebviewMessage, { type: 'browser:clear' }>
): Promise<void> {
  // Cancel pending repaint — browser is closing, prevent timer firing into next session
  clearPendingRepaintTimer();

  // ... existing close logic ...
}
```

```

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/agent/src/App.tsx` (~lines 807-812, 1033-1040) | Add `.drag-active` class in `handleActivityDrag`, create `handleActivityDragEnd`, pass `onDragEnd` to ResizeHandle |
| `apps/agent/src/components/browser/browser-panel.tsx` (~lines 245-353) | Remove rAF wrapper, replace with leading+trailing throttle scheduler, add guarded flush on cleanup |
| `apps/agent/src/hooks/agent/handlers/browser-handlers.ts` (~lines 38, 83-100, 217-244) | Add `clearPendingRepaintTimer()` helper, call from create/bounds/clear handlers |

---

## Edge Cases

- **Releasing resize handle inside throttle window**: The trailing timer guarantees the final bounds are delivered. The timer fires after at most 16ms, ensuring the native webview catches up.
- **Launching browser and dragging within 200ms**: `clearPendingRepaintTimer()` in `handleBrowserBounds` cancels the stale repaint kick as soon as fresh live bounds arrive. The repaint kick only runs if no live bounds were sent (user didn't resize).
- **Rapid close/reopen within 200ms**: `clearPendingRepaintTimer()` is called in all three paths — `handleBrowserCreate` (clears leftover from previous session), `handleBrowserBounds` (live bounds arrived), and `handleBrowserClear` (browser closing). This prevents browser A's stale timer from firing into browser B's session.
- **Browser closing while trailing timer is pending**: The effect cleanup cancels the trailing timer. If `handleBrowserBounds` receives a bounds message after the browser has been closed, the existing `state !== 'active'` guard in browser-handlers rejects it.
- **Browser in "starting" state during drag**: The bounds effect is gated on `isActive` (line 247), so if the user starts dragging before the browser finishes creating, the initial bounds will be stale when the effect first runs. Acceptable — the initial bounds report (50ms timeout) will correct this.
- **Simultaneous window resize + panel drag**: Both `window.resize` and `ResizeObserver` call `updateBounds`. The trailing scheduler coalesces them — only the most recent bounds are sent.
- **`.drag-active` scope on activity wrapper**: The class disables transitions on the wrapper itself (which only transitions `margin-right` for slide in/out). It does NOT suppress child transitions (`ActivityCard` owns its own `margin`/`border-radius` transition). This is acceptable — the wrapper's `margin-right` transition is the only one that can conflict with direct `width` mutation during drag.
- **Allotment CSS-module hash change**: The sash hover listeners use `[class*="allotment-module_sash"]` selector. This hash may change on allotment upgrade — verify after upgrading.

---

## Verification

1. Run `bunx tauri dev` to start the full app
2. Open the browser panel (activity tab → browser → Launch Browser)
3. Drag the resize handle left and right rapidly
4. Verify: no flickering, no "fighting", smooth resize
5. Verify: after drag ends, the native webview is precisely positioned (trailing timer delivers final bounds)
6. Verify: opening/closing the activity panel still animates smoothly (transition restored after drag)
7. Verify: hovering the allotment sash still pushes the native webview inset correctly (force bypasses throttle)
8. Verify: launching browser then immediately dragging — no stale repaint kick overwriting live bounds
9. Run `bun run check` to ensure no type/lint errors
```
