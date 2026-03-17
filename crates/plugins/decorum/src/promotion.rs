//! macOS `ProMotion` 120Hz support.
//!
//! Two-pronged approach to unlock 120Hz `requestAnimationFrame` in `WKWebView`:
//!
//! 1. **`CADisplayLink`** — Obtains a display link from `NSScreen.mainScreen`
//!    requesting 120Hz, signaling the `ProMotion` hardware to stay at max rate.
//!
//! 2. **`WKPreferences` `_WKFeature` API** — Disables `WebKit`'s internal 60fps
//!    cap (`PreferPageRenderingUpdatesNear60FPSEnabled`) so
//!    `requestAnimationFrame` fires at the display's native refresh rate.
//!
//! # 60Hz Display Guard
//!
//! On 60Hz displays (e.g. `MacBook` Air), both mechanisms are skipped entirely.
//! There is no benefit to requesting 120Hz from hardware that cannot deliver it,
//! and the `_WKFeature` API has a known side-effect that breaks the fullscreen
//! slide-down header on some machines.
//!
//! # Deferred Initialization
//!
//! The `WKWebView` may not exist in the view hierarchy when `enable_promotion`
//! is called during Tauri's `setup` callback. The framerate unlock is therefore
//! deferred using `performSelector:withObject:afterDelay:` with a retry
//! mechanism (up to 3 attempts at 1-second intervals).
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
//! | 60Hz displays | Silent no-op — both mechanisms skipped |

use std::ffi::{c_void, CStr};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};

use objc2::runtime::{AnyClass, AnyObject, ClassBuilder, Sel};
use objc2::{msg_send, sel};
use objc2_foundation::{NSRunLoop, NSString};
use objc2_quartz_core::CAFrameRateRange;

// =============================================================================
// CADisplayLink — 120Hz hardware refresh
// =============================================================================

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
#[allow(
    clippy::missing_const_for_fn,
    reason = "platform-conditional: lint fires on non-macOS stub but not on macOS FFI body"
)]
unsafe extern "C" fn promotion_step(_this: *mut AnyObject, _sel: Sel, _sender: *mut c_void) {
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

// CoreGraphics FFI for display refresh rate detection.
extern "C" {
    fn CGMainDisplayID() -> u32;
    fn CGDisplayCopyDisplayMode(display: u32) -> *mut c_void;
    fn CGDisplayModeGetRefreshRate(mode: *mut c_void) -> f64;
    fn CGDisplayModeRelease(mode: *mut c_void);
}

/// Query the refresh rate of the main display via `CoreGraphics`.
///
/// Returns the current mode's refresh rate in Hz. `ProMotion` displays
/// report 120.0, standard displays report 60.0. Some displays may report
/// 0.0 (meaning "default/unknown"), which we treat as 60Hz.
fn screen_refresh_rate() -> f64 {
    unsafe {
        let display_id = CGMainDisplayID();
        let mode = CGDisplayCopyDisplayMode(display_id);
        if mode.is_null() {
            return 0.0;
        }
        let rate = CGDisplayModeGetRefreshRate(mode);
        CGDisplayModeRelease(mode);
        log::debug!("ProMotion: CGDisplayModeGetRefreshRate = {rate:.0}Hz");
        rate
    }
}

/// Enable `ProMotion` 120Hz rendering for the application.
///
/// Loads the `QuartzCore` framework, obtains a `CADisplayLink` from
/// `NSScreen.mainScreen` and attaches it to the main run loop requesting
/// 120Hz via `preferredFrameRateRange`.
///
/// On displays that report ≤ 60Hz via `CGDisplayModeGetRefreshRate`, this is a
/// no-op — there's no benefit to creating a display link that requests a
/// frame rate the hardware can't deliver.
///
/// This is a **process-wide singleton** — only the first call takes effect.
///
/// Must be called from the main thread.
pub(crate) fn enable_promotion() {
    if PROMOTION_ENABLED.swap(true, Ordering::SeqCst) {
        return;
    }

    let rate = screen_refresh_rate();
    // 0.0 means "default/unknown" — also skip in that case.
    if rate <= 60.0 {
        log::info!(
            "ProMotion: display refresh rate is {rate:.0}Hz — \
             skipping (no high-refresh-rate hardware)"
        );
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
    let Some(target_class) = register_target_class() else {
        log::warn!("ProMotion: failed to register target class");
        return false;
    };

    let target: *mut AnyObject = unsafe { msg_send![target_class, new] };
    if target.is_null() {
        log::warn!("ProMotion: target alloc returned null");
        return false;
    }

    let Some(screen_class) = AnyClass::get(c"NSScreen") else {
        log::warn!("ProMotion: NSScreen class not found");
        return false;
    };
    let main_screen: *mut AnyObject = unsafe { msg_send![screen_class, mainScreen] };
    if main_screen.is_null() {
        log::warn!("ProMotion: NSScreen.mainScreen returned null");
        return false;
    }

    // On macOS 14+, CADisplayLink must be obtained from NSScreen — the iOS
    // class factory +[CADisplayLink displayLinkWithTarget:selector:] does NOT
    // exist on macOS.
    let display_link: *mut AnyObject =
        unsafe { msg_send![main_screen, displayLinkWithTarget: target, selector: sel!(step:)] };
    if display_link.is_null() {
        log::warn!(
            "ProMotion: NSScreen.displayLinkWithTarget:selector: returned null (macOS < 14?)"
        );
        return false;
    }

    // minimum=80, maximum=120, preferred=120 — tells ProMotion to run at max
    let range = CAFrameRateRange::new(80.0, 120.0, 120.0);
    unsafe {
        let _: () = msg_send![display_link, setPreferredFrameRateRange: range];
    }

    // Add to main run loop. The string "kCFRunLoopCommonModes" matches the
    // actual value of the Core Foundation constant (stable since macOS 10.0).
    let main_run_loop = NSRunLoop::mainRunLoop();
    let common_modes = NSString::from_str("kCFRunLoopCommonModes");
    unsafe {
        let _: () = msg_send![
            display_link,
            addToRunLoop: &*main_run_loop,
            forMode: &*common_modes
        ];
    }
    log::info!("ProMotion: CADisplayLink added to main run loop — 120Hz enabled");

    true
}

// =============================================================================
// WebKit 60fps cap removal — deferred init
// =============================================================================

/// Guard against duplicate framerate unlock.
static FRAMERATE_UNLOCKED: AtomicBool = AtomicBool::new(false);

/// Max retry attempts for deferred `WKWebView` discovery.
const MAX_UNLOCK_ATTEMPTS: u8 = 3;
/// Current retry count.
static UNLOCK_ATTEMPTS: AtomicU8 = AtomicU8::new(0);

/// Schedule the `WebKit` 60fps cap removal.
///
/// Since the `WKWebView` may not exist during Tauri's setup callback,
/// this schedules the unlock via `performSelector:withObject:afterDelay:`
/// with automatic retries (up to 3 attempts at 1-second intervals).
///
/// On 60Hz displays this is a no-op — the `_WKFeature` unlock has no
/// benefit and is known to break fullscreen on some machines.
///
/// Must be called from the main thread.
pub(crate) fn unlock_webview_framerate() {
    if FRAMERATE_UNLOCKED.load(Ordering::SeqCst) {
        return;
    }

    let rate = screen_refresh_rate();
    if rate <= 60.0 {
        log::info!(
            "ProMotion: display refresh rate is {rate:.0}Hz — \
             skipping WebKit 60fps cap removal"
        );
        FRAMERATE_UNLOCKED.store(true, Ordering::SeqCst);
        return;
    }

    UNLOCK_ATTEMPTS.store(0, Ordering::SeqCst);
    schedule_unlock_attempt();
}

/// Schedule a single unlock attempt after a 1-second delay.
fn schedule_unlock_attempt() {
    let Some(unlocker_class) = register_unlocker_class() else {
        log::warn!("ProMotion: failed to register unlocker class");
        return;
    };

    let instance: *mut AnyObject = unsafe { msg_send![unlocker_class, new] };
    if instance.is_null() {
        log::warn!("ProMotion: unlocker alloc returned null");
        return;
    }

    unsafe {
        let _: () = msg_send![
            instance,
            performSelector: sel!(attemptUnlock:),
            withObject: std::ptr::null::<AnyObject>(),
            afterDelay: 1.0_f64
        ];
    }
}

/// Register the `OrbitFramerateUnlocker` Objective-C class.
fn register_unlocker_class() -> Option<&'static AnyClass> {
    const CLASS_NAME: &CStr = c"OrbitFramerateUnlocker";

    if let Some(cls) = AnyClass::get(CLASS_NAME) {
        return Some(cls);
    }

    let superclass = AnyClass::get(c"NSObject")?;
    let mut builder = ClassBuilder::new(CLASS_NAME, superclass)?;

    let attempt_fn: unsafe extern "C" fn(*mut AnyObject, Sel, *mut AnyObject) = on_attempt_unlock;
    unsafe {
        builder.add_method(sel!(attemptUnlock:), attempt_fn);
    }

    Some(builder.register())
}

/// Callback for deferred unlock attempts.
///
/// # Safety
///
/// Called by the Objective-C runtime via `performSelector:withObject:afterDelay:`.
#[allow(
    clippy::missing_const_for_fn,
    reason = "platform-conditional: lint fires on non-macOS stub but not on macOS FFI body"
)]
unsafe extern "C" fn on_attempt_unlock(_this: *mut AnyObject, _sel: Sel, _sender: *mut AnyObject) {
    let attempt = UNLOCK_ATTEMPTS.fetch_add(1, Ordering::SeqCst) + 1;

    if FRAMERATE_UNLOCKED.load(Ordering::SeqCst) {
        return;
    }

    if try_unlock_webview_framerate() {
        FRAMERATE_UNLOCKED.store(true, Ordering::SeqCst);
        log::info!("ProMotion: WebKit 60fps cap disabled (attempt {attempt})");
    } else if attempt < MAX_UNLOCK_ATTEMPTS {
        log::debug!("ProMotion: WKWebView unlock attempt {attempt} failed, retrying...");
        schedule_unlock_attempt();
    } else {
        log::warn!("ProMotion: all {MAX_UNLOCK_ATTEMPTS} unlock attempts failed — stuck at 60fps");
    }
}

/// Internal implementation that returns false on failure.
fn try_unlock_webview_framerate() -> bool {
    // Find the WKWebView in the view hierarchy
    let Some(wk_web_view) = find_wk_web_view() else {
        return false;
    };

    // Get WKWebView.configuration.preferences
    let config: *mut AnyObject = unsafe { msg_send![wk_web_view, configuration] };
    if config.is_null() {
        return false;
    }
    let prefs: *mut AnyObject = unsafe { msg_send![config, preferences] };
    if prefs.is_null() {
        return false;
    }

    // Find the _WKFeature for 60fps preference
    let Some(feature) = find_60fps_feature() else {
        return false;
    };

    // Disable the 60fps cap
    unsafe {
        let _: () = msg_send![prefs, _setEnabled: false, forFeature: feature];
    }

    true
}

/// Find the `WKWebView` by walking `NSApplication`'s window hierarchy.
fn find_wk_web_view() -> Option<*mut AnyObject> {
    let ns_app_class = AnyClass::get(c"NSApplication")?;
    let wk_class = AnyClass::get(c"WKWebView")?;

    let app: *mut AnyObject = unsafe { msg_send![ns_app_class, sharedApplication] };
    if app.is_null() {
        return None;
    }

    let windows: *mut AnyObject = unsafe { msg_send![app, windows] };
    if windows.is_null() {
        return None;
    }

    let count: usize = unsafe { msg_send![windows, count] };
    for i in 0..count {
        let window: *mut AnyObject = unsafe { msg_send![windows, objectAtIndex: i] };
        let content_view: *mut AnyObject = unsafe { msg_send![window, contentView] };
        if !content_view.is_null() {
            if let Some(found) = find_wk_web_view_recursive(content_view, wk_class) {
                return Some(found);
            }
        }
    }

    None
}

/// Recursively search a view hierarchy for a `WKWebView` instance.
fn find_wk_web_view_recursive(view: *mut AnyObject, wk_class: &AnyClass) -> Option<*mut AnyObject> {
    let is_kind: bool = unsafe { msg_send![view, isKindOfClass: wk_class] };
    if is_kind {
        return Some(view);
    }

    let subviews: *mut AnyObject = unsafe { msg_send![view, subviews] };
    if subviews.is_null() {
        return None;
    }

    let count: usize = unsafe { msg_send![subviews, count] };
    for i in 0..count {
        let subview: *mut AnyObject = unsafe { msg_send![subviews, objectAtIndex: i] };
        if let Some(found) = find_wk_web_view_recursive(subview, wk_class) {
            return Some(found);
        }
    }

    None
}

/// Find the `_WKFeature` for `PreferPageRenderingUpdatesNear60FPSEnabled`.
///
/// Enumerates `[WKPreferences _features]` (class method) and returns the
/// feature whose `key` matches the 60fps preference name.
fn find_60fps_feature() -> Option<*mut AnyObject> {
    let prefs_class = AnyClass::get(c"WKPreferences")?;
    let features: *mut AnyObject = unsafe { msg_send![prefs_class, _features] };
    if features.is_null() {
        return None;
    }

    let count: usize = unsafe { msg_send![features, count] };
    let target_key = b"PreferPageRenderingUpdatesNear60FPSEnabled";

    for i in 0..count {
        let feature: *mut AnyObject = unsafe { msg_send![features, objectAtIndex: i] };

        // Try -[_WKFeature key] (standard accessor)
        let key: *mut AnyObject = unsafe { msg_send![feature, key] };
        if !key.is_null() {
            let key_ptr: *const u8 = unsafe { msg_send![key, UTF8String] };
            if !key_ptr.is_null() {
                let key_cstr = unsafe { CStr::from_ptr(key_ptr.cast()) };
                if key_cstr.to_bytes() == target_key.as_slice() {
                    return Some(feature);
                }
            }
        }
    }

    None
}
