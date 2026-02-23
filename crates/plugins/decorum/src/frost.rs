//! Native frosted glass layer using `NSVisualEffectView`.
//!
//! Replaces CSS `backdrop-filter: blur()` which causes white glow artifacts
//! at macOS window rounded corners. The `NSVisualEffectView` blurs at the
//! compositor level (`WindowServer`) — no CSS edge-sampling issues.
//!
//! The frost view covers the full window content view. In liquid-glass mode
//! (sidebar CSS: `background: transparent`), the frosted desktop shows
//! through. In solid mode (opaque CSS backgrounds), the frost is naturally
//! hidden behind the opaque webview content.
//!
//! View hierarchy (back to front):
//! - `NSGlassEffectView` (optional — from `tauri-plugin-liquid-glass`)
//! - `NSVisualEffectView` ← this module (frosted blur)
//! - `WKWebView` (Tauri webview)

use std::sync::atomic::{AtomicBool, AtomicPtr, Ordering};

use objc2::msg_send;
use objc2::runtime::{AnyClass, AnyObject};
use objc2_foundation::NSRect;

/// Guard against duplicate installation.
static INSTALLED: AtomicBool = AtomicBool::new(false);

/// Stored pointer to the frost view for runtime alpha control.
///
/// Set once during [`install_frost`], read by [`set_frost_alpha`].
/// Using `AtomicPtr` avoids any extra `msg_send!` calls during installation
/// (no `setTag:`/`viewWithTag:` needed).
static FROST_VIEW: AtomicPtr<AnyObject> = AtomicPtr::new(std::ptr::null_mut());

// =========================================================================
// NSVisualEffectView constants
// =========================================================================

/// `NSVisualEffectMaterial.sidebar` (7) — standard sidebar material.
///
/// Provides a frosted blur that matches the native macOS sidebar appearance.
/// Used for both light and dark modes.
const MATERIAL_SIDEBAR: i64 = 7;

/// `NSVisualEffectBlendingMode.behindWindow` (0) — blur desktop behind window.
const BLENDING_BEHIND_WINDOW: i64 = 0;

/// `NSVisualEffectState.active` (1) — always vibrant, even when defocused.
const STATE_ACTIVE: i64 = 1;

/// `NSViewWidthSizable | NSViewHeightSizable` — auto-resize with superview.
const AUTORESIZE_WIDTH_HEIGHT: usize = (1 << 1) | (1 << 4);

/// `NSWindowOrderingMode.below` (-1) — insert below all existing subviews.
const NS_WINDOW_BELOW: i64 = -1;

// =========================================================================
// Public API
// =========================================================================

/// Install a native frosted blur on all application windows.
///
/// Creates an `NSVisualEffectView` with `.sidebar` material and
/// `.behindWindow` blending, then inserts it at the bottom of each
/// window's content view hierarchy.
///
/// Skips `NSPanel` subclasses (system dialogs have their own vibrancy).
///
/// Idempotent — subsequent calls are no-ops.
///
/// # Safety
///
/// Must be called on the main thread.
pub(crate) unsafe fn install_frost() {
    if INSTALLED.swap(true, Ordering::SeqCst) {
        return;
    }

    let Some(ve_class) = AnyClass::get(c"NSVisualEffectView") else {
        log::warn!("Frost: NSVisualEffectView class not found");
        return;
    };
    let Some(ns_app_class) = AnyClass::get(c"NSApplication") else {
        return;
    };

    let app: *mut AnyObject = msg_send![ns_app_class, sharedApplication];
    if app.is_null() {
        return;
    }

    let windows: *mut AnyObject = msg_send![app, windows];
    if windows.is_null() {
        return;
    }

    let count: usize = msg_send![windows, count];
    for i in 0..count {
        let window: *mut AnyObject = msg_send![windows, objectAtIndex: i];
        install_frost_on_window(window, ve_class);
    }
}

// =========================================================================
// Per-window installation
// =========================================================================

/// Add the frost view to a single window's content view.
///
/// # Safety
///
/// Must be called on the main thread with valid pointers.
unsafe fn install_frost_on_window(window: *mut AnyObject, ve_class: &AnyClass) {
    if window.is_null() {
        return;
    }

    // Skip NSPanel subclasses — system dialogs manage their own vibrancy.
    if let Some(panel_class) = AnyClass::get(c"NSPanel") {
        let is_panel: bool = msg_send![window, isKindOfClass: panel_class];
        if is_panel {
            return;
        }
    }

    let content_view: *mut AnyObject = msg_send![window, contentView];
    if content_view.is_null() {
        return;
    }

    // Create NSVisualEffectView sized to the content view's bounds.
    let bounds: NSRect = msg_send![content_view, bounds];
    let frost: *mut AnyObject = msg_send![ve_class, alloc];
    let frost: *mut AnyObject = msg_send![frost, initWithFrame: bounds];
    if frost.is_null() {
        log::warn!("Frost: failed to allocate NSVisualEffectView");
        return;
    }

    // ── Configure the visual effect ──────────────────────────────────
    //
    // Material: .sidebar (7) — standard sidebar frosted material.
    //   Matches the native macOS sidebar appearance for both themes.
    //
    // Blending: .behindWindow (0) — blurs the desktop behind the window
    //   at the `WindowServer` compositor level.
    //
    // State: .active (1) — remains vibrant even when the window loses
    //   focus. The glass_defocus module handles defocus by setting an
    //   opaque window background, which naturally covers the frost.
    let _: () = msg_send![frost, setMaterial: MATERIAL_SIDEBAR];
    let _: () = msg_send![frost, setBlendingMode: BLENDING_BEHIND_WINDOW];
    let _: () = msg_send![frost, setState: STATE_ACTIVE];

    // Auto-resize so the frost always fills the window.
    let _: () = msg_send![frost, setAutoresizingMask: AUTORESIZE_WIDTH_HEIGHT];

    // Insert at the bottom of the content view. The liquid-glass plugin's
    // NSGlassEffectView (activated later by the frontend) will go even
    // lower. The Tauri WKWebView sits above both.
    let _: () = msg_send![
        content_view,
        addSubview: frost,
        positioned: NS_WINDOW_BELOW,
        relativeTo: std::ptr::null::<AnyObject>()
    ];

    // Store the pointer for runtime alpha control (only first window).
    FROST_VIEW.store(frost, Ordering::Release);

    log::info!("Frost: installed NSVisualEffectView (sidebar material, behindWindow blend)");
}

// =========================================================================
// Runtime alpha control
// =========================================================================

/// Set the alpha (opacity) of the frost view.
///
/// `alpha` is clamped to `0.0..=1.0`. Lower values let more of the
/// desktop show through the frost. Called from the frontend after
/// the app is fully initialized — never during `did_finish_launching`.
///
/// # Safety
///
/// Must be called on the main thread.
pub(crate) unsafe fn set_frost_alpha(alpha: f64) {
    let frost = FROST_VIEW.load(Ordering::Acquire);
    if frost.is_null() {
        return;
    }
    let clamped = alpha.clamp(0.0, 1.0);
    let _: () = msg_send![frost, setAlphaValue: clamped];
    log::debug!("Frost: alpha set to {clamped:.2}");
}
