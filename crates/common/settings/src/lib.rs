//! Orbit Settings - User configuration management
//!
//! This crate handles loading, saving, and managing user settings
//! for the Orbit editor.
//!
//! # Configuration Location
//!
//! Settings are stored in platform-specific config directories:
//! - macOS: `~/Library/Application Support/orbit/settings.json`
//! - Linux: `~/.config/orbit/settings.json`
//! - Windows: `%APPDATA%/orbit/settings.json`

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::process;

use directories::ProjectDirs;
use orbit_core::{Error, Result};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

// ============================================
// Editor Settings
// ============================================

/// Editor settings controlling text editing behavior
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorSettings {
    /// Font family for the editor
    #[serde(default = "default_font_family")]
    pub font_family: String,
    /// Font size in pixels
    #[serde(default = "default_font_size")]
    pub font_size: u32,
    /// Tab size in spaces
    #[serde(default = "default_tab_size")]
    pub tab_size: u32,
    /// Insert spaces instead of tabs
    #[serde(default = "default_true")]
    pub insert_spaces: bool,
    /// Enable word wrap
    #[serde(default)]
    pub word_wrap: bool,
    /// Show line numbers
    #[serde(default = "default_true")]
    pub line_numbers: bool,
    /// Show minimap
    #[serde(default)]
    pub minimap: bool,
    /// Enable vim mode
    #[serde(default)]
    pub vim_mode: bool,
}

impl Default for EditorSettings {
    fn default() -> Self {
        Self {
            font_family: default_font_family(),
            font_size: default_font_size(),
            tab_size: default_tab_size(),
            insert_spaces: true,
            word_wrap: false,
            line_numbers: true,
            minimap: false,
            vim_mode: false,
        }
    }
}

// ============================================
// Theme Settings
// ============================================

/// Theme settings controlling visual appearance
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeSettings {
    /// Active theme name (dark, light, etc.)
    #[serde(default = "default_theme")]
    pub theme: String,
    /// Optional accent color (hex string like "#ff6b6b")
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accent_color: Option<String>,
}

impl Default for ThemeSettings {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            accent_color: None,
        }
    }
}

// ============================================
// AI Settings
// ============================================

/// AI assistant settings
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AISettings {
    /// Enable AI features
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Enable inline code suggestions
    #[serde(default = "default_true")]
    pub inline_suggestions: bool,
    // Note: api_key is intentionally NOT stored in the config file
    // It should be stored in the system keychain or environment variable
}

impl Default for AISettings {
    fn default() -> Self {
        Self {
            enabled: true,
            inline_suggestions: true,
        }
    }
}

// ============================================
// Window State
// ============================================

/// Window state for restoring window position and size
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    /// Window width in pixels
    #[serde(default = "default_window_width")]
    pub width: u32,
    /// Window height in pixels
    #[serde(default = "default_window_height")]
    pub height: u32,
    /// Window X position (None = center)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<i32>,
    /// Window Y position (None = center)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<i32>,
    /// Whether window is maximized
    #[serde(default)]
    pub maximized: bool,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            width: default_window_width(),
            height: default_window_height(),
            x: None,
            y: None,
            maximized: false,
        }
    }
}

// ============================================
// Main Settings Struct
// ============================================

/// All application settings
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// Editor settings
    #[serde(default)]
    pub editor: EditorSettings,
    /// Theme settings
    #[serde(default)]
    pub theme: ThemeSettings,
    /// AI settings
    #[serde(default)]
    pub ai: AISettings,
    /// Window state
    #[serde(default)]
    pub window_state: WindowState,
    /// Recent projects (file paths)
    #[serde(default)]
    pub recent_projects: Vec<PathBuf>,
}

impl Settings {
    /// Validate and sanitize settings, clamping values to valid ranges.
    ///
    /// This ensures settings remain usable even if the config file
    /// contains invalid values.
    #[must_use]
    pub fn validated(mut self) -> Self {
        // Font size: 6-72 pixels
        self.editor.font_size = self.editor.font_size.clamp(6, 72);

        // Tab size: 1-8 spaces
        self.editor.tab_size = self.editor.tab_size.clamp(1, 8);

        // Window dimensions: minimum 400x300
        self.window_state.width = self.window_state.width.max(400);
        self.window_state.height = self.window_state.height.max(300);

        // Limit recent projects to 10
        self.recent_projects.truncate(10);

        self
    }
}

// ============================================
// Settings Manager
// ============================================

/// Manages loading and saving of application settings
#[derive(Debug)]
pub struct SettingsManager {
    /// Current settings in memory
    settings: RwLock<Settings>,
    /// Path to config directory
    config_dir: PathBuf,
}

impl SettingsManager {
    /// Create a new settings manager.
    ///
    /// Automatically determines the config directory based on the platform.
    #[must_use]
    pub fn new() -> Self {
        let config_dir = Self::default_config_dir();
        Self {
            settings: RwLock::new(Settings::default()),
            config_dir,
        }
    }

    /// Create a settings manager with a custom config directory.
    ///
    /// Useful for testing.
    #[must_use]
    pub fn with_config_dir(config_dir: PathBuf) -> Self {
        Self {
            settings: RwLock::new(Settings::default()),
            config_dir,
        }
    }

    /// Get the default config directory for the current platform.
    #[must_use]
    pub fn default_config_dir() -> PathBuf {
        ProjectDirs::from("com", "recursive", "orbit").map_or_else(
            || {
                // Fallback to home directory
                dirs::home_dir().map_or_else(|| PathBuf::from(".orbit"), |h| h.join(".orbit"))
            },
            |dirs| dirs.config_dir().to_path_buf(),
        )
    }

    /// Get the path to the settings file.
    #[must_use]
    pub fn config_path(&self) -> PathBuf {
        self.config_dir.join("settings.json")
    }

    /// Get the config directory path.
    #[must_use]
    pub fn config_dir(&self) -> &PathBuf {
        &self.config_dir
    }

    /// Load settings from disk.
    ///
    /// If the file doesn't exist, returns default settings.
    /// If the file exists but is invalid, logs a warning and returns defaults.
    ///
    /// # Errors
    ///
    /// Returns an error if the file exists but cannot be read due to permissions.
    pub fn load(&self) -> Result<Settings> {
        let path = self.config_path();

        if !path.exists() {
            tracing::debug!("Settings file not found, using defaults");
            return Ok(Settings::default());
        }

        let content = fs::read_to_string(&path).map_err(|e| {
            if e.kind() == ErrorKind::PermissionDenied {
                Error::PermissionDenied(path.display().to_string())
            } else {
                Error::Io(e)
            }
        })?;

        match serde_json::from_str::<Settings>(&content) {
            Ok(settings) => {
                // Validate and clamp values to valid ranges
                let validated = settings.validated();
                tracing::debug!("Loaded settings from {}", path.display());
                let mut guard = self.settings.write();
                *guard = validated.clone();
                Ok(validated)
            },
            Err(e) => {
                tracing::warn!(
                    "Failed to parse settings file {}: {}. Using defaults.",
                    path.display(),
                    e
                );
                Ok(Settings::default())
            },
        }
    }

    /// Save settings to disk.
    ///
    /// Creates the config directory if it doesn't exist.
    /// Uses atomic write (write to temp file, then rename) to prevent corruption.
    ///
    /// # Errors
    ///
    /// Returns an error if the settings cannot be written.
    pub fn save(&self, settings: &Settings) -> Result<()> {
        // Ensure config directory exists
        if !self.config_dir.exists() {
            fs::create_dir_all(&self.config_dir).map_err(|e| {
                Error::Config(format!(
                    "Failed to create config directory {}: {}",
                    self.config_dir.display(),
                    e
                ))
            })?;
        }

        let path = self.config_path();
        let temp_path = self.config_dir.join(Self::unique_temp_name());
        let content = serde_json::to_string_pretty(settings)?;

        // Write to temp file first (atomic write pattern)
        fs::write(&temp_path, &content).map_err(|e| {
            if e.kind() == ErrorKind::PermissionDenied {
                Error::PermissionDenied(temp_path.display().to_string())
            } else {
                Error::Io(e)
            }
        })?;

        // Rename temp file to actual file (atomic on most filesystems)
        fs::rename(&temp_path, &path).map_err(|e| {
            // Clean up temp file on failure (ignore result)
            drop(fs::remove_file(&temp_path));
            if e.kind() == ErrorKind::PermissionDenied {
                Error::PermissionDenied(path.display().to_string())
            } else {
                Error::Io(e)
            }
        })?;

        // Update in-memory settings
        let mut guard = self.settings.write();
        *guard = settings.clone();

        tracing::debug!("Saved settings to {}", path.display());
        Ok(())
    }

    /// Get the current settings (from memory).
    #[must_use]
    pub fn get(&self) -> Settings {
        self.settings.read().clone()
    }

    /// Update settings in memory and save to disk.
    ///
    /// # Errors
    ///
    /// Returns an error if the settings cannot be saved.
    pub fn update(&self, settings: &Settings) -> Result<()> {
        self.save(settings)
    }

    /// Add a project to the recent projects list.
    ///
    /// Moves the project to the front if already in the list.
    /// Limits the list to 10 entries.
    /// Normalizes the path to handle trailing slashes consistently.
    ///
    /// # Errors
    ///
    /// Returns an error if the settings cannot be saved.
    pub fn add_recent_project(&self, path: &Path) -> Result<()> {
        // Normalize path: canonicalize if it exists, otherwise just clean it
        let normalized = path
            .canonicalize()
            .unwrap_or_else(|_| Self::normalize_path(path));

        // Hold lock for the entire read-modify-write operation
        let settings = {
            let mut guard = self.settings.write();

            // Remove if already exists (we'll add to front)
            guard.recent_projects.retain(|p| p != &normalized);

            // Add to front
            guard.recent_projects.insert(0, normalized);

            // Limit to 10 entries
            guard.recent_projects.truncate(10);

            guard.clone()
        };

        self.save_without_memory_update(&settings)
    }

    /// Get the list of recent projects.
    #[must_use]
    pub fn recent_projects(&self) -> Vec<PathBuf> {
        self.settings.read().recent_projects.clone()
    }

    /// Clear the recent projects list.
    ///
    /// # Errors
    ///
    /// Returns an error if the settings cannot be saved.
    pub fn clear_recent_projects(&self) -> Result<()> {
        // Hold lock for the entire read-modify-write operation
        let settings = {
            let mut guard = self.settings.write();
            guard.recent_projects.clear();
            guard.clone()
        };

        self.save_without_memory_update(&settings)
    }

    /// Remove a project from the recent projects list.
    ///
    /// # Errors
    ///
    /// Returns an error if the settings cannot be saved.
    pub fn remove_recent_project(&self, path: &Path) -> Result<()> {
        let normalized = path
            .canonicalize()
            .unwrap_or_else(|_| Self::normalize_path(path));

        // Hold lock for the entire read-modify-write operation
        let settings = {
            let mut guard = self.settings.write();
            guard.recent_projects.retain(|p| p != &normalized);
            guard.clone()
        };

        self.save_without_memory_update(&settings)
    }

    /// Normalize a path by removing trailing slashes and redundant components.
    fn normalize_path(path: &Path) -> PathBuf {
        let mut normalized = PathBuf::new();
        for component in path.components() {
            normalized.push(component);
        }
        normalized
    }

    /// Generate a unique temp filename for atomic writes.
    fn unique_temp_name() -> String {
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(0);

        // Use atomic counter to guarantee uniqueness across threads
        let count = COUNTER.fetch_add(1, Ordering::Relaxed);
        format!("settings.json.{}.{}.tmp", process::id(), count)
    }

    /// Save settings to disk without updating in-memory state.
    /// Used when the caller already holds the lock.
    fn save_without_memory_update(&self, settings: &Settings) -> Result<()> {
        // Ensure config directory exists
        if !self.config_dir.exists() {
            fs::create_dir_all(&self.config_dir).map_err(|e| {
                Error::Config(format!(
                    "Failed to create config directory {}: {}",
                    self.config_dir.display(),
                    e
                ))
            })?;
        }

        let path = self.config_path();
        let temp_path = self.config_dir.join(Self::unique_temp_name());
        let content = serde_json::to_string_pretty(settings)?;

        // Write to temp file first (atomic write pattern)
        fs::write(&temp_path, &content).map_err(|e| {
            if e.kind() == ErrorKind::PermissionDenied {
                Error::PermissionDenied(temp_path.display().to_string())
            } else {
                Error::Io(e)
            }
        })?;

        // Rename temp file to actual file (atomic on most filesystems)
        fs::rename(&temp_path, &path).map_err(|e| {
            // Clean up temp file on failure (ignore result)
            drop(fs::remove_file(&temp_path));
            if e.kind() == ErrorKind::PermissionDenied {
                Error::PermissionDenied(path.display().to_string())
            } else {
                Error::Io(e)
            }
        })?;

        tracing::debug!("Saved settings to {}", path.display());
        Ok(())
    }
}

impl Default for SettingsManager {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================
// Default Value Functions
// ============================================

fn default_font_family() -> String {
    String::from("JetBrains Mono")
}

const fn default_font_size() -> u32 {
    14
}

const fn default_tab_size() -> u32 {
    2
}

const fn default_true() -> bool {
    true
}

fn default_theme() -> String {
    String::from("dark")
}

const fn default_window_width() -> u32 {
    1280
}

const fn default_window_height() -> u32 {
    800
}

// ============================================
// Tests
// ============================================

#[cfg(test)]
#[expect(
    clippy::expect_used,
    clippy::indexing_slicing,
    clippy::let_underscore_must_use,
    clippy::default_numeric_fallback,
    clippy::uninlined_format_args,
    reason = "these patterns are acceptable in test code"
)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn create_test_manager() -> (SettingsManager, TempDir) {
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let manager = SettingsManager::with_config_dir(temp_dir.path().to_path_buf());
        (manager, temp_dir)
    }

    #[test]
    fn test_default_settings() {
        let settings = Settings::default();
        assert_eq!(settings.editor.font_size, 14);
        assert_eq!(settings.editor.font_family, "JetBrains Mono");
        assert_eq!(settings.editor.tab_size, 2);
        assert!(settings.editor.insert_spaces);
        assert!(!settings.editor.word_wrap);
        assert!(settings.editor.line_numbers);
        assert!(!settings.editor.minimap);
        assert!(!settings.editor.vim_mode);
        assert_eq!(settings.theme.theme, "dark");
        assert!(settings.theme.accent_color.is_none());
        assert!(settings.ai.enabled);
        assert!(settings.ai.inline_suggestions);
    }

    #[test]
    fn test_load_nonexistent() {
        let (manager, _temp) = create_test_manager();
        let settings = manager.load().expect("Should return defaults");
        assert_eq!(settings.editor.font_size, 14);
    }

    #[test]
    fn test_save_and_load() {
        let (manager, _temp) = create_test_manager();

        let mut settings = Settings::default();
        settings.editor.font_size = 18;
        settings.editor.vim_mode = true;
        settings.theme.theme = String::from("light");

        manager.save(&settings).expect("Failed to save");

        // Create new manager to force reload from disk
        let manager2 = SettingsManager::with_config_dir(manager.config_dir().clone());
        let loaded = manager2.load().expect("Failed to load");

        assert_eq!(loaded.editor.font_size, 18);
        assert!(loaded.editor.vim_mode);
        assert_eq!(loaded.theme.theme, "light");
    }

    #[test]
    fn test_recent_projects() {
        let (manager, _temp) = create_test_manager();
        let _ = manager.load();

        manager
            .add_recent_project(Path::new("/project1"))
            .expect("Failed to add project");
        manager
            .add_recent_project(Path::new("/project2"))
            .expect("Failed to add project");
        manager
            .add_recent_project(Path::new("/project1"))
            .expect("Failed to add project again");

        let recent = manager.recent_projects();
        assert_eq!(recent.len(), 2);
        // project1 should be first since it was added last
        assert_eq!(recent[0], PathBuf::from("/project1"));
        assert_eq!(recent[1], PathBuf::from("/project2"));
    }

    #[test]
    fn test_recent_projects_limit() {
        let (manager, _temp) = create_test_manager();
        let _ = manager.load();

        // Add 15 projects
        for i in 0..15 {
            let path = format!("/project{}", i);
            manager
                .add_recent_project(Path::new(&path))
                .expect("Failed to add project");
        }

        let recent = manager.recent_projects();
        assert_eq!(recent.len(), 10); // Should be capped at 10
        assert_eq!(recent[0], PathBuf::from("/project14")); // Most recent
    }

    #[test]
    fn test_invalid_json_returns_defaults() {
        let (manager, _temp) = create_test_manager();

        // Create config directory
        fs::create_dir_all(manager.config_dir()).expect("Failed to create dir");

        // Write invalid JSON
        fs::write(manager.config_path(), "{ invalid json }").expect("Failed to write");

        // Should return defaults without error
        let settings = manager
            .load()
            .expect("Should return defaults on invalid JSON");
        assert_eq!(settings.editor.font_size, 14);
    }

    #[test]
    fn test_partial_json_uses_defaults() {
        let (manager, _temp) = create_test_manager();

        fs::create_dir_all(manager.config_dir()).expect("Failed to create dir");

        // Write partial settings (missing many fields)
        fs::write(manager.config_path(), r#"{"editor": {"fontSize": 20}}"#)
            .expect("Failed to write");

        let settings = manager.load().expect("Failed to load");
        assert_eq!(settings.editor.font_size, 20); // From file
        assert_eq!(settings.editor.tab_size, 2); // Default
        assert!(settings.editor.line_numbers); // Default
    }

    #[test]
    fn test_serialization_roundtrip() {
        let settings = Settings {
            editor: EditorSettings {
                font_family: String::from("Fira Code"),
                font_size: 16,
                tab_size: 4,
                insert_spaces: false,
                word_wrap: true,
                line_numbers: false,
                minimap: true,
                vim_mode: true,
            },
            theme: ThemeSettings {
                theme: String::from("nord"),
                accent_color: Some(String::from("#88c0d0")),
            },
            ai: AISettings {
                enabled: false,
                inline_suggestions: false,
            },
            window_state: WindowState {
                width: 1920,
                height: 1080,
                x: Some(100),
                y: Some(50),
                maximized: true,
            },
            recent_projects: vec![
                PathBuf::from("/home/user/project1"),
                PathBuf::from("/home/user/project2"),
            ],
        };

        let json = serde_json::to_string_pretty(&settings).expect("Failed to serialize");
        let deserialized: Settings = serde_json::from_str(&json).expect("Failed to deserialize");

        assert_eq!(deserialized.editor.font_family, "Fira Code");
        assert_eq!(deserialized.editor.font_size, 16);
        assert!(deserialized.editor.vim_mode);
        assert_eq!(
            deserialized.theme.accent_color,
            Some(String::from("#88c0d0"))
        );
        assert!(!deserialized.ai.enabled);
        assert_eq!(deserialized.window_state.width, 1920);
        assert!(deserialized.window_state.maximized);
        assert_eq!(deserialized.recent_projects.len(), 2);
    }

    // ========================================
    // Edge Case Tests
    // ========================================

    #[test]
    fn test_empty_file_returns_defaults() {
        let (manager, _temp) = create_test_manager();

        fs::create_dir_all(manager.config_dir()).expect("Failed to create dir");

        // Write empty file
        fs::write(manager.config_path(), "").expect("Failed to write");

        // Should return defaults (empty string is invalid JSON)
        let settings = manager.load().expect("Should return defaults");
        assert_eq!(settings.editor.font_size, 14);
    }

    #[test]
    fn test_empty_json_object_uses_defaults() {
        let (manager, _temp) = create_test_manager();

        fs::create_dir_all(manager.config_dir()).expect("Failed to create dir");

        // Write empty JSON object
        fs::write(manager.config_path(), "{}").expect("Failed to write");

        let settings = manager.load().expect("Failed to load");
        assert_eq!(settings.editor.font_size, 14);
        assert_eq!(settings.editor.tab_size, 2);
        assert_eq!(settings.theme.theme, "dark");
    }

    #[test]
    fn test_validation_clamps_extreme_values() {
        let settings = Settings {
            editor: EditorSettings {
                font_size: 0,  // Too small
                tab_size: 100, // Too large
                ..Default::default()
            },
            window_state: WindowState {
                width: 10,  // Too small
                height: 50, // Too small
                ..Default::default()
            },
            ..Default::default()
        };

        let validated = settings.validated();
        assert_eq!(validated.editor.font_size, 6); // Clamped to minimum
        assert_eq!(validated.editor.tab_size, 8); // Clamped to maximum
        assert_eq!(validated.window_state.width, 400); // Clamped to minimum
        assert_eq!(validated.window_state.height, 300); // Clamped to minimum
    }

    #[test]
    fn test_validation_preserves_valid_values() {
        let settings = Settings {
            editor: EditorSettings {
                font_size: 16,
                tab_size: 4,
                ..Default::default()
            },
            window_state: WindowState {
                width: 1920,
                height: 1080,
                ..Default::default()
            },
            ..Default::default()
        };

        let validated = settings.validated();
        assert_eq!(validated.editor.font_size, 16);
        assert_eq!(validated.editor.tab_size, 4);
        assert_eq!(validated.window_state.width, 1920);
        assert_eq!(validated.window_state.height, 1080);
    }

    #[test]
    fn test_extreme_values_loaded_are_validated() {
        let (manager, _temp) = create_test_manager();

        fs::create_dir_all(manager.config_dir()).expect("Failed to create dir");

        // Write settings with extreme values
        fs::write(
            manager.config_path(),
            r#"{"editor": {"fontSize": 0, "tabSize": 999}, "windowState": {"width": 1, "height": 1}}"#,
        )
        .expect("Failed to write");

        let settings = manager.load().expect("Failed to load");
        assert_eq!(settings.editor.font_size, 6); // Clamped
        assert_eq!(settings.editor.tab_size, 8); // Clamped
        assert_eq!(settings.window_state.width, 400); // Clamped
        assert_eq!(settings.window_state.height, 300); // Clamped
    }

    #[test]
    fn test_extra_fields_are_ignored() {
        let (manager, _temp) = create_test_manager();

        fs::create_dir_all(manager.config_dir()).expect("Failed to create dir");

        // Write settings with extra unknown fields
        fs::write(
            manager.config_path(),
            r#"{"editor": {"fontSize": 16, "unknownField": "value"}, "futureSection": {"data": 123}}"#,
        )
        .expect("Failed to write");

        let settings = manager.load().expect("Failed to load");
        assert_eq!(settings.editor.font_size, 16);
        // Should not error on unknown fields
    }

    #[test]
    fn test_unicode_in_settings() {
        let (manager, _temp) = create_test_manager();

        let mut settings = Settings::default();
        settings.editor.font_family = String::from("Noto Sans CJK \u{65e5}\u{672c}\u{8a9e}");
        settings.theme.theme = String::from("\u{1f31f} Starlight");

        manager.save(&settings).expect("Failed to save");

        let manager2 = SettingsManager::with_config_dir(manager.config_dir().clone());
        let loaded = manager2.load().expect("Failed to load");

        assert_eq!(
            loaded.editor.font_family,
            "Noto Sans CJK \u{65e5}\u{672c}\u{8a9e}"
        );
        assert_eq!(loaded.theme.theme, "\u{1f31f} Starlight");
    }

    #[test]
    fn test_path_normalization_trailing_slash() {
        let (manager, _temp) = create_test_manager();
        let _ = manager.load();

        // Add path without trailing slash
        manager
            .add_recent_project(Path::new("/project"))
            .expect("Failed to add");

        // Adding with trailing slash should be normalized
        // Note: normalize_path removes trailing slashes via components()
        manager
            .add_recent_project(Path::new("/project/"))
            .expect("Failed to add");

        let recent = manager.recent_projects();
        // Should have only 1 project (normalized)
        assert_eq!(recent.len(), 1);
    }

    #[test]
    fn test_remove_recent_project() {
        let (manager, _temp) = create_test_manager();
        let _ = manager.load();

        manager
            .add_recent_project(Path::new("/project1"))
            .expect("Failed to add");
        manager
            .add_recent_project(Path::new("/project2"))
            .expect("Failed to add");
        manager
            .add_recent_project(Path::new("/project3"))
            .expect("Failed to add");

        assert_eq!(manager.recent_projects().len(), 3);

        manager
            .remove_recent_project(Path::new("/project2"))
            .expect("Failed to remove");

        let recent = manager.recent_projects();
        assert_eq!(recent.len(), 2);
        assert!(!recent.contains(&PathBuf::from("/project2")));
    }

    #[test]
    fn test_concurrent_save_load() {
        use std::sync::{Arc, Barrier};
        use std::thread;

        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let config_dir = temp_dir.path().to_path_buf();

        // Create config directory BEFORE creating manager
        fs::create_dir_all(&config_dir).expect("Failed to create dir");

        let manager = Arc::new(SettingsManager::with_config_dir(config_dir));
        let _ = manager.load();

        // Use a barrier to ensure all threads start together
        let barrier = Arc::new(Barrier::new(10));

        let handles: Vec<_> = (0..10)
            .map(|i| {
                let mgr = Arc::clone(&manager);
                let bar = Arc::clone(&barrier);
                thread::spawn(move || {
                    let _ = bar.wait(); // Sync all threads
                    let path = format!("/project{}", i);
                    mgr.add_recent_project(Path::new(&path))
                        .expect("Failed to add");
                })
            })
            .collect();

        for handle in handles {
            handle.join().expect("Thread panicked");
        }

        let recent = manager.recent_projects();
        assert_eq!(recent.len(), 10);

        // temp_dir lives until end of function
    }

    #[test]
    fn test_null_values_in_json() {
        let (manager, _temp) = create_test_manager();

        fs::create_dir_all(manager.config_dir()).expect("Failed to create dir");

        // Write JSON with null values
        fs::write(
            manager.config_path(),
            r#"{"editor": {"fontSize": null}, "theme": {"accentColor": null}}"#,
        )
        .expect("Failed to write");

        // This will fail parsing since fontSize expects u32, not null
        // Should fall back to defaults
        let settings = manager.load().expect("Should return defaults");
        assert_eq!(settings.editor.font_size, 14); // Default
    }

    #[test]
    fn test_negative_values() {
        let (manager, _temp) = create_test_manager();

        fs::create_dir_all(manager.config_dir()).expect("Failed to create dir");

        // Write JSON with negative values (u32 can't be negative)
        fs::write(manager.config_path(), r#"{"editor": {"fontSize": -5}}"#)
            .expect("Failed to write");

        // Negative for u32 should fail parsing
        let settings = manager.load().expect("Should return defaults");
        assert_eq!(settings.editor.font_size, 14); // Default
    }

    #[test]
    fn test_large_recent_projects_list() {
        let (manager, _temp) = create_test_manager();

        fs::create_dir_all(manager.config_dir()).expect("Failed to create dir");

        // Write settings with 100 recent projects
        let projects: Vec<String> = (0..100).map(|i| format!("\"/project{}\"", i)).collect();
        let json = format!(r#"{{"recentProjects": [{}]}}"#, projects.join(","));

        fs::write(manager.config_path(), json).expect("Failed to write");

        let settings = manager.load().expect("Failed to load");
        // Should be truncated to 10 by validation
        assert_eq!(settings.recent_projects.len(), 10);
    }
}
