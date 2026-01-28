# Migration Plan: cocoa/objc → objc2-app-kit

This document outlines the migration path from deprecated `cocoa`/`objc` crates to the modern `objc2-app-kit` ecosystem.

## Why Migrate?

### Current Problems (cocoa/objc)

1. **Deprecated** - Both `cocoa` and `objc` crates are unmaintained and emit deprecation warnings
2. **Unsafe by default** - All FFI is raw pointers (`id`, `*mut Object`), requiring manual null checks everywhere
3. **No type safety** - `msg_send!` takes any arguments without compile-time verification
4. **Crash-prone** - Easy to call wrong selectors, pass wrong types, or miss null checks (which is why we forked this plugin!)

### Benefits of objc2-app-kit

1. **Type-safe** - Methods return `Option<Retained<T>>` instead of raw pointers
2. **Compile-time verification** - Selectors checked at compile time via declarative class definitions
3. **Modern Rust patterns** - Uses proper Option types, no manual null pointer checks
4. **Actively maintained** - Regular updates, good documentation
5. **Memory safety** - Automatic retain/release via `Retained<T>` smart pointer

## Current State Analysis

### Dependencies to Replace

| Current Crate | Version | Replacement                              | Version |
| ------------- | ------- | ---------------------------------------- | ------- |
| `cocoa`       | 0.26    | `objc2-app-kit`                          | 0.3+    |
| `objc`        | 0.2     | `objc2`                                  | 0.6+    |
| `rand`        | 0.8     | `objc2-foundation` (for NSString random) | 0.3+    |

### Code Patterns to Migrate

#### 1. Type Definitions

```rust
// BEFORE (cocoa/objc)
use cocoa::base::{id, BOOL};
use cocoa::foundation::NSRect;
use objc::runtime::{Object, Sel};

// AFTER (objc2)
use objc2::rc::Retained;
use objc2_app_kit::{NSWindow, NSButton, NSView};
use objc2_foundation::{CGRect, NSObject};
```

#### 2. Getting Window Buttons

```rust
// BEFORE (crash-prone - returns garbage on decoration-less windows!)
let close = ns_window.standardWindowButton_(NSWindowButton::NSWindowCloseButton);
if close.is_null() { return; }  // This check FAILS because it's garbage, not null!

// AFTER (type-safe - returns Option)
let close: Option<Retained<NSButton>> = unsafe {
    ns_window.standardWindowButton(NSWindowButton::CloseButton)
};
let Some(close) = close else { return };  // Proper Option handling
```

#### 3. Message Sending

```rust
// BEFORE (unsafe, unchecked)
let frame: NSRect = msg_send![button, frame];
let _: () = msg_send![view, setFrame: rect];

// AFTER (type-safe methods)
let frame: CGRect = button.frame();
view.setFrame(rect);
```

#### 4. Window Delegate Pattern

This is the most complex part. Current code uses `cocoa::delegate!` macro to create custom delegates.

```rust
// BEFORE (complex macro, raw function pointers)
ns_win.setDelegate_(cocoa::delegate!(&delegate_name, {
    (windowDidResize:) => on_window_did_resize as extern "C" fn(...),
}));

// AFTER (declare_class! macro)
declare_class!(
    struct TrafficLightDelegate;

    unsafe impl ClassType for TrafficLightDelegate {
        type Super = NSObject;
        type Mutability = MainThreadOnly;
        const NAME: &'static str = "TrafficLightDelegate";
    }

    impl DeclaredClass for TrafficLightDelegate {
        type Ivars = DelegateIvars;
    }

    unsafe impl NSWindowDelegate for TrafficLightDelegate {
        #[method(windowDidResize:)]
        fn window_did_resize(&self, _notification: &NSNotification) {
            // Safe access to ivars
            let state = self.ivars();
            position_traffic_lights(&state.window, state.x, state.y);
        }
    }
);
```

## Migration Steps

### Phase 1: Add New Dependencies (Day 1)

Update `Cargo.toml`:

```toml
[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.6"
objc2-app-kit = { version = "0.3", features = ["NSWindow", "NSButton", "NSView"] }
objc2-foundation = { version = "0.3", features = ["NSObject", "NSNotification", "NSString"] }
block2 = "0.6"  # For closures passed to Objective-C

# Keep old crates temporarily during migration
cocoa = "0.26"
objc = "0.2"
rand = "0.8"
```

### Phase 2: Migrate Helper Functions (Day 2)

Start with leaf functions that don't depend on the delegate:

1. `position_traffic_lights()` - Convert to use `NSWindow`, `NSButton`, `CGRect`
2. `UnsafeWindowHandle` - Replace with proper `Retained<NSWindow>`

```rust
// New type-safe handle
pub struct WindowHandle(Retained<NSWindow>);

impl WindowHandle {
    pub fn from_tauri_window<R: Runtime>(window: &Window<R>) -> Option<Self> {
        let ptr = window.ns_window().ok()?;
        // Safe: Tauri gives us a valid retained window
        let ns_window = unsafe {
            Retained::retain(ptr as *mut NSWindow)?
        };
        Some(Self(ns_window))
    }
}
```

### Phase 3: Create New Delegate Class (Day 3-4)

This is the complex part - creating a type-safe delegate:

```rust
use objc2::declare_class;
use objc2::mutability::MainThreadOnly;
use objc2_app_kit::NSWindowDelegate;
use objc2_foundation::NSObject;

// Delegate state stored in ivars
struct DelegateIvars {
    window_label: String,
    traffic_light_x: f64,
    traffic_light_y: f64,
    app_handle: AppHandle,
}

declare_class!(
    pub struct TrafficLightDelegate;

    unsafe impl ClassType for TrafficLightDelegate {
        type Super = NSObject;
        type Mutability = MainThreadOnly;
        const NAME: &'static str = "OrbitTrafficLightDelegate";
    }

    impl DeclaredClass for TrafficLightDelegate {
        type Ivars = DelegateIvars;
    }

    // Implement NSWindowDelegate protocol
    unsafe impl NSWindowDelegate for TrafficLightDelegate {
        #[method(windowDidResize:)]
        fn window_did_resize(&self, _notification: &NSNotification) {
            self.reposition_traffic_lights();
        }

        #[method(windowDidEnterFullScreen:)]
        fn window_did_enter_full_screen(&self, _notification: &NSNotification) {
            self.ivars().app_handle.emit("did-enter-fullscreen", ());
        }

        // ... other delegate methods
    }
);

impl TrafficLightDelegate {
    fn reposition_traffic_lights(&self) {
        let ivars = self.ivars();
        // Type-safe implementation
    }
}
```

### Phase 4: Integrate with Tauri (Day 5)

Update `setup_traffic_light_positioner()`:

```rust
pub fn setup_traffic_light_positioner<R: Runtime>(window: Window<R>) {
    // Check decoration status (our critical fix)
    if !window.is_decorated().unwrap_or(true) {
        return;
    }

    let window_handle = match WindowHandle::from_tauri_window(&window) {
        Some(h) => h,
        None => return,
    };

    // Create delegate with ivars
    let delegate = TrafficLightDelegate::new(
        window.label().to_string(),
        WINDOW_CONTROL_PAD_X,
        WINDOW_CONTROL_PAD_Y,
        window.app_handle().clone(),
    );

    // Install delegate (type-safe!)
    window_handle.0.setDelegate(Some(&delegate));

    // Initial positioning
    position_traffic_lights(&window_handle.0, WINDOW_CONTROL_PAD_X, WINDOW_CONTROL_PAD_Y);
}
```

### Phase 5: Remove Old Dependencies (Day 6)

Once all code is migrated:

```toml
[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.6"
objc2-app-kit = { version = "0.3", features = [...] }
objc2-foundation = { version = "0.3", features = [...] }
block2 = "0.6"

# REMOVED: cocoa, objc, rand
```

### Phase 6: Cleanup (Day 7)

1. Remove all `#![allow(deprecated)]` attributes
2. Remove lint overrides in Cargo.toml
3. Update documentation
4. Add proper error handling with `anyhow` or custom error types

## Risk Mitigation

### Testing Strategy

1. **Manual testing** - Resize windows, fullscreen, minimize
2. **Decoration-less window test** - Verify browser panel still works (the original crash case)
3. **Multi-monitor test** - Test on external displays
4. **Theme change test** - Light/dark mode transitions

### Rollback Plan

Keep the current `cocoa`/`objc` implementation in a separate branch. If issues arise:

```bash
git checkout cocoa-backup -- crates/plugins/decorum/
```

### Compatibility Notes

- objc2-app-kit requires macOS 10.13+ (we likely require newer anyway)
- Tauri's `ns_window()` returns `*mut c_void` - need to cast to `*mut NSWindow`
- The main thread requirement is enforced by `MainThreadOnly` mutability marker

## Estimated Timeline

| Phase | Task                      | Duration |
| ----- | ------------------------- | -------- |
| 1     | Add dependencies          | 0.5 day  |
| 2     | Migrate helper functions  | 1 day    |
| 3     | Create new delegate class | 2 days   |
| 4     | Integrate with Tauri      | 1 day    |
| 5     | Remove old dependencies   | 0.5 day  |
| 6     | Cleanup and testing       | 2 days   |

**Total: ~7 working days**

## References

- [objc2 documentation](https://docs.rs/objc2/latest/objc2/)
- [objc2-app-kit](https://docs.rs/objc2-app-kit/latest/objc2_app_kit/)
- [objc2 declare_class! macro](https://docs.rs/objc2/latest/objc2/macro.declare_class.html)
- [Migration guide from objc crate](https://github.com/madsmtm/objc2/blob/master/crates/objc2/MIGRATION.md)

## Checklist

- [ ] Phase 1: Add new dependencies
- [ ] Phase 2: Migrate `position_traffic_lights()`
- [ ] Phase 2: Migrate `UnsafeWindowHandle` → `WindowHandle`
- [ ] Phase 3: Implement `TrafficLightDelegate` with `declare_class!`
- [ ] Phase 3: Implement all NSWindowDelegate methods
- [ ] Phase 4: Update `setup_traffic_light_positioner()`
- [ ] Phase 4: Update `set_traffic_lights_inset()`
- [ ] Phase 5: Remove cocoa/objc dependencies
- [ ] Phase 6: Remove lint suppressions
- [ ] Phase 6: Full manual testing
- [ ] Phase 6: Update documentation
