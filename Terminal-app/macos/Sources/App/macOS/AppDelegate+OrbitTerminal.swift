import AppKit

// MARK: OrbitTerminal Delegate

/// This implements the OrbitTerminal app delegate protocol which is used by the OrbitTerminal
/// APIs for app-global information.
extension AppDelegate: OrbitTerminal.Delegate {
    func ghosttySurface(id: UUID) -> OrbitTerminal.SurfaceView? {
        for window in NSApp.windows {
            guard let controller = window.windowController as? BaseTerminalController else {
                continue
            }

            for surface in controller.surfaceTree where surface.id == id {
                return surface
            }
        }

        return nil
    }
}
