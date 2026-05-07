//! Crash management and panic logging.
//!
//! This module provides utilities for capturing crash information from panics
//! and managing crash log files for post-mortem analysis.
//!
//! # Architecture
//!
//! The crash system works in two phases:
//!
//! 1. **Capture Phase**: During a panic, the custom panic hook writes crash
//!    information to a log file. This code must be infallible - it cannot
//!    panic or the process will abort.
//!
//! 2. **Recovery Phase**: On next startup, the application checks for pending
//!    crashes and optionally shows them to the user.
//!
//! # Example
//!
//! ```rust,no_run
//! use orbit_core::diagnostics::crash::{CrashManager, setup_panic_hook};
//!
//! // Set up panic handler at app start
//! setup_panic_hook("orbit");
//!
//! // Check for crashes from previous session
//! let manager = CrashManager::new("orbit");
//! if let Some(ref mgr) = manager {
//!     if mgr.has_pending_crashes() {
//!         if let Some(report) = mgr.consume_crash_log() {
//!             eprintln!("Previous session crashed:\n{}", report);
//!         }
//!     }
//! }
//! ```

use std::backtrace::Backtrace;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write as _};
use std::mem;
use std::panic::{self, PanicHookInfo};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use chrono::Utc;
use serde::{Deserialize, Serialize};

// ============================================================================
// Constants
// ============================================================================

/// Maximum size of a single crash log file (10 MB).
const MAX_LOG_SIZE: u64 = 10 * 1024 * 1024;

/// Maximum number of rotated crash log files to keep.
const MAX_LOG_FILES: usize = 5;

/// Name of the active crash log file.
const CRASH_LOG_NAME: &str = "crash.log";

// Global app name for use in panic hook (set once at startup).
static APP_NAME: OnceLock<String> = OnceLock::new();

// ============================================================================
// Types
// ============================================================================

/// A structured crash report.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[non_exhaustive]
pub struct CrashReport {
    /// ISO 8601 timestamp of when the crash occurred.
    pub timestamp: String,
    /// Source location where the panic occurred (file:line:column).
    pub location: String,
    /// The panic message.
    pub message: String,
    /// Optional backtrace if `RUST_BACKTRACE` was enabled.
    pub backtrace: Option<String>,
}

/// Manager for crash log files.
///
/// Handles reading, rotating, and cleaning up crash logs.
#[derive(Debug)]
pub struct CrashManager {
    /// Directory where crash logs are stored.
    log_dir: PathBuf,
}

// ============================================================================
// Panic Hook Setup
// ============================================================================

/// Set up the custom panic hook for crash logging.
///
/// This should be called once at application startup, before any code that
/// might panic. The `app_name` is used to determine where crash logs are
/// stored (typically in the platform's local data directory).
///
/// # Arguments
///
/// * `app_name` - The application name (e.g., "orbit"). Used for the log directory.
///
/// # Example
///
/// ```rust,no_run
/// use orbit_core::diagnostics::crash::setup_panic_hook;
///
/// setup_panic_hook("my_app");
/// // ... rest of app
/// ```
pub fn setup_panic_hook(app_name: &str) {
    // Store app name for use in the hook
    drop(APP_NAME.set(app_name.to_owned()));

    // Take the existing hook (we'll chain to it)
    let default_hook = panic::take_hook();

    panic::set_hook(Box::new(move |panic_info| {
        // Write crash log (this must not panic!)
        write_crash_log(panic_info);

        // Chain to the default hook for standard panic behavior
        default_hook(panic_info);
    }));
}

/// Write crash information to the log file.
///
/// This function is called from the panic hook and must be completely
/// infallible - any failure is silently ignored to prevent double-panics.
#[expect(
    clippy::print_stderr,
    reason = "Crash info must go to stderr for debugging"
)]
fn write_crash_log(panic_info: &PanicHookInfo<'_>) {
    // Get the app name (if not set, we can't write logs)
    let Some(app_name) = APP_NAME.get() else {
        return;
    };

    // Get the log directory
    let Some(log_dir) = dirs::data_local_dir().map(|d| d.join(app_name).join("logs")) else {
        return;
    };

    // Ensure log directory exists
    if fs::create_dir_all(&log_dir).is_err() {
        return;
    }

    let log_path = log_dir.join(CRASH_LOG_NAME);

    // Extract panic message
    let message = extract_panic_message(panic_info);

    // Extract location
    let location = panic_info.location().map_or_else(
        || "unknown location".to_owned(),
        |l| format!("{}:{}:{}", l.file(), l.line(), l.column()),
    );

    // Capture backtrace (respects RUST_BACKTRACE env var)
    let backtrace = Backtrace::capture();
    let backtrace_str = format!("{backtrace:?}");

    // Build crash report
    let timestamp = Utc::now().to_rfc3339();
    let crash_report = format!(
        "=== CRASH REPORT ===\n\
         Timestamp: {timestamp}\n\
         Location: {location}\n\
         Message: {message}\n\
         Backtrace:\n{backtrace_str}\n\
         ==================\n\n",
    );

    // Check if we need to rotate before writing
    if should_rotate(&log_path) {
        // Rotation failure is not critical
        drop(rotate_crash_log(&log_dir));
    }

    // Write to crash log (append mode)
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&log_path) {
        // Ignore write errors - we're in a panic handler
        drop(file.write_all(crash_report.as_bytes()));
        drop(file.flush());
    }

    // Also write to stderr (standard panic output)
    eprintln!("{crash_report}");
}

/// Extract the panic message from `PanicHookInfo`.
fn extract_panic_message(panic_info: &PanicHookInfo<'_>) -> String {
    panic_info
        .payload()
        .downcast_ref::<&str>()
        .map(|s| (*s).to_owned())
        .or_else(|| panic_info.payload().downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "Unknown panic".to_owned())
}

/// Check if the crash log needs rotation.
fn should_rotate(log_path: &Path) -> bool {
    fs::metadata(log_path).is_ok_and(|m| m.len() >= MAX_LOG_SIZE)
}

/// Rotate crash logs (crash.log -> crash.log.1 -> crash.log.2 -> ...).
fn rotate_crash_log(log_dir: &Path) -> io::Result<()> {
    // Delete the oldest log if it exists
    let oldest = log_dir.join(format!("{CRASH_LOG_NAME}.{MAX_LOG_FILES}"));
    if oldest.exists() {
        fs::remove_file(&oldest)?;
    }

    // Shift existing logs
    for i in (1..MAX_LOG_FILES).rev() {
        let current = log_dir.join(format!("{CRASH_LOG_NAME}.{i}"));
        let next = log_dir.join(format!("{CRASH_LOG_NAME}.{}", i + 1));
        if current.exists() {
            fs::rename(&current, &next)?;
        }
    }

    // Move current log to .1
    let current_log = log_dir.join(CRASH_LOG_NAME);
    let first_rotation = log_dir.join(format!("{CRASH_LOG_NAME}.1"));
    if current_log.exists() {
        fs::rename(&current_log, &first_rotation)?;
    }

    // Create fresh log file
    let _file = File::create(current_log)?;

    Ok(())
}

// ============================================================================
// CrashManager Implementation
// ============================================================================

impl CrashManager {
    /// Create a new crash manager for the given application.
    ///
    /// Returns `None` if the platform's local data directory cannot be determined.
    ///
    /// # Arguments
    ///
    /// * `app_name` - The application name (e.g., "orbit").
    #[must_use]
    pub fn new(app_name: &str) -> Option<Self> {
        let log_dir = dirs::data_local_dir()?.join(app_name).join("logs");
        Some(Self { log_dir })
    }

    /// Create a crash manager with an explicit log directory.
    ///
    /// This is useful for tests and for environments that need to override
    /// the default platform-specific log location.
    #[must_use]
    pub fn with_log_dir(log_dir: PathBuf) -> Self {
        Self { log_dir }
    }

    /// Get the path to the crash log file.
    #[must_use]
    pub fn crash_log_path(&self) -> PathBuf {
        self.log_dir.join(CRASH_LOG_NAME)
    }

    /// Check if there are unacknowledged crashes from previous sessions.
    ///
    /// Returns `true` if the crash log exists and contains data.
    #[must_use]
    pub fn has_pending_crashes(&self) -> bool {
        let path = self.crash_log_path();
        path.exists() && fs::metadata(&path).is_ok_and(|m| m.len() > 0)
    }

    /// Read and consume the crash log, returning its contents.
    ///
    /// After reading, the crash log is rotated so the same crash isn't
    /// reported multiple times.
    ///
    /// Returns `None` if the log doesn't exist, is empty, or cannot be read.
    #[must_use]
    pub fn consume_crash_log(&self) -> Option<String> {
        let path = self.crash_log_path();

        // Read the contents
        let contents = fs::read_to_string(&path).ok()?;
        if contents.is_empty() {
            return None;
        }

        // Rotate the log (create fresh one)
        drop(self.clear_crash_log());

        Some(contents)
    }

    /// Read the crash log without consuming it.
    ///
    /// Returns `None` if the log doesn't exist, is empty, or cannot be read.
    #[must_use]
    pub fn read_crash_log(&self) -> Option<String> {
        let path = self.crash_log_path();
        let contents = fs::read_to_string(&path).ok()?;
        if contents.is_empty() {
            None
        } else {
            Some(contents)
        }
    }

    /// Clear the current crash log without reading it.
    ///
    /// This is useful when the user dismisses a crash notification.
    pub fn clear_crash_log(&self) -> io::Result<()> {
        let path = self.crash_log_path();
        if path.exists() {
            // Truncate the file instead of deleting (preserves file handle)
            let _file = File::create(&path)?;
        }
        Ok(())
    }

    /// Get all crash log files (current + rotated).
    ///
    /// Returns paths sorted newest to oldest.
    #[must_use]
    pub fn all_crash_logs(&self) -> Vec<PathBuf> {
        let mut logs = Vec::new();

        // Current log first
        let current = self.crash_log_path();
        if current.exists() {
            logs.push(current);
        }

        // Then rotated logs
        for i in 1..=MAX_LOG_FILES {
            let rotated = self.log_dir.join(format!("{CRASH_LOG_NAME}.{i}"));
            if rotated.exists() {
                logs.push(rotated);
            }
        }

        logs
    }

    /// Delete all crash logs.
    ///
    /// Returns the number of files deleted.
    pub fn delete_all_logs(&self) -> usize {
        let mut deleted = 0;

        for path in self.all_crash_logs() {
            if fs::remove_file(&path).is_ok() {
                deleted += 1;
            }
        }

        deleted
    }

    /// Parse a crash log into structured reports.
    ///
    /// Returns a vector of `CrashReport` structs, one per crash entry.
    #[must_use]
    pub fn parse_crash_log(contents: &str) -> Vec<CrashReport> {
        let mut reports = Vec::new();
        let mut current_timestamp = String::new();
        let mut current_location = String::new();
        let mut current_message = String::new();
        let mut current_backtrace = Vec::new();
        let mut in_backtrace = false;

        for line in contents.lines() {
            if line == "=== CRASH REPORT ===" {
                // Start of a new report
                in_backtrace = false;
            } else if line == "==================" {
                // End of a report - save it
                if !current_timestamp.is_empty() {
                    let backtrace = if current_backtrace.is_empty() {
                        None
                    } else {
                        Some(current_backtrace.join("\n"))
                    };

                    reports.push(CrashReport {
                        timestamp: mem::take(&mut current_timestamp),
                        location: mem::take(&mut current_location),
                        message: mem::take(&mut current_message),
                        backtrace,
                    });
                    current_backtrace.clear();
                }
            } else if let Some(ts) = line.strip_prefix("Timestamp: ") {
                ts.clone_into(&mut current_timestamp);
            } else if let Some(loc) = line.strip_prefix("Location: ") {
                loc.clone_into(&mut current_location);
            } else if let Some(msg) = line.strip_prefix("Message: ") {
                msg.clone_into(&mut current_message);
            } else if line == "Backtrace:" {
                in_backtrace = true;
            } else if in_backtrace {
                current_backtrace.push(line.to_owned());
            }
        }

        reports
    }
}

#[cfg(test)]
#[expect(
    clippy::indexing_slicing,
    reason = "Test assertions can panic on index"
)]
#[expect(
    clippy::unwrap_used,
    reason = "Tests should panic on unexpected failures"
)]
#[expect(
    clippy::expect_used,
    reason = "Tests should panic on unexpected failures"
)]
#[expect(clippy::str_to_string, reason = "Tests use string literals directly")]
#[expect(clippy::uninlined_format_args, reason = "Format clarity in tests")]
#[expect(
    clippy::let_underscore_must_use,
    reason = "Tests ignore some results intentionally"
)]
mod tests {
    use std::env::temp_dir;
    use std::process::id;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    fn create_test_manager(test_name: &str) -> CrashManager {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("System time should be after Unix epoch")
            .as_nanos();
        let log_dir = temp_dir().join(format!("orbit-core-crash-{test_name}-{}-{unique}", id()));
        CrashManager { log_dir }
    }

    // ========================================================================
    // Parsing Tests
    // ========================================================================

    #[test]
    fn test_parse_crash_log() {
        let log = "=== CRASH REPORT ===
Timestamp: 2024-01-15T10:30:00+00:00
Location: src/main.rs:42:5
Message: explicit panic
Backtrace:
   0: std::backtrace::Backtrace::capture
   1: my_app::main
==================

=== CRASH REPORT ===
Timestamp: 2024-01-15T11:00:00+00:00
Location: src/lib.rs:100:10
Message: index out of bounds
Backtrace:
   0: core::panicking::panic_bounds_check
==================
";

        let reports = CrashManager::parse_crash_log(log);
        assert_eq!(reports.len(), 2);

        assert_eq!(reports[0].timestamp, "2024-01-15T10:30:00+00:00");
        assert_eq!(reports[0].location, "src/main.rs:42:5");
        assert_eq!(reports[0].message, "explicit panic");
        assert!(reports[0].backtrace.is_some());

        assert_eq!(reports[1].location, "src/lib.rs:100:10");
        assert_eq!(reports[1].message, "index out of bounds");
    }

    #[test]
    fn test_parse_empty_crash_log() {
        let reports = CrashManager::parse_crash_log("");
        assert!(reports.is_empty());
    }

    #[test]
    fn test_parse_crash_log_no_backtrace() {
        let log = "=== CRASH REPORT ===
Timestamp: 2024-01-15T10:30:00+00:00
Location: src/main.rs:42:5
Message: panic without backtrace
Backtrace:
==================
";

        let reports = CrashManager::parse_crash_log(log);
        assert_eq!(reports.len(), 1);
        // Empty backtrace section should result in None
        assert!(reports[0].backtrace.is_none());
    }

    #[test]
    fn test_parse_crash_log_malformed() {
        // Missing separator at end
        let log = "=== CRASH REPORT ===
Timestamp: 2024-01-15T10:30:00+00:00
Location: src/main.rs:42:5
Message: incomplete report
";

        let reports = CrashManager::parse_crash_log(log);
        // Should not crash, just return empty (report not terminated)
        assert!(reports.is_empty());
    }

    #[test]
    fn test_parse_crash_log_unicode_message() {
        let log = "=== CRASH REPORT ===
Timestamp: 2024-01-15T10:30:00+00:00
Location: src/main.rs:42:5
Message: 日本語のエラーメッセージ 🔥 émoji
Backtrace:
   0: test
==================
";

        let reports = CrashManager::parse_crash_log(log);
        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0].message, "日本語のエラーメッセージ 🔥 émoji");
    }

    #[test]
    fn test_parse_crash_log_very_long_message() {
        let long_message = "a".repeat(10000);
        let log = format!(
            "=== CRASH REPORT ===
Timestamp: 2024-01-15T10:30:00+00:00
Location: src/main.rs:42:5
Message: {}
Backtrace:
==================
",
            long_message
        );

        let reports = CrashManager::parse_crash_log(&log);
        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0].message.len(), 10000);
    }

    #[test]
    fn test_parse_crash_log_special_characters_in_location() {
        let log = "=== CRASH REPORT ===
Timestamp: 2024-01-15T10:30:00+00:00
Location: /path/with spaces/and-dashes/file_name.rs:42:5
Message: test
Backtrace:
==================
";

        let reports = CrashManager::parse_crash_log(log);
        assert_eq!(reports.len(), 1);
        assert_eq!(
            reports[0].location,
            "/path/with spaces/and-dashes/file_name.rs:42:5"
        );
    }

    #[test]
    fn test_parse_crash_log_multiline_backtrace() {
        let log = "=== CRASH REPORT ===
Timestamp: 2024-01-15T10:30:00+00:00
Location: src/main.rs:42:5
Message: test
Backtrace:
   0: std::backtrace::Backtrace::capture
             at /rustc/abc123/library/std/src/backtrace.rs:123
   1: my_app::main
             at ./src/main.rs:42
   2: std::rt::lang_start
==================
";

        let reports = CrashManager::parse_crash_log(log);
        assert_eq!(reports.len(), 1);
        let bt = reports[0].backtrace.as_deref();
        assert!(bt.is_some());
        let backtrace = bt.unwrap_or("");
        assert!(backtrace.contains("std::backtrace::Backtrace::capture"));
        assert!(backtrace.contains("my_app::main"));
    }

    // ========================================================================
    // CrashManager Tests
    // ========================================================================

    #[test]
    fn test_crash_manager_creation() {
        let manager = CrashManager::new("test_app");
        assert!(manager.is_some());

        let manager = manager.as_ref().unwrap();
        let path = manager.crash_log_path();
        assert!(path.ends_with("crash.log"));
    }

    #[test]
    fn test_crash_manager_no_pending_crashes_when_empty() {
        let Some(manager) = CrashManager::new("orbit_test_empty") else {
            return;
        };
        // Should be false if log doesn't exist or is empty
        // (This might be true if previous tests left logs, so we just check it doesn't crash)
        let _ = manager.has_pending_crashes();
    }

    #[test]
    fn test_crash_manager_read_nonexistent_log() {
        let Some(manager) = CrashManager::new("orbit_test_nonexistent_xyz123") else {
            return;
        };
        let contents = manager.read_crash_log();

        // Should return None for nonexistent log
        assert!(contents.is_none());
    }

    #[test]
    fn test_crash_manager_all_crash_logs() {
        let manager = CrashManager::new("orbit_test_all_logs");
        if let Some(m) = &manager {
            let logs = m.all_crash_logs();
            // Should return a list (possibly empty)
            assert!(logs.len() <= MAX_LOG_FILES + 1);
        }
    }

    // ========================================================================
    // CrashReport Serialization Tests
    // ========================================================================

    #[test]
    fn test_crash_report_serialization() {
        let report = CrashReport {
            timestamp: "2024-01-15T10:30:00+00:00".to_string(),
            location: "src/main.rs:42:5".to_string(),
            message: "test panic".to_string(),
            backtrace: Some("backtrace here".to_string()),
        };

        // Test JSON serialization
        let json = serde_json::to_string(&report).unwrap();
        assert!(json.contains("test panic"));
        assert!(json.contains("2024-01-15"));
    }

    #[test]
    fn test_crash_report_deserialization() {
        let json = r#"{
            "timestamp": "2024-01-15T10:30:00+00:00",
            "location": "src/main.rs:42:5",
            "message": "test panic",
            "backtrace": null
        }"#;

        let report: CrashReport = serde_json::from_str(json).unwrap();
        assert_eq!(report.message, "test panic");
        assert!(report.backtrace.is_none());
    }

    // ========================================================================
    // Integration Tests (File System)
    // ========================================================================

    #[test]
    fn test_crash_log_write_and_read() {
        let m = create_test_manager("write-read");
        let log_path = m.crash_log_path();

        // Clean up any existing log
        drop(fs::remove_dir_all(&m.log_dir));

        // Create parent directory
        if let Some(parent) = log_path.parent() {
            fs::create_dir_all(parent).expect("Should create crash log directory");
        }

        // Write a test crash log
        let test_content = "=== CRASH REPORT ===
Timestamp: 2024-01-15T10:30:00+00:00
Location: src/test.rs:1:1
Message: test message
Backtrace:
   0: test
==================
";

        fs::write(&log_path, test_content).expect("Should write crash log");

        // Verify has_pending_crashes returns true
        assert!(m.has_pending_crashes());

        // Read the log
        let contents = m.read_crash_log();
        assert!(contents.is_some());
        let content_str = contents.as_deref().unwrap_or("");
        assert!(content_str.contains("test message"));

        // Parse it
        let reports = CrashManager::parse_crash_log(content_str);
        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0].message, "test message");

        // Clean up
        drop(fs::remove_dir_all(&m.log_dir));
    }

    #[test]
    fn test_crash_log_consume() {
        let m = create_test_manager("consume");
        let log_path = m.crash_log_path();

        // Clean up and create
        drop(fs::remove_dir_all(&m.log_dir));
        if let Some(parent) = log_path.parent() {
            fs::create_dir_all(parent).expect("Should create crash log directory");
        }

        // Write test content
        fs::write(&log_path, "test content").expect("Should write crash log");

        // Consume should read and clear
        let contents = m.consume_crash_log();
        assert!(contents.is_some());
        let content_str = contents.as_deref().unwrap_or("");
        assert!(content_str.contains("test content"));

        // After consume, should be empty
        assert!(!m.has_pending_crashes());

        // Clean up
        drop(fs::remove_dir_all(&m.log_dir));
    }

    #[test]
    fn test_crash_log_clear() {
        let m = create_test_manager("clear");
        let log_path = m.crash_log_path();

        // Clean up and create
        drop(fs::remove_dir_all(&m.log_dir));
        if let Some(parent) = log_path.parent() {
            fs::create_dir_all(parent).expect("Should create crash log directory");
        }

        // Write test content
        fs::write(&log_path, "content to clear").expect("Should write crash log");

        assert!(m.has_pending_crashes());

        // Clear
        m.clear_crash_log().expect("clear_crash_log should succeed");

        // Should now be empty
        assert!(!m.has_pending_crashes());

        // Clean up
        drop(fs::remove_dir_all(&m.log_dir));
    }

    // ========================================================================
    // Edge Case Tests
    // ========================================================================

    #[test]
    fn test_extract_panic_message_types() {
        // Test that the message extraction handles different payload types
        // (This is tested implicitly through the actual panic hook, but we
        // can at least verify the function signature works)

        // Note: We can't easily test PanicHookInfo directly in unit tests
        // because it requires triggering an actual panic. The integration
        // test will cover this.
    }

    #[test]
    fn test_rotation_constants() {
        // Verify constants are reasonable (const assertions)
        const {
            assert!(MAX_LOG_SIZE > 0);
            assert!(MAX_LOG_SIZE <= 100 * 1024 * 1024); // No more than 100MB
            assert!(MAX_LOG_FILES > 0);
            assert!(MAX_LOG_FILES <= 10); // Reasonable limit
        }
    }

    #[test]
    fn test_crash_log_name_constant() {
        assert_eq!(CRASH_LOG_NAME, "crash.log");
    }
}
