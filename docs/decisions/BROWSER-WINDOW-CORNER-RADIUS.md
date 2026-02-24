# Decision: Native Browser Window Corner Radius

**Date:** 2026-02-23
**Status:** Implemented
**Branch:** `fix/0.0.5`

---

## Problem

The embedded browser panel overflows at the bottom corners of the ActivityCard it sits inside.

The ActivityCard has `border-radius: 10px` and `overflow: hidden`, which clips normal DOM content. But the browser is a **native macOS child NSWindow** — not a DOM element — so CSS properties have no effect on it. The rectangular native window pokes out at the bottom corners of the rounded card.

A previous workaround subtracted 10px from the bottom of the webview bounds (`WEBVIEW_BOTTOM_INSET = CONTENT_CARD.borderRadius`), shrinking the browser to avoid the rounded area. This prevented overflow but created a visible **gap** at the bottom of the panel.

```
Before (gap workaround):

┌──────────────────────────────┐  ← ActivityCard (10px radius)
│  Browser Toolbar             │
│                              │
│  ┌────────────────────────┐  │
│  │  Native Browser Window │  │
│  │  (WKWebView)           │  │
│  │                        │  │
│  └────────────────────────┘  │  ← 10px gap here
╰──────────────────────────────╯
```

## Why CSS Can't Fix This

The browser is created by Tauri's `WebviewWindowBuilder` as a separate `NSWindow` added to the main window via `addChildWindow:ordered:NSWindowAbove`. It lives in the macOS window server — a completely different compositing layer from the parent webview's DOM tree. CSS `overflow: hidden`, `border-radius`, `clip-path`, and `backdrop-filter` operate on the DOM layer and have zero influence over native child windows.

The only way to round a native NSWindow is through the Objective-C runtime: `CALayer.cornerRadius` on the window's content view.

## What Changed

### 1. Removed the Bottom Gap (TypeScript)

**File:** `apps/agent/src/components/browser/browser-panel.tsx`

Deleted `WEBVIEW_BOTTOM_INSET`, `useFullscreen`, and `CONTENT_CARD` imports. The browser now fills the full viewport height with no artificial gap.

### 2. Added Native Corner Radius (Rust — decorum plugin)

**File:** `crates/plugins/decorum/src/window_order.rs`

Added `set_child_windows_corner_radius(radius)` which applies `CALayer.cornerRadius` + `masksToBounds` to all child windows via the Objective-C runtime.

### 3. Called After Window Creation (Rust — browser commands)

**File:** `src-tauri/src/commands/browser/mod.rs`

After `builder.build()`, dispatches the corner radius call to the main thread:

```rust
const BROWSER_CORNER_RADIUS: f64 = 10.0;

#[cfg(target_os = "macos")]
{
    let radius = BROWSER_CORNER_RADIUS;
    if let Err(e) = app.run_on_main_thread(move || {
        orbit_plugin_decorum::set_child_windows_corner_radius(radius);
    }) {
        log::warn!("Failed to set browser corner radius: {e}");
    }
}
```

## Why the First Attempt Failed

The initial implementation had three compounding bugs:

### Bug 1: Wrong Window Discovery

Used `keyWindow.childWindows` to find the browser. But after `WebviewWindowBuilder::build()`, macOS makes the newly-created child window the key window. So `keyWindow` pointed to the **browser** (no children), not the **main window** (which has the browser as a child).

**Fix:** Iterate `[NSApplication windows]` and filter by `parentWindow != nil`. This finds child windows regardless of which window is currently key.

### Bug 2: Opaque Window Background

Borderless `NSWindow` objects are `opaque = YES` by default. Even when `masksToBounds` clips the CALayer content to rounded corners, the window itself still draws an opaque solid-color rectangle — the rounded corners appear as black or white rectangles.

**Fix:** Set `window.opaque = NO` and `window.backgroundColor = NSColor.clearColor`. This tells the macOS compositor to render transparency at the window's corners.

### Bug 3: WKWebView Layer Independence

WKWebView can use its own compositor surface that may not respect its parent view's `masksToBounds`. Setting corner radius only on the content view might not clip the actual web content.

**Fix:** Apply `cornerRadius` + `masksToBounds` to both the content view's layer AND all subview layers (belt-and-suspenders).

## Architecture

```
set_child_windows_corner_radius(radius):

  NSApplication.windows          ← iterate ALL windows
       │
       ├── Main Window           ← parentWindow == nil → skip
       └── Browser Window        ← parentWindow != nil → process
            │
            ├── setOpaque: NO
            ├── setBackgroundColor: clearColor
            │
            └── contentView
                 ├── layer.cornerRadius = 10
                 ├── layer.masksToBounds = YES
                 │
                 └── subviews (WKWebView, etc.)
                      ├── layer.cornerRadius = 10
                      └── layer.masksToBounds = YES
```

## Why This Lives in `orbit-plugin-decorum`

The `orbit-app` crate (src-tauri) has `unsafe_code = "forbid"` in its workspace lints. All `objc2::msg_send!` calls require `unsafe` blocks. The `orbit-plugin-decorum` crate is the designated place for macOS-specific native window manipulation — it has `unsafe_code = "allow"` and already depends on `objc2`, `objc2-foundation`, and `objc2-quartz-core`.

## Files Modified

| File                                                  | Change                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| `apps/agent/src/components/browser/browser-panel.tsx` | Removed bottom inset gap                                   |
| `crates/plugins/decorum/src/window_order.rs`          | Added `set_child_windows_corner_radius`                    |
| `crates/plugins/decorum/src/lib.rs`                   | Exported the new function with cross-platform wrapper      |
| `src-tauri/src/commands/browser/mod.rs`               | Added `BROWSER_CORNER_RADIUS` constant and post-build call |

## Platform Behavior

| Platform      | Behavior                                                            |
| ------------- | ------------------------------------------------------------------- |
| macOS         | Full corner radius via CALayer (NSVisualEffectView compatible)      |
| Windows/Linux | No-op (function body is empty behind `#[cfg(target_os = "macos")]`) |
