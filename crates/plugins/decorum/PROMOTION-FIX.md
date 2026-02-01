# ProMotion 120Hz Fix — Investigation & Resolution

## The Problem

Orbit uses Tauri 2 with `titleBarStyle: "Overlay"` and `hiddenTitle: true` for a custom title bar with traffic light positioning. On **MacBook Air (M2/M3)** — which has a notch but only a 60Hz Liquid Retina display — the fullscreen slide-down header (where traffic lights appear on hover) was completely broken. The traffic lights would not appear when hovering at the top of the screen in fullscreen mode.

Meanwhile, MacBook Pro 14"/16" (with ProMotion 120Hz + notch) and external 120Hz monitors worked perfectly.

## Root Cause

The decorum plugin applied two mechanisms unconditionally to all displays:

1. **`CADisplayLink`** — Requests 120Hz from the display hardware via `NSScreen.displayLinkWithTarget:selector:` with `preferredFrameRateRange(80, 120, 120)`.

2. **`_WKFeature` private API** — Disables WebKit's internal 60fps `requestAnimationFrame` cap by setting `PreferPageRenderingUpdatesNear60FPSEnabled` to `false` on `WKPreferences`.

On 60Hz displays (MacBook Air), both of these were problematic:

- The `CADisplayLink` requested a minimum of 80Hz from hardware capped at 60Hz
- The `_WKFeature` API permanently broke the fullscreen slide-down header — once called, the damage persisted for the entire app session regardless of toggling it back

## Investigation Journey

### Attempt 1: Remove `_WKFeature` entirely

Removed `unlock_webview_framerate()` completely. Result: **fullscreen fixed, but all displays stuck at 60fps** — including ProMotion MacBooks and 120Hz monitors.

### Attempt 2: NSUserDefaults approach

Tried setting `WebKitPreferPageRenderingUpdatesNear60FPSEnabled` via `NSUserDefaults`. Result: **no effect** — WebKit doesn't read this preference from user defaults for WKWebView.

### Attempt 3: Fullscreen notification observers

Added `NSWindowWillEnterFullScreenNotification` / `NSWindowDidExitFullScreenNotification` observers to toggle the `_WKFeature` preference before/after fullscreen. Result: **still broken on Air** — the `_WKFeature` side-effect is permanent within a session. Re-enabling the cap before fullscreen doesn't undo the damage.

### Attempt 4: Notch detection via `NSScreen.safeAreaInsets`

Used `safeAreaInsets.top > 0` to detect notch displays and skip `_WKFeature`. Result: **fixed Air fullscreen, but also skipped Pro** — both have notches, so both were skipped, leaving the Pro at 60fps.

### Attempt 5: Notch + refresh rate detection

Combined notch detection with `NSScreen.maximumFramesPerSecond` to distinguish Air (60Hz + notch) from Pro (120Hz + notch). Result: **both machines stuck at 60fps** — `maximumFramesPerSecond` is an iOS/UIKit API that doesn't exist on `NSScreen` in AppKit. Calling it via `msg_send` returns 0.

### Attempt 6: `CGDisplayModeGetRefreshRate` (final fix)

Used CoreGraphics `CGDisplayModeGetRefreshRate` to query the display's actual refresh rate. This reliably returns:

- **120.0** on ProMotion displays (MacBook Pro 14"/16")
- **60.0** on standard Liquid Retina (MacBook Air)
- **120.0+** on external high-refresh monitors
- **0.0** on displays with unknown/default rates (treated as 60Hz)

## The Fix

Guard both `enable_promotion()` and `unlock_webview_framerate()` behind a single check:

```rust
extern "C" {
    fn CGMainDisplayID() -> u32;
    fn CGDisplayCopyDisplayMode(display: u32) -> *mut c_void;
    fn CGDisplayModeGetRefreshRate(mode: *mut c_void) -> f64;
    fn CGDisplayModeRelease(mode: *mut c_void);
}

fn screen_refresh_rate() -> f64 {
    unsafe {
        let display_id = CGMainDisplayID();
        let mode = CGDisplayCopyDisplayMode(display_id);
        if mode.is_null() { return 0.0; }
        let rate = CGDisplayModeGetRefreshRate(mode);
        CGDisplayModeRelease(mode);
        rate
    }
}
```

If `screen_refresh_rate() <= 60.0` → skip both `CADisplayLink` and `_WKFeature`. Otherwise, apply both.

## Result

| Machine                | Display       | Refresh Rate | CADisplayLink | \_WKFeature | Fullscreen | rAF fps |
| ---------------------- | ------------- | ------------ | ------------- | ----------- | ---------- | ------- |
| MacBook Air M2/M3      | Liquid Retina | 60Hz         | Skipped       | Skipped     | Works      | 60fps   |
| MacBook Pro 14"/16"    | ProMotion     | 120Hz        | Active        | Active      | Works      | 120fps+ |
| External 120Hz monitor | Various       | 120Hz+       | Active        | Active      | Works      | 120fps+ |
| Pre-2021 MacBook       | Retina        | 60Hz         | Skipped       | Skipped     | Works      | 60fps   |

## Key Learnings

1. **`_WKFeature` damage is permanent per session** — Once you call `_setEnabled:NO` for `PreferPageRenderingUpdatesNear60FPSEnabled`, the fullscreen slide-down header is broken for the rest of the app's lifecycle. Toggling it back before fullscreen doesn't help.

2. **`NSScreen.maximumFramesPerSecond` doesn't exist on macOS** — It's a UIKit API (`UIScreen`). Sending the selector via `msg_send` to `NSScreen` silently returns 0 instead of crashing (Objective-C's nil-messaging behavior).

3. **`CGDisplayModeGetRefreshRate` is the reliable macOS API** — It returns the display mode's refresh rate from CoreGraphics, which correctly reports 120Hz for ProMotion displays.

4. **The `_WKFeature` key is PascalCase** — The feature key is `PreferPageRenderingUpdatesNear60FPSEnabled` (capital P), not `preferPageRenderingUpdatesNear60FPSEnabled` (lowercase p). This was discovered by scanning all 579 `_WKFeature` entries and logging their keys.

5. **WKWebView may not exist during Tauri's `setup` callback** — The `_WKFeature` unlock must be deferred using `performSelector:withObject:afterDelay:` with retry logic (up to 3 attempts at 1-second intervals).

6. **QuartzCore must be dynamically loaded** — Tauri doesn't link QuartzCore automatically. Without `dlopen("/System/Library/Frameworks/QuartzCore.framework/QuartzCore")`, the `CADisplayLink` class lookup returns `None` even on macOS 14+.

7. **Notch ≠ ProMotion** — MacBook Air M2/M3 have a notch but only 60Hz displays. MacBook Pro 14"/16" have both notch and ProMotion. Using notch detection alone as a proxy for display capability is incorrect.

## Files Modified

| File                                      | Change                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `crates/plugins/decorum/src/promotion.rs` | Added `CGDisplayModeGetRefreshRate` guard, deferred `_WKFeature` init with retry, PascalCase key fix |
| `crates/plugins/decorum/src/lib.rs`       | Unchanged — calls `enable_promotion()` + `unlock_webview_framerate()`                                |
| `crates/plugins/decorum/src/traffic.rs`   | Deleted — traffic light positioning handled by Tauri's `trafficLightPosition` config                 |
| `crates/plugins/decorum/Cargo.toml`       | Slimmed dependencies (removed block, cocoa; added objc2 ecosystem)                                   |
| `src-tauri/tauri.conf.json`               | `trafficLightPosition: { x: 11, y: 18 }` restored                                                    |
