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
//! - Tint overlay `NSView` ← screen-blend white (lightens frost in light mode)
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

/// Stored pointer to the tint overlay view for lightening the frost.
///
/// An `NSView` with a `CIScreenBlendMode` compositing filter, inserted
/// between the frost and the webview. Screen blending lightens the frost
/// per-pixel, preserving blur texture — unlike alpha blending which
/// paints flat white over the blur pattern.
static TINT_VIEW: AtomicPtr<AnyObject> = AtomicPtr::new(std::ptr::null_mut());

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
/// Also creates a tint overlay `NSView` with `CIScreenBlendMode`
/// compositing filter, inserted between the frost and the webview.
/// This allows lightening the frost in light mode without covering
/// the blur pattern (screen blend preserves texture contrast).
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

    // ── Create tint overlay ──────────────────────────────────────────
    //
    // A plain NSView with a CIScreenBlendMode compositing filter.
    // Screen blend: result = 1 - (1 - base) * (1 - blend)
    // This lightens the frost per-pixel, preserving blur texture contrast.
    // Unlike alpha blending (flat white paint), screen blend enhances
    // highlights proportionally — darker frost areas get MORE lightening,
    // lighter areas get less. The blur pattern stays visible.
    //
    // Inserted ABOVE the frost but BELOW the webview.
    install_tint_overlay(content_view, frost, bounds);

    log::info!("Frost: installed NSVisualEffectView (sidebar material, behindWindow blend)");
}

/// Create and install the screen-blend tint overlay view.
///
/// # Safety
///
/// Must be called on the main thread with valid pointers.
unsafe fn install_tint_overlay(
    content_view: *mut AnyObject,
    frost: *mut AnyObject,
    bounds: NSRect,
) {
    let Some(ns_view_class) = AnyClass::get(c"NSView") else {
        return;
    };
    let Some(ci_filter_class) = AnyClass::get(c"CIFilter") else {
        log::warn!("Frost: CIFilter class not found — skipping tint overlay");
        return;
    };

    let tint: *mut AnyObject = msg_send![ns_view_class, alloc];
    let tint: *mut AnyObject = msg_send![tint, initWithFrame: bounds];
    if tint.is_null() {
        return;
    }

    let _: () = msg_send![tint, setAutoresizingMask: AUTORESIZE_WIDTH_HEIGHT];
    let _: () = msg_send![tint, setWantsLayer: true];

    let layer: *mut AnyObject = msg_send![tint, layer];
    if !layer.is_null() {
        // Set white background on the layer.
        let Some(ns_color_class) = AnyClass::get(c"NSColor") else {
            log::warn!("Frost: NSColor class not found — skipping tint layer setup");
            return;
        };
        let white: *mut AnyObject = msg_send![ns_color_class, whiteColor];
        let cg_color: *mut AnyObject = msg_send![white, CGColor];
        let _: () = msg_send![layer, setBackgroundColor: cg_color];

        // Apply CIScreenBlendMode compositing filter.
        let filter_name = objc2_foundation::ns_string!("CIScreenBlendMode");
        let filter: *mut AnyObject = msg_send![ci_filter_class, filterWithName: filter_name];
        if filter.is_null() {
            log::warn!(
                "Frost: CIScreenBlendMode not available — tint overlay will use normal blend"
            );
        } else {
            let _: () = msg_send![layer, setCompositingFilter: filter];
            log::debug!("Frost: tint overlay using CIScreenBlendMode");
        }

        // Start hidden — frontend enables via set_tint_opacity().
        let _: () = msg_send![layer, setOpacity: 0.0_f32];
    }

    // Insert above the frost view but below the webview.
    let ns_window_above: i64 = 1; // NSWindowOrderingMode.above
    let _: () = msg_send![
        content_view,
        addSubview: tint,
        positioned: ns_window_above,
        relativeTo: frost
    ];

    TINT_VIEW.store(tint, Ordering::Release);
    log::info!("Frost: tint overlay installed (screen blend, initially hidden)");
}

// =========================================================================
// Runtime control
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

/// Set the opacity of the screen-blend tint overlay.
///
/// `opacity` is clamped to `0.0..=1.0`. Higher values lighten the frost
/// more aggressively while preserving blur texture (screen blend math).
/// At 0.0 the overlay is invisible; at 1.0 it's full white screen blend.
///
/// Typical values: 0.3–0.6 for light mode, 0.0 for dark mode.
///
/// # Safety
///
/// Must be called on the main thread.
pub(crate) unsafe fn set_tint_opacity(opacity: f64) {
    let tint = TINT_VIEW.load(Ordering::Acquire);
    if tint.is_null() {
        return;
    }
    #[allow(
        clippy::cast_possible_truncation,
        reason = "opacity is clamped to 0.0..=1.0, safe for f32"
    )]
    let clamped = opacity.clamp(0.0, 1.0) as f32;
    let layer: *mut AnyObject = msg_send![tint, layer];
    if !layer.is_null() {
        let _: () = msg_send![layer, setOpacity: clamped];
    }
    log::debug!("Frost: tint opacity set to {clamped:.2}");
}

/// Change the `NSVisualEffectMaterial` of the frost view at runtime.
///
/// Different materials produce different tint/lightness levels while
/// preserving the `.behindWindow` blur. Common values:
///
/// | Value | Material               | Light mode appearance |
/// |-------|------------------------|-----------------------|
/// |   3   | `.titlebar`            | Very light            |
/// |   5   | `.menu`                | Bright white          |
/// |   6   | `.popover`             | Bright white          |
/// |   7   | `.sidebar`             | Medium-light grey     |
/// |  11   | `.sheet`               | Light                 |
/// |  12   | `.windowBackground`    | Moderate              |
/// |  17   | `.toolTip`             | Light                 |
///
/// # Safety
///
/// Must be called on the main thread.
pub(crate) unsafe fn set_frost_material(material: i64) {
    let frost = FROST_VIEW.load(Ordering::Acquire);
    if frost.is_null() {
        return;
    }
    let _: () = msg_send![frost, setMaterial: material];
    log::debug!("Frost: material set to {material}");
}

/// Configure the frost view for a specific theme.
///
/// Sets the material, appearance (`VibrantLight` or `VibrantDark`), and
/// `isEmphasized` flag. In light mode, `VibrantLight` + `emphasized`
/// forces the brightest possible rendering of the frosted material,
/// reducing the grey tint that comes from blurring darker desktop wallpapers.
///
/// # Safety
///
/// Must be called on the main thread.
pub(crate) unsafe fn configure_frost_for_theme(is_dark: bool) {
    let frost = FROST_VIEW.load(Ordering::Acquire);
    if frost.is_null() {
        return;
    }

    let Some(ns_appearance_class) = AnyClass::get(c"NSAppearance") else {
        log::warn!("Frost: NSAppearance class not found");
        return;
    };

    if is_dark {
        // Dark mode: standard sidebar material, VibrantDark appearance.
        let _: () = msg_send![frost, setMaterial: MATERIAL_SIDEBAR];
        let _: () = msg_send![frost, setEmphasized: false];

        let name = objc2_foundation::ns_string!("NSAppearanceNameVibrantDark");
        let appearance: *mut AnyObject = msg_send![ns_appearance_class, appearanceNamed: name];
        if !appearance.is_null() {
            let _: () = msg_send![frost, setAppearance: appearance];
        }
    } else {
        // Light mode: menu material (brightest) + VibrantLight appearance +
        // emphasized — three levers to push the frost as white as possible
        // while preserving blur diffusion.
        let _: () = msg_send![frost, setMaterial: 5_i64]; // .menu
        let _: () = msg_send![frost, setEmphasized: true];

        let name = objc2_foundation::ns_string!("NSAppearanceNameVibrantLight");
        let appearance: *mut AnyObject = msg_send![ns_appearance_class, appearanceNamed: name];
        if !appearance.is_null() {
            let _: () = msg_send![frost, setAppearance: appearance];
        }
    }

    log::debug!(
        "Frost: configured for {} mode",
        if is_dark { "dark" } else { "light" }
    );
}
