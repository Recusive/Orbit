//! Build script for orbit-plugin-decorum.
//!
//! This plugin has no Tauri commands - it only provides traffic light positioning
//! through the `on_window_ready` hook.

fn main() {
    tauri_plugin::Builder::new(&[]).build();
}
