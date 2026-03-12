import OrbitTerminalKit

extension FullscreenMode {
    /// Initialize from a OrbitTerminal fullscreen action.
    static func from(ghostty: ghostty_action_fullscreen_e) -> Self? {
        return switch ghostty {
        case ORBIT_TERMINAL_FULLSCREEN_NATIVE:
                .native

        case ORBIT_TERMINAL_FULLSCREEN_MACOS_NON_NATIVE:
                .nonNative

        case ORBIT_TERMINAL_FULLSCREEN_MACOS_NON_NATIVE_VISIBLE_MENU:
                .nonNativeVisibleMenu

        case ORBIT_TERMINAL_FULLSCREEN_MACOS_NON_NATIVE_PADDED_NOTCH:
                .nonNativePaddedNotch

        default:
            nil
        }
    }
}
