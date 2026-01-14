# Embedded Browser Implementation

> **Last Updated:** January 2026
> **Status:** Working
> **Platform:** macOS (WebKit/WKWebView)

This document covers the embedded browser panel implementation in Orbit, including architecture decisions, known issues, and workarounds.

---

## Overview

Orbit includes an embedded browser panel that allows users and AI to browse the web without leaving the application. The browser is **truly embedded** within the Orbit window (not a separate app) using Tauri 2's multi-webview support.

### Key Features

- No separate dock icon (single Orbit app)
- Positioned within a React panel
- Resizes with the panel
- AI can control via Playwright MCP tools
- Auto-closes after idle timeout (5 min warning, 60s grace)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Orbit Window (Tauri Window)                                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Main Webview (React App)                             │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  BrowserPanel Component                         │  │  │
│  │  │  - Calculates bounds for embedded webview       │  │  │
│  │  │  - Shows toolbar, idle warnings                 │  │  │
│  │  │  - Sends bounds updates via ResizeObserver      │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Embedded Browser Webview (Child of Window)           │  │
│  │  - Created via Window.add_child()                     │  │
│  │  - Positioned over BrowserPanel viewport              │  │
│  │  - Uses WebKit (WKWebView) on macOS                   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component                    | Location                               | Responsibility                      |
| ---------------------------- | -------------------------------------- | ----------------------------------- |
| `browser.rs`                 | `src-tauri/src/commands/common/`       | Rust commands for webview lifecycle |
| `browser-panel.tsx`          | `apps/agent/src/components/browser/`   | React UI, bounds calculation        |
| `browser-handlers.ts`        | `apps/agent/src/hooks/agent/handlers/` | Message handlers, delayed resize    |
| `browser-store.ts`           | `apps/agent/src/stores/browser/`       | UI state (viewId, creating, error)  |
| `browser-lifecycle-store.ts` | `apps/agent/src/stores/browser/`       | Lifecycle state, idle tracking      |
| `browser.ts`                 | `apps/agent/src/lib/api/`              | TypeScript API wrappers             |

---

## Tauri 2 Requirements

### Unstable Feature Flag

The embedded browser requires Tauri's `unstable` feature for `WebviewBuilder` and `Window.add_child()`:

```toml
# Cargo.toml
tauri = { version = "2.9", features = ["unstable"] }
```

**Important:** The `unstable` feature only affects API stability guarantees, NOT code safety. It does not enable Rust's `unsafe` keyword.

### Getting the Window

In Tauri 2, windows created from `tauri.conf.json` are `WebviewWindow`s. To add child webviews, you need the underlying `Window`:

```rust
// This works - Window is registered with same label
let main_window = app.get_window("main").ok_or("Main window not found")?;

// Then add child webview
let webview = main_window.add_child(webview_builder, position, size)?;
```

---

## Known Issues & Workarounds

### 1. WKWebView Blank Screen on Creation

**Problem:** On macOS, the embedded webview appears blank after creation until the panel is manually resized.

**Root Cause:** WKWebView doesn't paint immediately after creation. It needs time to initialize its rendering pipeline before it responds to size changes.

**Solution:** Add a delayed resize (200ms) after creation:

```typescript
// browser-handlers.ts
setTimeout(async () => {
  try {
    await browserSetBounds(x, y, width - 1, height - 1);
    await browserSetBounds(x, y, width, height);
  } catch {
    // Ignore errors - this is just to trigger repaint
  }
}, 200);
```

**Why this works:** The delay allows WKWebView to finish initializing. The resize (smaller → correct) triggers a layout recalculation and repaint.

**What didn't work:**

- `webview.show()` - webview was already visible
- `webview.set_focus()` - didn't trigger paint
- `webview.hide()` then `show()` - didn't trigger paint
- Immediate `set_size()` after creation - too early
- Creating with different size then resizing - synchronous, too early

### 2. Border Overlap

**Problem:** The webview overlaps the panel's left border.

**Solution:** Apply a 1px inset to bounds:

```typescript
// browser-panel.tsx
const WEBVIEW_BORDER_INSET = 1;

const bounds = {
  x: Math.round(rect.x) + WEBVIEW_BORDER_INSET,
  y: Math.round(rect.y),
  width: Math.round(rect.width) - WEBVIEW_BORDER_INSET,
  height: Math.round(rect.height),
};
```

### 3. Reset Button Shows Instead of Launch Button

**Problem:** After app restart, the panel shows "Reset Browser State" instead of "Launch Browser".

**Root Cause:** Browser store persists `isActive` to localStorage, but the actual webview was destroyed when the app closed. On restart, the store thinks browser is active but it doesn't exist.

**Solution:** Two fixes applied:

1. **Clean reset function** - Use `cleanInitialState` instead of hydrated `initialState`:

```typescript
// browser-store.ts
const cleanInitialState: BrowserState = {
  viewId: null,
  isActive: false,
  // ...
};

reset: () => {
  set(() => cleanInitialState); // Not initialState!
  localStorage.removeItem('orbit-browser-viewId');
  localStorage.removeItem('orbit-browser-isActive');
};
```

2. **Auto-reset stale state on mount**:

```typescript
// browser-panel.tsx
useEffect(() => {
  if (isActive && lifecycleState === 'idle' && !isCreating) {
    useBrowserStore.getState().reset();
    useBrowserLifecycleStore.getState().reset();
  }
}, []);
```

### 4. "Browser Already Exists" Error

**Problem:** Sometimes creating browser fails with "Browser already exists" even after reset.

**Root Cause:** Frontend state was reset but actual Tauri webview still existed.

**Solution:** Make creation idempotent - close existing browser before creating new one:

```rust
// browser.rs
{
    let mut current = state.current_label.lock();
    if let Some(existing_label) = current.take() {
        if let Some(webview) = app.get_webview(&existing_label) {
            log::info!("Closing existing browser before creating new one");
            let _ = webview.close();
        }
    }
}
```

---

## API Reference

### Rust Commands

| Command                                    | Description                           |
| ------------------------------------------ | ------------------------------------- |
| `browser_create(x, y, width, height, url)` | Create embedded browser at position   |
| `browser_navigate(url)`                    | Navigate to URL                       |
| `browser_set_bounds(x, y, width, height)`  | Reposition/resize browser             |
| `browser_close()`                          | Close browser                         |
| `browser_has()`                            | Check if browser exists               |
| `browser_info()`                           | Get browser info (label, url, active) |
| `browser_eval(script)`                     | Execute JavaScript in browser         |

### TypeScript API

```typescript
import {
  browserCreate,
  browserNavigate,
  browserSetBounds,
  browserClose,
  browserHas,
  browserInfo,
  browserEval,
} from '@/lib/api';
```

### Message Types

| Message            | Direction    | Description                  |
| ------------------ | ------------ | ---------------------------- |
| `browser:create`   | UI → Handler | Create browser with bounds   |
| `browser:created`  | Handler → UI | Browser created successfully |
| `browser:navigate` | UI → Handler | Navigate to URL              |
| `browser:bounds`   | UI → Handler | Update position/size         |
| `browser:clear`    | UI → Handler | Close browser                |
| `browser:error`    | Handler → UI | Error occurred               |

---

## Idle Timeout System

The browser automatically closes after inactivity to save resources.

### Configuration

```typescript
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const WARNING_DURATION_MS = 60 * 1000; // 60 seconds warning
```

### Activity Detection

Activity resets the idle timer:

**User Activity:**

- Mouse movement over browser panel (throttled to 30s)
- Mouse clicks in browser panel
- Keyboard input in browser panel

**AI Activity:**

- Any Playwright MCP tool call (navigate, click, type, etc.)

### State Machine

```
[idle] → Launch Browser → [starting]
                              ↓
                          [active] ←─────────────────┐
                              ↓                      │
                    (no activity 5min)               │
                              ↓                      │
                         [inactive] ── activity ─────┘
                    (warning shown)
                              ↓
                    (no activity 60s)
                              ↓
                         [closing]
                              ↓
                          [idle]
```

---

## Testing

### Manual Test Checklist

- [ ] Launch browser → appears immediately (no blank screen)
- [ ] Browser stays within panel bounds (no border overlap)
- [ ] Resize panel → browser follows
- [ ] Navigate to URL → works
- [ ] Close browser → cleans up
- [ ] Relaunch after close → works
- [ ] App restart → no stuck state
- [ ] Idle 5 minutes → warning appears
- [ ] Click "Keep Open" → warning dismissed
- [ ] Idle timeout expires → browser closes

### Common Issues During Development

1. **Blank screen after creation** - Check delayed resize is working
2. **"Main window not found"** - Ensure `unstable` feature is enabled
3. **Webview behind main UI** - Not a z-index issue, likely render timing
4. **State stuck after reset** - Check `cleanInitialState` is used

---

## References

- [Tauri Window API](https://docs.rs/tauri/latest/tauri/window/struct.Window.html)
- [Tauri Webview API](https://docs.rs/tauri/latest/tauri/webview/struct.Webview.html)
- [Tauri Multi-webview Example](https://github.com/tauri-apps/tauri/tree/dev/examples/multiwebview)
- [WKWebView Blank Screen Issues](https://nevermeant.dev/handling-blank-wkwebviews/)
- [Tauri Multi-webview PR #8280](https://github.com/tauri-apps/tauri/pull/8280)

---

## Changelog

### January 2026

- Initial embedded browser implementation
- Fixed WKWebView blank screen with delayed resize
- Fixed border overlap with 1px inset
- Fixed reset state bugs
- Added idempotent browser creation
- Added idle timeout system
