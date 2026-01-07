//! File system commands for Tauri
//!
//! These commands wrap the orbit-fs crate for use in the frontend.

#![allow(
    clippy::needless_pass_by_value,
    reason = "Tauri commands receive owned types from JSON deserialization"
)]

use std::collections::HashSet;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::Duration;

use orbit_core::{Error, FileEntry, FileInfo, Result};
use orbit_fs::FileWatcher;
use parking_lot::Mutex;
use serde::Serialize;
use tauri::{async_runtime, AppHandle, Emitter as _};
use tokio::time::sleep;

// ============================================
// Basic File Operations
// ============================================

/// Read file contents as a string
#[tauri::command]
pub async fn read_file(path: String) -> Result<String> {
    orbit_fs::read_file(&path).await
}

/// Read file contents as bytes (base64 encoded for transport)
#[tauri::command]
pub async fn read_file_bytes(path: String) -> Result<Vec<u8>> {
    orbit_fs::read_file_bytes(&path).await
}

/// Write content to a file
#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<()> {
    orbit_fs::write_file(&path, &content).await
}

/// Write bytes to a file
#[tauri::command]
pub async fn write_file_bytes(path: String, content: Vec<u8>) -> Result<()> {
    orbit_fs::write_file_bytes(&path, &content).await
}

/// List directory contents
///
/// # Arguments
///
/// * `path` - Directory path to list
/// * `show_hidden` - Whether to include hidden files (default: false)
#[tauri::command]
pub async fn list_directory(path: String, show_hidden: Option<bool>) -> Result<Vec<FileEntry>> {
    orbit_fs::list_directory(&path, show_hidden.unwrap_or(false)).await
}

/// Create an empty file
#[tauri::command]
pub async fn create_file(path: String) -> Result<()> {
    orbit_fs::create_file(&path).await
}

/// Create a directory (and parents if needed)
#[tauri::command]
pub async fn create_directory(path: String) -> Result<()> {
    orbit_fs::create_directory(&path).await
}

/// Delete a file or directory
#[tauri::command]
pub async fn delete_file(path: String) -> Result<()> {
    orbit_fs::delete_file(&path).await
}

/// Rename or move a file
#[tauri::command]
pub async fn rename_file(old_path: String, new_path: String) -> Result<()> {
    orbit_fs::rename_file(&old_path, &new_path).await
}

/// Copy a file
#[tauri::command]
pub async fn copy_file(from: String, to: String) -> Result<()> {
    orbit_fs::copy_file(&from, &to).await
}

/// Check if a file exists
#[tauri::command]
pub async fn file_exists(path: String) -> bool {
    orbit_fs::file_exists(&path).await
}

/// Check if a path is a directory
#[tauri::command]
pub async fn is_directory(path: String) -> bool {
    orbit_fs::is_directory(&path).await
}

/// Get detailed file information
#[tauri::command]
pub async fn get_file_info(path: String) -> Result<FileInfo> {
    orbit_fs::get_file_info(&path).await
}

// ============================================
// File Watching
// ============================================

/// File change event sent to frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
#[non_exhaustive]
pub enum FileChangeEvent {
    /// File was created
    Created {
        /// Path to the created file
        path: String,
    },
    /// File was modified
    Modified {
        /// Path to the modified file
        path: String,
    },
    /// File was deleted
    Deleted {
        /// Path to the deleted file
        path: String,
    },
    /// File was renamed
    Renamed {
        /// Original path
        path: String,
        /// New path
        #[serde(rename = "newPath")]
        new_path: String,
    },
}

/// State for managing file watchers.
struct FileWatcherState {
    watcher: Mutex<Option<FileWatcher>>,
    watched_paths: Mutex<HashSet<String>>,
    forwarder_running: AtomicBool,
}

static FILE_WATCHER_STATE: OnceLock<FileWatcherState> = OnceLock::new();

fn get_watcher_state() -> &'static FileWatcherState {
    FILE_WATCHER_STATE.get_or_init(|| FileWatcherState {
        watcher: Mutex::new(None),
        watched_paths: Mutex::new(HashSet::new()),
        forwarder_running: AtomicBool::new(false),
    })
}

/// Normalize a path for consistent comparison.
/// Canonicalizes if the path exists, otherwise normalizes trailing slashes.
fn normalize_path(path: &str) -> String {
    let path_obj = Path::new(path);

    // Try to canonicalize (resolves symlinks, relative paths, etc.)
    if let Ok(canonical) = path_obj.canonicalize() {
        return canonical.to_string_lossy().into_owned();
    }

    // Fallback: just normalize trailing slashes
    let trimmed = path.trim_end_matches('/');
    if trimmed.is_empty() {
        "/".to_owned()
    } else {
        trimmed.to_owned()
    }
}

/// Convert orbit-fs FileEvent to our FileChangeEvent for the frontend.
fn convert_file_event(event: orbit_fs::FileEvent) -> Option<FileChangeEvent> {
    match event {
        orbit_fs::FileEvent::Created { path } => Some(FileChangeEvent::Created { path }),
        orbit_fs::FileEvent::Modified { path } => Some(FileChangeEvent::Modified { path }),
        orbit_fs::FileEvent::Deleted { path } => Some(FileChangeEvent::Deleted { path }),
        orbit_fs::FileEvent::Renamed { from, to } => Some(FileChangeEvent::Renamed {
            path: from,
            new_path: to,
        }),
        // Handle future variants gracefully
        _ => None,
    }
}

/// Start the event forwarder task if not already running.
fn start_event_forwarder(app: AppHandle) {
    let state = get_watcher_state();

    // Only start one forwarder
    if state
        .forwarder_running
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    let _handle = async_runtime::spawn(async move {
        log::debug!("File watcher event forwarder started");

        loop {
            // Collect events while holding the lock briefly
            #[expect(clippy::option_if_let_else, reason = "if-let is more readable here")]
            let (events, should_stop) = {
                let state = get_watcher_state();
                let watcher_guard = state.watcher.lock();

                if let Some(watcher) = watcher_guard.as_ref() {
                    // Drain all available events
                    let receiver = watcher.events();
                    let mut events = Vec::new();
                    while let Ok(event) = receiver.try_recv() {
                        events.push(event);
                    }

                    // Check if we should stop (no watched paths)
                    let should_stop = state.watched_paths.lock().is_empty();
                    (events, should_stop)
                } else {
                    // Watcher was dropped externally, exit
                    (Vec::new(), true)
                }
            };

            // Emit events outside the lock
            for event in events {
                if let Some(change_event) = convert_file_event(event) {
                    if let Err(e) = app.emit("file:change", &change_event) {
                        log::warn!("Failed to emit file change event: {e}");
                    }
                }
            }

            // Check if we should stop after emitting any pending events
            if should_stop {
                // Clean up watcher and watched_paths atomically
                let state = get_watcher_state();
                let mut watcher_guard = state.watcher.lock();
                let mut paths_guard = state.watched_paths.lock();

                // Only clean up if still empty (no new watches added)
                if paths_guard.is_empty() {
                    *watcher_guard = None;
                    paths_guard.clear(); // Ensure consistency
                    break;
                }
                // Otherwise, continue - new watches were added
            }

            // Small sleep to prevent busy-waiting
            sleep(Duration::from_millis(50)).await;
        }

        log::debug!("File watcher event forwarder stopped");
        get_watcher_state()
            .forwarder_running
            .store(false, Ordering::SeqCst);
    });
}

/// Watch a path for file changes.
///
/// Events will be emitted via the `file:change` event.
///
/// # Errors
///
/// Returns an error if:
/// - The path does not exist
/// - The file watcher cannot be created
/// - The path cannot be watched
#[tauri::command]
pub fn watch_path(path: String, app: AppHandle) -> Result<()> {
    // Normalize the path for consistent comparison
    let normalized_path = normalize_path(&path);
    let path_obj = Path::new(&normalized_path);

    // Validate path exists
    if !path_obj.exists() {
        return Err(Error::FileNotFound(normalized_path));
    }

    let state = get_watcher_state();

    // Check if already watching this path
    {
        let paths = state.watched_paths.lock();
        if paths.contains(&normalized_path) {
            log::debug!("Path already being watched: {normalized_path}");
            return Ok(());
        }
    }

    // Add to watched paths
    let _was_new = state.watched_paths.lock().insert(normalized_path.clone());

    // Ensure watcher exists and watch the path
    {
        let mut watcher_guard = state.watcher.lock();

        // Initialize watcher if needed
        if watcher_guard.is_none() {
            let new_watcher = FileWatcher::new().map_err(|e| {
                // Remove from watched_paths on failure
                let _removed = state.watched_paths.lock().remove(&normalized_path);
                Error::Other(format!("Failed to create file watcher: {e}"))
            })?;
            *watcher_guard = Some(new_watcher);
        }

        // Watch the path
        if let Some(watcher) = watcher_guard.as_mut() {
            if let Err(e) = watcher.watch(path_obj) {
                // Remove from watched_paths on failure
                let _removed = state.watched_paths.lock().remove(&normalized_path);
                return Err(e);
            }
        }
    }

    // Start forwarder if not running
    start_event_forwarder(app);

    log::debug!("Started watching path: {normalized_path}");
    Ok(())
}

/// Stop watching a path for file changes.
///
/// This is idempotent - calling it on a path that isn't being watched is a no-op.
#[tauri::command]
pub fn unwatch_path(path: String) -> Result<()> {
    // Normalize the path for consistent comparison
    let normalized_path = normalize_path(&path);

    let state = get_watcher_state();

    // Check if we're actually watching this path
    let was_watching = {
        let mut paths = state.watched_paths.lock();
        paths.remove(&normalized_path)
    };

    if !was_watching {
        log::debug!("Path was not being watched: {normalized_path}");
        return Ok(());
    }

    // Unwatch from the watcher (ignore errors - path might already be gone)
    {
        let mut watcher_guard = state.watcher.lock();
        if let Some(ref mut watcher) = *watcher_guard {
            // Log but don't fail if unwatch errors (path might have been deleted)
            if let Err(e) = watcher.unwatch(Path::new(&normalized_path)) {
                log::debug!("Unwatch returned error (path may have been deleted): {e}");
            }
        }
    }

    log::debug!("Stopped watching path: {normalized_path}");
    Ok(())
}
