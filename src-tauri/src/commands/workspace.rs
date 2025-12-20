//! Workspace commands

use snowflake_core::Result;
use std::sync::RwLock;

static WORKSPACE_PATH: RwLock<Option<String>> = RwLock::new(None);

#[tauri::command]
pub fn get_workspace_path() -> Option<String> {
    WORKSPACE_PATH.read().unwrap().clone()
}

#[tauri::command]
pub fn set_workspace_path(path: String) -> Result<()> {
    let mut workspace = WORKSPACE_PATH.write().unwrap();
    *workspace = Some(path);
    Ok(())
}
