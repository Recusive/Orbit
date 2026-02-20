//! macOS `AppKit` rendering pipeline for SF Symbols.
//!
//! Pipeline: `NSImage` (symbol lookup) → `NSImageSymbolConfiguration` (weight/scale)
//! → `NSBitmapImageRep` (2× raster) → PNG `NSData` → `Vec<u8>`.

use objc2::msg_send;
use objc2::runtime::{AnyClass, AnyObject};
use objc2_foundation::NSString;

// ─── FFI types ──────────────────────────────────────────────────────────────

#[repr(C)]
#[derive(Copy, Clone)]
struct CGSize {
    width: f64,
    height: f64,
}

unsafe impl objc2::Encode for CGSize {
    const ENCODING: objc2::Encoding = objc2::Encoding::Struct(
        "CGSize",
        &[objc2::Encoding::Double, objc2::Encoding::Double],
    );
}

#[repr(C)]
#[derive(Copy, Clone)]
struct CGPoint {
    x: f64,
    y: f64,
}

unsafe impl objc2::Encode for CGPoint {
    const ENCODING: objc2::Encoding = objc2::Encoding::Struct(
        "CGPoint",
        &[objc2::Encoding::Double, objc2::Encoding::Double],
    );
}

#[repr(C)]
#[derive(Copy, Clone)]
struct CGRect {
    origin: CGPoint,
    size: CGSize,
}

unsafe impl objc2::Encode for CGRect {
    const ENCODING: objc2::Encoding =
        objc2::Encoding::Struct("CGRect", &[CGPoint::ENCODING, CGSize::ENCODING]);
}

/// `NSBitmapFormat` — `NSBitmapFormatAlphaFirst` (premultiplied ARGB).
const NS_ALPHA_FIRST_BITMAP_FORMAT: usize = 1;
/// `NSBitmapImageFileType` — `NSBitmapImageFileTypePNG` = 4.
const NS_BITMAP_IMAGE_FILE_TYPE_PNG: usize = 4;

// ─── Weight mapping ─────────────────────────────────────────────────────────

/// Map a weight name to the corresponding `NSFontWeight` constant value.
fn parse_weight(weight: Option<&str>) -> Result<f64, String> {
    match weight {
        None | Some("regular") => Ok(0.0),
        Some("ultralight") => Ok(-0.8),
        Some("thin") => Ok(-0.6),
        Some("light") => Ok(-0.4),
        Some("medium") => Ok(0.23),
        Some("semibold") => Ok(0.3),
        Some("bold") => Ok(0.4),
        Some("heavy") => Ok(0.56),
        Some("black") => Ok(0.62),
        Some(other) => Err(format!("Unknown SF Symbol weight: {other}")),
    }
}

// ─── Public render function ─────────────────────────────────────────────────

/// Rendered SF Symbol result: PNG bytes plus logical dimensions.
pub(crate) struct RenderedSymbol {
    pub png: Vec<u8>,
    /// Logical width in points (before 2× Retina scaling).
    pub width: f64,
    /// Logical height in points (before 2× Retina scaling).
    pub height: f64,
}

/// Render an SF Symbol to PNG bytes at 2× (Retina) resolution.
///
/// Returns the PNG data along with the symbol's natural logical dimensions,
/// which the frontend needs to preserve the correct aspect ratio.
pub(crate) fn render(
    name: &str,
    point_size: f64,
    weight: Option<&str>,
) -> Result<RenderedSymbol, String> {
    let ns_font_weight = parse_weight(weight)?;
    let configured_image = lookup_and_configure(name, point_size, ns_font_weight)?;

    let size: CGSize = unsafe { msg_send![configured_image, size] };
    if size.width <= 0.0 || size.height <= 0.0 {
        return Err(format!(
            "SF Symbol has zero size: {w}×{h}",
            w = size.width,
            h = size.height
        ));
    }

    let bitmap = rasterize(configured_image, size)?;
    let png = extract_png(bitmap, name, size)?;
    Ok(RenderedSymbol {
        png,
        width: size.width,
        height: size.height,
    })
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/// Look up the SF Symbol and apply a symbol configuration (weight + scale).
fn lookup_and_configure(
    name: &str,
    point_size: f64,
    ns_font_weight: f64,
) -> Result<*mut AnyObject, String> {
    let ns_name = NSString::from_str(name);
    let image: *mut AnyObject = unsafe {
        msg_send![
            AnyClass::get(c"NSImage").ok_or("NSImage class not found")?,
            imageWithSystemSymbolName: &*ns_name,
            accessibilityDescription: std::ptr::null::<AnyObject>()
        ]
    };
    if image.is_null() {
        return Err(format!("SF Symbol not found: {name}"));
    }

    // NSImageSymbolScale: Medium = 2 (tighter bounding than Large)
    let config_class = AnyClass::get(c"NSImageSymbolConfiguration")
        .ok_or("NSImageSymbolConfiguration class not found")?;
    let config: *mut AnyObject = unsafe {
        msg_send![
            config_class,
            configurationWithPointSize: point_size,
            weight: ns_font_weight,
            scale: 2_isize
        ]
    };
    if config.is_null() {
        return Err("Failed to create NSImageSymbolConfiguration".to_owned());
    }

    let configured: *mut AnyObject =
        unsafe { msg_send![image, imageWithSymbolConfiguration: config] };
    if configured.is_null() {
        return Err("imageWithSymbolConfiguration: returned nil".to_owned());
    }

    Ok(configured)
}

/// Allocate a 2× `NSBitmapImageRep`, draw the image into it, and return the bitmap.
#[allow(
    clippy::cast_possible_truncation,
    reason = "pixel dimensions from CGSize are small enough for i64"
)]
fn rasterize(image: *mut AnyObject, size: CGSize) -> Result<*mut AnyObject, String> {
    let pixel_width = (size.width * 2.0) as i64;
    let pixel_height = (size.height * 2.0) as i64;

    let bitmap_class =
        AnyClass::get(c"NSBitmapImageRep").ok_or("NSBitmapImageRep class not found")?;
    let bitmap: *mut AnyObject = unsafe { msg_send![bitmap_class, alloc] };
    let bitmap: *mut AnyObject = unsafe {
        msg_send![
            bitmap,
            initWithBitmapDataPlanes: std::ptr::null::<*mut u8>(),
            pixelsWide: pixel_width,
            pixelsHigh: pixel_height,
            bitsPerSample: 8_isize,
            samplesPerPixel: 4_isize,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: &*NSString::from_str("NSDeviceRGBColorSpace"),
            bitmapFormat: NS_ALPHA_FIRST_BITMAP_FORMAT,
            bytesPerRow: 0_isize,
            bitsPerPixel: 0_isize
        ]
    };
    if bitmap.is_null() {
        return Err("Failed to allocate NSBitmapImageRep".to_owned());
    }

    let _: () = unsafe { msg_send![bitmap, setSize: size] };

    // Draw the symbol into the bitmap context
    let gfx_class =
        AnyClass::get(c"NSGraphicsContext").ok_or("NSGraphicsContext class not found")?;
    let context: *mut AnyObject =
        unsafe { msg_send![gfx_class, graphicsContextWithBitmapImageRep: bitmap] };
    if context.is_null() {
        return Err("Failed to create NSGraphicsContext".to_owned());
    }

    unsafe {
        let _: () = msg_send![gfx_class, saveGraphicsState];
        let _: () = msg_send![gfx_class, setCurrentContext: context];

        let draw_rect = CGRect {
            origin: CGPoint { x: 0.0, y: 0.0 },
            size,
        };
        let zero_rect = CGRect {
            origin: CGPoint { x: 0.0, y: 0.0 },
            size: CGSize {
                width: 0.0,
                height: 0.0,
            },
        };
        // NSCompositingOperationSourceOver = 2
        let _: () = msg_send![
            image,
            drawInRect: draw_rect,
            fromRect: zero_rect,
            operation: 2_isize,
            fraction: 1.0_f64
        ];

        let _: () = msg_send![gfx_class, restoreGraphicsState];
    }

    Ok(bitmap)
}

/// Extract PNG bytes from a rendered `NSBitmapImageRep`.
#[allow(
    clippy::cast_possible_truncation,
    reason = "pixel dimensions logged for debugging"
)]
fn extract_png(bitmap: *mut AnyObject, name: &str, size: CGSize) -> Result<Vec<u8>, String> {
    let png_data: *mut AnyObject = unsafe {
        msg_send![
            bitmap,
            representationUsingType: NS_BITMAP_IMAGE_FILE_TYPE_PNG,
            properties: std::ptr::null::<AnyObject>()
        ]
    };
    if png_data.is_null() {
        return Err("Failed to generate PNG data".to_owned());
    }

    let length: usize = unsafe { msg_send![png_data, length] };
    let bytes_ptr: *const u8 = unsafe { msg_send![png_data, bytes] };
    if bytes_ptr.is_null() || length == 0 {
        return Err("PNG data is empty".to_owned());
    }

    let png_bytes = unsafe { std::slice::from_raw_parts(bytes_ptr, length) }.to_vec();

    log::debug!(
        "SF Symbol '{name}' rendered: {w}×{h}pt → {pw}×{ph}px ({len} bytes PNG)",
        w = size.width,
        h = size.height,
        pw = (size.width * 2.0) as i64,
        ph = (size.height * 2.0) as i64,
        len = png_bytes.len()
    );

    Ok(png_bytes)
}
