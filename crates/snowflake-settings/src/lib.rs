//! Snowflake Settings - User configuration management
//!
//! This crate handles loading, saving, and managing user settings
//! for the Snowflake editor.

use std::path::Path;

use serde::{Deserialize, Serialize};
use snowflake_core::Result;

/// Editor settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorSettings {
    /// Font size in pixels
    #[serde(default = "default_font_size")]
    pub font_size: u32,
    /// Font family
    #[serde(default = "default_font_family")]
    pub font_family: String,
    /// Tab size in spaces
    #[serde(default = "default_tab_size")]
    pub tab_size: u32,
    /// Use spaces instead of tabs
    #[serde(default = "default_use_spaces")]
    pub use_spaces: bool,
    /// Show line numbers
    #[serde(default = "default_true")]
    pub line_numbers: bool,
    /// Word wrap mode
    #[serde(default)]
    pub word_wrap: WordWrap,
    /// Minimap enabled
    #[serde(default)]
    pub minimap: bool,
}

impl Default for EditorSettings {
    fn default() -> Self {
        Self {
            font_size: default_font_size(),
            font_family: default_font_family(),
            tab_size: default_tab_size(),
            use_spaces: default_use_spaces(),
            line_numbers: true,
            word_wrap: WordWrap::default(),
            minimap: false,
        }
    }
}

/// Word wrap modes
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[non_exhaustive]
pub enum WordWrap {
    /// No word wrap
    #[default]
    Off,
    /// Wrap at viewport width
    On,
    /// Wrap at specific column
    Column,
}

/// Theme settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeSettings {
    /// Color scheme (dark/light)
    #[serde(default = "default_color_scheme")]
    pub color_scheme: ColorScheme,
    /// UI theme name
    #[serde(default = "default_ui_theme")]
    pub ui_theme: String,
    /// Editor syntax theme
    #[serde(default = "default_syntax_theme")]
    pub syntax_theme: String,
}

impl Default for ThemeSettings {
    fn default() -> Self {
        Self {
            color_scheme: ColorScheme::default(),
            ui_theme: default_ui_theme(),
            syntax_theme: default_syntax_theme(),
        }
    }
}

/// Color scheme
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[non_exhaustive]
pub enum ColorScheme {
    /// Light mode
    Light,
    /// Dark mode
    #[default]
    Dark,
    /// Follow system preference
    System,
}

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
}

/// Load settings from disk
///
/// # Errors
///
/// Returns an error if the settings file cannot be read or parsed
pub fn load_settings(_path: &Path) -> Result<Settings> {
    // TODO: Implement settings loading
    Ok(Settings::default())
}

/// Save settings to disk
///
/// # Errors
///
/// Returns an error if the settings cannot be written
pub fn save_settings(_path: &Path, _settings: &Settings) -> Result<()> {
    // TODO: Implement settings saving
    Ok(())
}

// Default value functions
const fn default_font_size() -> u32 {
    13
}
fn default_font_family() -> String {
    String::from("Menlo, Monaco, 'Courier New', monospace")
}
const fn default_tab_size() -> u32 {
    4
}
const fn default_use_spaces() -> bool {
    true
}
const fn default_true() -> bool {
    true
}
const fn default_color_scheme() -> ColorScheme {
    ColorScheme::Dark
}
fn default_ui_theme() -> String {
    String::from("snowflake-dark")
}
fn default_syntax_theme() -> String {
    String::from("snowflake-dark")
}
