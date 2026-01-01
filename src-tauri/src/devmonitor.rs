//! Development Monitor Integration
//!
//! Emits tracing events to the frontend dev-monitor system via Tauri events.
//! Only active in debug builds to avoid production overhead.
//!
//! # Event Types
//!
//! - `devmonitor:tracing` - Log-style events (info, warn, error, etc.)
//! - `devmonitor:span` - Span enter/exit events with duration
//!
//! # Usage
//!
//! ```rust,no_run
//! use snowflake_app_lib::devmonitor::{emit_trace, emit_span_enter, emit_span_exit};
//! use serde_json::json;
//! use tauri::AppHandle;
//!
//! fn example(app: &AppHandle) {
//!
//! // Simple trace event
//! emit_trace(&app, "info", "snowflake::fs", "File saved successfully", None);
//!
//! // Span tracking
//! let span_id = emit_span_enter(&app, "read_file", "snowflake::fs", Some(json!({"path": "/foo"})));
//! // ... do work ...
//! let duration_us = 1000u64;
//! emit_span_exit(&app, span_id, "read_file", "snowflake::fs", duration_us);
//! }
//! ```

use std::fmt::{Debug, Formatter, Result as FmtResult};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter as _};

/// Global span ID counter
static SPAN_ID_COUNTER: AtomicU64 = AtomicU64::new(1);

/// Tracing event payload sent to frontend
#[derive(Debug, Clone, Serialize)]
pub struct TracingEvent {
    /// Tracing level (trace, debug, info, warn, error)
    pub level: String,
    /// Target module path (e.g., "snowflake::fs::watcher")
    pub target: String,
    /// Event message
    pub message: String,
    /// Optional span name if inside a span
    #[serde(skip_serializing_if = "Option::is_none")]
    pub span: Option<String>,
    /// Optional key-value fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<serde_json::Value>,
    /// Timestamp in milliseconds since epoch
    pub timestamp: u64,
}

/// Span event payload sent to frontend
#[derive(Debug, Clone, Serialize)]
pub struct SpanEvent {
    /// Unique span ID
    pub id: u64,
    /// Span name
    pub name: String,
    /// Target module
    pub target: String,
    /// Event type (enter, exit, close)
    pub event: String,
    /// Duration in microseconds (for exit/close events)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_us: Option<u64>,
    /// Span fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<serde_json::Value>,
}

/// Get current timestamp in milliseconds
#[expect(
    clippy::cast_possible_truncation,
    reason = "Milliseconds since epoch fits in u64 for foreseeable future"
)]
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Generate a unique span ID
fn next_span_id() -> u64 {
    SPAN_ID_COUNTER.fetch_add(1, Ordering::Relaxed)
}

/// Emit a tracing event to the frontend.
///
/// Only emits in debug builds. In release builds, this is a no-op.
#[cfg_attr(
    not(debug_assertions),
    expect(unused_variables, reason = "Parameters unused in release builds")
)]
pub fn emit_trace(
    app: &AppHandle,
    level: &str,
    target: &str,
    message: &str,
    fields: Option<serde_json::Value>,
) {
    #[cfg(debug_assertions)]
    {
        let event = TracingEvent {
            level: level.to_owned(),
            target: target.to_owned(),
            message: message.to_owned(),
            span: None,
            fields,
            timestamp: now_ms(),
        };

        if let Err(e) = app.emit("devmonitor:tracing", &event) {
            log::debug!("[DevMonitor] Failed to emit tracing event: {e}");
        }
    }
}

/// Emit a span enter event and return the span ID.
///
/// Only emits in debug builds. In release builds, returns 0.
#[cfg_attr(
    not(debug_assertions),
    expect(unused_variables, reason = "Parameters unused in release builds")
)]
pub fn emit_span_enter(
    app: &AppHandle,
    name: &str,
    target: &str,
    fields: Option<serde_json::Value>,
) -> u64 {
    #[cfg(debug_assertions)]
    {
        let id = next_span_id();

        let event = SpanEvent {
            id,
            name: name.to_owned(),
            target: target.to_owned(),
            event: "enter".to_owned(),
            duration_us: None,
            fields,
        };

        if let Err(e) = app.emit("devmonitor:span", &event) {
            log::debug!("[DevMonitor] Failed to emit span enter: {e}");
        }

        id
    }

    #[cfg(not(debug_assertions))]
    0
}

/// Emit a span exit event.
///
/// Only emits in debug builds. In release builds, this is a no-op.
#[cfg_attr(
    not(debug_assertions),
    expect(unused_variables, reason = "Parameters unused in release builds")
)]
pub fn emit_span_exit(app: &AppHandle, span_id: u64, name: &str, target: &str, duration_us: u64) {
    #[cfg(debug_assertions)]
    {
        let event = SpanEvent {
            id: span_id,
            name: name.to_owned(),
            target: target.to_owned(),
            event: "exit".to_owned(),
            duration_us: Some(duration_us),
            fields: None,
        };

        if let Err(e) = app.emit("devmonitor:span", &event) {
            log::debug!("[DevMonitor] Failed to emit span exit: {e}");
        }
    }
}

/// Helper macro for tracing with automatic target detection.
///
/// # Example
///
/// ```rust,no_run
/// use snowflake_app_lib::trace_info;
/// use serde_json::json;
/// use tauri::AppHandle;
///
/// fn example(app: &AppHandle) {
///     let path = "/foo/bar";
///     trace_info!(app, "File saved successfully");
///     trace_info!(app, "File saved", json!({"path": path}));
/// }
/// ```
#[macro_export]
macro_rules! trace_info {
    ($app:expr, $msg:expr) => {
        $crate::devmonitor::emit_trace($app, "info", module_path!(), $msg, None)
    };
    ($app:expr, $msg:expr, $fields:expr) => {
        $crate::devmonitor::emit_trace($app, "info", module_path!(), $msg, Some($fields))
    };
}

/// Helper macro for warning traces.
#[macro_export]
macro_rules! trace_warn {
    ($app:expr, $msg:expr) => {
        $crate::devmonitor::emit_trace($app, "warn", module_path!(), $msg, None)
    };
    ($app:expr, $msg:expr, $fields:expr) => {
        $crate::devmonitor::emit_trace($app, "warn", module_path!(), $msg, Some($fields))
    };
}

/// Helper macro for error traces.
#[macro_export]
macro_rules! trace_error {
    ($app:expr, $msg:expr) => {
        $crate::devmonitor::emit_trace($app, "error", module_path!(), $msg, None)
    };
    ($app:expr, $msg:expr, $fields:expr) => {
        $crate::devmonitor::emit_trace($app, "error", module_path!(), $msg, Some($fields))
    };
}

/// Helper macro for debug traces.
#[macro_export]
macro_rules! trace_debug {
    ($app:expr, $msg:expr) => {
        $crate::devmonitor::emit_trace($app, "debug", module_path!(), $msg, None)
    };
    ($app:expr, $msg:expr, $fields:expr) => {
        $crate::devmonitor::emit_trace($app, "debug", module_path!(), $msg, Some($fields))
    };
}

/// RAII guard for automatic span timing.
///
/// # Example
///
/// ```rust,no_run
/// use snowflake_app_lib::devmonitor::SpanGuard;
/// use tauri::AppHandle;
///
/// fn example(app: &AppHandle) {
///     let _span = SpanGuard::new(app, "read_file", module_path!());
///     // ... do work ...
/// } // Span automatically exits here with duration
/// ```
pub struct SpanGuard {
    #[cfg(debug_assertions)]
    app: AppHandle,
    #[cfg(debug_assertions)]
    span_id: u64,
    #[cfg(debug_assertions)]
    name: String,
    #[cfg(debug_assertions)]
    target: String,
    #[cfg(debug_assertions)]
    start: Instant,
}

impl Debug for SpanGuard {
    fn fmt(&self, f: &mut Formatter<'_>) -> FmtResult {
        #[cfg(debug_assertions)]
        {
            f.debug_struct("SpanGuard")
                .field("span_id", &self.span_id)
                .field("name", &self.name)
                .field("target", &self.target)
                .finish_non_exhaustive()
        }
        #[cfg(not(debug_assertions))]
        {
            f.debug_struct("SpanGuard").finish()
        }
    }
}

impl SpanGuard {
    /// Create a new span guard that emits enter on creation.
    #[cfg_attr(
        not(debug_assertions),
        expect(unused_variables, reason = "Parameters unused in release builds")
    )]
    pub fn new(app: &AppHandle, name: &str, target: &str) -> Self {
        #[cfg(debug_assertions)]
        {
            let span_id = emit_span_enter(app, name, target, None);
            Self {
                app: app.clone(),
                span_id,
                name: name.to_owned(),
                target: target.to_owned(),
                start: Instant::now(),
            }
        }

        #[cfg(not(debug_assertions))]
        Self {}
    }

    /// Create a new span guard with fields.
    #[cfg_attr(
        not(debug_assertions),
        expect(unused_variables, reason = "Parameters unused in release builds")
    )]
    pub fn with_fields(
        app: &AppHandle,
        name: &str,
        target: &str,
        fields: serde_json::Value,
    ) -> Self {
        #[cfg(debug_assertions)]
        {
            let span_id = emit_span_enter(app, name, target, Some(fields));
            Self {
                app: app.clone(),
                span_id,
                name: name.to_owned(),
                target: target.to_owned(),
                start: Instant::now(),
            }
        }

        #[cfg(not(debug_assertions))]
        Self {}
    }
}

impl Drop for SpanGuard {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "Span duration in microseconds will not exceed u64 for reasonable spans"
    )]
    fn drop(&mut self) {
        #[cfg(debug_assertions)]
        {
            let duration_us = self.start.elapsed().as_micros() as u64;
            emit_span_exit(
                &self.app,
                self.span_id,
                &self.name,
                &self.target,
                duration_us,
            );
        }
    }
}

/// Helper macro for creating a span guard with automatic target.
///
/// # Example
///
/// ```rust,no_run
/// use snowflake_app_lib::span;
/// use tauri::AppHandle;
///
/// fn example(app: &AppHandle) {
///     let _span = span!(app, "read_file");
///     // ... do work ...
/// } // Span automatically exits here
/// ```
#[macro_export]
macro_rules! span {
    ($app:expr, $name:expr) => {
        $crate::devmonitor::SpanGuard::new($app, $name, module_path!())
    };
    ($app:expr, $name:expr, $fields:expr) => {
        $crate::devmonitor::SpanGuard::with_fields($app, $name, module_path!(), $fields)
    };
}
