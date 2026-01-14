//! Platform-specific browser window operations.
//!
//! This module provides native APIs for:
//! - Finding Playwright-spawned browser windows
//! - Positioning browser windows over the Orbit panel

#[cfg(target_os = "macos")]
mod macos;

use crate::Result;

/// Window bounds (position and size).
#[derive(Debug, Clone, Copy)]
pub struct WindowBounds {
    /// X coordinate (screen position).
    pub x: i32,
    /// Y coordinate (screen position).
    pub y: i32,
    /// Window width in pixels.
    pub width: u32,
    /// Window height in pixels.
    pub height: u32,
}

/// Find a browser window spawned by Playwright MCP.
///
/// Searches for windows belonging to Playwright's browser processes.
/// Returns the process ID if found.
///
/// # Platform Support
/// - **macOS**: Uses AppleScript to find Playwright/WebKit windows
/// - **Other**: Returns None (not implemented)
pub fn find_playwright_window() -> Option<u32> {
    #[cfg(target_os = "macos")]
    {
        macos::find_playwright_window()
    }

    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

/// Set the position and size of a window by process ID.
///
/// # Platform Support
/// - **macOS**: Uses AppleScript via System Events
/// - **Other**: Returns error (not implemented)
pub fn set_window_bounds(pid: u32, bounds: WindowBounds) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        macos::set_window_bounds(pid, bounds)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (pid, bounds);
        Err(crate::BrowserError::PositioningFailed(
            "Window positioning not supported on this platform".to_string(),
        ))
    }
}
