# Multi-Window Support for Orbit

## Context

Orbit currently supports only a single window. We want to enable users to launch multiple independent Orbit windows simultaneously — each with its own workspace, terminals, file index, browser panel, and agent sessions — just like VS Code. The one agent-bridge sidecar process is shared across all windows (sessions are identified by string ID, not window).

The core challenge is **10 global singletons** in the Rust backend and **global event broadcasting** that must be refactored to per-window state and per-window event routing.

> **Audit Status**: This plan has been reviewed by two 5-agent audit passes (10 agents total). Pass 1 focused on discovery (missing singletons, events, API correctness). Pass 2 focused on implementation readiness (compilation correctness, incremental migration, edge cases). All findings are incorporated below.

---

## Phase 1: `WindowContextManager` Infrastructure (Rust)

**Goal**: Replace all global singletons with a per-window state map.

### 1.1 Create `WindowContext` and `WindowContextManager`

**New file**: `src-tauri/src/core/window_context.rs`

```rust
pub struct WindowContext {
    pub label: String,
    pub workspace_path: RwLock<Option<String>>,
    pub terminal_manager: TerminalManager,
    pub file_watcher: FileWatcherState,
    pub file_index: RwLock<Option<FileIndex>>,
    pub file_index_watcher: Mutex<Option<RecommendedWatcher>>,
    pub search_manager: SearchManager,
    pub lsp_manager: tokio::sync::Mutex<LspManager>, // MUST be tokio Mutex — all LspManager methods are async
    pub ai_manager: Mutex<AiManager>,            // per-window: stop() must not cancel other windows
    pub browser_label: String,                   // e.g., "browser-{window_label}"
    pub browser_exists: Mutex<bool>,
    pub browser_last_bounds: Mutex<Option<BrowserBounds>>,
    pub browser_result_state: BrowserResultState, // pending eval results, coupled to per-window browser
    pub session_ids: Mutex<HashSet<String>>,      // sessions owned by this window
    pub terminal_ids: Mutex<HashSet<String>>,     // terminals owned by this window
}

pub struct WindowContextManager {
    contexts: RwLock<HashMap<String, Arc<WindowContext>>>,
    // Reverse indexes for O(1) lookup on hot paths (called on every streaming token)
    session_to_window: RwLock<HashMap<String, String>>,   // session_id → window_label
    terminal_to_window: RwLock<HashMap<String, String>>,  // terminal_id → window_label
}
```

Key methods:

- `create_context(label)` → `Arc<WindowContext>`
- `get_context(label)` → `Option<Arc<WindowContext>>`
- `remove_context(label)` — cleanup on window close (also purges reverse index entries)
- `find_window_for_session(session_id)` → `Option<String>` — O(1) reverse lookup via `session_to_window`
- `find_window_for_terminal(terminal_id)` → `Option<String>` — O(1) reverse lookup via `terminal_to_window`
- `register_session(label, session_id)` / `register_terminal(label, terminal_id)` — updates both context and reverse index
- `cleanup_all()` — drop all contexts (safety net for force-quit)

> **Design note**: `get_context()` returns `Arc<WindowContext>` (clone), so the outer `RwLock` is released immediately. Inner `Mutex` fields are accessed after the outer lock is dropped — no nested locking deadlock risk. `remove_context()` takes a write lock on the outer map, but no command holds a read lock across inner Mutex access.

### 1.2 Register as managed state

**Modify**: `src-tauri/src/lib.rs`

- Create `WindowContextManager` and `.manage(Arc::new(WindowContextManager::new()))`
- In `.setup()`, create initial context for `"main"` window
- Remove separate `.manage()` calls for: `BrowserWindowState`, `BrowserResultState`, `FileIndexState`
- Keep shared state: `SessionManager`, `SettingsManager`, `ConversationManager`, `PreviewServerState`
- Add `RunEvent::ExitRequested` safety net for cleanup (see Phase 4.2)

### 1.3 Remove global singletons from command modules

Each static is replaced by reading from `WindowContext` via `tauri::Window` auto-injection:

| File                           | Static to Remove               | Replacement                                                                   |
| ------------------------------ | ------------------------------ | ----------------------------------------------------------------------------- |
| `commands/common/workspace.rs` | `WORKSPACE_PATH`               | `ctx.workspace_path`                                                          |
| `commands/common/terminal.rs`  | `TERMINAL_MANAGER`             | `ctx.terminal_manager`                                                        |
| `commands/common/files.rs`     | `FILE_WATCHER_STATE`           | `ctx.file_watcher`                                                            |
| `commands/common/search.rs`    | `SEARCH_MANAGER`               | `ctx.search_manager`                                                          |
| `commands/common/search.rs`    | `FILE_INDEX_WATCHER`           | `ctx.file_index_watcher`                                                      |
| `commands/common/search.rs`    | `FileIndexState` (managed)     | `ctx.file_index`                                                              |
| `commands/common/lsp.rs`       | `LSP_MANAGER`                  | `ctx.lsp_manager` (per-window: different workspaces need different LSP roots) |
| `commands/agent/ai.rs`         | `AI_MANAGER`                   | `ctx.ai_manager` (per-window: `stop()` must not cancel other windows)         |
| `commands/browser/mod.rs`      | `BrowserResultState` (managed) | `ctx.browser_result_state` (pending eval results coupled to browser)          |

### 1.4 Command parameter pattern

Tauri 2 auto-injects `tauri::Window` — **no frontend changes needed**:

```rust
// Before:
#[tauri::command]
pub fn get_workspace_path() -> Option<String> {
    WORKSPACE_PATH.read().clone()
}

// After:
#[tauri::command]
pub fn get_workspace_path(
    window: tauri::Window,
    wctx: State<'_, Arc<WindowContextManager>>,
) -> Option<String> {
    let ctx = wctx.get_context(window.label())?;
    ctx.workspace_path.read().clone()
}
```

**Files to modify**: `workspace.rs`, `files.rs`, `terminal.rs`, `search.rs`, `lsp.rs`, `browser/mod.rs`, `agent/ai.rs`
**New file**: `core/window_context.rs`

> **Cross-cutting dependency**: `files.rs::ensure_within_workspace()` calls `workspace::get_workspace_path()` directly. Both singletons must be migrated together — the `ensure_within_workspace` helper (used by `write_file`, `delete_file`, `rename_file`, `copy_file`, `list_directory`, `create_file`, `create_directory`, `watch_path`, `unwatch_path`) needs `Window` + `WindowContextManager` params added.

> **Tokio task migration**: Several singletons spawn long-lived tasks that capture `&'static` references via singleton helper functions (e.g., `get_terminal_manager()`, `get_watcher_state()`). After migration, these tasks must capture `Arc<WindowContext>` instead. This is the biggest refactoring effort in Phase 1.

> **Constructor availability**: `FileWatcherState` currently has no public constructor — it's created inside the `OnceLock` initializer. A `pub fn new() -> Self` must be added to `crates/common/fs/src/lib.rs` for per-window instantiation. Similarly, verify `SearchManager`, `TerminalManager`, and `LspManager` have public constructors that don't require `&'static` references.

---

## Phase 2: Window-Scoped Event Routing

**Goal**: Change `app.emit()` (broadcasts to ALL windows) to `app.emit_to(label)` (targets correct window only).

### 2.1 Agent bridge event routing

**Modify**: `src-tauri/src/commands/agent/lifecycle.rs`

`setup_event_callbacks` currently captures `app_handle` and uses `app_handle.emit(...)`. Change to:

1. Also capture `Arc<WindowContextManager>` in the closure
2. For each `BridgeEvent`, extract `session_id` from the event payload
3. Look up the owning window: `wctx.find_window_for_session(&session_id)`
4. Use `app_handle.emit_to(&window_label, event, payload)` instead of `app_handle.emit(event, payload)` (string label auto-converts to `EventTarget`)
5. For `BridgeEvent::Ready` (no session) — keep `app.emit()` (broadcast is correct, all windows need to know)
6. For `BridgeEvent::ErrorEvent` (no session) — keep `app.emit()` (broadcast)
7. **Fallback**: If `find_window_for_session()` returns `None`, fall back to broadcast with a warning log (safe because frontend already filters by session ID):

```rust
match wctx.find_window_for_session(&session_id) {
    Some(label) => app.emit_to(&label, event, payload),
    None => {
        log::warn!("No window found for session {session_id}, broadcasting");
        app.emit(event, payload)
    }
}
```

Register session→window mapping when session is created:

```rust
// In agent_create_session:
wctx.register_session(window.label(), &session_id);
```

**Auto-register forked sessions**: When the event callback receives `BridgeEvent::SessionInit` with `is_forked: true`, auto-register the new `sdk_session_id` to the same window as the parent `session_id`. Without this, all events for the forked session would fall through to broadcast fallback.

```rust
BridgeEvent::SessionInit(event) => {
    // If this is a fork, register the new session to the same window
    if let Some(parent_window) = wctx.find_window_for_session(&event.session_id) {
        wctx.register_session(&parent_window, &event.sdk_session_id);
    }
    // ... emit event
}
```

### 2.2 Terminal event routing

**Modify**: `src-tauri/src/commands/common/terminal.rs`

In `terminal_create`, capture the calling window's label. The spawned tokio task that reads terminal output uses `app.emit_to(window_label, "terminal:output", ...)` instead of `app.emit(...)`. Same for `terminal:exit`, `terminal:foreground`, and `terminal:prompt`.

> **Performance note**: Capturing `window_label` at terminal creation means zero runtime lookup per output event — the label is a string in the closure, not a HashMap scan.

### 2.3 File change event routing

**Modify**: `src-tauri/src/commands/common/files.rs`

The `start_event_forwarder` function spawns a tokio task that emits `file:change` events. Change to emit to the owning window only: `app.emit_to(EventTarget::labeled(&window_label), "file:change", ...)`.

### 2.4 Browser event routing

**Modify**: `src-tauri/src/commands/browser/mod.rs`

The `on_navigation` and `on_page_load` callbacks emit `browser:navigated` and `browser:loading`. Each browser is owned by a window — emit to that window only.

### 2.5 Search index event routing

**Modify**: `src-tauri/src/commands/common/search.rs`

The batched updater emits `file:index:updated` — route to owning window.

### 2.6 LSP event routing

**Modify**: `src-tauri/src/commands/common/lsp.rs`

The spawned tokio task that reads LSP diagnostic notifications emits `lsp:diagnostics`. Route to the window that owns the workspace containing the diagnosed file.

### 2.7 Canvas download event routing

**Modify**: `src-tauri/src/commands/canvas/setup.rs`, `src-tauri/src/commands/canvas/download.rs`

`canvas:download-progress` is emitted 6 times across setup.rs and download.rs. Route to the calling window so only the window that triggered canvas setup sees progress updates.

**All emit calls summarized (34 total)**:

| Event                       | Source File                 | Current      | After                                       |
| --------------------------- | --------------------------- | ------------ | ------------------------------------------- |
| `agent:message`             | lifecycle.rs                | `app.emit()` | `app.emit_to(session→window)`               |
| `agent:permission_request`  | lifecycle.rs                | `app.emit()` | `app.emit_to(session→window)`               |
| `agent:session_init`        | lifecycle.rs                | `app.emit()` | `app.emit_to(session→window)`               |
| `agent:checkpoint`          | lifecycle.rs                | `app.emit()` | `app.emit_to(session→window)`               |
| `agent:plan_mode_changed`   | lifecycle.rs                | `app.emit()` | `app.emit_to(session→window)`               |
| `agent:accept_mode_changed` | lifecycle.rs                | `app.emit()` | `app.emit_to(session→window)`               |
| `agent:error`               | lifecycle.rs                | `app.emit()` | `app.emit()` (keep broadcast)               |
| `agent:ready`               | lifecycle.rs                | `app.emit()` | `app.emit()` (keep broadcast)               |
| `agent:auth_error`          | lifecycle.rs                | `app.emit()` | `app.emit_to(session→window)`               |
| `terminal:output`           | terminal.rs                 | `app.emit()` | `app.emit_to(terminal→window)`              |
| `terminal:exit`             | terminal.rs                 | `app.emit()` | `app.emit_to(terminal→window)`              |
| `terminal:foreground`       | terminal.rs ×2              | `app.emit()` | `app.emit_to(terminal→window)`              |
| `terminal:prompt`           | terminal.rs                 | `app.emit()` | `app.emit_to(terminal→window)`              |
| `file:change`               | files.rs                    | `app.emit()` | `app.emit_to(watcher→window)`               |
| `lsp:diagnostics`           | lsp.rs                      | `app.emit()` | `app.emit_to(workspace→window)`             |
| `browser:navigated`         | browser/mod.rs              | `app.emit()` | `app.emit_to(browser→window)`               |
| `browser:loading`           | browser/mod.rs              | `app.emit()` | `app.emit_to(browser→window)`               |
| `browser:tool_request`      | lifecycle.rs                | `app.emit()` | `app.emit_to(session→window)`               |
| `canvas:message`            | lifecycle.rs                | `app.emit()` | `app.emit_to(session→window)`               |
| `canvas:tool_request`       | lifecycle.rs                | `app.emit()` | `app.emit_to(session→window)`               |
| `canvas:error`              | lifecycle.rs                | `app.emit()` | `app.emit_to(session→window)`               |
| `canvas:download-progress`  | setup.rs ×3, download.rs ×3 | `app.emit()` | `app.emit_to(calling→window)`               |
| `devmonitor:tracing`        | devmonitor.rs               | `app.emit()` | `app.emit()` (keep broadcast, debug-only)   |
| `devmonitor:span`           | devmonitor.rs ×2            | `app.emit()` | `app.emit()` (keep broadcast, debug-only)   |
| `conversations:changed`     | conversation commands       | N/A (new)    | `app.emit()` (broadcast — sidebar sync)     |
| `settings:changed`          | settings.rs                 | N/A (new)    | `app.emit()` (broadcast — user preferences) |

---

## Phase 3: Frontend Event Scoping

**Goal**: Change event listeners from global to window-scoped so each window only receives its own events.

### 3.1 Update `core.ts` listen function

**Modify**: `apps/agent/src/lib/api/core.ts`

The current `listen()` uses `@tauri-apps/api/event`'s global `listen()`, which receives events from ALL targets. Change to use window-scoped listeners:

```typescript
// Before:
const { listen: tauriListen } = await import('@tauri-apps/api/event');
const unlisten = await tauriListen<T>(event, (e) => callback(e.payload));

// After:
const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
const unlisten = await getCurrentWebviewWindow().listen<T>(event, (e) => callback(e.payload));
```

This single change ensures all `on*()` helper functions in the API layer (`onAgentMessage`, `onTerminalOutput`, `onFileChange`, etc.) automatically become window-scoped.

> **Note**: Broadcast `app.emit()` events from Rust DO still reach window-scoped listeners. So `agent:ready` and `agent:error` (broadcast) will be received correctly. However, add a `listenGlobal()` export as defensive design for events that must stay global:

```typescript
// core.ts — add alongside existing listen()
export async function listenGlobal<T>(
  event: string,
  callback: (payload: T) => void
): Promise<() => void> {
  if (!IS_TAURI) return () => {};
  const { listen: tauriListen } = await import('@tauri-apps/api/event');
  const unlisten = await tauriListen<T>(event, (e) => callback(e.payload));
  return unlisten;
}
```

Use `listenGlobal()` for: `agent:ready`, `agent:error` (sidecar-level), `settings:changed` (Phase 5.3), `conversations:changed` (sidebar sync).

> **Implementation note**: `listenGlobal()` is technically unnecessary for correctness — Tauri 2's `app.emit()` broadcasts DO reach window-scoped `getCurrentWebviewWindow().listen()` listeners. However, using explicit `listenGlobal()` for broadcast events documents intent and prevents future confusion if someone sees a "broadcast" event being listened to on a "scoped" listener. It's defensive design, not functional necessity.

### 3.2 Add window label to TauriProvider context

**Modify**: `apps/agent/src/providers/tauri-provider.tsx`

Expose `windowLabel` in TauriContext for UI display (window title, etc.):

```typescript
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
const windowLabel = getCurrentWebviewWindow().label;
```

### 3.3 No changes needed to API invoke wrappers

`invoke()` calls in `lib/api/*.ts` remain unchanged — Tauri 2 auto-injects the calling window's context on the backend side via `tauri::Window` parameter injection.

---

## Phase 4: Dynamic Window Creation

**Goal**: Enable creating new Orbit windows at runtime.

### 4.1 New window creation command

**New file**: `src-tauri/src/commands/common/window_management.rs`

```rust
#[tauri::command]
pub async fn create_new_window(
    workspace_path: Option<String>,
    app: AppHandle,
    wctx: State<'_, Arc<WindowContextManager>>,
) -> Result<String, String> {
    let window_id = format!("orbit-{}", uuid::Uuid::new_v4());

    // Create per-window context BEFORE building the window
    // (React mounts immediately and calls getWorkspacePath — path must be set first)
    let ctx = wctx.create_context(&window_id);
    if let Some(path) = workspace_path {
        *ctx.workspace_path.write() = Some(path);
    }

    // Clone the main window config and change only the label.
    // NOTE: WebviewWindowBuilder does NOT have .title_bar_style() or .hidden_title()
    // as builder methods — these only exist in WindowConfig (tauri.conf.json).
    // Using from_config() inherits ALL window properties and can't drift out of sync.
    let mut config = app.config().app.windows.first()
        .expect("no main window config")
        .clone();
    config.label = window_id.clone();

    // from_config() returns Result (config validation can fail), then .build() returns Result
    let window = WebviewWindowBuilder::from_config(&app, &config)
        .map_err(|e| {
            wctx.remove_context(&window_id);
            format!("Invalid window config: {e}")
        })?
        .build()
        .map_err(|e| {
            wctx.remove_context(&window_id);
            format!("Failed to create window: {e}")
        })?;

    // Restore saved window state (position/size) for dynamic windows
    // Plugin auto-saves only windows defined in tauri.conf.json — dynamic ones need manual API
    if let Err(e) = window.restore_state(StateFlags::all()) {
        log::debug!("No saved state for {window_id}: {e}");
    }

    // Apply macOS effects (ProMotion, vibrancy) — works on dynamically created windows
    #[cfg(target_os = "macos")]
    apply_macos_effects(&window);

    Ok(window_id)
}
```

Register in `lib.rs` invoke handler and add `pub mod window_management` to `commands/common/mod.rs`.

### 4.2 Window close cleanup

**Modify**: `src-tauri/src/lib.rs`

Add `.on_window_event()` to the Tauri builder, plus a `RunEvent::ExitRequested` safety net:

```rust
// NOTE: `app` is NOT available inside on_window_event — use `window.app_handle()` instead
.on_window_event(move |window, event| {
    if let tauri::WindowEvent::Destroyed = event {
        let label = window.label().to_string();
        let app_handle = window.app_handle();
        if let Some(ctx) = wctx.get_context(&label) {
            // Cleanup order matters: stop watchers first (prevents new events),
            // then close terminals (prevents new output), then drop context
            // 1. Stop file watcher and index watcher
            if let Some(watcher) = ctx.file_index_watcher.lock().take() {
                drop(watcher);
            }
            // 2. Close all terminals in this window
            for id in ctx.terminal_ids.lock().iter() {
                let _ = ctx.terminal_manager.close(id);
            }
            // 3. Save window state for dynamic windows
            let _ = app_handle.save_window_state(StateFlags::all());
        }
        // remove_context also purges reverse index entries
        wctx.remove_context(&label);
    }
})

// IMPORTANT: Current codebase uses `Builder::run()` which returns Result.
// `.build().run()` is a two-step pattern where App::run() consumes self and
// NEVER returns. Both `wctx_for_events` (on_window_event) and `wctx_for_exit`
// (RunEvent handler) need separate Arc clones created BEFORE the builder chain.
//
// let wctx_for_events = Arc::clone(&wctx);  // for on_window_event
// let wctx_for_exit = Arc::clone(&wctx);    // for RunEvent handler

// Safety net: WindowEvent::Destroyed may NOT fire on force-quit (SIGKILL, etc.)
.build(tauri::generate_context!())
.expect("error while building tauri")
.run(|_app, event| {
    if let RunEvent::ExitRequested { .. } = event {
        wctx_for_exit.cleanup_all(); // drop ALL remaining contexts
    }
});
```

> **Note on Arc cleanup**: If a tokio task still holds `Arc<WindowContext>` when `remove_context` is called, the context won't be dropped until the task finishes. This is safe — Arc reference counting handles it. The task will get emit errors and exit its loop naturally.

### 4.3 Update capabilities for dynamic windows

**Modify**: `src-tauri/capabilities/default.json`

```json
"windows": ["main", "orbit-*"]
```

Tauri 2 supports glob patterns — `"orbit-*"` grants permissions to all dynamically created windows.

### 4.4 Frontend initialization for new windows

**Modify**: `apps/agent/src/providers/tauri-provider.tsx`

When a new window loads, the React app mounts normally. The TauriProvider calls `getWorkspacePath()` — if it returns a pre-set path (from Phase 4.1), skip the workspace picker and go straight to the main UI.

### 4.5 Frontend API function

**Modify**: `apps/agent/src/lib/api/window.ts`

```typescript
export async function openNewWindow(workspacePath?: string): Promise<string> {
  return invoke<string>('create_new_window', { workspacePath });
}
```

---

## Phase 5: Polish

### 5.1 Native menu: File → New Window

**Modify**: `src-tauri/src/lib.rs`

Add macOS native menu with Cmd+Shift+N shortcut:

```rust
use tauri::menu::{MenuBuilder, SubmenuBuilder, MenuItemBuilder};

let file_menu = SubmenuBuilder::new(app, "File")
    .item(&MenuItemBuilder::with_id("new-window", "New Window")
        .accelerator("CmdOrCtrl+Shift+N").build(app)?)
    .build()?;

app.on_menu_event(|app, event| {
    if event.id() == "new-window" {
        // invoke create_new_window
    }
});
```

### 5.2 Window title per workspace

**Modify**: `apps/agent/src/providers/tauri-provider.tsx`

When workspace is set, update the window title:

```typescript
const name = workspacePath.split('/').pop();
await getCurrentWebviewWindow().setTitle(`${name} — Orbit`);
```

### 5.3 Cross-window settings sync

**Modify**: `src-tauri/src/commands/common/settings.rs`

When settings are updated, broadcast to ALL windows so other windows reload:

```rust
let _ = app.emit("settings:changed", ());  // broadcast is correct here
```

Add listener in TauriProvider to reload settings on `settings:changed`.

---

## Files Summary

### New Files

| File                                                 | Purpose                                          |
| ---------------------------------------------------- | ------------------------------------------------ |
| `src-tauri/src/core/window_context.rs`               | `WindowContext` + `WindowContextManager` structs |
| `src-tauri/src/commands/common/window_management.rs` | `create_new_window` command                      |

### Modified Files (Rust Backend)

| File                                         | Changes                                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src-tauri/src/lib.rs`                       | Register WCM, setup cleanup, RunEvent::ExitRequested safety net, menu, remove old managed state |
| `src-tauri/src/core/mod.rs`                  | Add `pub mod window_context`                                                                    |
| `src-tauri/src/commands/common/mod.rs`       | Add `pub mod window_management`                                                                 |
| `src-tauri/src/commands/common/workspace.rs` | Remove static, add Window+WCM params                                                            |
| `src-tauri/src/commands/common/files.rs`     | Remove static, scoped events, update `ensure_within_workspace()`                                |
| `src-tauri/src/commands/common/terminal.rs`  | Remove static, scoped events (including `terminal:prompt`)                                      |
| `src-tauri/src/commands/common/search.rs`    | Remove statics, use WindowContext                                                               |
| `src-tauri/src/commands/common/lsp.rs`       | Remove static, per-window LspManager, scope `lsp:diagnostics`                                   |
| `src-tauri/src/commands/common/settings.rs`  | Add broadcast on settings change                                                                |
| `src-tauri/src/commands/agent/ai.rs`         | Remove `AI_MANAGER` static, use WindowContext                                                   |
| `src-tauri/src/commands/browser/mod.rs`      | Per-window browser state + BrowserResultState                                                   |
| `src-tauri/src/commands/agent/lifecycle.rs`  | Session→window routing, forked session auto-registration, None fallback                         |
| `src-tauri/src/commands/canvas/setup.rs`     | Scope `canvas:download-progress` to calling window                                              |
| `src-tauri/src/commands/canvas/download.rs`  | Scope `canvas:download-progress` to calling window                                              |
| `src-tauri/capabilities/default.json`        | Add `"orbit-*"` glob pattern                                                                    |

### Modified Files (Frontend)

| File                                          | Changes                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------- |
| `apps/agent/src/lib/api/core.ts`              | Window-scoped `listen()` + new `listenGlobal()` for broadcast events               |
| `apps/agent/src/lib/api/window.ts`            | Add `openNewWindow()` function                                                     |
| `apps/agent/src/providers/tauri-provider.tsx` | Window label context, settings listener, skip workspace picker                     |
| `apps/agent/src/stores/agent/tool-store.ts`   | Fix localStorage conflict (exclude `currentSessionId` from persistence — Option B) |

### Modified Files (Rust Crates — Constructor Changes)

| File                              | Changes                                                             |
| --------------------------------- | ------------------------------------------------------------------- |
| `crates/common/fs/src/lib.rs`     | Add `pub fn new() -> FileWatcherState` constructor                  |
| `crates/common/lsp/src/lib.rs`    | Verify `LspManager::new()` doesn't require `&'static` references    |
| `crates/common/search/src/lib.rs` | Verify `SearchManager::new()` doesn't require `&'static` references |

---

## What Stays Unchanged

- **SessionManager / Agent Bridge** — sessions are ID-based, one sidecar serves all windows
- **Git commands** — all take `path` parameter, inherently multi-window
- **ConversationManager** — pure disk reader, shared across windows (but `conversations:changed` broadcast needed for sidebar sync)
- **Settings** — global per-user (shared, with broadcast sync)
- **Most Zustand stores** — each window = separate React instance = automatic in-memory isolation. **Exception**: stores using `persist()` middleware write to localStorage, which is shared across all Tauri windows (same WebView origin). See "localStorage Conflicts" below
- **All `invoke()` calls in frontend** — no parameters change (Tauri auto-injects window)
- **Canvas setup/download/save commands** — shared `~/.orbit/canvas/` directory

---

## localStorage Conflicts (Persisted Zustand Stores)

Five stores use `persist()` middleware. localStorage is shared across all Tauri windows:

| Store               | Key                 | Persists                             | Multi-Window Risk                           |
| ------------------- | ------------------- | ------------------------------------ | ------------------------------------------- |
| `onboarding-store`  | `orbit-onboarding`  | `hasCompletedOnboarding`             | **SAFE** — user-global                      |
| `provider-store`    | `orbit-providers`   | Provider config                      | **SAFE** — user-global                      |
| `icon-theme-store`  | `orbit-icon-theme`  | Theme ID                             | **SAFE** — user preference                  |
| `file-viewer-store` | `orbit-file-viewer` | `wordWrap` boolean                   | **SAFE** — user preference                  |
| `tool-store`        | `orbit-tool-store`  | `currentSessionId`, `completedTools` | **CONFLICT** — windows overwrite each other |

**Fix for `tool-store`**: Stop persisting `currentSessionId` — it's re-established from backend on session create anyway. This is the cleanest approach (Option B recommended):

```typescript
// Option B (RECOMMENDED): Exclude conflicting fields from persistence
// currentSessionId is set by system:init on every session — no need to persist
persist(/* ... */, {
  name: 'orbit-tool-store',
  partialize: (state) => ({ completedTools: state.completedTools }),
})

// Option A: Window-specific key (works but adds complexity for migration)
// Would need getCurrentWebviewWindow().label at store creation time
persist(/* ... */, {
  name: `orbit-tool-store-${windowLabel}`,
})
```

---

## Workspace Switching (Edge Case)

When a user changes workspace within an existing window (e.g., via "Open Folder"), the old workspace's resources must be torn down before the new workspace is initialized. Without explicit cleanup, file watchers, search indexes, and LSP servers from the old workspace continue running — a resource leak.

Add a `reset_workspace_context()` method to `WindowContextManager`:

```rust
impl WindowContextManager {
    /// Reset workspace-specific state within an existing window context.
    /// Called when the user switches workspaces without creating a new window.
    pub fn reset_workspace_context(&self, label: &str) {
        if let Some(ctx) = self.get_context(label) {
            // 1. Stop file watcher
            if let Some(watcher) = ctx.file_index_watcher.lock().take() {
                drop(watcher);
            }
            // 2. Clear file index
            *ctx.file_index.write() = None;
            // 3. Shutdown LSP servers for old workspace
            // (tokio::sync::Mutex — must be called from async context)
            // lsp_manager.shutdown_all() needs to be added to LspManager
            // 4. Clear workspace path (will be set by new workspace init)
            *ctx.workspace_path.write() = None;
            // Note: terminals are NOT killed — user may want to keep them
        }
    }
}
```

Call `reset_workspace_context()` at the start of `set_workspace_path` when the path is changing (not initial set).

---

## Cross-Window Sidebar Sync

When sessions are created, forked, or deleted in one window, other windows' sidebar conversation lists won't update unless they receive a notification. The `ConversationManager` is a shared disk reader, but the frontend sidebar only refreshes on specific events.

Add a broadcast event:

```rust
// In conversation-related commands (create, fork, delete):
app.emit("conversations:changed", ()).ok();  // broadcast to ALL windows
```

This event is intentionally global (broadcast) since any window might be displaying the conversation list.

Add to event routing table and frontend listener in TauriProvider.

---

## Hardcoded `"main"` Window Label References

The following locations reference the `"main"` window label directly. All must be updated to use the calling window's label:

| File                                    | Line(s)       | Usage                                   | Fix                                      |
| --------------------------------------- | ------------- | --------------------------------------- | ---------------------------------------- |
| `src-tauri/src/lib.rs`                  | builder setup | Initial window context creation         | Keep `"main"` for initial context        |
| `src-tauri/src/commands/browser/mod.rs` | 4 references  | `get_webview("main")`, hardcoded parent | Use `window.label()` from command params |

> **Search command**: `rg '"main"' src-tauri/ --type rust` to find all instances before implementation.

---

## Incremental Implementation Order

The migration can be done incrementally in 8 commits. Each commit is independently shippable and testable — the app works correctly after each one (single-window behavior preserved):

| Commit | Scope                                 | Description                                                                                           | Risk                              |
| ------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1      | `window_context.rs`                   | Add `WindowContext` + `WindowContextManager` structs (unused)                                         | Zero — no behavioral change       |
| 2      | `lib.rs`                              | Register WCM as managed state, create initial `"main"` context in `.setup()`                          | Low — state exists but unused     |
| 3      | `workspace.rs` + `files.rs`           | Migrate `WORKSPACE_PATH` + `FILE_WATCHER_STATE` together (co-dependent via `ensure_within_workspace`) | Medium — must co-migrate          |
| 4      | `terminal.rs`                         | Migrate `TERMINAL_MANAGER` + scope terminal events                                                    | Medium                            |
| 5      | `search.rs`                           | Migrate `SEARCH_MANAGER` + `FILE_INDEX_WATCHER` + `FileIndexState`                                    | Medium                            |
| 6      | `lsp.rs` + `ai.rs` + `browser/mod.rs` | Migrate remaining singletons                                                                          | Medium                            |
| 7      | `lifecycle.rs` + `core.ts`            | Agent event routing + frontend window-scoped listeners                                                | High — touches streaming hot path |
| 8      | `window_management.rs` + capabilities | Dynamic window creation + Cmd+Shift+N menu                                                            | Low — additive                    |

> **Critical**: Commits 3-6 can be reordered, but `workspace.rs` + `files.rs` MUST be in the same commit because `ensure_within_workspace()` in files.rs calls `get_workspace_path()` from workspace.rs.

---

## Dependency Graph

```
Phase 1 (WindowContextManager)
  ├──→ Phase 2 (Event Routing) — needs WCM for session→window lookup
  └──→ Phase 3 (Frontend Event Scoping) — can be done in parallel with Phase 2
         └──→ Phase 4 (Dynamic Window Creation) — needs Phases 1-3 complete
                └──→ Phase 5 (Polish) — additive, can be incremental
```

---

## Verification Plan

1. **After Phase 1-3**: Run `bunx tauri dev` with a single window. Everything must work identically to before (regression test).
2. **After Phase 4**:
   - Open window 1 → open workspace A → create terminal → start agent session
   - Open window 2 → open workspace B → create terminal → start agent session
   - Verify: terminal output in window 1 does NOT appear in window 2
   - Verify: agent messages in window 1 do NOT appear in window 2
   - Verify: file changes in workspace A do NOT trigger events in window 2
   - Verify: closing window 2 cleans up its terminals/watchers without affecting window 1
   - Verify: **rewind** (session fork) in window 1 — forked session events still route to window 1
   - Verify: **same workspace** in two windows — both work independently (duplicate watchers OK)
   - Verify: **window destroyed mid-stream** — agent keeps running, no crash, events fail gracefully
   - Verify: `tool-store` localStorage — opening two windows doesn't corrupt `currentSessionId`
3. **After Phase 5**: Verify Cmd+Shift+N opens new window, window title shows workspace name.
4. **Rust tests**: `cargo test` — all existing tests pass
5. **Frontend tests**: `bun run test` — all existing tests pass
6. **Lint**: `./scripts/lint-all.sh` passes

---

## Audit Notes

### Pass 1: Discovery Audit (5 agents)

Audited on 2026-02-07 by a 5-agent team examining:

- All 10 global singletons (8 original + AI_MANAGER + BrowserResultState)
- All 34 event emission points across the Rust codebase
- Frontend API layer, providers, persisted stores, and mock mode
- Concurrency patterns, deadlock risks, and performance hot paths
- Tauri 2 API correctness verified against official docs

**Key corrections from Pass 1:**

- `WebviewWindowBuilder` doesn't have `.title_bar_style()` / `.hidden_title()` → use `from_config()`
- Added reverse index (`session_to_window`, `terminal_to_window`) for O(1) lookup on streaming hot path
- Added `BrowserResultState`, `AI_MANAGER`, `LSP_MANAGER` to WindowContext
- Added 11 missing events to routing table (`terminal:prompt`, `lsp:diagnostics`, `canvas:download-progress` ×6, `devmonitor:*` ×3)
- Added forked session auto-registration for rewind support
- Added `RunEvent::ExitRequested` safety net for force-quit cleanup
- Added `listenGlobal()` for broadcast events in frontend
- Fixed Zustand `persist` localStorage conflict in `tool-store`
- Added `None` fallback in `find_window_for_session` (broadcast + warning log)

### Pass 2: Implementation Readiness Audit (5 agents)

Second audit pass focused on whether the plan's code snippets compile, the migration is incremental, edge cases are handled, and the Rust implementation is sound.

**Key corrections from Pass 2:**

- `lsp_manager` must use `tokio::sync::Mutex` (not `parking_lot::Mutex`) — all LspManager methods are async
- `from_config()` returns `Result` — added separate `map_err` for config validation vs window build
- `app` variable not available inside `on_window_event` closure — use `window.app_handle()` instead
- `.build().run()` pattern requires two separate `Arc` clones before the builder chain (`App::run()` consumes self)
- `FileWatcherState` has no public constructor — needs `pub fn new()` added to crate
- Added `reset_workspace_context()` for workspace switching (prevents resource leaks)
- Added `conversations:changed` broadcast event for cross-window sidebar sync
- Identified 5 hardcoded `"main"` references in `lib.rs` + `browser/mod.rs`
- Designed 8-commit incremental implementation order (each commit independently shippable)
- Confirmed `listenGlobal()` is defensive design, not functional necessity (broadcasts reach scoped listeners)
- Recommended Option B for tool-store fix (partialize over window-specific key)
