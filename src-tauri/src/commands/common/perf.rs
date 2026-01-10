//! Performance logging commands for the frontend.
//!
//! These commands allow the frontend to:
//! - Retrieve performance log contents for display
//! - Clear the performance log file
//! - Get the path to the log file
//! - Analyze performance metrics and bottlenecks
//! - Get recent events for jank correlation

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use regex::Regex;
use serde::Serialize;

use crate::core::perf_logger;

/// Summary statistics for a single source (IPC, GIT, SIDECAR, etc.)
#[derive(Debug, Clone, Copy, Serialize)]
pub struct SourceSummary {
    /// Total number of completed operations
    pub count: usize,
    /// Average duration in milliseconds
    pub avg_ms: f64,
    /// Maximum duration in milliseconds
    pub max_ms: u64,
    /// Minimum duration in milliseconds
    pub min_ms: u64,
    /// Total duration in milliseconds
    pub total_ms: u64,
}

/// A single operation record from the log
#[derive(Debug, Clone, Serialize)]
pub struct OperationRecord {
    /// Timestamp in milliseconds since epoch
    pub timestamp: u128,
    /// Source (IPC, GIT, SIDECAR, etc.)
    pub source: String,
    /// Operation name
    pub operation: String,
    /// Duration in milliseconds (only for END events)
    pub duration_ms: Option<u64>,
    /// Additional metadata (item count, etc.)
    pub metadata: Option<String>,
}

/// Complete performance analysis summary
#[derive(Debug, Clone, Serialize)]
pub struct PerformanceAnalysis {
    /// Total number of entries in the log
    pub total_entries: usize,
    /// Total number of completed operations (with duration)
    pub total_operations: usize,
    /// Summary statistics by source
    pub by_source: HashMap<String, SourceSummary>,
    /// Operations over 500ms (potential bottlenecks)
    pub bottlenecks: Vec<OperationRecord>,
    /// Slowest 10 operations
    pub slowest: Vec<OperationRecord>,
    /// Timeline of last 50 operations
    pub timeline: Vec<OperationRecord>,
}

/// Recent performance events for jank correlation
#[derive(Debug, Clone, Serialize)]
pub struct RecentPerfEvents {
    /// Current timestamp when query was made
    pub query_timestamp: u128,
    /// Events from the requested time window
    pub events: Vec<OperationRecord>,
    /// Time window in milliseconds that was searched
    pub window_ms: u64,
    /// Total events found in window
    pub count: usize,
}

/// Clear the performance log file.
///
/// Truncates the log file to zero bytes.
///
/// Returns `true` on success, `false` on failure.
#[tauri::command]
pub fn clear_perf_log() -> bool {
    perf_logger::perf_log_clear().is_ok()
}

/// Get the contents of the performance log file.
///
/// Returns the full log contents as a string, or an empty string if the
/// file cannot be read.
#[tauri::command]
pub fn get_perf_log() -> String {
    perf_logger::perf_log_get().unwrap_or_default()
}

/// Get the path to the performance log file.
///
/// Useful for opening the file in an external editor.
#[tauri::command]
pub fn get_perf_log_path() -> String {
    perf_logger::perf_log_path().to_string_lossy().into_owned()
}

/// Analyze the performance log and return a comprehensive summary.
///
/// This parses all log entries and computes:
/// - Summary statistics by source (count, avg, max, min)
/// - Bottlenecks (operations over 500ms)
/// - Slowest 10 operations
/// - Timeline of last 50 operations
///
/// # Returns
///
/// A `PerformanceAnalysis` struct containing all metrics.
#[tauri::command]
pub fn analyze_performance() -> PerformanceAnalysis {
    let log_content = perf_logger::perf_log_get().unwrap_or_default();
    parse_and_analyze(&log_content)
}

/// Get recent performance events within a time window.
///
/// This is designed for jank correlation - when the frontend detects a freeze,
/// it can quickly fetch recent backend activity to identify what caused it.
///
/// # Arguments
///
/// * `window_ms` - Time window in milliseconds to look back (default: 2000ms)
///
/// # Returns
///
/// A `RecentPerfEvents` struct containing all events from the time window.
#[tauri::command]
pub fn get_recent_perf_events(window_ms: Option<u64>) -> RecentPerfEvents {
    let window = window_ms.unwrap_or(2000); // Default to 2 seconds
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);

    let cutoff = now.saturating_sub(window as u128);

    let log_content = perf_logger::perf_log_get().unwrap_or_default();
    let events = parse_recent_events(&log_content, cutoff);
    let count = events.len();

    RecentPerfEvents {
        query_timestamp: now,
        events,
        window_ms: window,
        count,
    }
}

/// Parse log content and return events after the cutoff timestamp.
fn parse_recent_events(content: &str, cutoff_timestamp: u128) -> Vec<OperationRecord> {
    // Regex to parse log entries
    let end_pattern =
        Regex::new(r"\[(\d+)\] \[([A-Z]+):([^\]]+)\] END \((\d+)ms\)(?:\s*-\s*(.+))?")
            .expect("Invalid regex pattern");

    let start_pattern =
        Regex::new(r"\[(\d+)\] \[([A-Z]+):([^\]]+)\] START").expect("Invalid regex pattern");

    let mut events: Vec<OperationRecord> = Vec::new();

    // Parse lines in reverse order (newest first) for efficiency
    for line in content.lines().rev() {
        // Try to match END pattern first
        if let Some(caps) = end_pattern.captures(line) {
            let timestamp: u128 = caps[1].parse().unwrap_or(0);

            // Skip events older than cutoff
            if timestamp < cutoff_timestamp {
                continue;
            }

            let source = caps[2].to_string();
            let operation = caps[3].to_string();
            let duration_ms: u64 = caps[4].parse().unwrap_or(0);
            let metadata = caps.get(5).map(|m| m.as_str().to_string());

            events.push(OperationRecord {
                timestamp,
                source,
                operation,
                duration_ms: Some(duration_ms),
                metadata,
            });
        } else if let Some(caps) = start_pattern.captures(line) {
            let timestamp: u128 = caps[1].parse().unwrap_or(0);

            // Skip events older than cutoff
            if timestamp < cutoff_timestamp {
                continue;
            }

            let source = caps[2].to_string();
            let operation = caps[3].to_string();

            events.push(OperationRecord {
                timestamp,
                source,
                operation,
                duration_ms: None,
                metadata: None,
            });
        }
    }

    // Sort by timestamp ascending (oldest first) for chronological display
    events.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
    events
}

/// Parse log content and compute analysis.
fn parse_and_analyze(content: &str) -> PerformanceAnalysis {
    // Regex to parse log entries:
    // Format: [timestamp] [SOURCE:operation] END (duration_ms) - optional metadata
    // Example: [1704067200000] [IPC:ask_claude] END (123ms) - 5 items
    let end_pattern =
        Regex::new(r"\[(\d+)\] \[([A-Z]+):([^\]]+)\] END \((\d+)ms\)(?:\s*-\s*(.+))?")
            .expect("Invalid regex pattern");

    // Regex for START entries (for timeline)
    let start_pattern =
        Regex::new(r"\[(\d+)\] \[([A-Z]+):([^\]]+)\] START").expect("Invalid regex pattern");

    let mut all_operations: Vec<OperationRecord> = Vec::new();
    let mut source_durations: HashMap<String, Vec<u64>> = HashMap::new();
    let total_entries = content.lines().count();

    // Parse all lines
    for line in content.lines() {
        // Try to match END pattern first (has duration)
        if let Some(caps) = end_pattern.captures(line) {
            let timestamp: u128 = caps[1].parse().unwrap_or(0);
            let source = caps[2].to_string();
            let operation = caps[3].to_string();
            let duration_ms: u64 = caps[4].parse().unwrap_or(0);
            let metadata = caps.get(5).map(|m| m.as_str().to_string());

            // Track duration for source aggregation
            source_durations
                .entry(source.clone())
                .or_default()
                .push(duration_ms);

            all_operations.push(OperationRecord {
                timestamp,
                source,
                operation,
                duration_ms: Some(duration_ms),
                metadata,
            });
        } else if let Some(caps) = start_pattern.captures(line) {
            // Match START pattern (no duration)
            let timestamp: u128 = caps[1].parse().unwrap_or(0);
            let source = caps[2].to_string();
            let operation = caps[3].to_string();

            all_operations.push(OperationRecord {
                timestamp,
                source,
                operation,
                duration_ms: None,
                metadata: None,
            });
        }
    }

    // Compute source summaries
    let by_source: HashMap<String, SourceSummary> = source_durations
        .iter()
        .map(|(source, durations)| {
            let count = durations.len();
            let total_ms: u64 = durations.iter().sum();
            let avg_ms = if count > 0 {
                total_ms as f64 / count as f64
            } else {
                0.0
            };
            let max_ms = durations.iter().copied().max().unwrap_or(0);
            let min_ms = durations.iter().copied().min().unwrap_or(0);

            (
                source.clone(),
                SourceSummary {
                    count,
                    avg_ms,
                    max_ms,
                    min_ms,
                    total_ms,
                },
            )
        })
        .collect();

    // Get operations with duration for sorting
    let mut ops_with_duration: Vec<OperationRecord> = all_operations
        .iter()
        .filter(|op| op.duration_ms.is_some())
        .cloned()
        .collect();

    // Sort by duration descending for slowest
    ops_with_duration.sort_by(|a, b| b.duration_ms.unwrap_or(0).cmp(&a.duration_ms.unwrap_or(0)));

    // Slowest 10
    let slowest: Vec<OperationRecord> = ops_with_duration.iter().take(10).cloned().collect();

    // Bottlenecks (over 500ms)
    let bottlenecks: Vec<OperationRecord> = ops_with_duration
        .iter()
        .filter(|op| op.duration_ms.unwrap_or(0) > 500)
        .cloned()
        .collect();

    // Timeline of last 50 operations (all types, sorted by timestamp)
    let mut timeline: Vec<OperationRecord> = all_operations;
    timeline.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    timeline.truncate(50);

    let total_operations = ops_with_duration.len();

    PerformanceAnalysis {
        total_entries,
        total_operations,
        by_source,
        bottlenecks,
        slowest,
        timeline,
    }
}
