//! Orbit's window enhancement plugin for macOS.
//!
//! Provides `ProMotion` 120Hz rendering support via `CADisplayLink` and
//! `WebKit` 60fps cap removal via the `_WKFeature` private API (with
//! fullscreen-aware toggling for notch `MacBook` compatibility).
//! Traffic light positioning is handled natively by Tauri's
//! `trafficLightPosition` config — no custom delegate needed.

use tauri::plugin::{Builder, TauriPlugin};
#[cfg(target_os = "macos")]
use tauri::Error;
use tauri::{Runtime, WebviewWindow};

#[cfg(target_os = "macos")]
mod promotion;
#[cfg(target_os = "macos")]
mod window_order;

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
pub fn order_child_windows_front() {
    #[cfg(target_os = "macos")]
    window_order::order_child_windows_front();
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
    Builder::new("decorum").build()
}

/// Check if we're on the main thread using `NSThread.isMainThread`.
#[cfg(target_os = "macos")]
fn is_main_thread() -> bool {
    objc2_foundation::MainThreadMarker::new().is_some()
}
