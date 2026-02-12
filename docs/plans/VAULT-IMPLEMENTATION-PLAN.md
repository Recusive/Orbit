# Vault Document System Implementation Plan

## Overview

A filesystem-based document vault where the filesystem is the source of truth. Users can create, view, and edit any file type stored in `{project_root}/.0rbit/Vault/`. No registry, no UUIDs—just files and folders.

## Architecture Principles

| Principle           | Implementation                                                        |
| ------------------- | --------------------------------------------------------------------- |
| **Source of Truth** | Filesystem (no registry.json)                                         |
| **File Identity**   | Actual filenames (no UUIDs)                                           |
| **Metadata**        | From filesystem stats (created, modified, size)                       |
| **Subdirectories**  | Fully supported                                                       |
| **File Types**      | All types supported (renderer chosen by extension + binary detection) |
| **Binary Handling** | Base64 encoding for transfer, binary detection at read time           |

## Storage Structure

```
{project_root}/
└── .0rbit/
    └── Vault/
        ├── notes/
        │   ├── project-ideas.md
        │   └── meeting-2026-01-21.md
        ├── diagrams/
        │   ├── architecture.mermaid
        │   └── flow.mermaid
        ├── config.xml
        ├── data.json
        └── image.png
    └── vault-context.json    # Tracks which files are included for agent context
```

**vault-context.json** (for agent integration):

```json
{
  "version": "1.0.0",
  "includedPaths": ["notes/", "diagrams/architecture.mermaid"]
}
```

---

## Phase 1: Rust Backend (`src-tauri/src/commands/vault/`)

### Files to Create

| File            | Purpose                                      |
| --------------- | -------------------------------------------- |
| `mod.rs`        | Module exports                               |
| `types.rs`      | Rust types (VaultEntry, VaultContent, etc.)  |
| `operations.rs` | File CRUD operations                         |
| `validation.rs` | Path security, size limits, binary detection |

### Type Definitions (types.rs)

```rust
use serde::{Deserialize, Serialize};

/// How content is encoded for transfer
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ContentEncoding {
    Utf8,
    Base64,
}

/// File content with encoding metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultContent {
    pub content: String,           // UTF-8 text OR base64-encoded binary
    pub encoding: ContentEncoding,
    pub is_binary: bool,           // True if binary was detected at read time
    pub size_bytes: u64,
}

/// Directory/file entry metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultEntry {
    pub path: String,              // Relative path from Vault root
    pub name: String,              // Filename only
    pub is_dir: bool,
    pub size_bytes: u64,
    pub created_at: u64,           // Unix timestamp ms
    pub modified_at: u64,          // Unix timestamp ms
    pub extension: Option<String>,
}

/// Stats for the vault
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStats {
    pub total_files: u32,
    pub total_dirs: u32,
    pub total_size_bytes: u64,
}

/// Paginated list result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultListResult {
    pub entries: Vec<VaultEntry>,
    pub total_count: u32,
    pub has_more: bool,
}

/// Write operation result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteResult {
    pub path: String,              // Final path (may differ if auto-suffixed)
    pub size_bytes: u64,
    pub modified_at: u64,          // New modified timestamp for conflict detection
}

/// Delete operation result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteResult {
    pub deleted_files: u32,
    pub deleted_dirs: u32,
}

/// Agent context configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VaultContextConfig {
    pub version: String,
    pub included_paths: Vec<String>,  // Paths opted-in for agent context
}

// Constants
pub const MAX_FILE_SIZE_BYTES: u64 = 10 * 1024 * 1024;  // 10MB
pub const MAX_SCAN_ENTRIES: usize = 10_000;
pub const DEFAULT_LIST_LIMIT: u32 = 500;
pub const MAX_PATH_LENGTH: usize = 4096;

// Windows reserved names (case-insensitive)
pub const WINDOWS_RESERVED_NAMES: &[&str] = &[
    "CON", "PRN", "AUX", "NUL",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];
```

### Validation (validation.rs)

```rust
use std::path::{Path, PathBuf};
use std::fs;

/// Binary detection heuristics
pub fn is_binary_content(bytes: &[u8]) -> bool {
    // Check first 8KB for binary indicators
    let check_len = bytes.len().min(8192);
    let sample = &bytes[..check_len];

    // Check for null bytes (strong binary indicator)
    if sample.contains(&0) {
        return true;
    }

    // Check for high ratio of non-printable characters
    let non_printable = sample.iter().filter(|&&b| {
        b < 0x20 && b != b'\n' && b != b'\r' && b != b'\t'
    }).count();

    // More than 10% non-printable suggests binary
    non_printable > check_len / 10
}

/// Resolves and validates a vault path, preventing traversal attacks
pub fn resolve_vault_path(
    workspace_path: &str,
    relative_path: &str,
) -> Result<PathBuf, String> {
    // Check path length
    if relative_path.len() > MAX_PATH_LENGTH {
        return Err(format!("Path exceeds maximum length of {} characters", MAX_PATH_LENGTH));
    }

    // Check for null bytes
    if relative_path.contains('\0') {
        return Err("Path contains null bytes".to_string());
    }

    // Sanitize the path
    let cleaned = sanitize_path(relative_path)?;

    // Validate filename components
    validate_path_components(&cleaned)?;

    let vault_root = Path::new(workspace_path).join(".0rbit").join("Vault");

    // For new files, we need to handle non-existent paths
    let target = vault_root.join(&cleaned);

    // Resolve the path safely (handling non-existent files)
    let resolved = safe_resolve(&vault_root, &target)?;

    // Final containment check
    if !resolved.starts_with(&vault_root) {
        return Err("Path traversal detected: access denied".to_string());
    }

    Ok(resolved)
}

/// Safely resolve a path, handling symlinks and non-existent files
fn safe_resolve(vault_root: &Path, target: &Path) -> Result<PathBuf, String> {
    // Try to canonicalize the vault root first
    let canonical_root = vault_root.canonicalize()
        .map_err(|_| "Vault directory not initialized".to_string())?;

    // Walk up to find the first existing ancestor
    let mut current = target.to_path_buf();
    let mut pending_components = Vec::new();

    loop {
        if current.exists() {
            // Check if it's a symlink pointing outside vault
            let canonical = current.canonicalize()
                .map_err(|e| format!("Failed to resolve path: {}", e))?;

            if !canonical.starts_with(&canonical_root) {
                return Err("Symlink escapes vault directory".to_string());
            }

            // Rebuild the path with pending components
            let mut result = canonical;
            for component in pending_components.into_iter().rev() {
                result = result.join(component);
            }
            return Ok(result);
        }

        // Move up one level
        if let Some(parent) = current.parent() {
            if let Some(name) = current.file_name() {
                pending_components.push(name.to_os_string());
            }
            current = parent.to_path_buf();
        } else {
            return Err("Invalid path: no valid ancestor found".to_string());
        }

        // Safety check: if we've reached filesystem root without finding valid ancestor
        if current == Path::new("/") || current == Path::new("") {
            return Err("Invalid path: no valid ancestor within vault".to_string());
        }
    }
}

/// Sanitizes path components
fn sanitize_path(path: &str) -> Result<String, String> {
    // Reject path traversal attempts
    if path.contains("..") {
        return Err("Path traversal (..) not allowed".to_string());
    }

    // Normalize path separators
    let normalized = path.replace('\\', "/");

    // Remove leading/trailing slashes and multiple consecutive slashes
    let trimmed = normalized
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("/");

    Ok(trimmed)
}

/// Validates each component of the path
fn validate_path_components(path: &str) -> Result<(), String> {
    for component in path.split('/') {
        if component.is_empty() {
            continue;
        }

        // Check Windows reserved names
        let upper = component.to_uppercase();
        let base_name = upper.split('.').next().unwrap_or(&upper);

        if WINDOWS_RESERVED_NAMES.contains(&base_name) {
            return Err(format!("'{}' is a reserved filename", component));
        }

        // Check for invalid characters (Windows)
        const INVALID_CHARS: &[char] = &['<', '>', ':', '"', '|', '?', '*'];
        if component.chars().any(|c| INVALID_CHARS.contains(&c)) {
            return Err(format!("Filename contains invalid characters: {}", component));
        }

        // Check for names ending with space or period (Windows issue)
        if component.ends_with(' ') || component.ends_with('.') {
            return Err("Filename cannot end with space or period".to_string());
        }
    }

    Ok(())
}

/// Validates file size
pub fn validate_file_size(size: u64) -> Result<(), String> {
    if size > MAX_FILE_SIZE_BYTES {
        return Err(format!(
            "File exceeds maximum size of {} MB",
            MAX_FILE_SIZE_BYTES / 1024 / 1024
        ));
    }
    Ok(())
}

/// Generates a unique filename with -1, -2, -3 suffix
pub fn generate_unique_path(base_path: &Path) -> PathBuf {
    if !base_path.exists() {
        return base_path.to_path_buf();
    }

    let stem = base_path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let ext = base_path.extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e))
        .unwrap_or_default();
    let parent = base_path.parent().unwrap_or(Path::new(""));

    for i in 1..=1000 {
        let new_name = format!("{}-{}{}", stem, i, ext);
        let new_path = parent.join(&new_name);
        if !new_path.exists() {
            return new_path;
        }
    }

    // Fallback: append timestamp
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    parent.join(format!("{}-{}{}", stem, timestamp, ext))
}
```

### Operations (operations.rs)

```rust
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use std::time::{SystemTime, UNIX_EPOCH};

#[tauri::command]
pub async fn vault_check_initialized(workspace_path: String) -> Result<bool, String> {
    let vault_path = Path::new(&workspace_path).join(".0rbit").join("Vault");
    Ok(vault_path.exists() && vault_path.is_dir())
}

#[tauri::command]
pub async fn vault_initialize(workspace_path: String) -> Result<(), String> {
    let vault_path = Path::new(&workspace_path).join(".0rbit").join("Vault");
    fs::create_dir_all(&vault_path)
        .map_err(|e| format!("Failed to create vault directory: {}", e))?;

    // Clean up orphaned temp files recursively (from crashed writes)
    const MAX_TEMP_AGE_SECS: u64 = 60;
    cleanup_temp_files_recursive(&vault_path, MAX_TEMP_AGE_SECS);

    Ok(())
}

/// Recursively clean up orphaned .tmp files older than max_age_secs
fn cleanup_temp_files_recursive(dir: &Path, max_age_secs: u64) {
    let Ok(entries) = fs::read_dir(dir) else { return };

    for entry in entries.flatten() {
        let path = entry.path();

        if path.is_dir() {
            // Recurse into subdirectories
            cleanup_temp_files_recursive(&path, max_age_secs);
        } else if path.extension().map(|x| x == "tmp").unwrap_or(false) {
            // Check if temp file is old enough to delete
            if let Ok(metadata) = path.metadata() {
                if let Ok(modified) = metadata.modified() {
                    let age = SystemTime::now().duration_since(modified).unwrap_or_default();
                    if age.as_secs() > max_age_secs {
                        let _ = fs::remove_file(&path);
                    }
                }
            }
        }
    }
}

/// Helper: Collect entries from a directory (optionally recursive)
fn collect_entries(
    base_path: &Path,
    root_path: &Path,
    recursive: bool,
    entries: &mut Vec<VaultEntry>,
    max_entries: usize,
) -> Result<(), String> {
    if entries.len() >= max_entries {
        return Ok(());
    }

    let dir_entries = fs::read_dir(base_path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in dir_entries {
        if entries.len() >= max_entries {
            break;
        }

        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let metadata = entry.metadata().map_err(|e| format!("Failed to read metadata: {}", e))?;

        let relative_path = path.strip_prefix(root_path)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| path.to_string_lossy().to_string());

        let name = path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let extension = path.extension()
            .map(|e| e.to_string_lossy().to_string());

        let created_at = metadata.created()
            .map(|t| t.duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0))
            .unwrap_or(0);

        let modified_at = metadata.modified()
            .map(|t| t.duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0))
            .unwrap_or(0);

        entries.push(VaultEntry {
            path: relative_path,
            name,
            is_dir: metadata.is_dir(),
            size_bytes: metadata.len(),
            created_at,
            modified_at,
            extension,
        });

        if recursive && metadata.is_dir() {
            collect_entries(&path, root_path, recursive, entries, max_entries)?;
        }
    }

    Ok(())
}

/// Helper: Create a VaultEntry from a path
fn create_vault_entry(path: &Path, workspace_path: &str) -> Result<VaultEntry, String> {
    let vault_root = Path::new(workspace_path).join(".0rbit").join("Vault");
    let metadata = fs::metadata(path)
        .map_err(|e| format!("Failed to read metadata: {}", e))?;

    let relative_path = path.strip_prefix(&vault_root)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| path.to_string_lossy().to_string());

    let name = path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let extension = path.extension()
        .map(|e| e.to_string_lossy().to_string());

    let created_at = metadata.created()
        .map(|t| t.duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0))
        .unwrap_or(0);

    let modified_at = metadata.modified()
        .map(|t| t.duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0))
        .unwrap_or(0);

    Ok(VaultEntry {
        path: relative_path,
        name,
        is_dir: metadata.is_dir(),
        size_bytes: metadata.len(),
        created_at,
        modified_at,
        extension,
    })
}

#[tauri::command]
pub async fn vault_list(
    workspace_path: String,
    relative_path: Option<String>,
    recursive: Option<bool>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<VaultListResult, String> {
    let base_path = resolve_vault_path(&workspace_path, relative_path.as_deref().unwrap_or(""))?;
    let limit = limit.unwrap_or(DEFAULT_LIST_LIMIT).min(MAX_SCAN_ENTRIES as u32);
    let offset = offset.unwrap_or(0);
    let recursive = recursive.unwrap_or(false);

    let mut all_entries = Vec::new();
    collect_entries(&base_path, &base_path, recursive, &mut all_entries, MAX_SCAN_ENTRIES)?;

    let total_count = all_entries.len() as u32;
    let start = (offset as usize).min(all_entries.len());
    let end = (start + limit as usize).min(all_entries.len());
    let entries = all_entries[start..end].to_vec();
    let has_more = end < all_entries.len();

    Ok(VaultListResult { entries, total_count, has_more })
}

#[tauri::command]
pub async fn vault_stats(workspace_path: String) -> Result<VaultStats, String> {
    let vault_path = Path::new(&workspace_path).join(".0rbit").join("Vault");

    if !vault_path.exists() {
        return Err("Vault not initialized".to_string());
    }

    let mut total_files = 0u32;
    let mut total_dirs = 0u32;
    let mut total_size_bytes = 0u64;

    fn count_recursive(
        path: &Path,
        files: &mut u32,
        dirs: &mut u32,
        size: &mut u64,
    ) -> Result<(), String> {
        for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let metadata = entry.metadata().map_err(|e| e.to_string())?;

            if metadata.is_dir() {
                *dirs += 1;
                count_recursive(&entry.path(), files, dirs, size)?;
            } else {
                *files += 1;
                *size += metadata.len();
            }
        }
        Ok(())
    }

    count_recursive(&vault_path, &mut total_files, &mut total_dirs, &mut total_size_bytes)?;

    Ok(VaultStats {
        total_files,
        total_dirs,
        total_size_bytes,
    })
}

/// Read file with automatic binary detection
#[tauri::command]
pub async fn vault_read(
    workspace_path: String,
    relative_path: String,
) -> Result<VaultContent, String> {
    let path = resolve_vault_path(&workspace_path, &relative_path)?;

    let metadata = fs::metadata(&path)
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;

    validate_file_size(metadata.len())?;

    let bytes = fs::read(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let is_binary = is_binary_content(&bytes);

    let (content, encoding) = if is_binary {
        (BASE64.encode(&bytes), ContentEncoding::Base64)
    } else {
        match String::from_utf8(bytes) {
            Ok(s) => (s, ContentEncoding::Utf8),
            Err(e) => {
                // Fallback to base64 if UTF-8 decode fails
                (BASE64.encode(e.as_bytes()), ContentEncoding::Base64)
            }
        }
    };

    Ok(VaultContent {
        content,
        encoding,
        is_binary,
        size_bytes: metadata.len(),
    })
}

/// Write file with conflict detection
#[tauri::command]
pub async fn vault_write(
    workspace_path: String,
    relative_path: String,
    content: String,
    encoding: Option<ContentEncoding>,
    create_parents: Option<bool>,
    avoid_overwrite: Option<bool>,
    expected_modified_at: Option<u64>,  // For conflict detection
) -> Result<WriteResult, String> {
    let mut path = resolve_vault_path(&workspace_path, &relative_path)?;

    // Check for concurrent modification
    if let Some(expected) = expected_modified_at {
        if path.exists() {
            let metadata = fs::metadata(&path)
                .map_err(|e| format!("Failed to read metadata: {}", e))?;
            let actual = metadata.modified()
                .map_err(|e| format!("Failed to get modified time: {}", e))?
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);

            if actual != expected {
                return Err("File was modified by another process. Please refresh and try again.".to_string());
            }
        }
    }

    // Handle avoid_overwrite
    if avoid_overwrite.unwrap_or(false) && path.exists() {
        path = generate_unique_path(&path);
    }

    // Create parent directories if needed
    if create_parents.unwrap_or(true) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directories: {}", e))?;
        }
    }

    // Decode content if base64
    let bytes = match encoding.unwrap_or(ContentEncoding::Utf8) {
        ContentEncoding::Utf8 => content.into_bytes(),
        ContentEncoding::Base64 => BASE64.decode(&content)
            .map_err(|e| format!("Invalid base64 content: {}", e))?,
    };

    validate_file_size(bytes.len() as u64)?;

    // Atomic write: write to temp file, then rename
    // Use unique temp filename with PID to prevent race conditions
    let pid = std::process::id();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let temp_name = format!(
        ".{}.{}.{}.tmp",
        path.file_name().unwrap_or_default().to_string_lossy(),
        pid,
        timestamp
    );
    let temp_path = path.with_file_name(&temp_name);

    fs::write(&temp_path, &bytes)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    // Rename temp to final path (atomic on most filesystems)
    if let Err(e) = fs::rename(&temp_path, &path) {
        // Clean up temp file on failure
        let _ = fs::remove_file(&temp_path);
        return Err(format!("Failed to finalize write: {}", e));
    }

    // Get final metadata
    let metadata = fs::metadata(&path)
        .map_err(|e| format!("Failed to read final metadata: {}", e))?;
    let modified_at = metadata.modified()
        .map_err(|e| format!("Failed to get modified time: {}", e))?
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    // Get relative path for result
    let vault_root = Path::new(&workspace_path).join(".0rbit").join("Vault");
    let result_path = path.strip_prefix(&vault_root)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| relative_path);

    Ok(WriteResult {
        path: result_path,
        size_bytes: bytes.len() as u64,
        modified_at,
    })
}

#[tauri::command]
pub async fn vault_create_directory(
    workspace_path: String,
    relative_path: String,
) -> Result<(), String> {
    let path = resolve_vault_path(&workspace_path, &relative_path)?;
    fs::create_dir_all(&path)
        .map_err(|e| format!("Failed to create directory: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn vault_rename(
    workspace_path: String,
    old_path: String,
    new_path: String,
    avoid_overwrite: Option<bool>,
) -> Result<WriteResult, String> {
    let source = resolve_vault_path(&workspace_path, &old_path)?;
    let mut dest = resolve_vault_path(&workspace_path, &new_path)?;

    if !source.exists() {
        return Err("Source file does not exist".to_string());
    }

    if avoid_overwrite.unwrap_or(true) && dest.exists() {
        dest = generate_unique_path(&dest);
    }

    fs::rename(&source, &dest)
        .map_err(|e| format!("Failed to rename: {}", e))?;

    let metadata = fs::metadata(&dest)
        .map_err(|e| format!("Failed to read metadata: {}", e))?;

    let vault_root = Path::new(&workspace_path).join(".0rbit").join("Vault");
    let result_path = dest.strip_prefix(&vault_root)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or(new_path);

    Ok(WriteResult {
        path: result_path,
        size_bytes: metadata.len(),
        modified_at: metadata.modified()
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0))
            .unwrap_or(0),
    })
}

#[tauri::command]
pub async fn vault_move(
    workspace_path: String,
    source_path: String,
    dest_dir: String,
    avoid_overwrite: Option<bool>,
) -> Result<WriteResult, String> {
    let source = resolve_vault_path(&workspace_path, &source_path)?;
    let dest_dir = resolve_vault_path(&workspace_path, &dest_dir)?;

    if !source.exists() {
        return Err("Source does not exist".to_string());
    }

    let filename = source.file_name()
        .ok_or("Invalid source filename")?;
    let mut dest = dest_dir.join(filename);

    if avoid_overwrite.unwrap_or(true) && dest.exists() {
        dest = generate_unique_path(&dest);
    }

    fs::create_dir_all(&dest_dir)
        .map_err(|e| format!("Failed to create destination directory: {}", e))?;

    fs::rename(&source, &dest)
        .map_err(|e| format!("Failed to move: {}", e))?;

    let metadata = fs::metadata(&dest)
        .map_err(|e| format!("Failed to read metadata: {}", e))?;

    let vault_root = Path::new(&workspace_path).join(".0rbit").join("Vault");
    let result_path = dest.strip_prefix(&vault_root)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    Ok(WriteResult {
        path: result_path,
        size_bytes: metadata.len(),
        modified_at: metadata.modified()
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0))
            .unwrap_or(0),
    })
}

/// Delete with explicit recursive flag for safety
#[tauri::command]
pub async fn vault_delete(
    workspace_path: String,
    relative_path: String,
    recursive: bool,
) -> Result<DeleteResult, String> {
    let path = resolve_vault_path(&workspace_path, &relative_path)?;

    if !path.exists() {
        return Err("Path does not exist".to_string());
    }

    let metadata = fs::metadata(&path)
        .map_err(|e| format!("Failed to read metadata: {}", e))?;

    if metadata.is_dir() {
        // Check if directory is empty
        let entries: Vec<_> = fs::read_dir(&path)
            .map_err(|e| format!("Failed to read directory: {}", e))?
            .collect();

        if !entries.is_empty() && !recursive {
            return Err(format!(
                "Directory is not empty ({} items). Set recursive=true to delete.",
                entries.len()
            ));
        }

        // Count items being deleted
        let (files, dirs) = count_directory_contents(&path)?;

        fs::remove_dir_all(&path)
            .map_err(|e| format!("Failed to delete directory: {}", e))?;

        Ok(DeleteResult {
            deleted_files: files,
            deleted_dirs: dirs + 1,  // Include the directory itself
        })
    } else {
        fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete file: {}", e))?;

        Ok(DeleteResult {
            deleted_files: 1,
            deleted_dirs: 0,
        })
    }
}

fn count_directory_contents(path: &Path) -> Result<(u32, u32), String> {
    let mut files = 0u32;
    let mut dirs = 0u32;

    for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;

        if metadata.is_dir() {
            dirs += 1;
            let (f, d) = count_directory_contents(&entry.path())?;
            files += f;
            dirs += d;
        } else {
            files += 1;
        }
    }

    Ok((files, dirs))
}

#[tauri::command]
pub async fn vault_exists(
    workspace_path: String,
    relative_path: String,
) -> Result<bool, String> {
    let path = resolve_vault_path(&workspace_path, &relative_path)?;
    Ok(path.exists())
}

/// Get metadata for a single file (efficient alternative to listing entire directory)
#[tauri::command]
pub async fn vault_get_metadata(
    workspace_path: String,
    relative_path: String,
) -> Result<VaultEntry, String> {
    let path = resolve_vault_path(&workspace_path, &relative_path)?;
    create_vault_entry(&path, &workspace_path)
}

/// Get asset URL for efficient binary file access (images, etc.)
/// Returns the absolute path - frontend should use tauri's convertFileSrc()
#[tauri::command]
pub async fn vault_get_asset_url(
    workspace_path: String,
    relative_path: String,
) -> Result<String, String> {
    let path = resolve_vault_path(&workspace_path, &relative_path)?;

    if !path.exists() {
        return Err("File does not exist".to_string());
    }

    // Return absolute path - frontend converts to asset URL using convertFileSrc()
    // This avoids security issues with file:// URLs which Tauri blocks by default
    Ok(path.to_string_lossy().to_string())
}

// === Agent Context Commands ===

#[tauri::command]
pub async fn vault_get_context_config(
    workspace_path: String,
) -> Result<VaultContextConfig, String> {
    let config_path = Path::new(&workspace_path).join(".0rbit").join("vault-context.json");

    if !config_path.exists() {
        return Ok(VaultContextConfig {
            version: "1.0.0".to_string(),
            included_paths: Vec::new(),
        });
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read context config: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Invalid context config: {}", e))
}

#[tauri::command]
pub async fn vault_set_context_config(
    workspace_path: String,
    config: VaultContextConfig,
) -> Result<(), String> {
    let config_path = Path::new(&workspace_path).join(".0rbit").join("vault-context.json");

    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write context config: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn vault_get_context_files(
    workspace_path: String,
) -> Result<Vec<VaultEntry>, String> {
    let config = vault_get_context_config(workspace_path.clone()).await?;
    let vault_root = Path::new(&workspace_path).join(".0rbit").join("Vault");

    let mut entries = Vec::new();

    for included_path in &config.included_paths {
        let path = resolve_vault_path(&workspace_path, included_path)?;

        if path.is_file() {
            if let Ok(entry) = create_vault_entry(&path, &workspace_path) {
                entries.push(entry);
            }
        } else if path.is_dir() {
            // Use vault_root as root for correct relative paths in entries
            collect_entries(&path, &vault_root, true, &mut entries, MAX_SCAN_ENTRIES)?;
        }
    }

    Ok(entries)
}
```

### Register Module

**Edit `src-tauri/src/commands/mod.rs`:**

```rust
pub mod agent;
pub mod canvas;
pub mod common;
pub mod editor;
pub mod vault;  // ADD

pub use agent::*;
pub use common::*;
pub use vault::*;  // ADD
```

**Register in `src-tauri/src/lib.rs`** (add to `generate_handler![]`):

- `vault_check_initialized`
- `vault_initialize`
- `vault_list`
- `vault_stats`
- `vault_read`
- `vault_write`
- `vault_create_directory`
- `vault_rename`
- `vault_move`
- `vault_delete`
- `vault_exists`
- `vault_get_metadata`
- `vault_get_asset_url`
- `vault_get_context_config`
- `vault_set_context_config`
- `vault_get_context_files`

---

## Phase 2: Frontend Types & API (`apps/agent/src/features/vault/`)

### Types (types/vault-types.ts)

```typescript
import { z } from 'zod';

export const ContentEncodingSchema = z.enum(['utf8', 'base64']);
export type ContentEncoding = z.infer<typeof ContentEncodingSchema>;

export const VaultContentSchema = z.object({
  content: z.string(),
  encoding: ContentEncodingSchema,
  isBinary: z.boolean(),
  sizeBytes: z.number(),
});

export type VaultContent = z.infer<typeof VaultContentSchema>;

export const VaultEntrySchema = z.object({
  path: z.string(),
  name: z.string(),
  isDir: z.boolean(),
  sizeBytes: z.number(),
  createdAt: z.number(),
  modifiedAt: z.number(),
  extension: z.string().nullable(),
});

export type VaultEntry = z.infer<typeof VaultEntrySchema>;

export const VaultStatsSchema = z.object({
  totalFiles: z.number(),
  totalDirs: z.number(),
  totalSizeBytes: z.number(),
});

export type VaultStats = z.infer<typeof VaultStatsSchema>;

export const VaultListResultSchema = z.object({
  entries: z.array(VaultEntrySchema),
  totalCount: z.number(),
  hasMore: z.boolean(),
});

export type VaultListResult = z.infer<typeof VaultListResultSchema>;

export const WriteResultSchema = z.object({
  path: z.string(),
  sizeBytes: z.number(),
  modifiedAt: z.number(),
});

export type WriteResult = z.infer<typeof WriteResultSchema>;

export const DeleteResultSchema = z.object({
  deletedFiles: z.number(),
  deletedDirs: z.number(),
});

export type DeleteResult = z.infer<typeof DeleteResultSchema>;

export const VaultContextConfigSchema = z.object({
  version: z.string(),
  includedPaths: z.array(z.string()),
});

export type VaultContextConfig = z.infer<typeof VaultContextConfigSchema>;
```

### File Utils (utils/file-utils.ts)

```typescript
// File type detection for renderer selection
export type FileCategory =
  | 'markdown'
  | 'mermaid'
  | 'code'
  | 'json'
  | 'xml'
  | 'image'
  | 'pdf'
  | 'binary';

export function getFileCategory(extension: string | null, isBinary?: boolean): FileCategory {
  // Binary detection takes precedence
  if (isBinary) return 'binary';

  if (!extension) return 'binary';

  const ext = extension.toLowerCase();

  const categories: Record<string, FileCategory> = {
    // Markdown
    md: 'markdown',
    mdx: 'markdown',
    markdown: 'markdown',

    // Mermaid
    mermaid: 'mermaid',
    mmd: 'mermaid',

    // Code
    js: 'code',
    ts: 'code',
    jsx: 'code',
    tsx: 'code',
    py: 'code',
    rs: 'code',
    go: 'code',
    java: 'code',
    c: 'code',
    cpp: 'code',
    h: 'code',
    hpp: 'code',
    css: 'code',
    scss: 'code',
    less: 'code',
    html: 'code',
    vue: 'code',
    svelte: 'code',
    sh: 'code',
    bash: 'code',
    zsh: 'code',
    yaml: 'code',
    yml: 'code',
    toml: 'code',
    sql: 'code',
    graphql: 'code',

    // JSON
    json: 'json',
    jsonc: 'json',

    // XML
    xml: 'xml',
    svg: 'xml',
    plist: 'xml',

    // Images
    png: 'image',
    jpg: 'image',
    jpeg: 'image',
    gif: 'image',
    webp: 'image',
    ico: 'image',

    // PDF
    pdf: 'pdf',
  };

  return categories[ext] ?? 'binary';
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function decodeBase64(base64: string): string {
  return atob(base64);
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}
```

### Language Utils (utils/language-utils.ts)

```typescript
import type { Extension } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { markdown } from '@codemirror/lang-markdown';
import { xml } from '@codemirror/lang-xml';
import { sql } from '@codemirror/lang-sql';
import { yaml } from '@codemirror/lang-yaml';

/**
 * Returns the CodeMirror language extension for a given file extension.
 * Returns null if no matching language is found.
 */
export function getLanguageExtension(extension: string | null): Extension | null {
  if (!extension) return null;

  const ext = extension.toLowerCase();

  // TypeScript/JavaScript
  if (['ts', 'tsx', 'mts', 'cts'].includes(ext)) {
    return javascript({ typescript: true, jsx: ext.includes('x') });
  }
  if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) {
    return javascript({ jsx: ext.includes('x') });
  }

  // Python
  if (['py', 'pyw', 'pyi'].includes(ext)) {
    return python();
  }

  // Rust
  if (ext === 'rs') {
    return rust();
  }

  // JSON
  if (['json', 'jsonc', 'json5'].includes(ext)) {
    return json();
  }

  // HTML/Vue/Svelte
  if (['html', 'htm', 'vue', 'svelte'].includes(ext)) {
    return html();
  }

  // CSS/SCSS/LESS
  if (['css', 'scss', 'sass', 'less'].includes(ext)) {
    return css();
  }

  // Markdown
  if (['md', 'mdx', 'markdown'].includes(ext)) {
    return markdown();
  }

  // XML/SVG
  if (['xml', 'svg', 'plist', 'xsl', 'xslt'].includes(ext)) {
    return xml();
  }

  // SQL
  if (['sql', 'mysql', 'pgsql'].includes(ext)) {
    return sql();
  }

  // YAML
  if (['yaml', 'yml'].includes(ext)) {
    return yaml();
  }

  // Shell scripts - use basic highlighting (no dedicated lang)
  if (['sh', 'bash', 'zsh', 'fish'].includes(ext)) {
    return null; // CodeMirror doesn't have built-in shell support
  }

  // Config files
  if (['toml', 'ini', 'conf', 'cfg'].includes(ext)) {
    return null; // No built-in support
  }

  return null;
}
```

### API (api/vault-api.ts)

```typescript
import { invoke } from '@tauri-apps/api/core';
import type {
  VaultEntry,
  VaultStats,
  VaultContent,
  VaultListResult,
  WriteResult,
  DeleteResult,
  VaultContextConfig,
  ContentEncoding,
} from '../types';

// Initialization
export async function checkVaultInitialized(workspacePath: string): Promise<boolean> {
  return invoke<boolean>('vault_check_initialized', { workspacePath });
}

export async function initializeVault(workspacePath: string): Promise<void> {
  return invoke('vault_initialize', { workspacePath });
}

// Listing (with pagination)
export async function listVault(
  workspacePath: string,
  options?: {
    relativePath?: string;
    recursive?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<VaultListResult> {
  return invoke<VaultListResult>('vault_list', {
    workspacePath,
    relativePath: options?.relativePath,
    recursive: options?.recursive,
    limit: options?.limit,
    offset: options?.offset,
  });
}

export async function getVaultStats(workspacePath: string): Promise<VaultStats> {
  return invoke<VaultStats>('vault_stats', { workspacePath });
}

// Reading (with binary detection)
export async function readVaultFile(
  workspacePath: string,
  relativePath: string
): Promise<VaultContent> {
  return invoke<VaultContent>('vault_read', { workspacePath, relativePath });
}

// Writing (with conflict detection)
export async function writeVaultFile(
  workspacePath: string,
  relativePath: string,
  content: string,
  options?: {
    encoding?: ContentEncoding;
    createParents?: boolean;
    avoidOverwrite?: boolean;
    expectedModifiedAt?: number; // For conflict detection
  }
): Promise<WriteResult> {
  return invoke<WriteResult>('vault_write', {
    workspacePath,
    relativePath,
    content,
    encoding: options?.encoding,
    createParents: options?.createParents,
    avoidOverwrite: options?.avoidOverwrite,
    expectedModifiedAt: options?.expectedModifiedAt,
  });
}

// Directory operations
export async function createVaultDirectory(
  workspacePath: string,
  relativePath: string
): Promise<void> {
  return invoke('vault_create_directory', { workspacePath, relativePath });
}

// File operations
export async function renameVaultEntry(
  workspacePath: string,
  oldPath: string,
  newPath: string,
  avoidOverwrite?: boolean
): Promise<WriteResult> {
  return invoke<WriteResult>('vault_rename', {
    workspacePath,
    oldPath,
    newPath,
    avoidOverwrite,
  });
}

export async function moveVaultEntry(
  workspacePath: string,
  sourcePath: string,
  destDir: string,
  avoidOverwrite?: boolean
): Promise<WriteResult> {
  return invoke<WriteResult>('vault_move', {
    workspacePath,
    sourcePath,
    destDir,
    avoidOverwrite,
  });
}

export async function deleteVaultEntry(
  workspacePath: string,
  relativePath: string,
  recursive: boolean
): Promise<DeleteResult> {
  return invoke<DeleteResult>('vault_delete', {
    workspacePath,
    relativePath,
    recursive,
  });
}

export async function vaultEntryExists(
  workspacePath: string,
  relativePath: string
): Promise<boolean> {
  return invoke<boolean>('vault_exists', { workspacePath, relativePath });
}

// Get metadata for a single file (efficient for external change detection)
export async function getVaultMetadata(
  workspacePath: string,
  relativePath: string
): Promise<VaultEntry> {
  return invoke<VaultEntry>('vault_get_metadata', { workspacePath, relativePath });
}

// Asset URL for efficient binary file access
export async function getVaultAssetUrl(
  workspacePath: string,
  relativePath: string
): Promise<string> {
  return invoke<string>('vault_get_asset_url', { workspacePath, relativePath });
}

// Agent context
export async function getVaultContextConfig(workspacePath: string): Promise<VaultContextConfig> {
  return invoke<VaultContextConfig>('vault_get_context_config', { workspacePath });
}

export async function setVaultContextConfig(
  workspacePath: string,
  config: VaultContextConfig
): Promise<void> {
  return invoke('vault_set_context_config', { workspacePath, config });
}

export async function getVaultContextFiles(workspacePath: string): Promise<VaultEntry[]> {
  return invoke<VaultEntry[]>('vault_get_context_files', { workspacePath });
}
```

---

## Phase 3: Zustand Store (`apps/agent/src/features/vault/stores/`)

```typescript
// vault-store.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { useMemo } from 'react';
import type { VaultEntry, VaultContent, FileCategory } from '../types';
import { getFileCategory } from '../utils/file-utils';
import * as api from '../api/vault-api';

interface VaultState {
  // Directory state
  entries: VaultEntry[];
  currentPath: string;
  isLoading: boolean;
  error: string | null;
  totalCount: number;
  hasMore: boolean;

  // Search & filter
  searchQuery: string;
  showHidden: boolean;

  // Active file
  activeFile: VaultEntry | null;
  activeFileContent: VaultContent | null;
  activeFileCategory: FileCategory | null;
  isFileLoading: boolean;
  isFileModified: boolean;
  originalContent: string | null;
  lastModifiedAt: number | null; // For conflict detection

  // Editor state
  isEditing: boolean;
  isSaving: boolean;

  // Debounce flush callback (registered by TextEditor)
  flushPendingContent: (() => void) | null;

  // Agent context
  contextConfig: { includedPaths: string[] } | null;
}

interface VaultActions {
  // Directory navigation
  loadDirectory: (workspacePath: string, relativePath?: string) => Promise<void>;
  loadMore: (workspacePath: string) => Promise<void>;
  navigateUp: (workspacePath: string) => Promise<void>;
  refresh: (workspacePath: string) => Promise<void>;

  // File operations
  openFile: (workspacePath: string, entry: VaultEntry) => Promise<void>;
  closeFile: () => void;
  setFileContent: (content: string) => void;
  saveFile: (workspacePath: string) => Promise<void>;
  discardChanges: () => void;
  checkForExternalChanges: (workspacePath: string) => Promise<boolean>;
  registerFlushCallback: (callback: (() => void) | null) => void;

  // Search
  setSearchQuery: (query: string) => void;
  setShowHidden: (show: boolean) => void;

  // Editing
  setEditing: (editing: boolean) => void;

  // Agent context
  loadContextConfig: (workspacePath: string) => Promise<void>;
  togglePathInContext: (workspacePath: string, path: string) => Promise<void>;
  isPathInContext: (path: string) => boolean;

  // Error handling
  clearError: () => void;
}

type VaultStore = VaultState & VaultActions;

export const useVaultStore = create<VaultStore>()(
  immer((set, get) => ({
    // Initial state
    entries: [],
    currentPath: '',
    isLoading: false,
    error: null,
    totalCount: 0,
    hasMore: false,
    searchQuery: '',
    showHidden: false,
    activeFile: null,
    activeFileContent: null,
    activeFileCategory: null,
    isFileLoading: false,
    isFileModified: false,
    originalContent: null,
    lastModifiedAt: null,
    isEditing: false,
    isSaving: false,
    flushPendingContent: null,
    contextConfig: null,

    // Actions
    loadDirectory: async (workspacePath, relativePath = '') => {
      set((state) => {
        state.isLoading = true;
        state.error = null;
        state.currentPath = relativePath;
      });

      try {
        const result = await api.listVault(workspacePath, {
          relativePath,
          limit: 500,
        });

        set((state) => {
          state.entries = result.entries;
          state.totalCount = result.totalCount;
          state.hasMore = result.hasMore;
          state.isLoading = false;
        });
      } catch (err) {
        set((state) => {
          state.error = err instanceof Error ? err.message : 'Failed to load directory';
          state.isLoading = false;
        });
      }
    },

    loadMore: async (workspacePath) => {
      const { currentPath, entries, hasMore } = get();
      if (!hasMore) return;

      try {
        const result = await api.listVault(workspacePath, {
          relativePath: currentPath,
          offset: entries.length,
          limit: 500,
        });

        set((state) => {
          state.entries = [...state.entries, ...result.entries];
          state.hasMore = result.hasMore;
        });
      } catch (err) {
        set((state) => {
          state.error = err instanceof Error ? err.message : 'Failed to load more';
        });
      }
    },

    navigateUp: async (workspacePath) => {
      const { currentPath } = get();
      const parentPath = currentPath.split('/').slice(0, -1).join('/');
      await get().loadDirectory(workspacePath, parentPath);
    },

    refresh: async (workspacePath) => {
      const { currentPath } = get();
      await get().loadDirectory(workspacePath, currentPath);
    },

    openFile: async (workspacePath, entry) => {
      if (entry.isDir) {
        await get().loadDirectory(workspacePath, entry.path);
        return;
      }

      set((state) => {
        state.isFileLoading = true;
        state.activeFile = entry;
        state.error = null;
      });

      try {
        const content = await api.readVaultFile(workspacePath, entry.path);
        const category = getFileCategory(entry.extension, content.isBinary);

        set((state) => {
          state.activeFileContent = content;
          state.activeFileCategory = category;
          state.originalContent = content.content;
          state.lastModifiedAt = entry.modifiedAt;
          state.isFileLoading = false;
          state.isFileModified = false;
        });
      } catch (err) {
        set((state) => {
          state.error = err instanceof Error ? err.message : 'Failed to open file';
          state.isFileLoading = false;
        });
      }
    },

    closeFile: () => {
      set((state) => {
        state.activeFile = null;
        state.activeFileContent = null;
        state.activeFileCategory = null;
        state.originalContent = null;
        state.lastModifiedAt = null;
        state.isFileModified = false;
        state.isEditing = false;
      });
    },

    setFileContent: (content) => {
      set((state) => {
        if (state.activeFileContent) {
          state.activeFileContent.content = content;
          state.isFileModified = content !== state.originalContent;
        }
      });
    },

    saveFile: async (workspacePath) => {
      // Flush any pending debounced content from TextEditor first
      // This prevents data loss when user types then immediately clicks Save
      const { flushPendingContent } = get();
      flushPendingContent?.();

      const { activeFile, activeFileContent, lastModifiedAt } = get();
      if (!activeFile || !activeFileContent) return;

      set((state) => {
        state.isSaving = true;
      });

      try {
        const result = await api.writeVaultFile(
          workspacePath,
          activeFile.path,
          activeFileContent.content,
          {
            encoding: activeFileContent.encoding,
            expectedModifiedAt: lastModifiedAt ?? undefined,
          }
        );

        set((state) => {
          state.originalContent = activeFileContent.content;
          state.lastModifiedAt = result.modifiedAt;
          state.isFileModified = false;
          state.isSaving = false;
          state.isEditing = false;
        });
      } catch (err) {
        set((state) => {
          state.error = err instanceof Error ? err.message : 'Failed to save file';
          state.isSaving = false;
        });
      }
    },

    discardChanges: () => {
      set((state) => {
        // Reset content to original, discard modifications
        if (state.activeFileContent && state.originalContent !== null) {
          state.activeFileContent = {
            ...state.activeFileContent,
            content: state.originalContent,
          };
        }
        state.isFileModified = false;
        state.isEditing = false;
      });
    },

    registerFlushCallback: (callback) => {
      set((state) => {
        state.flushPendingContent = callback;
      });
    },

    checkForExternalChanges: async (workspacePath) => {
      const { activeFile, lastModifiedAt } = get();
      if (!activeFile || lastModifiedAt === null) return false;

      try {
        // Efficiently get metadata for just this one file
        const currentEntry = await api.getVaultMetadata(workspacePath, activeFile.path);

        // Compare stored modifiedAt with current
        return currentEntry.modifiedAt !== lastModifiedAt;
      } catch {
        // File might have been deleted externally
        return true;
      }
    },

    setSearchQuery: (query) => {
      set((state) => {
        state.searchQuery = query;
      });
    },

    setShowHidden: (show) => {
      set((state) => {
        state.showHidden = show;
      });
    },

    setEditing: (editing) => {
      set((state) => {
        state.isEditing = editing;
      });
    },

    loadContextConfig: async (workspacePath) => {
      try {
        const config = await api.getVaultContextConfig(workspacePath);
        set((state) => {
          state.contextConfig = { includedPaths: config.includedPaths };
        });
      } catch {
        set((state) => {
          state.contextConfig = { includedPaths: [] };
        });
      }
    },

    togglePathInContext: async (workspacePath, path) => {
      const { contextConfig } = get();
      if (!contextConfig) return;

      const newPaths = contextConfig.includedPaths.includes(path)
        ? contextConfig.includedPaths.filter((p) => p !== path)
        : [...contextConfig.includedPaths, path];

      await api.setVaultContextConfig(workspacePath, {
        version: '1.0.0',
        includedPaths: newPaths,
      });

      set((state) => {
        state.contextConfig = { includedPaths: newPaths };
      });
    },

    isPathInContext: (path) => {
      const { contextConfig } = get();
      if (!contextConfig) return false;
      return contextConfig.includedPaths.some((p) => path === p || path.startsWith(p + '/'));
    },

    clearError: () => {
      set((state) => {
        state.error = null;
      });
    },
  }))
);

// Selectors
export const useVaultEntries = (): VaultEntry[] => useVaultStore((s) => s.entries);
export const useVaultCurrentPath = (): string => useVaultStore((s) => s.currentPath);
export const useVaultIsLoading = (): boolean => useVaultStore((s) => s.isLoading);
export const useVaultError = (): string | null => useVaultStore((s) => s.error);
export const useActiveVaultFile = () =>
  useVaultStore((s) => ({
    file: s.activeFile,
    content: s.activeFileContent,
    category: s.activeFileCategory,
    isLoading: s.isFileLoading,
    isModified: s.isFileModified,
    isEditing: s.isEditing,
    isSaving: s.isSaving,
  }));

// Filtered entries selector
export function useFilteredVaultEntries(): VaultEntry[] {
  const entries = useVaultStore((s) => s.entries);
  const searchQuery = useVaultStore((s) => s.searchQuery);
  const showHidden = useVaultStore((s) => s.showHidden);

  return useMemo(() => {
    let filtered = entries;

    if (!showHidden) {
      filtered = filtered.filter((e) => !e.name.startsWith('.'));
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((e) => e.name.toLowerCase().includes(query));
    }

    return filtered.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [entries, searchQuery, showHidden]);
}
```

---

## Phase 4: UI Components

### Component Structure

```
apps/agent/src/features/vault/components/
├── VaultPage.tsx              # Main container
├── VaultHeader.tsx            # Breadcrumbs, search, actions
├── VaultBreadcrumb.tsx        # Path navigation
├── VaultGrid.tsx              # File/folder grid
├── VaultEntryCard.tsx         # Individual file/folder card
├── CreateItemDialog.tsx       # New file/folder dialog
├── RenameDialog.tsx           # Rename dialog
├── DeleteConfirmDialog.tsx    # Delete confirmation
├── DocumentViewer.tsx         # View/edit container
├── ErrorBoundary.tsx          # Renderer error isolation
├── renderers/
│   ├── MarkdownRenderer.tsx   # Streamdown for .md
│   ├── MermaidRenderer.tsx    # mermaid.js with timeout
│   ├── CodeRenderer.tsx       # CodeMirror read-only
│   ├── JsonRenderer.tsx       # Pretty-printed JSON
│   ├── XmlRenderer.tsx        # CodeMirror XML mode
│   ├── ImageRenderer.tsx      # Asset URL-based
│   ├── PdfRenderer.tsx        # PDF.js or fallback
│   ├── BinaryRenderer.tsx     # Download button
│   └── RenderError.tsx        # Error fallback
└── editor/
    ├── TextEditor.tsx         # CodeMirror with debounced updates
    └── EditorToolbar.tsx      # Save, discard actions
```

### ErrorBoundary.tsx

```typescript
import { Component, type ReactNode } from 'react';
import { RenderError } from './renderers/RenderError';
import type { VaultEntry } from '../types';

interface Props {
  children: ReactNode;
  file: VaultEntry;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class RendererErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <RenderError
          file={this.props.file}
          error={this.state.error?.message ?? 'Unknown error'}
        />
      );
    }

    return this.props.children;
  }
}
```

### MermaidRenderer.tsx (with configurable timeout)

```typescript
import { useRef, useState, useEffect } from 'react';
import mermaid from 'mermaid';
import type { FC } from 'react';

// Default timeout - can be overridden via props for complex diagrams
const DEFAULT_RENDER_TIMEOUT_MS = 5000;

interface MermaidRendererProps {
  readonly content: string;
  /** Timeout in ms for rendering complex diagrams (default: 5000) */
  readonly timeoutMs?: number;
}

export const MermaidRenderer: FC<MermaidRendererProps> = ({
  content,
  timeoutMs = DEFAULT_RENDER_TIMEOUT_MS,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(true);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    const render = async (): Promise<void> => {
      if (!containerRef.current) return;

      setIsRendering(true);
      setError(null);

      // Create a timeout promise (configurable for complex diagrams)
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Diagram render timed out after ${timeoutMs / 1000} seconds`));
        }, timeoutMs);
      });

      try {
        const id = `mermaid-${Date.now()}`;

        // Race between render and timeout
        const { svg } = await Promise.race([
          mermaid.render(id, content),
          timeoutPromise,
        ]);

        if (isMounted && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram');
        }
      } finally {
        clearTimeout(timeoutId);
        if (isMounted) {
          setIsRendering(false);
        }
      }
    };

    void render();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [content, timeoutMs]);

  if (error) {
    return (
      <div className="p-4 bg-destructive/10 rounded-lg">
        <p className="text-destructive text-sm font-medium">Failed to render diagram</p>
        <p className="text-destructive/80 text-xs mt-1">{error}</p>
        <pre className="mt-4 p-2 bg-muted rounded text-xs overflow-auto max-h-48">
          {content}
        </pre>
      </div>
    );
  }

  return (
    <div className="relative">
      {isRendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      )}
      <div ref={containerRef} className="flex justify-center" />
    </div>
  );
};
```

### ImageRenderer.tsx (with asset URL)

```typescript
import { useState, useEffect } from 'react';
import type { FC } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getVaultAssetUrl } from '../api/vault-api';
import { useWorkspacePath } from '@/hooks/use-workspace-path';

interface ImageRendererProps {
  readonly path: string;
}

export const ImageRenderer: FC<ImageRendererProps> = ({ path }) => {
  const workspacePath = useWorkspacePath();
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadUrl = async (): Promise<void> => {
      try {
        // Get absolute path from backend
        const absolutePath = await getVaultAssetUrl(workspacePath, path);
        // Convert to Tauri asset protocol URL (avoids file:// security issues)
        const url = convertFileSrc(absolutePath);
        if (isMounted) {
          setAssetUrl(url);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load image');
        }
      }
    };

    void loadUrl();

    return () => {
      isMounted = false;
    };
  }, [path, workspacePath]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!assetUrl) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex justify-center p-4">
      <img
        src={assetUrl}
        alt={path}
        className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-md"
        onError={() => setError('Failed to display image')}
      />
    </div>
  );
};
```

### TextEditor.tsx (with debounced updates)

```typescript
import { useCallback, useRef, useEffect } from 'react';
import type { FC } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { useTheme } from '@/providers/theme-provider';
import { orbitDarkTheme, orbitLightTheme } from '@/components/editor/themes';
import { getLanguageExtension } from '../utils/language-utils';
import { useVaultStore } from '../stores/vault-store';

const DEBOUNCE_MS = 100;

interface TextEditorProps {
  readonly content: string;
  readonly extension: string | null;
}

export const TextEditor: FC<TextEditorProps> = ({ content, extension }) => {
  const { theme } = useTheme();
  const setFileContent = useVaultStore((s) => s.setFileContent);
  const registerFlushCallback = useVaultStore((s) => s.registerFlushCallback);
  const langExtension = getLanguageExtension(extension);

  // Debounce ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestValueRef = useRef(content);

  // Update latest value on each change
  const handleChange = useCallback((value: string) => {
    latestValueRef.current = value;

    // Clear existing timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Set new debounced update
    debounceRef.current = setTimeout(() => {
      setFileContent(latestValueRef.current);
    }, DEBOUNCE_MS);
  }, [setFileContent]);

  // Register flush callback so saveFile can flush pending content
  useEffect(() => {
    const flushCallback = (): void => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
        setFileContent(latestValueRef.current);
      }
    };

    registerFlushCallback(flushCallback);

    return () => {
      // Unregister on unmount
      registerFlushCallback(null);
      // Clear timeout but don't flush (cancel case)
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [registerFlushCallback, setFileContent]);

  return (
    <CodeMirror
      value={content}
      onChange={handleChange}
      extensions={langExtension ? [langExtension] : []}
      theme={theme === 'dark' ? orbitDarkTheme : orbitLightTheme}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        highlightSelectionMatches: true,
      }}
      className="h-full"
    />
  );
};
```

### DocumentViewer.tsx (with error boundaries)

```typescript
import { useState, type FC } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useVaultStore, useActiveVaultFile } from '../stores/vault-store';
import { useWorkspacePath } from '@/hooks/use-workspace-path';
import { RendererErrorBoundary } from './ErrorBoundary';
import { MarkdownRenderer } from './renderers/MarkdownRenderer';
import { MermaidRenderer } from './renderers/MermaidRenderer';
import { CodeRenderer } from './renderers/CodeRenderer';
import { JsonRenderer } from './renderers/JsonRenderer';
import { XmlRenderer } from './renderers/XmlRenderer';
import { ImageRenderer } from './renderers/ImageRenderer';
import { PdfRenderer } from './renderers/PdfRenderer';
import { BinaryRenderer } from './renderers/BinaryRenderer';
import { TextEditor } from './editor/TextEditor';
import type { FileCategory, VaultEntry } from '../types';

export const DocumentViewer: FC = () => {
  const workspacePath = useWorkspacePath();
  const { file, content, category, isLoading, isModified, isEditing, isSaving } = useActiveVaultFile();
  const { closeFile, setEditing, saveFile, discardChanges } = useVaultStore();

  // Unsaved changes warning dialog
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  const handleCancel = (): void => {
    // TextEditor doesn't auto-flush on unmount, so discardChanges safely
    // resets content to original without any race conditions
    discardChanges();
  };

  const handleClose = (): void => {
    if (isModified) {
      // Show warning dialog instead of closing immediately
      setShowUnsavedDialog(true);
    } else {
      closeFile();
    }
  };

  const handleDiscardAndClose = (): void => {
    discardChanges();
    closeFile();
    setShowUnsavedDialog(false);
  };

  if (!file || isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const canEdit = category !== 'image' && category !== 'pdf' && category !== 'binary';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Unsaved changes dialog */}
      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to "{file.name}". Do you want to discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscardAndClose}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="font-medium">{file.name}</h2>
          {isModified && (
            <span className="text-xs text-amber-500 font-medium">• Unsaved</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && !isEditing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          {isEditing && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => void saveFile(workspacePath)}
                disabled={!isModified || isSaving}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isEditing && content ? (
          <TextEditor content={content.content} extension={file.extension} />
        ) : (
          <RendererErrorBoundary file={file}>
            <FileRenderer
              category={category}
              content={content?.content ?? null}
              file={file}
            />
          </RendererErrorBoundary>
        )}
      </div>
    </div>
  );
};

interface FileRendererProps {
  readonly category: FileCategory | null;
  readonly content: string | null;
  readonly file: VaultEntry;
}

const FileRenderer: FC<FileRendererProps> = ({ category, content, file }) => {
  switch (category) {
    case 'markdown':
      return <MarkdownRenderer content={content ?? ''} />;
    case 'mermaid':
      return <MermaidRenderer content={content ?? ''} />;
    case 'code':
      return <CodeRenderer content={content ?? ''} extension={file.extension} />;
    case 'json':
      return <JsonRenderer content={content ?? ''} />;
    case 'xml':
      return <XmlRenderer content={content ?? ''} />;
    case 'image':
      return <ImageRenderer path={file.path} />;
    case 'pdf':
      return <PdfRenderer path={file.path} />;
    default:
      return <BinaryRenderer file={file} />;
  }
};
```

### VaultPage.tsx (main container)

```typescript
import { useEffect, useCallback, useRef, useState, type FC } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useVaultStore, useActiveVaultFile, useFilteredVaultEntries } from '../stores/vault-store';
import { useWorkspacePath } from '@/hooks/use-workspace-path';
import { VaultHeader } from './VaultHeader';
import { VaultGrid } from './VaultGrid';
import { DocumentViewer } from './DocumentViewer';
import { CreateItemDialog } from './CreateItemDialog';

// Throttle utility
function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    }
  };
}

export const VaultPage: FC = () => {
  const workspacePath = useWorkspacePath();
  const { file, isModified } = useActiveVaultFile();
  const entries = useFilteredVaultEntries();
  const {
    isLoading,
    error,
    currentPath,
    loadDirectory,
    loadContextConfig,
    clearError,
    checkForExternalChanges,
    openFile,
    discardChanges,
  } = useVaultStore();

  // External change conflict dialog
  const [showConflictDialog, setShowConflictDialog] = useState(false);

  // Initialize vault on mount
  useEffect(() => {
    void loadDirectory(workspacePath, '');
    void loadContextConfig(workspacePath);
  }, [workspacePath, loadDirectory, loadContextConfig]);

  // Check for external changes when window gains focus (throttled)
  const checkExternalChanges = useCallback(async () => {
    if (!file) return;

    const hasChanged = await checkForExternalChanges(workspacePath);
    if (hasChanged) {
      if (isModified) {
        // User has unsaved changes AND file changed externally - show conflict dialog
        setShowConflictDialog(true);
      } else {
        // No local changes, safe to reload
        await openFile(workspacePath, file);
      }
    }
  }, [file, isModified, workspacePath, checkForExternalChanges, openFile]);

  // Throttled focus handler (max once per second)
  const throttledFocusRef = useRef(throttle(checkExternalChanges, 1000));

  useEffect(() => {
    // Update the throttled function when dependencies change
    throttledFocusRef.current = throttle(checkExternalChanges, 1000);
  }, [checkExternalChanges]);

  useEffect(() => {
    const handleFocus = (): void => {
      void throttledFocusRef.current();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const handleKeepLocal = (): void => {
    // User wants to keep their local changes, just close dialog
    setShowConflictDialog(false);
  };

  const handleReloadExternal = async (): Promise<void> => {
    if (file) {
      discardChanges();
      await openFile(workspacePath, file);
    }
    setShowConflictDialog(false);
  };

  // If a file is open, show the document viewer
  if (file) {
    return (
      <>
        {/* External change conflict dialog */}
        <AlertDialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>File changed externally</AlertDialogTitle>
              <AlertDialogDescription>
                "{file.name}" was modified outside the app. You have unsaved changes.
                What would you like to do?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleKeepLocal}>
                Keep my changes
              </AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleReloadExternal()}>
                Reload external version
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <DocumentViewer />
      </>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <VaultHeader />

      {/* Error banner */}
      {error !== null && (
        <div className="mx-4 mt-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center justify-between">
          <p className="text-sm text-destructive">{error}</p>
          <button
            onClick={clearError}
            className="text-destructive hover:text-destructive/80 text-sm font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4">
          {entries.length === 0 ? (
            <EmptyState currentPath={currentPath} />
          ) : (
            <VaultGrid entries={entries} />
          )}
        </div>
      )}

      <CreateItemDialog />
    </div>
  );
};

interface EmptyStateProps {
  readonly currentPath: string;
}

const EmptyState: FC<EmptyStateProps> = ({ currentPath }) => (
  <div className="flex flex-col items-center justify-center h-full text-center p-8">
    <div className="w-16 h-16 mb-4 rounded-full bg-muted flex items-center justify-center">
      <svg
        className="w-8 h-8 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
        />
      </svg>
    </div>
    <h3 className="text-lg font-medium mb-1">
      {currentPath === '' ? 'Vault is empty' : 'Folder is empty'}
    </h3>
    <p className="text-sm text-muted-foreground max-w-sm">
      {currentPath === ''
        ? 'Create your first note, diagram, or file to get started.'
        : 'This folder has no files yet. Create a new file or go back.'}
    </p>
  </div>
);
```

---

## File Summary

### Rust Files to Create

1. `src-tauri/src/commands/vault/mod.rs`
2. `src-tauri/src/commands/vault/types.rs`
3. `src-tauri/src/commands/vault/validation.rs`
4. `src-tauri/src/commands/vault/operations.rs`

### Rust Files to Modify

1. `src-tauri/src/commands/mod.rs` - Add `pub mod vault;`
2. `src-tauri/src/lib.rs` - Register vault commands

### Frontend Files to Create

1. `apps/agent/src/features/vault/types/vault-types.ts`
2. `apps/agent/src/features/vault/types/index.ts`
3. `apps/agent/src/features/vault/utils/file-utils.ts` - File category detection, size formatting
4. `apps/agent/src/features/vault/utils/language-utils.ts` - CodeMirror language extensions
5. `apps/agent/src/features/vault/utils/index.ts`
6. `apps/agent/src/features/vault/api/vault-api.ts`
7. `apps/agent/src/features/vault/api/index.ts`
8. `apps/agent/src/features/vault/stores/vault-store.ts`
9. `apps/agent/src/features/vault/stores/index.ts`
10. `apps/agent/src/features/vault/hooks/use-vault.ts`
11. `apps/agent/src/features/vault/hooks/index.ts`
12. `apps/agent/src/features/vault/components/VaultHeader.tsx`
13. `apps/agent/src/features/vault/components/VaultBreadcrumb.tsx`
14. `apps/agent/src/features/vault/components/VaultGrid.tsx`
15. `apps/agent/src/features/vault/components/VaultEntryCard.tsx`
16. `apps/agent/src/features/vault/components/CreateItemDialog.tsx`
17. `apps/agent/src/features/vault/components/RenameDialog.tsx`
18. `apps/agent/src/features/vault/components/DeleteConfirmDialog.tsx`
19. `apps/agent/src/features/vault/components/DocumentViewer.tsx`
20. `apps/agent/src/features/vault/components/ErrorBoundary.tsx`
21. `apps/agent/src/features/vault/components/renderers/MarkdownRenderer.tsx`
22. `apps/agent/src/features/vault/components/renderers/MermaidRenderer.tsx`
23. `apps/agent/src/features/vault/components/renderers/CodeRenderer.tsx`
24. `apps/agent/src/features/vault/components/renderers/JsonRenderer.tsx`
25. `apps/agent/src/features/vault/components/renderers/XmlRenderer.tsx`
26. `apps/agent/src/features/vault/components/renderers/ImageRenderer.tsx`
27. `apps/agent/src/features/vault/components/renderers/PdfRenderer.tsx`
28. `apps/agent/src/features/vault/components/renderers/BinaryRenderer.tsx`
29. `apps/agent/src/features/vault/components/renderers/RenderError.tsx`
30. `apps/agent/src/features/vault/components/renderers/index.ts`
31. `apps/agent/src/features/vault/components/editor/TextEditor.tsx`
32. `apps/agent/src/features/vault/components/editor/EditorToolbar.tsx`
33. `apps/agent/src/features/vault/components/editor/index.ts`

### Frontend Files to Modify

1. `apps/agent/src/features/vault/components/VaultPage.tsx`
2. `apps/agent/src/features/vault/components/index.ts`
3. `apps/agent/src/features/vault/index.ts`
4. `package.json` - Add mermaid dependency

### Implementation Status

**Fully Specified in This Plan:**

- VaultPage.tsx, DocumentViewer.tsx, TextEditor.tsx
- ErrorBoundary.tsx, MermaidRenderer.tsx, ImageRenderer.tsx
- vault-store.ts, vault-api.ts, vault-types.ts
- file-utils.ts, language-utils.ts
- All Rust commands (types.rs, validation.rs, operations.rs)

**Need Implementation (TODO):**

- VaultHeader.tsx - Search bar, create button, breadcrumb
- VaultBreadcrumb.tsx - Path navigation with clickable segments
- VaultGrid.tsx - Grid layout for entries
- VaultEntryCard.tsx - File/folder card with context menu
- CreateItemDialog.tsx - New file/folder dialog
- RenameDialog.tsx - Rename entry dialog
- DeleteConfirmDialog.tsx - Delete confirmation
- MarkdownRenderer.tsx - Streamdown for .md files
- CodeRenderer.tsx - Read-only CodeMirror
- JsonRenderer.tsx - Pretty-printed JSON view
- XmlRenderer.tsx - CodeMirror XML mode
- PdfRenderer.tsx - PDF.js or browser fallback
- BinaryRenderer.tsx - Download button for binary files
- RenderError.tsx - Error display component
- EditorToolbar.tsx - Save/discard actions (optional, actions in header)

---

## Security Checklist

### Path Validation

- [ ] All paths validated via `resolve_vault_path()` before any operation
- [ ] Path traversal (`..`) rejected at validation layer
- [ ] Symlinks rejected or resolved safely (escape detection)
- [ ] Windows reserved names rejected (CON, PRN, NUL, etc.)
- [ ] Null bytes in paths rejected
- [ ] Max path length enforced (4096 chars)

### File Operations

- [ ] File size checked before read/write (10MB limit)
- [ ] Directory scan limited to 10,000 entries
- [ ] Binary detection at read time, not just extension
- [ ] Concurrent write detection via `expectedModifiedAt`
- [ ] Atomic writes with unique temp names (PID + timestamp to prevent race conditions)
- [ ] Temp file cleanup on write failure
- [ ] Orphaned temp files cleaned on vault init (>1 minute old)
- [ ] No shell commands executed (pure filesystem operations)

### Frontend Security

- [ ] Asset URLs use Tauri's `convertFileSrc()`, not `file://` protocol
- [ ] Error messages don't expose full filesystem paths (use relative paths)
- [ ] Edit cancel properly discards changes (no flush on unmount when cancelling)

---

## Verification Plan

### Build Checks

1. **TypeScript**: `bun run check`
2. **Rust**: `cargo check && cargo clippy`
3. **Full App**: `bunx tauri dev`

### Manual Testing

#### Basic Operations

- [ ] Open Vault → verify `.0rbit/Vault/` created
- [ ] Create file → verify saved with correct name
- [ ] Create file with existing name → verify `-1` suffix
- [ ] Create subdirectory → navigate into it
- [ ] Create markdown file → verify renders correctly
- [ ] Create mermaid file → verify diagram renders
- [ ] Invalid mermaid syntax → verify error shown, not crash
- [ ] Edit file → verify dirty state → save
- [ ] Rename file → verify filesystem updated
- [ ] Delete file → verify removed
- [ ] Delete non-empty directory without `recursive` → verify rejected
- [ ] Delete non-empty directory with `recursive` → verify count returned

#### Concurrency & Edge Cases

- [ ] Open 5MB image → verify doesn't freeze (uses asset URL)
- [ ] Open file, modify in external editor, return → verify handles gracefully
- [ ] Type rapidly in editor, save → verify correct content saved (debounce)
- [ ] Two tabs, same file, both edit → verify conflict detection on save
- [ ] Cancel edit after typing → verify changes discarded (not flushed)
- [ ] Crash app during write → restart → verify no corruption and temp cleaned

#### Security Tests

- [ ] Try path traversal (`../../../etc/passwd`) → verify rejected
- [ ] Try 20MB file → verify rejected with clear error
- [ ] Create file named "CON.txt" (Windows) → verify rejected
- [ ] Create file with null byte in name → verify rejected
- [ ] Create symlink pointing outside vault → verify rejected

#### Mermaid Renderer

- [ ] Create simple mermaid diagram → verify renders
- [ ] Create complex mermaid diagram → verify timeout handling
- [ ] Create mermaid diagram with syntax error → verify error shown, raw content displayed

#### Agent Context

- [ ] Agent context: toggle file inclusion → verify persisted
- [ ] Agent context: verify only included files returned
