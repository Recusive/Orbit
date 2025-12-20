//! File system commands

use snowflake_core::{FileEntry, FileInfo, Result};
use snowflake_fs;

#[tauri::command]
pub async fn read_file(path: String) -> Result<String> {
    snowflake_fs::read_file(&path).await
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<()> {
    snowflake_fs::write_file(&path, &content).await
}

#[tauri::command]
pub async fn list_directory(path: String) -> Result<Vec<FileEntry>> {
    snowflake_fs::list_directory(&path).await
}

#[tauri::command]
pub async fn delete_file(path: String) -> Result<()> {
    snowflake_fs::delete_file(&path).await
}

#[tauri::command]
pub async fn rename_file(old_path: String, new_path: String) -> Result<()> {
    snowflake_fs::rename_file(&old_path, &new_path).await
}

#[tauri::command]
pub async fn create_directory(path: String) -> Result<()> {
    snowflake_fs::create_directory(&path).await
}

#[tauri::command]
pub async fn file_exists(path: String) -> bool {
    snowflake_fs::file_exists(&path).await
}

#[tauri::command]
pub async fn get_file_info(path: String) -> Result<FileInfo> {
    snowflake_fs::get_file_info(&path).await
}
