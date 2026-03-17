# Plan: Native NSWindow Animation for Browser Panel During Sidebar Toggle

## Context

The embedded browser is a native WKWebView/NSWindow that sits **on top** of the DOM. When the sidebar toggles, the CSS `margin-left` transition (200ms, `cubic-bezier(0.165, 0.84, 0.44, 1)`) smoothly shifts the content area — but the native window can't track this through async IPC. Even with the rAF drive (polling every frame and calling `browserSetBounds`), the native window lags 1-2+ frames behind, causing visible stutter/jump.

**Root cause:** IPC round-trip latency makes per-frame tracking impossible. The native window must animate independently at compositor speed.

**Solution:** Use `NSAnimationContext` + `[window.animator setFrame:display:]` to animate the native window natively. The frontend measures the FINAL post-layout bounds from the DOM, sends ONE IPC call, and lets both the CSS transition and native animation run independently at compositor speed with matching easing/duration.

## Key Design Decisions

### Bounds ownership stays in `browser-panel.tsx`

The current system has a single bounds owner in `browser-panel.tsx` that manages a ResizeObserver, a rAF drive mode, and observer suspension/reconnection. This plan adds a **third mode** (native animate) alongside the existing two — it does NOT move bounds logic into `App.tsx`.

`App.tsx` dispatches a CustomEvent (same pattern as `startBrowserBoundsDrive`). `browser-panel.tsx` handles it: suspends the observer, reads final bounds, calls `browserAnimateBounds`, then reconnects and syncs after settle.

### Target bounds are measured, not derived from delta

The sidebar toggle changes multiple layout properties simultaneously:

- `AppShell` wrapper: `margin-left` slides from `0` to `-sidebarWidth` (or back)
- `ContentCard`: left margin changes from `0` to `10px` (or back)

Deriving the animation target from `effectiveSidebarWidth - previousWidth` alone misses the ContentCard margin and would be off by 10px. Instead, we measure the browser viewport's `getBoundingClientRect()` **after React commits the new state** (in the `useLayoutEffect`), which captures the post-commit layout before the CSS transition starts painting.

### Duration comes from the CSS transition source of truth

The CSS transition is `200ms cubic-bezier(0.165, 0.84, 0.44, 1)` (from `CONTENT_CARD.transition`). The existing `BROWSER_LAYOUT_DRIVE_DURATION_MS = 220` is a rAF settle buffer, NOT the animation duration. The native animation must use `200ms` to match the CSS.

### QuartzCore must be `dlopen`'d before use

`CAMediaTimingFunction` lives in QuartzCore, which is NOT automatically linked by Tauri. The existing `promotion.rs` already handles this via `ensure_quartz_core_loaded()`. The new animation code must call this before looking up `CAMediaTimingFunction`.

### Native animation is macOS-only on the frontend

The Rust `browser_animate_bounds` command has a non-macOS fallback that snaps instantly (`set_position` + `set_size`). If the frontend sent native-animate on Windows/Linux, the CSS sidebar would transition for 200ms while the browser window jumps — visual desync. The frontend gates native animation on `IS_TAURI && isMac()` (using the existing `isMac()` helper from `@/lib/utils`). Non-macOS Tauri builds fall back to rAF drive.

### Drive cancellation must not reconnect the observer

The existing `stopDrive()` in `browser-panel.tsx` reconnects the observer and forces a sync (lines 418-419). If `handleNativeAnimate` calls `stopDrive()` then `disconnectObserver()`, the observer briefly fires and emits a stale `browser:bounds` update. A new `cancelDrive()` helper stops the rAF loop and timers WITHOUT reconnecting — the native-animate handler manages reconnection itself.

## Implementation Steps

### Step 1: Extract shared `ensure_quartz_core_loaded` helper

**File:** `crates/plugins/decorum/src/promotion.rs`

Make `ensure_quartz_core_loaded()`, `QUARTZ_CORE_PATH`, `RTLD_LAZY`, and the `dlopen` extern `pub(crate)` so `window_order.rs` can reuse them:

```rust
// promotion.rs — make these pub(crate) instead of private
pub(crate) const QUARTZ_CORE_PATH: &CStr = c"/System/Library/Frameworks/QuartzCore.framework/QuartzCore";
pub(crate) const RTLD_LAZY: i32 = 1;

extern "C" {
    pub(crate) fn dlopen(path: *const i8, mode: i32) -> *mut c_void;
}

pub(crate) fn ensure_quartz_core_loaded() {
    // ... existing code unchanged
}
```

### Step 2: Add `animate_ns_window_frame` to decorum plugin

**File:** `crates/plugins/decorum/src/window_order.rs`

Add after `set_ns_window_frame()` (~line 266). Replicates the full screen lookup and `tauri_to_ns_frame` Y-flip from `set_ns_window_frame`, plus `ensure_quartz_core_loaded` before `CAMediaTimingFunction` lookup:

```rust
/// Animate the frame (position + size) of a specific `NSWindow` using
/// `NSAnimationContext` + `window.animator`, so the animation runs at
/// compositor speed independently of IPC.
///
/// Coordinates use Tauri convention (top-left origin, logical points).
/// Easing is specified as CSS cubic-bezier control points.
///
/// **Must be called from the main thread.**
pub(crate) fn animate_ns_window_frame(
    ns_window: *mut std::ffi::c_void,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    duration_secs: f64,
    cp1x: f32,
    cp1y: f32,
    cp2x: f32,
    cp2y: f32,
) -> Result<(), String> {
    use objc2_foundation::{NSPoint, NSRect, NSSize};

    if ns_window.is_null() {
        return Err("animate_ns_window_frame called with null window".to_owned());
    }

    let window = ns_window.cast::<AnyObject>();

    // Screen lookup for Y-flip — same pattern as set_ns_window_frame
    let win_screen: *mut AnyObject = unsafe { msg_send![window, screen] };
    let screen_for_flip: *mut AnyObject = if win_screen.is_null() {
        let Some(ns_screen_class) = AnyClass::get(c"NSScreen") else {
            return Err("NSScreen class not found".to_owned());
        };
        let main_screen: *mut AnyObject = unsafe { msg_send![ns_screen_class, mainScreen] };
        if main_screen.is_null() {
            return Err("mainScreen is null".to_owned());
        }
        main_screen
    } else {
        win_screen
    };

    // Convert Tauri top-left coords to AppKit bottom-left coords
    let screen_frame: NSRect = unsafe { msg_send![screen_for_flip, frame] };
    let (ns_x, ns_y, ns_width, ns_height) = tauri_to_ns_frame(
        screen_frame.origin.y,
        screen_frame.size.height,
        x, y, width, height,
    );

    let frame = NSRect {
        origin: NSPoint { x: ns_x, y: ns_y },
        size: NSSize { width: ns_width, height: ns_height },
    };

    // Ensure QuartzCore is loaded before looking up CAMediaTimingFunction
    super::promotion::ensure_quartz_core_loaded();

    unsafe {
        let timing_cls = AnyClass::get(c"CAMediaTimingFunction")
            .ok_or("CAMediaTimingFunction class not found (QuartzCore not loaded?)")?;
        let timing_fn: *mut AnyObject = msg_send![
            timing_cls,
            functionWithControlPoints: cp1x : cp1y : cp2x : cp2y
        ];

        let ctx_cls = AnyClass::get(c"NSAnimationContext")
            .ok_or("NSAnimationContext class not found")?;
        let _: () = msg_send![ctx_cls, beginGrouping];
        let ctx: *mut AnyObject = msg_send![ctx_cls, currentContext];
        let _: () = msg_send![ctx, setDuration: duration_secs];
        let _: () = msg_send![ctx, setTimingFunction: timing_fn];
        let _: () = msg_send![ctx, setAllowsImplicitAnimation: true];

        let animator: *mut AnyObject = msg_send![window, animator];
        let _: () = msg_send![animator, setFrame: frame display: true];

        let _: () = msg_send![ctx_cls, endGrouping];
    }

    log::debug!(
        "WindowOrder: animating NSWindow frame to ({x}, {y}, {width}x{height}) over {duration_secs}s"
    );
    Ok(())
}
```

### Step 3: Add public wrapper in decorum lib.rs

**File:** `crates/plugins/decorum/src/lib.rs`

Add after `set_ns_window_frame()` wrapper (~line 323). Takes `*mut c_void` (Tauri's `ns_window()` return type), non-macOS no-op:

```rust
/// Animate the frame (position + size) of a specific `NSWindow`.
///
/// Uses `NSAnimationContext` + `window.animator` so the animation runs at
/// compositor speed. Easing is specified as CSS cubic-bezier control points.
///
/// Coordinates use Tauri convention (top-left origin, logical points).
/// On non-macOS platforms, this is a successful no-op.
///
/// **Must be called from the main thread.**
// Cannot be const: calls non-const FFI on macOS; Clippy only sees empty body on Linux.
#[allow(clippy::missing_const_for_fn)]
pub fn animate_ns_window_frame(
    ns_window: *mut std::ffi::c_void,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    duration_secs: f64,
    cp1x: f32,
    cp1y: f32,
    cp2x: f32,
    cp2y: f32,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        window_order::animate_ns_window_frame(
            ns_window, x, y, width, height, duration_secs,
            cp1x, cp1y, cp2x, cp2y,
        )?;
    }

    #[cfg(not(target_os = "macos"))]
    let _ = (ns_window, x, y, width, height, duration_secs, cp1x, cp1y, cp2x, cp2y);

    Ok(())
}
```

### Step 4: Add `browser_animate_bounds` Tauri command

**File:** `src-tauri/src/commands/browser/mod.rs`

Add after `browser_set_bounds` (~line 838). Replicates the full safety pipeline: existence check, `store_last_bounds`, hidden guard, `to_screen_coords`, `run_on_main_thread` + `sync_channel`, non-macOS fallback:

```rust
/// Animate the browser window to new bounds using native NSAnimationContext.
///
/// Unlike `browser_set_bounds` (instant snap), this smoothly animates the
/// native window at compositor speed. Used for sidebar toggle where the CSS
/// transition and native window must move in sync.
#[tauri::command]
pub async fn browser_animate_bounds(
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    duration_ms: f64,
    app: AppHandle,
    state: State<'_, Arc<BrowserWindowState>>,
) -> Result<()> {
    if !*state.exists.lock() {
        return Err("No browser exists".to_owned());
    }

    store_last_bounds(state.inner().as_ref(), x, y, width, height);

    if *state.hidden.lock() {
        return Ok(());
    }

    let main_window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;
    let (screen_x, screen_y) = to_screen_coords(&main_window, x, y)?;

    let window = app
        .get_webview_window(BROWSER_WINDOW_LABEL)
        .ok_or("Browser window not found")?;

    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = sync_channel::<Result<()>>(1);
        let window_clone = window.clone();
        let duration_secs = duration_ms / 1000.0;

        app.run_on_main_thread(move || {
            let result = match window_clone.ns_window() {
                Ok(ns_window) => orbit_plugin_decorum::animate_ns_window_frame(
                    ns_window,
                    screen_x, screen_y, width, height,
                    duration_secs,
                    0.165, 0.84, 0.44, 1.0, // CSS ease-out-quart
                ),
                Err(error) => Err(format!("Failed to get NSWindow handle: {error}")),
            };
            let _ = tx.send(result);
        })
        .map_err(|e| format!("Failed to dispatch to main thread: {e}"))?;

        rx.recv()
            .map_err(|_| "Main-thread animate channel closed".to_owned())??;
    }

    #[cfg(not(target_os = "macos"))]
    {
        window
            .set_position(LogicalPosition::new(screen_x, screen_y))
            .map_err(|e| format!("Failed to set position: {e}"))?;
        window
            .set_size(LogicalSize::new(width, height))
            .map_err(|e| format!("Failed to set size: {e}"))?;
    }

    Ok(())
}
```

### Step 5: Register command in lib.rs

**File:** `src-tauri/src/lib.rs` (~line 617-646)

Add `browser::browser_animate_bounds` to the `generate_handler!` macro, next to `browser::browser_set_bounds`.

### Step 6: Add `browserAnimateBounds` frontend API

**File:** `apps/agent/src/lib/api/browser.ts`

Add after `browserSetBounds`:

```typescript
/**
 * Animate the embedded browser to new bounds using native NSAnimationContext.
 *
 * Unlike browserSetBounds (instant snap), this smoothly animates the native
 * window at compositor speed. Used for sidebar toggle where the CSS transition
 * and native window must move in sync.
 */
export async function browserAnimateBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  durationMs: number
): Promise<void> {
  return invoke('browser_animate_bounds', { x, y, width, height, durationMs });
}
```

### Step 7: Add native-animate event type to `browser-bounds-drive.ts`

**File:** `apps/agent/src/lib/browser/browser-bounds-drive.ts`

Add a new event type for native animation alongside the existing drive events:

```typescript
export const BROWSER_BOUNDS_NATIVE_ANIMATE_EVENT = 'orbit:browser-bounds-native-animate';

export interface BrowserBoundsNativeAnimateDetail {
  durationMs: number;
}

export function startBrowserNativeAnimate(detail: BrowserBoundsNativeAnimateDetail): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<BrowserBoundsNativeAnimateDetail>(BROWSER_BOUNDS_NATIVE_ANIMATE_EVENT, {
      detail,
    })
  );
}
```

### Step 8: Add native-animate handler in `browser-panel.tsx`

**File:** `apps/agent/src/components/browser/browser-panel.tsx`

In the large bounds-management `useEffect` (~line 256), add a handler for `BROWSER_BOUNDS_NATIVE_ANIMATE_EVENT` alongside the existing drive start/stop handlers. This is the key integration point — it suspends the observer, calls `browserAnimateBounds` with measured final bounds, then reconnects and syncs after settle:

```typescript
// Import the new event and API
import { browserAnimateBounds } from '@/lib/api';
import { IS_TAURI } from '@/lib/api/core';
import { isMac } from '@/lib/utils';
import {
  BROWSER_BOUNDS_NATIVE_ANIMATE_EVENT,
  // ... existing imports
} from '@/lib/browser/browser-bounds-drive';

// Inside the bounds useEffect, add after handleDriveStop:

let nativeAnimateReconnectTimer: number | null = null;

// Cancel rAF drive WITHOUT reconnecting the observer or publishing bounds.
// Unlike stopDrive() (which calls connectObserver + scheduleObserverBounds),
// this silently kills the rAF loop so the native-animate handler can take
// over observer lifecycle itself.
const cancelDrive = (): void => {
  driveActive = false;

  if (driveFrameId !== null) {
    window.cancelAnimationFrame(driveFrameId);
    driveFrameId = null;
  }

  if (driveStopTimer !== null) {
    window.clearTimeout(driveStopTimer);
    driveStopTimer = null;
  }
};

const handleNativeAnimate = (event: Event): void => {
  if (!(event instanceof CustomEvent)) return;

  const durationMs = typeof event.detail.durationMs === 'number' ? event.detail.durationMs : 200;

  // Cancel any previous reconnect timer (rapid toggle)
  if (nativeAnimateReconnectTimer !== null) {
    window.clearTimeout(nativeAnimateReconnectTimer);
    nativeAnimateReconnectTimer = null;
  }

  // Cancel any active rAF drive without reconnecting observer or publishing stale bounds
  if (driveActive) {
    cancelDrive();
  }

  // Suspend observer to prevent observer-driven browserSetBounds during animation
  disconnectObserver();

  // Read the CURRENT viewport bounds (post-React-commit, pre-CSS-transition)
  const bounds = readBounds();
  if (!bounds) {
    connectObserver();
    return;
  }

  if (!IS_TAURI || !isMac()) {
    // Non-Tauri (mock mode) or non-macOS: fall back to rAF drive.
    // On non-macOS Tauri, the Rust command snaps instantly while CSS
    // animates for 200ms — rAF drive keeps them in sync instead.
    startDrive(durationMs);
    return;
  }

  // macOS Tauri: issue single native animation call
  void browserAnimateBounds(bounds.x, bounds.y, bounds.width, bounds.height, durationMs).catch(
    () => {
      // Native animation failed — clear the reconnect timer to avoid
      // duplicate reconnect work, then fall back to rAF drive
      if (nativeAnimateReconnectTimer !== null) {
        window.clearTimeout(nativeAnimateReconnectTimer);
        nativeAnimateReconnectTimer = null;
      }

      startDrive(durationMs);
    }
  );

  // Reconnect observer after animation settles + 1 frame buffer
  nativeAnimateReconnectTimer = window.setTimeout(() => {
    nativeAnimateReconnectTimer = null;
    connectObserver();
    scheduleObserverBounds(true); // Force final reconciliation
  }, durationMs + 32);
};

// Register listener
window.addEventListener(BROWSER_BOUNDS_NATIVE_ANIMATE_EVENT, handleNativeAnimate);

// Cleanup (add to existing return function)
return (): void => {
  // ... existing cleanup ...
  window.removeEventListener(BROWSER_BOUNDS_NATIVE_ANIMATE_EVENT, handleNativeAnimate);
  if (nativeAnimateReconnectTimer !== null) {
    window.clearTimeout(nativeAnimateReconnectTimer);
  }
};
```

**Key behaviors:**

- **macOS gate:** Only macOS Tauri uses native animation; non-macOS Tauri falls back to rAF drive (avoids CSS/native desync since Rust snaps instantly on other platforms)
- **`cancelDrive()` not `stopDrive()`:** Stops the rAF loop without reconnecting the observer or publishing stale bounds — the native-animate handler manages observer lifecycle itself
- **Observer suspension:** Disconnects the ResizeObserver before animation, preventing `browserSetBounds` from fighting the native animation
- **Rapid toggle:** Each new native-animate event cancels the previous reconnect timer
- **Error recovery:** `.catch()` clears the reconnect timer and falls back to rAF drive (deterministic visual fallback, not a late snap)
- **Final reconciliation:** After settle, reconnects observer and forces a `scheduleObserverBounds(true)` sync
- **Mock safety:** Falls back to rAF drive when not in Tauri

### Step 9: Update App.tsx to dispatch native-animate event

**File:** `apps/agent/src/App.tsx`

Replace the `useLayoutEffect` that detects sidebar width changes (~line 814-823). Instead of `startBrowserBoundsDrive()`, dispatch the new native-animate event. The bounds measurement happens in `browser-panel.tsx` (Step 8), NOT here — App.tsx only signals "a sidebar transition is happening":

```typescript
import { startBrowserNativeAnimate } from '@/lib/browser/browser-bounds-drive';

// Sidebar animation duration — must match CONTENT_CARD.transition (200ms)
const SIDEBAR_ANIMATION_DURATION_MS = 200;

// ...

useLayoutEffect(() => {
  const previousWidth = previousSidebarWidthRef.current;
  previousSidebarWidthRef.current = effectiveSidebarWidth;

  if (!browserNativeWindowVisible || previousWidth === effectiveSidebarWidth) {
    return;
  }

  if (PREFERS_REDUCED_MOTION) {
    // CSS transition is instant — snap the native window via rAF drive (1 frame)
    startBrowserBoundsDrive({ durationMs: 16 });
    return;
  }

  // Signal browser-panel to start native animation
  startBrowserNativeAnimate({ durationMs: SIDEBAR_ANIMATION_DURATION_MS });
}, [browserNativeWindowVisible, effectiveSidebarWidth]);
```

**Why `useLayoutEffect` measures the correct final bounds:** React commits the new state (sidebar width change) synchronously before `useLayoutEffect` fires. The browser hasn't painted yet, but the DOM layout reflects the new React state. The `getBoundingClientRect()` in `browser-panel.tsx`'s `readBounds()` returns the post-commit layout — which is the CSS transition's _starting point_ (which equals the animation's _ending point_, since the DOM snaps to final state and CSS transitions from current visual to new DOM state).

**Wait — this is the opposite of what we want.** After React commits `effectiveSidebarWidth = 0` (collapse), the DOM already has the sidebar's margin-left at its final position. `getBoundingClientRect()` returns the _final_ layout. The CSS transition then _visually_ animates from the _old_ visual state to this new DOM state. So `readBounds()` in `useLayoutEffect` gives us the **final target** — exactly what we need for `browserAnimateBounds`.

### Step 10: Remove stale `BROWSER_LAYOUT_DRIVE_DURATION_MS` usage

**File:** `apps/agent/src/App.tsx`

The `BROWSER_LAYOUT_DRIVE_DURATION_MS = 220` constant is no longer used for sidebar toggle. It was the rAF drive settle buffer. If it's still needed for activity panel drag (line 834), keep it for that. Otherwise remove it.

**Keep existing systems for other use cases:**

- ResizeObserver in `browser-panel.tsx` for steady-state (window resize, etc.)
- rAF drive for activity panel drag (continuous repositioning) — `handleActivityDrag` still calls `startBrowserBoundsDrive()`

## Critical Files

| File                                                  | Change                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `crates/plugins/decorum/src/promotion.rs`             | Make `ensure_quartz_core_loaded()` + FFI `pub(crate)`                                 |
| `crates/plugins/decorum/src/window_order.rs`          | Add `animate_ns_window_frame()` with screen lookup, Y-flip, QuartzCore loading        |
| `crates/plugins/decorum/src/lib.rs`                   | Add public wrapper (`*mut c_void`, non-macOS no-op)                                   |
| `src-tauri/src/commands/browser/mod.rs`               | Add `browser_animate_bounds` with full safety pipeline                                |
| `src-tauri/src/lib.rs`                                | Register command in `generate_handler!`                                               |
| `apps/agent/src/lib/api/browser.ts`                   | Add `browserAnimateBounds()`                                                          |
| `apps/agent/src/lib/browser/browser-bounds-drive.ts`  | Add `BROWSER_BOUNDS_NATIVE_ANIMATE_EVENT` + `startBrowserNativeAnimate()`             |
| `apps/agent/src/components/browser/browser-panel.tsx` | Add native-animate handler with observer suspension + reconnection                    |
| `apps/agent/src/App.tsx`                              | Dispatch native-animate event (replaces `startBrowserBoundsDrive` for sidebar toggle) |

## Edge Cases

| Case                                                    | Handling                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser hidden during toggle                            | Rust `state.hidden` guard skips animation; observer stays disconnected until show                                                                                                                                                                                         |
| Rapid sidebar toggling                                  | Each native-animate event cancels the previous reconnect timer; `NSAnimationContext` naturally interrupts previous animation                                                                                                                                              |
| `prefers-reduced-motion`                                | CSS transitions disabled → use rAF drive for 1 frame (snap), no native animation                                                                                                                                                                                          |
| Mock mode (non-Tauri)                                   | `browser-panel.tsx` detects `!IS_TAURI` → falls back to rAF drive                                                                                                                                                                                                         |
| Non-macOS Tauri builds (Windows/Linux)                  | `!isMac()` gate falls back to rAF drive. Rust `browser_animate_bounds` snaps instantly on non-macOS, which would desync from the 200ms CSS transition — rAF drive keeps them in sync                                                                                      |
| Drive active when native-animate starts                 | `cancelDrive()` stops rAF loop + timers WITHOUT reconnecting observer or publishing bounds. Prevents stale `browser:bounds` update that `stopDrive()` would emit                                                                                                          |
| Screen change mid-animation                             | Acceptable risk — Y-flip uses original screen geometry; ResizeObserver corrects on settle                                                                                                                                                                                 |
| Window not on any screen                                | Falls back to `mainScreen` (same as `set_ns_window_frame`)                                                                                                                                                                                                                |
| `browser_hide`/`browser_show` during animation          | Observer is already disconnected; show/hide guard in Rust prevents stale position updates; reconnect timer fires after settle and syncs                                                                                                                                   |
| QuartzCore not loaded                                   | `ensure_quartz_core_loaded()` called before `CAMediaTimingFunction` lookup; `AnyClass::get` returns error if still not available                                                                                                                                          |
| ContentCard margin change                               | Bounds are measured from `getBoundingClientRect()` post-commit, which includes the ContentCard margin. No delta arithmetic.                                                                                                                                               |
| 200ms vs 220ms drift                                    | Native animation uses `200ms` (matching CSS source of truth). rAF drive settle buffer is separate.                                                                                                                                                                        |
| `browserAnimateBounds` fails before reconnect timer set | `.catch()` fires synchronously on next microtask — reconnect timer is already set by then (synchronous `setTimeout` after `browserAnimateBounds` call). If the promise rejects, `.catch()` clears the timer and falls back to `startDrive()`. No orphaned observer state. |
| Browser hidden mid-animation, reconnect timer fires     | Reconnect timer calls `connectObserver()` + `scheduleObserverBounds(true)`. Observer reads `getBoundingClientRect()` and publishes bounds. Rust `browser_set_bounds` checks `state.hidden` guard and skips — safe no-op.                                                  |
| Activity drag in progress when sidebar toggles          | `handleNativeAnimate` calls `cancelDrive()` which stops the drag's rAF loop. After native animation settles, observer reconnects. If user is still dragging, the drag handler will re-dispatch `startBrowserBoundsDrive` on next drag event, restarting drive mode.       |

## Verification

1. `cargo check` — Rust compiles
2. `bun run typecheck` — TypeScript compiles
3. `bun run test` — All browser-handlers tests pass
4. `bunx tauri dev` — Manual test:
   - Toggle sidebar open/close while browser panel is visible → smooth native animation, no stutter
   - Rapid toggle (3x in <1s) → animation interrupts cleanly, final position correct
   - Activity panel drag → rAF drive still works (unchanged)
   - Window resize → ResizeObserver still works (unchanged)
   - System Preferences → Accessibility → Reduce motion ON → sidebar and browser snap instantly
   - Hide browser (collapse activity panel) → toggle sidebar → no crash or flash
   - `bun run dev` (browser-only) → no unhandled promise rejection from `browserAnimateBounds`
   - Start dragging activity panel, then toggle sidebar mid-drag → native animation runs, drag resumes on next move event
5. Recommended automated tests (see Test Coverage below)

## Test Coverage

Recommended additions before/during implementation:

1. **TS: Observer suspension during native animation** — Verify that `BROWSER_BOUNDS_NATIVE_ANIMATE_EVENT` causes the observer to disconnect, `browserAnimateBounds` is called once, and observer reconnects after the duration + buffer.
2. **TS: ContentCard margin in target bounds** — Test open→closed and closed→open target bounds to verify the 10px ContentCard left-margin change is captured correctly (bounds measured, not derived from delta).
3. **TS: Mock-safe fallback** — Verify that when `IS_TAURI` is false, native-animate falls back to rAF drive without unhandled rejections.
4. **TS: Non-macOS Tauri fallback** — Verify that when `IS_TAURI` is true but `isMac()` returns false, the handler falls back to rAF drive instead of calling `browserAnimateBounds`.
5. **TS: Rapid toggle interruption** — Verify that a second native-animate event cancels the previous reconnect timer and starts a new animation cycle.
6. **TS: Drive-to-native handoff (no stale bounds)** — Verify that a native-animate event while `driveActive` is true uses `cancelDrive()` (not `stopDrive()`) and does NOT emit an intermediate `browser:bounds` update before disconnecting the observer.
7. **Rust: `animate_ns_window_frame` coordinate conversion** — Extend existing `tauri_to_ns_frame` tests to cover the animate path (same conversion, just different call site).
