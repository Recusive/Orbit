//! Workspace commands

use parking_lot::RwLock;

use crate::core::perf_logger::PerfSource;
use crate::perf_log;

static WORKSPACE_PATH: RwLock<Option<String>> = RwLock::new(None);

/// Get the current workspace path
#[tauri::command]
#[must_use]
pub fn get_workspace_path() -> Option<String> {
    perf_log!(PerfSource::Ipc, "get_workspace_path", {
        WORKSPACE_PATH.read().clone()
    })
}

/// Set the workspace path
#[tauri::command]
pub fn set_workspace_path(path: String) {
    perf_log!(PerfSource::Ipc, "set_workspace_path", {
        let mut workspace = WORKSPACE_PATH.write();
        *workspace = Some(path);
    });
}
