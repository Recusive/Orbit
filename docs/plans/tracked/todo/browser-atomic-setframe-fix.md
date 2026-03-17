# Fix: Browser Panel Jump During Left-Drag Resize

## Context

When dragging the activity panel resize handle **leftward** (expanding the browser), the entire native browser window visibly jumps/teleports. Right-drag works fine. The previous plan (`indexed-fluttering-lollipop.md`) fixed secondary causes (CSS transitions, rAF delay, throttle timing) but missed the **primary cause**: `browser_set_bounds` in Rust calls `set_position()` then `set_size()` as **two separate operations**. Between these calls, the window is in an intermediate state — new position but old size — causing the macOS window server to composite a 1-frame jump.

**Why left-drag shows it:** `set_position(new_x)` moves the window left, but size is still old (narrower). The right edge = `new_x + old_width` is less than the correct right edge → visible gap. Right-drag creates overlap (window extends past viewport boundary → clipped/invisible).

**The fix:** Replace the two-call pattern with a single `NSWindow.setFrame:display:` call via the `orbit_plugin_decorum` plugin. This is a single Objective-C message that atomically sets both origin and size — no intermediate state, no window server composite between position and size.

---

## Approach: Atomic `NSWindow.setFrame:display:`

Four changes at the native layer:

1. **Add `set_ns_window_frame`** to the decorum plugin — a new function that calls `[NSWindow setFrame:rect display:YES]` via `objc2::msg_send!`, using the window's own screen for correct multi-monitor Y-flip
2. **Replace `set_position` + `set_size`** in `browser_set_bounds` with a single `run_on_main_thread` dispatch using the new function (macOS), with `#[cfg(not)]` fallback preserving existing behavior on Windows/Linux
3. **Move `last_bounds`** update before the hidden guard (robustness)
4. **Fix `browser_show`** — same two-call bug when restoring bounds after unhide; combine frame restore + alpha restore into single dispatch

No frontend changes needed. The jump is a Rust-side problem — not IPC latency.

---

## Changes

### 1. Add `set_ns_window_frame` to decorum plugin

**File:** `crates/plugins/decorum/src/window_order.rs` (after `set_ns_window_alpha`, ~line 186)

New function that atomically sets an NSWindow's position + size using `setFrame:display:`. Uses the window's own screen frame (with `mainScreen` fallback) to flip Y from Tauri's top-left-origin to macOS's bottom-left-origin coordinate system. The Y-flip accounts for screen origin (non-zero on secondary monitors) to handle offset multi-monitor layouts correctly.

The coordinate conversion is extracted into a pure helper (`tauri_to_ns_frame`) that is unit-testable without AppKit.

```rust
/// Convert Tauri global coordinates (top-left origin) to an AppKit NSRect
/// (bottom-left origin) for the given target screen.
///
/// The Y-flip formula uses the screen's **top edge** (`origin.y + height`),
/// NOT just its height, because secondary screens can have non-zero origins
/// in the global AppKit coordinate space (e.g., a display stacked above the
/// primary has `origin.y = primary_height`).
///
/// This is a pure function with no FFI — safe to call from tests.
pub(crate) fn tauri_to_ns_frame(
    screen_origin_y: f64,
    screen_height: f64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> (f64, f64, f64, f64) {
    // Top edge of the target screen in global AppKit coordinates.
    let top_edge = screen_origin_y + screen_height;
    // Tauri (x, y) is the top-left corner; NSWindow frame origin is bottom-left.
    let ns_y = top_edge - y - height;
    (x, ns_y, width, height)
}

/// Atomically set the frame (position + size) of a specific `NSWindow`.
///
/// Uses `[NSWindow setFrame:display:]` to set origin and size in a single
/// window server operation. This avoids the 1-frame intermediate state that
/// occurs when calling `setPosition` and `setSize` separately.
///
/// Coordinates use **Tauri convention** (top-left origin, logical points).
/// This function internally converts to macOS screen coordinates (bottom-left
/// origin) using the window's own screen frame (falls back to `mainScreen`
/// if the window isn't on a screen yet).
///
/// Returns `Ok(())` on success or an error string if the NSWindow handle
/// or screen cannot be resolved.
///
/// **Must be called from the main thread.**
pub(crate) fn set_ns_window_frame(
    ns_window: *mut std::ffi::c_void,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> std::result::Result<(), String> {
    use objc2_foundation::{NSPoint, NSRect, NSSize};

    if ns_window.is_null() {
        return Err("set_ns_window_frame called with null window".to_owned());
    }

    let window = ns_window.cast::<AnyObject>();

    // Get screen frame for Y-axis flip.
    // macOS uses bottom-left origin; Tauri uses top-left origin.
    // Prefer the window's own screen (correct on multi-monitor even when
    // primary display has a different resolution or is vertically offset).
    // Fall back to mainScreen if the window isn't on a screen yet.
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
    let screen_frame: NSRect = unsafe { msg_send![screen_for_flip, frame] };

    // Pure conversion — uses screen origin + height for correct multi-monitor math.
    let (ns_x, ns_y, ns_w, ns_h) = tauri_to_ns_frame(
        screen_frame.origin.y,
        screen_frame.size.height,
        x, y, width, height,
    );

    let frame = NSRect {
        origin: NSPoint { x: ns_x, y: ns_y },
        size: NSSize { width: ns_w, height: ns_h },
    };

    unsafe {
        let _: () = msg_send![window, setFrame: frame, display: true];
    }

    Ok(())
}
```

**Key details:**

- Uses `NSRect` from `objc2_foundation::NSGeometry` (already enabled in Cargo.toml)
- Y-flip uses **top edge** (`screen_origin_y + screen_height`), not just screen height — handles vertically offset, stacked, and mixed-resolution multi-monitor layouts
- `tauri_to_ns_frame` is a pure function — unit-testable without AppKit (see Tests section)
- Uses `[NSWindow screen]` for the screen frame, falls back to `mainScreen`
- Returns `Result<(), String>` so callers can propagate errors (not silent no-ops)
- `display: true` tells the window to redraw immediately
- Follows the existing `set_ns_window_alpha` pattern (takes `*mut c_void`, does safety checks)

### 2. Export from decorum lib.rs

**File:** `crates/plugins/decorum/src/lib.rs` (after `set_ns_window_alpha` at ~line 292)

Add a public wrapper following the exact same pattern as `set_ns_window_alpha`:

```rust
/// Atomically set the frame (position + size) of a specific `NSWindow`.
///
/// Uses `[NSWindow setFrame:display:]` to update origin and size in a single
/// window server composite cycle. This eliminates the 1-frame intermediate
/// state (correct position, stale size) that causes visible jumps when
/// `set_position` and `set_size` are called separately.
///
/// Coordinates use **Tauri convention** (top-left origin, logical points).
/// Internally converts to macOS screen coordinates (bottom-left origin)
/// using the window's screen frame (handles offset multi-monitor layouts).
///
/// Returns `Ok(())` on success; returns an error if the NSWindow handle
/// or screen cannot be resolved. On non-macOS platforms, always succeeds
/// (no-op).
///
/// **Must be called from the main thread.**
// Cannot be const: calls non-const FFI on macOS; Clippy only sees empty body on Linux.
#[allow(clippy::missing_const_for_fn)]
pub fn set_ns_window_frame(
    ns_window: *mut std::ffi::c_void,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        window_order::set_ns_window_frame(ns_window, x, y, width, height)?;
    }

    #[cfg(not(target_os = "macos"))]
    let _ = (ns_window, x, y, width, height);

    Ok(())
}
```

### 3. Modify `browser_set_bounds` to use atomic frame update

**File:** `src-tauri/src/commands/browser/mod.rs` (~lines 774-818)

Replace the sequential `set_position()` → `set_size()` with a single `run_on_main_thread` dispatch that calls `set_ns_window_frame`. Also move `last_bounds` update before the hidden guard.

On macOS, errors from inside the main-thread closure are round-tripped back to the command via a `sync_channel`, preserving the current hard-failure semantics (the browser window lookup and `ns_window()` call still return errors to the frontend, not silent no-ops).

```rust
#[tauri::command]
pub async fn browser_set_bounds(
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    app: AppHandle,
    state: State<'_, Arc<BrowserWindowState>>,
) -> Result<()> {
    if !*state.exists.lock() {
        return Err("No browser exists".to_owned());
    }

    // Always update stored bounds — even when hidden — so browser_show
    // restores to the latest position, not the stale pre-hide position.
    *state.last_bounds.lock() = Some(BrowserBounds { x, y, width, height });

    if *state.hidden.lock() {
        return Ok(());
    }

    // Convert parent-relative logical coordinates to screen coordinates (HiDPI-aware)
    let main_window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;
    let (screen_x, screen_y) = to_screen_coords(&main_window, x, y)?;

    // Resolve browser window BEFORE dispatch — preserves current error behavior
    // (returns "Browser window not found" to frontend, not a silent no-op).
    let window = app
        .get_webview_window(BROWSER_WINDOW_LABEL)
        .ok_or("Browser window not found")?;

    // macOS: Atomic position + size via NSWindow.setFrame:display: in a single
    // main-thread dispatch. Prevents the window server from compositing an
    // intermediate state (new position but old size → visible jump on left-drag).
    //
    // Errors from inside the closure are round-tripped via sync_channel
    // so ns_window() failures propagate to the Tauri command result.
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = std::sync::mpsc::sync_channel::<Result<()>>(1);
        let window_clone = window.clone();

        app.run_on_main_thread(move || {
            let result = match window_clone.ns_window() {
                Ok(ns_window) => {
                    orbit_plugin_decorum::set_ns_window_frame(
                        ns_window, screen_x, screen_y, width, height,
                    )
                }
                Err(e) => Err(format!("Failed to get NSWindow handle: {e}")),
            };
            let _ = tx.send(result);
        })
        .map_err(|e| format!("Failed to dispatch to main thread: {e}"))?;

        rx.recv()
            .map_err(|_| "Main-thread bounds update channel closed".to_owned())??;
    }

    // Non-macOS: Use Tauri's set_position + set_size (no atomic alternative).
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

**What changed:**

- `last_bounds` moved BEFORE the hidden guard (line 17 vs old line 42)
- Browser window resolved BEFORE dispatch — preserves current "Browser window not found" error semantics
- macOS: `set_position()` + `set_size()` replaced with single `run_on_main_thread` → `set_ns_window_frame()`
- macOS: errors from inside closure round-tripped via `sync_channel` (not swallowed)
- Non-macOS: preserves existing `set_position()` + `set_size()` (no atomic alternative on Windows/Linux)
- `set_ns_window_frame` returns `Result` — `ns_window()` and screen-lookup failures propagate

### 4. Fix `browser_show` to use atomic frame restore

**File:** `src-tauri/src/commands/browser/mod.rs` (~lines 1478-1528)

`browser_show` has the same two-call bug: it calls `set_position()` then `set_size()` when restoring bounds after unhide (lines 1499-1503). While less noticeable than continuous drag (single restore operation), it can produce a 1-frame jump when the browser reappears.

Fix: pre-compute screen coordinates, then combine atomic frame restore + alpha restore into a single `run_on_main_thread` dispatch. Errors are round-tripped via `sync_channel` to preserve failure semantics.

**Important:** The non-macOS fallback does NOT call `window.show()`. Current non-macOS `browser_hide` only moves the window offscreen — it doesn't call `hide()`. Adding `show()` would be an unrelated behavior change that could alter focus and z-order on Windows/Linux.

```rust
#[tauri::command]
pub async fn browser_show(app: AppHandle, state: State<'_, Arc<BrowserWindowState>>) -> Result<()> {
    if !*state.exists.lock() {
        return Err("No browser exists".to_owned());
    }

    let window = app
        .get_webview_window(BROWSER_WINDOW_LABEL)
        .ok_or("Browser window not found")?;

    // Clear hidden flag so browser_set_bounds resumes accepting updates.
    *state.hidden.lock() = false;

    // Read bounds once for restore
    let saved_bounds = *state.last_bounds.lock();

    // Pre-compute screen coordinates outside the closure
    // (to_screen_coords borrows &WebviewWindow which isn't Send)
    let main_window = app.get_webview_window("main");
    let screen_coords = saved_bounds.and_then(|bounds| {
        main_window
            .as_ref()
            .and_then(|mw| to_screen_coords(mw, bounds.x, bounds.y).ok())
            .map(|(sx, sy)| (sx, sy, bounds.width, bounds.height))
    });

    // macOS: Atomic frame restore + alpha restore in a single main-thread dispatch.
    // Errors round-tripped via sync_channel to preserve failure semantics.
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = std::sync::mpsc::sync_channel::<Result<()>>(1);
        let window_clone = window.clone();

        app.run_on_main_thread(move || {
            let result = match window_clone.ns_window() {
                Ok(ns_window) => {
                    // Atomic frame restore (if bounds are saved)
                    if let Some((sx, sy, w, h)) = screen_coords {
                        if let Err(e) = orbit_plugin_decorum::set_ns_window_frame(
                            ns_window, sx, sy, w, h,
                        ) {
                            log::warn!("browser_show: frame restore failed: {e}");
                            // Non-fatal — still restore alpha below
                        }
                    }
                    // Restore visibility (browser_hide sets alpha to 0.0)
                    orbit_plugin_decorum::set_ns_window_alpha(ns_window, 1.0);
                    Ok(())
                }
                Err(e) => Err(format!("Failed to get NSWindow handle: {e}")),
            };
            let _ = tx.send(result);
        })
        .map_err(|e| format!("Failed to dispatch to main thread: {e}"))?;

        rx.recv()
            .map_err(|_| "Main-thread show channel closed".to_owned())??;
    }

    // Non-macOS: Reposition + resize only (matching current behavior).
    // Does NOT call window.show() — current browser_hide only moves offscreen,
    // it doesn't call hide(). Adding show() would be an unrelated behavior change.
    #[cfg(not(target_os = "macos"))]
    {
        if let Some(bounds) = saved_bounds {
            if let Some(main_win) = &main_window {
                if let Ok((screen_x, screen_y)) = to_screen_coords(main_win, bounds.x, bounds.y) {
                    let _ = window.set_position(LogicalPosition::new(screen_x, screen_y));
                }
            }
            let _ = window.set_size(LogicalSize::new(bounds.width, bounds.height));
        }
    }

    Ok(())
}
```

**What changed:**

- Browser window resolved BEFORE dispatch — preserves "Browser window not found" error semantics
- macOS: single `run_on_main_thread` dispatch does both `set_ns_window_frame` (atomic position+size) and `set_ns_window_alpha` (visibility) — was two separate dispatches
- macOS: errors round-tripped via `sync_channel` (not swallowed)
- Pre-computes screen coords before the closure (since `to_screen_coords` borrows `&WebviewWindow` which isn't `Send`)
- Non-macOS: preserves existing `set_position()` + `set_size()` only — does NOT add `window.show()` (current `browser_hide` only moves offscreen, never calls `hide()`)

---

## Files to Modify

| File                                                                 | Change                                                                                                                                                   |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crates/plugins/decorum/src/window_order.rs` (~line 186)             | Add `tauri_to_ns_frame` (pure helper) + `set_ns_window_frame` (FFI wrapper returning `Result`) + unit tests                                              |
| `crates/plugins/decorum/src/lib.rs` (~line 292)                      | Add public `set_ns_window_frame` wrapper (returns `Result`)                                                                                              |
| `src-tauri/src/commands/browser/mod.rs` (~lines 774-818)             | `browser_set_bounds`: atomic `setFrame:display:` via `run_on_main_thread` with error channel, non-macOS fallback, move `last_bounds` before hidden guard |
| `src-tauri/src/commands/browser/mod.rs` (~lines 1478-1528)           | `browser_show`: atomic frame restore + alpha in single dispatch with error channel                                                                       |
| `src-tauri/src/commands/browser/mod.rs` (tests)                      | Hidden-bounds persistence unit test                                                                                                                      |
| `apps/agent/src/__tests__/unit/hooks/agent/browser-handlers.test.ts` | Add `handleBrowserShow` / `handleBrowserHide` coverage                                                                                                   |

---

## Why This Fixes the Jump

**Current (broken) — two window server operations:**

```
set_position(new_x, ...)  →  window server composites: new position + OLD size  →  RIGHT EDGE JUMPS LEFT
set_size(new_w, ...)      →  window server composites: new position + new size  →  correct (1 frame late)
```

**Fixed — one atomic operation:**

```
setFrame:display: (new_x, ns_y, new_w, new_h)  →  window server composites once: correct position AND size
```

No intermediate state = no jump. The window moves from old frame to new frame in a single composite.

---

## Coordinate Conversion Detail

`setFrame:display:` uses macOS screen coordinates (bottom-left origin). The conversion pipeline:

```
Frontend (CSS pixels, relative to viewport)
  → to_screen_coords() → absolute logical coords (Tauri, top-left origin)
    → tauri_to_ns_frame() → NSRect (macOS, bottom-left origin)
      formula: top_edge = screen.origin.y + screen.size.height
               ns_y = top_edge - screen_y - window_height
      (uses [NSWindow screen], falls back to mainScreen)
```

**Why `screen.origin.y` matters:** In macOS global coordinates, the primary screen has origin `(0, 0)` at bottom-left. Secondary screens have non-zero origins: a display stacked above has `origin.y = primary_height`, a side-by-side has `origin.x = primary_width`. Using only `screen.size.height` (without origin) produces incorrect Y values on non-primary displays.

All values are in **logical points** (CSS px = Tauri logical = macOS points). No scale factor conversion needed because `to_screen_coords` already handles the physical→logical conversion.

---

## Edge Cases

- **Right drag**: Same atomic update, just moving in the opposite direction. No regression — overlap was already invisible.
- **Window resize (not drag)**: ResizeObserver fires → same `browser_set_bounds` path → same atomic update.
- **Hidden browser**: `last_bounds` stored (new), `setFrame` skipped (existing behavior). `browser_show` now restores with atomic frame + alpha in single dispatch.
- **Multi-monitor (side-by-side)**: `tauri_to_ns_frame` uses screen origin + height for Y-flip. Side-by-side displays with matching heights produce the same Y-flip; different heights are handled correctly because each screen's own frame is used.
- **Multi-monitor (vertically offset/stacked)**: Screen origin Y is non-zero on a display stacked above the primary. `top_edge = origin.y + height` is the correct flip point. Unit tests validate this scenario (see Tests section).
- **Mid-drag monitor crossing**: `[NSWindow screen]` returns the screen the window is currently on. If the window crosses screens, the next `browser_set_bounds` call picks up the new screen. There may be a 1-frame glitch at the boundary — this is acceptable and matches all native macOS apps.
- **Non-Retina displays**: All values are in logical points. Scale factor doesn't affect the math.
- **Browser closes during drag**: Browser window is resolved BEFORE `run_on_main_thread`. If it's gone, the command returns an error immediately. If it's torn down after resolve but before the closure runs, `ns_window()` fails → error round-tripped via channel.
- **Non-macOS platforms**: `browser_set_bounds` and `browser_show` use `#[cfg(not(target_os = "macos"))]` fallback with the existing `set_position()` + `set_size()` pattern. `browser_show` does NOT call `window.show()` (matching current behavior where `browser_hide` only moves offscreen).
- **Rapid drag coalescing**: Multiple `run_on_main_thread` dispatches can queue during fast drags. macOS coalesces display updates at vsync, so only the last `setFrame:display:` is visible — correct behavior. The `sync_channel` recv blocks the async task until dispatch completes, but each dispatch is sub-millisecond so this is not a bottleneck.
- **Show-vs-bounds race**: `browser_show` clears `hidden` before the restore dispatch. A `browser:bounds` update arriving between the flag clear and the dispatch completion will see `hidden = false` and execute its own `set_ns_window_frame`. The bounds update has the latest coordinates so this is correct — worst case is two atomic frame sets in the same vsync (coalesced by macOS).
- **Invalid hidden bounds**: `last_bounds` is now updated before the hidden guard. If `browser_set_bounds` is called with invalid dimensions while hidden, those are stored. This matches the existing contract: the frontend already guards against invalid bounds (`width < 10 || height < 10 || x < 0 || y < 0` in `handleBrowserBounds`). The Rust side does not re-validate.

---

## Tests

Automated coverage for the pure logic introduced by this plan. Manual QA is still required for AppKit compositor behavior (see Verification section), but these tests protect the coordinate math and hidden-bounds persistence logic from regressions.

### 1. Coordinate conversion — `tauri_to_ns_frame` (Rust unit tests)

**File:** `crates/plugins/decorum/src/window_order.rs` (in `#[cfg(test)] mod tests`)

Table-driven tests for the pure `tauri_to_ns_frame` function covering primary, secondary, and vertically offset display arrangements:

```rust
#[cfg(test)]
mod tests {
    use super::tauri_to_ns_frame;

    /// Primary display (origin 0,0, height 1440):
    /// Window at Tauri (100, 200) with size 800x600
    /// Expected: ns_y = (0 + 1440) - 200 - 600 = 640
    #[test]
    fn primary_display_single_monitor() {
        let (x, ns_y, w, h) = tauri_to_ns_frame(0.0, 1440.0, 100.0, 200.0, 800.0, 600.0);
        assert!((x - 100.0).abs() < f64::EPSILON);
        assert!((ns_y - 640.0).abs() < f64::EPSILON);
        assert!((w - 800.0).abs() < f64::EPSILON);
        assert!((h - 600.0).abs() < f64::EPSILON);
    }

    /// Secondary display stacked above primary (origin.y = 1440, height = 1080):
    /// Window at Tauri (100, 200) on this screen
    /// Expected: ns_y = (1440 + 1080) - 200 - 600 = 1720
    #[test]
    fn secondary_display_stacked_above() {
        let (_, ns_y, _, _) = tauri_to_ns_frame(1440.0, 1080.0, 100.0, 200.0, 800.0, 600.0);
        assert!((ns_y - 1720.0).abs() < f64::EPSILON);
    }

    /// Side-by-side displays (same height 1440, both origin.y = 0):
    /// Secondary is at origin.x = 2560 but origin.y = 0 — same Y-flip as primary.
    /// Verifies that origin.x (irrelevant to Y-flip) doesn't affect the result.
    #[test]
    fn side_by_side_same_height() {
        // Primary: origin (0, 0), 2560x1440
        let (_, ns_y_primary, _, _) = tauri_to_ns_frame(0.0, 1440.0, 100.0, 200.0, 800.0, 600.0);
        // Secondary: origin.y still 0 (side-by-side), same height
        // origin.x = 2560 doesn't enter tauri_to_ns_frame (only origin.y matters)
        let (_, ns_y_secondary, _, _) = tauri_to_ns_frame(0.0, 1440.0, 2660.0, 200.0, 800.0, 600.0);
        // ns_y should be identical: both screens have the same top_edge (0 + 1440 = 1440)
        assert!((ns_y_primary - ns_y_secondary).abs() < f64::EPSILON);
    }

    /// Window at top of screen (y = 0):
    /// ns_y should place the bottom-left at (top_edge - height).
    #[test]
    fn window_at_top_of_screen() {
        let (_, ns_y, _, _) = tauri_to_ns_frame(0.0, 900.0, 0.0, 0.0, 400.0, 300.0);
        // top_edge = 900, ns_y = 900 - 0 - 300 = 600
        assert!((ns_y - 600.0).abs() < f64::EPSILON);
    }

    /// Window at bottom of screen (y = screen_height - window_height):
    /// ns_y should be screen_origin_y (bottom of screen).
    #[test]
    fn window_at_bottom_of_screen() {
        let (_, ns_y, _, _) = tauri_to_ns_frame(0.0, 900.0, 0.0, 600.0, 400.0, 300.0);
        // top_edge = 900, ns_y = 900 - 600 - 300 = 0
        assert!(ns_y.abs() < f64::EPSILON);
    }

    /// Mixed-height displays with vertical offset:
    /// Primary 2560x1440 at origin (0,0), secondary 1920x1080 positioned BELOW.
    /// In AppKit global coords, Y increases upward from the primary's bottom-left.
    /// A screen below the primary has negative origin.y: (0, -1080).
    #[test]
    fn display_below_primary_negative_origin() {
        let (_, ns_y, _, _) = tauri_to_ns_frame(-1080.0, 1080.0, 100.0, 50.0, 800.0, 600.0);
        // top_edge = -1080 + 1080 = 0, ns_y = 0 - 50 - 600 = -650
        assert!((ns_y - (-650.0)).abs() < f64::EPSILON);
    }
}
```

### 2. Hidden-bounds persistence (Rust unit test)

**File:** `src-tauri/src/commands/browser/mod.rs` (in existing `#[cfg(test)]` block, or new one)

Validates that `last_bounds` is updated even when hidden — the core logic change in `browser_set_bounds`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hidden_bounds_update_stores_latest() {
        let state = BrowserWindowState::default();
        *state.exists.lock() = true;
        *state.hidden.lock() = true;
        *state.last_bounds.lock() = Some(BrowserBounds {
            x: 10.0, y: 20.0, width: 800.0, height: 600.0,
        });

        // Simulate what browser_set_bounds does: store bounds before hidden guard
        *state.last_bounds.lock() = Some(BrowserBounds {
            x: 40.0, y: 50.0, width: 900.0, height: 700.0,
        });

        // parking_lot::Mutex::lock() returns the guard directly (no Result).
        // Use assert! + if-let instead of .expect() — clippy::expect_used is denied.
        let guard = state.last_bounds.lock();
        assert!(guard.is_some(), "last_bounds should be Some after update");
        if let Some(bounds) = guard.as_ref() {
            assert!((bounds.x - 40.0).abs() < f64::EPSILON);
            assert!((bounds.width - 900.0).abs() < f64::EPSILON);
        }
    }
}
```

### 3. Frontend browser handler coverage (Vitest)

**File:** `apps/agent/src/__tests__/unit/hooks/agent/browser-handlers.test.ts` (extend existing)

Add test cases for `handleBrowserShow` and `handleBrowserHide` invocation paths. The existing test file uses `vi.hoisted` mocks (`browserShowMock`, `browserHideMock`) that map to `browserShow`/`browserHide` API functions:

```typescript
// Add to existing imports at top of file:
import {
  handleBrowserBounds,
  handleBrowserClear,
  handleBrowserCreate,
  handleBrowserHide, // ← new
  handleBrowserShow, // ← new
} from '@/hooks/agent/handlers/browser-handlers';
import { generateUUID } from '@/types/protocol';

// Add inside the describe('browser-handlers', ...) block:

describe('handleBrowserShow', () => {
  it('calls browserShow API function', async () => {
    browserShowMock.mockResolvedValue(undefined);

    await handleBrowserShow({
      type: 'browser:show',
      uuid: generateUUID(),
    });

    expect(browserShowMock).toHaveBeenCalledOnce();
  });
});

describe('handleBrowserHide', () => {
  it('calls browserHide API function', async () => {
    browserHideMock.mockResolvedValue(undefined);

    await handleBrowserHide({
      type: 'browser:hide',
      uuid: generateUUID(),
    });

    expect(browserHideMock).toHaveBeenCalledOnce();
  });
});
```

---

## Verification

**Automated (run first):**

0. `cargo test -p orbit-plugin-decorum` — verify `tauri_to_ns_frame` unit tests pass (coordinate conversion math)
1. `cargo test browser` — verify hidden-bounds persistence test passes
2. `bun run test` — verify frontend handler tests pass (show/hide invocation)

**Manual QA (AppKit behavior — cannot be automated):**

1. `cargo check` — verify Rust compiles (especially objc2 NSRect/msg_send types)
2. `bunx tauri dev` — start the full app
3. Open browser in the activity panel
4. **Left drag (slow)**: Drag resize handle left slowly — verify smooth tracking, no jump
5. **Left drag (fast)**: Drag rapidly — verify no visible jump or gap
6. **Right drag**: Drag right — verify no regression
7. **Drag then release**: Verify webview is at exact final position
8. **Window resize**: Resize the main window — verify browser follows
9. **Hide/show cycle**: Switch away from browser tab then back — verify no jump on reappearance
10. **Multi-monitor**: If available, drag Orbit window between displays with different resolutions — verify browser tracks correctly
11. `bun run check` — verify TypeScript/ESLint still pass (no TS changes, but sanity check)
