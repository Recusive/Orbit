//
//  OrbitTerminalTitleUITests.swift
//  OrbitTerminalUITests
//
//  Created by luca on 13.10.2025.
//

import XCTest

final class OrbitTerminalTitleUITests: OrbitTerminalCustomConfigCase {
    override func setUp() async throws {
        try await super.setUp()
        try updateConfig(#"title = "OrbitTerminalUITestsLaunchTests""#)
    }

    @MainActor
    func testTitle() throws {
        let app = try ghosttyApplication()
        app.launch()

        XCTAssertEqual(app.windows.firstMatch.title, "OrbitTerminalUITestsLaunchTests", "Oops, `title=` doesn't work!")
    }
}
