//! App icon commands.
//!
//! This is the safe Tauri-facing wrapper around `orbit-app-icons`.

#![allow(
    clippy::needless_pass_by_value,
    reason = "Tauri commands receive owned types from JSON deserialization"
)]

#[cfg(target_os = "macos")]
use std::fs;
#[cfg(target_os = "macos")]
use std::path::PathBuf;
#[cfg(target_os = "macos")]
use std::sync::mpsc::sync_channel;

use orbit_app_icons::AppIconInfo;
#[cfg(target_os = "macos")]
use orbit_app_icons::{icon_path_for_appearance, resolve_active_id, scan_icons_dir, AppIconMeta};
use orbit_core::{Error, Result};
use orbit_settings::SettingsManager;
#[cfg(target_os = "macos")]
use tauri::Manager as _;
use tauri::{AppHandle, State};

use crate::core::sentry_utils::SentryCapture as _;

/// Resolve the bundled app-icons directory.
#[cfg(target_os = "macos")]
fn bundled_icons_dir(app: &AppHandle) -> Option<PathBuf> {
    let resource_dir = app.path().resource_dir().ok()?;
    let bundled_dir = resource_dir.join("app-icons");
    if bundled_dir.is_dir() {
        return Some(bundled_dir);
    }

    let dev_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("icons/app-icons");
    dev_dir.is_dir().then_some(dev_dir)
}

/// List all bundled app icons.
#[tauri::command]
pub fn list_app_icons(
    app: AppHandle,
    settings: State<'_, SettingsManager>,
) -> Result<Vec<AppIconInfo>> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, settings);
        Err(Error::Other(
            "App icon switching is only supported on macOS".to_owned(),
        ))
        .capture("list_app_icons")
    }

    #[cfg(target_os = "macos")]
    {
        (|| {
            let icons_dir = bundled_icons_dir(&app).ok_or_else(|| {
                Error::Other("Bundled app-icons directory was not found".to_owned())
            })?;

            let discovered = scan_icons_dir(&icons_dir);
            let metas: Vec<AppIconMeta> = discovered.iter().map(|(_, meta)| meta.clone()).collect();

            let stored_active_id = settings.get().active_icon_id;
            let active_id = resolve_active_id(&stored_active_id, &metas);

            let mut icons: Vec<AppIconInfo> = discovered
                .into_iter()
                .filter_map(|(path, meta)| {
                    // Use the full 1024×1024 Dock icon for the picker —
                    // the WebView downscales natively for crisp Retina rendering.
                    let preview = icon_path_for_appearance(&path);
                    if !preview.is_file() {
                        return None;
                    }
                    let is_active = match active_id.as_deref() {
                        Some(id) => meta.id == id,
                        None => meta.default,
                    };

                    Some(AppIconInfo {
                        id: meta.id,
                        name: meta.name,
                        theme: meta.theme,
                        is_default: meta.default,
                        is_active,
                        preview_path: preview.to_string_lossy().into_owned(),
                    })
                })
                .collect();

            icons.sort_by(|left, right| {
                left.theme
                    .cmp(&right.theme)
                    .then(left.name.cmp(&right.name))
            });

            if stored_active_id.is_some() && active_id.is_none() {
                let mut current = settings.get();
                current.active_icon_id = None;
                if let Err(error) = settings
                    .update(&current)
                    .capture("list_app_icons_clear_invalid")
                {
                    log::warn!("Failed to clear stale active app icon id: {error}");
                }
            }

            Ok(icons)
        })()
        .capture("list_app_icons")
    }
}

/// Switch the active bundled app icon.
#[tauri::command]
pub fn set_app_icon(
    id: String,
    app: AppHandle,
    settings: State<'_, SettingsManager>,
) -> Result<()> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (id, app, settings);
        Err(Error::Other(
            "App icon switching is only supported on macOS".to_owned(),
        ))
        .capture("set_app_icon")
    }

    #[cfg(target_os = "macos")]
    {
        (|| {
            let icons_dir = bundled_icons_dir(&app).ok_or_else(|| {
                Error::Other("Bundled app-icons directory was not found".to_owned())
            })?;
            let icon_dir = icons_dir.join(&id);
            let icon_path = icon_path_for_appearance(&icon_dir);
            if !icon_path.is_file() {
                return Err(Error::FileNotFound(icon_path.display().to_string()));
            }

            // Validate that the icon directory has a parseable meta.json.
            let meta_path = icon_dir.join("meta.json");
            let meta_content = fs::read_to_string(&meta_path)?;
            drop(serde_json::from_str::<AppIconMeta>(&meta_content)?);

            // Use set_dock_icon for ALL icons (including default) so they
            // all go through the same rendering pipeline with consistent sizing.
            let (tx, rx) = sync_channel(1);
            let dispatch_result = app.run_on_main_thread(move || {
                let result = orbit_app_icons::set_dock_icon(&icon_path);
                if tx.send(result).is_err() {
                    log::debug!("set_app_icon receiver dropped before icon result");
                }
            });

            dispatch_result.map_err(|error| Error::Other(error.to_string()))?;

            match rx.recv() {
                Ok(true) => {},
                Ok(false) => {
                    return Err(Error::Other(
                        "Failed to switch Dock icon via NSWorkspace".to_owned(),
                    ));
                },
                Err(error) => {
                    return Err(Error::Other(format!(
                        "Failed to receive Dock icon switch result: {error}"
                    )));
                },
            }

            let mut current = settings.get();
            current.active_icon_id = Some(id);
            settings.update(&current)?;

            Ok(())
        })()
        .capture("set_app_icon")
    }
}

/// Re-apply the persisted icon selection at startup.
#[cfg(target_os = "macos")]
pub fn reapply_persisted_icon(app: &AppHandle) {
    let settings = app.state::<SettingsManager>();
    let Some(icon_id) = settings.get().active_icon_id else {
        return;
    };

    let Some(icons_dir) = bundled_icons_dir(app) else {
        return;
    };

    let icon_path = icon_path_for_appearance(&icons_dir.join(&icon_id));
    if !icon_path.is_file() {
        log::warn!("Persisted app icon '{icon_id}' no longer exists; clearing it");
        let mut current = settings.get();
        current.active_icon_id = None;
        drop(settings.update(&current));
        return;
    }

    let success = if orbit_app_icons::is_main_thread() {
        orbit_app_icons::set_dock_icon(&icon_path)
    } else {
        let (tx, rx) = sync_channel(1);
        let dispatch_result = app.run_on_main_thread(move || {
            let result = orbit_app_icons::set_dock_icon(&icon_path);
            if tx.send(result).is_err() {
                log::debug!("reapply_persisted_icon receiver dropped before icon result");
            }
        });

        if let Err(error) = dispatch_result {
            log::warn!("Failed to dispatch persisted icon reapply to main thread: {error}");
            false
        } else {
            rx.recv().is_ok_and(|result| result)
        }
    };

    if !success {
        log::warn!("Failed to re-apply persisted app icon '{icon_id}'; clearing it");
        let mut current = settings.get();
        current.active_icon_id = None;
        drop(settings.update(&current));
    }
}
