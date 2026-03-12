import os
import SwiftUI
import OrbitTerminalKit

// MARK: C Extensions

/// A command is fully self-contained so it is Sendable.
extension ghostty_command_s: @unchecked @retroactive Sendable {}

/// A surface is sendable because it is just a reference type. Using the surface in parameters
/// may be unsafe but the value itself is safe to send across threads.
extension ghostty_surface_t: @unchecked @retroactive Sendable {}

extension OrbitTerminal {
    // The user notification category identifier
    static let userNotificationCategory = "com.orbit.orbit-terminal.userNotification"

    // The user notification "Show" action
    static let userNotificationActionShow = "com.orbit.orbit-terminal.userNotification.Show"
}

// MARK: Build Info

extension OrbitTerminal {
    struct Info {
        var mode: ghostty_build_mode_e
        var version: String
    }

    static var info: Info {
        let raw = ghostty_info()
        let version = NSString(
            bytes: raw.version,
            length: Int(raw.version_len),
            encoding: NSUTF8StringEncoding
        ) ?? "unknown"

        return Info(mode: raw.build_mode, version: String(version))
    }
}

// MARK: General Helpers

extension OrbitTerminal {
    enum LaunchSource: String {
        case cli
        case app
        case zig_run
    }

    /// Returns the mechanism that launched the app. This is based on an env var so
    /// its up to the env var being set in the correct circumstance.
    static var launchSource: LaunchSource {
        guard let envValue = ProcessInfo.processInfo.environment["GHOSTTY_MAC_LAUNCH_SOURCE"] else {
            // We default to the CLI because the app bundle always sets the
            // source. If its unset we assume we're in a CLI environment.
            return .cli
        }

        // If the env var is set but its unknown then we default back to the app.
        return LaunchSource(rawValue: envValue) ?? .app
    }
}

// MARK: Swift Types for C Types

extension OrbitTerminal {
    class AllocatedString {
        private let cString: ghostty_string_s

        init(_ c: ghostty_string_s) {
            self.cString = c
        }

        var string: String {
            guard let ptr = cString.ptr else { return "" }
            let data = Data(bytes: ptr, count: Int(cString.len))
            return String(data: data, encoding: .utf8) ?? ""
        }

        deinit {
            ghostty_string_free(cString)
        }
    }
}

extension OrbitTerminal {
    enum SetFloatWIndow {
        case on
        case off
        case toggle

        static func from(_ c: ghostty_action_float_window_e) -> Self? {
            switch c {
            case GHOSTTY_FLOAT_WINDOW_ON:
                return .on

            case GHOSTTY_FLOAT_WINDOW_OFF:
                return .off

            case GHOSTTY_FLOAT_WINDOW_TOGGLE:
                return .toggle

            default:
                return nil
            }
        }
    }

    enum SetSecureInput {
        case on
        case off
        case toggle

        static func from(_ c: ghostty_action_secure_input_e) -> Self? {
            switch c {
            case GHOSTTY_SECURE_INPUT_ON:
                return .on

            case GHOSTTY_SECURE_INPUT_OFF:
                return .off

            case GHOSTTY_SECURE_INPUT_TOGGLE:
                return .toggle

            default:
                return nil
            }
        }
    }

    /// An enum that is used for the directions that a split focus event can change.
    enum SplitFocusDirection {
        case previous, next, up, down, left, right

        /// Initialize from a OrbitTerminal API enum.
        static func from(direction: ghostty_action_goto_split_e) -> Self? {
            switch direction {
            case GHOSTTY_GOTO_SPLIT_PREVIOUS:
                return .previous

            case GHOSTTY_GOTO_SPLIT_NEXT:
                return .next

            case GHOSTTY_GOTO_SPLIT_UP:
                return .up

            case GHOSTTY_GOTO_SPLIT_DOWN:
                return .down

            case GHOSTTY_GOTO_SPLIT_LEFT:
                return .left

            case GHOSTTY_GOTO_SPLIT_RIGHT:
                return .right

            default:
                return nil
            }
        }

        func toNative() -> ghostty_action_goto_split_e {
            switch self {
            case .previous:
                return GHOSTTY_GOTO_SPLIT_PREVIOUS

            case .next:
                return GHOSTTY_GOTO_SPLIT_NEXT

            case .up:
                return GHOSTTY_GOTO_SPLIT_UP

            case .down:
                return GHOSTTY_GOTO_SPLIT_DOWN

            case .left:
                return GHOSTTY_GOTO_SPLIT_LEFT

            case .right:
                return GHOSTTY_GOTO_SPLIT_RIGHT
            }
        }
    }

    /// Enum used for resizing splits. This is the direction the split divider will move.
    enum SplitResizeDirection {
        case up, down, left, right

        static func from(direction: ghostty_action_resize_split_direction_e) -> Self? {
            switch direction {
            case GHOSTTY_RESIZE_SPLIT_UP:
                return .up
            case GHOSTTY_RESIZE_SPLIT_DOWN:
                return .down
            case GHOSTTY_RESIZE_SPLIT_LEFT:
                return .left
            case GHOSTTY_RESIZE_SPLIT_RIGHT:
                return .right
            default:
                return nil
            }
        }

        func toNative() -> ghostty_action_resize_split_direction_e {
            switch self {
            case .up:
                return GHOSTTY_RESIZE_SPLIT_UP
            case .down:
                return GHOSTTY_RESIZE_SPLIT_DOWN
            case .left:
                return GHOSTTY_RESIZE_SPLIT_LEFT
            case .right:
                return GHOSTTY_RESIZE_SPLIT_RIGHT
            }
        }
    }
}

#if canImport(AppKit)
// MARK: SplitFocusDirection Extensions

extension OrbitTerminal.SplitFocusDirection {
    /// Convert to a SplitTree.FocusDirection for the given ViewType.
    func toSplitTreeFocusDirection<ViewType>() -> SplitTree<ViewType>.FocusDirection {
        switch self {
        case .previous:
            return .previous

        case .next:
            return .next

        case .up:
            return .spatial(.up)

        case .down:
            return .spatial(.down)

        case .left:
            return .spatial(.left)

        case .right:
            return .spatial(.right)
        }
    }
}
#endif

extension OrbitTerminal {
    /// The type of a clipboard request
    enum ClipboardRequest {
        /// A direct paste of clipboard contents
        case paste

        /// An application is attempting to read from the clipboard using OSC 52
        case osc_52_read

        /// An application is attempting to write to the clipboard using OSC 52
        case osc_52_write(OSPasteboard?)

        /// The text to show in the clipboard confirmation prompt for a given request type
        func text() -> String {
            switch self {
            case .paste:
                return """
                Pasting this text to the terminal may be dangerous as it looks like some commands may be executed.
                """
            case .osc_52_read:
                return """
                An application is attempting to read from the clipboard.
                The current clipboard contents are shown below.
                """
            case .osc_52_write:
                return """
                An application is attempting to write to the clipboard.
                The content to write is shown below.
                """
            }
        }

        static func from(request: ghostty_clipboard_request_e) -> ClipboardRequest? {
            switch request {
            case GHOSTTY_CLIPBOARD_REQUEST_PASTE:
                return .paste
            case GHOSTTY_CLIPBOARD_REQUEST_OSC_52_READ:
                return .osc_52_read
            case GHOSTTY_CLIPBOARD_REQUEST_OSC_52_WRITE:
                return .osc_52_write(nil)
            default:
                return nil
            }
        }
    }

    struct ClipboardContent {
        let mime: String
        let data: String

        static func from(content: ghostty_clipboard_content_s) -> ClipboardContent? {
            guard let mimePtr = content.mime,
                  let dataPtr = content.data else {
                return nil
            }

            return ClipboardContent(
                mime: String(cString: mimePtr),
                data: String(cString: dataPtr)
            )
        }
    }

    /// Enum for the macos-window-buttons config option
    enum MacOSWindowButtons: String {
        case visible
        case hidden
    }

    /// Enum for the macos-titlebar-proxy-icon config option
    enum MacOSTitlebarProxyIcon: String {
        case visible
        case hidden
    }

    /// Enum for auto-update-channel config option
    enum AutoUpdateChannel: String {
        case tip
        case stable
    }
}

// MARK: Surface Notification

extension Notification.Name {
    /// Configuration change. If the object is nil then it is app-wide. Otherwise its surface-specific.
    static let orbitTerminalConfigDidChange = Notification.Name("com.orbit.orbit-terminal.configDidChange")
    static let OrbitTerminalConfigChangeKey = orbitTerminalConfigDidChange.rawValue

    /// Color change. Object is the surface changing.
    static let orbitTerminalColorDidChange = Notification.Name("com.orbit.orbit-terminal.orbitTerminalColorDidChange")
    static let OrbitTerminalColorChangeKey = orbitTerminalColorDidChange.rawValue

    /// Goto tab. Has tab index in the userinfo.
    static let orbitTerminalMoveTab = Notification.Name("com.orbit.orbit-terminal.moveTab")
    static let OrbitTerminalMoveTabKey = orbitTerminalMoveTab.rawValue

    /// Close tab
    static let orbitTerminalCloseTab = Notification.Name("com.orbit.orbit-terminal.closeTab")

    /// Close other tabs
    static let orbitTerminalCloseOtherTabs = Notification.Name("com.orbit.orbit-terminal.closeOtherTabs")

    /// Close tabs to the right of the focused tab
    static let orbitTerminalCloseTabsOnTheRight = Notification.Name("com.orbit.orbit-terminal.closeTabsOnTheRight")

    /// Close window
    static let orbitTerminalCloseWindow = Notification.Name("com.orbit.orbit-terminal.closeWindow")

    /// Resize the window to a default size.
    static let orbitTerminalResetWindowSize = Notification.Name("com.orbit.orbit-terminal.resetWindowSize")

    /// Ring the bell
    static let orbitTerminalBellDidRing = Notification.Name("com.orbit.orbit-terminal.orbitTerminalBellDidRing")

    /// Readonly mode changed
    static let orbitTerminalDidChangeReadonly = Notification.Name("com.orbit.orbit-terminal.didChangeReadonly")
    static let ReadonlyKey = orbitTerminalDidChangeReadonly.rawValue + ".readonly"
    static let orbitTerminalCommandPaletteDidToggle = Notification.Name("com.orbit.orbit-terminal.commandPaletteDidToggle")

    /// Toggle maximize of current window
    static let orbitTerminalMaximizeDidToggle = Notification.Name("com.orbit.orbit-terminal.maximizeDidToggle")

    /// Notification sent when scrollbar updates
    static let orbitTerminalDidUpdateScrollbar = Notification.Name("com.orbit.orbit-terminal.didUpdateScrollbar")
    static let ScrollbarKey = orbitTerminalDidUpdateScrollbar.rawValue + ".scrollbar"

    /// Focus the search field
    static let orbitTerminalSearchFocus = Notification.Name("com.orbit.orbit-terminal.searchFocus")

    /// Desktop notification fired (OSC 9/99, command completion)
    static let orbitTerminalDesktopNotificationDidFire = Notification.Name("com.orbit.orbit-terminal.desktopNotificationDidFire")

    /// IPC notification (tab.notify command from orbitctl)
    static let orbitTerminalIPCNotification = Notification.Name("com.orbit.orbit-terminal.ipcNotification")
}

// NOTE: I am moving all of these to Notification.Name extensions over time. This
// namespace was the old namespace.
extension OrbitTerminal.Notification {
    /// Used to pass a configuration along when creating a new tab/window/split.
    static let NewSurfaceConfigKey = "com.orbit.orbit-terminal.newSurfaceConfig"

    /// Posted when a new split is requested. The sending object will be the surface that had focus. The
    /// userdata has one key "direction" with the direction to split to.
    static let orbitTerminalNewSplit = Notification.Name("com.orbit.orbit-terminal.newSplit")

    /// Close the calling surface.
    static let orbitTerminalCloseSurface = Notification.Name("com.orbit.orbit-terminal.closeSurface")

    /// Focus previous/next split. Has a SplitFocusDirection in the userinfo.
    static let orbitTerminalFocusSplit = Notification.Name("com.orbit.orbit-terminal.focusSplit")
    static let SplitDirectionKey = orbitTerminalFocusSplit.rawValue

    /// Goto tab. Has tab index in the userinfo.
    static let orbitTerminalGotoTab = Notification.Name("com.orbit.orbit-terminal.gotoTab")
    static let GotoTabKey = orbitTerminalGotoTab.rawValue

    /// New tab. Has base surface config requested in userinfo.
    static let orbitTerminalNewTab = Notification.Name("com.orbit.orbit-terminal.newTab")

    /// New window. Has base surface config requested in userinfo.
    static let orbitTerminalNewWindow = Notification.Name("com.orbit.orbit-terminal.newWindow")

    /// Present terminal. Bring the surface's window to focus without activating the app.
    static let orbitTerminalPresentTerminal = Notification.Name("com.orbit.orbit-terminal.presentTerminal")

    /// Toggle fullscreen of current window
    static let orbitTerminalToggleFullscreen = Notification.Name("com.orbit.orbit-terminal.toggleFullscreen")
    static let FullscreenModeKey = orbitTerminalToggleFullscreen.rawValue

    /// Notification sent to toggle split maximize/unmaximize.
    static let didToggleSplitZoom = Notification.Name("com.orbit.orbit-terminal.didToggleSplitZoom")

    /// Notification
    static let didReceiveInitialWindowFrame = Notification.Name("com.orbit.orbit-terminal.didReceiveInitialWindowFrame")
    static let FrameKey = "com.orbit.orbit-terminal.frame"

    /// Notification to render the inspector for a surface
    static let inspectorNeedsDisplay = Notification.Name("com.orbit.orbit-terminal.inspectorNeedsDisplay")

    /// Notification to show/hide the inspector
    static let didControlInspector = Notification.Name("com.orbit.orbit-terminal.didControlInspector")

    static let confirmClipboard = Notification.Name("com.orbit.orbit-terminal.confirmClipboard")
    static let ConfirmClipboardStrKey = confirmClipboard.rawValue + ".str"
    static let ConfirmClipboardStateKey = confirmClipboard.rawValue + ".state"
    static let ConfirmClipboardRequestKey = confirmClipboard.rawValue + ".request"

    /// Notification sent to the active split view to resize the split.
    static let didResizeSplit = Notification.Name("com.orbit.orbit-terminal.didResizeSplit")
    static let ResizeSplitDirectionKey = didResizeSplit.rawValue + ".direction"
    static let ResizeSplitAmountKey = didResizeSplit.rawValue + ".amount"

    /// Notification sent to the split root to equalize split sizes
    static let didEqualizeSplits = Notification.Name("com.orbit.orbit-terminal.didEqualizeSplits")

    /// Notification that renderer health changed
    static let didUpdateRendererHealth = Notification.Name("com.orbit.orbit-terminal.didUpdateRendererHealth")

    /// Notifications related to key sequences
    static let didContinueKeySequence = Notification.Name("com.orbit.orbit-terminal.didContinueKeySequence")
    static let didEndKeySequence = Notification.Name("com.orbit.orbit-terminal.didEndKeySequence")
    static let KeySequenceKey = didContinueKeySequence.rawValue + ".key"

    /// Notifications related to key tables
    static let didChangeKeyTable = Notification.Name("com.orbit.orbit-terminal.didChangeKeyTable")
    static let KeyTableKey = didChangeKeyTable.rawValue + ".action"
}

// Make the input enum hashable.
extension ghostty_input_key_e: @retroactive Hashable {}
