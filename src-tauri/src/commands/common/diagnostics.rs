//! Diagnostics commands for crash detection and application health.
//!
//! These commands allow the frontend to check for crashes from previous
//! sessions and manage crash logs.

use crate::crash;

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
