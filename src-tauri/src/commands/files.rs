//! File system commands for Tauri
//!
//! These commands wrap the snowflake-fs crate for use in the frontend.

use snowflake_core::{FileEntry, FileInfo, Result};

// ============================================
// Basic File Operations
// ============================================

/// Read file contents as a string
#[tauri::command]
pub async fn read_file(path: String) -> Result<String> {
    snowflake_fs::read_file(&path).await
}

/// Read file contents as bytes (base64 encoded for transport)
#[tauri::command]
pub async fn read_file_bytes(path: String) -> Result<Vec<u8>> {
    snowflake_fs::read_file_bytes(&path).await
}

/// Write content to a file
#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<()> {
    snowflake_fs::write_file(&path, &content).await
}

/// Write bytes to a file
#[tauri::command]
pub async fn write_file_bytes(path: String, content: Vec<u8>) -> Result<()> {
    snowflake_fs::write_file_bytes(&path, &content).await
}

/// List directory contents
///
/// # Arguments
///
/// * `path` - Directory path to list
/// * `show_hidden` - Whether to include hidden files (default: false)
#[tauri::command]
pub async fn list_directory(path: String, show_hidden: Option<bool>) -> Result<Vec<FileEntry>> {
    snowflake_fs::list_directory(&path, show_hidden.unwrap_or(false)).await
}

/// Create an empty file
#[tauri::command]
pub async fn create_file(path: String) -> Result<()> {
    snowflake_fs::create_file(&path).await
}

/// Create a directory (and parents if needed)
#[tauri::command]
pub async fn create_directory(path: String) -> Result<()> {
    snowflake_fs::create_directory(&path).await
}

/// Delete a file or directory
#[tauri::command]
pub async fn delete_file(path: String) -> Result<()> {
    snowflake_fs::delete_file(&path).await
}

/// Rename or move a file
#[tauri::command]
pub async fn rename_file(old_path: String, new_path: String) -> Result<()> {
    snowflake_fs::rename_file(&old_path, &new_path).await
}

/// Copy a file
#[tauri::command]
pub async fn copy_file(from: String, to: String) -> Result<()> {
    snowflake_fs::copy_file(&from, &to).await
}

/// Check if a file exists
#[tauri::command]
pub async fn file_exists(path: String) -> bool {
    snowflake_fs::file_exists(&path).await
}

/// Check if a path is a directory
#[tauri::command]
pub async fn is_directory(path: String) -> bool {
    snowflake_fs::is_directory(&path).await
}

/// Get detailed file information
#[tauri::command]
pub async fn get_file_info(path: String) -> Result<FileInfo> {
    snowflake_fs::get_file_info(&path).await
}
