//! Embedded browser commands using Tauri child window.
//!
//! These commands manage an embedded browser within the Orbit window.
//! On macOS, the browser is implemented as a **child window** (not a child webview),
//! which gives it an independent Web Inspector that can be docked.
//!
//! # Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────┐
//! │ Tauri Main Window (parent)                  │
//! │ └── Main Webview (app UI)                   │
//! └─────────────────────────────────────────────┘
//!                    │ parent relationship
//!                    ▼
//! ┌─────────────────────────────────────────────┐
//! │ Tauri Child Window (borderless)             │
//! │ └── Browser Webview (external sites)        │
//! │     └── Own Inspector (independent!)        │
//! └─────────────────────────────────────────────┘
//! ```
//!
//! Child windows move with the parent, minimize together, and appear as a
//! single app - visually indistinguishable from an embedded panel.
//!
//! # Why Child Window Instead of Child Webview?
//!
//! On macOS, WebKit shares ONE `_WKInspector` per NSWindow. A child webview
//! (created with `add_child()`) shares the inspector with the main webview,
//! causing DevTools to hijack the entire app. A child **window** has its own
//! NSWindow and thus its own independent inspector.
//!
//! Errors are captured to Sentry for monitoring embedded browser issues.

// These lints are triggered by Tauri's #[tauri::command] macro, not our code.
// Using `expect` instead of `allow` so we're notified if Tauri fixes these.
#![expect(
    clippy::needless_pass_by_value,
    reason = "Tauri commands take params by value"
)]
#![expect(
    clippy::too_many_arguments,
    reason = "Tauri commands need all their params"
)]
#![expect(
    clippy::unreachable,
    reason = "Tauri macro generates unreachable patterns"
)]
#![expect(
    clippy::let_underscore_must_use,
    reason = "We intentionally ignore some Results"
)]

use std::result::Result as StdResult;
use std::sync::Arc;
use std::time::Duration;

use hashbrown::HashMap;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::webview::{PageLoadEvent, PageLoadPayload, WebviewWindowBuilder};
use tauri::{
    AppHandle, Emitter as _, LogicalPosition, LogicalSize, Manager as _, State, WebviewUrl,
};
use tokio::sync::oneshot;
use tokio::time::timeout;
use uuid::Uuid;

use crate::core::sentry_utils::SentryCapture as _;

type Result<T> = StdResult<T, String>;

/// Convert parent-relative logical coordinates to screen coordinates.
///
/// The DOM provides bounds in **logical** CSS pixels via `getBoundingClientRect()`.
/// Tauri's `outer_position()` returns **physical** pixels. On HiDPI displays,
/// these differ by the scale factor. This function:
/// 1. Gets the window's scale factor
/// 2. Converts the physical parent position to logical coordinates
/// 3. Adds the logical DOM bounds
///
/// Returns `(screen_x, screen_y)` in logical coordinates for use with `LogicalPosition`.
fn to_screen_coords(
    main_window: &tauri::WebviewWindow,
    relative_x: f64,
    relative_y: f64,
) -> Result<(f64, f64)> {
    // Get scale factor for physical-to-logical conversion
    let scale = main_window
        .scale_factor()
        .map_err(|e| format!("Failed to get scale factor: {e}"))?;

    // Get parent position in physical pixels
    let physical_pos = main_window
        .outer_position()
        .map_err(|e| format!("Failed to get parent position: {e}"))?;

    // Convert physical position to logical coordinates, then add the relative offset
    let logical_x = f64::from(physical_pos.x) / scale + relative_x;
    let logical_y = f64::from(physical_pos.y) / scale + relative_y;

    Ok((logical_x, logical_y))
}

/// Timeout for waiting on JavaScript evaluation results.
const JS_EVAL_TIMEOUT: Duration = Duration::from_secs(30);

/// The label for the browser window.
const BROWSER_WINDOW_LABEL: &str = "browser-window";

/// Information about the embedded browser.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserInfo {
    /// The browser label (unique identifier).
    pub label: String,
    /// Current URL.
    pub url: String,
    /// Whether the browser is active.
    pub active: bool,
}

/// Payload for browser navigation events.
#[derive(Debug, Clone, Serialize)]
pub struct BrowserNavigatedPayload {
    /// The URL that was navigated to.
    pub url: String,
}

/// Payload for browser loading events.
#[derive(Debug, Clone, Copy, Serialize)]
pub struct BrowserLoadingPayload {
    /// Whether the page is currently loading.
    pub is_loading: bool,
}

/// State for managing the browser child window.
#[derive(Debug, Default)]
pub struct BrowserWindowState {
    /// Whether the browser window exists.
    exists: Mutex<bool>,
    /// Last known bounds for restoring after hide.
    last_bounds: Mutex<Option<BrowserBounds>>,
}

impl BrowserWindowState {
    /// Create a new browser state.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
}

/// Last known bounds for the browser.
#[derive(Debug, Clone, Copy)]
struct BrowserBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

/// State for managing async JavaScript evaluation results.
#[derive(Debug, Default)]
pub struct BrowserResultState {
    /// Map of pending evaluation request IDs to their result senders.
    pending: Mutex<HashMap<String, oneshot::Sender<StdResult<String, String>>>>,
}

impl BrowserResultState {
    /// Create a new browser result state.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a new evaluation request and return the receiver.
    pub fn register(&self, id: String) -> oneshot::Receiver<StdResult<String, String>> {
        let (tx, rx) = oneshot::channel();
        let _ = self.pending.lock().insert(id, tx);
        rx
    }

    /// Complete an evaluation request with a successful result.
    pub fn complete_ok(&self, id: &str, result: String) {
        let maybe_tx = self.pending.lock().remove(id);
        if let Some(tx) = maybe_tx {
            let _ = tx.send(Ok(result));
        } else {
            log::warn!("Received result for unknown eval request: {id}");
        }
    }

    /// Complete an evaluation request with an error.
    pub fn complete_err(&self, id: &str, error: String) {
        let maybe_tx = self.pending.lock().remove(id);
        if let Some(tx) = maybe_tx {
            let _ = tx.send(Err(error));
        } else {
            log::warn!("Received error for unknown eval request: {id}");
        }
    }

    /// Cancel a pending evaluation request.
    pub fn cancel(&self, id: &str) {
        let _ = self.pending.lock().remove(id);
    }
}

/// Create an embedded browser as a child window.
///
/// On macOS, this creates a borderless child window that:
/// - Moves with the parent window
/// - Has its own independent Web Inspector
/// - Can be positioned within the parent's bounds
#[tauri::command]
#[expect(
    clippy::too_many_lines,
    reason = "window creation with many config options"
)]
pub async fn browser_create(
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    url: Option<String>,
    app: AppHandle,
    state: State<'_, Arc<BrowserWindowState>>,
    result_state: State<'_, Arc<BrowserResultState>>,
) -> Result<BrowserInfo> {
    let initial_url = url.unwrap_or_else(|| "https://example.com".to_owned());

    // Close existing browser window if any
    // Use a single lock scope to prevent race conditions between check and update
    {
        let mut exists = state.exists.lock();
        if *exists {
            if let Some(window) = app.get_webview_window(BROWSER_WINDOW_LABEL) {
                log::info!("Closing existing browser window before creating new one");
                let _ = window.close();
            }
            *exists = false;
        }
    }

    // Get the main webview window to use as parent
    let main_window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    // Convert parent-relative logical coordinates to screen coordinates
    // Handles HiDPI scaling: DOM bounds are logical, window position is physical
    let (screen_x, screen_y) = to_screen_coords(&main_window, x, y)?;

    log::debug!(
        "Browser position: relative=({x}, {y}), screen=({screen_x}, {screen_y}), scale={}",
        main_window.scale_factor().unwrap_or(1.0_f64)
    );

    // Parse the URL
    let webview_url = WebviewUrl::External(
        initial_url
            .parse()
            .map_err(|e| format!("Invalid URL: {e}"))?,
    );

    // Clone handles for callbacks
    let app_for_navigation = app.clone();
    let app_for_page_load = app.clone();
    let result_state_for_nav = Arc::clone(&result_state);

    // Build the browser as a child window
    // Using WebviewWindowBuilder creates a new window with its own webview
    let builder = WebviewWindowBuilder::new(&app, BROWSER_WINDOW_LABEL, webview_url)
        // Make it a child of the main window - on macOS this uses NSWindow.addChildWindow
        .parent(&main_window)
        .map_err(|e| format!("Failed to set parent: {e}"))?
        // Borderless so it looks embedded
        .decorations(false)
        // No shadow - we want it to look like part of the parent window
        .shadow(false)
        // Not resizable by user (we control size programmatically)
        .resizable(false)
        // Initial position and size (using screen coordinates)
        .inner_size(width, height)
        .position(screen_x, screen_y)
        // Don't show in taskbar/dock as separate window
        .skip_taskbar(true)
        // Initialization script to block DevTools shortcuts in the browser
        .initialization_script(include_str!("browser_init.js"))
        // Navigation handler for eval result interception
        .on_navigation(move |url: &tauri::Url| {
            let url_str = url.to_string();

            // Check for eval result URL pattern
            if url_str.starts_with("orbit-eval://result?") {
                if let Some(query) = url.query() {
                    let mut id = None;
                    let mut success = false;
                    let mut data = None;
                    let mut error = None;

                    for pair in query.split('&') {
                        if let Some((key, value)) = pair.split_once('=') {
                            match key {
                                "id" => id = Some(value.to_owned()),
                                "success" => success = value == "true",
                                "data" => {
                                    if let Ok(decoded) = urlencoding::decode(value) {
                                        data = Some(decoded.into_owned());
                                    }
                                }
                                "error" => {
                                    if let Ok(decoded) = urlencoding::decode(value) {
                                        error = Some(decoded.into_owned());
                                    }
                                }
                                _ => {}
                            }
                        }
                    }

                    if let Some(req_id) = id {
                        if success {
                            result_state_for_nav.complete_ok(&req_id, data.unwrap_or_else(|| "null".to_owned()));
                        } else {
                            result_state_for_nav.complete_err(&req_id, error.unwrap_or_else(|| "Unknown error".to_owned()));
                        }
                    } else {
                        log::warn!("Malformed eval result URL: missing 'id' parameter in query: {query}");
                    }
                } else {
                    log::warn!("Malformed eval result URL: no query string in {url_str}");
                }
                // Block the navigation - this was just a result callback
                return false;
            }

            // Emit navigation event for regular navigations
            let payload = BrowserNavigatedPayload { url: url_str };
            if let Err(e) = app_for_navigation.emit("browser:navigated", payload) {
                log::warn!("Failed to emit browser:navigated event: {e}");
            }
            true
        })
        // Page load handler
        .on_page_load(move |_webview: tauri::WebviewWindow, payload: PageLoadPayload<'_>| {
            let is_loading = matches!(payload.event(), PageLoadEvent::Started);
            let emit_payload = BrowserLoadingPayload { is_loading };
            if let Err(e) = app_for_page_load.emit("browser:loading", emit_payload) {
                log::warn!("Failed to emit browser:loading event: {e}");
            }
        });

    // Build the window
    let _window = builder
        .build()
        .map_err(|e| format!("Failed to create browser window: {e}"))?;

    // Update state
    *state.exists.lock() = true;
    *state.last_bounds.lock() = Some(BrowserBounds {
        x,
        y,
        width,
        height,
    });

    log::info!("Created browser child window at ({x}, {y}) size ({width}x{height})");

    Ok(BrowserInfo {
        label: BROWSER_WINDOW_LABEL.to_owned(),
        url: initial_url,
        active: true,
    })
}

/// Navigate the browser to a URL.
#[tauri::command]
pub async fn browser_navigate(
    url: String,
    app: AppHandle,
    state: State<'_, Arc<BrowserWindowState>>,
) -> Result<()> {
    browser_navigate_inner(&url, &app, &state).capture("browser_navigate")
}

fn browser_navigate_inner(
    url: &str,
    app: &AppHandle,
    state: &State<'_, Arc<BrowserWindowState>>,
) -> Result<()> {
    if !*state.exists.lock() {
        return Err("No browser exists".to_owned());
    }

    let window = app
        .get_webview_window(BROWSER_WINDOW_LABEL)
        .ok_or("Browser window not found")?;

    let parsed_url = url.parse().map_err(|e| format!("Invalid URL: {e}"))?;
    window
        .navigate(parsed_url)
        .map_err(|e| format!("Navigation failed: {e}"))?;

    log::debug!("Navigated browser to: {url}");
    Ok(())
}

/// Resize/reposition the browser window.
#[tauri::command]
pub async fn browser_set_bounds(
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    app: AppHandle,
    state: State<'_, Arc<BrowserWindowState>>,
) -> Result<()> {
    if !*state.exists.lock() {
        return Err("No browser exists".to_owned());
    }

    let window = app
        .get_webview_window(BROWSER_WINDOW_LABEL)
        .ok_or("Browser window not found")?;

    // Convert parent-relative logical coordinates to screen coordinates (HiDPI-aware)
    let main_window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;
    let (screen_x, screen_y) = to_screen_coords(&main_window, x, y)?;

    window
        .set_position(LogicalPosition::new(screen_x, screen_y))
        .map_err(|e| format!("Failed to set position: {e}"))?;
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| format!("Failed to set size: {e}"))?;

    // Store the parent-relative bounds (not screen coords) for later restore
    *state.last_bounds.lock() = Some(BrowserBounds {
        x,
        y,
        width,
        height,
    });
    Ok(())
}

/// Close the browser window.
#[tauri::command]
pub async fn browser_close(
    app: AppHandle,
    state: State<'_, Arc<BrowserWindowState>>,
) -> Result<()> {
    if !*state.exists.lock() {
        return Err("No browser exists".to_owned());
    }

    if let Some(window) = app.get_webview_window(BROWSER_WINDOW_LABEL) {
        window
            .close()
            .map_err(|e| format!("Failed to close browser: {e}"))?;
    }

    *state.exists.lock() = false;
    *state.last_bounds.lock() = None;
    log::info!("Closed browser window");
    Ok(())
}

/// Check if a browser exists.
#[tauri::command]
pub fn browser_has(state: State<'_, Arc<BrowserWindowState>>) -> bool {
    *state.exists.lock()
}

/// Get information about the browser.
#[tauri::command]
pub async fn browser_info(
    app: AppHandle,
    state: State<'_, Arc<BrowserWindowState>>,
) -> Result<Option<BrowserInfo>> {
    if !*state.exists.lock() {
        return Ok(None);
    }

    let Some(window) = app.get_webview_window(BROWSER_WINDOW_LABEL) else {
        *state.exists.lock() = false;
        return Ok(None);
    };

    let url = window
        .url()
        .map_or_else(|_| "unknown".to_owned(), |u| u.to_string());

    Ok(Some(BrowserInfo {
        label: BROWSER_WINDOW_LABEL.to_owned(),
        url,
        active: true,
    }))
}

/// Execute JavaScript in the browser and return the result.
#[tauri::command]
pub async fn browser_eval(
    script: String,
    app: AppHandle,
    state: State<'_, Arc<BrowserWindowState>>,
    result_state: State<'_, Arc<BrowserResultState>>,
) -> Result<String> {
    if !*state.exists.lock() {
        return Err("No browser exists".to_owned());
    }

    let window = app
        .get_webview_window(BROWSER_WINDOW_LABEL)
        .ok_or("Browser window not found")?;

    let eval_id = Uuid::new_v4().to_string();
    let result_rx = result_state.register(eval_id.clone());

    // Wrap script to capture result and send via navigation
    let wrapped_script = format!(
        "(async () => {{
            const __evalId = {eval_id_json};
            try {{
                const __result = await (async () => {{ {script} }})();
                const __json = JSON.stringify(__result ?? null);
                if (__json.length > 100000) {{
                    const __errorMsg = encodeURIComponent(`Result too large (${{__json.length}} chars, max 100000)`);
                    window.location.href = `orbit-eval://result?id=${{__evalId}}&success=false&error=${{__errorMsg}}`;
                    return;
                }}
                const __data = encodeURIComponent(__json);
                window.location.href = `orbit-eval://result?id=${{__evalId}}&success=true&data=${{__data}}`;
            }} catch (__error) {{
                const __errorMsg = encodeURIComponent(__error.message || String(__error));
                window.location.href = `orbit-eval://result?id=${{__evalId}}&success=false&error=${{__errorMsg}}`;
            }}
        }})();",
        eval_id_json = serde_json::to_string(&eval_id).unwrap_or_else(|_| format!("\"{eval_id}\"")),
        script = script
    );

    if let Err(e) = window.eval(&wrapped_script) {
        result_state.cancel(&eval_id);
        return Err(format!("JavaScript execution failed: {e}"));
    }

    match timeout(JS_EVAL_TIMEOUT, result_rx).await {
        Ok(Ok(Ok(result))) => Ok(result),
        Ok(Ok(Err(err))) => Err(err),
        Ok(Err(_)) => Err("JavaScript evaluation was cancelled".to_owned()),
        Err(_) => {
            result_state.cancel(&eval_id);
            Err(format!(
                "JavaScript evaluation timed out after {} seconds",
                JS_EVAL_TIMEOUT.as_secs()
            ))
        },
    }
}

/// Capture screenshot metadata from the browser.
#[tauri::command]
pub async fn browser_screenshot(
    app: AppHandle,
    state: State<'_, Arc<BrowserWindowState>>,
    result_state: State<'_, Arc<BrowserResultState>>,
) -> Result<String> {
    let script = "
        return {
            url: window.location.href,
            title: document.title,
            width: window.innerWidth,
            height: window.innerHeight,
            scrollX: window.scrollX,
            scrollY: window.scrollY,
            devicePixelRatio: window.devicePixelRatio
        };
    ";
    browser_eval(script.to_owned(), app, state, result_state).await
}

/// Open DevTools for the browser.
///
/// Because the browser is a separate window (not a child webview), it has
/// its own independent Web Inspector that can be docked!
#[tauri::command]
pub async fn browser_open_devtools(
    app: AppHandle,
    state: State<'_, Arc<BrowserWindowState>>,
) -> Result<()> {
    if !*state.exists.lock() {
        return Err("No browser exists".to_owned());
    }

    let window = app
        .get_webview_window(BROWSER_WINDOW_LABEL)
        .ok_or("Browser window not found")?;

    #[cfg(debug_assertions)]
    {
        window.open_devtools();
        log::info!("Opened DevTools for browser window (independent inspector!)");
        Ok(())
    }

    #[cfg(not(debug_assertions))]
    {
        let _ = window;
        Err("DevTools is only available in debug builds".to_owned())
    }
}

// ═══════════════════════════════════════════════════════════════
// Navigation commands
// ═══════════════════════════════════════════════════════════════

/// Go back in browser history.
#[tauri::command]
pub async fn browser_back(app: AppHandle, state: State<'_, Arc<BrowserWindowState>>) -> Result<()> {
    if !*state.exists.lock() {
        return Err("No browser exists".to_owned());
    }
    let window = app
        .get_webview_window(BROWSER_WINDOW_LABEL)
        .ok_or("Browser window not found")?;
    window
        .eval("history.back()")
        .map_err(|e| format!("Failed to go back: {e}"))
}

/// Go forward in browser history.
#[tauri::command]
pub async fn browser_forward(
    app: AppHandle,
    state: State<'_, Arc<BrowserWindowState>>,
) -> Result<()> {
    if !*state.exists.lock() {
        return Err("No browser exists".to_owned());
    }
    let window = app
        .get_webview_window(BROWSER_WINDOW_LABEL)
        .ok_or("Browser window not found")?;
    window
        .eval("history.forward()")
        .map_err(|e| format!("Failed to go forward: {e}"))
}

/// Reload the current page.
#[tauri::command]
pub async fn browser_reload(
    app: AppHandle,
    state: State<'_, Arc<BrowserWindowState>>,
) -> Result<()> {
    if !*state.exists.lock() {
        return Err("No browser exists".to_owned());
    }
    let window = app
        .get_webview_window(BROWSER_WINDOW_LABEL)
        .ok_or("Browser window not found")?;
    window
        .eval("location.reload()")
        .map_err(|e| format!("Failed to reload: {e}"))
}

/// Stop loading the current page.
#[tauri::command]
pub async fn browser_stop(app: AppHandle, state: State<'_, Arc<BrowserWindowState>>) -> Result<()> {
    if !*state.exists.lock() {
        return Err("No browser exists".to_owned());
    }
    let window = app
        .get_webview_window(BROWSER_WINDOW_LABEL)
        .ok_or("Browser window not found")?;
    window
        .eval("window.stop()")
        .map_err(|e| format!("Failed to stop: {e}"))
}

// ═══════════════════════════════════════════════════════════════
// Visibility commands
// ═══════════════════════════════════════════════════════════════

/// Show the browser window.
#[tauri::command]
pub async fn browser_show(app: AppHandle, state: State<'_, Arc<BrowserWindowState>>) -> Result<()> {
    if !*state.exists.lock() {
        return Err("No browser exists".to_owned());
    }

    let window = app
        .get_webview_window(BROWSER_WINDOW_LABEL)
        .ok_or("Browser window not found")?;

    // Get main window for coordinate conversion (HiDPI-aware)
    let main_window = app.get_webview_window("main");

    // Read bounds once for both restore and repaint operations (DRY)
    let saved_bounds = *state.last_bounds.lock();

    // Restore bounds before showing (convert to screen coordinates)
    if let Some(bounds) = saved_bounds {
        if let Some(main_win) = &main_window {
            if let Ok((screen_x, screen_y)) = to_screen_coords(main_win, bounds.x, bounds.y) {
                let _ = window.set_position(LogicalPosition::new(screen_x, screen_y));
            }
        }
        let _ = window.set_size(LogicalSize::new(bounds.width, bounds.height));
    }

    window
        .show()
        .map_err(|e| format!("Failed to show browser: {e}"))?;

    // Force repaint by briefly resizing (reuse saved_bounds)
    if let Some(bounds) = saved_bounds {
        let _ = window.set_size(LogicalSize::new(
            bounds.width - 1.0_f64,
            bounds.height - 1.0_f64,
        ));
        let _ = window.set_size(LogicalSize::new(bounds.width, bounds.height));
    }

    Ok(())
}

/// Hide the browser window.
#[tauri::command]
pub async fn browser_hide(app: AppHandle, state: State<'_, Arc<BrowserWindowState>>) -> Result<()> {
    if !*state.exists.lock() {
        return Err("No browser exists".to_owned());
    }

    let window = app
        .get_webview_window(BROWSER_WINDOW_LABEL)
        .ok_or("Browser window not found")?;

    // Move offscreen before hiding to prevent artifacts
    let _ = window.set_position(LogicalPosition::new(-10_000.0_f64, -10_000.0_f64));
    let _ = window.set_size(LogicalSize::new(1.0_f64, 1.0_f64));

    window
        .hide()
        .map_err(|e| format!("Failed to hide browser: {e}"))
}

// ═══════════════════════════════════════════════════════════════
// Legacy commands (kept for backward compatibility)
// ═══════════════════════════════════════════════════════════════

/// Legacy: Detect browser (no longer supported).
#[tauri::command]
pub fn browser_detect() -> Result<BrowserInfo> {
    Err("External browser detection is no longer supported. Use browser_create for embedded browser.".to_owned())
}

/// Legacy: Get PID (no longer supported).
#[tauri::command]
pub fn browser_get_pid() -> Option<u32> {
    None
}

/// Legacy: Clear browser tracking (now closes the browser).
#[tauri::command]
pub async fn browser_clear(
    app: AppHandle,
    state: State<'_, Arc<BrowserWindowState>>,
) -> Result<()> {
    browser_close(app, state).await
}

/// Legacy: JS callback (kept for compatibility).
#[tauri::command]
pub async fn browser_js_callback(
    request_id: String,
    result: String,
    state: State<'_, Arc<BrowserResultState>>,
) -> Result<()> {
    state.complete_ok(&request_id, result);
    Ok(())
}

/// Legacy: Async eval (use browser_eval instead).
#[tauri::command]
pub async fn browser_eval_async(
    script: String,
    _timeout_ms: Option<u64>,
    app: AppHandle,
    state: State<'_, Arc<BrowserWindowState>>,
    result_state: State<'_, Arc<BrowserResultState>>,
) -> Result<String> {
    browser_eval(script, app, state, result_state).await
}
