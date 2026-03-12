//
//  GhosttyWindowPositionUITests.swift
//  GhosttyUITests
//
//  Created by Claude on 2026-03-11.
//

import XCTest

final class GhosttyWindowPositionUITests: GhosttyCustomConfigCase {
    override static var runsForEachTargetApplicationUIConfiguration: Bool { false }

    // MARK: - Restore round-trip per titlebar style

    @MainActor func testRestoredNative() throws { try runRestoreTest(titlebarStyle: "native") }
    @MainActor func testRestoredHidden() throws { try runRestoreTest(titlebarStyle: "hidden") }
    @MainActor func testRestoredTransparent() throws { try runRestoreTest(titlebarStyle: "transparent") }
    @MainActor func testRestoredTabs() throws { try runRestoreTest(titlebarStyle: "tabs") }

    // MARK: - Config overrides cached position/size

    @MainActor
    func testConfigOverridesCachedPositionAndSize() async throws {
        // Launch maximized so the cached frame is fullscreen-sized.
        try updateConfig(
            """
            maximize = true
            title = "GhosttyWindowPositionUITests"
            """
        )

        let app = try ghosttyApplication()
        app.launch()

        let window = app.windows.firstMatch
        XCTAssertTrue(window.waitForExistence(timeout: 5), "Window should appear")

        let maximizedFrame = window.frame

        // Now update the config with a small explicit size and position,
        // reload, and open a new window. It should respect the config, not the cache.
        try updateConfig(
            """
            window-position-x = 50
            window-position-y = 50
            window-width = 30
            window-height = 30
            title = "GhosttyWindowPositionUITests"
            """
        )
        app.typeKey(",", modifierFlags: [.command, .shift])
        try await Task.sleep(for: .seconds(0.5))
        app.typeKey("n", modifierFlags: [.command])

        XCTAssertEqual(app.windows.count, 2, "Should have 2 windows")
        let newWindow = app.windows.element(boundBy: 0)
        let newFrame = newWindow.frame

        // The new window should be smaller than the maximized one.
        XCTAssertLessThan(newFrame.size.width, maximizedFrame.size.width,
                          "30 columns should be narrower than maximized")
        XCTAssertLessThan(newFrame.size.height, maximizedFrame.size.height,
                          "30 rows should be shorter than maximized")

        app.terminate()
    }

    // MARK: - Size-only config change preserves position

    @MainActor
    func testSizeOnlyConfigPreservesPosition() async throws {
        // Launch maximized so the window has a known position (top-left of visible frame).
        try updateConfig(
            """
            maximize = true
            title = "GhosttyWindowPositionUITests"
            """
        )

        let app = try ghosttyApplication()
        app.launch()

        let window = app.windows.firstMatch
        XCTAssertTrue(window.waitForExistence(timeout: 5), "Window should appear")

        let initialFrame = window.frame

        // Reload with only size changed, close current window, open new one.
        // Position should be restored from cache.
        try updateConfig(
            """
            window-width = 30
            window-height = 30
            title = "GhosttyWindowPositionUITests"
            """
        )
        app.typeKey(",", modifierFlags: [.command, .shift])
        try await Task.sleep(for: .seconds(0.5))
        app.typeKey("w", modifierFlags: [.command])
        app.typeKey("n", modifierFlags: [.command])

        let newWindow = app.windows.firstMatch
        XCTAssertTrue(newWindow.waitForExistence(timeout: 5), "New window should appear")

        let newFrame = newWindow.frame

        // Position should be preserved from the cached value.
        // Compare x and maxY since the window is anchored at the top-left
        // but AppKit uses bottom-up coordinates (origin.y changes with height).
        XCTAssertEqual(newFrame.origin.x, initialFrame.origin.x, accuracy: 2,
                        "x position should not change with size-only config")
        XCTAssertEqual(newFrame.maxY, initialFrame.maxY, accuracy: 2,
                        "top edge (maxY) should not change with size-only config")

        app.terminate()
    }

    // MARK: - Shared round-trip helper

    /// Opens a new window, records its frame, closes it, opens another,
    /// and verifies the frame is restored consistently.
    private func runRestoreTest(titlebarStyle: String) throws {
        try updateConfig(
            """
            macos-titlebar-style = \(titlebarStyle)
            title = "GhosttyWindowPositionUITests"
            """
        )

        let app = try ghosttyApplication()
        app.launch()

        let window = app.windows.firstMatch
        XCTAssertTrue(window.waitForExistence(timeout: 5), "Window should appear")

        let firstFrame = window.frame

        // Close the window and open a new one — it should restore the same frame.
        app.typeKey("w", modifierFlags: [.command])
        app.typeKey("n", modifierFlags: [.command])

        let window2 = app.windows.firstMatch
        XCTAssertTrue(window2.waitForExistence(timeout: 5), "New window should appear")

        let restoredFrame = window2.frame

        XCTAssertEqual(restoredFrame.origin.x, firstFrame.origin.x, accuracy: 2,
                        "[\(titlebarStyle)] x position should be restored")
        XCTAssertEqual(restoredFrame.origin.y, firstFrame.origin.y, accuracy: 2,
                        "[\(titlebarStyle)] y position should be restored")
        XCTAssertEqual(restoredFrame.size.width, firstFrame.size.width, accuracy: 2,
                        "[\(titlebarStyle)] width should be restored")
        XCTAssertEqual(restoredFrame.size.height, firstFrame.size.height, accuracy: 2,
                        "[\(titlebarStyle)] height should be restored")

        app.terminate()
    }
}
