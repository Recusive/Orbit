//! Sentry utilities for capturing command errors.
//!
//! Provides helpers to capture non-panic errors to Sentry
//! before returning them from Tauri commands.
//!
//! # Usage
//!
//! For ergonomic use in commands, use the `SentryCapture` extension trait:
//!
//! ```ignore
//! use crate::core::sentry_utils::SentryCapture;
//!
//! #[tauri::command]
//! pub fn git_status(repo_path: String) -> orbit_core::Result<GitStatus> {
//!     let manager = GitManager::new();
//!     manager.status(&repo_path).capture("git_status")
//! }
//! ```
//!
//! Or for Result<T, String> commands:
//!
//! ```ignore
//! #[tauri::command]
//! pub fn my_command() -> Result<String, String> {
//!     do_something()
//!         .map_err(|e| capture_command_error("my_command", e))
//! }
//! ```

use std::fmt::Display;

/// Extension trait for Result types to capture errors to Sentry.
///
/// Provides a fluent `.capture(command_name)` method that reports errors
/// to Sentry before propagating them. Works with any Result<T, E> where E: Display.
pub trait SentryCapture<T, E> {
    /// Capture errors to Sentry with the command name as context.
    ///
    /// On error, reports to Sentry then returns the original error unchanged.
    /// On success, passes through unchanged.
    fn capture(self, command: &str) -> Result<T, E>;

    /// Capture errors to Sentry with additional context metadata.
    fn capture_with_context(self, command: &str, context: &[(&str, &str)]) -> Result<T, E>;
}

impl<T, E: Display> SentryCapture<T, E> for Result<T, E> {
    fn capture(self, command: &str) -> Self {
        if let Err(e) = &self {
            let error_string = e.to_string();

            sentry::with_scope(
                |scope| {
                    scope.set_tag("command", command);
                    scope.set_tag("error_type", "command_error");
                },
                || {
                    let _ = sentry::capture_message(
                        &format!("[{command}] {error_string}"),
                        sentry::Level::Error,
                    );
                },
            );
        }
        self
    }

    fn capture_with_context(self, command: &str, context: &[(&str, &str)]) -> Self {
        if let Err(e) = &self {
            let error_string = e.to_string();

            sentry::with_scope(
                |scope| {
                    scope.set_tag("command", command);
                    scope.set_tag("error_type", "command_error");
                    for (key, value) in context {
                        scope.set_extra(key, serde_json::Value::String((*value).to_owned()));
                    }
                },
                || {
                    let _ = sentry::capture_message(
                        &format!("[{command}] {error_string}"),
                        sentry::Level::Error,
                    );
                },
            );
        }
        self
    }
}

/// Capture an error to Sentry before returning it as a String.
///
/// This function logs the error to Sentry and then returns the error string,
/// allowing command errors (not just panics) to be tracked.
///
/// Useful for commands that need to convert errors to String for Tauri.
pub fn capture_command_error<E: Display>(command: &str, error: E) -> String {
    let error_string = error.to_string();

    sentry::with_scope(
        |scope| {
            scope.set_tag("command", command);
            scope.set_tag("error_type", "command_error");
        },
        || {
            let _ = sentry::capture_message(
                &format!("[{command}] {error_string}"),
                sentry::Level::Error,
            );
        },
    );

    error_string
}

/// Capture an error to Sentry with additional context.
///
/// Use this when you have extra metadata to include with the error.
pub fn capture_command_error_with_context<E: Display>(
    command: &str,
    error: E,
    context: &[(&str, &str)],
) -> String {
    let error_string = error.to_string();

    sentry::with_scope(
        |scope| {
            scope.set_tag("command", command);
            scope.set_tag("error_type", "command_error");
            for (key, value) in context {
                scope.set_extra(key, serde_json::Value::String((*value).to_owned()));
            }
        },
        || {
            let _ = sentry::capture_message(
                &format!("[{command}] {error_string}"),
                sentry::Level::Error,
            );
        },
    );

    error_string
}
