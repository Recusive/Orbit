//! Dev-monitor commands for writing log events to JSONL files.
//!
//! These commands support the frontend dev-monitor system by providing
//! file I/O operations for writing batched log entries.
//!
//! All operations are dev-only - in production builds, the frontend
//! should never call these commands.

#![allow(
    clippy::needless_pass_by_value,
    reason = "Tauri commands receive owned types from JSON deserialization"
)]

use std::path::Path;

use orbit_core::{Error, Result};
use serde::{Deserialize, Serialize};
use tokio::fs;
use tokio::io::AsyncWriteExt as _;

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/// A dev log entry from the frontend.
///
/// This matches the `DevLogEntry` type from the frontend dev-monitor.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevLogEntry {
    /// Unix timestamp in milliseconds
    pub timestamp: f64,

    /// Severity level
    pub severity: String,

    /// Category (e.g., "fn:call", "react:render", "ipc:invoke")
    pub category: String,

    /// Source file or module
    pub file: String,

    /// Function or component name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function: Option<String>,

    /// Short description
    pub title: String,

    /// Extended details (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,

    /// Additional context data
    #[serde(default, skip_serializing_if = "serde_json::Value::is_null")]
    pub context: serde_json::Value,

    /// Dedup count (how many times this entry was seen)
    #[serde(default = "default_dedup_count", skip_serializing_if = "is_one")]
    pub dedup_count: u32,
}

fn default_dedup_count() -> u32 {
    1
}

/// Check if dedup_count is 1 (for serde skip_serializing_if).
/// Takes reference because serde requires `fn(&T) -> bool` signature.
#[expect(
    clippy::trivially_copy_pass_by_ref,
    reason = "serde skip_serializing_if requires fn(&T) -> bool"
)]
const fn is_one(val: &u32) -> bool {
    *val == 1
}

// ═══════════════════════════════════════════════════════════════
// Commands
// ═══════════════════════════════════════════════════════════════

/// Ensure the dev-monitor output directory exists.
///
/// # Arguments
///
/// * `dir_path` - Path to the directory to create
///
/// # Errors
///
/// Returns an error if the directory cannot be created.
#[tauri::command]
pub async fn dev_monitor_ensure_dir(dir_path: String) -> Result<()> {
    let path = Path::new(&dir_path);

    // Only create if it doesn't exist
    if !path.exists() {
        fs::create_dir_all(path).await.map_err(|e| {
            Error::Other(format!(
                "Failed to create dev-monitor directory '{dir_path}': {e}"
            ))
        })?;

        log::debug!("[DevMonitor] Created directory: {dir_path}");
    }

    Ok(())
}

/// Write a batch of log entries to a JSONL file.
///
/// Each entry is written as a single JSON line, appended to the file.
/// The file is created if it doesn't exist.
///
/// # Arguments
///
/// * `file_path` - Path to the JSONL file
/// * `entries` - Array of log entries to write
///
/// # Errors
///
/// Returns an error if the file cannot be written.
#[tauri::command]
pub async fn dev_monitor_write_batch(file_path: String, entries: Vec<DevLogEntry>) -> Result<()> {
    if entries.is_empty() {
        return Ok(());
    }

    // Build the content to write (one JSON line per entry)
    let mut content = String::new();
    for entry in &entries {
        // Serialize each entry as a single line
        match serde_json::to_string(entry) {
            Ok(json) => {
                content.push_str(&json);
                content.push('\n');
            },
            Err(e) => {
                // Log but don't fail - we don't want monitoring to crash the app
                log::warn!("[DevMonitor] Failed to serialize entry: {e}");
            },
        }
    }

    if content.is_empty() {
        return Ok(());
    }

    // Open file for appending (create if doesn't exist)
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file_path)
        .await
        .map_err(|e| {
            Error::Other(format!(
                "Failed to open dev-monitor file '{file_path}': {e}"
            ))
        })?;

    // Write the content
    file.write_all(content.as_bytes()).await.map_err(|e| {
        Error::Other(format!(
            "Failed to write to dev-monitor file '{file_path}': {e}"
        ))
    })?;

    // Ensure data is flushed to disk
    file.flush().await.map_err(|e| {
        Error::Other(format!(
            "Failed to flush dev-monitor file '{file_path}': {e}"
        ))
    })?;

    let entry_count = entries.len();
    log::trace!("[DevMonitor] Wrote {entry_count} entries to {file_path}");

    Ok(())
}

/// Read recent log entries from a JSONL file.
///
/// Reads the last N entries from the file for display in a dev panel.
///
/// # Arguments
///
/// * `file_path` - Path to the JSONL file
/// * `limit` - Maximum number of entries to return (default: 100)
///
/// # Errors
///
/// Returns an error if the file cannot be read.
#[tauri::command]
pub async fn dev_monitor_read_entries(
    file_path: String,
    limit: Option<usize>,
) -> Result<Vec<DevLogEntry>> {
    let limit = limit.unwrap_or(100);
    let path = Path::new(&file_path);

    // Return empty if file doesn't exist
    if !path.exists() {
        return Ok(Vec::new());
    }

    // Read the file
    let content = fs::read_to_string(path).await.map_err(|e| {
        Error::Other(format!(
            "Failed to read dev-monitor file '{file_path}': {e}"
        ))
    })?;

    // Parse each line as a JSON entry
    let mut entries: Vec<DevLogEntry> = Vec::new();
    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }
        match serde_json::from_str::<DevLogEntry>(line) {
            Ok(entry) => entries.push(entry),
            Err(e) => {
                // Log but continue - don't fail on malformed entries
                log::trace!("[DevMonitor] Failed to parse entry: {e}");
            },
        }
    }

    // Return the last N entries
    if entries.len() > limit {
        entries = entries.split_off(entries.len() - limit);
    }

    Ok(entries)
}

/// Clear all log files in the dev-monitor directory.
///
/// This removes all `.jsonl` files in the directory.
///
/// # Arguments
///
/// * `dir_path` - Path to the dev-monitor directory
///
/// # Errors
///
/// Returns an error if files cannot be removed.
#[tauri::command]
pub async fn dev_monitor_clear(dir_path: String) -> Result<()> {
    let path = Path::new(&dir_path);

    // Return if directory doesn't exist
    if !path.exists() {
        return Ok(());
    }

    // Read directory entries
    let mut dir = fs::read_dir(path).await.map_err(|e| {
        Error::Other(format!(
            "Failed to read dev-monitor directory '{dir_path}': {e}"
        ))
    })?;

    // Remove all .jsonl files
    let mut removed_count = 0u32;
    while let Some(entry) = dir
        .next_entry()
        .await
        .map_err(|e| Error::Other(format!("Failed to read directory entry: {e}")))?
    {
        let entry_path = entry.path();
        if entry_path.extension().is_some_and(|ext| ext == "jsonl") {
            fs::remove_file(&entry_path).await.map_err(|e| {
                let display = entry_path.display();
                Error::Other(format!("Failed to remove file '{display}': {e}"))
            })?;
            removed_count += 1;
        }
    }

    log::debug!("[DevMonitor] Cleared {removed_count} log files from {dir_path}");

    Ok(())
}
