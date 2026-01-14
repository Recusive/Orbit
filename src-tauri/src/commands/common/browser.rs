//! Embedded browser commands using Tauri webviews.
//!
//! These commands manage an embedded browser webview within the Orbit window.
//! The webview is truly embedded (not a separate app), uses WebKit on macOS,
//! and can be positioned/resized dynamically.
//!
//! # Feature Flag
//!
//! This module requires the Tauri `unstable` feature for `WebviewBuilder`.
//! The feature does NOT affect code safety - only API stability guarantees.
//!
//! # Windows Note
//!
//! All webview creation must be async to avoid deadlocks on Windows.
//! See: https://docs.rs/tauri/latest/tauri/webview/struct.WebviewBuilder.html

#![allow(
    clippy::needless_pass_by_value,
    clippy::unreachable,
    clippy::let_underscore_must_use,
    clippy::too_many_arguments,
    reason = "Tauri's #[tauri::command] macro generates code that triggers false positives"
)]

use std::result::Result as StdResult;
use std::sync::Arc;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::webview::WebviewBuilder;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager as _, State, WebviewUrl};

type Result<T> = StdResult<T, String>;

/// Information about the embedded browser.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserInfo {
    /// The webview label (unique identifier).
    pub label: String,
    /// Current URL.
    pub url: String,
    /// Whether the browser is active.
    pub active: bool,
}

/// State for managing the embedded browser webview.
#[derive(Debug, Default)]
pub struct EmbeddedBrowserState {
    /// The current browser webview label (if any).
    current_label: Mutex<Option<String>>,
}

impl EmbeddedBrowserState {
    /// Create a new browser state.
    pub fn new() -> Self {
        Self {
            current_label: Mutex::new(None),
        }
    }
}

/// Create an embedded browser webview.
///
/// The webview is created within the main window at the specified position.
/// This command MUST be async to avoid deadlocks on Windows.
#[tauri::command]
pub async fn browser_create(
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    url: Option<String>,
    app: AppHandle,
    state: State<'_, Arc<EmbeddedBrowserState>>,
) -> Result<BrowserInfo> {
    let label = "embedded-browser";
    let initial_url = url.unwrap_or_else(|| "https://example.com".to_owned());

    // If browser already exists, close it first (handles stale state after frontend reset)
    {
        let mut current = state.current_label.lock();
        if let Some(existing_label) = current.take() {
            if let Some(webview) = app.get_webview(&existing_label) {
                log::info!("Closing existing browser before creating new one");
                let _ = webview.close(); // Ignore errors - webview might already be gone
            }
        }
    }

    // Get the Window by label - in Tauri 2 with unstable feature,
    // windows are registered separately from webviews
    let main_window = app.get_window("main").ok_or("Main window not found")?;

    // Create the webview URL
    let webview_url = WebviewUrl::External(
        initial_url
            .parse()
            .map_err(|e| format!("Invalid URL: {e}"))?,
    );

    // Build the webview with auto_resize for proper layout handling
    let webview_builder = WebviewBuilder::new(label, webview_url).auto_resize();

    // Create webview at correct position and size
    let position = LogicalPosition::new(x, y);
    let size = LogicalSize::new(width, height);

    let _webview = main_window
        .add_child(webview_builder, position, size)
        .map_err(|e| format!("Failed to create browser webview: {e}"))?;

    // Store the label
    *state.current_label.lock() = Some(label.to_owned());

    log::info!("Created embedded browser at ({x}, {y}) size ({width}x{height})");

    Ok(BrowserInfo {
        label: label.to_owned(),
        url: initial_url,
        active: true,
    })
}

/// Navigate the embedded browser to a URL.
#[tauri::command]
pub async fn browser_navigate(
    url: String,
    app: AppHandle,
    state: State<'_, Arc<EmbeddedBrowserState>>,
) -> Result<()> {
    let label = state
        .current_label
        .lock()
        .clone()
        .ok_or("No browser exists")?;

    let webview = app.get_webview(&label).ok_or("Browser webview not found")?;

    let parsed_url = url.parse().map_err(|e| format!("Invalid URL: {e}"))?;

    webview
        .navigate(parsed_url)
        .map_err(|e| format!("Navigation failed: {e}"))?;

    log::debug!("Navigated browser to: {url}");

    Ok(())
}

/// Resize/reposition the embedded browser.
#[tauri::command]
pub async fn browser_set_bounds(
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    app: AppHandle,
    state: State<'_, Arc<EmbeddedBrowserState>>,
) -> Result<()> {
    let label = state
        .current_label
        .lock()
        .clone()
        .ok_or("No browser exists")?;

    let webview = app.get_webview(&label).ok_or("Browser webview not found")?;

    // Set position
    webview
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| format!("Failed to set position: {e}"))?;

    // Set size
    webview
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| format!("Failed to set size: {e}"))?;

    Ok(())
}

/// Close the embedded browser.
#[tauri::command]
pub async fn browser_close(
    app: AppHandle,
    state: State<'_, Arc<EmbeddedBrowserState>>,
) -> Result<()> {
    let label = state
        .current_label
        .lock()
        .take()
        .ok_or("No browser exists")?;

    if let Some(webview) = app.get_webview(&label) {
        webview
            .close()
            .map_err(|e| format!("Failed to close browser: {e}"))?;
        log::info!("Closed embedded browser");
    }

    Ok(())
}

/// Check if an embedded browser exists.
#[tauri::command]
pub fn browser_has(app: AppHandle, state: State<'_, Arc<EmbeddedBrowserState>>) -> bool {
    state
        .current_label
        .lock()
        .as_ref()
        .is_some_and(|label| app.get_webview(label).is_some())
}

/// Get information about the embedded browser.
#[tauri::command]
pub async fn browser_info(
    app: AppHandle,
    state: State<'_, Arc<EmbeddedBrowserState>>,
) -> Result<Option<BrowserInfo>> {
    // Clone label outside match to avoid holding lock during match body
    let label_opt = state.current_label.lock().clone();
    let Some(label) = label_opt else {
        return Ok(None);
    };

    let Some(webview) = app.get_webview(&label) else {
        // Clean up stale label
        *state.current_label.lock() = None;
        return Ok(None);
    };

    let url = webview
        .url()
        .map_or_else(|_| "unknown".to_owned(), |u| u.to_string());

    Ok(Some(BrowserInfo {
        label,
        url,
        active: true,
    }))
}

/// Execute JavaScript in the embedded browser.
#[tauri::command]
pub async fn browser_eval(
    script: String,
    app: AppHandle,
    state: State<'_, Arc<EmbeddedBrowserState>>,
) -> Result<()> {
    let label = state
        .current_label
        .lock()
        .clone()
        .ok_or("No browser exists")?;

    let webview = app.get_webview(&label).ok_or("Browser webview not found")?;

    webview
        .eval(&script)
        .map_err(|e| format!("JavaScript execution failed: {e}"))?;

    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// Legacy commands (deprecated - kept for backward compatibility)
// ═══════════════════════════════════════════════════════════════

/// Legacy: Detect browser (no longer supported).
#[tauri::command]
pub fn browser_detect() -> Result<BrowserInfo> {
    Err(
        "External browser detection is no longer supported. Use browser_create for embedded browser."
            .to_owned(),
    )
}

/// Legacy: Get PID (no longer supported).
#[tauri::command]
pub fn browser_get_pid() -> Option<u32> {
    None
}

/// Legacy: Clear browser tracking (now closes the embedded browser).
#[tauri::command]
pub async fn browser_clear(
    app: AppHandle,
    state: State<'_, Arc<EmbeddedBrowserState>>,
) -> Result<()> {
    browser_close(app, state).await
}
