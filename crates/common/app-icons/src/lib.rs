//! macOS app icon management via `AppKit`.
//!
//! This crate owns the unsafe objc2 calls needed for Dock icon swapping so the
//! main Tauri crate can continue inheriting `unsafe_code = "forbid"`.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Metadata loaded from each bundled icon's `meta.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppIconMeta {
    /// Unique identifier for the icon.
    pub id: String,
    /// Display name shown in the picker.
    pub name: String,
    /// Theme bucket label for grouping.
    pub theme: String,
    /// Whether this entry is the default bundled icon.
    #[serde(default)]
    pub default: bool,
}

/// App icon data returned to the frontend picker.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppIconInfo {
    /// Unique identifier for the icon.
    pub id: String,
    /// Display name shown in the picker.
    pub name: String,
    /// Theme bucket label for grouping.
    pub theme: String,
    /// Whether this entry is the default bundled icon.
    pub is_default: bool,
    /// Whether this entry is currently active.
    pub is_active: bool,
    /// Absolute path to the preview thumbnail PNG.
    pub preview_path: String,
}

/// The rendition suffix for the current macOS appearance.
///
/// Returns `"Dark"` when dark mode is active, `"Default"` otherwise.
#[cfg(target_os = "macos")]
#[must_use]
pub fn current_rendition() -> &'static str {
    use objc2::msg_send;
    use objc2::runtime::{AnyClass, AnyObject};

    unsafe {
        let Some(app_class) = AnyClass::get(c"NSApplication") else {
            return "Default";
        };
        let app: *mut AnyObject = msg_send![app_class, sharedApplication];
        let appearance: *mut AnyObject = msg_send![app, effectiveAppearance];
        if appearance.is_null() {
            return "Default";
        }
        let name: *mut AnyObject = msg_send![appearance, name];
        if name.is_null() {
            return "Default";
        }
        let desc: *mut AnyObject = msg_send![name, description];
        if desc.is_null() {
            return "Default";
        }
        // NSAppearanceNameDarkAqua contains "Dark"
        let utf8: *const u8 = msg_send![desc, UTF8String];
        if !utf8.is_null() {
            let cstr = std::ffi::CStr::from_ptr(utf8.cast());
            if let Ok(s) = cstr.to_str() {
                if s.contains("Dark") {
                    return "Dark";
                }
            }
        }
        "Default"
    }
}

/// Fallback rendition detection for non-macOS.
#[cfg(not(target_os = "macos"))]
#[must_use]
pub fn current_rendition() -> &'static str {
    "Default"
}

/// Resolve the icon PNG path for the current appearance.
#[must_use]
pub fn icon_path_for_appearance(icon_dir: &Path) -> PathBuf {
    let rendition = current_rendition();
    let themed = icon_dir.join(format!("icon-{rendition}.png"));
    if themed.is_file() {
        return themed;
    }
    // Fallback to Default if the themed variant doesn't exist.
    icon_dir.join("icon-Default.png")
}

/// Resolve the preview PNG path for the current appearance.
#[must_use]
pub fn preview_path_for_appearance(icon_dir: &Path) -> PathBuf {
    let rendition = current_rendition();
    let themed = icon_dir.join(format!("preview-{rendition}.png"));
    if themed.is_file() {
        return themed;
    }
    icon_dir.join("preview-Default.png")
}

/// Resolve a stored active id against the discovered icon set.
#[must_use]
pub fn resolve_active_id(stored: &Option<String>, icons: &[AppIconMeta]) -> Option<String> {
    match stored {
        Some(id) if icons.iter().any(|icon| icon.id == *id) => Some(id.clone()),
        _ => None,
    }
}

/// Scan an icon directory for valid app icon entries.
#[must_use]
pub fn scan_icons_dir(dir: &Path) -> Vec<(PathBuf, AppIconMeta)> {
    let mut results = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return results;
    };

    let mut seen_ids = HashSet::new();
    let mut default_count = 0_u8;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let meta_path = path.join("meta.json");
        let Ok(meta_content) = fs::read_to_string(&meta_path) else {
            continue;
        };

        let meta = match serde_json::from_str::<AppIconMeta>(&meta_content) {
            Ok(meta) => meta,
            Err(error) => {
                log::warn!(
                    "Failed to parse app icon metadata at {}: {error}",
                    meta_path.display()
                );
                continue;
            },
        };

        if !path.join("preview-Default.png").is_file() || !path.join("icon-Default.png").is_file() {
            log::warn!(
                "Skipping app icon '{}': icon-Default.png or preview-Default.png is missing",
                meta.id
            );
            continue;
        }

        if !seen_ids.insert(meta.id.clone()) {
            log::warn!("Skipping duplicate app icon id '{}'", meta.id);
            continue;
        }

        if meta.default {
            default_count = default_count.saturating_add(1);
            if default_count > 1 {
                log::warn!("Multiple app icons are marked as default; '{}'", meta.id);
            }
        }

        results.push((path, meta));
    }

    if default_count == 0 && !results.is_empty() {
        log::warn!("No bundled app icon is marked as default");
    }

    results
}

/// Set the Dock icon to the supplied `.icon` bundle or image file.
///
/// Updates both the Finder file icon (`NSWorkspace.setIcon`) and the running
/// app's Dock tile (`NSApplication.applicationIconImage`).
///
/// Must be called on the main thread.
#[cfg(target_os = "macos")]
#[must_use]
pub fn set_dock_icon(icon_path: &Path) -> bool {
    use objc2::msg_send;
    use objc2::runtime::{AnyClass, AnyObject};
    use objc2_foundation::NSString;

    let path_string = icon_path.to_string_lossy();
    let ns_path = NSString::from_str(path_string.as_ref());

    unsafe {
        let Some(ns_image_class) = AnyClass::get(c"NSImage") else {
            return false;
        };
        let image: *mut AnyObject = msg_send![ns_image_class, alloc];
        let image: *mut AnyObject = msg_send![image, initWithContentsOfFile: &*ns_path];
        if image.is_null() {
            return false;
        }

        // Update the running app's Dock tile immediately.
        let Some(app_class) = AnyClass::get(c"NSApplication") else {
            return false;
        };
        let app: *mut AnyObject = msg_send![app_class, sharedApplication];
        let _: () = msg_send![app, setApplicationIconImage: image];

        // Also persist the icon on the .app bundle so Finder shows it.
        let Some(workspace_class) = AnyClass::get(c"NSWorkspace") else {
            return true; // Dock tile already updated — non-fatal
        };
        let workspace: *mut AnyObject = msg_send![workspace_class, sharedWorkspace];

        let Some(bundle_class) = AnyClass::get(c"NSBundle") else {
            return true;
        };
        let bundle: *mut AnyObject = msg_send![bundle_class, mainBundle];
        let bundle_path: *mut AnyObject = msg_send![bundle, bundlePath];

        let _: bool = msg_send![workspace, setIcon: image, forFile: bundle_path, options: 0_usize];
        let _: () = msg_send![workspace, noteFileSystemChanged: bundle_path];
        true
    }
}

/// Whether the current thread is the Cocoa main thread.
#[cfg(target_os = "macos")]
#[must_use]
pub fn is_main_thread() -> bool {
    objc2_foundation::MainThreadMarker::new().is_some()
}

#[cfg(test)]
#[expect(
    clippy::expect_used,
    clippy::indexing_slicing,
    reason = "tests should panic on failure"
)]
mod tests {
    use super::*;

    use std::fs;

    use tempfile::TempDir;

    fn write_icon_bundle(root: &Path, folder_name: &str, id: &str, is_default: bool) {
        let icon_dir = root.join(folder_name);
        fs::create_dir_all(&icon_dir).expect("Failed to create icon dir");
        fs::write(
            icon_dir.join("meta.json"),
            format!(
                r#"{{
  "id": "{id}",
  "name": "{id}",
  "theme": "Classic",
  "default": {is_default}
}}"#
            ),
        )
        .expect("Failed to write metadata");
        fs::write(icon_dir.join("preview-Default.png"), [1_u8, 2, 3])
            .expect("Failed to write preview");
        fs::write(icon_dir.join("icon-Default.png"), [4_u8, 5, 6]).expect("Failed to write icon");
    }

    fn temp_dir() -> TempDir {
        TempDir::new().expect("Failed to create temp dir")
    }

    #[test]
    fn resolve_active_id_returns_only_known_ids() {
        let icons = vec![
            AppIconMeta {
                id: String::from("orbit-default"),
                name: String::from("Orbit"),
                theme: String::from("Classic"),
                default: true,
            },
            AppIconMeta {
                id: String::from("orbit-alt"),
                name: String::from("Orbit Alt"),
                theme: String::from("Classic"),
                default: false,
            },
        ];

        assert_eq!(
            resolve_active_id(&Some(String::from("orbit-alt")), &icons),
            Some(String::from("orbit-alt"))
        );
        assert_eq!(
            resolve_active_id(&Some(String::from("missing")), &icons),
            None
        );
        assert_eq!(resolve_active_id(&None, &icons), None);
    }

    #[test]
    fn scan_icons_dir_filters_invalid_entries_and_duplicate_ids() {
        let temp = temp_dir();
        write_icon_bundle(temp.path(), "orbit-default", "orbit-default", true);
        write_icon_bundle(temp.path(), "orbit-alt", "orbit-alt", false);
        write_icon_bundle(temp.path(), "orbit-duplicate", "orbit-alt", false);

        let missing_asset_dir = temp.path().join("orbit-missing");
        fs::create_dir_all(&missing_asset_dir).expect("Failed to create missing asset dir");
        fs::write(
            missing_asset_dir.join("meta.json"),
            r#"{
  "id": "orbit-missing",
  "name": "orbit-missing",
  "theme": "Classic",
  "default": false
}"#,
        )
        .expect("Failed to write missing asset metadata");

        let mut scanned = scan_icons_dir(temp.path());
        scanned.sort_by(|left, right| left.1.id.cmp(&right.1.id));

        assert_eq!(scanned.len(), 2);
        assert_eq!(scanned[0].1.id, "orbit-alt");
        assert_eq!(scanned[1].1.id, "orbit-default");
    }
}
