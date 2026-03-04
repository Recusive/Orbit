//! Native `WKWebView` screenshot capture via
//! `takeSnapshotWithConfiguration:completionHandler:`.
//!
//! The caller provides the exact `NSWindow *` pointer for the browser window.
//! We walk that window's view hierarchy, find the target `WKWebView`, capture
//! pixels, and return JPEG bytes through an `std::sync::mpsc::SyncSender`.

use std::ffi::{c_char, c_void, CStr};
use std::sync::mpsc::SyncSender;

use objc2::msg_send;
use objc2::runtime::{AnyClass, AnyObject};
use objc2_foundation::NSString;

/// JPEG compression quality (0.0-1.0).
const JPEG_QUALITY: f64 = 0.7;

/// Maximum JPEG output size in bytes (~2MB).
const MAX_JPEG_BYTES: usize = 2 * 1024 * 1024;

/// Find the `WKWebView` inside a specific `NSWindow`'s view hierarchy.
fn find_wk_web_view_in_window(ns_window: *mut c_void) -> Option<*mut AnyObject> {
    if ns_window.is_null() {
        return None;
    }

    let wk_class = AnyClass::get(c"WKWebView")?;
    let window = ns_window.cast::<AnyObject>();

    let content_view: *mut AnyObject = unsafe { msg_send![window, contentView] };
    if content_view.is_null() {
        return None;
    }

    find_wk_recursive(content_view, wk_class)
}

/// Recursively search a view hierarchy for a `WKWebView`.
fn find_wk_recursive(view: *mut AnyObject, wk_class: &AnyClass) -> Option<*mut AnyObject> {
    let is_kind: bool = unsafe { msg_send![view, isKindOfClass: wk_class] };
    if is_kind {
        return Some(view);
    }

    let subviews: *mut AnyObject = unsafe { msg_send![view, subviews] };
    if subviews.is_null() {
        return None;
    }

    let count: usize = unsafe { msg_send![subviews, count] };
    for i in 0..count {
        let subview: *mut AnyObject = unsafe { msg_send![subviews, objectAtIndex: i] };
        if let Some(found) = find_wk_recursive(subview, wk_class) {
            return Some(found);
        }
    }

    None
}

/// Convert an `NSImage` to JPEG bytes.
fn nsimage_to_jpeg(image: *mut AnyObject) -> Result<Vec<u8>, String> {
    if image.is_null() {
        return Err("NSImage was null".to_owned());
    }

    // NSImage -> TIFF intermediate
    let tiff_data: *mut AnyObject = unsafe { msg_send![image, TIFFRepresentation] };
    if tiff_data.is_null() {
        return Err("NSImage TIFFRepresentation returned nil".to_owned());
    }

    // TIFF -> NSBitmapImageRep
    let bitmap_class = AnyClass::get(c"NSBitmapImageRep")
        .ok_or_else(|| "NSBitmapImageRep class not found".to_owned())?;
    let bitmap_rep: *mut AnyObject =
        unsafe { msg_send![bitmap_class, imageRepWithData: tiff_data] };
    if bitmap_rep.is_null() {
        return Err("Failed to create NSBitmapImageRep from TIFF data".to_owned());
    }

    // NSJPEGFileType = 3
    let jpeg_type: usize = 3;

    let ns_number_class =
        AnyClass::get(c"NSNumber").ok_or_else(|| "NSNumber class not found".to_owned())?;
    let compression_value: *mut AnyObject =
        unsafe { msg_send![ns_number_class, numberWithDouble: JPEG_QUALITY] };

    let ns_dict_class =
        AnyClass::get(c"NSDictionary").ok_or_else(|| "NSDictionary class not found".to_owned())?;
    let compression_key = NSString::from_str("NSImageCompressionFactor");
    let props: *mut AnyObject = unsafe {
        msg_send![ns_dict_class, dictionaryWithObject: compression_value, forKey: &*compression_key]
    };

    let jpeg_data: *mut AnyObject =
        unsafe { msg_send![bitmap_rep, representationUsingType: jpeg_type, properties: props] };
    if jpeg_data.is_null() {
        return Err("JPEG representation returned nil".to_owned());
    }

    // NSData -> Vec<u8>
    let length: usize = unsafe { msg_send![jpeg_data, length] };
    let bytes_ptr: *const u8 = unsafe { msg_send![jpeg_data, bytes] };
    if bytes_ptr.is_null() || length == 0 {
        return Err("JPEG NSData has null bytes or zero length".to_owned());
    }

    if length > MAX_JPEG_BYTES {
        return Err(format!(
            "JPEG size ({length} bytes) exceeds limit ({MAX_JPEG_BYTES} bytes). \
             Page may have high-resolution or complex visual content."
        ));
    }

    let bytes = unsafe { std::slice::from_raw_parts(bytes_ptr, length) };
    Ok(bytes.to_vec())
}

/// Capture a screenshot for a browser window's `WKWebView`.
///
/// Must be called from the main thread.
pub fn capture_browser_screenshot(ns_window: *mut c_void, tx: SyncSender<Result<Vec<u8>, String>>) {
    let Some(wk_web_view) = find_wk_web_view_in_window(ns_window) else {
        let _ = tx.send(Err("No browser WKWebView found".to_owned()));
        return;
    };

    // `nil` configuration captures the full visible viewport.
    let config: *mut AnyObject = std::ptr::null_mut();

    let block = block2::StackBlock::new(move |image: *mut AnyObject, error: *mut AnyObject| {
        let result = if image.is_null() {
            let error_message = if error.is_null() {
                "takeSnapshot returned nil image".to_owned()
            } else {
                let description: *mut AnyObject = unsafe { msg_send![error, localizedDescription] };
                if description.is_null() {
                    "Unknown screenshot error".to_owned()
                } else {
                    let utf8: *const c_char = unsafe { msg_send![description, UTF8String] };
                    if utf8.is_null() {
                        "Unknown screenshot error".to_owned()
                    } else {
                        unsafe { CStr::from_ptr(utf8) }
                            .to_string_lossy()
                            .into_owned()
                    }
                }
            };
            Err(error_message)
        } else {
            nsimage_to_jpeg(image)
        };

        let _ = tx.send(result);
    });
    let block = block.copy();

    unsafe {
        let _: () = msg_send![
            wk_web_view,
            takeSnapshotWithConfiguration: config,
            completionHandler: &*block
        ];
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn find_wk_web_view_in_window_returns_none_for_null_window() {
        assert!(find_wk_web_view_in_window(std::ptr::null_mut()).is_none());
    }

    #[test]
    fn nsimage_to_jpeg_returns_error_for_null_image() {
        let result = nsimage_to_jpeg(std::ptr::null_mut());
        assert!(matches!(result, Err(message) if message.contains("NSImage was null")));
    }
}
