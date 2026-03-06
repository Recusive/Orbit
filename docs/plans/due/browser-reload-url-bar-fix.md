# Fix: Browser URL bar shows "about:blank" on reload

## Context

When the user clicks the refresh button in the embedded browser toolbar, the URL bar changes to `about:blank` even though the page reloads correctly. This is a cosmetic bug in the URL bar — the actual page navigation works fine.

## Root Cause

The Rust `on_navigation` callback (`src-tauri/src/commands/browser/mod.rs:425-442`) fires for **every** navigation event, including transient ones during a `location.reload()`. WebKit triggers `on_navigation` with `about:blank` as an intermediate step during reload. This `about:blank` URL is emitted via `browser:navigated` event → bridges to frontend → updates `navigation.url` in `BrowserStore` → URL input shows "about:blank".

The data flow:

1. User clicks Reload → `browser_reload` Rust command → `window.eval("location.reload()")`
2. WebKit fires `on_navigation` with `about:blank` (transient)
3. Rust emits `browser:navigated { url: "about:blank" }`
4. Frontend `tauri-provider.tsx:602-607` bridges to `window.postMessage`
5. `use-browser.ts:107-119` calls `setNavigation({ url: "about:blank" })`
6. `browser-toolbar.tsx:49-53` syncs `urlInput` state from `navigation.url`

## Fix

**File: `src-tauri/src/commands/browser/mod.rs` (line ~425-442)**

In the `on_navigation` callback, filter out `about:blank` URLs before emitting the `browser:navigated` event. The `about:blank` navigation during reload is transient and should not update the frontend URL bar.

```rust
.on_navigation(move |url: &tauri::Url| {
    // Intercept orbit-eval:// callback URLs (eval results, element selection)
    if handle_eval_result_url(url, &result_state_for_nav) {
        return false;
    }
    if handle_element_selected_url(url, &app_for_navigation) {
        return false;
    }

    // Skip transient about:blank navigations (e.g., during location.reload())
    // to prevent the URL bar from flickering to "about:blank"
    if url.as_str() == "about:blank" {
        return true; // Allow navigation but don't update UI
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
```

This is the minimal fix — one guard clause in the Rust navigation handler. No frontend changes needed.

## Files to Modify

1. `src-tauri/src/commands/browser/mod.rs` — Add `about:blank` filter in `on_navigation` callback (~line 434)

## Verification

1. Run `bunx tauri dev`
2. Open the embedded browser and navigate to any URL (e.g., `https://www.mosaic.sh/`)
3. Click the Reload button
4. Verify the URL bar retains the current URL instead of showing `about:blank`
5. Verify the page reloads correctly
6. Verify navigating to `about:blank` explicitly still works (type it in URL bar + Enter)
