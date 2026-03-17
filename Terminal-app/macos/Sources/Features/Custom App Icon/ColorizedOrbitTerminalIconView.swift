import SwiftUI
import Cocoa

// For testing.
struct ColorizedOrbitTerminalIconView: View {
    var body: some View {
        Image(nsImage: ColorizedOrbitTerminalIcon(
            screenColors: [.purple, .blue],
            ghostColor: .yellow,
            frame: .aluminum
        ).makeImage(in: .main)!)
    }
}
