# ProMotion 120Hz Rendering

> **Last Updated:** January 2026
> **Status:** Working
> **Platform:** macOS 14+ (Sonoma) with ProMotion display
> **Location:** `crates/plugins/decorum/src/promotion.rs`

This document covers how Orbit achieves 120fps `requestAnimationFrame` in its Tauri WKWebView on Apple ProMotion displays.

---

## Problem

By default, Tauri apps using WKWebView on macOS are locked to 60fps even on ProMotion (120Hz) displays. Two independent locks cause this:

1. **Display controller idles at 60Hz** — ProMotion dynamically adjusts refresh rate. Without an explicit signal requesting 120Hz, the display controller stays at 60Hz to save power.

2. **WebKit caps rAF at ~60fps** — WebKit has an internal preference (`PreferPageRenderingUpdatesNear60FPSEnabled`) that throttles `requestAnimationFrame` callbacks to ~60fps regardless of the physical display rate. Safari exposes this as a feature flag under "Prefer Page Rendering Updates near 60fps."

Both locks must be removed to achieve 120fps rendering.

---

## Solution

### Architecture

```
┌──────────────────────────────────────────────────────┐
│  enable_promotion()                                   │
│                                                       │
│  Lock 1: CADisplayLink                                │
│  ┌─────────────────────────────────────────────────┐  │
│  │  1. dlopen(QuartzCore)                          │  │
│  │  2. Register ObjC target class                  │  │
│  │  3. NSScreen.mainScreen                         │  │
│  │     .displayLinkWithTarget:selector:            │  │
│  │  4. setPreferredFrameRateRange(80, 120, 120)    │  │
│  │  5. Add to main run loop                        │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  Lock 2: WebKit 60fps cap                             │
│  ┌─────────────────────────────────────────────────┐  │
│  │  1. Walk NSWindow view hierarchy → WKWebView    │  │
│  │  2. Get WKWebView.configuration.preferences     │  │
│  │  3. [WKPreferences _features] → NSArray         │  │
│  │  4. Find PreferPageRenderingUpdates...           │  │
│  │  5. [prefs _setEnabled:NO forFeature:feature]   │  │
│  └─────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Lock 1: CADisplayLink (Display Controller)

A `CADisplayLink` attached to the main run loop signals the ProMotion display controller to run at its maximum refresh rate.

**macOS vs iOS API difference:** On iOS, `CADisplayLink` is created via the class factory method `+[CADisplayLink displayLinkWithTarget:selector:]`. This method does **not exist** on macOS. On macOS 14+, display links must be obtained from `NSScreen`, `NSWindow`, or `NSView` via their instance method `-displayLinkWithTarget:selector:]`. This ties the link to the correct physical display (important for multi-monitor setups with different refresh rates).

**QuartzCore must be loaded at runtime:** Tauri does not link the QuartzCore framework automatically. Without `dlopen("/System/Library/Frameworks/QuartzCore.framework/QuartzCore")`, the `CADisplayLink` class lookup returns `None` even on macOS 14+.

**The callback is a no-op:** The display link's callback (`promotion_step`) is intentionally empty. The mere existence of a display link in the run loop requesting 120Hz is sufficient to keep the ProMotion controller at max rate.

```rust
// Step 4: Create via NSScreen instance method (NOT the iOS class factory)
let display_link: *mut AnyObject = unsafe {
    msg_send![main_screen, displayLinkWithTarget: target, selector: sel!(step:)]
};

// Step 5: Request 120Hz (min=80, max=120, preferred=120)
let range = CAFrameRateRange::new(80.0, 120.0, 120.0);
unsafe { let _: () = msg_send![display_link, setPreferredFrameRateRange: range]; }
```

### Lock 2: WebKit 60fps Cap (WKPreferences)

Even with the display running at 120Hz, WebKit internally throttles `requestAnimationFrame` to ~60fps. This is controlled by a WebKit feature flag that Safari exposes in its developer menu.

For embedded WKWebView, the only way to toggle this is via the private `_WKFeature` enumeration API:

1. `[WKPreferences _features]` — class method returning `NSArray<_WKFeature *>`
2. Each `_WKFeature` has a `.key` property (NSString)
3. Find the feature with key `"PreferPageRenderingUpdatesNear60FPSEnabled"`
4. `[prefs _setEnabled:NO forFeature:feature]` — disable it

```rust
// Enumerate all WebKit feature flags
let features: *mut AnyObject = msg_send![prefs_class, _features];
let count: usize = msg_send![features, count];

for i in 0..count {
    let feature: *mut AnyObject = msg_send![features, objectAtIndex: i];
    let key: *mut AnyObject = msg_send![feature, key];
    let is_match: bool = msg_send![key, isEqualToString: &*target_key];
    if is_match {
        let _: () = msg_send![prefs, _setEnabled: false, forFeature: feature];
        return; // Done — 60fps cap removed
    }
}
```

---

## Integration Point

ProMotion is enabled during app setup in `src-tauri/src/lib.rs`:

```rust
#[cfg(target_os = "macos")]
{
    use orbit_plugin_decorum::WebviewWindowExt as _;

    if let Some(window) = app.get_webview_window("main") {
        drop(window.set_traffic_lights_inset(11.0, 10.5));
        drop(window.enable_promotion());
    }
}
```

The `enable_promotion()` method on `WebviewWindowExt`:

1. Dispatches to the main thread (required for both operations)
2. Calls `promotion::enable_promotion()` — singleton CADisplayLink setup
3. Calls `promotion::unlock_webview_framerate(ns_window)` — WebKit cap removal

---

## Compatibility

| Environment                       | Behavior                                                                 |
| --------------------------------- | ------------------------------------------------------------------------ |
| macOS 14+ (Sonoma) with ProMotion | 120fps — both locks removed                                              |
| macOS 14+ without ProMotion       | Silent no-op — display ignores 120Hz request                             |
| macOS < 14                        | Silent no-op — `displayLinkWithTarget:selector:` unavailable on NSScreen |
| Non-macOS                         | Compile-time excluded via `#[cfg(target_os = "macos")]`                  |

---

## Files

| File                                      | Purpose                                             |
| ----------------------------------------- | --------------------------------------------------- |
| `crates/plugins/decorum/src/promotion.rs` | Full implementation (CADisplayLink + WebKit unlock) |
| `crates/plugins/decorum/src/lib.rs`       | `WebviewWindowExt::enable_promotion()` public API   |
| `crates/plugins/decorum/Cargo.toml`       | `objc2-quartz-core` with `CAFrameRateRange` feature |
| `src-tauri/src/lib.rs`                    | Calls `enable_promotion()` during app setup         |

---

## Private API Usage

This implementation uses two private/semi-private Apple APIs:

| API                                                     | Risk                            | Mitigation                                                                                                            |
| ------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `-[NSScreen displayLinkWithTarget:selector:]`           | Low — public API since macOS 14 | Null-checked; silent no-op on older macOS                                                                             |
| `[WKPreferences _features]` / `_setEnabled:forFeature:` | Medium — private SPI            | Only for non-App Store distribution (Tauri apps). Feature key checked by string match; graceful fallback if not found |

Both are safe for sideloaded desktop apps. App Store apps should not use the `_WKFeature` API.

---

## Debugging

### Verify 120fps in the App

Paste this in the WKWebView console (DevTools):

```javascript
let frames = 0,
  last = performance.now();
function tick(now) {
  frames++;
  if (now - last >= 1000) {
    console.log(`FPS: ${frames}`);
    frames = 0;
    last = now;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
```

Expected output on ProMotion: `FPS: 120` (or close to it).

### Log Messages

Set `ORBIT_LOG_MODE=debug` to see all ProMotion log output:

```
[DEBUG] ProMotion: QuartzCore framework loaded
[DEBUG] ProMotion: CADisplayLink obtained from NSScreen.mainScreen
[DEBUG] ProMotion: preferredFrameRateRange set to (80, 120, 120)
[INFO]  ProMotion: display link added to main run loop — 120Hz enabled
[DEBUG] ProMotion: found WKWebView in window hierarchy
[DEBUG] ProMotion: scanning N WebKit features for 60fps preference
[INFO]  ProMotion: disabled WebKit 60fps cap via _WKFeature API
```

### Common Failure Modes

| Log Message                                            | Cause                            | Fix                                             |
| ------------------------------------------------------ | -------------------------------- | ----------------------------------------------- |
| `failed to load QuartzCore framework`                  | Framework path wrong             | Check macOS version                             |
| `displayLinkWithTarget:selector: returned null`        | macOS < 14                       | Expected — silent no-op                         |
| `WKWebView not found in window hierarchy`              | Called too early or wrong window | Ensure called after window is fully initialized |
| `WKPreferences does not respond to _features`          | Very old WebKit                  | Expected on older macOS                         |
| `PreferPageRenderingUpdatesNear60FPSEnabled not found` | WebKit removed the feature key   | Check WebKit release notes                      |
