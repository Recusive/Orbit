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
