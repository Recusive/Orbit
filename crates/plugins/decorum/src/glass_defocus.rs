//! Hide `NSGlassEffectView` on window defocus, matching Codex app behavior.
//!
//! When a macOS 26+ window loses key status, the system dims the glass
//! effect views at the compositor level. Rather than fighting this,
//! we take the **Codex approach**: hide the glass view on defocus
//! (sidebar goes solid/opaque) and show it on focus.
//!
//! Since the sidebar CSS is `background: transparent` in glass mode,
//! hiding the glass alone would show nothing. We also set the window
//! background to an opaque color on defocus and restore `clearColor`
//! on focus.
//!
//! Observers fire synchronously on the main thread via
//! `NSNotificationCenter` — no IPC delay.

use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};

use objc2::runtime::{AnyClass, AnyObject, ClassBuilder, Sel};
use objc2::{msg_send, sel};
use objc2_foundation::NSString;

/// Guard against duplicate initialization.
static INITIALIZED: AtomicBool = AtomicBool::new(false);

/// When true, observer callbacks (`on_resign_key`, `on_become_key`) are no-ops.
///
/// Set by [`suspend`]/[`resume`] around native dialog presentation. Without
/// this, `toggle_glass` fires when the main window resigns/becomes key during
/// `NSOpenPanel` — modifying the window's view tree and background color while
/// a dialog transition is in flight, which crashes on macOS 26+.
static SUSPENDED: AtomicBool = AtomicBool::new(false);

/// App-level effective theme, set by the frontend via Tauri command.
///
/// 0 = not yet set (fall back to system appearance),
/// 1 = light,
/// 2 = dark.
static EFFECTIVE_THEME: AtomicU8 = AtomicU8::new(0);

/// Tracks whether glass is currently hidden (window is defocused).
/// When the theme changes while defocused, we re-apply `toggle_glass(true)`
/// so the background color updates immediately without waiting for a focus cycle.
static GLASS_HIDDEN: AtomicBool = AtomicBool::new(false);

// =========================================================================
// View hierarchy — find & toggle NSGlassEffectView
// =========================================================================

/// Recursively walk the view tree. When an `NSGlassEffectView` is found,
/// set its `hidden` property and stop recursing into its children.
///
/// # Safety
///
/// Must be called on the main thread with valid pointers.
unsafe fn set_glass_hidden_recursive(view: *mut AnyObject, glass_class: &AnyClass, hidden: bool) {
    if view.is_null() {
        return;
    }

    let is_glass: bool = msg_send![view, isKindOfClass: glass_class];
    if is_glass {
        let _: () = msg_send![view, setHidden: hidden];
        return;
    }

    let subviews: *mut AnyObject = msg_send![view, subviews];
    if subviews.is_null() {
        return;
    }

    let count: usize = msg_send![subviews, count];
    for i in 0..count {
        let subview: *mut AnyObject = msg_send![subviews, objectAtIndex: i];
        set_glass_hidden_recursive(subview, glass_class, hidden);
    }
}

/// Toggle glass views in Orbit windows and swap window background color.
///
/// Skips `NSPanel` subclasses (`NSOpenPanel`, `NSSavePanel`, etc.) because
/// on macOS 26+ those system panels contain their own `NSGlassEffectView`
/// instances. Modifying them hides the panel's UI and makes it unresponsive.
///
/// # Safety
///
/// Must be called on the main thread.
unsafe fn toggle_glass(hidden: bool) {
    GLASS_HIDDEN.store(hidden, Ordering::Relaxed);

    let Some(glass_class) = AnyClass::get(c"NSGlassEffectView") else {
        return;
    };
    let Some(ns_app_class) = AnyClass::get(c"NSApplication") else {
        return;
    };
    let Some(ns_color_class) = AnyClass::get(c"NSColor") else {
        return;
    };

    let app: *mut AnyObject = msg_send![ns_app_class, sharedApplication];
    if app.is_null() {
        return;
    }

    let windows: *mut AnyObject = msg_send![app, windows];
    if windows.is_null() {
        return;
    }

    // Prepare the replacement background color.
    // On focus: clearColor (transparent, so glass shows through).
    // On defocus: use the app's sidebar tint color (fully opaque) to match
    //   the theme. The frontend sets EFFECTIVE_THEME via set_effective_theme();
    //   fall back to the system appearance if it hasn't been set yet.
    let bg_color: *mut AnyObject = if hidden {
        let is_dark = match EFFECTIVE_THEME.load(Ordering::Relaxed) {
            1 => false,
            2 => true,
            _ => {
                // Fallback: read system appearance (before frontend calls in).
                let appearance: *mut AnyObject = msg_send![app, effectiveAppearance];
                if appearance.is_null() {
                    false
                } else {
                    let name: *mut AnyObject = msg_send![appearance, name];
                    if name.is_null() {
                        false
                    } else {
                        let dark_aqua = NSString::from_str("NSAppearanceNameDarkAqua");
                        let matches: bool = msg_send![name, isEqualToString: &*dark_aqua];
                        matches
                    }
                }
            },
        };

        // Defocus fallback colors (fully opaque, no glass).
        //   Light: #F0F0F0  (near-white, matches the light LG surface tone)
        //   Dark:  #121212  (neutral gray-1)
        let (r, g, b) = if is_dark {
            (
                f64::from(0x12_u8) / 255.0,
                f64::from(0x12_u8) / 255.0,
                f64::from(0x12_u8) / 255.0,
            )
        } else {
            (
                f64::from(0xF0_u8) / 255.0,
                f64::from(0xF0_u8) / 255.0,
                f64::from(0xF0_u8) / 255.0,
            )
        };
        let color: *mut AnyObject = msg_send![
            ns_color_class,
            colorWithSRGBRed: r,
            green: g,
            blue: b,
            alpha: 1.0_f64
        ];
        color
    } else {
        msg_send![ns_color_class, clearColor]
    };

    // Skip NSPanel subclasses (NSOpenPanel, NSSavePanel, print panels, etc.)
    // On macOS 26+, these system panels have their own NSGlassEffectView
    // instances. If we hide those or change the panel's backgroundColor,
    // the panel becomes invisible/unresponsive and the app appears to hang.
    let ns_panel_class = AnyClass::get(c"NSPanel");

    let win_count: usize = msg_send![windows, count];
    for i in 0..win_count {
        let window: *mut AnyObject = msg_send![windows, objectAtIndex: i];

        // Never modify system panels — their glass is not ours to touch.
        if let Some(panel_class) = ns_panel_class {
            let is_panel: bool = msg_send![window, isKindOfClass: panel_class];
            if is_panel {
                continue;
            }
        }

        let content_view: *mut AnyObject = msg_send![window, contentView];
        if content_view.is_null() {
            continue;
        }

        // Check if this window actually has glass views before modifying it.
        // We only want to swap background on the main window that has glass.
        let has_glass = has_glass_view(content_view, glass_class);
        if !has_glass {
            continue;
        }

        set_glass_hidden_recursive(content_view, glass_class, hidden);

        // Swap window background color so the area behind the transparent
        // sidebar CSS becomes opaque when glass is hidden.
        let _: () = msg_send![window, setBackgroundColor: bg_color];
    }
}

/// Check if a view tree contains any `NSGlassEffectView`.
///
/// # Safety
///
/// Must be called on the main thread.
unsafe fn has_glass_view(view: *mut AnyObject, glass_class: &AnyClass) -> bool {
    if view.is_null() {
        return false;
    }

    let is_glass: bool = msg_send![view, isKindOfClass: glass_class];
    if is_glass {
        return true;
    }

    let subviews: *mut AnyObject = msg_send![view, subviews];
    if subviews.is_null() {
        return false;
    }

    let count: usize = msg_send![subviews, count];
    for i in 0..count {
        let subview: *mut AnyObject = msg_send![subviews, objectAtIndex: i];
        if has_glass_view(subview, glass_class) {
            return true;
        }
    }
    false
}

// =========================================================================
// ObjC notification callbacks
// =========================================================================

/// Extract the `NSWindow` from a notification's `object` property.
///
/// # Safety
///
/// Must be called on the main thread with a valid notification pointer.
unsafe fn notification_window(notification: *mut AnyObject) -> *mut AnyObject {
    if notification.is_null() {
        return std::ptr::null_mut();
    }
    msg_send![notification, object]
}

/// Check whether the notification's originating window is an `NSPanel`.
///
/// `NSOpenPanel`, `NSSavePanel`, print/font/color panels all inherit from
/// `NSPanel`. We must ignore their key-status changes — otherwise
/// `toggle_glass` fires during panel presentation and corrupts the panel
/// rendering on macOS 26+ (where system panels have their own glass views).
///
/// # Safety
///
/// Must be called on the main thread with a valid notification pointer.
unsafe fn notification_is_from_panel(notification: *mut AnyObject) -> bool {
    let window = notification_window(notification);
    if window.is_null() {
        return false;
    }
    let Some(panel_class) = AnyClass::get(c"NSPanel") else {
        return false;
    };
    msg_send![window, isKindOfClass: panel_class]
}

/// Check whether the notification's originating window contains glass views.
///
/// Used by [`on_become_key`] to avoid restoring glass when a non-glass child
/// window (e.g., the embedded browser) becomes key. Without this check, the
/// browser child window's `becomeKey` notification would re-show glass on the
/// main window while it's still defocused — causing macOS to apply its
/// compositor-level defocus tint.
///
/// # Safety
///
/// Must be called on the main thread with a valid notification pointer.
unsafe fn notification_window_has_glass(notification: *mut AnyObject) -> bool {
    let window = notification_window(notification);
    if window.is_null() {
        return false;
    }
    let Some(glass_class) = AnyClass::get(c"NSGlassEffectView") else {
        return false;
    };
    let content_view: *mut AnyObject = msg_send![window, contentView];
    if content_view.is_null() {
        return false;
    }
    has_glass_view(content_view, glass_class)
}

/// Window resigned key → hide glass, set opaque background.
///
/// Ignores notifications originating from `NSPanel` subclasses
/// (`NSOpenPanel`, `NSSavePanel`, etc.) to avoid corrupting their UI.
///
/// # Safety
///
/// Called by the Objective-C runtime via `NSNotificationCenter`.
#[allow(
    clippy::missing_const_for_fn,
    reason = "platform-conditional: lint fires on non-macOS stub but not on macOS FFI body"
)]
unsafe extern "C" fn on_resign_key(_this: *mut AnyObject, _cmd: Sel, notification: *mut AnyObject) {
    if SUSPENDED.load(Ordering::Relaxed) {
        return;
    }
    if notification_is_from_panel(notification) {
        return;
    }
    toggle_glass(true);
}

/// Window became key → show glass, set transparent background.
///
/// Ignores notifications originating from `NSPanel` subclasses
/// (`NSOpenPanel`, `NSSavePanel`, etc.) to avoid corrupting their UI.
///
/// Also ignores notifications from windows without glass views (e.g., the
/// embedded browser child window). When such a window becomes key, the main
/// window's glass must stay hidden — otherwise macOS applies its
/// compositor-level defocus tint to the still-defocused main window.
///
/// Also skipped when [`SUSPENDED`] is set (during native dialog presentation).
///
/// # Safety
///
/// Called by the Objective-C runtime via `NSNotificationCenter`.
#[allow(
    clippy::missing_const_for_fn,
    reason = "platform-conditional: lint fires on non-macOS stub but not on macOS FFI body"
)]
unsafe extern "C" fn on_become_key(_this: *mut AnyObject, _cmd: Sel, notification: *mut AnyObject) {
    if SUSPENDED.load(Ordering::Relaxed) {
        return;
    }
    if notification_is_from_panel(notification) {
        return;
    }
    // Only restore glass if the window that became key actually has glass.
    // When a child window (embedded browser) becomes key, the main window is
    // still defocused — re-showing its glass would cause the macOS compositor
    // to apply its defocus tint instead of our opaque fallback color.
    if !notification_window_has_glass(notification) {
        return;
    }
    toggle_glass(false);
}

// =========================================================================
// ObjC class & observer setup
// =========================================================================

/// Register the observer class and wire up notification center.
///
/// # Safety
///
/// Must be called on the main thread.
unsafe fn install_observers() {
    const CLASS_NAME: &std::ffi::CStr = c"OrbitGlassDefocusObserver";

    let observer_class = if let Some(cls) = AnyClass::get(CLASS_NAME) {
        cls
    } else {
        let Some(superclass) = AnyClass::get(c"NSObject") else {
            log::warn!("Glass: NSObject class not found");
            return;
        };
        let Some(mut builder) = ClassBuilder::new(CLASS_NAME, superclass) else {
            log::warn!("Glass: failed to create class builder");
            return;
        };

        let resign_fn: unsafe extern "C" fn(*mut AnyObject, Sel, *mut AnyObject) = on_resign_key;
        let become_fn: unsafe extern "C" fn(*mut AnyObject, Sel, *mut AnyObject) = on_become_key;

        builder.add_method(sel!(onResignKey:), resign_fn);
        builder.add_method(sel!(onBecomeKey:), become_fn);

        builder.register()
    };

    let observer: *mut AnyObject = msg_send![observer_class, new];
    if observer.is_null() {
        log::warn!("Glass: failed to create observer");
        return;
    }

    // The observer must live forever — leak it intentionally.
    // (NSNotificationCenter does NOT retain its observers.)

    let Some(nc_class) = AnyClass::get(c"NSNotificationCenter") else {
        log::warn!("Glass: NSNotificationCenter not found");
        return;
    };
    let center: *mut AnyObject = msg_send![nc_class, defaultCenter];
    if center.is_null() {
        log::warn!("Glass: defaultCenter is null");
        return;
    }

    let resign_name = NSString::from_str("NSWindowDidResignKeyNotification");
    let become_name = NSString::from_str("NSWindowDidBecomeKeyNotification");

    let _: () = msg_send![
        center,
        addObserver: observer,
        selector: sel!(onResignKey:),
        name: &*resign_name,
        object: std::ptr::null::<AnyObject>()
    ];

    let _: () = msg_send![
        center,
        addObserver: observer,
        selector: sel!(onBecomeKey:),
        name: &*become_name,
        object: std::ptr::null::<AnyObject>()
    ];

    log::info!("Glass: installed defocus observers — glass hides on resign, shows on become key");
}

// =========================================================================
// Public API
// =========================================================================

/// Install `NSNotificationCenter` observers that hide glass on defocus.
///
/// On macOS < 26 (no `NSGlassEffectView`), this is a no-op.
///
/// Must be called from the main thread (Tauri plugin setup is fine).
pub(crate) fn suppress_glass_defocus_dimming() {
    if INITIALIZED.swap(true, Ordering::SeqCst) {
        return;
    }

    if AnyClass::get(c"NSGlassEffectView").is_none() {
        log::warn!("Glass: NSGlassEffectView class not found (macOS < 26?)");
        return;
    }

    unsafe {
        install_observers();
    }
}

/// Set the app-level effective theme so defocus background matches Orbit's
/// chosen theme rather than the system appearance.
///
/// If the window is currently defocused (glass hidden), re-applies
/// `toggle_glass(true)` so the background color updates immediately
/// without waiting for a focus → defocus cycle.
pub(crate) fn set_effective_theme(is_dark: bool) {
    EFFECTIVE_THEME.store(if is_dark { 2 } else { 1 }, Ordering::Relaxed);

    // Re-paint the defocus background if the window is already unfocused.
    if GLASS_HIDDEN.load(Ordering::Relaxed) {
        unsafe {
            toggle_glass(true);
        }
    }
}

/// Suspend glass defocus observers — callbacks become no-ops.
///
/// Used by [`crate::WebviewWindowExt::pick_folder_native`] around native
/// dialog presentation. Without suspension, `toggle_glass` fires when the
/// main window resigns/becomes key during the dialog, modifying the view tree
/// mid-transition — which crashes on macOS 26+.
pub(crate) fn suspend() {
    SUSPENDED.store(true, Ordering::Relaxed);
}

/// Resume glass defocus observers after dialog closes.
pub(crate) fn resume() {
    SUSPENDED.store(false, Ordering::Relaxed);
}
