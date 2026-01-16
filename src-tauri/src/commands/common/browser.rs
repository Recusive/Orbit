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
//! See: <https://docs.rs/tauri/latest/tauri/webview/struct.WebviewBuilder.html>

#![allow(
    clippy::needless_pass_by_value,
    clippy::unreachable,
    clippy::let_underscore_must_use,
    clippy::too_many_arguments,
    reason = "Tauri's #[tauri::command] macro generates code that triggers false positives"
)]

use std::result::Result as StdResult;
use std::sync::Arc;
use std::time::Duration;

use hashbrown::HashMap;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::webview::{PageLoadEvent, WebviewBuilder};
use tauri::{
    AppHandle, Emitter as _, LogicalPosition, LogicalSize, Manager as _, State, WebviewUrl,
};
use tokio::sync::oneshot;
use tokio::time::timeout;
use uuid::Uuid;

type Result<T> = StdResult<T, String>;

/// Timeout for waiting on JavaScript evaluation results.
const JS_EVAL_TIMEOUT: Duration = Duration::from_secs(30);

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

/// State for managing the embedded browser webview.
#[derive(Debug, Default)]
pub struct EmbeddedBrowserState {
    /// The current browser webview label (if any).
    current_label: Mutex<Option<String>>,
    /// Last known bounds for the embedded browser (used to restore after hiding).
    last_bounds: Mutex<Option<BrowserBounds>>,
}

impl EmbeddedBrowserState {
    /// Create a new browser state.
    pub fn new() -> Self {
        Self {
            current_label: Mutex::new(None),
            last_bounds: Mutex::new(None),
        }
    }
}

/// Last known bounds for the embedded browser.
#[derive(Debug, Clone, Copy)]
struct BrowserBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

/// State for managing async JavaScript evaluation results.
///
/// This enables two-way communication with the browser webview.
/// When `browser_eval` is called, it registers a oneshot channel
/// and waits for the result to be sent back via navigation interception.
///
/// Results are typed as `Result<String, String>` where:
/// - `Ok(value)` contains the JSON-serialized return value
/// - `Err(message)` contains the error message from JS execution
#[derive(Debug, Default)]
pub struct BrowserResultState {
    /// Map of pending evaluation request IDs to their result senders.
    /// The Result distinguishes successful JS results from errors.
    pending: Mutex<HashMap<String, oneshot::Sender<StdResult<String, String>>>>,
}

impl BrowserResultState {
    /// Create a new browser result state.
    pub fn new() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
        }
    }

    /// Register a new evaluation request and return the receiver.
    ///
    /// The caller should await on the receiver to get the result.
    /// The receiver yields `Result<String, String>` where:
    /// - `Ok(value)` is the JSON-serialized return value
    /// - `Err(message)` is the error message from JS execution
    pub fn register(&self, id: String) -> oneshot::Receiver<StdResult<String, String>> {
        let (tx, rx) = oneshot::channel();
        let _ = self.pending.lock().insert(id, tx);
        rx
    }

    /// Complete an evaluation request with a successful result.
    ///
    /// This is called when the browser sends back a successful JS execution result.
    pub fn complete_ok(&self, id: &str, result: String) {
        let maybe_tx = self.pending.lock().remove(id);
        if let Some(tx) = maybe_tx {
            // Ignore send errors - the receiver may have been dropped (timeout)
            let _ = tx.send(Ok(result));
        } else {
            log::warn!("Received result for unknown eval request: {id}");
        }
    }

    /// Complete an evaluation request with an error.
    ///
    /// This is called when the browser JS execution fails.
    pub fn complete_err(&self, id: &str, error: String) {
        let maybe_tx = self.pending.lock().remove(id);
        if let Some(tx) = maybe_tx {
            // Ignore send errors - the receiver may have been dropped (timeout)
            let _ = tx.send(Err(error));
        } else {
            log::warn!("Received error for unknown eval request: {id}");
        }
    }

    /// Cancel a pending evaluation request.
    ///
    /// This removes the sender without sending a result, causing
    /// the receiver to get a `RecvError`.
    pub fn cancel(&self, id: &str) {
        let _ = self.pending.lock().remove(id);
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
    result_state: State<'_, Arc<BrowserResultState>>,
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

    // Clone handles for callbacks
    let app_for_navigation = app.clone();
    let result_state_for_nav = Arc::clone(&result_state);

    // Build the webview with auto_resize, navigation handlers
    // Note: Child webviews don't have IPC, so we use navigation interception
    // for receiving JS eval results via special URLs
    let webview_builder = WebviewBuilder::new(label, webview_url)
        .auto_resize()
        .on_navigation(move |url| {
            let url_str = url.to_string();

            // Check for eval result URL pattern
            // Format: orbit-eval://result?id=xxx&success=true&data=base64
            if url_str.starts_with("orbit-eval://result?") {
                // Parse query parameters
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
                                    // URL-decode then base64-decode the data
                                    if let Ok(decoded) = urlencoding::decode(value) {
                                        data = Some(decoded.into_owned());
                                    }
                                },
                                "error" => {
                                    if let Ok(decoded) = urlencoding::decode(value) {
                                        error = Some(decoded.into_owned());
                                    }
                                },
                                _ => {},
                            }
                        }
                    }

                    if let Some(req_id) = id {
                        if success {
                            let result = data.unwrap_or_else(|| "null".to_owned());
                            result_state_for_nav.complete_ok(&req_id, result);
                        } else {
                            let error_msg = error.unwrap_or_else(|| "Unknown error".to_owned());
                            result_state_for_nav.complete_err(&req_id, error_msg);
                        }
                    }
                }

                // Block the navigation - this was just a result callback
                return false;
            }

            // Emit navigation event to frontend for regular navigations
            let payload = BrowserNavigatedPayload { url: url_str };
            if let Err(e) = app_for_navigation.emit("browser:navigated", payload) {
                log::warn!("Failed to emit browser:navigated event: {e}");
            }
            // Allow all regular navigations
            true
        })
        .on_page_load(move |_webview, payload| {
            // Emit loading state changes to frontend
            // PageLoadPayload provides event() method to access the PageLoadEvent
            let is_loading = matches!(payload.event(), PageLoadEvent::Started);
            let emit_payload = BrowserLoadingPayload { is_loading };
            if let Err(e) = app.emit("browser:loading", emit_payload) {
                log::warn!("Failed to emit browser:loading event: {e}");
            }
        });

    // Create webview at correct position and size
    let position = LogicalPosition::new(x, y);
    let size = LogicalSize::new(width, height);

    let _webview = main_window
        .add_child(webview_builder, position, size)
        .map_err(|e| format!("Failed to create browser webview: {e}"))?;

    // Store the label
    *state.current_label.lock() = Some(label.to_owned());
    // Store last known bounds for future restores
    *state.last_bounds.lock() = Some(BrowserBounds {
        x,
        y,
        width,
        height,
    });

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

    // Track last known bounds for restoring after hide
    *state.last_bounds.lock() = Some(BrowserBounds {
        x,
        y,
        width,
        height,
    });

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
    *state.last_bounds.lock() = None;

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

/// Execute JavaScript in the embedded browser and return the result.
///
/// This wraps the provided script to capture its return value and sends
/// it back via navigation interception. The result is JSON-serialized.
///
/// # Example
///
/// ```ignore
/// // Get the page title (must use 'return' to get a value from the async IIFE wrapper)
/// let title = browser_eval("return document.title".to_string(), app, state, result_state).await?;
/// // title = "\"My Page Title\""  (JSON string)
///
/// // Execute code that returns an object (parentheses make it an expression)
/// let data = browser_eval("return {x: 1, y: 2}".to_string(), app, state, result_state).await?;
/// // data = "{\"x\":1,\"y\":2}"
/// ```
#[tauri::command]
pub async fn browser_eval(
    script: String,
    app: AppHandle,
    state: State<'_, Arc<EmbeddedBrowserState>>,
    result_state: State<'_, Arc<BrowserResultState>>,
) -> Result<String> {
    let label = state
        .current_label
        .lock()
        .clone()
        .ok_or("No browser exists")?;

    let webview = app.get_webview(&label).ok_or("Browser webview not found")?;

    // Generate a unique ID for this evaluation request
    let eval_id = Uuid::new_v4().to_string();

    // Register the oneshot channel to receive the result
    let result_rx = result_state.register(eval_id.clone());

    // Wrap the script to capture the result and send it back via navigation
    // The wrapper:
    // 1. Executes the user's script in an async IIFE
    // 2. Captures the result (or error)
    // 3. Navigates to a special URL that gets intercepted by on_navigation
    //
    // We use navigation interception because child webviews don't have IPC
    //
    // IMPORTANT: We use `?? null` to handle undefined results (JSON.stringify(undefined)
    // returns undefined, not a string, which breaks JSON.parse on the receiving end).
    // We also check payload size to avoid URL length limits causing silent failures.
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

    // Execute the wrapped script
    // If eval fails, cancel the pending request to prevent leaks
    if let Err(e) = webview.eval(&wrapped_script) {
        result_state.cancel(&eval_id);
        return Err(format!("JavaScript execution failed: {e}"));
    }

    // Wait for the result with a timeout
    // The result_rx yields Result<String, String> where:
    // - Ok(value) = successful JS execution with JSON result
    // - Err(message) = JS execution error
    match timeout(JS_EVAL_TIMEOUT, result_rx).await {
        // Successful receive with successful JS execution
        Ok(Ok(Ok(result))) => Ok(result),
        // Successful receive but JS execution failed
        Ok(Ok(Err(err))) => Err(err),
        // Channel was closed without a result (cancelled)
        Ok(Err(_)) => Err("JavaScript evaluation was cancelled".to_owned()),
        // Timeout - clean up the pending request
        Err(_) => {
            result_state.cancel(&eval_id);
            Err(format!(
                "JavaScript evaluation timed out after {} seconds",
                JS_EVAL_TIMEOUT.as_secs()
            ))
        },
    }
}

/// Receives JavaScript execution results from the browser.
///
/// This command provides an alternative to navigation interception for
/// receiving eval results. It can be called directly via Tauri invoke
/// if the Tauri API is available in the browser context.
///
/// # Parameters
///
/// - `request_id`: The unique ID that was passed to the eval script
/// - `result`: The JSON-serialized result of the evaluation
///
/// # Usage from JavaScript
///
/// ```javascript
/// // If window.__TAURI__ is available in the browser webview:
/// window.__TAURI__.core.invoke('browser_js_callback', {
///     requestId: evalId,
///     result: JSON.stringify(resultValue)
/// });
/// ```
#[tauri::command]
pub async fn browser_js_callback(
    request_id: String,
    result: String,
    state: State<'_, Arc<BrowserResultState>>,
) -> Result<()> {
    log::debug!("Received JS callback for request: {request_id}");
    // The JS callback always sends successful results (errors are handled in JS wrapper)
    state.complete_ok(&request_id, result);
    Ok(())
}

/// Execute JavaScript and wait for result using Tauri invoke callback.
///
/// This variant uses `window.__TAURI__.invoke()` to send results back,
/// which requires the Tauri API to be available in the browser context.
/// Use this for Tauri-enabled webviews; use `browser_eval` for external sites.
///
/// # Parameters
///
/// - `script`: JavaScript code to execute
/// - `timeout_ms`: Optional timeout in milliseconds (default: 5000ms)
///
/// # Returns
///
/// The JSON-serialized result of the JavaScript execution.
/// If an error occurs in the script, returns `{"__error": "message"}`.
///
/// # Example
///
/// ```ignore
/// // Get page title with 10 second timeout
/// let result = browser_eval_async(
///     "return document.title".to_string(),
///     Some(10000),
///     app, browser_state, result_state
/// ).await?;
/// ```
#[tauri::command]
pub async fn browser_eval_async(
    script: String,
    timeout_ms: Option<u64>,
    app: AppHandle,
    browser_state: State<'_, Arc<EmbeddedBrowserState>>,
    result_state: State<'_, Arc<BrowserResultState>>,
) -> Result<String> {
    let label = browser_state
        .current_label
        .lock()
        .clone()
        .ok_or("No browser exists")?;

    let webview = app.get_webview(&label).ok_or("Browser webview not found")?;

    let request_id = Uuid::new_v4().to_string();
    let rx = result_state.register(request_id.clone());

    // Wrap script to call back with result via Tauri invoke
    // This requires window.__TAURI__ to be available in the browser
    let wrapped = format!(
        "(async () => {{
            try {{
                const __result = await (async () => {{ {script} }})();
                window.__TAURI__.core.invoke('browser_js_callback', {{
                    requestId: '{request_id}',
                    result: JSON.stringify(__result ?? null)
                }});
            }} catch (__e) {{
                window.__TAURI__.core.invoke('browser_js_callback', {{
                    requestId: '{request_id}',
                    result: JSON.stringify({{ __error: __e.message || String(__e) }})
                }});
            }}
        }})();"
    );

    // If eval fails, cancel the pending request to prevent leaks
    if let Err(e) = webview.eval(&wrapped) {
        result_state.cancel(&request_id);
        return Err(format!("JavaScript execution failed: {e}"));
    }

    // Wait for result with timeout
    // Note: browser_js_callback uses complete_ok for all results, so JS errors
    // are encoded as {__error: message} in the JSON result (not as Err variant)
    let timeout_duration = Duration::from_millis(timeout_ms.unwrap_or(5000));
    match timeout(timeout_duration, rx).await {
        // Successful receive with successful JS callback
        Ok(Ok(Ok(result))) => Ok(result),
        // Successful receive but complete_err was called (shouldn't happen with browser_js_callback)
        Ok(Ok(Err(err))) => Err(err),
        // Channel was closed without a result
        Ok(Err(_recv_err)) => Err("Result channel closed unexpectedly".to_owned()),
        // Timeout - clean up the pending request
        Err(_elapsed) => {
            result_state.cancel(&request_id);
            Err(format!(
                "JavaScript execution timed out after {}ms",
                timeout_duration.as_millis()
            ))
        },
    }
}

/// Capture screenshot of the embedded browser.
///
/// Currently returns page metadata (URL, title, dimensions) as a JSON object.
/// Full screenshot capture requires either:
/// - `html2canvas` library loaded in the page
/// - Native webview screenshot API (platform-specific)
///
/// # Returns
///
/// JSON object with page information:
/// ```json
/// {
///     "url": "https://example.com",
///     "title": "Example Page",
///     "width": 1920,
///     "height": 1080
/// }
/// ```
///
/// # Note
///
/// This command uses `browser_eval` (navigation-based) which works on both
/// Tauri-enabled and external sites. No `window.__TAURI__` required.
#[tauri::command]
pub async fn browser_screenshot(
    app: AppHandle,
    state: State<'_, Arc<EmbeddedBrowserState>>,
    result_state: State<'_, Arc<BrowserResultState>>,
) -> Result<String> {
    // Use browser_eval (navigation-based) which works on external sites
    // Full screenshot would require html2canvas or native webview API
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

/// Open DevTools for the embedded browser.
///
/// Only available in debug builds (`debug_assertions`).
/// On macOS, this uses a private API and won't work in App Store builds.
#[tauri::command]
pub async fn browser_open_devtools(
    app: AppHandle,
    state: State<'_, Arc<EmbeddedBrowserState>>,
) -> Result<()> {
    let label = state
        .current_label
        .lock()
        .clone()
        .ok_or("No browser exists")?;

    let webview = app.get_webview(&label).ok_or("Browser webview not found")?;

    // open_devtools is only available in debug builds
    #[cfg(debug_assertions)]
    {
        webview.open_devtools();
        log::info!("Opened DevTools for embedded browser");
        Ok(())
    }

    #[cfg(not(debug_assertions))]
    {
        let _ = webview; // Silence unused warning
        Err("DevTools is only available in debug builds".to_owned())
    }
}

// ═══════════════════════════════════════════════════════════════
// Navigation commands
// ═══════════════════════════════════════════════════════════════

/// Go back in browser history.
#[tauri::command]
pub async fn browser_back(
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
        .eval("history.back()")
        .map_err(|e| format!("Failed to go back: {e}"))?;

    Ok(())
}

/// Go forward in browser history.
#[tauri::command]
pub async fn browser_forward(
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
        .eval("history.forward()")
        .map_err(|e| format!("Failed to go forward: {e}"))?;

    Ok(())
}

/// Reload the current page.
#[tauri::command]
pub async fn browser_reload(
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
        .eval("location.reload()")
        .map_err(|e| format!("Failed to reload: {e}"))?;

    Ok(())
}

/// Stop loading the current page.
#[tauri::command]
pub async fn browser_stop(
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
        .eval("window.stop()")
        .map_err(|e| format!("Failed to stop: {e}"))?;

    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// Visibility commands
// ═══════════════════════════════════════════════════════════════

/// Show the embedded browser webview.
#[tauri::command]
pub async fn browser_show(
    app: AppHandle,
    state: State<'_, Arc<EmbeddedBrowserState>>,
) -> Result<()> {
    let label = state
        .current_label
        .lock()
        .clone()
        .ok_or("No browser exists")?;

    let webview = app.get_webview(&label).ok_or("Browser webview not found")?;

    // Restore position BEFORE showing to avoid flash at wrong location
    // Copy bounds out of lock to avoid holding lock across await points
    let bounds_copy = *state.last_bounds.lock();
    if let Some(bounds) = bounds_copy {
        let _ = webview.set_position(LogicalPosition::new(bounds.x, bounds.y));
        let _ = webview.set_size(LogicalSize::new(bounds.width, bounds.height));
    }

    webview
        .show()
        .map_err(|e| format!("Failed to show browser: {e}"))?;

    // WKWebView repaint kick: After being hidden/moved offscreen, the webview
    // sometimes doesn't repaint until a layout change occurs. Resize by 1px
    // then back to force a repaint. This MUST happen AFTER show() - the webview
    // needs to be visible for the layout invalidation to trigger a repaint.
    if let Some(bounds) = bounds_copy {
        let _ = webview.set_size(LogicalSize::new(
            bounds.width - 1.0_f64,
            bounds.height - 1.0_f64,
        ));
        let _ = webview.set_size(LogicalSize::new(bounds.width, bounds.height));
    }

    Ok(())
}

/// Hide the embedded browser webview.
#[tauri::command]
pub async fn browser_hide(
    app: AppHandle,
    state: State<'_, Arc<EmbeddedBrowserState>>,
) -> Result<()> {
    let label = state
        .current_label
        .lock()
        .clone()
        .ok_or("No browser exists")?;

    let webview = app.get_webview(&label).ok_or("Browser webview not found")?;

    // IMPORTANT: Move offscreen and shrink BEFORE calling hide().
    // WKWebView on macOS can leave a thin visual artifact (1-2px line) if
    // hide() is called while the webview is still at its visible position.
    // By moving offscreen first, we ensure no pixel remnants appear.
    let _ = webview.set_position(LogicalPosition::new(-10_000.0_f64, -10_000.0_f64));
    let _ = webview.set_size(LogicalSize::new(1.0_f64, 1.0_f64));

    // Now hide - the webview is already offscreen, so any rendering delay is invisible
    webview
        .hide()
        .map_err(|e| format!("Failed to hide browser: {e}"))?;

    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// Legacy commands (kept for backward compatibility)
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
