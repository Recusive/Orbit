//! SF Symbol rendering command.
//!
//! Thin wrapper around `orbit_sf_symbols::render_sf_symbol` that returns
//! base64-encoded PNG with natural dimensions for CSS `mask-image` rendering.

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use serde::Serialize;

/// Response payload for `get_sf_symbol`.
#[derive(Debug, Serialize)]
pub struct SFSymbolResponse {
    /// Base64-encoded PNG at 2× (Retina) resolution.
    base64: String,
    /// Natural logical width in points.
    width: f64,
    /// Natural logical height in points.
    height: f64,
}

/// Render an SF Symbol and return it as base64 PNG with natural dimensions.
///
/// The frontend uses this with CSS `mask-image` and `currentColor` so the
/// icon automatically matches the current theme color. The width/height
/// fields let the frontend preserve the symbol's natural aspect ratio.
///
/// Returns `Err` on non-macOS platforms or if the symbol name is not found.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri command macro requires owned types for JSON deserialization"
)]
pub fn get_sf_symbol(
    name: String,
    point_size: f64,
    weight: Option<String>,
) -> Result<SFSymbolResponse, String> {
    let result = orbit_sf_symbols::render_sf_symbol(&name, point_size, weight.as_deref())?;
    Ok(SFSymbolResponse {
        base64: STANDARD.encode(&result.png),
        width: result.width,
        height: result.height,
    })
}
