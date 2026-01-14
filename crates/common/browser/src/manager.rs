//! Browser window management for Playwright-spawned browsers.
//!
//! This module handles window detection and positioning for browsers
//! spawned by Playwright MCP. It does NOT spawn browsers itself.

use crate::{platform, BrowserError, Result};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

/// Browser instance info.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct BrowserInfo {
    /// Process ID of the browser window.
    pub pid: u32,
    /// Whether the browser is currently active.
    pub active: bool,
}

/// Manages browser window positioning.
///
/// This manager tracks Playwright-spawned browser windows and provides
/// APIs to position them over the Orbit browser panel.
#[derive(Debug, Default)]
pub struct BrowserManager {
    /// Currently tracked browser PID.
    current_pid: RwLock<Option<u32>>,
}

impl BrowserManager {
    /// Create a new browser manager.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Find and track the Playwright browser window.
    ///
    /// Searches for a browser window spawned by Playwright MCP.
    /// Call this after triggering a Playwright tool to detect the window.
    pub fn detect_browser(&self) -> Result<BrowserInfo> {
        let pid = platform::find_playwright_window()
            .ok_or_else(|| BrowserError::InstanceNotFound("Playwright browser not found".into()))?;

        *self.current_pid.write() = Some(pid);

        log::info!("Detected Playwright browser with PID {pid}");

        Ok(BrowserInfo { pid, active: true })
    }

    /// Check if a browser is currently being tracked.
    #[must_use]
    pub fn has_browser(&self) -> bool {
        self.current_pid.read().is_some()
    }

    /// Get the currently tracked browser PID.
    #[must_use]
    pub fn get_pid(&self) -> Option<u32> {
        *self.current_pid.read()
    }

    /// Set the position and size of the browser window.
    ///
    /// Coordinates should be absolute screen coordinates.
    pub fn set_bounds(&self, x: i32, y: i32, width: u32, height: u32) -> Result<()> {
        let pid = self
            .current_pid
            .read()
            .ok_or_else(|| BrowserError::InstanceNotFound("No browser tracked".into()))?;

        let bounds = platform::WindowBounds {
            x,
            y,
            width,
            height,
        };

        platform::set_window_bounds(pid, bounds)
    }

    /// Stop tracking the browser.
    ///
    /// This doesn't close the browser - Playwright MCP handles that.
    pub fn clear(&self) {
        *self.current_pid.write() = None;
        log::info!("Cleared browser tracking");
    }
}
