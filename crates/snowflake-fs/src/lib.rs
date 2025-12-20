//! Snowflake File System - File operations and watching
//!
//! This crate provides async file system operations including:
//! - Reading and writing files
//! - Directory listing and traversal
//! - File watching for change notifications
//! - Search functionality

use std::path::Path;
use std::time::UNIX_EPOCH;

use snowflake_core::{Error, FileEntry, FileInfo, Result};
use tokio::fs;

/// Read file contents as a string
pub async fn read_file(path: &str) -> Result<String> {
    fs::read_to_string(path)
        .await
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound => Error::FileNotFound(path.to_string()),
            std::io::ErrorKind::PermissionDenied => Error::PermissionDenied(path.to_string()),
            _ => Error::Io(e),
        })
}

/// Write content to a file
pub async fn write_file(path: &str, content: &str) -> Result<()> {
    // Ensure parent directory exists
    if let Some(parent) = Path::new(path).parent() {
        fs::create_dir_all(parent).await?;
    }

    fs::write(path, content)
        .await
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::PermissionDenied => Error::PermissionDenied(path.to_string()),
            _ => Error::Io(e),
        })
}

/// List directory contents
pub async fn list_directory(path: &str) -> Result<Vec<FileEntry>> {
    let mut entries = Vec::new();
    let mut dir = fs::read_dir(path)
        .await
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound => Error::DirectoryNotFound(path.to_string()),
            std::io::ErrorKind::PermissionDenied => Error::PermissionDenied(path.to_string()),
            _ => Error::Io(e),
        })?;

    while let Some(entry) = dir.next_entry().await? {
        let path = entry.path();
        let metadata = entry.metadata().await.ok();

        let file_entry = FileEntry {
            path: path.to_string_lossy().to_string(),
            name: entry.file_name().to_string_lossy().to_string(),
            is_dir: path.is_dir(),
            size: metadata.as_ref().map(|m| m.len()),
            modified: metadata.and_then(|m| {
                m.modified().ok().and_then(|t| {
                    t.duration_since(UNIX_EPOCH).ok().map(|d| d.as_secs())
                })
            }),
        };

        entries.push(file_entry);
    }

    // Sort: directories first, then alphabetically
    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(entries)
}

/// Delete a file or directory
pub async fn delete_file(path: &str) -> Result<()> {
    let metadata = fs::metadata(path)
        .await
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound => Error::FileNotFound(path.to_string()),
            _ => Error::Io(e),
        })?;

    if metadata.is_dir() {
        fs::remove_dir_all(path).await?;
    } else {
        fs::remove_file(path).await?;
    }

    Ok(())
}

/// Rename/move a file or directory
pub async fn rename_file(old_path: &str, new_path: &str) -> Result<()> {
    fs::rename(old_path, new_path)
        .await
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound => Error::FileNotFound(old_path.to_string()),
            std::io::ErrorKind::PermissionDenied => Error::PermissionDenied(old_path.to_string()),
            _ => Error::Io(e),
        })
}

/// Create a directory (and parents if needed)
pub async fn create_directory(path: &str) -> Result<()> {
    fs::create_dir_all(path)
        .await
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::PermissionDenied => Error::PermissionDenied(path.to_string()),
            _ => Error::Io(e),
        })
}

/// Check if a file or directory exists
pub async fn file_exists(path: &str) -> bool {
    fs::metadata(path).await.is_ok()
}

/// Get detailed file information
pub async fn get_file_info(path: &str) -> Result<FileInfo> {
    let metadata = fs::metadata(path)
        .await
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound => Error::FileNotFound(path.to_string()),
            _ => Error::Io(e),
        })?;

    let path_obj = Path::new(path);
    let name = path_obj
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let created = metadata
        .created()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    Ok(FileInfo {
        path: path.to_string(),
        name,
        is_dir: metadata.is_dir(),
        is_file: metadata.is_file(),
        size: metadata.len(),
        modified,
        created,
        readonly: metadata.permissions().readonly(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_file_operations() {
        let temp_dir = std::env::temp_dir().join("snowflake_test");
        let _ = fs::create_dir_all(&temp_dir).await;

        let test_file = temp_dir.join("test.txt");
        let test_path = test_file.to_string_lossy().to_string();

        // Write
        write_file(&test_path, "Hello, World!").await.unwrap();

        // Read
        let content = read_file(&test_path).await.unwrap();
        assert_eq!(content, "Hello, World!");

        // Exists
        assert!(file_exists(&test_path).await);

        // Info
        let info = get_file_info(&test_path).await.unwrap();
        assert_eq!(info.name, "test.txt");
        assert!(info.is_file);

        // Delete
        delete_file(&test_path).await.unwrap();
        assert!(!file_exists(&test_path).await);
    }
}
