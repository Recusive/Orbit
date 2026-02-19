//! Window management commands (traffic light visibility and positioning).

/// Show or hide the macOS traffic light buttons (close/minimize/zoom).
///
/// Uses `setHidden:` on each button. Positioning is handled by wry via
/// `trafficLightPosition` in `tauri.conf.json`. No-op on non-macOS platforms.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri command macro requires owned AppHandle"
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
