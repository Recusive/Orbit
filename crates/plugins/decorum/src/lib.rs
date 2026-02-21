//! Orbit's window enhancement plugin for macOS.
//!
//! Provides:
//! - `ProMotion` 120Hz rendering support via `CADisplayLink` and
//!   `WebKit` 60fps cap removal via the `_WKFeature` private API
//! - Runtime traffic light (close/minimize/zoom) repositioning
//! - Child window z-ordering fix

use tauri::plugin::{Builder, TauriPlugin};
#[cfg(target_os = "macos")]
use tauri::Error;
use tauri::{Runtime, WebviewWindow};

#[cfg(target_os = "macos")]
mod glass_defocus;
#[cfg(target_os = "macos")]
mod native_dialog;
#[cfg(target_os = "macos")]
mod promotion;
#[cfg(target_os = "macos")]
mod traffic_lights;
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
#[allow(clippy::missing_const_for_fn)]
pub fn set_glass_effective_theme(is_dark: bool) {
    #[cfg(target_os = "macos")]
    glass_defocus::set_effective_theme(is_dark);

    #[cfg(not(target_os = "macos"))]
    let _ = is_dark;
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
#[allow(clippy::missing_const_for_fn)]
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
