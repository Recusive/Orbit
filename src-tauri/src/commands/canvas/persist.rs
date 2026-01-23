//! Canvas style persistence commands for file I/O operations.
//!
//! Provides Tauri commands for reading, writing, and backing up component
//! source files in the Canvas UI Builder.
//!
//! ## Key Features
//!
//! - **Atomic writes**: Files are written atomically (temp file → rename) to prevent corruption
//! - **Timestamped backups**: Automatic backup creation with timestamp-based naming
//! - **Backup pruning**: Keeps only the 10 most recent backups per component
//! - **Path validation**: All paths are validated to prevent traversal attacks
//!
//! ## Backup Directory Structure
//!
//! ```text
//! ~/.orbit/canvas/.backups/
//! ├── ui/
//! │   ├── button/
//! │   │   ├── button_20260120_143052_123.tsx
//! │   │   └── button_20260120_142830_456.tsx
//! │   └── card/
//! │       └── card_20260120_141500_789.tsx
//! └── custom/
//!     └── my-component/
//!         └── my-component_20260120_140000_000.tsx
//! ```

#![expect(
    clippy::let_underscore_must_use,
    reason = "Tauri command macro generates let _ = for internal Result handling"
)]
#![expect(
    clippy::absolute_paths,
    reason = "std::time::SystemTime is clearer inline for type annotations"
)]
#![expect(
    clippy::redundant_closure_for_method_calls,
    reason = "Explicit closure is clearer in filter_map chains"
)]

use chrono::Utc;
use serde::Serialize;
use sha2::{Digest as _, Sha256};
use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::result;

use crate::utils::paths::{
    get_backup_dir, get_component_path, get_globals_css_path, validate_path_within_canvas,
};

/// Result type for persist commands
type Result<T> = result::Result<T, String>;

/// Maximum number of backups to keep per component
const MAX_BACKUPS_PER_COMPONENT: usize = 10;

// ============================================================================
// Result Types
// ============================================================================

/// Result of a file read operation.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileReadResult {
    /// Whether the read operation succeeded
    pub success: bool,
    /// File content (if successful)
    pub content: Option<String>,
    /// Error message (if failed)
    pub error: Option<String>,
}

impl FileReadResult {
    /// Create a successful read result.
    fn ok(content: String) -> Self {
        Self {
            success: true,
            content: Some(content),
            error: None,
        }
    }

    /// Create a failed read result.
    fn err(error: impl Into<String>) -> Self {
        Self {
            success: false,
            content: None,
            error: Some(error.into()),
        }
    }
}

/// Result of a file write operation.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileWriteResult {
    /// Whether the write operation succeeded
    pub success: bool,
    /// Path to the backup file (if backup was created)
    pub backup_path: Option<String>,
    /// Error message (if failed)
    pub error: Option<String>,
}

impl FileWriteResult {
    /// Create a successful write result.
    fn ok(backup_path: Option<String>) -> Self {
        Self {
            success: true,
            backup_path,
            error: None,
        }
    }

    /// Create a failed write result.
    fn err(error: impl Into<String>) -> Self {
        Self {
            success: false,
            backup_path: None,
            error: Some(error.into()),
        }
    }
}

// ============================================================================
// Internal Helpers
// ============================================================================

/// Generate a timestamped backup filename.
///
/// Format: `{component_name}_{YYYYMMDD}_{HHMMSS}_{mmm}.tsx`
///
/// The millisecond suffix ensures uniqueness even for rapid saves.
fn generate_backup_filename(component_name: &str) -> String {
    let now = Utc::now();
    format!("{}_{}.tsx", component_name, now.format("%Y%m%d_%H%M%S_%3f"))
}

/// Write content to a file atomically.
///
/// Writes to a temp file first, then renames to the target path.
/// This prevents data corruption if the process crashes mid-write.
fn atomic_write(path: &Path, content: &str) -> Result<()> {
    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {}: {e}", parent.display()))?;
    }

    // Generate temp file path in same directory (for same-filesystem rename)
    let temp_path = path.with_extension("tmp");

    // Write to temp file
    let mut file =
        fs::File::create(&temp_path).map_err(|e| format!("Failed to create temp file: {e}"))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write temp file: {e}"))?;
    file.sync_all()
        .map_err(|e| format!("Failed to sync temp file: {e}"))?;
    drop(file);

    // Atomic rename
    fs::rename(&temp_path, path).map_err(|e| {
        // Clean up temp file on rename failure
        let _ = fs::remove_file(&temp_path);
        format!("Failed to rename temp file: {e}")
    })?;

    Ok(())
}

/// Create a backup of a file.
///
/// Returns the path to the backup file if successful.
fn create_backup(
    source_path: &Path,
    component_name: &str,
    component_type: &str,
    test_mode: bool,
) -> Result<PathBuf> {
    // Get backup directory
    let backup_dir = get_backup_dir(component_name, component_type, test_mode)?;
    fs::create_dir_all(&backup_dir)
        .map_err(|e| format!("Failed to create backup directory: {e}"))?;

    // Generate backup filename
    let backup_filename = generate_backup_filename(component_name);
    let backup_path = backup_dir.join(&backup_filename);

    // Copy the file (bytes copied is not needed)
    let _bytes_copied = fs::copy(source_path, &backup_path)
        .map_err(|e| format!("Failed to copy to backup: {e}"))?;

    // Prune old backups
    prune_old_backups(&backup_dir)?;

    Ok(backup_path)
}

/// Remove old backups, keeping only the most recent ones.
fn prune_old_backups(backup_dir: &Path) -> Result<()> {
    if !backup_dir.exists() {
        return Ok(());
    }

    // Collect all backup files with their modification times
    let mut backups: Vec<(PathBuf, std::time::SystemTime)> = fs::read_dir(backup_dir)
        .map_err(|e| format!("Failed to read backup directory: {e}"))?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry
                .path()
                .extension()
                .is_some_and(|ext| ext == "tsx" || ext == "ts" || ext == "css")
        })
        .filter_map(|entry| {
            let path = entry.path();
            let metadata = fs::metadata(&path).ok()?;
            let modified = metadata.modified().ok()?;
            Some((path, modified))
        })
        .collect();

    // Sort by modification time (newest first)
    backups.sort_by(|a, b| b.1.cmp(&a.1));

    // Remove backups beyond the limit
    for (path, _) in backups.into_iter().skip(MAX_BACKUPS_PER_COMPONENT) {
        let _ = fs::remove_file(path);
    }

    Ok(())
}

/// Calculate SHA256 hash of a file.
fn calculate_file_hash(path: &Path) -> Result<String> {
    let content = fs::read(path).map_err(|e| format!("Failed to read file for hashing: {e}"))?;

    let mut hasher = Sha256::new();
    hasher.update(&content);
    let result = hasher.finalize();

    Ok(format!("{result:x}"))
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Read a component's source file.
///
/// # Arguments
///
/// * `component_name` - The component name (e.g., "button")
/// * `component_type` - Either "ui" or "custom"
/// * `test_mode` - If `true`, uses `~/.orbit-test/canvas`
///
/// # Returns
///
/// `FileReadResult` with the file content or error message.
#[tauri::command]
pub async fn canvas_read_component_source(
    component_name: String,
    component_type: String,
    test_mode: Option<bool>,
) -> FileReadResult {
    let test_mode = test_mode.unwrap_or(false);

    // Get and validate path
    let path = match get_component_path(&component_name, &component_type, test_mode) {
        Ok(p) => p,
        Err(e) => return FileReadResult::err(e),
    };

    // Check if file exists
    if !path.exists() {
        return FileReadResult::err(format!("Component file not found: {}", path.display()));
    }

    // Read file content
    match fs::read_to_string(&path) {
        Ok(content) => FileReadResult::ok(content),
        Err(e) => FileReadResult::err(format!("Failed to read file: {e}")),
    }
}

/// Write content to a component's source file.
///
/// Performs an atomic write (temp file → rename) and optionally creates
/// a timestamped backup before writing.
///
/// # Arguments
///
/// * `component_name` - The component name (e.g., "button")
/// * `component_type` - Either "ui" or "custom"
/// * `content` - The new file content
/// * `should_backup` - If `true`, backs up the existing file before writing
/// * `test_mode` - If `true`, uses `~/.orbit-test/canvas`
///
/// # Returns
///
/// `FileWriteResult` with the backup path (if created) or error message.
#[tauri::command]
pub async fn canvas_write_component_source(
    component_name: String,
    component_type: String,
    content: String,
    should_backup: Option<bool>,
    test_mode: Option<bool>,
) -> FileWriteResult {
    let should_backup = should_backup.unwrap_or(true);
    let test_mode = test_mode.unwrap_or(false);

    // Get and validate path
    let path = match get_component_path(&component_name, &component_type, test_mode) {
        Ok(p) => p,
        Err(e) => return FileWriteResult::err(e),
    };

    // Create backup if requested and file exists
    let backup_path = if should_backup && path.exists() {
        match create_backup(&path, &component_name, &component_type, test_mode) {
            Ok(bp) => Some(bp.to_string_lossy().to_string()),
            Err(e) => {
                log::warn!("Failed to create backup: {e}");
                None
            },
        }
    } else {
        None
    };

    // Perform atomic write
    match atomic_write(&path, &content) {
        Ok(()) => FileWriteResult::ok(backup_path),
        Err(e) => FileWriteResult::err(e),
    }
}

/// Restore a component from its most recent backup.
///
/// Finds the most recent backup file and copies it back to the component path.
///
/// # Arguments
///
/// * `component_name` - The component name
/// * `component_type` - Either "ui" or "custom"
/// * `test_mode` - If `true`, uses `~/.orbit-test/canvas`
///
/// # Returns
///
/// `FileWriteResult` indicating success or failure.
#[tauri::command]
pub async fn canvas_restore_backup(
    component_name: String,
    component_type: String,
    test_mode: Option<bool>,
) -> FileWriteResult {
    let test_mode = test_mode.unwrap_or(false);

    // Get backup directory
    let backup_dir = match get_backup_dir(&component_name, &component_type, test_mode) {
        Ok(p) => p,
        Err(e) => return FileWriteResult::err(e),
    };

    if !backup_dir.exists() {
        return FileWriteResult::err("No backups found for this component");
    }

    // Find most recent backup
    let mut backups: Vec<(PathBuf, std::time::SystemTime)> = match fs::read_dir(&backup_dir) {
        Ok(entries) => entries
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "tsx"))
            .filter_map(|entry| {
                let path = entry.path();
                let modified = fs::metadata(&path).ok()?.modified().ok()?;
                Some((path, modified))
            })
            .collect(),
        Err(e) => return FileWriteResult::err(format!("Failed to read backup directory: {e}")),
    };

    if backups.is_empty() {
        return FileWriteResult::err("No backup files found");
    }

    // Sort by modification time (newest first)
    backups.sort_by(|a, b| b.1.cmp(&a.1));
    let Some((backup_path, _)) = backups.first() else {
        return FileWriteResult::err("No backup files found");
    };

    // Read backup content
    let content = match fs::read_to_string(backup_path) {
        Ok(c) => c,
        Err(e) => return FileWriteResult::err(format!("Failed to read backup: {e}")),
    };

    // Get component path
    let component_path = match get_component_path(&component_name, &component_type, test_mode) {
        Ok(p) => p,
        Err(e) => return FileWriteResult::err(e),
    };

    // Write restored content
    match atomic_write(&component_path, &content) {
        Ok(()) => FileWriteResult::ok(Some(backup_path.to_string_lossy().to_string())),
        Err(e) => FileWriteResult::err(format!("Failed to restore: {e}")),
    }
}

/// Information about a backup file.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    /// Full path to the backup file
    pub path: String,
    /// Filename of the backup
    pub filename: String,
    /// Backup creation timestamp (ISO 8601)
    pub created_at: String,
}

/// List all backups for a component.
///
/// Returns backup files sorted by modification time (newest first).
///
/// # Arguments
///
/// * `component_name` - The component name (e.g., "button")
/// * `component_type` - Either "ui" or "custom"
/// * `test_mode` - If `true`, uses `~/.orbit-test/canvas`
///
/// # Returns
///
/// Array of `BackupInfo` objects, or an error message.
#[tauri::command]
pub async fn canvas_list_backups(
    component_name: String,
    component_type: String,
    test_mode: Option<bool>,
) -> Result<Vec<BackupInfo>> {
    let test_mode = test_mode.unwrap_or(false);

    // Get backup directory
    let backup_dir = get_backup_dir(&component_name, &component_type, test_mode)?;

    if !backup_dir.exists() {
        return Ok(Vec::new());
    }

    // Collect backup files with their metadata
    let mut backups: Vec<(PathBuf, std::time::SystemTime)> = fs::read_dir(&backup_dir)
        .map_err(|e| format!("Failed to read backup directory: {e}"))?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry
                .path()
                .extension()
                .is_some_and(|ext| ext == "tsx" || ext == "ts" || ext == "css")
        })
        .filter_map(|entry| {
            let path = entry.path();
            let metadata = fs::metadata(&path).ok()?;
            let modified = metadata.modified().ok()?;
            Some((path, modified))
        })
        .collect();

    // Sort by modification time (newest first)
    backups.sort_by(|a, b| b.1.cmp(&a.1));

    // Convert to BackupInfo
    let infos: Vec<BackupInfo> = backups
        .into_iter()
        .map(|(path, modified)| {
            let filename = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_owned();

            // Convert SystemTime to ISO 8601 string
            let created_at = modified.duration_since(std::time::UNIX_EPOCH).map_or_else(
                |_| "unknown".to_owned(),
                |duration| {
                    let secs = duration.as_secs();
                    chrono::DateTime::from_timestamp(secs.try_into().unwrap_or(0), 0)
                        .map_or_else(|| "unknown".to_owned(), |dt| dt.to_rfc3339())
                },
            );

            BackupInfo {
                path: path.to_string_lossy().to_string(),
                filename,
                created_at,
            }
        })
        .collect();

    Ok(infos)
}

/// Get the SHA256 hash of a file.
///
/// Useful for detecting changes and cache invalidation.
///
/// # Arguments
///
/// * `path` - Absolute path to the file
///
/// # Returns
///
/// The SHA256 hash as a lowercase hex string, or an error message.
#[tauri::command]
pub async fn canvas_get_file_hash(path: String) -> Result<String> {
    let path = PathBuf::from(&path);

    if !path.exists() {
        return Err(format!("File not found: {}", path.display()));
    }

    calculate_file_hash(&path)
}

/// Get the resolved path to a component file.
///
/// # Arguments
///
/// * `component_name` - The component name
/// * `component_type` - Either "ui" or "custom"
/// * `test_mode` - If `true`, uses `~/.orbit-test/canvas`
///
/// # Returns
///
/// The full path to the component file.
#[tauri::command]
pub async fn canvas_get_component_path(
    component_name: String,
    component_type: String,
    test_mode: Option<bool>,
) -> Result<String> {
    let test_mode = test_mode.unwrap_or(false);
    let path = get_component_path(&component_name, &component_type, test_mode)?;
    Ok(path.to_string_lossy().to_string())
}

/// Get the path to the globals.css file.
///
/// # Arguments
///
/// * `test_mode` - If `true`, uses `~/.orbit-test/canvas`
///
/// # Returns
///
/// The full path to globals.css.
#[tauri::command]
pub async fn canvas_get_globals_path(test_mode: Option<bool>) -> Result<String> {
    let test_mode = test_mode.unwrap_or(false);
    let path = get_globals_css_path(test_mode)?;
    Ok(path.to_string_lossy().to_string())
}

/// Read a file within the canvas directory.
///
/// Path is validated to be within the canvas directory to prevent
/// path traversal attacks.
///
/// # Arguments
///
/// * `path` - Path to the file (must be within canvas directory)
/// * `test_mode` - If `true`, uses `~/.orbit-test/canvas`
///
/// # Returns
///
/// `FileReadResult` with the file content or error message.
#[tauri::command]
pub async fn canvas_read_file(path: String, test_mode: Option<bool>) -> FileReadResult {
    let test_mode = test_mode.unwrap_or(false);

    // Validate path is within canvas directory
    let validated_path = match validate_path_within_canvas(&path, test_mode) {
        Ok(p) => p,
        Err(e) => return FileReadResult::err(e),
    };

    // Check if file exists
    if !validated_path.exists() {
        return FileReadResult::err(format!("File not found: {}", validated_path.display()));
    }

    // Read file content
    match fs::read_to_string(&validated_path) {
        Ok(content) => FileReadResult::ok(content),
        Err(e) => FileReadResult::err(format!("Failed to read file: {e}")),
    }
}

/// Write a file within the canvas directory.
///
/// Path is validated to be within the canvas directory to prevent
/// path traversal attacks. Performs atomic write with optional backup.
///
/// # Arguments
///
/// * `path` - Path to the file (must be within canvas directory)
/// * `content` - The content to write
/// * `should_backup` - If `true`, backs up the existing file before writing
/// * `test_mode` - If `true`, uses `~/.orbit-test/canvas`
///
/// # Returns
///
/// `FileWriteResult` with the backup path (if created) or error message.
#[tauri::command]
pub async fn canvas_write_file(
    path: String,
    content: String,
    should_backup: Option<bool>,
    test_mode: Option<bool>,
) -> FileWriteResult {
    let should_backup = should_backup.unwrap_or(false);
    let test_mode = test_mode.unwrap_or(false);

    // Validate path is within canvas directory
    let validated_path = match validate_path_within_canvas(&path, test_mode) {
        Ok(p) => p,
        Err(e) => return FileWriteResult::err(e),
    };

    // Create backup if requested and file exists
    let backup_path = if should_backup && validated_path.exists() {
        // Extract component info from path for backup naming
        let file_stem = validated_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("file");

        // Determine component type from path
        let inferred_type = if validated_path.to_string_lossy().contains("/ui/") {
            "ui"
        } else if validated_path.to_string_lossy().contains("/custom/") {
            "custom"
        } else {
            // Generic backup for other files
            "misc"
        };

        // For non-component files, use a simplified backup strategy
        if inferred_type == "misc" {
            // Create backup in same directory
            let backup_filename =
                format!("{}.{}.bak", file_stem, Utc::now().format("%Y%m%d_%H%M%S"));
            let backup_file_path = validated_path.with_file_name(&backup_filename);
            match fs::copy(&validated_path, &backup_file_path) {
                Ok(_) => Some(backup_file_path.to_string_lossy().to_string()),
                Err(e) => {
                    log::warn!("Failed to create backup: {e}");
                    None
                },
            }
        } else {
            match create_backup(&validated_path, file_stem, inferred_type, test_mode) {
                Ok(bp) => Some(bp.to_string_lossy().to_string()),
                Err(e) => {
                    log::warn!("Failed to create backup: {e}");
                    None
                },
            }
        }
    } else {
        None
    };

    // Perform atomic write
    match atomic_write(&validated_path, &content) {
        Ok(()) => FileWriteResult::ok(backup_path),
        Err(e) => FileWriteResult::err(e),
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
#[expect(clippy::unwrap_used, reason = "unwrap is acceptable in tests")]
mod tests {
    use super::*;

    #[test]
    fn test_generate_backup_filename() {
        let filename = generate_backup_filename("button");
        assert!(filename.starts_with("button_"));
        assert!(Path::new(&filename)
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("tsx")));
        // Format: button_YYYYMMDD_HHMMSS_mmm.tsx
        assert!(filename.len() > 25);
    }

    #[test]
    fn test_file_read_result_ok() {
        let result = FileReadResult::ok("content".to_owned());
        assert!(result.success);
        assert_eq!(result.content, Some("content".to_owned()));
        assert!(result.error.is_none());
    }

    #[test]
    fn test_file_read_result_err() {
        let result = FileReadResult::err("error message");
        assert!(!result.success);
        assert!(result.content.is_none());
        assert_eq!(result.error, Some("error message".to_owned()));
    }

    #[test]
    fn test_file_write_result_ok() {
        let result = FileWriteResult::ok(Some("/backup/path".to_owned()));
        assert!(result.success);
        assert_eq!(result.backup_path, Some("/backup/path".to_owned()));
        assert!(result.error.is_none());
    }

    #[test]
    fn test_file_write_result_err() {
        let result = FileWriteResult::err("write error");
        assert!(!result.success);
        assert!(result.backup_path.is_none());
        assert_eq!(result.error, Some("write error".to_owned()));
    }

    #[test]
    fn test_serialization() {
        let read_result = FileReadResult::ok("test".to_owned());
        let json = serde_json::to_string(&read_result).unwrap();
        assert!(json.contains("\"success\":true"));
        assert!(json.contains("\"content\":\"test\""));

        let write_result = FileWriteResult::ok(None);
        let json = serde_json::to_string(&write_result).unwrap();
        assert!(json.contains("\"success\":true"));
        assert!(json.contains("\"backupPath\":null"));
    }
}
