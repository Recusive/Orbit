//! Orbit's fork of tauri-plugin-decorum with fix for decoration-less windows.
//!
//! The original plugin crashes when used with decoration-less windows because
//! `standardWindowButton_` returns a garbage pointer (not null) on macOS when
//! decorations are disabled.
//!
//! This fork adds a check for `window.is_decorated()` before accessing traffic lights.

// Suppress warnings from cocoa/objc crates - these are unavoidable without
// migrating to objc2-app-kit which would be a major rewrite.
#![allow(deprecated)] // cocoa crate methods are deprecated
#![allow(unexpected_cfgs)] // objc macro uses cfg(feature = "cargo-clippy")

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Error, Runtime, WebviewWindow};

#[cfg(target_os = "macos")]
mod traffic;

#[cfg(target_os = "macos")]
extern crate objc;

/// Extensions to [`tauri::WebviewWindow`] for window decoration control.
pub trait WebviewWindowExt {
    /// Set the inset of the macOS traffic lights (close/minimize/zoom buttons).
    /// This will move the traffic lights to the specified position.
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
            let ns_window_handle = traffic::UnsafeWindowHandle(ns_window);

            // Store the custom position in the window state
            traffic::update_traffic_light_positions(win, x.into(), y.into());

            // Apply the position immediately
            traffic::position_traffic_lights(ns_window_handle, x.into(), y.into());

            Ok(win)
        })
    }
}

/// Initialize the decorum plugin.
///
/// This sets up traffic light positioning for all decorated windows.
/// Decoration-less windows are automatically skipped.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("decorum")
        .on_window_ready(|win| {
            #[cfg(target_os = "macos")]
            {
                // CRITICAL FIX: Skip decoration-less windows.
                // The original plugin crashes because standardWindowButton_ returns
                // garbage pointers (not null) when decorations are disabled.
                if !win.is_decorated().unwrap_or(true) {
                    return;
                }
                traffic::setup_traffic_light_positioner(win);
            }
        })
        .build()
}

#[cfg(target_os = "macos")]
fn is_main_thread() -> bool {
    std::thread::current().name() == Some("main")
}

#[cfg(target_os = "macos")]
fn ensure_main_thread<F>(
    win: &WebviewWindow,
    main_action: F,
) -> Result<&WebviewWindow, tauri::Error>
where
    F: FnOnce(&WebviewWindow) -> Result<&WebviewWindow, Error> + Send + 'static,
{
    if is_main_thread() {
        main_action(win)?;
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
