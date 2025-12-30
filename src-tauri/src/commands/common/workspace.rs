//! Workspace commands

use parking_lot::RwLock;

static WORKSPACE_PATH: RwLock<Option<String>> = RwLock::new(None);

/// Get the current workspace path
#[tauri::command]
#[must_use]
pub fn get_workspace_path() -> Option<String> {
    WORKSPACE_PATH.read().clone()
}

/// Set the workspace path
#[tauri::command]
pub fn set_workspace_path(path: String) {
    let mut workspace = WORKSPACE_PATH.write();
    *workspace = Some(path);
}
