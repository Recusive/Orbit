//! macOS traffic light (window control) positioning.
//!
//! Based on code from Hoppscotch's tauri app:
//! https://github.com/hoppscotch/hoppscotch/blob/286fcd2bb08a84f027b10308d1e18da368f95ebf/packages/hoppscotch-selfhost-desktop/src-tauri/src/mac/window.rs

// Suppress warnings from cocoa/objc crates - unavoidable without objc2 migration
#![allow(deprecated)]
#![allow(unexpected_cfgs)]
#![allow(missing_abi)]

use cocoa::appkit::{NSView, NSWindow, NSWindowButton};
use cocoa::base::{id, BOOL};
use cocoa::foundation::{NSRect, NSUInteger};
use objc::runtime::{Object, Sel};
use objc::{msg_send, sel, sel_impl};
use rand::{distributions::Alphanumeric, Rng};
use std::ffi::c_void;
use tauri::{Emitter, Runtime, Window};

const WINDOW_CONTROL_PAD_X: f64 = 12.0;
const WINDOW_CONTROL_PAD_Y: f64 = 16.0;

pub struct UnsafeWindowHandle(pub *mut std::ffi::c_void);
unsafe impl Send for UnsafeWindowHandle {}
unsafe impl Sync for UnsafeWindowHandle {}

/// Position the traffic light buttons at the specified coordinates.
pub fn position_traffic_lights(ns_window_handle: UnsafeWindowHandle, x: f64, y: f64) {
    let ns_window = ns_window_handle.0 as id;
    unsafe {
        let close = ns_window.standardWindowButton_(NSWindowButton::NSWindowCloseButton);
        let miniaturize =
            ns_window.standardWindowButton_(NSWindowButton::NSWindowMiniaturizeButton);
        let zoom = ns_window.standardWindowButton_(NSWindowButton::NSWindowZoomButton);

        // Check if close button exists and has a valid superview
        if close.is_null() {
            return;
        }

        let close_superview = close.superview();
        if close_superview.is_null() {
            return;
        }

        let title_bar_container_view = close_superview.superview();
        if title_bar_container_view.is_null() {
            return;
        }

        let close_rect: NSRect = msg_send![close, frame];
        let button_height = close_rect.size.height;

        let title_bar_frame_height = button_height + y;
        let mut title_bar_rect = NSView::frame(title_bar_container_view);
        title_bar_rect.size.height = title_bar_frame_height;
        title_bar_rect.origin.y = NSView::frame(ns_window).size.height - title_bar_frame_height;
        let _: () = msg_send![title_bar_container_view, setFrame: title_bar_rect];

        // Collect valid buttons
        let mut window_buttons = Vec::new();
        if !close.is_null() {
            window_buttons.push(close);
        }
        if !miniaturize.is_null() {
            window_buttons.push(miniaturize);
        }
        if !zoom.is_null() {
            window_buttons.push(zoom);
        }

        if window_buttons.is_empty() {
            return;
        }

        let space_between = 20.0;
        let vertical_offset = 4.0;

        for (i, button) in window_buttons.into_iter().enumerate() {
            let mut rect: NSRect = NSView::frame(button);
            rect.origin.x = x + (i as f64 * space_between);
            rect.origin.y = ((title_bar_frame_height - button_height) / 2.0) - vertical_offset;
            button.setFrameOrigin(rect.origin);
        }
    }
}

#[derive(Debug)]
struct WindowState<R: Runtime> {
    window: Window<R>,
    traffic_light_x: f64,
    traffic_light_y: f64,
}

/// Set up the traffic light positioner for a window.
///
/// This installs a custom window delegate that repositions traffic lights on resize.
pub fn setup_traffic_light_positioner<R: Runtime>(window: Window<R>) {
    // SAFETY: Check if window is decorated before accessing traffic lights.
    // This is the critical fix - decoration-less windows return garbage pointers.
    if !window.is_decorated().unwrap_or(true) {
        return;
    }

    unsafe {
        let ns_win = match window.ns_window() {
            Ok(win) => win as id,
            Err(_) => return,
        };

        // Additional check: verify close button actually exists and is valid
        let close = ns_win.standardWindowButton_(NSWindowButton::NSWindowCloseButton);
        if close.is_null() {
            return;
        }

        // Check superview to ensure the button hierarchy is valid
        let superview = close.superview();
        if superview.is_null() {
            return;
        }
    }

    // Do the initial positioning
    if let Ok(ns_window) = window.ns_window() {
        position_traffic_lights(
            UnsafeWindowHandle(ns_window),
            WINDOW_CONTROL_PAD_X,
            WINDOW_CONTROL_PAD_Y,
        );
    }

    // Set up delegate for resize handling
    setup_window_delegate(window);
}

fn setup_window_delegate<R: Runtime>(window: Window<R>) {
    fn with_window_state<R: Runtime, F: FnOnce(&mut WindowState<R>) -> T, T>(
        this: &Object,
        func: F,
    ) {
        let ptr = unsafe {
            let x: *mut c_void = *this.get_ivar("app_box");
            &mut *(x as *mut WindowState<R>)
        };
        func(ptr);
    }

    unsafe {
        let ns_win = match window.ns_window() {
            Ok(win) => win as id,
            Err(_) => return,
        };

        let current_delegate: id = ns_win.delegate();

        extern "C" fn on_window_should_close(this: &Object, _cmd: Sel, sender: id) -> BOOL {
            unsafe {
                let super_del: id = *this.get_ivar("super_delegate");
                msg_send![super_del, windowShouldClose: sender]
            }
        }

        extern "C" fn on_window_will_close(this: &Object, _cmd: Sel, notification: id) {
            unsafe {
                let super_del: id = *this.get_ivar("super_delegate");
                let _: () = msg_send![super_del, windowWillClose: notification];
            }
        }

        extern "C" fn on_window_did_resize<R: Runtime>(this: &Object, _cmd: Sel, notification: id) {
            unsafe {
                with_window_state(&*this, |state: &mut WindowState<R>| {
                    if let Ok(id) = state.window.ns_window() {
                        position_traffic_lights(
                            UnsafeWindowHandle(id),
                            state.traffic_light_x,
                            state.traffic_light_y,
                        );
                    }
                });

                let super_del: id = *this.get_ivar("super_delegate");
                let _: () = msg_send![super_del, windowDidResize: notification];
            }
        }

        extern "C" fn on_window_did_move(this: &Object, _cmd: Sel, notification: id) {
            unsafe {
                let super_del: id = *this.get_ivar("super_delegate");
                let _: () = msg_send![super_del, windowDidMove: notification];
            }
        }

        extern "C" fn on_window_did_change_backing_properties(
            this: &Object,
            _cmd: Sel,
            notification: id,
        ) {
            unsafe {
                let super_del: id = *this.get_ivar("super_delegate");
                let _: () = msg_send![super_del, windowDidChangeBackingProperties: notification];
            }
        }

        extern "C" fn on_window_did_become_key(this: &Object, _cmd: Sel, notification: id) {
            unsafe {
                let super_del: id = *this.get_ivar("super_delegate");
                let _: () = msg_send![super_del, windowDidBecomeKey: notification];
            }
        }

        extern "C" fn on_window_did_resign_key(this: &Object, _cmd: Sel, notification: id) {
            unsafe {
                let super_del: id = *this.get_ivar("super_delegate");
                let _: () = msg_send![super_del, windowDidResignKey: notification];
            }
        }

        extern "C" fn on_dragging_entered(this: &Object, _cmd: Sel, notification: id) -> BOOL {
            unsafe {
                let super_del: id = *this.get_ivar("super_delegate");
                msg_send![super_del, draggingEntered: notification]
            }
        }

        extern "C" fn on_prepare_for_drag_operation(
            this: &Object,
            _cmd: Sel,
            notification: id,
        ) -> BOOL {
            unsafe {
                let super_del: id = *this.get_ivar("super_delegate");
                msg_send![super_del, prepareForDragOperation: notification]
            }
        }

        extern "C" fn on_perform_drag_operation(this: &Object, _cmd: Sel, sender: id) -> BOOL {
            unsafe {
                let super_del: id = *this.get_ivar("super_delegate");
                msg_send![super_del, performDragOperation: sender]
            }
        }

        extern "C" fn on_conclude_drag_operation(this: &Object, _cmd: Sel, notification: id) {
            unsafe {
                let super_del: id = *this.get_ivar("super_delegate");
                let _: () = msg_send![super_del, concludeDragOperation: notification];
            }
        }

        extern "C" fn on_dragging_exited(this: &Object, _cmd: Sel, notification: id) {
            unsafe {
                let super_del: id = *this.get_ivar("super_delegate");
                let _: () = msg_send![super_del, draggingExited: notification];
            }
        }

        extern "C" fn on_window_will_use_full_screen_presentation_options(
            this: &Object,
            _cmd: Sel,
            window: id,
            proposed_options: NSUInteger,
        ) -> NSUInteger {
            unsafe {
                let super_del: id = *this.get_ivar("super_delegate");
                msg_send![super_del, window: window willUseFullScreenPresentationOptions: proposed_options]
            }
        }

        extern "C" fn on_window_did_enter_full_screen<R: Runtime>(
            this: &Object,
            _cmd: Sel,
            notification: id,
        ) {
            unsafe {
                with_window_state(&*this, |state: &mut WindowState<R>| {
                    drop(state.window.emit("did-enter-fullscreen", ()));
                });

                let super_del: id = *this.get_ivar("super_delegate");
                let _: () = msg_send![super_del, windowDidEnterFullScreen: notification];
            }
        }

        extern "C" fn on_window_will_enter_full_screen<R: Runtime>(
            this: &Object,
            _cmd: Sel,
            notification: id,
        ) {
            unsafe {
                with_window_state(&*this, |state: &mut WindowState<R>| {
                    drop(state.window.emit("will-enter-fullscreen", ()));
                });

                let super_del: id = *this.get_ivar("super_delegate");
                let _: () = msg_send![super_del, windowWillEnterFullScreen: notification];
            }
        }

        extern "C" fn on_window_did_exit_full_screen<R: Runtime>(
            this: &Object,
            _cmd: Sel,
            notification: id,
        ) {
            unsafe {
                with_window_state(&*this, |state: &mut WindowState<R>| {
                    drop(state.window.emit("did-exit-fullscreen", ()));

                    if let Ok(id) = state.window.ns_window() {
                        position_traffic_lights(
                            UnsafeWindowHandle(id),
                            state.traffic_light_x,
                            state.traffic_light_y,
                        );
                    }
                });

                let super_del: id = *this.get_ivar("super_delegate");
                let _: () = msg_send![super_del, windowDidExitFullScreen: notification];
            }
        }

        extern "C" fn on_window_will_exit_full_screen<R: Runtime>(
            this: &Object,
            _cmd: Sel,
            notification: id,
        ) {
            unsafe {
                with_window_state(&*this, |state: &mut WindowState<R>| {
                    drop(state.window.emit("will-exit-fullscreen", ()));
                });

                let super_del: id = *this.get_ivar("super_delegate");
                let _: () = msg_send![super_del, windowWillExitFullScreen: notification];
            }
        }

        extern "C" fn on_window_did_fail_to_enter_full_screen(
            this: &Object,
            _cmd: Sel,
            window: id,
        ) {
            unsafe {
                let super_del: id = *this.get_ivar("super_delegate");
                let _: () = msg_send![super_del, windowDidFailToEnterFullScreen: window];
            }
        }

        extern "C" fn on_effective_appearance_did_change(
            this: &Object,
            _cmd: Sel,
            notification: id,
        ) {
            unsafe {
                let super_del: id = *this.get_ivar("super_delegate");
                let _: () = msg_send![super_del, effectiveAppearanceDidChange: notification];
            }
        }

        extern "C" fn on_effective_appearance_did_changed_on_main_thread(
            this: &Object,
            _cmd: Sel,
            notification: id,
        ) {
            unsafe {
                let super_del: id = *this.get_ivar("super_delegate");
                let _: () = msg_send![
                    super_del,
                    effectiveAppearanceDidChangedOnMainThread: notification
                ];
            }
        }

        let window_label = window.label().to_string();

        let app_state = WindowState {
            window,
            traffic_light_x: WINDOW_CONTROL_PAD_X,
            traffic_light_y: WINDOW_CONTROL_PAD_Y,
        };
        let app_box = Box::into_raw(Box::new(app_state)) as *mut c_void;
        let random_str: String = rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(20)
            .map(char::from)
            .collect();

        let delegate_name = format!("windowDelegate_{}_{}", window_label, random_str);

        ns_win.setDelegate_(cocoa::delegate!(&delegate_name, {
            window: id = ns_win,
            app_box: *mut c_void = app_box,
            toolbar: id = cocoa::base::nil,
            super_delegate: id = current_delegate,
            (windowShouldClose:) => on_window_should_close as extern "C" fn(&Object, Sel, id) -> BOOL,
            (windowWillClose:) => on_window_will_close as extern "C" fn(&Object, Sel, id),
            (windowDidResize:) => on_window_did_resize::<R> as extern "C" fn(&Object, Sel, id),
            (windowDidMove:) => on_window_did_move as extern "C" fn(&Object, Sel, id),
            (windowDidChangeBackingProperties:) => on_window_did_change_backing_properties as extern "C" fn(&Object, Sel, id),
            (windowDidBecomeKey:) => on_window_did_become_key as extern "C" fn(&Object, Sel, id),
            (windowDidResignKey:) => on_window_did_resign_key as extern "C" fn(&Object, Sel, id),
            (draggingEntered:) => on_dragging_entered as extern "C" fn(&Object, Sel, id) -> BOOL,
            (prepareForDragOperation:) => on_prepare_for_drag_operation as extern "C" fn(&Object, Sel, id) -> BOOL,
            (performDragOperation:) => on_perform_drag_operation as extern "C" fn(&Object, Sel, id) -> BOOL,
            (concludeDragOperation:) => on_conclude_drag_operation as extern "C" fn(&Object, Sel, id),
            (draggingExited:) => on_dragging_exited as extern "C" fn(&Object, Sel, id),
            (window:willUseFullScreenPresentationOptions:) => on_window_will_use_full_screen_presentation_options as extern "C" fn(&Object, Sel, id, NSUInteger) -> NSUInteger,
            (windowDidEnterFullScreen:) => on_window_did_enter_full_screen::<R> as extern "C" fn(&Object, Sel, id),
            (windowWillEnterFullScreen:) => on_window_will_enter_full_screen::<R> as extern "C" fn(&Object, Sel, id),
            (windowDidExitFullScreen:) => on_window_did_exit_full_screen::<R> as extern "C" fn(&Object, Sel, id),
            (windowWillExitFullScreen:) => on_window_will_exit_full_screen::<R> as extern "C" fn(&Object, Sel, id),
            (windowDidFailToEnterFullScreen:) => on_window_did_fail_to_enter_full_screen as extern "C" fn(&Object, Sel, id),
            (effectiveAppearanceDidChange:) => on_effective_appearance_did_change as extern "C" fn(&Object, Sel, id),
            (effectiveAppearanceDidChangedOnMainThread:) => on_effective_appearance_did_changed_on_main_thread as extern "C" fn(&Object, Sel, id)
        }));
    }
}

/// Update the stored traffic light positions for a window.
pub fn update_traffic_light_positions(window: &tauri::WebviewWindow, x: f64, y: f64) {
    use tauri::Wry;

    unsafe {
        let ns_win = match window.ns_window() {
            Ok(win) => win as id,
            Err(_) => return,
        };

        let delegate: *mut Object = msg_send![ns_win, delegate];
        if delegate.is_null() {
            return;
        }

        let app_box: *mut c_void =
            match std::panic::catch_unwind(|| *(*delegate).get_ivar::<*mut c_void>("app_box")) {
                Ok(ptr) if !ptr.is_null() => ptr,
                _ => return,
            };

        let state: &mut WindowState<Wry> = &mut *(app_box as *mut WindowState<Wry>);
        state.traffic_light_x = x;
        state.traffic_light_y = y;
    }
}
