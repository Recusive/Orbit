# Fix `browser_open` + Implement Real Screenshot Capture

## Context

After fixing Bug 1 (`eval()` → `new Function()`) and Bug 2 (`about:blank` console capture timeout), 12 of 13 browser tools now work. Two remaining issues:

1. **`browser_open` ❌** — Stale `isActive` from localStorage → navigates non-existent window
2. **`browser_screenshot` ⚠️** — Returns metadata only, not actual pixels. Claude SDK accepts images, so the agent needs real screenshots.

### Triage of all ⚠️/❌ tools

| Tool                    | Verdict                                           | Action                 |
| ----------------------- | ------------------------------------------------- | ---------------------- |
| `browser_open` ❌       | Stale localStorage state bug                      | **Fix below (Part 1)** |
| `browser_screenshot` ⚠️ | Metadata-only, needs pixel capture                | **Fix below (Part 2)** |
| `browser_type` ⚠️       | Expected behavior (no matching input)             | None                   |
| `browser_eval` ⚠️       | Expected behavior (page state reset after reload) | None                   |

---

## Part 1: Fix `browser_open` Stale State

### Root Cause

`browser-tool-handler.ts:262` reads `useBrowserStore.getState().isActive`, hydrated from localStorage. After app restart, `isActive` persists as `true` with no actual WebKit window → `browserNavigate(url)` → Rust returns `Err("No browser exists")`.

BrowserPanel's `useLayoutEffect` (line 46-60) resets stale state, but only on mount — AFTER the tool handler has already failed.

### 1a. Fix stale `isActive` in both `browser_open` and `browser_navigate` handlers

**File**: `apps/agent/src/hooks/agent/handlers/browser-tool-handler.ts`

Replace `browserState.isActive` with `browserHas()` (queries Rust for actual window existence). Apply to **both** `browser_open` (line 262) and `browser_navigate` (line 315) handlers identically.

```typescript
// BEFORE (both handlers):
const browserState = useBrowserStore.getState();
if (browserState.isActive) {
  await browserNavigate(url);
} else {
  useBrowserStore.getState().setPendingNavigationUrl(url);
}

// AFTER (both handlers):
const exists = await browserHas();
if (exists) {
  await browserNavigate(url);
} else {
  // Clean up stale localStorage state if it says active but Rust says no window
  if (useBrowserStore.getState().isActive) {
    useBrowserStore.getState().reset();
    useBrowserLifecycleStore.getState().reset();
  }
  useBrowserStore.getState().setPendingNavigationUrl(url);
}
```

### 1b. Add retry to auto-launch useEffect

**File**: `apps/agent/src/components/browser/browser-panel.tsx`

Replace single-shot auto-launch `useEffect` (lines 122-127) with RAF-based retry. On first mount, the viewport div may not have valid dimensions yet (width < 10), causing `handleLaunchBrowser()` to bail with no retry.

```typescript
useEffect(() => {
  if (!pendingUrl || isActive || isCreating) return;

  let rafId: number | null = null;
  let observer: ResizeObserver | null = null;
  const MAX_RETRIES = 20; // ~330ms at 60fps
  let retries = 0;
  let launched = false;

  const tryLaunch = (): void => {
    if (launched || !viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) {
      if (retries < MAX_RETRIES) {
        retries++;
        rafId = requestAnimationFrame(tryLaunch);
        return;
      }
      // RAF budget exhausted — fall back to ResizeObserver
      logger.warn('Browser auto-launch: viewport not ready after RAF retries, waiting for resize');
      observer = new ResizeObserver(() => {
        if (!viewportRef.current) return;
        const r = viewportRef.current.getBoundingClientRect();
        if (r.width >= 10 && r.height >= 10) {
          observer?.disconnect();
          launched = true;
          handleLaunchBrowser();
        }
      });
      observer.observe(viewportRef.current);
      return;
    }
    launched = true;
    handleLaunchBrowser();
  };

  rafId = requestAnimationFrame(tryLaunch);
  return (): void => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    observer?.disconnect();
  };
}, [pendingUrl, isActive, isCreating, handleLaunchBrowser]);
```

---

## Part 2: Implement Real Screenshot Capture

### Approach: Native `WKWebView.takeSnapshot` via objc2 (macOS), metadata-only fallback (other platforms)

Use the native macOS `WKWebView.takeSnapshotWithConfiguration:completionHandler:` API to capture actual rendered pixels. On non-macOS platforms, fall back to metadata-only via Tauri's `WebviewWindow` API (`window.url()` + `window.inner_size()` — no eval, no timeout risk).

### Why native instead of html2canvas

|                                 | html2canvas (rejected)                            | Native takeSnapshot (chosen)                      |
| ------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| **CSP**                         | Blocked on most real sites (GitHub, Google, etc.) | N/A — native API, no JS involved                  |
| **Captures WebGL/canvas/video** | No — DOM reconstruction only                      | Yes — actual pixel capture                        |
| **External dependency**         | ~90KB bundled library                             | Zero — uses existing `objc2` dep                  |
| **Size limit**                  | orbit-eval:// URL ~500KB cap                      | Normal Tauri IPC — no cap                         |
| **Fidelity**                    | Approximate DOM recreation                        | Exact rendered output                             |
| **Complexity**                  | JS injection + size guards + CSP bypass           | One Rust command                                  |
| **Cross-platform**              | Works everywhere (JS-based)                       | macOS only; other platforms get metadata fallback |

### Existing infrastructure

The codebase already has everything needed:

1. **`objc2` v0.6 + `msg_send!`** — used extensively in `orbit-plugin-decorum` (`window_order.rs`, `promotion.rs`)
2. **`find_wk_web_view()`** — `promotion.rs:382-408` already walks `[NSApplication windows]` → contentView → recursive subview search to find WKWebView instances
3. **Async result bridging** — `browser_eval` in `mod.rs` already uses `oneshot` channels to bridge async callbacks to Tokio
4. **`app.run_on_main_thread()`** — already used in `mod.rs:417` for corner radius. `takeSnapshot` must also be called from the main thread

### Data flow

```
MCP tool call → bridge.sendRequest('browser_screenshot')
  → browser:tool_request event → frontend handler
  → invoke('browser_screenshot') → Tauri command (Rust)
  → #[cfg(target_os = "macos")]:
      run_on_main_thread (closure):
        get_webview_window(label) → window.ns_window() → *mut c_void
        → find_wk_web_view_in_window(ns_window) → walks that window's view tree
        → [WKWebView takeSnapshotWithConfiguration:completionHandler:]
        → completionHandler: NSImage → NSBitmapImageRep → JPEG NSData → Vec<u8>
        → std::sync::mpsc::SyncSender → channel
      tokio::spawn_blocking(rx.recv_timeout) → base64 encode → return via Tauri IPC
  → #[cfg(not(target_os = "macos"))]:
      get_webview_window → window.url() + window.inner_size() → metadata JSON
  → frontend: precondition errors → { success: false }
             capture failures → { success: true, result: { image: null, metadata } }
             capture success  → { success: true, result: { image, metadata } }
  → bridge MCP server returns [{ type: 'image', data, mimeType }, { type: 'text', text: metadata }]
  → Claude SDK receives image content block → agent can "see" the page
```

### 2a. Add native screenshot capture to decorum plugin

**File**: `crates/plugins/decorum/src/screenshot.rs` (new)

The screenshot module accepts an explicit NSWindow pointer (extracted from Tauri's `WebviewWindow` by the caller) and walks only that window's view hierarchy to find the WKWebView. This avoids the ambiguity of walking all NSApplication windows and guarantees we capture the correct browser window — even if multiple child windows exist.

```rust
//! Native WKWebView screenshot capture via `takeSnapshotWithConfiguration:completionHandler:`.
//!
//! The caller (src-tauri) provides the exact NSWindow pointer for the browser
//! child window. We walk its view hierarchy to find the WKWebView, call the
//! native macOS screenshot API, and return JPEG bytes via `std::sync::mpsc`.
//!
//! No tokio dependency — async bridging is the caller's responsibility.

use std::ffi::c_void;
use std::sync::mpsc::SyncSender;

use objc2::msg_send;
use objc2::runtime::{AnyClass, AnyObject};

/// JPEG compression quality (0.0–1.0). 0.7 balances quality and size.
const JPEG_QUALITY: f64 = 0.7;

/// Maximum JPEG output size in bytes (~2MB). Prevents oversized images from
/// inflating IPC transport and Claude API token costs.
const MAX_JPEG_BYTES: usize = 2 * 1024 * 1024;

/// Find the WKWebView inside a specific NSWindow's view hierarchy.
///
/// Takes the raw NSWindow pointer (from Tauri's `WebviewWindow`) and walks
/// its contentView tree. This is deterministic — no heuristic search across
/// all application windows.
fn find_wk_web_view_in_window(ns_window: *mut c_void) -> Option<*mut AnyObject> {
    let wk_class = AnyClass::get(c"WKWebView")?;
    let window = ns_window.cast::<AnyObject>();

    let content_view: *mut AnyObject = unsafe { msg_send![window, contentView] };
    if content_view.is_null() {
        return None;
    }

    find_wk_recursive(content_view, wk_class)
}

/// Recursively search a view hierarchy for a WKWebView.
fn find_wk_recursive(view: *mut AnyObject, wk_class: &AnyClass) -> Option<*mut AnyObject> {
    let is_kind: bool = unsafe { msg_send![view, isKindOfClass: wk_class] };
    if is_kind {
        return Some(view);
    }

    let subviews: *mut AnyObject = unsafe { msg_send![view, subviews] };
    if subviews.is_null() {
        return None;
    }

    let count: usize = unsafe { msg_send![subviews, count] };
    for i in 0..count {
        let subview: *mut AnyObject = unsafe { msg_send![subviews, objectAtIndex: i] };
        if let Some(found) = find_wk_recursive(subview, wk_class) {
            return Some(found);
        }
    }

    None
}

/// Convert an NSImage to JPEG bytes.
///
/// NSImage → TIFFRepresentation → NSBitmapImageRep → JPEG NSData → Vec<u8>
///
/// Returns `Err` with a specific reason on failure, including when the
/// compressed JPEG exceeds `MAX_JPEG_BYTES` (surfaces the actual byte count
/// so the caller/agent can understand why capture fell back to metadata).
fn nsimage_to_jpeg(image: *mut AnyObject) -> Result<Vec<u8>, String> {
    // Get TIFF representation (lossless intermediate)
    let tiff_data: *mut AnyObject = unsafe { msg_send![image, TIFFRepresentation] };
    if tiff_data.is_null() {
        return Err("NSImage TIFFRepresentation returned nil".to_owned());
    }

    // Create bitmap rep from TIFF data
    let bitmap_class = AnyClass::get(c"NSBitmapImageRep")
        .ok_or_else(|| "NSBitmapImageRep class not found".to_owned())?;
    let bitmap_rep: *mut AnyObject =
        unsafe { msg_send![bitmap_class, imageRepWithData: tiff_data] };
    if bitmap_rep.is_null() {
        return Err("Failed to create NSBitmapImageRep from TIFF data".to_owned());
    }

    // Convert to JPEG with compression
    // NSJPEGFileType = 3
    let jpeg_type: usize = 3;

    // Create properties dictionary with compression factor
    let ns_number_class = AnyClass::get(c"NSNumber")
        .ok_or_else(|| "NSNumber class not found".to_owned())?;
    let compression_value: *mut AnyObject =
        unsafe { msg_send![ns_number_class, numberWithDouble: JPEG_QUALITY] };

    let ns_dict_class = AnyClass::get(c"NSDictionary")
        .ok_or_else(|| "NSDictionary class not found".to_owned())?;

    // NSImageCompressionFactor key
    let key = objc2_foundation::NSString::from_str("NSImageCompressionFactor");
    let props: *mut AnyObject = unsafe {
        msg_send![ns_dict_class, dictionaryWithObject: compression_value, forKey: &*key]
    };

    let jpeg_data: *mut AnyObject = unsafe {
        msg_send![bitmap_rep, representationUsingType: jpeg_type, properties: props]
    };
    if jpeg_data.is_null() {
        return Err("JPEG representation returned nil".to_owned());
    }

    // Extract bytes from NSData
    let length: usize = unsafe { msg_send![jpeg_data, length] };
    let bytes_ptr: *const u8 = unsafe { msg_send![jpeg_data, bytes] };
    if bytes_ptr.is_null() || length == 0 {
        return Err("JPEG NSData has null bytes or zero length".to_owned());
    }

    // Guard against oversized images
    if length > MAX_JPEG_BYTES {
        return Err(format!(
            "JPEG size ({length} bytes) exceeds limit ({MAX_JPEG_BYTES} bytes). \
             Page may have very high-resolution or complex visual content."
        ));
    }

    let bytes = unsafe { std::slice::from_raw_parts(bytes_ptr, length) };
    Ok(bytes.to_vec())
}

/// Capture a screenshot of a specific browser window's WKWebView.
///
/// `ns_window` must be the raw `NSWindow *` pointer for the browser child window,
/// obtained from Tauri's `WebviewWindow` handle by the caller.
///
/// Returns JPEG bytes as `Vec<u8>`, or an error string.
///
/// **Must be called from the main thread** (via `app.run_on_main_thread()`).
/// The `SyncSender` bridges the result back to the calling thread/task.
///
/// Uses `std::sync::mpsc::SyncSender` instead of tokio channels because
/// this plugin has no async runtime dependency — async bridging is the
/// caller's responsibility (in src-tauri).
pub fn capture_browser_screenshot(ns_window: *mut c_void, tx: SyncSender<Result<Vec<u8>, String>>) {
    let Some(wk_web_view) = find_wk_web_view_in_window(ns_window) else {
        let _ = tx.send(Err("No browser WKWebView found".to_owned()));
        return;
    };

    // Create WKSnapshotConfiguration (nil = capture full visible area)
    // Passing nil is simplest and captures the entire viewport at device resolution.
    let config: *mut AnyObject = std::ptr::null_mut();

    // Use block2 crate for the Objective-C completion handler.
    // The completion handler receives (NSImage?, NSError?) and fires on the main thread.
    let block = block2::ConcreteBlock::new(move |image: *mut AnyObject, error: *mut AnyObject| {
        let result = if image.is_null() {
            let error_msg = if !error.is_null() {
                let desc: *mut AnyObject = unsafe { msg_send![error, localizedDescription] };
                if !desc.is_null() {
                    let ptr: *const u8 = unsafe { msg_send![desc, UTF8String] };
                    if !ptr.is_null() {
                        unsafe { std::ffi::CStr::from_ptr(ptr.cast()) }
                            .to_string_lossy()
                            .into_owned()
                    } else {
                        "Unknown screenshot error".to_owned()
                    }
                } else {
                    "Unknown screenshot error".to_owned()
                }
            } else {
                "takeSnapshot returned nil image".to_owned()
            };
            Err(error_msg)
        } else {
            nsimage_to_jpeg(image)
        };

        let _ = tx.send(result);
    });
    let block = block.copy();

    unsafe {
        let _: () = msg_send![
            wk_web_view,
            takeSnapshotWithConfiguration: config,
            completionHandler: &*block
        ];
    }
}
```

**File**: `crates/plugins/decorum/src/lib.rs` — add module declaration:

```rust
#[cfg(target_os = "macos")]
mod screenshot;

// Add public re-export:
#[cfg(target_os = "macos")]
pub use screenshot::capture_browser_screenshot;
```

**File**: `crates/plugins/decorum/Cargo.toml` — add `block2` dependency:

```toml
[target.'cfg(target_os = "macos")'.dependencies]
block2 = "0.6"                    # Obj-C block FFI for completion handlers
# ... existing deps ...
```

Note: NO `tokio` or `once_cell` needed in decorum. The plugin uses `std::sync::mpsc::SyncSender` for the callback bridge. The async tokio channel lives in `src-tauri` only.

### 2b. Add Tauri command with explicit cross-platform branches

**File**: `src-tauri/src/commands/browser/mod.rs`

Replace the existing `browser_screenshot` command (which just calls `browser_eval` with a metadata script) with a platform-aware command. macOS gets native capture; other platforms return metadata via Tauri's `WebviewWindow` API (no eval, no timeout risk).

**Key design decisions:**

- **`result_state` removed** from signature — neither platform uses `browser_eval` anymore, so it's fully unused. Removing it avoids `let _ = &result_state;` workarounds.
- **Non-macOS uses `window.url()` + `window.inner_size()`** instead of `browser_eval`. This eliminates the known 30s eval timeout on `about:blank` and removes the `result_state` dependency entirely.
- **Window handle resolved inside `run_on_main_thread`** (macOS) — the NSWindow pointer is extracted on the same thread that handles window close events, eliminating the race between pointer extraction and async dispatch. If the window closes before the closure runs, `get_webview_window` returns `None` and the error is sent via the mpsc channel.

Add `screenshot_in_progress` field to `BrowserWindowState` (existing struct in `mod.rs`):

Add one field to the existing `BrowserWindowState` struct (keep all existing fields — `exists`, `hidden`, `last_bounds`, etc. — unchanged):

```rust
// In BrowserWindowState — ADD this field alongside existing ones:
pub screenshot_in_progress: AtomicBool,  // NEW — concurrency guard
// Initialize with: AtomicBool::new(false)
```

```rust
/// Capture a screenshot of the embedded browser.
///
/// On macOS: Uses native `WKWebView.takeSnapshotWithConfiguration:completionHandler:`
/// to capture actual rendered pixels (WebGL, canvas, video — everything).
/// Returns JSON with base64-encoded JPEG image data + metadata.
///
/// On other platforms: Returns metadata-only via Tauri WebviewWindow API
/// (no JavaScript evaluation — avoids eval timeout on about:blank).
///
/// Only one screenshot request is served at a time. Concurrent calls
/// receive an explicit error rather than piling up main-thread dispatches.
#[tauri::command]
pub async fn browser_screenshot(
    app: AppHandle,
    state: State<'_, Arc<BrowserWindowState>>,
) -> Result<String> {
    if !*state.exists.lock() {
        return Err("No browser exists".to_owned());
    }

    // Concurrency guard — reject if another screenshot is already in flight.
    // AtomicBool::swap returns the previous value; if it was already true,
    // another request is running.
    if state.screenshot_in_progress.swap(true, std::sync::atomic::Ordering::Acquire) {
        return Err("Screenshot already in progress".to_owned());
    }

    // Bind result from platform-specific branch, then always clear the flag
    let result = {
        #[cfg(target_os = "macos")]
        {
            browser_screenshot_native(&app, &state).await
        }

        #[cfg(not(target_os = "macos"))]
        {
            // Non-macOS: metadata via Tauri WebviewWindow API (no eval, no timeout risk).
            // Uses match instead of ? to ensure the concurrency flag is always cleared below.
            match app.get_webview_window(BROWSER_WINDOW_LABEL) {
                Some(window) => {
                    let url = window
                        .url()
                        .map_or_else(|_| "unknown".to_owned(), |u| u.to_string());
                    let size = window
                        .inner_size()
                        .ok()
                        .map(|s| (f64::from(s.width), f64::from(s.height)));

                    Ok(serde_json::json!({
                        "image": null,
                        "metadata": {
                            "url": url,
                            "width": size.map(|(w, _)| w),
                            "height": size.map(|(_, h)| h),
                            "captureMethod": "metadata_fallback"
                        }
                    })
                    .to_string())
                }
                None => {
                    *state.exists.lock() = false;
                    Err("Browser window not found".to_owned())
                }
            }
        }
    };

    // Always clear the concurrency flag, regardless of success or error
    state.screenshot_in_progress.store(false, std::sync::atomic::Ordering::Release);

    result
}

/// macOS-only: Native WKWebView screenshot capture.
///
/// Resolves the browser window handle **inside** `run_on_main_thread` to
/// eliminate the pointer-lifetime race. The main thread is the same thread
/// that processes window close events — so if the closure executes, the
/// window is guaranteed to still exist at that point. If the window closed
/// before dispatch, `get_webview_window` returns `None` and the error is
/// sent via the mpsc channel.
///
/// Accepts `state` to reconcile `state.exists` when window lookup fails,
/// matching non-macOS behavior and `browser_has`/`browser_info` patterns.
#[cfg(target_os = "macos")]
async fn browser_screenshot_native(
    app: &AppHandle,
    state: &State<'_, Arc<BrowserWindowState>>,
) -> Result<String> {
    let (tx, rx) = std::sync::mpsc::sync_channel::<StdResult<Vec<u8>, String>>(1);
    let app_for_main = app.clone();

    // Dispatch to main thread (WKWebView APIs require it).
    // Window handle + NSWindow pointer resolved atomically inside the closure.
    app.run_on_main_thread(move || {
        let Some(window) = app_for_main.get_webview_window(BROWSER_WINDOW_LABEL) else {
            let _ = tx.send(Err("Browser window not found".to_owned()));
            return;
        };

        match window.ns_window() {
            Ok(ns_window) => {
                orbit_plugin_decorum::capture_browser_screenshot(ns_window, tx);
            }
            Err(e) => {
                let _ = tx.send(Err(format!("Failed to get NSWindow handle: {e}")));
            }
        }
    })
    .map_err(|e| format!("Failed to dispatch to main thread: {e}"))?;

    // Wait for result with timeout on a blocking thread (mpsc::recv is blocking)
    let result = tokio::task::spawn_blocking(move || {
        rx.recv_timeout(Duration::from_secs(10))
    })
    .await
    .map_err(|e| format!("Screenshot task panicked: {e}"))?
    .map_err(|_| "Screenshot capture timed out after 10 seconds".to_owned())?;

    // Reconcile stale backend state when window lookup failed on the main thread.
    // This matches the non-macOS branch and browser_has/browser_info behavior.
    let bytes = result.map_err(|e| {
        if e.contains("Browser window not found") {
            *state.exists.lock() = false;
        }
        format!("Screenshot capture failed: {e}")
    })?;

    use base64::Engine as _;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);

    let response = serde_json::json!({
        "image": b64,
        "mimeType": "image/jpeg",
        "metadata": {
            "captureMethod": "native_wkwebview",
            "byteLength": bytes.len(),
        }
    });
    Ok(response.to_string())
}
```

Note: `base64` is already in `src-tauri/Cargo.toml` (workspace dep). `ns_window()` is provided by Tauri 2's `WebviewWindow` on macOS and returns `Result<*mut c_void>`. No new dependencies needed for src-tauri.

### 2c. Update frontend handler — non-eval-first fallback

**File**: `apps/agent/src/hooks/agent/handlers/browser-tool-handler.ts`

The frontend handler calls the Rust command and preserves error semantics: precondition failures ("No browser exists", "Browser window not found") propagate as real tool errors. Only capture-attempted-but-failed errors fall back to success-with-metadata.

```typescript
case 'browser_screenshot': {
  try {
    const raw = await browserScreenshot();
    const result: unknown = JSON.parse(raw);
    return { success: true, result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Precondition failures → real tool errors (not false-positive success)
    if (msg.includes('No browser exists') || msg.includes('Browser window not found')) {
      return { success: false, error: msg };
    }

    // Capture attempted but failed → success with metadata fallback
    const info = await browserInfo().catch(() => null);
    return {
      success: true,
      result: {
        image: null,
        metadata: {
          url: info?.url ?? useBrowserStore.getState().navigation.url ?? 'unknown',
          error: `Screenshot capture failed: ${msg}`,
        },
      },
    };
  }
}
```

### 2d. Update MCP server to return image content blocks

**File**: `agent-bridge/src/browser/browser-mcp-server.ts` (lines 214-237)

Update the `browser_screenshot` tool handler to return an `image` content block when pixel data is available, falling back to text-only metadata.

```typescript
tool(
  'browser_screenshot',
  'Take a screenshot of the current page. Returns a JPEG image of the visible viewport plus page metadata.',
  {},
  async () => {
    logger.debug('Taking browser screenshot');
    try {
      const result = await bridge.sendRequest<{
        image: string | null;
        mimeType?: string;
        metadata: Record<string, unknown>;
      }>('browser_screenshot', {});

      const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [];

      // Add image if capture succeeded
      if (typeof result?.image === 'string' && result.image.length > 0) {
        content.push({
          type: 'image' as const,
          data: result.image,
          mimeType: result.mimeType ?? 'image/jpeg',
        });
      }

      // Always include metadata as text
      content.push({
        type: 'text' as const,
        text: safeStringify(result?.metadata ?? result),
      });

      return { content };
    } catch (error: unknown) {
      return {
        content: [{ type: 'text' as const, text: `Failed: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }
),
```

---

## Files Modified

| File                                                          | Change                                                                              | Type     |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------- |
| `apps/agent/src/hooks/agent/handlers/browser-tool-handler.ts` | Fix stale `isActive` in both handlers (1a) + screenshot with non-eval fallback (2c) | Modified |
| `apps/agent/src/components/browser/browser-panel.tsx`         | RAF retry for auto-launch (1b)                                                      | Modified |
| `crates/plugins/decorum/src/screenshot.rs`                    | Native WKWebView screenshot via objc2 + `std::sync::mpsc` (2a)                      | **New**  |
| `crates/plugins/decorum/src/lib.rs`                           | Add screenshot module + re-export (2a)                                              | Modified |
| `crates/plugins/decorum/Cargo.toml`                           | Add `block2` dep (2a)                                                               | Modified |
| `src-tauri/src/commands/browser/mod.rs`                       | Cross-platform screenshot with native macOS + Tauri API metadata fallback (2b)      | Modified |
| `agent-bridge/src/browser/browser-mcp-server.ts`              | Return image content blocks (2d)                                                    | Modified |

## Verification

### Automated checks

1. `cargo check` — Compiles on macOS (native path) and should compile on Linux/Windows (eval fallback path)
2. `bun run typecheck` — No TS errors
3. `bun run lint` — No lint warnings

### Automated tests (MANDATORY — must pass before merge)

4. **Frontend handler tests** (`apps/agent/src/__tests__/hooks/agent/handlers/browser-tool-handler.test.ts`):
   - `browser_screenshot` returns parsed result on success
   - `browser_screenshot` returns `{ success: false }` for precondition errors ("No browser exists", "Browser window not found")
   - `browser_screenshot` returns `{ success: true, result: { image: null, metadata } }` when capture fails but browser exists
   - `browser_open` calls `browserHas()` instead of reading store `isActive`
   - `browser_open` resets stale store state when `browserHas()` returns false but store says active

5. **MCP server tests** (`agent-bridge/src/__tests__/browser-mcp-screenshot.test.ts`):
   - Screenshot tool returns `[image, text]` content when result has image
   - Screenshot tool returns `[text]` content when result has `image: null`
   - Screenshot tool returns error content on bridge failure

6. **Rust screenshot module** (unit tests in `screenshot.rs`):
   - `find_wk_web_view_in_window()` returns `None` when no WKWebView in view tree
   - `nsimage_to_jpeg()` returns `None` for null input
   - Cross-platform: `browser_screenshot` command compiles and returns metadata on non-macOS

### Local integration test (MANDATORY — must verify before merge)

7. **macOS end-to-end**: Launch app → open browser → navigate to a page → call `browser_screenshot` via MCP tool → verify Claude agent receives an image content block (not just text metadata). This validates the full chain: frontend handler → Tauri command → main-thread dispatch → WKWebView.takeSnapshot → mpsc → base64 → Tauri IPC → MCP image block → SDK.

### Manual tests

8. Manual test:
   - Quit and relaunch app → `browser_open` should succeed (no stale state)
   - Navigate to github.com (strict CSP) → `browser_screenshot` should return an image
   - Navigate to a simple website → `browser_screenshot` should return an image
   - Check Claude agent can "see" the screenshot (image block in conversation)
   - Screenshot a page with canvas/WebGL elements → should capture correctly
   - Screenshot on about:blank → should return metadata-only (no eval timeout)
   - Test all 13 browser tools end-to-end

9. After agent-bridge changes: `cd agent-bridge && bun run build:dev` then restart Tauri

## Audit Log

**2026-03-04 — Initial audit (reviews/audit-plan.md)**

Three critical issues identified in original html2canvas approach:

1. CDN script injection blocked by target site CSP
2. URL-encoded base64 may exceed WebKit URL limits
3. Unsafe `e.message` in catch block

**2026-03-04 — Architecture revision: html2canvas → native takeSnapshot**

Replaced the entire Part 2 approach. Instead of injecting html2canvas via JavaScript (fragile, CSP-blocked, DOM-only), use native `WKWebView.takeSnapshotWithConfiguration:completionHandler:` via the existing `objc2` FFI infrastructure in `orbit-plugin-decorum`. This:

- Eliminates all three critical audit issues (no JS injection = no CSP, no URL transport = no size limit, no JS catch = no error handling issue)
- Captures actual rendered pixels (WebGL, canvas, video, iframes)
- Requires zero external dependencies (reuses existing `objc2` v0.6)
- Follows established codebase patterns (`find_wk_web_view` from promotion.rs, `oneshot` bridging from browser_eval, `run_on_main_thread` from corner radius)
- Reduces frontend handler to a single Tauri invoke call

**2026-03-04 — Second audit: 4 critical issues fixed**

1. **Async bridge inconsistency** — Removed `tokio::sync::oneshot` from decorum plugin. Plugin now uses `std::sync::mpsc::SyncSender` (no async runtime dep). Tokio bridging stays in `src-tauri` via `tokio::task::spawn_blocking`.
2. **Cross-platform build path** — Added explicit `#[cfg(target_os = "macos")]` / `#[cfg(not)]` branches in `browser_screenshot` command. Non-macOS preserves current `browser_eval` metadata behavior.
3. **Fallback about:blank timeout** — Replaced eval-first fallback with `browserInfo()` (Tauri invoke, no eval) + store metadata. Eval fallback only attempted as second tier, never on about:blank, with its own catch.
4. **No automated tests** — Added concrete test plan items for frontend handler, MCP content formatting, and Rust module.

**2026-03-04 — Third review: 2 issues fixed**

1. **[P1] `unused` deny on macOS** — `result_state` is only used in the `#[cfg(not(target_os = "macos"))]` branch, but the workspace's `unused = { level = "deny" }` lint would fail on macOS builds. Fixed by adding `let _ = &result_state;` in the macOS branch. Also removed `state` from `browser_screenshot_native` (was passed but never used) — the function now takes `&tauri::WebviewWindow` instead.
2. **[P2] Deterministic WKWebView targeting** — Changed from walking all `NSApplication` windows (parentWindow heuristic could pick the wrong child) to accepting the exact `*mut c_void` NSWindow pointer from the Tauri command. The Tauri command calls `window.ns_window()` on the `WebviewWindow` handle (already looked up by label) and passes it to the plugin. The plugin's `find_wk_web_view_in_window(ns_window)` walks only that window's view hierarchy. This is deterministic — no heuristic search across unrelated windows.

**2026-03-04 — Fourth review (APPROVE WITH CHANGES): 4 issues fixed**

1. **False-positive tool success** — Frontend catch path was converting ALL failures (including precondition errors like "No browser exists") into `{ success: true }`. Fixed by checking error message for precondition strings and returning `{ success: false, error }` for those. Only capture-attempted-but-failed errors fall back to success-with-metadata.
2. **Non-macOS eval timeout** — Non-macOS branch was still routing through `browser_eval`, preserving the known 30s timeout on `about:blank`. Replaced with `window.url()` + `window.inner_size()` (Tauri WebviewWindow API, no eval, no timeout risk). This also makes `result_state` unused on both platforms → removed from command signature entirely.
3. **Pointer lifetime race** — `ns_window` was extracted before `run_on_main_thread` dispatch, leaving a race window if the browser closes between extraction and use. Fixed by resolving the window handle _inside_ the `run_on_main_thread` closure — same thread that processes window close events, so if the closure runs, the window is guaranteed to exist.
4. **Test coverage** — Automated tests elevated from "to be added" to "MANDATORY — must pass before merge". Added mandatory local integration test item for macOS end-to-end flow. Added test case for precondition error semantics.

**2026-03-04 — Edge case hardening (6 audit edge cases addressed)**

| Edge Case                                     | Resolution                                                                                                                                                                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Screenshot with no browser window             | Already handled: `state.exists.lock()` check + precondition error propagation (fix #1)                                                                                                                                                               |
| Browser closes between request and callback   | Fixed in review #4: window handle resolved inside `run_on_main_thread` closure (same thread as close events)                                                                                                                                         |
| Concurrent screenshot requests                | **NEW**: `AtomicBool` concurrency guard on `BrowserWindowState`. Second request gets `"Screenshot already in progress"` error. Flag cleared after every path (bind + store pattern, no `?` early returns).                                           |
| Non-macOS about:blank eval stall              | Fixed in review #4: non-macOS uses `window.url()` + `window.inner_size()`, no eval at all                                                                                                                                                            |
| Viewport never reaches valid dimensions       | **NEW**: RAF retry loop falls back to `ResizeObserver` after budget exhaustion. Logs warning. Observer fires `handleLaunchBrowser` when dimensions become valid. Cleanup on unmount.                                                                 |
| Native JPEG repeatedly exceeds MAX_JPEG_BYTES | **NEW**: `nsimage_to_jpeg` changed from `Option<Vec<u8>>` to `Result<Vec<u8>, String>`. Oversized images produce a specific error message including actual byte count and limit, surfaced through the error chain to the frontend metadata fallback. |

**2026-03-04 — Fifth review (APPROVE WITH CHANGES): 1 critical issue fixed**

1. **macOS stale `state.exists` on window-not-found** — When window lookup fails inside `run_on_main_thread`, the error came back through the mpsc channel but `state.exists` was never reset to `false`. Non-macOS branch did this cleanup, creating an asymmetry that could cause repeated false precondition passes. Fixed by passing `state` into `browser_screenshot_native` and inspecting the channel error: if it contains "Browser window not found", set `*state.exists.lock() = false` before propagating the error. This matches `browser_has`/`browser_info` reconciliation patterns in the existing codebase.

**2026-03-04 — Sixth review (APPROVE WITH CHANGES): 2 critical issues fixed**

1. **Destructive `BrowserWindowState` snippet** — The struct snippet showed only three fields (`exists`, `hidden`, `screenshot_in_progress`), omitting existing fields like `last_bounds`. Fixed by making the snippet additive — shows only the new field to add alongside existing ones.
2. **Undefined `StdResult` in screenshot.rs** — `nsimage_to_jpeg` used `StdResult<Vec<u8>, String>` but `screenshot.rs` has no such alias (that lives in `mod.rs`). Fixed to use plain `Result<Vec<u8>, String>` which resolves to `std::result::Result` in plugin code.
