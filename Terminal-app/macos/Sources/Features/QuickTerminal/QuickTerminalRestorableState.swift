import Cocoa

struct QuickTerminalRestorableState: TerminalRestorable {
    static var version: Int { 1 }

    let focusedSurface: String?
    let surfaceTree: SplitTree<OrbitTerminal.SurfaceView>
    let screenStateEntries: QuickTerminalScreenStateCache.Entries

    init(from controller: QuickTerminalController) {
        controller.saveScreenState(exitFullscreen: true)
        self.focusedSurface = controller.focusedSurface?.id.uuidString
        self.surfaceTree = controller.surfaceTree
        self.screenStateEntries = controller.screenStateCache.stateByDisplay
    }

    init(copy other: QuickTerminalRestorableState) {
        self = other
    }

    var baseConfig: OrbitTerminal.SurfaceConfiguration? {
        var config = OrbitTerminal.SurfaceConfiguration()
        config.environmentVariables["ORBIT_TERMINAL_QUICK_TERMINAL"] = "1"
        return config
    }
}
