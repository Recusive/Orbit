//! Native macOS SF Symbol rendering via `AppKit`.
//!
//! Renders SF Symbols as 2× (Retina) PNG images suitable for display in
//! a Tauri webview with CSS `mask-image` and `currentColor` for automatic
//! theme-aware coloring.
//!
//! On non-macOS platforms, all functions return an error.

#[cfg(target_os = "macos")]
mod render;

/// Result of rendering an SF Symbol.
#[derive(Debug)]
pub struct SFSymbolResult {
    /// PNG bytes at 2× pixel resolution (Retina).
    pub png: Vec<u8>,
    /// Logical width in points (natural aspect ratio).
    pub width: f64,
    /// Logical height in points (natural aspect ratio).
    pub height: f64,
}

/// Render an SF Symbol to a PNG byte buffer with its natural dimensions.
///
/// # Arguments
///
/// * `name` — SF Symbol name (e.g. `"sidebar.left"`, `"chevron.right"`)
/// * `point_size` — Logical point size (e.g. 16.0, 20.0)
/// * `weight` — Optional weight name: `"ultralight"`, `"thin"`, `"light"`,
///   `"regular"` (default), `"medium"`, `"semibold"`, `"bold"`, `"heavy"`, `"black"`
///
/// # Returns
///
/// [`SFSymbolResult`] containing PNG bytes at 2× pixel resolution (Retina)
/// plus the symbol's natural logical dimensions. The image is rendered as a
/// black template on transparent background — the frontend applies color
/// via CSS `mask-image` with `background-color: currentColor`.
///
/// # Errors
///
/// Returns `Err` if the symbol name is not found, the weight is invalid,
/// or `AppKit` rendering fails. Always returns `Err` on non-macOS platforms.
pub fn render_sf_symbol(
    name: &str,
    point_size: f64,
    weight: Option<&str>,
) -> Result<SFSymbolResult, String> {
    #[cfg(target_os = "macos")]
    {
        let rendered = render::render(name, point_size, weight)?;
        Ok(SFSymbolResult {
            png: rendered.png,
            width: rendered.width,
            height: rendered.height,
        })
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (name, point_size, weight);
        Err("SF Symbols are only available on macOS".to_owned())
    }
}
