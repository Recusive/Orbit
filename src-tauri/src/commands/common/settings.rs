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

/// Get all settings.
#[tauri::command]
pub fn get_settings(manager: State<'_, SettingsManager>) -> Result<Settings> {
    Ok(manager.get())
}

/// Update all settings.
#[tauri::command]
pub fn update_settings(settings: Settings, manager: State<'_, SettingsManager>) -> Result<()> {
    manager.update(&settings)
}

/// Add a project to the recent projects list.
#[tauri::command]
pub fn add_recent_project(path: String, manager: State<'_, SettingsManager>) -> Result<()> {
    manager.add_recent_project(Path::new(&path))
}

/// Get the list of recent projects.
#[tauri::command]
pub fn get_recent_projects(manager: State<'_, SettingsManager>) -> Result<Vec<String>> {
    Ok(manager
        .recent_projects()
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect())
}

/// Clear all recent projects.
#[tauri::command]
pub fn clear_recent_projects(manager: State<'_, SettingsManager>) -> Result<()> {
    manager.clear_recent_projects()
}

/// Get the settings file path.
#[tauri::command]
pub fn get_settings_path(manager: State<'_, SettingsManager>) -> String {
    manager.config_path().to_string_lossy().to_string()
}
