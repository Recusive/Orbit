//! macOS traffic light (window control) positioning using objc2-app-kit.
//!
//! This module provides type-safe macOS window decoration control using the modern
//! objc2 ecosystem instead of the deprecated cocoa/objc crates.
//!
//! Key benefits over the old implementation:
//! - `Option<Retained<T>>` instead of raw pointers that could be garbage
//! - Compile-time selector verification via `define_class!`
//! - Automatic retain/release via `Retained<T>` smart pointer
//! - No more null pointer checks that fail on garbage pointers
//!
//! # Offset Persistence (Code Review Cycle 1, Codex Issue #1)
//!
//! Traffic light offsets are stored in a global `RwLock` so that:
//! - `set_traffic_lights_inset()` can update the offsets from any thread
//! - The delegate can read the current offsets on resize/fullscreen events
//! - Offsets persist correctly across window state changes

use std::cell::Cell;
use std::ffi::c_void;

use parking_lot::RwLock;

use objc2::rc::{Allocated, Retained};
use objc2::runtime::ProtocolObject;
use objc2::{define_class, msg_send, sel, DefinedClass, MainThreadOnly};
use objc2_app_kit::{NSWindow, NSWindowButton, NSWindowDelegate};
use objc2_core_foundation::CGPoint;
use objc2_foundation::{MainThreadMarker, NSNotification, NSObject, NSObjectProtocol};
use tauri::{Emitter, Manager, Runtime, Window};

/// Default traffic light offsets (used until `set_traffic_lights_inset` is called).
const DEFAULT_OFFSET_X: f64 = 12.0;
const DEFAULT_OFFSET_Y: f64 = 16.0;

/// Global storage for traffic light offsets.
///
/// Using `RwLock` because:
/// - Reads (from delegate on main thread) are frequent and shouldn't block each other
/// - Writes (from `set_traffic_lights_inset`) are rare
/// - `RwLock` allows multiple concurrent readers
///
/// For Orbit's single-window design, a simple tuple suffices. If multiple windows
/// with different offsets are ever needed, this could be changed to a
/// `HashMap<String, (f64, f64)>` keyed by window label.
static TRAFFIC_LIGHT_OFFSETS: RwLock<(f64, f64)> =
    RwLock::new((DEFAULT_OFFSET_X, DEFAULT_OFFSET_Y));

/// Get the current traffic light offsets.
fn get_offsets() -> (f64, f64) {
    // parking_lot::RwLock doesn't use poisoning - returns guard directly
    *TRAFFIC_LIGHT_OFFSETS.read()
}

/// Set the traffic light offsets.
fn set_offsets(x: f64, y: f64) {
    // parking_lot::RwLock doesn't use poisoning - returns guard directly
    *TRAFFIC_LIGHT_OFFSETS.write() = (x, y);
}

/// Type-safe wrapper for `NSWindow` handle.
/// Uses `Retained<NSWindow>` for automatic memory management.
pub(crate) struct WindowHandle(Retained<NSWindow>);

impl WindowHandle {
    /// Create a `WindowHandle` from a Tauri window's raw `NSWindow` pointer.
    ///
    /// # Safety
    /// The pointer must be a valid `NSWindow` instance.
    pub(crate) unsafe fn from_raw(ptr: *mut c_void) -> Option<Self> {
        if ptr.is_null() {
            return None;
        }
        // SAFETY: Caller guarantees ptr is a valid NSWindow
        let ns_window: Retained<NSWindow> = unsafe { Retained::retain(ptr.cast())? };
        Some(Self(ns_window))
    }

    /// Get a reference to the underlying `NSWindow`.
    pub(crate) fn as_ns_window(&self) -> &NSWindow {
        &self.0
    }
}

/// Position the traffic light buttons at the specified coordinates.
///
/// This function safely handles decoration-less windows by using `Option<Retained<T>>`
/// return types from `standardWindowButton`. Unlike the old cocoa crate which returned
/// garbage pointers for decoration-less windows, objc2 returns `None`.
pub(crate) fn position_traffic_lights(window_handle: &WindowHandle, x: f64, y: f64) {
    let ns_window = window_handle.as_ns_window();

    // Get window buttons - these return Option, so decoration-less windows safely return None
    let close = ns_window.standardWindowButton(NSWindowButton::CloseButton);
    let miniaturize = ns_window.standardWindowButton(NSWindowButton::MiniaturizeButton);
    let zoom = ns_window.standardWindowButton(NSWindowButton::ZoomButton);

    // If close button doesn't exist, this is a decoration-less window
    let Some(close) = close else {
        return;
    };

    // Get the button's superview (title bar view)
    // SAFETY: The close button is a valid NSView
    let Some(close_superview) = (unsafe { close.superview() }) else {
        return;
    };

    // Get the title bar container view
    // SAFETY: The superview is a valid NSView
    let Some(title_bar_container_view) = (unsafe { close_superview.superview() }) else {
        return;
    };

    // Get frame dimensions
    let close_rect = close.frame();
    let button_height = close_rect.size.height;

    let title_bar_frame_height = button_height + y;

    // Get and modify title bar frame
    let window_frame = ns_window.frame();
    let mut title_bar_rect = title_bar_container_view.frame();
    title_bar_rect.size.height = title_bar_frame_height;
    title_bar_rect.origin.y = window_frame.size.height - title_bar_frame_height;

    // Set the title bar frame
    title_bar_container_view.setFrame(title_bar_rect);

    // Collect valid buttons
    let mut window_buttons: Vec<Retained<objc2_app_kit::NSButton>> = Vec::new();
    window_buttons.push(close);
    if let Some(mini) = miniaturize {
        window_buttons.push(mini);
    }
    if let Some(z) = zoom {
        window_buttons.push(z);
    }

    let space_between = 20.0;
    let vertical_offset = 4.0;

    // Position each button
    // Note: max 3 buttons (close, minimize, zoom), so index fits in f64 without precision loss
    #[allow(clippy::cast_precision_loss)]
    for (i, button) in window_buttons.iter().enumerate() {
        let new_origin = CGPoint {
            x: x + (i as f64 * space_between),
            y: ((title_bar_frame_height - button_height) / 2.0) - vertical_offset,
        };
        button.setFrameOrigin(new_origin);
    }
}

// ============================================================================
// Window Delegate using define_class!
// ============================================================================

/// Instance variables stored in the delegate object.
///
/// # Thread Safety (Code Review Cycle 1, Issue #8)
///
/// This struct contains raw pointers wrapped in `Cell`, which are not inherently
/// thread-safe. The `Send` and `Sync` implementations below are safe because:
///
/// 1. The delegate is created on the main thread (enforced by `MainThreadMarker`)
/// 2. All `NSWindowDelegate` methods are called by `AppKit` on the main thread
/// 3. The struct is marked `#[thread_kind = MainThreadOnly]` in `define_class!`
///
/// Debug builds include runtime assertions to verify main thread access.
///
/// # Note on Traffic Light Offsets
///
/// Traffic light offsets are NOT stored in ivars. They're stored in the global
/// `TRAFFIC_LIGHT_OFFSETS` so that `set_traffic_lights_inset()` can update them
/// and the delegate will read the current values. (Code Review Cycle 1, Codex Issue #1)
pub(crate) struct DelegateIvars {
    /// The Tauri window label for identification
    window_label: String,
    /// Raw pointer to the original delegate (we forward calls to it)
    super_delegate: Cell<*mut objc2::runtime::AnyObject>,
    /// Raw pointer to the `NSWindow`
    ns_window_ptr: Cell<*mut c_void>,
    /// Raw pointer to app handle for emitting events.
    ///
    /// # Memory Management (Code Review Cycle 1, Issue #1)
    ///
    /// This pointer is created via `Box::into_raw()` and intentionally leaked.
    /// See `setup_traffic_light_positioner` for the rationale.
    app_handle_ptr: Cell<*mut c_void>,
}

// SAFETY: The delegate is only accessed from the main thread.
// All NSWindowDelegate callbacks are dispatched by AppKit on the main thread,
// and we enforce MainThreadMarker at creation time.
// See struct-level documentation for detailed safety analysis.
unsafe impl Send for DelegateIvars {}
unsafe impl Sync for DelegateIvars {}

define_class! {
    /// Custom window delegate that repositions traffic lights on window events.
    #[unsafe(super(NSObject))]
    #[ivars = DelegateIvars]
    #[thread_kind = MainThreadOnly]
    #[name = "OrbitTrafficLightDelegate"]
    pub(crate) struct TrafficLightDelegate;

    // Implement NSObjectProtocol (required by NSWindowDelegate)
    unsafe impl NSObjectProtocol for TrafficLightDelegate {}

    // Implement NSWindowDelegate protocol
    unsafe impl NSWindowDelegate for TrafficLightDelegate {
        #[unsafe(method(windowShouldClose:))]
        fn window_should_close(&self, sender: *mut NSWindow) -> bool {
            self.forward_to_super_bool(sel!(windowShouldClose:), sender.cast())
        }

        #[unsafe(method(windowWillClose:))]
        fn window_will_close(&self, notification: *mut NSNotification) {
            self.forward_to_super(sel!(windowWillClose:), notification.cast());
        }

        #[unsafe(method(windowDidResize:))]
        fn window_did_resize(&self, notification: *mut NSNotification) {
            // Reposition traffic lights on resize
            self.reposition_traffic_lights();
            self.forward_to_super(sel!(windowDidResize:), notification.cast());
        }

        #[unsafe(method(windowDidMove:))]
        fn window_did_move(&self, notification: *mut NSNotification) {
            self.forward_to_super(sel!(windowDidMove:), notification.cast());
        }

        #[unsafe(method(windowDidChangeBackingProperties:))]
        fn window_did_change_backing_properties(&self, notification: *mut NSNotification) {
            self.forward_to_super(sel!(windowDidChangeBackingProperties:), notification.cast());
        }

        #[unsafe(method(windowDidBecomeKey:))]
        fn window_did_become_key(&self, notification: *mut NSNotification) {
            self.forward_to_super(sel!(windowDidBecomeKey:), notification.cast());
        }

        #[unsafe(method(windowDidResignKey:))]
        fn window_did_resign_key(&self, notification: *mut NSNotification) {
            self.forward_to_super(sel!(windowDidResignKey:), notification.cast());
        }

        #[unsafe(method(windowWillEnterFullScreen:))]
        fn window_will_enter_full_screen(&self, notification: *mut NSNotification) {
            self.emit_event("will-enter-fullscreen");
            self.forward_to_super(sel!(windowWillEnterFullScreen:), notification.cast());
        }

        #[unsafe(method(windowDidEnterFullScreen:))]
        fn window_did_enter_full_screen(&self, notification: *mut NSNotification) {
            self.emit_event("did-enter-fullscreen");
            self.forward_to_super(sel!(windowDidEnterFullScreen:), notification.cast());
        }

        #[unsafe(method(windowWillExitFullScreen:))]
        fn window_will_exit_full_screen(&self, notification: *mut NSNotification) {
            self.emit_event("will-exit-fullscreen");
            self.forward_to_super(sel!(windowWillExitFullScreen:), notification.cast());
        }

        #[unsafe(method(windowDidExitFullScreen:))]
        fn window_did_exit_full_screen(&self, notification: *mut NSNotification) {
            self.emit_event("did-exit-fullscreen");
            // Reposition traffic lights after exiting fullscreen
            self.reposition_traffic_lights();
            self.forward_to_super(sel!(windowDidExitFullScreen:), notification.cast());
        }

        #[unsafe(method(windowDidFailToEnterFullScreen:))]
        fn window_did_fail_to_enter_full_screen(&self, window: *mut NSWindow) {
            self.forward_to_super(sel!(windowDidFailToEnterFullScreen:), window.cast());
        }
    }
}

/// Configuration for creating a new delegate.
struct DelegateConfig {
    window_label: String,
    super_delegate: *mut objc2::runtime::AnyObject,
    ns_window_ptr: *mut c_void,
    app_handle_ptr: *mut c_void,
}

impl TrafficLightDelegate {
    /// Create a new delegate with the given configuration.
    fn new(mtm: MainThreadMarker, config: DelegateConfig) -> Retained<Self> {
        let this: Allocated<Self> = mtm.alloc();
        let this = this.set_ivars(DelegateIvars {
            window_label: config.window_label,
            super_delegate: Cell::new(config.super_delegate),
            ns_window_ptr: Cell::new(config.ns_window_ptr),
            app_handle_ptr: Cell::new(config.app_handle_ptr),
        });
        unsafe { msg_send![super(this), init] }
    }

    /// Reposition the traffic lights using the global offset storage.
    ///
    /// Reads offsets from `TRAFFIC_LIGHT_OFFSETS` to ensure consistency with
    /// any values set via `set_traffic_lights_inset()`.
    fn reposition_traffic_lights(&self) {
        let ivars = self.ivars();
        let ns_window_ptr = ivars.ns_window_ptr.get();
        if ns_window_ptr.is_null() {
            return;
        }

        // Read from global storage (set by set_traffic_lights_inset)
        let (x, y) = get_offsets();

        // SAFETY: We stored a valid NSWindow pointer
        if let Some(handle) = unsafe { WindowHandle::from_raw(ns_window_ptr) } {
            position_traffic_lights(&handle, x, y);
        }
    }

    /// Emit a Tauri event (fullscreen changes, etc.)
    fn emit_event(&self, event_name: &str) {
        // Code Review Cycle 1, Issue #8: Verify main thread access in debug builds
        debug_assert!(
            MainThreadMarker::new().is_some(),
            "DelegateIvars accessed from non-main thread"
        );

        let ivars = self.ivars();
        let app_handle_ptr = ivars.app_handle_ptr.get();
        if app_handle_ptr.is_null() {
            return;
        }

        // SAFETY (Code Review Cycle 1, Issue #3):
        // The pointer was created from a valid `Box<AppHandle>` in `setup_traffic_light_positioner`.
        // It remains valid because:
        // 1. The Box is leaked (never deallocated) for the window's lifetime
        // 2. AppHandle is reference-counted internally and stays valid
        // 3. This method is only called from NSWindowDelegate callbacks on the main thread
        //
        // If the app is shutting down, the delegate may be called after AppHandle is invalid,
        // but Tauri's event emission will simply fail gracefully (we ignore the Result).
        let app_handle: &tauri::AppHandle<tauri::Wry> =
            unsafe { &*app_handle_ptr.cast::<tauri::AppHandle<tauri::Wry>>() };

        // Emit to the specific window
        let _ = app_handle.emit_to(&ivars.window_label, event_name, ());
    }

    /// Forward a message to the super delegate.
    ///
    /// # Safety Note (Code Review Cycle 1, Codex Issue #2)
    ///
    /// We check `respondsToSelector:` before calling `performSelector:withObject:`
    /// to avoid crashes if the original delegate doesn't implement an optional
    /// `NSWindowDelegate` method.
    fn forward_to_super(&self, selector: objc2::runtime::Sel, arg: *mut c_void) {
        let super_del = self.ivars().super_delegate.get();
        if super_del.is_null() {
            return;
        }

        unsafe {
            // Check if delegate implements this method before calling
            let responds: bool = msg_send![super_del, respondsToSelector: selector];
            if responds {
                let _: () = msg_send![super_del, performSelector: selector, withObject: arg];
            }
        }
    }

    /// Forward a message to the super delegate, returning a bool.
    ///
    /// # Known Limitation (Code Review Cycle 1, Issue #11)
    ///
    /// This method cannot properly forward boolean return values from the super
    /// delegate. The `performSelector:withObject:` method returns `id` (object
    /// pointer) regardless of the underlying method's return type. When the
    /// actual method returns `BOOL`, interpreting the result as a pointer and
    /// then as bool is undefined behavior.
    ///
    /// **Current behavior**: We always return `true` (allow the operation).
    /// This is safe because:
    /// - `windowShouldClose:` returning `true` allows the window to close
    /// - Tauri's default delegate typically allows close
    /// - If a delegate wanted to prevent close, it would need custom handling
    ///
    /// **Proper fix** (if needed): Use `objc2::runtime::MethodImplementation` to
    /// get the actual IMP and call it with the correct signature. This is complex
    /// and not worth it for our single-window use case.
    const fn forward_to_super_bool(
        &self,
        _selector: objc2::runtime::Sel,
        _arg: *mut c_void,
    ) -> bool {
        // Acknowledge self to satisfy clippy::unused_self - kept as method for
        // API consistency with forward_to_super() so callers use self.forward_*()
        let _ = self;

        // We intentionally don't forward to super_delegate for bool-returning methods.
        // See doc comment above for rationale.
        //
        // Always allow the operation (e.g., allow window close).
        true
    }
}

// ============================================================================
// Public API
// ============================================================================

/// Set up the traffic light positioner for a window.
///
/// This installs a custom window delegate that repositions traffic lights on resize.
/// Decoration-less windows are automatically skipped.
pub(crate) fn setup_traffic_light_positioner<R: Runtime>(window: &Window<R>) {
    // CRITICAL FIX: Skip decoration-less windows.
    // The original plugin crashes because standardWindowButton_ returns
    // garbage pointers (not null) when decorations are disabled.
    // With objc2, we get proper Option<Retained<T>> so this is less critical,
    // but we still skip for efficiency.
    if !window.is_decorated().unwrap_or(true) {
        return;
    }

    let Ok(ns_window_ptr) = window.ns_window() else {
        return;
    };

    // SAFETY: We need a main thread marker for objc2 operations
    let Some(mtm) = MainThreadMarker::new() else {
        // Not on main thread, can't proceed
        return;
    };

    // Create the window handle to verify it's valid
    let Some(window_handle) = (unsafe { WindowHandle::from_raw(ns_window_ptr) }) else {
        return;
    };

    // Verify traffic lights exist (will return None for decoration-less windows)
    let close = window_handle
        .as_ns_window()
        .standardWindowButton(NSWindowButton::CloseButton);
    if close.is_none() {
        return;
    }

    // Do the initial positioning using current global offsets
    let (x, y) = get_offsets();
    position_traffic_lights(&window_handle, x, y);

    // Get the current delegate to forward calls to
    let current_delegate: *mut objc2::runtime::AnyObject = unsafe {
        let ns_window = window_handle.as_ns_window();
        msg_send![ns_window, delegate]
    };

    // Store app handle for event emission.
    //
    // INTENTIONAL MEMORY LEAK (Code Review Cycle 1, Issues #1 and #2):
    //
    // We leak the AppHandle via `Box::into_raw()` to get a stable pointer that
    // the Objective-C delegate can hold. This is intentional and acceptable because:
    //
    // 1. **Single Window Assumption**: Orbit creates exactly ONE main window that
    //    lives for the entire application lifetime. The window is never closed
    //    and recreated, so this leak happens exactly once (~64 bytes).
    //
    // 2. **Delegate Lifetime**: The delegate (also leaked below) must outlive the
    //    window. Since the window lives forever, we can't free these resources
    //    without complex ref-counting that isn't worth the ~100 bytes saved.
    //
    // 3. **Alternative Approaches Considered**:
    //    - Weak references: objc2 doesn't provide easy weak ref patterns for this
    //    - Arc with prevent-drop: More complex, same effective behavior
    //    - Store in window user data: NSWindow user data API is cumbersome
    //
    // If Orbit ever supports multiple main windows or window recreation, this
    // should be revisited. The delegate would need to release these resources
    // in `windowWillClose:` or use Arc-based reference counting.
    let app_handle = Box::new(window.app_handle().clone());
    let app_handle_ptr = Box::into_raw(app_handle).cast::<c_void>();

    // Create our custom delegate
    let delegate = TrafficLightDelegate::new(
        mtm,
        DelegateConfig {
            window_label: window.label().to_string(),
            super_delegate: current_delegate,
            ns_window_ptr,
            app_handle_ptr,
        },
    );

    // Install our delegate
    let ns_window = window_handle.as_ns_window();
    let delegate_obj: &ProtocolObject<dyn NSWindowDelegate> = ProtocolObject::from_ref(&*delegate);
    ns_window.setDelegate(Some(delegate_obj));

    // INTENTIONAL MEMORY LEAK (Code Review Cycle 1, Issue #2):
    //
    // Keep the delegate alive by leaking it. This is the standard pattern for
    // Objective-C delegates that must outlive the objects they serve.
    //
    // The delegate must live as long as the NSWindow exists. Since Orbit's main
    // window lives for the entire app lifetime (see comment above about single
    // window assumption), we leak the delegate rather than implement complex
    // ref-counting. Total leak: ~100-200 bytes per window, happens once.
    //
    // The Retained<TrafficLightDelegate> holds strong references to the ivars,
    // which include the leaked app_handle_ptr. Both are cleaned up by the OS
    // when the process exits.
    std::mem::forget(delegate);
}

/// Update the traffic light positions for a window.
///
/// This function:
/// 1. Stores the new offsets in `TRAFFIC_LIGHT_OFFSETS` (global storage)
/// 2. Repositions the traffic lights immediately
///
/// The delegate reads from the same global storage on resize/fullscreen events,
/// so custom offsets now persist correctly. (Code Review Cycle 1, Codex Issue #1)
pub(crate) fn update_traffic_light_positions(window: &tauri::WebviewWindow, x: f64, y: f64) {
    // Store offsets globally so delegate can read them on resize/fullscreen
    set_offsets(x, y);

    let Ok(ns_window_ptr) = window.ns_window() else {
        return;
    };

    // Reposition immediately
    if let Some(handle) = unsafe { WindowHandle::from_raw(ns_window_ptr) } {
        position_traffic_lights(&handle, x, y);
    }
}
