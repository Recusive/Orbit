import SwiftUI
import OrbitTerminalKit

@main
struct OrbitTerminal_iOSApp: App {
    @StateObject private var ghostty_app: OrbitTerminal.App

    init() {
        if ghostty_init(UInt(CommandLine.argc), CommandLine.unsafeArgv) != ORBIT_TERMINAL_SUCCESS {
            preconditionFailure("Initialize ghostty backend failed")
        }
        _ghostty_app = StateObject(wrappedValue: OrbitTerminal.App())
    }

    var body: some Scene {
        WindowGroup {
            iOS_OrbitTerminalTerminal()
                .environmentObject(ghostty_app)
        }
    }
}

struct iOS_OrbitTerminalTerminal: View {
    @EnvironmentObject private var ghostty_app: OrbitTerminal.App

    var body: some View {
        ZStack {
            // Make sure that our background color extends to all parts of the screen
            Color(ghostty_app.config.backgroundColor).ignoresSafeArea()

            OrbitTerminal.Terminal()
        }
    }
}

struct iOS_OrbitTerminalInitView: View {
    @EnvironmentObject private var ghostty_app: OrbitTerminal.App

    var body: some View {
        VStack {
            Image("AppIconImage")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(maxHeight: 96)
            Text("OrbitTerminal")
            Text("State: \(ghostty_app.readiness.rawValue)")
        }
        .padding()
    }
}
