//! macOS `ProMotion` 120Hz support.
//!
//! Two-pronged approach to unlock 120Hz `requestAnimationFrame` in `WKWebView`:
//!
//! 1. **`CADisplayLink`** — Obtains a display link from `NSScreen.mainScreen`
//!    requesting 120Hz, signaling the `ProMotion` hardware to stay at max rate.
//!
//! 2. **`WKPreferences` private API** — Disables `WebKit`'s internal 60fps cap
//!    (`preferPageRenderingUpdatesNear60FPSEnabled`) so `requestAnimationFrame`
//!    fires at the display's native refresh rate instead of being throttled.
//!
//! # Why Both Are Needed
//!
//! The `CADisplayLink` tells the `ProMotion` display controller to run at 120Hz
//! (without it, the display may idle at 60Hz). But `WebKit` has a separate
//! internal preference that caps `requestAnimationFrame` callbacks to ~60fps
//! regardless of the physical display rate. Both must be addressed.
//!
//! # macOS vs iOS (`CADisplayLink`)
//!
//! On iOS, `CADisplayLink` is created directly via the class factory method
//! `+[CADisplayLink displayLinkWithTarget:selector:]`. On macOS 14+, this
//! factory method does **not** exist. Instead, display links must be obtained
//! from `NSScreen`, `NSWindow`, or `NSView` via their
//! `-displayLinkWithTarget:selector:` instance method. This ties the display
//! link to the correct physical display (important for multi-monitor setups
//! with different refresh rates).
//!
//! # `WKPreferences` Private API
//!
//! Safari exposes a "Prefer Page Rendering Updates near 60fps" feature flag.
//! For embedded `WKWebView`, this is toggled via the private `_WKFeature`
//! enumeration API: `[WKPreferences _features]` returns all feature flags,
//! and `[prefs _setEnabled:NO forFeature:]` disables the 60fps cap.
//! This is safe for non-App Store desktop apps (like Tauri).
//!
//! # Important
//!
//! The `QuartzCore` framework must be dynamically loaded at runtime — it is not
//! automatically linked by Tauri. Without `dlopen`, `CADisplayLink` class lookup
//! returns `None` even on macOS 14+.
//!
//! # Compatibility
//!
//! | macOS Version | Behavior |
//! |---------------|----------|
//! | < 14 (Sonoma) | Silent no-op — `CADisplayLink` unavailable on macOS |
//! | 14+ (Sonoma)  | Display link created via `NSScreen`, 120Hz requested |
//! | Non-`ProMotion`| Silent no-op — display ignores the request |

use std::ffi::{c_void, CStr};
use std::sync::atomic::{AtomicBool, Ordering};

use objc2::runtime::{AnyClass, AnyObject, ClassBuilder, Sel};
use objc2::{msg_send, sel};
use objc2_foundation::{NSRunLoop, NSString};
use objc2_quartz_core::CAFrameRateRange;

/// Guard against duplicate initialization (process-wide singleton).
static PROMOTION_ENABLED: AtomicBool = AtomicBool::new(false);

// FFI: dlopen to load QuartzCore framework at runtime.
extern "C" {
    fn dlopen(path: *const i8, mode: i32) -> *mut c_void;
}
/// `RTLD_LAZY` — resolve symbols on first use.
const RTLD_LAZY: i32 = 1;

/// Path to the `QuartzCore` framework binary.
const QUARTZ_CORE_PATH: &CStr = c"/System/Library/Frameworks/QuartzCore.framework/QuartzCore";

/// Load the `QuartzCore` framework so `CADisplayLink` becomes available.
fn ensure_quartz_core_loaded() {
    unsafe {
        let handle = dlopen(QUARTZ_CORE_PATH.as_ptr(), RTLD_LAZY);
        if handle.is_null() {
            log::warn!("ProMotion: failed to load QuartzCore framework");
        } else {
            log::debug!("ProMotion: QuartzCore framework loaded");
        }
    }
}

/// No-op callback for the `CADisplayLink`.
///
/// # Safety
///
/// Called by the Objective-C runtime on every display refresh.
const unsafe extern "C" fn promotion_step(_this: *mut AnyObject, _sel: Sel, _sender: *mut c_void) {
    // Intentionally empty — the display link's existence in the run loop
    // is sufficient to request 120Hz from the ProMotion controller.
}

/// Register the `OrbitProMotionTarget` Objective-C class.
fn register_target_class() -> Option<&'static AnyClass> {
    const CLASS_NAME: &CStr = c"OrbitProMotionTarget";

    if let Some(cls) = AnyClass::get(CLASS_NAME) {
        return Some(cls);
    }

    let superclass = AnyClass::get(c"NSObject")?;
    let mut builder = ClassBuilder::new(CLASS_NAME, superclass)?;

    let step_fn: unsafe extern "C" fn(*mut AnyObject, Sel, *mut c_void) = promotion_step;
    unsafe {
        builder.add_method(sel!(step:), step_fn);
    }

    Some(builder.register())
}

/// Enable `ProMotion` 120Hz rendering for the application.
///
/// Loads the `QuartzCore` framework, obtains a `CADisplayLink` from
/// `NSScreen.mainScreen` and attaches it to the main run loop requesting
/// 120Hz via `preferredFrameRateRange`.
///
/// This is a **process-wide singleton** — only the first call takes effect.
///
/// Must be called from the main thread.
pub(crate) fn enable_promotion() {
    if PROMOTION_ENABLED.swap(true, Ordering::SeqCst) {
        return;
    }

    ensure_quartz_core_loaded();

    if !try_enable_promotion() {
        PROMOTION_ENABLED.store(false, Ordering::SeqCst);
        log::warn!("ProMotion: failed to enable 120Hz display link");
    }
}

/// Internal implementation that returns false on failure.
fn try_enable_promotion() -> bool {
    // Step 1: Register ObjC target class with a step: callback
    let Some(target_class) = register_target_class() else {
        log::warn!("ProMotion: failed to register target class");
        return false;
    };

    // Step 2: Create target instance
    let target: *mut AnyObject = unsafe { msg_send![target_class, new] };
    if target.is_null() {
        log::warn!("ProMotion: target alloc returned null");
        return false;
    }

    // Step 3: Get NSScreen.mainScreen
    let Some(screen_class) = AnyClass::get(c"NSScreen") else {
        log::warn!("ProMotion: NSScreen class not found");
        return false;
    };
    let main_screen: *mut AnyObject = unsafe { msg_send![screen_class, mainScreen] };
    if main_screen.is_null() {
        log::warn!("ProMotion: NSScreen.mainScreen returned null");
        return false;
    }

    // Step 4: Create CADisplayLink via -[NSScreen displayLinkWithTarget:selector:]
    //
    // IMPORTANT: On macOS 14+, CADisplayLink must be obtained from
    // NSScreen/NSWindow/NSView — the iOS class factory method
    // +[CADisplayLink displayLinkWithTarget:selector:] does NOT exist on macOS.
    let display_link: *mut AnyObject =
        unsafe { msg_send![main_screen, displayLinkWithTarget: target, selector: sel!(step:)] };
    if display_link.is_null() {
        log::warn!(
            "ProMotion: NSScreen.displayLinkWithTarget:selector: returned null (macOS < 14?)"
        );
        return false;
    }
    log::debug!("ProMotion: CADisplayLink obtained from NSScreen.mainScreen");

    // Step 5: Set preferredFrameRateRange to request 120Hz
    // minimum=80, maximum=120, preferred=120 — tells ProMotion to run at max
    let range = CAFrameRateRange::new(80.0, 120.0, 120.0);
    unsafe {
        let _: () = msg_send![display_link, setPreferredFrameRateRange: range];
    }
    log::debug!("ProMotion: preferredFrameRateRange set to (80, 120, 120)");

    // Step 6: Add to main run loop in common modes
    let main_run_loop = NSRunLoop::mainRunLoop();
    let common_modes = NSString::from_str("kCFRunLoopCommonModes");
    unsafe {
        let _: () = msg_send![
            display_link,
            addToRunLoop: &*main_run_loop,
            forMode: &*common_modes
        ];
    }
    log::info!("ProMotion: display link added to main run loop — 120Hz enabled");

    // The display link and target must live for the process lifetime.
    // They are now retained by the run loop; we intentionally do not free them.

    true
}

// ---------------------------------------------------------------------------
// WKWebView 60fps cap removal
// ---------------------------------------------------------------------------

/// Disable `WebKit`'s internal 60fps rendering cap on the `WKWebView` inside
/// the given `NSWindow`.
///
/// `WebKit` defaults to capping `requestAnimationFrame` at ~60fps even on
/// `ProMotion` displays. This uses the private `_WKFeature` API to find
/// the `PreferPageRenderingUpdatesNear60FPSEnabled` feature and disable it,
/// matching Safari's "Prefer Page Rendering Updates near 60fps" feature flag.
///
/// # Safety
///
/// `ns_window` must be a valid `NSWindow` pointer obtained from Tauri.
/// Must be called from the main thread.
pub(crate) fn unlock_webview_framerate(ns_window: *mut c_void) {
    unsafe { try_unlock_webview_framerate(ns_window) }
}

/// Walk the `NSWindow` view hierarchy to find a `WKWebView`.
///
/// # Safety
///
/// `view` must be a valid `NSView` pointer.
unsafe fn find_wk_web_view(view: *mut AnyObject) -> Option<*mut AnyObject> {
    let wk_class = AnyClass::get(c"WKWebView")?;

    let is_wk: bool = msg_send![view, isKindOfClass: wk_class];
    if is_wk {
        return Some(view);
    }

    let subviews: *mut AnyObject = msg_send![view, subviews];
    if subviews.is_null() {
        return None;
    }
    let count: usize = msg_send![subviews, count];
    for i in 0..count {
        let subview: *mut AnyObject = msg_send![subviews, objectAtIndex: i];
        if !subview.is_null() {
            if let Some(found) = find_wk_web_view(subview) {
                return Some(found);
            }
        }
    }

    None
}

/// Internal: find the `WKWebView` and disable its 60fps rendering cap.
///
/// # Safety
///
/// `ns_window` must be a valid `NSWindow` pointer.
unsafe fn try_unlock_webview_framerate(ns_window: *mut c_void) {
    let window: *mut AnyObject = ns_window.cast::<AnyObject>();

    let content_view: *mut AnyObject = msg_send![window, contentView];
    if content_view.is_null() {
        log::warn!("ProMotion: NSWindow contentView is null");
        return;
    }

    let Some(wk_web_view) = find_wk_web_view(content_view) else {
        log::warn!("ProMotion: WKWebView not found in window hierarchy");
        return;
    };
    log::debug!("ProMotion: found WKWebView in window hierarchy");

    let config: *mut AnyObject = msg_send![wk_web_view, configuration];
    if config.is_null() {
        log::warn!("ProMotion: WKWebView.configuration is null");
        return;
    }

    let prefs: *mut AnyObject = msg_send![config, preferences];
    if prefs.is_null() {
        log::warn!("ProMotion: WKPreferences is null");
        return;
    }

    disable_60fps_preference(prefs);
}

/// Enumerate `_WKFeature` flags on `WKPreferences` and disable the 60fps cap.
///
/// Uses `[WKPreferences _features]` to list all feature flags, finds
/// `PreferPageRenderingUpdatesNear60FPSEnabled`, and calls
/// `[prefs _setEnabled:NO forFeature:]`.
///
/// # Safety
///
/// `prefs` must be a valid `WKPreferences` pointer.
unsafe fn disable_60fps_preference(prefs: *mut AnyObject) {
    let Some(prefs_class) = AnyClass::get(c"WKPreferences") else {
        log::warn!("ProMotion: WKPreferences class not found");
        return;
    };

    // _features is a class method returning NSArray<_WKFeature *>
    let has_features: bool = msg_send![prefs_class, respondsToSelector: sel!(_features)];
    if !has_features {
        log::warn!("ProMotion: WKPreferences does not respond to _features");
        return;
    }

    let features: *mut AnyObject = msg_send![prefs_class, _features];
    if features.is_null() {
        log::warn!("ProMotion: [WKPreferences _features] returned null");
        return;
    }

    let count: usize = msg_send![features, count];
    let target_key = NSString::from_str("PreferPageRenderingUpdatesNear60FPSEnabled");
    log::debug!("ProMotion: scanning {count} WebKit features for 60fps preference");

    for i in 0..count {
        let feature: *mut AnyObject = msg_send![features, objectAtIndex: i];
        if feature.is_null() {
            continue;
        }

        let key: *mut AnyObject = msg_send![feature, key];
        if key.is_null() {
            continue;
        }

        let is_match: bool = msg_send![key, isEqualToString: &*target_key];
        if is_match {
            let _: () = msg_send![prefs, _setEnabled: false, forFeature: feature];
            log::info!("ProMotion: disabled WebKit 60fps cap via _WKFeature API");
            return;
        }
    }

    log::warn!(
        "ProMotion: PreferPageRenderingUpdatesNear60FPSEnabled not found \
         in {count} WebKit features"
    );
}
