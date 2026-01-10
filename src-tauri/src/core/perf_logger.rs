//! Performance logging system for timing and profiling operations.
//!
//! This module provides a centralized performance logging system that writes
//! to both console and a persistent log file. It's designed for profiling
//! IPC calls, sidecar operations, git commands, and other backend operations.
//!
//! # Usage
//!
//! ```rust,ignore
//! use crate::core::perf_logger::{perf_log, perf_log_start, perf_log_end, PerfSource};
//!
//! // Simple start/end logging
//! let start = perf_log_start(PerfSource::Ipc, "ask_claude");
//! // ... do work ...
//! perf_log_end(PerfSource::Ipc, "ask_claude", start);
//!
//! // Using the macro for automatic timing
//! perf_log!(PerfSource::Git, "status", {
//!     git_status(path)
//! });
//! ```

use parking_lot::RwLock;
use std::fmt::{Debug, Formatter, Result as FmtResult};
use std::fs::{self, File, OpenOptions};
use std::io::{Result as IoResult, Write as _};
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

/// Sources of performance events for categorization.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum PerfSource {
    /// IPC calls between frontend and backend
    Ipc,
    /// Git operations
    Git,
    /// Sidecar (agent-bridge) operations
    Sidecar,
    /// File system operations
    Fs,
    /// Terminal operations
    Terminal,
    /// LSP operations
    Lsp,
    /// Search operations
    Search,
    /// Canvas operations
    Canvas,
    /// AI/Claude operations
    Ai,
    /// Other/miscellaneous
    Other,
}

impl PerfSource {
    /// Get the string representation for logging.
    #[must_use]
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::Ipc => "IPC",
            Self::Git => "GIT",
            Self::Sidecar => "SIDECAR",
            Self::Fs => "FS",
            Self::Terminal => "TERMINAL",
            Self::Lsp => "LSP",
            Self::Search => "SEARCH",
            Self::Canvas => "CANVAS",
            Self::Ai => "AI",
            Self::Other => "OTHER",
        }
    }
}

/// Global performance logger instance.
static PERF_LOGGER: OnceLock<PerfLogger> = OnceLock::new();

/// Get or initialize the global performance logger.
fn get_logger() -> &'static PerfLogger {
    PERF_LOGGER.get_or_init(PerfLogger::new)
}

/// Performance logger that writes to console and file.
pub struct PerfLogger {
    /// Path to the log file
    log_path: PathBuf,
    /// File handle wrapped in RwLock for concurrent access
    file: RwLock<Option<File>>,
}

impl Debug for PerfLogger {
    fn fmt(&self, f: &mut Formatter<'_>) -> FmtResult {
        f.debug_struct("PerfLogger")
            .field("log_path", &self.log_path)
            .field("file", &"<file handle>")
            .finish()
    }
}

impl PerfLogger {
    /// Create a new performance logger.
    ///
    /// The log file is created at `src-tauri/perf.log` relative to the
    /// cargo manifest directory in development, or in the app data
    /// directory in production.
    fn new() -> Self {
        let log_path = Self::resolve_log_path();
        let file = Self::open_log_file(&log_path);

        Self {
            log_path,
            file: RwLock::new(file),
        }
    }

    /// Resolve the path to the performance log file.
    fn resolve_log_path() -> PathBuf {
        // In development, use src-tauri/perf.log
        // In production, use app data directory
        if cfg!(debug_assertions) {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("perf.log")
        } else {
            dirs::data_local_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join("orbit")
                .join("perf.log")
        }
    }

    /// Open or create the log file.
    fn open_log_file(path: &PathBuf) -> Option<File> {
        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                if let Err(e) = fs::create_dir_all(parent) {
                    log::warn!("Failed to create perf log directory: {e}");
                    return None;
                }
            }
        }

        OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .map_err(|e| {
                log::warn!("Failed to open perf log file: {e}");
                e
            })
            .ok()
    }

    /// Get the current timestamp in milliseconds since Unix epoch.
    fn timestamp_ms() -> u128 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    }

    /// Write a log entry to both console and file.
    fn write(&self, entry: &str) {
        // Write to console via log crate
        log::debug!(target: "orbit::perf", "{entry}");

        // Write to file
        let mut file_guard = self.file.write();
        if let Some(ref mut file) = *file_guard {
            if let Err(e) = writeln!(file, "{entry}") {
                log::warn!("Failed to write to perf log: {e}");
                // Try to reopen the file
                *file_guard = Self::open_log_file(&self.log_path);
            }
        }
    }

    /// Log a START event.
    pub fn log_start(&self, source: PerfSource, operation: &str) {
        let ts = Self::timestamp_ms();
        let entry = format!(
            "[{ts}] [{source}:{operation}] START",
            source = source.as_str()
        );
        self.write(&entry);
    }

    /// Log an END event with duration.
    pub fn log_end(&self, source: PerfSource, operation: &str, start_ms: u128) {
        let ts = Self::timestamp_ms();
        let duration = ts.saturating_sub(start_ms);
        let entry = format!(
            "[{ts}] [{source}:{operation}] END ({duration}ms)",
            source = source.as_str()
        );
        self.write(&entry);
    }

    /// Log an END event with duration and item count.
    ///
    /// Useful for operations that process multiple items (files, bytes, etc.)
    #[expect(
        clippy::too_many_arguments,
        reason = "All parameters are required for structured logging: source, operation, timing, count, and unit"
    )]
    pub fn log_end_with_count(
        &self,
        source: PerfSource,
        operation: &str,
        start_ms: u128,
        count: usize,
        unit: &str,
    ) {
        let ts = Self::timestamp_ms();
        let duration = ts.saturating_sub(start_ms);
        let entry = format!(
            "[{ts}] [{source}:{operation}] END ({duration}ms) - {count} {unit}",
            source = source.as_str()
        );
        self.write(&entry);
    }

    /// Log a custom event.
    pub fn log_event(&self, source: PerfSource, operation: &str, event: &str) {
        let ts = Self::timestamp_ms();
        let entry = format!(
            "[{ts}] [{source}:{operation}] {event}",
            source = source.as_str()
        );
        self.write(&entry);
    }

    /// Clear the log file.
    pub fn clear(&self) -> IoResult<()> {
        let mut file_guard = self.file.write();

        // Truncate the file by opening with truncate mode
        let file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&self.log_path)?;

        *file_guard = Some(file);
        Ok(())
    }

    /// Get the contents of the log file.
    pub fn get_contents(&self) -> IoResult<String> {
        fs::read_to_string(&self.log_path)
    }

    /// Get the path to the log file.
    pub fn log_path(&self) -> &PathBuf {
        &self.log_path
    }
}

// ============================================================================
// Public API Functions
// ============================================================================

/// Log the start of an operation and return the start timestamp.
///
/// # Example
///
/// ```rust,ignore
/// let start = perf_log_start(PerfSource::Ipc, "my_command");
/// // ... do work ...
/// perf_log_end(PerfSource::Ipc, "my_command", start);
/// ```
#[must_use]
pub fn perf_log_start(source: PerfSource, operation: &str) -> u128 {
    let logger = get_logger();
    let ts = PerfLogger::timestamp_ms();
    logger.log_start(source, operation);
    ts
}

/// Log the end of an operation with the start timestamp.
pub fn perf_log_end(source: PerfSource, operation: &str, start_ms: u128) {
    get_logger().log_end(source, operation, start_ms);
}

/// Log the end of an operation with the start timestamp and item count.
///
/// # Example
///
/// ```rust,ignore
/// let start = perf_log_start(PerfSource::Sidecar, "write");
/// // ... send data ...
/// perf_log_end_with_count(PerfSource::Sidecar, "write", start, bytes_written, "bytes");
/// ```
pub fn perf_log_end_with_count(
    source: PerfSource,
    operation: &str,
    start_ms: u128,
    count: usize,
    unit: &str,
) {
    get_logger().log_end_with_count(source, operation, start_ms, count, unit);
}

/// Log a custom event.
pub fn perf_log_event(source: PerfSource, operation: &str, event: &str) {
    get_logger().log_event(source, operation, event);
}

/// Clear the performance log file.
///
/// # Errors
///
/// Returns an error if the log file cannot be truncated.
pub fn perf_log_clear() -> IoResult<()> {
    get_logger().clear()
}

/// Get the contents of the performance log file.
///
/// # Errors
///
/// Returns an error if the log file cannot be read.
pub fn perf_log_get() -> IoResult<String> {
    get_logger().get_contents()
}

/// Get the path to the performance log file.
#[must_use]
pub fn perf_log_path() -> PathBuf {
    get_logger().log_path().clone()
}

// ============================================================================
// Convenience Macro
// ============================================================================

/// Macro for easily timing a code block.
///
/// This macro wraps a code block and automatically logs START and END events
/// with the elapsed duration.
///
/// # Usage
///
/// ```rust,ignore
/// use crate::core::perf_logger::{perf_log, PerfSource};
///
/// // Time a simple expression
/// let result = perf_log!(PerfSource::Git, "status", {
///     git_status(path)
/// });
///
/// // Time an async block
/// let result = perf_log!(PerfSource::Ipc, "ask_claude", async {
///     client.send_message(msg).await
/// }).await;
/// ```
#[macro_export]
macro_rules! perf_log {
    // Sync version
    ($source:expr, $operation:expr, $block:block) => {{
        let __perf_start = $crate::core::perf_logger::perf_log_start($source, $operation);
        let __perf_result = $block;
        $crate::core::perf_logger::perf_log_end($source, $operation, __perf_start);
        __perf_result
    }};

    // Async version
    ($source:expr, $operation:expr, async $block:block) => {{
        let __perf_start = $crate::core::perf_logger::perf_log_start($source, $operation);
        let __perf_result = $block;
        $crate::core::perf_logger::perf_log_end($source, $operation, __perf_start);
        __perf_result
    }};
}

// Re-export macro at module level
pub use perf_log;

#[cfg(test)]
mod tests {
    use std::thread;
    use std::time::Duration;

    use super::*;

    #[test]
    fn test_perf_source_as_str() {
        assert_eq!(PerfSource::Ipc.as_str(), "IPC");
        assert_eq!(PerfSource::Git.as_str(), "GIT");
        assert_eq!(PerfSource::Sidecar.as_str(), "SIDECAR");
    }

    #[test]
    fn test_timestamp_is_reasonable() {
        let ts = PerfLogger::timestamp_ms();
        // Timestamp should be after 2020-01-01 (1577836800000 ms)
        assert!(ts > 1_577_836_800_000);
    }

    #[test]
    fn test_perf_log_cycle() {
        // Start logging
        let start = perf_log_start(PerfSource::Other, "test_op");
        assert!(start > 0);

        // Small delay
        thread::sleep(Duration::from_millis(10));

        // End logging
        perf_log_end(PerfSource::Other, "test_op", start);

        // Log custom event
        perf_log_event(PerfSource::Other, "test_op", "CUSTOM_EVENT");
    }
}
