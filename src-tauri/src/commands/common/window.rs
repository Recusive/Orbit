//! Window management commands (traffic lights, glass theme).

/// Dispatch a closure on the main thread (macOS) and log failures.
/// On non-macOS platforms this is unused, so suppress the lint.
#[cfg(target_os = "macos")]
fn dispatch_main(app: &tauri::AppHandle, f: impl FnOnce() + Send + 'static) {
    if let Err(e) = app.run_on_main_thread(f) {
        log::warn!("run_on_main_thread failed: {e}");
    }
}

/// Tell the native glass defocus layer which theme Orbit is using.
///
/// This ensures the opaque fallback color shown on window defocus matches
/// the app's chosen theme, not the macOS system appearance.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri command macro requires owned AppHandle"
)]
pub fn set_glass_theme(app: tauri::AppHandle, is_dark: bool) {
    #[cfg(target_os = "macos")]
    dispatch_main(&app, move || {
        orbit_plugin_decorum::set_glass_effective_theme(is_dark);
    });

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        orbit_plugin_decorum::set_glass_effective_theme(is_dark);
    }
}

/// Set the opacity of the native frost layer (0.0–1.0).
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri command macro requires owned AppHandle"
)]
pub fn set_frost_alpha(app: tauri::AppHandle, alpha: f64) {
    #[cfg(target_os = "macos")]
    dispatch_main(&app, move || {
        orbit_plugin_decorum::set_frost_opacity(alpha);
    });

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        orbit_plugin_decorum::set_frost_opacity(alpha);
    }
}

/// Change the NSVisualEffectMaterial of the frost layer at runtime.
///
/// Allows light/dark mode to use different materials (e.g. `.menu` for
/// light mode is brighter than `.sidebar`).
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri command macro requires owned AppHandle"
)]
pub fn set_frost_material(app: tauri::AppHandle, material: i64) {
    #[cfg(target_os = "macos")]
    dispatch_main(&app, move || {
        orbit_plugin_decorum::set_frost_material(material);
    });

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        orbit_plugin_decorum::set_frost_material(material);
    }
}

/// Set the opacity of the screen-blend tint overlay (0.0–1.0).
///
/// Screen blend lightens the frost per-pixel while preserving blur texture.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri command macro requires owned AppHandle"
)]
pub fn set_tint_opacity(app: tauri::AppHandle, opacity: f64) {
    #[cfg(target_os = "macos")]
    dispatch_main(&app, move || {
        orbit_plugin_decorum::set_tint_opacity(opacity);
    });

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        orbit_plugin_decorum::set_tint_opacity(opacity);
    }
}

/// Configure the frost layer for a specific theme.
///
/// Sets material, appearance (VibrantLight/VibrantDark), and emphasis
/// to produce the lightest possible frost in light mode.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri command macro requires owned AppHandle"
)]
pub fn configure_frost_theme(app: tauri::AppHandle, is_dark: bool) {
    #[cfg(target_os = "macos")]
    dispatch_main(&app, move || {
        orbit_plugin_decorum::configure_frost_for_theme(is_dark);
    });

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        orbit_plugin_decorum::configure_frost_for_theme(is_dark);
    }
}

/// Show or hide the macOS traffic light buttons (close/minimize/zoom).
///
/// Uses `setHidden:` on each button. Positioning is handled by wry via
/// `trafficLightPosition` in `tauri.conf.json`. No-op on non-macOS platforms.
#[tauri::command]
#[cfg_attr(
    target_os = "macos",
    expect(
        clippy::needless_pass_by_value,
        reason = "Tauri command macro requires owned AppHandle"
    )
)]
pub fn set_traffic_lights_visible(
    app: tauri::AppHandle,
    visible: bool,
    x: f64,
    y: f64,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use orbit_plugin_decorum::WebviewWindowExt as _;
        use tauri::Manager as _;

        if let Some(window) = app.get_webview_window("main") {
            window
                .set_traffic_lights_visible(visible, x, y)
                .map_err(|e| e.to_string())?;
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, visible, x, y);
    }

    Ok(())
}
