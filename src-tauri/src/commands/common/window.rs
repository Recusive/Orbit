//! Window management commands (traffic lights, glass theme).

/// Tell the native glass defocus layer which theme Orbit is using.
///
/// This ensures the opaque fallback color shown on window defocus matches
/// the app's chosen theme, not the macOS system appearance.
#[tauri::command]
pub fn set_glass_theme(is_dark: bool) {
    orbit_plugin_decorum::set_glass_effective_theme(is_dark);
}

/// Set the opacity of the native frost layer (0.0–1.0).
#[tauri::command]
pub fn set_frost_alpha(alpha: f64) {
    orbit_plugin_decorum::set_frost_opacity(alpha);
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
