# Multi-Icon System Design

> **Date**: 2026-03-09
> **Status**: Approved (reworked per audit)
> **Scope**: macOS app icon picker — live swap between bundled Icon Composer icons
> **Audit**: `reviews/audit-plan.md` — reworked to use Rust/objc2 (not Swift), base64 previews, validated IDs

---

## Summary

Users can pick from multiple app icons in the Settings panel. Icons are bundled `.icon` files (Icon Composer format) organized into themed groups, displayed as a grid of preview cards. Selecting an icon live-swaps the Dock icon via `NSWorkspace.shared.setIcon` — no restart required.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Settings Panel (React)                                  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Icon Grid (grouped by theme)                     │  │
│  │  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐             │  │
│  │  │     │  │     │  │     │  │     │             │  │
│  │  │Deflt│  │ Pro │  │Mono │  │Mint │             │  │
│  │  └─────┘  └─────┘  └─────┘  └─────┘             │  │
│  └───────────────────────────────────────────────────┘  │
│         │ invoke('set_app_icon', { id })                  │
│         ▼                                                │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Tauri Commands (src-tauri, safe Rust)             │  │
│  │  - set_app_icon(id) → main-thread dispatch + sync │  │
│  │  - list_app_icons() → scans bundled icons dir     │  │
│  └───────────────────────────────────────────────────┘  │
│         │ sync_channel (main-thread dispatch)            │
│         ▼                                                │
│  ┌───────────────────────────────────────────────────┐  │
│  │  orbit-app-icons crate (Rust/objc2, unsafe ok)    │  │
│  │  NSWorkspace.shared.setIcon(image, forFile: path) │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Settings open**: Frontend calls `list_app_icons()` → Rust scans `Contents/Resources/app-icons/`, reads `meta.json` from each → returns `{ id, name, theme, previewDataUrl, isDefault, isActive }[]`
2. **Icon select**: Frontend calls `set_app_icon({ id })` → Tauri command dispatches to main thread via `sync_channel` → `orbit-app-icons` calls `NSWorkspace.setIcon` → waits for result → persists choice to settings **only on success**
3. **App launch**: Rust reads persisted icon id from settings. If non-default, re-applies via `orbit-app-icons` during initialization (before window opens). `NSWorkspace.setIcon` doesn't survive restarts.

---

## Icon Bundle Format

All icons are bundled at build time inside the signed app:

```
Contents/Resources/app-icons/
├── orbit-default/
│   ├── icon.icon/
│   │   └── icon.json          # Icon Composer definition
│   ├── meta.json              # Metadata for discovery
│   └── preview.png            # 128x128 static preview for grid
├── orbit-neon/
│   ├── icon.icon/
│   │   └── icon.json
│   ├── meta.json
│   └── preview.png
├── orbit-mono/
│   └── ...
└── orbit-mint/
    └── ...
```

### `meta.json` Schema

```json
{
  "id": "orbit-default",
  "name": "Orbit",
  "theme": "Classic",
  "default": true
}
```

- `id` — Unique identifier, matches folder name
- `name` — Display name shown under the preview card
- `theme` — Group label (e.g. "Classic", "Minimal"). Groups are inferred from the collection — no hardcoded list
- `default` — Only one icon has this set to `true`

### Discovery

Scan `Contents/Resources/app-icons/` for subdirectories containing a valid `meta.json`. Sort by theme, then by name within each theme. `~/.orbit/icons/` reserved as a future expansion point for user-added icons.

### Preview Images

Each icon ships with a `preview.png` (128x128 static render) since `.icon` files can't be rendered in a webview. Exported from Icon Composer or screenshot.

---

## Rust/objc2 AppKit Integration

> **Reworked per audit:** Originally proposed Swift FFI. Changed to pure Rust/objc2 in a dedicated crate to match existing patterns (`sf-symbols`, `decorum`) and respect the workspace `unsafe_code = "forbid"` lint.

### File Layout

```
crates/common/app-icons/          # Dedicated crate (unsafe allowed)
├── Cargo.toml                    # Local lint override for objc2
└── src/
    └── lib.rs                    # AppKit calls + scanning/encoding helpers

src-tauri/src/commands/common/
└── icons.rs                      # Thin safe Tauri command wrapper
```

### AppKit Functions (in `orbit-app-icons` crate, `#[cfg(target_os = "macos")]`)

| Function                     | Purpose                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `set_dock_icon(path) → bool` | Load `NSImage` from `icon.png`, call `NSWorkspace.shared.setIcon(_:forFile:)` |
| `reset_dock_icon() → bool`   | Pass `nil` to `setIcon` to restore OS default                                 |

The Tauri command in `src-tauri` dispatches these functions to the main thread via `app.run_on_main_thread()` with a `sync_channel` to capture the result before persisting — matching the synchronous result pattern from `decorum/lib.rs`.

### Tauri Commands

| Command            | Signature               | Purpose                                                                      |
| ------------------ | ----------------------- | ---------------------------------------------------------------------------- |
| `list_app_icons()` | `() → Vec<AppIconInfo>` | Scan bundled icons, validate active ID, return with base64 preview data URLs |
| `set_app_icon(id)` | `(String) → Result<()>` | Load icon, dispatch Dock swap on main thread, persist to settings            |

`get_active_icon` was removed — `list_app_icons` returns `isActive` flag per icon.

### Preview Delivery

Preview images are returned as `data:image/png;base64,...` data URLs from Rust. This avoids asset-protocol scope issues in packaged apps (the scope in `tauri.conf.json` doesn't include `Contents/Resources/`).

### Icon Assets Per Variant

Each variant has two PNGs with distinct roles:

| File          | Size      | Purpose                                                      |
| ------------- | --------- | ------------------------------------------------------------ |
| `icon.png`    | 1024×1024 | High-res image for `NSWorkspace.setIcon` (Dock swap)         |
| `preview.png` | 128×128   | Thumbnail for the Settings grid (base64-encoded to frontend) |

### Active ID Validation

`active_icon_id` is validated against the discovered icon set on every `list_app_icons` call. If the stored ID doesn't match any icon (stale/deleted), it's auto-cleared to `None` and the default icon is marked active.

### Persistence

Active icon id stored via existing `orbit-settings` crate. On launch, `reapply_persisted_icon()` is called from `lib.rs` setup (after settings load, before window opens). If the stored ID is stale, it's cleared silently.

---

## Frontend: Settings Panel UI

### Placement

New **"App Icon"** section in the existing Settings dialog, under the Appearance group.

### Component

```
apps/agent/src/components/modals/settings/components/
└── AppIconPicker.tsx
```

Self-contained component. Reads icons via `list_app_icons()` on mount, renders grouped grid, handles selection. No new store — active icon id comes from the settings store.

### Grid Layout

```
┌─ App Icon ──────────────────────────────────────────┐
│                                                      │
│  Classic                                             │
│  ┌──────────┐  ┌──────────┐                         │
│  │          │  │          │                         │
│  │ preview  │  │ preview  │                         │
│  │          │  │          │                         │
│  │  Orbit   │  │  Orbit   │                         │
│  │ DEFAULT  │  │  Pro     │                         │
│  │    ✓     │  │          │                         │
│  └──────────┘  └──────────┘                         │
│                                                      │
│  Minimal                                             │
│  ┌──────────┐  ┌──────────┐                         │
│  │          │  │          │                         │
│  │ preview  │  │ preview  │                         │
│  │          │  │          │                         │
│  │  Mono    │  │  Mint    │                         │
│  │          │  │          │                         │
│  └──────────┘  └──────────┘                         │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Card Behavior

- **Preview**: `preview.png` delivered as base64 data URL from Rust (avoids asset-protocol scope issues)
- **Active state**: Checkmark overlay + ring border
- **Default badge**: Small "DEFAULT" label below the name on the original icon
- **Click**: Calls `set_app_icon`, brief loading state, checkmark moves to selected card
- **Hover**: Subtle scale-up (transform only, under 300ms, respects `prefers-reduced-motion`)

---

## Edge Cases

| Case                                                  | Solution                                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `NSWorkspace.setIcon` doesn't persist across restarts | Re-apply on launch from persisted setting                                    |
| Dock cache doesn't refresh                            | `noteFileSystemChanged(bundlePath)` after `setIcon`                          |
| Native Dock swap fails silently                       | `sync_channel` propagates `setIcon` result; only persist on success          |
| Non-macOS platform                                    | Entire "App Icon" UI section gated via `isMac()` — hidden on other platforms |
| Stale `active_icon_id` in settings                    | Validated on every `list_app_icons` call; auto-cleared if no match           |
| Future user-added icons                               | `~/.orbit/icons/` directory reserved, same folder structure as bundled       |

---

## Build Integration

### `tauri.conf.json` Changes

Add bundled icon directories to `macOS.files`:

```json
"macOS": {
  "files": {
    "Resources/Assets.car": "resources/Assets.car",
    "Resources/AppIcon.icon": "icons/icon.icon",
    "Resources/app-icons": "icons/app-icons"
  }
}
```

No `build.rs` changes needed — pure Rust/objc2, no separate compilation step.

---

## Files to Create/Modify

### New Files

| File                                                                     | Purpose                                                          |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `crates/common/app-icons/Cargo.toml`                                     | Crate manifest with local `unsafe_code = "allow"` + objc2 deps   |
| `crates/common/app-icons/src/lib.rs`                                     | AppKit Dock swap functions + icon scanning/encoding helpers      |
| `src-tauri/src/commands/common/icons.rs`                                 | Thin safe Tauri command wrapper (delegates to `orbit-app-icons`) |
| `apps/agent/src/lib/api/icons.ts`                                        | Frontend API invoke wrappers                                     |
| `apps/agent/src/components/modals/settings/components/AppIconPicker.tsx` | Settings panel icon grid component                               |
| `src-tauri/icons/app-icons/orbit-default/meta.json`                      | Default icon metadata                                            |
| `src-tauri/icons/app-icons/orbit-default/icon.png`                       | Default icon high-res (1024×1024) for Dock                       |
| `src-tauri/icons/app-icons/orbit-default/preview.png`                    | Default icon preview (128×128) for grid                          |
| `src-tauri/icons/app-icons/orbit-default/icon.icon/icon.json`            | Default Icon Composer definition                                 |
| `src-tauri/icons/app-icons/orbit-alt/`                                   | Alt variant (same structure as default)                          |

### Modified Files

| File                                                                     | Change                                                                     |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `Cargo.toml`                                                             | Already includes `crates/common/*` in workspace members (no change needed) |
| `crates/common/settings/src/lib.rs`                                      | Add `active_icon_id: Option<String>` to Settings struct                    |
| `apps/agent/src/lib/api/settings.ts`                                     | Add `activeIconId?: string` to Settings interface                          |
| `src-tauri/Cargo.toml`                                                   | Add `orbit-app-icons` path dependency                                      |
| `src-tauri/tauri.conf.json`                                              | Add `Resources/app-icons` to `macOS.files`                                 |
| `src-tauri/src/commands/common/mod.rs`                                   | Add `pub mod icons;`                                                       |
| `src-tauri/src/lib.rs`                                                   | Register icon commands, call `reapply_persisted_icon` in setup             |
| `apps/agent/src/lib/api/icons.ts`                                        | Export from barrel `apps/agent/src/lib/api/index.ts`                       |
| `apps/agent/src/components/modals/settings/pages/AppearanceSettings.tsx` | Add `AppIconPicker` section (gated via `isMac()`)                          |
| `apps/agent/src/components/modals/settings/components/index.ts`          | Export `AppIconPicker`                                                     |
