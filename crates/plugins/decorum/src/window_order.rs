//! macOS child window z-ordering fix.
//!
//! When the user clicks the main Tauri window (parent), the child browser
//! window can visually appear behind the parent's `WKWebView` content. This
//! is a known macOS/Tauri issue where `addChildWindow:ordered:NSWindowAbove`
//! does not reliably maintain z-ordering after the parent becomes key.
//!
//! The fix: call `[NSWindow orderFront:nil]` on every child window whenever
//! the parent gains focus. Unlike `makeKeyAndOrderFront:`, `orderFront:`
//! brings the window to the front of the z-order **without** stealing
//! keyboard focus from the parent.
//!
//! # Safety
//!
//! `orderFront:` also makes hidden windows visible, so the caller **must**
//! ensure the target window is currently visible (e.g., via Tauri's
//! `is_visible()`) before calling these functions. Calling `orderFront:` on
//! a window hidden by Tauri's `hide()` would bypass Tauri's internal state
//! tracking and cause undefined behavior.

use objc2::msg_send;
use objc2::runtime::{AnyClass, AnyObject};

/// Re-order all **visible** child windows of the application's key window to
/// the front.
///
/// Uses `NSWindow.orderFront:nil` which adjusts z-ordering without stealing
/// keyboard focus (unlike `makeKeyAndOrderFront:` which Tauri's `show()` uses).
///
/// **Caller responsibility:** Only call this when you have confirmed (via
/// Tauri's `is_visible()`) that the child windows are currently visible.
/// See module-level docs for why this matters.
///
/// **Must be called from the main thread.** Tauri's `on_window_event` handlers
/// run on the main thread, so this is safe to call directly from those handlers.
pub(crate) fn order_child_windows_front() {
    let Some(ns_app_class) = AnyClass::get(c"NSApplication") else {
        log::debug!("WindowOrder: NSApplication class not found");
        return;
    };

    let app: *mut AnyObject = unsafe { msg_send![ns_app_class, sharedApplication] };
    if app.is_null() {
        return;
    }

    // Try key window first (the window that just gained focus), then main window
    let key_window: *mut AnyObject = unsafe { msg_send![app, keyWindow] };
    let target_window = if key_window.is_null() {
        let main_window: *mut AnyObject = unsafe { msg_send![app, mainWindow] };
        if main_window.is_null() {
            return;
        }
        main_window
    } else {
        key_window
    };

    order_children_of(target_window);
}

/// Apply rounded corners to all child windows of the application.
///
/// Iterates `[NSApplication windows]` and applies corner radius to any window
/// that has a non-nil `parentWindow` (i.e., Tauri child windows like the embedded
/// browser). This is more reliable than `keyWindow.childWindows` because the
/// browser child window may itself become the key window after creation.
///
/// For each child window:
/// 1. Sets `window.opaque = NO` so the compositor renders transparent corners
/// 2. Sets `window.backgroundColor = NSColor.clearColor` to remove opaque fill
/// 3. Sets `contentView.layer.cornerRadius` + `masksToBounds` to clip the `WKWebView`
/// 4. Also applies to all subviews (`WKWebView` may have its own compositor layer)
///
/// **Must be called from the main thread.**
pub(crate) fn set_child_windows_corner_radius(radius: f64) {
    let Some(ns_app_class) = AnyClass::get(c"NSApplication") else {
        return;
    };

    let app: *mut AnyObject = unsafe { msg_send![ns_app_class, sharedApplication] };
    if app.is_null() {
        return;
    }

    // Get ALL application windows — more reliable than keyWindow.childWindows
    // which fails when the child window itself becomes the key window.
    let windows: *mut AnyObject = unsafe { msg_send![app, windows] };
    if windows.is_null() {
        return;
    }

    let count: usize = unsafe { msg_send![windows, count] };
    let mut applied = 0usize;

    for i in 0..count {
        let window: *mut AnyObject = unsafe { msg_send![windows, objectAtIndex: i] };
        if window.is_null() {
            continue;
        }

        // Only process child windows (those that have a parent).
        let parent: *mut AnyObject = unsafe { msg_send![window, parentWindow] };
        if parent.is_null() {
            continue;
        }

        // ── Make window non-opaque ──
        // Borderless NSWindows are opaque by default. Without this, the window
        // draws an opaque background at the corners even when masksToBounds
        // clips the layer content — the rounded corners appear black or white.
        unsafe {
            let _: () = msg_send![window, setOpaque: false];
        }

        // ── Set clear background color ──
        let Some(ns_color_class) = AnyClass::get(c"NSColor") else {
            continue;
        };
        let clear_color: *mut AnyObject = unsafe { msg_send![ns_color_class, clearColor] };
        if !clear_color.is_null() {
            unsafe {
                let _: () = msg_send![window, setBackgroundColor: clear_color];
            }
        }

        // ── Apply corner radius to content view ──
        let content_view: *mut AnyObject = unsafe { msg_send![window, contentView] };
        if content_view.is_null() {
            continue;
        }

        unsafe {
            let _: () = msg_send![content_view, setWantsLayer: true];
            let layer: *mut AnyObject = msg_send![content_view, layer];
            if !layer.is_null() {
                let _: () = msg_send![layer, setCornerRadius: radius];
                let _: () = msg_send![layer, setMasksToBounds: true];
            }

            // ── Also apply to subviews (belt-and-suspenders) ──
            // WKWebView may use its own compositor layer that doesn't respect
            // the parent's mask. Applying to subviews directly ensures clipping.
            let subviews: *mut AnyObject = msg_send![content_view, subviews];
            if !subviews.is_null() {
                let sub_count: usize = msg_send![subviews, count];
                for j in 0..sub_count {
                    let subview: *mut AnyObject = msg_send![subviews, objectAtIndex: j];
                    if subview.is_null() {
                        continue;
                    }
                    let _: () = msg_send![subview, setWantsLayer: true];
                    let sub_layer: *mut AnyObject = msg_send![subview, layer];
                    if !sub_layer.is_null() {
                        let _: () = msg_send![sub_layer, setCornerRadius: radius];
                        let _: () = msg_send![sub_layer, setMasksToBounds: true];
                    }
                }
            }
        }

        applied += 1;
    }

    log::debug!("WindowOrder: applied {radius}px corner radius to {applied} child window(s)");
}

/// Call `orderFront:nil` on every child of the given `NSWindow`.
fn order_children_of(window: *mut AnyObject) {
    let child_windows: *mut AnyObject = unsafe { msg_send![window, childWindows] };
    if child_windows.is_null() {
        return;
    }

    let count: usize = unsafe { msg_send![child_windows, count] };
    for i in 0..count {
        let child: *mut AnyObject = unsafe { msg_send![child_windows, objectAtIndex: i] };
        if child.is_null() {
            continue;
        }
        // Only bring visible child windows to front.
        // Hidden windows (isVisible == NO) must NOT receive orderFront:
        // because it would make them visible, bypassing Tauri's state tracking.
        let is_visible: bool = unsafe { msg_send![child, isVisible] };
        if is_visible {
            unsafe {
                let _: () = msg_send![child, orderFront: std::ptr::null_mut::<AnyObject>()];
            }
        }
    }

    if count > 0 {
        log::debug!("WindowOrder: checked {count} child window(s) for z-ordering");
    }
}
