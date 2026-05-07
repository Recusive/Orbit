//! File system commands for Tauri
//!
//! These commands wrap the orbit-fs crate for use in the frontend.
//! Errors are captured to Sentry for monitoring via the `SentryCapture` trait.

#![expect(
    clippy::needless_pass_by_value,
    reason = "Tauri commands receive owned types from JSON deserialization"
)]

use std::collections::HashSet;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::Duration;

use orbit_core::{Error, FileEntry, FileInfo, Result};
use orbit_fs::FileWatcher;
use parking_lot::Mutex;
use serde::Serialize;
use tauri::{async_runtime, AppHandle, Emitter as _};
use tokio::time::sleep;

use super::workspace;
use crate::core::sentry_utils::SentryCapture as _;

// ============================================
// Basic File Operations
// ============================================
//
// SECURITY NOTE: Read-only file operations (read_file, file_exists, is_directory,
// get_file_info) are NOT restricted to the workspace directory. This matches VS Code
// behavior where the editor can read any file on the system. Write operations remain
// sandboxed to the workspace via resolve_workspace_path(). The frontend must not
// expose file paths to untrusted input (e.g., from web content or user-provided URLs).

/// Read file contents as a string.
///
/// Read-only: no workspace restriction. Matches VS Code behavior where any file
/// on disk can be opened for reading, while writes remain sandboxed.
#[tauri::command]
pub async fn read_file(path: String) -> Result<String> {
    orbit_fs::read_file(&path).await.capture("read_file")
}

/// Read file contents as bytes (base64 encoded for transport).
///
/// Read-only: no workspace restriction (see `read_file`).
#[tauri::command]
pub async fn read_file_bytes(path: String) -> Result<Vec<u8>> {
    orbit_fs::read_file_bytes(&path)
        .await
        .capture("read_file_bytes")
}

/// Write content to a file
#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<()> {
    let resolved_path = resolve_workspace_path(&path)?;
    let resolved_path = path_to_string(&resolved_path);
    orbit_fs::write_file(&resolved_path, &content)
        .await
        .capture("write_file")
}

/// Write bytes to a file
#[tauri::command]
pub async fn write_file_bytes(path: String, content: Vec<u8>) -> Result<()> {
    let resolved_path = resolve_workspace_path(&path)?;
    let resolved_path = path_to_string(&resolved_path);
    orbit_fs::write_file_bytes(&resolved_path, &content)
        .await
        .capture("write_file_bytes")
}

/// List directory contents
///
/// # Arguments
///
/// * `path` - Directory path to list
/// * `show_hidden` - Whether to include hidden files (default: false)
#[tauri::command]
pub async fn list_directory(path: String, show_hidden: Option<bool>) -> Result<Vec<FileEntry>> {
    let resolved_path = resolve_workspace_path(&path)?;
    let resolved_path = path_to_string(&resolved_path);
    orbit_fs::list_directory(&resolved_path, show_hidden.unwrap_or(false))
        .await
        .capture("list_directory")
}

/// Create an empty file
#[tauri::command]
pub async fn create_file(path: String) -> Result<()> {
    let resolved_path = resolve_workspace_path(&path)?;
    let resolved_path = path_to_string(&resolved_path);
    orbit_fs::create_file(&resolved_path)
        .await
        .capture("create_file")
}

/// Create a directory (and parents if needed)
#[tauri::command]
pub async fn create_directory(path: String) -> Result<()> {
    let resolved_path = resolve_workspace_path(&path)?;
    let resolved_path = path_to_string(&resolved_path);
    orbit_fs::create_directory(&resolved_path)
        .await
        .capture("create_directory")
}

/// Delete a file or directory
#[tauri::command]
pub async fn delete_file(path: String) -> Result<()> {
    let resolved_path = resolve_workspace_path(&path)?;
    let resolved_path = path_to_string(&resolved_path);
    orbit_fs::delete_file(&resolved_path)
        .await
        .capture("delete_file")
}

/// Rename or move a file
#[tauri::command]
pub async fn rename_file(old_path: String, new_path: String) -> Result<()> {
    let resolved_old_path = resolve_workspace_path(&old_path)?;
    let resolved_new_path = resolve_workspace_path(&new_path)?;
    let resolved_old_path = path_to_string(&resolved_old_path);
    let resolved_new_path = path_to_string(&resolved_new_path);
    orbit_fs::rename_file(&resolved_old_path, &resolved_new_path)
        .await
        .capture("rename_file")
}

/// Copy a file
#[tauri::command]
pub async fn copy_file(from: String, to: String) -> Result<()> {
    let resolved_from = resolve_workspace_path(&from)?;
    let resolved_to = resolve_workspace_path(&to)?;
    let resolved_from = path_to_string(&resolved_from);
    let resolved_to = path_to_string(&resolved_to);
    orbit_fs::copy_file(&resolved_from, &resolved_to)
        .await
        .capture("copy_file")
}

/// Reveal a file or directory in the system file manager (Finder on macOS).
///
/// Uses `open -R` on macOS to select the item in Finder.
#[tauri::command]
pub async fn reveal_in_file_manager(path: String) -> Result<()> {
    let resolved_path = resolve_workspace_path(&path)?;

    #[cfg(target_os = "macos")]
    {
        let _child = Command::new("open")
            .arg("-R")
            .arg("--")
            .arg(&resolved_path)
            .spawn()
            .map_err(Error::Io)?;
    }

    #[cfg(target_os = "linux")]
    {
        let reveal_target = resolved_path.parent().unwrap_or(resolved_path.as_path());
        let _child = Command::new("xdg-open")
            .arg(reveal_target)
            .spawn()
            .map_err(Error::Io)?;
    }

    #[cfg(target_os = "windows")]
    {
        let _child = Command::new("explorer")
            .arg("/select,")
            .arg(&resolved_path)
            .spawn()
            .map_err(Error::Io)?;
    }

    Ok(())
}

/// Open a file in the system default application.
#[tauri::command]
pub async fn open_in_default_app(path: String) -> Result<()> {
    let resolved_path = resolve_workspace_path(&path)?;

    #[cfg(target_os = "macos")]
    {
        let _child = Command::new("open")
            .arg("--")
            .arg(&resolved_path)
            .spawn()
            .map_err(Error::Io)?;
    }

    #[cfg(target_os = "linux")]
    {
        let _child = Command::new("xdg-open")
            .arg(&resolved_path)
            .spawn()
            .map_err(Error::Io)?;
    }

    #[cfg(target_os = "windows")]
    {
        let _child = Command::new("explorer")
            .arg(&resolved_path)
            .spawn()
            .map_err(Error::Io)?;
    }

    Ok(())
}

/// Check if a file exists.
///
/// Read-only: no workspace restriction (see `read_file`).
#[tauri::command]
pub async fn file_exists(path: String) -> bool {
    orbit_fs::file_exists(&path).await
}

/// Check if a path is a directory.
///
/// Read-only: no workspace restriction (see `read_file`).
#[tauri::command]
pub async fn is_directory(path: String) -> bool {
    orbit_fs::is_directory(&path).await
}

/// Get detailed file information.
///
/// Read-only: no workspace restriction (see `read_file`).
#[tauri::command]
pub async fn get_file_info(path: String) -> Result<FileInfo> {
    orbit_fs::get_file_info(&path)
        .await
        .capture("get_file_info")
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

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn canonical_workspace_root() -> Result<PathBuf> {
    let Some(workspace_path) = workspace::get_workspace_path() else {
        return Err(Error::Config("Workspace path not set".to_owned()));
    };

    Path::new(&workspace_path).canonicalize().map_err(Error::Io)
}

fn workspace_candidate_path(workspace_root: &Path, path: &str) -> PathBuf {
    let requested = Path::new(path);
    if requested.is_absolute() {
        requested.to_path_buf()
    } else {
        workspace_root.join(requested)
    }
}

fn reject_existing_symlink_components(candidate: &Path, original_path: &str) -> Result<()> {
    let mut current = PathBuf::new();
    for component in candidate.components() {
        current.push(component.as_os_str());
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(Error::PermissionDenied(original_path.to_owned()));
            },
            Ok(_) => {},
            Err(error) if error.kind() == ErrorKind::NotFound => break,
            Err(error) => return Err(Error::Io(error)),
        }
    }

    Ok(())
}

fn canonicalize_existing_ancestor(candidate: &Path, original_path: &str) -> Result<PathBuf> {
    let mut pending = Vec::new();
    let mut cursor = candidate.to_path_buf();

    loop {
        match cursor.canonicalize() {
            Ok(mut resolved) => {
                while let Some(segment) = pending.pop() {
                    resolved.push(segment);
                }
                return Ok(resolved);
            },
            Err(error) if error.kind() == ErrorKind::NotFound => {
                let Some(name) = cursor.file_name() else {
                    return Err(Error::PermissionDenied(original_path.to_owned()));
                };
                pending.push(name.to_os_string());

                let Some(parent) = cursor.parent() else {
                    return Err(Error::PermissionDenied(original_path.to_owned()));
                };
                cursor = parent.to_path_buf();
            },
            Err(error) => return Err(Error::Io(error)),
        }
    }
}

/// Resolve a path under the current workspace for workspace-scoped commands.
///
/// Existing symlink components are rejected for mutation, launch, and watch paths.
/// That keeps workspace confinement simple and avoids following links that may point
/// outside the selected workspace.
///
/// [warning] TESTED: This resolver is covered by symlink containment tests.
///     If you modify this, run: cargo test -p orbit-app workspace_path
///     Test location: src-tauri/src/commands/common/files.rs tests module.
fn resolve_workspace_path(path: &str) -> Result<PathBuf> {
    let workspace_root = canonical_workspace_root()?;
    let candidate = workspace_candidate_path(&workspace_root, path);
    reject_existing_symlink_components(&candidate, path)?;

    let resolved = canonicalize_existing_ancestor(&candidate, path)?;
    if !resolved.starts_with(&workspace_root) {
        return Err(Error::PermissionDenied(path.to_owned()));
    }

    Ok(resolved)
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
    // Wrap the implementation in a closure for Sentry capture
    (|| {
        let resolved_path = resolve_workspace_path(&path)?;
        let normalized_path = path_to_string(&resolved_path);
        let path_obj = resolved_path.as_path();

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
    })()
    .capture("watch_path")
}

/// Stop watching a path for file changes.
///
/// This is idempotent - calling it on a path that isn't being watched is a no-op.
#[tauri::command]
pub fn unwatch_path(path: String) -> Result<()> {
    // Wrap the implementation in a closure for Sentry capture
    (|| {
        let resolved_path = resolve_workspace_path(&path)?;
        let normalized_path = path_to_string(&resolved_path);

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
                // Log but don't fail if unwatch errors (path may have been deleted)
                if let Err(e) = watcher.unwatch(Path::new(&normalized_path)) {
                    log::debug!("Unwatch returned error (path may have been deleted): {e}");
                }
            }
        }

        log::debug!("Stopped watching path: {normalized_path}");
        Ok(())
    })()
    .capture("unwatch_path")
}

#[cfg(test)]
mod tests {
    use std::fs::create_dir_all;
    #[cfg(unix)]
    use std::os::unix::fs::symlink as create_dir_symlink;
    #[cfg(windows)]
    use std::os::windows::fs::symlink_dir as create_dir_symlink;
    use std::path::Path;
    use std::sync::OnceLock;

    use tokio::sync::Mutex as TokioMutex;

    use super::*;

    #[cfg(unix)]
    fn symlink_dir(target: &Path, link: &Path) -> Result<()> {
        create_dir_symlink(target, link).map_err(Error::Io)
    }

    #[cfg(windows)]
    fn symlink_dir(target: &Path, link: &Path) -> Result<()> {
        create_dir_symlink(target, link).map_err(Error::Io)
    }

    fn workspace_test_lock() -> &'static TokioMutex<()> {
        static LOCK: OnceLock<TokioMutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| TokioMutex::new(()))
    }

    #[cfg(any(unix, windows))]
    #[tokio::test]
    #[expect(clippy::panic_in_result_fn, reason = "tests use assert! macros")]
    async fn write_file_rejects_symlinked_parent_outside_workspace() -> Result<()> {
        let _guard = workspace_test_lock().lock().await;
        let previous_workspace = workspace::get_workspace_path();

        let temp_dir = tempfile::tempdir().map_err(Error::Io)?;
        let workspace_dir = temp_dir.path().join("workspace");
        let outside_dir = temp_dir.path().join("outside");
        create_dir_all(&workspace_dir).map_err(Error::Io)?;
        create_dir_all(&outside_dir).map_err(Error::Io)?;

        let link_path = workspace_dir.join("linked-outside");
        symlink_dir(&outside_dir, &link_path)?;

        workspace::set_workspace_path(workspace_dir.to_string_lossy().into_owned());

        let requested_path = link_path.join("escape.txt");
        let result = write_file(
            requested_path.to_string_lossy().into_owned(),
            "escaped".to_owned(),
        )
        .await;
        let escaped_path = outside_dir.join("escape.txt");
        let escaped_file_was_created = escaped_path.exists();

        if let Some(previous_workspace) = previous_workspace {
            workspace::set_workspace_path(previous_workspace);
        }

        assert!(
            matches!(result, Err(Error::PermissionDenied(_))),
            "writing through a workspace symlink outside the workspace must be denied"
        );
        assert!(
            !escaped_file_was_created,
            "denied writes must not create files outside the workspace"
        );

        Ok(())
    }
}
