# App Icon System

Runtime macOS Dock icon switching for Orbit. Users pick an icon in Settings, it swaps live — no restart, no build step, theme-aware.

> **Status:** Shipped (v0.0.6) | **Last updated:** March 2026

---

## How It Works

The user opens **Settings → Appearance → App Icon**. A React picker shows all bundled icons as a horizontal strip with a live Dock preview above it. Selecting an icon calls into Rust, which loads the PNG via `NSImage` and sets it on both the running app's Dock tile and the `.app` bundle's Finder icon. The choice is persisted to `settings.json` and reapplied on every launch and theme change.

The entire system is **auto-discovering** — drop a folder with `meta.json` + 4 PNGs into `app-icons/`, rebuild, done.

---

## Architecture

Three layers, each with a single responsibility:

```
React (AppIconPicker.tsx)
  │  invoke('list_app_icons')  →  base64 previews + metadata
  │  invoke('set_app_icon')    →  swap icon by ID
  ▼
Tauri Commands (icons.rs — safe Rust, no unsafe)
  │  scan_icons_dir()          →  discover folders, validate, encode
  │  set_app_icon()            →  validate → dispatch to main thread → persist
  │  reapply_persisted_icon()  →  startup + theme change re-application
  ▼
orbit-app-icons crate (lib.rs — unsafe allowed for objc2)
  │  set_dock_icon()           →  NSImage → setApplicationIconImage + setIcon:forFile:
  │  current_rendition()       →  reads NSApplication.effectiveAppearance → "Dark" or "Default"
  │  is_main_thread()          →  MainThreadMarker check
```

**Why the crate split?** The main Tauri crate runs with `unsafe_code = "forbid"`. All objc2/AppKit calls are isolated in `orbit-app-icons` which explicitly allows unsafe. The Tauri command layer stays safe Rust.

---

## Files

### Icons on Disk

```
src-tauri/icons/
├── 32x32.png                  # Tauri build icons (window chrome, installer)
├── 128x128.png                #   ↓
├── 128x128@2x.png             #   ↓ (Retina)
├── icon.icns                  # Static .app bundle icon (Finder, Launchpad)
│
└── app-icons/                 # Runtime picker icons — auto-discovered
    ├── orbit-default/
    │   ├── meta.json
    │   ├── icon-Default.png       # 1024×1024 Dock icon (light)
    │   ├── icon-Dark.png          # 1024×1024 Dock icon (dark)
    │   ├── preview-Default.png    # 256×256 picker thumbnail (light)
    │   └── preview-Dark.png       # 256×256 picker thumbnail (dark)
    ├── orbit-primary/
    ├── orbit-bubble/
    └── orbit-hand/
```

### Code

| File                                                                     | What it does                                                                                                    |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `crates/common/app-icons/src/lib.rs`                                     | objc2 AppKit: `set_dock_icon()`, `current_rendition()`, `is_main_thread()`, scanning, encoding, path resolution |
| `crates/common/app-icons/Cargo.toml`                                     | Depends on `objc2`, `objc2-app-kit`, `objc2-foundation` (macOS only), `serde`, `serde_json`                     |
| `src-tauri/src/commands/common/icons.rs`                                 | Tauri commands: `list_app_icons`, `set_app_icon`, `reapply_persisted_icon`                                      |
| `src-tauri/src/lib.rs`                                                   | Registers commands, calls `reapply_persisted_icon` at startup, wires `ThemeChanged` listener                    |
| `crates/common/settings/src/lib.rs`                                      | `active_icon_id: Option<String>` field on `Settings` struct                                                     |
| `apps/agent/src/components/modals/settings/components/AppIconPicker.tsx` | React picker: Dock preview + icon strip with optimistic UI                                                      |
| `apps/agent/src/lib/api/icons.ts`                                        | Frontend invoke wrappers: `listAppIcons()`, `setAppIcon(id)`                                                    |
| `apps/agent/src/components/modals/settings/pages/AppearanceSettings.tsx` | Mounts `AppIconPicker` behind `isMac()` platform check                                                          |

---

## Data Flow

### Listing icons (Settings open)

1. Frontend calls `invoke('list_app_icons')`
2. `bundled_icons_dir()` resolves the path — production: `Resources/app-icons` inside the `.app` bundle, dev: `src-tauri/icons/app-icons`
3. `scan_icons_dir()` reads each subfolder, parses `meta.json`, validates `icon-Default.png` and `preview-Default.png` exist, deduplicates IDs, warns on missing defaults
4. For each valid icon, `icon_path_for_appearance()` picks the light or dark 1024×1024 Dock icon PNG (not the 256×256 preview — the full icon downscales crisply on Retina)
5. `resolve_active_id()` checks the stored `active_icon_id` against discovered icons — auto-clears stale IDs
6. Returns `AppIconInfo[]` sorted by theme then name, with `preview_path` as an absolute file path
7. Frontend `listAppIcons()` converts each path to an asset URL via `convertFileSrc()` — WebView loads images directly from disk, no base64 encoding or IPC byte transfer

### Switching icons (user clicks)

1. Frontend optimistically updates UI, calls `invoke('set_app_icon', { id })`
2. `set_app_icon()` joins the icon directory with the ID, resolves the appearance-correct PNG path via `icon_path_for_appearance()`
3. Validates `meta.json` is parseable (guard against corrupted folders)
4. Dispatches `set_dock_icon()` to the **main thread** via `sync_channel` + `run_on_main_thread` (AppKit requirement)
5. `set_dock_icon()` loads the PNG into `NSImage`, calls `setApplicationIconImage:` (Dock tile) and `setIcon:forFile:` + `noteFileSystemChanged:` (Finder)
6. Waits for the `sync_channel` result — settings are **only persisted on success**
7. On failure, frontend reverts to the last confirmed icon

### Startup

`reapply_persisted_icon()` runs during Tauri `.setup()` after settings load. If `active_icon_id` is set, it loads the correct rendition and calls `set_dock_icon()`. Handles main-thread vs non-main-thread dispatch. Auto-clears the setting if the icon no longer exists.

### Theme change

`WindowEvent::ThemeChanged` listener in `lib.rs` calls `reapply_persisted_icon()` → re-reads `current_rendition()` → loads the correct light/dark PNG → updates the Dock tile. No user action needed.

---

## Theme-Aware Rendering

Each icon ships with two renditions: `Default` (light) and `Dark`.

**Detection:** `current_rendition()` reads `NSApplication.effectiveAppearance.name` via objc2. If the name contains `"Dark"`, returns `"Dark"`, otherwise `"Default"`. Non-macOS always returns `"Default"`.

**Resolution:** `icon_path_for_appearance(icon_dir)` looks for `icon-{rendition}.png`. Falls back to `icon-Default.png` if the dark variant is missing.

**Same pattern for previews:** `preview_path_for_appearance()` follows the identical logic for picker thumbnails.

---

## Icon Sizing

Dock icons are **832×832 content centered on a 1024×1024 canvas** (81% fill). This matches the macOS icon grid — native apps get this padding automatically from `Assets.car`, but custom icons via `NSImage` don't.

```
┌──────────────────────────┐
│         96px padding      │  1024×1024 canvas
│   ┌──────────────────┐   │
│   │   832×832 artwork │   │  81% of canvas
│   └──────────────────┘   │
│         96px padding      │
└──────────────────────────┘
```

Preview thumbnails are **256×256** full-bleed (no padding).

---

## Frontend Picker

The `AppIconPicker` component has two parts:

1. **DockPreview** — a visual mock of the macOS Dock showing the selected icon with placeholder "apps" on either side, so the user can see how their choice looks in context
2. **Icon strip** — all icons in a horizontal row, each an `IconOption` button with selection ring and hover/active scale transforms

**Optimistic updates:** The UI updates immediately on click. If the backend call fails, it reverts to the last confirmed icon ID. Rapid clicks are debounced — if a switch is in-flight, the latest click is queued via `pendingIdRef` and processed when the current switch completes.

**Platform gating:** The entire section is wrapped in `isMac()` in `AppearanceSettings.tsx` — non-macOS users never see it.

---

## `meta.json` Schema

```json
{
  "id": "orbit-default",
  "name": "Orbit",
  "theme": "Classic",
  "default": true
}
```

| Field     | Type   | Constraint                                        |
| --------- | ------ | ------------------------------------------------- |
| `id`      | string | Must match the folder name                        |
| `name`    | string | Display label under the preview                   |
| `theme`   | string | Group label (currently "Classic" and "Whimsical") |
| `default` | bool   | Exactly one icon must be `true`                   |

---

## Tauri Bundle Config

```json
{
  "bundle": {
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns"],
    "macOS": {
      "files": {
        "Resources/app-icons": "icons/app-icons"
      }
    }
  }
}
```

- `bundle.icon` — Static icons embedded in the `.app` bundle for Finder/Launchpad/installer
- `macOS.files` — Copies `app-icons/` into `Contents/Resources/` at build time for runtime discovery

---

## Current Icons

| ID              | Name    | Theme     | Default |
| --------------- | ------- | --------- | ------- |
| `orbit-default` | Orbit   | Classic   | Yes     |
| `orbit-primary` | Primary | Classic   | No      |
| `orbit-bubble`  | Bubble  | Whimsical | No      |
| `orbit-hand`    | Hand    | Whimsical | No      |

---

## How to Add a New Icon

1. Create a folder in `src-tauri/icons/app-icons/orbit-<name>/`
2. Add `meta.json` with unique `id` matching the folder name, `"default": false`
3. Add 4 PNGs:
   - `icon-Default.png` — 1024×1024 (832px artwork centered)
   - `icon-Dark.png` — 1024×1024 (dark mode variant, same padding)
   - `preview-Default.png` — 256×256 full-bleed
   - `preview-Dark.png` — 256×256 full-bleed
4. `bunx tauri dev` → Settings → Appearance → icon appears automatically

**To create padded Dock icons from 832×832 artwork:**

```bash
sips --padToHeightWidth 1024 1024 icon-Default.png
sips --padToHeightWidth 1024 1024 icon-Dark.png
```

No code changes needed. The system auto-discovers new folders.

## How to Remove an Icon

1. Delete the folder from `src-tauri/icons/app-icons/`
2. If it was the default, mark another icon `"default": true`
3. Users who had it active get auto-cleared on next `list_app_icons` call

---

## Constraints

| Constraint                                            | Why                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| Folder name = `meta.json` `id`                        | `set_app_icon` joins the icons dir with the ID to find the folder         |
| `icon-Default.png` + `preview-Default.png` must exist | `scan_icons_dir()` skips entries missing either                           |
| Exactly one `"default": true`                         | `scan_icons_dir()` warns if zero or multiple                              |
| 1024×1024 PNGs with 832px content                     | Otherwise icons appear oversized next to native macOS icons               |
| `set_dock_icon()` runs on main thread                 | AppKit requirement — dispatched via `run_on_main_thread` + `sync_channel` |
| ALL icons use `set_dock_icon()` including default     | Ensures consistent sizing through the same `NSImage` pipeline             |
| `icon.icns` must contain RGBA PNGs                    | `tauri_build::build()` → `generate_context!()` validates at compile time  |
| Settings persist only on success                      | Prevents storing an ID that failed to apply                               |

---

## Edge Cases

| Case                                                      | What happens                                                      |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| Icon deleted after user selected it                       | `list_app_icons` auto-clears stale `active_icon_id` from settings |
| Dark rendition PNG missing                                | Falls back to `icon-Default.png`                                  |
| `setApplicationIconImage` doesn't persist across restarts | `reapply_persisted_icon()` runs at startup                        |
| Dock cache stale after swap                               | `NSWorkspace.noteFileSystemChanged(bundlePath)` forces refresh    |
| Rapid clicking in picker                                  | `pendingIdRef` queues latest, processes after in-flight completes |
| Backend swap fails                                        | Frontend reverts to `confirmedActiveIdRef`                        |
| Non-macOS platform                                        | Entire "App Icon" section hidden; commands return error           |

---

## Blockers Hit During Implementation

### Icons Appearing Bigger Than Native Apps

Non-default icons appeared larger than the default in the Dock.

**Root cause:** macOS renders the default icon from `Assets.car`, which applies ~81% icon grid padding. Custom icons via `NSImage.initWithContentsOfFile` fill the entire 1024×1024 tile.

**Fix:** Render all PNGs at 832×832 and pad to 1024×1024. Use `set_dock_icon()` for ALL icons including default so they all go through `NSImage`.

### Icons Not Updating on Theme Change

Switching macOS light↔dark didn't swap the Dock icon rendition.

**Root cause:** No listener for appearance changes.

**Fix:** `WindowEvent::ThemeChanged` → `reapply_persisted_icon()` → re-reads rendition → loads correct PNG.

### Infinite `tauri dev` Rebuild Loops

The app would build → launch → rebuild → relaunch endlessly.

**Root cause:** The original build pipeline wrote intermediate files (`Assets.car`, rendered PNGs) into `src-tauri/resources/`, which Tauri's file watcher monitors. Any write there triggered a rebuild.

**Fix:** Eliminated the entire build pipeline. PNGs are committed directly as source files. `build.rs` contains only `tauri_build::build()`.

---

## What Was Eliminated (and Why)

### Icon Composer `.icon` Bundles + ictool/actool Pipeline

The original design used `.icon` bundles (Xcode 26 Icon Composer) as source of truth. `build.rs` (~350 lines) rendered them to PNGs via `ictool` and compiled `Assets.car` via `actool`.

**Removed because:** Required specific Xcode tooling, caused infinite rebuild loops, and the PNGs were the actual runtime files anyway. Committing PNGs directly is simpler and portable.

### `Assets.car` (5.3MB)

Compiled asset catalog that provided Liquid Glass rendering in Finder.

**Removed because:** The runtime icon system uses PNGs via `NSImage`, not `Assets.car`. The static `icon.icns` handles Finder/Launchpad. Not worth 5.3MB for a cosmetic-only Finder improvement.

### Custom `Info.plist`

Set `CFBundleIconName` pointing into `Assets.car`.

**Removed because:** Only needed for `Assets.car`. Tauri generates its own `Info.plist` with `CFBundleIconFile` from the `"icon"` array in `tauri.conf.json`.

### `reset_dock_icon()`

Passed `nil` to `setApplicationIconImage` to restore the OS-default icon.

**Removed because:** When default used `Assets.car` but custom used `NSImage`, they appeared different sizes. Making ALL icons use `set_dock_icon()` made this dead code.

---

## Tests

`crates/common/app-icons/src/lib.rs` has unit tests covering:

- `resolve_active_id` — returns known IDs, `None` for unknown/missing
- `encode_preview_data_url` — produces valid `data:image/png;base64,` URLs
- `scan_icons_dir` — filters invalid entries (missing PNGs, bad JSON), deduplicates IDs, counts defaults

Run: `cargo test -p orbit-app-icons`
