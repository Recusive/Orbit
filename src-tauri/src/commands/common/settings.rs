//! Settings commands for Tauri
//!
//! These commands provide settings management operations.

#![allow(
    clippy::needless_pass_by_value,
    reason = "Tauri commands receive owned types from JSON deserialization"
)]

use std::path::Path;

use orbit_core::Result;
use orbit_settings::{Settings, SettingsManager};
use tauri::State;

use crate::core::perf_logger::PerfSource;
use crate::perf_log;

/// Get all settings.
#[tauri::command]
pub fn get_settings(manager: State<'_, SettingsManager>) -> Result<Settings> {
    perf_log!(PerfSource::Ipc, "get_settings", { Ok(manager.get()) })
}

/// Update all settings.
#[tauri::command]
pub fn update_settings(settings: Settings, manager: State<'_, SettingsManager>) -> Result<()> {
    perf_log!(PerfSource::Ipc, "update_settings", {
        manager.update(&settings)
    })
}

/// Add a project to the recent projects list.
#[tauri::command]
pub fn add_recent_project(path: String, manager: State<'_, SettingsManager>) -> Result<()> {
    perf_log!(PerfSource::Ipc, "add_recent_project", {
        manager.add_recent_project(Path::new(&path))
    })
}

/// Get the list of recent projects.
#[tauri::command]
pub fn get_recent_projects(manager: State<'_, SettingsManager>) -> Result<Vec<String>> {
    perf_log!(PerfSource::Ipc, "get_recent_projects", {
        Ok(manager
            .recent_projects()
            .into_iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect())
    })
}

/// Clear all recent projects.
#[tauri::command]
pub fn clear_recent_projects(manager: State<'_, SettingsManager>) -> Result<()> {
    perf_log!(PerfSource::Ipc, "clear_recent_projects", {
        manager.clear_recent_projects()
    })
}

/// Get the settings file path.
#[tauri::command]
pub fn get_settings_path(manager: State<'_, SettingsManager>) -> String {
    perf_log!(PerfSource::Ipc, "get_settings_path", {
        manager.config_path().to_string_lossy().to_string()
    })
}

// ============================================
// SSH Host Commands
// ============================================

/// Add an SSH host to the recent hosts list.
#[tauri::command]
pub fn add_ssh_host(host: String, manager: State<'_, SettingsManager>) -> Result<()> {
    perf_log!(PerfSource::Ipc, "add_ssh_host", {
        manager.add_ssh_host(&host)
    })
}

/// Get the list of recent SSH hosts.
#[tauri::command]
pub fn get_ssh_hosts(manager: State<'_, SettingsManager>) -> Result<Vec<String>> {
    perf_log!(PerfSource::Ipc, "get_ssh_hosts", {
        Ok(manager.ssh_hosts())
    })
}

/// Remove an SSH host from the recent hosts list.
#[tauri::command]
pub fn remove_ssh_host(host: String, manager: State<'_, SettingsManager>) -> Result<()> {
    perf_log!(PerfSource::Ipc, "remove_ssh_host", {
        manager.remove_ssh_host(&host)
    })
}

/// Clear all SSH hosts.
#[tauri::command]
pub fn clear_ssh_hosts(manager: State<'_, SettingsManager>) -> Result<()> {
    perf_log!(PerfSource::Ipc, "clear_ssh_hosts", {
        manager.clear_ssh_hosts()
    })
}
