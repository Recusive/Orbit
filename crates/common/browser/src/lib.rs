//! Browser window management for Orbit.
//!
//! This crate handles window detection and positioning for browsers
//! spawned by Playwright MCP. It does NOT spawn browsers itself -
//! Playwright MCP handles browser lifecycle.
//!
//! # Usage
//!
//! ```ignore
//! let manager = BrowserManager::new();
//!
//! // After Playwright MCP spawns a browser, detect it
//! let info = manager.detect_browser()?;
//!
//! // Position the window over our panel
//! manager.set_bounds(100, 100, 800, 600)?;
//! ```

mod manager;
pub mod platform;

pub use manager::{BrowserInfo, BrowserManager};
pub use platform::WindowBounds;

use std::result::Result as StdResult;

use thiserror::Error;

/// Browser errors.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum BrowserError {
    /// Browser window not found.
    #[error("Browser not found: {0}")]
    InstanceNotFound(String),

    /// Window positioning failed.
    #[error("Positioning failed: {0}")]
    PositioningFailed(String),
}

/// Result type for browser operations.
pub type Result<T> = StdResult<T, BrowserError>;
