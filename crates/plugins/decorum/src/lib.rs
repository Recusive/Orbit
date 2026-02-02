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
