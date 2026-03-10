# Multi-Icon System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users pick from multiple bundled app icons in Settings, with live Dock icon swap — shipping at least 2 selectable icons.

**Architecture:** Dedicated `orbit-app-icons` crate for unsafe objc2 AppKit code (matching `orbit-sf-symbols` pattern), with a thin safe Tauri command wrapper in `src-tauri`. Dock swap results are propagated synchronously via `sync_channel` before persisting to settings. Preview images returned as base64 data URLs. React grid component in Appearance settings, gated to macOS via `isMac()`.

**Tech Stack:** Rust (objc2, AppKit, Tauri commands, serde, orbit-settings, orbit-core), React (TypeScript, Tailwind CSS)

**Design doc:** `docs/plans/due/multi-icon-system/multi-icon-system-design.md`

**Audit:** `reviews/audit-plan.md` — all critical issues addressed below.

---

## Audit Fixes Applied

| Audit Issue                                                                     | Resolution                                                                                                                         |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Swift FFI diverges from Rust/objc2 pattern                                      | Replaced with pure Rust `objc2` + `msg_send!`, matching `sf-symbols/render.rs`                                                     |
| Main-thread dispatch needed                                                     | All AppKit calls dispatched via `run_on_main_thread` with `sync_channel` result propagation                                        |
| Raw preview paths break in `/Applications`                                      | Preview images returned as `data:image/png;base64,...` from Rust                                                                   |
| Only ships `orbit-default`                                                      | Added `orbit-alt` non-default variant so the picker is functional                                                                  |
| `preview.png` used for Dock swap                                                | Separate `icon.png` (1024×1024) for Dock, `preview.png` (128×128) for grid                                                         |
| No `active_icon_id` validation                                                  | Validate against discovered icons, reset to `None` on mismatch                                                                     |
| Redundant `get_active_icon` command                                             | Removed — `list_app_icons` returns `isActive` flag                                                                                 |
| `cargo check` insufficient for verification                                     | Changed to `cargo build` / `bunx tauri dev`                                                                                        |
| **objc2 code in `src-tauri` violates `unsafe_code = "forbid"`**                 | **Moved to dedicated `crates/common/app-icons/` crate with local lint override**                                                   |
| **Fire-and-forget Dock swap persists before native confirm**                    | **`sync_channel` pattern (from `decorum/lib.rs`) — only persist on success**                                                       |
| **Design doc inconsistent (old Swift references)**                              | **Design doc fully reconciled to Rust/objc2 + crate architecture**                                                                 |
| Non-macOS gating inconsistent                                                   | Entire UI section gated via `isMac()`, commands return error on non-macOS                                                          |
| Icon API not exported from barrel                                               | Added to `apps/agent/src/lib/api/index.ts`                                                                                         |
| Wrong imports (`@/lib/logger`, `ResultExt`)                                     | Fixed to `@orbit/common/lib` and `SentryCapture`                                                                                   |
| **Picker rollback uses stale `icons.find(isActive)` after prior success**       | **`confirmedActiveIdRef` tracks last confirmed icon; rollback uses it instead of stale initial state**                             |
| **`reapply_persisted_icon(app.handle())` doesn't match `&AppHandle` signature** | **Fixed to `&app.handle()` — Tauri 2 `App::handle()` returns owned `AppHandle`**                                                   |
| **Startup reapply unconditionally uses `run_on_main_thread`**                   | **`is_main_thread()` guard (from `orbit-app-icons` crate) — calls directly if already on main thread, matching `decorum` pattern** |
| **Overlapping icon-switch requests can desync UI and backend**                  | **Serialized queue: one request in flight at a time, pending clicks queued and processed after current settles**                   |
| **No user-visible feedback on Dock swap failure**                               | **`toast.error('Failed to switch app icon')` via sonner, matching existing error toast patterns**                                  |
| **Startup dispatch failure leaves stale `active_icon_id`**                      | **`run_on_main_thread` failure now returns `false` (not early return), falling through to setting cleanup**                        |

---

### Task 1: Add `active_icon_id` to Settings

**Files:**

- Modify: `crates/common/settings/src/lib.rs` (Settings struct, ~line 197; validated(), ~line 227)
- Modify: `apps/agent/src/lib/api/settings.ts` (Settings interface, ~line 47)

**Step 1: Add field to Rust Settings struct**

In `crates/common/settings/src/lib.rs`, add to the `Settings` struct after `ssh_hosts`:

```rust
/// Active app icon id (None = default bundled icon, macOS only)
#[serde(default, skip_serializing_if = "Option::is_none")]
pub active_icon_id: Option<String>,
```

**Step 2: Add field to TypeScript Settings interface**

In `apps/agent/src/lib/api/settings.ts`, add to the `Settings` interface:

```typescript
activeIconId?: string;
```

**Step 3: Verify build**

Run: `cargo build`
Expected: PASS (`serde(default)` handles missing field in existing `settings.json`)

**Step 4: Commit**

```bash
git add crates/common/settings/src/lib.rs apps/agent/src/lib/api/settings.ts
git commit -m "feat(settings): add active_icon_id field for multi-icon system"
```

---

### Task 2: Create Icon Bundle Directory with Default + Alt Variant

**Files:**

- Create: `src-tauri/icons/app-icons/orbit-default/meta.json`
- Create: `src-tauri/icons/app-icons/orbit-default/icon.icon/icon.json` (copy from existing)
- Create: `src-tauri/icons/app-icons/orbit-default/icon.png` (1024×1024 for Dock swap)
- Create: `src-tauri/icons/app-icons/orbit-default/preview.png` (128×128 for grid)
- Create: `src-tauri/icons/app-icons/orbit-alt/meta.json`
- Create: `src-tauri/icons/app-icons/orbit-alt/icon.icon/icon.json`
- Create: `src-tauri/icons/app-icons/orbit-alt/icon.png`
- Create: `src-tauri/icons/app-icons/orbit-alt/preview.png`

**Step 1: Create directory structure**

```bash
mkdir -p src-tauri/icons/app-icons/orbit-default/icon.icon
mkdir -p src-tauri/icons/app-icons/orbit-alt/icon.icon
```

**Step 2: Create default meta.json**

Create `src-tauri/icons/app-icons/orbit-default/meta.json`:

```json
{
  "id": "orbit-default",
  "name": "Orbit",
  "theme": "Classic",
  "default": true
}
```

**Step 3: Copy existing icon assets for default**

```bash
cp src-tauri/icons/icon.icon/icon.json src-tauri/icons/app-icons/orbit-default/icon.icon/icon.json
cp src-tauri/icons/128x128@2x.png src-tauri/icons/app-icons/orbit-default/preview.png
```

Generate 1024×1024 icon.png from the source artwork used to create the existing icons:

```bash
# Use the same source artwork that produced the current icons
SOURCE="<path-to-source-artwork>"
magick "$SOURCE" -resize 1024x1024 PNG32:src-tauri/icons/app-icons/orbit-default/icon.png
```

> **Note:** If the source artwork is unavailable, upscale the existing `128x128@2x.png`:
> `magick src-tauri/icons/128x128@2x.png -resize 1024x1024 PNG32:src-tauri/icons/app-icons/orbit-default/icon.png`

**Step 4: Create alt variant**

Create `src-tauri/icons/app-icons/orbit-alt/meta.json`:

```json
{
  "id": "orbit-alt",
  "name": "Orbit Alt",
  "theme": "Classic",
  "default": false
}
```

The `icon.icon/icon.json`, `icon.png`, and `preview.png` for the alt variant must be provided by the designer (from Icon Composer). Placeholder: copy default assets so the system is testable:

```bash
cp src-tauri/icons/app-icons/orbit-default/icon.icon/icon.json src-tauri/icons/app-icons/orbit-alt/icon.icon/icon.json
cp src-tauri/icons/app-icons/orbit-default/icon.png src-tauri/icons/app-icons/orbit-alt/icon.png
cp src-tauri/icons/app-icons/orbit-default/preview.png src-tauri/icons/app-icons/orbit-alt/preview.png
```

> **Release gate:** Do not merge/ship until `orbit-alt` has distinct `icon.png` and `preview.png` artwork. Placeholder copies are for scaffolding/testing only.

**Step 5: Commit**

```bash
git add src-tauri/icons/app-icons/
git commit -m "feat(icons): add default and alt icon bundles for multi-icon system"
```

---

### Task 3: Wire Bundle into tauri.conf.json

**Files:**

- Modify: `src-tauri/tauri.conf.json` (~line 82, macOS.files)

**Step 1: Add app-icons to macOS bundle files**

In `src-tauri/tauri.conf.json`, add to the `macOS.files` object:

```json
"Resources/app-icons": "icons/app-icons"
```

The full `files` object becomes:

```json
"files": {
  "Resources/Assets.car": "resources/Assets.car",
  "Resources/AppIcon.icon": "icons/icon.icon",
  "Resources/app-icons": "icons/app-icons"
}
```

**Step 2: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "build: bundle app-icons directory into macOS app Resources"
```

---

### Task 4: Create `orbit-app-icons` Crate

> **Why a separate crate:** The workspace `Cargo.toml` sets `unsafe_code = "forbid"`, and `src-tauri` inherits this via `[lints] workspace = true`. Since `forbid` cannot be overridden by `#[allow]`, objc2 code must live in a separate crate with its own `[lints.rust]` section — following the existing `orbit-sf-symbols` and `orbit-plugin-decorum` pattern.

**Files:**

- Create: `crates/common/app-icons/Cargo.toml`
- Create: `crates/common/app-icons/src/lib.rs`
- Modify: `src-tauri/Cargo.toml` (add `orbit-app-icons` dependency)

**Step 1: Create crate directory**

```bash
mkdir -p crates/common/app-icons/src
```

**Step 2: Create Cargo.toml**

Create `crates/common/app-icons/Cargo.toml` (mirrors `orbit-sf-symbols/Cargo.toml` lint structure):

```toml
[package]
name = "orbit-app-icons"
version = "0.0.1"
edition = "2021"
description = "macOS app icon management — Dock swap via objc2 AppKit"
license = "MIT"
repository = "https://github.com/Recusive/Orbit"
readme = "README.md"
keywords = ["macos", "appkit", "icons"]
categories = ["gui"]

# =============================================================================
# LINTS - Mirror workspace lints but allow unsafe for objc2 FFI
# =============================================================================
[lints.rust]
# Safety - ALLOW for objc2 FFI (workspace uses forbid)
unsafe_code = "allow"
unsafe_op_in_unsafe_fn = "allow"

# Correctness - DENY (same as workspace)
unused = { level = "deny", priority = -1 }
nonstandard_style = { level = "deny", priority = -1 }
rust_2018_idioms = { level = "deny", priority = -1 }
rust_2021_compatibility = { level = "deny", priority = -1 }
future_incompatible = { level = "deny", priority = -1 }

# Specific denials
dead_code = "deny"
deprecated = "deny"
improper_ctypes = "deny"
non_shorthand_field_patterns = "deny"
path_statements = "deny"
trivial_casts = "deny"
trivial_numeric_casts = "deny"
unconditional_recursion = "deny"
unused_allocation = "deny"
unused_comparisons = "deny"
unused_extern_crates = "deny"
unused_import_braces = "deny"
unused_lifetimes = "deny"
unused_macro_rules = "deny"
unused_must_use = "deny"
unused_parens = "deny"
unused_qualifications = "deny"
unused_results = "deny"
unreachable_pub = "deny"
variant_size_differences = "deny"

# Documentation - relaxed for FFI code
missing_docs = "warn"
missing_debug_implementations = "warn"

[lints.clippy]
# Category enables
all = { level = "deny", priority = -1 }
pedantic = { level = "deny", priority = -1 }
nursery = { level = "warn", priority = -1 }
cargo = { level = "warn", priority = -1 }

# Allowed - outside our control or intentional
multiple_crate_versions = "allow"
redundant_pub_crate = "allow"

# Panics and unwraps
unwrap_used = "deny"
expect_used = "deny"
panic = "deny"
panic_in_result_fn = "deny"
unwrap_in_result = "deny"
indexing_slicing = "deny"

# Debug/development code
dbg_macro = "deny"
print_stdout = "deny"
print_stderr = "deny"
todo = "deny"
unimplemented = "deny"
unreachable = "deny"

# Suspicious code
suspicious = { level = "deny", priority = -1 }
correctness = { level = "deny", priority = -1 }

# Complexity
cognitive_complexity = { level = "warn", priority = 1 }
too_many_arguments = "warn"
too_many_lines = "warn"

# Safety adjacent
cast_possible_truncation = "deny"
cast_possible_wrap = "deny"
cast_precision_loss = "deny"
cast_sign_loss = "deny"
cast_lossless = "warn"
ptr_as_ptr = "deny"
ptr_cast_constness = "deny"

# Error handling
map_err_ignore = "deny"
result_unit_err = "deny"

# Performance
inefficient_to_string = "deny"
invalid_upcast_comparisons = "deny"
linkedlist = "deny"
mutex_atomic = "deny"
rc_buffer = "deny"
rc_mutex = "deny"
redundant_clone = "deny"

# Correctness
clone_on_ref_ptr = "deny"
expl_impl_clone_on_copy = "deny"
float_cmp = "deny"
float_cmp_const = "deny"
lossy_float_literal = "deny"
same_name_method = "deny"
string_add = "deny"

[dependencies]
log = "0.4"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
base64 = "0.22"

[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.6"
objc2-foundation = { version = "0.3", features = ["NSString"] }
objc2-app-kit = { version = "0.3", features = [
    "NSImage",
    "NSWorkspace",
    "NSRunningApplication",
] }
```

**Step 3: Create lib.rs**

Create `crates/common/app-icons/src/lib.rs`:

```rust
//! macOS app icon management — Dock swap via objc2/AppKit.
//!
//! This crate is separated from `src-tauri` because the workspace sets
//! `unsafe_code = "forbid"`. The objc2 FFI calls require `unsafe`, so
//! they live here with a local lint override — following the same pattern
//! as `orbit-sf-symbols` and `orbit-plugin-decorum`.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

// ============================================
// Types
// ============================================

/// Metadata for a single app icon variant (read from `meta.json`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppIconMeta {
    /// Unique identifier, matches folder name.
    pub id: String,
    /// Display name shown under the preview card.
    pub name: String,
    /// Group label (e.g. "Classic", "Minimal").
    pub theme: String,
    /// Only one icon should have this set to `true`.
    #[serde(default)]
    pub default: bool,
}

/// Info returned to the frontend for each icon.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppIconInfo {
    /// Unique identifier.
    pub id: String,
    /// Display name.
    pub name: String,
    /// Theme group label.
    pub theme: String,
    /// Whether this is the default (bundled) icon.
    pub is_default: bool,
    /// Whether this icon is currently active.
    pub is_active: bool,
    /// Base64-encoded data URL for the preview image.
    pub preview_data_url: String,
}

// ============================================
// macOS AppKit integration (objc2)
// ============================================

/// Set the Dock icon to a custom image file.
///
/// **Must be called on the main thread.**
/// Returns `true` if the Dock icon was successfully changed.
#[cfg(target_os = "macos")]
pub fn set_dock_icon(icon_path: &Path) -> bool {
    use objc2::msg_send;
    use objc2::runtime::AnyClass;
    use objc2_foundation::NSString;

    let path_str = icon_path.to_string_lossy();
    let ns_path = NSString::from_str(&path_str);

    unsafe {
        let ns_image_class = match AnyClass::get(c"NSImage") {
            Some(cls) => cls,
            None => return false,
        };

        // NSImage.alloc.initWithContentsOfFile:
        let image: *mut objc2::runtime::AnyObject =
            msg_send![ns_image_class, alloc];
        let image: *mut objc2::runtime::AnyObject =
            msg_send![image, initWithContentsOfFile: &*ns_path];
        if image.is_null() {
            return false;
        }

        let ns_workspace_class = match AnyClass::get(c"NSWorkspace") {
            Some(cls) => cls,
            None => return false,
        };
        let workspace: *mut objc2::runtime::AnyObject =
            msg_send![ns_workspace_class, sharedWorkspace];

        let ns_bundle_class = match AnyClass::get(c"NSBundle") {
            Some(cls) => cls,
            None => return false,
        };
        let main_bundle: *mut objc2::runtime::AnyObject =
            msg_send![ns_bundle_class, mainBundle];
        let bundle_path: *mut objc2::runtime::AnyObject =
            msg_send![main_bundle, bundlePath];

        let result: bool =
            msg_send![workspace, setIcon: image, forFile: bundle_path];

        // Force Dock cache refresh
        let _: () = msg_send![workspace, noteFileSystemChanged: bundle_path];

        result
    }
}

/// Reset the Dock icon to the default (bundled) icon.
///
/// **Must be called on the main thread.**
/// Returns `true` if the icon was successfully reset.
#[cfg(target_os = "macos")]
pub fn reset_dock_icon() -> bool {
    use objc2::msg_send;
    use objc2::runtime::AnyClass;

    unsafe {
        let ns_workspace_class = match AnyClass::get(c"NSWorkspace") {
            Some(cls) => cls,
            None => return false,
        };
        let workspace: *mut objc2::runtime::AnyObject =
            msg_send![ns_workspace_class, sharedWorkspace];

        let ns_bundle_class = match AnyClass::get(c"NSBundle") {
            Some(cls) => cls,
            None => return false,
        };
        let main_bundle: *mut objc2::runtime::AnyObject =
            msg_send![ns_bundle_class, mainBundle];
        let bundle_path: *mut objc2::runtime::AnyObject =
            msg_send![main_bundle, bundlePath];

        let null: *const objc2::runtime::AnyObject = std::ptr::null();
        let result: bool =
            msg_send![workspace, setIcon: null, forFile: bundle_path];

        let _: () = msg_send![workspace, noteFileSystemChanged: bundle_path];

        result
    }
}

// ============================================
// Main-thread detection
// ============================================

/// Check if the current thread is the main thread.
///
/// Used by the Tauri command wrapper to avoid re-dispatching when
/// already on the main thread (e.g. during `.setup()`).
#[cfg(target_os = "macos")]
pub fn is_main_thread() -> bool {
    objc2_foundation::MainThreadMarker::new().is_some()
}

// ============================================
// Helpers (cross-platform)
// ============================================

/// Encode a PNG file as a base64 data URL.
pub fn encode_preview_data_url(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
    Some(format!("data:image/png;base64,{b64}"))
}

/// Validate that a stored icon ID exists in the discovered set.
/// Returns `None` if the ID is invalid (triggers fallback to default).
pub fn resolve_active_id(
    stored: &Option<String>,
    icons: &[AppIconMeta],
) -> Option<String> {
    match stored {
        Some(id) if icons.iter().any(|icon| icon.id == *id) => Some(id.clone()),
        _ => None,
    }
}

/// Scan an icons directory for valid icon entries.
///
/// Each subdirectory must contain `meta.json`, `icon.png`, and `preview.png`.
/// Validates collection integrity: warns on duplicate IDs or multiple defaults.
pub fn scan_icons_dir(dir: &Path) -> Vec<(PathBuf, AppIconMeta)> {
    let mut results = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return results,
    };

    let mut seen_ids = std::collections::HashSet::new();
    let mut default_count = 0u32;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let meta_path = path.join("meta.json");
        let meta_content = match fs::read_to_string(&meta_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let meta: AppIconMeta = match serde_json::from_str(&meta_content) {
            Ok(m) => m,
            Err(_) => continue,
        };

        // Require both preview.png and icon.png
        if !path.join("preview.png").exists() || !path.join("icon.png").exists() {
            log::warn!("Icon '{}' missing preview.png or icon.png, skipping", meta.id);
            continue;
        }

        // Validate collection integrity
        if !seen_ids.insert(meta.id.clone()) {
            log::warn!("Duplicate icon ID '{}', skipping", meta.id);
            continue;
        }
        if meta.default {
            default_count += 1;
            if default_count > 1 {
                log::warn!("Multiple icons marked as default ('{}')", meta.id);
            }
        }

        results.push((path, meta));
    }

    if default_count == 0 && !results.is_empty() {
        log::warn!("No icon marked as default in collection");
    }

    results
}
```

**Step 4: Add dependency to src-tauri/Cargo.toml**

In `src-tauri/Cargo.toml`, add to the workspace crates section (after `orbit-sf-symbols`):

```toml
orbit-app-icons = { path = "../crates/common/app-icons" }
```

**Step 5: Verify build**

Run: `cargo build`
Expected: PASS — the workspace `members = ["crates/common/*"]` glob automatically includes the new crate.

**Step 6: Commit**

```bash
git add crates/common/app-icons/ src-tauri/Cargo.toml
git commit -m "feat(icons): create orbit-app-icons crate with objc2 Dock swap and icon scanning"
```

---

### Task 5: Create Tauri Icon Commands (thin safe wrapper)

> **Key pattern:** `src-tauri` stays fully safe. It delegates to `orbit-app-icons` for scanning/encoding and uses `sync_channel` for main-thread AppKit dispatch — matching the `decorum/lib.rs` pattern where the native result is captured before acting on it.

**Files:**

- Create: `src-tauri/src/commands/common/icons.rs`
- Modify: `src-tauri/src/commands/common/mod.rs` (~line 16)
- Modify: `src-tauri/src/lib.rs` (~line 33 for import, ~line 561 for generate_handler)

**Step 1: Create icons.rs**

Create `src-tauri/src/commands/common/icons.rs`:

```rust
//! App icon commands — thin safe wrapper over `orbit-app-icons`.
//!
//! All unsafe objc2 code lives in the `orbit-app-icons` crate.
//! This module handles Tauri command registration, main-thread dispatch
//! via sync_channel, and settings persistence.

use std::fs;
use std::path::PathBuf;

use orbit_app_icons::{
    encode_preview_data_url, resolve_active_id, scan_icons_dir,
    AppIconInfo, AppIconMeta,
};
use orbit_core::Result;
use orbit_settings::SettingsManager;
use tauri::{AppHandle, Manager as _, State};

use crate::core::sentry_utils::SentryCapture as _;

// ============================================
// Helpers
// ============================================

/// Resolve the bundled app-icons directory.
fn bundled_icons_dir(app: &AppHandle) -> Option<PathBuf> {
    // Production: Contents/Resources/app-icons/
    let resource_dir = app.path().resource_dir().ok()?;
    let icons_dir = resource_dir.join("app-icons");
    if icons_dir.is_dir() {
        return Some(icons_dir);
    }

    // Development: resolve via CARGO_MANIFEST_DIR or relative
    let dev_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("icons/app-icons");
    if dev_dir.is_dir() {
        Some(dev_dir)
    } else {
        None
    }
}

// ============================================
// Commands
// ============================================

/// List all available app icons (bundled), with preview images as data URLs.
///
/// Validates the persisted `active_icon_id` against the discovered set.
/// If the stored ID doesn't match any icon, falls back to default.
#[tauri::command]
pub fn list_app_icons(
    app: AppHandle,
    settings: State<'_, SettingsManager>,
) -> Result<Vec<AppIconInfo>> {
    let icons_dir = bundled_icons_dir(&app)
        .ok_or_else(|| orbit_core::Error::Other("App icons directory not found".into()))?;

    let discovered = scan_icons_dir(&icons_dir);
    let metas: Vec<AppIconMeta> = discovered.iter().map(|(_, m)| m.clone()).collect();
    let active_id = resolve_active_id(&settings.get().active_icon_id, &metas);

    let mut icons: Vec<AppIconInfo> = discovered
        .into_iter()
        .filter_map(|(path, meta)| {
            let preview_data_url = encode_preview_data_url(&path.join("preview.png"))?;
            let is_active = match &active_id {
                Some(id) => *id == meta.id,
                None => meta.default,
            };
            Some(AppIconInfo {
                id: meta.id,
                name: meta.name,
                theme: meta.theme,
                is_default: meta.default,
                is_active,
                preview_data_url,
            })
        })
        .collect();

    // Sort by theme, then name
    icons.sort_by(|a, b| a.theme.cmp(&b.theme).then(a.name.cmp(&b.name)));

    // If stored ID was invalid, clear it from settings
    if settings.get().active_icon_id.is_some() && active_id.is_none() {
        let mut current = settings.get();
        current.active_icon_id = None;
        let _ = settings.update(&current);
    }

    Ok(icons)
}

/// Set the active app icon and live-swap the Dock icon (macOS only).
///
/// Uses `sync_channel` to dispatch the AppKit call to the main thread and
/// wait for the result before persisting — matching the `decorum` plugin
/// pattern. Only persists `active_icon_id` when the native Dock swap succeeds.
#[tauri::command]
pub fn set_app_icon(
    id: String,
    app: AppHandle,
    settings: State<'_, SettingsManager>,
) -> Result<()> {
    let icons_dir = bundled_icons_dir(&app)
        .ok_or_else(|| orbit_core::Error::Other("App icons directory not found".into()))?;
    let icon_dir = icons_dir.join(&id);
    let icon_path = icon_dir.join("icon.png");

    if !icon_path.exists() {
        return Err(orbit_core::Error::Other(format!("Icon '{id}' not found")));
    }

    // Read meta to check if this is the default icon
    let meta_path = icon_dir.join("meta.json");
    let meta_content = fs::read_to_string(&meta_path)
        .map_err(|e| orbit_core::Error::Other(e.to_string()))?;
    let meta: AppIconMeta = serde_json::from_str(&meta_content)
        .map_err(|e| orbit_core::Error::Other(e.to_string()))?;

    // Dispatch Dock swap on main thread, wait for result via sync_channel
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = std::sync::mpsc::sync_channel(1);

        let dispatch_result = if meta.default {
            app.run_on_main_thread(move || {
                let result = orbit_app_icons::reset_dock_icon();
                let _ = tx.send(result);
            })
        } else {
            let icon_path_clone = icon_path.clone();
            app.run_on_main_thread(move || {
                let result = orbit_app_icons::set_dock_icon(&icon_path_clone);
                let _ = tx.send(result);
            })
        };

        // Propagate dispatch failure
        dispatch_result
            .map_err(|e| orbit_core::Error::Other(e.to_string()))?;

        // Wait for native result — only persist on success
        match rx.recv() {
            Ok(true) => {} // Success — fall through to persist
            Ok(false) => {
                return Err(orbit_core::Error::Other(
                    "Failed to set Dock icon (NSWorkspace.setIcon returned false)".into(),
                ));
            }
            Err(_) => {
                return Err(orbit_core::Error::Other(
                    "Failed to set Dock icon (main thread channel closed)".into(),
                ));
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        return Err(orbit_core::Error::Other(
            "App icon switching is only supported on macOS".into(),
        ));
    }

    // Persist the choice (only reached on macOS after native success)
    #[cfg(target_os = "macos")]
    {
        let mut current = settings.get();
        current.active_icon_id = if meta.default { None } else { Some(id) };
        settings.update(&current).capture("set_app_icon")
    }
}

/// Re-apply persisted icon on app launch. Called from `lib.rs` setup.
///
/// Branches on `is_main_thread()` to avoid re-dispatching when `.setup()`
/// already runs on the main thread — matching the `decorum` plugin pattern.
/// If the Dock swap fails or the stored ID is stale, the setting is cleared.
#[cfg(target_os = "macos")]
pub fn reapply_persisted_icon(app: &AppHandle) {
    let settings = app.state::<SettingsManager>();
    let icon_id = match settings.get().active_icon_id {
        Some(id) => id,
        None => return, // Default icon, nothing to re-apply
    };

    let icons_dir = match bundled_icons_dir(app) {
        Some(d) => d,
        None => return,
    };

    let icon_path = icons_dir.join(&icon_id).join("icon.png");
    if !icon_path.exists() {
        // Stale ID — clear it
        let mut current = settings.get();
        current.active_icon_id = None;
        let _ = settings.update(&current);
        return;
    }

    // Branch on main-thread status to avoid re-dispatch during setup
    let success = if orbit_app_icons::is_main_thread() {
        // Already on main thread (typical during .setup()) — call directly
        orbit_app_icons::set_dock_icon(&icon_path)
    } else {
        // Off main thread — dispatch via sync_channel
        let (tx, rx) = std::sync::mpsc::sync_channel(1);
        let icon_path_clone = icon_path.clone();
        let dispatch_result = app.run_on_main_thread(move || {
            let result = orbit_app_icons::set_dock_icon(&icon_path_clone);
            let _ = tx.send(result);
        });

        if dispatch_result.is_err() {
            log::warn!("Failed to dispatch reapply_persisted_icon to main thread");
            false
        } else {
            rx.recv().ok() == Some(true)
        }
    };

    if !success {
        log::warn!("Failed to re-apply persisted app icon, clearing setting");
        let mut current = settings.get();
        current.active_icon_id = None;
        let _ = settings.update(&current);
    }
}
```

**Step 2: Register module in mod.rs**

In `src-tauri/src/commands/common/mod.rs`, add:

```rust
pub mod icons;
```

**Step 3: Add import and register commands in lib.rs**

In `src-tauri/src/lib.rs`:

1. Add `icons` to the existing `use commands::common::{...}` block (~line 33).

2. Add to `generate_handler![]` after `settings::pick_directory` (~line 561):

```rust
// Icon commands
icons::list_app_icons,
icons::set_app_icon,
```

3. Add re-apply call inside `.setup()` block, after `agent_cmd::setup_event_callbacks` (~line 299):

```rust
// Re-apply custom app icon if one was persisted
#[cfg(target_os = "macos")]
icons::reapply_persisted_icon(&app.handle());
```

**Step 4: Verify build**

Run: `cargo build`
Expected: PASS — `src-tauri` contains no `unsafe` code, only safe calls to `orbit_app_icons`.

**Step 5: Commit**

```bash
git add src-tauri/src/commands/common/icons.rs src-tauri/src/commands/common/mod.rs src-tauri/src/lib.rs
git commit -m "feat(icons): add Tauri icon commands with sync_channel result propagation"
```

---

### Task 6: Add Frontend API Functions + Barrel Export

**Files:**

- Create: `apps/agent/src/lib/api/icons.ts`
- Modify: `apps/agent/src/lib/api/index.ts` (add barrel export)

**Step 1: Create the API module**

Create `apps/agent/src/lib/api/icons.ts`:

```typescript
/**
 * App Icon Operations (macOS only)
 *
 * Functions for listing and switching the macOS app icon.
 */

import { invoke } from './core';

// ============================================
// Types
// ============================================

export interface AppIconInfo {
  readonly id: string;
  readonly name: string;
  readonly theme: string;
  readonly isDefault: boolean;
  readonly isActive: boolean;
  /** Base64-encoded data URL for the preview image. */
  readonly previewDataUrl: string;
}

// ============================================
// App Icon Operations
// ============================================

/** List all available app icons (bundled). UI is gated to macOS via `isMac()`. */
export async function listAppIcons(): Promise<AppIconInfo[]> {
  return invoke<AppIconInfo[]>('list_app_icons');
}

/** Set the active app icon and live-swap the Dock icon. */
export async function setAppIcon(id: string): Promise<void> {
  return invoke('set_app_icon', { id });
}
```

**Step 2: Export from barrel**

In `apps/agent/src/lib/api/index.ts`, add:

```typescript
export { listAppIcons, setAppIcon } from './icons';
export type { AppIconInfo } from './icons';
```

**Step 3: Commit**

```bash
git add apps/agent/src/lib/api/icons.ts apps/agent/src/lib/api/index.ts
git commit -m "feat(icons): add frontend API functions with barrel export"
```

---

### Task 7: Create App Icon Picker Component

**Files:**

- Create: `apps/agent/src/components/modals/settings/components/AppIconPicker.tsx`
- Modify: `apps/agent/src/components/modals/settings/components/index.ts`

**Step 1: Create the picker component**

Create `apps/agent/src/components/modals/settings/components/AppIconPicker.tsx`:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';

import type { AppIconInfo } from '@/lib/api/icons';
import type { FC } from 'react';

import { Check } from 'lucide-react';
import { toast } from 'sonner';

import { createLogger } from '@orbit/common/lib';
import { cn } from '@/lib/utils';

import { listAppIcons, setAppIcon } from '@/lib/api/icons';

const logger = createLogger('AppIconPicker');

/** Group icons by their theme field. */
function groupByTheme(icons: AppIconInfo[]): Map<string, AppIconInfo[]> {
  const groups = new Map<string, AppIconInfo[]>();
  for (const icon of icons) {
    const group = groups.get(icon.theme) ?? [];
    group.push(icon);
    groups.set(icon.theme, group);
  }
  return groups;
}

export const AppIconPicker: FC = () => {
  const [icons, setIcons] = useState<AppIconInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  // Track the last confirmed active icon separately from the optimistic one.
  const confirmedActiveIdRef = useRef<string | null>(null);
  // Serialized request queue — only one switch in flight at a time.
  // If the user clicks again while a switch is in flight, the new target
  // is queued and processed after the current request settles.
  const inFlightRef = useRef(false);
  const pendingIdRef = useRef<string | null>(null);

  // Fetch icons on mount
  useEffect(() => {
    listAppIcons()
      .then((result) => {
        setIcons(result);
        const active = result.find((i) => i.isActive);
        if (active !== undefined) {
          setActiveId(active.id);
          confirmedActiveIdRef.current = active.id;
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        logger.error('Failed to load app icons', err);
        setLoading(false);
      });
  }, []);

  // Process a single icon switch. Only one runs at a time.
  const processSwitch = useCallback(async (id: string): Promise<void> => {
    inFlightRef.current = true;
    setSwitching(id);
    setActiveId(id); // Optimistic update
    try {
      await setAppIcon(id);
      confirmedActiveIdRef.current = id;
    } catch (err: unknown) {
      logger.error('Failed to set app icon', err);
      toast.error('Failed to switch app icon');
      setActiveId(confirmedActiveIdRef.current);
    } finally {
      setSwitching(null);
      inFlightRef.current = false;
      // Process queued target if one exists
      const next = pendingIdRef.current;
      pendingIdRef.current = null;
      if (next !== null && next !== confirmedActiveIdRef.current) {
        void processSwitch(next);
      }
    }
  }, []);

  // "Last click wins" via serialized queue
  const handleSelect = useCallback(
    (id: string): void => {
      if (id === activeId) return;
      if (inFlightRef.current) {
        // Queue this as the next target, overwriting any previous pending
        pendingIdRef.current = id;
        setActiveId(id); // Optimistic UI update
        return;
      }
      void processSwitch(id);
    },
    [activeId, processSwitch]
  );

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="aspect-square rounded-xl bg-foreground/5 animate-pulse"
          />
        ))}
      </div>
    );
  }

  // Hide entirely if no icons (empty directory or load failure)
  if (icons.length === 0) {
    return null;
  }

  const grouped = groupByTheme(icons);

  return (
    <div className="space-y-4">
      {Array.from(grouped.entries()).map(([theme, themeIcons]) => (
        <div key={theme}>
          <p className="text-xs font-medium text-muted-foreground mb-2">{theme}</p>
          <div className="grid grid-cols-3 gap-3">
            {themeIcons.map((icon) => {
              const isActive = icon.id === activeId;
              const isSwitching = icon.id === switching;
              return (
                <button
                  key={icon.id}
                  type="button"
                  aria-label={`Set app icon to ${icon.name}`}
                  className={cn(
                    'relative flex flex-col items-center gap-1.5 p-3 rounded-xl',
                    'transition-transform duration-200',
                    'motion-reduce:transition-none',
                    'hover:scale-[1.03] active:scale-[0.98]',
                    isActive
                      ? 'ring-2 ring-primary bg-primary/8'
                      : 'bg-foreground/5 hover:bg-foreground/8'
                  )}
                  onClick={() => void handleSelect(icon.id)}
                >
                  {/* Preview image */}
                  <div className="relative w-16 h-16">
                    <img
                      src={icon.previewDataUrl}
                      alt={icon.name}
                      className={cn(
                        'w-full h-full rounded-[12px] object-contain',
                        isSwitching && 'opacity-50'
                      )}
                      draggable={false}
                    />
                    {/* Active checkmark */}
                    {isActive && !isSwitching && (
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-3 h-3 text-primary-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Name */}
                  <span className="text-xs font-medium">{icon.name}</span>

                  {/* Default badge */}
                  {icon.isDefault && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                      Default
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
```

**Step 2: Export from components barrel**

In `apps/agent/src/components/modals/settings/components/index.ts`, add:

```typescript
export { AppIconPicker } from './AppIconPicker';
```

**Step 3: Commit**

```bash
git add apps/agent/src/components/modals/settings/components/AppIconPicker.tsx apps/agent/src/components/modals/settings/components/index.ts
git commit -m "feat(icons): add AppIconPicker grid component for Settings"
```

---

### Task 8: Integrate Picker into Appearance Settings (macOS-gated)

> **Consistent macOS gating:** The entire "App Icon" section (header + picker + divider) is wrapped in `isMac()` so non-macOS platforms see no trace of it. This aligns with the audit recommendation to pick one policy and enforce it consistently.

**Files:**

- Modify: `apps/agent/src/components/modals/settings/pages/AppearanceSettings.tsx`

**Step 1: Add the icon picker section**

In `AppearanceSettings.tsx`:

1. Add imports at top (after existing imports):

```typescript
import { AppIconPicker } from '../components';
import { isMac } from '@/lib/utils';
```

2. Add section at the top of the return JSX (before the "Theme" `SectionHeader`, ~line 72):

```tsx
{
  isMac() ? (
    <>
      <SectionHeader title="App Icon">Choose your Orbit dock icon</SectionHeader>

      <div className="mb-2">
        <AppIconPicker />
      </div>

      <SectionDivider />
    </>
  ) : null;
}
```

**Step 2: Verify it renders**

Run: `bunx tauri dev`
Navigate to Settings → Appearance. The "App Icon" section should appear at the top with the grid showing both `orbit-default` and `orbit-alt`.

**Step 3: Commit**

```bash
git add apps/agent/src/components/modals/settings/pages/AppearanceSettings.tsx
git commit -m "feat(icons): integrate AppIconPicker into Appearance settings (macOS-gated)"
```

---

### Task 9: TypeScript Type Check, Lint, and Rust Checks

**Files:** No file changes — verification only.

**Step 1: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 2: Run lint**

Run: `bun run lint`
Expected: PASS (zero warnings)

If lint errors, fix with: `bun run lint:fix`

**Step 3: Run Rust checks**

Run: `cargo clippy`
Expected: PASS

**Step 4: Run full build**

Run: `cargo build`
Expected: PASS (confirms objc2 linking works and `src-tauri` contains no unsafe code)

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address lint, type check, and clippy issues from icon system"
```

---

### Task 10: End-to-End Smoke Test

**Files:** No file changes — manual testing.

**Step 1: Build and launch**

Run: `bunx tauri dev`

**Step 2: Test the full flow**

1. Open Settings (Cmd+,) → Appearance tab
2. Verify "App Icon" section appears at top with icon grid
3. Verify default icon has "DEFAULT" badge and checkmark
4. Click the alt icon → Dock icon should change live
5. Click the default icon → Dock icon should revert
6. Close and reopen Settings → active state should be preserved
7. Quit and relaunch → custom icon should re-appear in Dock

**Step 3: Test error handling**

1. Rapid-click between icons → requests serialize (queued), last click wins, no crashes
2. Light/dark theme switch → picker looks correct in both
3. Manually edit `settings.json` to set a bogus `activeIconId` → re-open Settings → should show default as active (stale ID cleared)

**Step 4: Test sync_channel error path**

Verify that if the Dock swap fails (e.g., corrupt `icon.png`):

1. A toast error appears ("Failed to switch app icon")
2. The active icon reverts to the previous selection
3. `settings.json` does NOT contain the failed icon's ID

**Step 5: Test packaged build**

Run: `bunx tauri build`
Install the built `.app` from `src-tauri/target/release/bundle/macos/`

1. Verify Settings → Appearance shows icon grid with preview images
2. Verify Dock icon swap works from packaged app
3. Verify quit and relaunch re-applies the icon

---

## Summary

| Task | Component            | Description                                                  |
| ---- | -------------------- | ------------------------------------------------------------ |
| 1    | Settings (Rust + TS) | Add `active_icon_id` field                                   |
| 2    | Icon bundles         | Create default + alt variant with assets                     |
| 3    | Build config         | Wire `app-icons` into `tauri.conf.json`                      |
| 4    | Rust crate           | Create `orbit-app-icons` crate (objc2 + scanning + encoding) |
| 5    | Tauri commands       | Thin safe wrapper with `sync_channel` result propagation     |
| 6    | Frontend API         | TypeScript `invoke` wrappers + barrel export                 |
| 7    | React component      | `AppIconPicker` grid with base64 previews                    |
| 8    | Settings integration | Add picker to Appearance page (macOS-gated via `isMac()`)    |
| 9    | Quality gates        | typecheck + lint + clippy + build                            |
| 10   | Smoke test           | E2E manual + sync error path + packaged build verification   |

**Key differences from v2 plan:**

- objc2 code in dedicated `orbit-app-icons` crate (not `src-tauri`) — workspace `unsafe_code = "forbid"` compliance
- `sync_channel` result propagation before persisting — no fire-and-forget Dock swaps
- `is_main_thread()` guard in startup reapply — calls directly if already on main thread, dispatches otherwise (matches `decorum` pattern)
- Serialized icon-switch queue — one request in flight at a time, pending clicks queued and processed after current settles, true "last click wins"
- `toast.error()` on Dock swap failure — user-visible feedback via sonner, matching existing app patterns
- `confirmedActiveIdRef` tracks last confirmed icon — rollback always reverts to the correct state
- Non-macOS returns error from `set_app_icon`, entire UI section hidden via `isMac()`
- Collection validation (duplicate IDs, multiple defaults) in `scan_icons_dir`
- Icon API exported from barrel `apps/agent/src/lib/api/index.ts`
- Design doc fully reconciled — no remaining Swift/asset-protocol/`get_active_icon` references
- Release gate on `orbit-alt` distinct artwork
