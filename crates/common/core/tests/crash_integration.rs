//! Integration tests for the crash handling system.
//!
//! These tests verify the full panic hook -> log file -> recovery flow.
//!
//! Each test uses a unique app name to avoid race conditions when
//! tests run in parallel.

// Integration tests in `tests/` directory are by definition test code
#![expect(
    clippy::tests_outside_test_module,
    reason = "Integration tests in tests/ directory don't need cfg(test) wrapper"
)]
#![expect(
    clippy::expect_used,
    reason = "Integration tests use expect() for clear failure messages"
)]

use snowflake_core::crash::CrashManager;
use std::fs::{self, File, OpenOptions};
use std::io::Write as _;
use std::path::PathBuf;

/// Generate a unique test app name using the test name and a random suffix.
fn unique_test_app(base_name: &str) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("snowflake_test_{base_name}_{}", ts % 1_000_000_u128)
}

/// Helper to get crash log path for a test app.
fn crash_log_path_for(app_name: &str) -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| d.join(app_name).join("logs").join("crash.log"))
}

/// Clean up test crash logs for a specific app.
fn cleanup_test_logs_for(app_name: &str) {
    if let Some(path) = crash_log_path_for(app_name) {
        drop(fs::remove_file(&path));
        // Also remove rotated logs
        if let Some(parent) = path.parent() {
            for i in 1_i32..=5_i32 {
                let rotated = parent.join(format!("crash.log.{i}"));
                drop(fs::remove_file(&rotated));
            }
            // Try to remove the directories if empty
            drop(fs::remove_dir(parent));
            if let Some(grandparent) = parent.parent() {
                drop(fs::remove_dir(grandparent));
            }
        }
    }
}

#[test]
fn test_crash_manager_full_lifecycle() {
    let app_name = unique_test_app("lifecycle");
    cleanup_test_logs_for(&app_name);

    let manager = CrashManager::new(&app_name);
    assert!(manager.is_some(), "Should create manager");

    let manager = manager.as_ref();

    // Initially no crashes
    let has_pending = manager.is_none_or(CrashManager::has_pending_crashes);
    assert!(!has_pending, "Should have no pending crashes initially");

    // Simulate a crash by writing directly to the log
    if let Some(m) = manager {
        let log_path = m.crash_log_path();
        if let Some(parent) = log_path.parent() {
            drop(fs::create_dir_all(parent));
        }

        let crash_content = "=== CRASH REPORT ===
Timestamp: 2024-12-31T12:00:00+00:00
Location: tests/crash_integration.rs:42:5
Message: test integration panic
Backtrace:
   0: test::frame
==================
";

        if let Ok(mut f) = File::create(&log_path) {
            drop(f.write_all(crash_content.as_bytes()));
        }
    }

    // Now should have pending crashes
    let has_pending = manager.is_some_and(CrashManager::has_pending_crashes);
    assert!(has_pending, "Should have pending crashes after writing log");

    // Read the log
    let contents = manager.and_then(CrashManager::read_crash_log);
    assert!(contents.is_some(), "Should read crash log");

    let content_str = contents.as_deref().unwrap_or("");
    assert!(
        content_str.contains("test integration panic"),
        "Log should contain our message"
    );

    // Parse it
    let reports = CrashManager::parse_crash_log(content_str);
    assert_eq!(reports.len(), 1, "Should parse one report");

    let first = reports.first().expect("Should have first report");
    assert_eq!(first.message, "test integration panic");
    assert_eq!(first.location, "tests/crash_integration.rs:42:5");

    // Consume (clear) the log
    let manager2 = CrashManager::new(&app_name);
    let consumed = manager2.as_ref().and_then(CrashManager::consume_crash_log);
    assert!(consumed.is_some(), "Should consume crash log");

    // After consuming, no more pending crashes
    let has_pending = manager2
        .as_ref()
        .is_none_or(CrashManager::has_pending_crashes);
    assert!(!has_pending, "Should have no pending crashes after consume");

    cleanup_test_logs_for(&app_name);
}

#[test]
fn test_crash_report_from_log_parsing() {
    // Test that we can parse crash logs with special characters and unicode
    let log = "=== CRASH REPORT ===
Timestamp: 2024-12-31T12:00:00+00:00
Location: src/main.rs:100:5
Message: test roundtrip message with special chars: 日本語 🔥
Backtrace:
frame 0
frame 1
frame 2
==================
";

    let reports = CrashManager::parse_crash_log(log);
    assert_eq!(reports.len(), 1, "Should parse one report");

    let first = reports.first().expect("Should have first report");
    assert_eq!(first.timestamp, "2024-12-31T12:00:00+00:00");
    assert_eq!(first.location, "src/main.rs:100:5");
    assert_eq!(
        first.message,
        "test roundtrip message with special chars: 日本語 🔥"
    );
    assert!(first.backtrace.is_some());

    let bt = first.backtrace.as_deref().unwrap_or("");
    assert!(bt.contains("frame 0"));
    assert!(bt.contains("frame 2"));
}

#[test]
fn test_multiple_crashes_append() {
    let app_name = unique_test_app("multiple");
    cleanup_test_logs_for(&app_name);

    let manager = CrashManager::new(&app_name);
    let Some(m) = manager.as_ref() else {
        return;
    };

    let log_path = m.crash_log_path();
    if let Some(parent) = log_path.parent() {
        drop(fs::create_dir_all(parent));
    }

    // Write first crash
    let crash1 = "=== CRASH REPORT ===
Timestamp: 2024-12-31T10:00:00+00:00
Location: first.rs:1:1
Message: first crash
Backtrace:
==================
";

    if let Ok(mut f) = File::create(&log_path) {
        drop(f.write_all(crash1.as_bytes()));
    }

    // Append second crash
    let crash2 = "
=== CRASH REPORT ===
Timestamp: 2024-12-31T11:00:00+00:00
Location: second.rs:2:2
Message: second crash
Backtrace:
==================
";

    if let Ok(mut f) = OpenOptions::new().append(true).open(&log_path) {
        drop(f.write_all(crash2.as_bytes()));
    }

    // Read and parse
    let contents = m.read_crash_log();
    let content_str = contents.as_deref().unwrap_or("");
    let reports = CrashManager::parse_crash_log(content_str);

    assert_eq!(reports.len(), 2, "Should have two crash reports");

    let first = reports.first().expect("Should have first report");
    let second = reports.get(1).expect("Should have second report");
    assert_eq!(first.message, "first crash");
    assert_eq!(second.message, "second crash");

    cleanup_test_logs_for(&app_name);
}

#[test]
fn test_empty_log_handling() {
    let app_name = unique_test_app("empty");
    cleanup_test_logs_for(&app_name);

    let manager = CrashManager::new(&app_name);
    let Some(m) = manager.as_ref() else {
        return;
    };

    let log_path = m.crash_log_path();
    if let Some(parent) = log_path.parent() {
        drop(fs::create_dir_all(parent));
    }

    // Create empty file
    drop(File::create(&log_path));

    // Should not have pending crashes (empty file)
    assert!(
        !m.has_pending_crashes(),
        "Empty file should not count as pending crash"
    );

    // Read should return None for empty
    let contents = m.read_crash_log();
    assert!(contents.is_none(), "Empty file should return None");

    cleanup_test_logs_for(&app_name);
}

#[test]
fn test_delete_all_logs() {
    let app_name = unique_test_app("delete_all");
    cleanup_test_logs_for(&app_name);

    let manager = CrashManager::new(&app_name);
    let Some(m) = manager.as_ref() else {
        return;
    };

    let log_path = m.crash_log_path();
    let Some(parent) = log_path.parent() else {
        return;
    };
    drop(fs::create_dir_all(parent));

    // Create main log and some rotated logs
    if let Ok(mut f) = File::create(&log_path) {
        drop(f.write_all(b"main log"));
    }

    let rotated1 = parent.join("crash.log.1");
    if let Ok(mut f) = File::create(&rotated1) {
        drop(f.write_all(b"rotated 1"));
    }

    let rotated2 = parent.join("crash.log.2");
    if let Ok(mut f) = File::create(&rotated2) {
        drop(f.write_all(b"rotated 2"));
    }

    // Should have logs
    let logs = m.all_crash_logs();
    assert!(!logs.is_empty(), "Should have crash logs");

    // Delete all
    let deleted = m.delete_all_logs();
    assert!(deleted > 0, "Should delete at least one log");

    // Should have no logs
    let logs = m.all_crash_logs();
    assert!(logs.is_empty(), "Should have no crash logs after delete");

    cleanup_test_logs_for(&app_name);
}
