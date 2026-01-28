//! Orbit's fork of tauri-plugin-decorum with fix for decoration-less windows.
//!
//! This plugin provides macOS traffic light (close/minimize/zoom) positioning using
//! the modern objc2-app-kit ecosystem for type-safe Objective-C bindings.
//!
//! ## Key Features
//!
//! - **Type-safe**: Uses `Option<Retained<T>>` instead of raw pointers
//! - **Crash-resistant**: Properly handles decoration-less windows
//! - **Modern**: Built on objc2 with compile-time selector verification
//!
//! ## The Original Bug
//!
//! The original plugin crashes when used with decoration-less windows because
//! `standardWindowButton_` returns a garbage pointer (not null) on macOS when
//! decorations are disabled. This fork:
//!
//! 1. Checks `window.is_decorated()` before accessing traffic lights
//! 2. Uses objc2's `Option<Retained<T>>` which properly returns `None`

use tauri::plugin::{Builder, TauriPlugin};
#[cfg(target_os = "macos")]
use tauri::Error;
use tauri::{Runtime, WebviewWindow};

#[cfg(target_os = "macos")]
mod traffic;

/// Extensions to [`tauri::WebviewWindow`] for window decoration control.
pub trait WebviewWindowExt {
    /// Set the inset of the macOS traffic lights (close/minimize/zoom buttons).
    ///
    /// This will move the traffic lights to the specified position relative to
    /// the window's top-left corner.
    ///
    /// # Arguments
    ///
    /// * `x` - Horizontal offset from the left edge (pixels)
    /// * `y` - Vertical offset from the top edge (pixels)
    ///
    /// # Errors
    ///
    /// Returns an error if the window handle cannot be obtained or if the
    /// operation cannot be performed on the main thread.
    ///
    /// # Returns
    ///
    /// Returns `Ok(&self)` for method chaining, or `Err` if the operation fails.
    /// Decoration-less windows return `Ok` without making changes.
    #[cfg(target_os = "macos")]
    fn set_traffic_lights_inset(&self, x: f32, y: f32) -> Result<&WebviewWindow, Error>;
}

impl WebviewWindowExt for WebviewWindow {
    #[cfg(target_os = "macos")]
    fn set_traffic_lights_inset(&self, x: f32, y: f32) -> Result<&WebviewWindow, Error> {
        // Skip decoration-less windows - they don't have traffic lights
        if !self.is_decorated().unwrap_or(true) {
            return Ok(self);
        }

        ensure_main_thread(self, move |win| {
            let ns_window = win.ns_window()?;

            // SAFETY: Tauri gives us a valid NSWindow pointer
            let Some(handle) = (unsafe { traffic::WindowHandle::from_raw(ns_window) }) else {
                return Ok(win);
            };

            // Update stored position in delegate
            traffic::update_traffic_light_positions(win, f64::from(x), f64::from(y));

            // Apply the position immediately
            traffic::position_traffic_lights(&handle, f64::from(x), f64::from(y));

            Ok(win)
        })
    }
}

/// Initialize the decorum plugin.
///
/// This sets up traffic light positioning for all decorated windows.
/// Decoration-less windows are automatically skipped.
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
        .on_window_ready(|win| {
            #[cfg(target_os = "macos")]
            {
                // Skip decoration-less windows - they don't have traffic lights
                // and the old cocoa crate would crash on them
                if !win.is_decorated().unwrap_or(true) {
                    return;
                }
                traffic::setup_traffic_light_positioner(&win);
            }

            // Suppress unused variable warning on non-macOS
            #[cfg(not(target_os = "macos"))]
            let _ = win;
        })
        .build()
}

#[cfg(target_os = "macos")]
fn is_main_thread() -> bool {
    std::thread::current().name() == Some("main")
}

#[cfg(target_os = "macos")]
fn ensure_main_thread<F>(win: &WebviewWindow, main_action: F) -> Result<&WebviewWindow, Error>
where
    F: FnOnce(&WebviewWindow) -> Result<&WebviewWindow, Error> + Send + 'static,
{
    if is_main_thread() {
        let _ = main_action(win)?;
        Ok(win)
    } else {
        let win2 = win.clone();
        match win.run_on_main_thread(move || {
            drop(main_action(&win2));
        }) {
            Ok(()) => Ok(win),
            Err(e) => Err(e),
        }
    }
}
