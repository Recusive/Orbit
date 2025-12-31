//! Crash handling integration for Snowflake.
//!
//! This module wraps the core crash utilities and provides application-specific
//! setup and Tauri command integration.

use snowflake_core::crash::{self, CrashManager};

/// The application name used for crash log directories.
const APP_NAME: &str = "snowflake";

/// Initialize the panic handler.
///
/// This should be called at the very start of the application, before any
/// other initialization that might panic.
pub fn init() {
    crash::setup_panic_hook(APP_NAME);
    log::info!("Panic handler initialized");
}

/// Check if there are pending crashes from previous sessions.
///
/// Returns `Some(log_contents)` if there are unacknowledged crashes.
#[must_use]
pub fn check_previous_crash() -> Option<String> {
    let manager = CrashManager::new(APP_NAME)?;
    if manager.has_pending_crashes() {
        manager.consume_crash_log()
    } else {
        None
    }
}

/// Get the crash manager for advanced operations.
#[must_use]
pub fn get_manager() -> Option<CrashManager> {
    CrashManager::new(APP_NAME)
}

/// Clear any pending crash logs without reading them.
///
/// This is useful when the user dismisses a crash notification.
pub fn clear_crash_log() -> bool {
    CrashManager::new(APP_NAME).is_some_and(|manager| manager.clear_crash_log().is_ok())
}
