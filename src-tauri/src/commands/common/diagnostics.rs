//! Diagnostics commands for crash detection and application health.
//!
//! These commands allow the frontend to check for crashes from previous
//! sessions and manage crash logs.

use std::sync::Arc;

use parking_lot::RwLock;
use tauri::State;

use crate::core::crash;
use crate::core::preflight::PreflightReport;

// ============================================
// Sentry Test Commands (Development Only)
// ============================================

/// Test Sentry error capture from the Rust backend.
///
/// Sends a test error message to Sentry to verify the integration is working.
/// Returns `true` if the message was captured (check Sentry dashboard).
///
/// **Note:** Only functional in debug builds to prevent production noise.
#[tauri::command]
pub fn sentry_test_capture() -> bool {
    // Gate behind debug_assertions to prevent prod users from emitting test events
    if !cfg!(debug_assertions) {
        log::warn!("sentry_test_capture is disabled in release builds");
        return false;
    }

    let event_id = sentry::capture_message(
        "Test from Rust backend: Sentry is working!",
        sentry::Level::Info,
    );

    log::info!("Sentry test event sent with ID: {event_id}");

    // Event ID is non-zero if Sentry is initialized
    !event_id.is_nil()
}

/// Test Sentry error capture with an actual error.
///
/// Sends a test error to Sentry to verify error capturing.
///
/// **Note:** Only functional in debug builds to prevent production noise.
#[tauri::command]
pub fn sentry_test_error() -> bool {
    // Gate behind debug_assertions to prevent prod users from emitting test events
    if !cfg!(debug_assertions) {
        log::warn!("sentry_test_error is disabled in release builds");
        return false;
    }

    sentry::with_scope(
        |scope| {
            scope.set_tag("test", "true");
            scope.set_tag("command", "sentry_test_error");
        },
        || {
            let event_id =
                sentry::capture_message("Test ERROR from Rust backend", sentry::Level::Error);

            log::info!("Sentry test error sent with ID: {event_id}");
            !event_id.is_nil()
        },
    )
}

/// Check if the previous session crashed.
///
/// Returns the crash log contents if there was a crash, or `None` if
/// the previous session ended normally.
///
/// The crash log is consumed (cleared) after reading, so subsequent calls
/// will return `None` until another crash occurs.
#[tauri::command]
pub fn check_previous_crash() -> Option<String> {
    crash::check_previous_crash()
}

/// Clear any pending crash logs without reading them.
///
/// This is useful when the user dismisses a crash notification without
/// viewing the details.
///
/// Returns `true` if the log was cleared successfully.
#[tauri::command]
pub fn clear_crash_log() -> bool {
    crash::clear_crash_log()
}

/// Get the path to the crash log directory.
///
/// Returns `None` if the directory cannot be determined.
#[tauri::command]
pub fn get_crash_log_path() -> Option<String> {
    crash::get_manager().map(|m| m.crash_log_path().to_string_lossy().into_owned())
}

/// Return the latest startup preflight report.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri commands require owned State<> parameters"
)]
pub fn get_preflight_report(state: State<'_, Arc<RwLock<PreflightReport>>>) -> PreflightReport {
    state.read().clone()
}
