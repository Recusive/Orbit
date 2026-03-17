# Fix: Browser Screenshot — Save to File Instead of Inline Base64

## Context

The `browser_screenshot` MCP tool captures native WKWebView screenshots (working), but returns the JPEG as base64 text (~200-500KB) through 4 IPC layers. The Claude Agent SDK's `createSdkMcpServer` returns this as an MCP `ImageContent` block, but the image data reaches Claude as **text, not as a vision-compatible image block**. Result: Claude can't "see" the screenshot, and the massive base64 blob overwhelms the context window.

**Fix**: Save the JPEG to a temp file. Return only the file path. Claude uses its built-in `Read` tool — which has a proven image pipeline (`ImageFileOutput`) — to view the screenshot.

---

## Files to Modify (7 files)

| #   | File                                                                     | Change                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src-tauri/src/commands/browser/mod.rs`                                  | Save JPEG to temp file via `tempfile` crate, return `filePath` instead of base64. Update non-macOS fallback to use `filePath: null`. Add `screenshot_files` to `BrowserWindowState`. Add `cleanup_screenshot_files` helper. Call cleanup from both `browser_close` and `browser_create`. |
| 1b  | `src-tauri/Cargo.toml`                                                   | Move `tempfile` from `[dev-dependencies]` to `[dependencies]`                                                                                                                                                                                                                            |
| 2   | `apps/agent/src/lib/api/browser.ts`                                      | Update `BrowserScreenshotInfo` type, update JSDoc, remove dead `browserScreenshotInfo()`                                                                                                                                                                                                 |
| 3   | `apps/agent/src/hooks/agent/handlers/browser-tool-handler.ts`            | Update fallback result shape                                                                                                                                                                                                                                                             |
| 4   | `agent-bridge/src/browser/browser-mcp-server.ts`                         | Return text with file path (remove image content block)                                                                                                                                                                                                                                  |
| 5   | `agent-bridge/src/__tests__/browser-mcp-screenshot.test.ts`              | Update mock data and assertions                                                                                                                                                                                                                                                          |
| 6   | `apps/agent/src/__tests__/unit/hooks/agent/browser-tool-handler.test.ts` | Update mock data and assertions                                                                                                                                                                                                                                                          |

---

## Step 1: Rust — Save JPEG to temp file

**File**: `src-tauri/src/commands/browser/mod.rs`
**Lines**: 781-791

Replace base64 encoding with file write:

```rust
// BEFORE (line 781-791):
let b64 = Base64Standard.encode(&bytes);
Ok(serde_json::json!({
    "image": b64,
    "mimeType": "image/jpeg",
    "metadata": { "captureMethod": "native_wkwebview", "byteLength": bytes.len() }
}).to_string())

// AFTER:
let tmp = tempfile::Builder::new()
    .prefix("orbit-screenshot-")
    .suffix(".jpg")
    .tempfile_in(std::env::temp_dir())
    .map_err(|e| format!("Failed to create temp file: {e}"))?;

std::fs::write(tmp.path(), &bytes)
    .map_err(|e| format!("Failed to write screenshot: {e}"))?;

// Persist the file — keep() returns the canonical (_, PathBuf).
let (_, file_path) = tmp.keep()
    .map_err(|e| format!("Failed to persist temp file: {e}"))?;

// If the browser was torn down while the capture was in-flight, cleanup
// already drained screenshot_files. Check exists (separate lock) THEN push.
// No nested locks — check and release exists before touching screenshot_files.
if !*state.exists.lock() {
    let _ = std::fs::remove_file(&file_path);
    return Err("Browser closed during screenshot capture".to_owned());
}

// Track for cleanup, evicting oldest if at capacity.
let evicted = {
    let mut files = state.screenshot_files.lock();
    let old = if files.len() >= MAX_SCREENSHOT_FILES {
        Some(files.remove(0))
    } else {
        None
    };
    files.push(file_path.clone());
    old
};
if let Some(path) = evicted {
    let _ = std::fs::remove_file(path);
}

Ok(serde_json::json!({
    "filePath": file_path.to_string_lossy(),
    "metadata": {
        "captureMethod": "native_wkwebview",
        "byteLength": bytes.len(),
        "mimeType": "image/jpeg"
    }
}).to_string())
```

Remove unused imports (line 60-61) — `base64` is only used in this file for screenshot encoding:

```rust
// DELETE from browser/mod.rs only:
use base64::engine::general_purpose::STANDARD as Base64Standard;
use base64::Engine as _;
```

> **Note**: Keep `base64` in `Cargo.toml` — it's used by `vault/`, `terminal.rs`, `sf_symbols.rs`, `credentials.rs`, and `files.rs`.

**Add `tempfile` to `[dependencies]`** in `src-tauri/Cargo.toml`. It's currently only in `[dev-dependencies]` (line 82) and not available for production code:

```toml
# src-tauri/Cargo.toml — add to [dependencies] section:
tempfile = { workspace = true }
```

`tempfile` is already defined as a workspace dependency in the root `Cargo.toml` (line 71). No `chrono` dependency changes are required for this refactor.

**Non-macOS fallback** (lines 720-729): Update `"image": null` → `"filePath": null` to keep the response schema consistent across platforms:

```rust
// BEFORE:
Ok(serde_json::json!({
    "image": null,
    "metadata": {
        "url": url,
        "width": size.map(|(width, _)| width),
        "height": size.map(|(_, height)| height),
        "captureMethod": "metadata_fallback"
    }
})
.to_string())

// AFTER:
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
```

**Temp file cleanup** — Add a `screenshot_files` field to `BrowserWindowState` and a shared cleanup helper:

```rust
// In BrowserWindowState struct (line 222-234):
pub screenshot_files: Mutex<Vec<std::path::PathBuf>>,

/// Max tracked screenshot files per browser session. Oldest is evicted on push.
const MAX_SCREENSHOT_FILES: usize = 20;

// Shared cleanup helper (new free function).
// MUST NOT be called while holding exists.lock() — cleanup spins on
// screenshot_in_progress, which the in-flight capture can only clear
// after acquiring exists.lock() (deadlock otherwise).
fn cleanup_screenshot_files(state: &BrowserWindowState) {
    // Wait for any in-flight capture to finish. The WKWebView capture has a
    // 10s hard timeout (recv_timeout in browser_screenshot_native), so bound
    // this wait at 12s to avoid blocking forever on exceptional paths.
    let deadline = std::time::Instant::now() + Duration::from_secs(12);
    while state.screenshot_in_progress.load(Ordering::Acquire) {
        if std::time::Instant::now() >= deadline {
            log::warn!("Timed out waiting for in-flight screenshot during cleanup");
            break;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    let paths: Vec<_> = state.screenshot_files.lock().drain(..).collect();
    for path in paths {
        let _ = std::fs::remove_file(&path);
    }
}
```

Call cleanup from **both** `browser_close` and `browser_create`'s pre-create replacement path:

```rust
// In browser_close (line 534-554) — same two-phase pattern as browser_create.
//
// Must set exists=false BEFORE cleanup. Otherwise: cleanup drains the vec,
// a new screenshot starts (exists is still true), pushes a file, then
// exists goes false — that file is orphaned.
//
// Setting exists=false first:
//  - Prevents new screenshots from starting (guard at line 694 rejects)
//  - In-flight screenshot sees exists=false after capture → self-deletes
//  - cleanup_screenshot_files spins until in-flight clears screenshot_in_progress,
//    then drains any files that were tracked before this call
pub async fn browser_close(
    app: AppHandle,
    state: State<'_, Arc<BrowserWindowState>>,
) -> Result<()> {
    // Phase 1: Gate + mark closed (single lock scope)
    {
        let mut exists = state.exists.lock();
        if !*exists {
            // Still clean up screenshot files from a crashed session
            // where exists was set to false by a failed screenshot.
            drop(exists);
            cleanup_screenshot_files(&state);
            return Err("No browser exists".to_owned());
        }
        *exists = false;
    } // lock released

    // Phase 2: Wait for in-flight screenshot + delete tracked files (no lock held)
    cleanup_screenshot_files(&state);

    // Phase 3: Close window. On failure, restore exists=true so the browser
    // isn't stranded (still open but unreachable by commands).
    if let Some(window) = app.get_webview_window(BROWSER_WINDOW_LABEL) {
        if let Err(e) = window.close() {
            *state.exists.lock() = true;
            return Err(format!("Failed to close browser: {e}"));
        }
    }

    // Phase 4: Reset remaining state (only reached on successful close)
    *state.hidden.lock() = false;
    *state.last_bounds.lock() = None;
    state.screenshot_in_progress.store(false, Ordering::Release);
    log::info!("Closed browser window");
    Ok(())
}

// In browser_create (line 329-340) — two phases to avoid deadlock.
//
// cleanup_screenshot_files spins on screenshot_in_progress. If called while
// holding exists.lock(), an in-flight screenshot that needs exists.lock() to
// clear screenshot_in_progress will deadlock. So: close the window and set
// exists=false first (releasing the lock), THEN run cleanup.
{
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
    }; // exists lock released here

    if needs_cleanup {
        cleanup_screenshot_files(&state);
    }
}
```

**Crash orphans** — If the app crashes before cleanup runs, files remain in the OS temp dir until reboot. This is acceptable (bounded at `MAX_SCREENSHOT_FILES × ~500KB = ~10MB`), consistent with how other desktop apps treat temp files, and not worth adding a startup sweep for.

### Known edge cases (accepted)

**Concurrent `browser_close` / `browser_create` from separate callers.** Both commands are `async` Tauri commands dispatched from the frontend — only one can run at a time per session because the frontend awaits the invoke. Cross-session concurrency is not possible: there's a single `BrowserWindowState` instance, and `parking_lot::Mutex` serializes access. If Tauri ever dispatches both concurrently, the `exists.lock()` in each command serializes them — the second caller sees `exists = false` and either returns `Err` (close) or proceeds without cleanup (create). No additional synchronization needed.

**Cleanup timeout elapses, then capture completes just after.** The 12s timeout in `cleanup_screenshot_files` breaks the spin loop and drains the vec. If the in-flight capture finishes after the drain, it checks `exists` → `false` → self-deletes its file. The file never enters the vec, so nothing is orphaned. If the capture somehow finishes and pushes before the drain (TOCTOU), at most 1 file (~500KB) is orphaned until the next close/create cycle.

**Returned `filePath` consumed after teardown/cleanup.** Cleanup deletes the file from disk. If the model calls Read on the path afterward, the SDK's Read tool returns a file-not-found error. This is a clean failure — the model can retry by taking a new screenshot. The MCP response text already instructs: "Read the file BEFORE closing or recreating the browser."

**Temp-file reads under sandbox/permission constraints.** The SDK's Read tool runs in the agent-bridge sidecar (a standalone Bun binary), which reads files via Node.js `fs` — not through Tauri's filesystem ACL. The OS temp dir (`/tmp` or `$TMPDIR` on macOS) is user-readable. macOS App Sandbox (if enabled for distribution) grants read access to the app's own temp dir. No additional entitlements or Tauri capability scopes are needed.

---

## Step 2: Frontend type — Update `BrowserScreenshotInfo` + remove dead code

**File**: `apps/agent/src/lib/api/browser.ts`
**Lines**: 56-63

```typescript
// BEFORE:
export interface BrowserScreenshotInfo {
  image: string | null;
  mimeType?: string;
  metadata: Record<string, unknown>;
}

// AFTER:
export interface BrowserScreenshotInfo {
  /** Path to saved JPEG file when capture succeeds */
  filePath: string | null;
  /** Capture metadata (always present) */
  metadata: Record<string, unknown>;
}
```

**Also**: Delete the `browserScreenshotInfo()` convenience wrapper (lines 188-198). It's defined but never imported anywhere in the codebase — dead code that would silently return wrong types after this change.

**Also**: Update the JSDoc on `browserScreenshot()` (lines 171-182) to reference `filePath` instead of `image`.

---

## Step 3: Frontend handler — Update fallback shape

**File**: `apps/agent/src/hooks/agent/handlers/browser-tool-handler.ts`
**Lines**: 452-463 (the catch path for capture-failed fallback)

```typescript
// BEFORE (line 455-462):
result: {
  image: null,
  metadata: {
    url: info?.url ?? useBrowserStore.getState().navigation.url,
    error: `Screenshot capture failed: ${message}`,
  },
},

// AFTER:
result: {
  filePath: null,
  metadata: {
    url: info?.url ?? useBrowserStore.getState().navigation.url,
    error: `Screenshot capture failed: ${message}`,
  },
},
```

---

## Step 4: MCP Server — Return file path as text (remove image block)

**File**: `agent-bridge/src/browser/browser-mcp-server.ts`
**Lines**: 214-260

```typescript
tool(
  'browser_screenshot',
  'Take a screenshot of the current browser page. Saves a JPEG to a temp file and returns the path. Use the Read tool on the returned file path to view the image.',
  {},
  async () => {
    logger.debug('Taking browser screenshot');
    try {
      const result = await bridge.sendRequest<{
        filePath?: string | null;
        metadata: Record<string, unknown>;
      }>('browser_screenshot', {});

      const parts: string[] = [];

      if (typeof result.filePath === 'string' && result.filePath.length > 0) {
        parts.push(`Screenshot saved to: ${result.filePath}`);
        parts.push('Use the Read tool to view this image. Read the file BEFORE closing or recreating the browser — the file is cleaned up on close.');
      } else {
        parts.push('Screenshot capture returned metadata only (no image file).');
      }

      parts.push(`Metadata: ${safeStringify(result.metadata)}`);

      return {
        content: [{ type: 'text' as const, text: parts.join('\n') }],
      };
    } catch (error: unknown) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
),
```

Also update the system prompt tool description at **line 569** of `agent-bridge/src/agent/core/agent.ts`:

```
// BEFORE:
- **mcp__orbit-browser__browser_screenshot**: Capture viewport image plus page metadata

// AFTER:
- **mcp__orbit-browser__browser_screenshot**: Save viewport screenshot to temp file — use Read to view the image
```

---

## Step 5: Update tests

### 5a. MCP screenshot test

**File**: `agent-bridge/src/__tests__/browser-mcp-screenshot.test.ts`

- **Line 7-9**: Remove `{ type: 'image'; data: string; mimeType: string }` from `McpToolResponse.content` union — responses are now text-only
- **Line 24-30**: Change mock return type from `{ image, mimeType?, metadata }` to `{ filePath?, metadata }`
- **Test "returns file path + metadata"** (line 48-69): Mock returns `{ filePath: '/tmp/orbit-screenshot-12345.jpg', metadata: {...} }`. Assert single text block containing `"Screenshot saved to:"` and `"Use the Read tool"`
- **Test "returns metadata only"** (line 71-87): Mock returns `{ filePath: null, metadata: {...} }`. Assert text contains `"metadata only"`
- **Error test** (line 89-102): No change

### 5b. Frontend handler test

**File**: `apps/agent/src/__tests__/unit/hooks/agent/browser-tool-handler.test.ts`

- **Test "returns parsed screenshot result"** (line 102-113): Change payload from `{ image: 'base64-image-data', mimeType: ... }` to `{ filePath: '/tmp/orbit-screenshot-12345.jpg', metadata: {...} }`
- **Test "falls back to metadata"** (line 131-152): Change typed result from `{ image: null }` to `{ filePath: null }`, update assertion at line 149

### 5c. Rust cleanup and retention tests

**File**: `src-tauri/src/commands/browser/mod.rs` (inline `#[cfg(test)]` module)

These test `cleanup_screenshot_files` and the eviction logic without touching WKWebView:

```rust
#[cfg(test)]
mod screenshot_cleanup_tests {
    use super::*;
    use std::fs;

    fn make_state() -> BrowserWindowState {
        BrowserWindowState::default()
    }

    #[test]
    fn cleanup_deletes_tracked_files() {
        let state = make_state();
        let dir = tempfile::tempdir().unwrap();
        let p1 = dir.path().join("a.jpg");
        let p2 = dir.path().join("b.jpg");
        fs::write(&p1, b"img1").unwrap();
        fs::write(&p2, b"img2").unwrap();

        state.screenshot_files.lock().push(p1.clone());
        state.screenshot_files.lock().push(p2.clone());
        cleanup_screenshot_files(&state);

        assert!(!p1.exists());
        assert!(!p2.exists());
        assert!(state.screenshot_files.lock().is_empty());
    }

    #[test]
    fn eviction_deletes_oldest_at_capacity() {
        let state = make_state();
        let dir = tempfile::tempdir().unwrap();

        // Fill to MAX_SCREENSHOT_FILES
        for i in 0..MAX_SCREENSHOT_FILES {
            let p = dir.path().join(format!("{i}.jpg"));
            fs::write(&p, b"img").unwrap();
            state.screenshot_files.lock().push(p);
        }

        // Push one more — oldest should be evicted
        let new = dir.path().join("new.jpg");
        fs::write(&new, b"img").unwrap();
        let evicted = {
            let mut files = state.screenshot_files.lock();
            let old = if files.len() >= MAX_SCREENSHOT_FILES {
                Some(files.remove(0))
            } else {
                None
            };
            files.push(new);
            old
        };
        if let Some(path) = evicted {
            let _ = fs::remove_file(path);
        }

        let files = state.screenshot_files.lock();
        assert_eq!(files.len(), MAX_SCREENSHOT_FILES);
        // Oldest (0.jpg) should be gone
        assert!(!dir.path().join("0.jpg").exists());
        // Second oldest (1.jpg) is now head
        assert_eq!(files[0], dir.path().join("1.jpg"));
    }

    #[test]
    fn cleanup_is_noop_when_empty() {
        let state = make_state();
        cleanup_screenshot_files(&state); // Should not panic
        assert!(state.screenshot_files.lock().is_empty());
    }
}
```

Run with: `cargo test screenshot_cleanup`

---

## Verification

1. `cargo check` — Rust compiles (verify `tempfile` resolves from `[dependencies]`, `base64` imports removed cleanly)
2. `cargo test screenshot_cleanup` — Rust cleanup and eviction tests pass
3. `bun run typecheck` — TypeScript compiles
4. `bun run lint` — Zero warnings
5. `cd agent-bridge && bun test` — MCP screenshot tests pass
6. `bun run test` — Frontend handler tests pass
7. **Manual E2E**: `bunx tauri dev` → open browser → navigate to a page → ask agent to take a screenshot → verify agent calls Read on the temp file path → verify Claude can describe what it sees in the image
8. **Cleanup E2E**: Take screenshot → close browser → verify temp file is deleted. Also: take screenshot → open new browser via `browser_create` → verify old temp file is deleted
