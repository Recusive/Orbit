//! macOS traffic light (close/minimize/zoom) visibility toggle.
//!
//! Hide: `setHidden: YES` on each button.
//! Show: `setHidden: NO` then reposition at `(x, y)`.
//!
//! Repositioning on show is required because `drawRect:` (which normally
//! maintains button positions) only fires when the view is dirty — toggling
//! hidden state alone doesn't trigger it, so buttons revert to defaults.

use objc2::msg_send;
use objc2::runtime::{AnyClass, AnyObject, Bool};

/// `NSWindowButton` constants.
const NS_WINDOW_CLOSE_BUTTON: usize = 0;
const NS_WINDOW_MINIATURIZE_BUTTON: usize = 1;
const NS_WINDOW_ZOOM_BUTTON: usize = 2;

const BUTTON_TYPES: [usize; 3] = [
    NS_WINDOW_CLOSE_BUTTON,
    NS_WINDOW_MINIATURIZE_BUTTON,
    NS_WINDOW_ZOOM_BUTTON,
];

// ─── FFI types ─────────────────────────────────────────────────────────────

#[repr(C)]
#[derive(Copy, Clone)]
struct CGPoint {
    x: f64,
    y: f64,
}

unsafe impl objc2::Encode for CGPoint {
    const ENCODING: objc2::Encoding = objc2::Encoding::Struct(
        "CGPoint",
        &[objc2::Encoding::Double, objc2::Encoding::Double],
    );
}

#[repr(C)]
#[derive(Copy, Clone)]
struct CGRect {
    origin: CGPoint,
    size: CGPoint, // CGSize has same layout as CGPoint (width, height)
}

unsafe impl objc2::Encode for CGRect {
    const ENCODING: objc2::Encoding =
        objc2::Encoding::Struct("CGRect", &[CGPoint::ENCODING, CGPoint::ENCODING]);
}

// ─── Public API ────────────────────────────────────────────────────────────

/// Show or hide the traffic light buttons.
///
/// Must be called from the main thread.
pub(crate) fn set_traffic_lights_visible(visible: bool, x: f64, y: f64) {
    let Some(ns_window) = find_main_window() else {
        log::debug!("traffic_lights: no main NSWindow found");
        return;
    };

    let hidden = Bool::new(!visible);

    for button_type in BUTTON_TYPES {
        let button: *mut AnyObject =
            unsafe { msg_send![ns_window, standardWindowButton: button_type] };
        if button.is_null() {
            continue;
        }
        let _: () = unsafe { msg_send![button, setHidden: hidden] };
    }

    // After unhiding, reposition buttons because drawRect (which normally
    // maintains positions) won't fire until the webview content changes.
    if visible {
        reposition_buttons(ns_window, x, y);
    }
}

// ─── Positioning ───────────────────────────────────────────────────────────

/// Reposition traffic light buttons at `(x, y)` from the window's top-left.
///
/// Replicates the exact logic from wry's `inset_traffic_lights`:
/// 1. Resize `NSTitlebarContainerView` to accommodate the y offset
/// 2. Set each button's `frameOrigin` with correct inter-button spacing
fn reposition_buttons(ns_window: *mut AnyObject, x: f64, y: f64) {
    let close: *mut AnyObject =
        unsafe { msg_send![ns_window, standardWindowButton: NS_WINDOW_CLOSE_BUTTON] };
    if close.is_null() {
        return;
    }
    let miniaturize: *mut AnyObject =
        unsafe { msg_send![ns_window, standardWindowButton: NS_WINDOW_MINIATURIZE_BUTTON] };
    if miniaturize.is_null() {
        return;
    }
    let zoom: *mut AnyObject =
        unsafe { msg_send![ns_window, standardWindowButton: NS_WINDOW_ZOOM_BUTTON] };

    // close → superview (NSTitlebarView) → superview (NSTitlebarContainerView)
    let title_bar_container: *mut AnyObject = unsafe {
        let parent: *mut AnyObject = msg_send![close, superview];
        msg_send![parent, superview]
    };
    if title_bar_container.is_null() {
        return;
    }

    // Resize title bar container to accommodate the y offset.
    let close_rect: CGRect = unsafe { msg_send![close, frame] };
    let button_height = close_rect.size.y; // CGSize .y = height
    let title_bar_h = button_height + y;

    let mut container_rect: CGRect = unsafe { msg_send![title_bar_container, frame] };
    let window_frame: CGRect = unsafe { msg_send![ns_window, frame] };
    container_rect.size.y = title_bar_h;
    container_rect.origin.y = window_frame.size.y - title_bar_h;
    let _: () = unsafe { msg_send![title_bar_container, setFrame: container_rect] };

    // Calculate inter-button spacing from current layout.
    let mini_rect: CGRect = unsafe { msg_send![miniaturize, frame] };
    let spacing = mini_rect.origin.x - close_rect.origin.x;

    // Position each button.
    let buttons: [*mut AnyObject; 3] = [close, miniaturize, zoom];
    for (i, button) in buttons.iter().enumerate() {
        if button.is_null() {
            continue;
        }
        let mut rect: CGRect = unsafe { msg_send![*button, frame] };
        let idx = u8::try_from(i).unwrap_or(0);
        rect.origin.x = f64::from(idx).mul_add(spacing, x);
        let _: () = unsafe { msg_send![*button, setFrameOrigin: rect.origin] };
    }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/// Find the main (key) `NSWindow`.
fn find_main_window() -> Option<*mut AnyObject> {
    let ns_app_class = AnyClass::get(c"NSApplication")?;
    let app: *mut AnyObject = unsafe { msg_send![ns_app_class, sharedApplication] };
    if app.is_null() {
        return None;
    }

    let key_window: *mut AnyObject = unsafe { msg_send![app, keyWindow] };
    if !key_window.is_null() {
        return Some(key_window);
    }

    let windows: *mut AnyObject = unsafe { msg_send![app, windows] };
    if windows.is_null() {
        return None;
    }
    let count: usize = unsafe { msg_send![windows, count] };
    if count == 0 {
        return None;
    }
    let window: *mut AnyObject = unsafe { msg_send![windows, objectAtIndex: 0_usize] };
    if window.is_null() {
        None
    } else {
        Some(window)
    }
}
