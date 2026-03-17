//! Tauri command modules

pub mod agent;
pub mod browser;
pub mod canvas;
pub mod common;
pub mod editor;
/// OpenCode lifecycle commands.
pub mod opencode;
pub mod vault;

// Re-export for backwards compatibility
pub use agent::*;
pub use browser::*;
pub use common::*;
