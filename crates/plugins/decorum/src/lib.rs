//! Orbit's window enhancement plugin for macOS.
//!
//! Provides:
//! - `ProMotion` 120Hz rendering support via `CADisplayLink` and
//!   `WebKit` 60fps cap removal via the `_WKFeature` private API
//! - Native frosted glass via `NSVisualEffectView` (replaces CSS `backdrop-filter`)
//! - Runtime traffic light (close/minimize/zoom) repositioning
//! - Child window z-ordering fix

use tauri::plugin::{Builder, TauriPlugin};
#[cfg(target_os = "macos")]
use tauri::Error;
use tauri::{Runtime, WebviewWindow};

#[cfg(target_os = "macos")]
mod frost;
#[cfg(target_os = "macos")]
mod glass_defocus;
#[cfg(target_os = "macos")]
mod native_dialog;
#[cfg(target_os = "macos")]
mod promotion;
#[cfg(target_os = "macos")]
mod screenshot;
#[cfg(target_os = "macos")]
mod traffic_lights;
#[cfg(target_os = "macos")]
mod window_order;

#[cfg(target_os = "macos")]
pub use screenshot::capture_browser_screenshot;

/// Extensions to [`tauri::WebviewWindow`] for macOS window enhancements.
pub trait WebviewWindowExt {
    /// Enable `ProMotion` 120Hz rendering on macOS.
    ///
    /// Creates a background `CADisplayLink` that requests 120Hz from the
    /// `ProMotion` display controller. This is a process-wide operation —
    /// only the first call takes effect, subsequent calls are no-ops.
    ///
    /// # Compatibility
    ///
    /// - **macOS 14+**: Display link created (runs at system default rate)
    /// - **macOS 15+**: Explicit 120Hz preference via `preferredFrameRateRange`
    /// - **Pre-macOS 14**: Silent no-op
    /// - **Non-ProMotion displays**: Silent no-op
    ///
    /// # Errors
    ///
    /// Returns an error if the operation cannot be dispatched to the main thread.
    #[cfg(target_os = "macos")]
    fn enable_promotion(&self) -> Result<(), Error>;

    /// Show or hide macOS traffic light buttons (close/minimize/zoom).
    ///
    /// Uses `setHidden:` on each `standardWindowButton`, matching Electron's
    /// `win.setWindowButtonVisibility()`. Positioning is handled by wry's
    /// `drawRect:` via `trafficLightPosition` in `tauri.conf.json`.
    ///
    /// # Errors
    ///
    /// Returns an error if the operation cannot be dispatched to the main thread.
    #[cfg(target_os = "macos")]
    fn set_traffic_lights_visible(&self, visible: bool, x: f64, y: f64) -> Result<(), Error>;

    /// Install native frosted glass on the window.
    ///
    /// Adds an `NSVisualEffectView` with `.sidebar` material and
    /// `.behindWindow` blending, producing a frosted blur at the macOS
    /// compositor level. Replaces CSS `backdrop-filter` which causes white
    /// glow at window rounded corners.
    ///
    /// The frost view is always installed but only visible when the webview
    /// content above it is transparent (i.e., liquid-glass mode). In solid
    /// mode, the opaque CSS background naturally covers the frost.
    ///
    /// # Compatibility
    ///
    /// - **macOS 10.14+**: Full frosted blur via `NSVisualEffectView`
    /// - **Pre-macOS 10.14**: Silent no-op
    ///
    /// # Errors
    ///
    /// Returns an error if the operation cannot be dispatched to the main thread.
    #[cfg(target_os = "macos")]
    fn setup_frost_layer(&self) -> Result<(), Error>;

    /// Show a native folder picker dialog, safe for use with liquid glass.
    ///
    /// On macOS 26+, `NSOpenPanel` crashes when `NSGlassEffectView` is active
    /// in the window. This method temporarily hides glass effects, shows a raw
    /// `NSOpenPanel` via `runModal`, and restores glass after the dialog closes.
    ///
    /// Bypasses `tauri-plugin-dialog` entirely — uses the Objective-C runtime
    /// directly to avoid any plugin-level interference.
    ///
    /// Returns the selected directory path, or `None` if the user cancelled.
    ///
    /// # Errors
    ///
    /// Returns an error if the operation cannot be dispatched to the main thread.
    #[cfg(target_os = "macos")]
    fn pick_folder_native(&self) -> Result<Option<String>, Error>;
}

impl WebviewWindowExt for WebviewWindow {
    #[cfg(target_os = "macos")]
    fn enable_promotion(&self) -> Result<(), Error> {
        if is_main_thread() {
            promotion::enable_promotion();
            promotion::unlock_webview_framerate();
        } else {
            self.run_on_main_thread(move || {
                promotion::enable_promotion();
                promotion::unlock_webview_framerate();
            })?;
        }
        Ok(())
    }

    #[cfg(target_os = "macos")]
    fn setup_frost_layer(&self) -> Result<(), Error> {
        if is_main_thread() {
            unsafe {
                frost::install_frost();
            }
        } else {
            self.run_on_main_thread(move || unsafe {
                frost::install_frost();
            })?;
        }
        Ok(())
    }

    #[cfg(target_os = "macos")]
    fn set_traffic_lights_visible(&self, visible: bool, x: f64, y: f64) -> Result<(), Error> {
        if is_main_thread() {
            traffic_lights::set_traffic_lights_visible(visible, x, y);
        } else {
            self.run_on_main_thread(move || {
                traffic_lights::set_traffic_lights_visible(visible, x, y);
            })?;
        }
        Ok(())
    }

    #[cfg(target_os = "macos")]
    fn pick_folder_native(&self) -> Result<Option<String>, Error> {
        let (tx, rx) = std::sync::mpsc::sync_channel(1);

        // Suspend glass defocus observers BEFORE dispatching to the main
        // thread. This prevents `toggle_glass` from firing when the main
        // window resigns/becomes key during the dialog transition — which
        // modifies the window's view tree mid-transition and crashes on
        // macOS 26+.
        glass_defocus::suspend();

        let dispatch_result = self.run_on_main_thread(move || {
            let result = unsafe { native_dialog::pick_folder() };
            let _ = tx.send(result);
        });

        // Resume observers BEFORE propagating errors — otherwise SUSPENDED
        // stays true permanently if run_on_main_thread fails.
        if let Err(e) = dispatch_result {
            glass_defocus::resume();
            return Err(e);
        }

        // Block the calling thread (Tokio worker) until the main thread
        // closure completes. runModal inside pick_folder() runs a nested
        // event loop, so the main thread remains responsive during the dialog.
        let result = rx.recv().ok().flatten();

        // Resume observers after the dialog is fully closed.
        glass_defocus::resume();

        Ok(result)
    }
}

/// Set the opacity of the native frost layer (0.0–1.0).
///
/// On non-macOS platforms, this is a no-op.
// Cannot be const: calls non-const FFI on macOS; Clippy only sees empty body on Linux.
#[allow(
    clippy::missing_const_for_fn,
    reason = "platform-conditional: lint fires on non-macOS stub but not on macOS FFI body"
)]
pub fn set_frost_opacity(alpha: f64) {
    #[cfg(target_os = "macos")]
    unsafe {
        frost::set_frost_alpha(alpha);
    }

    #[cfg(not(target_os = "macos"))]
    let _ = alpha;
}

/// Set the opacity of the screen-blend tint overlay (0.0–1.0).
///
/// Uses `CIScreenBlendMode` compositing: lightens per-pixel, preserving
/// blur texture. 0.0 = hidden, 0.3–0.6 = typical light mode range.
///
/// On non-macOS platforms, this is a no-op.
// Cannot be const: calls non-const FFI on macOS; Clippy only sees empty body on Linux.
#[allow(
    clippy::missing_const_for_fn,
    reason = "platform-conditional: lint fires on non-macOS stub but not on macOS FFI body"
)]
pub fn set_tint_opacity(opacity: f64) {
    #[cfg(target_os = "macos")]
    unsafe {
        frost::set_tint_opacity(opacity);
    }

    #[cfg(not(target_os = "macos"))]
    let _ = opacity;
}

/// Change the `NSVisualEffectMaterial` of the frost layer at runtime.
///
/// Allows the frontend to use different materials for light vs dark mode
/// (e.g. lighter `.menu` material for light mode, standard `.sidebar` for dark).
///
/// On non-macOS platforms, this is a no-op.
// Cannot be const: calls non-const FFI on macOS; Clippy only sees empty body on Linux.
#[allow(
    clippy::missing_const_for_fn,
    reason = "platform-conditional: lint fires on non-macOS stub but not on macOS FFI body"
)]
pub fn set_frost_material(material: i64) {
    #[cfg(target_os = "macos")]
    unsafe {
        frost::set_frost_material(material);
    }

    #[cfg(not(target_os = "macos"))]
    let _ = material;
}

/// Configure the frost layer for a specific theme.
///
/// Sets material, appearance (`VibrantLight`/`VibrantDark`), and
/// `isEmphasized` to produce the brightest possible frost in light mode
/// while keeping the standard sidebar look in dark mode.
///
/// On non-macOS platforms, this is a no-op.
// Cannot be const: calls non-const FFI on macOS; Clippy only sees empty body on Linux.
#[allow(
    clippy::missing_const_for_fn,
    reason = "platform-conditional: lint fires on non-macOS stub but not on macOS FFI body"
)]
pub fn configure_frost_for_theme(is_dark: bool) {
    #[cfg(target_os = "macos")]
    unsafe {
        frost::configure_frost_for_theme(is_dark);
    }

    #[cfg(not(target_os = "macos"))]
    let _ = is_dark;
}

/// Tell the glass defocus system which theme Orbit is using.
///
/// Without this, the defocus fallback color follows the **system** appearance
/// (via `NSApp.effectiveAppearance`), which is wrong when the user picks a
/// different theme for Orbit than the system default.
///
/// Called from a Tauri command whenever `effectiveTheme` changes in the
/// frontend `ThemeProvider`.
///
/// On non-macOS platforms or macOS < 26 (no glass), this is a no-op.
// Cannot be const: calls non-const store on macOS; Clippy only sees empty body on Linux.
#[allow(
    clippy::missing_const_for_fn,
    reason = "platform-conditional: lint fires on non-macOS stub but not on macOS FFI body"
)]
pub fn set_glass_effective_theme(is_dark: bool) {
    #[cfg(target_os = "macos")]
    glass_defocus::set_effective_theme(is_dark);

    #[cfg(not(target_os = "macos"))]
    let _ = is_dark;
}

/// Set the alpha (opacity) of a specific `NSWindow`.
///
/// Uses `[NSWindow setAlphaValue:]` to make a window transparent (0.0) or
/// opaque (1.0) without moving it offscreen. This avoids confusing the macOS
/// window server, which can break Mission Control when windows are moved to
/// extreme coordinates like (-10000, -10000).
///
/// On non-macOS platforms, this is a no-op.
///
/// **Must be called from the main thread.**
// Cannot be const: calls non-const FFI on macOS; Clippy only sees empty body on Linux.
#[allow(
    clippy::missing_const_for_fn,
    reason = "platform-conditional: lint fires on non-macOS stub but not on macOS FFI body"
)]
pub fn set_ns_window_alpha(ns_window: *mut std::ffi::c_void, alpha: f64) {
    #[cfg(target_os = "macos")]
    window_order::set_ns_window_alpha(ns_window, alpha);

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (ns_window, alpha);
    }
}

/// Re-order all child windows of the main window to the front.
///
/// This fixes macOS child window z-ordering: when the parent window gains
/// keyboard focus, child windows can appear behind the parent's content.
/// Calling this brings all **visible** child windows to the front using
/// `NSWindow.orderFront:nil` (which does NOT steal keyboard focus).
///
/// Hidden child windows are skipped to avoid bypassing Tauri's state tracking.
///
/// On non-macOS platforms, this is a no-op.
///
/// **Must be called from the main thread** (Tauri event handlers are fine).
// Cannot be const: calls non-const FFI on macOS; Clippy only sees empty body on Linux.
#[allow(
    clippy::missing_const_for_fn,
    reason = "platform-conditional: lint fires on non-macOS stub but not on macOS FFI body"
)]
pub fn order_child_windows_front() {
    #[cfg(target_os = "macos")]
    window_order::order_child_windows_front();
}

/// Apply rounded corners to all child windows of the application.
///
/// Iterates `[NSApplication windows]`, finds child windows (those with a
/// `parentWindow`), and applies:
/// 1. `window.opaque = NO` + `clearColor` background for transparent corners
/// 2. `CALayer.cornerRadius` + `masksToBounds` on content view and subviews
///
/// This clips the native `WKWebView` to a rounded shape so the embedded
/// browser sits flush inside the rounded activity card.
///
/// On non-macOS platforms, this is a no-op.
///
/// **Must be called from the main thread.**
// Cannot be const: calls non-const FFI on macOS; Clippy only sees empty body on Linux.
#[allow(
    clippy::missing_const_for_fn,
    reason = "platform-conditional: lint fires on non-macOS stub but not on macOS FFI body"
)]
pub fn set_child_windows_corner_radius(radius: f64) {
    #[cfg(target_os = "macos")]
    window_order::set_child_windows_corner_radius(radius);

    #[cfg(not(target_os = "macos"))]
    let _ = radius;
}

/// Initialize the decorum plugin.
///
/// # Example
///
/// ```rust,ignore
/// fn main() {
///     tauri::Builder::default()
///         .plugin(orbit_plugin_decorum::init())
///         .run(tauri::generate_context!())
///         .expect("error running app");
/// }
/// ```
#[must_use]
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("decorum")
        .setup(|_app, _api| {
            #[cfg(target_os = "macos")]
            glass_defocus::suppress_glass_defocus_dimming();
            Ok(())
        })
        .build()
}

/// Check if we're on the main thread using `NSThread.isMainThread`.
#[cfg(target_os = "macos")]
fn is_main_thread() -> bool {
    objc2_foundation::MainThreadMarker::new().is_some()
}
