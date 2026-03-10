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

#[cfg(target_os = "macos")]
use std::env;
use std::fs;
use std::path::PathBuf;
use std::result::Result as StdResult;
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(target_os = "macos")]
use std::sync::mpsc::sync_channel;
use std::sync::Arc;
use std::time::{Duration, Instant};

#[cfg(target_os = "macos")]
use tokio::task::spawn_blocking;

use hashbrown::HashMap;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::webview::{PageLoadEvent, PageLoadPayload, WebviewWindowBuilder};
use tauri::{
    AppHandle, Emitter as _, Listener as _, LogicalPosition, LogicalSize, Manager as _, State,
    WebviewUrl,
};
use tokio::sync::oneshot;
use tokio::time::{interval, sleep, timeout};
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
const SMALL_EVAL_RESULT_LIMIT_CHARS: usize = 100_000;
const LARGE_EVAL_RESULT_LIMIT_CHARS: usize = 500_000;
const DEFAULT_WAIT_TIMEOUT_MS: u64 = 30_000;
const MAX_WAIT_TIMEOUT_MS: u64 = 120_000;
const WAIT_POLL_INTERVAL_MS: u64 = 100;
const ORBIT_RUNTIME_SCRIPT: &str = include_str!("orbit_runtime.js");

/// The label for the browser window.
const BROWSER_WINDOW_LABEL: &str = "browser-window";
const LARGE_EVAL_TIMEOUT_MESSAGE: &str =
    "Large eval result not received within timeout. The page may have navigated or script execution was interrupted.";
const BROWSER_BOOTSTRAP_SCRIPT: &str = concat!(
    include_str!("browser_init.js"),
    "\n",
    include_str!("orbit_runtime.js"),
    "\n",
    r#"
(function () {
    window.__orbit_eval_channel = window.__orbit_eval_channel || {
        async postResult(evalId, data) {
            const emitter = window.__TAURI__?.event?.emit;
            if (typeof emitter !== 'function') {
                throw new Error('Large eval result transport unavailable.');
            }
            await emitter('browser:eval-large-result', { evalId, data });
        },
    };
})();
"#
);

/// Max tracked screenshot files per browser session.
///
/// Oldest file is evicted when capacity is reached.
#[cfg(any(target_os = "macos", test))]
const MAX_SCREENSHOT_FILES: usize = 20;

/// Corner radius for the browser window, matching the activity card's CSS
/// `--content-card-radius` (10px). On macOS, a CALayer mask clips the native
/// `WKWebView` to rounded corners so it sits flush inside the activity card.
#[cfg(target_os = "macos")]
const BROWSER_CORNER_RADIUS: f64 = 10.0;

/// Handle an `orbit-eval://result?...` navigation callback.
///
/// Parses the query-string for `id`, `success`, `data`, and `error` params,
/// then completes the pending eval result. Returns `true` if the URL matched.
fn handle_eval_result_url(url: &tauri::Url, result_state: &BrowserResultState) -> bool {
    let url_str = url.as_str();
    if !url_str.starts_with("orbit-eval://result?") {
        return false;
    }
    if let Some(query) = url.query() {
        let mut id = None;
        let mut success = false;
        let mut large = false;
        let mut data = None;
        let mut error = None;

        for pair in query.split('&') {
            if let Some((key, value)) = pair.split_once('=') {
                match key {
                    "id" => id = Some(value.to_owned()),
                    "success" => success = value == "true",
                    "large" => large = value == "true",
                    "data" => {
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
                if large {
                    result_state.mark_awaiting_large_payload(&req_id);
                } else {
                    result_state.complete_ok(&req_id, data.unwrap_or_else(|| "null".to_owned()));
                }
            } else {
                result_state
                    .complete_err(&req_id, error.unwrap_or_else(|| "Unknown error".to_owned()));
            }
        } else {
            log::warn!("Malformed eval result URL: missing 'id' parameter in query: {query}");
        }
    } else {
        log::warn!("Malformed eval result URL: no query string in {url_str}");
    }
    true
}

/// Register the large-result event listener used by `browser_eval`.
pub fn register_browser_large_eval_result_listener(
    app: &AppHandle,
    result_state: Arc<BrowserResultState>,
) {
    let _ = app.listen_any("browser:eval-large-result", move |event| {
        handle_large_eval_result_payload(event.payload(), &result_state);
    });
}

/// Handle an `orbit-eval://element-selected?data=...` navigation callback.
///
/// Decodes the `data` query param and emits a `browser:element-selected` Tauri
/// event. Returns `true` if the URL matched.
fn handle_element_selected_url(url: &tauri::Url, app: &AppHandle) -> bool {
    let url_str = url.as_str();
    if !url_str.starts_with("orbit-eval://element-selected?") {
        return false;
    }
    if let Some(query) = url.query() {
        for pair in query.split('&') {
            if let Some(("data", value)) = pair.split_once('=') {
                if let Ok(decoded) = urlencoding::decode(value) {
                    let _ = app.emit("browser:element-selected", decoded.into_owned());
                }
            }
        }
    }
    true
}

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

#[derive(Debug)]
struct PendingEvalRequest {
    sender: oneshot::Sender<StdResult<String, String>>,
    awaiting_large_payload: bool,
}

#[derive(Debug, Deserialize)]
struct LargeEvalResultPayload {
    #[serde(rename = "evalId")]
    eval_id: String,
    data: String,
}

#[derive(Debug, Deserialize)]
struct UrlWaitResult {
    matched: bool,
    #[serde(rename = "currentUrl")]
    current_url: String,
    #[serde(rename = "regexError")]
    regex_error: Option<String>,
}

/// State for managing the browser child window.
#[derive(Debug, Default)]
pub struct BrowserWindowState {
    /// Whether the browser window exists.
    exists: Mutex<bool>,
    /// Whether the browser is currently "hidden" (moved offscreen).
    ///
    /// When true, `browser_set_bounds` skips position/size updates to prevent
    /// the ResizeObserver from moving the window back on-screen after a hide.
    hidden: Mutex<bool>,
    /// Last known bounds for restoring after hide.
    last_bounds: Mutex<Option<BrowserBounds>>,
    /// Whether a screenshot request is currently in-flight.
    screenshot_in_progress: AtomicBool,
    /// Screenshot temp files tracked for cleanup on browser close/recreate.
    screenshot_files: Mutex<Vec<PathBuf>>,
}

impl BrowserWindowState {
    /// Create a new browser state.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Non-blocking check whether the browser window currently exists.
    ///
    /// Returns `None` if the lock is contended (another thread holds it),
    /// which callers should treat as "don't know / skip". This is designed
    /// for the main-thread focus handler where blocking would deadlock the
    /// macOS event loop.
    pub fn try_is_active(&self) -> Option<bool> {
        self.exists.try_lock().map(|guard| *guard)
    }
}

/// Delete all tracked screenshot temp files for a browser session.
///
/// Must not be called while holding `exists.lock()`. This function may spin
/// while waiting for an in-flight screenshot to complete, and that screenshot
/// can need `exists.lock()` to finish teardown.
async fn cleanup_screenshot_files(state: &BrowserWindowState) {
    // Native capture has a 10s recv timeout. Wait slightly longer here so
    // cleanup doesn't block forever on exceptional paths.
    let deadline = Instant::now() + Duration::from_secs(12);
    while state.screenshot_in_progress.load(Ordering::Acquire) {
        if Instant::now() >= deadline {
            log::warn!("Timed out waiting for in-flight screenshot during cleanup");
            break;
        }
        sleep(Duration::from_millis(10)).await;
    }

    let paths: Vec<_> = state.screenshot_files.lock().drain(..).collect();
    for path in paths {
        let _ = fs::remove_file(path);
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
    pending: Mutex<HashMap<String, PendingEvalRequest>>,
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
        let _ = self.pending.lock().insert(
            id,
            PendingEvalRequest {
                sender: tx,
                awaiting_large_payload: false,
            },
        );
        rx
    }

    /// Complete an evaluation request with a successful result.
    pub fn complete_ok(&self, id: &str, result: String) {
        let maybe_pending = self.pending.lock().remove(id);
        if let Some(pending) = maybe_pending {
            let _ = pending.sender.send(Ok(result));
        } else {
            log::warn!("Received result for unknown eval request: {id}");
        }
    }

    /// Complete an evaluation request with an error.
    pub fn complete_err(&self, id: &str, error: String) {
        let maybe_pending = self.pending.lock().remove(id);
        if let Some(pending) = maybe_pending {
            let _ = pending.sender.send(Err(error));
        } else {
            log::warn!("Received error for unknown eval request: {id}");
        }
    }

    /// Mark a pending request as waiting for a large event payload.
    pub fn mark_awaiting_large_payload(&self, id: &str) {
        if let Some(pending) = self.pending.lock().get_mut(id) {
            pending.awaiting_large_payload = true;
        } else {
            log::warn!("Received large-result marker for unknown eval request: {id}");
        }
    }

    /// Cancel a pending evaluation request.
    #[must_use]
    pub fn cancel(&self, id: &str) -> bool {
        self.pending
            .lock()
            .remove(id)
            .is_some_and(|pending| pending.awaiting_large_payload)
    }
}

fn handle_large_eval_result_payload(payload: &str, result_state: &BrowserResultState) {
    match serde_json::from_str::<LargeEvalResultPayload>(payload) {
        Ok(message) => result_state.complete_ok(&message.eval_id, message.data),
        Err(error) => log::warn!("Failed to parse browser:eval-large-result payload: {error}"),
    }
}

#[must_use]
fn normalize_wait_timeout(timeout_ms: Option<u64>) -> Duration {
    match timeout_ms {
        Some(0) | None => Duration::from_millis(DEFAULT_WAIT_TIMEOUT_MS),
        Some(value) => Duration::from_millis(value.min(MAX_WAIT_TIMEOUT_MS)),
    }
}

fn ensure_browser_exists(state: &BrowserWindowState) -> Result<()> {
    if !*state.exists.lock() {
        return Err("No browser exists".to_owned());
    }
    Ok(())
}

fn expected_orbit_runtime_version() -> Result<&'static str> {
    ORBIT_RUNTIME_SCRIPT
        .lines()
        .find_map(|line| {
            let trimmed = line.trim();
            trimmed
                .strip_prefix("const RUNTIME_VERSION = '")
                .and_then(|rest| rest.strip_suffix("';"))
        })
        .ok_or_else(|| "Orbit runtime version not found".to_owned())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OrbitRuntimeMethod {
    Snapshot,
    Click,
    Type,
    Fill,
    GetText,
    GetHtml,
    Count,
    Check,
    Uncheck,
    Select,
    Hover,
    Focus,
    Scroll,
    ScrollIntoView,
    IsVisible,
    IsEnabled,
    GetAttribute,
    BoundingBox,
    GetCookies,
    ClearCookies,
    StorageGet,
    StorageSet,
    StorageClear,
    GetNetworkRequests,
    GetConsoleLogs,
    RuntimeInfo,
}

impl OrbitRuntimeMethod {
    fn from_input(value: &str) -> Result<Self> {
        match value {
            "snapshot" => Ok(Self::Snapshot),
            "click" => Ok(Self::Click),
            "type" => Ok(Self::Type),
            "fill" => Ok(Self::Fill),
            "getText" => Ok(Self::GetText),
            "getHtml" => Ok(Self::GetHtml),
            "count" => Ok(Self::Count),
            "check" => Ok(Self::Check),
            "uncheck" => Ok(Self::Uncheck),
            "select" => Ok(Self::Select),
            "hover" => Ok(Self::Hover),
            "focus" => Ok(Self::Focus),
            "scroll" => Ok(Self::Scroll),
            "scrollIntoView" => Ok(Self::ScrollIntoView),
            "isVisible" => Ok(Self::IsVisible),
            "isEnabled" => Ok(Self::IsEnabled),
            "getAttribute" => Ok(Self::GetAttribute),
            "boundingBox" => Ok(Self::BoundingBox),
            "getCookies" => Ok(Self::GetCookies),
            "clearCookies" => Ok(Self::ClearCookies),
            "storageGet" => Ok(Self::StorageGet),
            "storageSet" => Ok(Self::StorageSet),
            "storageClear" => Ok(Self::StorageClear),
            "getNetworkRequests" => Ok(Self::GetNetworkRequests),
            "getConsoleLogs" => Ok(Self::GetConsoleLogs),
            "runtimeInfo" => Ok(Self::RuntimeInfo),
            _ => Err(format!("Unsupported Orbit runtime method: {value}")),
        }
    }

    fn as_js_name(self) -> &'static str {
        match self {
            Self::Snapshot => "snapshot",
            Self::Click => "click",
            Self::Type => "type",
            Self::Fill => "fill",
            Self::GetText => "getText",
            Self::GetHtml => "getHtml",
            Self::Count => "count",
            Self::Check => "check",
            Self::Uncheck => "uncheck",
            Self::Select => "select",
            Self::Hover => "hover",
            Self::Focus => "focus",
            Self::Scroll => "scroll",
            Self::ScrollIntoView => "scrollIntoView",
            Self::IsVisible => "isVisible",
            Self::IsEnabled => "isEnabled",
            Self::GetAttribute => "getAttribute",
            Self::BoundingBox => "boundingBox",
            Self::GetCookies => "getCookies",
            Self::ClearCookies => "clearCookies",
            Self::StorageGet => "storageGet",
            Self::StorageSet => "storageSet",
            Self::StorageClear => "storageClear",
            Self::GetNetworkRequests => "getNetworkRequests",
            Self::GetConsoleLogs => "getConsoleLogs",
            Self::RuntimeInfo => "runtimeInfo",
        }
    }

    #[cfg(test)]
    fn all() -> &'static [Self] {
        &[
            Self::Snapshot,
            Self::Click,
            Self::Type,
            Self::Fill,
            Self::GetText,
            Self::GetHtml,
            Self::Count,
            Self::Check,
            Self::Uncheck,
            Self::Select,
            Self::Hover,
            Self::Focus,
            Self::Scroll,
            Self::ScrollIntoView,
            Self::IsVisible,
            Self::IsEnabled,
            Self::GetAttribute,
            Self::BoundingBox,
            Self::GetCookies,
            Self::ClearCookies,
            Self::StorageGet,
            Self::StorageSet,
            Self::StorageClear,
            Self::GetNetworkRequests,
            Self::GetConsoleLogs,
            Self::RuntimeInfo,
        ]
    }
}

/// Create an embedded browser as a child window.
///
/// On macOS, this creates a borderless child window that:
/// - Moves with the parent window
/// - Has its own independent Web Inspector
/// - Can be positioned within the parent's bounds
#[tauri::command]
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

    // Close existing browser window if any, then cleanup tracked screenshot files.
    // Run cleanup outside of exists.lock() to avoid deadlock with in-flight captures.
    let needs_cleanup = {
        let mut exists = state.exists.lock();
        if *exists {
            if let Some(window) = app.get_webview_window(BROWSER_WINDOW_LABEL) {
                log::info!("Closing existing browser window before creating new one");
                let _ = window.close();
            }
            *exists = false;
            true
        } else {
            false
        }
    };
    if needs_cleanup {
        cleanup_screenshot_files(state.inner().as_ref()).await;
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
        // Initialization script to block DevTools shortcuts, preload the
        // Orbit runtime, and install the large-eval result transport hook.
        .initialization_script(BROWSER_BOOTSTRAP_SCRIPT)
        // Navigation handler for eval result interception
        .on_navigation(move |url: &tauri::Url| {
            // Intercept orbit-eval:// callback URLs (eval results, element selection)
            if handle_eval_result_url(url, &result_state_for_nav) {
                return false;
            }
            if handle_element_selected_url(url, &app_for_navigation) {
                return false;
            }

            // Emit navigation event for regular navigations
            let payload = BrowserNavigatedPayload {
                url: url.to_string(),
            };
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

    // Apply rounded corners on macOS so the native webview clips to the
    // activity card's border-radius (no visible gap at bottom corners).
    #[cfg(target_os = "macos")]
    {
        let radius = BROWSER_CORNER_RADIUS;
        if let Err(e) = app.run_on_main_thread(move || {
            orbit_plugin_decorum::set_child_windows_corner_radius(radius);
        }) {
            log::warn!("Failed to set browser corner radius: {e}");
        }
    }

    // Update state
    *state.exists.lock() = true;
    *state.hidden.lock() = false;
    *state.last_bounds.lock() = Some(BrowserBounds {
        x,
        y,
        width,
        height,
    });
    state.screenshot_in_progress.store(false, Ordering::Release);

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

    // Skip position/size updates while the browser is hidden (offscreen).
    // The ResizeObserver continues firing during panel collapse animations,
    // which would move the window back on-screen if we applied the bounds.
    if *state.hidden.lock() {
        return Ok(());
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
    // Phase 1: mark closed while holding lock
    let had_browser = {
        let mut exists = state.exists.lock();
        if !*exists {
            false
        } else {
            *exists = false;
            true
        }
    };

    if !had_browser {
        // Cleanup stale screenshot files from previously torn-down sessions.
        cleanup_screenshot_files(state.inner().as_ref()).await;
        return Err("No browser exists".to_owned());
    }

    // Phase 2: cleanup any tracked screenshot files.
    cleanup_screenshot_files(state.inner().as_ref()).await;

    // Phase 3: close the browser window. If close fails, restore exists=true
    // so other commands can still reach the live window.
    if let Some(window) = app.get_webview_window(BROWSER_WINDOW_LABEL) {
        if let Err(error) = window.close() {
            *state.exists.lock() = true;
            return Err(format!("Failed to close browser: {error}"));
        }
    }

    // Phase 4: reset remaining state.
    *state.hidden.lock() = false;
    *state.last_bounds.lock() = None;
    state.screenshot_in_progress.store(false, Ordering::Release);
    log::info!("Closed browser window");
    Ok(())
}

/// Check if a browser exists.
///
/// # Implementation Note (Code Review Cycle 1, Codex Issue #4)
///
/// This function validates the browser window actually exists by checking both
/// the state flag AND attempting to get the window handle. This prevents stale
/// state if the window was closed externally (crash, user action, etc.).
#[tauri::command]
pub fn browser_has(app: AppHandle, state: State<'_, Arc<BrowserWindowState>>) -> bool {
    let mut exists = state.exists.lock();
    if !*exists {
        return false;
    }

    // Validate the window actually exists (handles external close/crash)
    if app.get_webview_window(BROWSER_WINDOW_LABEL).is_none() {
        // Window was closed externally - update state
        *exists = false;
        return false;
    }

    true
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
    browser_eval_inner(&script, &app, &state, &result_state).await
}

async fn browser_eval_inner(
    script: &str,
    app: &AppHandle,
    state: &State<'_, Arc<BrowserWindowState>>,
    result_state: &State<'_, Arc<BrowserResultState>>,
) -> Result<String> {
    ensure_browser_exists(state.inner().as_ref())?;

    let window = app
        .get_webview_window(BROWSER_WINDOW_LABEL)
        .ok_or("Browser window not found")?;

    let eval_id = Uuid::new_v4().to_string();
    let result_rx = result_state.register(eval_id.clone());

    // Wrap script to capture result and send via navigation.
    //
    // SECURITY: The script is JSON-encoded to prevent injection attacks.
    // `new Function(scriptString)()` treats the body as a FunctionBody (so
    // `return` statements are valid) and prevents injection because the
    // script is passed as a JSON-encoded string variable, not interpolated.
    //
    // Code review cycle 1, issue #12: Previously used direct format!() interpolation
    // which was vulnerable to script breakout attacks.
    let script_json = serde_json::to_string(script).unwrap_or_else(|_| {
        // Fallback: manual escaping for edge cases (should never happen with valid UTF-8)
        format!(
            "\"{}\"",
            script
                .replace('\\', "\\\\")
                .replace('"', "\\\"")
                .replace('\n', "\\n")
                .replace('\r', "\\r")
        )
    });

    let wrapped_script = format!(
        "(async () => {{
            const __evalId = {eval_id_json};
            const __scriptSource = {script_json};
            try {{
                const __result = await (new Function(__scriptSource))();
                const __json = JSON.stringify(__result ?? null);
                if (__json.length <= {small_limit}) {{
                    const __data = encodeURIComponent(__json);
                    window.location.href = `orbit-eval://result?id=${{__evalId}}&success=true&data=${{__data}}`;
                    return;
                }}
                if (__json.length <= {large_limit}) {{
                    const __channel = window.__orbit_eval_channel;
                    if (!__channel || typeof __channel.postResult !== 'function') {{
                        throw new Error('Large eval result transport unavailable.');
                    }}
                    window.location.href = `orbit-eval://result?id=${{__evalId}}&success=true&large=true`;
                    await __channel.postResult(__evalId, __json);
                    return;
                }}
                {{
                    const __errorMsg = encodeURIComponent(`Result too large (${{__json.length}} chars, max 500000). Use compact:true or target a subtree.`);
                    window.location.href = `orbit-eval://result?id=${{__evalId}}&success=false&error=${{__errorMsg}}`;
                    return;
                }}
            }} catch (__error) {{
                const __errorMsg = encodeURIComponent(__error.message || String(__error));
                window.location.href = `orbit-eval://result?id=${{__evalId}}&success=false&error=${{__errorMsg}}`;
            }}
        }})();",
        eval_id_json = serde_json::to_string(&eval_id).unwrap_or_else(|_| format!("\"{eval_id}\"")),
        script_json = script_json,
        small_limit = SMALL_EVAL_RESULT_LIMIT_CHARS,
        large_limit = LARGE_EVAL_RESULT_LIMIT_CHARS,
    );

    if let Err(e) = window.eval(&wrapped_script) {
        let _ = result_state.cancel(&eval_id);
        return Err(format!("JavaScript execution failed: {e}"));
    }

    match timeout(JS_EVAL_TIMEOUT, result_rx).await {
        Ok(Ok(Ok(result))) => Ok(result),
        Ok(Ok(Err(err))) => Err(err),
        Ok(Err(_)) => Err("JavaScript evaluation was cancelled".to_owned()),
        Err(_) => {
            let awaiting_large_payload = result_state.cancel(&eval_id);
            if awaiting_large_payload {
                Err(LARGE_EVAL_TIMEOUT_MESSAGE.to_owned())
            } else {
                Err(format!(
                    "JavaScript evaluation timed out after {} seconds",
                    JS_EVAL_TIMEOUT.as_secs()
                ))
            }
        },
    }
}

fn build_browser_eval_direct_wrapper(
    eval_id_json: &str,
    script_body: &str,
    small_limit: usize,
    large_limit: usize,
) -> String {
    // SAFETY: `script_body` is embedded directly into JavaScript. This helper is
    // only used by trusted Rust call sites that construct scripts from internal
    // code and JSON-serialized values, never from arbitrary user input.
    format!(
        "(async () => {{
            const __evalId = {eval_id_json};
            try {{
                const __result = await (async function() {{
{script_body}
                }})();
                const __json = JSON.stringify(__result ?? null);
                if (__json.length <= {small_limit}) {{
                    const __data = encodeURIComponent(__json);
                    window.location.href = `orbit-eval://result?id=${{__evalId}}&success=true&data=${{__data}}`;
                    return;
                }}
                if (__json.length <= {large_limit}) {{
                    const __channel = window.__orbit_eval_channel;
                    if (!__channel || typeof __channel.postResult !== 'function') {{
                        throw new Error('Large eval result transport unavailable.');
                    }}
                    window.location.href = `orbit-eval://result?id=${{__evalId}}&success=true&large=true`;
                    await __channel.postResult(__evalId, __json);
                    return;
                }}
                {{
                    const __errorMsg = encodeURIComponent(`Result too large (${{__json.length}} chars, max 500000). Use compact:true or target a subtree.`);
                    window.location.href = `orbit-eval://result?id=${{__evalId}}&success=false&error=${{__errorMsg}}`;
                    return;
                }}
            }} catch (__error) {{
                const __errorMsg = encodeURIComponent(__error?.message || String(__error));
                window.location.href = `orbit-eval://result?id=${{__evalId}}&success=false&error=${{__errorMsg}}`;
            }}
        }})();",
    )
}

async fn browser_eval_direct_inner(
    script: &str,
    app: &AppHandle,
    state: &State<'_, Arc<BrowserWindowState>>,
    result_state: &State<'_, Arc<BrowserResultState>>,
) -> Result<String> {
    ensure_browser_exists(state.inner().as_ref())?;

    let window = app
        .get_webview_window(BROWSER_WINDOW_LABEL)
        .ok_or("Browser window not found")?;

    let eval_id = Uuid::new_v4().to_string();
    let result_rx = result_state.register(eval_id.clone());
    let eval_id_json = serde_json::to_string(&eval_id).unwrap_or_else(|_| format!("\"{eval_id}\""));
    let wrapped_script = build_browser_eval_direct_wrapper(
        &eval_id_json,
        script,
        SMALL_EVAL_RESULT_LIMIT_CHARS,
        LARGE_EVAL_RESULT_LIMIT_CHARS,
    );

    if let Err(error) = window.eval(&wrapped_script) {
        let _ = result_state.cancel(&eval_id);
        return Err(format!("JavaScript execution failed: {error}"));
    }

    match timeout(JS_EVAL_TIMEOUT, result_rx).await {
        Ok(Ok(Ok(result))) => Ok(result),
        Ok(Ok(Err(err))) => Err(err),
        Ok(Err(_)) => Err("JavaScript evaluation was cancelled".to_owned()),
        Err(_) => {
            let awaiting_large_payload = result_state.cancel(&eval_id);
            if awaiting_large_payload {
                Err(LARGE_EVAL_TIMEOUT_MESSAGE.to_owned())
            } else {
                Err(format!(
                    "JavaScript evaluation timed out after {} seconds",
                    JS_EVAL_TIMEOUT.as_secs()
                ))
            }
        },
    }
}

async fn browser_runtime_version_inner(
    app: &AppHandle,
    state: &State<'_, Arc<BrowserWindowState>>,
    result_state: &State<'_, Arc<BrowserResultState>>,
) -> Result<Option<String>> {
    let raw = browser_eval_direct_inner(
        "return window.__orbit?.VERSION ?? null;",
        app,
        state,
        result_state,
    )
    .await?;
    serde_json::from_str::<Option<String>>(&raw)
        .map_err(|error| format!("Failed to parse Orbit runtime version: {error}"))
}

async fn browser_ensure_runtime_inner(
    app: &AppHandle,
    state: &State<'_, Arc<BrowserWindowState>>,
    result_state: &State<'_, Arc<BrowserResultState>>,
) -> Result<()> {
    let expected_version = expected_orbit_runtime_version()?;
    let current_version = browser_runtime_version_inner(app, state, result_state).await?;
    if current_version.as_deref() == Some(expected_version) {
        return Ok(());
    }

    let inject_script = format!("{ORBIT_RUNTIME_SCRIPT}\nreturn window.__orbit?.VERSION ?? null;");
    let raw = browser_eval_direct_inner(&inject_script, app, state, result_state).await?;
    let injected_version = serde_json::from_str::<Option<String>>(&raw)
        .map_err(|error| format!("Failed to parse injected Orbit runtime version: {error}"))?;

    if injected_version.as_deref() != Some(expected_version) {
        return Err(format!(
            "Orbit runtime injection failed (expected {expected_version}, received {})",
            injected_version.unwrap_or_else(|| "null".to_owned())
        ));
    }

    Ok(())
}

/// Invoke a typed Orbit runtime method from the embedded browser.
#[tauri::command]
pub async fn browser_invoke_runtime(
    method: String,
    args_json: String,
    app: AppHandle,
    state: State<'_, Arc<BrowserWindowState>>,
    result_state: State<'_, Arc<BrowserResultState>>,
) -> Result<String> {
    let runtime_method = OrbitRuntimeMethod::from_input(&method)?;
    let method_name_json = serde_json::to_string(runtime_method.as_js_name())
        .map_err(|error| format!("Failed to encode Orbit runtime method name: {error}"))?;
    let args_json_literal = serde_json::to_string(&args_json)
        .map_err(|error| format!("Failed to encode Orbit runtime args: {error}"))?;
    let script = format!(
        "const __orbit = window.__orbit;
        if (!__orbit || typeof __orbit[{method_name_json}] !== 'function') {{
            throw new Error('Orbit runtime unavailable.');
        }}
        // NOTE: `args_json` is already a JSON string from the frontend. Encode
        // that string again for safe JS injection, then parse it back here.
        return __orbit[{method_name_json}](...JSON.parse({args_json_literal}));",
    );

    browser_eval_direct_inner(&script, &app, &state, &result_state).await
}

/// Return the currently installed Orbit runtime version from the page.
#[tauri::command]
pub async fn browser_runtime_version(
    app: AppHandle,
    state: State<'_, Arc<BrowserWindowState>>,
    result_state: State<'_, Arc<BrowserResultState>>,
) -> Result<Option<String>> {
    browser_runtime_version_inner(&app, &state, &result_state).await
}

/// Ensure the Orbit runtime is installed and matches the bundled version.
#[tauri::command]
pub async fn browser_ensure_runtime(
    app: AppHandle,
    state: State<'_, Arc<BrowserWindowState>>,
    result_state: State<'_, Arc<BrowserResultState>>,
) -> Result<()> {
    browser_ensure_runtime_inner(&app, &state, &result_state).await
}

/// Return the current browser URL without executing page JavaScript.
#[tauri::command]
pub async fn browser_get_url(
    app: AppHandle,
    state: State<'_, Arc<BrowserWindowState>>,
) -> Result<String> {
    ensure_browser_exists(state.inner().as_ref())?;

    let Some(window) = app.get_webview_window(BROWSER_WINDOW_LABEL) else {
        *state.exists.lock() = false;
        return Err("Browser window not found".to_owned());
    };

    let url = window
        .url()
        .map_err(|error| format!("Failed to read browser URL: {error}"))?;

    Ok(serde_json::json!({ "url": url.to_string() }).to_string())
}

/// Return the current document title using the CSP-safe eval transport.
#[tauri::command]
pub async fn browser_get_title(
    app: AppHandle,
    state: State<'_, Arc<BrowserWindowState>>,
    result_state: State<'_, Arc<BrowserResultState>>,
) -> Result<String> {
    browser_eval_direct_inner(
        "return { title: document.title ?? '' };",
        &app,
        &state,
        &result_state,
    )
    .await
}

/// Capture a screenshot of the embedded browser.
#[tauri::command]
pub async fn browser_screenshot(
    app: AppHandle,
    state: State<'_, Arc<BrowserWindowState>>,
) -> Result<String> {
    if !*state.exists.lock() {
        return Err("No browser exists".to_owned());
    }

    if state.screenshot_in_progress.swap(true, Ordering::Acquire) {
        return Err("Screenshot already in progress".to_owned());
    }

    let result = {
        #[cfg(target_os = "macos")]
        {
            browser_screenshot_native(&app, &state).await
        }

        #[cfg(not(target_os = "macos"))]
        {
            app.get_webview_window(BROWSER_WINDOW_LABEL).map_or_else(
                || {
                    *state.exists.lock() = false;
                    Err("Browser window not found".to_owned())
                },
                |window| {
                    let url = window
                        .url()
                        .map_or_else(|_| "unknown".to_owned(), |value| value.to_string());
                    let size = window
                        .inner_size()
                        .ok()
                        .map(|inner| (f64::from(inner.width), f64::from(inner.height)));

                    Ok(serde_json::json!({
                        "filePath": null,
                        "metadata": {
                            "url": url,
                            "width": size.map(|(width, _)| width),
                            "height": size.map(|(_, height)| height),
                            "captureMethod": "metadata_fallback"
                        }
                    })
                    .to_string())
                },
            )
        }
    };

    state.screenshot_in_progress.store(false, Ordering::Release);
    result
}

/// macOS-only native screenshot path using `WKWebView.takeSnapshot`.
#[cfg(target_os = "macos")]
async fn browser_screenshot_native(
    app: &AppHandle,
    state: &State<'_, Arc<BrowserWindowState>>,
) -> Result<String> {
    let (tx, rx) = sync_channel::<StdResult<Vec<u8>, String>>(1);
    let app_for_main = app.clone();

    app.run_on_main_thread(move || {
        let Some(window) = app_for_main.get_webview_window(BROWSER_WINDOW_LABEL) else {
            let _ = tx.send(Err("Browser window not found".to_owned()));
            return;
        };

        match window.ns_window() {
            Ok(ns_window) => {
                orbit_plugin_decorum::capture_browser_screenshot(ns_window, tx);
            },
            Err(e) => {
                let _ = tx.send(Err(format!("Failed to get NSWindow handle: {e}")));
            },
        }
    })
    .map_err(|e| format!("Failed to dispatch to main thread: {e}"))?;

    let result = spawn_blocking(move || rx.recv_timeout(Duration::from_secs(10)))
        .await
        .map_err(|e| format!("Screenshot task panicked: {e}"))?
        .map_err(|_timeout| "Screenshot capture timed out after 10 seconds".to_owned())?;

    let bytes = result.map_err(|e| {
        if e.contains("Browser window not found") {
            *state.exists.lock() = false;
        }
        format!("Screenshot capture failed: {e}")
    })?;

    let tmp = tempfile::Builder::new()
        .prefix("orbit-screenshot-")
        .suffix(".jpg")
        .tempfile_in(env::temp_dir())
        .map_err(|e| format!("Failed to create temp file: {e}"))?;

    fs::write(tmp.path(), &bytes).map_err(|e| format!("Failed to write screenshot: {e}"))?;

    let (_, file_path) = tmp
        .keep()
        .map_err(|e| format!("Failed to persist temp file: {e}"))?;

    // Browser may have been closed while capture was running.
    if !*state.exists.lock() {
        let _ = fs::remove_file(&file_path);
        return Err("Browser closed during screenshot capture".to_owned());
    }

    let evicted = {
        let mut files = state.screenshot_files.lock();
        let old = (files.len() >= MAX_SCREENSHOT_FILES).then(|| files.remove(0));
        files.push(file_path.clone());
        old
    };
    if let Some(path) = evicted {
        let _ = fs::remove_file(path);
    }

    Ok(serde_json::json!({
        "filePath": file_path.to_string_lossy(),
        "metadata": {
            "captureMethod": "native_wkwebview",
            "byteLength": bytes.len(),
            "mimeType": "image/jpeg"
        }
    })
    .to_string())
}

/// Open DevTools for the browser.
///
/// Because the browser is a separate window (not a child webview), it has
/// its own independent Web Inspector that can be docked!
///
/// Available in both debug and release builds (requires `devtools` Cargo feature).
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

    window.open_devtools();
    log::info!("Opened DevTools for browser window (independent inspector!)");
    Ok(())
}

/// Open DevTools for the main application window.
///
/// Available in both debug and release builds (requires `devtools` Cargo feature).
#[tauri::command]
pub async fn app_open_devtools(app: AppHandle) -> Result<()> {
    use tauri::Manager as _;

    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    window.open_devtools();
    log::info!("Opened DevTools for main application window");
    Ok(())
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

    // Clear hidden flag so browser_set_bounds resumes accepting updates.
    *state.hidden.lock() = false;

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

    // No show() or orderFront needed here.
    //
    // Since browser_hide() never calls window.hide() (to preserve the
    // parent-child NSWindow relationship), the window is always "visible"
    // to macOS — just offscreen at (-10000, -10000) when hidden. Restoring
    // bounds above is sufficient to make it visible to the user again.
    //
    // The parent-child relationship keeps the browser above the main window.
    // If z-ordering ever drifts, the focus handler in lib.rs calls
    // orderFront:nil on the main thread (NSWindow APIs require main thread;
    // this command runs on a Tokio thread, so we must not call them here).

    Ok(())
}

/// Focus the browser window so it becomes the key window and receives input.
///
/// Used after injecting element selection (react-grab) so the cursor changes
/// immediately without the user needing to click inside the browser area first.
///
/// Safe to call on a visible child window — the parent-child relationship
/// (established by `addChildWindow:ordered:NSWindowAbove`) is preserved because
/// we never called `orderOut:` before this.
#[tauri::command]
pub async fn browser_focus(
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
        .set_focus()
        .map_err(|e| format!("Failed to focus browser: {e}"))?;

    Ok(())
}

/// Hide the browser window by moving it offscreen.
///
/// **Important:** We do NOT call `window.hide()` (which maps to `NSWindow.orderOut:` on
/// macOS). `orderOut:` removes the window from the parent's child window list, breaking
/// the parent-child relationship established by `addChildWindow:ordered:NSWindowAbove`.
/// When `window.show()` (`makeKeyAndOrderFront:`) is later called, the window reappears
/// as an **independent** window instead of a child — causing it to go behind the parent
/// when the user clicks the main app.
///
/// Instead, we move the window offscreen and shrink it to 1x1. This makes it invisible
/// to the user while preserving the parent-child relationship, so the browser correctly
/// stays above the parent window when restored.
#[tauri::command]
pub async fn browser_hide(app: AppHandle, state: State<'_, Arc<BrowserWindowState>>) -> Result<()> {
    if !*state.exists.lock() {
        return Err("No browser exists".to_owned());
    }

    let window = app
        .get_webview_window(BROWSER_WINDOW_LABEL)
        .ok_or("Browser window not found")?;

    // Mark as hidden so browser_set_bounds skips position updates
    // (prevents ResizeObserver from moving the window back on-screen).
    *state.hidden.lock() = true;

    // Move offscreen and shrink — but do NOT call window.hide().
    // See doc comment above for why hide() must be avoided.
    let _ = window.set_position(LogicalPosition::new(-10_000.0_f64, -10_000.0_f64));
    let _ = window.set_size(LogicalSize::new(1.0_f64, 1.0_f64));

    Ok(())
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
///
/// # Deprecation Note (Code Review Cycle 1, Codex Issue #3)
///
/// The `timeout_ms` parameter was previously ignored. It has been removed to
/// avoid misleading callers. This function now always uses `browser_eval`'s
/// 30-second timeout (defined by `JS_EVAL_TIMEOUT`).
///
/// If custom timeouts are needed, consider extending `browser_eval` to accept
/// a timeout parameter.
#[tauri::command]
pub async fn browser_eval_async(
    script: String,
    app: AppHandle,
    state: State<'_, Arc<BrowserWindowState>>,
    result_state: State<'_, Arc<BrowserResultState>>,
) -> Result<String> {
    browser_eval(script, app, state, result_state).await
}

fn build_wait_for_selector_script(selector: &str, state: &str) -> Result<String> {
    let selector_json =
        serde_json::to_string(selector).map_err(|e| format!("Invalid selector: {e}"))?;
    let state_json = serde_json::to_string(state).map_err(|e| format!("Invalid state: {e}"))?;

    Ok(format!(
        "return (() => {{
            const element = document.querySelector({selector_json});
            const desiredState = {state_json};
            const isVisible = (node) => {{
                if (!(node instanceof Element)) {{
                    return false;
                }}
                const style = window.getComputedStyle(node);
                if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') === 0) {{
                    return false;
                }}
                const rect = node.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            }};

            switch (desiredState) {{
                case 'attached':
                    return element !== null;
                case 'detached':
                    return element === null;
                case 'hidden':
                    return element !== null && !isVisible(element);
                case 'visible':
                    return element !== null && isVisible(element);
                default:
                    throw new Error(`Invalid wait state: ${{desiredState}}`);
            }}
        }})();"
    ))
}

fn build_wait_for_url_script(url_pattern: &str) -> Result<String> {
    let pattern_json =
        serde_json::to_string(url_pattern).map_err(|e| format!("Invalid URL pattern: {e}"))?;

    Ok(format!(
        "return (() => {{
            const currentUrl = location.href;
            const pattern = {pattern_json};
            const lastSlash = pattern.lastIndexOf('/');
            const looksLikeRegex = pattern.startsWith('/') && lastSlash > 0;

            if (looksLikeRegex) {{
                const source = pattern.slice(1, lastSlash);
                const flags = pattern.slice(lastSlash + 1);
                try {{
                    const regex = new RegExp(source, flags);
                    return {{
                        matched: regex.test(currentUrl),
                        currentUrl,
                        regexError: null,
                    }};
                }} catch (error) {{
                    return {{
                        matched: false,
                        currentUrl,
                        regexError: error?.message || String(error),
                    }};
                }}
            }}

            return {{
                matched: currentUrl === pattern,
                currentUrl,
                regexError: null,
            }};
        }})();"
    ))
}

/// Wait until a selector reaches the requested DOM state.
#[tauri::command]
pub async fn browser_wait_for_selector(
    selector: String,
    state: Option<String>,
    timeout: Option<u64>,
    app: AppHandle,
    browser_state: State<'_, Arc<BrowserWindowState>>,
    result_state: State<'_, Arc<BrowserResultState>>,
) -> Result<()> {
    let desired_state = state.unwrap_or_else(|| "visible".to_owned());
    let timeout_duration = normalize_wait_timeout(timeout);
    let poll_script = build_wait_for_selector_script(&selector, &desired_state)?;
    let poll_interval = Duration::from_millis(WAIT_POLL_INTERVAL_MS);
    let started_at = Instant::now();
    let mut ticker = interval(poll_interval);

    loop {
        let raw =
            browser_eval_direct_inner(&poll_script, &app, &browser_state, &result_state).await?;
        let matched = serde_json::from_str::<bool>(&raw)
            .map_err(|e| format!("Failed to parse selector wait result: {e}"))?;
        if matched {
            return Ok(());
        }

        if started_at.elapsed() >= timeout_duration {
            return Err(format!(
                "browser_wait_for_selector: selector '{selector}' not found after {}ms (state: {desired_state})",
                timeout_duration.as_millis()
            ));
        }

        let _ = ticker.tick().await;
    }
}

/// Wait until the current browser URL matches an exact string or regex pattern.
#[tauri::command]
pub async fn browser_wait_for_url(
    url: String,
    timeout: Option<u64>,
    app: AppHandle,
    browser_state: State<'_, Arc<BrowserWindowState>>,
    result_state: State<'_, Arc<BrowserResultState>>,
) -> Result<()> {
    let timeout_duration = normalize_wait_timeout(timeout);
    let poll_script = build_wait_for_url_script(&url)?;
    let poll_interval = Duration::from_millis(WAIT_POLL_INTERVAL_MS);
    let started_at = Instant::now();
    let mut ticker = interval(poll_interval);

    loop {
        let raw =
            browser_eval_direct_inner(&poll_script, &app, &browser_state, &result_state).await?;
        let poll_result = serde_json::from_str::<UrlWaitResult>(&raw)
            .map_err(|e| format!("Failed to parse URL wait result: {e}"))?;

        if let Some(error) = poll_result.regex_error {
            return Err(format!("Invalid URL pattern: {error}"));
        }
        if poll_result.matched {
            return Ok(());
        }

        if started_at.elapsed() >= timeout_duration {
            return Err(format!(
                "browser_wait_for_url: URL did not match '{url}' after {}ms (current: {})",
                timeout_duration.as_millis(),
                poll_result.current_url
            ));
        }

        let _ = ticker.tick().await;
    }
}

#[cfg(test)]
mod screenshot_cleanup_tests {
    use super::*;
    use std::fs;

    fn make_state() -> BrowserWindowState {
        BrowserWindowState::default()
    }

    #[tokio::test]
    async fn cleanup_deletes_tracked_files() {
        let state = make_state();
        let tempdir = tempfile::tempdir().ok();
        assert!(tempdir.is_some());
        let Some(tempdir) = tempdir else {
            return;
        };

        let p1 = tempdir.path().join("a.jpg");
        let p2 = tempdir.path().join("b.jpg");
        let _ = fs::write(&p1, b"img1");
        let _ = fs::write(&p2, b"img2");
        assert!(p1.exists());
        assert!(p2.exists());

        {
            let mut files = state.screenshot_files.lock();
            files.push(p1.clone());
            files.push(p2.clone());
        }

        cleanup_screenshot_files(&state).await;

        assert!(!p1.exists());
        assert!(!p2.exists());
        assert!(state.screenshot_files.lock().is_empty());
    }

    #[tokio::test]
    async fn eviction_deletes_oldest_at_capacity() {
        let state = make_state();
        let tempdir = tempfile::tempdir().ok();
        assert!(tempdir.is_some());
        let Some(tempdir) = tempdir else {
            return;
        };

        for i in 0..MAX_SCREENSHOT_FILES {
            let path = tempdir.path().join(format!("{i}.jpg"));
            let _ = fs::write(&path, b"img");
            state.screenshot_files.lock().push(path);
        }

        let new_path = tempdir.path().join("new.jpg");
        let _ = fs::write(&new_path, b"img");
        assert!(new_path.exists());
        let evicted = {
            let mut files = state.screenshot_files.lock();
            let old = (files.len() >= MAX_SCREENSHOT_FILES).then(|| files.remove(0));
            files.push(new_path);
            old
        };
        if let Some(path) = evicted {
            let _ = fs::remove_file(path);
        }

        let files = state.screenshot_files.lock();
        assert_eq!(files.len(), MAX_SCREENSHOT_FILES);
        assert!(!tempdir.path().join("0.jpg").exists());
        let head = files.first();
        assert!(head.is_some());
        let Some(head) = head else {
            return;
        };
        assert_eq!(*head, tempdir.path().join("1.jpg"));
    }

    #[tokio::test]
    async fn cleanup_is_noop_when_empty() {
        let state = make_state();
        cleanup_screenshot_files(&state).await;
        assert!(state.screenshot_files.lock().is_empty());
    }
}

#[cfg(test)]
mod eval_result_tests {
    use super::*;
    use regex::Regex;

    #[tokio::test]
    async fn handle_eval_result_url_completes_small_results() {
        let state = BrowserResultState::new();
        let receiver = state.register("req-small".to_owned());
        let url = tauri::Url::parse(
            "orbit-eval://result?id=req-small&success=true&data=%7B%22ok%22%3Atrue%7D",
        );
        assert!(url.is_ok());
        let Some(url) = url.ok() else {
            return;
        };

        assert!(handle_eval_result_url(&url, &state));

        let result = receiver.await;
        assert!(result.is_ok());
        let Some(result) = result.ok() else {
            return;
        };
        assert_eq!(result, Ok("{\"ok\":true}".to_owned()));
    }

    #[tokio::test]
    async fn large_result_flow_waits_for_event_payload() {
        let state = BrowserResultState::new();
        let receiver = state.register("req-large".to_owned());
        let url = tauri::Url::parse("orbit-eval://result?id=req-large&success=true&large=true");
        assert!(url.is_ok());
        let Some(url) = url.ok() else {
            return;
        };

        assert!(handle_eval_result_url(&url, &state));
        handle_large_eval_result_payload(
            r#"{"evalId":"req-large","data":"{\"snapshot\":true}"}"#,
            &state,
        );

        let result = receiver.await;
        assert!(result.is_ok());
        let Some(result) = result.ok() else {
            return;
        };
        assert_eq!(result, Ok("{\"snapshot\":true}".to_owned()));
    }

    #[test]
    fn normalize_wait_timeout_uses_default_and_cap() {
        assert_eq!(
            normalize_wait_timeout(None),
            Duration::from_millis(DEFAULT_WAIT_TIMEOUT_MS)
        );
        assert_eq!(
            normalize_wait_timeout(Some(0)),
            Duration::from_millis(DEFAULT_WAIT_TIMEOUT_MS)
        );
        assert_eq!(
            normalize_wait_timeout(Some(MAX_WAIT_TIMEOUT_MS + 5_000)),
            Duration::from_millis(MAX_WAIT_TIMEOUT_MS)
        );
        assert_eq!(
            normalize_wait_timeout(Some(42_000)),
            Duration::from_millis(42_000)
        );
    }

    #[test]
    fn build_browser_eval_direct_wrapper_omits_new_function() {
        let wrapper = build_browser_eval_direct_wrapper(
            "\"eval-1\"",
            "return { ok: true };",
            SMALL_EVAL_RESULT_LIMIT_CHARS,
            LARGE_EVAL_RESULT_LIMIT_CHARS,
        );

        assert!(!wrapper.contains("new Function"));
        assert!(wrapper.contains("const __result = await (async function() {"));
    }

    #[test]
    fn build_browser_eval_direct_wrapper_round_trips_runtime_source() {
        let wrapper = build_browser_eval_direct_wrapper(
            "\"eval-2\"",
            ORBIT_RUNTIME_SCRIPT,
            SMALL_EVAL_RESULT_LIMIT_CHARS,
            LARGE_EVAL_RESULT_LIMIT_CHARS,
        );

        assert!(wrapper.contains("const RUNTIME_VERSION = '1.0.0';"));
        assert!(wrapper.contains("window.__orbit = runtime;"));
    }

    #[test]
    fn build_browser_eval_direct_wrapper_handles_closing_tokens_in_script_body() {
        let script_body = "const marker = '})();'; return marker;";
        let wrapper = build_browser_eval_direct_wrapper(
            "\"eval-3\"",
            script_body,
            SMALL_EVAL_RESULT_LIMIT_CHARS,
            LARGE_EVAL_RESULT_LIMIT_CHARS,
        );

        assert!(wrapper.contains(script_body));
        assert!(wrapper.ends_with("})();"));
    }

    #[test]
    fn orbit_runtime_method_round_trips_all_variants() {
        for method in OrbitRuntimeMethod::all() {
            let round_trip = OrbitRuntimeMethod::from_input(method.as_js_name());
            assert_eq!(round_trip, Ok(*method));
        }
    }

    #[test]
    fn orbit_runtime_method_rejects_unknown_and_adversarial_inputs() {
        assert_eq!(
            OrbitRuntimeMethod::from_input("unknown"),
            Err("Unsupported Orbit runtime method: unknown".to_owned())
        );
        assert_eq!(
            OrbitRuntimeMethod::from_input("'); process.exit(1); //"),
            Err("Unsupported Orbit runtime method: '); process.exit(1); //".to_owned())
        );
    }

    #[test]
    fn runtime_allowlist_matches_runtime_public_methods() {
        let pattern = Regex::new(r"(?m)^ {4}([A-Za-z][A-Za-z0-9]*)\([^)]*\) \{$");
        assert!(pattern.is_ok());
        let Some(pattern) = pattern.ok() else {
            return;
        };

        let mut runtime_methods = pattern
            .captures_iter(ORBIT_RUNTIME_SCRIPT)
            .filter_map(|captures| captures.get(1).map(|capture| capture.as_str().to_owned()))
            .filter(|name| name != "getUrl" && name != "getTitle")
            .collect::<Vec<_>>();
        let mut allowlist_methods = OrbitRuntimeMethod::all()
            .iter()
            .map(|method| method.as_js_name().to_owned())
            .collect::<Vec<_>>();

        runtime_methods.sort_unstable();
        runtime_methods.dedup();
        allowlist_methods.sort_unstable();

        assert_eq!(runtime_methods, allowlist_methods);
    }

    #[test]
    fn expected_runtime_version_matches_bundled_runtime() {
        assert_eq!(expected_orbit_runtime_version(), Ok("1.0.0"));
    }

    #[test]
    fn browser_get_url_requires_existing_browser_state() {
        let state = BrowserWindowState::default();
        let result = ensure_browser_exists(&state);
        assert_eq!(result, Err("No browser exists".to_owned()));
    }
}
