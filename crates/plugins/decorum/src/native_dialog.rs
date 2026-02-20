//! Raw `NSOpenPanel` folder picker using objc2.
//!
//! Bypasses `tauri-plugin-dialog` entirely to avoid macOS 26+ crashes
//! when `NSGlassEffectView` is active in the parent window.

use objc2::msg_send;
use objc2::runtime::{AnyClass, AnyObject};
use objc2_foundation::NSString;

/// Show a native `NSOpenPanel` configured for folder selection.
///
/// Uses `runModal` which creates a nested event loop — the main thread's
/// run loop continues to process events (mouse, keyboard) during the dialog.
///
/// Returns the selected folder path, or `None` if the user cancelled.
///
/// # Safety
///
/// Must be called on the main thread.
pub(crate) unsafe fn pick_folder() -> Option<String> {
    let panel_class = AnyClass::get(c"NSOpenPanel")?;
    let panel: *mut AnyObject = msg_send![panel_class, openPanel];
    if panel.is_null() {
        return None;
    }

    let _: () = msg_send![panel, setCanChooseFiles: false];
    let _: () = msg_send![panel, setCanChooseDirectories: true];
    let _: () = msg_send![panel, setAllowsMultipleSelection: false];

    let title = NSString::from_str("Open Project");
    let _: () = msg_send![panel, setTitle: &*title];

    let prompt = NSString::from_str("Open");
    let _: () = msg_send![panel, setPrompt: &*prompt];

    // runModal blocks until user picks or cancels (nested event loop).
    // NSModalResponseOK = 1, NSModalResponseCancel = 0
    let result: isize = msg_send![panel, runModal];
    if result != 1 {
        return None;
    }

    let url: *mut AnyObject = msg_send![panel, URL];
    if url.is_null() {
        return None;
    }

    let path: *mut AnyObject = msg_send![url, path];
    if path.is_null() {
        return None;
    }

    // Safety: path is an NSString* from [NSURL path]
    let ns_string = &*(path.cast::<NSString>());
    Some(ns_string.to_string())
}
