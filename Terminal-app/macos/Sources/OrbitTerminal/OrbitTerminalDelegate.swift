import Foundation

extension OrbitTerminal {
    /// This is a delegate that should be applied to your global app delegate for OrbitTerminalKit
    /// to perform app-global operations.
    protocol Delegate {
        /// Look up a surface within the application by ID.
        func ghosttySurface(id: UUID) -> SurfaceView?
    }
}
